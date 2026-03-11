'use client'

import { Button, Space, Typography, Tag, Descriptions, Skeleton, Dropdown, App } from 'antd'
import type { MenuProps } from 'antd'
import {
  EditOutlined,
  SyncOutlined,
  PlusOutlined,
  BugOutlined,
  ApartmentOutlined,
  DownOutlined,
  CloudSyncOutlined,
  MailOutlined,
  SlackOutlined,
  DeleteOutlined,
  AccountBookOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import Link from 'next/link'
import { CustomerWithRelations } from '@/types/customer'

const { Title, Text } = Typography

interface CustomerHeaderProps {
  customer: CustomerWithRelations | undefined
  isLoading: boolean
  onEdit?: () => void
  onSync?: () => void
  onSyncOdooTags?: () => void
  onSyncEmails?: () => void
  onSyncInvoices?: () => void
  onSyncDeals?: () => void
  onSummarizeSlack?: (force?: boolean, days?: number) => void
  onClearSlackActivities?: () => void
  onAddActivity?: () => void
  onAddIssue?: () => void
  onSmartQuotation?: () => void
}

export default function CustomerHeader({
  customer,
  isLoading,
  onEdit,
  onSync,
  onSyncOdooTags,
  onSyncEmails,
  onSyncInvoices,
  onSyncDeals,
  onSummarizeSlack,
  onClearSlackActivities,
  onAddActivity,
  onAddIssue,
  onSmartQuotation,
}: CustomerHeaderProps) {
  const { modal } = App.useApp()

  const handleClearSlackClick = () => {
    modal.confirm({
      title: '確認清除 Slack 活動',
      content: `確定要清除此客戶的所有 Slack 活動記錄嗎？此操作無法復原。`,
      okText: '確認清除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        onClearSlackActivities?.()
      },
    })
  }

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
            {customer.parent && (
              <Tag color="blue" style={{ marginLeft: 8, verticalAlign: 'middle' }}>
                <Link href={`/customers/${customer.parent.id}`} style={{ color: 'inherit' }}>
                  {customer.parent.name}
                </Link> 子公司
              </Tag>
            )}
            {customer.subsidiaries && customer.subsidiaries.length > 0 && (
              <Tag color="purple" icon={<ApartmentOutlined />} style={{ marginLeft: 8, verticalAlign: 'middle' }}>
                {customer.subsidiaries.length} 子公司
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
          <Button icon={<FileTextOutlined />} onClick={onSmartQuotation}>
            智能報價
          </Button>
          <Button icon={<PlusOutlined />} onClick={onAddActivity}>
            新增活動
          </Button>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                {
                  key: 'jira',
                  icon: <SyncOutlined />,
                  label: '同步 Jira Issues',
                  onClick: onSync,
                },
                {
                  key: 'erp-tags',
                  icon: <CloudSyncOutlined />,
                  label: '同步 ERP 標籤',
                  onClick: onSyncOdooTags,
                  disabled: !customer?.odooId,
                },
                {
                  key: 'erp-invoices',
                  icon: <AccountBookOutlined />,
                  label: '同步 ERP 發票',
                  onClick: onSyncInvoices,
                  disabled: !customer?.odooId,
                },
                {
                  key: 'erp-deals',
                  icon: <CloudSyncOutlined />,
                  label: '同步 ERP 訂單',
                  onClick: onSyncDeals,
                  disabled: !customer?.odooId,
                },
                {
                  key: 'emails',
                  icon: <MailOutlined />,
                  label: '同步 Email',
                  onClick: onSyncEmails,
                },
                { type: 'divider' },
                {
                  key: 'slack',
                  icon: <SlackOutlined />,
                  label: '彙整新 Slack 對話',
                  onClick: () => onSummarizeSlack?.(),
                  disabled: !customer?.slackChannelId,
                },
                {
                  key: 'slack-force-30',
                  icon: <SyncOutlined />,
                  label: '重新彙整 30 天',
                  onClick: () => onSummarizeSlack?.(true, 30),
                  disabled: !customer?.slackChannelId,
                },
                {
                  key: 'slack-force-90',
                  icon: <SyncOutlined />,
                  label: '重新彙整 90 天',
                  onClick: () => onSummarizeSlack?.(true, 90),
                  disabled: !customer?.slackChannelId,
                },
                {
                  key: 'slack-force-365',
                  icon: <SyncOutlined />,
                  label: '重新彙整一年內',
                  onClick: () => onSummarizeSlack?.(true, 365),
                  disabled: !customer?.slackChannelId,
                },
                {
                  key: 'clear-slack',
                  icon: <DeleteOutlined />,
                  label: '清除 Slack 活動',
                  onClick: handleClearSlackClick,
                  danger: true,
                },
              ] as MenuProps['items'],
            }}
          >
            <Button icon={<SyncOutlined />}>
              同步 <DownOutlined />
            </Button>
          </Dropdown>
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
        {customer.parent && (
          <Descriptions.Item label="母公司">
            <Link href={`/customers/${customer.parent.id}`}>
              {customer.parent.name}
            </Link>
          </Descriptions.Item>
        )}
        {customer.subsidiaries && customer.subsidiaries.length > 0 && (
          <Descriptions.Item label="子公司">
            <Space size={[4, 4]} wrap>
              {customer.subsidiaries.map(sub => (
                <Link key={sub.id} href={`/customers/${sub.id}`}>
                  <Tag color="blue" style={{ cursor: 'pointer' }}>{sub.name}</Tag>
                </Link>
              ))}
            </Space>
          </Descriptions.Item>
        )}
        {customer.odooTags && customer.odooTags.length > 0 && (
          <Descriptions.Item label="ERP 標籤">
            <Space size={[4, 4]} wrap>
              {customer.odooTags.map(tag => (
                <Tag key={tag} color="cyan">{tag}</Tag>
              ))}
            </Space>
          </Descriptions.Item>
        )}
        {customer.slackChannelId && (
          <Descriptions.Item label="Slack 頻道">
            <Tag icon={<SlackOutlined />} color="purple">
              已連結
            </Tag>
          </Descriptions.Item>
        )}
      </Descriptions>
    </div>
  )
}
