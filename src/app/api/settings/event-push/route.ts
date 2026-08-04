import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import {
  EVENT_PUSH_CONFIG_KEY,
  DEFAULT_EVENT_PUSH_CONFIG,
  type EventPushConfig,
} from '@/lib/event-push'

// 回傳給前端時遮蔽金鑰（只顯示是否已設定）
function redact(cfg: EventPushConfig) {
  return { ...cfg, apiKey: cfg.apiKey ? '********' : '' }
}

/**
 * GET /api/settings/event-push — 讀取事件外送設定（金鑰遮蔽）
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: '未授權' }, { status: 401 })

  const row = await prisma.systemConfig.findUnique({ where: { key: EVENT_PUSH_CONFIG_KEY } })
  const cfg: EventPushConfig = row
    ? { ...DEFAULT_EVENT_PUSH_CONFIG, ...JSON.parse(row.value) }
    : DEFAULT_EVENT_PUSH_CONFIG
  return NextResponse.json(redact(cfg))
}

/**
 * PUT /api/settings/event-push — 更新設定（僅 ADMIN）
 * Body: { enabled, url, apiKey?, maxAttempts?, timeoutMs? }
 * apiKey 傳空字串或未變更的遮蔽值（********）時，保留原金鑰。
 */
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: '未授權' }, { status: 401 })
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }

  const body = await request.json()

  const existing = await prisma.systemConfig.findUnique({ where: { key: EVENT_PUSH_CONFIG_KEY } })
  const current: EventPushConfig = existing
    ? { ...DEFAULT_EVENT_PUSH_CONFIG, ...JSON.parse(existing.value) }
    : DEFAULT_EVENT_PUSH_CONFIG

  // 金鑰：空值或遮蔽值 → 保留原金鑰
  const nextApiKey =
    !body.apiKey || body.apiKey === '********' ? current.apiKey : String(body.apiKey)

  const next: EventPushConfig = {
    enabled: Boolean(body.enabled),
    url: typeof body.url === 'string' && body.url ? body.url : current.url,
    apiKey: nextApiKey,
    maxAttempts: Number.isFinite(body.maxAttempts) ? Number(body.maxAttempts) : current.maxAttempts,
    timeoutMs: Number.isFinite(body.timeoutMs) ? Number(body.timeoutMs) : current.timeoutMs,
  }

  const value = JSON.stringify({
    ...next,
    updatedAt: new Date().toISOString(),
    updatedBy: session.user.email,
  })

  await prisma.systemConfig.upsert({
    where: { key: EVENT_PUSH_CONFIG_KEY },
    update: { value, updatedBy: session.user.email },
    create: { key: EVENT_PUSH_CONFIG_KEY, value, updatedBy: session.user.email },
  })

  return NextResponse.json(redact(next))
}
