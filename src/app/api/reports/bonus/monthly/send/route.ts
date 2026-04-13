/**
 * POST /api/reports/bonus/monthly/send
 * Admin-only: manually trigger monthly bonus report emails.
 * Body: { year: number, month: number, userId?: string }
 *   - If userId provided: sends only to that user (for testing / resend).
 *   - If omitted: sends to all active users with point activity.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import {
  sendMonthlyReports,
  buildUserReport,
  generateMonthlyReportHTML,
  generateReportPDF,
} from '@/lib/bonus-monthly-notifier'
import { sendEmail } from '@/lib/email-sender'
import type { GmailConfig } from '@/types/gmail'
import { GMAIL_CONFIG_KEY } from '@/types/gmail'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: '未授權' }, { status: 401 })

  const userRole = (session.user as { role?: string })?.role
  if (userRole !== 'ADMIN') {
    return NextResponse.json({ error: '僅管理員可操作' }, { status: 403 })
  }

  const body = await request.json()
  const { year, month, userId } = body as { year: number; month: number; userId?: string }

  if (!year || !month) {
    return NextResponse.json({ error: '請提供 year 及 month' }, { status: 400 })
  }

  const configRow = await prisma.systemConfig.findUnique({ where: { key: GMAIL_CONFIG_KEY } })
  if (!configRow) {
    return NextResponse.json({ error: 'Gmail 設定未完成' }, { status: 400 })
  }
  const gmailConfig: GmailConfig = JSON.parse(configRow.value as string)
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

  if (userId) {
    const report = await buildUserReport(userId, year, month)
    if (!report) return NextResponse.json({ error: '找不到使用者' }, { status: 404 })
    const html = generateMonthlyReportHTML(report, baseUrl)
    const pdfBuffer = await generateReportPDF(html)
    const result = await sendEmail({
      to: [report.userEmail],
      subject: `[點數報表] ${year}年${month}月 專案點數變動摘要`,
      html,
      attachments: [{
        filename: `點數報表_${year}年${month}月.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      }],
    }, gmailConfig)
    return NextResponse.json(result)
  }

  const stats = await sendMonthlyReports(year, month)
  return NextResponse.json({ success: true, ...stats })
}
