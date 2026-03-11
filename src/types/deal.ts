export type DealType = 'PURCHASE' | 'MA' | 'LICENSE' | 'SUBSCRIPTION'

export interface ProductLine {
  name: string
  description: string | null
  quantity: number
  unitPrice: number
  subtotal: number
}

export interface Deal {
  id: string
  customerId: string
  name: string
  projectName: string | null     // 專案名稱（Odoo project_name）
  clientOrderRef: string | null  // 客戶參照（Odoo client_order_ref）
  projectType: string | null     // 專案類型（Odoo project_type）
  type: DealType
  amount: number | null
  products: string | null
  productsJson: ProductLine[] | null  // 產品明細 JSON
  salesRep: string | null
  closedAt: Date
  startDate: Date | null
  endDate: Date | null
  autoRenew: boolean
  remindDays: number | null
  source: 'MANUAL' | 'ODOO'
  odooId: number | null
  notes: string | null
  attachments: string[]
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export interface CreateDealInput {
  customerId: string
  name: string
  type?: DealType
  amount?: number
  products?: string
  salesRep?: string
  closedAt: Date
  startDate?: Date
  endDate?: Date
  autoRenew?: boolean
  remindDays?: number
  notes?: string
  attachments?: string[]
}

export interface UpdateDealInput {
  name?: string
  type?: DealType
  amount?: number
  products?: string
  salesRep?: string
  closedAt?: Date
  startDate?: Date | null
  endDate?: Date | null
  autoRenew?: boolean
  remindDays?: number | null
  notes?: string
  attachments?: string[]
}

export const DEAL_TYPES: { value: DealType; label: string }[] = [
  { value: 'PURCHASE', label: '單次購買' },
  { value: 'MA', label: '維護合約' },
  { value: 'LICENSE', label: '軟體授權' },
  { value: 'SUBSCRIPTION', label: '訂閱服務' },
]

// Odoo project types
export const PROJECT_TYPES: { value: string; label: string }[] = [
  { value: 'CHT(共契)', label: 'CHT(共契)' },
  { value: 'VOIP', label: 'VOIP' },
  { value: '智慧網管', label: '智慧網管' },
  { value: '網通設備', label: '網通設備' },
  { value: '維護案_SNM', label: '維護案_SNM' },
  { value: '維護案_VOIP', label: '維護案_VOIP' },
  { value: '維護案_智慧網管', label: '維護案_智慧網管' },
  { value: '維護案_其他', label: '維護案_其他' },
  { value: '其他', label: '其他' },
]

export function getDealStatus(deal: Deal): 'active' | 'expiring' | 'expired' | null {
  if (!deal.endDate) return null

  const now = new Date()
  const endDate = new Date(deal.endDate)
  const daysUntilEnd = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntilEnd < 0) return 'expired'
  if (daysUntilEnd <= (deal.remindDays || 30)) return 'expiring'
  return 'active'
}
