/**
 * 測試 RAG 同步功能
 */

import { prisma } from '../src/lib/prisma'
import { saveDocumentChunks, generateEmbedding } from '../src/lib/embedding'

async function main() {
  console.log('=== RAG 同步測試 ===\n')

  // 1. 查詢 LINE 頻道（按訊息數量排序）
  const channels = await prisma.lineChannel.findMany({
    where: {
      isActive: true,
      messages: { some: { messageType: 'text' } },
    },
    include: {
      _count: { select: { messages: true } },
    },
  })

  // 按訊息數量排序，取前 10 個
  channels.sort((a, b) => b._count.messages - a._count.messages)
  const topChannels = channels.slice(0, 10)

  console.log(`找到 ${channels.length} 個有文字訊息的頻道，同步前 ${topChannels.length} 個\n`)

  let totalChunks = 0

  for (const channel of topChannels) {
    console.log(`處理頻道: ${channel.channelName} (${channel._count.messages} 訊息)`)

    // 查詢訊息
    const messages = await prisma.lineMessage.findMany({
      where: {
        channelId: channel.id,
        messageType: 'text',
        content: { not: null },
      },
      orderBy: { timestamp: 'asc' },
    })

    if (messages.length === 0) {
      console.log('  - 無文字訊息，跳過\n')
      continue
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
      customerId?: string
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
        sourceId: `${channel.id}-chunk-${Math.floor(i / chunkSize)}`,
        customerId: channel.customerId || undefined,
        content,
        metadata: {
          channelId: channel.id,
          channelName: channel.channelName,
          chunkIndex: Math.floor(i / chunkSize),
          startTime: batch[0].timestamp.toISOString(),
          endTime: batch[batch.length - 1].timestamp.toISOString(),
          messageCount: batch.length,
        },
      })
    }

    // 刪除舊的分塊
    await prisma.documentChunk.deleteMany({
      where: {
        sourceType: 'LINE',
        sourceId: { startsWith: channel.id },
      },
    })

    // 儲存新分塊
    const count = await saveDocumentChunks(chunks)
    totalChunks += count
    console.log(`  - 建立 ${count} 個分塊\n`)
  }

  console.log(`\n總共建立 ${totalChunks} 個分塊`)

  // 2. 檢查 document_chunks 表
  const chunkStats = await prisma.documentChunk.groupBy({
    by: ['sourceType'],
    _count: { id: true },
  })
  console.log('\n分塊統計:')
  chunkStats.forEach(s => console.log(`  - ${s.sourceType}: ${s._count.id}`))

  // 3. 測試生成 Embedding
  console.log('\n測試 Embedding 生成...')
  try {
    const testChunk = await prisma.documentChunk.findFirst({
      where: { sourceType: 'LINE' },
    })

    if (testChunk) {
      const embedding = await generateEmbedding(testChunk.content.slice(0, 500))
      console.log(`  - Embedding 維度: ${embedding.length}`)

      // 更新到資料庫
      const embeddingStr = `[${embedding.join(',')}]`
      await prisma.$executeRawUnsafe(`
        UPDATE document_chunks
        SET embedding = '${embeddingStr}'::vector
        WHERE id = '${testChunk.id}'
      `)
      console.log(`  - 已儲存 Embedding 到資料庫`)
    }
  } catch (error) {
    console.error('  - Embedding 生成失敗:', error)
  }

  // 4. 檢查有 embedding 的分塊數量
  try {
    const result = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM document_chunks WHERE embedding IS NOT NULL
    `
    console.log(`\n有 Embedding 的分塊: ${result[0].count}`)
  } catch (error) {
    console.error('查詢失敗:', error)
  }

  await prisma.$disconnect()
}

main().catch(console.error)
