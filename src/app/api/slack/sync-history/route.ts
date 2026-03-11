import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createSlackClient, getTimeRange } from '@/lib/slack'
import { graphitiClient } from '@/lib/graphiti'

/**
 * 同步 Slack 歷史訊息到 Graphiti
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
    const { channelId, channelName, days = 7, limit = 500 } = body

    if (!channelId) {
      return NextResponse.json({ error: '請指定頻道 ID' }, { status: 400 })
    }

    const slackClient = createSlackClient()
    const { oldest } = getTimeRange(days)

    // 取得頻道訊息
    const messages = await slackClient.getChannelHistory(channelId, {
      oldest,
      limit,
    })

    // 過濾有效訊息（有使用者和內容）
    const validMessages = messages.filter(m => m.user && m.text && !m.text.startsWith('<@'))

    // 取得使用者名稱對照
    const userIds = [...new Set(validMessages.map(m => m.user!))]
    const userNames = await slackClient.resolveUserNames(userIds)

    // 批量同步到 Graphiti
    let syncedCount = 0
    const errors: string[] = []

    // 分批處理，每批 10 則
    const batchSize = 10
    for (let i = 0; i < validMessages.length; i += batchSize) {
      const batch = validMessages.slice(i, i + batchSize)

      const graphitiMessages = batch.map(msg => ({
        platform: 'SLACK' as const,
        external_id: msg.ts,
        content: msg.text,
        timestamp: new Date(parseFloat(msg.ts) * 1000),
        sender_id: msg.user,
        sender_name: userNames.get(msg.user!) || undefined,
        channel_id: channelId,
        channel_name: channelName || undefined,
        thread_id: msg.thread_ts || undefined,
      }))

      try {
        await graphitiClient.bulkIngest(graphitiMessages)
        syncedCount += batch.length
      } catch (err) {
        errors.push(`Batch ${i}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `同步完成`,
      stats: {
        total: messages.length,
        valid: validMessages.length,
        synced: syncedCount,
        errors: errors.length,
      },
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Slack history sync error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '同步失敗' },
      { status: 500 }
    )
  }
}
