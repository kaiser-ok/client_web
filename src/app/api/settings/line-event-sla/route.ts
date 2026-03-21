import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { DEFAULT_SLA_RULES } from '@/lib/line-event-sla'

const CONFIG_KEY = 'line_event_sla_config'

const DEFAULT_CONFIG = {
  version: '1.0.0',
  rules: DEFAULT_SLA_RULES,
}

/**
 * GET /api/settings/line-event-sla
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未授權' }, { status: 401 })

    const config = await prisma.systemConfig.findUnique({ where: { key: CONFIG_KEY } })
    const value = config ? JSON.parse(config.value) : DEFAULT_CONFIG
    return NextResponse.json(value)
  } catch (e) {
    console.error('[line-event-sla GET]', e)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}

/**
 * PUT /api/settings/line-event-sla
 * Body: { rules: [{ priority, responseMinutes, resolveMinutes }] }
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return NextResponse.json({ error: '未授權' }, { status: 401 })

    const body = await request.json()
    if (!Array.isArray(body.rules)) {
      return NextResponse.json({ error: '缺少 rules 陣列' }, { status: 400 })
    }

    const value = JSON.stringify({
      version: '1.0.0',
      rules: body.rules,
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.email,
    })

    await prisma.systemConfig.upsert({
      where:  { key: CONFIG_KEY },
      update: { value, updatedBy: session.user.email },
      create: { key: CONFIG_KEY, value, updatedBy: session.user.email },
    })

    return NextResponse.json(JSON.parse(value))
  } catch (e) {
    console.error('[line-event-sla PUT]', e)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
