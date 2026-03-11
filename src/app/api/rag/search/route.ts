/**
 * RAG 搜尋 API
 * 純向量搜尋，不生成回答
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { searchSimilar, searchBasic } from '@/lib/embedding'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    const sourceType = searchParams.get('sourceType')
    const partnerId = searchParams.get('partnerId')
    const limit = parseInt(searchParams.get('limit') || '10', 10)

    if (!query) {
      return NextResponse.json({ error: '缺少搜尋關鍵字' }, { status: 400 })
    }

    let results

    try {
      // 嘗試使用 pgvector 搜尋
      results = await searchSimilar(query, {
        limit,
        sourceType: sourceType || undefined,
        partnerId: partnerId || undefined,
        minSimilarity: 0.5,
      })
    } catch {
      // 回退到基本搜尋
      results = await searchBasic(query, {
        limit,
        sourceType: sourceType || undefined,
        partnerId: partnerId || undefined,
      })
    }

    return NextResponse.json({
      results: results.map(r => ({
        id: r.id,
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        partnerId: r.partnerId,
        content: r.content,
        similarity: r.similarity,
        metadata: r.metadata,
      })),
      total: results.length,
    })
  } catch (error) {
    console.error('RAG search error:', error)
    return NextResponse.json(
      { error: '搜尋時發生錯誤' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const { query, sourceType, partnerId, limit = 10 } = body

    if (!query) {
      return NextResponse.json({ error: '缺少搜尋關鍵字' }, { status: 400 })
    }

    let results

    try {
      results = await searchSimilar(query, {
        limit,
        sourceType,
        partnerId,
        minSimilarity: 0.5,
      })
    } catch {
      results = await searchBasic(query, {
        limit,
        sourceType,
        partnerId,
      })
    }

    return NextResponse.json({
      results,
      total: results.length,
    })
  } catch (error) {
    console.error('RAG search error:', error)
    return NextResponse.json(
      { error: '搜尋時發生錯誤' },
      { status: 500 }
    )
  }
}
