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
    const { question, partnerId, contextMessages = 10 } = body

    if (!question) {
      return NextResponse.json({ error: '請提供問題' }, { status: 400 })
    }

    const response = await graphitiClient.ask({
      question,
      partner_id: partnerId,
      context_messages: contextMessages,
    })

    return NextResponse.json({
      success: true,
      answer: response.answer,
      sources: response.sources,
    })
  } catch (error) {
    console.error('Error asking graphiti:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '查詢失敗' },
      { status: 500 }
    )
  }
}
