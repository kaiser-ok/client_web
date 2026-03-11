import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { graphitiClient } from '@/lib/graphiti'
import prisma from '@/lib/prisma'

interface ModelResult {
  synced: number
  failed: number
  errors: string[]
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    if (session.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: '權限不足' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const modelFilter = body.model as string | undefined

    const results: Record<string, ModelResult> = {}

    // 1. Sync Partners → Organizations
    if (!modelFilter || modelFilter === 'Partner') {
      const res: ModelResult = { synced: 0, failed: 0, errors: [] }
      const partners = await prisma.partner.findMany({ include: { roles: true } })
      for (const partner of partners) {
        try {
          await graphitiClient.upsertOrganization({
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
          })
          res.synced++
        } catch (err) {
          res.failed++
          res.errors.push(`${partner.id}: ${(err as Error).message}`)
        }
      }
      results.Partner = res
    }

    // 2. Sync Deals
    if (!modelFilter || modelFilter === 'Deal') {
      const res: ModelResult = { synced: 0, failed: 0, errors: [] }
      const deals = await prisma.deal.findMany()
      for (const deal of deals) {
        try {
          await graphitiClient.upsertDeal({
            crm_id: deal.id,
            name: deal.name,
            organization_crm_id: deal.partnerId,
            project_name: deal.projectName ?? undefined,
            type: deal.type,
            amount: deal.amount ? Number(deal.amount) : undefined,
            sales_rep: deal.salesRep ?? undefined,
            closed_at: deal.closedAt?.toISOString(),
            start_date: deal.startDate?.toISOString(),
            end_date: deal.endDate?.toISOString(),
            source: deal.source,
            odoo_id: deal.odooId ?? undefined,
          })
          res.synced++
        } catch (err) {
          res.failed++
          res.errors.push(`${deal.id}: ${(err as Error).message}`)
        }
      }
      results.Deal = res
    }

    // 3. Sync Projects
    if (!modelFilter || modelFilter === 'Project') {
      const res: ModelResult = { synced: 0, failed: 0, errors: [] }
      const projects = await prisma.project.findMany()
      for (const project of projects) {
        try {
          await graphitiClient.upsertProject({
            crm_id: project.id,
            name: project.name,
            organization_crm_id: project.partnerId,
            deal_crm_id: project.dealId ?? undefined,
            type: project.type ?? undefined,
            status: project.status,
            start_date: project.startDate?.toISOString(),
            end_date: project.endDate?.toISOString(),
          })
          res.synced++
        } catch (err) {
          res.failed++
          res.errors.push(`${project.id}: ${(err as Error).message}`)
        }
      }
      results.Project = res
    }

    // 4. Sync OpenItems → Issues
    if (!modelFilter || modelFilter === 'OpenItem') {
      const res: ModelResult = { synced: 0, failed: 0, errors: [] }
      const items = await prisma.openItem.findMany()
      for (const item of items) {
        try {
          await graphitiClient.upsertIssue({
            crm_id: item.id,
            jira_key: item.jiraKey,
            summary: item.summary,
            organization_crm_id: item.partnerId,
            status: item.status,
            priority: item.priority ?? undefined,
            assignee: item.assignee ?? undefined,
            waiting_on: item.waitingOn ?? undefined,
          })
          res.synced++
        } catch (err) {
          res.failed++
          res.errors.push(`${item.id}: ${(err as Error).message}`)
        }
      }
      results.OpenItem = res
    }

    // 5. Sync Contacts → Persons
    if (!modelFilter || modelFilter === 'Contact') {
      const res: ModelResult = { synced: 0, failed: 0, errors: [] }
      const contacts = await prisma.contact.findMany()
      for (const contact of contacts) {
        try {
          await graphitiClient.upsertPerson({
            crm_id: contact.id,
            name: contact.name,
            email: contact.email ?? undefined,
            phone: contact.phone ?? undefined,
            title: contact.title ?? undefined,
            line_user_id: contact.lineUserId ?? undefined,
            slack_user_id: contact.slackUserId ?? undefined,
            organization_crm_id: contact.partnerId ?? undefined,
          })
          res.synced++
        } catch (err) {
          res.failed++
          res.errors.push(`${contact.id}: ${(err as Error).message}`)
        }
      }
      results.Contact = res
    }

    return NextResponse.json({
      success: true,
      results,
    })
  } catch (error) {
    console.error('Error in full graph sync:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '同步失敗' },
      { status: 500 }
    )
  }
}
