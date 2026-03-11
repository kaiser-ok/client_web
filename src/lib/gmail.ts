/**
 * Gmail IMAP Client
 * 使用 App Password + IMAP 讀取 Gmail 信件
 */

import { ImapFlow } from 'imapflow'
import { simpleParser, ParsedMail } from 'mailparser'
import { prisma } from '@/lib/prisma'
import { GmailConfig, GMAIL_CONFIG_KEY, ImapEmail, EmailAttachment } from '@/types/gmail'

/**
 * Gmail IMAP 設定
 */
const GMAIL_IMAP_CONFIG = {
  host: 'imap.gmail.com',
  port: 993,
  secure: true,
}

/**
 * 從 email header 中提取所有 email 地址
 */
export function extractEmailAddresses(headerValue: string): string[] {
  if (!headerValue) return []

  const emails: string[] = []
  const regex = /<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/g
  let match
  while ((match = regex.exec(headerValue)) !== null) {
    emails.push(match[1].toLowerCase())
  }
  return emails
}

/**
 * 從地址欄位提取 email
 */
function extractFromAddress(address: ParsedMail['from']): { display: string; email: string } {
  if (!address || !address.value || address.value.length === 0) {
    return { display: '', email: '' }
  }
  const first = address.value[0]
  return {
    display: first.name || first.address || '',
    email: (first.address || '').toLowerCase(),
  }
}

/**
 * 從地址欄位提取所有 email
 */
function extractAddresses(address: ParsedMail['to']): { display: string; emails: string[] } {
  if (!address) {
    return { display: '', emails: [] }
  }

  const values = Array.isArray(address) ? address : [address]
  const allAddresses = values.flatMap(v => v.value || [])

  return {
    display: allAddresses.map(a => a.name || a.address || '').join(', '),
    emails: allAddresses.map(a => (a.address || '').toLowerCase()).filter(Boolean),
  }
}

/**
 * 取得 Gmail 設定
 */
async function getGmailConfig(): Promise<GmailConfig | null> {
  try {
    const configRecord = await prisma.systemConfig.findUnique({
      where: { key: GMAIL_CONFIG_KEY },
    })

    if (!configRecord) {
      return null
    }

    return JSON.parse(configRecord.value) as GmailConfig
  } catch (error) {
    console.error('Error loading Gmail config:', error)
    return null
  }
}

/**
 * 建立 IMAP 連線
 */
async function createImapClient(email: string, appPassword: string): Promise<ImapFlow> {
  const client = new ImapFlow({
    ...GMAIL_IMAP_CONFIG,
    auth: {
      user: email,
      pass: appPassword,
    },
    logger: false,
  })

  await client.connect()
  return client
}

/**
 * 測試 IMAP 連線
 */
export async function testImapConnection(email: string, appPassword: string): Promise<{
  success: boolean
  message: string
  inboxCount?: number
}> {
  let client: ImapFlow | null = null

  try {
    client = await createImapClient(email, appPassword)

    // 開啟 INBOX 取得信件數量
    const mailbox = await client.getMailboxLock('INBOX')
    try {
      const status = await client.status('INBOX', { messages: true })
      return {
        success: true,
        message: '連線成功',
        inboxCount: status.messages || 0,
      }
    } finally {
      mailbox.release()
    }
  } catch (error) {
    console.error('IMAP connection test failed:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : '連線失敗',
    }
  } finally {
    if (client) {
      await client.logout().catch(() => {})
    }
  }
}

/**
 * 取得系統信箱的信件
 */
export async function fetchEmails(options: {
  email: string
  appPassword: string
  since: Date
  maxCount?: number
}): Promise<ImapEmail[]> {
  const { email, appPassword, since, maxCount = 50 } = options
  let client: ImapFlow | null = null
  const emails: ImapEmail[] = []

  try {
    client = await createImapClient(email, appPassword)

    const mailbox = await client.getMailboxLock('INBOX')
    try {
      // 搜尋指定日期之後的信件
      const searchResult = await client.search({
        since,
      })

      if (!searchResult || searchResult.length === 0) {
        return []
      }

      // 只取最近的 maxCount 封
      const uidsToFetch = (searchResult as number[]).slice(-maxCount)

      // 取得信件內容
      for await (const message of client.fetch(uidsToFetch, {
        source: true,
        uid: true,
      })) {
        try {
          if (!message.source) {
            console.error('Email source is empty for uid:', message.uid)
            continue
          }
          const parsed = await simpleParser(message.source)

          const from = extractFromAddress(parsed.from)
          const to = extractAddresses(parsed.to)
          const cc = extractAddresses(parsed.cc)

          // 判斷是否為收到的信件（不是自己寄的）
          const isIncoming = from.email.toLowerCase() !== email.toLowerCase()

          // 提取附件
          const attachments: EmailAttachment[] = []
          if (parsed.attachments && parsed.attachments.length > 0) {
            for (const att of parsed.attachments) {
              // 只處理有檔名的附件（排除 inline images 等）
              if (att.filename && att.content) {
                attachments.push({
                  filename: att.filename,
                  contentType: att.contentType || 'application/octet-stream',
                  size: att.size || att.content.length,
                  content: att.content,
                })
              }
            }
          }

          emails.push({
            uid: message.uid,
            messageId: parsed.messageId || `uid-${message.uid}`,
            from: from.display || from.email,
            fromEmail: from.email,
            to: to.display,
            toEmails: to.emails,
            cc: cc.display,
            ccEmails: cc.emails,
            subject: parsed.subject || '(無主旨)',
            body: parsed.text || '',
            date: parsed.date || new Date(),
            isIncoming,
            attachments,
            rawSource: Buffer.isBuffer(message.source) ? message.source : Buffer.from(message.source),
          })
        } catch (parseError) {
          console.error('Error parsing email:', parseError)
        }
      }
    } finally {
      mailbox.release()
    }

    return emails
  } catch (error) {
    console.error('Error fetching emails:', error)
    throw error
  } finally {
    if (client) {
      await client.logout().catch(() => {})
    }
  }
}

/**
 * 使用系統設定取得信件
 */
export async function fetchSystemMailboxEmails(options?: {
  since?: Date
  maxCount?: number
}): Promise<ImapEmail[]> {
  const config = await getGmailConfig()

  if (!config || !config.connected || !config.email || !config.appPassword) {
    throw new Error('Gmail 尚未設定或未連接')
  }

  const daysToFetch = config.syncSettings.daysToFetch || 7
  const since = options?.since || new Date(Date.now() - daysToFetch * 24 * 60 * 60 * 1000)

  return fetchEmails({
    email: config.email,
    appPassword: config.appPassword,
    since,
    maxCount: options?.maxCount || 50,
  })
}

/**
 * 取得系統收件信箱的 Email 地址
 */
export async function getSystemMailboxEmail(): Promise<string | null> {
  const config = await getGmailConfig()
  return config?.email || null
}

/**
 * 根據 email 地址查找客戶
 */
export async function findCustomerByEmail(
  emails: string[],
  excludeDomains: string[] = []
): Promise<{ id: string; name: string; email: string | null } | null> {
  // 過濾掉內部網域
  const filteredEmails = emails.filter(email => {
    const domain = email.split('@')[1]
    return !excludeDomains.some(d => domain?.toLowerCase().endsWith(d.toLowerCase()))
  })

  if (filteredEmails.length === 0) {
    return null
  }

  try {
    const customer = await prisma.partner.findFirst({
      where: {
        OR: filteredEmails.map(email => ({
          email: {
            contains: email,
            mode: 'insensitive' as const,
          },
        })),
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    })

    return customer
  } catch (error) {
    console.error('Error finding customer by email:', error)
    return null
  }
}

export default {
  extractEmailAddresses,
  testImapConnection,
  fetchEmails,
  fetchSystemMailboxEmails,
  getSystemMailboxEmail,
  findCustomerByEmail,
}
