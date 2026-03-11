/**
 * 產品優先順序批量更新 API
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { hasPermission } from '@/constants/roles'
import fs from 'fs'

const KB_PATH = '/opt/client-web/storage/product-kb.json'

interface Product {
  id: string
  name: string
  category: string
}

interface ProductKB {
  products: Product[]
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

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 })
  }

  // 權限檢查
  const user = await prisma.user.findUnique({
    where: { email: session.user?.email || '' },
    select: { role: true },
  })

  if (!hasPermission(user?.role, 'MANAGE_PRODUCT_PRIORITY')) {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }

  const body = await request.json()
  const { updates } = body as { updates: Array<{ productId: string; priority: number }> }

  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: '請提供更新資料' }, { status: 400 })
  }

  // 驗證優先順序範圍
  for (const update of updates) {
    if (typeof update.priority !== 'number' || update.priority < 1 || update.priority > 100) {
      return NextResponse.json({
        error: `產品 ${update.productId} 的優先順序必須在 1-100 之間`
      }, { status: 400 })
    }
  }

  // 從知識庫取得產品資訊
  const kb = loadKB()
  if (!kb) {
    return NextResponse.json({ error: '無法載入產品知識庫' }, { status: 500 })
  }

  const productMap = new Map(kb.products.map(p => [p.id, p]))

  // 批量更新
  const results = await Promise.all(
    updates.map(async ({ productId, priority }) => {
      const product = productMap.get(productId)
      if (!product) {
        return { productId, success: false, error: '產品不存在' }
      }

      try {
        await prisma.productPriority.upsert({
          where: { productId },
          update: {
            priority,
            updatedBy: session.user?.email || '',
          },
          create: {
            productId,
            productName: product.name,
            category: product.category,
            priority,
            updatedBy: session.user?.email || '',
          },
        })
        return { productId, success: true }
      } catch (error) {
        return { productId, success: false, error: '更新失敗' }
      }
    })
  )

  const successCount = results.filter(r => r.success).length
  const failedCount = results.filter(r => !r.success).length

  return NextResponse.json({
    success: true,
    message: `成功更新 ${successCount} 個產品${failedCount > 0 ? `，${failedCount} 個失敗` : ''}`,
    results,
  })
}
