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

      // 驗證檔案類型
      if (!file.type.startsWith('image/')) {
        return NextResponse.json({ error: '只支援圖片檔案' }, { status: 400 })
      }

      // 儲存圖片到 public 目錄
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)

      const timestamp = Date.now()
      const ext = file.name.split('.').pop() || 'jpg'
      const filename = `line-${timestamp}.${ext}`
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'line')
      const filePath = path.join(uploadDir, filename)

      // 確保目錄存在
      await mkdir(uploadDir, { recursive: true })
      await writeFile(filePath, buffer)

      // 建立圖片 URL
      // LINE API 需要完整的公開 URL，瀏覽器顯示則用相對路徑
      const host = request.headers.get('host') || 'localhost:3000'
      const protocol = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'http')
      const absoluteImageUrl = `${protocol}://${host}/api/uploads/line/${filename}`

      // 發送圖片訊息（LINE API 需要絕對 URL）
      await lineClient.pushMessage(channel.lineChannelId, [
        {
          type: 'image',
          originalContentUrl: absoluteImageUrl,
          previewImageUrl: absoluteImageUrl,
        },
      ])

      // 儲存發送的圖片訊息到資料庫
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

      // 儲存訊息（使用相對路徑，讓瀏覽器自動解析）
      await prisma.lineMessage.create({
        data: {
          lineMessageId: `outgoing-${timestamp}`,
          channelId: channel.id,
          lineUserId: systemUserId,
          messageType: 'image',
          content: null,
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

      console.log(`LINE image sent to ${channel.lineChannelId}: ${absoluteImageUrl}`)

      return NextResponse.json({
        success: true,
        message: '圖片已發送',
      })
    }

    // 處理文字訊息
    const body = await request.json()
    const { message } = body

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: '請輸入訊息內容' }, { status: 400 })
    }

    // 發送文字訊息
    await lineClient.pushMessage(channel.lineChannelId, [
      { type: 'text', text: message.trim() },
    ])

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
