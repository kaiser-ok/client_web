/**
 * Gmail 系統收信設定型別（App Password + IMAP 方式）
 */

export interface GmailSyncSettings {
  enabled: boolean           // 啟用自動同步
  intervalMinutes: number    // 同步間隔（分鐘）
  daysToFetch: number        // 取最近 N 天
}

export interface GmailConfig {
  version: string
  connected: boolean
  email: string              // Gmail 信箱地址
  appPassword: string        // App Password（16 位）
  syncSettings: GmailSyncSettings
  internalDomains: string[]  // 內部網域（排除匹配）
  lastSyncAt?: string        // 最後同步時間
  lastSyncResult?: {
    success: number
    failed: number
    unmatched: number
  }
  updatedAt: string
  updatedBy: string
}

export const DEFAULT_GMAIL_CONFIG: GmailConfig = {
  version: '1.1',
  connected: false,
  email: '',
  appPassword: '',
  syncSettings: {
    enabled: false,
    intervalMinutes: 30,
    daysToFetch: 7,
  },
  internalDomains: ['gentrice.net', 'gentrice.com'],
  updatedAt: new Date().toISOString(),
  updatedBy: '',
}

export const GMAIL_CONFIG_KEY = 'gmail_config'

/**
 * Gmail 同步結果
 */
export interface GmailSyncResult {
  success: boolean
  processedCount: number
  successCount: number
  failedCount: number
  unmatchedCount: number
  errors: string[]
  unmatchedEmails: Array<{
    messageId: string
    subject: string
    from: string
    recipients: string[]
    date: string
  }>
}

/**
 * Email 附件結構
 */
export interface EmailAttachment {
  filename: string
  contentType: string
  size: number
  content: Buffer
}

/**
 * IMAP 信件結構
 */
export interface ImapEmail {
  uid: number
  messageId: string
  from: string
  fromEmail: string
  to: string
  toEmails: string[]
  cc: string
  ccEmails: string[]
  subject: string
  body: string
  date: Date
  isIncoming: boolean
  attachments: EmailAttachment[]
  rawSource: Buffer  // 原始郵件內容，用於保存 .eml 檔案
}
