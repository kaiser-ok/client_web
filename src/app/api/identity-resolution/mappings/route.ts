import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { setManualMapping, invalidateMapping } from '@/lib/entity-resolver'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session) return { error: '未授權', status: 401 }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  })
  if (user?.role !== 'ADMIN') return { error: '需要管理員權限', status: 403 }

  return { session }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { searchParams } = new URL(request.url)
    const channel = searchParams.get('channel')
    const verified = searchParams.get('verified')
    const search = searchParams.get('search') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    const where: any = {}
    if (channel) where.channel = channel
    if (verified === 'true') where.isVerified = true
    if (verified === 'false') where.isVerified = false
    if (search) {
      where.OR = [
        { channelUserId: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
        { partner: { name: { contains: search, mode: 'insensitive' } } },
      ]
    }

    const [mappings, total] = await Promise.all([
      prisma.identityMapping.findMany({
        where,
        include: {
          partner: { select: { id: true, name: true } },
          contact: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.identityMapping.count({ where }),
    ])

    return NextResponse.json({ mappings, total })
  } catch (error) {
    console.error('List mappings error:', error)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const { channel, channelUserId, partnerId, contactId } = body

    if (!channel || !channelUserId) {
      return NextResponse.json(
        { error: 'channel and channelUserId are required' },
        { status: 400 }
      )
    }

    await setManualMapping(
      channel,
      channelUserId,
      partnerId || null,
      contactId || null,
      auth.session.user.email
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Set mapping error:', error)
    return NextResponse.json({ error: '設定失敗' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const channel = searchParams.get('channel')
    const channelUserId = searchParams.get('channelUserId')

    if (id) {
      // Delete by ID
      const mapping = await prisma.identityMapping.findUnique({ where: { id } })
      if (!mapping) {
        return NextResponse.json({ error: '找不到對應' }, { status: 404 })
      }
      await prisma.identityMapping.delete({ where: { id } })
    } else if (channel && channelUserId) {
      // Delete by channel + channelUserId
      await invalidateMapping(channel, channelUserId)
    } else {
      return NextResponse.json(
        { error: 'id or (channel + channelUserId) required' },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete mapping error:', error)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}
