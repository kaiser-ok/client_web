import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { chatCompletion } from '@/lib/llm'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { projectName } = await request.json()
    if (!projectName?.trim()) {
      return NextResponse.json({ error: '請提供專案名稱' }, { status: 400 })
    }

    // 取得所有 END_USER 角色的 Partners（含 aliases）
    const endUserPartners = await prisma.partner.findMany({
      where: {
        isActive: true,
        roles: { some: { role: 'END_USER' } },
      },
      select: { id: true, name: true, aliases: true },
    })

    if (endUserPartners.length === 0) {
      return NextResponse.json({ match: null, reason: '系統中尚無最終用戶資料' })
    }

    const candidateList = endUserPartners
      .map(p => {
        const aliases = p.aliases.length > 0 ? `（別名：${p.aliases.join('、')}）` : ''
        return `- ID:${p.id} 名稱:${p.name}${aliases}`
      })
      .join('\n')

    const prompt = `你是一個 CRM 資料助理。請根據專案名稱，從候選清單中找出最可能的「最終用戶」（即實際使用該系統的機構或單位），並以 JSON 格式回答。

專案名稱：${projectName}

候選最終用戶清單：
${candidateList}

規則：
1. 若專案名稱中含有機構縮寫（如「中研所」代表「中央研究院」、「師大」代表「國立臺灣師範大學」），請識別其完整名稱並比對
2. 若找不到任何合理的匹配，返回 null
3. 只選一個最佳匹配

請以以下 JSON 格式回應（不要包含其他文字）：
{"id":"<Partner ID>","name":"<Partner 名稱>","reason":"<簡短說明為何選擇此機構>"}`

    const raw = await chatCompletion(
      [{ role: 'user', content: prompt }],
      { maxTokens: 300, temperature: 0.1 }
    )

    // 解析 LLM 回應
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ match: null, reason: 'LLM 無法判斷' })
    }

    const parsed = JSON.parse(jsonMatch[0])

    // 驗證 ID 確實存在於候選清單
    const matched = endUserPartners.find(p => p.id === parsed.id)
    if (!matched) {
      return NextResponse.json({ match: null, reason: parsed.reason || 'LLM 建議的 ID 不在候選清單中' })
    }

    return NextResponse.json({
      match: { id: matched.id, name: matched.name },
      reason: parsed.reason || '',
    })
  } catch (error) {
    console.error('suggest-end-user error:', error)
    return NextResponse.json({ error: '推薦失敗' }, { status: 500 })
  }
}
