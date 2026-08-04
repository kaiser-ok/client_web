/**
 * 事件外送 sweeper 排程
 * - BullMQ Cron Job 每 2 分鐘撈 outbox 中到期的 PENDING/FAILED 重送
 * - outbox 表本身是持久化真相來源，即使 Redis 曾中斷，恢復後也會把積壓補送完
 */

import { Queue, Worker, Job } from 'bullmq'
import { sweepOutbox } from '@/lib/event-push'

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
const QUEUE_NAME = 'event-push-sweep'

let sweepQueue: Queue | null = null

function getQueue(): Queue {
  if (!sweepQueue) {
    sweepQueue = new Queue(QUEUE_NAME, {
      connection: redisOpts,
      defaultJobOptions: {
        attempts: 2,
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 },
      },
    })
  }
  return sweepQueue
}

export async function startEventPushSweepCron() {
  const queue = getQueue()

  const existing = await queue.getRepeatableJobs()
  for (const job of existing) {
    if (job.name === 'event-push-sweep') {
      await queue.removeRepeatableByKey(job.key)
    }
  }

  await queue.add(
    'event-push-sweep',
    {},
    {
      repeat: { pattern: '*/2 * * * *' }, // 每 2 分鐘
      jobId: 'event-push-sweep-cron',
    }
  )

  console.log('[event-push] sweeper cron scheduled (every 2 minutes)')
}

async function runSweep(_job: Job) {
  const { swept } = await sweepOutbox()
  if (swept > 0) console.log(`[event-push] sweep processed ${swept} outbox rows`)
}

export function startEventPushSweepWorker(): Worker {
  const worker = new Worker(QUEUE_NAME, runSweep, {
    connection: redisOpts,
    concurrency: 1,
  })

  worker.on('failed', (job, err) => {
    console.error(`[event-push] sweep job ${job?.id} failed:`, err.message)
  })

  return worker
}

export async function stopEventPushSweepWorker(worker: Worker) {
  await worker.close()
  if (sweepQueue) {
    await sweepQueue.close()
    sweepQueue = null
  }
}
