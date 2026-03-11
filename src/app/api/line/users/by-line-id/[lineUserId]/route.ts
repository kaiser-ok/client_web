import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * PUT: 透過 LINE User ID 更新使用者身分
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ lineUserId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { lineUserId } = await params
    const body = await request.json()
    // Support both partnerId and customerId for backward compatibility
    const partnerId = body.partnerId || body.customerId
    const { identityType, staffEmail, note } = body

    // 找到使用者
    const user = await prisma.lineUser.findUnique({
      where: { lineUserId },
    })

    if (!user) {
      return NextResponse.json({ error: '使用者不存在' }, { status: 404 })
    }

    // 驗證 identityType
    const validTypes = ['STAFF', 'PARTNER', 'CUSTOMER', 'UNKNOWN']
    if (identityType && !validTypes.includes(identityType)) {
      return NextResponse.json({ error: '無效的身分類型' }, { status: 400 })
    }

    // 如果是客戶或夥伴，驗證夥伴存在
    if (partnerId) {
      const partner = await prisma.partner.findUnique({
        where: { id: partnerId },
      })
      if (!partner) {
        return NextResponse.json({ error: '夥伴不存在' }, { status: 400 })
      }
    }

    // 更新使用者
    const updated = await prisma.lineUser.update({
      where: { lineUserId },
      data: {
        identityType: identityType || user.identityType,
        partnerId: ['CUSTOMER', 'PARTNER'].includes(identityType) ? (partnerId || null) : null,
        staffEmail: identityType === 'STAFF' ? (staffEmail || null) : null,
        note: note !== undefined ? note : user.note,
      },
    })

    return NextResponse.json({
      success: true,
      user: {
        id: updated.id,
        lineUserId: updated.lineUserId,
        displayName: updated.displayName,
        identityType: updated.identityType,
        partnerId: updated.partnerId,
      },
    })
  } catch (error) {
    console.error('Error updating LINE user:', error)
    return NextResponse.json({ error: '更新使用者失敗' }, { status: 500 })
  }
}

/**
 * GET: 透過 LINE User ID 取得使用者
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lineUserId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { lineUserId } = await params

    const user = await prisma.lineUser.findUnique({
      where: { lineUserId },
      include: {
        partner: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: '使用者不存在' }, { status: 404 })
    }

    return NextResponse.json({
      user: {
        id: user.id,
        lineUserId: user.lineUserId,
        displayName: user.displayName,
        pictureUrl: user.pictureUrl,
        identityType: user.identityType,
        partnerId: user.partnerId,
        partnerName: user.partner?.name || null,
        staffEmail: user.staffEmail,
        note: user.note,
      },
    })
  } catch (error) {
    console.error('Error fetching LINE user:', error)
    return NextResponse.json({ error: '取得使用者失敗' }, { status: 500 })
  }
}
