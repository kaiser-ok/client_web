import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createSlackClient } from '@/lib/slack'

/**
 * GET /api/slack/channels
 * 列出所有 Slack 頻道
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    if (!process.env.SLACK_BOT_TOKEN) {
      return NextResponse.json(
        { error: 'Slack 尚未設定，請先設定 SLACK_BOT_TOKEN' },
        { status: 400 }
      )
    }

    const slack = createSlackClient()
    const channels = await slack.listChannels()

    // 返回頻道列表，包含 id 和 name
    return NextResponse.json({
      channels: channels.map(ch => ({
        id: ch.id,
        name: ch.name,
        isPrivate: ch.is_private,
        isMember: ch.is_member,
        numMembers: ch.num_members,
        topic: ch.topic?.value,
        purpose: ch.purpose?.value,
      })),
    })
  } catch (error) {
    console.error('Slack channels error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '取得頻道列表失敗' },
      { status: 500 }
    )
  }
}
