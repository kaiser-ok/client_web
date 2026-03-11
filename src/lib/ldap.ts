/**
 * LDAP 認證模組
 * 用於連接 Active Directory 進行使用者驗證
 */

import { Client } from 'ldapts'
import fs from 'fs'
import path from 'path'

// 簡易日誌函數
function logLdap(level: 'INFO' | 'ERROR', message: string, data?: object) {
  const timestamp = new Date().toISOString()
  const logLine = `${timestamp} [LDAP] [${level}] ${message}${data ? ' ' + JSON.stringify(data) : ''}\n`

  // 寫入檔案
  const logPath = path.join(process.cwd(), 'logs', 'ldap.log')
  try {
    fs.appendFileSync(logPath, logLine)
  } catch {
    // 如果寫入失敗，至少輸出到 console
  }

  // 同時輸出到 console
  if (level === 'ERROR') {
    console.error(logLine.trim())
  } else {
    console.log(logLine.trim())
  }
}

// LDAP 設定
const LDAP_URL = process.env.LDAP_URL || 'ldaps://192.168.10.135:636'
const LDAP_BASE_DN = process.env.LDAP_BASE_DN || 'DC=gentrice,DC=tw'
const LDAP_DOMAIN = process.env.LDAP_DOMAIN || 'GENTRICE'

// 重試設定
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 500

export interface LdapUser {
  id: string
  email: string
  name: string
  username: string
  department?: string
  title?: string
}

/**
 * 延遲函數
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 判斷錯誤是否可重試（連線問題而非認證問題）
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    // 認證失敗不重試
    if (msg.includes('invalid credentials') ||
        msg.includes('data 52e') ||  // AD 錯誤碼：密碼錯誤
        msg.includes('data 525') ||  // AD 錯誤碼：使用者不存在
        msg.includes('data 533') ||  // AD 錯誤碼：帳號停用
        msg.includes('data 701') ||  // AD 錯誤碼：帳號過期
        msg.includes('data 773')) {  // AD 錯誤碼：需重設密碼
      return false
    }
    // 連線問題可重試
    if (msg.includes('timeout') ||
        msg.includes('econnrefused') ||
        msg.includes('econnreset') ||
        msg.includes('etimedout') ||
        msg.includes('socket') ||
        msg.includes('connection')) {
      return true
    }
  }
  return false
}

/**
 * 使用 LDAP 驗證使用者（單次嘗試）
 */
async function tryAuthenticate(
  username: string,
  password: string
): Promise<{ user: LdapUser | null; error?: Error; retryable: boolean }> {
  const client = new Client({
    url: LDAP_URL,
    timeout: 15000,      // 增加到 15 秒
    connectTimeout: 15000,
    tlsOptions: {
      rejectUnauthorized: false,
    },
  })

  try {
    const bindDN = `${LDAP_DOMAIN}\\${username}`
    await client.bind(bindDN, password)

    const { searchEntries } = await client.search(LDAP_BASE_DN, {
      scope: 'sub',
      filter: `(sAMAccountName=${escapeFilter(username)})`,
      attributes: [
        'cn',
        'displayName',
        'mail',
        'sAMAccountName',
        'userPrincipalName',
        'department',
        'title',
        'objectGUID',
      ],
      sizeLimit: 1,
    })

    if (searchEntries.length === 0) {
      return { user: null, retryable: false }
    }

    const entry = searchEntries[0]

    let id: string
    const guid = entry.objectGUID
    if (guid instanceof Buffer) {
      id = guid.toString('hex')
    } else if (typeof guid === 'string') {
      id = guid
    } else {
      id = `ldap-${username}`
    }

    const user: LdapUser = {
      id,
      email: (entry.mail as string) || `${username}@gentrice.tw`,
      name: (entry.displayName as string) || (entry.cn as string) || username,
      username: entry.sAMAccountName as string,
      department: entry.department as string | undefined,
      title: entry.title as string | undefined,
    }

    return { user, retryable: false }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    const retryable = isRetryableError(error)
    return { user: null, error: err, retryable }
  } finally {
    try {
      await client.unbind()
    } catch {
      // ignore unbind errors
    }
  }
}

/**
 * 使用 LDAP 驗證使用者（含重試機制）
 * @param username 使用者帳號 (不含 domain)
 * @param password 密碼
 * @returns 使用者資訊，驗證失敗返回 null
 */
export async function authenticateWithLDAP(
  username: string,
  password: string
): Promise<LdapUser | null> {
  if (!username || !password) {
    return null
  }

  let lastError: Error | undefined

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    const result = await tryAuthenticate(username, password)

    if (result.user) {
      if (attempt > 1) {
        logLdap('INFO', `使用者 ${username} 第 ${attempt} 次嘗試登入成功`)
      } else {
        logLdap('INFO', `使用者 ${username} 登入成功`)
      }
      return result.user
    }

    if (result.error) {
      lastError = result.error

      // 記錄詳細錯誤
      logLdap('ERROR', `使用者 ${username} 第 ${attempt} 次嘗試失敗`, {
        message: result.error.message,
        retryable: result.retryable,
        willRetry: result.retryable && attempt <= MAX_RETRIES,
      })

      // 如果是認證錯誤（密碼錯誤等），不重試
      if (!result.retryable) {
        return null
      }

      // 如果還有重試機會，等待後重試
      if (attempt <= MAX_RETRIES) {
        await delay(RETRY_DELAY_MS * attempt) // 遞增延遲
        continue
      }
    }

    // 搜尋不到使用者
    if (!result.error && !result.user) {
      logLdap('ERROR', `使用者 ${username} 驗證成功但查無使用者資料`)
      return null
    }
  }

  // 所有重試都失敗
  logLdap('ERROR', `使用者 ${username} 登入失敗（已重試 ${MAX_RETRIES} 次）`, { lastError: lastError?.message })
  return null
}

/**
 * 跳脫 LDAP filter 特殊字元，防止 LDAP injection
 */
function escapeFilter(input: string): string {
  return input
    .replace(/\\/g, '\\5c')
    .replace(/\*/g, '\\2a')
    .replace(/\(/g, '\\28')
    .replace(/\)/g, '\\29')
    .replace(/\0/g, '\\00')
}
