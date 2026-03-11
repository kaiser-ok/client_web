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
    const partnerId = searchParams.get('partnerId') || searchParams.get('customerId') // 向下相容
    const source = searchParams.get('source')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const where: Record<string, unknown> = {}

    if (partnerId) {
      where.partnerId = partnerId
    }

    if (source) {
      where.source = { in: source.split(',') }
    }

    const [allActivities, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        include: {
          partner: {
            select: {
              name: true,
            },
          },
        },
      }),
      prisma.activity.count({ where }),
    ])

    // 自訂排序：今天及未來的預計日期在前（按日期升序），其餘按建立時間降序
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const sortedActivities = allActivities.sort((a, b) => {
      const aHasFutureDate = a.eventDate && new Date(a.eventDate) >= today
      const bHasFutureDate = b.eventDate && new Date(b.eventDate) >= today

      // 兩者都有未來日期：按日期升序
      if (aHasFutureDate && bHasFutureDate) {
        return new Date(a.eventDate!).getTime() - new Date(b.eventDate!).getTime()
      }
      // 只有 a 有未來日期：a 在前
      if (aHasFutureDate && !bHasFutureDate) {
        return -1
      }
      // 只有 b 有未來日期：b 在前
      if (!aHasFutureDate && bHasFutureDate) {
        return 1
      }
      // 兩者都沒有未來日期：按建立時間降序
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    // 分頁
    const activities = sortedActivities.slice(offset, offset + limit)

    return NextResponse.json({
      activities,
      total,
      hasMore: offset + activities.length < total,
    })
  } catch (error) {
    console.error('Error fetching activities:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const userEmail = session.user?.email || ''

    // 檢查是否為管理員
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { role: true },
    })

    const isAdmin = user?.role === 'ADMIN'

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const source = searchParams.get('source')
    const partnerId = searchParams.get('partnerId') || searchParams.get('customerId') // 向下相容
    const reason = searchParams.get('reason') // 刪除原因（選填）

    // 批量刪除模式：按 source 和/或 partnerId（僅管理員）
    if (source) {
      if (!isAdmin) {
        return NextResponse.json({ error: '只有管理員可以批量刪除活動' }, { status: 403 })
      }

      const where: Record<string, unknown> = {
        source: { in: source.split(',') },
      }

      if (partnerId) {
        where.partnerId = partnerId
      }

      // 先計算要刪除的數量
      const count = await prisma.activity.count({ where })

      if (count === 0) {
        return NextResponse.json({
          success: true,
          deleted: 0,
          message: '沒有符合條件的活動記錄'
        })
      }

      // 執行刪除
      const result = await prisma.activity.deleteMany({ where })

      return NextResponse.json({
        success: true,
        deleted: result.count,
        message: `已刪除 ${result.count} 筆活動記錄`
      })
    }

    // 單筆刪除模式
    if (!id) {
      return NextResponse.json({ error: '請指定活動 ID 或 source' }, { status: 400 })
    }

    // 先取得活動詳情
    const activity = await prisma.activity.findUnique({
      where: { id },
      include: {
        partner: {
          select: { name: true, slackChannelId: true },
        },
      },
    })

    if (!activity) {
      return NextResponse.json({ error: '活動不存在' }, { status: 404 })
    }

    // SLACK 活動：所有人都可以刪除，但要記錄供 LLM 優化
    // 其他活動：僅管理員可刪除
    if (activity.source === 'SLACK') {
      // 記錄被刪除的 Slack 活動供 LLM 優化
      await prisma.deletedSlackActivity.create({
        data: {
          partnerId: activity.partnerId,
          partnerName: activity.partner.name,
          originalId: activity.id,
          title: activity.title,
          content: activity.content,
          tags: activity.tags,
          slackTimestamp: activity.slackTimestamp,
          slackChannel: activity.partner.slackChannelId,
          createdBy: activity.createdBy,
          originalCreatedAt: activity.createdAt,
          deletedBy: userEmail,
          reason: reason || null,
        },
      })
    } else if (!isAdmin) {
      return NextResponse.json({ error: '只有管理員可以刪除此類型活動' }, { status: 403 })
    }

    await prisma.activity.delete({
      where: { id },
    })

    return NextResponse.json({ success: true, deleted: 1 })
  } catch (error) {
    console.error('Error deleting activity:', error)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const { id, title, content, tags, eventDate } = body

    if (!id) {
      return NextResponse.json({ error: '請指定活動 ID' }, { status: 400 })
    }

    const activity = await prisma.activity.update({
      where: { id },
      data: {
        title,
        content,
        tags: tags || [],
        eventDate: eventDate ? new Date(eventDate) : null,
      },
    })

    return NextResponse.json(activity)
  } catch (error) {
    console.error('Error updating activity:', error)
    return NextResponse.json({ error: '更新失敗' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const { partnerId, customerId, source, title, content, tags, attachments, jiraKey, eventDate } = body

    // 向下相容：支援 customerId
    const actualPartnerId = partnerId || customerId

    if (!actualPartnerId || !source || !title) {
      return NextResponse.json(
        { error: '缺少必要欄位' },
        { status: 400 }
      )
    }

    const activity = await prisma.activity.create({
      data: {
        partnerId: actualPartnerId,
        source,
        title,
        content,
        tags: tags || [],
        attachments: attachments || [],
        jiraKey,
        eventDate: eventDate ? new Date(eventDate) : null,
        createdBy: session.user.email,
      },
    })

    return NextResponse.json(activity, { status: 201 })
  } catch (error) {
    console.error('Error creating activity:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
