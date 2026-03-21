import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * GET /api/line/line-events/[eid]/channels
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eid: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未授權' }, { status: 401 })

    const { eid } = await params
    const channels = await prisma.lineEventChannel.findMany({
      where: { eventId: eid },
      include: {
        channel: {
          select: {
            id: true, channelName: true, channelType: true, lineChannelId: true,
            lastMessageAt: true, status: true,
          },
        },
      },
      orderBy: { addedAt: 'asc' },
    })
    return NextResponse.json(channels)
  } catch (e) {
    console.error('[line-events/[eid]/channels GET]', e)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}

/**
 * POST /api/line/line-events/[eid]/channels
 * Body: { channelId, startMessageId? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eid: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return NextResponse.json({ error: '未授權' }, { status: 401 })

    const { eid } = await params
    const { channelId, startMessageId } = await request.json()

    const ec = await prisma.lineEventChannel.upsert({
      where: { eventId_channelId: { eventId: eid, channelId } },
      update: { startMessageId: startMessageId ?? null },
      create: {
        eventId:       eid,
        channelId,
        startMessageId: startMessageId ?? null,
        addedBy: session.user.email,
      },
      include: {
        channel: { select: { id: true, channelName: true, channelType: true, lineChannelId: true } },
      },
    })
    return NextResponse.json(ec, { status: 201 })
  } catch (e) {
    console.error('[line-events/[eid]/channels POST]', e)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}

/**
 * DELETE /api/line/line-events/[eid]/channels
 * Body: { channelId }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ eid: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未授權' }, { status: 401 })

    const { eid } = await params
    const { channelId } = await request.json()

    await prisma.lineEventChannel.delete({
      where: { eventId_channelId: { eventId: eid, channelId } },
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[line-events/[eid]/channels DELETE]', e)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
