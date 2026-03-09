import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userEmail = session.user?.email || ''
  const userName = session.user?.name || ''
  const { searchParams } = request.nextUrl
  const range = searchParams.get('range') || 'today' // today, week, month

  const now = new Date()
  let startDate: Date
  let prevStartDate: Date
  let prevEndDate: Date

  if (range === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    prevEndDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
  } else if (range === 'week') {
    const day = now.getDay()
    const diff = day === 0 ? 6 : day - 1
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff)
    startDate.setHours(0, 0, 0, 0)
    prevStartDate = new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000)
    prevEndDate = new Date(startDate.getTime() - 1)
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    prevStartDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000)
    prevEndDate = new Date(startDate.getTime() - 1)
  }

  try {
    // Run all queries in parallel
    const [
      lineMessages,
      prevLineMessages,
      slackActivities,
      prevSlackActivities,
      emailActivities,
      prevEmailActivities,
      newPartners,
      prevNewPartners,
      newProjects,
      prevNewProjects,
      newDeals,
      prevNewDeals,
      newQuotations,
      prevNewQuotations,
      manualActivities,
      prevManualActivities,
      meetingActivities,
      prevMeetingActivities,
      activeLineChannels,
      totalActivities,
      prevTotalActivities,
      recentActivities,
      // Personal stats
      myActivities,
      myOpenItems,
      myRecentActivities,
      myDeals,
      myQuotations,
    ] = await Promise.all([
      // LINE messages count
      prisma.lineMessage.count({
        where: { timestamp: { gte: startDate } },
      }),
      prisma.lineMessage.count({
        where: { timestamp: { gte: prevStartDate, lte: prevEndDate } },
      }),

      // Slack activities count
      prisma.activity.count({
        where: { source: 'SLACK', createdAt: { gte: startDate } },
      }),
      prisma.activity.count({
        where: { source: 'SLACK', createdAt: { gte: prevStartDate, lte: prevEndDate } },
      }),

      // Email activities count
      prisma.activity.count({
        where: { source: 'EMAIL', createdAt: { gte: startDate } },
      }),
      prisma.activity.count({
        where: { source: 'EMAIL', createdAt: { gte: prevStartDate, lte: prevEndDate } },
      }),

      // New partners
      prisma.partner.count({
        where: { createdAt: { gte: startDate }, isActive: true },
      }),
      prisma.partner.count({
        where: { createdAt: { gte: prevStartDate, lte: prevEndDate }, isActive: true },
      }),

      // New projects
      prisma.project.count({
        where: { createdAt: { gte: startDate } },
      }),
      prisma.project.count({
        where: { createdAt: { gte: prevStartDate, lte: prevEndDate } },
      }),

      // New deals
      prisma.deal.count({
        where: { createdAt: { gte: startDate } },
      }),
      prisma.deal.count({
        where: { createdAt: { gte: prevStartDate, lte: prevEndDate } },
      }),

      // New quotations
      prisma.quotation.count({
        where: { createdAt: { gte: startDate } },
      }),
      prisma.quotation.count({
        where: { createdAt: { gte: prevStartDate, lte: prevEndDate } },
      }),

      // Manual activities
      prisma.activity.count({
        where: { source: 'MANUAL', createdAt: { gte: startDate } },
      }),
      prisma.activity.count({
        where: { source: 'MANUAL', createdAt: { gte: prevStartDate, lte: prevEndDate } },
      }),

      // Meeting activities
      prisma.activity.count({
        where: { source: 'MEETING', createdAt: { gte: startDate } },
      }),
      prisma.activity.count({
        where: { source: 'MEETING', createdAt: { gte: prevStartDate, lte: prevEndDate } },
      }),

      // Active LINE channels
      prisma.lineMessage.groupBy({
        by: ['channelId'],
        where: { timestamp: { gte: startDate } },
      }).then(r => r.length),

      // Total activities
      prisma.activity.count({
        where: { createdAt: { gte: startDate } },
      }),
      prisma.activity.count({
        where: { createdAt: { gte: prevStartDate, lte: prevEndDate } },
      }),

      // Activities breakdown by source
      prisma.activity.groupBy({
        by: ['source'],
        where: { createdAt: { gte: startDate } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),

      // === Personal stats ===

      // My activities in period
      prisma.activity.count({
        where: { createdBy: userEmail, createdAt: { gte: startDate } },
      }),

      // My assigned open items (by assignee name or email)
      prisma.openItem.findMany({
        where: {
          OR: [
            { assignee: { contains: userName, mode: 'insensitive' } },
            ...(userEmail ? [{ assignee: { contains: userEmail, mode: 'insensitive' as const } }] : []),
          ],
          status: { not: 'Done' },
        },
        select: {
          id: true,
          jiraKey: true,
          summary: true,
          status: true,
          priority: true,
          waitingOn: true,
          dueDate: true,
          jiraUpdated: true,
          partner: { select: { name: true } },
        },
        orderBy: { jiraUpdated: 'desc' },
        take: 10,
      }),

      // My recent activities
      prisma.activity.findMany({
        where: { createdBy: userEmail, createdAt: { gte: startDate } },
        select: {
          id: true,
          title: true,
          source: true,
          createdAt: true,
          partner: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),

      // My deals in period
      prisma.deal.count({
        where: { createdBy: userEmail, createdAt: { gte: startDate } },
      }),

      // My quotations in period
      prisma.quotation.count({
        where: { createdBy: userEmail, createdAt: { gte: startDate } },
      }),
    ])

    // Daily trend data
    const trendDays = range === 'month' ? 30 : 7
    const trendStart = new Date(now.getTime() - trendDays * 24 * 60 * 60 * 1000)
    trendStart.setHours(0, 0, 0, 0)

    const [lineTrend, activityTrend] = await Promise.all([
      prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
        SELECT DATE(timestamp) as date, COUNT(*) as count
        FROM line_messages
        WHERE timestamp >= ${trendStart}
        GROUP BY DATE(timestamp)
        ORDER BY date
      `,
      prisma.$queryRaw<Array<{ date: string; source: string; count: bigint }>>`
        SELECT DATE("createdAt") as date, source, COUNT(*) as count
        FROM activities
        WHERE "createdAt" >= ${trendStart}
        GROUP BY DATE("createdAt"), source
        ORDER BY date
      `,
    ])

    return NextResponse.json({
      range,
      startDate: startDate.toISOString(),
      stats: {
        lineMessages: { current: lineMessages, previous: prevLineMessages },
        slackActivities: { current: slackActivities, previous: prevSlackActivities },
        emailActivities: { current: emailActivities, previous: prevEmailActivities },
        newPartners: { current: newPartners, previous: prevNewPartners },
        newProjects: { current: newProjects, previous: prevNewProjects },
        newDeals: { current: newDeals, previous: prevNewDeals },
        newQuotations: { current: newQuotations, previous: prevNewQuotations },
        manualActivities: { current: manualActivities, previous: prevManualActivities },
        meetingActivities: { current: meetingActivities, previous: prevMeetingActivities },
        totalActivities: { current: totalActivities, previous: prevTotalActivities },
      },
      activeLineChannels,
      activityBreakdown: recentActivities.map(r => ({
        source: r.source,
        count: r._count.id,
      })),
      personal: {
        myActivities,
        myOpenItems,
        myRecentActivities,
        myDeals,
        myQuotations,
      },
      trends: {
        line: lineTrend.map(r => ({
          date: r.date,
          count: Number(r.count),
        })),
        activity: activityTrend.map(r => ({
          date: r.date,
          source: r.source,
          count: Number(r.count),
        })),
      },
    })
  } catch (error) {
    console.error('Error fetching activity stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
