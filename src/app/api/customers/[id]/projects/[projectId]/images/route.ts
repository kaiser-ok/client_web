import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { writeFile, mkdir, readdir, unlink } from 'fs/promises'
import path from 'path'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB for images
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const STORAGE_ROOT = '/opt/client-web/storage/projects'

/**
 * GET: 列出專案的所有圖片
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id: partnerId, projectId } = await params

    // 確認專案存在
    const project = await prisma.project.findFirst({
      where: { id: projectId, partnerId },
    })

    if (!project) {
      return NextResponse.json({ error: '專案不存在' }, { status: 404 })
    }

    // 讀取目錄
    const imageDir = path.join(STORAGE_ROOT, projectId)
    let images: string[] = []

    try {
      const files = await readdir(imageDir)
      images = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
    } catch {
      // 目錄不存在
    }

    return NextResponse.json({
      images: images.map(filename => ({
        filename,
        url: `/api/partners/${partnerId}/projects/${projectId}/images/${filename}`,
      })),
    })
  } catch (error) {
    console.error('Error listing project images:', error)
    return NextResponse.json({ error: '取得圖片列表失敗' }, { status: 500 })
  }
}

/**
 * POST: 上傳專案圖片
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id: partnerId, projectId } = await params

    // 確認專案存在
    const project = await prisma.project.findFirst({
      where: { id: projectId, partnerId },
    })

    if (!project) {
      return NextResponse.json({ error: '專案不存在' }, { status: 404 })
    }

    // 解析 FormData
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: '請選擇圖片' }, { status: 400 })
    }

    // 檢查檔案類型
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: '僅支援 JPG、PNG、GIF、WebP 格式' }, { status: 400 })
    }

    // 檢查檔案大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: '圖片大小不可超過 10MB' }, { status: 400 })
    }

    // 建立目錄
    const imageDir = path.join(STORAGE_ROOT, projectId)
    await mkdir(imageDir, { recursive: true })

    // 產生唯一檔名
    const ext = path.extname(file.name) || '.png'
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    const filename = `${timestamp}-${random}${ext}`
    const filePath = path.join(imageDir, filename)

    // 寫入檔案
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filePath, buffer)

    // 回傳圖片 URL
    const imageUrl = `/api/partners/${partnerId}/projects/${projectId}/images/${filename}`

    return NextResponse.json({
      success: true,
      filename,
      url: imageUrl,
      markdown: `![${file.name}](${imageUrl})`,
    })
  } catch (error) {
    console.error('Error uploading project image:', error)
    return NextResponse.json({ error: '上傳失敗' }, { status: 500 })
  }
}
