import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * GET /api/line/line-events/[eid]/labels
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eid: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: '未授權' }, { status: 401 })

  const { eid } = await params
  const labels = await prisma.lineEventLabel.findMany({
    where: { eventId: eid },
    orderBy: { appliedAt: 'asc' },
  })
  return NextResponse.json(labels)
}

/**
 * PUT /api/line/line-events/[eid]/labels
 * Body: { action: 'add' | 'remove', labelId: string, syncToChannels?: boolean }
 *
 * syncToChannels=true（預設）：同時將標籤套用/移除到所有關聯的 LINE 頻道
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ eid: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: '未授權' }, { status: 401 })

  const { eid } = await params
  const { action, labelId, syncToChannels = true } = await request.json()

  if (!labelId) return NextResponse.json({ error: '缺少 labelId' }, { status: 400 })

  const event = await prisma.lineEvent.findUnique({
    where: { id: eid },
    include: { channels: { select: { channelId: true } } },
  })
  if (!event) return NextResponse.json({ error: '事件不存在' }, { status: 404 })

  const channelIds = event.channels.map(c => c.channelId)

  if (action === 'add') {
    // 1. 新增到事件
    await prisma.lineEventLabel.upsert({
      where: { eventId_labelId: { eventId: eid, labelId } },
      update: { appliedBy: session.user.email, appliedAt: new Date() },
      create: { eventId: eid, labelId, source: 'manual', appliedBy: session.user.email },
    })

    // 2. 同步到關聯頻道
    if (syncToChannels && channelIds.length > 0) {
      await Promise.all(channelIds.map(channelId =>
        prisma.lineChannelLabel.upsert({
          where: { channelId_labelId: { channelId, labelId } },
          update: { appliedBy: session.user.email, appliedAt: new Date(), source: 'manual' },
          create: { channelId, labelId, source: 'manual', appliedBy: session.user.email },
        })
      ))

      // follow_up 特殊處理
      if (labelId === 'follow_up') {
        await prisma.lineChannel.updateMany({
          where: { id: { in: channelIds } },
          data: { needsFollowUp: true, followUpAt: new Date(), followUpBy: session.user.email },
        })
      }
    }

    return NextResponse.json({ success: true, syncedChannels: syncToChannels ? channelIds.length : 0 })
  }

  if (action === 'remove') {
    // 1. 從事件移除
    await prisma.lineEventLabel.deleteMany({ where: { eventId: eid, labelId } })

    // 2. 從關聯頻道移除（只移除 manual 來源，保留 LLM 標籤）
    if (syncToChannels && channelIds.length > 0) {
      await prisma.lineChannelLabel.deleteMany({
        where: { channelId: { in: channelIds }, labelId, source: 'manual' },
      })

      if (labelId === 'follow_up') {
        await prisma.lineChannel.updateMany({
          where: { id: { in: channelIds } },
          data: { needsFollowUp: false, followUpAt: null, followUpBy: null },
        })
      }
    }

    return NextResponse.json({ success: true, syncedChannels: syncToChannels ? channelIds.length : 0 })
  }

  return NextResponse.json({ error: '未知的 action' }, { status: 400 })
}
