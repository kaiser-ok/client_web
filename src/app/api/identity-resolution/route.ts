import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { resolveEntity } from '@/lib/entity-resolver'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const { channel, channelUserId, displayName, channelId, messageContent, messageSubject } = body

    if (!channel || !channelUserId) {
      return NextResponse.json(
        { error: 'channel and channelUserId are required' },
        { status: 400 }
      )
    }

    if (!['LINE', 'SLACK', 'EMAIL'].includes(channel)) {
      return NextResponse.json(
        { error: 'channel must be LINE, SLACK, or EMAIL' },
        { status: 400 }
      )
    }

    const result = await resolveEntity({
      channel,
      channelUserId,
      displayName,
      channelId,
      messageContent,
      messageSubject,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Identity resolution error:', error)
    return NextResponse.json(
      { error: '解析失敗' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const channel = searchParams.get('channel')
    const channelUserId = searchParams.get('channelUserId')

    if (!channel || !channelUserId) {
      return NextResponse.json(
        { error: 'channel and channelUserId are required' },
        { status: 400 }
      )
    }

    const mapping = await prisma.identityMapping.findUnique({
      where: {
        channel_channelUserId: { channel, channelUserId },
      },
      include: {
        partner: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(mapping)
  } catch (error) {
    console.error('Get mapping error:', error)
    return NextResponse.json(
      { error: '查詢失敗' },
      { status: 500 }
    )
  }
}
