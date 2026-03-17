/**
 * LINE 頻道標籤自動分析
 * LLM 分析近期訊息並建議標籤
 */

import { Queue, Worker, Job } from 'bullmq'
import prisma from '@/lib/prisma'
import {
  LineLabelConfig,
  DEFAULT_LINE_LABEL_CONFIG,
  LINE_LABEL_CONFIG_KEY,
} from '@/types/line-label'

// ============================================
// Redis Connection
// ============================================

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

// ============================================
// Queue
// ============================================

const LABEL_QUEUE_NAME = 'line-label-analysis'

let labelQueue: Queue | null = null

function getLabelQueue(): Queue {
  if (!labelQueue) {
    labelQueue = new Queue(LABEL_QUEUE_NAME, {
      connection: redisOpts,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1000 },
      },
    })
  }
  return labelQueue
}

// ============================================
// Config Cache
// ============================================

let configCache: { config: LineLabelConfig; fetchedAt: number } | null = null
const CONFIG_CACHE_TTL = 60_000 // 1 minute

async function getLineLabelConfig(): Promise<LineLabelConfig> {
  if (configCache && Date.now() - configCache.fetchedAt < CONFIG_CACHE_TTL) {
    return configCache.config
  }

  const row = await prisma.systemConfig.findUnique({
    where: { key: LINE_LABEL_CONFIG_KEY },
  })

  let config = DEFAULT_LINE_LABEL_CONFIG
  if (row) {
    try {
      config = JSON.parse(row.value) as LineLabelConfig
    } catch {
      // use default
    }
  }

  configCache = { config, fetchedAt: Date.now() }
  return config
}

// ============================================
// Enqueue Analysis (with debounce)
// ============================================

export async function enqueueLabelAnalysis(channelId: string): Promise<void> {
  const config = await getLineLabelConfig()
  if (!config.llmSettings.enabled) return

  const queue = getLabelQueue()
  const jobId = `label-${channelId}`

  // Remove existing delayed job to reset the debounce timer
  try {
    const existingJob = await queue.getJob(jobId)
    if (existingJob) {
      const state = await existingJob.getState()
      if (state === 'delayed' || state === 'waiting') {
        await existingJob.remove()
      }
    }
  } catch {
    // Job might not exist, ignore
  }

  await queue.add(
    `analyze-${channelId}`,
    { channelId },
    {
      jobId,
      delay: config.llmSettings.debounceSeconds * 1000,
    }
  )

  console.log(`[line-label] Enqueued analysis for channel ${channelId} (delay: ${config.llmSettings.debounceSeconds}s)`)
}

// ============================================
// Analysis Logic
// ============================================

interface LLMLabelSuggestion {
  add: Array<{ labelId: string; confidence: number; reason: string }>
  remove: Array<{ labelId: string; reason: string }>
}

export async function analyzeChannelLabels(channelId: string): Promise<void> {
  const config = await getLineLabelConfig()
  if (!config.llmSettings.enabled) return

  const enabledLabels = config.labels.filter(l => l.enabled)
  if (enabledLabels.length === 0) return

  // Get recent messages within analysis window
  const windowStart = new Date(Date.now() - config.llmSettings.analysisWindow * 60 * 1000)

  const messages = await prisma.lineMessage.findMany({
    where: {
      channelId,
      timestamp: { gte: windowStart },
      messageType: 'text',
    },
    orderBy: { timestamp: 'asc' },
    take: 50,
    select: {
      lineUserId: true,
      content: true,
      timestamp: true,
    },
  })

  if (messages.length < config.llmSettings.minMessages) {
    console.log(`[line-label] Channel ${channelId}: only ${messages.length} messages, skipping (min: ${config.llmSettings.minMessages})`)
    return
  }

  // Get user display names
  const userIds = [...new Set(messages.map(m => m.lineUserId))]
  const users = await prisma.lineUser.findMany({
    where: { lineUserId: { in: userIds } },
    select: { lineUserId: true, displayName: true, identityType: true },
  })
  const userMap = new Map(users.map(u => [u.lineUserId, u]))

  // Get existing labels (skip manual ones)
  const existingLabels = await prisma.lineChannelLabel.findMany({
    where: { channelId },
  })
  const manualLabelIds = new Set(
    existingLabels.filter(l => l.source === 'manual').map(l => l.labelId)
  )

  // Get channel info
  const channel = await prisma.lineChannel.findUnique({
    where: { id: channelId },
    select: { channelName: true, partnerId: true },
  })

  // Build prompt
  const messageText = messages
    .map(m => {
      const user = userMap.get(m.lineUserId)
      const name = user?.displayName || 'Unknown'
      const role = user?.identityType === 'STAFF' ? '[員工]' : ''
      return `${role}${name}: ${m.content || ''}`
    })
    .join('\n')

  const labelDescriptions = enabledLabels
    .map(l => `- ${l.id}: ${l.label} - ${l.description} (關鍵字: ${l.keywords.join(', ')})`)
    .join('\n')

  const prompt = `分析以下 LINE 群組對話，判斷應該加上或移除哪些標籤。

頻道名稱: ${channel?.channelName || '未知'}

可用標籤:
${labelDescriptions}

目前已有的手動標籤（不可移除）: ${[...manualLabelIds].join(', ') || '無'}
目前已有的 LLM 標籤: ${existingLabels.filter(l => l.source === 'llm').map(l => l.labelId).join(', ') || '無'}

最近對話:
${messageText}

請以 JSON 格式回應，包含要新增和移除的標籤：
{
  "add": [{"labelId": "xxx", "confidence": 0.0-1.0, "reason": "原因"}],
  "remove": [{"labelId": "xxx", "reason": "原因"}]
}

注意：
1. 只使用上面列出的標籤 ID
2. 不要建議移除手動標籤
3. confidence 表示你的信心度（0-1）
4. 只在有明確證據時才建議標籤`

  // Call LLM
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
  if (!OPENAI_API_KEY) {
    console.error('[line-label] OPENAI_API_KEY not set, skipping analysis')
    return
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: '你是一個 LINE 訊息分析助手，負責為對話自動標注標籤。請只回覆 JSON 格式。' },
          { role: 'user', content: prompt },
        ],
        temperature: config.llmSettings.temperature,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      console.error(`[line-label] LLM API error: ${response.status}`)
      return
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return

    const suggestions: LLMLabelSuggestion = JSON.parse(content)
    const threshold = config.llmSettings.autoApplyThreshold

    // Process additions
    for (const item of suggestions.add || []) {
      const labelDef = enabledLabels.find(l => l.id === item.labelId)
      if (!labelDef) continue
      if (manualLabelIds.has(item.labelId)) continue // Don't overwrite manual

      if (item.confidence >= threshold && labelDef.autoApply) {
        // Auto-apply
        await prisma.lineChannelLabel.upsert({
          where: {
            channelId_labelId: { channelId, labelId: item.labelId },
          },
          update: {
            source: 'llm',
            confidence: item.confidence,
            appliedBy: 'system',
            appliedAt: new Date(),
            note: item.reason,
          },
          create: {
            channelId,
            labelId: item.labelId,
            source: 'llm',
            confidence: item.confidence,
            appliedBy: 'system',
            note: item.reason,
          },
        })

        // Sync follow_up with legacy field
        if (item.labelId === 'follow_up') {
          await prisma.lineChannel.update({
            where: { id: channelId },
            data: { needsFollowUp: true, followUpAt: new Date(), followUpBy: 'system' },
          })
        }

        console.log(`[line-label] Auto-applied label '${item.labelId}' to channel ${channelId} (confidence: ${item.confidence})`)
      } else {
        console.log(`[line-label] Suggested label '${item.labelId}' for channel ${channelId} (confidence: ${item.confidence}, threshold: ${threshold})`)
      }
    }

    // Process removals (only LLM labels)
    for (const item of suggestions.remove || []) {
      if (manualLabelIds.has(item.labelId)) continue

      const existing = existingLabels.find(l => l.labelId === item.labelId && l.source === 'llm')
      if (existing) {
        await prisma.lineChannelLabel.delete({
          where: { id: existing.id },
        })

        // Sync follow_up with legacy field
        if (item.labelId === 'follow_up') {
          await prisma.lineChannel.update({
            where: { id: channelId },
            data: { needsFollowUp: false, followUpAt: null, followUpBy: null },
          })
        }

        console.log(`[line-label] Removed LLM label '${item.labelId}' from channel ${channelId}: ${item.reason}`)
      }
    }
  } catch (error) {
    console.error(`[line-label] Analysis error for channel ${channelId}:`, error)
  }
}

// ============================================
// Worker
// ============================================

let labelWorker: Worker | null = null

export function startLabelAnalysisWorker(): Worker {
  if (labelWorker) return labelWorker

  labelWorker = new Worker(
    LABEL_QUEUE_NAME,
    async (job: Job<{ channelId: string }>) => {
      console.log(`[line-label] Processing analysis for channel ${job.data.channelId}`)
      await analyzeChannelLabels(job.data.channelId)
    },
    {
      connection: redisOpts,
      concurrency: 2,
    }
  )

  labelWorker.on('completed', (job) => {
    console.log(`[line-label] Analysis job ${job.id} completed`)
  })

  labelWorker.on('failed', (job, err) => {
    console.error(`[line-label] Analysis job ${job?.id} failed:`, err.message)
  })

  console.log('[line-label] Label analysis worker started')
  return labelWorker
}

export async function stopLabelAnalysisWorker(): Promise<void> {
  if (labelWorker) {
    await labelWorker.close()
    labelWorker = null
    console.log('[line-label] Label analysis worker stopped')
  }
  if (labelQueue) {
    await labelQueue.close()
    labelQueue = null
  }
}
