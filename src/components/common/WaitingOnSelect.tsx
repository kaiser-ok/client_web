'use client'

import { Select, Tag } from 'antd'
import { WAITING_ON_OPTIONS, WaitingOnType } from '@/constants/waiting-on'

interface WaitingOnSelectProps {
  value?: WaitingOnType | null
  onChange?: (value: WaitingOnType | null) => void
  disabled?: boolean
  style?: React.CSSProperties
}

export default function WaitingOnSelect({
  value,
  onChange,
  disabled,
  style,
}: WaitingOnSelectProps) {
  return (
    <Select
      value={value}
      onChange={onChange}
      disabled={disabled}
      allowClear
      placeholder="選擇..."
      style={{ minWidth: 100, ...style }}
      options={WAITING_ON_OPTIONS.map(opt => ({
        value: opt.value,
        label: opt.label,
      }))}
    />
  )
}

interface WaitingOnTagProps {
  value: WaitingOnType | null | undefined
}

export function WaitingOnTag({ value }: WaitingOnTagProps) {
  if (!value) return <span style={{ color: '#999' }}>-</span>

  const option = WAITING_ON_OPTIONS.find(opt => opt.value === value)
  if (!option) return <span>{value}</span>

  return <Tag color={option.color}>{option.label}</Tag>
}
