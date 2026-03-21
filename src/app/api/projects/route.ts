import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * GET /api/projects
 * 查詢專案列表，支援 partnerId 篩選
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未授權' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const partnerId = searchParams.get('partnerId')
    const limit = parseInt(searchParams.get('limit') ?? '50')

    const where: Record<string, unknown> = { status: { not: 'CANCELLED' } }
    if (partnerId) where.partnerId = partnerId

    const projects = await prisma.project.findMany({
      where,
      select: { id: true, name: true, status: true, partnerId: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return NextResponse.json({ projects })
  } catch (e) {
    console.error('[projects GET]', e)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
