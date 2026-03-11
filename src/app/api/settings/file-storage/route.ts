import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

const CONFIG_KEY = 'FILE_STORAGE_ROOT_PATH'

// GET: 獲取檔案存儲根路徑設定
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const config = await prisma.systemConfig.findUnique({
      where: { key: CONFIG_KEY },
    })

    return NextResponse.json({
      rootPath: config?.value || '',
      configured: !!config?.value,
    })
  } catch (error) {
    console.error('Error getting file storage config:', error)
    return NextResponse.json({ error: '取得設定失敗' }, { status: 500 })
  }
}

// PUT: 更新檔案存儲根路徑設定
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // 只有管理員可以修改設定
    if (session.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: '權限不足' }, { status: 403 })
    }

    const body = await request.json()
    const { rootPath } = body

    if (!rootPath || typeof rootPath !== 'string') {
      return NextResponse.json({ error: '請提供有效的根目錄路徑' }, { status: 400 })
    }

    // 清理路徑：移除結尾斜線
    const cleanPath = rootPath.replace(/\/+$/, '')

    // 儲存設定
    const config = await prisma.systemConfig.upsert({
      where: { key: CONFIG_KEY },
      update: {
        value: cleanPath,
        updatedBy: session.user?.email || 'unknown',
      },
      create: {
        key: CONFIG_KEY,
        value: cleanPath,
        updatedBy: session.user?.email || 'unknown',
      },
    })

    return NextResponse.json({
      success: true,
      rootPath: config.value,
    })
  } catch (error) {
    console.error('Error updating file storage config:', error)
    return NextResponse.json({ error: '更新設定失敗' }, { status: 500 })
  }
}
