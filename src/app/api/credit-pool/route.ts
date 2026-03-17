import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { hasPermission } from '@/constants/roles'
import { Decimal } from '@prisma/client/runtime/library'

// GET: 取得指定年度的點數池
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
      return NextResponse.json({
        pool: null,
        year,
      })
    }

    const allocatedPoints = pool.allocations.reduce(
      (sum, a) => sum + Number(a.points),
      0
    )

    return NextResponse.json({
      pool: {
        id: pool.id,
        year: pool.year,
        totalPoints: Number(pool.totalPoints),
        description: pool.description,
        createdBy: pool.createdBy,
        createdAt: pool.createdAt,
        updatedAt: pool.updatedAt,
        allocatedPoints: Math.round(allocatedPoints * 100) / 100,
        remainingPoints: Math.round((Number(pool.totalPoints) - allocatedPoints) * 100) / 100,
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
      },
    })
  } catch (error) {
    console.error('Error fetching credit pool:', error)
    return NextResponse.json({ error: '取得點數池失敗' }, { status: 500 })
  }
}

// POST: 建立或更新點數池 (upsert by year)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const userRole = (session.user as { role?: string })?.role
    if (userRole !== 'ADMIN') {
      return NextResponse.json({ error: '僅管理員可設定點數池' }, { status: 403 })
    }

    const { year, totalPoints, description } = await request.json()

    if (!year || totalPoints == null || totalPoints < 0) {
      return NextResponse.json({ error: '缺少必要參數或點數不可為負' }, { status: 400 })
    }

    // Check that totalPoints is not less than already allocated
    const existing = await prisma.creditPool.findUnique({
      where: { year },
      include: { allocations: true },
    })

    if (existing) {
      const allocated = existing.allocations.reduce(
        (sum, a) => sum + Number(a.points),
        0
      )
      if (totalPoints < allocated) {
        return NextResponse.json(
          { error: `總點數不可低於已分配的 ${allocated.toFixed(2)} 點` },
          { status: 400 }
        )
      }
    }

    const userEmail = session.user?.email || 'system'

    const pool = await prisma.creditPool.upsert({
      where: { year },
      update: {
        totalPoints: new Decimal(totalPoints),
        description: description || null,
      },
      create: {
        year,
        totalPoints: new Decimal(totalPoints),
        description: description || null,
        createdBy: userEmail,
      },
    })

    return NextResponse.json({ success: true, pool })
  } catch (error) {
    console.error('Error saving credit pool:', error)
    return NextResponse.json({ error: '儲存點數池失敗' }, { status: 500 })
  }
}
