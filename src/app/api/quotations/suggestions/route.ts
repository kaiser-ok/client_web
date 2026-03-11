/**
 * 產品說明建議 API
 * 根據產品名稱返回歷史說明建議
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import fs from 'fs'

const KB_PATH = '/opt/client-web/storage/product-kb.json'

interface ProductKB {
  products: Array<{
    id: string
    name: string
    description?: string
    source: string
  }>
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

// 從歷史報價單取得說明
async function getHistoricalDescriptions(productName: string): Promise<string[]> {
  try {
    const items = await prisma.quotationItem.findMany({
      where: {
        productName: {
          contains: productName.substring(0, 10),
          mode: 'insensitive',
        },
        description: {
          not: null,
        },
      },
      select: {
        description: true,
      },
      orderBy: {
        quotation: {
          createdAt: 'desc',
        },
      },
      take: 50,
    })

    // 統計說明出現次數
    const descCounts = new Map<string, number>()
    for (const item of items) {
      if (item.description && item.description.trim()) {
        const desc = item.description.trim()
        descCounts.set(desc, (descCounts.get(desc) || 0) + 1)
      }
    }

    // 按出現次數排序
    return Array.from(descCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([desc]) => desc)
  } catch (e) {
    console.error('Failed to get historical descriptions:', e)
    return []
  }
}

// 從 KB 取得產品描述
function getProductDescription(productName: string, kb: ProductKB): string | null {
  const nameLower = productName.toLowerCase()

  // 找到最匹配的產品
  const product = kb.products.find(p => {
    const pNameLower = p.name.toLowerCase()
    return pNameLower === nameLower ||
           pNameLower.includes(nameLower.substring(0, 10)) ||
           nameLower.includes(pNameLower.substring(0, 10))
  })

  return product?.description || null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const productName = searchParams.get('productName')

  if (!productName) {
    return NextResponse.json({ suggestions: [] })
  }

  // 載入 KB
  const kb = loadKB()

  // 取得 Odoo 產品描述
  const odooDescription = kb ? getProductDescription(productName, kb) : null

  // 取得歷史說明
  const historicalDescriptions = await getHistoricalDescriptions(productName)

  // 合併建議（Odoo 描述優先）
  const suggestions: string[] = []
  if (odooDescription) {
    suggestions.push(odooDescription)
  }
  historicalDescriptions.forEach(d => {
    if (!suggestions.includes(d)) {
      suggestions.push(d)
    }
  })

  return NextResponse.json({ suggestions: suggestions.slice(0, 5) })
}
