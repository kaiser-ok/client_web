import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // 檢查是否為管理員
    const user = await prisma.user.findUnique({
      where: { email: session.user?.email || '' },
      select: { role: true },
    })

    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: '需要管理員權限' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const partnerId = searchParams.get('partnerId') || searchParams.get('customerId') // 向下相容

    const where: Record<string, unknown> = {}
    if (partnerId) {
      where.partnerId = partnerId
    }

    const [records, total] = await Promise.all([
      prisma.deletedSlackActivity.findMany({
        where,
        orderBy: { deletedAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.deletedSlackActivity.count({ where }),
    ])

    // 統計資訊
    const stats = await prisma.deletedSlackActivity.groupBy({
      by: ['partnerName'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    })

    return NextResponse.json({
      records,
      total,
      hasMore: offset + records.length < total,
      stats: stats.map(s => ({ partnerName: s.partnerName, count: s._count.id })),
    })
  } catch (error) {
    console.error('Error fetching deleted slack activities:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}

// 匯出刪除記錄供 LLM 訓練（格式化為 prompt）
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // 檢查是否為管理員
    const user = await prisma.user.findUnique({
      where: { email: session.user?.email || '' },
      select: { role: true },
    })

    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: '需要管理員權限' }, { status: 403 })
    }

    const body = await request.json()
    const { action } = body

    if (action === 'export') {
      // 匯出所有刪除記錄為 LLM 訓練格式
      const records = await prisma.deletedSlackActivity.findMany({
        orderBy: { deletedAt: 'desc' },
      })

      // 格式化為可用於 LLM 提示的範例
      const examples = records.map(r => ({
        title: r.title,
        content: r.content?.substring(0, 500) || null, // 截取前 500 字
        reason: r.reason || '使用者認為不相關',
        deletedBy: r.deletedBy,
        deletedAt: r.deletedAt,
      }))

      return NextResponse.json({
        count: examples.length,
        examples,
        // 生成可直接用於 LLM prompt 的文本
        promptText: generateLLMPromptText(examples),
      })
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 })
  } catch (error) {
    console.error('Error exporting deleted slack activities:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}

function generateLLMPromptText(examples: Array<{ title: string; content: string | null; reason: string }>) {
  if (examples.length === 0) return ''

  const lines = [
    '以下是使用者標記為不重要/不相關的事件類型範例，請在分類時避免產生類似的事件：',
    '',
  ]

  examples.slice(0, 20).forEach((ex, i) => {
    lines.push(`${i + 1}. 標題：${ex.title}`)
    if (ex.content) {
      lines.push(`   內容摘要：${ex.content.substring(0, 100)}...`)
    }
    lines.push(`   原因：${ex.reason}`)
    lines.push('')
  })

  return lines.join('\n')
}
