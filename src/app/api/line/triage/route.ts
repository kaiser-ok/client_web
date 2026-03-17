import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { chatCompletion } from '@/lib/llm'

/**
 * POST: 用 LLM 分析各 LINE 頻道近期訊息，識別需要處理的對話
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const hours = body.hours || 24 // 預設分析最近 24 小時

    const since = new Date(Date.now() - hours * 60 * 60 * 1000)

    // 找出近期有訊息的活躍頻道
    const channels = await prisma.lineChannel.findMany({
      where: {
        isActive: true,
        lastMessageAt: { gte: since },
      },
      include: {
        partner: { select: { id: true, name: true } },
        associations: {
          include: {
            partner: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    })

    if (channels.length === 0) {
      return NextResponse.json({
        items: [],
        analyzedChannels: 0,
        timeRange: hours,
      })
    }

    // 取得每個頻道的最近訊息（最多 30 則）
    const channelSummaries: Array<{
      channelId: string
      channelName: string
      partnerName: string | null
      messages: string
      messageCount: number
    }> = []

    for (const channel of channels) {
      const messages = await prisma.lineMessage.findMany({
        where: {
          channelId: channel.id,
          timestamp: { gte: since },
        },
        orderBy: { timestamp: 'desc' },
        take: 30,
        select: {
          content: true,
          messageType: true,
          lineUserId: true,
          timestamp: true,
        },
      })

      if (messages.length === 0) continue

      // 取得使用者名稱
      const userIds = [...new Set(messages.map(m => m.lineUserId))]
      const users = await prisma.lineUser.findMany({
        where: { lineUserId: { in: userIds } },
        select: { lineUserId: true, displayName: true, identityType: true },
      })
      const userMap = new Map(users.map(u => [u.lineUserId, u]))

      const partnerName = channel.partner?.name ||
        channel.associations?.[0]?.partner?.name || null

      // 只取文字訊息，組成對話文本
      const textMessages = messages
        .filter(m => m.messageType === 'text' && m.content)
        .reverse()
        .map(m => {
          const user = userMap.get(m.lineUserId)
          const name = user?.displayName || 'Unknown'
          const role = user?.identityType === 'STAFF' ? '(員工)' : ''
          const time = new Date(m.timestamp).toLocaleString('zh-TW', {
            month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
          })
          return `[${time}] ${name}${role}: ${m.content}`
        })

      if (textMessages.length === 0) continue

      channelSummaries.push({
        channelId: channel.id,
        channelName: channel.channelName || channel.lineChannelId,
        partnerName,
        messages: textMessages.join('\n'),
        messageCount: textMessages.length,
      })
    }

    if (channelSummaries.length === 0) {
      return NextResponse.json({
        items: [],
        analyzedChannels: 0,
        timeRange: hours,
      })
    }

    // 組合所有頻道的對話，交給 LLM 分析
    const channelTexts = channelSummaries.map((ch, idx) =>
      `=== 頻道 ${idx + 1}: ${ch.channelName}${ch.partnerName ? ` (客戶: ${ch.partnerName})` : ''} ===\n${ch.messages}`
    ).join('\n\n')

    const systemPrompt = `你是一個 IT 服務支援助理，負責分析 LINE 客戶對話，找出需要 IT 人員注意或回覆的訊息。
請用繁體中文回答，保持簡潔。`

    const userPrompt = `以下是最近 ${hours} 小時內多個 LINE 頻道的對話記錄。
請分析每個頻道，找出需要 IT 人員處理或回覆的情況。

判斷標準：
1. **urgent（緊急）**：系統故障、服務中斷、客戶無法使用
2. **action_needed（需處理）**：客戶提問等待回覆、技術問題待解決、需要確認的事項
3. **follow_up（追蹤）**：需要後續跟進但不急迫的事項
4. **ok（正常）**：純聊天、已解決的問題、不需要處理

請特別注意：
- 客戶的最後一則訊息是否為提問或請求，且尚未有員工回覆
- 是否有提到系統異常、錯誤、故障等關鍵字
- 是否有客戶表達不滿或催促

---
${channelTexts}
---

回覆 JSON 陣列，只列出需要注意的頻道（排除 status=ok 的），按緊急程度排序：
[
  {
    "channelIndex": 0,
    "status": "urgent|action_needed|follow_up",
    "summary": "30字內摘要說明需要處理什麼",
    "lastCustomerMessage": "客戶最後說了什麼（20字內）",
    "suggestion": "建議的回覆或處理方式（30字內）"
  }
]

如果所有頻道都不需要處理，回覆空陣列 []。只回覆 JSON。`

    const response = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], {
      maxTokens: 2000,
      temperature: 0.3,
    })

    // 解析 LLM 回應
    let items: Array<{
      channelId: string
      channelName: string
      partnerName: string | null
      status: string
      summary: string
      lastCustomerMessage: string
      suggestion: string
    }> = []

    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (Array.isArray(parsed)) {
          items = parsed
            .filter(item => item.channelIndex != null && item.channelIndex < channelSummaries.length)
            .map(item => {
              const ch = channelSummaries[item.channelIndex]
              return {
                channelId: ch.channelId,
                channelName: ch.channelName,
                partnerName: ch.partnerName,
                status: ['urgent', 'action_needed', 'follow_up'].includes(item.status) ? item.status : 'follow_up',
                summary: item.summary || '',
                lastCustomerMessage: item.lastCustomerMessage || '',
                suggestion: item.suggestion || '',
              }
            })
        }
      }
    } catch (e) {
      console.error('Failed to parse triage response:', e)
      return NextResponse.json({ error: 'LLM 回應解析失敗' }, { status: 500 })
    }

    return NextResponse.json({
      items,
      analyzedChannels: channelSummaries.length,
      timeRange: hours,
    })
  } catch (error) {
    console.error('Error in LINE triage:', error)
    return NextResponse.json({ error: '分析失敗' }, { status: 500 })
  }
}
