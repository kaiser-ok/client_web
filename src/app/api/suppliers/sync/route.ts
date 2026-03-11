import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { odooClient } from '@/lib/odoo'

/**
 * POST: 從 Odoo 同步供應商 (as Partners with SUPPLIER role)
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // 從 Odoo 取得供應商
    const odooSuppliers = await odooClient.getSuppliers()

    let created = 0
    let updated = 0

    for (const supplier of odooSuppliers) {
      const existing = await prisma.partner.findUnique({
        where: { odooId: supplier.id },
        include: {
          roles: true,
        },
      })

      if (existing) {
        // 更新現有 Partner
        await prisma.partner.update({
          where: { id: existing.id },
          data: {
            name: supplier.name,
            email: supplier.email || null,
            phone: supplier.phone || supplier.mobile || null,
          },
        })

        // 確保有 SUPPLIER 角色
        const hasSupplierRole = existing.roles.some(r => r.role === 'SUPPLIER')
        if (!hasSupplierRole) {
          await prisma.partnerRole.create({
            data: {
              partnerId: existing.id,
              role: 'SUPPLIER',
              isPrimary: existing.roles.length === 0,
            },
          })
        }

        updated++
      } else {
        // 新增 Partner with SUPPLIER role
        await prisma.partner.create({
          data: {
            name: supplier.name,
            odooId: supplier.id,
            email: supplier.email || null,
            phone: supplier.phone || supplier.mobile || null,
            source: 'ODOO',
            roles: {
              create: {
                role: 'SUPPLIER',
                isPrimary: true,
              },
            },
          },
        })
        created++
      }
    }

    return NextResponse.json({
      success: true,
      message: `同步完成：新增 ${created} 筆，更新 ${updated} 筆`,
      created,
      updated,
      total: odooSuppliers.length,
    })
  } catch (error) {
    console.error('Error syncing suppliers:', error)
    return NextResponse.json({ error: '同步供應商失敗' }, { status: 500 })
  }
}
