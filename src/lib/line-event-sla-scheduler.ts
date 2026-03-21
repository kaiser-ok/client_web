/**
 * LINE 事件 SLA 排程掃描
 * - BullMQ Cron Job 每 5 分鐘掃描即將違反或已違反 SLA 的事件
 * - 發送警告/違反通知給指派人及部門主管
 */

import { Queue, Worker, Job } from 'bullmq'
import prisma from '@/lib/prisma'
import { notifyEvent } from '@/lib/line-event-notifier'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

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
const QUEUE_NAME = 'line-event-sla'

// ── Queue ────────────────────────────────────────────

let slaQueue: Queue | null = null

function getSLAQueue(): Queue {
  if (!slaQueue) {
    slaQueue = new Queue(QUEUE_NAME, {
      connection: redisOpts,
      defaultJobOptions: {
        attempts: 2,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    })
  }
  return slaQueue
}

// ── 排程 Cron ────────────────────────────────────────

/**
 * 啟動 SLA Cron Job（每 5 分鐘掃描一次）
 */
export async function startSLACronJob() {
  const queue = getSLAQueue()

  // 清除舊的 repeatable job 避免重複
  const existing = await queue.getRepeatableJobs()
  for (const job of existing) {
    if (job.name === 'sla-scan') {
      await queue.removeRepeatableByKey(job.key)
    }
  }

  await queue.add(
    'sla-scan',
    {},
    {
      repeat: { pattern: '*/5 * * * *' }, // 每 5 分鐘
      jobId: 'sla-scan-cron',
    }
  )

  console.log('[line-event-sla] SLA cron job scheduled (every 5 minutes)')
}

// ── Worker ───────────────────────────────────────────

async function runSLAScan(_job: Job) {
  const now = new Date()
  const warningThreshold = new Date(now.getTime() + 60 * 60 * 1000) // 1 小時內截止 = 警告

  // 取所有未結案且有 SLA 的事件
  const events = await prisma.lineEvent.findMany({
    where: {
      status: { in: ['NEW', 'IN_PROGRESS'] },
      slaResolveDue: { not: null },
    },
    select: {
      id: true,
      title: true,
      priority: true,
      status: true,
      slaResolveDue: true,
      slaBreached: true,
      assigneeId: true,
      assignee: { select: { email: true } },
      createdBy: true,
    },
  })

  let warned = 0
  let breached = 0

  for (const event of events) {
    if (!event.slaResolveDue) continue

    const isBreached  = event.slaResolveDue < now
    const isWarning   = !isBreached && event.slaResolveDue < warningThreshold

    if (isBreached) {
      // 標記違反
      if (!event.slaBreached) {
        await prisma.lineEvent.update({
          where: { id: event.id },
          data: { slaBreached: true },
        })
      }

      // 通知指派人 + 主管
      const recipients = new Set<string>()
      if (event.assignee?.email) recipients.add(event.assignee.email)

      // 找部門主管
      if (event.assignee?.email) {
        const assigneeUser = await prisma.user.findUnique({
          where: { email: event.assignee.email },
          select: { department: true },
        })
        if (assigneeUser?.department) {
          const managers = await prisma.user.findMany({
            where: { department: assigneeUser.department, isManager: true, active: true },
            select: { email: true },
          })
          managers.forEach(m => recipients.add(m.email))
        }
      }

      for (const email of recipients) {
        await notifyEvent(event.id, 'SLA_BREACH', email).catch(console.error)
      }

      breached++
    } else if (isWarning && event.assignee?.email) {
      await notifyEvent(event.id, 'SLA_WARNING', event.assignee.email).catch(console.error)
      warned++
    }
  }

  console.log(`[line-event-sla] SLA scan done: ${warned} warnings, ${breached} breaches`)
}

export function startSLAWorker(): Worker {
  const worker = new Worker(QUEUE_NAME, runSLAScan, {
    connection: redisOpts,
    concurrency: 1,
  })

  worker.on('completed', (job) => {
    console.log(`[line-event-sla] Job ${job.id} completed`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[line-event-sla] Job ${job?.id} failed:`, err.message)
  })

  return worker
}

export async function stopSLAWorker(worker: Worker) {
  await worker.close()
  if (slaQueue) {
    await slaQueue.close()
    slaQueue = null
  }
}
