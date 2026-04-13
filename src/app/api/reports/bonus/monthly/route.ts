/**
 * GET /api/reports/bonus/monthly
 * Returns a user's credit events for a given year/month.
 * Query params: ?year=YYYY&month=M[M]&userId=xxx (userId optional; admin only)
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

  // Only ADMIN/FINANCE/MANAGER can query other users
  const canViewOthers = ['ADMIN', 'FINANCE', 'MANAGER'].includes(userRole || '')

  let targetUserId: string
  if (requestedUserId && canViewOthers) {
    targetUserId = requestedUserId
  } else {
    const me = await prisma.user.findUnique({ where: { email: sessionEmail! }, select: { id: true } })
    if (!me) return NextResponse.json({ error: '找不到使用者' }, { status: 404 })
    targetUserId = me.id
  }

  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 1)

  // 1. New member assignments this month
  const newAssignments = await prisma.projectBonusMember.findMany({
    where: {
      userId: targetUserId,
      createdAt: { gte: start, lt: end },
    },
    include: {
      eval: {
        include: { project: { select: { name: true, partner: { select: { name: true } } } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // 2. Evals approved this month that this user is a member of
  const approvedThisMonth = await prisma.projectBonusMember.findMany({
    where: {
      userId: targetUserId,
      eval: {
        status: 'APPROVED',
        approvedAt: { gte: start, lt: end },
      },
    },
    include: {
      eval: {
        include: { project: { select: { name: true, partner: { select: { name: true } } } } },
      },
    },
    orderBy: { eval: { approvedAt: 'desc' } },
  })

  // 3. Evals evaluated (submitted) this month
  const evaluatedThisMonth = await prisma.projectBonusMember.findMany({
    where: {
      userId: targetUserId,
      eval: {
        status: 'EVALUATED',
        evaluatedAt: { gte: start, lt: end },
      },
    },
    include: {
      eval: {
        include: { project: { select: { name: true, partner: { select: { name: true } } } } },
      },
    },
    orderBy: { eval: { evaluatedAt: 'desc' } },
  })

  // 4. YTD summary: all confirmed + projected points for this user this year
  const ytdMembers = await prisma.projectBonusMember.findMany({
    where: {
      userId: targetUserId,
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

  // Compute YTD
  let ytdConfirmed = 0
  let ytdProjected = 0
  for (const m of ytdMembers) {
    const score = Number(m.score ?? 0)
    if (m.eval.status === 'APPROVED' || m.eval.status === 'PAID') {
      ytdConfirmed += score
    } else {
      ytdProjected += score
    }
  }

  const formatMember = (m: typeof newAssignments[0], eventType: string) => ({
    eventType,
    evalId: m.evalId,
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
  ]

  // Deduplicate by evalId+eventType (a record may appear in multiple queries if assigned+approved same month)
  const seen = new Set<string>()
  const uniqueEvents = events.filter(e => {
    const key = `${e.evalId}:${e.eventType}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Sort by eventDate desc
  uniqueEvents.sort((a, b) => new Date(b.eventDate!).getTime() - new Date(a.eventDate!).getTime())

  return NextResponse.json({
    year,
    month,
    userId: targetUserId,
    events: uniqueEvents,
    ytd: {
      confirmed: ytdConfirmed,
      projected: ytdProjected,
      total: ytdConfirmed + ytdProjected,
    },
  })
}
