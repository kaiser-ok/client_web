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
    const { type, ...params } = body

    if (!type) {
      return NextResponse.json({ error: '請提供查詢類型 (type)' }, { status: 400 })
    }

    let data

    switch (type) {
      case 'person-connections': {
        if (!params.crmId) {
          return NextResponse.json({ error: '請提供 crmId' }, { status: 400 })
        }
        data = await graphitiClient.getPersonConnections(params.crmId)
        break
      }
      case 'product-impact': {
        if (!params.name) {
          return NextResponse.json({ error: '請提供 name' }, { status: 400 })
        }
        data = await graphitiClient.getProductImpact(params.name)
        break
      }
      case 'path-between': {
        if (!params.id1 || !params.id2) {
          return NextResponse.json({ error: '請提供 id1 和 id2' }, { status: 400 })
        }
        data = await graphitiClient.findPaths(params.id1, params.id2, params.maxDepth)
        break
      }
      default:
        return NextResponse.json(
          { error: `不支援的查詢類型: ${type}` },
          { status: 400 }
        )
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in graph search:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '圖譜查詢失敗' },
      { status: 500 }
    )
  }
}
