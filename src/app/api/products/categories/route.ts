/**
 * 產品分類管理 API
 * GET    - 回傳分類列表（合併 DB + product-kb.json）
 * POST   - 新增分類
 * DELETE  - 刪除分類（query param ?id=xxx）
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { hasPermission } from '@/constants/roles'
import fs from 'fs'

const KB_PATH = '/opt/client-web/storage/product-kb.json'

interface KBProduct {
  id: string
  name: string
  category: string
}

function loadKBCategories(): string[] {
  try {
    if (fs.existsSync(KB_PATH)) {
      const kb = JSON.parse(fs.readFileSync(KB_PATH, 'utf-8'))
      const categories = (kb.products as KBProduct[])
        .map(p => p.category)
        .filter(Boolean)
      return [...new Set(categories)]
    }
  } catch (e) {
    console.error('Failed to load KB categories:', e)
  }
  return []
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 })
  }

  const kbCategories = loadKBCategories()
  const dbCategories = await prisma.productCategory.findMany({
    orderBy: { name: 'asc' },
  })

  const dbCategoryNames = new Set(dbCategories.map(c => c.name))
  const kbCategorySet = new Set(kbCategories)

  // Build merged list with source info
  const allNames = new Set([...kbCategories, ...dbCategories.map(c => c.name)])
  const categories = [...allNames]
    .sort((a, b) => a.localeCompare(b, 'zh-TW'))
    .map(name => {
      const inDb = dbCategoryNames.has(name)
      const inKb = kbCategorySet.has(name)
      const dbRecord = dbCategories.find(c => c.name === name)

      let source: 'db' | 'kb' | 'both'
      if (inDb && inKb) source = 'both'
      else if (inDb) source = 'db'
      else source = 'kb'

      return {
        id: dbRecord?.id || null,
        name,
        source,
        createdBy: dbRecord?.createdBy || null,
        createdAt: dbRecord?.createdAt || null,
      }
    })

  return NextResponse.json({ categories })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user?.email || '' },
    select: { role: true },
  })

  if (!hasPermission(user?.role, 'MANAGE_PRODUCT_PRIORITY')) {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }

  const body = await request.json()
  const name = (body.name as string)?.trim()

  if (!name) {
    return NextResponse.json({ error: '分類名稱不可為空' }, { status: 400 })
  }

  // Check if already exists in DB
  const existing = await prisma.productCategory.findUnique({ where: { name } })
  if (existing) {
    return NextResponse.json({ error: '此分類已存在' }, { status: 409 })
  }

  const category = await prisma.productCategory.create({
    data: {
      name,
      createdBy: session.user?.email || '',
    },
  })

  return NextResponse.json({ success: true, category })
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user?.email || '' },
    select: { role: true },
  })

  if (!hasPermission(user?.role, 'MANAGE_PRODUCT_PRIORITY')) {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: '缺少分類 ID' }, { status: 400 })
  }

  const category = await prisma.productCategory.findUnique({ where: { id } })
  if (!category) {
    return NextResponse.json({ error: '分類不存在' }, { status: 404 })
  }

  await prisma.productCategory.delete({ where: { id } })

  return NextResponse.json({ success: true, deleted: category.name })
}
