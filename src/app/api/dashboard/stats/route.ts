import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // Get cached stats or return defaults
    let stats = await prisma.dashboardStats.findUnique({
      where: { id: 'singleton' },
    })

    if (!stats) {
      // Return default stats if not synced yet
      stats = {
        id: 'singleton',
        partnerCount: 0,
        pendingIssues: 0,
        waitingCustomer: 0,
        overdueIssues: 0,
        expiringContracts: 0,
        syncedAt: new Date(),
      }
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error('Error fetching dashboard stats:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
