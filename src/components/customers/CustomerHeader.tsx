'use client'

import { Button, Space, Typography, Tag, Descriptions, Skeleton } from 'antd'
import {
  EditOutlined,
  SyncOutlined,
  PlusOutlined,
  BugOutlined,
} from '@ant-design/icons'
import { CustomerWithRelations } from '@/types/customer'

const { Title, Text } = Typography

interface CustomerHeaderProps {
  customer: CustomerWithRelations | undefined
  isLoading: boolean
  onEdit?: () => void
  onSync?: () => void
  onAddActivity?: () => void
  onAddIssue?: () => void
}

export default function CustomerHeader({
  customer,
  isLoading,
  onEdit,
  onSync,
  onAddActivity,
  onAddIssue,
}: CustomerHeaderProps) {
  if (isLoading) {
    return <Skeleton active paragraph={{ rows: 2 }} />
  }

  if (!customer) {
    return null
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 16,
      }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            {customer.name}
            {customer.partner && (
              <Tag color="green" style={{ marginLeft: 12, verticalAlign: 'middle' }}>
                {customer.partner}
              </Tag>
            )}
          </Title>
          {customer.contact && (
            <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
              聯絡人：{customer.contact}
            </Text>
          )}
        </div>

        <Space wrap>
          <Button type="primary" icon={<BugOutlined />} onClick={onAddIssue}>
            新增報修
          </Button>
          <Button icon={<PlusOutlined />} onClick={onAddActivity}>
            新增活動
          </Button>
          <Button icon={<SyncOutlined />} onClick={onSync}>
            同步 Jira
          </Button>
          <Button icon={<EditOutlined />} onClick={onEdit}>
            編輯
          </Button>
        </Space>
      </div>

      <Descriptions size="small" column={{ xs: 1, sm: 2, md: 4 }}>
        {customer.phone && (
          <Descriptions.Item label="電話">{customer.phone}</Descriptions.Item>
        )}
        {customer.email && (
          <Descriptions.Item label="Email">{customer.email}</Descriptions.Item>
        )}
        {customer.salesRep && (
          <Descriptions.Item label="負責業務">{customer.salesRep}</Descriptions.Item>
        )}
        {customer.partner && (
          <Descriptions.Item label="經銷商">{customer.partner}</Descriptions.Item>
        )}
        <Descriptions.Item label="待處理問題">
          <Tag color={customer._count?.openItems ? 'orange' : 'default'}>
            {customer._count?.openItems || 0}
          </Tag>
        </Descriptions.Item>
      </Descriptions>
    </div>
  )
}
