'use client'

import { Tag } from 'antd'

interface StatusBadgeProps {
  status: string
}

const statusColorMap: Record<string, string> = {
  'Open': 'blue',
  'To Do': 'blue',
  'In Progress': 'processing',
  '進行中': 'processing',
  'In Review': 'orange',
  'Done': 'success',
  '完成': 'success',
  'Closed': 'default',
  '已關閉': 'default',
  'Blocked': 'error',
  '封鎖': 'error',
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const color = statusColorMap[status] || 'default'

  return <Tag color={color}>{status}</Tag>
}
