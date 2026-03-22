/**
 * 共用日誌工具
 * 寫入檔案 + console 輸出
 */

import fs from 'fs'
import path from 'path'

type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

const LOG_DIR = path.join(process.cwd(), 'logs')

function ensureLogDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
  } catch { /* ignore */ }
}

function writeLog(filename: string, level: Level, module: string, message: string, data?: unknown) {
  const timestamp = new Date().toISOString()
  const dataStr = data !== undefined ? ' ' + JSON.stringify(data, null, 0) : ''
  const line = `${timestamp} [${module}] [${level}] ${message}${dataStr}\n`

  ensureLogDir()
  try {
    fs.appendFileSync(path.join(LOG_DIR, filename), line)
  } catch { /* ignore write errors */ }

  if (level === 'ERROR' || level === 'WARN') {
    console.error(line.trim())
  } else {
    console.log(line.trim())
  }
}

export function createLogger(module: string, filename: string) {
  return {
    debug: (msg: string, data?: unknown) => writeLog(filename, 'DEBUG', module, msg, data),
    info:  (msg: string, data?: unknown) => writeLog(filename, 'INFO',  module, msg, data),
    warn:  (msg: string, data?: unknown) => writeLog(filename, 'WARN',  module, msg, data),
    error: (msg: string, data?: unknown) => writeLog(filename, 'ERROR', module, msg, data),
  }
}
