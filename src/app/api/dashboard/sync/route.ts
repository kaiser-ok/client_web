import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { jiraClient } from '@/lib/jira'

// 支援多個 Project，用逗號分隔
const JIRA_PROJECT_KEYS = (process.env.JIRA_PROJECT_KEYS || process.env.JIRA_PROJECT_KEY || process.env.JIRA_PROJECT || 'CW')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean)
const SYNC_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

// 建立 Project JQL 條件
const getProjectClause = () => {
  return JIRA_PROJECT_KEYS.length === 1
    ? `project = ${JIRA_PROJECT_KEYS[0]}`
    : `project IN (${JIRA_PROJECT_KEYS.join(', ')})`
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // Check if force sync is requested
    const { searchParams } = new URL(request.url)
    const force = searchParams.get('force') === 'true'
    console.log('Dashboard sync - force:', force, 'url:', request.url)

    // Check last sync time
    const existingStats = await prisma.dashboardStats.findUnique({
      where: { id: 'singleton' },
    })

    if (!force && existingStats) {
      const timeSinceLastSync = Date.now() - existingStats.syncedAt.getTime()
      console.log('Dashboard sync - timeSinceLastSync:', timeSinceLastSync, 'interval:', SYNC_INTERVAL_MS)
      if (timeSinceLastSync < SYNC_INTERVAL_MS) {
        console.log('Dashboard sync - returning cached data')
        return NextResponse.json({
          ...existingStats,
          message: '資料仍在有效期間內，未重新同步',
          nextSyncAt: new Date(existingStats.syncedAt.getTime() + SYNC_INTERVAL_MS),
        })
      }
    }

    console.log('Dashboard sync - fetching fresh data from Jira...')

    // Fetch data from various sources
    const [
      partnerCount,
      pendingIssuesResult,
      waitingCustomerResult,
      overdueIssuesResult,
      expiringContracts,
    ] = await Promise.all([
      // Partner count from database
      prisma.partner.count(),

      // Pending issues from Jira (not done)
      jiraClient.searchIssues(
        `${getProjectClause()} AND statusCategory != Done`,
        ['key'],
        1000 // Get up to 1000 issues to count
      ).then((result) => {
        console.log('Jira pending issues count:', result.issues?.length || 0, 'projects:', JIRA_PROJECT_KEYS.join(', '))
        return { count: result.issues?.length || 0 }
      }).catch((err) => {
        console.error('Error fetching pending issues from Jira:', err)
        return { count: 0 }
      }),

      // Waiting for customer (status = "等待客戶回覆" or similar)
      jiraClient.searchIssues(
        `${getProjectClause()} AND status = "等待客戶回覆"`,
        ['key'],
        1000
      ).then((result) => {
        return { count: result.issues?.length || 0 }
      }).catch((err) => {
        console.error('Error fetching waiting customer issues from Jira:', err)
        return { count: 0 }
      }),

      // Overdue issues (due date passed, not done)
      jiraClient.searchIssues(
        `${getProjectClause()} AND statusCategory != Done AND duedate < now()`,
        ['key'],
        1000
      ).then((result) => {
        return { count: result.issues?.length || 0 }
      }).catch((err) => {
        console.error('Error fetching overdue issues from Jira:', err)
        return { count: 0 }
      }),

      // Expiring contracts (ending within 30 days)
      prisma.deal.count({
        where: {
          endDate: {
            gte: new Date(),
            lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          },
        },
      }),
    ])

    // Update or create stats
    const stats = await prisma.dashboardStats.upsert({
      where: { id: 'singleton' },
      update: {
        partnerCount,
        pendingIssues: pendingIssuesResult.count || 0,
        waitingCustomer: waitingCustomerResult.count || 0,
        overdueIssues: overdueIssuesResult.count || 0,
        expiringContracts,
        syncedAt: new Date(),
      },
      create: {
        id: 'singleton',
        partnerCount,
        pendingIssues: pendingIssuesResult.count || 0,
        waitingCustomer: waitingCustomerResult.count || 0,
        overdueIssues: overdueIssuesResult.count || 0,
        expiringContracts,
        syncedAt: new Date(),
      },
    })

    return NextResponse.json({
      ...stats,
      message: '同步完成',
      nextSyncAt: new Date(stats.syncedAt.getTime() + SYNC_INTERVAL_MS),
    })
  } catch (error) {
    console.error('Error syncing dashboard stats:', error)
    return NextResponse.json({ error: '同步失敗' }, { status: 500 })
  }
}
