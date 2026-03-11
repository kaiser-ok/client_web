import { odooClient } from '../src/lib/odoo'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function syncCustomers() {
  console.log('開始同步客戶...\n')

  // Test connection
  const connected = await odooClient.testConnection()
  if (!connected) {
    console.log('無法連線到 Odoo 資料庫')
    process.exit(1)
  }
  console.log('Odoo 連線成功')

  // Get customers from Odoo
  const odooCustomers = await odooClient.getCustomers()
  console.log('Odoo 客戶數:', odooCustomers.length)

  let created = 0
  let updated = 0
  let linked = 0
  let crmIdSynced = 0

  for (const odooCustomer of odooCustomers) {
    if (!odooCustomer.name?.trim()) continue

    let existingPartner = await prisma.partner.findUnique({
      where: { odooId: odooCustomer.id },
    })

    if (existingPartner) {
      await prisma.partner.update({
        where: { id: existingPartner.id },
        data: {
          name: odooCustomer.name,
          email: odooCustomer.email || existingPartner.email,
          phone: odooCustomer.phone || odooCustomer.mobile || existingPartner.phone,
        },
      })
      updated++

      const synced = await odooClient.updatePartnerCrmId(odooCustomer.id, existingPartner.id)
      if (synced) crmIdSynced++
    } else {
      existingPartner = await prisma.partner.findFirst({
        where: { name: odooCustomer.name, odooId: null },
      })

      if (existingPartner) {
        await prisma.partner.update({
          where: { id: existingPartner.id },
          data: {
            odooId: odooCustomer.id,
            email: odooCustomer.email || existingPartner.email,
            phone: odooCustomer.phone || odooCustomer.mobile || existingPartner.phone,
          },
        })
        linked++

        const synced = await odooClient.updatePartnerCrmId(odooCustomer.id, existingPartner.id)
        if (synced) crmIdSynced++
      } else {
        const newPartner = await prisma.partner.create({
          data: {
            name: odooCustomer.name,
            email: odooCustomer.email,
            phone: odooCustomer.phone || odooCustomer.mobile,
            odooId: odooCustomer.id,
            source: 'ODOO',
            roles: { create: { role: 'CUSTOMER', isPrimary: true } },
          },
        })
        created++

        const synced = await odooClient.updatePartnerCrmId(odooCustomer.id, newPartner.id)
        if (synced) crmIdSynced++
      }
    }
  }

  console.log('\n========== 同步結果 ==========')
  console.log('Odoo 客戶總數:', odooCustomers.length)
  console.log('新增:', created)
  console.log('更新:', updated)
  console.log('連結:', linked)
  console.log('CRM ID 回寫:', crmIdSynced)
  console.log('==============================')

  await prisma.$disconnect()
  process.exit(0)
}

syncCustomers().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
