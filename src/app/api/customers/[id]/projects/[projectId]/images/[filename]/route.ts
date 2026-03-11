import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { readFile, stat } from 'fs/promises'
import path from 'path'

const STORAGE_ROOT = '/opt/client-web/storage/projects'

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

/**
 * GET: 取得專案圖片
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string; filename: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id: partnerId, projectId, filename } = await params

    // 確認專案存在
    const project = await prisma.project.findFirst({
      where: { id: projectId, partnerId },
    })

    if (!project) {
      return NextResponse.json({ error: '專案不存在' }, { status: 404 })
    }

    // 安全檢查：防止目錄遍歷
    const sanitizedFilename = path.basename(filename)
    if (sanitizedFilename !== filename || filename.includes('..')) {
      return NextResponse.json({ error: '無效的檔案名稱' }, { status: 400 })
    }

    const filePath = path.join(STORAGE_ROOT, projectId, sanitizedFilename)

    // 檢查檔案是否存在
    try {
      await stat(filePath)
    } catch {
      return NextResponse.json({ error: '圖片不存在' }, { status: 404 })
    }

    // 讀取檔案
    const fileBuffer = await readFile(filePath)
    const ext = path.extname(filename).toLowerCase()
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream'

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('Error serving project image:', error)
    return NextResponse.json({ error: '取得圖片失敗' }, { status: 500 })
  }
}

/**
 * DELETE: 刪除專案圖片
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string; filename: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id: partnerId, projectId, filename } = await params

    // 確認專案存在
    const project = await prisma.project.findFirst({
      where: { id: projectId, partnerId },
    })

    if (!project) {
      return NextResponse.json({ error: '專案不存在' }, { status: 404 })
    }

    // 安全檢查
    const sanitizedFilename = path.basename(filename)
    if (sanitizedFilename !== filename || filename.includes('..')) {
      return NextResponse.json({ error: '無效的檔案名稱' }, { status: 400 })
    }

    const filePath = path.join(STORAGE_ROOT, projectId, sanitizedFilename)

    // 刪除檔案
    const { unlink } = await import('fs/promises')
    await unlink(filePath)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting project image:', error)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}
