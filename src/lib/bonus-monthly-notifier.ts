/**
 * 月度個人點數變動通知
 * - 每月 1 日 09:00 發送上個月的點數變動摘要給所有有點數活動的成員
 * - 使用 Gmail SMTP（同報價單流程）
 */

import { Queue, Worker, Job } from 'bullmq'
import prisma from '@/lib/prisma'
import { sendEmail } from '@/lib/email-sender'
import type { GmailConfig } from '@/types/gmail'
import { GMAIL_CONFIG_KEY } from '@/types/gmail'
import { MEMBER_ROLES } from '@/constants/bonus'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const QUEUE_NAME = 'bonus-monthly-notify'

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

function getNotifyQueue(): Queue {
  if (!notifyQueue) {
    notifyQueue = new Queue(QUEUE_NAME, {
      connection: redisOpts,
      defaultJobOptions: {
        attempts: 2,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    })
  }
  return notifyQueue
}

// ── Cron ────────────────────────────────────────────────

export async function startBonusMonthlyNotifierCron() {
  const queue = getNotifyQueue()

  const existing = await queue.getRepeatableJobs()
  for (const job of existing) {
    if (job.name === 'bonus-monthly') {
      await queue.removeRepeatableByKey(job.key)
    }
  }

  // 每月 1 日 09:00
  await queue.add('bonus-monthly', {}, {
    repeat: { pattern: '0 9 1 * *' },
    jobId: 'bonus-monthly-cron',
  })

  console.log('[bonus-monthly-notifier] Cron scheduled: 0 9 1 * *')
}

// ── Report data ──────────────────────────────────────────

export interface MonthlyReportEntry {
  eventType: 'ASSIGNED' | 'EVALUATED' | 'APPROVED'
  projectName: string
  partnerName: string
  role: string
  yearOffset: number
  contributionPct: number
  score: number
  evalStatus: string
  evalYear: number
  eventDate: Date | null
}

export interface UserMonthlyReport {
  userId: string
  userName: string
  userEmail: string
  year: number
  month: number
  events: MonthlyReportEntry[]
  ytdConfirmed: number
  ytdProjected: number
}

export async function buildUserReport(
  userId: string,
  year: number,
  month: number
): Promise<UserMonthlyReport | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  })
  if (!user) return null

  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 1)

  const [newAssignments, approvedThisMonth, evaluatedThisMonth, ytdMembers] = await Promise.all([
    prisma.projectBonusMember.findMany({
      where: { userId, createdAt: { gte: start, lt: end } },
      include: { eval: { include: { project: { select: { name: true, partner: { select: { name: true } } } } } } },
    }),
    prisma.projectBonusMember.findMany({
      where: { userId, eval: { status: 'APPROVED', approvedAt: { gte: start, lt: end } } },
      include: { eval: { include: { project: { select: { name: true, partner: { select: { name: true } } } } } } },
    }),
    prisma.projectBonusMember.findMany({
      where: { userId, eval: { status: 'EVALUATED', evaluatedAt: { gte: start, lt: end } } },
      include: { eval: { include: { project: { select: { name: true, partner: { select: { name: true } } } } } } },
    }),
    prisma.projectBonusMember.findMany({
      where: { userId, eval: { year } },
      select: { score: true, eval: { select: { status: true } } },
    }),
  ])

  const toEntry = (m: typeof newAssignments[0], eventType: MonthlyReportEntry['eventType']): MonthlyReportEntry => ({
    eventType,
    projectName: m.eval.project.name,
    partnerName: m.eval.project.partner.name,
    role: m.role,
    yearOffset: m.yearOffset,
    contributionPct: Number(m.contributionPct),
    score: Number(m.score ?? 0),
    evalStatus: m.eval.status,
    evalYear: m.eval.year,
    eventDate: eventType === 'ASSIGNED' ? m.createdAt
      : eventType === 'APPROVED' ? (m.eval as { approvedAt?: Date | null }).approvedAt ?? null
      : (m.eval as { evaluatedAt?: Date | null }).evaluatedAt ?? null,
  })

  const seen = new Set<string>()
  const events: MonthlyReportEntry[] = [
    ...approvedThisMonth.map(m => toEntry(m, 'APPROVED')),
    ...evaluatedThisMonth.map(m => toEntry(m, 'EVALUATED')),
    ...newAssignments.map(m => toEntry(m, 'ASSIGNED')),
  ].filter(e => {
    const key = `${e.projectName}:${e.eventType}:${e.yearOffset}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  events.sort((a, b) => new Date(b.eventDate ?? 0).getTime() - new Date(a.eventDate ?? 0).getTime())

  let ytdConfirmed = 0, ytdProjected = 0
  for (const m of ytdMembers) {
    const score = Number(m.score ?? 0)
    if (m.eval.status === 'APPROVED' || m.eval.status === 'PAID') ytdConfirmed += score
    else ytdProjected += score
  }

  return {
    userId: user.id,
    userName: user.name || user.email,
    userEmail: user.email,
    year,
    month,
    events,
    ytdConfirmed,
    ytdProjected,
  }
}

// ── HTML template ────────────────────────────────────────

const EVENT_TYPE_LABEL: Record<string, string> = {
  ASSIGNED: '新增指派',
  EVALUATED: '已提交評估',
  APPROVED: '已核准確認',
}

const EVENT_TYPE_COLOR: Record<string, string> = {
  ASSIGNED: '#1890ff',
  EVALUATED: '#d48806',
  APPROVED: '#389e0d',
}

function getRoleLabel(role: string) {
  return MEMBER_ROLES.find(r => r.value === role)?.label || role
}

export function generateMonthlyReportHTML(report: UserMonthlyReport, baseUrl: string): string {
  const monthLabel = `${report.year} 年 ${report.month} 月`
  const hasEvents = report.events.length > 0

  const eventRows = report.events.map(e => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">
        <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;
          background:${EVENT_TYPE_COLOR[e.eventType]}20;color:${EVENT_TYPE_COLOR[e.eventType]};
          font-weight:600;">${EVENT_TYPE_LABEL[e.eventType]}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">
        <div style="font-weight:500;">${e.projectName}</div>
        <div style="font-size:12px;color:#999;">${e.partnerName}</div>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">
        ${getRoleLabel(e.role)}${e.yearOffset > 0 ? `<br><span style="font-size:11px;color:#aaa;">保固第${e.yearOffset + 1}年</span>` : ''}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">
        ${e.contributionPct}%
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">
        <strong style="color:#722ed1;">${e.score.toFixed(2)}</strong>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:12px;color:#999;">
        ${e.eventDate ? new Date(e.eventDate).toLocaleDateString('zh-TW') : '-'}
      </td>
    </tr>
  `).join('')

  const noEventsMsg = `
    <tr>
      <td colspan="6" style="padding:24px;text-align:center;color:#aaa;">
        本月無點數變動記錄
      </td>
    </tr>
  `

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Microsoft JhengHei','Noto Sans TC',Arial,sans-serif;font-size:14px;color:#333;">
  <div style="max-width:680px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#722ed1,#1890ff);padding:28px 32px;">
      <div style="color:#fff;">
        <div style="font-size:11px;letter-spacing:2px;opacity:0.8;margin-bottom:6px;">個人月度報表</div>
        <div style="font-size:22px;font-weight:700;">${monthLabel} 專案點數摘要</div>
        <div style="margin-top:6px;opacity:0.85;">Hi ${report.userName}，以下是您本月的點數變動記錄。</div>
      </div>
    </div>

    <!-- YTD Summary -->
    <div style="display:flex;padding:20px 32px;background:#fafafa;border-bottom:1px solid #f0f0f0;gap:0;">
      <div style="flex:1;text-align:center;padding:12px;">
        <div style="font-size:24px;font-weight:700;color:#389e0d;">${report.ytdConfirmed.toFixed(2)}</div>
        <div style="font-size:12px;color:#666;margin-top:4px;">${report.year} 年確認點數</div>
      </div>
      <div style="width:1px;background:#e8e8e8;margin:8px 0;"></div>
      <div style="flex:1;text-align:center;padding:12px;">
        <div style="font-size:24px;font-weight:700;color:#d48806;">${report.ytdProjected.toFixed(2)}</div>
        <div style="font-size:12px;color:#666;margin-top:4px;">${report.year} 年預計點數</div>
      </div>
      <div style="width:1px;background:#e8e8e8;margin:8px 0;"></div>
      <div style="flex:1;text-align:center;padding:12px;">
        <div style="font-size:24px;font-weight:700;color:#722ed1;">${(report.ytdConfirmed + report.ytdProjected).toFixed(2)}</div>
        <div style="font-size:12px;color:#666;margin-top:4px;">${report.year} 年累計點數</div>
      </div>
    </div>

    <!-- Events Table -->
    <div style="padding:24px 32px;">
      <div style="font-weight:600;font-size:15px;margin-bottom:16px;color:#222;">
        本月點數變動明細
        ${hasEvents ? `<span style="font-size:12px;font-weight:400;color:#999;margin-left:8px;">${report.events.length} 筆</span>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#fafafa;">
            <th style="padding:8px 12px;text-align:left;font-weight:600;font-size:12px;color:#666;border-bottom:2px solid #f0f0f0;">類型</th>
            <th style="padding:8px 12px;text-align:left;font-weight:600;font-size:12px;color:#666;border-bottom:2px solid #f0f0f0;">專案</th>
            <th style="padding:8px 12px;text-align:center;font-weight:600;font-size:12px;color:#666;border-bottom:2px solid #f0f0f0;">角色</th>
            <th style="padding:8px 12px;text-align:right;font-weight:600;font-size:12px;color:#666;border-bottom:2px solid #f0f0f0;">貢獻</th>
            <th style="padding:8px 12px;text-align:right;font-weight:600;font-size:12px;color:#666;border-bottom:2px solid #f0f0f0;">點數</th>
            <th style="padding:8px 12px;text-align:center;font-weight:600;font-size:12px;color:#666;border-bottom:2px solid #f0f0f0;">日期</th>
          </tr>
        </thead>
        <tbody>
          ${hasEvents ? eventRows : noEventsMsg}
        </tbody>
      </table>
    </div>

    <!-- CTA -->
    <div style="padding:0 32px 28px;">
      <a href="${baseUrl}/reports/bonus/monthly"
         style="display:inline-block;padding:10px 24px;background:#722ed1;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">
        查看完整報表
      </a>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;background:#fafafa;border-top:1px solid #f0f0f0;font-size:12px;color:#aaa;text-align:center;">
      此郵件由系統自動發送，每月 1 日寄出上月摘要。如有疑問請聯絡管理員。
    </div>
  </div>
</body>
</html>`
}

// ── PDF generation ───────────────────────────────────────

export async function generateReportPDF(html: string): Promise<Buffer> {
  const puppeteer = await import('puppeteer')
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdf = await page.pdf({
      format: 'A4',
      margin: { top: '16mm', bottom: '16mm', left: '16mm', right: '16mm' },
      printBackground: true,
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}

// ── Send logic ───────────────────────────────────────────

export async function sendMonthlyReports(year: number, month: number): Promise<{ sent: number; skipped: number; errors: number }> {
  const configRow = await prisma.systemConfig.findUnique({ where: { key: GMAIL_CONFIG_KEY } })
  if (!configRow) {
    console.warn('[bonus-monthly-notifier] Gmail config not found, skipping')
    return { sent: 0, skipped: 0, errors: 0 }
  }
  const gmailConfig: GmailConfig = JSON.parse(configRow.value as string)

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

  // Get all active users who have any bonus member records
  const activeUsers = await prisma.user.findMany({
    where: {
      active: true,
      bonusAllocations: { some: {} },
    },
    select: { id: true },
  })

  let sent = 0, skipped = 0, errors = 0

  for (const { id: userId } of activeUsers) {
    try {
      const report = await buildUserReport(userId, year, month)
      if (!report) { skipped++; continue }
      if (report.events.length === 0 && report.ytdConfirmed === 0 && report.ytdProjected === 0) {
        skipped++
        continue
      }

      const html = generateMonthlyReportHTML(report, baseUrl)
      const pdfBuffer = await generateReportPDF(html)
      const result = await sendEmail({
        to: [report.userEmail],
        subject: `[點數報表] ${year}年${month}月 專案點數變動摘要`,
        html,
        attachments: [{
          filename: `點數報表_${year}年${month}月.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        }],
      }, gmailConfig)

      if (result.success) {
        sent++
        console.log(`[bonus-monthly-notifier] Sent to ${report.userEmail}`)
      } else {
        errors++
        console.error(`[bonus-monthly-notifier] Failed for ${report.userEmail}:`, result.error)
      }
    } catch (err) {
      errors++
      console.error(`[bonus-monthly-notifier] Error for userId ${userId}:`, err)
    }
  }

  console.log(`[bonus-monthly-notifier] Done: sent=${sent} skipped=${skipped} errors=${errors}`)
  return { sent, skipped, errors }
}

// ── Worker ───────────────────────────────────────────────

async function runMonthlyJob(_job: Job) {
  const now = new Date()
  // Send report for previous month
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const year = prevMonth.getFullYear()
  const month = prevMonth.getMonth() + 1
  console.log(`[bonus-monthly-notifier] Sending monthly reports for ${year}-${String(month).padStart(2, '0')}`)
  await sendMonthlyReports(year, month)
}

export function startBonusMonthlyNotifierWorker(): Worker {
  const worker = new Worker(QUEUE_NAME, runMonthlyJob, {
    connection: redisOpts,
    concurrency: 1,
  })

  worker.on('completed', (job) => {
    console.log(`[bonus-monthly-notifier] Job ${job.id} completed`)
  })
  worker.on('failed', (job, err) => {
    console.error(`[bonus-monthly-notifier] Job ${job?.id} failed:`, err.message)
  })

  return worker
}

export async function stopBonusMonthlyNotifierWorker(worker: Worker) {
  await worker.close()
  if (notifyQueue) {
    await notifyQueue.close()
    notifyQueue = null
  }
}
