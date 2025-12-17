import { Activity } from './activity'
import { OpenItem } from './open-item'

export interface Customer {
  id: string
  name: string
  contact: string | null
  phone: string | null
  email: string | null
  salesRep: string | null
  jiraProject: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CustomerWithRelations extends Customer {
  activities?: Activity[]
  openItems?: OpenItem[]
  _count?: {
    activities: number
    openItems: number
  }
}

export interface CreateCustomerInput {
  name: string
  contact?: string
  phone?: string
  email?: string
  salesRep?: string
  jiraProject?: string
}

export interface UpdateCustomerInput extends Partial<CreateCustomerInput> {}
