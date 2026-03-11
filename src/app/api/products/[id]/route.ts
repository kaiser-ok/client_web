/**
 * 單一產品 API
 * PUT    - 更新優先順序
 * DELETE - 從知識庫刪除產品
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
  sku?: string | null
  category: string
  listPrice?: string
  description?: string | null
  source: string
}

interface ProductKB {
  products: Product[]
  customers?: unknown[]
  priceHistory?: Record<string, unknown>
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

function saveKB(kb: ProductKB): boolean {
  try {
    fs.writeFileSync(KB_PATH, JSON.stringify(kb, null, 2), 'utf-8')
    return true
  } catch (e) {
    console.error('Failed to save KB:', e)
    return false
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id: productId } = await params
  const body = await request.json()
  const { priority } = body as { priority: number }

  // 驗證優先順序範圍
  if (typeof priority !== 'number' || priority < 1 || priority > 100) {
    return NextResponse.json({
      error: '優先順序必須在 1-100 之間'
    }, { status: 400 })
  }

  // 從知識庫取得產品資訊
  const kb = loadKB()
  if (!kb) {
    return NextResponse.json({ error: '無法載入產品知識庫' }, { status: 500 })
  }

  const product = kb.products.find(p => p.id === productId)
  if (!product) {
    return NextResponse.json({ error: '產品不存在' }, { status: 404 })
  }

  // 更新或建立優先順序
  const result = await prisma.productPriority.upsert({
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

  return NextResponse.json({
    success: true,
    productId: result.productId,
    priority: result.priority,
    updatedBy: result.updatedBy,
    updatedAt: result.updatedAt,
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user?.email || '' },
    select: { role: true },
  })

  if (user?.role !== 'ADMIN') {
    return NextResponse.json({ error: '只有管理員可以刪除產品' }, { status: 403 })
  }

  const { id: productId } = await params

  const kb = loadKB()
  if (!kb) {
    return NextResponse.json({ error: '無法載入產品知識庫' }, { status: 500 })
  }

  const index = kb.products.findIndex(p => p.id === productId)
  if (index === -1) {
    return NextResponse.json({ error: '產品不存在' }, { status: 404 })
  }

  const deletedProduct = kb.products[index]
  kb.products.splice(index, 1)

  if (!saveKB(kb)) {
    return NextResponse.json({ error: '儲存失敗' }, { status: 500 })
  }

  // Also remove priority record if exists
  await prisma.productPriority.deleteMany({ where: { productId } })

  return NextResponse.json({ success: true, deleted: deletedProduct.name })
}
