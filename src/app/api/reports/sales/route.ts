import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { hasPermission } from '@/constants/roles'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // 檢查權限
    if (!hasPermission(session.user?.role, 'VIEW_DEAL_AMOUNT', (session.user as { isManager?: boolean })?.isManager)) {
      return NextResponse.json({ error: '權限不足' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const startDateStr = searchParams.get('startDate')
    const endDateStr = searchParams.get('endDate')
    const groupBy = searchParams.get('groupBy') || 'month' // month | quarter | year
    const includeYoY = searchParams.get('includeYoY') === 'true'
    const salesRepFilter = searchParams.get('salesRep')
    const projectTypeFilter = searchParams.get('projectType')

    // 預設日期範圍：今年
    const now = new Date()
    const defaultStartDate = new Date(now.getFullYear(), 0, 1)
    const defaultEndDate = now

    // Parse as local midnight (not UTC) to avoid 8-hour offset on UTC+8 server
    const parseDateLocal = (s: string) => {
      const [y, m, d] = s.split('-').map(Number)
      return new Date(y, m - 1, d)
    }
    const startDate = startDateStr ? parseDateLocal(startDateStr) : defaultStartDate
    const endDate = endDateStr ? parseDateLocal(endDateStr) : defaultEndDate
    endDate.setHours(23, 59, 59, 999)

    // 去年同期
    const prevYearStart = new Date(startDate)
    prevYearStart.setFullYear(prevYearStart.getFullYear() - 1)
    const prevYearEnd = new Date(endDate)
    prevYearEnd.setFullYear(prevYearEnd.getFullYear() - 1)

    // 基本篩選條件（排除草稿訂單）
    const baseWhere: Prisma.DealWhereInput = {
      closedAt: { gte: startDate, lte: endDate },
      amount: { not: null },
      status: 'ACTIVE',
      OR: [{ odooState: null }, { NOT: { odooState: 'draft' } }],
      ...(salesRepFilter && { salesRep: salesRepFilter }),
      ...(projectTypeFilter && { projectType: projectTypeFilter }),
    }

    const prevYearWhere: Prisma.DealWhereInput = {
      closedAt: { gte: prevYearStart, lte: prevYearEnd },
      amount: { not: null },
      status: 'ACTIVE',
      OR: [{ odooState: null }, { NOT: { odooState: 'draft' } }],
      ...(salesRepFilter && { salesRep: salesRepFilter }),
      ...(projectTypeFilter && { projectType: projectTypeFilter }),
    }

    // 1. 總計（含本地發票金額）
    const [currentTotal, prevYearTotal, invoicedData] = await Promise.all([
      prisma.deal.aggregate({
        where: baseWhere,
        _sum: { amount: true },
        _count: { id: true },
        _avg: { amount: true },
      }),
      includeYoY
        ? prisma.deal.aggregate({
            where: prevYearWhere,
            _sum: { amount: true },
            _count: { id: true },
          })
        : null,
      prisma.invoice.aggregate({
        where: {
          invoiceDate: { gte: startDate, lte: endDate },
          state: 'posted',
        },
        _sum: { amount: true, amountResidual: true },
        _count: { id: true },
      }),
    ])

    const totalRevenue = Number(currentTotal._sum.amount || 0)
    const dealCount = currentTotal._count.id
    const avgDealSize = Number(currentTotal._avg.amount || 0)
    const prevYearRevenue = prevYearTotal ? Number(prevYearTotal._sum.amount || 0) : 0
    const yoyGrowth = prevYearRevenue > 0 ? ((totalRevenue - prevYearRevenue) / prevYearRevenue) * 100 : null
    const invoicedRevenue = Number(invoicedData._sum.amount || 0)
    const invoiceCount = invoicedData._count.id
    const unpaidRevenue = Number(invoicedData._sum.amountResidual || 0)

    // 2. 時間序列 (使用 raw query 來做日期分組)
    let timeSeries: { period: string; revenue: number; dealCount: number; prevYearRevenue?: number }[] = []

    if (groupBy === 'month') {
      const monthlyData = await prisma.$queryRaw<{ period: string; revenue: Prisma.Decimal; deal_count: bigint }[]>`
        SELECT
          TO_CHAR("closedAt", 'YYYY-MM') as period,
          SUM(amount) as revenue,
          COUNT(*) as deal_count
        FROM deals
        WHERE "closedAt" >= ${startDate}
          AND "closedAt" <= ${endDate}
          AND amount IS NOT NULL
          AND status = 'ACTIVE'
          AND ("odooState" IS NULL OR "odooState" != 'draft')
          ${salesRepFilter ? Prisma.sql`AND "salesRep" = ${salesRepFilter}` : Prisma.empty}
          ${projectTypeFilter ? Prisma.sql`AND "projectType" = ${projectTypeFilter}` : Prisma.empty}
        GROUP BY TO_CHAR("closedAt", 'YYYY-MM')
        ORDER BY period
      `

      let prevYearMonthlyData: { period: string; revenue: Prisma.Decimal }[] = []
      if (includeYoY) {
        prevYearMonthlyData = await prisma.$queryRaw<{ period: string; revenue: Prisma.Decimal }[]>`
          SELECT
            TO_CHAR("closedAt", 'YYYY-MM') as period,
            SUM(amount) as revenue
          FROM deals
          WHERE "closedAt" >= ${prevYearStart}
            AND "closedAt" <= ${prevYearEnd}
            AND amount IS NOT NULL
            AND status = 'ACTIVE'
          AND ("odooState" IS NULL OR "odooState" != 'draft')
            ${salesRepFilter ? Prisma.sql`AND "salesRep" = ${salesRepFilter}` : Prisma.empty}
            ${projectTypeFilter ? Prisma.sql`AND "projectType" = ${projectTypeFilter}` : Prisma.empty}
          GROUP BY TO_CHAR("closedAt", 'YYYY-MM')
          ORDER BY period
        `
      }

      // 建立去年同期對照 map
      const prevYearMap = new Map<string, number>()
      prevYearMonthlyData.forEach(d => {
        // 將去年月份轉為今年月份比對 (2023-01 -> 01)
        const month = d.period.slice(5)
        prevYearMap.set(month, Number(d.revenue))
      })

      timeSeries = monthlyData.map(d => ({
        period: d.period,
        revenue: Number(d.revenue),
        dealCount: Number(d.deal_count),
        prevYearRevenue: prevYearMap.get(d.period.slice(5)),
      }))
    } else if (groupBy === 'quarter') {
      const quarterlyData = await prisma.$queryRaw<{ period: string; revenue: Prisma.Decimal; deal_count: bigint }[]>`
        SELECT
          TO_CHAR("closedAt", 'YYYY') || '-Q' || CEIL(EXTRACT(MONTH FROM "closedAt") / 3.0)::int as period,
          SUM(amount) as revenue,
          COUNT(*) as deal_count
        FROM deals
        WHERE "closedAt" >= ${startDate}
          AND "closedAt" <= ${endDate}
          AND amount IS NOT NULL
          AND status = 'ACTIVE'
          AND ("odooState" IS NULL OR "odooState" != 'draft')
          ${salesRepFilter ? Prisma.sql`AND "salesRep" = ${salesRepFilter}` : Prisma.empty}
          ${projectTypeFilter ? Prisma.sql`AND "projectType" = ${projectTypeFilter}` : Prisma.empty}
        GROUP BY TO_CHAR("closedAt", 'YYYY') || '-Q' || CEIL(EXTRACT(MONTH FROM "closedAt") / 3.0)::int
        ORDER BY period
      `

      let prevYearQuarterlyData: { period: string; revenue: Prisma.Decimal }[] = []
      if (includeYoY) {
        prevYearQuarterlyData = await prisma.$queryRaw<{ period: string; revenue: Prisma.Decimal }[]>`
          SELECT
            'Q' || CEIL(EXTRACT(MONTH FROM "closedAt") / 3.0)::int as period,
            SUM(amount) as revenue
          FROM deals
          WHERE "closedAt" >= ${prevYearStart}
            AND "closedAt" <= ${prevYearEnd}
            AND amount IS NOT NULL
            AND status = 'ACTIVE'
          AND ("odooState" IS NULL OR "odooState" != 'draft')
            ${salesRepFilter ? Prisma.sql`AND "salesRep" = ${salesRepFilter}` : Prisma.empty}
            ${projectTypeFilter ? Prisma.sql`AND "projectType" = ${projectTypeFilter}` : Prisma.empty}
          GROUP BY CEIL(EXTRACT(MONTH FROM "closedAt") / 3.0)::int
          ORDER BY period
        `
      }

      // 建立去年同期對照 map (Q1, Q2, Q3, Q4)
      const prevYearMap = new Map<string, number>()
      prevYearQuarterlyData.forEach(d => {
        prevYearMap.set(d.period, Number(d.revenue))
      })

      timeSeries = quarterlyData.map(d => ({
        period: d.period,
        revenue: Number(d.revenue),
        dealCount: Number(d.deal_count),
        // 從 2024-Q1 取出 Q1 來比對
        prevYearRevenue: prevYearMap.get(d.period.slice(-2)),
      }))
    } else if (groupBy === 'year') {
      const yearlyData = await prisma.$queryRaw<{ period: string; revenue: Prisma.Decimal; deal_count: bigint }[]>`
        SELECT
          TO_CHAR("closedAt", 'YYYY') as period,
          SUM(amount) as revenue,
          COUNT(*) as deal_count
        FROM deals
        WHERE "closedAt" >= ${startDate}
          AND "closedAt" <= ${endDate}
          AND amount IS NOT NULL
          AND status = 'ACTIVE'
          AND ("odooState" IS NULL OR "odooState" != 'draft')
          ${salesRepFilter ? Prisma.sql`AND "salesRep" = ${salesRepFilter}` : Prisma.empty}
          ${projectTypeFilter ? Prisma.sql`AND "projectType" = ${projectTypeFilter}` : Prisma.empty}
        GROUP BY TO_CHAR("closedAt", 'YYYY')
        ORDER BY period
      `

      timeSeries = yearlyData.map(d => ({
        period: d.period,
        revenue: Number(d.revenue),
        dealCount: Number(d.deal_count),
      }))
    }

    // 3. 按專案類型分組
    const byProjectTypeRaw = await prisma.deal.groupBy({
      by: ['projectType'],
      where: baseWhere,
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: 'desc' } },
    })

    const byProjectType = byProjectTypeRaw.map(d => ({
      projectType: d.projectType || '未分類',
      revenue: Number(d._sum.amount || 0),
      dealCount: d._count.id,
      percentage: totalRevenue > 0 ? (Number(d._sum.amount || 0) / totalRevenue) * 100 : 0,
    }))

    // 4. 按業務員分組
    const bySalesRepRaw = await prisma.deal.groupBy({
      by: ['salesRep'],
      where: baseWhere,
      _sum: { amount: true },
      _count: { id: true },
      _avg: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
    })

    const bySalesRep = bySalesRepRaw.map(d => ({
      salesRep: d.salesRep || '未指定',
      revenue: Number(d._sum.amount || 0),
      dealCount: d._count.id,
      avgDealSize: Number(d._avg.amount || 0),
    }))

    // 5. Top 客戶 (Partners)
    const topPartnersRaw = await prisma.deal.groupBy({
      by: ['partnerId'],
      where: baseWhere,
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 10,
    })

    const partnerIds = topPartnersRaw.map(d => d.partnerId)
    const partners = await prisma.partner.findMany({
      where: { id: { in: partnerIds } },
      select: { id: true, name: true },
    })
    const partnerMap = new Map(partners.map(c => [c.id, c.name]))

    const topCustomers = topPartnersRaw.map(d => ({
      customerId: d.partnerId,
      customerName: partnerMap.get(d.partnerId) || '未知',
      revenue: Number(d._sum.amount || 0),
      dealCount: d._count.id,
    }))

    // 6. 月度同期比較 — 固定用 endDate 所在年 vs 前一年，避免跨年區間造成月份錯亂
    let monthlyComparison: { month: string; currentYear: number; previousYear: number; growth: number }[] | undefined

    if (includeYoY) {
      const endYear = endDate.getFullYear()
      const endMonth = endDate.getMonth() + 1 // 今年截至幾月
      const thisYearStart = new Date(endYear, 0, 1)
      const thisYearEnd = new Date(endYear, endMonth - 1, 31, 23, 59, 59, 999)
      const lastYearStart = new Date(endYear - 1, 0, 1)
      const lastYearEnd = new Date(endYear - 1, 11, 31, 23, 59, 59, 999) // 去年全年

      const currentYearMonths = await prisma.$queryRaw<{ month: string; revenue: Prisma.Decimal }[]>`
        SELECT
          TO_CHAR("closedAt", 'MM') as month,
          SUM(amount) as revenue
        FROM deals
        WHERE "closedAt" >= ${thisYearStart}
          AND "closedAt" <= ${thisYearEnd}
          AND amount IS NOT NULL
          AND status = 'ACTIVE'
          AND ("odooState" IS NULL OR "odooState" != 'draft')
          ${salesRepFilter ? Prisma.sql`AND "salesRep" = ${salesRepFilter}` : Prisma.empty}
          ${projectTypeFilter ? Prisma.sql`AND "projectType" = ${projectTypeFilter}` : Prisma.empty}
        GROUP BY TO_CHAR("closedAt", 'MM')
        ORDER BY month
      `

      const prevYearMonths = await prisma.$queryRaw<{ month: string; revenue: Prisma.Decimal }[]>`
        SELECT
          TO_CHAR("closedAt", 'MM') as month,
          SUM(amount) as revenue
        FROM deals
        WHERE "closedAt" >= ${lastYearStart}
          AND "closedAt" <= ${lastYearEnd}
          AND amount IS NOT NULL
          AND status = 'ACTIVE'
          AND ("odooState" IS NULL OR "odooState" != 'draft')
          ${salesRepFilter ? Prisma.sql`AND "salesRep" = ${salesRepFilter}` : Prisma.empty}
          ${projectTypeFilter ? Prisma.sql`AND "projectType" = ${projectTypeFilter}` : Prisma.empty}
        GROUP BY TO_CHAR("closedAt", 'MM')
        ORDER BY month
      `

      const currentMap = new Map(currentYearMonths.map(d => [d.month, Number(d.revenue)]))
      const prevMap = new Map(prevYearMonths.map(d => [d.month, Number(d.revenue)]))

      // 顯示 1-12 月，今年未來月份值為 0（不顯示），去年顯示完整全年
      const currentMonthStr = String(endMonth).padStart(2, '0')
      const allMonths = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
      monthlyComparison = allMonths
        .filter(month => prevMap.has(month) || currentMap.has(month))
        .map(month => {
          // 今年未來月份不顯示（設為 0，前端可據此判斷）
          const current = month <= currentMonthStr ? (currentMap.get(month) || 0) : 0
          const prev = prevMap.get(month) || 0
          return {
            month,
            currentYear: current,
            previousYear: prev,
            growth: prev > 0 ? ((current - prev) / prev) * 100 : current > 0 ? 100 : 0,
          }
        })
    }

    // 7. 取得所有業務員列表 (用於篩選器)
    const allSalesReps = await prisma.deal.findMany({
      where: { salesRep: { not: null } },
      select: { salesRep: true },
      distinct: ['salesRep'],
    })

    // 8. 取得所有專案類型列表 (用於篩選器)
    const allProjectTypes = await prisma.deal.findMany({
      where: { projectType: { not: null } },
      select: { projectType: true },
      distinct: ['projectType'],
    })

    return NextResponse.json({
      summary: {
        totalRevenue,
        invoicedRevenue,
        invoiceCount,
        unpaidRevenue,
        dealCount,
        avgDealSize,
        period: `${startDate.toISOString().slice(0, 10)} ~ ${endDate.toISOString().slice(0, 10)}`,
        yoyGrowth,
        yoyRevenueChange: includeYoY ? totalRevenue - prevYearRevenue : undefined,
      },
      timeSeries,
      byProjectType,
      bySalesRep,
      topCustomers,
      monthlyComparison,
      filters: {
        salesReps: allSalesReps.map(d => d.salesRep).filter(Boolean),
        projectTypes: allProjectTypes.map(d => d.projectType).filter(Boolean),
      },
    })
  } catch (error) {
    console.error('Error fetching sales report:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
