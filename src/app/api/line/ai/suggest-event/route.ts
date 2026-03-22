import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { chatCompletion } from '@/lib/llm'
import prisma from '@/lib/prisma'

type StaffUser = { id: string; name: string | null; email: string; department: string | null; skills: string[] }

function parseSkills(raw: string | null): string[] {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

/**
 * POST /api/line/ai/suggest-event
 * 根據選取的訊息，AI 建議事件標題（3個版本）與負責人
 *
 * Assignee 選擇優先順序：
 * 1. 頻道歸屬：此頻道歷史事件最常被指派的員工
 * 2. 歷史記錄：同一客戶（partnerId）最近處理的員工
 * 3. Skill 配對：LLM 分析問題需要的技能，配對有該技能的員工
 * 4. LLM fallback：從剩餘員工中由 LLM 選擇
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

    // 取得所有員工清單（含技能）
    const rawStaff = await prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true, department: true, skills: true },
      orderBy: { name: 'asc' },
    })
    const allStaff: StaffUser[] = rawStaff.map(u => ({ ...u, skills: parseSkills(u.skills) }))
    const staffById = new Map(allStaff.map(u => [u.id, u]))

    // ── 優先級 1：頻道歸屬 ──────────────────────────
    // 找此頻道歷史事件中最常出現的 assignee
    let priority1: StaffUser | null = null
    const channelEvents = await prisma.lineEvent.findMany({
      where: {
        channels: { some: { channelId } },
        assigneeId: { not: null },
        status: { not: 'CLOSED' }, // 優先活躍事件的 assignee
      },
      select: { assigneeId: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
    if (channelEvents.length > 0) {
      // 計算最常出現的 assignee
      const counts = new Map<string, number>()
      for (const e of channelEvents) {
        if (e.assigneeId) counts.set(e.assigneeId, (counts.get(e.assigneeId) || 0) + 1)
      }
      const topId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      if (topId) priority1 = staffById.get(topId) || null
    }

    // ── 優先級 2：歷史記錄（同客戶最近的 assignee）──
    let priority2: StaffUser | null = null
    if (!priority1 && channel?.partnerId) {
      const partnerEvent = await prisma.lineEvent.findFirst({
        where: {
          partnerId: channel.partnerId,
          assigneeId: { not: null },
        },
        select: { assigneeId: true },
        orderBy: { createdAt: 'desc' },
      })
      if (partnerEvent?.assigneeId) {
        priority2 = staffById.get(partnerEvent.assigneeId) || null
      }
    }

    // 組合訊息文字
    const msgText = messages
      .map(m => {
        const role = m.identityType === 'STAFF' ? '[員工]' : '[客戶]'
        return `${role}${m.displayName}: ${m.content || `[${m.messageType}]`}`
      })
      .join('\n')

    // ── 優先級 3 & 4：LLM 分析（標題 + 技能配對 + fallback）──
    const staffHasSkills = allStaff.filter(u => u.skills.length > 0)
    const staffNoSkills  = allStaff.filter(u => u.skills.length === 0)

    const skillSection = staffHasSkills.length > 0
      ? `\n有技能標記的員工：\n${staffHasSkills.map(u => `- ${u.name || u.email}（${u.department || ''}）技能: ${u.skills.join(', ')}`).join('\n')}`
      : ''
    const noSkillSection = staffNoSkills.length > 0
      ? `\n其他員工（無技能標記）：\n${staffNoSkills.map(u => `- ${u.name || u.email}（${u.department || ''}）`).join('\n')}`
      : ''

    // 告知 LLM 優先選有技能配對的員工
    const preselectedNote = priority1
      ? `\n（注意：系統已根據頻道歷史指派建議 "${priority1.name || priority1.email}"，若你認為不合適可提出不同建議）`
      : priority2
      ? `\n（注意：系統已根據客戶歷史指派建議 "${priority2.name || priority2.email}"，若你認為不合適可提出不同建議）`
      : ''

    const prompt = `根據以下 LINE 客服對話，產生 3 個事件標題並建議最合適的負責人。

頻道: ${channel?.channelName || '未知'}

對話內容:
${msgText}
${skillSection}${noSkillSection}${preselectedNote}

指派負責人的優先考量：
1. 優先選擇技能與問題類型相符的員工
2. 若無技能配對，依部門與問題性質選擇
3. 說明建議原因（15字內）

直接輸出 JSON，不要加任何說明：
{"titles": ["標題1", "標題2", "標題3"], "requiredSkills": ["技能1", "技能2"], "assignee": "員工姓名或email", "assigneeReason": "原因"}`

    let content = ''
    try {
      content = await chatCompletion([
        { role: 'system', content: '你是客服事件助手。只輸出 JSON 格式，不輸出其他文字。' },
        { role: 'user', content: prompt },
      ], { temperature: 0.5 })
    } catch (llmErr) {
      console.error('[suggest-event] chatCompletion error:', llmErr)
    }

    console.log('[suggest-event] LLM raw response:', JSON.stringify(content))

    let titles: string[] = []
    let suggestedAssignee: { id: string; name: string | null; email: string } | null = null
    let assigneeReason: string | null = null
    let assigneeSource: 'channel' | 'partner' | 'skill' | 'llm' = 'llm'
    let requiredSkills: string[] = []

    if (content) {
      const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
      try {
        const match = cleaned.match(/\{[\s\S]*\}/)
        if (match) {
          const parsed = JSON.parse(match[0])
          titles = parsed.titles || []
          requiredSkills = parsed.requiredSkills || []

          // 優先級 3：Skill 配對（用 LLM 分析出的 requiredSkills）
          let priority3: StaffUser | null = null
          if (requiredSkills.length > 0) {
            const matched = allStaff.find(u =>
              u.skills.some(s => requiredSkills.some(r =>
                s.toLowerCase().includes(r.toLowerCase()) || r.toLowerCase().includes(s.toLowerCase())
              ))
            )
            if (matched) priority3 = matched
          }

          // 套用優先順序
          if (priority1) {
            suggestedAssignee = { id: priority1.id, name: priority1.name, email: priority1.email }
            assigneeSource = 'channel'
            assigneeReason = '頻道歷史負責人'
          } else if (priority2) {
            suggestedAssignee = { id: priority2.id, name: priority2.name, email: priority2.email }
            assigneeSource = 'partner'
            assigneeReason = '客戶歷史負責人'
          } else if (priority3) {
            suggestedAssignee = { id: priority3.id, name: priority3.name, email: priority3.email }
            assigneeSource = 'skill'
            assigneeReason = `技能配對：${priority3.skills.filter(s => requiredSkills.some(r => s.toLowerCase().includes(r.toLowerCase()))).join('、')}`
          } else if (parsed.assignee) {
            // 優先級 4：LLM fallback
            assigneeSource = 'llm'
            assigneeReason = parsed.assigneeReason || null
            const suggestion = parsed.assignee.toLowerCase()
            const llmMatched = allStaff.find(u =>
              (u.name && u.name.toLowerCase().includes(suggestion)) ||
              u.email.toLowerCase().includes(suggestion) ||
              suggestion.includes(u.name?.toLowerCase() || '') ||
              suggestion.includes(u.email.toLowerCase().split('@')[0])
            )
            if (llmMatched) {
              suggestedAssignee = { id: llmMatched.id, name: llmMatched.name, email: llmMatched.email }
            }
          }
        }
      } catch (e) {
        console.error('[suggest-event] JSON parse error:', e, 'content:', content)
      }
    }

    // fallback 標題
    if (titles.length === 0) {
      const firstMsg = messages.find(m => m.content && m.identityType !== 'STAFF')
      const preview = firstMsg?.content?.slice(0, 20) || '客服問題'
      titles = [`${preview}`, `${channel?.channelName || '頻道'}：${preview}`, `待處理：${preview}`]
    }

    return NextResponse.json({
      titles,
      suggestedAssignee,
      assigneeReason,
      assigneeSource,
      requiredSkills,
    })
  } catch (e) {
    console.error('[suggest-event]', e)
    return NextResponse.json({ error: '建議失敗' }, { status: 500 })
  }
}
