import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

// 定義受限制的目錄及其允許的角色
const RESTRICTED_FOLDERS: Record<string, string[]> = {
  'finance': ['ADMIN', 'FINANCE'], // 財務目錄：僅管理員和財務可存取
}

// 檢查使用者是否有權限存取特定目錄
function canAccessFolder(folderPath: string, userRole: string): boolean {
  if (!folderPath) return true
  const topFolder = folderPath.split('/')[0]
  const allowedRoles = RESTRICTED_FOLDERS[topFolder]
  if (!allowedRoles) return true
  return allowedRoles.includes(userRole)
}

// 清理檔案名，移除不安全字元
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // 移除不安全字元
    .replace(/\.{2,}/g, '.') // 防止目錄遍歷
    .trim()
}

// 清理 Partner 名稱作為目錄名
function sanitizePartnerName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
}

// POST: 上傳檔案
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // 取得使用者角色
    const user = await prisma.user.findUnique({
      where: { email: session.user?.email || '' },
      select: { role: true },
    })
    const userRole = user?.role || 'SUPPORT'

    const { id: partnerId } = await params

    // 取得 Partner 資訊
    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true, name: true },
    })

    if (!partner) {
      return NextResponse.json({ error: 'Partner 不存在' }, { status: 404 })
    }

    // 取得檔案存儲根路徑設定
    const config = await prisma.systemConfig.findUnique({
      where: { key: 'FILE_STORAGE_ROOT_PATH' },
    })

    if (!config?.value) {
      return NextResponse.json({ error: '尚未設定檔案存儲路徑，請先到設定頁面設定' }, { status: 400 })
    }

    const rootPath = config.value

    // 解析 FormData
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const subPath = formData.get('path') as string | null // 子目錄，如 "jira" 或 "finance"

    if (!file) {
      return NextResponse.json({ error: '請選擇檔案' }, { status: 400 })
    }

    // 檢查目錄存取權限
    if (subPath && !canAccessFolder(subPath, userRole)) {
      return NextResponse.json({ error: '您沒有權限上傳至此目錄' }, { status: 403 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: '檔案大小超過限制（50MB）' }, { status: 400 })
    }

    // 建立目錄結構
    const currentYear = new Date().getFullYear()
    const partnerDir = sanitizePartnerName(partner.name)
    const yearDir = currentYear.toString()

    let targetDir = path.join(rootPath, partnerDir, yearDir)
    let storedPath = sanitizeFilename(file.name)

    if (subPath) {
      const cleanSubPath = subPath.replace(/\.\./g, '').replace(/^\/+/, '')
      targetDir = path.join(targetDir, cleanSubPath)
      storedPath = `${cleanSubPath}/${storedPath}`
    }

    // 建立目錄
    await mkdir(targetDir, { recursive: true })

    // 處理檔案名衝突
    let finalFilename = sanitizeFilename(file.name)

    // 檢查是否已存在同名檔案
    const existingFile = await prisma.partnerFile.findFirst({
      where: {
        partnerId,
        year: currentYear,
        storedPath: storedPath,
        deletedAt: null,
      },
    })

    if (existingFile) {
      // 加上時間戳避免衝突
      const ext = path.extname(file.name)
      const nameWithoutExt = path.basename(file.name, ext)
      const timestamp = Date.now()
      finalFilename = `${nameWithoutExt}_${timestamp}${ext}`
      storedPath = subPath
        ? `${subPath.replace(/\.\./g, '').replace(/^\/+/, '')}/${finalFilename}`
        : finalFilename
    }

    const finalPath = path.join(targetDir, finalFilename)

    // 寫入檔案
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(finalPath, buffer)

    // 建立資料庫記錄
    const partnerFile = await prisma.partnerFile.create({
      data: {
        partnerId,
        year: currentYear,
        filename: file.name,
        storedPath,
        fileSize: file.size,
        mimeType: file.type || null,
        source: 'MANUAL',
        uploadedBy: session.user?.email || 'unknown',
      },
    })

    return NextResponse.json({
      success: true,
      file: {
        id: partnerFile.id,
        filename: partnerFile.filename,
        storedPath: partnerFile.storedPath,
        fileSize: partnerFile.fileSize,
        year: partnerFile.year,
      },
    })
  } catch (error) {
    console.error('Error uploading file:', error)
    return NextResponse.json({ error: '上傳失敗' }, { status: 500 })
  }
}
