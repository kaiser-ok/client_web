import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * GET /api/settings/event-push/outbox
 * 回傳最近 20 筆外送紀錄 + 各狀態統計，供設定頁監控用
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: '未授權' }, { status: 401 })

  const [recent, grouped] = await Promise.all([
    prisma.eventOutbox.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true, eventId: true, eventType: true, status: true,
        attempts: true, responseCode: true, lastError: true,
        sentAt: true, createdAt: true, nextRetryAt: true,
      },
    }),
    prisma.eventOutbox.groupBy({ by: ['status'], _count: true }),
  ])

  const counts: Record<string, number> = {}
  for (const g of grouped) counts[g.status] = g._count

  return NextResponse.json({ recent, counts })
}
