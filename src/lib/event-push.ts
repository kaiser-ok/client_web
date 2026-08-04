/**
 * 事件外送（Event Push）
 * LineEvent 建立 / 狀態變更時，將事件推送到外部系統（192.168.30.187:3003/api/incidents）。
 *
 * 設計要點：
 * - outbox 表（event_outbox）是唯一真相來源：建立事件時同步寫入一筆，永不遺失。
 * - 立即嘗試派送（fire-and-forget，不阻塞 API 回應）；失敗則留待 sweeper 重送。
 * - sweeper cron 每 2 分鐘撈到期的 PENDING/FAILED 重送（指數退避），
 *   即使 Redis / 對方系統 / 本服務曾中斷，恢復後也會把積壓補送完。
 */

import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { createLogger } from './logger'

const log = createLogger('event-push', 'event-push.log')

export const EVENT_PUSH_CONFIG_KEY = 'event_push_config'

export interface EventPushConfig {
  enabled: boolean
  url: string
  apiKey: string
  maxAttempts: number
  timeoutMs: number
}

export const DEFAULT_EVENT_PUSH_CONFIG: EventPushConfig = {
  enabled: false, // 部署後於 /settings/event-push 手動開啟
  url: 'http://192.168.30.187:3003/api/incidents',
  apiKey: '',
  maxAttempts: 8,
  timeoutMs: 10_000,
}

export async function getPushConfig(): Promise<EventPushConfig> {
  const row = await prisma.systemConfig.findUnique({ where: { key: EVENT_PUSH_CONFIG_KEY } })
  if (!row) return DEFAULT_EVENT_PUSH_CONFIG
  try {
    return { ...DEFAULT_EVENT_PUSH_CONFIG, ...JSON.parse(row.value) }
  } catch {
    return DEFAULT_EVENT_PUSH_CONFIG
  }
}

// ── Payload 組裝 ──────────────────────────────────────────────────────────────

export type EventPushType = 'CREATED' | 'STATUS_CHANGED'

export interface StatusChange {
  from: string
  to: string
  by: string
  action?: string
}

async function buildPayload(
  eventId: string,
  eventType: EventPushType,
  deliveryId: string,
  change?: StatusChange
): Promise<Record<string, unknown> | null> {
  const event = await prisma.lineEvent.findUnique({
    where: { id: eventId },
    include: {
      partner:  { select: { id: true, name: true } },
      project:  { select: { id: true, name: true } },
      assignee: { select: { email: true, name: true } },
      channels: { include: { channel: { select: { id: true, channelName: true } } } },
    },
  })
  if (!event) return null

  return {
    source: 'client-web',
    eventType,
    event: {
      id: event.id,
      title: event.title,
      description: event.description,
      status: event.status,
      priority: event.priority,
      origin: event.source, // auto | manual
      partner: event.partner ? { id: event.partner.id, name: event.partner.name } : null,
      project: event.project ? { id: event.project.id, name: event.project.name } : null,
      assignee: event.assignee ? { email: event.assignee.email, name: event.assignee.name } : null,
      channels: event.channels.map(ec => ({ id: ec.channel.id, name: ec.channel.channelName })),
      sla: {
        responseDue: event.slaResponseDue?.toISOString() ?? null,
        resolveDue: event.slaResolveDue?.toISOString() ?? null,
      },
      createdBy: event.createdBy,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    },
    change: change ?? null,
    deliveryId,
  }
}

// ── 進入點：建 outbox + 立即嘗試 ──────────────────────────────────────────────

/**
 * 事件建立 / 狀態變更時呼叫。建立 outbox 列並立即嘗試派送（非阻塞）。
 * 呼叫端無需 await 派送結果 —— 失敗會由 sweeper 接手重送。
 */
export async function enqueueEventPush(
  eventId: string,
  eventType: EventPushType,
  change?: StatusChange
): Promise<void> {
  try {
    const cfg = await getPushConfig()
    if (!cfg.enabled) return

    const row = await prisma.eventOutbox.create({
      data: { eventId, eventType, payload: {}, maxAttempts: cfg.maxAttempts },
    })

    const payload = await buildPayload(eventId, eventType, row.id, change)
    if (!payload) {
      await prisma.eventOutbox.update({
        where: { id: row.id },
        data: { status: 'DEAD', lastError: 'event not found when building payload' },
      })
      return
    }
    await prisma.eventOutbox.update({
      where: { id: row.id },
      data: { payload: payload as Prisma.InputJsonValue },
    })

    // fire-and-forget：不阻塞呼叫端
    void dispatch(row.id).catch(err => log.warn(`立即派送失敗，交給 sweeper: ${row.id}`, { error: String(err) }))
  } catch (err) {
    // 推送失敗絕不可影響事件本身的建立流程
    log.error(`enqueueEventPush 失敗: eventId=${eventId}`, { error: String(err) })
  }
}

// ── 實際派送 ──────────────────────────────────────────────────────────────────

async function dispatch(outboxId: string): Promise<void> {
  const cfg = await getPushConfig()
  if (!cfg.enabled || !cfg.url) return

  const row = await prisma.eventOutbox.findUnique({ where: { id: outboxId } })
  if (!row || row.status === 'SENT' || row.status === 'DEAD') return

  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': cfg.apiKey },
      body: JSON.stringify(row.payload),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    })
    if (res.ok) {
      await prisma.eventOutbox.update({
        where: { id: outboxId },
        data: { status: 'SENT', sentAt: new Date(), responseCode: res.status, lastError: null },
      })
      log.info(`派送成功: ${outboxId} eventId=${row.eventId} type=${row.eventType}`)
    } else {
      await markRetry(row.id, row.attempts, row.maxAttempts, `HTTP ${res.status}`, res.status)
    }
  } catch (err) {
    await markRetry(row.id, row.attempts, row.maxAttempts, String(err), null)
  }
}

/** attempts++、計算下次退避時間；超過上限標 DEAD */
async function markRetry(
  outboxId: string,
  attempts: number,
  maxAttempts: number,
  error: string,
  code: number | null
): Promise<void> {
  const nextAttempts = attempts + 1
  if (nextAttempts >= maxAttempts) {
    await prisma.eventOutbox.update({
      where: { id: outboxId },
      data: { status: 'DEAD', attempts: nextAttempts, lastError: error, responseCode: code },
    })
    log.error(`派送最終失敗（DEAD）: ${outboxId} attempts=${nextAttempts} ${error}`)
    return
  }
  // 指數退避：2^n 分鐘，上限 60 分
  const delayMs = Math.min(2 ** nextAttempts, 60) * 60 * 1000
  await prisma.eventOutbox.update({
    where: { id: outboxId },
    data: {
      status: 'FAILED',
      attempts: nextAttempts,
      lastError: error,
      responseCode: code,
      nextRetryAt: new Date(Date.now() + delayMs),
    },
  })
  log.warn(`派送失敗，將重送: ${outboxId} attempts=${nextAttempts} 下次=${Math.round(delayMs / 60000)}分後 ${error}`)
}

// ── Sweeper：撈到期的 PENDING/FAILED 重送 ─────────────────────────────────────

export async function sweepOutbox(): Promise<{ swept: number }> {
  const cfg = await getPushConfig()
  if (!cfg.enabled) return { swept: 0 }

  const rows = await prisma.eventOutbox.findMany({
    where: { status: { in: ['PENDING', 'FAILED'] }, nextRetryAt: { lte: new Date() } },
    orderBy: { nextRetryAt: 'asc' },
    take: 50,
  })
  for (const r of rows) {
    await dispatch(r.id)
  }
  return { swept: rows.length }
}
