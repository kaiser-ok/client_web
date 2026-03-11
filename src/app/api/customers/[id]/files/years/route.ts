import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// GET: 取得 Partner 有檔案的年份列表
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id: partnerId } = await params

    // 取得該 Partner 有檔案的年份列表
    const yearsResult = await prisma.partnerFile.groupBy({
      by: ['year'],
      where: {
        partnerId,
        deletedAt: null,
      },
      _count: {
        id: true,
      },
      orderBy: {
        year: 'desc',
      },
    })

    const years = yearsResult.map(r => ({
      year: r.year,
      count: r._count.id,
    }))

    // 確保當年年份在列表中
    const currentYear = new Date().getFullYear()
    if (!years.some(y => y.year === currentYear)) {
      years.unshift({ year: currentYear, count: 0 })
    }

    return NextResponse.json({ years })
  } catch (error) {
    console.error('Error getting file years:', error)
    return NextResponse.json({ error: '取得年份列表失敗' }, { status: 500 })
  }
}
