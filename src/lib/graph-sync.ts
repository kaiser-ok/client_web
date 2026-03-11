/**
 * Graph Sync Infrastructure
 * BullMQ-based PG→Neo4j sync via Prisma middleware
 */

import { Queue, Worker, Job } from 'bullmq'
import { PrismaClient, Prisma } from '@prisma/client'
import { graphitiClient } from './graphiti'
import type { OrganizationInput, DealInput, IssueInput, ProjectInput, PersonInput } from './graphiti'

// ============================================
// Redis Connection Options
// ============================================

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

function parseRedisUrl(url: string) {
  const parsed = new URL(url)
  return {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    maxRetriesPerRequest: null as null, // Required by BullMQ
  }
}

const redisOpts = parseRedisUrl(REDIS_URL)

// ============================================
// Queue
// ============================================

const QUEUE_NAME = 'graph-sync'

let graphSyncQueue: Queue | null = null

function getGraphSyncQueue(): Queue {
  if (!graphSyncQueue) {
    graphSyncQueue = new Queue(QUEUE_NAME, {
      connection: redisOpts,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    })
  }
  return graphSyncQueue
}

// ============================================
// Job Types
// ============================================

interface GraphSyncJobData {
  entityType: 'Partner' | 'Deal' | 'OpenItem' | 'Project' | 'Contact'
  entityId: string
  operation: 'CREATE' | 'UPDATE' | 'DELETE'
}

// Models to intercept
const SYNC_MODELS = new Set(['Partner', 'Deal', 'OpenItem', 'Project', 'Contact'])

// Map Prisma actions to operations
function getOperation(action: string): 'CREATE' | 'UPDATE' | 'DELETE' | null {
  if (action === 'create') return 'CREATE'
  if (action === 'update' || action === 'upsert') return 'UPDATE'
  if (action === 'delete') return 'DELETE'
  return null
}

// ============================================
// Prisma Middleware
// ============================================

export function setupGraphSyncMiddleware(prisma: PrismaClient): void {
  prisma.$use(async (params: Prisma.MiddlewareParams, next: (params: Prisma.MiddlewareParams) => Promise<unknown>) => {
    // Execute the Prisma operation first
    const result = await next(params)

    // Check if this model should be synced
    if (!params.model || !SYNC_MODELS.has(params.model)) {
      return result
    }

    const operation = getOperation(params.action)
    if (!operation) {
      return result
    }

    // Extract entity ID from result
    const entityId = (result as { id?: string })?.id
    if (!entityId) {
      return result
    }

    // Enqueue sync job (fire-and-forget, never block PG operations)
    try {
      const queue = getGraphSyncQueue()
      await queue.add(
        `sync-${params.model}-${entityId}`,
        {
          entityType: params.model as GraphSyncJobData['entityType'],
          entityId,
          operation,
        } satisfies GraphSyncJobData,
        {
          // Deduplicate rapid updates to same entity
          jobId: `${params.model}-${entityId}-${Date.now()}`,
        }
      )
    } catch (err) {
      // Never let queue failures block database operations
      console.error('[graph-sync] Failed to enqueue job:', err)
    }

    return result
  })
}

// ============================================
// Sync Handlers
// ============================================

async function syncPartnerToOrganization(entityId: string, prisma: PrismaClient): Promise<void> {
  const partner = await prisma.partner.findUnique({
    where: { id: entityId },
    include: { roles: true },
  })

  if (!partner) return

  const input: OrganizationInput = {
    crm_id: partner.id,
    name: partner.name,
    aliases: partner.aliases,
    contact: partner.contact ?? undefined,
    phone: partner.phone ?? undefined,
    email: partner.email ?? undefined,
    website: partner.website ?? undefined,
    jira_label: partner.jiraLabel ?? undefined,
    odoo_id: partner.odooId ?? undefined,
    source: partner.source,
    is_active: partner.isActive,
    parent_crm_id: partner.parentId ?? undefined,
  }

  await graphitiClient.upsertOrganization(input)
}

async function syncDealToDeal(entityId: string, prisma: PrismaClient): Promise<void> {
  const deal = await prisma.deal.findUnique({
    where: { id: entityId },
  })

  if (!deal) return

  const input: DealInput = {
    crm_id: deal.id,
    name: deal.name,
    organization_crm_id: deal.partnerId,
    project_name: deal.projectName ?? undefined,
    type: deal.type,
    amount: deal.amount ? Number(deal.amount) : undefined,
    sales_rep: deal.salesRep ?? undefined,
    closed_at: deal.closedAt?.toISOString() ?? undefined,
    start_date: deal.startDate?.toISOString() ?? undefined,
    end_date: deal.endDate?.toISOString() ?? undefined,
    source: deal.source,
    odoo_id: deal.odooId ?? undefined,
  }

  await graphitiClient.upsertDeal(input)
}

async function syncOpenItemToIssue(entityId: string, prisma: PrismaClient): Promise<void> {
  const item = await prisma.openItem.findUnique({
    where: { id: entityId },
  })

  if (!item) return

  const input: IssueInput = {
    crm_id: item.id,
    jira_key: item.jiraKey,
    summary: item.summary,
    organization_crm_id: item.partnerId,
    status: item.status,
    priority: item.priority ?? undefined,
    assignee: item.assignee ?? undefined,
    waiting_on: item.waitingOn ?? undefined,
  }

  await graphitiClient.upsertIssue(input)
}

async function syncProjectToProject(entityId: string, prisma: PrismaClient): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: entityId },
  })

  if (!project) return

  const input: ProjectInput = {
    crm_id: project.id,
    name: project.name,
    organization_crm_id: project.partnerId,
    deal_crm_id: project.dealId ?? undefined,
    type: project.type ?? undefined,
    status: project.status,
    start_date: project.startDate?.toISOString() ?? undefined,
    end_date: project.endDate?.toISOString() ?? undefined,
  }

  await graphitiClient.upsertProject(input)
}

async function syncContactToPerson(entityId: string, prisma: PrismaClient): Promise<void> {
  const contact = await prisma.contact.findUnique({
    where: { id: entityId },
  })

  if (!contact) return

  const input: PersonInput = {
    crm_id: contact.id,
    name: contact.name,
    email: contact.email ?? undefined,
    phone: contact.phone ?? undefined,
    title: contact.title ?? undefined,
    line_user_id: contact.lineUserId ?? undefined,
    slack_user_id: contact.slackUserId ?? undefined,
    organization_crm_id: contact.partnerId ?? undefined,
  }

  await graphitiClient.upsertPerson(input)
}

// ============================================
// Worker
// ============================================

let graphSyncWorker: Worker | null = null

export async function processGraphSyncJob(job: Job<GraphSyncJobData>): Promise<void> {
  const { entityType, entityId, operation } = job.data
  console.log(`[graph-sync] Processing ${operation} for ${entityType}:${entityId}`)

  // Create a fresh Prisma client for the worker (not the Next.js singleton)
  const prisma = new PrismaClient()

  try {
    // Log attempt
    await prisma.graphSyncLog.upsert({
      where: { id: `${entityType}-${entityId}` },
      create: {
        id: `${entityType}-${entityId}`,
        entityType,
        entityId,
        operation,
        status: 'PENDING',
        attempts: 1,
      },
      update: {
        operation,
        status: 'PENDING',
        attempts: { increment: 1 },
        error: null,
      },
    })

    if (operation === 'DELETE') {
      // For now, we don't delete from Neo4j — just log it
      console.log(`[graph-sync] DELETE operation for ${entityType}:${entityId} — skipped (no Neo4j delete)`)
    } else {
      switch (entityType) {
        case 'Partner':
          await syncPartnerToOrganization(entityId, prisma)
          break
        case 'Deal':
          await syncDealToDeal(entityId, prisma)
          break
        case 'OpenItem':
          await syncOpenItemToIssue(entityId, prisma)
          break
        case 'Project':
          await syncProjectToProject(entityId, prisma)
          break
        case 'Contact':
          await syncContactToPerson(entityId, prisma)
          break
      }
    }

    // Mark success
    await prisma.graphSyncLog.update({
      where: { id: `${entityType}-${entityId}` },
      data: {
        status: 'SUCCESS',
        syncedAt: new Date(),
        error: null,
      },
    })

    console.log(`[graph-sync] Successfully synced ${entityType}:${entityId}`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`[graph-sync] Failed to sync ${entityType}:${entityId}:`, errorMsg)

    // Log failure
    try {
      await prisma.graphSyncLog.update({
        where: { id: `${entityType}-${entityId}` },
        data: {
          status: 'FAILED',
          error: errorMsg,
        },
      })
    } catch {
      // Ignore logging errors
    }

    throw err // Let BullMQ handle retries
  } finally {
    await prisma.$disconnect()
  }
}

export function startGraphSyncWorker(): Worker {
  if (graphSyncWorker) return graphSyncWorker

  graphSyncWorker = new Worker(QUEUE_NAME, processGraphSyncJob, {
    connection: redisOpts,
    concurrency: 5,
  })

  graphSyncWorker.on('completed', (job) => {
    console.log(`[graph-sync] Job ${job.id} completed`)
  })

  graphSyncWorker.on('failed', (job, err) => {
    console.error(`[graph-sync] Job ${job?.id} failed:`, err.message)
  })

  console.log('[graph-sync] Worker started')
  return graphSyncWorker
}

export async function stopGraphSyncWorker(): Promise<void> {
  if (graphSyncWorker) {
    await graphSyncWorker.close()
    graphSyncWorker = null
    console.log('[graph-sync] Worker stopped')
  }
  if (graphSyncQueue) {
    await graphSyncQueue.close()
    graphSyncQueue = null
  }
}
