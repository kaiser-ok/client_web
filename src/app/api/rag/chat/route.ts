/**
 * RAG 對話 API
 * 結合向量搜尋、結構化技能和 LLM 生成回答
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { searchSimilar, searchBasic } from '@/lib/embedding'
import { chatWithDify, checkDifyHealth } from '@/lib/dify'
import { chatCompletion } from '@/lib/llm'
import { classifyIntent, executeSkill } from '@/lib/chat-skills'

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

    // Step 1: 意圖分類 — 判斷使用 skill 還是 RAG
    const intent = await classifyIntent(query, partnerId)

    // Step 2: 如果匹配到 skill，執行結構化查詢
    if (intent.skill) {
      const skillResult = await executeSkill(intent.skill, intent.params)

      if (skillResult) {
        // 用 LLM 把結構化資料轉為自然語言回答
        const answer = await generateSkillAnswer(query, skillResult.summary)

        return NextResponse.json({
          answer,
          sources: [],
          metadata: {
            skill: skillResult.skill,
            intent: intent.reasoning,
          },
        })
      }
    }

    // Step 3: RAG 向量搜尋流程
    let sources: Array<{
      id: string
      sourceType: string
      sourceId: string
      content: string
      similarity: number
    }> = []

    try {
      sources = await searchSimilar(query, {
        limit,
        sourceType,
        partnerId,
        minSimilarity: 0.6,
      })
    } catch {
      sources = await searchBasic(query, {
        limit,
        sourceType,
        partnerId,
      })
    }

    if (sources.length === 0) {
      return NextResponse.json({
        answer: '抱歉，在系統資料庫中找不到與您問題相關的資料。請嘗試：\n1. 使用不同的關鍵字搜尋\n2. 確認資料是否已同步到系統\n3. 選擇特定的客戶或資料來源篩選',
        sources: [],
        metadata: { noDataFound: true },
      })
    }

    // 組合上下文
    const context = sources
      .map((s, i) => `[來源 ${i + 1} - ${s.sourceType}]\n${s.content}`)
      .join('\n\n---\n\n')

    let answer: string
    let metadata: Record<string, unknown> = {}

    if (useDify) {
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
        answer = await generateAnswer(query, context)
      }
    } else {
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
 * 使用 LLM 生成回答（僅根據提供的資料 - RAG 模式）
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

/**
 * 使用 LLM 根據 skill 查詢結果生成自然語言回答
 */
async function generateSkillAnswer(query: string, skillData: string): Promise<string> {
  const systemPrompt = `你是一個專業的客戶服務助理。根據系統查詢到的資料，用清楚易讀的方式回答用戶的問題。

重要規則：
1. 根據查詢結果如實回答，不要編造資料
2. 表格一律使用「橫式」（欄位為標題列，資料往下排）
3. 如果資料量大，先給出總結再列出細節
4. 金額請使用千分位格式
5. 日期使用 YYYY-MM-DD 格式
6. 回答要簡潔專業，直接呈現資料
7. 不要加「如需進一步協助」、「祝您有美好的一天」等結尾客套語

查詢結果：
${skillData}`

  try {
    const response = await chatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      { maxTokens: 2000, temperature: 0.3 }
    )
    return response
  } catch (error) {
    console.error('Skill answer LLM error:', error)
    // 如果 LLM 失敗，直接返回原始資料
    return skillData
  }
}
