import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { graphitiClient } from '@/lib/graphiti'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const { query, partnerId, platforms, limit = 20 } = body

    if (!query) {
      return NextResponse.json({ error: '請提供搜尋關鍵字' }, { status: 400 })
    }

    const results = await graphitiClient.search({
      query,
      partner_id: partnerId,
      platforms,
      limit,
    })

    return NextResponse.json({
      success: true,
      results,
    })
  } catch (error) {
    console.error('Error searching graphiti:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '搜尋失敗' },
      { status: 500 }
    )
  }
}
