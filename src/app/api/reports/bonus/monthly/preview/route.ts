/**
 * GET /api/reports/bonus/monthly/preview
 * Admin-only: returns the monthly report email HTML for preview.
 * Query params: ?userId=xxx&year=YYYY&month=M
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { buildUserReport, generateMonthlyReportHTML, generateReportPDF } from '@/lib/bonus-monthly-notifier'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return new NextResponse('未授權', { status: 401 })

  const userRole = (session.user as { role?: string })?.role
  if (userRole !== 'ADMIN') return new NextResponse('無權限', { status: 403 })

  const sp = request.nextUrl.searchParams
  const userId = sp.get('userId')
  const year = parseInt(sp.get('year') || String(new Date().getFullYear()))
  const month = parseInt(sp.get('month') || String(new Date().getMonth() + 1))

  if (!userId) return new NextResponse('缺少 userId', { status: 400 })

  const report = await buildUserReport(userId, year, month)
  if (!report) return new NextResponse('找不到使用者', { status: 404 })

  const baseUrl = process.env.NEXTAUTH_URL || `${request.nextUrl.protocol}//${request.nextUrl.host}`
  const html = generateMonthlyReportHTML(report, baseUrl)

  if (sp.get('pdf') === '1') {
    const pdfBuffer = await generateReportPDF(html)
    const asciiFilename = `bonus-report-${year}-${String(month).padStart(2, '0')}.pdf`
    const encodedFilename = encodeURIComponent(`點數報表_${year}年${month}月_${report.userName}.pdf`)
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`,
      },
    })
  }

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
