/**
 * Unified Message Pipeline
 * BullMQ-based queue for LINE/Slack/Gmail → Graphiti ingestion
 */

import { Queue, Worker, Job } from 'bullmq'
import { graphitiClient } from './graphiti'
import { resolveEntity } from './entity-resolver'
import type { UnifiedMessage, MessagePipelineJobData } from '@/types/unified-message'
import type { LineWebhookEvent } from './line'
import { enqueueLabelAnalysis } from './line-label-analyzer'
import crypto from 'crypto'
import { createLogger } from './logger'

const log = createLogger('pipeline', 'pipeline.log')

// ============================================
// Redis Connection Options
// ============================================

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

function parseRedisUrl(url: string) {
  const parsed = new URL(url)
  return {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    maxRetriesPerRequest: null as null, // Required by BullMQ
  }
}

const redisOpts = parseRedisUrl(REDIS_URL)

// ============================================
// Queue
// ============================================

const QUEUE_NAME = 'message-pipeline'

let messagePipelineQueue: Queue | null = null

function getMessagePipelineQueue(): Queue {
  if (!messagePipelineQueue) {
    messagePipelineQueue = new Queue(QUEUE_NAME, {
      connection: redisOpts,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    })
  }
  return messagePipelineQueue
}

// ============================================
// Normalizers
// ============================================

export function normalizeLineMessage(
  event: LineWebhookEvent,
  user: { displayName: string } | null,
  channel: { partnerId: string | null; channelName: string | null } | null
): UnifiedMessage {
  return {
    id: crypto.randomUUID(),
    channel: 'LINE',
    channelMessageId: event.message!.id,
    content: event.message!.text || '',
    timestamp: new Date(event.timestamp),
    sender: {
      channelUserId: event.source.userId!,
      displayName: user?.displayName,
    },
    channelId: event.source.groupId || event.source.roomId || event.source.userId,
    channelName: channel?.channelName || undefined,
    partnerId: channel?.partnerId || undefined,
  }
}

export function normalizeSlackMessage(
  event: {
    user?: string
    text?: string
    channel?: string
    ts?: string
    thread_ts?: string
  },
  senderName?: string,
  channelName?: string,
  partnerId?: string,
  eventTime?: number
): UnifiedMessage {
  const timestamp = eventTime
    ? new Date(eventTime * 1000)
    : new Date(parseFloat(event.ts!) * 1000)

  return {
    id: crypto.randomUUID(),
    channel: 'SLACK',
    channelMessageId: event.ts!,
    content: event.text!,
    timestamp,
    sender: {
      channelUserId: event.user!,
      displayName: senderName,
    },
    channelId: event.channel,
    channelName,
    threadId: event.thread_ts,
    partnerId,
  }
}

export function normalizeEmail(
  email: {
    messageId: string
    subject: string
    body: string
    fromEmail: string
    from: string
    date: Date
    to: string
    cc: string
    isIncoming: boolean
  },
  customerId: string,
  matchMethod: string
): UnifiedMessage {
  const direction = email.isIncoming ? '收到' : '寄出'
  return {
    id: crypto.randomUUID(),
    channel: 'EMAIL',
    channelMessageId: email.messageId,
    content: `主旨: ${email.subject}\n\n${email.body}`,
    timestamp: email.date,
    sender: {
      channelUserId: email.fromEmail,
      displayName: email.from,
    },
    subject: email.subject,
    partnerId: customerId,
    metadata: {
      to: email.to,
      cc: email.cc,
      direction,
      matchMethod,
    },
  }
}

// ============================================
// Core Processing (no Redis required)
// ============================================

export async function processMessage(message: UnifiedMessage): Promise<void> {
  log.info(`處理訊息 ${message.channel}:${message.channelMessageId}`, {
    channel: message.channel,
    channelId: message.channelId,
    channelName: message.channelName,
    sender: message.sender.displayName,
    contentPreview: message.content?.slice(0, 80),
  })

  // Resolve partnerId via centralized entity resolution service
  let partnerId = message.partnerId
  if (!partnerId) {
    log.debug(`解析 entity: ${message.sender.displayName}`)
    const result = await resolveEntity({
      channel: message.channel as 'LINE' | 'SLACK' | 'EMAIL',
      channelUserId: message.sender.channelUserId,
      displayName: message.sender.displayName,
      channelId: message.channelId,
      channelName: message.channelName,
      messageContent: message.content,
      messageSubject: message.subject,
    })
    partnerId = result.partnerId || undefined
    log.debug(`Entity 解析結果: partnerId=${partnerId ?? '未找到'}`)
  }

  // Trigger label analysis for LINE messages
  if (message.channel === 'LINE' && message.channelId) {
    try {
      const { default: prisma } = await import('@/lib/prisma')
      const channel = await prisma.lineChannel.findUnique({
        where: { lineChannelId: message.channelId },
        select: { id: true },
      })
      if (channel) {
        await enqueueLabelAnalysis(channel.id)
        log.debug(`已排入標籤分析佇列: channelId=${channel.id}`)
      }
    } catch (error) {
      log.error('排入標籤分析失敗', { error: String(error) })
    }
  }
}

// ============================================
// Enqueue
// ============================================

export async function enqueueMessage(message: UnifiedMessage): Promise<void> {
  const queue = getMessagePipelineQueue()
  await queue.add(
    `msg-${message.channel}-${message.channelMessageId}`,
    { message } satisfies MessagePipelineJobData,
    {
      jobId: `${message.channel}-${message.channelMessageId}`,
    }
  )
}

// ============================================
// Worker
// ============================================

let messagePipelineWorker: Worker | null = null

export async function processMessagePipelineJob(job: Job<MessagePipelineJobData>): Promise<void> {
  await processMessage(job.data.message)
}

export function startMessagePipelineWorker(): Worker {
  if (messagePipelineWorker) return messagePipelineWorker

  messagePipelineWorker = new Worker(QUEUE_NAME, processMessagePipelineJob, {
    connection: redisOpts,
    concurrency: 5,
  })

  messagePipelineWorker.on('completed', (job) => {
    log.info(`Job 完成: ${job.id}`)
  })

  messagePipelineWorker.on('failed', (job, err) => {
    log.error(`Job 失敗: ${job?.id}`, { error: err.message })
  })

  log.info('Worker 已啟動')
  return messagePipelineWorker
}

export async function stopMessagePipelineWorker(): Promise<void> {
  if (messagePipelineWorker) {
    await messagePipelineWorker.close()
    messagePipelineWorker = null
    console.log('[message-pipeline] Worker stopped')
  }
  if (messagePipelineQueue) {
    await messagePipelineQueue.close()
    messagePipelineQueue = null
  }
}
