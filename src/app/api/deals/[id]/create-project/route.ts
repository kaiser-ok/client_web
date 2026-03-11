import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * POST: 從成交記錄建立專案
 * 自動帶入：專案名稱、類型、產品明細、維護期間
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

    const { id: dealId } = await params

    // 取得成交記錄
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        partner: {
          select: { id: true, name: true },
        },
      },
    })

    if (!deal) {
      return NextResponse.json({ error: '成交記錄不存在' }, { status: 404 })
    }

    // 檢查是否已有關聯的專案
    const existingProject = await prisma.project.findUnique({
      where: { dealId },
    })

    if (existingProject) {
      return NextResponse.json({
        error: '此成交記錄已有對應專案',
        projectId: existingProject.id,
      }, { status: 400 })
    }

    // 決定專案名稱（優先順序：projectName > clientOrderRef > 單號+客戶名）
    const projectName = deal.projectName
      || deal.clientOrderRef
      || `${deal.name} - ${deal.partner.name}`

    // 建立說明：只保留基本資訊
    const descriptionParts: string[] = []

    // 訂單編號
    if (deal.name) {
      descriptionParts.push(`訂單編號：${deal.name}`)
    }

    // 客戶參照（如果和專案名稱不同）
    if (deal.clientOrderRef && deal.clientOrderRef !== projectName) {
      descriptionParts.push(`客戶參照：${deal.clientOrderRef}`)
    }

    // 服務期間
    if (deal.startDate && deal.endDate) {
      const start = new Date(deal.startDate).toLocaleDateString('zh-TW')
      const end = new Date(deal.endDate).toLocaleDateString('zh-TW')
      descriptionParts.push(`服務期間：${start} ~ ${end}`)
    }

    // 清理 HTML 的備註（只取純文字，排除 HTML 標籤）
    if (deal.notes) {
      const cleanNotes = deal.notes
        .replace(/<[^>]*>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      // 只有有意義的備註才加入（排除只有 CRM 等短文字）
      if (cleanNotes.length > 5 && cleanNotes !== 'CRM') {
        descriptionParts.push(`備註：${cleanNotes}`)
      }
    }

    const description = descriptionParts.join('\n')

    // 建立專案
    const project = await prisma.project.create({
      data: {
        partnerId: deal.partnerId,
        dealId: deal.id,
        name: projectName,
        type: deal.projectType || deal.type, // 使用 Odoo 專案類型，若無則用成交類型
        description: description || null,
        products: deal.productsJson ? (deal.productsJson as object) : undefined,
        status: 'ACTIVE',
        startDate: deal.startDate,
        endDate: deal.endDate,
        createdBy: session.user?.email || 'unknown',
      },
    })

    return NextResponse.json({
      success: true,
      project: {
        id: project.id,
        name: project.name,
        type: project.type,
        status: project.status,
        startDate: project.startDate,
        endDate: project.endDate,
      },
    })
  } catch (error) {
    console.error('Error creating project from deal:', error)
    return NextResponse.json({ error: '建立專案失敗' }, { status: 500 })
  }
}
