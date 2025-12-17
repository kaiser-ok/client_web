export const WAITING_ON_OPTIONS = [
  { value: 'Customer', label: '客戶', color: 'orange' },
  { value: 'Sales', label: '業務', color: 'blue' },
  { value: 'IT', label: 'IT', color: 'green' },
  { value: 'RD', label: '研發', color: 'purple' },
  { value: 'PM', label: '產品/專案', color: 'cyan' },
  { value: 'Partner', label: '經銷商/第三方', color: 'gold' },
] as const

export type WaitingOnType = typeof WAITING_ON_OPTIONS[number]['value']

export const ACTIVITY_SOURCES = [
  { value: 'JIRA', label: 'Jira', icon: 'jira' },
  { value: 'MANUAL', label: '手動輸入', icon: 'edit' },
  { value: 'MEETING', label: '會議紀要', icon: 'team' },
  { value: 'LINE', label: 'LINE', icon: 'message' },
  { value: 'EMAIL', label: 'Email', icon: 'mail' },
  { value: 'DOC', label: '文件', icon: 'file' },
  { value: 'PHONE', label: '電話', icon: 'phone' },
] as const

export type ActivitySourceType = typeof ACTIVITY_SOURCES[number]['value']

export const REPLY_SOURCES = [
  { value: 'PHONE', label: '電話' },
  { value: 'LINE', label: 'LINE' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'ONSITE', label: '現場' },
] as const

export const PRIORITY_OPTIONS = [
  { value: 'Highest', label: 'P0', color: 'red' },
  { value: 'High', label: 'P1', color: 'orange' },
  { value: 'Medium', label: 'P2', color: 'blue' },
  { value: 'Low', label: 'P3', color: 'green' },
  { value: 'Lowest', label: 'P4', color: 'default' },
] as const
