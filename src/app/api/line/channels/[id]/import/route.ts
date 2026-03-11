import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import {
  parseLineChatExport,
  generateImportedUserId,
  generateImportedMessageId,
} from '@/lib/line-import-parser'

/**
 * POST: 匯入 LINE 聊天記錄到指定頻道
 *
 * Request body:
 * - content: string (txt 檔案內容)
 * - skipDuplicates: boolean (是否跳過重複訊息，預設 true)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id: channelId } = await params
    const body = await request.json()
    const { content, skipDuplicates = true } = body

    if (!content) {
      return NextResponse.json({ error: '請提供聊天記錄內容' }, { status: 400 })
    }

    // 確認頻道存在
    const channel = await prisma.lineChannel.findUnique({
      where: { id: channelId },
    })

    if (!channel) {
      return NextResponse.json({ error: '頻道不存在' }, { status: 404 })
    }

    // 解析聊天記錄
    let parsed
    try {
      // 移除 BOM 和正規化換行
      const normalizedContent = content
        .replace(/^\uFEFF/, '') // 移除 BOM
        .replace(/\r\n/g, '\n') // Windows 換行轉 Unix
        .replace(/\r/g, '\n')   // Mac 舊式換行轉 Unix

      console.log('=== LINE Import Debug ===')
      console.log('Content length:', normalizedContent.length)
      console.log('First 500 chars:', JSON.stringify(normalizedContent.slice(0, 500)))

      // 保存原始內容供分析
      const fs = await import('fs')
      const debugPath = `/tmp/line-import-debug-${Date.now()}.txt`
      fs.writeFileSync(debugPath, content)
      console.log('Saved raw content to:', debugPath)

      parsed = parseLineChatExport(normalizedContent)
      console.log('Parsed messages count:', parsed.messages.length)
      console.log('Group name:', parsed.groupName)
    } catch (e) {
      const error = e as Error
      console.error('Parse error:', error.message)
      return NextResponse.json(
        { error: `解析失敗: ${error.message}` },
        { status: 400 }
      )
    }

    // 統計
    let importedMessages = 0
    let skippedMessages = 0
    let createdUsers = 0
    const errors: string[] = []

    // 收集所有發送者，建立 LineUser 記錄
    const senderNames = [...new Set(parsed.messages.map(m => m.senderName))]
    const userIdMap = new Map<string, string>() // displayName -> lineUserId

    for (const senderName of senderNames) {
      const generatedUserId = generateImportedUserId(senderName, parsed.groupName)
      userIdMap.set(senderName, generatedUserId)

      // 檢查是否已存在
      const existing = await prisma.lineUser.findUnique({
        where: { lineUserId: generatedUserId },
      })

      if (!existing) {
        await prisma.lineUser.create({
          data: {
            lineUserId: generatedUserId,
            displayName: senderName,
            identityType: 'UNKNOWN',
          },
        })
        createdUsers++
      }
    }

    // 如果跳過重複，先取得現有訊息 ID
    const existingMessageIds = new Set<string>()
    if (skipDuplicates) {
      const existingMessages = await prisma.lineMessage.findMany({
        where: {
          channelId,
          lineMessageId: { startsWith: 'imported_' },
        },
        select: { lineMessageId: true },
      })
      existingMessages.forEach(m => existingMessageIds.add(m.lineMessageId))
    }

    // 批次匯入訊息
    const batchSize = 100
    const messagesToCreate = []

    for (let i = 0; i < parsed.messages.length; i++) {
      const msg = parsed.messages[i]
      const lineUserId = userIdMap.get(msg.senderName)!
      const lineMessageId = generateImportedMessageId(
        parsed.groupName,
        msg.senderName,
        msg.timestamp,
        msg.content,
        i
      )

      // 跳過重複
      if (skipDuplicates && existingMessageIds.has(lineMessageId)) {
        skippedMessages++
        continue
      }

      messagesToCreate.push({
        lineMessageId,
        channelId,
        lineUserId,
        messageType: msg.messageType,
        content: msg.content,
        timestamp: msg.timestamp,
        processed: true, // 匯入的訊息標記為已處理
      })
    }

    // 分批寫入
    for (let i = 0; i < messagesToCreate.length; i += batchSize) {
      const batch = messagesToCreate.slice(i, i + batchSize)
      try {
        await prisma.lineMessage.createMany({
          data: batch,
          skipDuplicates: true,
        })
        importedMessages += batch.length
      } catch (e) {
        const error = e as Error
        errors.push(`批次 ${Math.floor(i / batchSize) + 1} 匯入失敗: ${error.message}`)
      }
    }

    // 更新頻道名稱（如果尚未設定）和最後訊息時間
    const updateData: { channelName?: string; lastMessageAt?: Date } = {}

    if (!channel.channelName && parsed.groupName) {
      updateData.channelName = parsed.groupName
    }

    if (parsed.messages.length > 0) {
      const lastMsgTime = parsed.messages[parsed.messages.length - 1].timestamp
      if (!channel.lastMessageAt || lastMsgTime > channel.lastMessageAt) {
        updateData.lastMessageAt = lastMsgTime
      }
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.lineChannel.update({
        where: { id: channelId },
        data: updateData,
      })
    }

    return NextResponse.json({
      success: true,
      summary: {
        groupName: parsed.groupName,
        totalMessages: parsed.messages.length,
        importedMessages,
        skippedMessages,
        createdUsers,
        errors: errors.length > 0 ? errors : undefined,
      },
    })
  } catch (error) {
    console.error('Error importing LINE chat history:', error)
    return NextResponse.json({ error: '匯入失敗' }, { status: 500 })
  }
}
