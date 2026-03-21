import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * GET /api/line/channels/[id]/events
 * 查詢此頻道關聯的所有事件
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未授權' }, { status: 401 })

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // 選填篩選

    const where: Record<string, unknown> = { channelId: id }
    if (status) where.event = { status }

    const eventChannels = await prisma.lineEventChannel.findMany({
      where,
      include: {
        event: {
          include: {
            assignee: { select: { id: true, email: true, name: true, image: true } },
            partner:  { select: { id: true, name: true } },
            project:  { select: { id: true, name: true } },
            labels:   true,
            _count:   { select: { comments: true, channels: true } },
          },
        },
      },
      orderBy: { event: { createdAt: 'desc' } },
    })

    const events = eventChannels.map(ec => ({
      ...ec.event,
      startMessageId: ec.startMessageId,
      endMessageId:   ec.endMessageId,
    }))

    return NextResponse.json(events)
  } catch (e) {
    console.error('[channels/[id]/events GET]', e)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
