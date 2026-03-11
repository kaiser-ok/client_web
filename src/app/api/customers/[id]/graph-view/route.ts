import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { graphitiClient } from '@/lib/graphiti'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view') || '360'
    const depth = parseInt(searchParams.get('depth') || '2', 10)

    if (view === 'network') {
      const data = await graphitiClient.getOrganizationNetwork(id, depth)
      return NextResponse.json({ synced: true, ...data })
    }

    // Default: 360 view
    const data = await graphitiClient.getOrganization360(id)
    return NextResponse.json({ synced: true, ...data })
  } catch (error) {
    // Graceful 404: customer exists in PG but not yet synced to Neo4j
    if (error instanceof Error && error.message.toLowerCase().includes('not found')) {
      return NextResponse.json({
        synced: false,
        organization: null,
        deals: [],
        issues: [],
        projects: [],
        contacts: [],
        parent: null,
        subsidiaries: [],
      })
    }

    console.error('Error fetching graph view:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '取得圖譜資料失敗' },
      { status: 500 }
    )
  }
}
