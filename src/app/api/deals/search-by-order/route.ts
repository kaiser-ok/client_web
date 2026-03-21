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

    const { searchParams } = new URL(request.url)
    const order = searchParams.get('order')?.trim()

    if (!order) {
      return NextResponse.json({ error: '請輸入訂單編號' }, { status: 400 })
    }

    const deals = await prisma.deal.findMany({
      where: {
        name: { contains: order, mode: 'insensitive' },
      },
      select: {
        id: true,
        name: true,
        odooId: true,
        amount: true,
        closedAt: true,
        type: true,
        partner: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { closedAt: 'desc' },
      take: 10,
    })

    return NextResponse.json(deals)
  } catch (error) {
    console.error('Search by order error:', error)
    return NextResponse.json({ error: '搜尋失敗' }, { status: 500 })
  }
}
