import { Pool } from 'pg'

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'odoo',
  user: 'proj',
  password: 'p20j2ead0n1y',
})

async function test() {
  console.log('Testing Odoo connection...\n')
  
  const client = await pool.connect()
  console.log('✅ Connection successful')
  
  // Customers count
  const customersResult = await client.query(`
    SELECT COUNT(*) as count FROM res_partner 
    WHERE active = true 
    AND (is_company = true OR parent_id IS NULL)
    AND name IS NOT NULL AND name != ''
  `)
  console.log(`✅ Customers (companies): ${customersResult.rows[0].count}`)
  
  // Orders count
  const ordersResult = await client.query(`
    SELECT COUNT(*) as count FROM sale_order WHERE state = 'sale'
  `)
  console.log(`✅ Sale Orders: ${ordersResult.rows[0].count}`)
  
  // Employees count
  const employeesResult = await client.query(`
    SELECT COUNT(*) as count FROM res_partner p
    JOIN res_partner_res_partner_category_rel rel ON p.id = rel.partner_id
    WHERE rel.category_id = 3 AND p.active = true
  `)
  console.log(`✅ Employees: ${employeesResult.rows[0].count}`)
  
  // Invoices count
  const invoicesResult = await client.query(`
    SELECT COUNT(*) as count FROM account_move 
    WHERE move_type = 'out_invoice' AND state = 'posted'
  `)
  console.log(`✅ Invoices: ${invoicesResult.rows[0].count}`)
  
  // Write permission test
  await client.query('BEGIN')
  try {
    const insertResult = await client.query(`
      INSERT INTO res_partner (name, active, is_company, type, create_date, write_date)
      VALUES ('__TEST_WRITE__', true, true, 'contact', NOW(), NOW())
      RETURNING id
    `)
    console.log(`✅ Write permission OK (test id: ${insertResult.rows[0].id})`)
    await client.query('ROLLBACK')
    console.log('   (rolled back)')
  } catch (err: any) {
    await client.query('ROLLBACK')
    console.log(`❌ Write FAILED: ${err.message}`)
  }
  
  client.release()
  await pool.end()
  console.log('\n✅ All tests passed!')
}

test().catch(err => {
  console.error('❌ Failed:', err.message)
  process.exit(1)
})
