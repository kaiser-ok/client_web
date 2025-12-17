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
    const source = searchParams.get('source')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const where: Record<string, unknown> = {}

    if (customerId) {
      where.customerId = customerId
    }

    if (source) {
      where.source = { in: source.split(',') }
    }

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          customer: {
            select: {
              name: true,
            },
          },
        },
      }),
      prisma.activity.count({ where }),
    ])

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

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const { customerId, source, title, content, tags, attachments, jiraKey } = body

    if (!customerId || !source || !title) {
      return NextResponse.json(
        { error: '缺少必要欄位' },
        { status: 400 }
      )
    }

    const activity = await prisma.activity.create({
      data: {
        customerId,
        source,
        title,
        content,
        tags: tags || [],
        attachments: attachments || [],
        jiraKey,
        createdBy: session.user.email,
      },
    })

    return NextResponse.json(activity, { status: 201 })
  } catch (error) {
    console.error('Error creating activity:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
