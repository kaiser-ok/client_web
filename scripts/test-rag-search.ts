/**
 * 測試 RAG 向量搜尋
 */

import { prisma } from '../src/lib/prisma'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  })

  const result = await response.json()
  return result.data[0].embedding
}

async function searchSimilar(query: string, limit = 5) {
  console.log(`\n搜尋: "${query}"\n`)

  const queryEmbedding = await generateEmbedding(query)
  const embeddingStr = `[${queryEmbedding.join(',')}]`

  const results = await prisma.$queryRawUnsafe<Array<{
    id: string
    sourceType: string
    content: string
    metadata: string
    similarity: number
  }>>(`
    SELECT
      id,
      "sourceType",
      SUBSTRING(content, 1, 300) as content,
      metadata::text,
      1 - (embedding <=> '${embeddingStr}'::vector) as similarity
    FROM document_chunks
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> '${embeddingStr}'::vector
    LIMIT ${limit}
  `)

  console.log(`找到 ${results.length} 個相關結果:\n`)

  results.forEach((r, i) => {
    console.log(`--- 結果 ${i + 1} (相似度: ${(r.similarity * 100).toFixed(1)}%) ---`)
    console.log(`來源: ${r.sourceType}`)
    console.log(`內容預覽: ${r.content}...`)
    console.log()
  })

  return results
}

async function main() {
  console.log('=== RAG 向量搜尋測試 ===')

  // 測試幾個查詢
  await searchSimilar('設備測試問題')
  await searchSimilar('報價')
  await searchSimilar('網路連線異常')

  await prisma.$disconnect()
}

main().catch(console.error)
