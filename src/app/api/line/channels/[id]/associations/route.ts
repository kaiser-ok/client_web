import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * GET: 取得頻道的所有關聯
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

    const associations = await prisma.lineChannelAssociation.findMany({
      where: { channelId: id },
      include: {
        partner: {
          select: {
            id: true,
            name: true,
            roles: {
              select: {
                role: true,
                isPrimary: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      associations: associations.map(a => ({
        id: a.id,
        channelId: a.channelId,
        partnerId: a.partnerId,
        partnerName: a.partner?.name || null,
        partnerRoles: a.partner?.roles || [],
        role: a.role,
        createdAt: a.createdAt,
      })),
    })
  } catch (error) {
    console.error('Error fetching channel associations:', error)
    return NextResponse.json({ error: '取得關聯失敗' }, { status: 500 })
  }
}

/**
 * POST: 新增頻道關聯
 */
export async function POST(
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
    const { partnerId, role = 'DEALER' } = body

    // 驗證必須有關聯目標
    if (!partnerId) {
      return NextResponse.json({ error: '請指定夥伴' }, { status: 400 })
    }

    // 驗證頻道存在
    const channel = await prisma.lineChannel.findUnique({
      where: { id },
    })
    if (!channel) {
      return NextResponse.json({ error: '頻道不存在' }, { status: 404 })
    }

    // 驗證夥伴存在
    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
    })
    if (!partner) {
      return NextResponse.json({ error: '夥伴不存在' }, { status: 400 })
    }

    // 建立關聯
    const association = await prisma.lineChannelAssociation.create({
      data: {
        channelId: id,
        partnerId,
        role,
      },
      include: {
        partner: {
          select: { id: true, name: true },
        },
      },
    })

    return NextResponse.json({
      success: true,
      association: {
        id: association.id,
        channelId: association.channelId,
        partnerId: association.partnerId,
        partnerName: association.partner?.name || null,
        role: association.role,
      },
    })
  } catch (error) {
    console.error('Error creating channel association:', error)
    // 檢查是否為重複關聯
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: '此關聯已存在' }, { status: 400 })
    }
    return NextResponse.json({ error: '新增關聯失敗' }, { status: 500 })
  }
}

/**
 * DELETE: 刪除頻道關聯
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

    const { searchParams } = new URL(request.url)
    const associationId = searchParams.get('associationId')

    if (!associationId) {
      return NextResponse.json({ error: '請指定關聯 ID' }, { status: 400 })
    }

    await prisma.lineChannelAssociation.delete({
      where: { id: associationId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting channel association:', error)
    return NextResponse.json({ error: '刪除關聯失敗' }, { status: 500 })
  }
}
