'use client'

import { useState } from 'react'
import { Card, Button, List, Typography, Empty, Spin, Tag, Popconfirm, message } from 'antd'
import { PlusOutlined, DeleteOutlined, PaperClipOutlined, SyncOutlined } from '@ant-design/icons'
import { useDeals, deleteDeal } from '@/hooks/useDeals'
import { getDealStatus, DEAL_TYPES } from '@/types/deal'
import AddDealModal from './AddDealModal'
import dayjs from 'dayjs'

const { Text } = Typography

interface DealsCardProps {
  customerId: string
  limit?: number
}

const STATUS_CONFIG = {
  active: { color: 'green', text: '生效中' },
  expiring: { color: 'orange', text: '即將到期' },
  expired: { color: 'red', text: '已過期' },
}

export default function DealsCard({ customerId, limit = 5 }: DealsCardProps) {
  const { deals, isLoading, mutate } = useDeals(customerId, limit)
  const [addModalOpen, setAddModalOpen] = useState(false)

  const handleDelete = async (id: string) => {
    try {
      await deleteDeal(id)
      message.success('已刪除')
      mutate()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '刪除失敗')
    }
  }

  const formatAmount = (amount: number | null) => {
    if (!amount) return null
    return `$${amount.toLocaleString()}`
  }

  const getDealTypeLabel = (type: string) => {
    return DEAL_TYPES.find(t => t.value === type)?.label || type
  }

  return (
    <>
      <Card
        title="成交紀錄/合約"
        extra={
          <Button
            type="text"
            icon={<PlusOutlined />}
            onClick={() => setAddModalOpen(true)}
          >
            新增
          </Button>
        }
      >
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <Spin />
          </div>
        ) : deals.length === 0 ? (
          <Empty
            description="尚無紀錄"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" onClick={() => setAddModalOpen(true)}>
              新增第一筆
            </Button>
          </Empty>
        ) : (
          <List
            dataSource={deals}
            renderItem={(deal) => {
              const status = getDealStatus(deal)
              const statusConfig = status ? STATUS_CONFIG[status] : null

              return (
                <List.Item
                  actions={[
                    <Popconfirm
                      key="delete"
                      title="確定要刪除？"
                      onConfirm={() => handleDelete(deal.id)}
                      okText="確定"
                      cancelText="取消"
                    >
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Tag color="blue">{getDealTypeLabel(deal.type)}</Tag>
                        <span>{deal.name}</span>
                        {deal.amount && (
                          <Tag color="green">{formatAmount(deal.amount)}</Tag>
                        )}
                        {statusConfig && (
                          <Tag color={statusConfig.color}>{statusConfig.text}</Tag>
                        )}
                        {deal.autoRenew && (
                          <Tag icon={<SyncOutlined />}>自動續約</Tag>
                        )}
                        {deal.attachments?.length > 0 && (
                          <Tag icon={<PaperClipOutlined />}>{deal.attachments.length}</Tag>
                        )}
                      </div>
                    }
                    description={
                      <div>
                        <Text type="secondary">
                          {dayjs(deal.closedAt).format('YYYY-MM-DD')}
                          {deal.startDate && deal.endDate && (
                            <> · 期間: {dayjs(deal.startDate).format('YYYY-MM-DD')} ~ {dayjs(deal.endDate).format('YYYY-MM-DD')}</>
                          )}
                          {deal.products && ` · ${deal.products}`}
                          {deal.salesRep && ` · ${deal.salesRep}`}
                        </Text>
                        {deal.attachments?.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            {deal.attachments.map((url, idx) => {
                              const filename = url.split('/').pop() || '附件'
                              const displayName = filename.replace(/^\d+_\w+_/, '').substring(0, 30)
                              return (
                                <a
                                  key={idx}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ marginRight: 8, fontSize: 12 }}
                                >
                                  <PaperClipOutlined /> {displayName}
                                </a>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    }
                  />
                </List.Item>
              )
            }}
          />
        )}
      </Card>

      <AddDealModal
        open={addModalOpen}
        customerId={customerId}
        onClose={() => setAddModalOpen(false)}
        onSuccess={mutate}
      />
    </>
  )
}
