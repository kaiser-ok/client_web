/**
 * 產品列表 API
 * 列出所有產品（合併 product-kb.json + 資料庫優先順序）
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
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
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const query = searchParams.get('q')?.trim().toLowerCase() || ''
  const category = searchParams.get('category') || ''
  const sort = searchParams.get('sort') || 'priority' // priority, name, category

  const kb = loadKB()
  if (!kb) {
    return NextResponse.json({ products: [], total: 0, page, totalPages: 0, categories: [] })
  }

  // 取得所有優先順序設定
  const priorities = await prisma.productPriority.findMany()
  const priorityMap = new Map(priorities.map(p => [p.productId, p]))

  // 取得所有分類（合併 KB + DB）
  const kbCategories = kb.products.map(p => p.category).filter(Boolean)
  const dbCategories = await prisma.productCategory.findMany({ select: { name: true } })
  const allCategories = [...new Set([...kbCategories, ...dbCategories.map(c => c.name)])]

  // 合併產品資料
  let products = kb.products.map(p => {
    const priority = priorityMap.get(p.id)
    return {
      id: p.id,
      name: p.name,
      sku: p.sku || null,
      category: p.category,
      listPrice: p.listPrice ? parseFloat(p.listPrice) : null,
      source: p.source,
      priority: priority?.priority ?? 50,
      updatedBy: priority?.updatedBy || null,
      updatedAt: priority?.updatedAt || null,
    }
  })

  // 搜尋過濾
  if (query) {
    const queryTerms = query.split(/\s+/).filter(Boolean)
    products = products.filter(p => {
      const nameLower = p.name.toLowerCase()
      const categoryLower = p.category?.toLowerCase() || ''
      const skuLower = p.sku?.toLowerCase() || ''
      return queryTerms.some(term =>
        nameLower.includes(term) || categoryLower.includes(term) || skuLower.includes(term)
      )
    })
  }

  // 分類過濾
  if (category) {
    products = products.filter(p => p.category === category)
  }

  // 排序
  switch (sort) {
    case 'priority':
      products.sort((a, b) => b.priority - a.priority)
      break
    case 'name':
      products.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'))
      break
    case 'category':
      products.sort((a, b) => (a.category || '').localeCompare(b.category || '', 'zh-TW'))
      break
  }

  const total = products.length
  const totalPages = Math.ceil(total / limit)
  const offset = (page - 1) * limit
  const paginatedProducts = products.slice(offset, offset + limit)

  return NextResponse.json({
    products: paginatedProducts,
    total,
    page,
    totalPages,
    categories: allCategories.sort((a, b) => a.localeCompare(b, 'zh-TW')),
  })
}
