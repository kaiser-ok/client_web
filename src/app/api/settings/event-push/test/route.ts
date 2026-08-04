import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPushConfig } from '@/lib/event-push'

/**
 * POST /api/settings/event-push/test
 * 用目前設定的 url/apiKey 送一筆合成 ping payload，驗證與對方系統的連線。
 * 不受 enabled 開關影響、不寫入 outbox。僅 ADMIN。
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: '未授權' }, { status: 401 })
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }

  const cfg = await getPushConfig()
  if (!cfg.url) return NextResponse.json({ ok: false, error: '尚未設定目標網址' }, { status: 400 })

  const payload = {
    source: 'client-web',
    eventType: 'TEST',
    event: {
      id: 'test-' + session.user.email,
      title: '[連線測試] Event Push',
      status: 'NEW',
      priority: 'NORMAL',
      origin: 'manual',
    },
    deliveryId: 'test',
    note: '這是一筆由設定頁觸發的連線測試，對方可忽略',
  }

  const started = Date.now()
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': cfg.apiKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    })
    const elapsed = Date.now() - started
    const body = await res.text().catch(() => '')
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      elapsedMs: elapsed,
      responseBody: body.slice(0, 500),
    })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: String(err),
      elapsedMs: Date.now() - started,
    })
  }
}
