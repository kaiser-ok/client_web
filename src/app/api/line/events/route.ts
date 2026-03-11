import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * SSE 端點：LINE 訊息即時更新
 * 使用資料庫輪詢檢查新訊息
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }

  // 從 query 取得要監聽的頻道 ID
  const channelId = request.nextUrl.searchParams.get('channelId')
  if (!channelId) {
    return new Response('Missing channelId', { status: 400 })
  }

  const encoder = new TextEncoder()
  let lastMessageAt: Date | null = null
  let isAborted = false

  // 初始化：取得目前最後訊息時間
  const channel = await prisma.lineChannel.findUnique({
    where: { id: channelId },
    select: { lastMessageAt: true },
  })
  lastMessageAt = channel?.lastMessageAt || null

  const stream = new ReadableStream({
    async start(controller) {
      // 發送初始連接訊息
      controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'))

      // 當連接關閉時設定標記
      request.signal.addEventListener('abort', () => {
        isAborted = true
      })

      // 輪詢檢查新訊息（每 2 秒）
      const pollInterval = async () => {
        if (isAborted) return

        try {
          const updated = await prisma.lineChannel.findUnique({
            where: { id: channelId },
            select: { lastMessageAt: true },
          })

          // 檢查是否有新訊息
          if (updated?.lastMessageAt &&
              (!lastMessageAt || updated.lastMessageAt > lastMessageAt)) {
            lastMessageAt = updated.lastMessageAt
            const data = JSON.stringify({
              type: 'message',
              channelId,
              timestamp: updated.lastMessageAt.toISOString(),
            })
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
          }
        } catch {
          // 忽略錯誤，繼續輪詢
        }

        // 繼續輪詢
        if (!isAborted) {
          setTimeout(pollInterval, 2000)
        }
      }

      // 開始輪詢
      setTimeout(pollInterval, 2000)

      // 心跳保持連接（每 30 秒）
      const heartbeat = setInterval(() => {
        if (isAborted) {
          clearInterval(heartbeat)
          return
        }
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          clearInterval(heartbeat)
        }
      }, 30000)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
