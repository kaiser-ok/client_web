import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import odooClient from '@/lib/odoo'

/**
 * POST: 同步單一夥伴的 Odoo 訂單標籤
 * Body: { partnerId: string } (支援 customerId 向後相容)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    // Support both partnerId and customerId for backward compatibility
    const partnerId = body.partnerId || body.customerId

    if (!partnerId) {
      return NextResponse.json(
        { error: '缺少 partnerId' },
        { status: 400 }
      )
    }

    // Get partner
    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
    })

    if (!partner) {
      return NextResponse.json(
        { error: '夥伴不存在' },
        { status: 404 }
      )
    }

    if (!partner.odooId) {
      return NextResponse.json(
        { error: '此夥伴沒有關聯 Odoo ID' },
        { status: 400 }
      )
    }

    // Get order tags from Odoo
    const tags = await odooClient.getPartnerOrderTags(partner.odooId)

    // Update partner with tags
    await prisma.partner.update({
      where: { id: partnerId },
      data: { odooTags: tags },
    })

    return NextResponse.json({
      success: true,
      partnerId,
      odooId: partner.odooId,
      tags,
      count: tags.length,
    })
  } catch (error) {
    console.error('Error syncing Odoo tags:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '同步失敗' },
      { status: 500 }
    )
  }
}

/**
 * PUT: 批次同步所有夥伴的 Odoo 訂單標籤
 */
export async function PUT() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // Get all partners with odooId
    const partners = await prisma.partner.findMany({
      where: {
        odooId: { not: null },
      },
      select: {
        id: true,
        name: true,
        odooId: true,
      },
    })

    if (partners.length === 0) {
      return NextResponse.json({
        success: true,
        message: '沒有需要同步的夥伴',
        updated: 0,
      })
    }

    // Get all partner order tags from Odoo in one query
    const allTags = await odooClient.getAllPartnerOrderTags()

    // Update each partner
    let updatedCount = 0
    const results: Array<{ partnerId: string; name: string; tags: string[] }> = []

    for (const partner of partners) {
      const tags = allTags.get(partner.odooId!) || []

      await prisma.partner.update({
        where: { id: partner.id },
        data: { odooTags: tags },
      })

      if (tags.length > 0) {
        updatedCount++
        results.push({
          partnerId: partner.id,
          name: partner.name,
          tags,
        })
      }
    }

    return NextResponse.json({
      success: true,
      total: partners.length,
      updated: updatedCount,
      results,
    })
  } catch (error) {
    console.error('Error batch syncing Odoo tags:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '批次同步失敗' },
      { status: 500 }
    )
  }
}
