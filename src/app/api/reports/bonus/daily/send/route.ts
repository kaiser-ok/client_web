/**
 * POST /api/reports/bonus/daily/send
 * Admin-only: manually trigger daily bonus Slack notifications.
 * Body: { date?: string (YYYY-MM-DD, defaults to today), userId?: string (limit to one user for testing) }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sendDailyBonusNotifications } from '@/lib/bonus-daily-notifier'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: '未授權' }, { status: 401 })

  const userRole = (session.user as { role?: string })?.role
  if (userRole !== 'ADMIN') {
    return NextResponse.json({ error: '僅管理員可操作' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { date, userId } = body as { date?: string; userId?: string }

  const targetDate = date ? new Date(date) : new Date()

  const stats = await sendDailyBonusNotifications(targetDate, userId)
  return NextResponse.json({ success: true, date: targetDate.toISOString().slice(0, 10), ...stats })
}
