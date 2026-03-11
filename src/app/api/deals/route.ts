import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { hasPermission } from '@/constants/roles'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    // Support both customerId and partnerId for backward compatibility
    const partnerId = searchParams.get('partnerId') || searchParams.get('customerId')
    const limit = parseInt(searchParams.get('limit') || '10')

    if (!partnerId) {
      return NextResponse.json(
        { error: '缺少 partnerId' },
        { status: 400 }
      )
    }

    const deals = await prisma.deal.findMany({
      where: { partnerId },
      orderBy: [
        { closedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    })

    // Check if user can view deal amounts
    const canViewAmount = hasPermission(session.user?.role, 'VIEW_DEAL_AMOUNT')

    // Convert Decimal to number and filter sensitive fields
    const dealsWithNumber = deals.map(deal => ({
      ...deal,
      // Hide amount for users without permission
      amount: canViewAmount && deal.amount ? Number(deal.amount) : null,
    }))

    return NextResponse.json(dealsWithNumber)
  } catch (error) {
    console.error('Error fetching deals:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // Check permission to create/edit deals
    if (!hasPermission(session.user?.role, 'EDIT_DEAL')) {
      return NextResponse.json({ error: '權限不足' }, { status: 403 })
    }

    const body = await request.json()
    const {
      // Support both customerId and partnerId for backward compatibility
      partnerId: bodyPartnerId,
      customerId,
      name, type, amount, products, salesRep,
      closedAt, startDate, endDate, autoRenew, remindDays,
      notes, attachments
    } = body

    const partnerId = bodyPartnerId || customerId

    if (!partnerId || !name || !closedAt) {
      return NextResponse.json(
        { error: '缺少必要欄位 (partnerId, name, closedAt)' },
        { status: 400 }
      )
    }

    const deal = await prisma.deal.create({
      data: {
        partnerId,
        name,
        type: type || 'PURCHASE',
        amount: amount ? parseFloat(amount) : null,
        products,
        salesRep,
        closedAt: new Date(closedAt),
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        autoRenew: autoRenew || false,
        remindDays: remindDays || null,
        source: 'MANUAL',
        notes,
        attachments: attachments || [],
        createdBy: session.user?.email || 'unknown',
      },
    })

    // Create activity record
    await prisma.activity.create({
      data: {
        partnerId,
        source: 'MANUAL',
        title: `新增成交案件: ${name}`,
        content: amount ? `金額: ${Number(amount).toLocaleString()}` : undefined,
        createdBy: session.user?.email || 'unknown',
      },
    })

    return NextResponse.json({
      ...deal,
      amount: deal.amount ? Number(deal.amount) : null,
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating deal:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
