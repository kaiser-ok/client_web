/**
 * 產品搜尋 API
 * 根據關鍵字搜尋產品列表，優先列出高優先順序和既有產品
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import fs from 'fs'

const KB_PATH = '/opt/client-web/storage/product-kb.json'

interface Product {
  id: string
  name: string
  sku?: string | null
  category: string
  listPrice?: string
  description?: string | null
  source: string
}

interface ProductKB {
  products: Product[]
  priceHistory?: Record<string, { min: number; max: number; avg: number }>
}

// 載入知識庫
function loadKB(): ProductKB | null {
  try {
    if (fs.existsSync(KB_PATH)) {
      return JSON.parse(fs.readFileSync(KB_PATH, 'utf-8'))
    }
  } catch (e) {
    console.error('Failed to load KB:', e)
  }
  return null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.trim().toLowerCase() || ''
  const limit = parseInt(searchParams.get('limit') || '20', 10)
  const hasSku = searchParams.get('hasSku') === 'true'

  const kb = loadKB()
  if (!kb) {
    return NextResponse.json({ products: [] })
  }

  // 取得所有優先順序設定
  const priorities = await prisma.productPriority.findMany()
  const priorityMap = new Map(priorities.map(p => [p.productId, p.priority]))

  let products = kb.products

  // 只顯示有 SKU 的產品
  if (hasSku) {
    products = products.filter(p => p.sku)
  }

  // 如果有搜尋關鍵字，進行篩選和排序
  if (query) {
    const queryTerms = query.split(/\s+/).filter(Boolean)

    // 計算每個產品的匹配分數
    const scored = products.map(p => {
      const nameLower = p.name.toLowerCase()
      const categoryLower = p.category?.toLowerCase() || ''
      let score = 0

      for (const term of queryTerms) {
        // 完全匹配名稱
        if (nameLower === term) score += 100
        // 名稱開頭匹配
        else if (nameLower.startsWith(term)) score += 50
        // 名稱包含
        else if (nameLower.includes(term)) score += 30
        // 分類匹配
        if (categoryLower.includes(term)) score += 10
        // SKU 匹配
        if (p.sku?.toLowerCase().includes(term)) score += 40
      }

      // 加入優先順序權重（預設 50，範圍 1-100）
      // 優先順序高的產品在同分時排名更前
      const priority = priorityMap.get(p.id) ?? 50
      score += priority * 0.5

      return { product: p, score }
    })

    // 過濾有匹配的產品，並按分數排序
    products = scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(s => s.product)
  } else {
    // 沒有搜尋關鍵字時，按優先順序排序顯示
    const scored = products.map(p => ({
      product: p,
      priority: priorityMap.get(p.id) ?? 50
    }))
    products = scored
      .sort((a, b) => b.priority - a.priority)
      .map(s => s.product)
  }

  // 限制返回數量
  const result = products.slice(0, limit).map(p => ({
    id: p.id,
    name: p.name,
    sku: p.sku || null,
    category: p.category,
    listPrice: p.listPrice ? parseFloat(p.listPrice) : null,
    description: p.description,
  }))

  return NextResponse.json({ products: result })
}
