import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const groupBy = searchParams.get('groupBy') || 'customer' // customer | user | user-detail
    const limit = parseInt(searchParams.get('limit') || '50')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const userEmail = searchParams.get('userEmail') // For user-detail

    // Build date filter
    const dateFilter: { lastViewedAt?: { gte?: Date; lte?: Date } } = {}
    if (startDate || endDate) {
      dateFilter.lastViewedAt = {}
      if (startDate) {
        dateFilter.lastViewedAt.gte = new Date(startDate)
      }
      if (endDate) {
        // Set to end of day
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        dateFilter.lastViewedAt.lte = end
      }
    }

    if (groupBy === 'customer') {
      // Group by customer (partner) - show most viewed customers across all users
      const partnerStats = await prisma.partnerView.groupBy({
        by: ['partnerId'],
        where: dateFilter,
        _sum: { viewCount: true },
        _count: { userEmail: true },
        orderBy: { _sum: { viewCount: 'desc' } },
        take: limit,
      })

      // Get partner details
      const partnerIds = partnerStats.map(s => s.partnerId)
      const partners = await prisma.partner.findMany({
        where: { id: { in: partnerIds } },
        select: { id: true, name: true },
      })

      const result = partnerStats.map(stat => {
        const partner = partners.find(c => c.id === stat.partnerId)
        return {
          customerId: stat.partnerId,
          customerName: partner?.name || '未知',
          partner: null,
          totalViews: stat._sum.viewCount || 0,
          uniqueUsers: stat._count.userEmail,
        }
      })

      return NextResponse.json({ stats: result, groupBy: 'customer' })
    } else if (groupBy === 'user') {
      // Group by user - show which users are most active
      const userStats = await prisma.partnerView.groupBy({
        by: ['userEmail'],
        where: dateFilter,
        _sum: { viewCount: true },
        _count: { partnerId: true },
        orderBy: { _sum: { viewCount: 'desc' } },
        take: limit,
      })

      // Get user details
      const userEmails = userStats.map(s => s.userEmail)
      const users = await prisma.user.findMany({
        where: { email: { in: userEmails } },
        select: { email: true, name: true },
      })

      const result = userStats.map(stat => {
        const user = users.find(u => u.email === stat.userEmail)
        return {
          userEmail: stat.userEmail,
          userName: user?.name || stat.userEmail,
          totalViews: stat._sum.viewCount || 0,
          uniqueCustomers: stat._count.partnerId,
        }
      })

      return NextResponse.json({ stats: result, groupBy: 'user' })
    } else if (groupBy === 'user-detail' && userEmail) {
      // Get specific user's customer view details
      const views = await prisma.partnerView.findMany({
        where: {
          userEmail,
          ...dateFilter,
        },
        orderBy: { viewCount: 'desc' },
        include: {
          partner: {
            select: { id: true, name: true },
          },
        },
      })

      const result = views.map(view => ({
        customerId: view.partnerId,
        customerName: view.partner.name,
        partner: null,
        viewCount: view.viewCount,
        lastViewedAt: view.lastViewedAt,
      }))

      return NextResponse.json({ stats: result, groupBy: 'user-detail', userEmail })
    }

    return NextResponse.json({ error: '無效的 groupBy 參數' }, { status: 400 })
  } catch (error) {
    console.error('Error fetching customer view stats:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
