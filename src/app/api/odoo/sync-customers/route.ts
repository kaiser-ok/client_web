import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { odooClient } from '@/lib/odoo'

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // Only admin can sync
    if (session.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: '權限不足' }, { status: 403 })
    }

    // Test Odoo connection first
    const connected = await odooClient.testConnection()
    if (!connected) {
      return NextResponse.json({ error: '無法連線到 Odoo 資料庫' }, { status: 500 })
    }

    // Get customers from Odoo
    const odooCustomers = await odooClient.getCustomers()

    let created = 0
    let updated = 0
    let linked = 0
    let crmIdSynced = 0

    for (const odooCustomer of odooCustomers) {
      // Skip if name is empty
      if (!odooCustomer.name?.trim()) continue

      // Check if partner with this odooId already exists
      let existingPartner = await prisma.partner.findUnique({
        where: { odooId: odooCustomer.id },
      })

      if (existingPartner) {
        // Update existing partner
        await prisma.partner.update({
          where: { id: existingPartner.id },
          data: {
            name: odooCustomer.name,
            email: odooCustomer.email || existingPartner.email,
            phone: odooCustomer.phone || odooCustomer.mobile || existingPartner.phone,
          },
        })
        updated++

        // Sync CRM partner ID back to Odoo
        const synced = await odooClient.updatePartnerCrmId(odooCustomer.id, existingPartner.id)
        if (synced) crmIdSynced++
      } else {
        // Check if partner with same name exists (to link)
        existingPartner = await prisma.partner.findFirst({
          where: {
            name: odooCustomer.name,
            odooId: null,
          },
        })

        if (existingPartner) {
          // Link existing partner to Odoo
          await prisma.partner.update({
            where: { id: existingPartner.id },
            data: {
              odooId: odooCustomer.id,
              email: odooCustomer.email || existingPartner.email,
              phone: odooCustomer.phone || odooCustomer.mobile || existingPartner.phone,
            },
          })
          linked++

          // Sync CRM partner ID back to Odoo
          const synced = await odooClient.updatePartnerCrmId(odooCustomer.id, existingPartner.id)
          if (synced) crmIdSynced++
        } else {
          // Create new partner with CUSTOMER role
          const newPartner = await prisma.partner.create({
            data: {
              name: odooCustomer.name,
              email: odooCustomer.email,
              phone: odooCustomer.phone || odooCustomer.mobile,
              odooId: odooCustomer.id,
              source: 'ODOO',
              roles: {
                create: {
                  role: 'DEALER',
                  isPrimary: true,
                },
              },
            },
          })
          created++

          // Sync CRM partner ID back to Odoo
          const synced = await odooClient.updatePartnerCrmId(odooCustomer.id, newPartner.id)
          if (synced) crmIdSynced++
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `客戶同步完成，已回寫 ${crmIdSynced} 筆 CRM ID 到 Odoo`,
      stats: {
        total: odooCustomers.length,
        created,
        updated,
        linked,
        crmIdSynced,
      },
    })
  } catch (error) {
    console.error('Error syncing customers from Odoo:', error)
    return NextResponse.json({ error: '同步失敗' }, { status: 500 })
  }
}
