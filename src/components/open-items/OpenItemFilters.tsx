'use client'

import { Space, Select, Switch, Typography } from 'antd'
import { WAITING_ON_OPTIONS, PRIORITY_OPTIONS } from '@/constants/waiting-on'

const { Text } = Typography

interface OpenItemFiltersProps {
  filters: {
    status?: string[]
    waitingOn?: string[]
    priority?: string[]
    myItems?: boolean
  }
  onFilterChange: (filters: Record<string, unknown>) => void
  compact?: boolean
}

const STATUS_OPTIONS = [
  { value: 'Open', label: 'Open' },
  { value: 'To Do', label: 'To Do' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'In Review', label: 'In Review' },
]

export default function OpenItemFilters({
  filters,
  onFilterChange,
  compact,
}: OpenItemFiltersProps) {
  return (
    <Space wrap size={[8, 8]} style={{ marginBottom: 16 }}>
      <Select
        mode="multiple"
        placeholder="狀態"
        value={filters.status}
        onChange={(value) => onFilterChange({ ...filters, status: value })}
        style={{ minWidth: 120 }}
        options={STATUS_OPTIONS}
        allowClear
        maxTagCount="responsive"
      />

      <Select
        mode="multiple"
        placeholder="等待誰"
        value={filters.waitingOn}
        onChange={(value) => onFilterChange({ ...filters, waitingOn: value })}
        style={{ minWidth: 120 }}
        options={WAITING_ON_OPTIONS.map(opt => ({ value: opt.value, label: opt.label }))}
        allowClear
        maxTagCount="responsive"
      />

      {!compact && (
        <Select
          mode="multiple"
          placeholder="優先級"
          value={filters.priority}
          onChange={(value) => onFilterChange({ ...filters, priority: value })}
          style={{ minWidth: 100 }}
          options={PRIORITY_OPTIONS.map(opt => ({ value: opt.value, label: opt.label }))}
          allowClear
          maxTagCount="responsive"
        />
      )}

      <Space>
        <Text type="secondary">只看我負責</Text>
        <Switch
          checked={filters.myItems}
          onChange={(checked) => onFilterChange({ ...filters, myItems: checked })}
          size="small"
        />
      </Space>
    </Space>
  )
}
