import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  LLMConfig,
  DEFAULT_LLM_CONFIG,
  LLM_CONFIG_KEY,
} from '@/types/llm'

/**
 * GET /api/settings/llm
 * 取得 LLM 設定
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // 從資料庫讀取設定
    const config = await prisma.systemConfig.findUnique({
      where: { key: LLM_CONFIG_KEY },
    })

    if (config) {
      try {
        const parsed = JSON.parse(config.value) as LLMConfig
        // 隱藏 API Key，只返回是否已設定
        const safeConfig = {
          ...parsed,
          primary: {
            ...parsed.primary,
            apiKey: parsed.primary.apiKey ? '******' : '',
          },
          secondary: parsed.secondary ? {
            ...parsed.secondary,
            apiKey: parsed.secondary.apiKey ? '******' : '',
          } : undefined,
        }
        return NextResponse.json({ config: safeConfig })
      } catch {
        // JSON 解析失敗，返回預設值
      }
    }

    // 沒有設定或解析失敗，返回預設值
    return NextResponse.json({ config: DEFAULT_LLM_CONFIG })
  } catch (error) {
    console.error('Get LLM config error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '取得設定失敗' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/settings/llm
 * 更新 LLM 設定
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const { config } = body as { config: LLMConfig }

    if (!config) {
      return NextResponse.json({ error: '缺少 config 參數' }, { status: 400 })
    }

    // 取得現有設定以保留未變更的 API Key
    const existingConfig = await prisma.systemConfig.findUnique({
      where: { key: LLM_CONFIG_KEY },
    })

    let finalConfig = { ...config }

    if (existingConfig) {
      try {
        const existing = JSON.parse(existingConfig.value) as LLMConfig
        // 如果 API Key 是 '******'，保留原有的 key
        if (config.primary.apiKey === '******') {
          finalConfig.primary.apiKey = existing.primary.apiKey
        }
        if (config.secondary?.apiKey === '******' && existing.secondary) {
          finalConfig.secondary = {
            ...config.secondary,
            apiKey: existing.secondary.apiKey,
          }
        }
      } catch {
        // 解析失敗，使用新值
      }
    }

    // 更新版本資訊
    const updatedConfig: LLMConfig = {
      ...finalConfig,
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.email,
    }

    // 儲存到資料庫
    await prisma.systemConfig.upsert({
      where: { key: LLM_CONFIG_KEY },
      update: {
        value: JSON.stringify(updatedConfig),
        updatedBy: session.user.email,
      },
      create: {
        key: LLM_CONFIG_KEY,
        value: JSON.stringify(updatedConfig),
        updatedBy: session.user.email,
      },
    })

    // 返回時隱藏 API Key
    const safeConfig = {
      ...updatedConfig,
      primary: {
        ...updatedConfig.primary,
        apiKey: updatedConfig.primary.apiKey ? '******' : '',
      },
      secondary: updatedConfig.secondary ? {
        ...updatedConfig.secondary,
        apiKey: updatedConfig.secondary.apiKey ? '******' : '',
      } : undefined,
    }

    return NextResponse.json({
      success: true,
      config: safeConfig,
    })
  } catch (error) {
    console.error('Update LLM config error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新設定失敗' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/settings/llm
 * 測試 LLM 連線
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const { action, provider } = body

    if (action === 'test') {
      // 從資料庫讀取完整設定（包含 API Key）
      const configRecord = await prisma.systemConfig.findUnique({
        where: { key: LLM_CONFIG_KEY },
      })

      let config = DEFAULT_LLM_CONFIG
      if (configRecord) {
        try {
          config = JSON.parse(configRecord.value) as LLMConfig
        } catch {
          // 使用預設值
        }
      }

      const providerConfig = provider === 'secondary' ? config.secondary : config.primary
      if (!providerConfig) {
        return NextResponse.json({ error: '找不到設定' }, { status: 400 })
      }

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }

        if (providerConfig.apiKey) {
          headers['Authorization'] = `Bearer ${providerConfig.apiKey}`
        }

        // OpenRouter 需要特殊 header
        if (providerConfig.type === 'openrouter') {
          headers['HTTP-Referer'] = 'https://client-web.local'
          headers['X-Title'] = 'Client Web'
        }

        const response = await fetch(`${providerConfig.baseUrl}/v1/models`, {
          method: 'GET',
          headers,
        })

        if (response.ok) {
          const data = await response.json()
          return NextResponse.json({
            success: true,
            message: '連線成功',
            models: data.data?.slice(0, 5) || [],
          })
        } else {
          const error = await response.text()
          return NextResponse.json({
            success: false,
            message: `連線失敗: ${response.status}`,
            error,
          })
        }
      } catch (error) {
        return NextResponse.json({
          success: false,
          message: '連線失敗',
          error: error instanceof Error ? error.message : '未知錯誤',
        })
      }
    }

    return NextResponse.json({ error: '未知的操作' }, { status: 400 })
  } catch (error) {
    console.error('LLM action error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '操作失敗' },
      { status: 500 }
    )
  }
}
