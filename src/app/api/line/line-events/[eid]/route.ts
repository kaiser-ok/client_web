import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { calcSLADueDates, DEFAULT_SLA_RULES } from '@/lib/line-event-sla'

const EVENT_INCLUDE = {
  assignee: { select: { id: true, email: true, name: true, image: true } },
  partner:  { select: { id: true, name: true } },
  project:  { select: { id: true, name: true } },
  channels: {
    include: {
      channel: { select: { id: true, channelName: true, channelType: true, lineChannelId: true } },
    },
  },
  labels: true,
  comments: {
    orderBy: { createdAt: 'asc' as const },
  },
  notifications: {
    orderBy: { sentAt: 'desc' as const },
    take: 10,
  },
  _count: { select: { comments: true } },
}

/**
 * GET /api/line/line-events/[eid]
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eid: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未授權' }, { status: 401 })

    const { eid } = await params
    const event = await prisma.lineEvent.findUnique({
      where: { id: eid },
      include: EVENT_INCLUDE,
    })
    if (!event) return NextResponse.json({ error: '事件不存在' }, { status: 404 })
    return NextResponse.json(event)
  } catch (e) {
    console.error('[line-events/[eid] GET]', e)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}

/**
 * PUT /api/line/line-events/[eid]
 * 更新事件基本資訊（標題、描述、優先級、指派人、專案）
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ eid: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return NextResponse.json({ error: '未授權' }, { status: 401 })

    const { eid } = await params
    const body = await request.json()
    const { title, description, priority, assigneeId, partnerId, projectId } = body

    const existing = await prisma.lineEvent.findUnique({ where: { id: eid } })
    if (!existing) return NextResponse.json({ error: '事件不存在' }, { status: 404 })

    const updateData: Record<string, unknown> = {}
    if (title       !== undefined) updateData.title       = title
    if (description !== undefined) updateData.description = description
    if (assigneeId  !== undefined) updateData.assigneeId  = assigneeId || null
    if (partnerId   !== undefined) updateData.partnerId   = partnerId  || null
    if (projectId   !== undefined) updateData.projectId   = projectId  || null

    // 優先級變更 → 重新計算 SLA
    if (priority !== undefined && priority !== existing.priority) {
      updateData.priority = priority
      const slaConfig = await prisma.systemConfig.findUnique({ where: { key: 'line_event_sla_config' } })
      const slaRules = slaConfig ? JSON.parse(slaConfig.value).rules : DEFAULT_SLA_RULES
      const { slaResponseDue, slaResolveDue } = calcSLADueDates(priority, existing.createdAt, slaRules)
      updateData.slaResponseDue = slaResponseDue
      updateData.slaResolveDue  = slaResolveDue
    }

    const event = await prisma.lineEvent.update({
      where: { id: eid },
      data: updateData,
      include: EVENT_INCLUDE,
    })
    return NextResponse.json(event)
  } catch (e) {
    console.error('[line-events/[eid] PUT]', e)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}

/**
 * DELETE /api/line/line-events/[eid]
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ eid: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未授權' }, { status: 401 })

    const { eid } = await params
    await prisma.lineEvent.delete({ where: { id: eid } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[line-events/[eid] DELETE]', e)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
