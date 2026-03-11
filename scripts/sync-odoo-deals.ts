/**
 * Odoo Deals Sync Script
 *
 * Usage: npx tsx scripts/sync-odoo-deals.ts [options]
 * Options:
 *   --limit=N       Limit number of orders to sync (default: 1000)
 *   --from=DATE     Only sync orders from this date (YYYY-MM-DD)
 */

import { PrismaClient } from '@prisma/client'
import { odooClient } from '../src/lib/odoo'

const prisma = new PrismaClient()

// 清理 HTML 標籤，提取純文字
function stripHtml(html: string | null): string | null {
  if (!html) return null
  // 移除所有 HTML 標籤
  let text = html.replace(/<[^>]*>/g, ' ')
  // 解碼 HTML entities
  text = text.replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
  // 移除多餘空白
  text = text.replace(/\s+/g, ' ').trim()
  // 如果只剩下很短或無意義的內容，返回 null
  if (text.length < 5 || text === 'CRM') return null
  return text
}

async function main() {
  // Parse args
  const args = process.argv.slice(2)
  let limit = 1000
  let fromDate: Date | undefined

  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      limit = parseInt(arg.split('=')[1]) || 1000
    }
    if (arg.startsWith('--from=')) {
      fromDate = new Date(arg.split('=')[1])
    }
  }

  console.log(`\n🔄 開始同步 Odoo 訂單...`)
  console.log(`   限制: ${limit} 筆`)
  if (fromDate) {
    console.log(`   起始日期: ${fromDate.toISOString().slice(0, 10)}`)
  }

  // Test connection
  const connected = await odooClient.testConnection()
  if (!connected) {
    console.error('❌ 無法連線到 Odoo 資料庫')
    process.exit(1)
  }
  console.log('✅ Odoo 連線成功')

  // Get sale orders
  const odooOrders = await odooClient.getSaleOrders({
    states: ['sale', 'draft'],
    fromDate,
    limit,
  })

  console.log(`📦 找到 ${odooOrders.length} 筆訂單`)

  let created = 0
  let updated = 0
  let projectsUpdated = 0

  for (const order of odooOrders) {
    // Check if deal exists
    const existingDeal = await prisma.deal.findUnique({
      where: { odooId: order.id },
    })

    // Find customer
    let customer = await prisma.customer.findUnique({
      where: { odooId: order.partner_id },
    })

    if (!customer) {
      customer = await prisma.customer.findFirst({
        where: { name: order.partner_name },
      })
    }

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          name: order.partner_name,
          odooId: order.partner_id,
          source: 'ODOO',
        },
      })
      console.log(`   ➕ 建立客戶: ${order.partner_name}`)
    } else if (!customer.odooId) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: { odooId: order.partner_id },
      })
    }

    // Get order lines
    const orderLines = await odooClient.getOrderLines(order.id)

    // Helper to parse product name
    const parseProductName = (name: string | object | null): string | null => {
      if (!name) return null
      if (typeof name === 'object') {
        const obj = name as Record<string, string>
        return obj.zh_TW || obj.en_US || Object.values(obj)[0] || null
      }
      return name
    }

    // Parse date range from line name
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

    // Find service dates
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

    // Build product details
    const productDetails: string[] = []
    const productsJson: Array<{
      name: string
      description: string | null
      quantity: number
      unitPrice: number
      subtotal: number
    }> = []

    // 擷取訂單明細中的備註行（沒有產品、金額為 0 的行）
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

    if (existingDeal) {
      // Update existing deal
      await prisma.deal.update({
        where: { id: existingDeal.id },
        data: {
          customerId: customer.id,
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
          console.log(`   🔄 ${order.name}: 專案產品已更新`)
        }
      }

      // Show updates for fields we care about
      const changes: string[] = []
      if (order.project_type && !existingDeal.projectType) changes.push(`專案類型=${order.project_type}`)
      if (order.client_order_ref && !existingDeal.clientOrderRef) changes.push(`客戶參照=${order.client_order_ref}`)
      if (order.project_name && !existingDeal.projectName) changes.push(`專案名稱=${order.project_name}`)

      if (changes.length > 0) {
        console.log(`   📝 ${order.name}: ${changes.join(', ')}`)
      }
    } else {
      // Create new deal
      await prisma.deal.create({
        data: {
          customerId: customer.id,
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
          createdBy: 'system',
        },
      })
      created++
      console.log(`   ➕ ${order.name}: ${order.partner_name}`)
    }
  }

  console.log(`\n✅ 同步完成`)
  console.log(`   新增: ${created} 筆`)
  console.log(`   更新: ${updated} 筆`)
  console.log(`   專案更新: ${projectsUpdated} 筆`)
  console.log(`   總計: ${odooOrders.length} 筆\n`)
}

main()
  .catch((error) => {
    console.error('❌ 錯誤:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
