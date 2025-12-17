'use client'

import { Empty, Button } from 'antd'
import { PlusOutlined } from '@ant-design/icons'

interface EmptyStateProps {
  description?: string
  actionText?: string
  onAction?: () => void
}

export default function EmptyState({
  description = '暫無資料',
  actionText,
  onAction,
}: EmptyStateProps) {
  return (
    <Empty
      description={description}
      image={Empty.PRESENTED_IMAGE_SIMPLE}
    >
      {actionText && onAction && (
        <Button type="primary" icon={<PlusOutlined />} onClick={onAction}>
          {actionText}
        </Button>
      )}
    </Empty>
  )
}
