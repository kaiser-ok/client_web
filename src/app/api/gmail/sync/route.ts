import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  fetchSystemMailboxEmails,
  getSystemMailboxEmail,
  findCustomerByEmail,
} from '@/lib/gmail'
import { summarizeEmail, identifyCustomerFromEmail } from '@/lib/llm'
import { graphitiClient } from '@/lib/graphiti'
import {
  GmailConfig,
  GMAIL_CONFIG_KEY,
  GmailSyncResult,
  EmailAttachment,
} from '@/types/gmail'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

// 清理檔案名
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.{2,}/g, '.')
    .trim()
}

// 清理客戶名稱作為目錄名
function sanitizeCustomerName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 保存 Email 附件到客戶檔案夾
 */
async function saveEmailAttachments(
  customerId: string,
  customerName: string,
  attachments: EmailAttachment[],
  emailDate: Date,
  emailSubject: string,
  uploadedBy: string
): Promise<string[]> {
  if (attachments.length === 0) return []

  // 取得檔案存儲根路徑
  const config = await prisma.systemConfig.findUnique({
    where: { key: 'FILE_STORAGE_ROOT_PATH' },
  })

  if (!config?.value) {
    console.warn('FILE_STORAGE_ROOT_PATH not configured, skipping attachments')
    return []
  }

  const rootPath = config.value
  const currentYear = emailDate.getFullYear()
  const customerDir = sanitizeCustomerName(customerName)
  const targetDir = path.join(rootPath, customerDir, currentYear.toString(), 'email')

  // 建立目錄
  await mkdir(targetDir, { recursive: true })

  const savedPaths: string[] = []

  for (const attachment of attachments) {
    try {
      // 產生唯一檔名（加上時間戳避免衝突）
      const timestamp = emailDate.getTime()
      const ext = path.extname(attachment.filename)
      const nameWithoutExt = path.basename(attachment.filename, ext)
      const finalFilename = sanitizeFilename(`${nameWithoutExt}_${timestamp}${ext}`)
      const storedPath = `email/${finalFilename}`

      // 檢查是否已存在
      const existingFile = await prisma.partnerFile.findFirst({
        where: {
          partnerId: customerId,
          year: currentYear,
          storedPath,
          deletedAt: null,
        },
      })

      if (existingFile) {
        console.log(`Attachment already exists: ${storedPath}`)
        continue
      }

      // 寫入檔案
      const finalPath = path.join(targetDir, finalFilename)
      await writeFile(finalPath, attachment.content)

      // 建立資料庫記錄
      await prisma.partnerFile.create({
        data: {
          partnerId: customerId,
          year: currentYear,
          filename: attachment.filename,
          storedPath,
          fileSize: attachment.size,
          mimeType: attachment.contentType,
          source: 'EMAIL',
          uploadedBy,
        },
      })

      savedPaths.push(storedPath)
      console.log(`Saved attachment: ${storedPath}`)
    } catch (error) {
      console.error(`Failed to save attachment ${attachment.filename}:`, error)
    }
  }

  return savedPaths
}

/**
 * 保存原始郵件為 .eml 檔案
 */
async function saveRawEmail(
  customerId: string,
  customerName: string,
  rawSource: Buffer,
  emailDate: Date,
  emailSubject: string,
  messageId: string,
  uploadedBy: string
): Promise<string | null> {
  // 取得檔案存儲根路徑
  const config = await prisma.systemConfig.findUnique({
    where: { key: 'FILE_STORAGE_ROOT_PATH' },
  })

  if (!config?.value) {
    console.warn('FILE_STORAGE_ROOT_PATH not configured, skipping raw email save')
    return null
  }

  const rootPath = config.value
  const currentYear = emailDate.getFullYear()
  const customerDir = sanitizeCustomerName(customerName)
  const targetDir = path.join(rootPath, customerDir, currentYear.toString(), 'email')

  // 建立目錄
  await mkdir(targetDir, { recursive: true })

  try {
    // 產生檔名：使用日期和主旨
    const dateStr = emailDate.toISOString().slice(0, 10).replace(/-/g, '')
    const timeStr = emailDate.toISOString().slice(11, 16).replace(/:/g, '')
    const safeSubject = sanitizeFilename(emailSubject.slice(0, 50))
    const finalFilename = `${dateStr}_${timeStr}_${safeSubject}.eml`
    const storedPath = `email/${finalFilename}`

    // 檢查是否已存在（用 messageId 比對）
    const existingFile = await prisma.partnerFile.findFirst({
      where: {
        partnerId: customerId,
        source: 'EMAIL',
        filename: { endsWith: '.eml' },
        jiraId: messageId, // 用 jiraId 欄位存 messageId 去重
        deletedAt: null,
      },
    })

    if (existingFile) {
      console.log(`Raw email already saved: ${existingFile.storedPath}`)
      return existingFile.storedPath
    }

    // 寫入檔案
    const finalPath = path.join(targetDir, finalFilename)
    await writeFile(finalPath, rawSource)

    // 建立資料庫記錄
    await prisma.partnerFile.create({
      data: {
        partnerId: customerId,
        year: currentYear,
        filename: finalFilename,
        storedPath,
        fileSize: rawSource.length,
        mimeType: 'message/rfc822',
        source: 'EMAIL',
        jiraId: messageId, // 用於去重
        uploadedBy,
      },
    })

    console.log(`Saved raw email: ${storedPath}`)
    return storedPath
  } catch (error) {
    console.error(`Failed to save raw email:`, error)
    return null
  }
}

/**
 * POST /api/gmail/sync
 * 執行 Gmail 同步：掃描系統信箱 → 匹配客戶 → LLM 摘要 → 建立 Activity
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // 取得 Gmail 設定
    const configRecord = await prisma.systemConfig.findUnique({
      where: { key: GMAIL_CONFIG_KEY },
    })

    if (!configRecord) {
      return NextResponse.json(
        { error: '尚未設定 Gmail' },
        { status: 400 }
      )
    }

    const config = JSON.parse(configRecord.value) as GmailConfig

    if (!config.connected || !config.email || !config.appPassword) {
      return NextResponse.json(
        { error: 'Gmail 尚未連接' },
        { status: 400 }
      )
    }

    const systemEmail = await getSystemMailboxEmail()
    if (!systemEmail) {
      return NextResponse.json(
        { error: '無法取得系統信箱地址' },
        { status: 500 }
      )
    }

    // 使用 IMAP 取得信件
    let emails
    try {
      emails = await fetchSystemMailboxEmails()
    } catch (error) {
      return NextResponse.json(
        { error: `無法連接 Gmail: ${error instanceof Error ? error.message : '連線失敗'}` },
        { status: 500 }
      )
    }

    if (emails.length === 0) {
      return NextResponse.json({
        success: true,
        message: '沒有新信件需要處理',
        result: {
          success: true,
          processedCount: 0,
          successCount: 0,
          failedCount: 0,
          unmatchedCount: 0,
          errors: [],
          unmatchedEmails: [],
        } as GmailSyncResult,
      })
    }

    // 取得已處理的信件 ID（用 jiraKey 欄位儲存 email messageId）
    const existingActivities = await prisma.activity.findMany({
      where: {
        source: 'EMAIL',
        jiraKey: {
          in: emails.map(m => m.messageId),
        },
      },
      select: { jiraKey: true },
    })
    const processedIds = new Set(existingActivities.map(a => a.jiraKey))

    // 過濾出未處理的信件
    const newEmails = emails.filter(m => !processedIds.has(m.messageId))

    if (newEmails.length === 0) {
      return NextResponse.json({
        success: true,
        message: '所有信件已處理過',
        result: {
          success: true,
          processedCount: 0,
          successCount: 0,
          failedCount: 0,
          unmatchedCount: 0,
          errors: [],
          unmatchedEmails: [],
        } as GmailSyncResult,
      })
    }

    // 處理每封信件
    const result: GmailSyncResult = {
      success: true,
      processedCount: newEmails.length,
      successCount: 0,
      failedCount: 0,
      unmatchedCount: 0,
      errors: [],
      unmatchedEmails: [],
    }

    // 過濾掉 Google/Gmail 系統通知郵件
    const SKIP_SENDER_PATTERNS = [
      /no-?reply@.*google\.com$/i,
      /noreply@.*google\.com$/i,
      /.*@accounts\.google\.com$/i,
      /.*@notifications\.google\.com$/i,
      /googlecommunityteam-noreply@google\.com$/i,
      /calendar-notification@google\.com$/i,
      /drive-shares-noreply@google\.com$/i,
    ]

    const filteredEmails = newEmails.filter(email => {
      const fromEmail = email.fromEmail.toLowerCase()
      const isSystemEmail = SKIP_SENDER_PATTERNS.some(pattern => pattern.test(fromEmail))
      if (isSystemEmail) {
        console.log(`Skipping system email from: ${fromEmail}`)
      }
      return !isSystemEmail
    })

    // 更新處理數量
    result.processedCount = filteredEmails.length

    // 預先取得所有客戶名稱（用於 LLM 識別）
    const allCustomers = await prisma.partner.findMany({
      select: { id: true, name: true },
    })
    const customerNameMap = new Map(allCustomers.map(c => [c.name, c.id]))
    const customerNames = allCustomers.map(c => c.name)

    for (const email of filteredEmails) {
      try {
        // 收集所有相關 email 地址（排除系統信箱）
        const allEmails = [
          email.fromEmail,
          ...email.toEmails,
          ...email.ccEmails,
        ].filter(e => e.toLowerCase() !== systemEmail.toLowerCase())

        // 第一步：嘗試用 email 地址匹配客戶
        let customer = await findCustomerByEmail(allEmails, config.internalDomains)
        let matchMethod = 'email'

        // 第二步：如果 email 匹配失敗，使用 LLM 分析 subject 和 body 識別客戶
        if (!customer) {
          console.log(`Email match failed for ${email.messageId}, trying LLM identification...`)

          const llmResult = await identifyCustomerFromEmail(
            { subject: email.subject, body: email.body },
            customerNames
          )

          if (llmResult.customerName && llmResult.confidence !== 'low') {
            const customerId = customerNameMap.get(llmResult.customerName)
            if (customerId) {
              customer = {
                id: customerId,
                name: llmResult.customerName,
                email: null,
              }
              matchMethod = `llm-${llmResult.confidence}`
              console.log(`LLM identified customer: ${llmResult.customerName} (${llmResult.confidence}) - ${llmResult.reason}`)
            }
          }
        }

        if (!customer) {
          result.unmatchedCount++
          result.unmatchedEmails.push({
            messageId: email.messageId,
            subject: email.subject,
            from: email.from,
            recipients: [...email.toEmails, ...email.ccEmails],
            date: email.date.toISOString(),
          })
          continue
        }

        // LLM 摘要
        const summary = await summarizeEmail({
          from: email.from,
          to: email.to,
          cc: email.cc,
          subject: email.subject,
          body: email.body,
          date: email.date,
        })

        // 保存附件到客戶檔案夾
        let attachmentPaths: string[] = []
        if (email.attachments && email.attachments.length > 0) {
          attachmentPaths = await saveEmailAttachments(
            customer.id,
            customer.name,
            email.attachments,
            email.date,
            email.subject,
            session.user.email
          )
        }

        // 保存原始郵件為 .eml 檔案
        const emlPath = await saveRawEmail(
          customer.id,
          customer.name,
          email.rawSource,
          email.date,
          email.subject,
          email.messageId,
          session.user.email
        )

        // 建立 Activity
        const direction = email.isIncoming ? '收到' : '寄出'

        // 組合內容
        let content = summary.summary
        if (summary.keyPoints.length > 0) {
          content += '\n\n**重點：**\n' + summary.keyPoints.map(p => `• ${p}`).join('\n')
        }
        if (summary.actionItems.length > 0) {
          content += '\n\n**待辦：**\n' + summary.actionItems.map(a => `• ${a}`).join('\n')
        }
        if (attachmentPaths.length > 0) {
          content += `\n\n**附件（${attachmentPaths.length} 個）：**\n` + attachmentPaths.map(p => `• ${p.split('/').pop()}`).join('\n')
        }
        content += `\n\n---\n*原始主旨: ${email.subject}*`
        if (matchMethod !== 'email') {
          content += `\n*匹配方式: ${matchMethod}*`
        }

        // 建立 tags
        const tags = [direction, 'Email']
        if (matchMethod.startsWith('llm')) {
          tags.push('LLM匹配')
        }
        if (attachmentPaths.length > 0) {
          tags.push('有附件')
        }

        await prisma.activity.create({
          data: {
            partnerId: customer.id,
            source: 'EMAIL',
            title: `[${direction}] ${summary.title}`,
            content,
            jiraKey: email.messageId, // 用 jiraKey 存 email messageId 以便去重
            tags,
            attachments: attachmentPaths,
            createdBy: session.user.email,
            createdAt: email.date,
          },
        })

        // 送入 Graphiti 知識圖譜
        try {
          await graphitiClient.ingestMessage({
            platform: 'EMAIL',
            external_id: email.messageId,
            content: `主旨: ${email.subject}\n\n${email.body}`,
            timestamp: email.date,
            sender_email: email.fromEmail,
            sender_name: email.from,
            subject: email.subject,
            partner_id: customer.id,
            metadata: {
              to: email.to,
              cc: email.cc,
              direction,
              matchMethod,
            },
          })
        } catch (graphitiError) {
          console.error(`Failed to ingest email to Graphiti: ${email.messageId}`, graphitiError)
          // 不影響主流程，只記錄錯誤
        }

        result.successCount++
      } catch (error) {
        result.failedCount++
        result.errors.push(
          `處理信件 ${email.messageId} 失敗: ${error instanceof Error ? error.message : '未知錯誤'}`
        )
      }
    }

    // 更新最後同步時間和結果
    const updatedConfig: GmailConfig = {
      ...config,
      lastSyncAt: new Date().toISOString(),
      lastSyncResult: {
        success: result.successCount,
        failed: result.failedCount,
        unmatched: result.unmatchedCount,
      },
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.email,
    }

    await prisma.systemConfig.update({
      where: { key: GMAIL_CONFIG_KEY },
      data: {
        value: JSON.stringify(updatedConfig),
        updatedBy: session.user.email,
      },
    })

    return NextResponse.json({
      success: true,
      message: `同步完成：${result.successCount} 成功、${result.failedCount} 失敗、${result.unmatchedCount} 未匹配`,
      result,
    })
  } catch (error) {
    console.error('Gmail sync error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '同步失敗' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/gmail/sync
 * 取得同步狀態
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const configRecord = await prisma.systemConfig.findUnique({
      where: { key: GMAIL_CONFIG_KEY },
    })

    if (!configRecord) {
      return NextResponse.json({
        connected: false,
        lastSyncAt: null,
        lastSyncResult: null,
      })
    }

    const config = JSON.parse(configRecord.value) as GmailConfig

    return NextResponse.json({
      connected: config.connected,
      email: config.email,
      lastSyncAt: config.lastSyncAt || null,
      lastSyncResult: config.lastSyncResult || null,
      syncSettings: config.syncSettings,
    })
  } catch (error) {
    console.error('Get sync status error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '取得狀態失敗' },
      { status: 500 }
    )
  }
}
