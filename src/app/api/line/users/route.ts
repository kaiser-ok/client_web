import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * GET: 取得所有 LINE 用戶
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const identityType = searchParams.get('identityType')
    // Support both partnerId and customerId for backward compatibility
    const partnerId = searchParams.get('partnerId') || searchParams.get('customerId')
    const search = searchParams.get('search')

    const where: {
      identityType?: string
      partnerId?: string | null
      displayName?: { contains: string; mode: 'insensitive' }
    } = {}

    if (identityType) {
      where.identityType = identityType
    }

    if (partnerId) {
      where.partnerId = partnerId
    }

    if (search) {
      where.displayName = { contains: search, mode: 'insensitive' }
    }

    const users = await prisma.lineUser.findMany({
      where,
      include: {
        partner: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { updatedAt: 'desc' },
      ],
    })

    // 取得所有用戶的頻道出現記錄
    const lineUserIds = users.map(u => u.lineUserId)
    const messagesByUser = await prisma.lineMessage.groupBy({
      by: ['lineUserId', 'channelId'],
      where: { lineUserId: { in: lineUserIds } },
      _count: true,
    })

    // 取得相關頻道資訊
    const channelIds = [...new Set(messagesByUser.map(m => m.channelId))]
    const channels = await prisma.lineChannel.findMany({
      where: { id: { in: channelIds } },
      select: {
        id: true,
        channelName: true,
        channelType: true,
      },
    })
    const channelMap = new Map(channels.map(c => [c.id, c]))

    // 建立用戶到頻道的對應
    const userChannelsMap = new Map<string, Array<{ id: string; name: string; type: string }>>()
    for (const msg of messagesByUser) {
      const channel = channelMap.get(msg.channelId)
      if (channel) {
        const existing = userChannelsMap.get(msg.lineUserId) || []
        if (!existing.find(c => c.id === channel.id)) {
          existing.push({
            id: channel.id,
            name: channel.channelName || '未命名',
            type: channel.channelType,
          })
        }
        userChannelsMap.set(msg.lineUserId, existing)
      }
    }

    // 統計資訊
    const stats = {
      total: users.length,
      byType: {
        STAFF: users.filter(u => u.identityType === 'STAFF').length,
        PARTNER: users.filter(u => u.identityType === 'PARTNER').length,
        CUSTOMER: users.filter(u => u.identityType === 'CUSTOMER').length,
        UNKNOWN: users.filter(u => u.identityType === 'UNKNOWN').length,
      },
    }

    return NextResponse.json({
      users: users.map(u => ({
        id: u.id,
        lineUserId: u.lineUserId,
        displayName: u.displayName,
        pictureUrl: u.pictureUrl,
        identityType: u.identityType,
        staffEmail: u.staffEmail,
        partnerId: u.partnerId,
        partnerName: u.partner?.name || null,
        contactName: u.contactName,
        contactPhone: u.contactPhone,
        note: u.note,
        channels: userChannelsMap.get(u.lineUserId) || [],
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
      stats,
    })
  } catch (error) {
    console.error('Error fetching LINE users:', error)
    return NextResponse.json({ error: '取得用戶列表失敗' }, { status: 500 })
  }
}
