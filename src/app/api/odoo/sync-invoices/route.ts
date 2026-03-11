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

    // Get options from request body
    const body = await request.json().catch(() => ({}))
    // Support both partnerId and customerId for backward compatibility
    const partnerId = body.partnerId || body.customerId
    const limit = body.limit || 100

    if (!partnerId) {
      return NextResponse.json({ error: '請提供夥伴 ID' }, { status: 400 })
    }

    // Get partner to find odooId
    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
    })

    if (!partner) {
      return NextResponse.json({ error: '找不到夥伴' }, { status: 404 })
    }

    if (!partner.odooId) {
      return NextResponse.json({ error: '此夥伴尚未關聯 ERP，無法同步發票' }, { status: 400 })
    }

    // Test Odoo connection first
    const connected = await odooClient.testConnection()
    if (!connected) {
      return NextResponse.json({ error: '無法連線到 ERP 資料庫' }, { status: 500 })
    }

    // Get invoices from Odoo for this partner
    const invoices = await odooClient.getPartnerInvoices(partner.odooId, limit)

    let created = 0
    let skipped = 0

    for (const invoice of invoices) {
      // Check if activity with this invoice already exists
      // Use jiraKey field to store invoice number for deduplication
      const existingActivity = await prisma.activity.findFirst({
        where: {
          partnerId,
          source: 'ERP',
          jiraKey: invoice.name,
        },
      })

      if (existingActivity) {
        skipped++
        continue
      }

      // Format amount
      const formatAmount = (amount: number) => {
        return new Intl.NumberFormat('zh-TW', {
          style: 'currency',
          currency: 'TWD',
          minimumFractionDigits: 0,
        }).format(amount)
      }

      // Build title and content
      const paymentStatus = invoice.payment_state === 'paid' ? '已付款' :
                           invoice.payment_state === 'partial' ? '部分付款' :
                           invoice.amount_residual > 0 ? '待付款' : '已付款'

      const title = `發票 ${invoice.name} - ${formatAmount(invoice.amount_total)}`

      const contentParts = [
        `金額：${formatAmount(invoice.amount_total)}`,
        `狀態：${paymentStatus}`,
      ]

      if (invoice.amount_residual > 0 && invoice.payment_state !== 'paid') {
        contentParts.push(`未付餘額：${formatAmount(invoice.amount_residual)}`)
      }

      if (invoice.invoice_date_due) {
        contentParts.push(`到期日：${new Date(invoice.invoice_date_due).toLocaleDateString('zh-TW')}`)
      }

      if (invoice.user_name) {
        contentParts.push(`負責人：${invoice.user_name}`)
      }

      // Create activity
      await prisma.activity.create({
        data: {
          partnerId,
          source: 'ERP',
          title,
          content: contentParts.join('\n'),
          tags: [paymentStatus],
          jiraKey: invoice.name, // Use jiraKey to store invoice number for deduplication
          eventDate: invoice.invoice_date ? new Date(invoice.invoice_date) : null,
          createdBy: session.user?.email || 'system',
        },
      })
      created++
    }

    return NextResponse.json({
      success: true,
      message: `發票同步完成：新增 ${created} 筆，略過 ${skipped} 筆`,
      stats: {
        total: invoices.length,
        created,
        skipped,
      },
    })
  } catch (error) {
    console.error('Error syncing invoices from ERP:', error)
    return NextResponse.json({ error: '同步失敗' }, { status: 500 })
  }
}
