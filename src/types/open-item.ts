import { WaitingOnType } from '@/constants/waiting-on'

export interface OpenItem {
  id: string
  customerId: string
  jiraKey: string
  summary: string
  status: string
  priority: string | null
  assignee: string | null
  waitingOn: WaitingOnType | null
  nextAction: string | null
  dueDate: Date | null
  partner: string | null       // 經銷商
  lastReply: string | null
  lastReplyBy: string | null
  lastReplyAt: Date | null
  jiraUpdated: Date
  syncedAt: Date
}

export interface OpenItemFilters {
  status?: string[]
  waitingOn?: WaitingOnType[]
  assignee?: string
  priority?: string[]
  myItems?: boolean
}

export interface OpenItemSort {
  field: 'dueDate' | 'jiraUpdated' | 'priority' | 'lastReplyAt'
  order: 'asc' | 'desc'
}

export interface UpdateOpenItemInput {
  waitingOn?: WaitingOnType | null
  nextAction?: string | null
  dueDate?: Date | null
}

export interface ReplyInput {
  content: string
  source?: string
  updateWaitingOn?: WaitingOnType | null
  updateNextAction?: string | null
  updateDueDate?: Date | null
}
