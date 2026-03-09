'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Card,
  Typography,
  Button,
  Table,
  Select,
  Space,
  Tag,
  App,
  Input,
  Tabs,
  Statistic,
  Row,
  Col,
  Popconfirm,
  Modal,
  Form,
  DatePicker,
  Tooltip,
  Switch,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined,
  LinkOutlined,
  SyncOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { useUser } from '@/hooks/useUser'
import { useCustomers } from '@/hooks/useCustomer'
import dayjs from '@/lib/dayjs'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

// ============================================
// Types
// ============================================

interface IdentityMappingRow {
  id: string
  channel: string
  channelUserId: string
  displayName: string | null
  partnerId: string | null
  partner: { id: string; name: string } | null
  contactId: string | null
  contact: { id: string; name: string } | null
  confidence: number
  method: string
  isVerified: boolean
  resolvedBy: string | null
  updatedAt: string
}

interface UnresolvedSender {
  channel: string
  channelUserId: string
  displayName: string | null
  count: number
  lastSeen: string
}

interface ResolutionLogRow {
  id: string
  channel: string
  channelUserId: string
  displayName: string | null
  partnerId: string | null
  contactId: string | null
  confidence: number | null
  method: string | null
  strategiesAttempted: string[]
  duration: number | null
  createdAt: string
}

interface Stats {
  totalMappings: number
  verifiedCount: number
  byChannel: Record<string, number>
  byMethod: Record<string, number>
  unresolvedCount: number
}

// ============================================
// Helpers
// ============================================

const CHANNEL_COLORS: Record<string, string> = {
  LINE: 'green',
  SLACK: 'purple',
  EMAIL: 'blue',
}

const METHOD_LABELS: Record<string, string> = {
  CACHED: '快取',
  EXACT_IDENTITY: '精確匹配',
  EMAIL_MATCH: 'Email 匹配',
  DOMAIN_MATCH: '網域匹配',
  CONTACT_LOOKUP: '聯絡人',
  ALIAS_MATCH: '別名匹配',
  LLM: 'LLM 推論',
  MANUAL: '手動設定',
}

// ============================================
// Page Component
// ============================================

export default function IdentityResolutionPage() {
  const router = useRouter()
  const { role, isLoading: userLoading } = useUser()
  const { message } = App.useApp()
  const { customers } = useCustomers('', 1, 500)

  // Stats
  const [stats, setStats] = useState<Stats | null>(null)

  // Mappings tab state
  const [mappings, setMappings] = useState<IdentityMappingRow[]>([])
  const [mappingsTotal, setMappingsTotal] = useState(0)
  const [mappingsPage, setMappingsPage] = useState(1)
  const [mappingsLoading, setMappingsLoading] = useState(false)
  const [mappingsSearch, setMappingsSearch] = useState('')
  const [mappingsChannel, setMappingsChannel] = useState<string | undefined>()
  const [mappingsVerified, setMappingsVerified] = useState<string | undefined>()

  // Unresolved tab state
  const [unresolved, setUnresolved] = useState<UnresolvedSender[]>([])
  const [unresolvedTotal, setUnresolvedTotal] = useState(0)
  const [unresolvedPage, setUnresolvedPage] = useState(1)
  const [unresolvedLoading, setUnresolvedLoading] = useState(false)
  const [unresolvedChannel, setUnresolvedChannel] = useState<string | undefined>()

  // History tab state
  const [history, setHistory] = useState<ResolutionLogRow[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyChannel, setHistoryChannel] = useState<string | undefined>()
  const [historyMethod, setHistoryMethod] = useState<string | undefined>()
  const [historyDates, setHistoryDates] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)

  // Link modal
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [linkTarget, setLinkTarget] = useState<{ channel: string; channelUserId: string; displayName: string | null } | null>(null)
  const [linkForm] = Form.useForm()

  const isAdmin = role === 'ADMIN'
  const pageSize = 20

  // Redirect non-admin
  useEffect(() => {
    if (!userLoading && !isAdmin) {
      router.replace('/')
    }
  }, [userLoading, isAdmin, router])

  // ============================================
  // Data loading
  // ============================================

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/identity-resolution/stats')
      if (res.ok) {
        setStats(await res.json())
      }
    } catch {
      // ignore
    }
  }, [])

  const loadMappings = useCallback(async () => {
    setMappingsLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(mappingsPage),
        pageSize: String(pageSize),
      })
      if (mappingsSearch) params.set('search', mappingsSearch)
      if (mappingsChannel) params.set('channel', mappingsChannel)
      if (mappingsVerified) params.set('verified', mappingsVerified)

      const res = await fetch(`/api/identity-resolution/mappings?${params}`)
      if (res.ok) {
        const data = await res.json()
        setMappings(data.mappings)
        setMappingsTotal(data.total)
      }
    } catch {
      message.error('載入對應失敗')
    } finally {
      setMappingsLoading(false)
    }
  }, [mappingsPage, mappingsSearch, mappingsChannel, mappingsVerified, message])

  const loadUnresolved = useCallback(async () => {
    setUnresolvedLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(unresolvedPage),
        pageSize: String(pageSize),
      })
      if (unresolvedChannel) params.set('channel', unresolvedChannel)

      const res = await fetch(`/api/identity-resolution/unresolved?${params}`)
      if (res.ok) {
        const data = await res.json()
        setUnresolved(data.senders)
        setUnresolvedTotal(data.total)
      }
    } catch {
      message.error('載入未識別失敗')
    } finally {
      setUnresolvedLoading(false)
    }
  }, [unresolvedPage, unresolvedChannel, message])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(historyPage),
        pageSize: String(pageSize),
      })
      if (historyChannel) params.set('channel', historyChannel)
      if (historyMethod) params.set('method', historyMethod)
      if (historyDates) {
        params.set('startDate', historyDates[0].toISOString())
        params.set('endDate', historyDates[1].toISOString())
      }

      // Reuse mappings endpoint for history — we have a separate resolution history endpoint
      // Resolution history comes from resolution_logs
      const res = await fetch(`/api/identity-resolution/history?${params}`)
      if (res.ok) {
        const data = await res.json()
        setHistory(data.logs)
        setHistoryTotal(data.total)
      }
    } catch {
      message.error('載入紀錄失敗')
    } finally {
      setHistoryLoading(false)
    }
  }, [historyPage, historyChannel, historyMethod, historyDates, message])

  useEffect(() => {
    if (isAdmin) {
      loadStats()
      loadMappings()
    }
  }, [isAdmin, loadStats, loadMappings])

  // ============================================
  // Actions
  // ============================================

  const handleDeleteMapping = async (id: string) => {
    try {
      const res = await fetch(`/api/identity-resolution/mappings?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        message.success('已刪除')
        loadMappings()
        loadStats()
      } else {
        message.error('刪除失敗')
      }
    } catch {
      message.error('刪除失敗')
    }
  }

  const handleUpdatePartner = async (record: IdentityMappingRow, partnerId: string | null) => {
    try {
      const res = await fetch('/api/identity-resolution/mappings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: record.channel,
          channelUserId: record.channelUserId,
          partnerId,
          contactId: record.contactId,
        }),
      })
      if (res.ok) {
        message.success('已更新')
        loadMappings()
        loadStats()
      } else {
        message.error('更新失敗')
      }
    } catch {
      message.error('更新失敗')
    }
  }

  const handleLinkSender = (sender: UnresolvedSender) => {
    setLinkTarget(sender)
    linkForm.resetFields()
    setLinkModalOpen(true)
  }

  const handleLinkSubmit = async () => {
    if (!linkTarget) return
    try {
      const values = await linkForm.validateFields()
      const res = await fetch('/api/identity-resolution/mappings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: linkTarget.channel,
          channelUserId: linkTarget.channelUserId,
          partnerId: values.partnerId,
          contactId: values.contactId || null,
        }),
      })
      if (res.ok) {
        message.success('已連結')
        setLinkModalOpen(false)
        loadUnresolved()
        loadMappings()
        loadStats()
      } else {
        message.error('連結失敗')
      }
    } catch {
      // validation error
    }
  }

  if (userLoading || !isAdmin) return null

  // ============================================
  // Customer options
  // ============================================

  const customerOptions = customers.map(c => ({
    value: c.id,
    label: c.name,
  }))

  // ============================================
  // Columns
  // ============================================

  const mappingColumns: TableColumnsType<IdentityMappingRow> = [
    {
      title: '通道',
      dataIndex: 'channel',
      key: 'channel',
      width: 90,
      render: (ch: string) => <Tag color={CHANNEL_COLORS[ch] || 'default'}>{ch}</Tag>,
    },
    {
      title: '發送者 ID',
      dataIndex: 'channelUserId',
      key: 'channelUserId',
      width: 200,
      ellipsis: true,
      render: (id: string) => (
        <Tooltip title={id}>
          <Text code style={{ fontSize: 12 }}>{id.length > 24 ? `${id.substring(0, 24)}...` : id}</Text>
        </Tooltip>
      ),
    },
    {
      title: '顯示名稱',
      dataIndex: 'displayName',
      key: 'displayName',
      width: 140,
      ellipsis: true,
    },
    {
      title: '對應客戶',
      key: 'partner',
      width: 220,
      render: (_: unknown, record: IdentityMappingRow) => (
        <Select
          style={{ width: '100%' }}
          placeholder="選擇客戶"
          allowClear
          showSearch
          optionFilterProp="label"
          value={record.partnerId || undefined}
          options={customerOptions}
          onChange={(value) => handleUpdatePartner(record, value || null)}
          size="small"
        />
      ),
    },
    {
      title: '信心',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 70,
      render: (c: number) => (
        <Text type={c >= 0.8 ? 'success' : c >= 0.5 ? 'warning' : 'secondary'}>
          {(c * 100).toFixed(0)}%
        </Text>
      ),
    },
    {
      title: '方法',
      dataIndex: 'method',
      key: 'method',
      width: 110,
      render: (m: string) => (
        <Tag color={m === 'MANUAL' ? 'gold' : m === 'LLM' ? 'cyan' : 'default'}>
          {METHOD_LABELS[m] || m}
        </Tag>
      ),
    },
    {
      title: '已驗證',
      dataIndex: 'isVerified',
      key: 'isVerified',
      width: 80,
      render: (v: boolean) =>
        v ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <QuestionCircleOutlined style={{ color: '#bbb' }} />,
    },
    {
      title: '更新時間',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 130,
      render: (d: string) => (
        <Tooltip title={dayjs(d).format('YYYY-MM-DD HH:mm:ss')}>
          <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(d).fromNow()}</Text>
        </Tooltip>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 60,
      render: (_: unknown, record: IdentityMappingRow) => (
        <Popconfirm
          title="刪除此對應？"
          description="刪除後會重新解析"
          onConfirm={() => handleDeleteMapping(record.id)}
          okText="刪除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
      ),
    },
  ]

  const unresolvedColumns: TableColumnsType<UnresolvedSender> = [
    {
      title: '通道',
      dataIndex: 'channel',
      key: 'channel',
      width: 90,
      render: (ch: string) => <Tag color={CHANNEL_COLORS[ch] || 'default'}>{ch}</Tag>,
    },
    {
      title: '發送者 ID',
      dataIndex: 'channelUserId',
      key: 'channelUserId',
      width: 220,
      ellipsis: true,
      render: (id: string) => (
        <Tooltip title={id}>
          <Text code style={{ fontSize: 12 }}>{id.length > 28 ? `${id.substring(0, 28)}...` : id}</Text>
        </Tooltip>
      ),
    },
    {
      title: '顯示名稱',
      dataIndex: 'displayName',
      key: 'displayName',
      width: 160,
    },
    {
      title: '出現次數',
      dataIndex: 'count',
      key: 'count',
      width: 100,
      render: (c: number) => <Tag>{c}</Tag>,
    },
    {
      title: '最後出現',
      dataIndex: 'lastSeen',
      key: 'lastSeen',
      width: 140,
      render: (d: string) => (
        <Tooltip title={dayjs(d).format('YYYY-MM-DD HH:mm:ss')}>
          <Text type="secondary">{dayjs(d).fromNow()}</Text>
        </Tooltip>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: unknown, record: UnresolvedSender) => (
        <Button
          type="link"
          icon={<LinkOutlined />}
          onClick={() => handleLinkSender(record)}
        >
          連結
        </Button>
      ),
    },
  ]

  const historyColumns: TableColumnsType<ResolutionLogRow> = [
    {
      title: '時間',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (d: string) => dayjs(d).format('MM-DD HH:mm:ss'),
    },
    {
      title: '通道',
      dataIndex: 'channel',
      key: 'channel',
      width: 80,
      render: (ch: string) => <Tag color={CHANNEL_COLORS[ch] || 'default'}>{ch}</Tag>,
    },
    {
      title: '發送者',
      key: 'sender',
      width: 180,
      render: (_: unknown, record: ResolutionLogRow) => (
        <Space orientation="vertical" size={0}>
          <Text style={{ fontSize: 12 }}>{record.displayName || '-'}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {record.channelUserId.length > 20 ? `${record.channelUserId.substring(0, 20)}...` : record.channelUserId}
          </Text>
        </Space>
      ),
    },
    {
      title: '結果',
      dataIndex: 'partnerId',
      key: 'partnerId',
      width: 100,
      render: (pid: string | null) =>
        pid ? <Tag color="green">已解析</Tag> : <Tag color="red">失敗</Tag>,
    },
    {
      title: '方法',
      dataIndex: 'method',
      key: 'method',
      width: 110,
      render: (m: string | null) =>
        m ? <Tag>{METHOD_LABELS[m] || m}</Tag> : <Tag color="red">無</Tag>,
    },
    {
      title: '信心',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 70,
      render: (c: number | null) =>
        c != null ? `${(c * 100).toFixed(0)}%` : '-',
    },
    {
      title: '耗時',
      dataIndex: 'duration',
      key: 'duration',
      width: 80,
      render: (d: number | null) => (d != null ? `${d}ms` : '-'),
    },
  ]

  // ============================================
  // Render
  // ============================================

  return (
    <AppLayout>
      <Title level={4} style={{ marginBottom: 24 }}>
        <LinkOutlined style={{ marginRight: 8 }} />
        身分識別
      </Title>

      {/* Stats */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic title="總對應數" value={stats.totalMappings} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="已驗證"
                value={stats.totalMappings > 0 ? ((stats.verifiedCount / stats.totalMappings) * 100).toFixed(1) : 0}
                suffix="%"
                styles={{ content: { color: '#52c41a' } }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="未識別發送者"
                value={stats.unresolvedCount}
                styles={{ content: { color: stats.unresolvedCount > 0 ? '#faad14' : undefined } }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Space size={4}>
                {Object.entries(stats.byChannel).map(([ch, count]) => (
                  <Tag key={ch} color={CHANNEL_COLORS[ch] || 'default'}>
                    {ch}: {count}
                  </Tag>
                ))}
              </Space>
              <div style={{ marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>依通道分佈</Text>
              </div>
            </Card>
          </Col>
        </Row>
      )}

      <Tabs
        defaultActiveKey="mappings"
        onChange={(key) => {
          if (key === 'unresolved') loadUnresolved()
          if (key === 'history') loadHistory()
        }}
        items={[
          {
            key: 'mappings',
            label: '身分對應',
            children: (
              <>
                <Card size="small" style={{ marginBottom: 12 }}>
                  <Space wrap>
                    <Select
                      placeholder="通道"
                      allowClear
                      style={{ width: 120 }}
                      value={mappingsChannel}
                      onChange={(v) => { setMappingsChannel(v); setMappingsPage(1) }}
                      options={[
                        { value: 'LINE', label: 'LINE' },
                        { value: 'SLACK', label: 'Slack' },
                        { value: 'EMAIL', label: 'Email' },
                      ]}
                    />
                    <Select
                      placeholder="驗證狀態"
                      allowClear
                      style={{ width: 120 }}
                      value={mappingsVerified}
                      onChange={(v) => { setMappingsVerified(v); setMappingsPage(1) }}
                      options={[
                        { value: 'true', label: '已驗證' },
                        { value: 'false', label: '未驗證' },
                      ]}
                    />
                    <Input
                      placeholder="搜尋..."
                      prefix={<SearchOutlined />}
                      value={mappingsSearch}
                      onChange={(e) => { setMappingsSearch(e.target.value); setMappingsPage(1) }}
                      style={{ width: 200 }}
                      allowClear
                    />
                    <Button
                      icon={<SyncOutlined spin={mappingsLoading} />}
                      onClick={() => { loadMappings(); loadStats() }}
                    >
                      重新載入
                    </Button>
                  </Space>
                </Card>
                <Table
                  columns={mappingColumns}
                  dataSource={mappings}
                  rowKey="id"
                  loading={mappingsLoading}
                  size="small"
                  pagination={{
                    current: mappingsPage,
                    pageSize,
                    total: mappingsTotal,
                    showTotal: (t) => `共 ${t} 筆`,
                    onChange: setMappingsPage,
                  }}
                />
              </>
            ),
          },
          {
            key: 'unresolved',
            label: `未識別 ${stats?.unresolvedCount ? `(${stats.unresolvedCount})` : ''}`,
            children: (
              <>
                <Card size="small" style={{ marginBottom: 12 }}>
                  <Space>
                    <Select
                      placeholder="通道"
                      allowClear
                      style={{ width: 120 }}
                      value={unresolvedChannel}
                      onChange={(v) => { setUnresolvedChannel(v); setUnresolvedPage(1) }}
                      options={[
                        { value: 'LINE', label: 'LINE' },
                        { value: 'SLACK', label: 'Slack' },
                        { value: 'EMAIL', label: 'Email' },
                      ]}
                    />
                    <Button
                      icon={<SyncOutlined spin={unresolvedLoading} />}
                      onClick={loadUnresolved}
                    >
                      重新載入
                    </Button>
                  </Space>
                </Card>
                <Table
                  columns={unresolvedColumns}
                  dataSource={unresolved}
                  rowKey={(r) => `${r.channel}-${r.channelUserId}`}
                  loading={unresolvedLoading}
                  size="small"
                  pagination={{
                    current: unresolvedPage,
                    pageSize,
                    total: unresolvedTotal,
                    showTotal: (t) => `共 ${t} 筆`,
                    onChange: setUnresolvedPage,
                  }}
                />
              </>
            ),
          },
          {
            key: 'history',
            label: '解析紀錄',
            children: (
              <>
                <Card size="small" style={{ marginBottom: 12 }}>
                  <Space wrap>
                    <Select
                      placeholder="通道"
                      allowClear
                      style={{ width: 120 }}
                      value={historyChannel}
                      onChange={(v) => { setHistoryChannel(v); setHistoryPage(1) }}
                      options={[
                        { value: 'LINE', label: 'LINE' },
                        { value: 'SLACK', label: 'Slack' },
                        { value: 'EMAIL', label: 'Email' },
                      ]}
                    />
                    <Select
                      placeholder="方法"
                      allowClear
                      style={{ width: 140 }}
                      value={historyMethod}
                      onChange={(v) => { setHistoryMethod(v); setHistoryPage(1) }}
                      options={Object.entries(METHOD_LABELS).map(([k, v]) => ({
                        value: k,
                        label: v,
                      }))}
                    />
                    <RangePicker
                      value={historyDates as any}
                      onChange={(dates) => {
                        setHistoryDates(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)
                        setHistoryPage(1)
                      }}
                    />
                    <Button
                      icon={<SyncOutlined spin={historyLoading} />}
                      onClick={loadHistory}
                    >
                      重新載入
                    </Button>
                  </Space>
                </Card>
                <Table
                  columns={historyColumns}
                  dataSource={history}
                  rowKey="id"
                  loading={historyLoading}
                  size="small"
                  pagination={{
                    current: historyPage,
                    pageSize,
                    total: historyTotal,
                    showTotal: (t) => `共 ${t} 筆`,
                    onChange: setHistoryPage,
                  }}
                />
              </>
            ),
          },
        ]}
      />

      {/* Link Modal */}
      <Modal
        title={
          <Space>
            <LinkOutlined />
            連結發送者：{linkTarget?.displayName || linkTarget?.channelUserId}
          </Space>
        }
        open={linkModalOpen}
        onCancel={() => setLinkModalOpen(false)}
        onOk={handleLinkSubmit}
        okText="儲存"
        cancelText="取消"
        forceRender
      >
        {linkTarget && (
          <div style={{ marginBottom: 16 }}>
            <Space>
              <Tag color={CHANNEL_COLORS[linkTarget.channel]}>{linkTarget.channel}</Tag>
              <Text code>{linkTarget.channelUserId}</Text>
            </Space>
          </div>
        )}
        <Form form={linkForm} layout="vertical">
          <Form.Item
            name="partnerId"
            label="對應客戶"
            rules={[{ required: true, message: '請選擇客戶' }]}
          >
            <Select
              placeholder="選擇客戶"
              showSearch
              optionFilterProp="label"
              options={customerOptions}
            />
          </Form.Item>
        </Form>
      </Modal>
    </AppLayout>
  )
}
