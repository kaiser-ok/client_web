import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { odooClient } from '@/lib/odoo'

// 清理 HTML 標籤
function stripHtml(html: string | null): string | null {
  if (!html) return null
  let text = html.replace(/<[^>]*>/g, ' ')
  text = text.replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
  text = text.replace(/\s+/g, ' ').trim()
  if (text.length < 5 || text === 'CRM') return null
  return text
}

/**
 * POST: 同步指定客戶的 Odoo 訂單
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id: partnerId } = await params

    // 取得 Partner 資料（需要 odooId）
    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true, name: true, odooId: true },
    })

    if (!partner) {
      return NextResponse.json({ error: 'Partner 不存在' }, { status: 404 })
    }

    if (!partner.odooId) {
      return NextResponse.json({ error: '此 Partner 尚未關聯 Odoo' }, { status: 400 })
    }

    // 測試 Odoo 連線
    const connected = await odooClient.testConnection()
    if (!connected) {
      return NextResponse.json({ error: '無法連線到 Odoo' }, { status: 500 })
    }

    // 從 Odoo 取得該客戶的訂單
    const odooOrders = await odooClient.getSaleOrdersByPartner(partner.odooId)

    let created = 0
    let updated = 0
    let projectsUpdated = 0

    for (const order of odooOrders) {
      // 檢查是否已存在
      const existingDeal = await prisma.deal.findUnique({
        where: { odooId: order.id },
      })

      // 取得訂單明細
      const orderLines = await odooClient.getOrderLines(order.id)

      // 解析產品名稱
      const parseProductName = (name: string | object | null): string | null => {
        if (!name) return null
        if (typeof name === 'object') {
          const obj = name as Record<string, string>
          return obj.zh_TW || obj.en_US || Object.values(obj)[0] || null
        }
        return name
      }

      // 解析日期範圍
      const parseDateRange = (lineName: string): { startDate: Date | null, endDate: Date | null } => {
        const match = lineName.match(/(\d{4}\/\d{2}\/\d{2})\s*[-~]\s*(\d{4}\/\d{2}\/\d{2})/)
        if (match) {
          return {
            startDate: new Date(match[1].replace(/\//g, '-')),
            endDate: new Date(match[2].replace(/\//g, '-')),
          }
        }
        return { startDate: null, endDate: null }
      }

      // 找服務期間
      let serviceStartDate: Date | null = null
      let serviceEndDate: Date | null = null

      for (const line of orderLines) {
        const { startDate, endDate } = parseDateRange(line.line_name)
        if (startDate && endDate) {
          serviceStartDate = startDate
          serviceEndDate = endDate
          break
        }
      }

      // 建立產品資料
      const productDetails: string[] = []
      const productsJson: Array<{
        name: string
        description: string | null
        quantity: number
        unitPrice: number
        subtotal: number
      }> = []
      const lineNotes: string[] = []

      for (const line of orderLines) {
        const productName = parseProductName(line.product_name)
        // 有產品名稱就加入（包含金額為 0 的產品）
        if (productName) {
          let detail = productName
          if (serviceStartDate && serviceEndDate) {
            detail += ` (${serviceStartDate.toISOString().slice(0, 10)} ~ ${serviceEndDate.toISOString().slice(0, 10)})`
          }
          productDetails.push(detail)

          productsJson.push({
            name: productName,
            description: line.line_name || null,  // 使用訂單明細說明
            quantity: line.quantity,
            unitPrice: line.price_unit,
            subtotal: line.price_subtotal,
          })
        } else if (!productName && line.price_unit === 0 && line.line_name && line.line_name.trim().length > 3) {
          // 沒有產品名稱、金額為 0 的視為備註行
          lineNotes.push(line.line_name.trim())
        }
      }

      const products = productDetails.join(', ')
      const combinedNotes = [...lineNotes, stripHtml(order.note)].filter(Boolean).join('\n')

      if (existingDeal) {
        await prisma.deal.update({
          where: { id: existingDeal.id },
          data: {
            partnerId: partner.id,
            name: order.name,
            projectName: order.project_name || existingDeal.projectName,
            clientOrderRef: order.client_order_ref || existingDeal.clientOrderRef,
            projectType: order.project_type || existingDeal.projectType,
            type: serviceStartDate ? 'MA' : existingDeal.type,
            amount: order.amount_total,
            products: products || existingDeal.products,
            productsJson: productsJson.length > 0 ? productsJson : (existingDeal.productsJson ?? undefined),
            salesRep: order.user_name || existingDeal.salesRep,
            closedAt: new Date(order.date_order),
            startDate: serviceStartDate || existingDeal.startDate,
            endDate: serviceEndDate || existingDeal.endDate,
            notes: combinedNotes || existingDeal.notes,
          },
        })
        updated++

        // 同步更新關聯專案的產品資料
        if (productsJson.length > 0) {
          const updatedProject = await prisma.project.updateMany({
            where: { dealId: existingDeal.id },
            data: {
              products: productsJson,
              startDate: serviceStartDate || undefined,
              endDate: serviceEndDate || undefined,
            },
          })
          if (updatedProject.count > 0) {
            projectsUpdated += updatedProject.count
          }
        }
      } else {
        await prisma.deal.create({
          data: {
            partnerId: partner.id,
            name: order.name,
            projectName: order.project_name || null,
            clientOrderRef: order.client_order_ref || null,
            projectType: order.project_type || null,
            type: serviceStartDate ? 'MA' : 'PURCHASE',
            amount: order.amount_total,
            products: products || null,
            productsJson: productsJson.length > 0 ? productsJson : undefined,
            salesRep: order.user_name || null,
            closedAt: new Date(order.date_order),
            startDate: serviceStartDate,
            endDate: serviceEndDate,
            source: 'ODOO',
            odooId: order.id,
            notes: combinedNotes || null,
            createdBy: session.user?.email || 'system',
          },
        })
        created++
      }
    }

    const projectMsg = projectsUpdated > 0 ? `，專案更新 ${projectsUpdated} 筆` : ''
    return NextResponse.json({
      success: true,
      message: `同步完成：新增 ${created} 筆，更新 ${updated} 筆${projectMsg}`,
      stats: { total: odooOrders.length, created, updated, projectsUpdated },
    })
  } catch (error) {
    console.error('Error syncing customer deals:', error)
    return NextResponse.json({ error: '同步失敗' }, { status: 500 })
  }
}
