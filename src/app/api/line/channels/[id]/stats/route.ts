import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * GET: LINE 頻道活動統計
 * - daily: 每日訊息數 (近12個月)
 * - hourly: 每小時分布
 * - weekday: 每週分布
 * - users: 各使用者發言數 + 時間分布
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id: channelId } = await params

    // 驗證頻道存在
    const channel = await prisma.lineChannel.findUnique({
      where: { id: channelId },
      select: { id: true, channelName: true },
    })
    if (!channel) {
      return NextResponse.json({ error: '頻道不存在' }, { status: 404 })
    }

    // 取得近 12 個月的訊息
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
    twelveMonthsAgo.setHours(0, 0, 0, 0)

    const messages = await prisma.lineMessage.findMany({
      where: {
        channelId,
        timestamp: { gte: twelveMonthsAgo },
      },
      select: {
        lineUserId: true,
        messageType: true,
        timestamp: true,
      },
      orderBy: { timestamp: 'asc' },
    })

    // 取得使用者名稱
    const userIds = [...new Set(messages.map(m => m.lineUserId))]
    const users = await prisma.lineUser.findMany({
      where: { lineUserId: { in: userIds } },
      select: { lineUserId: true, displayName: true, pictureUrl: true },
    })
    const userMap = new Map(users.map(u => [u.lineUserId, u]))

    // 1. Daily counts (heatmap 用)
    const dailyCounts = new Map<string, number>()
    // 2. Hourly distribution
    const hourlyCounts = new Array(24).fill(0)
    // 3. Weekday distribution (0=Sun, 6=Sat)
    const weekdayCounts = new Array(7).fill(0)
    // 4. Per-user stats
    const userStats = new Map<string, {
      count: number
      hourly: number[]
      weekday: number[]
      firstMessage: Date
      lastMessage: Date
    }>()

    for (const msg of messages) {
      const ts = new Date(msg.timestamp)
      const dateKey = ts.toISOString().slice(0, 10)
      const hour = ts.getHours()
      const weekday = ts.getDay()

      // Daily
      dailyCounts.set(dateKey, (dailyCounts.get(dateKey) || 0) + 1)

      // Hourly
      hourlyCounts[hour]++

      // Weekday
      weekdayCounts[weekday]++

      // Per-user
      const userId = msg.lineUserId
      if (!userStats.has(userId)) {
        userStats.set(userId, {
          count: 0,
          hourly: new Array(24).fill(0),
          weekday: new Array(7).fill(0),
          firstMessage: ts,
          lastMessage: ts,
        })
      }
      const stat = userStats.get(userId)!
      stat.count++
      stat.hourly[hour]++
      stat.weekday[weekday]++
      if (ts < stat.firstMessage) stat.firstMessage = ts
      if (ts > stat.lastMessage) stat.lastMessage = ts
    }

    // Format daily data for heatmap (fill empty days)
    const daily: { date: string; count: number }[] = []
    const now = new Date()
    const cursor = new Date(twelveMonthsAgo)
    while (cursor <= now) {
      const key = cursor.toISOString().slice(0, 10)
      daily.push({ date: key, count: dailyCounts.get(key) || 0 })
      cursor.setDate(cursor.getDate() + 1)
    }

    // Format hourly
    const hourlyLabels = ['00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11',
      '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23']
    const hourly = hourlyLabels.map((label, i) => ({
      hour: label,
      count: hourlyCounts[i],
    }))

    // Format weekday
    const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六']
    const weekday = weekdayLabels.map((label, i) => ({
      day: label,
      count: weekdayCounts[i],
    }))

    // Format user stats
    const userList = [...userStats.entries()]
      .map(([userId, stat]) => {
        const user = userMap.get(userId)
        return {
          userId,
          displayName: user?.displayName || userId.slice(-6),
          pictureUrl: user?.pictureUrl || null,
          count: stat.count,
          hourly: hourlyLabels.map((label, i) => ({
            hour: label,
            count: stat.hourly[i],
          })),
          weekday: weekdayLabels.map((label, i) => ({
            day: label,
            count: stat.weekday[i],
          })),
          firstMessage: stat.firstMessage.toISOString(),
          lastMessage: stat.lastMessage.toISOString(),
        }
      })
      .sort((a, b) => b.count - a.count)

    // Monthly trend
    const monthlyCounts = new Map<string, number>()
    for (const msg of messages) {
      const monthKey = new Date(msg.timestamp).toISOString().slice(0, 7)
      monthlyCounts.set(monthKey, (monthlyCounts.get(monthKey) || 0) + 1)
    }
    const monthly = [...monthlyCounts.entries()]
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month))

    return NextResponse.json({
      channelName: channel.channelName,
      totalMessages: messages.length,
      daily,
      hourly,
      weekday,
      monthly,
      users: userList,
    })
  } catch (error) {
    console.error('Error getting channel stats:', error)
    return NextResponse.json({ error: '取得統計失敗' }, { status: 500 })
  }
}
