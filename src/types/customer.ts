import { Activity } from './activity'
import { OpenItem } from './open-item'

export interface CustomerBasic {
  id: string
  name: string
}

export interface Customer {
  id: string
  name: string
  aliases: string[]           // 客戶別名（用於匯入時比對）
  role: string                // DEALER（經銷商）、END_USER（最終用戶）、SUPPLIER（供應商）
  contact: string | null
  phone: string | null
  email: string | null
  salesRep: string | null
  partner: string | null      // 經銷商
  jiraLabel: string | null    // Jira label (e.g., "客戶:ABC公司")
  parentId: string | null     // 母公司 ID
  odooId: number | null       // Odoo res_partner.id
  odooTags: string[]          // Odoo 訂單標籤（用於比對 Jira labels）
  slackChannelId: string | null // Slack 頻道 ID
  notes: string | null        // 備註
  source: string              // MANUAL, ODOO
  createdAt: Date
  updatedAt: Date
}

export interface ProjectBasic {
  id: string
  name: string
  status: string
  startDate: Date | null
  endDate: Date | null
}

export interface CustomerWithRelations extends Customer {
  parent?: CustomerBasic | null
  subsidiaries?: CustomerBasic[]
  projects?: ProjectBasic[]
  activities?: Activity[]
  openItems?: OpenItem[]
  _count?: {
    activities: number
    openItems: number
    subsidiaries: number
    deals: number
    projects: number
  }
}

export interface CreateCustomerInput {
  name: string
  aliases?: string[]
  role?: string
  contact?: string
  phone?: string
  email?: string
  salesRep?: string
  partner?: string
  parentId?: string | null
  notes?: string
}

export interface UpdateCustomerInput extends Partial<CreateCustomerInput> {}
