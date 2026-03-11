#!/usr/bin/env node
/**
 * 每日重新比對未分類 Email
 * 用法: node scripts/daily-rematch.js
 * Cron: 0 6 * * * cd /opt/client-web && node scripts/daily-rematch.js >> logs/rematch.log 2>&1
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function findCustomerByEmail(emails, excludeDomains = []) {
  const filteredEmails = emails.filter(email => {
    const domain = email.split('@')[1]
    return !excludeDomains.some(d => domain?.toLowerCase().endsWith(d.toLowerCase()))
  })

  if (filteredEmails.length === 0) return null

  return prisma.customer.findFirst({
    where: {
      OR: filteredEmails.map(email => ({
        email: { contains: email, mode: 'insensitive' },
      })),
    },
    select: { id: true, name: true, email: true },
  })
}

async function main() {
  console.log(`[${new Date().toISOString()}] Starting daily rematch...`)

  // 取得內部網域設定
  let internalDomains = []
  try {
    const configRecord = await prisma.systemConfig.findUnique({
      where: { key: 'gmail_config' },
    })
    if (configRecord) {
      const config = JSON.parse(configRecord.value)
      internalDomains = config.syncSettings?.internalDomains || []
    }
  } catch (e) {
    console.warn('Could not load gmail config:', e.message)
  }

  // 找出未分類的 Email
  const uncategorizedChunks = await prisma.documentChunk.findMany({
    where: {
      sourceType: 'EMAIL',
      customerId: null,
    },
  })

  console.log(`Found ${uncategorizedChunks.length} uncategorized emails`)

  let matchedCount = 0

  for (const chunk of uncategorizedChunks) {
    const metadata = chunk.metadata
    if (!metadata) continue

    const allEmails = []
    if (metadata.fromEmail) allEmails.push(metadata.fromEmail)
    if (Array.isArray(metadata.toEmails)) allEmails.push(...metadata.toEmails)

    if (allEmails.length === 0) continue

    const matchedCustomer = await findCustomerByEmail(allEmails, internalDomains)

    if (matchedCustomer) {
      const updatedContent = chunk.content.replace(
        '客戶: 未分類',
        `客戶: ${matchedCustomer.name}`
      )

      await prisma.documentChunk.update({
        where: { id: chunk.id },
        data: {
          customerId: matchedCustomer.id,
          content: updatedContent,
          metadata: {
            ...metadata,
            isUncategorized: false,
            customerName: matchedCustomer.name,
            rematchedAt: new Date().toISOString(),
          },
        },
      })

      console.log(`  Matched: ${metadata.subject} -> ${matchedCustomer.name}`)
      matchedCount++
    }
  }

  console.log(`[${new Date().toISOString()}] Done. Matched ${matchedCount} emails.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
