import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { odooClient } from '@/lib/odoo'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    if (!['ADMIN', 'FINANCE'].includes(session.user?.role ?? '')) {
      return NextResponse.json({ error: '權限不足' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const { fromDate } = body

    const connected = await odooClient.testConnection()
    if (!connected) {
      return NextResponse.json({ error: '無法連線到 Odoo 資料庫' }, { status: 500 })
    }

    const odooInvoices = await odooClient.getAllInvoicesForSync(
      fromDate ? new Date(fromDate) : undefined
    )

    // 預建 deal name → id 對照表（S00396 → dealId）
    const allDeals = await prisma.deal.findMany({
      select: { id: true, name: true, partnerId: true },
    })
    const dealByName = new Map(allDeals.map(d => [d.name, d]))

    // 預建 odooPartnerId → local partnerId 對照表
    const allPartners = await prisma.partner.findMany({
      where: { odooId: { not: null } },
      select: { id: true, odooId: true },
    })
    const partnerByOdooId = new Map(allPartners.map(p => [p.odooId!, p.id]))

    let created = 0
    let updated = 0

    for (const inv of odooInvoices) {
      const deal = inv.invoice_origin ? dealByName.get(inv.invoice_origin) : null
      const partnerId = inv.partner_id
        ? (partnerByOdooId.get(inv.partner_id) ?? deal?.partnerId ?? null)
        : (deal?.partnerId ?? null)

      const existing = await prisma.invoice.findUnique({ where: { odooId: inv.id } })

      await prisma.invoice.upsert({
        where: { odooId: inv.id },
        update: {
          name: inv.name,
          invoiceDate: new Date(inv.invoice_date),
          amount: inv.amount_total,
          amountResidual: inv.amount_residual,
          state: inv.state,
          paymentState: inv.payment_state,
          origin: inv.invoice_origin,
          dealId: deal?.id ?? null,
          partnerId,
        },
        create: {
          odooId: inv.id,
          name: inv.name,
          invoiceDate: new Date(inv.invoice_date),
          amount: inv.amount_total,
          amountResidual: inv.amount_residual,
          state: inv.state,
          paymentState: inv.payment_state,
          origin: inv.invoice_origin,
          dealId: deal?.id ?? null,
          partnerId,
        },
      })

      if (existing) updated++
      else created++
    }

    return NextResponse.json({
      success: true,
      message: `發票同步完成`,
      stats: { total: odooInvoices.length, created, updated },
    })
  } catch (error) {
    console.error('Error syncing invoices:', error)
    return NextResponse.json({ error: '同步失敗' }, { status: 500 })
  }
}
