/**
 * 每日點數活動 Slack 通知
 * - 每天 09:00 發送昨日點數活動給當事人（個人 DM）及主管/Admin（彙整 DM）
 */

import { Queue, Worker, Job } from 'bullmq'
import prisma from '@/lib/prisma'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const QUEUE_NAME = 'bonus-daily-notify'
const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN

function parseRedisUrl(url: string) {
  const parsed = new URL(url)
  return {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    maxRetriesPerRequest: null as null,
  }
}

const redisOpts = parseRedisUrl(REDIS_URL)

let notifyQueue: Queue | null = null
function getQueue(): Queue {
  if (!notifyQueue) {
    notifyQueue = new Queue(QUEUE_NAME, {
      connection: redisOpts,
      defaultJobOptions: { attempts: 2, removeOnComplete: { count: 50 }, removeOnFail: { count: 100 } },
    })
  }
  return notifyQueue
}

// ── Cron ────────────────────────────────────────────────

export async function startBonusDailyNotifierCron() {
  const queue = getQueue()
  const existing = await queue.getRepeatableJobs()
  for (const job of existing) {
    if (job.name === 'bonus-daily') await queue.removeRepeatableByKey(job.key)
  }
  await queue.add('bonus-daily', {}, {
    repeat: { pattern: '0 9 * * *' },
    jobId: 'bonus-daily-cron',
  })
  console.log('[bonus-daily-notifier] Cron scheduled: 0 9 * * * (daily 09:00)')
}

// ── Slack helpers ────────────────────────────────────────

async function slackLookupByEmail(email: string): Promise<string | null> {
  if (!SLACK_TOKEN) return null
  try {
    const res = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } }
    )
    const data = await res.json()
    return data.ok ? (data.user.id as string) : null
  } catch { return null }
}

async function slackOpenDM(slackUserId: string): Promise<string | null> {
  if (!SLACK_TOKEN) return null
  try {
    const res = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SLACK_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ users: slackUserId }),
    })
    const data = await res.json()
    return data.ok ? (data.channel.id as string) : null
  } catch { return null }
}

async function slackSendBlocks(channelId: string, text: string, blocks: unknown[]): Promise<boolean> {
  if (!SLACK_TOKEN) return false
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SLACK_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: channelId, text, blocks }),
    })
    const data = await res.json()
    return data.ok as boolean
  } catch { return false }
}

async function sendDM(email: string, text: string, blocks: unknown[]): Promise<boolean> {
  const uid = await slackLookupByEmail(email)
  if (!uid) return false
  const ch = await slackOpenDM(uid)
  if (!ch) return false
  return slackSendBlocks(ch, text, blocks)
}

// ── Event types ──────────────────────────────────────────

const EVENT_LABEL: Record<string, string> = {
  ASSIGNED: '[新增指派]',
  EVALUATED: '[待核准]',
  APPROVED: '[已核准]',
}
const ROLE_LABEL: Record<string, string> = {
  PM: '專案經理', SALES: '業務', ENGINEER: 'RD', SUPPORT: '維運',
}

interface ActivityEntry {
  userId: string
  userName: string
  userEmail: string
  eventType: 'ASSIGNED' | 'EVALUATED' | 'APPROVED'
  projectName: string
  partnerName: string
  role: string
  score: number
  evalStatus: string
}

// ── Query yesterday's activity ───────────────────────────

async function getYesterdayActivity(date: Date): Promise<ActivityEntry[]> {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)

  const [newAssignments, approved, evaluated] = await Promise.all([
    // New member assignments
    prisma.projectBonusMember.findMany({
      where: { createdAt: { gte: start, lte: end } },
      include: {
        user: { select: { id: true, name: true, email: true } },
        eval: {
          select: {
            status: true,
            project: { select: { name: true, partner: { select: { name: true } } } },
          },
        },
      },
    }),
    // Approvals
    prisma.projectBonusMember.findMany({
      where: { eval: { status: 'APPROVED', approvedAt: { gte: start, lte: end } } },
      include: {
        user: { select: { id: true, name: true, email: true } },
        eval: {
          select: {
            status: true,
            project: { select: { name: true, partner: { select: { name: true } } } },
          },
        },
      },
    }),
    // Evaluations submitted
    prisma.projectBonusMember.findMany({
      where: { eval: { status: 'EVALUATED', evaluatedAt: { gte: start, lte: end } } },
      include: {
        user: { select: { id: true, name: true, email: true } },
        eval: {
          select: {
            status: true,
            project: { select: { name: true, partner: { select: { name: true } } } },
          },
        },
      },
    }),
  ])

  const toEntry = (
    m: typeof newAssignments[0],
    eventType: ActivityEntry['eventType']
  ): ActivityEntry => ({
    userId: m.user.id,
    userName: m.user.name || m.user.email,
    userEmail: m.user.email,
    eventType,
    projectName: m.eval.project.name,
    partnerName: m.eval.project.partner.name,
    role: m.role,
    score: Number(m.score ?? 0),
    evalStatus: m.eval.status,
  })

  // Deduplicate: approved takes priority over evaluated, both over assigned
  const seen = new Map<string, ActivityEntry>()
  const priority = { APPROVED: 3, EVALUATED: 2, ASSIGNED: 1 }

  for (const [entries, type] of [
    [newAssignments, 'ASSIGNED'],
    [evaluated, 'EVALUATED'],
    [approved, 'APPROVED'],
  ] as [typeof newAssignments, ActivityEntry['eventType']][]) {
    for (const m of entries) {
      const key = `${m.user.id}:${m.evalId}`
      const existing = seen.get(key)
      if (!existing || priority[type] > priority[existing.eventType]) {
        seen.set(key, toEntry(m, type))
      }
    }
  }

  return Array.from(seen.values())
}

// ── Block Kit builders ───────────────────────────────────

function buildPersonalBlocks(
  entries: ActivityEntry[],
  dateLabel: string,
  baseUrl: string
): unknown[] {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📊 昨日專案績效點數異動通知 | ${dateLabel}`, emoji: true },
    },
    { type: 'divider' },
  ]

  for (const e of entries) {
    const label = EVENT_LABEL[e.eventType]
    const roleLabel = ROLE_LABEL[e.role] || e.role
    const scoreText = e.evalStatus === 'DRAFT'
      ? '待計算（草稿）'
      : `${e.score.toFixed(2)} 點`

    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*專案*\n${e.projectName}` },
        { type: 'mrkdwn', text: `*客戶*\n${e.partnerName}` },
        { type: 'mrkdwn', text: `*狀態*\n${label}` },
        { type: 'mrkdwn', text: `*角色 / 點數*\n${roleLabel}｜${scoreText}` },
      ],
    })
  }

  blocks.push(
    { type: 'divider' },
    {
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: '查看完整月報', emoji: true },
        url: `${baseUrl}/reports/bonus/monthly`,
        style: 'primary',
      }],
    }
  )

  return blocks
}

function buildManagerBlocks(
  allEntries: ActivityEntry[],
  dateLabel: string,
  baseUrl: string
): unknown[] {
  // Group by user
  const byUser = new Map<string, ActivityEntry[]>()
  for (const e of allEntries) {
    if (!byUser.has(e.userId)) byUser.set(e.userId, [])
    byUser.get(e.userId)!.push(e)
  }

  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📋 績效點數異動 | ${dateLabel}`, emoji: true },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `共 *${byUser.size}* 人、*${allEntries.length}* 筆異動` }],
    },
    { type: 'divider' },
  ]

  for (const [, entries] of byUser) {
    const firstName = entries[0].userName
    const lines = entries.map(e => {
      const label = EVENT_LABEL[e.eventType]
      const scoreText = e.evalStatus === 'DRAFT' ? '待計算（草稿）' : `${e.score.toFixed(2)}pt`
      return `${label} ${e.projectName}｜${ROLE_LABEL[e.role] || e.role}｜${scoreText}`
    })

    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*${firstName}*\n${lines.join('\n')}` },
    })
  }

  blocks.push(
    { type: 'divider' },
    {
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: '查看年度報表', emoji: true },
        url: `${baseUrl}/reports/bonus`,
        style: 'primary',
      }],
    }
  )

  return blocks
}

// ── Manager-only send (for testing) ─────────────────────

export async function sendDailyManagerSummary(date: Date, toEmail: string): Promise<boolean> {
  const allEntries = await getYesterdayActivity(date)
  if (allEntries.length === 0) {
    console.log('[bonus-daily-notifier] No activity, nothing to send')
    return false
  }
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const dateLabel = date.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })
  const byUser = new Map<string, ActivityEntry[]>()
  for (const e of allEntries) {
    if (!byUser.has(e.userId)) byUser.set(e.userId, [])
    byUser.get(e.userId)!.push(e)
  }
  const mgBlocks = buildManagerBlocks(allEntries, dateLabel, baseUrl)
  const mgText = `📋 績效點數異動 ${dateLabel}：${byUser.size} 人、${allEntries.length} 筆`
  const ok = await sendDM(toEmail, mgText, mgBlocks)
  console.log(`[bonus-daily-notifier] Manager summary to ${toEmail}: ${ok ? 'sent' : 'failed/skipped'}`)
  return ok
}

// ── Main send logic ──────────────────────────────────────

export async function sendDailyBonusNotifications(
  date: Date,
  filterUserId?: string,
  managerTestEmail?: string,  // 測試用：主管彙整只送給此 email，不發給所有主管
): Promise<{ personal: number; managers: number; skipped: number; errors: number }> {
  const allEntries = await getYesterdayActivity(date)

  if (allEntries.length === 0) {
    console.log('[bonus-daily-notifier] No activity for the specified date, skipping')
    return { personal: 0, managers: 0, skipped: 0, errors: 0 }
  }

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const dateLabel = date.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })

  let personal = 0, managers = 0, skipped = 0, errors = 0

  // 1. Personal DMs
  const byUser = new Map<string, ActivityEntry[]>()
  for (const e of allEntries) {
    if (!byUser.has(e.userId)) byUser.set(e.userId, [])
    byUser.get(e.userId)!.push(e)
  }

  for (const [uid, entries] of byUser) {
    if (filterUserId && uid !== filterUserId) continue
    const { userEmail, userName } = entries[0]
    try {
      const blocks = buildPersonalBlocks(entries, dateLabel, baseUrl)
      const ok = await sendDM(userEmail, `📊 ${userName} 您好，${dateLabel} 有 ${entries.length} 筆專案績效點數異動`, blocks)
      if (ok) personal++
      else skipped++
    } catch (err) {
      errors++
      console.error(`[bonus-daily-notifier] Personal DM error for ${userEmail}:`, err)
    }
  }

  // 2. Manager / Admin DMs
  const mgBlocks = buildManagerBlocks(allEntries, dateLabel, baseUrl)
  const mgText = `📋 績效點數異動 ${dateLabel}：${byUser.size} 人、${allEntries.length} 筆`

  if (managerTestEmail) {
    // 測試模式：只送給指定 email
    try {
      const ok = await sendDM(managerTestEmail, mgText, mgBlocks)
      if (ok) managers++
      else skipped++
    } catch (err) {
      errors++
      console.error(`[bonus-daily-notifier] Manager DM error for ${managerTestEmail}:`, err)
    }
  } else {
    // 正常模式：送給所有主管 / Admin
    const supervisors = await prisma.user.findMany({
      where: { OR: [{ isManager: true }, { role: 'ADMIN' }], active: true },
      select: { email: true, name: true },
    })
    for (const sup of supervisors) {
      try {
        const ok = await sendDM(sup.email, mgText, mgBlocks)
        if (ok) managers++
        else skipped++
      } catch (err) {
        errors++
        console.error(`[bonus-daily-notifier] Manager DM error for ${sup.email}:`, err)
      }
    }
  }

  console.log(`[bonus-daily-notifier] Done: personal=${personal} managers=${managers} skipped=${skipped} errors=${errors}`)
  return { personal, managers, skipped, errors }
}

// ── Worker ───────────────────────────────────────────────

async function runDailyJob(_job: Job) {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  console.log(`[bonus-daily-notifier] Running for ${yesterday.toISOString().slice(0, 10)}`)
  await sendDailyBonusNotifications(yesterday)
}

export function startBonusDailyNotifierWorker(): Worker {
  const worker = new Worker(QUEUE_NAME, runDailyJob, {
    connection: redisOpts,
    concurrency: 1,
  })
  worker.on('completed', job => console.log(`[bonus-daily-notifier] Job ${job.id} completed`))
  worker.on('failed', (job, err) => console.error(`[bonus-daily-notifier] Job ${job?.id} failed:`, err.message))
  return worker
}

export async function stopBonusDailyNotifierWorker(worker: Worker) {
  await worker.close()
  if (notifyQueue) {
    await notifyQueue.close()
    notifyQueue = null
  }
}
