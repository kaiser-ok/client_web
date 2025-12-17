export type DealType = 'PURCHASE' | 'MA' | 'LICENSE' | 'SUBSCRIPTION'

export interface Deal {
  id: string
  customerId: string
  name: string
  type: DealType
  amount: number | null
  products: string | null
  salesRep: string | null
  closedAt: Date
  startDate: Date | null
  endDate: Date | null
  autoRenew: boolean
  remindDays: number | null
  source: 'MANUAL' | 'ODOO'
  odooId: string | null
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

export function getDealStatus(deal: Deal): 'active' | 'expiring' | 'expired' | null {
  if (!deal.endDate) return null

  const now = new Date()
  const endDate = new Date(deal.endDate)
  const daysUntilEnd = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntilEnd < 0) return 'expired'
  if (daysUntilEnd <= (deal.remindDays || 30)) return 'expiring'
  return 'active'
}
