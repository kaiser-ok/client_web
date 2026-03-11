/**
 * Full Graph Sync CLI Script
 * Reads all PG data via Prisma and pushes to Neo4j via Graphiti HTTP endpoints.
 *
 * Usage:
 *   npx tsx scripts/graph-full-sync.ts
 *   npx tsx scripts/graph-full-sync.ts --model=Partner
 *   npx tsx scripts/graph-full-sync.ts --batch-size=20
 *   npx tsx scripts/graph-full-sync.ts --dry-run
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const GRAPHITI_URL = process.env.GRAPHITI_URL || 'http://localhost:8001'

const prisma = new PrismaClient()

// Parse CLI arguments
const args = process.argv.slice(2)
const modelFilter = args.find(a => a.startsWith('--model='))?.split('=')[1]
const batchSize = parseInt(args.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '10', 10)
const dryRun = args.includes('--dry-run')

interface SyncResult {
  model: string
  total: number
  synced: number
  failed: number
  errors: string[]
}

async function upsertNode(nodeType: string, data: Record<string, unknown>): Promise<boolean> {
  if (dryRun) return true

  const response = await fetch(`${GRAPHITI_URL}/nodes/${nodeType}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(err.detail || `HTTP ${response.status}`)
  }

  return true
}

async function syncPartners(): Promise<SyncResult> {
  const result: SyncResult = { model: 'Partner', total: 0, synced: 0, failed: 0, errors: [] }

  const partners = await prisma.partner.findMany({
    include: { roles: true },
    orderBy: { createdAt: 'asc' },
  })
  result.total = partners.length

  for (let i = 0; i < partners.length; i += batchSize) {
    const batch = partners.slice(i, i + batchSize)
    await Promise.all(
      batch.map(async (partner) => {
        try {
          await upsertNode('organization', {
            crm_id: partner.id,
            name: partner.name,
            aliases: partner.aliases,
            contact: partner.contact,
            phone: partner.phone,
            email: partner.email,
            website: partner.website,
            jira_label: partner.jiraLabel,
            odoo_id: partner.odooId,
            source: partner.source,
            is_active: partner.isActive,
            parent_crm_id: partner.parentId,
          })
          result.synced++
        } catch (err) {
          result.failed++
          const msg = `Partner ${partner.id} (${partner.name}): ${(err as Error).message}`
          result.errors.push(msg)
        }
      })
    )
    process.stdout.write(`\r  Partner: ${Math.min(i + batchSize, partners.length)}/${partners.length}`)
  }
  console.log()

  return result
}

async function syncDeals(): Promise<SyncResult> {
  const result: SyncResult = { model: 'Deal', total: 0, synced: 0, failed: 0, errors: [] }

  const deals = await prisma.deal.findMany({
    orderBy: { createdAt: 'asc' },
  })
  result.total = deals.length

  for (let i = 0; i < deals.length; i += batchSize) {
    const batch = deals.slice(i, i + batchSize)
    await Promise.all(
      batch.map(async (deal) => {
        try {
          await upsertNode('deal', {
            crm_id: deal.id,
            name: deal.name,
            organization_crm_id: deal.partnerId,
            project_name: deal.projectName,
            type: deal.type,
            amount: deal.amount ? Number(deal.amount) : null,
            sales_rep: deal.salesRep,
            closed_at: deal.closedAt?.toISOString(),
            start_date: deal.startDate?.toISOString(),
            end_date: deal.endDate?.toISOString(),
            source: deal.source,
            odoo_id: deal.odooId,
          })
          result.synced++
        } catch (err) {
          result.failed++
          result.errors.push(`Deal ${deal.id} (${deal.name}): ${(err as Error).message}`)
        }
      })
    )
    process.stdout.write(`\r  Deal: ${Math.min(i + batchSize, deals.length)}/${deals.length}`)
  }
  console.log()

  return result
}

async function syncProjects(): Promise<SyncResult> {
  const result: SyncResult = { model: 'Project', total: 0, synced: 0, failed: 0, errors: [] }

  const projects = await prisma.project.findMany({
    orderBy: { createdAt: 'asc' },
  })
  result.total = projects.length

  for (let i = 0; i < projects.length; i += batchSize) {
    const batch = projects.slice(i, i + batchSize)
    await Promise.all(
      batch.map(async (project) => {
        try {
          await upsertNode('project', {
            crm_id: project.id,
            name: project.name,
            organization_crm_id: project.partnerId,
            deal_crm_id: project.dealId,
            type: project.type,
            status: project.status,
            start_date: project.startDate?.toISOString(),
            end_date: project.endDate?.toISOString(),
          })
          result.synced++
        } catch (err) {
          result.failed++
          result.errors.push(`Project ${project.id} (${project.name}): ${(err as Error).message}`)
        }
      })
    )
    process.stdout.write(`\r  Project: ${Math.min(i + batchSize, projects.length)}/${projects.length}`)
  }
  console.log()

  return result
}

async function syncOpenItems(): Promise<SyncResult> {
  const result: SyncResult = { model: 'OpenItem', total: 0, synced: 0, failed: 0, errors: [] }

  const items = await prisma.openItem.findMany({
    orderBy: { syncedAt: 'asc' },
  })
  result.total = items.length

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    await Promise.all(
      batch.map(async (item) => {
        try {
          await upsertNode('issue', {
            crm_id: item.id,
            jira_key: item.jiraKey,
            summary: item.summary,
            organization_crm_id: item.partnerId,
            status: item.status,
            priority: item.priority,
            assignee: item.assignee,
            waiting_on: item.waitingOn,
          })
          result.synced++
        } catch (err) {
          result.failed++
          result.errors.push(`OpenItem ${item.id} (${item.jiraKey}): ${(err as Error).message}`)
        }
      })
    )
    process.stdout.write(`\r  OpenItem: ${Math.min(i + batchSize, items.length)}/${items.length}`)
  }
  console.log()

  return result
}

async function syncContacts(): Promise<SyncResult> {
  const result: SyncResult = { model: 'Contact', total: 0, synced: 0, failed: 0, errors: [] }

  const contacts = await prisma.contact.findMany({
    orderBy: { createdAt: 'asc' },
  })
  result.total = contacts.length

  for (let i = 0; i < contacts.length; i += batchSize) {
    const batch = contacts.slice(i, i + batchSize)
    await Promise.all(
      batch.map(async (contact) => {
        try {
          await upsertNode('person', {
            crm_id: contact.id,
            name: contact.name,
            email: contact.email,
            phone: contact.phone,
            title: contact.title,
            line_user_id: contact.lineUserId,
            slack_user_id: contact.slackUserId,
            organization_crm_id: contact.partnerId,
          })
          result.synced++
        } catch (err) {
          result.failed++
          result.errors.push(`Contact ${contact.id} (${contact.name}): ${(err as Error).message}`)
        }
      })
    )
    process.stdout.write(`\r  Contact: ${Math.min(i + batchSize, contacts.length)}/${contacts.length}`)
  }
  console.log()

  return result
}

// Sync functions map
const syncFunctions: Record<string, () => Promise<SyncResult>> = {
  Partner: syncPartners,
  Deal: syncDeals,
  Project: syncProjects,
  OpenItem: syncOpenItems,
  Contact: syncContacts,
}

// Sync order: Partners first (organizations), then entities that reference them
const SYNC_ORDER = ['Partner', 'Deal', 'Project', 'OpenItem', 'Contact']

async function main() {
  console.log('========================================')
  console.log('  Graph Full Sync: PG → Neo4j')
  console.log('========================================')
  console.log(`  Graphiti URL: ${GRAPHITI_URL}`)
  console.log(`  Batch size:   ${batchSize}`)
  console.log(`  Dry run:      ${dryRun}`)
  if (modelFilter) console.log(`  Model filter: ${modelFilter}`)
  console.log('========================================\n')

  const models = modelFilter ? [modelFilter] : SYNC_ORDER

  // Validate model names
  for (const model of models) {
    if (!syncFunctions[model]) {
      console.error(`Unknown model: ${model}. Valid models: ${SYNC_ORDER.join(', ')}`)
      process.exit(1)
    }
  }

  // Check Graphiti service health
  if (!dryRun) {
    try {
      const res = await fetch(`${GRAPHITI_URL}/health`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      console.log('Graphiti service: healthy\n')
    } catch (err) {
      console.error(`Graphiti service not reachable at ${GRAPHITI_URL}`)
      console.error('Make sure the Python service is running.')
      process.exit(1)
    }
  }

  const results: SyncResult[] = []

  for (const model of models) {
    console.log(`Syncing ${model}...`)
    const result = await syncFunctions[model]()
    results.push(result)
  }

  // Summary table
  console.log('\n========================================')
  console.log('  Sync Summary')
  console.log('========================================')
  console.log(`  ${'Model'.padEnd(12)} ${'Total'.padStart(6)} ${'Synced'.padStart(7)} ${'Failed'.padStart(7)}`)
  console.log('  ' + '-'.repeat(34))
  for (const r of results) {
    console.log(`  ${r.model.padEnd(12)} ${String(r.total).padStart(6)} ${String(r.synced).padStart(7)} ${String(r.failed).padStart(7)}`)
  }
  console.log('========================================')

  // Print errors if any
  const allErrors = results.flatMap(r => r.errors)
  if (allErrors.length > 0) {
    console.log(`\nErrors (${allErrors.length}):`)
    for (const err of allErrors.slice(0, 20)) {
      console.log(`  - ${err}`)
    }
    if (allErrors.length > 20) {
      console.log(`  ... and ${allErrors.length - 20} more`)
    }
  }

  await prisma.$disconnect()
  console.log('\nDone.')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  prisma.$disconnect()
  process.exit(1)
})
