import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import jiraClient from '@/lib/jira'

// 支援多個 Project，用逗號分隔，例如: CW,PROJ2,PROJ3
const JIRA_PROJECT_KEYS = (process.env.JIRA_PROJECT_KEYS || process.env.JIRA_PROJECT_KEY || 'CW')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean)
const DEFAULT_PROJECT_KEY = JIRA_PROJECT_KEYS[0]
const JIRA_PARTNER_FIELD = process.env.JIRA_CUSTOM_FIELD_PARTNER || 'customfield_10264'

// GET: 取得可用的 Project 列表
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    return NextResponse.json({
      projects: JIRA_PROJECT_KEYS,
      defaultProject: DEFAULT_PROJECT_KEY,
    })
  } catch (error) {
    console.error('Error getting Jira projects:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '取得 Projects 失敗' },
      { status: 500 }
    )
  }
}

// POST: 建立 Jira issue
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const { customerId, summary, description, issueType, priority, projectKey } = body

    if (!customerId || !summary) {
      return NextResponse.json(
        { error: '缺少必要欄位 (customerId, summary)' },
        { status: 400 }
      )
    }

    // 驗證 projectKey 是否在允許的列表中
    const targetProjectKey = projectKey || DEFAULT_PROJECT_KEY
    if (!JIRA_PROJECT_KEYS.includes(targetProjectKey)) {
      return NextResponse.json(
        { error: `無效的 Project: ${targetProjectKey}，允許的 Projects: ${JIRA_PROJECT_KEYS.join(', ')}` },
        { status: 400 }
      )
    }

    // Get partner info for labels
    const partner = await prisma.partner.findUnique({
      where: { id: customerId },
    })

    if (!partner) {
      return NextResponse.json(
        { error: '客戶不存在' },
        { status: 404 }
      )
    }

    // Build labels array
    const labels: string[] = []
    if (partner.jiraLabel) {
      labels.push(partner.jiraLabel)
    }

    // Build description in Jira document format
    const descriptionDoc = description ? {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: description,
            },
          ],
        },
      ],
    } : undefined

    // Create issue in Jira
    const issueFields: Record<string, unknown> = {
      project: { key: targetProjectKey },
      summary,
      issuetype: { name: issueType || 'Task' },
      labels,
    }

    if (descriptionDoc) {
      issueFields.description = descriptionDoc
    }

    if (priority) {
      issueFields.priority = { name: priority }
    }

    const result = await jiraClient.createIssue(issueFields as any)

    // Create activity record
    await prisma.activity.create({
      data: {
        partnerId: customerId,
        source: 'JIRA',
        title: `建立報修: ${result.key}`,
        content: summary,
        jiraKey: result.key,
        createdBy: session.user?.email || 'unknown',
      },
    })

    return NextResponse.json({
      success: true,
      issue: {
        key: result.key,
        id: result.id,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating Jira issue:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '建立失敗' },
      { status: 500 }
    )
  }
}
