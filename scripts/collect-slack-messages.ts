/**
 * Slack 訊息收集腳本
 * 用於收集大量訊息資料以進行分類分析
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createSlackClient, getTimeRange } from '../src/lib/slack'

interface CollectedMessage {
  channelId: string
  channelName: string
  user: string
  text: string
  timestamp: string
  ts: string
}

async function collectMessages() {
  const slack = createSlackClient()

  console.log('=== 開始收集 Slack 訊息 ===\n')

  // 1. 取得所有頻道
  console.log('正在取得頻道列表...')
  const allChannels = await slack.listChannels()
  console.log(`共找到 ${allChannels.length} 個頻道\n`)

  // 2. 過濾頻道（排除 office, iso）
  const excludePatterns = ['office', 'iso']
  const filteredChannels = allChannels.filter(ch => {
    const name = ch.name.toLowerCase()
    return !excludePatterns.some(pattern => name.includes(pattern))
  })

  console.log(`過濾後剩餘 ${filteredChannels.length} 個頻道`)
  console.log('排除的頻道:', allChannels
    .filter(ch => !filteredChannels.includes(ch))
    .map(ch => ch.name)
    .join(', '))
  console.log('')

  // 3. 列出所有頻道名稱
  console.log('=== 頻道列表 ===')
  filteredChannels.forEach((ch, i) => {
    console.log(`${i + 1}. ${ch.name} (${ch.id}) - ${ch.is_private ? '私有' : '公開'}`)
  })
  console.log('')

  // 4. 從每個頻道抓取訊息（過去 365 天，每個頻道最多 500 則）
  const { oldest, latest } = getTimeRange(365)
  const allMessages: CollectedMessage[] = []
  const channelStats: Array<{ name: string; count: number }> = []

  console.log('=== 開始抓取訊息（過去 365 天）===\n')

  for (const channel of filteredChannels) {
    try {
      console.log(`正在抓取: ${channel.name}...`)
      const messages = await slack.getChannelMessagesWithUserNames(channel.id, {
        oldest,
        latest,
        limit: 500,
      })

      const collected = messages.map(m => ({
        channelId: channel.id,
        channelName: channel.name,
        ...m,
      }))

      allMessages.push(...collected)
      channelStats.push({ name: channel.name, count: messages.length })
      console.log(`  -> ${messages.length} 則訊息`)

      // 避免觸發 rate limit
      await new Promise(resolve => setTimeout(resolve, 500))
    } catch (error) {
      console.log(`  -> 錯誤: ${error instanceof Error ? error.message : '未知錯誤'}`)
      channelStats.push({ name: channel.name, count: 0 })
    }
  }

  // 5. 輸出統計
  console.log('\n=== 收集統計 ===')
  console.log(`總共收集 ${allMessages.length} 則訊息`)
  console.log('\n各頻道訊息數量:')
  channelStats
    .sort((a, b) => b.count - a.count)
    .forEach(stat => {
      if (stat.count > 0) {
        console.log(`  ${stat.name}: ${stat.count}`)
      }
    })

  // 6. 輸出訊息樣本（用於觀察分類）
  console.log('\n=== 訊息樣本（前 200 則）===\n')

  // 按頻道分組顯示
  const messagesByChannel = new Map<string, CollectedMessage[]>()
  allMessages.forEach(m => {
    if (!messagesByChannel.has(m.channelName)) {
      messagesByChannel.set(m.channelName, [])
    }
    messagesByChannel.get(m.channelName)!.push(m)
  })

  let sampleCount = 0
  for (const [channelName, messages] of messagesByChannel) {
    if (sampleCount >= 200) break

    console.log(`\n--- ${channelName} ---`)
    for (const m of messages.slice(0, 20)) {
      if (sampleCount >= 200) break

      // 清理訊息文字（移除多餘空白和換行）
      const cleanText = m.text
        .replace(/<@[A-Z0-9]+>/g, '@user') // 替換 mention
        .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1') // 替換 channel mention
        .replace(/<([^|>]+)\|([^>]+)>/g, '$2') // 替換連結
        .replace(/<([^>]+)>/g, '$1') // 替換純連結
        .replace(/\n+/g, ' ') // 換行轉空白
        .trim()
        .slice(0, 200) // 限制長度

      if (cleanText) {
        console.log(`[${m.timestamp}] ${m.user}: ${cleanText}`)
        sampleCount++
      }
    }
  }

  // 7. 保存完整資料到 JSON
  const outputPath = './logs/slack-messages-collected.json'
  const fs = await import('fs')

  // 確保目錄存在
  if (!fs.existsSync('./logs')) {
    fs.mkdirSync('./logs', { recursive: true })
  }

  fs.writeFileSync(outputPath, JSON.stringify({
    collectedAt: new Date().toISOString(),
    totalMessages: allMessages.length,
    channelStats,
    messages: allMessages,
  }, null, 2))

  console.log(`\n\n完整資料已保存至: ${outputPath}`)
}

// 執行
collectMessages().catch(console.error)
