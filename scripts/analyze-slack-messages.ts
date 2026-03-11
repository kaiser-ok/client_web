/**
 * Slack 訊息分類分析腳本
 * 分析收集到的訊息，找出分類模式
 */

import * as fs from 'fs'

interface CollectedMessage {
  channelId: string
  channelName: string
  user: string
  text: string
  timestamp: string
  ts: string
}

interface CollectedData {
  collectedAt: string
  totalMessages: number
  channelStats: Array<{ name: string; count: number }>
  messages: CollectedMessage[]
}

// 定義關鍵詞分類
const KEYWORDS = {
  // 緊急/高優先
  urgent: ['當機', '故障', '緊急', '無法連線', '連不上', '失連', '掛了', '掛掉', '不通', '斷線', '異常', '錯誤', 'error', 'crash', 'down', '報修', '客訴'],

  // 技術討論
  technical: ['MR', 'PR', 'merge', 'commit', 'deploy', 'bug', 'fix', 'debug', 'schema', 'API', 'DB', '資料庫', '程式', 'code', 'git', 'jira', '開發', 'ES', 'elasticsearch', 'docker', 'container', 'config', '設定', 'ssh', 'tcp', 'udp', 'port', 'ip', 'snmp', 'syslog', 'netflow', '硬碟', '記憶體', 'cpu', 'memory', 'disk'],

  // 業務/客戶
  business: ['報價', '合約', '驗收', '開標', '投標', '標案', '拜訪', '會議', '簡報', '客戶', '老師', '需求', '專案', '訂單', '付款', '帳款', '出貨'],

  // 維護/排程
  maintenance: ['升級', '更新', '維護', '重開', '重啟', 'restart', 'reboot', '備份', 'backup', '排程', '預計時間', '安排'],

  // 資安
  security: ['資安', '漏洞', 'CVE', '攻擊', '入侵', '憑證', 'certificate', 'SSL', 'TLS', 'HTTPS', '防火牆', 'firewall', 'ISMS', 'ISO'],

  // 行政
  admin: ['行政', '交辦', '寄送', '收件', '出差', '報帳', '請假', '人事'],

  // 閒聊/低優先
  casual: ['零食', '點心', '分享', '享用', '八卦', '休閒', '新聞', '連結']
}

// 判斷訊息是否重要
function analyzeImportance(text: string): { importance: 'high' | 'medium' | 'low'; reasons: string[] } {
  const lowerText = text.toLowerCase()
  const reasons: string[] = []

  // 高優先關鍵詞
  for (const keyword of KEYWORDS.urgent) {
    if (lowerText.includes(keyword.toLowerCase())) {
      reasons.push(`緊急關鍵詞: ${keyword}`)
    }
  }
  if (reasons.length > 0) {
    return { importance: 'high', reasons }
  }

  // 業務關鍵詞也算高優先
  for (const keyword of KEYWORDS.business) {
    if (lowerText.includes(keyword.toLowerCase())) {
      reasons.push(`業務關鍵詞: ${keyword}`)
    }
  }
  if (reasons.length >= 2) {
    return { importance: 'high', reasons }
  }
  if (reasons.length > 0) {
    return { importance: 'medium', reasons }
  }

  // 技術討論 - 中等重要
  for (const keyword of KEYWORDS.technical) {
    if (lowerText.includes(keyword.toLowerCase())) {
      reasons.push(`技術關鍵詞: ${keyword}`)
    }
  }
  if (reasons.length > 0) {
    return { importance: 'medium', reasons }
  }

  // 維護相關 - 中等
  for (const keyword of KEYWORDS.maintenance) {
    if (lowerText.includes(keyword.toLowerCase())) {
      reasons.push(`維護關鍵詞: ${keyword}`)
    }
  }
  if (reasons.length > 0) {
    return { importance: 'medium', reasons }
  }

  // 閒聊 - 低優先
  for (const keyword of KEYWORDS.casual) {
    if (lowerText.includes(keyword.toLowerCase())) {
      reasons.push(`閒聊關鍵詞: ${keyword}`)
    }
  }
  if (reasons.length > 0) {
    return { importance: 'low', reasons }
  }

  // 預設中等
  return { importance: 'medium', reasons: ['無明確分類'] }
}

// 判斷訊息類型
function categorizeMessage(text: string, channelName: string): string[] {
  const categories: string[] = []
  const lowerText = text.toLowerCase()
  const lowerChannel = channelName.toLowerCase()

  // 根據頻道名稱初步分類
  if (lowerChannel.includes('snm_') || lowerChannel.includes('智慧網管')) {
    categories.push('智慧網管')
  }
  if (lowerChannel.includes('voip') || lowerChannel.includes('sip') || lowerChannel.includes('sbc')) {
    categories.push('VoIP通訊')
  }
  if (lowerChannel.includes('isms') || lowerChannel.includes('iso') || lowerChannel.includes('security')) {
    categories.push('資安合規')
  }
  if (lowerChannel.includes('專案')) {
    categories.push('專案')
  }
  if (lowerChannel.includes('fae') || lowerChannel.includes('客戶')) {
    categories.push('客服')
  }

  // 根據內容分類
  if (KEYWORDS.urgent.some(k => lowerText.includes(k.toLowerCase()))) {
    categories.push('故障處理')
  }
  if (KEYWORDS.technical.some(k => lowerText.includes(k.toLowerCase()))) {
    categories.push('技術討論')
  }
  if (KEYWORDS.business.some(k => lowerText.includes(k.toLowerCase()))) {
    categories.push('業務進度')
  }
  if (KEYWORDS.maintenance.some(k => lowerText.includes(k.toLowerCase()))) {
    categories.push('維護作業')
  }
  if (KEYWORDS.security.some(k => lowerText.includes(k.toLowerCase()))) {
    categories.push('資安相關')
  }
  if (KEYWORDS.casual.some(k => lowerText.includes(k.toLowerCase()))) {
    categories.push('非工作')
  }

  // 特殊模式
  if (text.includes('已加入頻道') || text.includes('已加入群組')) {
    return ['系統通知']
  }
  if (text.includes('請回電') || text.includes('來電')) {
    categories.push('客戶來電')
  }
  if (text.includes('驗收') || text.includes('通過')) {
    categories.push('驗收/里程碑')
  }

  return categories.length > 0 ? categories : ['未分類']
}

async function analyze() {
  // 讀取收集的資料
  const data: CollectedData = JSON.parse(
    fs.readFileSync('./logs/slack-messages-collected.json', 'utf-8')
  )

  console.log('=== Slack 訊息分類分析 ===\n')
  console.log(`資料收集時間: ${data.collectedAt}`)
  console.log(`總訊息數: ${data.totalMessages}\n`)

  // 分析每則訊息
  const analyzed = data.messages.map(m => ({
    ...m,
    importance: analyzeImportance(m.text),
    categories: categorizeMessage(m.text, m.channelName)
  }))

  // 統計重要性分佈
  const importanceStats = {
    high: analyzed.filter(m => m.importance.importance === 'high').length,
    medium: analyzed.filter(m => m.importance.importance === 'medium').length,
    low: analyzed.filter(m => m.importance.importance === 'low').length
  }

  console.log('=== 重要性分佈 ===')
  console.log(`高 (需保存): ${importanceStats.high} (${(importanceStats.high / data.totalMessages * 100).toFixed(1)}%)`)
  console.log(`中 (可保存): ${importanceStats.medium} (${(importanceStats.medium / data.totalMessages * 100).toFixed(1)}%)`)
  console.log(`低 (可忽略): ${importanceStats.low} (${(importanceStats.low / data.totalMessages * 100).toFixed(1)}%)`)

  // 統計分類分佈
  const categoryStats = new Map<string, number>()
  analyzed.forEach(m => {
    m.categories.forEach(cat => {
      categoryStats.set(cat, (categoryStats.get(cat) || 0) + 1)
    })
  })

  console.log('\n=== 分類分佈 ===')
  const sortedCategories = [...categoryStats.entries()].sort((a, b) => b[1] - a[1])
  sortedCategories.forEach(([cat, count]) => {
    console.log(`${cat}: ${count} (${(count / data.totalMessages * 100).toFixed(1)}%)`)
  })

  // 列出高優先訊息樣本
  console.log('\n=== 高優先訊息樣本（前 30 則）===')
  const highPriority = analyzed.filter(m => m.importance.importance === 'high').slice(0, 30)
  highPriority.forEach((m, i) => {
    const cleanText = m.text.replace(/<[^>]+>/g, '').replace(/\n+/g, ' ').trim().slice(0, 100)
    console.log(`\n${i + 1}. [${m.channelName}] ${m.timestamp}`)
    console.log(`   ${m.user}: ${cleanText}`)
    console.log(`   原因: ${m.importance.reasons.slice(0, 3).join(', ')}`)
    console.log(`   分類: ${m.categories.join(', ')}`)
  })

  // 列出低優先訊息樣本
  console.log('\n\n=== 低優先訊息樣本（前 20 則）===')
  const lowPriority = analyzed.filter(m => m.importance.importance === 'low').slice(0, 20)
  lowPriority.forEach((m, i) => {
    const cleanText = m.text.replace(/<[^>]+>/g, '').replace(/\n+/g, ' ').trim().slice(0, 100)
    console.log(`\n${i + 1}. [${m.channelName}] ${m.timestamp}`)
    console.log(`   ${m.user}: ${cleanText}`)
    console.log(`   分類: ${m.categories.join(', ')}`)
  })

  // 列出「系統通知」類訊息
  console.log('\n\n=== 系統通知類（可過濾）===')
  const systemNotices = analyzed.filter(m => m.categories.includes('系統通知')).slice(0, 10)
  console.log(`共 ${analyzed.filter(m => m.categories.includes('系統通知')).length} 則`)
  systemNotices.forEach((m, i) => {
    console.log(`${i + 1}. ${m.text.slice(0, 50)}`)
  })

  // 保存分析結果
  fs.writeFileSync('./logs/slack-messages-analyzed.json', JSON.stringify({
    analyzedAt: new Date().toISOString(),
    totalMessages: data.totalMessages,
    importanceStats,
    categoryStats: Object.fromEntries(sortedCategories),
    messages: analyzed
  }, null, 2))

  console.log('\n\n分析結果已保存至: ./logs/slack-messages-analyzed.json')
}

analyze().catch(console.error)
