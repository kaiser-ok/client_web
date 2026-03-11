/**
 * 報價單 Email 發送 API
 * POST - 發送報價單 Email（含 PDF 附件）
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { hasPermission } from '@/constants/roles'
import { generateQuotationPDF } from '@/lib/pdf-generator'
import { sendEmail, generateQuotationEmailHTML } from '@/lib/email-sender'
import {
  CompanyConfig,
  DEFAULT_COMPANY_CONFIG,
  COMPANY_CONFIG_KEY,
  QuotationPDFData,
} from '@/types/company'
import { GmailConfig, DEFAULT_GMAIL_CONFIG, GMAIL_CONFIG_KEY } from '@/types/gmail'

interface RouteParams {
  params: Promise<{ id: string }>
}

async function getUserRole(email: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { role: true },
  })
  return user?.role || 'SUPPORT'
}

async function canAccessQuotation(
  quotation: { createdBy: string },
  userEmail: string,
  role: string
): Promise<boolean> {
  if (hasPermission(role, 'VIEW_ALL_QUOTATIONS')) {
    return true
  }
  return quotation.createdBy === userEmail
}

async function getCompanyConfig(): Promise<CompanyConfig> {
  const config = await prisma.systemConfig.findUnique({
    where: { key: COMPANY_CONFIG_KEY },
  })

  if (config) {
    try {
      return JSON.parse(config.value) as CompanyConfig
    } catch {
      // 使用預設值
    }
  }

  return DEFAULT_COMPANY_CONFIG
}

async function getGmailConfig(): Promise<GmailConfig> {
  const config = await prisma.systemConfig.findUnique({
    where: { key: GMAIL_CONFIG_KEY },
  })

  if (config) {
    try {
      return JSON.parse(config.value) as GmailConfig
    } catch {
      // 使用預設值
    }
  }

  return DEFAULT_GMAIL_CONFIG
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { to, cc, subject, message } = body

    if (!to || !Array.isArray(to) || to.length === 0) {
      return NextResponse.json({ error: '請提供收件人 Email' }, { status: 400 })
    }

    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: {
        partner: {
          select: {
            id: true,
            name: true,
            contact: true,
            email: true,
            phone: true,
          },
        },
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    })

    if (!quotation) {
      return NextResponse.json({ error: '報價單不存在' }, { status: 404 })
    }

    const role = await getUserRole(session.user.email)
    if (!(await canAccessQuotation(quotation, session.user.email, role))) {
      return NextResponse.json({ error: '您沒有操作此報價單的權限' }, { status: 403 })
    }

    const [companyConfig, gmailConfig] = await Promise.all([
      getCompanyConfig(),
      getGmailConfig(),
    ])

    if (!gmailConfig.connected) {
      return NextResponse.json(
        { error: '請先完成 Gmail 設定才能發送 Email' },
        { status: 400 }
      )
    }

    const pdfData: QuotationPDFData = {
      quotation: {
        quotationNo: quotation.quotationNo,
        projectName: quotation.projectName || undefined,
        validUntil: quotation.validUntil || undefined,
        createdAt: quotation.createdAt,
        notes: quotation.notes || undefined,
        totalAmount: Number(quotation.totalAmount),
      },
      partner: {
        name: quotation.partner.name,
        contact: quotation.partner.contact || undefined,
        phone: quotation.partner.phone || undefined,
        email: quotation.partner.email || undefined,
      },
      items: quotation.items.map(item => ({
        productId: item.productId || undefined,
        productName: item.productName,
        category: item.category || undefined,
        description: item.description || undefined,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
      })),
      company: companyConfig,
    }

    const pdfBuffer = await generateQuotationPDF(pdfData)

    const emailSubject =
      subject ||
      `報價單 ${quotation.quotationNo}${quotation.projectName ? ` - ${quotation.projectName}` : ''}`

    const emailHtml = generateQuotationEmailHTML({
      quotationNo: quotation.quotationNo,
      projectName: quotation.projectName || undefined,
      partnerName: quotation.partner.name,
      senderName: companyConfig.contactPerson || session.user.name || undefined,
      customMessage: message,
    })

    const result = await sendEmail(
      {
        to,
        cc,
        subject: emailSubject,
        html: emailHtml,
        attachments: [
          {
            filename: `${quotation.quotationNo}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      },
      gmailConfig
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || '發送 Email 失敗' },
        { status: 500 }
      )
    }

    // 更新報價單狀態為已送出（如果目前是草稿）
    if (quotation.status === 'DRAFT') {
      await prisma.quotation.update({
        where: { id },
        data: { status: 'SENT' },
      })
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      sentTo: to,
    })
  } catch (error) {
    console.error('Send quotation email error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '發送 Email 失敗' },
      { status: 500 }
    )
  }
}
