/**
 * Slack 訊息分類定義
 * 用於 LLM 分類和標記
 */

// 訊息分類
export const MESSAGE_CATEGORIES = {
  // 主要分類
  TECHNICAL: {
    id: 'technical',
    label: '技術討論',
    description: '程式開發、MR/PR審查、API設計、資料庫討論、系統架構',
    keywords: ['MR', 'PR', 'merge', 'commit', 'deploy', 'bug', 'fix', 'debug', 'schema', 'API', 'DB', '資料庫', '程式', 'code', 'git', 'jira', '開發'],
  },
  INCIDENT: {
    id: 'incident',
    label: '故障處理',
    description: '系統當機、服務異常、連線問題、緊急故障',
    keywords: ['當機', '故障', '異常', '連不上', '失連', '掛了', '掛掉', '不通', '斷線', 'error', 'crash', 'down', '無法連線'],
  },
  SUPPORT: {
    id: 'support',
    label: '客戶報修',
    description: '客戶來電報修、問題反應、技術支援請求',
    keywords: ['報修', '客訴', '來電', '反應', '回報'],
  },
  BUSINESS: {
    id: 'business',
    label: '業務進度',
    description: '報價、合約、驗收、標案、客戶需求、專案進度',
    keywords: ['報價', '合約', '驗收', '開標', '投標', '標案', '拜訪', '會議', '簡報', '客戶', '需求', '專案', '訂單'],
  },
  MAINTENANCE: {
    id: 'maintenance',
    label: '維護作業',
    description: '系統升級、設定更新、排程維護、備份作業',
    keywords: ['升級', '更新', '維護', '重開', '重啟', 'restart', 'reboot', '備份', 'backup', '排程'],
  },
  SECURITY: {
    id: 'security',
    label: '資安相關',
    description: '資安事件、漏洞通報、憑證管理、防火牆設定',
    keywords: ['資安', '漏洞', 'CVE', '攻擊', '入侵', '憑證', 'certificate', 'SSL', 'TLS', 'HTTPS', '防火牆', 'firewall', 'ISMS'],
  },
  LOGISTICS: {
    id: 'logistics',
    label: '物流寄送',
    description: '設備寄送、收件地址、維修品收發',
    keywords: ['寄送', '收件', '地址', '維修品', '取貨', '出貨', '到貨', '快遞'],
  },
  SPEEDTEST: {
    id: 'speedtest',
    label: '測速系統',
    description: '測速功能開發、節點測試、群組測試、SP系統',
    keywords: ['測速', '節點', '群組測試', 'trx', 'SP', '量測', 'speedtest'],
  },
  TRAINING: {
    id: 'training',
    label: '內部訓練',
    description: '人員培訓、證照考試、教育訓練',
    keywords: ['訓練', '證照', '考試', '課程', '教育訓練'],
  },
  ADMIN: {
    id: 'admin',
    label: '行政事務',
    description: 'ISO稽核、資產盤點、人事行政、會議安排',
    keywords: ['行政', 'ISO', '稽核', '資產', '盤點', '請假', '報帳'],
  },
  SYSTEM_NOTICE: {
    id: 'system_notice',
    label: '系統通知',
    description: '自動通知、加入頻道、bot訊息',
    keywords: ['已加入頻道', '已加入群組', '已離開頻道'],
    autoFilter: true, // 可自動過濾
  },
  CASUAL: {
    id: 'casual',
    label: '非工作',
    description: '閒聊、零食分享、非工作相關',
    keywords: ['零食', '點心', '分享', '享用', '八卦', '休閒'],
    lowPriority: true, // 低優先
  },
} as const

// 重要性等級
export const IMPORTANCE_LEVELS = {
  HIGH: {
    id: 'high',
    label: '高',
    description: '需立即處理或追蹤，可能影響客戶或系統運作',
    criteria: [
      '系統故障、當機、服務中斷',
      '客戶緊急報修或客訴',
      '資安事件或漏洞通報',
      '重要驗收或截止日期',
      '影響營收的業務事項',
    ],
  },
  MEDIUM: {
    id: 'medium',
    label: '中',
    description: '一般工作事項，需要記錄但非緊急',
    criteria: [
      '技術討論和開發進度',
      '例行維護作業',
      '一般客戶需求',
      '專案進度更新',
    ],
  },
  LOW: {
    id: 'low',
    label: '低',
    description: '可忽略或僅供參考',
    criteria: [
      '系統自動通知',
      '閒聊和非工作內容',
      '簡短確認回覆（好、OK、收到）',
    ],
  },
} as const

// LLM 分類 Prompt 模板
export const CLASSIFICATION_PROMPT = `你是一個 Slack 訊息分類助手。請分析以下訊息，判斷其分類和重要性。

## 可用分類
${Object.values(MESSAGE_CATEGORIES).map(c => `- ${c.id}: ${c.label} - ${c.description}`).join('\n')}

## 重要性等級
- high: 高優先 - 需立即處理或追蹤（故障、客訴、資安、重要截止日）
- medium: 中優先 - 一般工作事項（技術討論、維護、一般需求）
- low: 低優先 - 可忽略（系統通知、閒聊、簡短回覆）

## 輸出格式
請以 JSON 格式回覆：
{
  "categories": ["分類1", "分類2"],  // 可多選
  "importance": "high|medium|low",
  "summary": "一句話摘要（20字內）",
  "action_required": true|false,  // 是否需要後續行動
  "keywords": ["關鍵詞1", "關鍵詞2"]  // 提取的關鍵詞
}

## 訊息內容
頻道: {channel}
發送者: {user}
時間: {timestamp}
內容: {text}
`

// 批次分類 Prompt
export const BATCH_CLASSIFICATION_PROMPT = `你是一個 Slack 訊息分類助手。請分析以下多則訊息，為每則訊息判斷分類和重要性。

## 可用分類
${Object.values(MESSAGE_CATEGORIES).map(c => `- ${c.id}: ${c.label}`).join('\n')}

## 重要性等級
- high: 故障、客訴、資安、重要截止日
- medium: 技術討論、維護、一般需求
- low: 系統通知、閒聊、簡短回覆

## 輸出格式
請以 JSON 陣列格式回覆，每則訊息一個物件：
[
  {
    "index": 0,
    "categories": ["分類1"],
    "importance": "medium",
    "summary": "摘要",
    "action_required": false
  },
  ...
]

## 訊息列表
{messages}
`

// 匯出類型
export type CategoryId = keyof typeof MESSAGE_CATEGORIES
export type ImportanceLevel = keyof typeof IMPORTANCE_LEVELS
