/**
 * LINE 事件自動建立工具
 * 當頻道被打上 P1/P2 標籤時，自動建立對應優先級的事件
 */

import prisma from '@/lib/prisma'
import { calcSLADueDates, DEFAULT_SLA_RULES } from '@/lib/line-event-sla'
import { enqueueEventPush } from '@/lib/event-push'

// 觸發自動建立事件的標籤
const AUTO_EVENT_LABEL_MAP: Record<string, { priority: string; titlePrefix: string }> = {
  p1: { priority: 'P1', titlePrefix: 'P1 故障' },
  p2: { priority: 'P2', titlePrefix: 'P2 問題' },
}

/**
 * 當頻道套用標籤時，自動建立事件（若尚無進行中事件）
 * @param channelId  LineChannel.id
 * @param labelId    標籤 ID（如 'p1', 'p2'）
 * @param source     'manual' | 'llm'
 * @param appliedBy  套用者 email 或 'system'
 * @param reason     LLM 給的原因（選填，作為事件描述）
 */
export async function autoCreateEventFromLabel(
  channelId: string,
  labelId: string,
  source: 'manual' | 'llm',
  appliedBy: string,
  reason?: string
) {
  const mapping = AUTO_EVENT_LABEL_MAP[labelId]
  if (!mapping) return  // 非觸發標籤，略過

  // 檢查此頻道是否已有未結案事件
  const existingEvent = await prisma.lineEventChannel.findFirst({
    where: {
      channelId,
      event: { status: { in: ['NEW', 'IN_PROGRESS'] } },
    },
    include: { event: { select: { id: true, priority: true } } },
  })

  if (existingEvent) {
    // 已有進行中事件 → 只升級優先級（若新標籤更緊急）
    const priorityOrder: Record<string, number> = { P1: 1, P2: 2, NORMAL: 3 }
    const existingPrio = existingEvent.event.priority
    if ((priorityOrder[mapping.priority] ?? 99) < (priorityOrder[existingPrio] ?? 99)) {
      await prisma.lineEvent.update({
        where: { id: existingEvent.event.id },
        data: { priority: mapping.priority },
      })
      console.log(`[line-event-auto] Upgraded event ${existingEvent.event.id} priority to ${mapping.priority}`)
    }
    return
  }

  // 取得頻道資訊（名稱、客戶、專案）
  const channel = await prisma.lineChannel.findUnique({
    where: { id: channelId },
    select: {
      channelName:  true,
      lineChannelId: true,
      partnerId:    true,
      projectId:    true,
      associations: { select: { partnerId: true }, take: 1, orderBy: { createdAt: 'asc' } },
    },
  })
  const channelName = channel?.channelName || channel?.lineChannelId || channelId

  // 優先用頻道直接關聯的 partner，否則取第一個 association
  const partnerId = channel?.partnerId ?? channel?.associations[0]?.partnerId ?? null
  const projectId = channel?.projectId ?? null

  // 載入 SLA 設定
  const slaConfig = await prisma.systemConfig.findUnique({ where: { key: 'line_event_sla_config' } })
  const slaRules = slaConfig ? JSON.parse(slaConfig.value).rules : DEFAULT_SLA_RULES
  const { slaResponseDue, slaResolveDue } = calcSLADueDates(mapping.priority, new Date(), slaRules)

  // 建立事件
  const event = await prisma.lineEvent.create({
    data: {
      title:          `${mapping.titlePrefix}：${channelName}`,
      description:    reason ?? null,
      priority:       mapping.priority,
      source:         'auto',
      partnerId,
      projectId,
      slaResponseDue,
      slaResolveDue,
      createdBy:      appliedBy,
      channels: {
        create: {
          channelId,
          addedBy: appliedBy,
        },
      },
      labels: {
        create: {
          labelId,
          source,
          appliedBy,
        },
      },
    },
    select: { id: true, title: true, priority: true },
  })

  console.log(`[line-event-auto] Auto-created event ${event.id} (${event.priority}) for channel ${channelId} via label '${labelId}' [${source}]`)

  // 推送新事件到外部系統（非阻塞）
  enqueueEventPush(event.id, 'CREATED')
}
