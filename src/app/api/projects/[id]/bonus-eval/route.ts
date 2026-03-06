import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { hasPermission } from '@/constants/roles'
import { Decimal } from '@prisma/client/runtime/library'

// GET: 取得專案的獎金評估
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const userRole = (session.user as { role?: string })?.role
    if (!hasPermission(userRole, 'VIEW_BONUS')) {
      return NextResponse.json({ error: '無權限' }, { status: 403 })
    }

    const { id: projectId } = await params

    const eval_ = await prisma.projectBonusEval.findUnique({
      where: { projectId },
      include: {
        costs: { orderBy: { createdAt: 'asc' } },
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: [{ yearOffset: 'asc' }, { createdAt: 'asc' }],
        },
        project: {
          select: {
            name: true,
            type: true,
            deal: { select: { name: true, amount: true } },
            partner: { select: { name: true } },
          },
        },
      },
    })

    if (!eval_) {
      // Return project info for creating a new eval
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          deal: { select: { name: true, amount: true } },
          partner: { select: { name: true } },
        },
      })
      if (!project) {
        return NextResponse.json({ error: '專案不存在' }, { status: 404 })
      }
      return NextResponse.json({ eval: null, project })
    }

    return NextResponse.json({
      eval: {
        ...eval_,
        projectName: eval_.project.name,
        partnerName: eval_.project.partner.name,
        dealName: eval_.project.deal?.name,
        members: eval_.members.map(m => ({
          ...m,
          userName: m.user.name,
          userEmail: m.user.email,
        })),
      },
    })
  } catch (error) {
    console.error('Error fetching bonus eval:', error)
    return NextResponse.json({ error: '取得獎金評估失敗' }, { status: 500 })
  }
}

// POST: 建立或更新獎金評估
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const userRole = (session.user as { role?: string })?.role
    if (!hasPermission(userRole, 'EDIT_BONUS')) {
      return NextResponse.json({ error: '無權限' }, { status: 403 })
    }

    const { id: projectId } = await params
    const body = await request.json()
    const {
      year,
      dealAmount,
      costs = [],
      members = [],
      importanceAdj = 0,
      qualityAdj = 0,
      efficiencyAdj = 0,
      warrantyYears = 1,
      scoreSpreadPcts,
      notes,
      status,
    } = body

    // Validate adjustments
    if (importanceAdj < 0 || importanceAdj > 20) {
      return NextResponse.json({ error: '重要性加成需在 0~20% 之間' }, { status: 400 })
    }
    if (qualityAdj < -10 || qualityAdj > 10) {
      return NextResponse.json({ error: '質量加減需在 -10~+10% 之間' }, { status: 400 })
    }
    if (efficiencyAdj < -10 || efficiencyAdj > 10) {
      return NextResponse.json({ error: '時效加減需在 -10~+10% 之間' }, { status: 400 })
    }

    // Validate warranty spread
    if (warrantyYears < 1 || warrantyYears > 10) {
      return NextResponse.json({ error: '保固年數需在 1~10 之間' }, { status: 400 })
    }
    if (scoreSpreadPcts) {
      if (!Array.isArray(scoreSpreadPcts) || scoreSpreadPcts.length !== warrantyYears) {
        return NextResponse.json({ error: '攤分比例數量需等於保固年數' }, { status: 400 })
      }
      const spreadSum = scoreSpreadPcts.reduce((s: number, p: number) => s + p, 0)
      if (Math.abs(spreadSum - 100) > 0.01) {
        return NextResponse.json({ error: `攤分比例合計需為 100%，目前為 ${spreadSum}%` }, { status: 400 })
      }
    }

    // Validate member contribution per year doesn't exceed 100%
    const membersByYear = new Map<number, Array<{ userId: string; role: string; contributionPct: number; yearOffset: number }>>()
    for (const m of members) {
      const yo = m.yearOffset ?? 0
      if (!membersByYear.has(yo)) membersByYear.set(yo, [])
      membersByYear.get(yo)!.push(m)
    }
    for (const [yo, yearMembers] of membersByYear) {
      const totalPct = yearMembers.reduce((sum: number, m: { contributionPct: number }) => sum + m.contributionPct, 0)
      if (yearMembers.length > 0 && totalPct > 100.01) {
        return NextResponse.json({ error: `第 ${yo + 1} 年成員貢獻比例合計不可超過 100%，目前為 ${totalPct}%` }, { status: 400 })
      }
    }

    // Calculate scores
    const totalCost = costs.reduce((sum: number, c: { amount: number }) => sum + Number(c.amount), 0)
    const projectAmount = Number(dealAmount) - totalCost
    const baseScore = projectAmount / 100000
    const multiplier = 1 + (importanceAdj + qualityAdj + efficiencyAdj) / 100
    const totalScore = baseScore * multiplier

    const userEmail = session.user?.email || 'system'

    // Check existing
    const existing = await prisma.projectBonusEval.findUnique({
      where: { projectId },
    })

    const evalData = {
      year: year || new Date().getFullYear(),
      dealAmount: new Decimal(dealAmount),
      totalCost: new Decimal(totalCost),
      projectAmount: new Decimal(projectAmount),
      baseScore: new Decimal(baseScore.toFixed(2)),
      importanceAdj: new Decimal(importanceAdj),
      qualityAdj: new Decimal(qualityAdj),
      efficiencyAdj: new Decimal(efficiencyAdj),
      totalScore: new Decimal(totalScore.toFixed(2)),
      warrantyYears,
      scoreSpreadPcts: scoreSpreadPcts || (warrantyYears === 1 ? [100] : null),
      notes: notes || null,
      status: status || 'DRAFT',
    }

    let eval_

    if (existing) {
      // Cannot edit approved evals unless ADMIN or FINANCE
      if (['APPROVED'].includes(existing.status) && !hasPermission(userRole, 'EDIT_BONUS')) {
        return NextResponse.json({ error: '已核准的評估僅財務及管理員可修改' }, { status: 400 })
      }

      eval_ = await prisma.$transaction(async (tx) => {
        // Update eval
        const updated = await tx.projectBonusEval.update({
          where: { projectId },
          data: evalData,
        })

        // Replace costs
        await tx.projectCost.deleteMany({ where: { evalId: updated.id } })
        if (costs.length > 0) {
          await tx.projectCost.createMany({
            data: costs.map((c: { category: string; description: string; amount: number }) => ({
              evalId: updated.id,
              category: c.category,
              description: c.description,
              amount: new Decimal(c.amount),
            })),
          })
        }

        // Replace members
        await tx.projectBonusMember.deleteMany({ where: { evalId: updated.id } })
        if (members.length > 0) {
          const spreadPcts = scoreSpreadPcts || [100]
          await tx.projectBonusMember.createMany({
            data: members.map((m: { userId: string; role: string; contributionPct: number; yearOffset?: number }) => {
              const yo = m.yearOffset ?? 0
              const yearRatio = (spreadPcts[yo] ?? 100) / 100
              return {
                evalId: updated.id,
                userId: m.userId,
                role: m.role,
                yearOffset: yo,
                contributionPct: new Decimal(m.contributionPct),
                score: new Decimal((totalScore * yearRatio * m.contributionPct / 100).toFixed(2)),
              }
            }),
          })
        }

        return updated
      })
    } else {
      eval_ = await prisma.$transaction(async (tx) => {
        const created = await tx.projectBonusEval.create({
          data: {
            projectId,
            ...evalData,
            createdBy: userEmail,
          },
        })

        if (costs.length > 0) {
          await tx.projectCost.createMany({
            data: costs.map((c: { category: string; description: string; amount: number }) => ({
              evalId: created.id,
              category: c.category,
              description: c.description,
              amount: new Decimal(c.amount),
            })),
          })
        }

        if (members.length > 0) {
          const spreadPcts = scoreSpreadPcts || [100]
          await tx.projectBonusMember.createMany({
            data: members.map((m: { userId: string; role: string; contributionPct: number; yearOffset?: number }) => {
              const yo = m.yearOffset ?? 0
              const yearRatio = (spreadPcts[yo] ?? 100) / 100
              return {
                evalId: created.id,
                userId: m.userId,
                role: m.role,
                yearOffset: yo,
                contributionPct: new Decimal(m.contributionPct),
                score: new Decimal((totalScore * yearRatio * m.contributionPct / 100).toFixed(2)),
              }
            }),
          })
        }

        return created
      })
    }

    return NextResponse.json({ success: true, eval: eval_ })
  } catch (error) {
    console.error('Error saving bonus eval:', error)
    return NextResponse.json({ error: '儲存獎金評估失敗' }, { status: 500 })
  }
}

// PUT: 核准/退回評估
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const userRole = (session.user as { role?: string })?.role
    const { id: projectId } = await params
    const body = await request.json()
    const { action } = body // 'approve' | 'reject' | 'revert'

    // 'revert' (APPROVED → DRAFT) requires EDIT_BONUS (ADMIN + FINANCE)
    // 'approve' / 'reject' requires APPROVE_BONUS (ADMIN) or FINANCE when dealAmount < 300000
    if (action === 'revert') {
      if (!hasPermission(userRole, 'EDIT_BONUS')) {
        return NextResponse.json({ error: '無權限退回' }, { status: 403 })
      }
    } else if (!hasPermission(userRole, 'APPROVE_BONUS')) {
      // Check if FINANCE can approve (dealAmount < 300000)
      if (userRole === 'FINANCE') {
        const evalForCheck = await prisma.projectBonusEval.findUnique({
          where: { projectId },
          select: { dealAmount: true },
        })
        if (!evalForCheck || Number(evalForCheck.dealAmount) >= 300000) {
          return NextResponse.json({ error: '金額 30 萬以上僅管理員可核准' }, { status: 403 })
        }
      } else {
        return NextResponse.json({ error: '無核准權限' }, { status: 403 })
      }
    }

    const eval_ = await prisma.projectBonusEval.findUnique({
      where: { projectId },
    })

    if (!eval_) {
      return NextResponse.json({ error: '評估不存在' }, { status: 404 })
    }

    // Validate state transitions
    if (action === 'revert' && eval_.status !== 'APPROVED') {
      return NextResponse.json({ error: '只有已核准的評估可以退回草稿' }, { status: 400 })
    }

    const userEmail = session.user?.email || 'system'

    let newStatus: string
    if (action === 'approve') {
      newStatus = 'APPROVED'
    } else if (action === 'reject' || action === 'revert') {
      newStatus = 'DRAFT'
    } else {
      return NextResponse.json({ error: '無效操作' }, { status: 400 })
    }

    const updated = await prisma.projectBonusEval.update({
      where: { projectId },
      data: {
        status: newStatus,
        ...(action === 'approve' ? { approvedBy: userEmail } : {}),
        ...(action === 'reject' || action === 'revert' ? { approvedBy: null } : {}),
      },
    })

    return NextResponse.json({ success: true, eval: updated })
  } catch (error) {
    console.error('Error updating bonus eval status:', error)
    return NextResponse.json({ error: '更新狀態失敗' }, { status: 500 })
  }
}
