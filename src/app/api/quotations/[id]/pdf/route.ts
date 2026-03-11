/**
 * 報價單 PDF 生成 API
 * GET - 生成並下載/預覽 PDF
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { hasPermission } from '@/constants/roles'
import { generateQuotationPDF } from '@/lib/pdf-generator'
import {
  CompanyConfig,
  DEFAULT_COMPANY_CONFIG,
  COMPANY_CONFIG_KEY,
  QuotationPDFData,
} from '@/types/company'

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

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'download'

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
      return NextResponse.json({ error: '您沒有查看此報價單的權限' }, { status: 403 })
    }

    const companyConfig = await getCompanyConfig()

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
        sku: item.sku || undefined,
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

    if (action === 'preview') {
      const base64 = pdfBuffer.toString('base64')
      return NextResponse.json({
        success: true,
        pdf: base64,
        filename: `${quotation.quotationNo}.pdf`,
      })
    }

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${quotation.quotationNo}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Generate PDF error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生成 PDF 失敗' },
      { status: 500 }
    )
  }
}
