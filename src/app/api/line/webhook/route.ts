import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import {
  verifySignature,
  createLineClient,
  parseMessageContent,
  LineWebhookBody,
  LineWebhookEvent,
} from '@/lib/line'
import { lineEvents } from '@/lib/line-events'
import { normalizeLineMessage, enqueueMessage } from '@/lib/message-pipeline'

/**
 * LINE Webhook 端點
 * 接收 LINE Platform 推送的事件
 */
export async function POST(request: NextRequest) {
  try {
    // 取得原始 body 用於驗證簽章
    const rawBody = await request.text()
    const signature = request.headers.get('x-line-signature')

    // 驗證簽章
    if (!signature || !verifySignature(rawBody, signature)) {
      console.error('LINE webhook signature verification failed')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // 解析事件
    const body: LineWebhookBody = JSON.parse(rawBody)

    // 處理每個事件
    for (const event of body.events) {
      await processEvent(event)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('LINE webhook error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/**
 * 處理單一事件
 */
async function processEvent(event: LineWebhookEvent) {
  const lineClient = createLineClient()

  // 取得頻道資訊
  const channelId = lineClient.getChannelIdFromEvent(event)
  const channelType = lineClient.getChannelTypeFromEvent(event)

  // 確保頻道存在
  const channel = await ensureChannel(event, lineClient, channelId, channelType)

  switch (event.type) {
    case 'message':
      await handleMessageEvent(event, channel.id, lineClient)
      break

    case 'follow':
      // 使用者加入好友
      if (event.source.userId) {
        await ensureUser(event.source.userId, lineClient, event)
      }
      break

    case 'join':
      // Bot 被加入群組/聊天室
      console.log(`Bot joined ${channelType}: ${channelId}`)
      break

    case 'leave':
      // Bot 被移出群組/聊天室
      await prisma.lineChannel.update({
        where: { id: channel.id },
        data: { isActive: false },
      })
      break

    case 'memberJoined':
      // 成員加入群組
      // 可選：記錄成員
      break

    case 'memberLeft':
      // 成員離開群組
      // 可選：更新成員狀態
      break

    default:
      console.log(`Unhandled event type: ${event.type}`)
  }
}

/**
 * 處理訊息事件
 */
async function handleMessageEvent(
  event: LineWebhookEvent,
  channelDbId: string,
  lineClient: ReturnType<typeof createLineClient>
) {
  if (!event.message || !event.source.userId) return

  // 確保使用者存在
  await ensureUser(event.source.userId, lineClient, event)

  // 解析訊息內容
  const content = parseMessageContent(event.message)

  // 取得媒體 URL（貼圖、圖片等）
  let mediaUrl: string | null = null
  if (event.message.type === 'sticker' && event.message.stickerId) {
    // LINE 貼圖 URL 格式
    mediaUrl = `https://stickershop.line-scdn.net/stickershop/v1/sticker/${event.message.stickerId}/iPhone/sticker.png`
  } else if (event.message.type === 'image') {
    if (event.message.contentProvider?.type === 'external') {
      // 外部圖片直接使用 URL
      mediaUrl = event.message.contentProvider.originalContentUrl || null
    } else {
      // LINE 託管的圖片，需要下載並儲存
      try {
        const imageBuffer = await lineClient.getMessageContent(event.message.id)

        // 儲存圖片到本地
        const timestamp = Date.now()
        const filename = `line-received-${timestamp}.jpg`
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'line')
        const filePath = path.join(uploadDir, filename)

        await mkdir(uploadDir, { recursive: true })
        await writeFile(filePath, imageBuffer)

        // 使用相對路徑，讓瀏覽器自動解析正確的 host
        mediaUrl = `/api/uploads/line/${filename}`

        console.log(`LINE image saved: ${filename}`)
      } catch (err) {
        console.error('Failed to download LINE image:', err)
      }
    }
  }

  // 儲存訊息
  await prisma.lineMessage.upsert({
    where: { lineMessageId: event.message.id },
    create: {
      lineMessageId: event.message.id,
      channelId: channelDbId,
      lineUserId: event.source.userId,
      messageType: event.message.type,
      content,
      mediaUrl,
      replyToken: event.replyToken,
      timestamp: new Date(event.timestamp),
    },
    update: {
      // 訊息 ID 唯一，通常不會重複
    },
  })

  // 更新頻道最後訊息時間
  await prisma.lineChannel.update({
    where: { id: channelDbId },
    data: { lastMessageAt: new Date(event.timestamp) },
  })

  // 送入 Unified Message Pipeline（非同步，不影響主流程）
  if (content && event.message.type === 'text') {
    (async () => {
      const [user, channel] = await Promise.all([
        prisma.lineUser.findUnique({ where: { lineUserId: event.source.userId } }),
        prisma.lineChannel.findUnique({ where: { id: channelDbId } }),
      ])
      const message = normalizeLineMessage(event, user, channel)
      await enqueueMessage(message)
    })().catch(err => {
      console.error('Failed to enqueue LINE message:', err)
    })
  }

  // 發射事件通知前端更新
  lineEvents.emit(channelDbId)
}

/**
 * 確保頻道存在於資料庫
 */
async function ensureChannel(
  event: LineWebhookEvent,
  lineClient: ReturnType<typeof createLineClient>,
  channelId: string,
  channelType: 'GROUP' | 'ROOM' | 'USER'
) {
  // 檢查是否已存在
  const existing = await prisma.lineChannel.findUnique({
    where: { lineChannelId: channelId },
  })

  if (existing) {
    // 如果之前標記為不活躍，重新啟用
    if (!existing.isActive) {
      return prisma.lineChannel.update({
        where: { id: existing.id },
        data: { isActive: true },
      })
    }
    return existing
  }

  // 取得頻道名稱（群組才有）
  let channelName: string | null = null
  if (channelType === 'GROUP') {
    try {
      const summary = await lineClient.getGroupSummary(channelId)
      channelName = summary.groupName
    } catch {
      // 可能沒有權限取得群組資訊
    }
  } else if (channelType === 'USER' && event.source.userId) {
    // 1:1 聊天，使用使用者名稱
    try {
      const profile = await lineClient.getUserProfile(event.source.userId)
      channelName = profile.displayName
    } catch {
      // ignore
    }
  }

  // 建立新頻道
  return prisma.lineChannel.create({
    data: {
      lineChannelId: channelId,
      channelType,
      channelName,
    },
  })
}

/**
 * 確保使用者存在於資料庫
 */
async function ensureUser(
  userId: string,
  lineClient: ReturnType<typeof createLineClient>,
  event: LineWebhookEvent
) {
  // 檢查是否已存在
  const existing = await prisma.lineUser.findUnique({
    where: { lineUserId: userId },
  })

  if (existing) {
    return existing
  }

  // 取得使用者資料
  let displayName = 'Unknown'
  let pictureUrl: string | undefined

  try {
    const profile = await lineClient.getUserProfileFromEvent(event)
    if (profile) {
      displayName = profile.displayName
      pictureUrl = profile.pictureUrl
    }
  } catch {
    // 無法取得使用者資料，使用預設值
  }

  // 建立新使用者
  return prisma.lineUser.create({
    data: {
      lineUserId: userId,
      displayName,
      pictureUrl,
      identityType: 'UNKNOWN',
    },
  })
}

// LINE 會驗證 Webhook URL 時發送 GET 請求
export async function GET() {
  return NextResponse.json({ status: 'ok' })
}
