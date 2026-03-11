import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  SlackClassificationConfig,
  DEFAULT_CLASSIFICATION_CONFIG,
  SLACK_CLASSIFICATION_CONFIG_KEY,
} from '@/types/slack-classification'

/**
 * GET /api/settings/slack-classification
 * 取得 Slack 訊息分類設定
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // 從資料庫讀取設定
    const config = await prisma.systemConfig.findUnique({
      where: { key: SLACK_CLASSIFICATION_CONFIG_KEY },
    })

    if (config) {
      try {
        const parsed = JSON.parse(config.value) as SlackClassificationConfig
        return NextResponse.json({ config: parsed })
      } catch {
        // JSON 解析失敗，返回預設值
      }
    }

    // 沒有設定或解析失敗，返回預設值
    return NextResponse.json({ config: DEFAULT_CLASSIFICATION_CONFIG })
  } catch (error) {
    console.error('Get slack classification config error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '取得設定失敗' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/settings/slack-classification
 * 更新 Slack 訊息分類設定
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const { config } = body as { config: SlackClassificationConfig }

    if (!config) {
      return NextResponse.json({ error: '缺少 config 參數' }, { status: 400 })
    }

    // 更新版本資訊
    const updatedConfig: SlackClassificationConfig = {
      ...config,
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.email,
    }

    // 儲存到資料庫
    await prisma.systemConfig.upsert({
      where: { key: SLACK_CLASSIFICATION_CONFIG_KEY },
      update: {
        value: JSON.stringify(updatedConfig),
        updatedBy: session.user.email,
      },
      create: {
        key: SLACK_CLASSIFICATION_CONFIG_KEY,
        value: JSON.stringify(updatedConfig),
        updatedBy: session.user.email,
      },
    })

    return NextResponse.json({
      success: true,
      config: updatedConfig,
    })
  } catch (error) {
    console.error('Update slack classification config error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新設定失敗' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/settings/slack-classification
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
      const resetConfig: SlackClassificationConfig = {
        ...DEFAULT_CLASSIFICATION_CONFIG,
        updatedAt: new Date().toISOString(),
        updatedBy: session.user.email,
      }

      await prisma.systemConfig.upsert({
        where: { key: SLACK_CLASSIFICATION_CONFIG_KEY },
        update: {
          value: JSON.stringify(resetConfig),
          updatedBy: session.user.email,
        },
        create: {
          key: SLACK_CLASSIFICATION_CONFIG_KEY,
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
    console.error('Reset slack classification config error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '重置設定失敗' },
      { status: 500 }
    )
  }
}
