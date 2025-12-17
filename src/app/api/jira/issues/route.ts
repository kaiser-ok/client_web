import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import jiraClient from '@/lib/jira'

const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY || 'CW'
const JIRA_PARTNER_FIELD = process.env.JIRA_CUSTOM_FIELD_PARTNER || 'customfield_10264'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const { customerId, summary, description, issueType, priority } = body

    if (!customerId || !summary) {
      return NextResponse.json(
        { error: '缺少必要欄位 (customerId, summary)' },
        { status: 400 }
      )
    }

    // Get customer info for labels
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    })

    if (!customer) {
      return NextResponse.json(
        { error: '客戶不存在' },
        { status: 404 }
      )
    }

    // Build labels array
    const labels: string[] = []
    if (customer.jiraLabel) {
      labels.push(customer.jiraLabel)
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
      project: { key: JIRA_PROJECT_KEY },
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

    // Add partner custom field if customer has one
    if (customer.partner) {
      issueFields[JIRA_PARTNER_FIELD] = customer.partner
    }

    const result = await jiraClient.createIssue(issueFields as any)

    // Create activity record
    await prisma.activity.create({
      data: {
        customerId,
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
