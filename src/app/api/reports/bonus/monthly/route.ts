/**
 * GET /api/reports/bonus/monthly
 * Returns credit events for a given year/month.
 * Query params: ?year=YYYY&month=M[M]&userId=xxx|__all__ (userId optional; admin/finance/manager only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: '未授權' }, { status: 401 })

  const sp = request.nextUrl.searchParams
  const year = parseInt(sp.get('year') || String(new Date().getFullYear()))
  const month = parseInt(sp.get('month') || String(new Date().getMonth() + 1))
  const requestedUserId = sp.get('userId')

  const userRole = (session.user as { role?: string })?.role
  const sessionEmail = session.user?.email

  const canViewOthers = ['ADMIN', 'FINANCE', 'MANAGER'].includes(userRole || '')
  const isAllMode = requestedUserId === '__all__' && userRole === 'ADMIN'

  let targetUserId: string | null = null
  if (isAllMode) {
    targetUserId = null // no filter
  } else if (requestedUserId && canViewOthers) {
    targetUserId = requestedUserId
  } else {
    const me = await prisma.user.findUnique({ where: { email: sessionEmail! }, select: { id: true } })
    if (!me) return NextResponse.json({ error: '找不到使用者' }, { status: 404 })
    targetUserId = me.id
  }

  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 1)

  const userFilter = targetUserId ? { userId: targetUserId } : {}

  // 1. New member assignments this month
  const newAssignments = await prisma.projectBonusMember.findMany({
    where: {
      ...userFilter,
      createdAt: { gte: start, lt: end },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      eval: {
        include: { project: { select: { name: true, partner: { select: { name: true } } } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // 2. Evals approved this month
  const approvedThisMonth = await prisma.projectBonusMember.findMany({
    where: {
      ...userFilter,
      eval: {
        status: 'APPROVED',
        approvedAt: { gte: start, lt: end },
      },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      eval: {
        include: { project: { select: { name: true, partner: { select: { name: true } } } } },
      },
    },
    orderBy: { eval: { approvedAt: 'desc' } },
  })

  // 3. Evals evaluated (submitted) this month
  const evaluatedThisMonth = await prisma.projectBonusMember.findMany({
    where: {
      ...userFilter,
      eval: {
        status: 'EVALUATED',
        evaluatedAt: { gte: start, lt: end },
      },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      eval: {
        include: { project: { select: { name: true, partner: { select: { name: true } } } } },
      },
    },
    orderBy: { eval: { evaluatedAt: 'desc' } },
  })

  // 4. Score change audit logs this month
  const scoreChangesThisMonth = await prisma.bonusMemberScoreLog.findMany({
    where: {
      ...userFilter,
      changedAt: { gte: start, lt: end },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      eval: {
        select: {
          projectId: true,
          year: true,
          status: true,
          project: { select: { name: true, partner: { select: { name: true } } } },
        },
      },
    },
    orderBy: { changedAt: 'desc' },
  })

  // 5. YTD summary
  const ytdMembers = await prisma.projectBonusMember.findMany({
    where: {
      ...userFilter,
      eval: { year },
    },
    include: {
      eval: {
        select: {
          projectId: true,
          year: true,
          status: true,
          warrantyYears: true,
          scoreSpreadPcts: true,
          totalScore: true,
          poolAllocations: { select: { points: true } },
          project: { select: { name: true, partner: { select: { name: true } } } },
        },
      },
    },
  })

  // Compute YTD (DRAFT excluded from projected)
  let ytdConfirmed = 0
  let ytdProjected = 0
  for (const m of ytdMembers) {
    const score = Number(m.score ?? 0)
    if (m.eval.status === 'APPROVED' || m.eval.status === 'PAID') {
      ytdConfirmed += score
    } else if (m.eval.status !== 'DRAFT') {
      ytdProjected += score
    }
  }

  const formatMember = (m: typeof newAssignments[0], eventType: string) => ({
    eventType,
    evalId: m.evalId,
    userId: m.userId,
    userName: m.user.name || m.user.email,
    projectId: m.eval.projectId,
    projectName: m.eval.project.name,
    partnerName: m.eval.project.partner.name,
    role: m.role,
    yearOffset: m.yearOffset,
    contributionPct: Number(m.contributionPct),
    score: Number(m.score ?? 0),
    evalStatus: m.eval.status,
    evalYear: m.eval.year,
    eventDate: eventType === 'ASSIGNED'
      ? m.createdAt
      : eventType === 'APPROVED'
        ? m.eval.approvedAt
        : m.eval.evaluatedAt,
  })

  const events = [
    ...approvedThisMonth.map(m => formatMember(m, 'APPROVED')),
    ...evaluatedThisMonth.map(m => formatMember(m, 'EVALUATED')),
    ...newAssignments.map(m => formatMember(m, 'ASSIGNED')),
    ...scoreChangesThisMonth.map(log => ({
      eventType: 'SCORE_CHANGED',
      evalId: log.evalId,
      userId: log.userId,
      userName: log.user.name || log.user.email,
      projectId: log.eval.projectId,
      projectName: log.eval.project.name,
      partnerName: log.eval.project.partner.name,
      role: '',
      yearOffset: log.yearOffset,
      contributionPct: Number(log.newContributionPct),
      score: Number(log.newScore),
      oldScore: Number(log.oldScore),
      oldContributionPct: Number(log.oldContributionPct),
      evalStatus: log.eval.status,
      evalYear: log.eval.year,
      eventDate: log.changedAt,
      changedBy: log.changedBy,
    })),
  ]

  // Deduplicate by userId+evalId+eventType
  const seen = new Set<string>()
  const uniqueEvents = events.filter(e => {
    const key = `${e.userId}:${e.evalId}:${e.eventType}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  uniqueEvents.sort((a, b) => new Date(b.eventDate!).getTime() - new Date(a.eventDate!).getTime())

  return NextResponse.json({
    year,
    month,
    userId: targetUserId ?? '__all__',
    isAllMode,
    events: uniqueEvents,
    ytd: {
      confirmed: ytdConfirmed,
      projected: ytdProjected,
      total: ytdConfirmed + ytdProjected,
    },
  })
}
