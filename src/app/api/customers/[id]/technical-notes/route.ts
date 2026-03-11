import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * GET /api/customers/[id]/technical-notes
 * 取得客戶的技術文件列表
 *
 * Query params:
 * - category: 篩選分類（optional）
 * - search: 搜尋關鍵字（optional）
 * - limit: 筆數限制（default: 50）
 * - offset: 分頁位移（default: 0）
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

    const { id: partnerId } = await params
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const search = searchParams.get('search')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    // 檢查客戶是否存在
    const customer = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true, name: true },
    })

    if (!customer) {
      return NextResponse.json({ error: '找不到客戶' }, { status: 404 })
    }

    // 建立查詢條件
    const where: {
      partnerId: string
      category?: string
      OR?: Array<{ title?: { contains: string; mode: 'insensitive' }; content?: { contains: string; mode: 'insensitive' }; keywords?: { has: string } }>
    } = {
      partnerId,
    }

    if (category) {
      where.category = category
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
        { keywords: { has: search } },
      ]
    }

    // 查詢技術文件
    const [notes, total] = await Promise.all([
      prisma.technicalNote.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.technicalNote.count({ where }),
    ])

    // 取得分類統計
    const categoryStats = await prisma.technicalNote.groupBy({
      by: ['category'],
      where: { partnerId },
      _count: { category: true },
    })

    return NextResponse.json({
      notes,
      total,
      limit,
      offset,
      hasMore: offset + notes.length < total,
      categoryStats: categoryStats.reduce((acc, item) => {
        acc[item.category] = item._count.category
        return acc
      }, {} as Record<string, number>),
    })
  } catch (error) {
    console.error('Technical notes fetch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '取得技術文件失敗' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/customers/[id]/technical-notes
 * 手動新增技術文件
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id: partnerId } = await params
    const body = await request.json()
    const { category, title, content, keywords } = body

    if (!category || !title || !content) {
      return NextResponse.json(
        { error: '請提供 category, title, content' },
        { status: 400 }
      )
    }

    // 檢查客戶是否存在
    const customer = await prisma.partner.findUnique({
      where: { id: partnerId },
    })

    if (!customer) {
      return NextResponse.json({ error: '找不到客戶' }, { status: 404 })
    }

    const note = await prisma.technicalNote.create({
      data: {
        partnerId,
        category,
        title,
        content,
        participants: [session.user.email],
        keywords: keywords || [],
      },
    })

    return NextResponse.json(note, { status: 201 })
  } catch (error) {
    console.error('Technical note create error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '新增技術文件失敗' },
      { status: 500 }
    )
  }
}
