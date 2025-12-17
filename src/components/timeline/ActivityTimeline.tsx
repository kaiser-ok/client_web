'use client'

import { useState } from 'react'
import { Button, Select, Space, Empty, Spin, Typography } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import ActivityCard from './ActivityCard'
import AddActivityModal from './AddActivityModal'
import { useActivities, useInfiniteActivities } from '@/hooks/useTimeline'
import { ACTIVITY_SOURCES } from '@/constants/waiting-on'

const { Text } = Typography

interface ActivityTimelineProps {
  customerId: string
  limit?: number
}

export default function ActivityTimeline({ customerId, limit }: ActivityTimelineProps) {
  const [sourceFilter, setSourceFilter] = useState<string>()
  const [addModalOpen, setAddModalOpen] = useState(false)

  // Use simple fetch for limited view, infinite for full view
  const simpleData = useActivities(customerId, sourceFilter, limit)
  const infiniteData = useInfiniteActivities(customerId, sourceFilter)

  const isLimited = !!limit
  const { activities, isLoading, mutate } = isLimited ? simpleData : infiniteData
  const { hasMore, loadMore } = infiniteData

  const handleRefresh = () => {
    mutate()
  }

  // Loading state
  if (isLoading && activities.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin size="large" />
      </div>
    )
  }

  // Empty state
  if (activities.length === 0) {
    return (
      <>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
          <Space>
            <Select
              placeholder="篩選來源"
              allowClear
              value={sourceFilter}
              onChange={setSourceFilter}
              style={{ width: 120 }}
              options={ACTIVITY_SOURCES.map(s => ({ value: s.value, label: s.label }))}
            />
          </Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setAddModalOpen(true)}
          >
            新增活動
          </Button>
        </div>

        <Empty
          description="尚無活動記錄"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />

        <AddActivityModal
          open={addModalOpen}
          customerId={customerId}
          onClose={() => setAddModalOpen(false)}
          onSuccess={handleRefresh}
        />
      </>
    )
  }

  return (
    <>
      {/* Filters & Actions */}
      {!isLimited && (
        <div style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
        }}>
          <Space wrap>
            <Select
              placeholder="篩選來源"
              allowClear
              value={sourceFilter}
              onChange={setSourceFilter}
              style={{ width: 120 }}
              options={ACTIVITY_SOURCES.map(s => ({ value: s.value, label: s.label }))}
            />
            <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
              重新整理
            </Button>
          </Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setAddModalOpen(true)}
          >
            新增活動
          </Button>
        </div>
      )}

      {/* Activity List */}
      {activities.map(activity => (
        <ActivityCard key={activity.id} activity={activity} />
      ))}

      {/* Load More */}
      {!isLimited && hasMore && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button onClick={loadMore} loading={isLoading}>
            載入更多
          </Button>
        </div>
      )}

      {/* Limited view shows count */}
      {isLimited && simpleData.total > (limit || 0) && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Text type="secondary">
            顯示 {activities.length} / {simpleData.total} 筆活動
          </Text>
        </div>
      )}

      {/* Add Activity Modal */}
      <AddActivityModal
        open={addModalOpen}
        customerId={customerId}
        onClose={() => setAddModalOpen(false)}
        onSuccess={handleRefresh}
      />
    </>
  )
}
