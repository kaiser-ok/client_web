import { Activity } from './activity'
import { OpenItem } from './open-item'

// ============================================
// Partner Role Types
// ============================================

export type PartnerRoleType = 'DEALER' | 'END_USER' | 'SUPPLIER'

export interface PartnerRole {
  id: string
  partnerId: string
  role: PartnerRoleType
  isPrimary: boolean
  metadata?: Record<string, unknown> | null // 角色特定資料 (如 salesRep, territory)
  createdAt: Date
  updatedAt: Date
}

// ============================================
// Partner Types
// ============================================

export type PartnerSource = 'MANUAL' | 'ODOO'

export interface PartnerBasic {
  id: string
  name: string
}

export interface Partner {
  id: string
  name: string
  aliases: string[]           // 別名（用於匯入時比對）
  contact: string | null
  phone: string | null
  email: string | null
  website: string | null
  jiraLabel: string | null    // Jira label (e.g., "客戶:ABC公司")
  odooId: number | null       // Odoo res_partner.id
  odooTags: string[]          // Odoo 訂單標籤（用於比對 Jira labels）
  slackChannelId: string | null // Slack 頻道 ID
  source: PartnerSource
  notes: string | null
  isActive: boolean
  parentId: string | null     // 母公司 ID
  createdAt: Date
  updatedAt: Date
}

export interface ProjectBasic {
  id: string
  name: string
  status: string
  type?: string | null
  startDate: Date | null
  endDate: Date | null
}

export interface DealBasic {
  id: string
  name: string
  type: string
  amount: number | null
  closedAt: Date
  startDate: Date | null
  endDate: Date | null
}

export interface PartnerWithRelations extends Partner {
  roles?: PartnerRole[]
  parent?: PartnerBasic | null
  subsidiaries?: PartnerBasic[]
  projects?: ProjectBasic[]
  activities?: Activity[]
  openItems?: OpenItem[]
  deals?: DealBasic[]
  _count?: {
    roles: number
    activities: number
    openItems: number
    subsidiaries: number
    deals: number
    projects: number
    files: number
    technicalNotes: number
  }
}

// ============================================
// Input Types
// ============================================

export interface CreatePartnerInput {
  name: string
  aliases?: string[]
  contact?: string
  phone?: string
  email?: string
  website?: string
  jiraLabel?: string
  odooId?: number
  odooTags?: string[]
  slackChannelId?: string
  source?: PartnerSource
  notes?: string
  isActive?: boolean
  parentId?: string | null
  roles?: CreatePartnerRoleInput[]
}

export interface UpdatePartnerInput extends Partial<CreatePartnerInput> {}

export interface CreatePartnerRoleInput {
  role: PartnerRoleType
  isPrimary?: boolean
  metadata?: Record<string, unknown>
}

export interface UpdatePartnerRoleInput {
  isPrimary?: boolean
  metadata?: Record<string, unknown>
}

// ============================================
// Query Types
// ============================================

export interface PartnerQueryParams {
  roles?: PartnerRoleType[]   // 篩選角色
  search?: string             // 搜尋名稱/別名
  isActive?: boolean          // 篩選啟用狀態
  hasOdooId?: boolean         // 是否有 Odoo ID
  parentId?: string | null    // 篩選母公司
  limit?: number
  offset?: number
}

// ============================================
// Legacy Compatibility (暫時保留，逐步移除)
// ============================================

/** @deprecated Use Partner instead */
export type Customer = Partner & {
  role: string
  salesRep: string | null
  partner: string | null
}

/** @deprecated Use PartnerBasic instead */
export type CustomerBasic = PartnerBasic

/** @deprecated Use PartnerWithRelations instead */
export type CustomerWithRelations = PartnerWithRelations

/** @deprecated Use CreatePartnerInput instead */
export type CreateCustomerInput = CreatePartnerInput & {
  role?: string
  salesRep?: string
  partner?: string
}

/** @deprecated Use UpdatePartnerInput instead */
export type UpdateCustomerInput = Partial<CreateCustomerInput>
