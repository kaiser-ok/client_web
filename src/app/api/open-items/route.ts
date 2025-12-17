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
    const customerId = searchParams.get('customerId')
    const status = searchParams.get('status')
    const waitingOn = searchParams.get('waitingOn')
    const assignee = searchParams.get('assignee')
    const sortField = searchParams.get('sortField') || 'jiraUpdated'
    const sortOrder = searchParams.get('sortOrder') || 'desc'

    const where: Record<string, unknown> = {}

    if (customerId) {
      where.customerId = customerId
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
        customer: {
          select: {
            name: true,
            jiraProject: true,
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
