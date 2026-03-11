import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { getUnresolvedSenders } from '@/lib/entity-resolver'

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const channel = searchParams.get('channel') || undefined

    const result = await getUnresolvedSenders({ page, pageSize, channel })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Unresolved senders error:', error)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}
