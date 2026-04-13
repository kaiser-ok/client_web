/**
 * 測試腳本：發送指定日期的點數 Slack 通知（只送給 kaiser@gentrice.net）
 * 用法:
 *   npx tsx scripts/test-daily-bonus-notify.ts [YYYY-MM-DD]            # 個人通知（kaiser 有活動才發）+ 主管彙整
 *   npx tsx scripts/test-daily-bonus-notify.ts [YYYY-MM-DD] --manager  # 只發主管彙整給 kaiser
 */

import { sendDailyBonusNotifications, sendDailyManagerSummary } from '../src/lib/bonus-daily-notifier'

const TEST_EMAIL = 'kaiser@gentrice.net'
const dateArg = process.argv[2]
const flag = process.argv[3]

const date = dateArg ? new Date(dateArg) : new Date()
console.log(`[test] Date: ${date.toISOString().slice(0, 10)}, recipient: ${TEST_EMAIL}`)

async function main() {
  if (flag === '--manager') {
    const ok = await sendDailyManagerSummary(date, TEST_EMAIL)
    console.log('[test] Manager summary:', ok ? 'sent' : 'skipped/failed')
  } else {
    // 個人通知只送 kaiser（若 kaiser 當天有活動），主管彙整也只送 kaiser
    const KAISER_USER_ID = 'cmja1xy3c00008g2ocvg4oudk'
    const stats = await sendDailyBonusNotifications(date, KAISER_USER_ID, TEST_EMAIL)
    console.log('[test] Result:', stats)
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
