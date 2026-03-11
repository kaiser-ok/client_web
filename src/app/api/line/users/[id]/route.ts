import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// 有效的身分類型
const VALID_IDENTITY_TYPES = ['STAFF', 'PARTNER', 'CUSTOMER', 'UNKNOWN']

/**
 * GET: 取得單一 LINE 用戶詳情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id } = await params

    const user = await prisma.lineUser.findUnique({
      where: { id },
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
      return NextResponse.json({ error: '用戶不存在' }, { status: 404 })
    }

    // 取得該用戶的訊息統計
    const messageStats = await prisma.lineMessage.groupBy({
      by: ['channelId'],
      where: { lineUserId: user.lineUserId },
      _count: true,
    })

    // 取得相關頻道資訊
    const channelIds = messageStats.map(s => s.channelId)
    const channels = await prisma.lineChannel.findMany({
      where: { id: { in: channelIds } },
      select: {
        id: true,
        channelName: true,
        channelType: true,
        partnerId: true,
        partner: {
          select: { name: true },
        },
      },
    })
    const channelMap = new Map(channels.map(c => [c.id, c]))

    return NextResponse.json({
      user: {
        id: user.id,
        lineUserId: user.lineUserId,
        displayName: user.displayName,
        pictureUrl: user.pictureUrl,
        identityType: user.identityType,
        staffEmail: user.staffEmail,
        partnerId: user.partnerId,
        partnerName: user.partner?.name || null,
        note: user.note,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      channelActivity: messageStats.map(s => {
        const channel = channelMap.get(s.channelId)
        return {
          channelId: s.channelId,
          channelName: channel?.channelName || 'Unknown',
          channelType: channel?.channelType || 'UNKNOWN',
          partnerName: channel?.partner?.name || null,
          messageCount: s._count,
        }
      }),
    })
  } catch (error) {
    console.error('Error fetching LINE user:', error)
    return NextResponse.json({ error: '取得用戶失敗' }, { status: 500 })
  }
}

/**
 * PUT: 更新 LINE 用戶（設定身分類型、關聯夥伴等）
 */
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
    // Support both partnerId and customerId/supplierId for backward compatibility
    const partnerId = body.partnerId || body.customerId || body.supplierId
    const { identityType, staffEmail, note, displayName, contactName, contactPhone } = body

    // 確認用戶存在
    const existing = await prisma.lineUser.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: '用戶不存在' }, { status: 404 })
    }

    // 驗證身分類型
    if (identityType && !VALID_IDENTITY_TYPES.includes(identityType)) {
      return NextResponse.json(
        { error: `無效的身分類型，必須是: ${VALID_IDENTITY_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    // 如果設定為員工，staffEmail 應該有值
    if (identityType === 'STAFF' && !staffEmail && !existing.staffEmail) {
      return NextResponse.json(
        { error: '員工身分需要提供 Email' },
        { status: 400 }
      )
    }

    // 如果指定了夥伴 ID，確認夥伴存在
    if (partnerId) {
      const partner = await prisma.partner.findUnique({
        where: { id: partnerId },
      })
      if (!partner) {
        return NextResponse.json({ error: '夥伴不存在' }, { status: 400 })
      }
    }

    // 更新用戶
    const updated = await prisma.lineUser.update({
      where: { id },
      data: {
        identityType: identityType ?? existing.identityType,
        staffEmail: staffEmail !== undefined ? staffEmail : existing.staffEmail,
        partnerId: ['CUSTOMER', 'PARTNER'].includes(identityType) ? (partnerId !== undefined ? partnerId : existing.partnerId) : null,
        contactName: contactName !== undefined ? contactName : existing.contactName,
        contactPhone: contactPhone !== undefined ? contactPhone : existing.contactPhone,
        note: note !== undefined ? note : existing.note,
        displayName: displayName !== undefined ? displayName : existing.displayName,
      },
      include: {
        partner: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      user: {
        id: updated.id,
        lineUserId: updated.lineUserId,
        displayName: updated.displayName,
        pictureUrl: updated.pictureUrl,
        identityType: updated.identityType,
        staffEmail: updated.staffEmail,
        partnerId: updated.partnerId,
        partnerName: updated.partner?.name || null,
        note: updated.note,
      },
    })
  } catch (error) {
    console.error('Error updating LINE user:', error)
    return NextResponse.json({ error: '更新用戶失敗' }, { status: 500 })
  }
}
