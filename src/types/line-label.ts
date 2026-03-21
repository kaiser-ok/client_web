/**
 * LINE 頻道標籤類型定義
 */

// 標籤定義
export interface LineLabelDefinition {
  id: string
  label: string
  description: string
  color: string      // antd Tag color
  icon: string       // ant-design icon name
  enabled: boolean
  autoApply: boolean // LLM 可否自動套用
  keywords: string[] // 關鍵字觸發
  order: number      // 排序
}

// LLM 設定
export interface LineLabelLLMSettings {
  enabled: boolean
  debounceSeconds: number    // BullMQ delay
  minMessages: number        // 最少幾則才分析
  analysisWindow: number     // 分析窗口（分鐘）
  temperature: number
  autoApplyThreshold: number // 信心度門檻 0-1
}

// 完整設定
export interface LineLabelConfig {
  version: string
  updatedAt: string
  updatedBy: string
  labels: LineLabelDefinition[]
  llmSettings: LineLabelLLMSettings
}

// 頻道上的標籤（來自 DB）
export interface LineChannelLabelData {
  id: string
  channelId: string
  labelId: string
  source: string       // "manual" | "llm"
  confidence: number | null
  appliedBy: string | null
  appliedAt: string
  note: string | null
}

// 預設標籤
export const DEFAULT_LINE_LABELS: LineLabelDefinition[] = [
  {
    id: 'follow_up',
    label: '追蹤',
    description: '需要後續追蹤處理',
    color: 'blue',
    icon: 'FlagOutlined',
    enabled: true,
    autoApply: true,
    keywords: ['追蹤', '待確認', '等回覆', '待回覆'],
    order: 1,
  },
  {
    id: 'p1',
    label: 'P1 故障',
    description: '高優先級故障或緊急問題',
    color: 'red',
    icon: 'AlertOutlined',
    enabled: true,
    autoApply: true,
    keywords: ['當機', '故障', '緊急', '斷線', '無法連線', '失連', '掛了', '不通'],
    order: 2,
  },
  {
    id: 'p2',
    label: 'P2 問題',
    description: '中優先級問題或異常',
    color: 'orange',
    icon: 'ExclamationCircleOutlined',
    enabled: true,
    autoApply: true,
    keywords: ['異常', '不穩定', '變慢', '偶爾', '間歇'],
    order: 3,
  },
  {
    id: 'complaint',
    label: '抱怨',
    description: '客戶不滿或抱怨',
    color: 'pink',
    icon: 'FrownOutlined',
    enabled: true,
    autoApply: true,
    keywords: ['抱怨', '不滿', '客訴', '投訴', '太慢', '太久', '等很久'],
    order: 4,
  },
  {
    id: 'resolved',
    label: '已完成',
    description: '問題已解決或任務已完成',
    color: 'green',
    icon: 'CheckCircleOutlined',
    enabled: true,
    autoApply: true,
    keywords: ['已解決', '已完成', '已修復', '沒問題了', '正常了', '好了'],
    order: 5,
  },
]

// 預設 LLM 設定
export const DEFAULT_LLM_SETTINGS: LineLabelLLMSettings = {
  enabled: true,
  debounceSeconds: 120,
  minMessages: 3,
  analysisWindow: 180,   // 180 分鐘
  temperature: 0.3,
  autoApplyThreshold: 0.8,
}

// 預設完整設定
export const DEFAULT_LINE_LABEL_CONFIG: LineLabelConfig = {
  version: '1.0.0',
  updatedAt: new Date().toISOString(),
  updatedBy: 'system',
  labels: DEFAULT_LINE_LABELS,
  llmSettings: DEFAULT_LLM_SETTINGS,
}

// SystemConfig key
export const LINE_LABEL_CONFIG_KEY = 'line_label_config'
