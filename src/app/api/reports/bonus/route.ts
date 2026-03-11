import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { hasPermission } from '@/constants/roles'

// GET: 年度獎金報表
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const userRole = (session.user as { role?: string })?.role
    if (!hasPermission(userRole, 'VIEW_BONUS')) {
      return NextResponse.json({ error: '無權限' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
    const statusFilter = searchParams.get('status') // optional: APPROVED, PAID, etc.

    // Get point rate from system config (每點兌換金額，預設 1000)
    const rateConfig = await prisma.systemConfig.findUnique({
      where: { key: `bonus_point_rate_${year}` },
    })
    const pointRate = rateConfig ? parseFloat(rateConfig.value) : 1000

    // Get all evals that contribute to this year:
    // 1. Evals from this year (warrantyYears=1 or spread year 0)
    // 2. Evals from prior years whose warranty spread covers this year
    const allEvals = await prisma.projectBonusEval.findMany({
      where: {
        year: { lte: year },
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      include: {
        project: {
          select: {
            name: true,
            type: true,
            partner: { select: { name: true } },
            deal: { select: { name: true } },
          },
        },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        costs: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    // Filter evals that actually contribute to the selected year
    // and compute the effective score ratio for this year
    const evals = allEvals.filter(ev => {
      const wYears = ev.warrantyYears || 1
      const yearOffset = year - ev.year
      return yearOffset >= 0 && yearOffset < wYears
    })

    // Helper: get the score multiplier for a given eval in the selected year
    const getYearSpreadRatio = (ev: typeof evals[0]): number => {
      const wYears = ev.warrantyYears || 1
      if (wYears <= 1) return 1 // no spread
      const yearOffset = year - ev.year
      const pcts = ev.scoreSpreadPcts as number[] | null
      if (pcts && pcts[yearOffset] != null) return pcts[yearOffset] / 100
      // fallback: equal distribution
      return 1 / wYears
    }

    // Aggregate by user
    const userScores = new Map<string, {
      userId: string
      userName: string
      userEmail: string
      totalScore: number
      projects: Array<{
        evalId: string
        projectId: string
        projectName: string
        partnerName: string
        dealName: string | undefined
        projectAmount: number
        totalScore: number
        role: string
        contributionPct: number
        score: number
        status: string
      }>
    }>()

    for (const ev of evals) {
      const spreadRatio = getYearSpreadRatio(ev)
      const yearOffset = year - ev.year
      // Only include members matching this year's offset
      const yearMembers = ev.members.filter(m => (m.yearOffset ?? 0) === yearOffset)
      for (const member of yearMembers) {
        const score = Number(member.score || 0)
        const existing = userScores.get(member.userId)
        const projectEntry = {
          evalId: ev.id,
          projectId: ev.projectId,
          projectName: ev.project.name,
          partnerName: ev.project.partner.name,
          dealName: ev.project.deal?.name,
          projectAmount: Number(ev.projectAmount),
          totalScore: Number(ev.totalScore),
          role: member.role,
          contributionPct: Number(member.contributionPct),
          score,
          yearOffset,
          evalYear: ev.year,
          warrantyYears: ev.warrantyYears || 1,
          status: ev.status,
        }

        if (existing) {
          existing.totalScore += score
          existing.projects.push(projectEntry)
        } else {
          userScores.set(member.userId, {
            userId: member.userId,
            userName: member.user.name || member.user.email,
            userEmail: member.user.email,
            totalScore: score,
            projects: [projectEntry],
          })
        }
      }
    }

    const allMembersTotal = Array.from(userScores.values()).reduce((sum, u) => sum + u.totalScore, 0)

    // Calculate confirmed vs projected scores per user
    // APPROVED = confirmed, DRAFT/EVALUATED = projected
    const rows = Array.from(userScores.values())
      .sort((a, b) => b.totalScore - a.totalScore)
      .map(row => {
        const confirmedScore = row.projects
          .filter(p => p.status === 'APPROVED')
          .reduce((s, p) => s + p.score, 0)
        const projectedScore = row.projects
          .filter(p => p.status !== 'APPROVED')
          .reduce((s, p) => s + p.score, 0)
        return {
          ...row,
          confirmedScore: Math.round(confirmedScore * 100) / 100,
          projectedScore: Math.round(projectedScore * 100) / 100,
          bonusAmount: Math.round(row.totalScore * pointRate),
          confirmedBonusAmount: Math.round(confirmedScore * pointRate),
          projectedBonusAmount: Math.round(projectedScore * pointRate),
        }
      })

    // Project summary
    const projectSummary = evals.map(ev => {
      const spreadRatio = getYearSpreadRatio(ev)
      return {
        evalId: ev.id,
        projectId: ev.projectId,
        projectName: ev.project.name,
        partnerName: ev.project.partner.name,
        dealName: ev.project.deal?.name,
        dealAmount: Number(ev.dealAmount),
        totalCost: Number(ev.totalCost),
        projectAmount: Number(ev.projectAmount),
        baseScore: Number(ev.baseScore),
        importanceAdj: Number(ev.importanceAdj),
        qualityAdj: Number(ev.qualityAdj),
        efficiencyAdj: Number(ev.efficiencyAdj),
        totalScore: Number(ev.totalScore),
        effectiveScore: Math.round(Number(ev.totalScore) * spreadRatio * 100) / 100,
        warrantyYears: ev.warrantyYears || 1,
        scoreSpreadPcts: ev.scoreSpreadPcts as number[] | null,
        spreadRatio,
        evalYear: ev.year,
        status: ev.status,
        memberCount: ev.members.length,
        costs: ev.costs.map(c => ({
          category: c.category,
          description: c.description,
          amount: Number(c.amount),
        })),
      }
    })

    // Aggregate confirmed vs projected totals
    const confirmedTotal = rows.reduce((s, r) => s + r.confirmedScore, 0)
    const projectedTotal = rows.reduce((s, r) => s + r.projectedScore, 0)

    return NextResponse.json({
      year,
      pointRate,
      allMembersTotal: Math.round(allMembersTotal * 100) / 100,
      confirmedTotal: Math.round(confirmedTotal * 100) / 100,
      projectedTotal: Math.round(projectedTotal * 100) / 100,
      rows,
      projectSummary,
      evalCount: evals.length,
    })
  } catch (error) {
    console.error('Error fetching bonus report:', error)
    return NextResponse.json({ error: '取得獎金報表失敗' }, { status: 500 })
  }
}

// PUT: 設定每點兌換金額
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const userRole = (session.user as { role?: string })?.role
    if (!hasPermission(userRole, 'APPROVE_BONUS')) {
      return NextResponse.json({ error: '只有管理員可以設定每點兌換金額' }, { status: 403 })
    }

    const { year, pointRate } = await request.json()
    if (!year || pointRate == null) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 })
    }

    await prisma.systemConfig.upsert({
      where: { key: `bonus_point_rate_${year}` },
      update: { value: String(pointRate), updatedBy: session.user?.email || 'system' },
      create: { key: `bonus_point_rate_${year}`, value: String(pointRate), updatedBy: session.user?.email || 'system' },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error setting point rate:', error)
    return NextResponse.json({ error: '設定每點兌換金額失敗' }, { status: 500 })
  }
}
