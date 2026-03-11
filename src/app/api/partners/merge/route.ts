import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // 僅 ADMIN 可執行合併
    if (session.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: '權限不足，僅管理員可合併客戶' }, { status: 403 })
    }

    const body = await request.json()
    let { sourceId, targetId, dryRun } = body as {
      sourceId: string
      targetId: string
      dryRun?: boolean
    }

    if (!sourceId || !targetId) {
      return NextResponse.json({ error: '請提供 sourceId 和 targetId' }, { status: 400 })
    }

    if (sourceId === targetId) {
      return NextResponse.json({ error: '不能將客戶合併到自己' }, { status: 400 })
    }

    // 取得雙方資料
    const [sourcePartner, targetPartner] = await Promise.all([
      prisma.partner.findUnique({
        where: { id: sourceId },
        include: {
          roles: true,
          _count: {
            select: {
              activities: true,
              openItems: true,
              deals: true,
              projects: true,
              endUserProjects: true,
              files: true,
              technicalNotes: true,
              contacts: true,
              lineChannels: true,
              lineUsers: true,
              lineChannelAssociations: true,
              identityMappings: true,
              subsidiaries: true,
              views: true,
              quotations: true,
            },
          },
        },
      }),
      prisma.partner.findUnique({
        where: { id: targetId },
        include: {
          roles: true,
          _count: {
            select: {
              activities: true,
              openItems: true,
              deals: true,
              projects: true,
              endUserProjects: true,
              files: true,
              technicalNotes: true,
              contacts: true,
              lineChannels: true,
              lineUsers: true,
              lineChannelAssociations: true,
              identityMappings: true,
              subsidiaries: true,
              views: true,
              quotations: true,
            },
          },
        },
      }),
    ])

    if (!sourcePartner || !targetPartner) {
      return NextResponse.json({ error: '找不到指定的客戶' }, { status: 404 })
    }

    if (!sourcePartner.isActive || !targetPartner.isActive) {
      return NextResponse.json({ error: '無法合併已停用的客戶' }, { status: 400 })
    }

    // 自動交換：若 source 有 odooId 而 target 沒有，交換讓 Odoo 記錄成為 target
    let swapped = false
    const bothHaveOdoo = !!(sourcePartner.odooId && targetPartner.odooId)
    // 使用者已在 UI 選好目標方，直接以目標方為準，來源方的 odooId 合併時會清除
    if (!bothHaveOdoo && sourcePartner.odooId && !targetPartner.odooId) {
      const tmp = sourceId
      sourceId = targetId
      targetId = tmp
      swapped = true
    }

    // 交換後重新指定
    const source = swapped ? targetPartner : sourcePartner
    const target = swapped ? sourcePartner : targetPartner

    // 計算 SlackChannelMapping 和 DocumentChunk 數量
    const [slackMappingCount, documentChunkCount] = await Promise.all([
      prisma.slackChannelMapping.count({ where: { partnerId: source.id } }),
      prisma.documentChunk.count({ where: { partnerId: source.id } }),
    ])

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        swapped,
        bothHaveOdoo,
        source: {
          id: source.id,
          name: source.name,
          odooId: source.odooId,
          aliases: source.aliases,
          contact: source.contact,
          phone: source.phone,
          email: source.email,
          website: source.website,
          notes: source.notes,
          odooTags: source.odooTags,
          jiraLabel: source.jiraLabel,
          slackChannelId: source.slackChannelId,
          roles: source.roles,
          _count: { ...source._count, slackChannelMappings: slackMappingCount, documentChunks: documentChunkCount },
        },
        target: {
          id: target.id,
          name: target.name,
          odooId: target.odooId,
          aliases: target.aliases,
          contact: target.contact,
          phone: target.phone,
          email: target.email,
          website: target.website,
          notes: target.notes,
          odooTags: target.odooTags,
          jiraLabel: target.jiraLabel,
          slackChannelId: target.slackChannelId,
          roles: target.roles,
          _count: { ...target._count, slackChannelMappings: 0, documentChunks: 0 },
        },
      })
    }

    // === 執行合併（在交易中） ===
    await prisma.$transaction(async (tx) => {
      // --- 簡單 FK 更新（無 unique constraint 衝突）---
      await tx.activity.updateMany({ where: { partnerId: source.id }, data: { partnerId: target.id } })
      await tx.openItem.updateMany({ where: { partnerId: source.id }, data: { partnerId: target.id } })
      await tx.deal.updateMany({ where: { partnerId: source.id }, data: { partnerId: target.id } })
      await tx.project.updateMany({ where: { partnerId: source.id }, data: { partnerId: target.id } })
      await tx.project.updateMany({ where: { endUserId: source.id }, data: { endUserId: target.id } })
      await tx.quotation.updateMany({ where: { partnerId: source.id }, data: { partnerId: target.id } })
      await tx.documentChunk.updateMany({ where: { partnerId: source.id }, data: { partnerId: target.id } })
      await tx.slackChannelMapping.updateMany({ where: { partnerId: source.id }, data: { partnerId: target.id } })
      await tx.contact.updateMany({ where: { partnerId: source.id }, data: { partnerId: target.id } })
      await tx.lineUser.updateMany({ where: { partnerId: source.id }, data: { partnerId: target.id } })
      await tx.lineChannel.updateMany({ where: { partnerId: source.id }, data: { partnerId: target.id } })
      await tx.identityMapping.updateMany({ where: { partnerId: source.id }, data: { partnerId: target.id } })
      // 子公司：改指向 target
      await tx.partner.updateMany({ where: { parentId: source.id }, data: { parentId: target.id } })

      // --- 處理 unique constraint 衝突 ---

      // PartnerRole: [partnerId, role]
      const targetRoles = target.roles.map((r) => r.role)
      // 刪除 target 已有的 role
      await tx.partnerRole.deleteMany({
        where: { partnerId: source.id, role: { in: targetRoles } },
      })
      // 搬移不衝突的
      await tx.partnerRole.updateMany({
        where: { partnerId: source.id },
        data: { partnerId: target.id },
      })

      // PartnerView: [partnerId, userEmail]
      const sourceViews = await tx.partnerView.findMany({ where: { partnerId: source.id } })
      for (const sv of sourceViews) {
        const existingView = await tx.partnerView.findUnique({
          where: { partnerId_userEmail: { partnerId: target.id, userEmail: sv.userEmail } },
        })
        if (existingView) {
          // 合併 viewCount，保留最新 lastViewedAt
          await tx.partnerView.update({
            where: { id: existingView.id },
            data: {
              viewCount: existingView.viewCount + sv.viewCount,
              lastViewedAt: sv.lastViewedAt > existingView.lastViewedAt ? sv.lastViewedAt : existingView.lastViewedAt,
            },
          })
          await tx.partnerView.delete({ where: { id: sv.id } })
        } else {
          await tx.partnerView.update({ where: { id: sv.id }, data: { partnerId: target.id } })
        }
      }

      // PartnerFile: [partnerId, year, storedPath]
      const sourceFiles = await tx.partnerFile.findMany({ where: { partnerId: source.id } })
      for (const sf of sourceFiles) {
        const existingFile = await tx.partnerFile.findUnique({
          where: { partnerId_year_storedPath: { partnerId: target.id, year: sf.year, storedPath: sf.storedPath } },
        })
        if (existingFile) {
          // 衝突 → 軟刪除 source 的
          await tx.partnerFile.update({ where: { id: sf.id }, data: { deletedAt: new Date() } })
        } else {
          await tx.partnerFile.update({ where: { id: sf.id }, data: { partnerId: target.id } })
        }
      }

      // TechnicalNote: [partnerId, slackTimestamp]
      const sourceNotes = await tx.technicalNote.findMany({
        where: { partnerId: source.id, slackTimestamp: { not: null } },
      })
      for (const sn of sourceNotes) {
        const existing = await tx.technicalNote.findUnique({
          where: { partnerId_slackTimestamp: { partnerId: target.id, slackTimestamp: sn.slackTimestamp! } },
        })
        if (existing) {
          await tx.technicalNote.delete({ where: { id: sn.id } })
        } else {
          await tx.technicalNote.update({ where: { id: sn.id }, data: { partnerId: target.id } })
        }
      }
      // 搬移沒有 slackTimestamp 的（不會衝突）
      await tx.technicalNote.updateMany({
        where: { partnerId: source.id },
        data: { partnerId: target.id },
      })

      // LineChannelAssociation: [channelId, partnerId]
      const sourceAssocs = await tx.lineChannelAssociation.findMany({ where: { partnerId: source.id } })
      for (const sa of sourceAssocs) {
        const existing = await tx.lineChannelAssociation.findUnique({
          where: { channelId_partnerId: { channelId: sa.channelId, partnerId: target.id } },
        })
        if (existing) {
          await tx.lineChannelAssociation.delete({ where: { id: sa.id } })
        } else {
          await tx.lineChannelAssociation.update({ where: { id: sa.id }, data: { partnerId: target.id } })
        }
      }

      // --- 合併 Partner 欄位 ---
      const mergedAliases = Array.from(new Set([
        ...target.aliases,
        ...source.aliases,
        source.name, // 將 source name 加入 aliases
      ]))

      const mergedOdooTags = Array.from(new Set([
        ...target.odooTags,
        ...source.odooTags,
      ]))

      await tx.partner.update({
        where: { id: target.id },
        data: {
          aliases: mergedAliases,
          odooTags: mergedOdooTags,
          contact: target.contact || source.contact,
          phone: target.phone || source.phone,
          email: target.email || source.email,
          website: target.website || source.website,
          jiraLabel: target.jiraLabel || source.jiraLabel,
          slackChannelId: target.slackChannelId || source.slackChannelId,
          notes: target.notes || source.notes,
        },
      })

      // --- 軟刪除 source ---
      const now = new Date().toISOString()
      const odooNote = source.odooId ? `（原 Odoo ID: ${source.odooId}）` : ''
      const mergeNote = `[合併記錄] 已合併至 ${target.name} (${target.id})${odooNote}，由 ${session.user?.email} 於 ${now} 執行`
      await tx.partner.update({
        where: { id: source.id },
        data: {
          isActive: false,
          odooId: null, // 清除 odooId 避免後續同步衝突
          name: `[已合併] ${source.name}`,
          notes: source.notes ? `${source.notes}\n\n${mergeNote}` : mergeNote,
        },
      })
    })

    return NextResponse.json({
      success: true,
      message: `已將「${source.name}」合併至「${target.name}」`,
      sourceId: source.id,
      targetId: target.id,
      swapped,
    })
  } catch (error) {
    console.error('[Partner Merge Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '合併失敗' },
      { status: 500 }
    )
  }
}
