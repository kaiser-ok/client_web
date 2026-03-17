import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { hasPermission } from '@/constants/roles'
import { Decimal } from '@prisma/client/runtime/library'

// GET: 取得該年度所有分配紀錄
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const userRole = (session.user as { role?: string })?.role
    if (userRole !== 'ADMIN') {
      return NextResponse.json({ error: '僅管理員可存取點數池' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

    const pool = await prisma.creditPool.findUnique({
      where: { year },
      include: {
        allocations: {
          include: {
            eval: {
              include: {
                project: {
                  select: {
                    name: true,
                    partner: { select: { name: true } },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!pool) {
      return NextResponse.json({ allocations: [] })
    }

    return NextResponse.json({
      allocations: pool.allocations.map(a => ({
        id: a.id,
        poolId: a.poolId,
        evalId: a.evalId,
        points: Number(a.points),
        reason: a.reason,
        allocatedBy: a.allocatedBy,
        createdAt: a.createdAt,
        projectName: a.eval.project.name,
        partnerName: a.eval.project.partner.name,
      })),
    })
  } catch (error) {
    console.error('Error fetching allocations:', error)
    return NextResponse.json({ error: '取得分配紀錄失敗' }, { status: 500 })
  }
}

// POST: 分配點數到專案
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const userRole = (session.user as { role?: string })?.role
    if (userRole !== 'ADMIN') {
      return NextResponse.json({ error: '僅管理員可操作點數池' }, { status: 403 })
    }

    const { year, evalId, points, reason } = await request.json()

    if (!year || !evalId || !points || !reason) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 })
    }

    if (points <= 0) {
      return NextResponse.json({ error: '分配點數必須大於 0' }, { status: 400 })
    }

    if (!reason.trim()) {
      return NextResponse.json({ error: '原因為必填' }, { status: 400 })
    }

    const userEmail = session.user?.email || 'system'

    // Use transaction to prevent concurrent allocation issues
    const result = await prisma.$transaction(async (tx) => {
      // Get pool
      const pool = await tx.creditPool.findUnique({
        where: { year },
        include: { allocations: true },
      })

      if (!pool) {
        throw new Error('該年度尚未建立點數池')
      }

      // Verify eval exists and year matches
      const eval_ = await tx.projectBonusEval.findUnique({
        where: { id: evalId },
        select: { year: true },
      })

      if (!eval_) {
        throw new Error('專案評估不存在')
      }

      if (eval_.year !== year) {
        throw new Error('專案評估年度與點數池年度不符')
      }

      // Check remaining points
      const allocated = pool.allocations.reduce(
        (sum, a) => sum + Number(a.points),
        0
      )
      const remaining = Number(pool.totalPoints) - allocated

      if (points > remaining) {
        throw new Error(`剩餘點數不足，目前剩餘 ${remaining.toFixed(2)} 點`)
      }

      // Create allocation
      const allocation = await tx.creditPoolAllocation.create({
        data: {
          poolId: pool.id,
          evalId,
          points: new Decimal(points),
          reason: reason.trim(),
          allocatedBy: userEmail,
        },
      })

      return allocation
    })

    return NextResponse.json({ success: true, allocation: result })
  } catch (error) {
    const msg = error instanceof Error ? error.message : '分配點數失敗'
    console.error('Error creating allocation:', error)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

// DELETE: 撤回分配
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const userRole = (session.user as { role?: string })?.role
    if (userRole !== 'ADMIN') {
      return NextResponse.json({ error: '僅管理員可操作點數池' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: '缺少分配 ID' }, { status: 400 })
    }

    await prisma.creditPoolAllocation.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting allocation:', error)
    return NextResponse.json({ error: '撤回分配失敗' }, { status: 500 })
  }
}
