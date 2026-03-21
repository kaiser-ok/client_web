'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Button, Tag, Space, Typography, Avatar, Tooltip, Badge, Popover,
  Empty, Spin, Modal, Form, Input, Select, Divider, App,
} from 'antd'
import {
  PlusOutlined, UserOutlined, ClockCircleOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, CloseCircleOutlined, ReloadOutlined,
  AlertOutlined, ArrowRightOutlined, TagsOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'

const { Text } = Typography
const { TextArea } = Input

// ── 常數 ─────────────────────────────────────────────

export const EVENT_STATUS: Record<string, { label: string; color: string; tagColor: string; icon: React.ReactNode }> = {
  NEW:         { label: '新事件',  color: '#1890ff', tagColor: 'blue',    icon: <AlertOutlined /> },
  IN_PROGRESS: { label: '處理中',  color: '#fa8c16', tagColor: 'warning', icon: <ClockCircleOutlined /> },
  RESOLVED:    { label: '已解決',  color: '#52c41a', tagColor: 'success', icon: <CheckCircleOutlined /> },
  CLOSED:      { label: '已結案',  color: '#8c8c8c', tagColor: 'default', icon: <CloseCircleOutlined /> },
}

export const EVENT_PRIORITY: Record<string, { label: string; color: string }> = {
  P1:     { label: 'P1', color: 'red'    },
  P2:     { label: 'P2', color: 'orange' },
  NORMAL: { label: '一般', color: 'default' },
}

// ── 型別 ─────────────────────────────────────────────

export interface LineEventData {
  id: string
  title: string | null
  description: string | null
  status: string
  priority: string
  source: string
  projectId: string | null
  assigneeId: string | null
  assignee: { id: string; email: string; name: string | null; image: string | null } | null
  partner:  { id: string; name: string } | null
  project:  { id: string; name: string } | null
  slaResolveDue: string | null
  slaResponseDue: string | null
  slaResponseAt: string | null
  slaBreached: boolean
  createdBy: string
  createdAt: string
  resolvedAt: string | null
  closedAt: string | null
  labels: Array<{ id: string; labelId: string; source: string }>
  channels?: Array<{ channel: { id: string; channelName: string | null; channelType: string; lineChannelId: string }; startMessageId?: string | null }>
  _count: { comments: number }
  startMessageId?: string | null
}

interface StaffUser {
  id: string
  email: string
  name: string | null
  image: string | null
}

interface PartnerOption {
  id: string
  name: string
}

interface LineEventPanelProps {
  channelId: string
  onNavigateToEvents?: () => void
}

// ── SLA 顯示 ────────────────────────────────────────

function SLABadge({ due, status }: { due: string | null; status: string }) {
  if (!due || status === 'RESOLVED' || status === 'CLOSED') return null
  const now = dayjs()
  const dueTime = dayjs(due)
  const diffMin = dueTime.diff(now, 'minute')

  if (diffMin < 0) {
    return <Tag color="red" style={{ fontSize: 10, margin: 0 }}>SLA 已超時 {Math.abs(diffMin)}分</Tag>
  }
  if (diffMin < 60) {
    return <Tag color="orange" style={{ fontSize: 10, margin: 0 }}>SLA 剩 {diffMin}分</Tag>
  }
  const diffHr = Math.floor(diffMin / 60)
  return <Tag color="green" style={{ fontSize: 10, margin: 0 }}>SLA 剩 {diffHr}小時</Tag>
}

// ── 主元件 ───────────────────────────────────────────

export default function LineEventPanel({ channelId, onNavigateToEvents }: LineEventPanelProps) {
  const { message } = App.useApp()
  const router = useRouter()
  const [events, setEvents] = useState<LineEventData[]>([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [staffList, setStaffList] = useState<StaffUser[]>([])
  const [partnerList, setPartnerList] = useState<PartnerOption[]>([])
  const [projectList, setProjectList] = useState<{ id: string; name: string }[]>([])
  const [labelDefs, setLabelDefs] = useState<import('@/types/line-label').LineLabelDefinition[]>([])
  const [channelDefaults, setChannelDefaults] = useState<{ partnerId?: string; projectId?: string }>({})
  const [form] = Form.useForm()

  const loadEvents = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/line/channels/${channelId}/events`)
      if (res.ok) setEvents(await res.json())
    } finally {
      setLoading(false)
    }
  }, [channelId])

  const loadStaff = useCallback(async () => {
    const res = await fetch('/api/users')
    if (res.ok) {
      const data = await res.json()
      setStaffList(data.users ?? data)
    }
  }, [])

  const loadPartners = useCallback(async () => {
    const res = await fetch('/api/partners?limit=200')
    if (res.ok) {
      const data = await res.json()
      setPartnerList((data.partners ?? data).map((p: PartnerOption) => ({ id: p.id, name: p.name })))
    }
  }, [])

  useEffect(() => {
    loadEvents()
    loadStaff()
    loadPartners()
    // 載入標籤定義
    fetch('/api/settings/line-labels')
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.labels && setLabelDefs(d.labels))
      .catch(() => {})
    // 載入頻道的客戶與專案預設值，並取得該客戶的專案列表
    fetch(`/api/line/channels/${channelId}`)
      .then(r => r.ok ? r.json() : null)
      .then(async ch => {
        if (!ch) return
        const channelData = ch.channel ?? ch  // API returns { channel: {...}, messages: [...] }
        const partnerId = channelData.partnerId ?? channelData.associations?.[0]?.partnerId ?? undefined
        const projectId = channelData.projectId ?? undefined
        setChannelDefaults({ partnerId, projectId })
        // 載入該客戶的專案列表
        if (partnerId) {
          const res = await fetch(`/api/projects?partnerId=${partnerId}&limit=50`)
          if (res.ok) {
            const data = await res.json()
            setProjectList((data.projects ?? data).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })))
          }
        }
      })
      .catch(() => {})
  }, [loadEvents, loadStaff, loadPartners, channelId])

  // ── 建立事件 ──────────────────────────────────────

  const handleCreate = async (values: {
    title: string
    description?: string
    priority: string
    partnerId?: string
    projectId?: string
    assigneeId?: string
  }) => {
    setCreating(true)
    try {
      const res = await fetch('/api/line/line-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          channelIds: [{ channelId }],
        }),
      })
      if (res.ok) {
        message.success('事件已建立')
        setCreateOpen(false)
        form.resetFields()
        loadEvents()
      } else {
        message.error('建立失敗')
      }
    } finally {
      setCreating(false)
    }
  }

  // ── 狀態流轉 ──────────────────────────────────────

  const handleLabelChange = async (eventId: string, labelId: string, hasLabel: boolean) => {
    const res = await fetch(`/api/line/line-events/${eventId}/labels`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: hasLabel ? 'remove' : 'add', labelId }),
    })
    if (res.ok) {
      setEvents(prev => prev.map(e => {
        if (e.id !== eventId) return e
        const labels = hasLabel
          ? (e.labels || []).filter(l => l.labelId !== labelId)
          : [...(e.labels || []), { id: '', eventId, labelId, source: 'manual' }]
        return { ...e, labels }
      }))
    } else {
      message.error('標籤操作失敗')
    }
  }

  const changeStatus = async (eventId: string, action: string, assigneeId?: string, closeMessage?: string) => {
    const res = await fetch(`/api/line/line-events/${eventId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, assigneeId, closeMessage }),
    })
    if (res.ok) {
      const updated = await res.json()
      setEvents(prev => prev.map(e => e.id === updated.id ? { ...e, ...updated } : e))
      if (updated.lineMessageFailed) {
        message.warning('事件已結案，但結案訊息無法送達 LINE（LINE 伺服器異常），訊息已記錄於聊天記錄中。')
      } else {
        message.success('狀態已更新')
      }
    } else {
      // 狀態衝突時重新載入，確保 UI 與 DB 同步
      if (res.status === 400) {
        await loadEvents()
        const data = await res.json().catch(() => ({}))
        message.warning(data?.error || '狀態已變更，已自動重新整理')
      } else {
        message.error('操作失敗')
      }
    }
  }

  // ── 渲染 ──────────────────────────────────────────

  const activeEvents = events.filter(e => e.status !== 'CLOSED')
  const closedEvents = events.filter(e => e.status === 'CLOSED')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Panel header */}
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <Space>
          <Text strong style={{ fontSize: 13 }}>事件管理</Text>
          <Badge count={activeEvents.length} size="small" />
        </Space>
        <Space size={4}>
          <Tooltip title="重新整理">
            <Button type="text" size="small" icon={<ReloadOutlined />} onClick={loadEvents} loading={loading} />
          </Tooltip>
          {onNavigateToEvents && (
            <Tooltip title="前往事件管理頁">
              <Button type="text" size="small" icon={<ArrowRightOutlined />} onClick={onNavigateToEvents} />
            </Tooltip>
          )}
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => {
              form.setFieldsValue({
                priority: 'NORMAL',
                partnerId: channelDefaults.partnerId,
                projectId: channelDefaults.projectId,
              })
              setCreateOpen(true)
            }}
          >
            建立
          </Button>
        </Space>
      </div>

      {/* Event list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        ) : events.length === 0 ? (
          <Empty description="尚無事件" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '24px 0' }} />
        ) : (
          <>
            {activeEvents.map(event => (
              <EventCard key={event.id} event={event} onChangeStatus={changeStatus} staffList={staffList} labelDefs={labelDefs} onLabelChange={handleLabelChange} onOpen={() => router.push(`/line-events?eventId=${event.id}`)} />
            ))}
            {closedEvents.length > 0 && (
              <>
                <Divider plain style={{ fontSize: 11, color: '#999', margin: '4px 0' }}>已結案 ({closedEvents.length})</Divider>
                {closedEvents.map(event => (
                  <EventCard key={event.id} event={event} onChangeStatus={changeStatus} staffList={staffList} labelDefs={labelDefs} onLabelChange={handleLabelChange} onOpen={() => router.push(`/line-events?eventId=${event.id}`)} />
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* Create event modal */}
      <Modal
        title="建立事件"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); form.resetFields() }}
        onOk={() => form.submit()}
        confirmLoading={creating}
        okText="建立"
        cancelText="取消"
        width={480}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 12 }}>
          <Form.Item name="title" label="事件標題" rules={[{ required: true, message: '請輸入標題' }]}>
            <Input placeholder="簡短描述問題" />
          </Form.Item>
          <Form.Item name="description" label="問題說明">
            <TextArea rows={3} placeholder="詳細說明（選填）" />
          </Form.Item>
          <Form.Item name="priority" label="優先級" initialValue="NORMAL">
            <Select options={[
              { value: 'P1', label: <Tag color="red">P1 緊急</Tag> },
              { value: 'P2', label: <Tag color="orange">P2 重要</Tag> },
              { value: 'NORMAL', label: <Tag>一般</Tag> },
            ]} />
          </Form.Item>
          <Form.Item name="partnerId" label="客戶">
            <Select
              allowClear
              placeholder="選擇客戶（選填）"
              showSearch
              optionFilterProp="label"
              options={partnerList.map(p => ({ value: p.id, label: p.name }))}
              onChange={async (pid) => {
                form.setFieldValue('projectId', undefined)
                if (pid) {
                  const res = await fetch(`/api/projects?partnerId=${pid}&limit=50`)
                  if (res.ok) {
                    const data = await res.json()
                    setProjectList((data.projects ?? data).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })))
                  }
                } else {
                  setProjectList([])
                }
              }}
            />
          </Form.Item>
          <Form.Item name="projectId" label="專案">
            <Select
              allowClear
              placeholder="選擇專案（選填）"
              showSearch
              optionFilterProp="label"
              options={projectList.map(p => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
          <Form.Item name="assigneeId" label="指派給">
            <Select
              allowClear
              placeholder="選擇處理人（選填）"
              showSearch
              optionFilterProp="label"
              options={staffList.map(u => ({
                value: u.id,
                label: u.name || u.email,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

// ── 事件卡片 ─────────────────────────────────────────

function EventCard({
  event,
  onChangeStatus,
  staffList,
  labelDefs,
  onLabelChange,
  onOpen,
}: {
  event: LineEventData
  onChangeStatus: (id: string, action: string, assigneeId?: string, closeMessage?: string) => void
  staffList: StaffUser[]
  labelDefs: import('@/types/line-label').LineLabelDefinition[]
  onLabelChange: (eventId: string, labelId: string, hasLabel: boolean) => void
  onOpen: () => void
}) {
  const [assignOpen, setAssignOpen] = useState(false)
  const [selectedAssignee, setSelectedAssignee] = useState<string | undefined>()
  const [labelPopoverOpen, setLabelPopoverOpen] = useState(false)
  const [closeModalOpen, setCloseModalOpen] = useState(false)
  const [closeMessage, setCloseMessage] = useState('')
  const statusInfo = EVENT_STATUS[event.status]
  const priorityInfo = EVENT_PRIORITY[event.priority]
  const isClosed = event.status === 'CLOSED'

  return (
    <div style={{
      margin: '0 8px 8px',
      padding: '10px 12px',
      border: '1px solid #f0f0f0',
      borderRadius: 8,
      backgroundColor: isClosed ? '#fafafa' : '#fff',
      opacity: isClosed ? 0.8 : 1,
    }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
        <Tag color={priorityInfo.color} style={{ fontSize: 10, margin: 0, flexShrink: 0 }}>
          {priorityInfo.label}
        </Tag>
        <Button
          type="link"
          style={{ padding: 0, height: 'auto', fontSize: 13, fontWeight: 500, flex: 1, textAlign: 'left' }}
          onClick={onOpen}
        >
          {event.title || <Text type="secondary">(無標題)</Text>}
        </Button>
        <Tag color={statusInfo.tagColor} style={{ fontSize: 10, margin: 0, flexShrink: 0 }}>
          {statusInfo.label}
        </Tag>
      </div>

      {/* Meta row */}
      <Space size={6} style={{ marginBottom: 6 }} wrap>
        {event.assignee ? (
          <Tooltip title={event.assignee.name || event.assignee.email}>
            <Space size={4}>
              <Avatar size={16} src={event.assignee.image} icon={<UserOutlined />} />
              <Text type="secondary" style={{ fontSize: 11 }}>{event.assignee.name || event.assignee.email}</Text>
            </Space>
          </Tooltip>
        ) : (
          <Text type="secondary" style={{ fontSize: 11 }}>未指派</Text>
        )}
        <SLABadge due={event.slaResolveDue} status={event.status} />
        {event._count.comments > 0 && (
          <Text type="secondary" style={{ fontSize: 11 }}>{event._count.comments} 則備註</Text>
        )}
      </Space>

      {/* Labels row */}
      {labelDefs.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, flexWrap: 'wrap' }}>
          {(event.labels || []).map(el => {
            const def = labelDefs.find(d => d.id === el.labelId)
            if (!def) return null
            return (
              <Tag
                key={el.labelId}
                color={def.color}
                closable
                onClose={e => { e.preventDefault(); onLabelChange(event.id, el.labelId, true) }}
                style={{ fontSize: 10, margin: 0 }}
              >
                {def.label}
              </Tag>
            )
          })}
          <Popover
            trigger="click"
            open={labelPopoverOpen}
            onOpenChange={setLabelPopoverOpen}
            placement="bottomLeft"
            content={
              <div style={{ minWidth: 150 }}>
                {labelDefs.map(def => {
                  const has = (event.labels || []).some(l => l.labelId === def.id)
                  return (
                    <div
                      key={def.id}
                      style={{ padding: '3px 0', cursor: 'pointer' }}
                      onClick={() => { onLabelChange(event.id, def.id, has); setLabelPopoverOpen(false) }}
                    >
                      <Tag color={has ? def.color : 'default'} style={{ fontSize: 11 }}>
                        {has ? '✓ ' : ''}{def.label}
                      </Tag>
                    </div>
                  )
                })}
              </div>
            }
          >
            <Button type="text" size="small" icon={<TagsOutlined />} style={{ fontSize: 10, height: 20, padding: '0 4px' }} />
          </Popover>
        </div>
      )}

      {/* Action buttons */}
      {!isClosed && (
        <Space size={4} style={{ marginTop: 4 }}>
          {event.status === 'NEW' && (
            <>
              <Button
                size="small"
                type="primary"
                ghost
                style={{ fontSize: 11, height: 22, padding: '0 8px' }}
                onClick={() => setAssignOpen(true)}
              >
                指派
              </Button>
              <Button
                size="small"
                style={{ fontSize: 11, height: 22, padding: '0 8px' }}
                onClick={() => onChangeStatus(event.id, 'start')}
              >
                開始處理
              </Button>
            </>
          )}
          {event.status === 'IN_PROGRESS' && (
            <Button
              size="small"
              type="primary"
              ghost
              style={{ fontSize: 11, height: 22, padding: '0 8px' }}
              onClick={() => { setCloseMessage(''); setCloseModalOpen(true) }}
            >
              標記解決
            </Button>
          )}
          {event.status === 'RESOLVED' && (
            <Button
              size="small"
              style={{ fontSize: 11, height: 22, padding: '0 8px' }}
              onClick={() => onChangeStatus(event.id, 'close')}
            >
              確認結案
            </Button>
          )}
        </Space>
      )}
      {event.status === 'CLOSED' && (
        <Button
          size="small"
          style={{ fontSize: 11, height: 22, padding: '0 8px', marginTop: 4 }}
          onClick={() => onChangeStatus(event.id, 'reopen')}
        >
          重新開啟
        </Button>
      )}

      {/* Resolve modal - enter reply message when resolving */}
      <Modal
        title="解決回覆"
        open={closeModalOpen}
        onCancel={() => setCloseModalOpen(false)}
        onOk={() => {
          onChangeStatus(event.id, 'resolve', undefined, closeMessage)
          setCloseModalOpen(false)
        }}
        okText="標記解決"
        cancelText="取消"
        width={400}
      >
        <div style={{ marginBottom: 8, color: '#666', fontSize: 13 }}>
          可輸入回覆訊息，將自動發送到關聯的 LINE 頻道（選填）
        </div>
        <TextArea
          rows={4}
          placeholder="例如：您的問題已解決，如有其他疑問請隨時聯繫我們。"
          value={closeMessage}
          onChange={e => setCloseMessage(e.target.value)}
        />
      </Modal>

      {/* Assign modal */}
      <Modal
        title="指派處理人"
        open={assignOpen}
        onCancel={() => setAssignOpen(false)}
        onOk={() => {
          if (selectedAssignee) {
            onChangeStatus(event.id, 'assign', selectedAssignee)
            setAssignOpen(false)
          }
        }}
        okText="確認指派"
        cancelText="取消"
        width={360}
      >
        <Select
          style={{ width: '100%', marginTop: 12 }}
          placeholder="選擇處理人"
          showSearch
          optionFilterProp="label"
          value={selectedAssignee}
          onChange={setSelectedAssignee}
          options={staffList.map(u => ({ value: u.id, label: u.name || u.email }))}
        />
      </Modal>
    </div>
  )
}
