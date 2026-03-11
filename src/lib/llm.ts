/**
 * vLLM API Client
 * 用於連接本地 vLLM 服務進行文字彙整
 */

import { prisma } from '@/lib/prisma'
import {
  SlackClassificationConfig,
  DEFAULT_CLASSIFICATION_CONFIG,
  SLACK_CLASSIFICATION_CONFIG_KEY,
} from '@/types/slack-classification'
import {
  LLMConfig,
  DEFAULT_LLM_CONFIG,
  LLM_CONFIG_KEY,
} from '@/types/llm'

const VLLM_BASE_URL = process.env.VLLM_BASE_URL || 'http://192.168.30.46:8000'
const VLLM_MODEL = process.env.VLLM_MODEL || '/models/gpt-oss-120b'
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api'
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || ''

// 快取設定，避免每次都讀取資料庫
let cachedSlackConfig: SlackClassificationConfig | null = null
let cachedLLMConfig: LLMConfig | null = null
let slackConfigCacheTime = 0
let llmConfigCacheTime = 0
const CONFIG_CACHE_TTL = 60 * 1000 // 1 分鐘

/**
 * 取得 LLM 設定
 */
async function getLLMConfig(): Promise<LLMConfig> {
  const now = Date.now()

  // 如果快取有效，直接返回
  if (cachedLLMConfig && (now - llmConfigCacheTime) < CONFIG_CACHE_TTL) {
    return cachedLLMConfig
  }

  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: LLM_CONFIG_KEY },
    })

    if (config) {
      cachedLLMConfig = JSON.parse(config.value) as LLMConfig
      llmConfigCacheTime = now
      return cachedLLMConfig
    }
  } catch (e) {
    console.error('Failed to load LLM config:', e)
  }

  // 返回預設設定
  return DEFAULT_LLM_CONFIG
}

/**
 * 取得 Slack 分類設定
 */
async function getClassificationConfig(): Promise<SlackClassificationConfig> {
  const now = Date.now()

  // 如果快取有效，直接返回
  if (cachedSlackConfig && (now - slackConfigCacheTime) < CONFIG_CACHE_TTL) {
    return cachedSlackConfig
  }

  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: SLACK_CLASSIFICATION_CONFIG_KEY },
    })

    if (config) {
      cachedSlackConfig = JSON.parse(config.value) as SlackClassificationConfig
      slackConfigCacheTime = now
      return cachedSlackConfig
    }
  } catch (e) {
    console.error('Failed to load classification config:', e)
  }

  // 返回預設設定
  return DEFAULT_CLASSIFICATION_CONFIG
}

/**
 * 根據設定建立分類選項說明
 */
function buildCategoryPrompt(config: SlackClassificationConfig): string {
  const enabledCategories = config.categories.filter(c => c.enabled)
  return enabledCategories.map(c =>
    `- ${c.id}: ${c.label} - ${c.description}`
  ).join('\n')
}

/**
 * 根據設定建立重要性說明
 */
function buildImportancePrompt(config: SlackClassificationConfig): string {
  const highRules = config.priorityRules.filter(r => r.enabled && r.priority === 'high')
  const lowRules = config.priorityRules.filter(r => r.enabled && r.priority === 'low')

  const highDesc = highRules.length > 0
    ? highRules.map(r => r.description).join('、')
    : '故障、客訴、資安事件、重要截止日'

  const lowDesc = lowRules.length > 0
    ? lowRules.map(r => r.description).join('、')
    : '系統通知、閒聊、簡短回覆'

  return `- high: ${highDesc}
- medium: 一般技術討論、維護、需求
- low: ${lowDesc}`
}

/**
 * 使用規則判斷優先級（關鍵字比對）
 */
function evaluatePriorityRules(
  text: string,
  channel: string,
  config: SlackClassificationConfig
): 'high' | 'medium' | 'low' | null {
  // 先檢查自動過濾規則
  if (config.autoFilterRules.enabled) {
    for (const pattern of config.autoFilterRules.patterns) {
      try {
        const regex = new RegExp(pattern)
        if (regex.test(text)) {
          return 'low'
        }
      } catch {
        // 忽略無效的正則表達式
      }
    }
  }

  // 按 order 排序規則
  const sortedRules = [...config.priorityRules]
    .filter(r => r.enabled)
    .sort((a, b) => a.order - b.order)

  for (const rule of sortedRules) {
    let matched = true

    for (const condition of rule.conditions) {
      let conditionMatched = false

      if (condition.type === 'keyword') {
        const keywords = Array.isArray(condition.value) ? condition.value : [condition.value]

        if (condition.operator === 'contains') {
          conditionMatched = keywords.some(kw =>
            condition.caseSensitive
              ? text.includes(kw)
              : text.toLowerCase().includes(kw.toLowerCase())
          )
        } else if (condition.operator === 'regex') {
          const pattern = Array.isArray(condition.value) ? condition.value[0] : condition.value
          try {
            const regex = new RegExp(pattern, condition.caseSensitive ? '' : 'i')
            conditionMatched = regex.test(text)
          } catch {
            // 忽略無效的正則表達式
          }
        }
      } else if (condition.type === 'channel') {
        const channelPattern = Array.isArray(condition.value) ? condition.value[0] : condition.value
        conditionMatched = channel.toLowerCase().includes(channelPattern.toLowerCase())
      }

      if (!conditionMatched) {
        matched = false
        break
      }
    }

    if (matched) {
      return rule.priority
    }
  }

  return null // 沒有匹配的規則
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatCompletionResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * 發送對話請求到 LLM（自動從資料庫讀取設定）
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options: {
    maxTokens?: number
    temperature?: number
    baseUrl?: string
    model?: string
    apiKey?: string
  } = {}
): Promise<string> {
  // 如果沒有明確傳入 baseUrl/model，從資料庫設定讀取
  let resolvedBaseUrl = options.baseUrl
  let resolvedModel = options.model
  let resolvedApiKey = options.apiKey
  let resolvedMaxTokens = options.maxTokens ?? 2000
  let resolvedTemperature = options.temperature ?? 0.7

  if (!resolvedBaseUrl || !resolvedModel) {
    const llmConfig = await getLLMConfig()
    resolvedBaseUrl = resolvedBaseUrl || llmConfig.primary.baseUrl
    resolvedModel = resolvedModel || llmConfig.primary.model
    resolvedApiKey = resolvedApiKey ?? llmConfig.primary.apiKey
    resolvedMaxTokens = options.maxTokens ?? llmConfig.defaultMaxTokens
    resolvedTemperature = options.temperature ?? llmConfig.defaultTemperature
  }

  const baseUrl = resolvedBaseUrl
  const model = resolvedModel
  const apiKey = resolvedApiKey
  const maxTokens = resolvedMaxTokens
  const temperature = resolvedTemperature

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  // OpenRouter 需要額外 headers
  if (baseUrl.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = 'https://client-web.local'
    headers['X-Title'] = 'Client Web'
  }

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`vLLM API error: ${response.status} - ${error}`)
  }

  const data: ChatCompletionResponse = await response.json()
  return data.choices[0]?.message?.content || ''
}

/**
 * Slack 事件類別（舊版，保留相容性）
 */
export type SlackEventCategory = 'BUSINESS' | 'TECHNICAL'

/**
 * Slack 事件結構（舊版，保留相容性）
 */
export interface SlackEvent {
  title: string              // 標題
  content: string            // 內容
  category: SlackEventCategory // 類別：BUSINESS 業務/客戶, TECHNICAL 技術/工程
  slackTimestamp: string     // Slack 資料時間（參考用）
  eventDate?: string         // 預計事件發生時間（如有提及）
}

/**
 * Slack 事件類別 V2（更詳細的分類）
 */
export type SlackEventCategoryV2 =
  | 'business'     // 業務進度：報價、合約、驗收、客戶需求
  | 'support'      // 客戶報修：客戶來電報修、問題反應
  | 'incident'     // 故障處理：系統當機、服務異常
  | 'technical'    // 技術討論：程式開發、MR/PR審查、API設計
  | 'maintenance'  // 維護作業：系統升級、設定更新
  | 'security'     // 資安相關：漏洞通報、憑證管理
  | 'logistics'    // 物流寄送：設備寄送、維修品收發
  | 'speedtest'    // 測速系統：測速功能、節點測試
  | 'training'     // 內部訓練：人員培訓、證照考試
  | 'admin'        // 行政事務：ISO稽核、資產盤點
  | 'system_notice' // 系統通知：自動通知（可忽略）
  | 'casual'       // 非工作：閒聊、零食分享（可忽略）

/**
 * Slack 事件結構 V2（包含更多資訊）
 */
export interface SlackEventV2 {
  title: string                   // 標題
  content: string                 // 內容
  category: SlackEventCategoryV2  // 詳細分類
  importance: 'high' | 'medium' | 'low' // 重要性
  slackTimestamp: string          // Slack 資料時間
  eventDate?: string              // 預計事件發生時間
  participants?: string[]         // 參與討論的人員
  keywords?: string[]             // 關鍵字
}

/**
 * 從 Slack 對話中提取事件
 */
export async function extractSlackEvents(
  messages: Array<{ user: string; text: string; timestamp: string }>,
  customerName: string
): Promise<SlackEvent[]> {
  const conversationText = messages
    .map(m => `[${m.timestamp}] ${m.user}: ${m.text}`)
    .join('\n')

  const systemPrompt = `你是一個專業的客戶服務助理，擅長從對話中提取重要事件和資訊。
請用繁體中文回答，並保持簡潔專業的風格。`

  const userPrompt = `以下是關於客戶「${customerName}」的內部 Slack 討論記錄。

請從對話中提取所有重要事件，每個事件獨立列出。事件分為兩大類：

【BUSINESS 業務/客戶類】
- 業務說明客戶端預計發生的事情
- 客戶反應或回報的問題、需求
- 預定的拜訪、會議、維護時間
- 報價、合約、訂單相關
- 客戶的回覆或決策

【TECHNICAL 技術/工程類】
- 工程師討論的解決方案
- 技術問題分析與診斷
- 系統設定或調整
- 程式修改或部署計畫
- 測試結果或驗證

每個事件需包含：
1. title: 簡短標題（10-20字）
2. content: 詳細內容說明
3. category: 類別，必須是 "BUSINESS" 或 "TECHNICAL"
4. slackTimestamp: 該事件在對話中首次出現的時間
5. eventDate: 如果提到預計發生日期（如「下週一」「12/25」），轉換為 YYYY-MM-DD 格式；如無則填 null

---
對話記錄：
${conversationText}
---

請以 JSON 陣列格式回覆：
[
  {
    "title": "事件標題",
    "content": "詳細內容",
    "category": "BUSINESS 或 TECHNICAL",
    "slackTimestamp": "對話中的時間",
    "eventDate": "YYYY-MM-DD 或 null"
  }
]

只回覆 JSON 陣列，不要其他文字。如果沒有重要事件，回覆空陣列 []。`

  const response = await chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], {
    maxTokens: 3000,
    temperature: 0.3,
  })

  try {
    // 嘗試解析 JSON 陣列回應
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (Array.isArray(parsed)) {
        return parsed.map(item => ({
          title: item.title || '未命名事件',
          content: item.content || '',
          category: (item.category === 'TECHNICAL' ? 'TECHNICAL' : 'BUSINESS') as SlackEventCategory,
          slackTimestamp: item.slackTimestamp || '',
          eventDate: item.eventDate || undefined,
        }))
      }
    }
  } catch (e) {
    console.error('Failed to parse LLM response:', e)
  }

  return []
}

/**
 * 從 Slack 對話中提取事件 V2（更詳細的分類）
 * 包含 retry 機制處理 LLM 回應解析失敗
 */
export async function extractSlackEventsV2(
  messages: Array<{ user: string; text: string; timestamp: string }>,
  customerName: string,
  maxRetries: number = 2
): Promise<SlackEventV2[]> {
  const conversationText = messages
    .map(m => `[${m.timestamp}] ${m.user}: ${m.text}`)
    .join('\n')

  // 取得所有參與者
  const allParticipants = [...new Set(messages.map(m => m.user))]

  const systemPrompt = `你是一個專業的客戶服務助理，擅長從對話中提取重要事件和資訊。
請用繁體中文回答，並保持簡潔專業的風格。
重要：回覆必須是有效的 JSON 格式，不要包含任何額外文字或註解。`

  const userPrompt = `以下是關於客戶「${customerName}」的內部 Slack 討論記錄。

請從對話中提取所有重要事件，每個事件獨立列出。

## 分類說明（必須使用以下分類 ID）
- business: 業務進度（報價、合約、驗收時間、客戶需求、拜訪會議）→ 這類事件會顯示在客戶時間軸
- support: 客戶報修（客戶來電報修、問題反應、客訴）→ 這類事件會顯示在客戶時間軸
- incident: 故障處理（系統當機、服務異常、緊急故障）→ 這類事件會顯示在客戶時間軸
- logistics: 物流寄送（設備寄送、維修品收發）→ 這類事件會顯示在客戶時間軸
- technical: 技術討論（程式開發、MR/PR、API設計、資料庫討論）→ 這類事件存為技術文件供日後參考
- maintenance: 維護作業（系統升級、設定更新）→ 這類事件存為技術文件
- security: 資安相關（漏洞通報、憑證管理）→ 這類事件存為技術文件
- speedtest: 測速系統（測速功能、節點測試）→ 這類事件存為技術文件
- training: 內部訓練（人員培訓、證照考試）→ 忽略
- admin: 行政事務（ISO稽核、資產盤點）→ 忽略
- system_notice: 系統通知（加入/離開頻道）→ 忽略
- casual: 非工作（閒聊、零食分享）→ 忽略

## 重要性判斷
- high: 故障、客訴、資安事件、重要驗收截止日
- medium: 一般業務、技術討論、維護
- low: 系統通知、閒聊

## 每個事件需包含
1. title: 簡短標題（10-20字）
2. content: 詳細內容說明
3. category: 分類 ID（必須是上述分類之一）
4. importance: 重要性 (high/medium/low)
5. slackTimestamp: 該事件在對話中首次出現的時間
6. eventDate: 如果提到預計發生日期，轉換為 YYYY-MM-DD 格式；如無則填 null
7. participants: 參與討論的人員列表
8. keywords: 關鍵字列表（2-5個）

---
對話記錄：
${conversationText}
---

請以 JSON 陣列格式回覆：
[
  {
    "title": "事件標題",
    "content": "詳細內容",
    "category": "分類ID",
    "importance": "high|medium|low",
    "slackTimestamp": "對話中的時間",
    "eventDate": "YYYY-MM-DD 或 null",
    "participants": ["人員1", "人員2"],
    "keywords": ["關鍵詞1", "關鍵詞2"]
  }
]

只回覆 JSON 陣列，不要其他文字。如果沒有重要事件，回覆空陣列 []。`

  const llmConfig = await getLLMConfig()

  // Retry 機制
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], {
        maxTokens: 4000,
        temperature: attempt === 0 ? 0.3 : 0.2, // 重試時降低 temperature
        baseUrl: llmConfig.primary.baseUrl,
        model: llmConfig.primary.model,
        apiKey: llmConfig.primary.apiKey,
      })

      // 嘗試解析 JSON 陣列回應
      const jsonMatch = response.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        // 清理可能的問題字元
        let cleanedJson = jsonMatch[0]

        // 嘗試多種修復策略
        const repairStrategies = [
          // 策略 1: 基本清理
          (json: string) => json
            .replace(/[\x00-\x1F\x7F]/g, ' ') // 移除控制字元
            .replace(/,\s*]/g, ']') // 移除陣列尾隨逗號
            .replace(/,\s*}/g, '}'), // 移除物件尾隨逗號

          // 策略 2: 修復字串中的換行和引號
          (json: string) => json
            .replace(/[\x00-\x1F\x7F]/g, ' ')
            .replace(/(?<="[^"]*)\n(?=[^"]*")/g, ' ') // 字串內的換行替換為空格
            .replace(/,\s*]/g, ']')
            .replace(/,\s*}/g, '}'),

          // 策略 3: 更激進的修復 - 重新格式化
          (json: string) => {
            // 提取所有物件並重新組裝
            const objects: string[] = []
            const objRegex = /\{[^{}]*\}/g
            let match
            while ((match = objRegex.exec(json)) !== null) {
              objects.push(match[0].replace(/[\x00-\x1F\x7F\n\r]/g, ' '))
            }
            return objects.length > 0 ? '[' + objects.join(',') + ']' : '[]'
          },
        ]

        for (let i = 0; i < repairStrategies.length; i++) {
          try {
            cleanedJson = repairStrategies[i](jsonMatch[0])
            const parsed = JSON.parse(cleanedJson)
            if (Array.isArray(parsed)) {
              return parsed.map(item => ({
                title: item.title || '未命名事件',
                content: item.content || '',
                category: validateCategoryV2(item.category),
                importance: validateImportance(item.importance),
                slackTimestamp: item.slackTimestamp || '',
                eventDate: item.eventDate || undefined,
                participants: Array.isArray(item.participants) ? item.participants : allParticipants,
                keywords: Array.isArray(item.keywords) ? item.keywords : [],
              }))
            }
          } catch (parseError) {
            if (i === repairStrategies.length - 1) {
              // 最後一個策略也失敗，記錄原始回應以便 debug
              console.error('extractSlackEventsV2: JSON repair failed. Raw response sample:',
                response.substring(0, 500) + (response.length > 500 ? '...' : ''))
              throw parseError
            }
            // 繼續嘗試下一個策略
          }
        }
      }

      // 沒有匹配到 JSON 陣列
      if (attempt < maxRetries) {
        console.warn(`extractSlackEventsV2: No valid JSON array found, retrying (${attempt + 1}/${maxRetries})...`)
        continue
      }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      console.warn(`extractSlackEventsV2: Parse failed (attempt ${attempt + 1}/${maxRetries + 1}):`, lastError.message)

      if (attempt < maxRetries) {
        // 等待一小段時間再重試
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
        continue
      }
    }
  }

  // 所有重試都失敗
  if (lastError) {
    console.error('extractSlackEventsV2: All retries failed:', lastError)
  }

  return []
}

/**
 * 驗證分類 V2
 */
function validateCategoryV2(category: string): SlackEventCategoryV2 {
  const validCategories: SlackEventCategoryV2[] = [
    'business', 'support', 'incident', 'technical', 'maintenance',
    'security', 'logistics', 'speedtest', 'training', 'admin',
    'system_notice', 'casual'
  ]
  const lower = (category || '').toLowerCase()
  return validCategories.includes(lower as SlackEventCategoryV2)
    ? (lower as SlackEventCategoryV2)
    : 'technical' // 預設為技術討論
}

/**
 * 驗證重要性
 */
function validateImportance(importance: string): 'high' | 'medium' | 'low' {
  const valid = ['high', 'medium', 'low']
  const lower = (importance || '').toLowerCase()
  return valid.includes(lower) ? (lower as 'high' | 'medium' | 'low') : 'medium'
}

/**
 * 彙整 Slack 對話內容（舊版，保留相容性）
 */
export async function summarizeSlackConversation(
  messages: Array<{ user: string; text: string; timestamp: string }>,
  customerName: string
): Promise<{
  summary: string
  keyPoints: string[]
  actionItems: string[]
}> {
  const conversationText = messages
    .map(m => `[${m.timestamp}] ${m.user}: ${m.text}`)
    .join('\n')

  const systemPrompt = `你是一個專業的客戶服務助理，擅長分析和彙整對話內容。
請用繁體中文回答，並保持簡潔專業的風格。`

  const userPrompt = `以下是關於客戶「${customerName}」的內部 Slack 討論記錄。
請幫我彙整成以下格式：

1. **摘要**：用 2-3 句話總結這段對話的主要內容
2. **重點事項**：列出 3-5 個關鍵討論點
3. **待辦事項**：如果有提到需要執行的事項，請列出

---
對話記錄：
${conversationText}
---

請以 JSON 格式回覆：
{
  "summary": "摘要內容",
  "keyPoints": ["重點1", "重點2", ...],
  "actionItems": ["待辦1", "待辦2", ...]
}

只回覆 JSON，不要其他文字。`

  const response = await chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], {
    maxTokens: 1500,
    temperature: 0.3,
  })

  try {
    // 嘗試解析 JSON 回應
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        summary: parsed.summary || '',
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      }
    }
  } catch (e) {
    console.error('Failed to parse LLM response:', e)
  }

  // 如果解析失敗，返回原始回應作為摘要
  return {
    summary: response,
    keyPoints: [],
    actionItems: [],
  }
}

/**
 * 測試 vLLM 連線
 */
export async function testConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${VLLM_BASE_URL}/v1/models`)
    return response.ok
  } catch {
    return false
  }
}

/**
 * Slack 訊息分類結果
 */
export interface MessageClassification {
  categories: string[]           // 分類 ID 列表
  importance: 'high' | 'medium' | 'low'
  summary: string               // 一句話摘要
  actionRequired: boolean       // 是否需要後續行動
  keywords: string[]            // 關鍵詞
}

/**
 * 分類單則 Slack 訊息
 */
export async function classifySlackMessage(
  message: {
    channel: string
    user: string
    text: string
    timestamp: string
  }
): Promise<MessageClassification> {
  const config = await getClassificationConfig()

  // 先用規則判斷優先級
  const rulePriority = evaluatePriorityRules(message.text, message.channel, config)

  // 如果 LLM 未啟用，使用關鍵字分類
  if (!config.llmSettings.enabled) {
    return classifyByKeywords(message.text, message.channel, config, rulePriority)
  }

  const categoryPrompt = buildCategoryPrompt(config)
  const importancePrompt = buildImportancePrompt(config)

  const systemPrompt = `你是一個 Slack 訊息分類助手。請分析訊息並判斷分類和重要性。用繁體中文回答。`

  const userPrompt = `分析以下 Slack 訊息：

頻道: ${message.channel}
發送者: ${message.user}
時間: ${message.timestamp}
內容: ${message.text}

## 可用分類（可多選）
${categoryPrompt}

## 重要性
${importancePrompt}

回覆 JSON 格式：
{
  "categories": ["分類ID"],
  "importance": "high|medium|low",
  "summary": "20字內摘要",
  "actionRequired": true或false,
  "keywords": ["關鍵詞"]
}

只回覆 JSON。`

  // 取得 LLM 設定
  const llmConfig = await getLLMConfig()
  const temperature = config.llmSettings.temperature ?? llmConfig.defaultTemperature

  try {
    const response = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], {
      maxTokens: 500,
      temperature,
      baseUrl: llmConfig.primary.baseUrl,
      model: llmConfig.primary.model,
      apiKey: llmConfig.primary.apiKey,
    })

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])

      // 如果規則有判斷結果，優先使用規則的結果
      const finalImportance = rulePriority || (
        ['high', 'medium', 'low'].includes(parsed.importance) ? parsed.importance : 'medium'
      )

      return {
        categories: Array.isArray(parsed.categories) ? parsed.categories : ['未分類'],
        importance: finalImportance,
        summary: parsed.summary || '',
        actionRequired: Boolean(parsed.actionRequired),
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      }
    }
  } catch (e) {
    console.error('Failed to parse classification response:', e)

    // LLM 失敗時，如果設定允許，退回關鍵字判斷
    if (config.llmSettings.fallbackToKeywords) {
      return classifyByKeywords(message.text, message.channel, config, rulePriority)
    }
  }

  return {
    categories: ['未分類'],
    importance: rulePriority || 'medium',
    summary: '',
    actionRequired: false,
    keywords: [],
  }
}

/**
 * 使用關鍵字進行分類（不使用 LLM）
 */
function classifyByKeywords(
  text: string,
  channel: string,
  config: SlackClassificationConfig,
  rulePriority: 'high' | 'medium' | 'low' | null
): MessageClassification {
  const matchedCategories: string[] = []
  const keywords: string[] = []

  const lowerText = text.toLowerCase()

  for (const category of config.categories) {
    if (!category.enabled) continue

    for (const keyword of category.keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        if (!matchedCategories.includes(category.id)) {
          matchedCategories.push(category.id)
        }
        if (!keywords.includes(keyword)) {
          keywords.push(keyword)
        }
      }
    }
  }

  return {
    categories: matchedCategories.length > 0 ? matchedCategories : ['未分類'],
    importance: rulePriority || 'medium',
    summary: text.slice(0, 30) + (text.length > 30 ? '...' : ''),
    actionRequired: rulePriority === 'high',
    keywords,
  }
}

/**
 * 從 timestamp 取得日期字串 (YYYY-MM-DD)
 */
function getDateFromTimestamp(timestamp: string): string {
  // timestamp 可能是 Slack 格式 (1234567890.123456) 或 ISO 格式
  let date: Date
  if (timestamp.includes('.') && !timestamp.includes('T')) {
    // Slack 格式：秒數.微秒
    date = new Date(parseFloat(timestamp) * 1000)
  } else {
    date = new Date(timestamp)
  }
  return date.toISOString().split('T')[0]
}

/**
 * 按日期分組訊息
 */
function groupMessagesByDate<T extends { timestamp: string }>(messages: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const msg of messages) {
    const date = getDateFromTimestamp(msg.timestamp)
    if (!groups.has(date)) {
      groups.set(date, [])
    }
    groups.get(date)!.push(msg)
  }
  return groups
}

/**
 * 批次分類 Slack 訊息
 */
export async function classifySlackMessages(
  messages: Array<{
    channel: string
    user: string
    text: string
    timestamp: string
  }>
): Promise<MessageClassification[]> {
  if (messages.length === 0) return []

  const config = await getClassificationConfig()
  const batchMode = config.llmSettings.batchMode || 'count'
  const batchSize = config.llmSettings.batchSize || 10

  // 如果 LLM 未啟用，使用關鍵字分類
  if (!config.llmSettings.enabled) {
    return messages.map(msg => {
      const rulePriority = evaluatePriorityRules(msg.text, msg.channel, config)
      return classifyByKeywords(msg.text, msg.channel, config, rulePriority)
    })
  }

  const categoryIds = config.categories.filter(c => c.enabled).map(c => c.id).join(', ')
  const categoryPrompt = buildCategoryPrompt(config)

  // 建立批次
  let batches: Array<{
    messages: typeof messages
    originalIndices: number[]
  }> = []

  if (batchMode === 'date') {
    // 按日期分組，保留原始索引以便還原順序
    const indexedMessages = messages.map((m, i) => ({ ...m, _originalIndex: i }))
    const dateGroups = groupMessagesByDate(indexedMessages)

    for (const [date, group] of dateGroups) {
      batches.push({
        messages: group,
        originalIndices: group.map(m => m._originalIndex),
      })
    }
  } else {
    // 按數量分組
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize)
      batches.push({
        messages: batch,
        originalIndices: batch.map((_, idx) => i + idx),
      })
    }
  }

  // 結果陣列，按原始順序
  const results: MessageClassification[] = new Array(messages.length)

  for (const { messages: batch, originalIndices } of batches) {
    // 先用規則判斷每則訊息的優先級
    const batchPriorities = batch.map(m => evaluatePriorityRules(m.text, m.channel, config))

    const dateInfo = batchMode === 'date'
      ? `（日期：${getDateFromTimestamp(batch[0].timestamp)}）`
      : ''

    const messagesText = batch.map((m, idx) =>
      `[${idx}] 頻道:${m.channel} | ${m.user} | ${m.timestamp}\n${m.text.slice(0, 200)}`
    ).join('\n\n')

    const systemPrompt = `你是 Slack 訊息分類助手。批次分析訊息並判斷分類和重要性。用繁體中文回答。`

    const userPrompt = `分析以下 ${batch.length} 則訊息${dateInfo}：

${messagesText}

## 分類選項
${categoryIds}

${categoryPrompt}

## 重要性
high(故障/客訴/資安), medium(一般工作), low(通知/閒聊)

回覆 JSON 陣列：
[{"index":0,"categories":["分類"],"importance":"等級","summary":"摘要","actionRequired":false}, ...]

只回覆 JSON 陣列。`

    // 取得 LLM 設定
    const llmConfig = await getLLMConfig()
    const temperature = config.llmSettings.temperature ?? llmConfig.defaultTemperature

    try {
      const response = await chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], {
        maxTokens: llmConfig.defaultMaxTokens,
        temperature,
        baseUrl: llmConfig.primary.baseUrl,
        model: llmConfig.primary.model,
        apiKey: llmConfig.primary.apiKey,
      })

      const jsonMatch = response.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (Array.isArray(parsed)) {
          for (let j = 0; j < parsed.length && j < batch.length; j++) {
            const item = parsed[j]
            // 規則優先級優先於 LLM 判斷
            const finalImportance = batchPriorities[j] || (
              ['high', 'medium', 'low'].includes(item.importance) ? item.importance : 'medium'
            )
            results[originalIndices[j]] = {
              categories: Array.isArray(item.categories) ? item.categories : ['未分類'],
              importance: finalImportance,
              summary: item.summary || '',
              actionRequired: Boolean(item.actionRequired),
              keywords: Array.isArray(item.keywords) ? item.keywords : [],
            }
          }
          continue
        }
      }
    } catch (e) {
      console.error('Failed to parse batch classification:', e)
    }

    // LLM 失敗時，使用關鍵字分類（如果設定允許）
    for (let j = 0; j < batch.length; j++) {
      if (results[originalIndices[j]]) continue // 已有結果

      const msg = batch[j]
      if (config.llmSettings.fallbackToKeywords) {
        results[originalIndices[j]] = classifyByKeywords(msg.text, msg.channel, config, batchPriorities[j])
      } else {
        results[originalIndices[j]] = {
          categories: ['未分類'],
          importance: batchPriorities[j] || 'medium',
          summary: '',
          actionRequired: false,
          keywords: [],
        }
      }
    }
  }

  return results
}

/**
 * Email 摘要結果
 */
export interface EmailSummary {
  title: string        // 摘要標題（20字內）
  summary: string      // 摘要內容（100字內）
  keyPoints: string[]  // 關鍵要點
  actionItems: string[] // 待辦事項（如有）
}

/**
 * 摘要 Email 內容
 */
export async function summarizeEmail(
  email: {
    from: string
    to: string
    cc?: string
    subject: string
    body: string
    date: Date
  }
): Promise<EmailSummary> {
  const llmConfig = await getLLMConfig()

  // 截斷過長的內容
  const truncatedBody = email.body.length > 3000
    ? email.body.substring(0, 3000) + '...(內容過長已截斷)'
    : email.body

  const systemPrompt = `你是一個專業的商務助理，擅長閱讀和摘要商務郵件。
請用繁體中文回答，並保持簡潔專業的風格。`

  const userPrompt = `請摘要以下商務郵件：

寄件人: ${email.from}
收件人: ${email.to}
${email.cc ? `CC: ${email.cc}` : ''}
主旨: ${email.subject}
日期: ${email.date.toLocaleString('zh-TW')}

---
${truncatedBody}
---

請提供：
1. title: 簡短標題（20字內，描述這封信的主要目的）
2. summary: 摘要內容（100字內，說明主要內容）
3. keyPoints: 關鍵要點列表（2-4 個重點）
4. actionItems: 如有需要後續處理的事項，請列出

回覆 JSON 格式：
{
  "title": "標題",
  "summary": "摘要",
  "keyPoints": ["要點1", "要點2"],
  "actionItems": ["待辦1"]
}

只回覆 JSON，不要其他文字。`

  try {
    const response = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], {
      maxTokens: 1000,
      temperature: 0.3,
      baseUrl: llmConfig.primary.baseUrl,
      model: llmConfig.primary.model,
      apiKey: llmConfig.primary.apiKey,
    })

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        title: parsed.title || email.subject.substring(0, 20),
        summary: parsed.summary || email.body.substring(0, 100),
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      }
    }
  } catch (e) {
    console.error('Failed to summarize email:', e)
  }

  // 回退：使用原始內容
  return {
    title: email.subject.substring(0, 20) || '(無主旨)',
    summary: email.body.substring(0, 100) || email.subject,
    keyPoints: [],
    actionItems: [],
  }
}

/**
 * 從 Email 內容識別客戶
 * 當 email 地址無法匹配客戶時，使用 LLM 分析 subject 和 body 來識別
 * 支援別名比對
 */
export async function identifyCustomerFromEmail(
  email: {
    subject: string
    body: string
  },
  customerNames: string[],
  customerAliases?: Map<string, string[]> // Map<客戶名稱, 別名列表>
): Promise<{
  customerId: string | null
  customerName: string | null
  confidence: 'high' | 'medium' | 'low'
  reason: string
}> {
  if (customerNames.length === 0) {
    return {
      customerId: null,
      customerName: null,
      confidence: 'low',
      reason: '沒有可用的客戶列表',
    }
  }

  const llmConfig = await getLLMConfig()

  // 截斷過長的內容
  const truncatedBody = email.body.length > 2000
    ? email.body.substring(0, 2000) + '...(內容過長已截斷)'
    : email.body

  // 建立客戶列表（包含別名）
  const customerListWithAliases = customerNames.map((name, i) => {
    const aliases = customerAliases?.get(name) || []
    const aliasText = aliases.length > 0 ? ` （別名：${aliases.join('、')}）` : ''
    return `${i + 1}. ${name}${aliasText}`
  }).join('\n')

  const systemPrompt = `你是一個專業的商務助理，擅長從郵件內容中識別相關客戶。
請用繁體中文回答。`

  const userPrompt = `請分析以下郵件，判斷這封信最可能與哪個客戶相關：

## 郵件主旨
${email.subject}

## 郵件內容
${truncatedBody}

## 可能的客戶列表（包含別名）
${customerListWithAliases}

請判斷：
1. 這封郵件最可能與哪個客戶相關？（必須從上述列表中選擇主要名稱，如果都不相關請回答 null）
2. 判斷的信心程度（high: 明確提到客戶名稱/別名或相關產品/專案, medium: 有間接線索, low: 不確定）
3. 判斷理由

回覆 JSON 格式：
{
  "customerName": "客戶主要名稱（非別名，必須完全匹配列表中的名稱）或 null",
  "confidence": "high|medium|low",
  "reason": "判斷理由（20字內）"
}

只回覆 JSON，不要其他文字。如果無法判斷或都不相關，customerName 請填 null。`

  try {
    const response = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], {
      maxTokens: 500,
      temperature: 0.2, // 低溫度確保一致性
      baseUrl: llmConfig.primary.baseUrl,
      model: llmConfig.primary.model,
      apiKey: llmConfig.primary.apiKey,
    })

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])

      // 驗證返回的客戶名稱是否在列表中
      const matchedName = parsed.customerName && customerNames.find(
        name => name === parsed.customerName || name.includes(parsed.customerName) || parsed.customerName.includes(name)
      )

      if (matchedName) {
        return {
          customerId: null, // 由呼叫者根據 customerName 查找
          customerName: matchedName,
          confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
          reason: parsed.reason || '',
        }
      }
    }
  } catch (e) {
    console.error('Failed to identify customer from email:', e)
  }

  return {
    customerId: null,
    customerName: null,
    confidence: 'low',
    reason: '無法識別',
  }
}

export default {
  chatCompletion,
  summarizeSlackConversation,
  extractSlackEvents,
  extractSlackEventsV2,
  classifySlackMessage,
  classifySlackMessages,
  summarizeEmail,
  identifyCustomerFromEmail,
  testConnection,
}
