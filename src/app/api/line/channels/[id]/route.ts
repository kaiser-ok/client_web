import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * GET: 取得單一 LINE 頻道詳情
 * 支援 ?after=timestamp 參數來取得增量更新
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
    const afterParam = request.nextUrl.searchParams.get('after')
    const afterTimestamp = afterParam ? new Date(afterParam) : null

    // 如果有 after 參數，只取得該時間之後的訊息（增量更新）
    if (afterTimestamp) {
      const newMessages = await prisma.lineMessage.findMany({
        where: {
          channelId: id,
          timestamp: { gt: afterTimestamp },
        },
        orderBy: { timestamp: 'asc' },
        select: {
          id: true,
          lineUserId: true,
          messageType: true,
          content: true,
          mediaUrl: true,
          timestamp: true,
          processed: true,
        },
      })

      // 取得相關使用者資訊
      const userIds = [...new Set(newMessages.map(m => m.lineUserId))]
      const users = await prisma.lineUser.findMany({
        where: { lineUserId: { in: userIds } },
        select: {
          lineUserId: true,
          displayName: true,
          pictureUrl: true,
          identityType: true,
        },
      })
      const userMap = new Map(users.map(u => [u.lineUserId, u]))

      return NextResponse.json({
        messages: newMessages.map(m => ({
          id: m.id,
          lineUserId: m.lineUserId,
          displayName: userMap.get(m.lineUserId)?.displayName || 'Unknown',
          pictureUrl: userMap.get(m.lineUserId)?.pictureUrl || null,
          identityType: userMap.get(m.lineUserId)?.identityType || 'UNKNOWN',
          messageType: m.messageType,
          content: m.content,
          mediaUrl: m.mediaUrl,
          timestamp: m.timestamp,
          processed: m.processed,
        })),
      })
    }

    // 分頁參數
    const limitParam = request.nextUrl.searchParams.get('limit')
    const beforeParam = request.nextUrl.searchParams.get('before') // 載入更早的訊息
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 200) : 50

    const channel = await prisma.lineChannel.findUnique({
      where: { id },
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
      },
    })

    if (!channel) {
      return NextResponse.json({ error: '頻道不存在' }, { status: 404 })
    }

    // 分開查詢訊息，支援分頁
    const messageWhere: { channelId: string; timestamp?: { lt: Date } } = { channelId: id }
    if (beforeParam) {
      messageWhere.timestamp = { lt: new Date(beforeParam) }
    }

    const messages = await prisma.lineMessage.findMany({
      where: messageWhere,
      orderBy: { timestamp: 'desc' },
      take: limit,
      select: {
        id: true,
        lineUserId: true,
        messageType: true,
        content: true,
        mediaUrl: true,
        timestamp: true,
        processed: true,
      },
    })

    // 計算總訊息數
    const totalMessages = await prisma.lineMessage.count({
      where: { channelId: id },
    })

    // 取得相關使用者資訊
    const userIds = [...new Set(messages.map(m => m.lineUserId))]
    const users = await prisma.lineUser.findMany({
      where: { lineUserId: { in: userIds } },
      select: {
        lineUserId: true,
        displayName: true,
        pictureUrl: true,
        identityType: true,
      },
    })
    const userMap = new Map(users.map(u => [u.lineUserId, u]))

    // 判斷是否還有更早的訊息
    const hasMore = messages.length === limit

    return NextResponse.json({
      channel: {
        id: channel.id,
        lineChannelId: channel.lineChannelId,
        channelType: channel.channelType,
        channelName: channel.channelName,
        partnerId: channel.partnerId,
        partnerName: channel.partner?.name || null,
        projectId: channel.projectId,
        projectName: channel.project?.name || null,
        isActive: channel.isActive,
        lastMessageAt: channel.lastMessageAt,
        createdAt: channel.createdAt,
      },
      messages: messages.map(m => ({
        id: m.id,
        lineUserId: m.lineUserId,
        displayName: userMap.get(m.lineUserId)?.displayName || 'Unknown',
        pictureUrl: userMap.get(m.lineUserId)?.pictureUrl || null,
        identityType: userMap.get(m.lineUserId)?.identityType || 'UNKNOWN',
        messageType: m.messageType,
        content: m.content,
        mediaUrl: m.mediaUrl,
        timestamp: m.timestamp,
        processed: m.processed,
      })),
      pagination: {
        total: totalMessages,
        hasMore,
        oldestTimestamp: messages.length > 0 ? messages[messages.length - 1].timestamp : null,
      },
    })
  } catch (error) {
    console.error('Error fetching LINE channel:', error)
    return NextResponse.json({ error: '取得頻道失敗' }, { status: 500 })
  }
}

/**
 * PUT: 更新 LINE 頻道（設定客戶關聯、專案名稱等）
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
    // Support both partnerId and customerId for backward compatibility
    const partnerId = body.partnerId || body.customerId
    const { projectId, channelName, isActive } = body

    // 確認頻道存在
    const existing = await prisma.lineChannel.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: '頻道不存在' }, { status: 404 })
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

    // 如果指定了專案 ID，確認專案存在
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      })
      if (!project) {
        return NextResponse.json({ error: '專案不存在' }, { status: 400 })
      }
    }

    // 更新頻道
    const updated = await prisma.lineChannel.update({
      where: { id },
      data: {
        partnerId: partnerId !== undefined ? (partnerId || null) : existing.partnerId,
        projectId: projectId !== undefined ? (projectId || null) : existing.projectId,
        channelName: channelName !== undefined ? channelName : existing.channelName,
        isActive: isActive !== undefined ? isActive : existing.isActive,
      },
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
      },
    })

    return NextResponse.json({
      success: true,
      channel: {
        id: updated.id,
        lineChannelId: updated.lineChannelId,
        channelType: updated.channelType,
        channelName: updated.channelName,
        partnerId: updated.partnerId,
        partnerName: updated.partner?.name || null,
        projectId: updated.projectId,
        projectName: updated.project?.name || null,
        isActive: updated.isActive,
      },
    })
  } catch (error) {
    console.error('Error updating LINE channel:', error)
    return NextResponse.json({ error: '更新頻道失敗' }, { status: 500 })
  }
}

/**
 * DELETE: 刪除 LINE 頻道（軟刪除 - 標記為不活躍）
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // 檢查權限
    const user = await prisma.user.findUnique({
      where: { email: session.user?.email || '' },
      select: { role: true },
    })

    if (user?.role !== 'ADMIN' && user?.role !== 'SUPPORT') {
      return NextResponse.json({ error: '只有管理員或服務支援可以刪除頻道' }, { status: 403 })
    }

    const { id } = await params

    await prisma.lineChannel.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting LINE channel:', error)
    return NextResponse.json({ error: '刪除頻道失敗' }, { status: 500 })
  }
}
