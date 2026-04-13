/**
 * 測試腳本：發送指定日期的點數 Slack 通知
 * 用法:
 *   npx tsx scripts/test-daily-bonus-notify.ts [YYYY-MM-DD]            # 完整發送（所有人 + 主管）
 *   npx tsx scripts/test-daily-bonus-notify.ts [YYYY-MM-DD] --manager  # 只發主管彙整給所有 Admin/Manager
 *   npx tsx scripts/test-daily-bonus-notify.ts [YYYY-MM-DD] --to <email>  # 只把主管彙整發給指定 email
 */

import { sendDailyBonusNotifications, sendDailyManagerSummary } from '../src/lib/bonus-daily-notifier'

const dateArg = process.argv[2]
const flag = process.argv[3]
const targetEmail = process.argv[4]

const date = dateArg ? new Date(dateArg) : new Date()

console.log(`[test] Date: ${date.toISOString().slice(0, 10)}`)

async function main() {
  if (flag === '--to' && targetEmail) {
    console.log(`[test] Sending manager summary to: ${targetEmail}`)
    const ok = await sendDailyManagerSummary(date, targetEmail)
    console.log('[test] Result:', ok ? 'sent' : 'skipped/failed')
  } else {
    const stats = await sendDailyBonusNotifications(date)
    console.log('[test] Result:', stats)
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
