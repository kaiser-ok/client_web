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
  eventDate: Date | null      // 預計事件發生日期
  slackTimestamp: string | null // Slack 資料時間（參考用）
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
  eventDate?: string | Date
  slackTimestamp?: string
}
