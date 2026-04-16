import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { createLineClient } from '@/lib/line'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

/**
 * POST: 發送 LINE 訊息到頻道
 * 支援文字訊息和圖片上傳
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id } = await params

    // 取得頻道資訊
    const channel = await prisma.lineChannel.findUnique({
      where: { id },
    })

    if (!channel) {
      return NextResponse.json({ error: '頻道不存在' }, { status: 404 })
    }

    if (!channel.isActive) {
      return NextResponse.json({ error: '此頻道已停用' }, { status: 400 })
    }

    const lineClient = createLineClient()
    const contentType = request.headers.get('content-type') || ''

    // 處理圖片上傳
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File | null

      if (!file) {
        return NextResponse.json({ error: '請選擇圖片' }, { status: 400 })
      }

      // 驗證檔案類型（支援圖片與各種檔案）
      const isImage = file.type.startsWith('image/')
      // 非圖片一律以檔案方式處理（Flex Message + 下載連結）

      // 儲存檔案到 public 目錄
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)

      const timestamp = Date.now()
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
      const filename = `line-${timestamp}.${ext}`
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'line')
      const filePath = path.join(uploadDir, filename)

      // 確保目錄存在
      await mkdir(uploadDir, { recursive: true })
      await writeFile(filePath, buffer)

      // 建立公開 URL（LINE API 需要完整的公開 HTTPS URL）
      const lineBaseUrl = process.env.LINE_BASE_URL?.replace(/\/$/, '') ||
        (() => {
          const host = request.headers.get('host') || 'localhost:3000'
          const proto = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
          return `${proto}://${host}`
        })()
      const absoluteFileUrl = `${lineBaseUrl}/api/uploads/line/${filename}`

      // 取得發送者資訊
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { name: true, email: true },
      })
      const systemUserId = `SYSTEM_${session.user.email}`
      const staffDisplayName = user?.name || session.user.email || 'System'

      if (isImage) {
        // 發送圖片訊息
        await lineClient.pushMessage(channel.lineChannelId, [
          {
            type: 'image',
            originalContentUrl: absoluteFileUrl,
            previewImageUrl: absoluteFileUrl,
          },
        ])
        console.log(`LINE image sent to ${channel.lineChannelId}: ${absoluteFileUrl}`)
      } else {
        // 發送檔案：使用 Flex Message 帶下載連結
        const originalName = file.name || filename
        await lineClient.pushMessage(channel.lineChannelId, [
          {
            type: 'flex',
            altText: `📎 ${originalName}`,
            contents: {
              type: 'bubble',
              size: 'kilo',
              body: {
                type: 'box',
                layout: 'horizontal',
                spacing: 'md',
                contents: [
                  {
                    type: 'text',
                    text: '📎',
                    size: 'xl',
                    flex: 0,
                  },
                  {
                    type: 'text',
                    text: originalName,
                    wrap: true,
                    weight: 'bold',
                    size: 'sm',
                    flex: 1,
                  },
                ],
              },
              footer: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'button',
                    action: {
                      type: 'uri',
                      label: '下載檔案',
                      uri: absoluteFileUrl,
                    },
                    style: 'primary',
                    height: 'sm',
                  },
                ],
              },
            },
          } as unknown as { type: string; [key: string]: unknown },
        ])
        console.log(`LINE file sent to ${channel.lineChannelId}: ${absoluteFileUrl}`)
      }

      // 確保有對應的 LineUser 記錄（代表系統發送）
      await prisma.lineUser.upsert({
        where: { lineUserId: systemUserId },
        update: { displayName: staffDisplayName },
        create: {
          lineUserId: systemUserId,
          displayName: staffDisplayName,
          identityType: 'STAFF',
          staffEmail: session.user.email,
        },
      })

      // 儲存訊息（使用相對路徑，讓瀏覽器自動解析）
      await prisma.lineMessage.create({
        data: {
          lineMessageId: `outgoing-${timestamp}`,
          channelId: channel.id,
          lineUserId: systemUserId,
          messageType: isImage ? 'image' : 'file',
          content: isImage ? null : file.name,
          mediaUrl: `/api/uploads/line/${filename}`,
          timestamp: new Date(),
          processed: true,
        },
      })

      // 更新頻道最後訊息時間
      await prisma.lineChannel.update({
        where: { id: channel.id },
        data: { lastMessageAt: new Date() },
      })

      return NextResponse.json({
        success: true,
        message: isImage ? '圖片已發送' : '檔案已發送',
      })
    }

    // 處理文字訊息
    const body = await request.json()
    const { message, mentionees, quoteToken } = body as {
      message: string
      mentionees?: Array<{ index: number; length: number; lineUserId: string }>
      quoteToken?: string | null
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: '請輸入訊息內容' }, { status: 400 })
    }

    // 組裝 LINE 文字訊息
    let lineTextMessage: Record<string, unknown>

    if (mentionees && mentionees.length > 0) {
      // textV2 格式：用 {key} placeholder 替換 @mention，搭配 substitution map
      // 從後往前替換，避免 index 位移
      const sorted = [...mentionees].sort((a, b) => b.index - a.index)
      let modifiedText = message.trim()
      const substitution: Record<string, unknown> = {}

      sorted.forEach((m, i) => {
        const key = `m${sorted.length - 1 - i}` // m0 = 最前面的 mention
        modifiedText = modifiedText.slice(0, m.index) + `{${key}}` + modifiedText.slice(m.index + m.length)
        substitution[key] = {
          type: 'mention',
          mentionee: { type: 'user', userId: m.lineUserId },
        }
      })

      lineTextMessage = { type: 'textV2', text: modifiedText, substitution, ...(quoteToken ? { quoteToken } : {}) }
    } else {
      lineTextMessage = { type: 'text', text: message.trim(), ...(quoteToken ? { quoteToken } : {}) }
    }

    // 發送文字訊息
    await lineClient.pushMessage(channel.lineChannelId, [lineTextMessage as { type: string; [key: string]: unknown }])

    // 記錄發送的訊息
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { name: true, email: true },
    })

    // 確保有對應的 LineUser 記錄（代表系統發送）
    const systemUserId = `SYSTEM_${session.user.email}`
    await prisma.lineUser.upsert({
      where: { lineUserId: systemUserId },
      update: {},
      create: {
        lineUserId: systemUserId,
        displayName: user?.name || session.user.email || 'System',
        identityType: 'STAFF',
        staffEmail: session.user.email,
      },
    })

    // 儲存訊息到資料庫
    const timestamp = Date.now()
    await prisma.lineMessage.create({
      data: {
        lineMessageId: `outgoing-${timestamp}`,
        channelId: channel.id,
        lineUserId: systemUserId,
        messageType: 'text',
        content: message.trim(),
        mediaUrl: null,
        timestamp: new Date(),
        processed: true,
      },
    })

    // 更新頻道最後訊息時間
    await prisma.lineChannel.update({
      where: { id: channel.id },
      data: { lastMessageAt: new Date() },
    })

    console.log(`LINE message sent to ${channel.lineChannelId} by ${user?.name || user?.email}: ${message.substring(0, 50)}...`)

    return NextResponse.json({
      success: true,
      message: '訊息已發送',
    })
  } catch (error) {
    console.error('Error sending LINE message:', error)
    const errorMessage = error instanceof Error ? error.message : '發送訊息失敗'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
