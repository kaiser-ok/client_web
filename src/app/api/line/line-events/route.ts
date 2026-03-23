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
  _count: { select: { comments: true } },
}

/**
 * GET /api/line/line-events
 * 查詢事件列表，支援多維篩選
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未授權' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const status     = searchParams.get('status')       // NEW | IN_PROGRESS | RESOLVED | CLOSED
    const priority   = searchParams.get('priority')     // P1 | P2 | NORMAL
    const assigneeId = searchParams.get('assigneeId')
    const projectId  = searchParams.get('projectId')
    const channelId  = searchParams.get('channelId')    // 篩選含此頻道的事件
    const slaBreached = searchParams.get('slaBreached') // true | false
    const history    = searchParams.get('history') === 'true' // 歷史區：已結案超過72小時
    const page  = parseInt(searchParams.get('page')  ?? '1')
    const limit = parseInt(searchParams.get('limit') ?? '20')

    const cutoff72h = new Date(Date.now() - 72 * 60 * 60 * 1000)

    const where: Record<string, unknown> = {}
    if (priority)   where.priority = priority
    if (assigneeId) where.assigneeId = assigneeId
    if (projectId)  where.projectId = projectId
    if (slaBreached !== null) where.slaBreached = slaBreached === 'true'
    if (channelId) {
      where.channels = { some: { channelId } }
    }

    if (history) {
      // 歷史區：只顯示結案超過 72 小時的事件
      where.status = 'CLOSED'
      where.closedAt = { lt: cutoff72h }
    } else {
      // 事件管理區：排除結案超過 72 小時的事件
      if (status === 'CLOSED') {
        where.status = 'CLOSED'
        where.closedAt = { gte: cutoff72h }
      } else if (status) {
        where.status = status
      } else {
        where.NOT = { AND: [{ status: 'CLOSED' }, { closedAt: { lt: cutoff72h } }] }
      }
    }

    const [total, events] = await Promise.all([
      prisma.lineEvent.count({ where }),
      prisma.lineEvent.findMany({
        where,
        include: EVENT_INCLUDE,
        orderBy: history
          ? [{ closedAt: 'desc' }]
          : [{ status: 'asc' }, { slaResolveDue: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    return NextResponse.json({ events, total, page, limit })
  } catch (e) {
    console.error('[line-events GET]', e)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}

/**
 * POST /api/line/line-events
 * 建立新事件
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return NextResponse.json({ error: '未授權' }, { status: 401 })

    const body = await request.json()
    const {
      title,
      description,
      priority = 'NORMAL',
      source = 'manual',
      partnerId,
      projectId,
      assigneeId,
      channelIds = [],      // [{ channelId, startMessageId? }]
      labelIds   = [],
    } = body

    // 載入 SLA 設定
    const slaConfig = await prisma.systemConfig.findUnique({ where: { key: 'line_event_sla_config' } })
    const slaRules = slaConfig ? JSON.parse(slaConfig.value).rules : DEFAULT_SLA_RULES
    const { slaResponseDue, slaResolveDue } = calcSLADueDates(priority, new Date(), slaRules)

    const event = await prisma.lineEvent.create({
      data: {
        title,
        description,
        priority,
        source,
        partnerId:  partnerId  || null,
        projectId:  projectId  || null,
        assigneeId: assigneeId || null,
        slaResponseDue,
        slaResolveDue,
        createdBy: session.user.email,
        channels: {
          create: channelIds.map((c: { channelId: string; startMessageId?: string }) => ({
            channelId:      c.channelId,
            startMessageId: c.startMessageId ?? null,
            addedBy: session.user!.email,
          })),
        },
        labels: {
          create: labelIds.map((labelId: string) => ({
            labelId,
            appliedBy: session.user!.email,
          })),
        },
      },
      include: EVENT_INCLUDE,
    })

    // 將關聯頻道狀態設為處理中
    if (channelIds.length > 0) {
      await prisma.lineChannel.updateMany({
        where: { id: { in: channelIds.map((c: { channelId: string }) => c.channelId) } },
        data: { status: 'IN_PROGRESS' },
      })
    }

    return NextResponse.json(event, { status: 201 })
  } catch (e) {
    console.error('[line-events POST]', e)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
