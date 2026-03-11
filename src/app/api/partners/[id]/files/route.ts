import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// 定義受限制的目錄及其允許的角色
const RESTRICTED_FOLDERS: Record<string, string[]> = {
  'finance': ['ADMIN', 'FINANCE'], // 財務目錄：僅管理員和財務可存取
}

// 檢查使用者是否有權限存取特定目錄
function canAccessFolder(folderPath: string, userRole: string): boolean {
  // 取得頂層目錄名稱
  const topFolder = folderPath.split('/')[0]
  const allowedRoles = RESTRICTED_FOLDERS[topFolder]

  // 如果不是受限目錄，所有人都可存取
  if (!allowedRoles) return true

  // 檢查使用者角色是否在允許清單中
  return allowedRoles.includes(userRole)
}

// GET: 取得 Partner 檔案列表
export async function GET(
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
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')
    const path = searchParams.get('path') // 子目錄，如 "jira" 或 "finance"

    // 確認 Partner 存在
    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true, name: true },
    })

    if (!partner) {
      return NextResponse.json({ error: 'Partner 不存在' }, { status: 404 })
    }

    // 檢查目錄存取權限
    if (path && !canAccessFolder(path, userRole)) {
      return NextResponse.json({ error: '您沒有權限存取此目錄' }, { status: 403 })
    }

    // 建立查詢條件
    const where: {
      partnerId: string
      deletedAt: null
      year?: number
      storedPath?: { startsWith: string }
    } = {
      partnerId,
      deletedAt: null,
    }

    if (year) {
      where.year = parseInt(year)
    }

    if (path) {
      where.storedPath = { startsWith: `${path}/` }
    }

    // 查詢檔案
    const files = await prisma.partnerFile.findMany({
      where,
      orderBy: [
        { year: 'desc' },
        { uploadedAt: 'desc' },
      ],
      select: {
        id: true,
        year: true,
        filename: true,
        storedPath: true,
        fileSize: true,
        mimeType: true,
        source: true,
        jiraIssueKey: true,
        uploadedBy: true,
        uploadedAt: true,
      },
    })

    // 取得該 Partner 有檔案的年份列表
    const yearsResult = await prisma.partnerFile.groupBy({
      by: ['year'],
      where: {
        partnerId,
        deletedAt: null,
      },
      orderBy: {
        year: 'desc',
      },
    })

    const years = yearsResult.map(r => r.year)

    // 取得子目錄列表（從 storedPath 解析），過濾掉無權存取的目錄
    const directories = new Set<string>()
    files.forEach(file => {
      const parts = file.storedPath.split('/')
      if (parts.length > 1) {
        const dir = parts[0]
        if (canAccessFolder(dir, userRole)) {
          directories.add(dir)
        }
      }
    })

    // 如果沒有指定特定目錄，過濾掉無權存取的檔案
    let filteredFiles = files
    if (!path) {
      filteredFiles = files.filter(file => {
        const parts = file.storedPath.split('/')
        if (parts.length > 1) {
          return canAccessFolder(parts[0], userRole)
        }
        return true // 根目錄檔案所有人都可存取
      })
    }

    // 回傳使用者可存取的目錄清單（包含 finance 等預設目錄）
    const allDirectories = Array.from(directories)

    // 加入使用者有權限存取的預設目錄（即使目錄是空的）
    Object.keys(RESTRICTED_FOLDERS).forEach(folder => {
      if (canAccessFolder(folder, userRole) && !allDirectories.includes(folder)) {
        allDirectories.push(folder)
      }
    })

    return NextResponse.json({
      files: filteredFiles,
      years,
      directories: allDirectories,
      currentYear: year ? parseInt(year) : new Date().getFullYear(),
      currentPath: path || '',
      userRole, // 回傳使用者角色供前端判斷
    })
  } catch (error) {
    console.error('Error getting partner files:', error)
    return NextResponse.json({ error: '取得檔案列表失敗' }, { status: 500 })
  }
}
