import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { graphitiClient, MessageInput } from '@/lib/graphiti'
import { createSlackClient } from '@/lib/slack'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // Only admin can sync
    if (session.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: '權限不足' }, { status: 403 })
    }

    const body = await request.json()
    const { platform, channelId, since } = body

    if (!platform) {
      return NextResponse.json({ error: '請指定平台' }, { status: 400 })
    }

    let syncedCount = 0
    const errors: string[] = []

    if (platform === 'SLACK') {
      // 同步 Slack 訊息
      if (!channelId) {
        return NextResponse.json({ error: '請指定 Slack 頻道' }, { status: 400 })
      }

      try {
        const slackClient = createSlackClient()
        const messages = await slackClient.getChannelHistory(channelId, { limit: 100 })

        // 過濾有效訊息
        const validMessages = messages.filter(m => m.user && m.text)

        // 取得使用者名稱
        const userIds = [...new Set(validMessages.map(m => m.user!))]
        const userNames = await slackClient.resolveUserNames(userIds)

        const graphitiMessages: MessageInput[] = validMessages.map(msg => {
          return {
            platform: 'SLACK' as const,
            external_id: msg.ts,
            content: msg.text,
            timestamp: new Date(parseFloat(msg.ts) * 1000),
            sender_id: msg.user,
            sender_name: userNames.get(msg.user!) || undefined,
            channel_id: channelId,
            thread_id: msg.thread_ts,
          }
        })

        if (graphitiMessages.length > 0) {
          await graphitiClient.bulkIngest(graphitiMessages)
          syncedCount = graphitiMessages.length
        }
      } catch (e) {
        errors.push(`Slack sync error: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    // 可以擴展支援 LINE 和 EMAIL

    return NextResponse.json({
      success: true,
      message: `同步完成`,
      stats: {
        platform,
        synced: syncedCount,
        errors: errors.length,
      },
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Error syncing to graphiti:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '同步失敗' },
      { status: 500 }
    )
  }
}
