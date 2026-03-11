import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import jiraClient, { extractTextFromJiraBody } from '@/lib/jira'

// 支援多個 Project，用逗號分隔，例如: CW,PROJ2,PROJ3
const JIRA_PROJECT_KEYS = (process.env.JIRA_PROJECT_KEYS || process.env.JIRA_PROJECT_KEY || 'CW')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean)
const JIRA_PARTNER_FIELD = process.env.JIRA_CUSTOM_FIELD_PARTNER || 'customfield_10264'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    // Support both partnerId and customerId for backward compatibility
    const partnerId = body.partnerId || body.customerId

    if (!partnerId) {
      return NextResponse.json(
        { error: '缺少 partnerId' },
        { status: 400 }
      )
    }

    // Get partner to find their Jira label
    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
    })

    if (!partner) {
      return NextResponse.json(
        { error: '夥伴不存在' },
        { status: 404 }
      )
    }

    // Build JQL - use label if exists, otherwise get all open issues
    // 支援多個 Project
    const projectClause = JIRA_PROJECT_KEYS.length === 1
      ? `project = ${JIRA_PROJECT_KEYS[0]}`
      : `project IN (${JIRA_PROJECT_KEYS.join(', ')})`
    let jql = `${projectClause} AND statusCategory != Done`

    // 支援多種標籤格式比對：'客戶:名稱'、直接 '名稱'、或 Odoo 訂單標籤
    const labelConditions: string[] = []

    // 1. jiraLabel（如：客戶:ABC公司）
    if (partner.jiraLabel) {
      labelConditions.push(`labels = "${partner.jiraLabel}"`)
    }

    // 2. 夥伴名稱
    labelConditions.push(`labels = "${partner.name}"`)

    // 3. Odoo 訂單標籤
    if (partner.odooTags && partner.odooTags.length > 0) {
      for (const tag of partner.odooTags) {
        // 避免重複加入已存在的條件
        const condition = `labels = "${tag}"`
        if (!labelConditions.includes(condition)) {
          labelConditions.push(condition)
        }
      }
    }

    if (labelConditions.length > 0) {
      jql += ` AND (${labelConditions.join(' OR ')})`
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

        // Get dealer from custom field (經銷商)
        const dealerValue = (issue.fields as Record<string, unknown>)[JIRA_PARTNER_FIELD]
        const dealer = typeof dealerValue === 'string' ? dealerValue : null

        return prisma.openItem.upsert({
          where: { jiraKey: issue.key },
          update: {
            partnerId,
            summary: issue.fields.summary,
            status: issue.fields.status.name,
            priority: issue.fields.priority?.name || null,
            assignee: issue.fields.assignee?.displayName || null,
            dueDate: issue.fields.duedate ? new Date(issue.fields.duedate) : null,
            dealer,
            lastReply: lastReply?.substring(0, 500) || null,
            lastReplyBy,
            lastReplyAt,
            jiraUpdated: new Date(issue.fields.updated),
            syncedAt: new Date(),
          },
          create: {
            partnerId,
            jiraKey: issue.key,
            summary: issue.fields.summary,
            status: issue.fields.status.name,
            priority: issue.fields.priority?.name || null,
            assignee: issue.fields.assignee?.displayName || null,
            dueDate: issue.fields.duedate ? new Date(issue.fields.duedate) : null,
            dealer,
            lastReply: lastReply?.substring(0, 500) || null,
            lastReplyBy,
            lastReplyAt,
            jiraUpdated: new Date(issue.fields.updated),
          },
        })
      })
    )

    // Build label display for activity record
    const usedLabels: string[] = []
    if (partner.jiraLabel) usedLabels.push(partner.jiraLabel)
    usedLabels.push(partner.name)
    if (partner.odooTags?.length) {
      for (const tag of partner.odooTags) {
        if (!usedLabels.includes(tag)) usedLabels.push(tag)
      }
    }

    // Create activity record for this sync
    await prisma.activity.create({
      data: {
        partnerId,
        source: 'JIRA',
        title: `Jira 同步完成`,
        content: `從 ${JIRA_PROJECT_KEYS.join(', ')} 同步了 ${syncedItems.length} 個問題` +
          ` (Labels: ${usedLabels.join(', ')})`,
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
