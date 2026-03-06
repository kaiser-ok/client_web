// 使用者角色
export type UserRole = 'SALES' | 'FINANCE' | 'SUPPORT' | 'RD' | 'ADMIN'

export const USER_ROLES: { value: UserRole; label: string }[] = [
  { value: 'ADMIN', label: '管理員' },
  { value: 'SALES', label: '業務' },
  { value: 'FINANCE', label: '財務' },
  { value: 'SUPPORT', label: '服務支援' },
  { value: 'RD', label: '研發' },
]

// 權限定義
export const PERMISSIONS = {
  // 成交案件金額 - 只有業務、財務、管理員可以看
  VIEW_DEAL_AMOUNT: ['ADMIN', 'SALES', 'FINANCE'],

  // 編輯成交案件 - 只有業務、財務、管理員可以
  EDIT_DEAL: ['ADMIN', 'SALES', 'FINANCE'],

  // 刪除成交案件 - 只有管理員可以
  DELETE_DEAL: ['ADMIN'],

  // 編輯專案 - 業務、財務、服務支援、管理員
  EDIT_PROJECT: ['ADMIN', 'SALES', 'FINANCE', 'SUPPORT'],

  // 刪除專案 - 業務、財務、管理員
  DELETE_PROJECT: ['ADMIN', 'SALES', 'FINANCE'],

  // 管理客戶 - 業務、管理員
  MANAGE_CUSTOMER: ['ADMIN', 'SALES'],

  // 建立報修 - 所有人
  CREATE_ISSUE: ['ADMIN', 'SALES', 'FINANCE', 'SUPPORT', 'RD'],

  // 查看報修 - 所有人
  VIEW_ISSUES: ['ADMIN', 'SALES', 'FINANCE', 'SUPPORT', 'RD'],

  // 報價單權限
  // 建立報價單 - 業務、財務、管理員
  CREATE_QUOTATION: ['ADMIN', 'SALES', 'FINANCE'],
  // 查看所有報價單（含他人的草稿）- 財務、管理員
  VIEW_ALL_QUOTATIONS: ['ADMIN', 'FINANCE'],
  // 編輯報價單 - 業務只能編輯自己的，財務和管理員可編輯所有
  EDIT_QUOTATION: ['ADMIN', 'SALES', 'FINANCE'],
  // 刪除報價單 - 業務只能刪除自己的，管理員可刪除所有
  DELETE_QUOTATION: ['ADMIN', 'SALES', 'FINANCE'],

  // 管理產品優先順序 - 財務、管理員
  MANAGE_PRODUCT_PRIORITY: ['ADMIN', 'FINANCE'],

  // 合併客戶 - 僅管理員
  MERGE_PARTNER: ['ADMIN'],

  // 獎金評估 - 管理員可完整操作，業務/財務可查看
  VIEW_BONUS: ['ADMIN', 'SALES', 'FINANCE', 'SUPPORT', 'RD'],
  EDIT_BONUS: ['ADMIN', 'FINANCE'],
  APPROVE_BONUS: ['ADMIN'],
} as const

// 檢查使用者是否有權限
export function hasPermission(userRole: string | undefined, permission: keyof typeof PERMISSIONS): boolean {
  if (!userRole) return false
  const allowedRoles = PERMISSIONS[permission] as readonly string[]
  return allowedRoles.includes(userRole)
}

// 取得角色標籤
export function getRoleLabel(role: string): string {
  return USER_ROLES.find(r => r.value === role)?.label || role
}
