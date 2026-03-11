/**
 * RAG 同步 API
 * 同步 LINE 訊息、活動等資料到向量資料庫
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { saveDocumentChunks, generateEmbeddingsForNewChunks } from '@/lib/embedding'
import { fetchSystemMailboxEmails, findCustomerByEmail } from '@/lib/gmail'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    // Support both partnerId and customerId for backward compatibility
    const { type, channelId, partnerId, customerId, forceRefresh = false } = body
    const resolvedPartnerId = partnerId || customerId

    let syncedCount = 0

    let rematchedCount = 0

    switch (type) {
      case 'line':
        syncedCount = await syncLineMessages(channelId, resolvedPartnerId, forceRefresh)
        break

      case 'activities':
        syncedCount = await syncActivities(resolvedPartnerId, forceRefresh)
        break

      case 'gmail':
        syncedCount = await syncGmailEmails(forceRefresh)
        // Gmail 同步時也重新比對未分類信件
        rematchedCount = await rematchUncategorizedEmails()
        break

      case 'rematch':
        // 只執行重新比對未分類信件
        rematchedCount = await rematchUncategorizedEmails()
        break

      case 'all':
        // 同步所有類型
        const lineCount = await syncAllLineChannels(forceRefresh)
        const activityCount = await syncAllActivities(forceRefresh)
        const gmailCount = await syncGmailEmails(forceRefresh)
        rematchedCount = await rematchUncategorizedEmails()
        syncedCount = lineCount + activityCount + gmailCount
        break

      default:
        return NextResponse.json({ error: '不支援的同步類型' }, { status: 400 })
    }

    // 嘗試生成 Embedding（如果 pgvector 已安裝）
    let embeddingCount = 0
    try {
      embeddingCount = await generateEmbeddingsForNewChunks()
    } catch (error) {
      console.warn('Failed to generate embeddings:', error)
    }

    return NextResponse.json({
      success: true,
      syncedChunks: syncedCount,
      embeddingsGenerated: embeddingCount,
      rematchedEmails: rematchedCount,
    })
  } catch (error) {
    console.error('RAG sync error:', error)
    return NextResponse.json(
      { error: '同步時發生錯誤' },
      { status: 500 }
    )
  }
}

/**
 * 同步 LINE 訊息
 */
async function syncLineMessages(
  channelId: string,
  partnerId?: string,
  forceRefresh = false
): Promise<number> {
  // 如果強制刷新，先刪除舊的分塊
  if (forceRefresh) {
    await prisma.documentChunk.deleteMany({
      where: {
        sourceType: 'LINE',
        sourceId: { startsWith: channelId },
      },
    })
  }

  // 查詢訊息
  const messages = await prisma.lineMessage.findMany({
    where: {
      channelId,
      messageType: 'text',
      content: { not: null },
    },
    orderBy: { timestamp: 'asc' },
  })

  if (messages.length === 0) {
    return 0
  }

  // 查詢發送者
  const userIds = [...new Set(messages.map(m => m.lineUserId))]
  const users = await prisma.lineUser.findMany({
    where: { lineUserId: { in: userIds } },
  })
  const userMap = new Map(users.map(u => [u.lineUserId, u.displayName]))

  // 分塊（每 20 條訊息為一個分塊）
  const chunkSize = 20
  const chunks: Array<{
    sourceType: string
    sourceId: string
    partnerId?: string
    content: string
    metadata: Record<string, unknown>
  }> = []

  for (let i = 0; i < messages.length; i += chunkSize) {
    const batch = messages.slice(i, i + chunkSize)
    const content = batch
      .map(m => {
        const sender = userMap.get(m.lineUserId) || 'Unknown'
        const time = m.timestamp.toISOString().slice(0, 16).replace('T', ' ')
        return `[${time}] ${sender}: ${m.content}`
      })
      .join('\n')

    chunks.push({
      sourceType: 'LINE',
      sourceId: `${channelId}-chunk-${Math.floor(i / chunkSize)}`,
      partnerId,
      content,
      metadata: {
        channelId,
        chunkIndex: Math.floor(i / chunkSize),
        startTime: batch[0].timestamp.toISOString(),
        endTime: batch[batch.length - 1].timestamp.toISOString(),
        messageCount: batch.length,
      },
    })
  }

  return saveDocumentChunks(chunks)
}

/**
 * 同步活動記錄
 */
async function syncActivities(
  partnerId: string,
  forceRefresh = false
): Promise<number> {
  if (forceRefresh) {
    await prisma.documentChunk.deleteMany({
      where: {
        sourceType: 'ACTIVITY',
        partnerId,
      },
    })
  }

  const activities = await prisma.activity.findMany({
    where: { partnerId },
    orderBy: { createdAt: 'desc' },
    include: {
      partner: { select: { name: true } },
    },
  })

  if (activities.length === 0) {
    return 0
  }

  const chunks = activities
    .filter(a => a.title || a.content)
    .map(a => ({
      sourceType: 'ACTIVITY',
      sourceId: a.id,
      partnerId,
      content: [
        `客戶: ${a.partner.name}`,
        `日期: ${a.createdAt.toISOString().slice(0, 10)}`,
        `來源: ${a.source}`,
        `標題: ${a.title}`,
        a.content ? `內容: ${a.content}` : null,
        a.tags.length > 0 ? `標籤: ${a.tags.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      metadata: {
        source: a.source,
        createdAt: a.createdAt.toISOString(),
        eventDate: a.eventDate?.toISOString(),
        tags: a.tags,
      },
    }))

  return saveDocumentChunks(chunks)
}

/**
 * 同步所有 LINE 頻道
 */
async function syncAllLineChannels(forceRefresh = false): Promise<number> {
  const channels = await prisma.lineChannel.findMany({
    where: { isActive: true },
    select: { id: true, partnerId: true },
  })

  let total = 0
  for (const channel of channels) {
    total += await syncLineMessages(
      channel.id,
      channel.partnerId || undefined,
      forceRefresh
    )
  }

  return total
}

/**
 * 同步所有客戶的活動
 */
async function syncAllActivities(forceRefresh = false): Promise<number> {
  const partners = await prisma.partner.findMany({
    select: { id: true },
  })

  let total = 0
  for (const partner of partners) {
    total += await syncActivities(partner.id, forceRefresh)
  }

  return total
}

/**
 * 重新比對未分類的 Email（每天執行）
 */
async function rematchUncategorizedEmails(): Promise<number> {
  // 取得內部網域設定
  let internalDomains: string[] = []
  try {
    const configRecord = await prisma.systemConfig.findUnique({
      where: { key: 'gmail_config' },
    })
    if (configRecord) {
      const config = JSON.parse(configRecord.value)
      internalDomains = config.syncSettings?.internalDomains || []
    }
  } catch {
    // 忽略錯誤
  }

  // 找出所有未分類的 Email chunks
  const uncategorizedChunks = await prisma.documentChunk.findMany({
    where: {
      sourceType: 'EMAIL',
      partnerId: null,
    },
  })

  if (uncategorizedChunks.length === 0) {
    return 0
  }

  let matchedCount = 0

  for (const chunk of uncategorizedChunks) {
    const metadata = chunk.metadata as Record<string, unknown> | null
    if (!metadata) continue

    // 從 metadata 取得 email 地址
    const allEmails: string[] = []
    if (metadata.fromEmail) allEmails.push(metadata.fromEmail as string)
    if (Array.isArray(metadata.toEmails)) allEmails.push(...(metadata.toEmails as string[]))

    if (allEmails.length === 0) continue

    // 嘗試比對客戶
    const matchedPartner = await findCustomerByEmail(allEmails, internalDomains)

    if (matchedPartner) {
      // 更新 chunk
      const updatedContent = chunk.content.replace(
        '客戶: 未分類',
        `客戶: ${matchedPartner.name}`
      )

      await prisma.documentChunk.update({
        where: { id: chunk.id },
        data: {
          partnerId: matchedPartner.id,
          content: updatedContent,
          metadata: {
            ...metadata,
            isUncategorized: false,
            partnerName: matchedPartner.name,
            rematchedAt: new Date().toISOString(),
          },
        },
      })

      matchedCount++
    }
  }

  return matchedCount
}

/**
 * 同步 Gmail 信件到 RAG
 */
async function syncGmailEmails(forceRefresh = false): Promise<number> {
  // 如果強制刷新，先刪除舊的分塊
  if (forceRefresh) {
    await prisma.documentChunk.deleteMany({
      where: {
        sourceType: 'EMAIL',
      },
    })
  }

  // 取得 Gmail 設定中的內部網域（用於排除）
  let internalDomains: string[] = []
  try {
    const configRecord = await prisma.systemConfig.findUnique({
      where: { key: 'gmail_config' },
    })
    if (configRecord) {
      const config = JSON.parse(configRecord.value)
      internalDomains = config.syncSettings?.internalDomains || []
    }
  } catch {
    // 忽略錯誤
  }

  // 取得信件
  let emails
  try {
    emails = await fetchSystemMailboxEmails({
      maxCount: 100,
    })
  } catch (error) {
    console.error('Failed to fetch Gmail emails:', error)
    return 0
  }

  if (!emails || emails.length === 0) {
    return 0
  }

  // 建立分塊
  const chunks: Array<{
    sourceType: string
    sourceId: string
    partnerId?: string
    content: string
    metadata: Record<string, unknown>
  }> = []

  for (const email of emails) {
    // 檢查是否已存在
    const existingChunk = await prisma.documentChunk.findFirst({
      where: {
        sourceType: 'EMAIL',
        sourceId: email.messageId,
      },
    })

    if (existingChunk && !forceRefresh) {
      continue
    }

    // 嘗試比對客戶
    const allEmails = [
      email.fromEmail,
      ...email.toEmails,
      ...email.ccEmails,
    ].filter(Boolean)

    const matchedPartner = await findCustomerByEmail(allEmails, internalDomains)

    // 組合信件內容
    const content = [
      `主旨: ${email.subject}`,
      `寄件者: ${email.from} <${email.fromEmail}>`,
      `收件者: ${email.to}`,
      email.cc ? `副本: ${email.cc}` : null,
      `日期: ${email.date.toISOString().slice(0, 16).replace('T', ' ')}`,
      `方向: ${email.isIncoming ? '收到' : '寄出'}`,
      matchedPartner ? `客戶: ${matchedPartner.name}` : '客戶: 未分類',
      '',
      '內容:',
      email.body.slice(0, 3000), // 限制內容長度
    ]
      .filter(line => line !== null)
      .join('\n')

    chunks.push({
      sourceType: 'EMAIL',
      sourceId: email.messageId,
      partnerId: matchedPartner?.id || undefined,
      content,
      metadata: {
        subject: email.subject,
        from: email.from,
        fromEmail: email.fromEmail,
        to: email.to,
        toEmails: email.toEmails,
        date: email.date.toISOString(),
        isIncoming: email.isIncoming,
        isUncategorized: !matchedPartner,
        partnerName: matchedPartner?.name || '未分類',
        hasAttachments: email.attachments.length > 0,
        attachmentCount: email.attachments.length,
      },
    })
  }

  if (chunks.length === 0) {
    return 0
  }

  return saveDocumentChunks(chunks)
}

// GET 請求：獲取同步狀態
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // 統計各類型的分塊數量
    const stats = await prisma.documentChunk.groupBy({
      by: ['sourceType'],
      _count: { id: true },
    })

    const statsMap = Object.fromEntries(
      stats.map(s => [s.sourceType, s._count.id])
    )

    // 統計有 embedding 的分塊數量（需要原生 SQL）
    let withEmbedding = 0
    try {
      const result = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM document_chunks WHERE embedding IS NOT NULL
      `
      withEmbedding = Number(result[0].count)
    } catch {
      // pgvector 未安裝
    }

    const total = Object.values(statsMap).reduce((a, b) => a + b, 0)

    return NextResponse.json({
      total,
      withEmbedding,
      byType: statsMap,
    })
  } catch (error) {
    console.error('RAG sync status error:', error)
    return NextResponse.json(
      { error: '獲取狀態時發生錯誤' },
      { status: 500 }
    )
  }
}
