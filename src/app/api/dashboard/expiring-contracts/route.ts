import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const now = new Date()
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    const contracts = await prisma.deal.findMany({
      where: {
        endDate: {
          gte: now,
          lte: thirtyDaysLater,
        },
      },
      select: {
        id: true,
        name: true,
        endDate: true,
        partner: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        endDate: 'asc',
      },
    })

    return NextResponse.json({ contracts })
  } catch (error) {
    console.error('Error fetching expiring contracts:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
