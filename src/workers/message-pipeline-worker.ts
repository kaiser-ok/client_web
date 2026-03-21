/**
 * Standalone BullMQ Worker for Message Pipeline
 * Run via: npx tsx src/workers/message-pipeline-worker.ts
 */

import { startMessagePipelineWorker, stopMessagePipelineWorker } from '../lib/message-pipeline'
import { startLabelAnalysisWorker, stopLabelAnalysisWorker } from '../lib/line-label-analyzer'
import { startSLAWorker, startSLACronJob, stopSLAWorker } from '../lib/line-event-sla-scheduler'

console.log('[message-pipeline-worker] Starting...')

const worker = startMessagePipelineWorker()
const labelWorker = startLabelAnalysisWorker()
const slaWorker = startSLAWorker()
startSLACronJob().catch(err => console.error('[message-pipeline-worker] SLA cron error:', err))

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`[message-pipeline-worker] Received ${signal}, shutting down gracefully...`)
  try {
    await stopMessagePipelineWorker()
    await stopLabelAnalysisWorker()
    await stopSLAWorker(slaWorker)
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

console.log('[message-pipeline-worker] Ready and listening for jobs')
