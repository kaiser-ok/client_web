/**
 * 報價單 API
 * POST - 建立新報價單
 * GET - 列出報價單
 *
 * 權限控制：
 * - 業務：只能看到/管理自己建立的報價單
 * - 財務/管理員：可以看到所有報價單（含他人草稿）
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { hasPermission } from '@/constants/roles'

// 取得使用者角色
async function getUserRole(email: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { role: true },
  })
  return user?.role || 'SUPPORT'
}

// 產生報價單編號 YYMMDD[A-Z]
async function generateQuotationNo(): Promise<string> {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(-2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const datePrefix = `${yy}${mm}${dd}`

  // 查找今天已有的報價單數量
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

  const todayCount = await prisma.quotation.count({
    where: {
      createdAt: {
        gte: startOfDay,
        lt: endOfDay,
      },
    },
  })

  // A-Z 序列（最多支援 26 張/天）
  const suffix = String.fromCharCode(65 + todayCount) // 65 = 'A'

  return `${datePrefix}${suffix}`
}

// 建立報價單
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // 檢查建立報價單權限
    const role = await getUserRole(session.user.email)
    if (!hasPermission(role, 'CREATE_QUOTATION')) {
      return NextResponse.json({ error: '您沒有建立報價單的權限' }, { status: 403 })
    }

    const body = await request.json()
    const { customerId, projectName, items, notes, validUntil } = body

    if (!customerId) {
      return NextResponse.json({ error: '請選擇客戶' }, { status: 400 })
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '請新增產品項目' }, { status: 400 })
    }

    // 解析客戶 ID - 可能是 cuid 或 Odoo ID
    let resolvedCustomerId = customerId

    // 如果是純數字，視為 Odoo ID，需要查找對應的資料庫 ID
    if (/^\d+$/.test(customerId)) {
      const partner = await prisma.partner.findFirst({
        where: { odooId: parseInt(customerId) },
        select: { id: true },
      })
      if (!partner) {
        return NextResponse.json({ error: '找不到對應的客戶' }, { status: 400 })
      }
      resolvedCustomerId = partner.id
    } else {
      // 驗證 cuid 格式的客戶 ID 存在
      const partner = await prisma.partner.findUnique({
        where: { id: customerId },
        select: { id: true },
      })
      if (!partner) {
        return NextResponse.json({ error: '客戶不存在' }, { status: 400 })
      }
    }

    // 計算總金額（含稅）
    const totalAmount = items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => {
      return sum + (item.quantity || 1) * (item.unitPrice || 0)
    }, 0)

    // 產生報價單編號
    const quotationNo = await generateQuotationNo()

    // 建立報價單
    const quotation = await prisma.quotation.create({
      data: {
        quotationNo,
        partnerId: resolvedCustomerId,
        projectName,
        totalAmount,
        notes,
        validUntil: validUntil ? new Date(validUntil) : null,
        createdBy: session.user.email,
        items: {
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
        },
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
    console.error('Create quotation error:', error)
    return NextResponse.json({ error: '建立報價單失敗' }, { status: 500 })
  }
}

// 列出報價單
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const role = await getUserRole(session.user.email)
    const canViewAll = hasPermission(role, 'VIEW_ALL_QUOTATIONS')

    const { searchParams } = new URL(request.url)
    // Support both partnerId and customerId for backward compatibility
    const partnerId = searchParams.get('partnerId') || searchParams.get('customerId')
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}
    if (partnerId) where.partnerId = partnerId
    if (status) where.status = status

    // 業務只能看到自己建立的報價單
    // 財務和管理員可以看到所有報價單
    if (!canViewAll) {
      where.createdBy = session.user.email
    }

    const [quotations, total] = await Promise.all([
      prisma.quotation.findMany({
        where,
        include: {
          partner: {
            select: { id: true, name: true },
          },
          items: {
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.quotation.count({ where }),
    ])

    return NextResponse.json({
      quotations,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      canViewAll, // 讓前端知道是否顯示「建立者」欄位
    })
  } catch (error) {
    console.error('List quotations error:', error)
    return NextResponse.json({ error: '載入報價單失敗' }, { status: 500 })
  }
}
