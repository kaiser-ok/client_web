/**
 * Slack 訊息分類設定類型
 */

// 分類定義
export interface CategoryDefinition {
  id: string
  label: string
  description: string
  keywords: string[]
  enabled: boolean
}

// 優先級規則
export interface PriorityRule {
  id: string
  name: string
  description: string
  priority: 'high' | 'medium' | 'low'
  conditions: PriorityCondition[]
  enabled: boolean
  order: number  // 規則優先順序，數字越小越先評估
}

// 優先級條件
export interface PriorityCondition {
  type: 'keyword' | 'category' | 'channel' | 'user' | 'time_range'
  operator: 'contains' | 'equals' | 'starts_with' | 'regex' | 'in_list'
  value: string | string[]
  caseSensitive?: boolean
}

// 完整的分類設定
export interface SlackClassificationConfig {
  version: string
  updatedAt: string
  updatedBy: string

  // 分類定義
  categories: CategoryDefinition[]

  // 優先級規則（按 order 排序，先匹配者優先）
  priorityRules: PriorityRule[]

  // 自動過濾規則（符合條件的訊息直接標記為低優先）
  autoFilterRules: {
    enabled: boolean
    patterns: string[]  // 正則表達式
  }

  // Slack 專屬 LLM 設定 (使用共用 LLM 設定)
  llmSettings: {
    enabled: boolean              // 是否啟用 LLM 分類
    batchMode: 'count' | 'date'   // 批次模式：按數量 或 按日期
    batchSize: number             // 按數量時的批次大小
    temperature?: number          // 覆蓋共用設定的 temperature (可選)
    fallbackToKeywords: boolean   // LLM 失敗時退回關鍵字判斷
  }
}

// 預設設定
export const DEFAULT_CLASSIFICATION_CONFIG: SlackClassificationConfig = {
  version: '1.0.0',
  updatedAt: new Date().toISOString(),
  updatedBy: 'system',

  categories: [
    {
      id: 'technical',
      label: '技術討論',
      description: '程式開發、MR/PR審查、API設計、資料庫討論',
      keywords: ['MR', 'PR', 'merge', 'commit', 'deploy', 'bug', 'fix', 'debug', 'schema', 'API', 'DB', '資料庫', '程式', 'code', 'git', 'jira', '開發'],
      enabled: true,
    },
    {
      id: 'incident',
      label: '故障處理',
      description: '系統當機、服務異常、連線問題',
      keywords: ['當機', '故障', '異常', '連不上', '失連', '掛了', '掛掉', '不通', '斷線', 'error', 'crash', 'down', '無法連線'],
      enabled: true,
    },
    {
      id: 'support',
      label: '客戶報修',
      description: '客戶來電報修、問題反應、技術支援',
      keywords: ['報修', '客訴', '來電', '反應', '回報'],
      enabled: true,
    },
    {
      id: 'business',
      label: '業務進度',
      description: '報價、合約、驗收、標案、客戶需求',
      keywords: ['報價', '合約', '驗收', '開標', '投標', '標案', '拜訪', '會議', '簡報', '客戶', '需求', '專案', '訂單'],
      enabled: true,
    },
    {
      id: 'maintenance',
      label: '維護作業',
      description: '系統升級、設定更新、排程維護',
      keywords: ['升級', '更新', '維護', '重開', '重啟', 'restart', 'reboot', '備份', 'backup', '排程'],
      enabled: true,
    },
    {
      id: 'security',
      label: '資安相關',
      description: '資安事件、漏洞通報、憑證管理',
      keywords: ['資安', '漏洞', 'CVE', '攻擊', '入侵', '憑證', 'certificate', 'SSL', 'TLS', 'HTTPS', '防火牆', 'firewall', 'ISMS'],
      enabled: true,
    },
    {
      id: 'logistics',
      label: '物流寄送',
      description: '設備寄送、收件地址、維修品',
      keywords: ['寄送', '收件', '地址', '維修品', '取貨', '出貨', '到貨', '快遞'],
      enabled: true,
    },
    {
      id: 'speedtest',
      label: '測速系統',
      description: '測速功能、節點測試、SP系統',
      keywords: ['測速', '節點', '群組測試', 'trx', 'SP', '量測', 'speedtest'],
      enabled: true,
    },
    {
      id: 'training',
      label: '內部訓練',
      description: '人員培訓、證照考試',
      keywords: ['訓練', '證照', '考試', '課程', '教育訓練'],
      enabled: true,
    },
    {
      id: 'admin',
      label: '行政事務',
      description: 'ISO稽核、資產盤點、人事',
      keywords: ['行政', 'ISO', '稽核', '資產', '盤點', '請假', '報帳'],
      enabled: true,
    },
    {
      id: 'system_notice',
      label: '系統通知',
      description: '自動通知、加入頻道',
      keywords: ['已加入頻道', '已加入群組', '已離開頻道'],
      enabled: true,
    },
    {
      id: 'casual',
      label: '非工作',
      description: '閒聊、零食分享',
      keywords: ['零食', '點心', '分享', '享用', '八卦', '休閒'],
      enabled: true,
    },
  ],

  priorityRules: [
    // 高優先級規則
    {
      id: 'rule_incident_keywords',
      name: '故障關鍵字',
      description: '包含當機、故障、異常等關鍵字',
      priority: 'high',
      conditions: [
        { type: 'keyword', operator: 'contains', value: ['當機', '故障', '緊急', '無法連線', '連不上', '失連', '掛了', '掛掉', '不通', '斷線', '異常', 'error', 'crash', 'down'] }
      ],
      enabled: true,
      order: 1,
    },
    {
      id: 'rule_support_keywords',
      name: '客戶報修',
      description: '包含報修、客訴等關鍵字',
      priority: 'high',
      conditions: [
        { type: 'keyword', operator: 'contains', value: ['報修', '客訴'] }
      ],
      enabled: true,
      order: 2,
    },
    {
      id: 'rule_security_keywords',
      name: '資安事件',
      description: '包含資安、漏洞、攻擊等關鍵字',
      priority: 'high',
      conditions: [
        { type: 'keyword', operator: 'contains', value: ['資安事件', '漏洞', 'CVE', '攻擊', '入侵'] }
      ],
      enabled: true,
      order: 3,
    },
    {
      id: 'rule_deadline',
      name: '重要截止日',
      description: '包含驗收、截止等關鍵字',
      priority: 'high',
      conditions: [
        { type: 'keyword', operator: 'contains', value: ['驗收', '截止', '到期', 'deadline'] }
      ],
      enabled: true,
      order: 4,
    },
    {
      id: 'rule_fae_channel',
      name: 'FAE 頻道優先',
      description: 'FAE 客戶關懷部頻道的訊息提高優先級',
      priority: 'high',
      conditions: [
        { type: 'channel', operator: 'contains', value: 'fae_客戶關懷部' },
        { type: 'keyword', operator: 'contains', value: ['來電', '老師', '反應'] }
      ],
      enabled: true,
      order: 5,
    },

    // 低優先級規則
    {
      id: 'rule_system_notice',
      name: '系統通知',
      description: '加入/離開頻道等自動訊息',
      priority: 'low',
      conditions: [
        { type: 'keyword', operator: 'contains', value: ['已加入頻道', '已加入群組', '已離開頻道'] }
      ],
      enabled: true,
      order: 100,
    },
    {
      id: 'rule_casual',
      name: '非工作內容',
      description: '零食分享、閒聊等',
      priority: 'low',
      conditions: [
        { type: 'keyword', operator: 'contains', value: ['零食', '點心', '分享', '享用', '八卦'] }
      ],
      enabled: true,
      order: 101,
    },
    {
      id: 'rule_short_reply',
      name: '簡短回覆',
      description: '好、OK、收到等簡短確認',
      priority: 'low',
      conditions: [
        { type: 'keyword', operator: 'regex', value: '^(好|OK|ok|收到|了解|謝謝|感謝|:ok_hand:|:thumbsup:)$' }
      ],
      enabled: true,
      order: 102,
    },
  ],

  autoFilterRules: {
    enabled: true,
    patterns: [
      '^<@[A-Z0-9]+> 已加入(頻道|群組)$',  // 加入頻道通知
      '^<@[A-Z0-9]+> 已離開頻道$',          // 離開頻道通知
      '^將此頻道設定為',                     // 頻道設定通知
    ],
  },

  llmSettings: {
    enabled: true,
    batchMode: 'count',
    batchSize: 10,
    fallbackToKeywords: true,
  },
}

// SystemConfig 的 key
export const SLACK_CLASSIFICATION_CONFIG_KEY = 'slack_classification_config'
