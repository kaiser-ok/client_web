import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { jiraClient } from '@/lib/jira'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { key } = await params
    const transitions = await jiraClient.getTransitions(key)

    return NextResponse.json({ transitions })
  } catch (error) {
    console.error('Error getting transitions:', error)
    return NextResponse.json({ error: '取得狀態失敗' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { key } = await params
    const { transitionId } = await request.json()

    if (!transitionId) {
      return NextResponse.json({ error: '缺少狀態 ID' }, { status: 400 })
    }

    await jiraClient.transitionIssue(key, transitionId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error transitioning issue:', error)
    const errorMessage = error instanceof Error ? error.message : '更新狀態失敗'
    // Check if it's a permission/workflow error from Jira
    if (errorMessage.includes('400') || errorMessage.includes('權限')) {
      return NextResponse.json({ error: '無法變更狀態，可能缺少權限或必要欄位' }, { status: 400 })
    }
    return NextResponse.json({ error: '更新狀態失敗' }, { status: 500 })
  }
}
