'use client'

import { useState } from 'react'
import { Card, Button, Typography, Empty, Spin, Tag, Popconfirm, App } from 'antd'
import { PlusOutlined, DeleteOutlined, PaperClipOutlined, SyncOutlined, LinkOutlined, ProjectOutlined } from '@ant-design/icons'
import { useDeals, deleteDeal } from '@/hooks/useDeals'
import { useSWRConfig } from 'swr'
import { useUser } from '@/hooks/useUser'
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

const ODOO_BASE_URL = 'https://odoo.gentrice.net/web#'

const getOdooOrderUrl = (odooId: number) => {
  return `${ODOO_BASE_URL}id=${odooId}&cids=1-2&menu_id=227&action=339&model=sale.order&view_type=form`
}

export default function DealsCard({ customerId, limit = 5 }: DealsCardProps) {
  const { deals, isLoading, mutate } = useDeals(customerId, limit)
  const { mutate: globalMutate } = useSWRConfig()
  const { can } = useUser()
  const { message } = App.useApp()
  const [addModalOpen, setAddModalOpen] = useState(false)

  const canViewAmount = can('VIEW_DEAL_AMOUNT')
  const canEdit = can('EDIT_DEAL')
  const canDelete = can('DELETE_DEAL')

  const handleDelete = async (id: string) => {
    try {
      await deleteDeal(id)
      message.success('已刪除')
      mutate()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '刪除失敗')
    }
  }

  const handleCreateProject = async (dealId: string) => {
    try {
      const response = await fetch(`/api/deals/${dealId}/create-project`, {
        method: 'POST',
      })

      const result = await response.json()

      if (!response.ok) {
        if (result.projectId) {
          message.info('此成交記錄已有對應專案')
        } else {
          throw new Error(result.error || '建立失敗')
        }
        return
      }

      message.success(`專案「${result.project.name}」已建立`)
      mutate()
      // 刷新專案列表
      globalMutate(`/api/customers/${customerId}/projects`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '建立專案失敗')
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
          canEdit && (
            <Button
              type="text"
              icon={<PlusOutlined />}
              onClick={() => setAddModalOpen(true)}
            >
              新增
            </Button>
          )
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
            {canEdit && (
              <Button type="primary" onClick={() => setAddModalOpen(true)}>
                新增第一筆
              </Button>
            )}
          </Empty>
        ) : (
          <div>
            {deals.map((deal) => {
              const status = getDealStatus(deal)
              const statusConfig = status ? STATUS_CONFIG[status] : null

              return (
                <div
                  key={deal.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    padding: '12px 0',
                    borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <Tag color="blue">{getDealTypeLabel(deal.type)}</Tag>
                      <span style={{ fontWeight: 500 }}>{deal.name}</span>
                      {canViewAmount && deal.odooId && (
                        <a
                          href={getOdooOrderUrl(deal.odooId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="在 ERP 中查看訂單"
                          style={{ color: '#722ed1' }}
                        >
                          <LinkOutlined />
                        </a>
                      )}
                      {/* 0元不顯示金額（補單） */}
                      {canViewAmount && deal.amount && Number(deal.amount) > 0 && (
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
                    {/* 專案名稱（0元補單時特別重要） */}
                    {deal.projectName && (
                      <div style={{ marginBottom: 4 }}>
                        <Text strong style={{ color: '#1890ff' }}>專案：</Text>
                        <Text>{deal.projectName}</Text>
                      </div>
                    )}
                    <div>
                      <Text type="secondary">
                        {dayjs(deal.closedAt).format('YYYY-MM-DD')}
                        {deal.startDate && deal.endDate && (
                          <> · 期間: {dayjs(deal.startDate).format('YYYY-MM-DD')} ~ {dayjs(deal.endDate).format('YYYY-MM-DD')}</>
                        )}
                        {/* 產品名稱（0元補單時特別重要） */}
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
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {canEdit && (
                      <Button
                        type="text"
                        size="small"
                        icon={<ProjectOutlined />}
                        onClick={() => handleCreateProject(deal.id)}
                        title="建立專案"
                      />
                    )}
                    {canDelete && (
                      <Popconfirm
                        title="確定要刪除？"
                        onConfirm={() => handleDelete(deal.id)}
                        okText="確定"
                        cancelText="取消"
                      >
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
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
