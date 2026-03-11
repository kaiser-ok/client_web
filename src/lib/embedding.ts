/**
 * Embedding 服務
 * 用於生成文本向量和相似度搜尋
 */

import { prisma } from './prisma'

// Embedding 模型配置
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536 // OpenAI text-embedding-3-small 維度
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'

export interface EmbeddingResult {
  embedding: number[]
  model: string
  usage: {
    prompt_tokens: number
    total_tokens: number
  }
}

export interface SearchResult {
  id: string
  sourceType: string
  sourceId: string
  partnerId: string | null
  content: string
  metadata: Record<string, unknown> | null
  similarity: number
}

/**
 * 生成文本的 Embedding 向量
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  // 清理文本
  const cleanedText = text.trim().replace(/\n+/g, ' ').slice(0, 8000)

  if (!cleanedText) {
    throw new Error('Empty text cannot be embedded')
  }

  const response = await fetch(`${OPENAI_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: cleanedText,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`Embedding API error: ${response.status} - ${JSON.stringify(error)}`)
  }

  const result = await response.json()
  return result.data[0].embedding
}

/**
 * 批量生成 Embedding
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const cleanedTexts = texts.map(t => t.trim().replace(/\n+/g, ' ').slice(0, 8000))

  const response = await fetch(`${OPENAI_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: cleanedTexts,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`Embedding API error: ${response.status} - ${JSON.stringify(error)}`)
  }

  const result = await response.json()
  return result.data.map((d: { embedding: number[] }) => d.embedding)
}

/**
 * 使用 pgvector 進行相似度搜尋
 * 需要先安裝 pgvector 擴展並添加 embedding 欄位
 */
export async function searchSimilar(
  query: string,
  options: {
    limit?: number
    sourceType?: string
    partnerId?: string
    minSimilarity?: number
  } = {}
): Promise<SearchResult[]> {
  const { limit = 5, sourceType, partnerId, minSimilarity = 0.7 } = options

  // 生成查詢向量
  const queryEmbedding = await generateEmbedding(query)
  const embeddingStr = `[${queryEmbedding.join(',')}]`

  // 構建 WHERE 條件
  const conditions: string[] = ['embedding IS NOT NULL']
  const params: unknown[] = []
  let paramIndex = 1

  if (sourceType) {
    conditions.push(`source_type = $${paramIndex}`)
    params.push(sourceType)
    paramIndex++
  }

  if (partnerId) {
    conditions.push(`partner_id = $${paramIndex}`)
    params.push(partnerId)
    paramIndex++
  }

  const whereClause = conditions.join(' AND ')

  // 執行相似度搜尋
  // 注意：需要 pgvector 擴展
  try {
    const results = await prisma.$queryRawUnsafe<SearchResult[]>(`
      SELECT
        id,
        source_type as "sourceType",
        source_id as "sourceId",
        partner_id as "partnerId",
        content,
        metadata,
        1 - (embedding <=> '${embeddingStr}'::vector) as similarity
      FROM document_chunks
      WHERE ${whereClause}
        AND 1 - (embedding <=> '${embeddingStr}'::vector) >= ${minSimilarity}
      ORDER BY embedding <=> '${embeddingStr}'::vector
      LIMIT ${limit}
    `, ...params)

    return results
  } catch (error) {
    // 如果 pgvector 未安裝，回退到基本搜尋
    console.error('pgvector search failed, falling back to basic search:', error)
    return searchBasic(query, options)
  }
}

/**
 * 基本文本搜尋（pgvector 未安裝時的回退方案）
 */
export async function searchBasic(
  query: string,
  options: {
    limit?: number
    sourceType?: string
    partnerId?: string
  } = {}
): Promise<SearchResult[]> {
  const { limit = 5, sourceType, partnerId } = options

  const where: Record<string, unknown> = {}

  if (sourceType) {
    where.sourceType = sourceType
  }

  if (partnerId) {
    where.partnerId = partnerId
  }

  // 使用 PostgreSQL 的全文搜尋
  const results = await prisma.documentChunk.findMany({
    where: {
      ...where,
      content: {
        contains: query,
        mode: 'insensitive',
      },
    },
    take: limit,
    orderBy: {
      createdAt: 'desc',
    },
  })

  return results.map(r => ({
    id: r.id,
    sourceType: r.sourceType,
    sourceId: r.sourceId,
    partnerId: r.partnerId,
    content: r.content,
    metadata: r.metadata as Record<string, unknown> | null,
    similarity: 0.5, // 基本搜尋無法計算真實相似度
  }))
}

/**
 * 儲存文檔分塊並生成 Embedding
 */
export async function saveDocumentChunk(data: {
  sourceType: string
  sourceId: string
  partnerId?: string
  content: string
  metadata?: Record<string, unknown>
}): Promise<string> {
  // 創建文檔分塊
  const chunk = await prisma.documentChunk.create({
    data: {
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      partnerId: data.partnerId,
      content: data.content,
      metadata: data.metadata ? JSON.parse(JSON.stringify(data.metadata)) : undefined,
    },
  })

  // 嘗試生成並儲存 Embedding（如果 pgvector 已安裝）
  try {
    if (OPENAI_API_KEY) {
      const embedding = await generateEmbedding(data.content)
      const embeddingStr = `[${embedding.join(',')}]`

      await prisma.$executeRawUnsafe(`
        UPDATE document_chunks
        SET embedding = '${embeddingStr}'::vector
        WHERE id = '${chunk.id}'
      `)
    }
  } catch (error) {
    // pgvector 未安裝或其他錯誤，忽略
    console.warn('Failed to save embedding (pgvector may not be installed):', error)
  }

  return chunk.id
}

/**
 * 批量儲存文檔分塊
 */
export async function saveDocumentChunks(chunks: Array<{
  sourceType: string
  sourceId: string
  partnerId?: string
  content: string
  metadata?: Record<string, unknown>
}>): Promise<number> {
  // 批量創建
  const result = await prisma.documentChunk.createMany({
    data: chunks.map(chunk => ({
      sourceType: chunk.sourceType,
      sourceId: chunk.sourceId,
      partnerId: chunk.partnerId,
      content: chunk.content,
      metadata: chunk.metadata ? JSON.parse(JSON.stringify(chunk.metadata)) : undefined,
    })),
  })

  // 嘗試批量生成 Embedding
  // 注意：這是異步的，不等待完成
  if (OPENAI_API_KEY) {
    generateEmbeddingsForNewChunks().catch(console.error)
  }

  return result.count
}

/**
 * 為沒有 Embedding 的分塊生成 Embedding
 */
export async function generateEmbeddingsForNewChunks(): Promise<number> {
  try {
    // 查詢沒有 embedding 的分塊（使用原生 SQL 檢查 embedding 欄位）
    const chunks = await prisma.$queryRaw<Array<{ id: string; content: string }>>`
      SELECT id, content
      FROM document_chunks
      WHERE embedding IS NULL
      LIMIT 100
    `

    if (chunks.length === 0) {
      return 0
    }

    // 批量生成 Embedding
    const embeddings = await generateEmbeddings(chunks.map(c => c.content))

    // 批量更新
    for (let i = 0; i < chunks.length; i++) {
      const embeddingStr = `[${embeddings[i].join(',')}]`
      await prisma.$executeRawUnsafe(`
        UPDATE document_chunks
        SET embedding = '${embeddingStr}'::vector
        WHERE id = '${chunks[i].id}'
      `)
    }

    return chunks.length
  } catch (error) {
    console.error('Failed to generate embeddings:', error)
    return 0
  }
}

/**
 * 將 LINE 訊息同步到 DocumentChunk
 */
export async function syncLineMessagesToChunks(
  channelId: string,
  partnerId?: string
): Promise<number> {
  // 查詢該頻道的文字訊息
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

  // 查詢發送者資訊
  const userIds = [...new Set(messages.map(m => m.lineUserId))]
  const users = await prisma.lineUser.findMany({
    where: { lineUserId: { in: userIds } },
  })
  const userMap = new Map(users.map(u => [u.lineUserId, u.displayName]))

  // 將訊息分組（每 20 條為一個分塊）
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
      sourceId: `${channelId}-${i}`,
      partnerId,
      content,
      metadata: {
        channelId,
        startTime: batch[0].timestamp.toISOString(),
        endTime: batch[batch.length - 1].timestamp.toISOString(),
        messageCount: batch.length,
      },
    })
  }

  return saveDocumentChunks(chunks)
}
