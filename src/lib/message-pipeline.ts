/**
 * Unified Message Pipeline
 * BullMQ-based queue for LINE/Slack/Gmail → Graphiti ingestion
 */

import { Queue, Worker, Job } from 'bullmq'
import { PrismaClient } from '@prisma/client'
import { graphitiClient } from './graphiti'
import type { UnifiedMessage, MessagePipelineJobData } from '@/types/unified-message'
import type { LineWebhookEvent } from './line'
import crypto from 'crypto'

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
  const { message } = job.data
  console.log(`[message-pipeline] Processing ${message.channel} message: ${message.channelMessageId}`)

  // Resolve partnerId if missing
  let partnerId = message.partnerId
  if (!partnerId) {
    const prisma = new PrismaClient()
    try {
      if (message.channel === 'LINE' && message.channelId) {
        const lineChannel = await prisma.lineChannel.findFirst({
          where: { lineChannelId: message.channelId },
          select: { partnerId: true },
        })
        partnerId = lineChannel?.partnerId || undefined
      } else if (message.channel === 'SLACK' && message.channelId) {
        const mapping = await prisma.slackChannelMapping.findUnique({
          where: { channelId: message.channelId },
          select: { partnerId: true },
        })
        partnerId = mapping?.partnerId || undefined
      }
      // EMAIL: already resolved at enqueue time
    } finally {
      await prisma.$disconnect()
    }
  }

  await graphitiClient.ingestMessage({
    platform: message.channel,
    external_id: message.channelMessageId,
    content: message.content,
    timestamp: new Date(message.timestamp),
    sender_id: message.sender.channelUserId,
    sender_name: message.sender.displayName,
    channel_id: message.channelId,
    channel_name: message.channelName,
    thread_id: message.threadId,
    subject: message.subject,
    partner_id: partnerId,
    metadata: message.metadata,
  })

  console.log(`[message-pipeline] Successfully ingested ${message.channel} message: ${message.channelMessageId}`)
}

export function startMessagePipelineWorker(): Worker {
  if (messagePipelineWorker) return messagePipelineWorker

  messagePipelineWorker = new Worker(QUEUE_NAME, processMessagePipelineJob, {
    connection: redisOpts,
    concurrency: 5,
  })

  messagePipelineWorker.on('completed', (job) => {
    console.log(`[message-pipeline] Job ${job.id} completed`)
  })

  messagePipelineWorker.on('failed', (job, err) => {
    console.error(`[message-pipeline] Job ${job?.id} failed:`, err.message)
  })

  console.log('[message-pipeline] Worker started')
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
