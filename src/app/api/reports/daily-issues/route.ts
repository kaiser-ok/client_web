import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { jiraClient } from '@/lib/jira'

const JIRA_PROJECT = process.env.JIRA_PROJECT || 'CW'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const formatDate = (date: Date) => date.toISOString().split('T')[0]

    // Fetch created issues per day
    const jql = `project = ${JIRA_PROJECT} AND created >= "${formatDate(startDate)}" ORDER BY created ASC`

    const result = await jiraClient.searchIssues(
      jql,
      ['key', 'created', 'status', 'issuetype'],
      1000 // Get up to 1000 issues
    )

    // Group issues by date
    const dailyStats: Record<string, { created: number; resolved: number }> = {}

    // Initialize all dates with 0
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = formatDate(new Date(d))
      dailyStats[dateStr] = { created: 0, resolved: 0 }
    }

    // Count created issues per day
    for (const issue of result.issues) {
      const createdDate = issue.fields.created.split('T')[0]
      if (dailyStats[createdDate]) {
        dailyStats[createdDate].created++
      }
    }

    // Fetch resolved issues per day
    const resolvedJql = `project = ${JIRA_PROJECT} AND resolved >= "${formatDate(startDate)}" ORDER BY resolved ASC`

    try {
      const resolvedResult = await jiraClient.searchIssues(
        resolvedJql,
        ['key', 'resolutiondate'],
        1000
      )

      for (const issue of resolvedResult.issues) {
        const resolutionDate = issue.fields.resolutiondate?.split('T')[0]
        if (resolutionDate && dailyStats[resolutionDate]) {
          dailyStats[resolutionDate].resolved++
        }
      }
    } catch {
      // resolutiondate field might not be available
      console.warn('Could not fetch resolved issues')
    }

    // Convert to array format for charts
    const chartData = Object.entries(dailyStats)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({
        date,
        created: stats.created,
        resolved: stats.resolved,
      }))

    // Calculate summary
    const totalCreated = chartData.reduce((sum, d) => sum + d.created, 0)
    const totalResolved = chartData.reduce((sum, d) => sum + d.resolved, 0)
    const avgCreatedPerDay = totalCreated / days
    const avgResolvedPerDay = totalResolved / days

    return NextResponse.json({
      chartData,
      summary: {
        totalCreated,
        totalResolved,
        avgCreatedPerDay: Math.round(avgCreatedPerDay * 10) / 10,
        avgResolvedPerDay: Math.round(avgResolvedPerDay * 10) / 10,
        period: `${formatDate(startDate)} ~ ${formatDate(endDate)}`,
      },
    })
  } catch (error) {
    console.error('Error fetching daily issues:', error)
    return NextResponse.json({ error: '取得報表失敗' }, { status: 500 })
  }
}
