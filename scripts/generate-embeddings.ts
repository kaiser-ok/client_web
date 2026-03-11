/**
 * 批量生成 Embedding
 */

import { prisma } from '../src/lib/prisma'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const BATCH_SIZE = 20

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000),
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`)
  }

  const result = await response.json()
  return result.data[0].embedding
}

async function main() {
  console.log('=== 批量生成 Embedding ===\n')

  // 查詢沒有 embedding 的分塊
  const chunks = await prisma.$queryRaw<Array<{ id: string; content: string }>>`
    SELECT id, content FROM document_chunks WHERE embedding IS NULL
  `

  console.log(`找到 ${chunks.length} 個分塊需要生成 Embedding\n`)

  let processed = 0
  let failed = 0

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE)
    console.log(`處理批次 ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)} (${batch.length} 個)`)

    for (const chunk of batch) {
      try {
        const embedding = await generateEmbedding(chunk.content)
        const embeddingStr = `[${embedding.join(',')}]`

        await prisma.$executeRawUnsafe(`
          UPDATE document_chunks
          SET embedding = '${embeddingStr}'::vector
          WHERE id = '${chunk.id}'
        `)

        processed++
      } catch (error) {
        console.error(`  - 失敗 (${chunk.id}):`, error)
        failed++
      }
    }

    // 避免 rate limit
    if (i + BATCH_SIZE < chunks.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  console.log(`\n完成！成功: ${processed}, 失敗: ${failed}`)

  // 驗證
  const result = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM document_chunks WHERE embedding IS NOT NULL
  `
  console.log(`資料庫中有 Embedding 的分塊: ${result[0].count}`)

  await prisma.$disconnect()
}

main().catch(console.error)
