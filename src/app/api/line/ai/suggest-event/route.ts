import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { chatCompletion } from '@/lib/llm'
import prisma from '@/lib/prisma'

/**
 * POST /api/line/ai/suggest-event
 * 根據選取的訊息，AI 建議事件標題（3個版本）與負責人
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未授權' }, { status: 401 })

    const { messages, channelId } = await request.json() as {
      messages: Array<{ displayName: string; content: string | null; messageType: string; identityType: string; lineUserId: string }>
      channelId: string
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: '請提供訊息' }, { status: 400 })
    }

    // 取得頻道資訊
    const channel = await prisma.lineChannel.findUnique({
      where: { id: channelId },
      select: { channelName: true, partnerId: true },
    })

    // 找出對話中出現的員工 lineUserId
    const staffUserIds = messages
      .filter(m => m.identityType === 'STAFF' && m.lineUserId.startsWith('SYSTEM_'))
      .map(m => m.lineUserId.replace('SYSTEM_', ''))

    // 從 staffUserIds 取得 DB user 資料
    let suggestedAssignee: { id: string; name: string | null; email: string } | null = null
    if (staffUserIds.length > 0) {
      const staffEmail = staffUserIds[0]
      const dbUser = await prisma.user.findUnique({
        where: { email: staffEmail },
        select: { id: true, name: true, email: true },
      })
      if (dbUser) suggestedAssignee = dbUser
    }

    // 組合訊息文字
    const msgText = messages
      .map(m => {
        const role = m.identityType === 'STAFF' ? '[員工]' : '[客戶]'
        return `${role}${m.displayName}: ${m.content || `[${m.messageType}]`}`
      })
      .join('\n')

    const prompt = `根據以下 LINE 對話，為客服事件產生 3 個標題（繁體中文）。

頻道: ${channel?.channelName || '未知'}
對話:
${msgText}

要求：
- 標題1：簡短（8字內），直接說明核心問題
- 標題2：標準格式，含問題類型與對象
- 標題3：詳細版，含客戶需求與緊急程度

直接輸出 JSON，不要加任何說明：
{"titles": ["標題1", "標題2", "標題3"]}`

    let content = ''
    try {
      content = await chatCompletion([
        { role: 'system', content: '你是客服事件標題產生器。只輸出 JSON 格式，不輸出其他文字。' },
        { role: 'user', content: prompt },
      ], { temperature: 0.5 })  // 不限制 maxTokens，reasoning model 需要足夠 token
    } catch (llmErr) {
      console.error('[suggest-event] chatCompletion error:', llmErr)
    }

    console.log('[suggest-event] LLM raw response:', JSON.stringify(content))

    let titles: string[] = []
    if (content) {
      // 支援 markdown code block 包裝的情況
      const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
      try {
        const match = cleaned.match(/\{[\s\S]*\}/)
        if (match) {
          const parsed = JSON.parse(match[0])
          titles = parsed.titles || []
        }
      } catch (e) {
        console.error('[suggest-event] JSON parse error:', e, 'content:', content)
      }
    }

    // fallback：根據訊息內容產生簡單標題，避免回傳無意義預設值
    if (titles.length === 0) {
      const firstMsg = messages.find(m => m.content && m.identityType !== 'STAFF')
      const preview = firstMsg?.content?.slice(0, 20) || '客服問題'
      titles = [
        `${preview}`,
        `${channel?.channelName || '頻道'}：${preview}`,
        `待處理：${preview}`,
      ]
    }

    return NextResponse.json({
      titles,
      suggestedAssignee,
    })
  } catch (e) {
    console.error('[suggest-event]', e)
    return NextResponse.json({ error: '建議失敗' }, { status: 500 })
  }
}
