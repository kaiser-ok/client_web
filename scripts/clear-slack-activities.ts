/**
 * 清除 Slack Activity 測試腳本
 *
 * 使用方式:
 *   npx tsx scripts/clear-slack-activities.ts                    # 清除所有 SLACK 活動
 *   npx tsx scripts/clear-slack-activities.ts --customer <id>    # 清除指定客戶的 SLACK 活動
 *   npx tsx scripts/clear-slack-activities.ts --dry-run          # 只顯示數量，不刪除
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const customerIdx = args.indexOf('--customer')
  const customerId = customerIdx !== -1 ? args[customerIdx + 1] : null

  console.log('='.repeat(50))
  console.log('清除 Slack Activity 工具')
  console.log('='.repeat(50))

  const where: Record<string, unknown> = {
    source: 'SLACK',
  }

  if (customerId) {
    where.customerId = customerId

    // 取得客戶名稱
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { name: true },
    })

    if (!customer) {
      console.error(`錯誤: 找不到客戶 ID: ${customerId}`)
      process.exit(1)
    }

    console.log(`目標客戶: ${customer.name} (${customerId})`)
  } else {
    console.log('目標: 所有客戶的 SLACK 活動')
  }

  // 查詢數量
  const count = await prisma.activity.count({ where })
  console.log(`\n找到 ${count} 筆 SLACK 活動記錄`)

  if (count === 0) {
    console.log('沒有需要刪除的記錄')
    process.exit(0)
  }

  // 顯示一些樣本
  const samples = await prisma.activity.findMany({
    where,
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      tags: true,
      createdAt: true,
      customer: { select: { name: true } },
    },
  })

  console.log('\n最近的活動記錄:')
  samples.forEach((a, i) => {
    console.log(`  ${i + 1}. [${a.customer.name}] ${a.title}`)
    console.log(`     標籤: ${a.tags.join(', ')} | 建立: ${a.createdAt.toLocaleString('zh-TW')}`)
  })

  if (dryRun) {
    console.log('\n[DRY RUN] 未執行刪除，加上 --dry-run 以外的參數來實際刪除')
    process.exit(0)
  }

  // 確認刪除
  console.log('\n執行刪除...')
  const result = await prisma.activity.deleteMany({ where })
  console.log(`✓ 已刪除 ${result.count} 筆記錄`)
}

main()
  .catch((e) => {
    console.error('錯誤:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
