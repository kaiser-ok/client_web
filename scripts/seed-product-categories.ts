/**
 * 將 product-kb.json 中的現有分類匯入 ProductCategory 表
 * 可重複執行（冪等），已存在的分類會跳過
 *
 * 執行方式：npx tsx scripts/seed-product-categories.ts
 */

import { PrismaClient } from '@prisma/client'
import fs from 'fs'

const prisma = new PrismaClient()
const KB_PATH = '/opt/client-web/storage/product-kb.json'

async function main() {
  console.log('Loading product-kb.json...')

  if (!fs.existsSync(KB_PATH)) {
    console.error(`KB file not found: ${KB_PATH}`)
    process.exit(1)
  }

  const kb = JSON.parse(fs.readFileSync(KB_PATH, 'utf-8'))
  const categories = [...new Set(
    (kb.products as { category?: string }[])
      .map(p => p.category)
      .filter((c): c is string => Boolean(c))
  )].sort((a, b) => a.localeCompare(b, 'zh-TW'))

  console.log(`Found ${categories.length} categories in KB`)

  let created = 0
  let skipped = 0

  for (const name of categories) {
    const existing = await prisma.productCategory.findUnique({ where: { name } })
    if (existing) {
      skipped++
      continue
    }

    await prisma.productCategory.create({
      data: {
        name,
        createdBy: 'system-seed',
      },
    })
    created++
    console.log(`  + ${name}`)
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped (already existed)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
