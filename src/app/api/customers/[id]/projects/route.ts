import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// 有效的專案狀態
const VALID_STATUSES = ['ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED']

/**
 * GET: 取得 Partner 的所有專案
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
    const status = searchParams.get('status')

    // 確認 Partner 存在
    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true, name: true },
    })

    if (!partner) {
      return NextResponse.json({ error: 'Partner 不存在' }, { status: 404 })
    }

    // 查詢專案
    const where: { partnerId: string; status?: string } = { partnerId }
    if (status && VALID_STATUSES.includes(status)) {
      where.status = status
    }

    const projects = await prisma.project.findMany({
      where,
      include: {
        deal: {
          select: {
            odooId: true,
            name: true,
            amount: true,
          },
        },
        bonusEval: {
          select: { id: true, status: true, totalScore: true },
        },
        endUser: {
          select: {
            id: true,
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
        dealId: p.dealId,
        odooId: p.deal?.odooId || null,
        odooOrderName: p.deal?.name || null,
        dealAmount: p.deal?.amount ? Number(p.deal.amount) : null,
        bonusEvalStatus: p.bonusEval?.status || null,
        bonusEvalScore: p.bonusEval?.totalScore ? Number(p.bonusEval.totalScore) : null,
        endUserId: p.endUserId,
        endUserName: p.endUser?.name || null,
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
    console.error('Error fetching projects:', error)
    return NextResponse.json({ error: '取得專案列表失敗' }, { status: 500 })
  }
}

/**
 * POST: 建立新專案
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id: partnerId } = await params
    const body = await request.json()
    const { name, type, description, status, startDate, endDate, endUserId, products } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: '專案名稱為必填' }, { status: 400 })
    }

    // 確認 Partner 存在
    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true },
    })

    if (!partner) {
      return NextResponse.json({ error: 'Partner 不存在' }, { status: 404 })
    }

    // 驗證狀態
    const projectStatus = status && VALID_STATUSES.includes(status) ? status : 'ACTIVE'

    // 建立專案
    const project = await prisma.project.create({
      data: {
        partnerId,
        name: name.trim(),
        type: type || null,
        description: description?.trim() || null,
        products: products || null,
        status: projectStatus,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        endUserId: endUserId || null,
        createdBy: session.user?.email || 'unknown',
      },
    })

    return NextResponse.json({
      success: true,
      project: {
        id: project.id,
        name: project.name,
        type: project.type,
        description: project.description,
        products: project.products,
        status: project.status,
        startDate: project.startDate,
        endDate: project.endDate,
        createdAt: project.createdAt,
      },
    })
  } catch (error) {
    console.error('Error creating project:', error)
    return NextResponse.json({ error: '建立專案失敗' }, { status: 500 })
  }
}
