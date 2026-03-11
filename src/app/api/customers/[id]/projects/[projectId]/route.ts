import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { hasPermission } from '@/constants/roles'

// 有效的專案狀態
const VALID_STATUSES = ['ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED']

/**
 * GET: 取得單一專案詳情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id: partnerId, projectId } = await params

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        partnerId,
      },
      include: {
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            title: true,
            source: true,
            createdAt: true,
          },
        },
        lineChannels: {
          select: {
            id: true,
            channelName: true,
            channelType: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            activities: true,
          },
        },
      },
    })

    if (!project) {
      return NextResponse.json({ error: '專案不存在' }, { status: 404 })
    }

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        startDate: project.startDate,
        endDate: project.endDate,
        createdBy: project.createdBy,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        activityCount: project._count.activities,
        recentActivities: project.activities,
        lineChannels: project.lineChannels,
      },
    })
  } catch (error) {
    console.error('Error fetching project:', error)
    return NextResponse.json({ error: '取得專案失敗' }, { status: 500 })
  }
}

/**
 * PUT: 更新專案
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id: partnerId, projectId } = await params
    const body = await request.json()
    const { name, type, description, products, status, startDate, endDate, endUserId } = body

    // 確認專案存在
    const existing = await prisma.project.findFirst({
      where: {
        id: projectId,
        partnerId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: '專案不存在' }, { status: 404 })
    }

    // 驗證狀態
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `無效的狀態，必須是: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    // 準備更新資料
    const updateData: {
      name?: string
      type?: string | null
      description?: string | null
      products?: object
      status?: string
      startDate?: Date | null
      endDate?: Date | null
      endUserId?: string | null
    } = {}

    if (name !== undefined) updateData.name = name.trim()
    if (type !== undefined) updateData.type = type || null
    if (description !== undefined) updateData.description = description?.trim() || null
    if (products !== undefined) updateData.products = products || undefined
    if (status !== undefined) updateData.status = status
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null
    if (endUserId !== undefined) updateData.endUserId = endUserId || null

    // 更新專案
    const project = await prisma.project.update({
      where: { id: projectId },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        startDate: project.startDate,
        endDate: project.endDate,
        updatedAt: project.updatedAt,
      },
    })
  } catch (error) {
    console.error('Error updating project:', error)
    return NextResponse.json({ error: '更新專案失敗' }, { status: 500 })
  }
}

/**
 * DELETE: 刪除專案
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // 檢查權限
    const user = await prisma.user.findUnique({
      where: { email: session.user?.email || '' },
      select: { role: true },
    })

    if (!hasPermission(user?.role, 'DELETE_PROJECT')) {
      return NextResponse.json({ error: '沒有刪除專案的權限' }, { status: 403 })
    }

    const { id: partnerId, projectId } = await params

    // 確認專案存在
    const existing = await prisma.project.findFirst({
      where: {
        id: projectId,
        partnerId,
      },
      include: {
        _count: {
          select: {
            activities: true,
          },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: '專案不存在' }, { status: 404 })
    }

    // 如果有關聯的活動，先解除關聯
    if (existing._count.activities > 0) {
      await prisma.activity.updateMany({
        where: { projectId },
        data: { projectId: null },
      })
    }

    // 解除 LINE 頻道關聯
    await prisma.lineChannel.updateMany({
      where: { projectId },
      data: { projectId: null },
    })

    // 刪除專案
    await prisma.project.delete({
      where: { id: projectId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting project:', error)
    return NextResponse.json({ error: '刪除專案失敗' }, { status: 500 })
  }
}
