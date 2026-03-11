import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { jiraClient } from '@/lib/jira'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

// 清理 Partner 名稱作為目錄名
function sanitizePartnerName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
}

// 清理檔案名
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.{2,}/g, '.')
    .trim()
}

// POST: 同步 Jira 附件到客戶檔案目錄
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

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

    // 取得該 Partner 的所有 Open Items
    const openItems = await prisma.openItem.findMany({
      where: { partnerId },
      select: { jiraKey: true },
    })

    if (openItems.length === 0) {
      return NextResponse.json({
        success: true,
        stats: { synced: 0, skipped: 0 },
        message: '沒有待處理問題需要同步',
      })
    }

    let synced = 0
    let skipped = 0

    // 對每個 Open Item 同步附件
    for (const openItem of openItems) {
      try {
        // 從 Jira 取得 issue 詳情（包含附件）
        const issue = await jiraClient.getIssue(openItem.jiraKey)
        const attachments = issue.fields?.attachment || []

        if (attachments.length === 0) continue

        for (const attachment of attachments) {
          // 檢查是否已存在
          const existing = await prisma.partnerFile.findFirst({
            where: {
              partnerId,
              jiraId: attachment.id,
              deletedAt: null,
            },
          })

          if (existing) {
            skipped++
            continue
          }

          // 決定年份：使用 issue 建立時間的年份
          const issueCreatedYear = new Date(issue.fields?.created || Date.now()).getFullYear()

          // 建立目錄
          const partnerDir = sanitizePartnerName(partner.name)
          const targetDir = path.join(rootPath, partnerDir, issueCreatedYear.toString(), 'jira')
          await mkdir(targetDir, { recursive: true })

          // 檔案名：{issueKey}_{原始檔名}
          const safeFilename = sanitizeFilename(attachment.filename)
          const storedFilename = `${openItem.jiraKey}_${safeFilename}`
          const filePath = path.join(targetDir, storedFilename)
          const storedPath = `jira/${storedFilename}`

          // 下載附件
          try {
            const response = await fetch(attachment.content, {
              headers: {
                'Authorization': `Basic ${Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64')}`,
              },
            })

            if (!response.ok) {
              console.error(`Failed to download attachment ${attachment.id}: ${response.status}`)
              continue
            }

            const buffer = Buffer.from(await response.arrayBuffer())
            await writeFile(filePath, buffer)

            // 建立資料庫記錄
            await prisma.partnerFile.create({
              data: {
                partnerId,
                year: issueCreatedYear,
                filename: attachment.filename,
                storedPath,
                fileSize: attachment.size,
                mimeType: attachment.mimeType || null,
                source: 'JIRA',
                jiraId: attachment.id,
                jiraIssueKey: openItem.jiraKey,
                uploadedBy: attachment.author?.emailAddress || 'jira',
              },
            })

            synced++
          } catch (downloadError) {
            console.error(`Error downloading attachment ${attachment.id}:`, downloadError)
          }
        }
      } catch (issueError) {
        console.error(`Error processing issue ${openItem.jiraKey}:`, issueError)
      }
    }

    return NextResponse.json({
      success: true,
      stats: { synced, skipped },
      message: `同步完成：新增 ${synced} 個檔案，略過 ${skipped} 個已存在`,
    })
  } catch (error) {
    console.error('Error syncing Jira attachments:', error)
    return NextResponse.json({ error: '同步 Jira 附件失敗' }, { status: 500 })
  }
}
