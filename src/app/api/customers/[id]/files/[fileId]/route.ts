import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// DELETE: 刪除檔案（軟刪除，僅管理員）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // 只有管理員可以刪除
    if (session.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: '權限不足，只有管理員可以刪除檔案' }, { status: 403 })
    }

    const { id: partnerId, fileId } = await params

    // 查詢檔案記錄
    const partnerFile = await prisma.partnerFile.findFirst({
      where: {
        id: fileId,
        partnerId,
        deletedAt: null,
      },
    })

    if (!partnerFile) {
      return NextResponse.json({ error: '檔案不存在' }, { status: 404 })
    }

    // 軟刪除：設定 deletedAt
    await prisma.partnerFile.update({
      where: { id: fileId },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({
      success: true,
      message: '檔案已刪除',
    })
  } catch (error) {
    console.error('Error deleting file:', error)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}

// GET: 取得單一檔案資訊
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

    const partnerFile = await prisma.partnerFile.findFirst({
      where: {
        id: fileId,
        partnerId,
        deletedAt: null,
      },
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

    if (!partnerFile) {
      return NextResponse.json({ error: '檔案不存在' }, { status: 404 })
    }

    return NextResponse.json({ file: partnerFile })
  } catch (error) {
    console.error('Error getting file:', error)
    return NextResponse.json({ error: '取得檔案資訊失敗' }, { status: 500 })
  }
}
