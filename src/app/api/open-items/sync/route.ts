import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import jiraClient, { extractTextFromJiraBody } from '@/lib/jira'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const { customerId, projectKey } = body

    if (!customerId || !projectKey) {
      return NextResponse.json(
        { error: '缺少必要參數' },
        { status: 400 }
      )
    }

    // Fetch open issues from Jira
    const issues = await jiraClient.getOpenIssues(projectKey)

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

        return prisma.openItem.upsert({
          where: { jiraKey: issue.key },
          update: {
            customerId,
            summary: issue.fields.summary,
            status: issue.fields.status.name,
            priority: issue.fields.priority?.name || null,
            assignee: issue.fields.assignee?.displayName || null,
            dueDate: issue.fields.duedate ? new Date(issue.fields.duedate) : null,
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
        content: `從 ${projectKey} 同步了 ${syncedItems.length} 個問題`,
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
