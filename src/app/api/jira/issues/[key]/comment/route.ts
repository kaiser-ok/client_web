import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { jiraClient } from '@/lib/jira'

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
    const { body } = await request.json()

    if (!body || !body.trim()) {
      return NextResponse.json({ error: '回覆內容不能為空' }, { status: 400 })
    }

    const result = await jiraClient.addComment(key, body)

    return NextResponse.json({ success: true, comment: result })
  } catch (error) {
    console.error('Error adding comment:', error)
    return NextResponse.json({ error: '新增回覆失敗' }, { status: 500 })
  }
}
