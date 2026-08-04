import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { calcSLADueDates, DEFAULT_SLA_RULES } from '@/lib/line-event-sla'
import { enqueueEventPush } from '@/lib/event-push'

// PATCH /api/line/line-events/candidates/[id]
// body: { action: 'approve' | 'dismiss', title?, description?, priority?, partnerId?, projectId?, assigneeId? }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const candidate = await prisma.lineEventCandidate.findUnique({ where: { id } })
  if (!candidate) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (candidate.status !== 'PENDING') {
    return NextResponse.json({ error: '已審核過的建議無法再操作' }, { status: 400 })
  }

  const body = await request.json()
  const { action, title, description, priority, partnerId, projectId, assigneeId } = body

  if (action === 'dismiss') {
    const updated = await prisma.lineEventCandidate.update({
      where: { id },
      data: { status: 'DISMISSED', reviewedBy: session.user.email, reviewedAt: new Date() },
    })
    return NextResponse.json(updated)
  }

  if (action === 'approve') {
    const finalTitle    = title    || candidate.title
    const finalPriority = priority || candidate.suggestedPriority
    const finalDesc     = description || candidate.summary

    const slaConfig = await prisma.systemConfig.findUnique({ where: { key: 'line_event_sla_config' } })
    const slaRules = slaConfig ? JSON.parse(slaConfig.value).rules : DEFAULT_SLA_RULES
    const { slaResponseDue, slaResolveDue } = calcSLADueDates(finalPriority, new Date(), slaRules)

    const event = await prisma.lineEvent.create({
      data: {
        title: finalTitle,
        description: finalDesc,
        priority: finalPriority,
        source: 'auto',
        partnerId:  partnerId  || null,
        projectId:  projectId  || null,
        assigneeId: assigneeId || null,
        slaResponseDue,
        slaResolveDue,
        createdBy: session.user.email,
        channels: {
          create: [{
            channelId: candidate.channelId,
            addedBy: session.user.email,
          }],
        },
      },
    })

    await prisma.lineChannel.update({
      where: { id: candidate.channelId },
      data: { status: 'IN_PROGRESS' },
    })

    await prisma.lineEventCandidate.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedBy: session.user.email,
        reviewedAt: new Date(),
        lineEventId: event.id,
      },
    })

    // 推送新事件到外部系統（非阻塞）
    enqueueEventPush(event.id, 'CREATED')

    return NextResponse.json({ eventId: event.id })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
