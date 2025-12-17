import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { name, amount, products, salesRep, closedAt, notes } = body

    const deal = await prisma.deal.update({
      where: { id },
      data: {
        name,
        amount: amount !== undefined ? (amount ? parseFloat(amount) : null) : undefined,
        products,
        salesRep,
        closedAt: closedAt ? new Date(closedAt) : undefined,
        notes,
      },
    })

    return NextResponse.json({
      ...deal,
      amount: deal.amount ? Number(deal.amount) : null,
    })
  } catch (error) {
    console.error('Error updating deal:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id } = await params

    await prisma.deal.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting deal:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
