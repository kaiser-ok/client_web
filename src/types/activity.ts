import { ActivitySourceType } from '@/constants/waiting-on'

export interface Activity {
  id: string
  customerId: string
  source: ActivitySourceType
  title: string
  content: string | null
  tags: string[]
  attachments: string[]
  jiraKey: string | null
  createdBy: string
  createdAt: Date
}

export interface CreateActivityInput {
  customerId: string
  source: ActivitySourceType
  title: string
  content?: string
  tags?: string[]
  attachments?: string[]
  jiraKey?: string
}
