import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { getResolutionStats } from '@/lib/entity-resolver'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true },
    })
    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: '需要管理員權限' }, { status: 403 })
    }

    const stats = await getResolutionStats()
    return NextResponse.json(stats)
  } catch (error) {
    console.error('Resolution stats error:', error)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}
