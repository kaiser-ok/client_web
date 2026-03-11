import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { jiraClient } from '@/lib/jira'

// 支援多個 Project，用逗號分隔
const JIRA_PROJECT_KEYS = (process.env.JIRA_PROJECT_KEYS || process.env.JIRA_PROJECT_KEY || process.env.JIRA_PROJECT || 'CW')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean)

// 建立 Project JQL 條件
const getProjectClause = () => {
  return JIRA_PROJECT_KEYS.length === 1
    ? `project = ${JIRA_PROJECT_KEYS[0]}`
    : `project IN (${JIRA_PROJECT_KEYS.join(', ')})`
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'pending'
    const projectClause = getProjectClause()

    let jql = ''
    switch (type) {
      case 'pending':
        jql = `${projectClause} AND statusCategory != Done ORDER BY updated DESC`
        break
      case 'waiting':
        jql = `${projectClause} AND status = "等待客戶回覆" ORDER BY updated DESC`
        break
      case 'overdue':
        jql = `${projectClause} AND statusCategory != Done AND duedate < now() ORDER BY duedate ASC`
        break
      default:
        jql = `${projectClause} AND statusCategory != Done ORDER BY updated DESC`
    }

    const result = await jiraClient.searchIssues(
      jql,
      ['summary', 'status', 'priority', 'assignee', 'updated', 'duedate'],
      100
    )

    return NextResponse.json({ issues: result.issues })
  } catch (error) {
    console.error('Error fetching issues:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
