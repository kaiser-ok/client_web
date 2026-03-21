/**
 * LINE 事件通知模組
 * 支援 Slack DM + Email 通知，並記錄到 line_event_notifications
 */

import prisma from '@/lib/prisma'
import { sendEmail } from '@/lib/email-sender'
import { GMAIL_CONFIG_KEY } from '@/types/gmail'
import type { GmailConfig } from '@/types/gmail'
import dayjs from 'dayjs'

const SLACK_TOKEN = process.env.SLACK_USER_TOKEN

// ── 通知類型 ─────────────────────────────────────────

export type NotificationType =
  | 'ASSIGNED'
  | 'SLA_WARNING'
  | 'SLA_BREACH'
  | 'NEW_MESSAGE'
  | 'COMMENT'
  | 'CLOSED'

// ── Slack Helper ─────────────────────────────────────

async function slackLookupByEmail(email: string): Promise<string | null> {
  if (!SLACK_TOKEN) return null
  try {
    const res = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } }
    )
    const data = await res.json()
    return data.ok ? (data.user.id as string) : null
  } catch {
    return null
  }
}

async function slackOpenDM(slackUserId: string): Promise<string | null> {
  if (!SLACK_TOKEN) return null
  try {
    const res = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SLACK_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ users: slackUserId }),
    })
    const data = await res.json()
    return data.ok ? (data.channel.id as string) : null
  } catch {
    return null
  }
}

async function slackSendMessage(channelId: string, text: string, blocks?: unknown[]): Promise<boolean> {
  if (!SLACK_TOKEN) return false
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SLACK_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: channelId, text, blocks }),
    })
    const data = await res.json()
    return data.ok as boolean
  } catch {
    return false
  }
}

async function sendSlackDM(email: string, text: string, blocks?: unknown[]): Promise<boolean> {
  const slackUserId = await slackLookupByEmail(email)
  if (!slackUserId) return false
  const dmChannel = await slackOpenDM(slackUserId)
  if (!dmChannel) return false
  return slackSendMessage(dmChannel, text, blocks)
}

// ── Gmail Config ─────────────────────────────────────

async function getGmailConfig(): Promise<GmailConfig | null> {
  try {
    const config = await prisma.systemConfig.findUnique({ where: { key: GMAIL_CONFIG_KEY } })
    return config ? JSON.parse(config.value) : null
  } catch {
    return null
  }
}

// ── 通知訊息建構 ─────────────────────────────────────

function buildNotificationContent(
  type: NotificationType,
  event: { id: string; title: string | null; priority: string; status: string; slaResolveDue: Date | null },
  extra?: { commentAuthor?: string; channelName?: string }
) {
  const PRIORITY_EMOJI: Record<string, string> = { P1: '🔴', P2: '🟠', NORMAL: '🟢' }
  const emoji = PRIORITY_EMOJI[event.priority] ?? '⚪'
  const title = event.title || '(無標題)'
  const slaStr = event.slaResolveDue ? dayjs(event.slaResolveDue).format('MM/DD HH:mm') : '無'
  const url = `${process.env.NEXTAUTH_URL ?? ''}/line-events`

  const messages: Record<NotificationType, { subject: string; text: string; slackText: string }> = {
    ASSIGNED: {
      subject: `[事件指派] ${emoji} ${title}`,
      text:  `事件「${title}」已指派給你處理。<br>優先級：${event.priority}<br>SLA 截止：${slaStr}<br><a href="${url}">查看事件</a>`,
      slackText: `${emoji} *事件已指派給你*\n*標題：* ${title}\n*優先級：* ${event.priority}\n*SLA 截止：* ${slaStr}\n<${url}|查看事件>`,
    },
    SLA_WARNING: {
      subject: `[SLA 警告] ${emoji} ${title}`,
      text:  `事件「${title}」即將超過 SLA 時限（截止：${slaStr}）。<br><a href="${url}">立即處理</a>`,
      slackText: `⚠️ *SLA 警告 — 即將超時*\n*標題：* ${title}\n*截止：* ${slaStr}\n<${url}|立即處理>`,
    },
    SLA_BREACH: {
      subject: `[SLA 違反] ${emoji} ${title}`,
      text:  `事件「${title}」已超過 SLA 時限！<br><a href="${url}">查看事件</a>`,
      slackText: `🚨 *SLA 已違反！*\n*標題：* ${title}\n*優先級：* ${event.priority}\n<${url}|查看事件>`,
    },
    NEW_MESSAGE: {
      subject: `[事件重開] ${emoji} ${title}`,
      text:  `事件「${title}」因新訊息已重新開啟。<br>頻道：${extra?.channelName ?? ''}<br><a href="${url}">查看事件</a>`,
      slackText: `🔄 *事件重新開啟*\n*標題：* ${title}\n*頻道：* ${extra?.channelName ?? ''}\n<${url}|查看事件>`,
    },
    COMMENT: {
      subject: `[事件備註] ${emoji} ${title}`,
      text:  `${extra?.commentAuthor ?? '有人'} 在事件「${title}」新增了備註。<br><a href="${url}">查看備註</a>`,
      slackText: `💬 *新增備註*\n*事件：* ${title}\n*作者：* ${extra?.commentAuthor ?? ''}\n<${url}|查看備註>`,
    },
    CLOSED: {
      subject: `[事件結案] ${emoji} ${title}`,
      text:  `事件「${title}」已結案。<br><a href="${url}">查看事件</a>`,
      slackText: `✅ *事件已結案*\n*標題：* ${title}\n<${url}|查看事件>`,
    },
  }

  return messages[type]
}

// ── 記錄通知 ─────────────────────────────────────────

async function recordNotification(
  eventId: string,
  type: NotificationType,
  channel: 'slack' | 'email',
  recipient: string,
  success: boolean
) {
  await prisma.lineEventNotification.create({
    data: { eventId, type, channel, recipient, success },
  }).catch(() => { /* 記錄失敗不影響主流程 */ })
}

// ── 避免重複通知 ─────────────────────────────────────

async function hasRecentNotification(
  eventId: string,
  type: NotificationType,
  recipient: string,
  withinMinutes = 60
): Promise<boolean> {
  const since = new Date(Date.now() - withinMinutes * 60 * 1000)
  const count = await prisma.lineEventNotification.count({
    where: {
      eventId,
      type,
      recipient,
      sentAt: { gte: since },
      success: true,
    },
  })
  return count > 0
}

// ── 主要通知函式 ─────────────────────────────────────

export async function notifyEvent(
  eventId: string,
  type: NotificationType,
  recipientEmail: string,
  extra?: { commentAuthor?: string; channelName?: string }
) {
  // 避免短時間內重複通知（SLA 系列限 60 分鐘）
  const throttleMin = type.startsWith('SLA') ? 60 : 5
  if (await hasRecentNotification(eventId, type, recipientEmail, throttleMin)) return

  const event = await prisma.lineEvent.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, priority: true, status: true, slaResolveDue: true },
  })
  if (!event) return

  const content = buildNotificationContent(type, event, extra)

  // Slack DM
  const slackOk = await sendSlackDM(recipientEmail, content.slackText)
  await recordNotification(eventId, type, 'slack', recipientEmail, slackOk)

  // Email（若 Slack 失敗或是重要通知則補發 Email）
  const shouldEmail = !slackOk || type === 'SLA_BREACH' || type === 'ASSIGNED'
  if (shouldEmail) {
    const gmailConfig = await getGmailConfig()
    if (gmailConfig) {
      const result = await sendEmail(
        { to: [recipientEmail], subject: content.subject, html: content.text },
        gmailConfig
      )
      await recordNotification(eventId, type, 'email', recipientEmail, result.success)
    }
  }
}

// ── 通知指派人 ───────────────────────────────────────

export async function notifyAssigned(eventId: string, assigneeEmail: string) {
  await notifyEvent(eventId, 'ASSIGNED', assigneeEmail)
}

export async function notifyNewComment(eventId: string, assigneeEmail: string, authorEmail: string) {
  if (assigneeEmail === authorEmail) return // 自己留言不通知
  await notifyEvent(eventId, 'COMMENT', assigneeEmail, { commentAuthor: authorEmail })
}

export async function notifyEventClosed(eventId: string, createdByEmail: string, closedByEmail: string) {
  if (createdByEmail === closedByEmail) return
  await notifyEvent(eventId, 'CLOSED', createdByEmail)
}

export async function notifyReopened(eventId: string, assigneeEmail: string, channelName?: string) {
  await notifyEvent(eventId, 'NEW_MESSAGE', assigneeEmail, { channelName })
}
