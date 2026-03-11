/**
 * 報價範本 API
 * GET  - 列出範本 (filter: category, isActive)
 * POST - 建立範本 (ADMIN only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const isActive = searchParams.get('isActive')

    const where: Record<string, unknown> = {}
    if (category) where.category = category
    if (isActive !== null && isActive !== undefined) {
      where.isActive = isActive !== 'false'
    } else {
      where.isActive = true
    }

    const templates = await prisma.quotationTemplate.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json({ templates })
  } catch (error) {
    console.error('List quotation templates error:', error)
    return NextResponse.json({ error: '載入範本失敗' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // Check ADMIN permission
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true },
    })
    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: '只有管理員可以建立範本' }, { status: 403 })
    }

    const body = await request.json()
    const { name, category, description, items, defaultNotes, paymentTerms, sortOrder } = body

    if (!name || !category) {
      return NextResponse.json({ error: '名稱和類別為必填' }, { status: 400 })
    }

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: '產品項目格式錯誤' }, { status: 400 })
    }

    const template = await prisma.quotationTemplate.create({
      data: {
        name,
        category,
        description: description || null,
        items,
        defaultNotes: defaultNotes || null,
        paymentTerms: paymentTerms || null,
        sortOrder: sortOrder || 0,
        createdBy: session.user.email,
      },
    })

    return NextResponse.json(template)
  } catch (error) {
    console.error('Create quotation template error:', error)
    return NextResponse.json({ error: '建立範本失敗' }, { status: 500 })
  }
}
