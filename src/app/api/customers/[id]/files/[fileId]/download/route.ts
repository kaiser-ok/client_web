import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { readFile, stat } from 'fs/promises'
import path from 'path'

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

// 清理 Partner 名稱作為目錄名
function sanitizePartnerName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
}

// GET: 下載檔案
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id: partnerId, fileId } = await params

    // 查詢檔案記錄
    const partnerFile = await prisma.partnerFile.findFirst({
      where: {
        id: fileId,
        partnerId,
        deletedAt: null,
      },
      include: {
        partner: {
          select: { name: true },
        },
      },
    })

    if (!partnerFile) {
      return NextResponse.json({ error: '檔案不存在' }, { status: 404 })
    }

    // 取得使用者角色並檢查權限
    const user = await prisma.user.findUnique({
      where: { email: session.user?.email || '' },
      select: { role: true },
    })
    const userRole = user?.role || 'SUPPORT'

    // 檢查檔案所在目錄的存取權限
    if (!canAccessFolder(partnerFile.storedPath, userRole)) {
      return NextResponse.json({ error: '您沒有權限下載此檔案' }, { status: 403 })
    }

    // 取得檔案存儲根路徑
    const config = await prisma.systemConfig.findUnique({
      where: { key: 'FILE_STORAGE_ROOT_PATH' },
    })

    if (!config?.value) {
      return NextResponse.json({ error: '檔案存儲路徑未設定' }, { status: 500 })
    }

    // 組合檔案路徑
    const partnerDir = sanitizePartnerName(partnerFile.partner.name)
    const filePath = path.join(
      config.value,
      partnerDir,
      partnerFile.year.toString(),
      partnerFile.storedPath
    )

    // 檢查檔案是否存在
    try {
      await stat(filePath)
    } catch {
      return NextResponse.json({ error: '檔案不存在於磁碟' }, { status: 404 })
    }

    // 讀取檔案
    const fileBuffer = await readFile(filePath)

    // 設定 Content-Type
    const contentType = partnerFile.mimeType || 'application/octet-stream'

    // 設定檔案名（處理中文）
    const encodedFilename = encodeURIComponent(partnerFile.filename)

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedFilename}`,
        'Content-Length': fileBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Error downloading file:', error)
    return NextResponse.json({ error: '下載失敗' }, { status: 500 })
  }
}
