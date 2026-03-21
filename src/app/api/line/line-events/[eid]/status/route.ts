import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { notifyAssigned, notifyEventClosed } from '@/lib/line-event-notifier'
import createLineClient from '@/lib/line'

type Action = 'assign' | 'start' | 'resolve' | 'close' | 'reopen'

const TRANSITIONS: Record<string, Action[]> = {
  NEW:         ['assign', 'start', 'resolve', 'close'],
  IN_PROGRESS: ['resolve', 'close'],
  RESOLVED:    ['close', 'reopen'],
  CLOSED:      ['reopen'],
}

/**
 * PUT /api/line/line-events/[eid]/status
 * Body: { action: 'assign' | 'start' | 'resolve' | 'close' | 'reopen', assigneeId?: string }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ eid: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return NextResponse.json({ error: '未授權' }, { status: 401 })

    const { eid } = await params
    const { action, assigneeId, closeMessage } = await request.json() as { action: Action; assigneeId?: string; closeMessage?: string }

    const existing = await prisma.lineEvent.findUnique({ where: { id: eid } })
    if (!existing) return NextResponse.json({ error: '事件不存在' }, { status: 404 })

    const allowed = TRANSITIONS[existing.status] ?? []
    if (!allowed.includes(action)) {
      return NextResponse.json(
        { error: `目前狀態 ${existing.status} 不允許執行 ${action}` },
        { status: 400 }
      )
    }

    const now = new Date()
    const email = session.user.email
    const updateData: Record<string, unknown> = {}
    let lineMessageFailed = false

    switch (action) {
      case 'assign':
        if (!assigneeId) return NextResponse.json({ error: '缺少 assigneeId' }, { status: 400 })
        updateData.assigneeId   = assigneeId
        updateData.status       = 'IN_PROGRESS'
        updateData.slaResponseAt = existing.slaResponseAt ?? now
        break
      case 'start':
        updateData.status       = 'IN_PROGRESS'
        updateData.slaResponseAt = existing.slaResponseAt ?? now
        break
      case 'resolve':
        updateData.status      = 'RESOLVED'
        updateData.resolvedAt  = now
        updateData.resolvedBy  = email
        break
      case 'close':
        updateData.status    = 'CLOSED'
        updateData.closedAt  = now
        updateData.closedBy  = email
        break
      case 'reopen':
        updateData.status      = 'IN_PROGRESS'
        updateData.resolvedAt  = null
        updateData.resolvedBy  = null
        break
    }

    const event = await prisma.lineEvent.update({
      where: { id: eid },
      data: updateData,
      include: {
        assignee: { select: { id: true, email: true, name: true, image: true } },
        project:  { select: { id: true, name: true } },
        channels: {
          include: {
            channel: { select: { id: true, channelName: true, channelType: true, lineChannelId: true } },
          },
        },
        labels: true,
        _count: { select: { comments: true } },
      },
    })

    // 寫入狀態變更歷史
    const historyNote = action === 'resolve' && closeMessage?.trim() ? `解決回覆：${closeMessage.trim().slice(0, 100)}` : undefined
    await prisma.lineEventHistory.create({
      data: {
        eventId: eid,
        action,
        fromStatus: existing.status,
        toStatus: (updateData.status as string) ?? existing.status,
        note: historyNote,
        byEmail: email,
      },
    })

    // reopen 時，將所有關聯頻道狀態設回 IN_PROGRESS
    if (action === 'reopen') {
      await prisma.lineChannel.updateMany({
        where: { id: { in: event.channels.map(ec => ec.channel.id) } },
        data: { status: 'IN_PROGRESS' },
      })
    }

    // 非同步通知，不阻塞回應
    if (action === 'assign' && assigneeId) {
      const assignee = await prisma.user.findUnique({ where: { id: assigneeId }, select: { email: true } })
      if (assignee) notifyAssigned(eid, assignee.email).catch(console.error)
    }
    // 標記解決時：推送回覆訊息到關聯 LINE 頻道
    if (action === 'resolve' && closeMessage?.trim()) {
      try {
        const lineClient = createLineClient()
        const text = closeMessage.trim()
        const staffUserId = `staff:${email}`

        await prisma.lineUser.upsert({
          where: { lineUserId: staffUserId },
          update: {},
          create: {
            lineUserId: staffUserId,
            displayName: email.split('@')[0],
            identityType: 'STAFF',
          },
        })

        await Promise.allSettled(
          event.channels.map(async ec => {
            try {
              await lineClient.pushMessage(ec.channel.lineChannelId, [{ type: 'text', text }])
            } catch (err) {
              lineMessageFailed = true
              console.error('[resolve message push failed]', ec.channel.lineChannelId, err)
            }
            const msgTimestamp = new Date()
            await prisma.lineMessage.create({
              data: {
                lineMessageId: `staff-resolve-${eid}-${ec.channel.id}-${Date.now()}`,
                channelId: ec.channel.id,
                lineUserId: staffUserId,
                messageType: 'text',
                content: text,
                timestamp: msgTimestamp,
                processed: true,
              },
            })
            await prisma.lineChannel.update({
              where: { id: ec.channel.id },
              data: { lastMessageAt: msgTimestamp },
            })
          })
        )
      } catch (err) {
        lineMessageFailed = true
        console.error('[resolve message push]', err)
      }
    }

    if (action === 'close') {
      notifyEventClosed(eid, existing.createdBy, email).catch(console.error)

      // 檢查每個關聯頻道，若該頻道所有事件都已結案，則清除頻道標籤
      ;(async () => {
        try {
          for (const ec of event.channels) {
            const channelId = ec.channel.id
            const activeCount = await prisma.lineEvent.count({
              where: {
                status: { not: 'CLOSED' },
                channels: { some: { channelId } },
              },
            })
            if (activeCount === 0) {
              await prisma.lineChannelLabel.deleteMany({ where: { channelId } })
              await prisma.lineChannel.update({
                where: { id: channelId },
                data: { status: 'CLEAR' },
              })
            }
          }
        } catch (err) {
          console.error('[auto clear channel labels]', err)
        }
      })()
    }

    return NextResponse.json({ ...event, lineMessageFailed })
  } catch (e) {
    console.error('[line-events/[eid]/status PUT]', e)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
