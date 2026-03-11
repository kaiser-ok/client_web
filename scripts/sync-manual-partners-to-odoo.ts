/**
 * 同步手動建立的 Partner 到 Odoo
 */

import { Pool } from 'pg'

// Odoo database connection
const odooPool = new Pool({
  host: process.env.ODOO_DB_HOST || '192.168.30.138',
  port: parseInt(process.env.ODOO_DB_PORT || '5432'),
  database: process.env.ODOO_DB_NAME || 'odoo',
  user: process.env.ODOO_DB_USER || 'proj',
  password: process.env.ODOO_DB_PASSWORD || 'p20j2ead0n1y',
  max: 5,
})

// Client Web database connection
const clientPool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'client_web',
  user: 'chunwencheng',
  password: 'chunwencheng',
  max: 5,
})

interface PartnerToSync {
  id: string
  name: string
  email: string | null
  phone: string | null
}

async function main() {
  console.log('🔄 開始同步手動建立的 Partner 到 Odoo...\n')

  // 1. 取得沒有 Odoo ID 的 Partner
  const clientResult = await clientPool.query<PartnerToSync>(`
    SELECT id, name, email, phone
    FROM partners
    WHERE "odooId" IS NULL
  `)

  const partners = clientResult.rows
  console.log(`找到 ${partners.length} 筆需要同步的 Partner:\n`)

  for (const partner of partners) {
    console.log(`  - ${partner.name} (${partner.id})`)
  }
  console.log('')

  // 2. 逐一同步到 Odoo
  let successCount = 0
  for (const partner of partners) {
    try {
      console.log(`📤 同步 "${partner.name}" 到 Odoo...`)

      // 先檢查 Odoo 是否已有同名的 Partner
      const existingResult = await odooPool.query(
        `SELECT id FROM res_partner WHERE name = $1 AND active = true LIMIT 1`,
        [partner.name]
      )

      let odooId: number

      if (existingResult.rows.length > 0) {
        // 已存在，使用現有 ID
        odooId = existingResult.rows[0].id
        console.log(`   ⚠️  Odoo 已存在同名 Partner，使用現有 ID: ${odooId}`)
      } else {
        // 建立新 Partner
        const insertResult = await odooPool.query(
          `INSERT INTO res_partner (
            name, email, phone, is_company, active, type, create_date, write_date
          ) VALUES (
            $1, $2, $3, true, true, 'contact', NOW(), NOW()
          ) RETURNING id`,
          [partner.name, partner.email, partner.phone]
        )
        odooId = insertResult.rows[0].id
        console.log(`   ✅ 已在 Odoo 建立新 Partner，ID: ${odooId}`)
      }

      // 3. 更新 client_web 的 odooId
      await clientPool.query(
        `UPDATE partners SET "odooId" = $1, source = 'ODOO', "updatedAt" = NOW() WHERE id = $2`,
        [odooId, partner.id]
      )
      console.log(`   ✅ 已更新 client_web Partner 的 odooId\n`)

      successCount++
    } catch (error) {
      console.error(`   ❌ 同步失敗:`, error)
    }
  }

  console.log(`\n🎉 同步完成！成功: ${successCount}/${partners.length}`)

  // 4. 驗證結果
  const verifyResult = await clientPool.query(`
    SELECT id, name, "odooId", source
    FROM partners
    WHERE id IN (${partners.map((_, i) => `$${i + 1}`).join(',')})
  `, partners.map(p => p.id))

  console.log('\n📋 同步結果:')
  console.log('─'.repeat(60))
  for (const row of verifyResult.rows) {
    console.log(`${row.name}: odooId=${row.odooId}, source=${row.source}`)
  }

  await odooPool.end()
  await clientPool.end()
}

main().catch(console.error)
