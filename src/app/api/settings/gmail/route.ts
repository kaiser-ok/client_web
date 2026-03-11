import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { testImapConnection } from '@/lib/gmail'
import {
  GmailConfig,
  DEFAULT_GMAIL_CONFIG,
  GMAIL_CONFIG_KEY,
} from '@/types/gmail'

/**
 * GET /api/settings/gmail
 * 取得 Gmail 設定
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const config = await prisma.systemConfig.findUnique({
      where: { key: GMAIL_CONFIG_KEY },
    })

    if (config) {
      try {
        const parsed = JSON.parse(config.value) as GmailConfig
        // 隱藏敏感資訊
        const safeConfig: GmailConfig = {
          ...parsed,
          appPassword: parsed.appPassword ? '******' : '',
        }
        return NextResponse.json({ config: safeConfig })
      } catch {
        // JSON 解析失敗
      }
    }

    return NextResponse.json({ config: DEFAULT_GMAIL_CONFIG })
  } catch (error) {
    console.error('Get Gmail config error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '取得設定失敗' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/settings/gmail
 * 更新 Gmail 設定
 * - connect: true 時儲存 email + appPassword 並測試連線
 * - 否則更新 syncSettings 和 internalDomains
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const { email, appPassword, connect, syncSettings, internalDomains } = body

    // 取得現有設定
    const existingRecord = await prisma.systemConfig.findUnique({
      where: { key: GMAIL_CONFIG_KEY },
    })

    let existingConfig = DEFAULT_GMAIL_CONFIG
    if (existingRecord) {
      try {
        existingConfig = JSON.parse(existingRecord.value) as GmailConfig
      } catch {
        // 使用預設值
      }
    }

    let updatedConfig: GmailConfig

    if (connect && email && appPassword) {
      // 測試連線
      const testResult = await testImapConnection(email, appPassword)
      if (!testResult.success) {
        return NextResponse.json(
          { error: `連線失敗: ${testResult.message}` },
          { status: 400 }
        )
      }

      // 連線成功，儲存設定
      updatedConfig = {
        ...existingConfig,
        connected: true,
        email,
        appPassword,
        updatedAt: new Date().toISOString(),
        updatedBy: session.user.email,
      }
    } else {
      // 更新同步設定（保留連線資訊）
      updatedConfig = {
        ...existingConfig,
        syncSettings: syncSettings ?? existingConfig.syncSettings,
        internalDomains: internalDomains ?? existingConfig.internalDomains,
        updatedAt: new Date().toISOString(),
        updatedBy: session.user.email,
      }
    }

    await prisma.systemConfig.upsert({
      where: { key: GMAIL_CONFIG_KEY },
      update: {
        value: JSON.stringify(updatedConfig),
        updatedBy: session.user.email,
      },
      create: {
        key: GMAIL_CONFIG_KEY,
        value: JSON.stringify(updatedConfig),
        updatedBy: session.user.email,
      },
    })

    // 返回時隱藏敏感資訊
    const safeConfig: GmailConfig = {
      ...updatedConfig,
      appPassword: updatedConfig.appPassword ? '******' : '',
    }

    return NextResponse.json({
      success: true,
      config: safeConfig,
    })
  } catch (error) {
    console.error('Update Gmail config error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新設定失敗' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/settings/gmail
 * 執行操作（中斷連接、測試連線）
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const { action } = body

    if (action === 'disconnect') {
      // 中斷連接：清除連線資訊
      const existingRecord = await prisma.systemConfig.findUnique({
        where: { key: GMAIL_CONFIG_KEY },
      })

      let existingConfig = DEFAULT_GMAIL_CONFIG
      if (existingRecord) {
        try {
          existingConfig = JSON.parse(existingRecord.value) as GmailConfig
        } catch {
          // 使用預設值
        }
      }

      const updatedConfig: GmailConfig = {
        ...existingConfig,
        connected: false,
        email: '',
        appPassword: '',
        updatedAt: new Date().toISOString(),
        updatedBy: session.user.email,
      }

      await prisma.systemConfig.upsert({
        where: { key: GMAIL_CONFIG_KEY },
        update: {
          value: JSON.stringify(updatedConfig),
          updatedBy: session.user.email,
        },
        create: {
          key: GMAIL_CONFIG_KEY,
          value: JSON.stringify(updatedConfig),
          updatedBy: session.user.email,
        },
      })

      return NextResponse.json({
        success: true,
        message: '已中斷 Gmail 連接',
      })
    }

    if (action === 'test') {
      // 測試連線
      const configRecord = await prisma.systemConfig.findUnique({
        where: { key: GMAIL_CONFIG_KEY },
      })

      if (!configRecord) {
        return NextResponse.json({
          success: false,
          message: '尚未設定 Gmail',
        })
      }

      const config = JSON.parse(configRecord.value) as GmailConfig

      if (!config.connected || !config.email || !config.appPassword) {
        return NextResponse.json({
          success: false,
          message: '尚未連接 Gmail',
        })
      }

      // 測試 IMAP 連線
      const testResult = await testImapConnection(config.email, config.appPassword)

      return NextResponse.json({
        success: testResult.success,
        message: testResult.message,
        email: config.email,
        inboxCount: testResult.inboxCount,
      })
    }

    return NextResponse.json({ error: '未知的操作' }, { status: 400 })
  } catch (error) {
    console.error('Gmail action error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '操作失敗' },
      { status: 500 }
    )
  }
}
