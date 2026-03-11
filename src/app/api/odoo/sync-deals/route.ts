import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { odooClient } from '@/lib/odoo'

// 清理 HTML 標籤，提取純文字
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

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // Only admin can sync
    if (session.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: '權限不足' }, { status: 403 })
    }

    // Get options from request body
    const body = await request.json().catch(() => ({}))
    const { fromDate, limit = 500 } = body

    // Test Odoo connection first
    const connected = await odooClient.testConnection()
    if (!connected) {
      return NextResponse.json({ error: '無法連線到 Odoo 資料庫' }, { status: 500 })
    }

    // Get sale orders from Odoo (confirmed + draft)
    const odooOrders = await odooClient.getSaleOrders({
      states: ['sale', 'draft'],
      fromDate: fromDate ? new Date(fromDate) : undefined,
      limit,
    })

    let created = 0
    let updated = 0
    let skipped = 0
    let projectsUpdated = 0

    for (const order of odooOrders) {
      // Check if deal with this odooId already exists
      const existingDeal = await prisma.deal.findUnique({
        where: { odooId: order.id },
      })

      // Find the partner by odooId
      let partner = await prisma.partner.findUnique({
        where: { odooId: order.partner_id },
      })

      // If partner not found, try to find by name
      if (!partner) {
        partner = await prisma.partner.findFirst({
          where: { name: order.partner_name },
        })
      }

      // If still not found, create the partner with CUSTOMER role
      if (!partner) {
        partner = await prisma.partner.create({
          data: {
            name: order.partner_name,
            odooId: order.partner_id,
            source: 'ODOO',
            roles: {
              create: {
                role: 'DEALER',
                isPrimary: true,
              },
            },
          },
        })
      } else if (!partner.odooId) {
        // Link existing partner to Odoo if not already linked
        await prisma.partner.update({
          where: { id: partner.id },
          data: { odooId: order.partner_id },
        })
      }

      // Get order lines for products
      const orderLines = await odooClient.getOrderLines(order.id)

      // Helper to parse product name from JSON or string
      const parseProductName = (name: string | object | null): string | null => {
        if (!name) return null
        if (typeof name === 'object') {
          // Odoo stores names as JSON like {"en_US": "...", "zh_TW": "..."}
          const obj = name as Record<string, string>
          return obj.zh_TW || obj.en_US || Object.values(obj)[0] || null
        }
        return name
      }

      // Helper to parse service date range from line name
      const parseDateRange = (lineName: string): { startDate: Date | null, endDate: Date | null } => {
        // Match patterns like (維護期間：2025/01/01-2025/12/31) or (2025/01/01-2025/12/31)
        const match = lineName.match(/(\d{4}\/\d{2}\/\d{2})\s*[-~]\s*(\d{4}\/\d{2}\/\d{2})/)
        if (match) {
          return {
            startDate: new Date(match[1].replace(/\//g, '-')),
            endDate: new Date(match[2].replace(/\//g, '-')),
          }
        }
        return { startDate: null, endDate: null }
      }

      // First pass: find any service date ranges
      let serviceStartDate: Date | null = null
      let serviceEndDate: Date | null = null

      for (const line of orderLines) {
        const { startDate, endDate } = parseDateRange(line.line_name)
        if (startDate && endDate) {
          serviceStartDate = startDate
          serviceEndDate = endDate
          break // Use the first date range found
        }
      }

      // Second pass: build product details with service dates
      const productDetails: string[] = []
      const productsJson: Array<{
        name: string
        description: string | null
        quantity: number
        unitPrice: number
        subtotal: number
      }> = []
      // 擷取訂單明細中的備註行
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
      // 合併訂單明細中的備註和主備註
      const combinedNotes = [...lineNotes, stripHtml(order.note)].filter(Boolean).join('\n')

      const dealData = {
        partnerId: partner.id,
        name: order.name,
        projectName: order.project_name || null,  // 專案名稱
        clientOrderRef: order.client_order_ref || null,  // 客戶參照
        projectType: order.project_type || null,  // 專案類型
        type: serviceStartDate ? 'MA' as const : 'PURCHASE' as const,
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
      }

      if (existingDeal) {
        // Update existing deal
        await prisma.deal.update({
          where: { id: existingDeal.id },
          data: {
            partnerId: partner.id,
            name: order.name,
            projectName: order.project_name || existingDeal.projectName,  // 專案名稱
            clientOrderRef: order.client_order_ref || existingDeal.clientOrderRef,  // 客戶參照
            projectType: order.project_type || existingDeal.projectType,  // 專案類型
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
        // Create new deal
        await prisma.deal.create({
          data: dealData,
        })
        created++
      }
    }

    const projectMsg = projectsUpdated > 0 ? `，專案更新 ${projectsUpdated} 筆` : ''
    return NextResponse.json({
      success: true,
      message: `訂單同步完成${projectMsg}`,
      stats: {
        total: odooOrders.length,
        created,
        updated,
        skipped,
        projectsUpdated,
      },
    })
  } catch (error) {
    console.error('Error syncing deals from Odoo:', error)
    return NextResponse.json({ error: '同步失敗' }, { status: 500 })
  }
}
