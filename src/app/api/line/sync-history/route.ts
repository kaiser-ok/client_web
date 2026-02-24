import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { graphitiClient } from '@/lib/graphiti'

/**
 * 同步 LINE 歷史訊息到 Graphiti
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    if (session.user?.role !== 'ADMIN' && session.user?.role !== 'SUPPORT') {
      return NextResponse.json({ error: '權限不足' }, { status: 403 })
    }

    const body = await request.json()
    const { channelId, days = 30, limit = 1000 } = body

    // 計算時間範圍
    const since = new Date()
    since.setDate(since.getDate() - days)

    // 查詢條件
    const where: {
      timestamp: { gte: Date }
      messageType: string
      content: { not: null }
      channelId?: string
    } = {
      timestamp: { gte: since },
      messageType: 'text',
      content: { not: null },
    }

    if (channelId) {
      where.channelId = channelId
    }

    // 取得訊息
    const messages = await prisma.lineMessage.findMany({
      where,
      include: {
        channel: true,
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    })

    // 取得使用者資訊
    const userIds = [...new Set(messages.map(m => m.lineUserId))]
    const users = await prisma.lineUser.findMany({
      where: { lineUserId: { in: userIds } },
    })
    const userMap = new Map(users.map(u => [u.lineUserId, u]))

    // 批量同步到 Graphiti
    let syncedCount = 0
    const errors: string[] = []

    // 分批處理
    const batchSize = 10
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize)

      const graphitiMessages = batch
        .filter(msg => msg.content)
        .map(msg => {
          const user = userMap.get(msg.lineUserId)
          return {
            platform: 'LINE' as const,
            external_id: msg.lineMessageId,
            content: msg.content!,
            timestamp: msg.timestamp,
            sender_id: msg.lineUserId,
            sender_name: user?.displayName || undefined,
            channel_id: msg.channel.lineChannelId,
            channel_name: msg.channel.channelName || undefined,
            partner_id: msg.channel.partnerId || undefined,
          }
        })

      if (graphitiMessages.length === 0) continue

      try {
        await graphitiClient.bulkIngest(graphitiMessages)
        syncedCount += graphitiMessages.length
      } catch (err) {
        errors.push(`Batch ${i}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `同步完成`,
      stats: {
        total: messages.length,
        synced: syncedCount,
        errors: errors.length,
      },
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('LINE history sync error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '同步失敗' },
      { status: 500 }
    )
  }
}
