import { NextRequest, NextResponse } from 'next/server'
import { readFile, stat } from 'fs/promises'
import path from 'path'

/**
 * GET: 提供 LINE 上傳檔案的存取
 * 這個 API 用於在 production 環境中提供動態上傳的檔案
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params

    // 驗證檔名格式，防止路徑遍歷攻擊
    if (!filename || filename.includes('..') || filename.includes('/')) {
      return NextResponse.json({ error: '無效的檔案名稱' }, { status: 400 })
    }

    const ext = path.extname(filename).toLowerCase()

    // 圖片直接顯示，其他檔案觸發下載
    const contentTypeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.zip': 'application/zip',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
    }
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)
    const contentType = contentTypeMap[ext] || 'application/octet-stream'

    const filePath = path.join(process.cwd(), 'public', 'uploads', 'line', filename)

    // 檢查檔案是否存在
    try {
      await stat(filePath)
    } catch {
      return NextResponse.json({ error: '檔案不存在' }, { status: 404 })
    }

    // 讀取檔案
    const fileBuffer = await readFile(filePath)

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': fileBuffer.length.toString(),
    }

    // 非圖片加上 Content-Disposition，讓瀏覽器觸發下載
    if (!isImage) {
      headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(filename)}"`
    }

    return new NextResponse(fileBuffer, { status: 200, headers })
  } catch (error) {
    console.error('Error serving LINE upload:', error)
    return NextResponse.json({ error: '讀取檔案失敗' }, { status: 500 })
  }
}
