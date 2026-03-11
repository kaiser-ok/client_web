// 專案獎金評估常數

// 外部成本分類
export const COST_CATEGORIES = [
  { value: 'LABOR', label: '勞務外包' },
  { value: 'HARDWARE', label: '硬體設備' },
  { value: 'LICENSE', label: '第三方軟體授權' },
  { value: 'CONSULTING', label: '諮詢顧問' },
  { value: 'OTHER', label: '其他' },
] as const

// 成員角色
export const MEMBER_ROLES = [
  { value: 'SALES', label: '業務部' },
  { value: 'MANAGEMENT', label: '管理部' },
  { value: 'PM', label: '專案經理' },
  { value: 'ENGINEER', label: '執行成員' },
] as const

// 按專案類型的預設分配比例
export const DEFAULT_ALLOCATION: Record<string, Record<string, number>> = {
  // 系統專案 (PURCHASE, LICENSE, SUBSCRIPTION)
  SYSTEM: {
    SALES: 15,
    MANAGEMENT: 5,
    PM: 15,
    ENGINEER: 65,
  },
  // 維運 (MA)
  MA: {
    SALES: 15,
    MANAGEMENT: 5,
    PM: 5,
    ENGINEER: 75,
  },
}

// 保固攤分預設模板
export const WARRANTY_SPREAD_TEMPLATES: Record<number, { label: string; pcts: number[] }> = {
  1: { label: '1 年（不攤分）', pcts: [100] },
  2: { label: '2 年', pcts: [80, 20] },
  3: { label: '3 年', pcts: [70, 15, 15] },
  4: { label: '4 年', pcts: [60, 15, 15, 10] },
  5: { label: '5 年', pcts: [50, 15, 15, 10, 10] },
}

// 保固年度（yearOffset >= 1）預設分配比例
// 業務(SALES)不帶入保固年份，RD 預設 30%
export const WARRANTY_YEAR_DEFAULT_ALLOCATION: Record<string, number> = {
  ENGINEER: 50,
  PM: 10,
  MANAGEMENT: 10,
  // SALES 不帶入，預設 0
}
export const WARRANTY_YEAR_RD_DEFAULT_PCT = 30

// 評估狀態
export const EVAL_STATUS = [
  { value: 'DRAFT', label: '草稿', color: 'default' },
  { value: 'EVALUATED', label: '已評估', color: 'processing' },
  { value: 'APPROVED', label: '已核准', color: 'success' },
  { value: 'PAID', label: '已發放', color: 'purple' },
] as const

// 評分調整範圍
export const SCORE_ADJUSTMENTS = {
  importance: { min: 0, max: 20, label: '專案重要性', description: '對公司重要的專案加分 (0~20%)' },
  quality: { min: -10, max: 10, label: '專案質量', description: '根據創新/客訴進行加減分 (-10~+10%)' },
  efficiency: { min: -10, max: 10, label: '專案時效', description: '根據提早/延遲交付加減分 (-10~+10%)' },
} as const
