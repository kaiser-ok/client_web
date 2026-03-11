import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// 手動建立報修單（from Mobile 報修）
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const { customerId, summary, description, priority, tags } = body

    if (!customerId || !summary?.trim()) {
      return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
    }

    // 產生手動 jiraKey（MANUAL-timestamp）避免 unique constraint
    const jiraKey = `MANUAL-${Date.now()}`

    const [openItem] = await prisma.$transaction([
      prisma.openItem.create({
        data: {
          jiraKey,
          partnerId: customerId,
          summary: summary.trim(),
          status: 'OPEN',
          priority: priority || 'Medium',
          waitingOn: 'IT',
          nextAction: description?.trim() || null,
          jiraUpdated: new Date(),
        },
      }),
      prisma.activity.create({
        data: {
          partnerId: customerId,
          source: 'MANUAL',
          title: `報修：${summary.trim()}`,
          content: description?.trim() || null,
          tags: tags || ['報修'],
          createdBy: session.user.email,
        },
      }),
    ])

    return NextResponse.json(openItem, { status: 201 })
  } catch (error) {
    console.error('Error creating open item:', error)
    return NextResponse.json({ error: '建立失敗' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    // Support both partnerId and customerId for backward compatibility
    const partnerId = searchParams.get('partnerId') || searchParams.get('customerId')
    const status = searchParams.get('status')
    const waitingOn = searchParams.get('waitingOn')
    const assignee = searchParams.get('assignee')
    const sortField = searchParams.get('sortField') || 'jiraUpdated'
    const sortOrder = searchParams.get('sortOrder') || 'desc'

    const where: Record<string, unknown> = {}

    if (partnerId) {
      where.partnerId = partnerId
    }

    if (status) {
      where.status = { in: status.split(',') }
    }

    if (waitingOn) {
      where.waitingOn = { in: waitingOn.split(',') }
    }

    if (assignee) {
      where.assignee = assignee
    }

    const orderBy: Record<string, string> = {}
    orderBy[sortField] = sortOrder

    const openItems = await prisma.openItem.findMany({
      where,
      orderBy,
      include: {
        partner: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json(openItems)
  } catch (error) {
    console.error('Error fetching open items:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
