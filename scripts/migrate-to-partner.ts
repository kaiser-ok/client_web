/**
 * Partner 統一架構遷移腳本
 * 從 Customer + Supplier 遷移到 Partner + PartnerRole
 *
 * 使用方式：
 * npx tsx scripts/migrate-to-partner.ts [--dry-run]
 */

import { Pool } from 'pg'
import * as fs from 'fs'
import * as path from 'path'

const isDryRun = process.argv.includes('--dry-run')

// 資料庫連線
const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    'postgresql://chunwencheng:chunwencheng@localhost:5432/client_web',
})

async function log(message: string) {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ${message}`)
}

async function checkPrerequisites(): Promise<boolean> {
  log('檢查遷移前置條件...')

  const client = await pool.connect()
  try {
    // 檢查 customers 表是否存在
    const customersExist = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'customers'
      )
    `)

    if (!customersExist.rows[0].exists) {
      log('錯誤: customers 表不存在，可能已經遷移過了')
      return false
    }

    // 統計現有資料
    const customerCount = await client.query('SELECT COUNT(*) FROM customers')
    const supplierCount = await client.query('SELECT COUNT(*) FROM suppliers')

    log(`現有資料統計:`)
    log(`  - Customers: ${customerCount.rows[0].count}`)
    log(`  - Suppliers: ${supplierCount.rows[0].count}`)

    // 檢查 partners 表是否已存在
    const partnersExist = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'partners'
      )
    `)

    if (partnersExist.rows[0].exists) {
      const partnerCount = await client.query('SELECT COUNT(*) FROM partners')
      log(`警告: partners 表已存在，包含 ${partnerCount.rows[0].count} 筆資料`)
    }

    return true
  } finally {
    client.release()
  }
}

async function runMigration(): Promise<void> {
  log('開始執行遷移...')

  const sqlPath = path.join(__dirname, 'migrate-to-partner.sql')
  const sql = fs.readFileSync(sqlPath, 'utf-8')

  const client = await pool.connect()
  try {
    if (isDryRun) {
      log('=== DRY RUN 模式 - 不會實際執行變更 ===')
      log('SQL 腳本內容:')
      console.log(sql.substring(0, 1000) + '...')
      return
    }

    // 執行 SQL
    await client.query(sql)
    log('SQL 遷移腳本執行完成')

  } finally {
    client.release()
  }
}

async function verifyMigration(): Promise<void> {
  log('驗證遷移結果...')

  const client = await pool.connect()
  try {
    // 統計新表資料
    const results = await client.query(`
      SELECT 'partners' as table_name, COUNT(*)::int as count FROM partners
      UNION ALL
      SELECT 'partner_roles', COUNT(*)::int FROM partner_roles
      UNION ALL
      SELECT 'partner_views', COUNT(*)::int FROM partner_views
      UNION ALL
      SELECT 'partner_files', COUNT(*)::int FROM partner_files
    `)

    log('遷移後資料統計:')
    for (const row of results.rows) {
      log(`  - ${row.table_name}: ${row.count}`)
    }

    // 檢查角色分佈
    const roleStats = await client.query(`
      SELECT role, COUNT(*)::int as count
      FROM partner_roles
      GROUP BY role
      ORDER BY role
    `)

    log('角色分佈:')
    for (const row of roleStats.rows) {
      log(`  - ${row.role}: ${row.count}`)
    }

    // 檢查外鍵是否正確
    const fkCheck = await client.query(`
      SELECT
        'activities' as table_name,
        COUNT(*)::int as total,
        COUNT(partner_id)::int as with_partner
      FROM activities
      UNION ALL
      SELECT 'deals', COUNT(*), COUNT(partner_id) FROM deals
      UNION ALL
      SELECT 'open_items', COUNT(*), COUNT(partner_id) FROM open_items
      UNION ALL
      SELECT 'projects', COUNT(*), COUNT(partner_id) FROM projects
      UNION ALL
      SELECT 'quotations', COUNT(*), COUNT(partner_id) FROM quotations
    `)

    log('外鍵遷移驗證:')
    for (const row of fkCheck.rows) {
      const status = row.total === row.with_partner ? '✓' : '✗'
      log(`  ${status} ${row.table_name}: ${row.with_partner}/${row.total}`)
    }

    // 檢查舊表是否已刪除
    const oldTablesExist = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name IN ('customers', 'suppliers', 'customer_views', 'customer_files')
    `)

    if (oldTablesExist.rows.length > 0) {
      log('警告: 以下舊表仍然存在:')
      for (const row of oldTablesExist.rows) {
        log(`  - ${row.table_name}`)
      }
    } else {
      log('✓ 所有舊表已成功刪除')
    }

  } finally {
    client.release()
  }
}

async function main() {
  console.log('========================================')
  console.log('Partner 統一架構遷移工具')
  console.log('========================================')

  if (isDryRun) {
    console.log('模式: DRY RUN (不會實際執行變更)')
  } else {
    console.log('模式: 正式執行')
  }
  console.log('')

  try {
    // 前置檢查
    const canProceed = await checkPrerequisites()
    if (!canProceed) {
      process.exit(1)
    }

    // 執行遷移
    await runMigration()

    // 驗證結果
    if (!isDryRun) {
      await verifyMigration()
    }

    log('遷移完成!')

  } catch (error) {
    console.error('遷移失敗:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
