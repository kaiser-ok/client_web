import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * GET /api/line/line-events/[eid]/history
 * 取得事件狀態變更歷史
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eid: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未授權' }, { status: 401 })

    const { eid } = await params

    const histories = await prisma.lineEventHistory.findMany({
      where: { eventId: eid },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json(histories)
  } catch (e) {
    console.error('[line-events/[eid]/history GET]', e)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
