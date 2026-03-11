import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createSlackClient } from '@/lib/slack'

/**
 * GET /api/slack/mappings
 * 取得所有頻道對照表
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const mappings = await prisma.slackChannelMapping.findMany({
      orderBy: [
        { partnerName: 'asc' },
        { channelName: 'asc' },
      ],
    })

    return NextResponse.json({ mappings })
  } catch (error) {
    console.error('Get mappings error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '取得對照表失敗' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/slack/mappings
 * 自動比對頻道與客戶
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    if (!process.env.SLACK_BOT_TOKEN) {
      return NextResponse.json(
        { error: 'Slack 尚未設定' },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { refreshChannels = true } = body

    // 取得所有 Partners
    const partners = await prisma.partner.findMany({
      select: { id: true, name: true },
    })

    // 建立 Partner 名稱查詢表
    const partnerMap = new Map<string, { id: string; name: string }>()
    partners.forEach(p => {
      // 完整名稱
      partnerMap.set(p.name.toLowerCase(), p)
      // 移除常見後綴
      const simpleName = p.name
        .replace(/股份有限公司|有限公司|公司|學校|大學|中學|國小|國中/g, '')
        .trim()
        .toLowerCase()
      if (simpleName && simpleName !== p.name.toLowerCase()) {
        partnerMap.set(simpleName, p)
      }
    })

    // 取得 Slack 頻道
    let channels: Array<{ id: string; name: string }> = []
    if (refreshChannels) {
      const slack = createSlackClient()
      const slackChannels = await slack.listChannels()
      channels = slackChannels.map(ch => ({ id: ch.id, name: ch.name }))
    }

    // 定義比對規則
    const matchRules = [
      // snm_xxx_客戶名稱
      { pattern: /^snm_[a-z]*_(.+)$/, prefix: 'snm_' },
      // snm_客戶名稱
      { pattern: /^snm_(.+)$/, prefix: 'snm_' },
      // voip_客戶名稱
      { pattern: /^voip_(.+)$/, prefix: 'voip_' },
      // f_客戶名稱
      { pattern: /^f_(.+)$/, prefix: 'f_' },
      // 專案_客戶名稱
      { pattern: /^專案_(.+)$/, prefix: '專案_' },
    ]

    const results = {
      total: channels.length,
      matched: 0,
      unmatched: 0,
      updated: 0,
    }

    for (const channel of channels) {
      let matchedPartner: { id: string; name: string } | null = null
      let matchPattern = ''

      // 嘗試各種比對規則
      for (const rule of matchRules) {
        const match = channel.name.match(rule.pattern)
        if (match) {
          const extractedName = match[1].toLowerCase()

          // 直接比對
          if (partnerMap.has(extractedName)) {
            matchedPartner = partnerMap.get(extractedName)!
            matchPattern = `${rule.prefix}*`
            break
          }

          // 模糊比對：頻道名稱包含 Partner 名稱
          for (const [partnerNameLower, partner] of partnerMap) {
            if (extractedName.includes(partnerNameLower) ||
                partnerNameLower.includes(extractedName)) {
              matchedPartner = partner
              matchPattern = `${rule.prefix}* (fuzzy)`
              break
            }
          }
          if (matchedPartner) break
        }
      }

      // 更新或建立對照記錄
      const existingMapping = await prisma.slackChannelMapping.findUnique({
        where: { channelId: channel.id },
      })

      if (existingMapping) {
        // 只更新頻道名稱，不覆蓋手動設定
        if (existingMapping.matchType === 'AUTO' || !existingMapping.partnerId) {
          await prisma.slackChannelMapping.update({
            where: { channelId: channel.id },
            data: {
              channelName: channel.name,
              partnerId: matchedPartner?.id || null,
              partnerName: matchedPartner?.name || null,
              matchType: matchedPartner ? 'AUTO' : 'MANUAL',
              matchPattern: matchPattern || null,
            },
          })
          if (matchedPartner) results.updated++
        }
      } else {
        // 建立新記錄
        await prisma.slackChannelMapping.create({
          data: {
            channelId: channel.id,
            channelName: channel.name,
            partnerId: matchedPartner?.id || null,
            partnerName: matchedPartner?.name || null,
            matchType: matchedPartner ? 'AUTO' : 'MANUAL',
            matchPattern: matchPattern || null,
          },
        })
        if (matchedPartner) results.matched++
        else results.unmatched++
      }
    }

    // 同步 slackChannelId 到 Partner
    const allMappings = await prisma.slackChannelMapping.findMany({
      where: { partnerId: { not: null } },
    })

    for (const mapping of allMappings) {
      if (mapping.partnerId) {
        await prisma.partner.update({
          where: { id: mapping.partnerId },
          data: { slackChannelId: mapping.channelId },
        })
      }
    }

    return NextResponse.json({
      success: true,
      results,
      message: `比對完成：${results.matched} 個新對應，${results.updated} 個更新，${results.unmatched} 個未對應`,
    })
  } catch (error) {
    console.error('Auto match error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '自動比對失敗' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/slack/mappings
 * 更新單一對照
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    // Support both partnerId and customerId for backward compatibility
    const { id, partnerId, customerId } = body
    const resolvedPartnerId = partnerId || customerId

    if (!id) {
      return NextResponse.json({ error: '請指定對照 ID' }, { status: 400 })
    }

    // 取得 Partner 名稱
    let partnerName: string | null = null
    if (resolvedPartnerId) {
      const partner = await prisma.partner.findUnique({
        where: { id: resolvedPartnerId },
        select: { name: true },
      })
      partnerName = partner?.name || null
    }

    // 更新對照
    const mapping = await prisma.slackChannelMapping.update({
      where: { id },
      data: {
        partnerId: resolvedPartnerId || null,
        partnerName,
        matchType: 'MANUAL',
      },
    })

    // 同步到 Partner
    if (resolvedPartnerId) {
      await prisma.partner.update({
        where: { id: resolvedPartnerId },
        data: { slackChannelId: mapping.channelId },
      })
    }

    // 如果原本有對應的 Partner，清除其 slackChannelId
    const oldMapping = await prisma.slackChannelMapping.findFirst({
      where: {
        channelId: mapping.channelId,
        partnerId: { not: resolvedPartnerId },
      },
    })
    if (oldMapping?.partnerId) {
      await prisma.partner.update({
        where: { id: oldMapping.partnerId },
        data: { slackChannelId: null },
      })
    }

    return NextResponse.json({ success: true, mapping })
  } catch (error) {
    console.error('Update mapping error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新失敗' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/slack/mappings
 * 刪除頻道對照
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: '請指定對照 ID' }, { status: 400 })
    }

    // 取得 mapping 以清除客戶的 slackChannelId
    const mapping = await prisma.slackChannelMapping.findUnique({
      where: { id },
    })

    if (!mapping) {
      return NextResponse.json({ error: '找不到該對照記錄' }, { status: 404 })
    }

    // 如果有對應 Partner，清除其 slackChannelId
    if (mapping.partnerId) {
      await prisma.partner.update({
        where: { id: mapping.partnerId },
        data: { slackChannelId: null },
      })
    }

    // 刪除對照記錄
    await prisma.slackChannelMapping.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete mapping error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '刪除失敗' },
      { status: 500 }
    )
  }
}
