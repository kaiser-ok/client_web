import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createSlackClient } from '@/lib/slack'
import { normalizeSlackMessage, enqueueMessage } from '@/lib/message-pipeline'
import { PrismaClient } from '@prisma/client'

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET

interface SlackEvent {
  type: string
  event?: {
    type: string
    user?: string
    text?: string
    channel?: string
    ts?: string
    thread_ts?: string
    channel_type?: string
    subtype?: string
  }
  challenge?: string
  event_id?: string
  event_time?: number
}

/**
 * 驗證 Slack 請求簽章
 */
function verifySlackSignature(
  body: string,
  timestamp: string,
  signature: string
): boolean {
  if (!SLACK_SIGNING_SECRET) {
    console.warn('SLACK_SIGNING_SECRET not configured, skipping verification')
    return true
  }

  // 檢查時間戳記（5分鐘內）
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    return false
  }

  const sigBasestring = `v0:${timestamp}:${body}`
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', SLACK_SIGNING_SECRET)
    .update(sigBasestring)
    .digest('hex')

  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(signature)
  )
}

/**
 * Slack Events API Webhook
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const timestamp = request.headers.get('x-slack-request-timestamp') || ''
    const signature = request.headers.get('x-slack-signature') || ''

    // 驗證簽章
    if (!verifySlackSignature(body, timestamp, signature)) {
      console.error('Slack webhook signature verification failed')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const event: SlackEvent = JSON.parse(body)

    // 處理 URL 驗證挑戰
    if (event.type === 'url_verification') {
      return NextResponse.json({ challenge: event.challenge })
    }

    // 處理事件回調
    if (event.type === 'event_callback' && event.event) {
      await processSlackEvent(event.event, event.event_time)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Slack webhook error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/**
 * 處理 Slack 事件
 */
async function processSlackEvent(
  event: NonNullable<SlackEvent['event']>,
  eventTime?: number
) {
  // 只處理訊息事件
  if (event.type !== 'message') return

  // 忽略 bot 訊息和子類型（編輯、刪除等）
  if (event.subtype) return

  // 確保有必要的資料
  if (!event.user || !event.text || !event.channel || !event.ts) return

  console.log(`Slack message received: ${event.channel}/${event.ts}`)

  // 送入 Unified Message Pipeline（非同步）
  ;(async () => {
    const slackClient = createSlackClient()

    // 取得使用者資訊
    let senderName: string | undefined
    try {
      const userInfo = await slackClient.getUserInfo(event.user!)
      senderName = userInfo.profile.display_name || userInfo.real_name || userInfo.name
    } catch {
      // 忽略錯誤
    }

    // 取得頻道資訊
    let channelName: string | undefined
    try {
      const channels = await slackClient.listChannels()
      const channel = channels.find(c => c.id === event.channel)
      channelName = channel?.name
    } catch {
      // 忽略錯誤
    }

    // 查詢 SlackChannelMapping 取得 partnerId
    let partnerId: string | undefined
    try {
      const prisma = new PrismaClient()
      try {
        const mapping = await prisma.slackChannelMapping.findUnique({
          where: { channelId: event.channel! },
          select: { partnerId: true },
        })
        partnerId = mapping?.partnerId || undefined
      } finally {
        await prisma.$disconnect()
      }
    } catch {
      // 忽略錯誤
    }

    const message = normalizeSlackMessage(event, senderName, channelName, partnerId, eventTime)
    await enqueueMessage(message)
  })().catch(err => {
    console.error('Failed to enqueue Slack message:', err)
  })
}
