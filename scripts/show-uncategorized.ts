/**
 * 顯示未分類訊息
 */

import * as fs from 'fs'

interface AnalyzedMessage {
  channelId: string
  channelName: string
  user: string
  text: string
  timestamp: string
  ts: string
  importance: { importance: 'high' | 'medium' | 'low'; reasons: string[] }
  categories: string[]
}

interface AnalyzedData {
  messages: AnalyzedMessage[]
}

const data: AnalyzedData = JSON.parse(
  fs.readFileSync('./logs/slack-messages-analyzed.json', 'utf-8')
)

// 取得未分類訊息
const uncategorized = data.messages.filter(m =>
  m.categories.includes('未分類') && !m.categories.includes('系統通知')
)

console.log(`=== 未分類訊息分析 ===\n`)
console.log(`共 ${uncategorized.length} 則未分類訊息\n`)

// 按頻道分組統計
const byChannel = new Map<string, AnalyzedMessage[]>()
uncategorized.forEach(m => {
  if (!byChannel.has(m.channelName)) {
    byChannel.set(m.channelName, [])
  }
  byChannel.get(m.channelName)!.push(m)
})

console.log('=== 各頻道未分類訊息數量 ===')
const sortedChannels = [...byChannel.entries()].sort((a, b) => b[1].length - a[1].length)
sortedChannels.forEach(([ch, msgs]) => {
  console.log(`${ch}: ${msgs.length}`)
})

// 顯示訊息樣本
console.log('\n=== 未分類訊息樣本（前 100 則）===\n')

let count = 0
for (const [channelName, messages] of sortedChannels) {
  if (count >= 100) break

  console.log(`\n--- ${channelName} (${messages.length} 則) ---`)

  for (const m of messages.slice(0, 15)) {
    if (count >= 100) break

    const cleanText = m.text
      .replace(/<@[A-Z0-9]+>/g, '@user')
      .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')
      .replace(/<([^|>]+)\|([^>]+)>/g, '$2')
      .replace(/<([^>]+)>/g, '$1')
      .replace(/\n+/g, ' ')
      .trim()
      .slice(0, 150)

    if (cleanText && cleanText.length > 10) {
      console.log(`\n${count + 1}. [${m.timestamp}] ${m.user}:`)
      console.log(`   ${cleanText}`)
      count++
    }
  }
}

// 分析常見詞彙
console.log('\n\n=== 未分類訊息常見詞彙分析 ===\n')

const wordCount = new Map<string, number>()
const stopWords = ['的', '是', '了', '在', '有', '我', '你', '他', '她', '它', '這', '那', '會', '可以', '請', '要', '給', '到', '和', '與', '或', '但', '如果', '因為', '所以', '就', '都', '也', '還', '已', '被', '把', '讓', '對', '等', '看', '說', '做', '用', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while', 'this', 'that', 'these', 'those', 'am', 'user', 'ok', 'hi', '好', '謝謝', '感謝', '幫忙', '確認', '一下', '已']

uncategorized.forEach(m => {
  const words = m.text
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^\u4e00-\u9fff\w\s]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length >= 2 && !stopWords.includes(w))

  words.forEach(word => {
    wordCount.set(word, (wordCount.get(word) || 0) + 1)
  })
})

const topWords = [...wordCount.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 50)

console.log('前 50 個常見詞彙:')
topWords.forEach(([word, count], i) => {
  console.log(`${i + 1}. ${word}: ${count}`)
})
