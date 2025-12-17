import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import jiraClient, { extractTextFromJiraBody } from '@/lib/jira'

const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY || 'CW'
const JIRA_PARTNER_FIELD = process.env.JIRA_CUSTOM_FIELD_PARTNER || 'customfield_10264'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const { customerId } = body

    if (!customerId) {
      return NextResponse.json(
        { error: '缺少 customerId' },
        { status: 400 }
      )
    }

    // Get customer to find their Jira label
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    })

    if (!customer) {
      return NextResponse.json(
        { error: '客戶不存在' },
        { status: 404 }
      )
    }

    // Build JQL - use label if exists, otherwise get all open issues
    let jql = `project = ${JIRA_PROJECT_KEY} AND statusCategory != Done`

    if (customer.jiraLabel) {
      jql += ` AND labels = "${customer.jiraLabel}"`
    }

    jql += ' ORDER BY updated DESC'

    // Fetch issues from Jira with partner custom field
    const fields = [
      'summary',
      'status',
      'priority',
      'assignee',
      'updated',
      'created',
      'duedate',
      'comment',
      'labels',
      JIRA_PARTNER_FIELD,
    ]

    const result = await jiraClient.searchIssues(jql, fields)
    const issues = result.issues

    // Sync each issue to our database
    const syncedItems = await Promise.all(
      issues.map(async (issue) => {
        // Get the latest comment
        let lastReply = null
        let lastReplyBy = null
        let lastReplyAt = null

        if (issue.fields.comment?.comments?.length) {
          const latestComment = issue.fields.comment.comments[issue.fields.comment.comments.length - 1]
          lastReply = extractTextFromJiraBody(latestComment.body)
          lastReplyBy = latestComment.author.displayName
          lastReplyAt = new Date(latestComment.created)
        }

        // Get partner from custom field
        const partnerValue = (issue.fields as Record<string, unknown>)[JIRA_PARTNER_FIELD]
        const partner = typeof partnerValue === 'string' ? partnerValue : null

        return prisma.openItem.upsert({
          where: { jiraKey: issue.key },
          update: {
            customerId,
            summary: issue.fields.summary,
            status: issue.fields.status.name,
            priority: issue.fields.priority?.name || null,
            assignee: issue.fields.assignee?.displayName || null,
            dueDate: issue.fields.duedate ? new Date(issue.fields.duedate) : null,
            partner,
            lastReply: lastReply?.substring(0, 500) || null,
            lastReplyBy,
            lastReplyAt,
            jiraUpdated: new Date(issue.fields.updated),
            syncedAt: new Date(),
          },
          create: {
            customerId,
            jiraKey: issue.key,
            summary: issue.fields.summary,
            status: issue.fields.status.name,
            priority: issue.fields.priority?.name || null,
            assignee: issue.fields.assignee?.displayName || null,
            dueDate: issue.fields.duedate ? new Date(issue.fields.duedate) : null,
            partner,
            lastReply: lastReply?.substring(0, 500) || null,
            lastReplyBy,
            lastReplyAt,
            jiraUpdated: new Date(issue.fields.updated),
          },
        })
      })
    )

    // Create activity record for this sync
    await prisma.activity.create({
      data: {
        customerId,
        source: 'JIRA',
        title: `Jira 同步完成`,
        content: `從 ${JIRA_PROJECT_KEY} 同步了 ${syncedItems.length} 個問題` +
          (customer.jiraLabel ? ` (Label: ${customer.jiraLabel})` : ''),
        createdBy: session.user.email,
      },
    })

    return NextResponse.json({
      success: true,
      syncedCount: syncedItems.length,
    })
  } catch (error) {
    console.error('Error syncing from Jira:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Jira 同步失敗' },
      { status: 500 }
    )
  }
}
