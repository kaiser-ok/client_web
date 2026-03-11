import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * GET: 取得此 Partner 作為最終用戶的專案
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

    // 確認 Partner 存在
    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: {
        id: true,
        name: true,
        roles: {
          select: { role: true },
        },
      },
    })

    if (!partner) {
      return NextResponse.json({ error: 'Partner 不存在' }, { status: 404 })
    }

    // 查詢此 Partner 作為最終用戶的專案
    const projects = await prisma.project.findMany({
      where: {
        endUserId: partnerId,
      },
      include: {
        partner: {
          select: {
            id: true,
            name: true,
          },
        },
        deal: {
          select: {
            odooId: true,
            name: true,
          },
        },
        _count: {
          select: {
            activities: true,
            lineChannels: true,
          },
        },
      },
      orderBy: [
        { status: 'asc' },
        { updatedAt: 'desc' },
      ],
    })

    return NextResponse.json({
      projects: projects.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        description: p.description,
        products: p.products,
        dealerId: p.partnerId,
        dealerName: p.partner.name,
        dealId: p.dealId,
        odooId: p.deal?.odooId || null,
        odooOrderName: p.deal?.name || null,
        status: p.status,
        startDate: p.startDate,
        endDate: p.endDate,
        activityCount: p._count.activities,
        lineChannelCount: p._count.lineChannels,
        createdBy: p.createdBy,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    })
  } catch (error) {
    console.error('Error fetching end user projects:', error)
    return NextResponse.json({ error: '取得專案列表失敗' }, { status: 500 })
  }
}
