import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { autoCreateEventFromLabel } from '@/lib/line-event-auto'

/**
 * GET /api/line/channels/[id]/labels
 * 取得頻道標籤
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id } = await params

    const labels = await prisma.lineChannelLabel.findMany({
      where: { channelId: id },
      orderBy: { appliedAt: 'desc' },
    })

    return NextResponse.json({ labels })
  } catch (error) {
    console.error('Error fetching channel labels:', error)
    return NextResponse.json({ error: '取得標籤失敗' }, { status: 500 })
  }
}

/**
 * PUT /api/line/channels/[id]/labels
 * 新增或移除頻道標籤
 * Body: { action: "add" | "remove", labelId: string, note?: string }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { action, labelId, note } = body

    if (!labelId) {
      return NextResponse.json({ error: '缺少 labelId' }, { status: 400 })
    }

    // Verify channel exists
    const channel = await prisma.lineChannel.findUnique({ where: { id } })
    if (!channel) {
      return NextResponse.json({ error: '頻道不存在' }, { status: 404 })
    }

    if (action === 'add') {
      const label = await prisma.lineChannelLabel.upsert({
        where: {
          channelId_labelId: { channelId: id, labelId },
        },
        update: {
          source: 'manual',
          confidence: null,
          appliedBy: session.user.email,
          appliedAt: new Date(),
          note: note || null,
        },
        create: {
          channelId: id,
          labelId,
          source: 'manual',
          appliedBy: session.user.email,
          note: note || null,
        },
      })

      // If adding follow_up label, also update the legacy needsFollowUp field
      if (labelId === 'follow_up') {
        await prisma.lineChannel.update({
          where: { id },
          data: {
            needsFollowUp: true,
            followUpAt: new Date(),
            followUpBy: session.user.email,
          },
        })
      }

      // 自動建立事件（P1/P2 標籤觸發，非同步不阻塞）
      autoCreateEventFromLabel(id, labelId, 'manual', session.user.email!).catch(console.error)

      // 同步標籤到此頻道進行中的事件（非同步）
      ;(async () => {
        const activeEventChannels = await prisma.lineEventChannel.findMany({
          where: { channelId: id, event: { status: { in: ['NEW', 'IN_PROGRESS'] } } },
          select: { eventId: true },
        })
        await Promise.all(activeEventChannels.map(ec =>
          prisma.lineEventLabel.upsert({
            where: { eventId_labelId: { eventId: ec.eventId, labelId } },
            update: { appliedBy: session.user!.email!, appliedAt: new Date() },
            create: { eventId: ec.eventId, labelId, source: 'manual', appliedBy: session.user!.email! },
          })
        ))
      })().catch(console.error)

      return NextResponse.json({ success: true, label })
    }

    if (action === 'remove') {
      await prisma.lineChannelLabel.deleteMany({
        where: { channelId: id, labelId },
      })

      // If removing follow_up label, also update the legacy needsFollowUp field
      if (labelId === 'follow_up') {
        await prisma.lineChannel.update({
          where: { id },
          data: {
            needsFollowUp: false,
            followUpAt: null,
            followUpBy: null,
            followUpNote: null,
          },
        })
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: '未知的 action' }, { status: 400 })
  } catch (error) {
    console.error('Error updating channel labels:', error)
    return NextResponse.json({ error: '更新標籤失敗' }, { status: 500 })
  }
}
