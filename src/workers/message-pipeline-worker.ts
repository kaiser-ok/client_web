/**
 * Standalone BullMQ Worker for Message Pipeline
 * Run via: npx tsx src/workers/message-pipeline-worker.ts
 */

import dotenv from 'dotenv'
import path from 'path'
// Next.js 優先載入 .env.local，standalone worker 需手動載入
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config() // fallback to .env
import { startMessagePipelineWorker, stopMessagePipelineWorker } from '../lib/message-pipeline'
import { startLabelAnalysisWorker, stopLabelAnalysisWorker } from '../lib/line-label-analyzer'
import { startSLAWorker, startSLACronJob, stopSLAWorker } from '../lib/line-event-sla-scheduler'
import {
  startBonusMonthlyNotifierWorker,
  startBonusMonthlyNotifierCron,
  stopBonusMonthlyNotifierWorker,
} from '../lib/bonus-monthly-notifier'
import {
  startBonusDailyNotifierWorker,
  startBonusDailyNotifierCron,
  stopBonusDailyNotifierWorker,
} from '../lib/bonus-daily-notifier'
import {
  startLineBatchWorker,
  startLineBatchCron,
  stopLineBatchWorker,
} from '../lib/line-batch-analyzer'
import {
  startEventPushSweepWorker,
  startEventPushSweepCron,
  stopEventPushSweepWorker,
} from '../lib/event-push-scheduler'

console.log('[message-pipeline-worker] Starting...')

const worker = startMessagePipelineWorker()
const labelWorker = startLabelAnalysisWorker()
const slaWorker = startSLAWorker()
const bonusMonthlyWorker = startBonusMonthlyNotifierWorker()
const bonusDailyWorker = startBonusDailyNotifierWorker()
const batchWorker = startLineBatchWorker()
const eventPushSweepWorker = startEventPushSweepWorker()
startSLACronJob().catch(err => console.error('[message-pipeline-worker] SLA cron error:', err))
startBonusMonthlyNotifierCron().catch(err => console.error('[message-pipeline-worker] Bonus monthly cron error:', err))
startBonusDailyNotifierCron().catch(err => console.error('[message-pipeline-worker] Bonus daily cron error:', err))
startLineBatchCron().catch(err => console.error('[message-pipeline-worker] Batch analysis cron error:', err))
startEventPushSweepCron().catch(err => console.error('[message-pipeline-worker] Event push sweep cron error:', err))

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`[message-pipeline-worker] Received ${signal}, shutting down gracefully...`)
  try {
    await stopMessagePipelineWorker()
    await stopLabelAnalysisWorker()
    await stopSLAWorker(slaWorker)
    await stopBonusMonthlyNotifierWorker(bonusMonthlyWorker)
    await stopBonusDailyNotifierWorker(bonusDailyWorker)
    await stopLineBatchWorker()
    await stopEventPushSweepWorker(eventPushSweepWorker)
    console.log('[message-pipeline-worker] Shutdown complete')
    process.exit(0)
  } catch (err) {
    console.error('[message-pipeline-worker] Error during shutdown:', err)
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Keep process alive
worker.on('error', (err) => {
  console.error('[message-pipeline-worker] Worker error:', err)
})

labelWorker.on('error', (err) => {
  console.error('[message-pipeline-worker] Label worker error:', err)
})

slaWorker.on('error', (err) => {
  console.error('[message-pipeline-worker] SLA worker error:', err)
})

bonusMonthlyWorker.on('error', (err) => {
  console.error('[message-pipeline-worker] Bonus monthly worker error:', err)
})

bonusDailyWorker.on('error', (err) => {
  console.error('[message-pipeline-worker] Bonus daily worker error:', err)
})

batchWorker.on('error', (err) => {
  console.error('[message-pipeline-worker] Batch analysis worker error:', err)
})

eventPushSweepWorker.on('error', (err) => {
  console.error('[message-pipeline-worker] Event push sweep worker error:', err)
})

console.log('[message-pipeline-worker] Ready and listening for jobs')
