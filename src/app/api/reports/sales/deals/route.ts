import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { hasPermission } from '@/constants/roles'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    if (!hasPermission(session.user?.role, 'VIEW_DEAL_AMOUNT', (session.user as { isManager?: boolean })?.isManager)) {
      return NextResponse.json({ error: '權限不足' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const startDateStr = searchParams.get('startDate')
    const endDateStr = searchParams.get('endDate')
    const salesRepFilter = searchParams.get('salesRep')
    const projectTypeFilter = searchParams.get('projectType')

    const now = new Date()
    const defaultStartDate = new Date(now.getFullYear(), 0, 1)
    const defaultEndDate = now

    const parseDateLocal = (s: string) => {
      const [y, m, d] = s.split('-').map(Number)
      return new Date(y, m - 1, d)
    }
    const startDate = startDateStr ? parseDateLocal(startDateStr) : defaultStartDate
    const endDate = endDateStr ? parseDateLocal(endDateStr) : defaultEndDate
    endDate.setHours(23, 59, 59, 999)

    const where: Prisma.DealWhereInput = {
      closedAt: { gte: startDate, lte: endDate },
      amount: { not: null },
      status: 'ACTIVE',
      OR: [{ odooState: null }, { NOT: { odooState: 'draft' } }],
      ...(salesRepFilter && { salesRep: salesRepFilter }),
      ...(projectTypeFilter && { projectType: projectTypeFilter }),
    }

    const deals = await prisma.deal.findMany({
      where,
      select: {
        id: true,
        name: true,
        projectName: true,
        clientOrderRef: true,
        projectType: true,
        amount: true,
        salesRep: true,
        closedAt: true,
        odooState: true,
        partner: { select: { id: true, name: true } },
      },
      orderBy: { closedAt: 'desc' },
    })

    return NextResponse.json(
      deals.map(d => ({
        id: d.id,
        name: d.name,
        projectName: d.projectName,
        clientOrderRef: d.clientOrderRef,
        projectType: d.projectType,
        amount: Number(d.amount || 0),
        salesRep: d.salesRep,
        closedAt: d.closedAt.toISOString(),
        partnerId: d.partner.id,
        partnerName: d.partner.name,
      }))
    )
  } catch (error) {
    console.error('Error fetching sales deals:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
