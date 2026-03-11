import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { createLineClient } from '@/lib/line'

/**
 * GET: 取得所有 LINE 頻道
 * 支援透過 partnerId 查詢關聯頻道
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const includeInactive = searchParams.get('includeInactive') === 'true'
    // Support both partnerId and customerId for backward compatibility
    const partnerId = searchParams.get('partnerId') || searchParams.get('customerId')

    // 如果指定了 partnerId，透過 associations 查詢
    if (partnerId) {
      const associations = await prisma.lineChannelAssociation.findMany({
        where: { partnerId },
        include: {
          channel: {
            include: {
              partner: {
                select: { id: true, name: true },
              },
              project: {
                select: { id: true, name: true },
              },
              associations: {
                include: {
                  partner: {
                    select: {
                      id: true,
                      name: true,
                      roles: {
                        select: { role: true, isPrimary: true },
                      },
                    },
                  },
                },
              },
              _count: {
                select: { messages: true },
              },
            },
          },
        },
      })

      // 同時查詢舊的 partnerId 直接關聯（向後相容）
      const directChannels = await prisma.lineChannel.findMany({
        where: {
          partnerId,
          isActive: includeInactive ? undefined : true,
        },
        include: {
          partner: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
          associations: {
            include: {
              partner: {
                select: {
                  id: true,
                  name: true,
                  roles: {
                    select: { role: true, isPrimary: true },
                  },
                },
              },
            },
          },
          _count: { select: { messages: true } },
        },
      })

      // 合併結果並去重
      const channelMap = new Map<string, typeof directChannels[0]>()
      directChannels.forEach(c => channelMap.set(c.id, c))
      associations.forEach(a => {
        if (!channelMap.has(a.channel.id)) {
          channelMap.set(a.channel.id, a.channel)
        }
      })

      const channels = Array.from(channelMap.values())
        .filter(c => includeInactive || c.isActive)
        .sort((a, b) => {
          const aTime = a.lastMessageAt?.getTime() || 0
          const bTime = b.lastMessageAt?.getTime() || 0
          return bTime - aTime
        })

      return NextResponse.json({
        channels: channels.map(c => ({
          id: c.id,
          lineChannelId: c.lineChannelId,
          channelType: c.channelType,
          channelName: c.channelName,
          partnerId: c.partnerId,
          partnerName: c.partner?.name || null,
          projectId: c.projectId,
          projectName: c.project?.name || null,
          isActive: c.isActive,
          messageCount: c._count.messages,
          lastMessageAt: c.lastMessageAt,
          createdAt: c.createdAt,
          associations: c.associations.map(a => ({
            id: a.id,
            partnerId: a.partnerId,
            partnerName: a.partner?.name || null,
            partnerRoles: a.partner?.roles || [],
            role: a.role,
          })),
        })),
        stats: {
          total: channels.length,
        },
      })
    }

    // 沒有指定篩選條件時，回傳所有頻道
    const where: {
      isActive?: boolean
    } = {}

    if (!includeInactive) {
      where.isActive = true
    }

    const channels = await prisma.lineChannel.findMany({
      where,
      include: {
        partner: {
          select: {
            id: true,
            name: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        associations: {
          include: {
            partner: {
              select: {
                id: true,
                name: true,
                roles: {
                  select: { role: true, isPrimary: true },
                },
              },
            },
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: [
        { lastMessageAt: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    // 對 USER 類型頻道，查詢對應的 LineUser 以判斷是否為員工
    const userChannelLineIds = channels
      .filter(c => c.channelType === 'USER')
      .map(c => c.lineChannelId)

    const staffUsers = userChannelLineIds.length > 0
      ? await prisma.lineUser.findMany({
          where: {
            lineUserId: { in: userChannelLineIds },
            identityType: 'STAFF',
          },
          select: { lineUserId: true, staffEmail: true, displayName: true },
        })
      : []

    const staffUserMap = new Map(staffUsers.map(u => [u.lineUserId, u]))

    // 統計資訊（員工頻道不算入未對應）
    const channelsWithStaffInfo = channels.map(c => {
      const staffUser = c.channelType === 'USER' ? staffUserMap.get(c.lineChannelId) : null
      return { ...c, isStaff: !!staffUser, staffEmail: staffUser?.staffEmail || null }
    })

    const stats = {
      total: channels.length,
      mapped: channelsWithStaffInfo.filter(c => c.partnerId || c.isStaff).length,
      unmapped: channelsWithStaffInfo.filter(c => !c.partnerId && !c.isStaff && (!c.associations || c.associations.length === 0)).length,
      staff: channelsWithStaffInfo.filter(c => c.isStaff).length,
      byType: {
        GROUP: channels.filter(c => c.channelType === 'GROUP').length,
        ROOM: channels.filter(c => c.channelType === 'ROOM').length,
        USER: channels.filter(c => c.channelType === 'USER').length,
      },
    }

    return NextResponse.json({
      channels: channelsWithStaffInfo.map(c => ({
        id: c.id,
        lineChannelId: c.lineChannelId,
        channelType: c.channelType,
        channelName: c.channelName,
        partnerId: c.partnerId,
        partnerName: c.partner?.name || null,
        projectId: c.projectId,
        projectName: c.project?.name || null,
        isActive: c.isActive,
        isStaff: c.isStaff,
        staffEmail: c.staffEmail,
        messageCount: c._count.messages,
        lastMessageAt: c.lastMessageAt,
        createdAt: c.createdAt,
        associations: c.associations.map(a => ({
          id: a.id,
          partnerId: a.partnerId,
          partnerName: a.partner?.name || null,
          partnerRoles: a.partner?.roles || [],
          role: a.role,
        })),
      })),
      stats,
    })
  } catch (error) {
    console.error('Error fetching LINE channels:', error)
    return NextResponse.json({ error: '取得頻道列表失敗' }, { status: 500 })
  }
}

/**
 * POST: 手動新增 LINE 頻道
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const { groupId, channelType = 'GROUP' } = body

    if (!groupId) {
      return NextResponse.json({ error: '請提供 Group ID' }, { status: 400 })
    }

    // 檢查是否已存在
    const existing = await prisma.lineChannel.findUnique({
      where: { lineChannelId: groupId },
    })

    if (existing) {
      return NextResponse.json({ error: '此頻道已存在' }, { status: 400 })
    }

    // 嘗試從 LINE API 取得群組資訊
    let channelName: string | null = null
    try {
      const lineClient = createLineClient()
      if (channelType === 'GROUP') {
        const summary = await lineClient.getGroupSummary(groupId)
        channelName = summary.groupName
      }
    } catch (error) {
      console.log('無法從 LINE API 取得群組資訊，使用預設名稱:', error)
      // 無法取得資訊，繼續使用 null
    }

    // 建立頻道
    const channel = await prisma.lineChannel.create({
      data: {
        lineChannelId: groupId,
        channelType,
        channelName,
      },
    })

    return NextResponse.json({
      success: true,
      channel: {
        id: channel.id,
        lineChannelId: channel.lineChannelId,
        channelType: channel.channelType,
        channelName: channel.channelName,
      },
    })
  } catch (error) {
    console.error('Error creating LINE channel:', error)
    return NextResponse.json({ error: '新增頻道失敗' }, { status: 500 })
  }
}
