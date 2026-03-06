import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { chatCompletion } from '@/lib/llm'
import { LLMConfig, DEFAULT_LLM_CONFIG, LLM_CONFIG_KEY } from '@/types/llm'

interface MonthlySummary {
  month: string // YYYY-MM
  totalMessages: number
  decisions: Array<{
    date: string
    content: string
    participants: string[]
  }>
  technicalIssues: Array<{
    date: string
    content: string
    status?: string
  }>
  actionItems: Array<{
    date: string
    content: string
    assignee?: string
  }>
  highlights: string[]
}

/**
 * 取得 LLM 設定
 */
async function getLLMConfig(): Promise<LLMConfig> {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: LLM_CONFIG_KEY },
    })
    if (config) {
      return JSON.parse(config.value) as LLMConfig
    }
  } catch (e) {
    console.error('Failed to load LLM config:', e)
  }
  return DEFAULT_LLM_CONFIG
}

/**
 * GET: 取得已儲存的月度摘要
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id: channelId } = await params

    const saved = await prisma.lineSummary.findMany({
      where: { channelId },
      orderBy: { month: 'desc' },
    })

    const summaries: MonthlySummary[] = saved.map(s => ({
      ...(s.data as Record<string, unknown>),
      month: s.month,
    } as MonthlySummary))

    return NextResponse.json({ summaries, saved: true })
  } catch (error) {
    console.error('Error loading saved summaries:', error)
    return NextResponse.json({ error: '載入摘要失敗' }, { status: 500 })
  }
}

/**
 * PUT: 儲存月度摘要
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id: channelId } = await params
    const { summaries } = await request.json() as { summaries: MonthlySummary[] }

    if (!Array.isArray(summaries) || summaries.length === 0) {
      return NextResponse.json({ error: '無摘要資料' }, { status: 400 })
    }

    const createdBy = session.user?.email || 'system'

    // Upsert each monthly summary
    for (const summary of summaries) {
      await prisma.lineSummary.upsert({
        where: {
          channelId_month: { channelId, month: summary.month },
        },
        update: {
          data: summary as unknown as Record<string, unknown>,
          createdBy,
        },
        create: {
          channelId,
          month: summary.month,
          data: summary as unknown as Record<string, unknown>,
          createdBy,
        },
      })
    }

    return NextResponse.json({ success: true, count: summaries.length })
  } catch (error) {
    console.error('Error saving summaries:', error)
    return NextResponse.json({ error: '儲存摘要失敗' }, { status: 500 })
  }
}

/**
 * POST: 生成 LINE 聊天記錄的月度摘要
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
    const { month } = body // 格式：YYYY-MM，如果不提供則處理所有訊息

    // 確認頻道存在
    const channel = await prisma.lineChannel.findUnique({
      where: { id: channelId },
      select: { id: true, channelName: true },
    })

    if (!channel) {
      return NextResponse.json({ error: '頻道不存在' }, { status: 404 })
    }

    // 查詢訊息
    let whereClause: { channelId: string; timestamp?: { gte: Date; lt: Date } } = { channelId }

    if (month) {
      const [year, monthNum] = month.split('-').map(Number)
      const startDate = new Date(year, monthNum - 1, 1)
      const endDate = new Date(year, monthNum, 1)
      whereClause.timestamp = { gte: startDate, lt: endDate }
    }

    console.log('Summary API - whereClause:', JSON.stringify(whereClause))

    const messages = await prisma.lineMessage.findMany({
      where: whereClause,
      orderBy: { timestamp: 'asc' },
      select: {
        id: true,
        lineUserId: true,
        content: true,
        messageType: true,
        timestamp: true,
      },
    })

    console.log('Summary API - found messages:', messages.length)

    if (messages.length === 0) {
      return NextResponse.json({
        summary: null,
        message: month ? `${month} 沒有訊息` : '沒有訊息',
      })
    }

    // 取得使用者資訊
    const userIds = [...new Set(messages.map(m => m.lineUserId))]
    const users = await prisma.lineUser.findMany({
      where: { lineUserId: { in: userIds } },
      select: { lineUserId: true, displayName: true },
    })
    const userMap = new Map(users.map(u => [u.lineUserId, u.displayName || 'Unknown']))

    // 按月分組
    const monthlyMessages = new Map<string, typeof messages>()
    for (const msg of messages) {
      const monthKey = msg.timestamp.toISOString().slice(0, 7) // YYYY-MM
      if (!monthlyMessages.has(monthKey)) {
        monthlyMessages.set(monthKey, [])
      }
      monthlyMessages.get(monthKey)!.push(msg)
    }

    // 對每個月生成摘要
    const summaries: MonthlySummary[] = []
    const llmConfig = await getLLMConfig()

    console.log('Summary API - monthly groups:', monthlyMessages.size)

    // 只處理最近 6 個月（避免 API 超時）
    const sortedMonths = [...monthlyMessages.keys()].sort((a, b) => b.localeCompare(a))
    const recentMonths = sortedMonths.slice(0, 6)
    console.log('Summary API - processing months:', recentMonths.join(', '))

    for (const monthKey of recentMonths) {
      const monthMsgs = monthlyMessages.get(monthKey)!

      // 只處理文字訊息
      const textMessages = monthMsgs.filter(m => m.messageType === 'text' && m.content)

      console.log(`Summary API - ${monthKey}: ${textMessages.length} text messages`)

      if (textMessages.length < 3) {
        // 訊息太少，跳過
        console.log(`Summary API - skipping ${monthKey}: too few messages`)
        continue
      }

      // 準備對話文本（限制長度避免 token 過多）
      const conversationLines = textMessages.slice(-200).map(m => {
        const date = m.timestamp.toISOString().slice(0, 10)
        const time = m.timestamp.toISOString().slice(11, 16)
        const sender = userMap.get(m.lineUserId) || 'Unknown'
        return `[${date} ${time}] ${sender}: ${m.content}`
      })

      const conversationText = conversationLines.join('\n')

      const systemPrompt = `你是一個專業的商務助理，擅長從群組對話中提取重點摘要。
請用繁體中文回答，保持簡潔專業。`

      const userPrompt = `以下是「${channel.channelName || '群組'}」在 ${monthKey} 的對話記錄。

請分析並提取重點，分為以下類別：

1. **重要決策** (decisions)：確定的事項、達成的共識、決定的時程
2. **技術問題** (technicalIssues)：討論的技術問題、故障、解決方案
3. **待辦/追蹤** (actionItems)：需要後續處理的事項、指派的任務
4. **月度亮點** (highlights)：用 2-3 句話總結這個月的重點

每個項目請標注日期和相關人員。

---
對話記錄：
${conversationText}
---

回覆 JSON 格式：
{
  "decisions": [
    {"date": "MM/DD", "content": "決策內容", "participants": ["人員1", "人員2"]}
  ],
  "technicalIssues": [
    {"date": "MM/DD", "content": "問題描述", "status": "已解決/處理中/待處理"}
  ],
  "actionItems": [
    {"date": "MM/DD", "content": "待辦事項", "assignee": "負責人"}
  ],
  "highlights": ["亮點1", "亮點2"]
}

只回覆 JSON，不要其他文字。如果某類別沒有內容，回覆空陣列。`

      try {
        console.log(`Summary API - calling LLM for ${monthKey}...`)
        console.log(`Summary API - LLM config: ${llmConfig.primary.baseUrl}, model: ${llmConfig.primary.model}`)

        const response = await chatCompletion([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ], {
          maxTokens: 3000,
          temperature: 0.3,
          baseUrl: llmConfig.primary.baseUrl,
          model: llmConfig.primary.model,
          apiKey: llmConfig.primary.apiKey,
        })

        console.log(`Summary API - LLM response length: ${response.length}`)

        // 解析 JSON
        const jsonMatch = response.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          summaries.push({
            month: monthKey,
            totalMessages: monthMsgs.length,
            decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
            technicalIssues: Array.isArray(parsed.technicalIssues) ? parsed.technicalIssues : [],
            actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
            highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
          })
          console.log(`Summary API - added summary for ${monthKey}`)
        } else {
          console.log(`Summary API - no JSON found in response for ${monthKey}`)
        }
      } catch (e) {
        console.error(`Failed to generate summary for ${monthKey}:`, e)
        // 繼續處理下一個月
      }
    }

    // 按月份排序（新到舊）
    summaries.sort((a, b) => b.month.localeCompare(a.month))

    return NextResponse.json({
      channelName: channel.channelName,
      totalMessages: messages.length,
      summaries,
    })
  } catch (error) {
    console.error('Error generating LINE chat summary:', error)
    return NextResponse.json({ error: '生成摘要失敗' }, { status: 500 })
  }
}
