'use client'

import { useState, useEffect } from 'react'
import {
  Card,
  Typography,
  Button,
  Table,
  Select,
  Space,
  Tag,
  App,
  Alert,
  Input,
  Popconfirm,
} from 'antd'
import {
  SyncOutlined,
  SlackOutlined,
  SearchOutlined,
  SettingOutlined,
  RightOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { useUser } from '@/hooks/useUser'
import { useCustomers } from '@/hooks/useCustomer'

const { Title, Text } = Typography

interface SlackMapping {
  id: string
  channelId: string
  channelName: string
  partnerId: string | null
  partnerName: string | null
  matchType: string
  matchPattern: string | null
  isActive: boolean
  lastSyncedAt: string | null
}

export default function SlackSettingsPage() {
  const router = useRouter()
  const { role, isLoading: userLoading } = useUser()
  const { message } = App.useApp()
  const { customers } = useCustomers('', 1, 500)

  const [mappings, setMappings] = useState<SlackMapping[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [pageSize, setPageSize] = useState(20)

  const canAccessSlack = role === 'ADMIN' || role === 'SUPPORT'

  // Redirect non-admin users
  useEffect(() => {
    if (!userLoading && !canAccessSlack) {
      router.replace('/')
    }
  }, [userLoading, canAccessSlack, router])

  // Load mappings
  const loadMappings = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/slack/mappings')
      const data = await res.json()
      if (res.ok) {
        setMappings(data.mappings)
      } else {
        message.error(data.error || '載入失敗')
      }
    } catch {
      message.error('載入失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (canAccessSlack) {
      loadMappings()
    }
  }, [canAccessSlack])

  // Auto match
  const handleAutoMatch = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/slack/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshChannels: true }),
      })
      const data = await res.json()
      if (res.ok) {
        message.success(data.message)
        loadMappings()
      } else {
        message.error(data.error || '同步失敗')
      }
    } catch {
      message.error('同步失敗')
    } finally {
      setSyncing(false)
    }
  }

  // Update mapping
  const handleUpdateMapping = async (id: string, partnerId: string | null) => {
    try {
      const res = await fetch('/api/slack/mappings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, partnerId }),
      })
      const data = await res.json()
      if (res.ok) {
        message.success('已更新')
        loadMappings()
      } else {
        message.error(data.error || '更新失敗')
      }
    } catch {
      message.error('更新失敗')
    }
  }

  // Delete mapping
  const handleDeleteMapping = async (id: string) => {
    try {
      const res = await fetch(`/api/slack/mappings?id=${id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (res.ok) {
        message.success('已刪除')
        loadMappings()
      } else {
        message.error(data.error || '刪除失敗')
      }
    } catch {
      message.error('刪除失敗')
    }
  }

  if (userLoading || !canAccessSlack) {
    return null
  }

  // Filter mappings
  const filteredMappings = mappings.filter(m =>
    m.channelName.toLowerCase().includes(searchText.toLowerCase()) ||
    (m.partnerName && m.partnerName.toLowerCase().includes(searchText.toLowerCase()))
  )

  // Customer options for select
  const customerOptions = customers.map(c => ({
    value: c.id,
    label: c.name,
  }))

  const columns = [
    {
      title: 'Slack 頻道',
      dataIndex: 'channelName',
      key: 'channelName',
      render: (name: string, record: SlackMapping) => (
        <Space>
          <SlackOutlined style={{ color: '#4A154B' }} />
          <Text code>#{name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.channelId}
          </Text>
        </Space>
      ),
    },
    {
      title: '對應客戶',
      dataIndex: 'partnerId',
      key: 'partnerId',
      width: 300,
      render: (_: string, record: SlackMapping) => (
        <Select
          style={{ width: '100%' }}
          placeholder="選擇客戶"
          allowClear
          showSearch
          optionFilterProp="label"
          value={record.partnerId || undefined}
          options={customerOptions}
          onChange={(value) => handleUpdateMapping(record.id, value || null)}
        />
      ),
    },
    {
      title: '比對方式',
      dataIndex: 'matchType',
      key: 'matchType',
      width: 120,
      render: (type: string, record: SlackMapping) => (
        <Space orientation="vertical" size={0}>
          <Tag color={type === 'AUTO' ? 'blue' : 'default'}>
            {type === 'AUTO' ? '自動' : '手動'}
          </Tag>
          {record.matchPattern && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {record.matchPattern}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '狀態',
      key: 'status',
      width: 100,
      render: (_: unknown, record: SlackMapping) => (
        record.partnerId ? (
          <Tag color="green">已對應</Tag>
        ) : (
          <Tag>未對應</Tag>
        )
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, record: SlackMapping) => (
        <Popconfirm
          title="確定要刪除此頻道對照？"
          description="刪除後如需重新對應，可再次執行「自動比對頻道」"
          onConfirm={() => handleDeleteMapping(record.id)}
          okText="刪除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            size="small"
          />
        </Popconfirm>
      ),
    },
  ]

  const matchedCount = mappings.filter(m => m.partnerId).length
  const unmatchedCount = mappings.filter(m => !m.partnerId).length

  return (
    <AppLayout>
      <Title level={4} style={{ marginBottom: 24 }}>
        <SlackOutlined style={{ marginRight: 8, color: '#4A154B' }} />
        Slack 整合
      </Title>

      <Card style={{ marginBottom: 16 }}>
        <Space size="large" wrap>
          <Button
            type="primary"
            icon={<SyncOutlined spin={syncing} />}
            loading={syncing}
            onClick={handleAutoMatch}
          >
            自動比對頻道
          </Button>

          <Space>
            <Text>已對應：</Text>
            <Tag color="green">{matchedCount}</Tag>
          </Space>

          <Space>
            <Text>未對應：</Text>
            <Tag>{unmatchedCount}</Tag>
          </Space>

          <Input
            placeholder="搜尋頻道或客戶..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 250 }}
            allowClear
          />

          <Button
            icon={<SettingOutlined />}
            onClick={() => router.push('/settings/slack/classification')}
          >
            分類設定 <RightOutlined />
          </Button>
        </Space>
      </Card>

      <Card>
        <Table
          columns={columns}
          dataSource={filteredMappings}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
            onShowSizeChange: (_current, size) => setPageSize(size),
            showTotal: (total) => `共 ${total} 個頻道`,
          }}
          size="middle"
        />
      </Card>

      <Alert
        style={{ marginTop: 16 }}
        type="info"
        showIcon
        title="使用說明"
        description={
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>點擊「自動比對頻道」會從 Slack 載入所有頻道，並根據名稱自動對應客戶</li>
            <li>比對規則：snm_*, voip_*, f_*, 專案_* 開頭的頻道會嘗試比對客戶名稱</li>
            <li>手動調整的對應不會被自動比對覆蓋</li>
            <li>對應完成後，可在客戶頁面使用「彙整 Slack 對話」功能</li>
          </ul>
        }
      />
    </AppLayout>
  )
}
