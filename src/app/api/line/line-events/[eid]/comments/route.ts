import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { notifyNewComment } from '@/lib/line-event-notifier'

/**
 * GET /api/line/line-events/[eid]/comments
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eid: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未授權' }, { status: 401 })

    const { eid } = await params
    const comments = await prisma.lineEventComment.findMany({
      where: { eventId: eid },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json(comments)
  } catch (e) {
    console.error('[line-events/[eid]/comments GET]', e)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}

/**
 * POST /api/line/line-events/[eid]/comments
 * Body: { content }
 * 第一則備註視為「首次回應」，更新 slaResponseAt
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eid: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return NextResponse.json({ error: '未授權' }, { status: 401 })

    const { eid } = await params
    const { content } = await request.json()
    if (!content?.trim()) return NextResponse.json({ error: '備註內容不得為空' }, { status: 400 })

    const [comment] = await prisma.$transaction(async (tx) => {
      const c = await tx.lineEventComment.create({
        data: { eventId: eid, content: content.trim(), authorEmail: session.user!.email! },
      })
      // 若尚未有首次回應時間，記錄之
      await tx.lineEvent.updateMany({
        where: { id: eid, slaResponseAt: null },
        data: { slaResponseAt: new Date() },
      })
      return [c]
    })

    // 通知指派人
    const event = await prisma.lineEvent.findUnique({
      where: { id: eid },
      select: { assigneeId: true, assignee: { select: { email: true } } },
    })
    if (event?.assignee?.email) {
      notifyNewComment(eid, event.assignee.email, session.user.email!).catch(console.error)
    }

    return NextResponse.json(comment, { status: 201 })
  } catch (e) {
    console.error('[line-events/[eid]/comments POST]', e)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
