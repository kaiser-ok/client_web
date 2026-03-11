/**
 * 報價單詳情 API
 * GET - 取得報價單
 * PUT - 更新報價單
 * DELETE - 刪除報價單
 *
 * 權限控制：
 * - 業務：只能操作自己建立的報價單
 * - 財務/管理員：可以操作所有報價單
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { hasPermission } from '@/constants/roles'

interface RouteParams {
  params: Promise<{ id: string }>
}

// 取得使用者角色
async function getUserRole(email: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { role: true },
  })
  return user?.role || 'SUPPORT'
}

// 檢查是否有權限操作該報價單
async function canAccessQuotation(
  quotation: { createdBy: string },
  userEmail: string,
  role: string
): Promise<boolean> {
  // 財務和管理員可以操作所有報價單
  if (hasPermission(role, 'VIEW_ALL_QUOTATIONS')) {
    return true
  }
  // 業務只能操作自己建立的
  return quotation.createdBy === userEmail
}

// 取得報價單
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id } = await params

    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: {
        partner: {
          select: { id: true, name: true, contact: true, email: true, phone: true },
        },
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    })

    if (!quotation) {
      return NextResponse.json({ error: '報價單不存在' }, { status: 404 })
    }

    // 檢查存取權限
    const role = await getUserRole(session.user.email)
    if (!(await canAccessQuotation(quotation, session.user.email, role))) {
      return NextResponse.json({ error: '您沒有查看此報價單的權限' }, { status: 403 })
    }

    return NextResponse.json({
      ...quotation,
      canEdit: hasPermission(role, 'EDIT_QUOTATION'),
      canDelete: hasPermission(role, 'DELETE_QUOTATION'),
    })
  } catch (error) {
    console.error('Get quotation error:', error)
    return NextResponse.json({ error: '載入報價單失敗' }, { status: 500 })
  }
}

// 更新報價單
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id } = await params

    // 先取得報價單檢查權限
    const existing = await prisma.quotation.findUnique({
      where: { id },
      select: { createdBy: true },
    })

    if (!existing) {
      return NextResponse.json({ error: '報價單不存在' }, { status: 404 })
    }

    const role = await getUserRole(session.user.email)
    if (!hasPermission(role, 'EDIT_QUOTATION')) {
      return NextResponse.json({ error: '您沒有編輯報價單的權限' }, { status: 403 })
    }

    // 業務只能編輯自己的報價單
    if (!(await canAccessQuotation(existing, session.user.email, role))) {
      return NextResponse.json({ error: '您只能編輯自己建立的報價單' }, { status: 403 })
    }

    const body = await request.json()
    const { projectName, items, notes, validUntil, status } = body

    // 計算總金額
    const totalAmount = items?.reduce((sum: number, item: { quantity: number; unitPrice: number }) => {
      return sum + (item.quantity || 1) * (item.unitPrice || 0)
    }, 0) || 0

    // 更新報價單
    const quotation = await prisma.quotation.update({
      where: { id },
      data: {
        projectName,
        totalAmount,
        notes,
        validUntil: validUntil ? new Date(validUntil) : null,
        status,
        items: items ? {
          deleteMany: {}, // 刪除舊的項目
          create: items.map((item: {
            productId?: string
            sku?: string
            productName: string
            category?: string
            quantity?: number
            unitPrice?: number
            description?: string
          }, index: number) => ({
            productId: item.productId,
            sku: item.sku,
            productName: item.productName,
            category: item.category,
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice || 0,
            subtotal: (item.quantity || 1) * (item.unitPrice || 0),
            description: item.description,
            sortOrder: index,
          })),
        } : undefined,
      },
      include: {
        partner: {
          select: { id: true, name: true },
        },
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    })

    return NextResponse.json(quotation)
  } catch (error) {
    console.error('Update quotation error:', error)
    return NextResponse.json({ error: '更新報價單失敗' }, { status: 500 })
  }
}

// 刪除報價單
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id } = await params

    // 先取得報價單檢查權限
    const existing = await prisma.quotation.findUnique({
      where: { id },
      select: { createdBy: true },
    })

    if (!existing) {
      return NextResponse.json({ error: '報價單不存在' }, { status: 404 })
    }

    const role = await getUserRole(session.user.email)
    if (!hasPermission(role, 'DELETE_QUOTATION')) {
      return NextResponse.json({ error: '您沒有刪除報價單的權限' }, { status: 403 })
    }

    // 業務只能刪除自己的報價單
    if (!(await canAccessQuotation(existing, session.user.email, role))) {
      return NextResponse.json({ error: '您只能刪除自己建立的報價單' }, { status: 403 })
    }

    await prisma.quotation.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete quotation error:', error)
    return NextResponse.json({ error: '刪除報價單失敗' }, { status: 500 })
  }
}
