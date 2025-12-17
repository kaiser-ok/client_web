'use client'

import { useState, useRef, useEffect } from 'react'
import { Input, Typography } from 'antd'
import { EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons'

const { Text } = Typography

interface InlineEditProps {
  value: string | null | undefined
  onSave: (value: string) => Promise<void>
  placeholder?: string
  maxLength?: number
}

export default function InlineEdit({
  value,
  onSave,
  placeholder = '點擊編輯...',
  maxLength = 80,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState(value || '')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<any>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [editing])

  const handleSave = async () => {
    if (inputValue === value) {
      setEditing(false)
      return
    }

    setLoading(true)
    try {
      await onSave(inputValue)
      setEditing(false)
    } catch (error) {
      // Keep editing on error
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setInputValue(value || '')
    setEditing(false)
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onPressEnter={handleSave}
          onKeyDown={(e) => e.key === 'Escape' && handleCancel()}
          maxLength={maxLength}
          size="small"
          style={{ flex: 1 }}
          disabled={loading}
        />
        <CheckOutlined
          onClick={handleSave}
          style={{ color: '#52c41a', cursor: 'pointer' }}
        />
        <CloseOutlined
          onClick={handleCancel}
          style={{ color: '#ff4d4f', cursor: 'pointer' }}
        />
      </div>
    )
  }

  return (
    <div
      onClick={() => setEditing(true)}
      style={{
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <Text
        ellipsis={{ tooltip: value }}
        style={{ color: value ? undefined : '#999' }}
      >
        {value || placeholder}
      </Text>
      <EditOutlined style={{ fontSize: 12, color: '#999' }} />
    </div>
  )
}
