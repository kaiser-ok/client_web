import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customerId')
    const limit = parseInt(searchParams.get('limit') || '10')

    if (!customerId) {
      return NextResponse.json(
        { error: '缺少 customerId' },
        { status: 400 }
      )
    }

    const deals = await prisma.deal.findMany({
      where: { customerId },
      orderBy: { closedAt: 'desc' },
      take: limit,
    })

    // Convert Decimal to number for JSON serialization
    const dealsWithNumber = deals.map(deal => ({
      ...deal,
      amount: deal.amount ? Number(deal.amount) : null,
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

    const body = await request.json()
    const {
      customerId, name, type, amount, products, salesRep,
      closedAt, startDate, endDate, autoRenew, remindDays,
      notes, attachments
    } = body

    if (!customerId || !name || !closedAt) {
      return NextResponse.json(
        { error: '缺少必要欄位 (customerId, name, closedAt)' },
        { status: 400 }
      )
    }

    const deal = await prisma.deal.create({
      data: {
        customerId,
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
        customerId,
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
