import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import {
  LineLabelConfig,
  DEFAULT_LINE_LABEL_CONFIG,
  LINE_LABEL_CONFIG_KEY,
} from '@/types/line-label'

/**
 * GET /api/settings/line-labels
 * 取得 LINE 標籤設定
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const config = await prisma.systemConfig.findUnique({
      where: { key: LINE_LABEL_CONFIG_KEY },
    })

    if (config) {
      try {
        const parsed = JSON.parse(config.value) as LineLabelConfig
        return NextResponse.json({ config: parsed })
      } catch {
        // JSON parse failed, return default
      }
    }

    return NextResponse.json({ config: DEFAULT_LINE_LABEL_CONFIG })
  } catch (error) {
    console.error('Get line label config error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '取得設定失敗' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/settings/line-labels
 * 更新 LINE 標籤設定
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const { config } = body as { config: LineLabelConfig }

    if (!config) {
      return NextResponse.json({ error: '缺少 config 參數' }, { status: 400 })
    }

    const updatedConfig: LineLabelConfig = {
      ...config,
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.email,
    }

    await prisma.systemConfig.upsert({
      where: { key: LINE_LABEL_CONFIG_KEY },
      update: {
        value: JSON.stringify(updatedConfig),
        updatedBy: session.user.email,
      },
      create: {
        key: LINE_LABEL_CONFIG_KEY,
        value: JSON.stringify(updatedConfig),
        updatedBy: session.user.email,
      },
    })

    return NextResponse.json({
      success: true,
      config: updatedConfig,
    })
  } catch (error) {
    console.error('Update line label config error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新設定失敗' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/settings/line-labels
 * 重置為預設設定
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const { action } = body

    if (action === 'reset') {
      const resetConfig: LineLabelConfig = {
        ...DEFAULT_LINE_LABEL_CONFIG,
        updatedAt: new Date().toISOString(),
        updatedBy: session.user.email,
      }

      await prisma.systemConfig.upsert({
        where: { key: LINE_LABEL_CONFIG_KEY },
        update: {
          value: JSON.stringify(resetConfig),
          updatedBy: session.user.email,
        },
        create: {
          key: LINE_LABEL_CONFIG_KEY,
          value: JSON.stringify(resetConfig),
          updatedBy: session.user.email,
        },
      })

      return NextResponse.json({
        success: true,
        config: resetConfig,
      })
    }

    return NextResponse.json({ error: '未知的操作' }, { status: 400 })
  } catch (error) {
    console.error('Reset line label config error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '重置設定失敗' },
      { status: 500 }
    )
  }
}
