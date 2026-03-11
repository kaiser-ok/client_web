import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

// Attach graph sync middleware (PG→Neo4j via BullMQ)
if (!globalForPrisma.prisma) {
  try {
    const { setupGraphSyncMiddleware } = require('./graph-sync')
    setupGraphSyncMiddleware(prisma)
  } catch (err) {
    // Redis/BullMQ unavailability must never block PG operations
    console.warn('[prisma] Graph sync middleware not attached:', (err as Error).message)
  }
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
