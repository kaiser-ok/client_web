/**
 * 單一報價範本 API
 * GET    - 取得範本
 * PUT    - 更新範本 (ADMIN only)
 * DELETE - 軟刪除範本 (ADMIN only, set isActive=false)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id } = await params

    const template = await prisma.quotationTemplate.findUnique({
      where: { id },
    })

    if (!template) {
      return NextResponse.json({ error: '範本不存在' }, { status: 404 })
    }

    return NextResponse.json(template)
  } catch (error) {
    console.error('Get quotation template error:', error)
    return NextResponse.json({ error: '載入範本失敗' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true },
    })
    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: '只有管理員可以更新範本' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const { name, category, description, items, defaultNotes, paymentTerms, sortOrder } = body

    const template = await prisma.quotationTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(category !== undefined && { category }),
        ...(description !== undefined && { description }),
        ...(items !== undefined && { items }),
        ...(defaultNotes !== undefined && { defaultNotes }),
        ...(paymentTerms !== undefined && { paymentTerms }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
    })

    return NextResponse.json(template)
  } catch (error) {
    console.error('Update quotation template error:', error)
    return NextResponse.json({ error: '更新範本失敗' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true },
    })
    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: '只有管理員可以刪除範本' }, { status: 403 })
    }

    const { id } = await params

    // Soft delete
    await prisma.quotationTemplate.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete quotation template error:', error)
    return NextResponse.json({ error: '刪除範本失敗' }, { status: 500 })
  }
}
