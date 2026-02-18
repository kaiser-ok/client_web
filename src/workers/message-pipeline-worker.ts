/**
 * Standalone BullMQ Worker for Message Pipeline
 * Run via: npx tsx src/workers/message-pipeline-worker.ts
 */

import { startMessagePipelineWorker, stopMessagePipelineWorker } from '../lib/message-pipeline'

console.log('[message-pipeline-worker] Starting...')

const worker = startMessagePipelineWorker()

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`[message-pipeline-worker] Received ${signal}, shutting down gracefully...`)
  try {
    await stopMessagePipelineWorker()
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

console.log('[message-pipeline-worker] Ready and listening for jobs')
