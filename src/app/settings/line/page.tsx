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
  Tooltip,
  Avatar,
  Modal,
  Upload,
  Tabs,
  Badge,
  Form,
  Segmented,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SyncOutlined,
  SearchOutlined,
  MessageOutlined,
  TeamOutlined,
  UserOutlined,
  ImportOutlined,
  InboxOutlined,
  EditOutlined,
  ShopOutlined,
  CustomerServiceOutlined,
  QuestionOutlined,
  SwapOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { useUser } from '@/hooks/useUser'
import { useCustomers } from '@/hooks/useCustomer'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { Dragger } = Upload

// ===== Channel types =====
interface ChannelAssociation {
  id: string
  customerId: string | null
  customerName: string | null
  supplierId: string | null
  supplierName: string | null
  role: string
}

interface LineChannel {
  id: string
  lineChannelId: string
  channelType: 'GROUP' | 'ROOM' | 'USER'
  channelName: string | null
  partnerId: string | null
  partnerName: string | null
  projectName: string | null
  isActive: boolean
  isStaff: boolean
  staffEmail: string | null
  messageCount: number
  lastMessageAt: string | null
  createdAt: string
  associations?: ChannelAssociation[]
}

// ===== User types =====
interface UserChannel {
  id: string
  name: string
  type: string
}

interface LineUser {
  id: string
  lineUserId: string
  displayName: string
  pictureUrl: string | null
  identityType: 'STAFF' | 'PARTNER' | 'CUSTOMER' | 'UNKNOWN'
  staffEmail: string | null
  partnerId: string | null
  partnerName: string | null
  contactName: string | null
  contactPhone: string | null
  note: string | null
  channels: UserChannel[]
  createdAt: string
  updatedAt: string
}

const IDENTITY_TYPES = [
  { value: 'STAFF', label: '公司員工', icon: <TeamOutlined />, color: 'blue' },
  { value: 'PARTNER', label: '廠商', icon: <ShopOutlined />, color: 'purple' },
  { value: 'CUSTOMER', label: '客戶', icon: <CustomerServiceOutlined />, color: 'green' },
  { value: 'UNKNOWN', label: '未知', icon: <QuestionOutlined />, color: 'default' },
]

export default function LineSettingsPage() {
  const router = useRouter()
  const { role, isLoading: userLoading } = useUser()
  const { message } = App.useApp()
  const { customers } = useCustomers('', 1, 500)

  // Top-level view
  const [activeView, setActiveView] = useState<string>('channels')

  // ===== Channel state =====
  const [channels, setChannels] = useState<LineChannel[]>([])
  const [channelLoading, setChannelLoading] = useState(false)
  const [channelSearch, setChannelSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState<string>('MAPPED')

  // Import modal
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importChannelId, setImportChannelId] = useState<string | null>(null)
  const [importContent, setImportContent] = useState('')
  const [importing, setImporting] = useState(false)

  // Preview modal
  const [previewChannel, setPreviewChannel] = useState<LineChannel | null>(null)
  const [previewMessages, setPreviewMessages] = useState<Array<{
    id: string; lineUserId: string; displayName: string; pictureUrl: string | null
    identityType: string; messageType: string; content: string | null; mediaUrl: string | null; timestamp: string
  }>>([])
  const [previewLoading, setPreviewLoading] = useState(false)

  // ===== User state =====
  const [users, setUsers] = useState<LineUser[]>([])
  const [userLoading2, setUserLoading2] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [userFilter, setUserFilter] = useState<string>('all')
  const [editingUser, setEditingUser] = useState<LineUser | null>(null)
  const [partners, setPartners] = useState<Array<{ id: string; name: string }>>([])
  const [form] = Form.useForm()

  const canAccessLine = role === 'ADMIN' || role === 'SUPPORT'

  useEffect(() => {
    if (!userLoading && !canAccessLine) {
      router.replace('/')
    }
  }, [userLoading, canAccessLine, router])

  // ===== Channel data loading =====
  const loadChannels = async () => {
    setChannelLoading(true)
    try {
      const res = await fetch('/api/line/channels?includeInactive=true')
      const data = await res.json()
      if (res.ok) {
        setChannels(data.channels)
      } else {
        message.error(data.error || '載入失敗')
      }
    } catch {
      message.error('載入失敗')
    } finally {
      setChannelLoading(false)
    }
  }

  // ===== User data loading =====
  const loadUsers = async () => {
    setUserLoading2(true)
    try {
      const res = await fetch('/api/line/users')
      const data = await res.json()
      if (res.ok) {
        setUsers(data.users)
      } else {
        message.error(data.error || '載入失敗')
      }
    } catch {
      message.error('載入失敗')
    } finally {
      setUserLoading2(false)
    }
  }

  const loadPartners = async () => {
    try {
      const res = await fetch('/api/partners?pageSize=500')
      const data = await res.json()
      if (res.ok) {
        setPartners(data.partners?.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })) || [])
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (canAccessLine) {
      loadChannels()
      loadUsers()
      loadPartners()
    }
  }, [canAccessLine])

  // ===== Channel actions =====
  const handleUpdateChannel = async (id: string, partnerId: string | null) => {
    try {
      const res = await fetch(`/api/line/channels/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId }),
      })
      const data = await res.json()
      if (res.ok) {
        message.success('已更新')
        loadChannels()
      } else {
        message.error(data.error || '更新失敗')
      }
    } catch {
      message.error('更新失敗')
    }
  }

  const handleImport = async () => {
    if (!importChannelId || !importContent.trim()) {
      message.error('請提供聊天記錄內容')
      return
    }
    setImporting(true)
    try {
      const res = await fetch(`/api/line/channels/${importChannelId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: importContent }),
      })
      const data = await res.json()
      if (res.ok) {
        const { summary } = data
        message.success(
          `匯入完成！群組: ${summary.groupName}，匯入 ${summary.importedMessages} 則訊息，建立 ${summary.createdUsers} 個用戶${summary.skippedMessages > 0 ? `，跳過 ${summary.skippedMessages} 則重複` : ''}`
        )
        setImportModalOpen(false)
        setImportContent('')
        setImportChannelId(null)
        loadChannels()
      } else {
        message.error(data.error || '匯入失敗')
      }
    } catch {
      message.error('匯入失敗')
    } finally {
      setImporting(false)
    }
  }

  // ===== Preview channel messages =====
  const handlePreviewChannel = async (channel: LineChannel) => {
    setPreviewChannel(channel)
    setPreviewMessages([])
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/line/channels/${channel.id}?limit=30`)
      const data = await res.json()
      if (res.ok) {
        setPreviewMessages((data.messages || []).reverse())
      }
    } catch { /* ignore */ }
    finally { setPreviewLoading(false) }
  }

  // ===== User actions =====
  const handleEditUser = (user: LineUser) => {
    setEditingUser(user)
    form.setFieldsValue({
      identityType: user.identityType,
      staffEmail: user.staffEmail,
      partnerId: user.partnerId,
      contactName: user.contactName,
      contactPhone: user.contactPhone,
      note: user.note,
    })
  }

  const handleSaveUser = async () => {
    if (!editingUser) return
    try {
      const values = await form.validateFields()
      const res = await fetch(`/api/line/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const data = await res.json()
      if (res.ok) {
        message.success('已更新')
        setEditingUser(null)
        loadUsers()
      } else {
        message.error(data.error || '更新失敗')
      }
    } catch { /* validation error */ }
  }

  if (userLoading || !canAccessLine) {
    return null
  }

  // ===== Channel filtering (only GROUP/ROOM, exclude 1:1 USER channels) =====
  const managedChannels = channels.filter(c => c.channelType === 'GROUP' || c.channelType === 'ROOM')

  const channelSearchFiltered = managedChannels.filter(c => {
    if (!channelSearch) return true
    const q = channelSearch.toLowerCase()
    return (
      (c.channelName || '').toLowerCase().includes(q) ||
      (c.partnerName || '').toLowerCase().includes(q) ||
      (c.projectName || '').toLowerCase().includes(q)
    )
  })

  const groupChannels = channelSearchFiltered.filter(c => c.channelType === 'GROUP' || c.channelType === 'ROOM')
  const unmappedChannels = channelSearchFiltered.filter(c =>
    !c.partnerId && (!c.associations || c.associations.length === 0)
  )

  const filteredChannels = channelFilter === 'UNMAPPED' ? unmappedChannels
    : channelFilter === 'MAPPED' ? channelSearchFiltered.filter(c => c.partnerId || (c.associations && c.associations.length > 0))
    : channelSearchFiltered

  // ===== User filtering =====
  const filteredUsers = users.filter(u => {
    const matchSearch = !userSearch ||
      u.displayName.toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.partnerName || '').toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.staffEmail || '').toLowerCase().includes(userSearch.toLowerCase())
    const matchType = userFilter === 'all' || u.identityType === userFilter
    return matchSearch && matchType
  })

  // ===== Options =====
  const customerOptions = customers.map(c => ({ value: c.id, label: c.name }))
  const partnerOptions = partners.map(p => ({ value: p.id, label: p.name }))

  const getIdentityInfo = (type: string) =>
    IDENTITY_TYPES.find(t => t.value === type) || IDENTITY_TYPES[3]

  // ===== Channel columns =====
  const getChannelTypeIcon = (type: string) => {
    switch (type) {
      case 'GROUP': return <TeamOutlined style={{ color: '#00B900' }} />
      case 'ROOM': return <MessageOutlined style={{ color: '#00B900' }} />
      default: return <UserOutlined style={{ color: '#00B900' }} />
    }
  }

  const getChannelTypeLabel = (type: string) => {
    switch (type) {
      case 'GROUP': return '群組'
      case 'ROOM': return '聊天室'
      default: return '1:1'
    }
  }

  const channelColumns: TableColumnsType<LineChannel> = [
    {
      title: 'LINE 頻道',
      dataIndex: 'channelName',
      key: 'channelName',
      render: (name: string | null, record) => (
        <Space>
          {getChannelTypeIcon(record.channelType)}
          <div>
            <div>
              <a onClick={() => handlePreviewChannel(record)} style={{ fontWeight: 500 }}>
                {name || record.lineChannelId}
              </a>
              {record.projectName && (
                <Tag color="purple" style={{ marginLeft: 8 }}>{record.projectName}</Tag>
              )}
            </div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {getChannelTypeLabel(record.channelType)} | {record.messageCount} 則訊息
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: '對應客戶',
      dataIndex: 'partnerId',
      key: 'partnerId',
      width: 280,
      render: (_: string, record) => (
        <Select
          style={{ width: '100%' }}
          placeholder="選擇客戶"
          allowClear
          showSearch
          optionFilterProp="label"
          value={record.partnerId || undefined}
          options={customerOptions}
          onChange={(value) => handleUpdateChannel(record.id, value || null)}
        />
      ),
    },
    {
      title: '最後訊息',
      dataIndex: 'lastMessageAt',
      key: 'lastMessageAt',
      width: 150,
      render: (date: string | null) =>
        date ? (
          <Tooltip title={dayjs(date).format('YYYY-MM-DD HH:mm:ss')}>
            <Text type="secondary">{dayjs(date).fromNow()}</Text>
          </Tooltip>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: '狀態',
      key: 'status',
      width: 200,
      render: (_: unknown, record) => {
        const hasPartnerId = !!record.partnerId
        const hasAssociations = record.associations && record.associations.length > 0
        const isMapped = hasPartnerId || hasAssociations
        return (
          <Space orientation="vertical" size={4}>
            {isMapped ? (
              <>
                <Tag color="green">已對應</Tag>
                {hasPartnerId && (
                  <Tag color="blue" style={{ margin: 0 }}>{record.partnerName}</Tag>
                )}
                {record.associations && record.associations.map(a => (
                  <Tag key={a.id} color={a.supplierId ? 'purple' : 'blue'} style={{ margin: 0 }}>
                    {a.supplierId ? a.supplierName : a.customerName}
                  </Tag>
                ))}
              </>
            ) : (
              <Tag>未對應</Tag>
            )}
            {!record.isActive && <Tag color="red">已停用</Tag>}
          </Space>
        )
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_: unknown, record) => (
        <Space size={0}>
          <Tooltip title="預覽訊息">
            <Button type="text" icon={<EyeOutlined />} onClick={() => handlePreviewChannel(record)} />
          </Tooltip>
          <Tooltip title="匯入聊天記錄">
            <Button type="text" icon={<ImportOutlined />} onClick={() => {
              setImportChannelId(record.id)
              setImportContent('')
              setImportModalOpen(true)
            }} />
          </Tooltip>
        </Space>
      ),
    },
  ]

  // ===== User columns =====
  const userColumns: TableColumnsType<LineUser> = [
    {
      title: 'LINE 用戶',
      dataIndex: 'displayName',
      key: 'displayName',
      width: 240,
      render: (name: string, record) => (
        <Space>
          <Avatar src={record.pictureUrl} icon={<UserOutlined />} size={36} />
          <div>
            <Text strong style={{ fontSize: 14 }}>{name}</Text>
            {record.note && (
              <Tooltip title={record.note}>
                <Text type="secondary" style={{ marginLeft: 6, fontSize: 11 }}>
                  ({record.note.length > 10 ? record.note.substring(0, 10) + '...' : record.note})
                </Text>
              </Tooltip>
            )}
            <br />
            <Text type="secondary" style={{ fontSize: 11 }}>
              {record.lineUserId.substring(0, 20)}...
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: '身分 / 關聯',
      key: 'identity',
      width: 280,
      render: (_: unknown, record) => {
        const info = getIdentityInfo(record.identityType)
        if (record.identityType === 'STAFF') {
          return (
            <Space orientation="vertical" size={2}>
              <Tag icon={info.icon} color={info.color}>{info.label}</Tag>
              {record.staffEmail && <Text type="secondary" style={{ fontSize: 12 }}>{record.staffEmail}</Text>}
            </Space>
          )
        }
        if (record.identityType === 'PARTNER') {
          return (
            <Space orientation="vertical" size={2}>
              {record.partnerName ? (
                <Tag icon={info.icon} color={info.color}>{record.partnerName}</Tag>
              ) : (
                <Tag icon={info.icon} color={info.color}>{info.label}</Tag>
              )}
              {record.contactName && <Text type="secondary" style={{ fontSize: 12 }}>{record.contactName}{record.contactPhone ? ` / ${record.contactPhone}` : ''}</Text>}
            </Space>
          )
        }
        if (record.identityType === 'CUSTOMER') {
          return (
            <Space orientation="vertical" size={2}>
              {record.partnerName ? (
                <Tag icon={info.icon} color={info.color}>{record.partnerName}</Tag>
              ) : (
                <Tag icon={info.icon} color={info.color}>{info.label}</Tag>
              )}
            </Space>
          )
        }
        return <Tag icon={info.icon} color={info.color}>{info.label}</Tag>
      },
    },
    {
      title: '出現頻道',
      key: 'channels',
      width: 260,
      render: (_: unknown, record) => {
        if (!record.channels || record.channels.length === 0) {
          return <Text type="secondary">-</Text>
        }
        const channelNames = record.channels.map((c: UserChannel) => c.name).join('\n')
        return (
          <Tooltip title={channelNames}>
            <Space size={4} wrap>
              {record.channels.slice(0, 2).map((c: UserChannel) => (
                <Tag color="geekblue" key={c.id}>{c.name}</Tag>
              ))}
              {record.channels.length > 2 && (
                <Tag>+{record.channels.length - 2}</Tag>
              )}
            </Space>
          </Tooltip>
        )
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 80,
      render: (_: unknown, record) => (
        <Button type="link" icon={<EditOutlined />} onClick={() => handleEditUser(record)}>
          編輯
        </Button>
      ),
    },
  ]

  // ===== User identity type counts =====
  const userTypeCounts = {
    STAFF: users.filter(u => u.identityType === 'STAFF').length,
    PARTNER: users.filter(u => u.identityType === 'PARTNER').length,
    CUSTOMER: users.filter(u => u.identityType === 'CUSTOMER').length,
    UNKNOWN: users.filter(u => u.identityType === 'UNKNOWN').length,
  }

  return (
    <AppLayout>
      <Space style={{ marginBottom: 24 }} align="center">
        <Avatar
          size="small"
          style={{ backgroundColor: '#00B900' }}
          icon={<MessageOutlined />}
        />
        <Title level={4} style={{ margin: 0 }}>LINE 整合</Title>
      </Space>

      {/* Top-level view switch */}
      <Card style={{ marginBottom: 16 }}>
        <Space size="large" wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space size="middle" wrap>
            <Segmented
              value={activeView}
              onChange={(v) => setActiveView(v as string)}
              options={[
                { value: 'channels', label: '頻道管理', icon: <SwapOutlined /> },
                { value: 'users', label: '用戶身分', icon: <UserOutlined /> },
              ]}
              size="middle"
            />

            <Button
              icon={<SyncOutlined spin={activeView === 'channels' ? channelLoading : userLoading2} />}
              loading={activeView === 'channels' ? channelLoading : userLoading2}
              onClick={activeView === 'channels' ? loadChannels : loadUsers}
            >
              重新載入
            </Button>

            {activeView === 'channels' ? (
              <Input
                placeholder="搜尋頻道或客戶..."
                prefix={<SearchOutlined />}
                value={channelSearch}
                onChange={(e) => setChannelSearch(e.target.value)}
                style={{ width: 250 }}
                allowClear
              />
            ) : (
              <Space>
                <Select
                  value={userFilter}
                  onChange={setUserFilter}
                  style={{ width: 120 }}
                  options={[
                    { value: 'all', label: '全部身分' },
                    ...IDENTITY_TYPES.map(t => ({ value: t.value, label: t.label })),
                  ]}
                />
                <Input
                  placeholder="搜尋名稱或 Email..."
                  prefix={<SearchOutlined />}
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  style={{ width: 220 }}
                  allowClear
                />
              </Space>
            )}
          </Space>

          {activeView === 'users' && (
            <Space>
              <Tag color="blue">員工 {userTypeCounts.STAFF}</Tag>
              <Tag color="purple">廠商 {userTypeCounts.PARTNER}</Tag>
              <Tag color="green">客戶 {userTypeCounts.CUSTOMER}</Tag>
              <Tag>未知 {userTypeCounts.UNKNOWN}</Tag>
            </Space>
          )}
        </Space>
      </Card>

      {/* Channel view */}
      {activeView === 'channels' && (
        <Card>
          <Tabs
            activeKey={channelFilter}
            onChange={setChannelFilter}
            items={[
              {
                key: 'MAPPED',
                label: (
                  <Space>
                    已對應
                    <Badge count={channelSearchFiltered.filter(c => c.partnerId || (c.associations && c.associations.length > 0)).length} showZero color="#52c41a" size="small" />
                  </Space>
                ),
              },
              {
                key: 'UNMAPPED',
                label: (
                  <Space>
                    未對應
                    <Badge count={unmappedChannels.length} showZero color={unmappedChannels.length > 0 ? '#faad14' : '#999'} size="small" />
                  </Space>
                ),
              },
            ]}
          />
          <Table
            columns={channelColumns}
            dataSource={filteredChannels}
            rowKey="id"
            loading={channelLoading}
            pagination={{
              defaultPageSize: 20,
              pageSizeOptions: ['20', '50', '100'],
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 個頻道`,
            }}
            size="middle"
          />
        </Card>
      )}

      {/* User view */}
      {activeView === 'users' && (
        <Card>
          <Table
            columns={userColumns}
            dataSource={filteredUsers}
            rowKey="id"
            loading={userLoading2}
            pagination={{
              defaultPageSize: 20,
              pageSizeOptions: ['20', '50', '100'],
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 個用戶`,
            }}
            size="middle"
          />
        </Card>
      )}

      <Alert
        style={{ marginTop: 16 }}
        type="info"
        showIcon
        title="LINE 整合說明"
        description={
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>LINE 頻道會在收到訊息時自動建立</li>
            <li>將頻道對應到客戶後，訊息可透過 LLM 分類匯入客戶時間軸</li>
            <li>「用戶身分」可設定 LINE 用戶為員工、廠商或客戶</li>
            <li>Webhook URL: <Text code>/api/line/webhook</Text></li>
            <li>可透過匯入功能將 LINE 匯出的 .txt 聊天記錄匯入系統</li>
          </ul>
        }
      />

      {/* Import Modal */}
      <Modal
        title={<Space><ImportOutlined />匯入 LINE 聊天記錄</Space>}
        open={importModalOpen}
        onCancel={() => { setImportModalOpen(false); setImportContent(''); setImportChannelId(null) }}
        onOk={handleImport}
        okText="匯入"
        cancelText="取消"
        confirmLoading={importing}
        width={700}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title="匯入說明"
          description={
            <>
              請將 LINE 匯出的聊天記錄 .txt 檔案內容貼上，或上傳檔案。
              <br />
              匯出方式：LINE 聊天室 → 設定 → 傳送聊天記錄 → 選擇「以文字形式」
            </>
          }
        />
        <Dragger
          accept=".txt"
          beforeUpload={(file) => {
            const reader = new FileReader()
            reader.onload = (e) => setImportContent(e.target?.result as string)
            reader.readAsText(file, 'UTF-8')
            return false
          }}
          showUploadList={false}
          style={{ marginBottom: 16 }}
        >
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">點擊或拖曳 .txt 檔案到此處</p>
          <p className="ant-upload-hint">支援 LINE 匯出的聊天記錄格式</p>
        </Dragger>
        <Input.TextArea
          value={importContent}
          onChange={(e) => setImportContent(e.target.value)}
          placeholder="或直接在此貼上聊天記錄內容..."
          rows={10}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
        {importContent && (
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            已輸入 {importContent.length} 字元
          </Text>
        )}
      </Modal>

      {/* Preview Messages Modal */}
      <Modal
        title={
          <Space>
            <MessageOutlined style={{ color: '#00B900' }} />
            {previewChannel?.channelName || '頻道訊息預覽'}
            <Text type="secondary" style={{ fontSize: 12 }}>（最近 30 則）</Text>
          </Space>
        }
        open={!!previewChannel}
        onCancel={() => setPreviewChannel(null)}
        footer={
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <div>
              {previewChannel && !previewChannel.partnerId && (!previewChannel.associations || previewChannel.associations.length === 0) && (
                <Select
                  style={{ width: 250 }}
                  placeholder="對應到客戶..."
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={customerOptions}
                  onChange={(value) => {
                    if (previewChannel) {
                      handleUpdateChannel(previewChannel.id, value || null)
                      setPreviewChannel(null)
                    }
                  }}
                />
              )}
            </div>
            <Button onClick={() => setPreviewChannel(null)}>關閉</Button>
          </Space>
        }
        width={600}
      >
        {previewLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>載入中...</div>
        ) : previewMessages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>此頻道尚無訊息</div>
        ) : (
          <div style={{ maxHeight: 500, overflowY: 'auto', padding: '8px 0' }}>
            {previewMessages.map((msg) => {
              const isStaff = msg.identityType === 'STAFF'
              return (
                <div key={msg.id} style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Avatar
                    src={msg.pictureUrl}
                    icon={<UserOutlined />}
                    size={32}
                    style={{ flexShrink: 0, backgroundColor: isStaff ? '#1677ff' : undefined }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ marginBottom: 2 }}>
                      <Text strong style={{ fontSize: 12 }}>{msg.displayName}</Text>
                      <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                        {dayjs(msg.timestamp).format('MM/DD HH:mm')}
                      </Text>
                    </div>
                    {msg.messageType === 'image' && msg.mediaUrl ? (
                      <img
                        src={msg.mediaUrl}
                        alt="image"
                        style={{ maxWidth: 200, maxHeight: 150, borderRadius: 8, cursor: 'pointer' }}
                        onClick={() => window.open(msg.mediaUrl!, '_blank')}
                      />
                    ) : msg.messageType === 'sticker' ? (
                      <Tag>貼圖</Tag>
                    ) : (
                      <div style={{
                        background: isStaff ? '#e6f4ff' : '#f5f5f5',
                        borderRadius: 8,
                        padding: '6px 10px',
                        fontSize: 13,
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {msg.content || `[${msg.messageType}]`}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Modal>

      {/* Edit User Modal */}
      <Modal
        title={
          <Space>
            <Avatar src={editingUser?.pictureUrl} icon={<UserOutlined />} size="small" />
            編輯用戶: {editingUser?.displayName}
          </Space>
        }
        open={!!editingUser}
        onCancel={() => setEditingUser(null)}
        onOk={handleSaveUser}
        okText="儲存"
        cancelText="取消"
        destroyOnHidden={false}
        forceRender
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="identityType"
            label="身分類型"
            rules={[{ required: true, message: '請選擇身分類型' }]}
          >
            <Select
              options={IDENTITY_TYPES.map(t => ({
                value: t.value,
                label: <Space>{t.icon}{t.label}</Space>,
              }))}
            />
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.identityType !== curr.identityType}>
            {({ getFieldValue }) => {
              const type = getFieldValue('identityType')
              if (type === 'STAFF') {
                return (
                  <Form.Item
                    name="staffEmail"
                    label="員工 Email"
                    rules={[
                      { required: true, message: '請輸入員工 Email' },
                      { type: 'email', message: '請輸入有效的 Email' },
                    ]}
                  >
                    <Input placeholder="例: user@company.com" />
                  </Form.Item>
                )
              }
              if (type === 'CUSTOMER' || type === 'PARTNER') {
                return (
                  <>
                    <Form.Item name="partnerId" label="關聯公司">
                      <Select
                        placeholder="搜尋公司名稱..."
                        allowClear
                        showSearch
                        options={partnerOptions}
                        filterOption={(input, option) =>
                          (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                      />
                    </Form.Item>
                    <Form.Item name="contactName" label="聯絡人姓名">
                      <Input placeholder="例: 王小明" />
                    </Form.Item>
                    <Form.Item name="contactPhone" label="聯絡電話">
                      <Input placeholder="例: 0912-345-678" />
                    </Form.Item>
                  </>
                )
              }
              return null
            }}
          </Form.Item>

          <Form.Item name="note" label="備註">
            <Input.TextArea rows={3} placeholder="備註說明..." />
          </Form.Item>
        </Form>
      </Modal>
    </AppLayout>
  )
}
