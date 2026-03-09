import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  image: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    if (session.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: '權限不足' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const { role } = body

    const validRoles = ['ADMIN', 'SALES', 'FINANCE', 'SUPPORT', 'RD']
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: '無效的角色' }, { status: 400 })
    }

    if (id === session.user?.id && role !== 'ADMIN') {
      return NextResponse.json(
        { error: '無法移除自己的管理員權限' },
        { status: 400 }
      )
    }

    const user = await prisma.user.update({
      where: { id },
      data: { role },
      select: USER_SELECT,
    })

    return NextResponse.json(user)
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}

// Toggle active status (停用/啟用)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    if (session.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: '權限不足' }, { status: 403 })
    }

    const { id } = await params

    if (id === session.user?.id) {
      return NextResponse.json({ error: '無法停用自己的帳號' }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '使用者不存在' }, { status: 404 })
    }

    const user = await prisma.user.update({
      where: { id },
      data: { active: !existing.active },
      select: USER_SELECT,
    })

    return NextResponse.json(user)
  } catch (error) {
    console.error('Error toggling user active:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}

// Delete user
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    if (session.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: '權限不足' }, { status: 403 })
    }

    const { id } = await params

    if (id === session.user?.id) {
      return NextResponse.json({ error: '無法刪除自己的帳號' }, { status: 400 })
    }

    await prisma.$transaction([
      prisma.projectBonusMember.deleteMany({ where: { userId: id } }),
      prisma.user.delete({ where: { id } }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting user:', error)
    return NextResponse.json({ error: '刪除失敗，該使用者可能仍有關聯資料' }, { status: 500 })
  }
}
