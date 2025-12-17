'use client'

import { Tag } from 'antd'

interface PriorityBadgeProps {
  priority: string | null
}

const priorityConfig: Record<string, { label: string; color: string }> = {
  'Highest': { label: 'P0', color: 'red' },
  'High': { label: 'P1', color: 'orange' },
  'Medium': { label: 'P2', color: 'blue' },
  'Low': { label: 'P3', color: 'green' },
  'Lowest': { label: 'P4', color: 'default' },
}

export default function PriorityBadge({ priority }: PriorityBadgeProps) {
  if (!priority) return <span>-</span>

  const config = priorityConfig[priority] || { label: priority, color: 'default' }

  return <Tag color={config.color}>{config.label}</Tag>
}
