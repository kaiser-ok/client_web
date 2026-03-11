/**
 * RAG 對話 API
 * 結合向量搜尋和 LLM 生成回答
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { searchSimilar, searchBasic } from '@/lib/embedding'
import { chatWithDify, checkDifyHealth } from '@/lib/dify'
import { chatCompletion } from '@/lib/llm'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const {
      query,
      partnerId,
      sourceType,
      useDify = false,
      conversationId,
      limit = 5,
    } = body

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: '缺少查詢內容' }, { status: 400 })
    }

    // 1. 檢索相關內容
    let sources: Array<{
      id: string
      sourceType: string
      sourceId: string
      content: string
      similarity: number
    }> = []

    try {
      // 嘗試使用 pgvector 搜尋
      sources = await searchSimilar(query, {
        limit,
        sourceType,
        partnerId,
        minSimilarity: 0.6,
      })
    } catch {
      // 回退到基本搜尋
      sources = await searchBasic(query, {
        limit,
        sourceType,
        partnerId,
      })
    }

    // 2. 檢查是否有找到相關資料
    if (sources.length === 0) {
      return NextResponse.json({
        answer: '抱歉，在系統資料庫中找不到與您問題相關的資料。請嘗試：\n1. 使用不同的關鍵字搜尋\n2. 確認資料是否已同步到系統\n3. 選擇特定的客戶或資料來源篩選',
        sources: [],
        metadata: { noDataFound: true },
      })
    }

    // 3. 組合上下文
    const context = sources
      .map((s, i) => `[來源 ${i + 1} - ${s.sourceType}]\n${s.content}`)
      .join('\n\n---\n\n')

    let answer: string
    let metadata: Record<string, unknown> = {}

    // 4. 生成回答
    if (useDify) {
      // 使用 Dify
      const difyAvailable = await checkDifyHealth()
      if (difyAvailable) {
        const response = await chatWithDify({
          query: `請嚴格根據以下資料回答問題，不要使用資料以外的知識：\n\n${context}\n\n問題：${query}`,
          conversationId,
          user: session.user?.email || 'anonymous',
        })
        answer = response.answer
        metadata = {
          conversationId: response.conversation_id,
          messageId: response.message_id,
          usage: response.metadata.usage,
        }
      } else {
        // Dify 不可用，回退到直接 LLM
        answer = await generateAnswer(query, context)
      }
    } else {
      // 直接使用 LLM
      answer = await generateAnswer(query, context)
    }

    return NextResponse.json({
      answer,
      sources: sources.map(s => ({
        id: s.id,
        sourceType: s.sourceType,
        sourceId: s.sourceId,
        preview: s.content.slice(0, 200) + (s.content.length > 200 ? '...' : ''),
        similarity: s.similarity,
      })),
      metadata,
    })
  } catch (error) {
    console.error('RAG chat error:', error)
    return NextResponse.json(
      { error: '處理請求時發生錯誤' },
      { status: 500 }
    )
  }
}

/**
 * 使用 LLM 生成回答（僅根據提供的資料）
 */
async function generateAnswer(query: string, context: string): Promise<string> {
  const systemPrompt = `你是一個專業的客戶服務助理。你的任務是**嚴格根據提供的參考資料**來回答問題。

重要規則：
1. **只能使用參考資料中的資訊**來回答問題，不得使用你自己的知識或推測
2. 如果參考資料中沒有足夠的資訊來回答問題，請明確說明「根據現有資料無法回答此問題」
3. 回答時請引用資料來源（例如：「根據來源1...」）
4. 保持專業、簡潔、準確
5. 不要編造或推測任何資料中沒有的內容

參考資料：
${context}`

  try {
    const response = await chatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      { maxTokens: 1000, temperature: 0.2 }
    )
    return response
  } catch (error) {
    console.error('LLM error:', error)
    throw new Error('生成回答時發生錯誤')
  }
}
