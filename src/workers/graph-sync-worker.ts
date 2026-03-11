/**
 * Standalone BullMQ Worker for Graph Sync
 * Run via: npx tsx src/workers/graph-sync-worker.ts
 */

import { startGraphSyncWorker, stopGraphSyncWorker } from '../lib/graph-sync'

console.log('[graph-sync-worker] Starting...')

const worker = startGraphSyncWorker()

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`[graph-sync-worker] Received ${signal}, shutting down gracefully...`)
  try {
    await stopGraphSyncWorker()
    console.log('[graph-sync-worker] Shutdown complete')
    process.exit(0)
  } catch (err) {
    console.error('[graph-sync-worker] Error during shutdown:', err)
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Keep process alive
worker.on('error', (err) => {
  console.error('[graph-sync-worker] Worker error:', err)
})

console.log('[graph-sync-worker] Ready and listening for jobs')
