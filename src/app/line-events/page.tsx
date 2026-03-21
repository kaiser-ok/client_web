'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Table, Tag, Space, Button, Select, Input, Avatar, Typography, App,
  Drawer, Form, Divider, Badge, Tooltip, Timeline, Empty, Spin, Modal,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined, UserOutlined, ClockCircleOutlined, ReloadOutlined,
  MessageOutlined, LinkOutlined,
} from '@ant-design/icons'
import AppLayout from '@/components/layout/AppLayout'
import { EVENT_STATUS, EVENT_PRIORITY, LineEventData } from '@/components/line/LineEventPanel'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'

dayjs.extend(relativeTime)
dayjs.locale('zh-tw')

const { Text } = Typography
const { TextArea } = Input

// ── 型別 ─────────────────────────────────────────────

interface Comment {
  id: string
  content: string
  authorEmail: string
  createdAt: string
}

interface StaffUser {
  id: string
  email: string
  name: string | null
  image: string | null
}

// ── SLA 顯示 ─────────────────────────────────────────

function SLATag({ due, status }: { due: string | null; status: string }) {
  if (!due || status === 'RESOLVED' || status === 'CLOSED') return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>
  const now = dayjs()
  const dueTime = dayjs(due)
  const diffMin = dueTime.diff(now, 'minute')
  if (diffMin < 0) return <Tag color="red" style={{ fontSize: 11 }}>超時 {Math.abs(diffMin)} 分</Tag>
  if (diffMin < 60) return <Tag color="orange" style={{ fontSize: 11 }}>剩 {diffMin} 分</Tag>
  const diffHr = Math.floor(diffMin / 60)
  return <Tag color="green" style={{ fontSize: 11 }}>剩 {diffHr} 小時</Tag>
}

// ── 主頁面 ───────────────────────────────────────────

export default function LineEventsPage() {
  return <Suspense><LineEventsPageInner /></Suspense>
}

function LineEventsPageInner() {
  const { message } = App.useApp()
  const searchParams = useSearchParams()
  const autoOpenEventId = searchParams.get('eventId')
  const autoOpenDone = useRef(false)

  const [events, setEvents] = useState<LineEventData[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)

  // Filters
  const [filterStatus, setFilterStatus] = useState<string | undefined>()
  const [filterPriority, setFilterPriority] = useState<string | undefined>()
  const [filterAssigneeId, setFilterAssigneeId] = useState<string | undefined>()
  const [filterSlaBreached, setFilterSlaBreached] = useState<boolean | undefined>()

  // Detail drawer
  const [drawerEvent, setDrawerEvent] = useState<LineEventData | null>(null)
  const [drawerComments, setDrawerComments] = useState<Comment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [drawerHistories, setDrawerHistories] = useState<{ id: string; action: string; fromStatus: string | null; toStatus: string | null; note: string | null; byEmail: string; createdAt: string }[]>([])

  // Close modal
  const [closeModalOpen, setCloseModalOpen] = useState(false)
  const [closeMessage, setCloseMessage] = useState('')

  // Create modal
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form] = Form.useForm()

  // Staff list
  const [staffList, setStaffList] = useState<StaffUser[]>([])
  const [partnerList, setPartnerList] = useState<{ id: string; name: string }[]>([])
  const [labelDefs, setLabelDefs] = useState<{ id: string; label: string; color: string }[]>([])

  // ── 載入資料 ────────────────────────────────────────

  const loadEvents = useCallback(async (p = page) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: '20' })
      if (filterStatus)    params.set('status', filterStatus)
      if (filterPriority)  params.set('priority', filterPriority)
      if (filterAssigneeId) params.set('assigneeId', filterAssigneeId)
      if (filterSlaBreached !== undefined) params.set('slaBreached', String(filterSlaBreached))

      const res = await fetch(`/api/line/line-events?${params}`)
      if (res.ok) {
        const data = await res.json()
        setEvents(data.events)
        setTotal(data.total)
      }
    } finally {
      setLoading(false)
    }
  }, [page, filterStatus, filterPriority, filterAssigneeId, filterSlaBreached])

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
      setPartnerList((data.partners ?? data).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })))
    }
  }, [])

  const loadComments = useCallback(async (eventId: string) => {
    setLoadingComments(true)
    try {
      const res = await fetch(`/api/line/line-events/${eventId}/comments`)
      if (res.ok) setDrawerComments(await res.json())
    } finally {
      setLoadingComments(false)
    }
  }, [])

  useEffect(() => { loadEvents() }, [loadEvents])
  useEffect(() => { loadStaff() }, [loadStaff])
  useEffect(() => { loadPartners() }, [loadPartners])
  useEffect(() => {
    fetch('/api/settings/line-labels')
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.labels && setLabelDefs(d.labels))
      .catch(() => {})
  }, [])

  // 若 URL 有 eventId 參數，自動開啟該事件 Drawer
  useEffect(() => {
    if (!autoOpenEventId || autoOpenDone.current) return
    autoOpenDone.current = true
    fetch(`/api/line/line-events/${autoOpenEventId}`)
      .then(r => r.ok ? r.json() : null)
      .then(ev => { if (ev) openDrawer(ev) })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenEventId])

  // ── 操作函式 ────────────────────────────────────────

  const handleCreate = async (values: { title: string; description?: string; priority: string; assigneeId?: string; channelIds?: string[] }) => {
    setCreating(true)
    try {
      const res = await fetch('/api/line/line-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, channelIds: [] }),
      })
      if (res.ok) {
        message.success('事件已建立')
        setCreateOpen(false)
        form.resetFields()
        loadEvents(1)
        setPage(1)
      } else {
        message.error('建立失敗')
      }
    } finally {
      setCreating(false)
    }
  }

  const changeStatus = async (eventId: string, action: string, assigneeId?: string, closeMsgOverride?: string) => {
    const res = await fetch(`/api/line/line-events/${eventId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, assigneeId, closeMessage: closeMsgOverride }),
    })
    if (res.ok) {
      const updated = await res.json()
      setEvents(prev => prev.map(e => e.id === updated.id ? { ...e, ...updated } : e))
      if (drawerEvent?.id === updated.id) {
        setDrawerEvent(prev => prev ? { ...prev, ...updated } : prev)
        loadHistories(updated.id)
      }
      if (updated.lineMessageFailed) {
        message.warning('事件已結案，但結案訊息無法送達 LINE（LINE 伺服器異常），訊息已記錄於聊天記錄中。')
      } else {
        message.success('狀態已更新')
      }
    } else {
      if (res.status === 400) {
        await loadEvents(page)
        const data = await res.json().catch(() => ({}))
        message.warning(data?.error || '狀態已變更，已自動重新整理')
      } else {
        message.error('操作失敗')
      }
    }
  }

  const handleLabelChange = async (eventId: string, labelId: string, hasLabel: boolean) => {
    const res = await fetch(`/api/line/line-events/${eventId}/labels`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: hasLabel ? 'remove' : 'add', labelId }),
    })
    if (res.ok) {
      const updateLabels = (e: LineEventData) => {
        if (e.id !== eventId) return e
        const labels = hasLabel
          ? (e.labels || []).filter(l => l.labelId !== labelId)
          : [...(e.labels || []), { id: '', eventId, labelId, source: 'manual' }]
        return { ...e, labels }
      }
      setEvents(prev => prev.map(updateLabels))
      if (drawerEvent?.id === eventId) setDrawerEvent(prev => prev ? updateLabels(prev) : prev)
      message.success(hasLabel ? '標籤已移除' : '標籤已新增（已同步頻道）')
    } else {
      message.error('標籤操作失敗')
    }
  }

  const postComment = async () => {
    if (!drawerEvent || !commentText.trim()) return
    setPostingComment(true)
    try {
      const res = await fetch(`/api/line/line-events/${drawerEvent.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentText }),
      })
      if (res.ok) {
        setCommentText('')
        loadComments(drawerEvent.id)
        setEvents(prev => prev.map(e =>
          e.id === drawerEvent.id ? { ...e, _count: { ...e._count, comments: e._count.comments + 1 } } : e
        ))
      }
    } finally {
      setPostingComment(false)
    }
  }

  const loadHistories = async (eventId: string) => {
    const res = await fetch(`/api/line/line-events/${eventId}/history`)
    if (res.ok) setDrawerHistories(await res.json())
  }

  const openDrawer = (event: LineEventData) => {
    setDrawerEvent(event)
    setDrawerComments([])
    setDrawerHistories([])
    loadComments(event.id)
    loadHistories(event.id)
  }

  // ── 表格欄位 ────────────────────────────────────────

  const columns: ColumnsType<LineEventData> = [
    {
      title: '優先級',
      dataIndex: 'priority',
      width: 70,
      render: (v: string) => <Tag color={EVENT_PRIORITY[v]?.color}>{EVENT_PRIORITY[v]?.label}</Tag>,
    },
    {
      title: '事件標題',
      dataIndex: 'title',
      render: (v: string | null, record) => (
        <div>
          <Button
            type="link"
            style={{ padding: 0, textAlign: 'left', height: 'auto' }}
            onClick={() => openDrawer(record)}
          >
            {v || <Text type="secondary">(無標題)</Text>}
          </Button>
          {(record.labels || []).length > 0 && (
            <div style={{ marginTop: 2 }}>
              {record.labels.map(el => {
                const def = labelDefs.find(d => d.id === el.labelId)
                return def ? <Tag key={el.labelId} color={def.color} style={{ fontSize: 10, margin: '0 2px 0 0' }}>{def.label}</Tag> : null
              })}
            </div>
          )}
        </div>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => (
        <Tag color={EVENT_STATUS[v]?.tagColor}>{EVENT_STATUS[v]?.label}</Tag>
      ),
    },
    {
      title: 'SLA',
      dataIndex: 'slaResolveDue',
      width: 110,
      render: (v: string | null, record) => <SLATag due={v} status={record.status} />,
    },
    {
      title: '指派人',
      dataIndex: 'assignee',
      width: 120,
      render: (v: LineEventData['assignee']) => v ? (
        <Space size={4}>
          <Avatar size={18} src={v.image} icon={<UserOutlined />} />
          <Text style={{ fontSize: 12 }}>{v.name || v.email}</Text>
        </Space>
      ) : <Text type="secondary" style={{ fontSize: 12 }}>未指派</Text>,
    },
    {
      title: '客戶',
      dataIndex: 'partner',
      width: 120,
      render: (v: LineEventData['partner']) => v
        ? <Tag color="blue" style={{ fontSize: 11 }}>{v.name}</Tag>
        : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
    {
      title: '專案',
      dataIndex: 'project',
      width: 120,
      render: (v: LineEventData['project']) => v
        ? <Text style={{ fontSize: 12 }}>{v.name}</Text>
        : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
    {
      title: '備註',
      dataIndex: '_count',
      width: 60,
      render: (v: { comments: number }) => v.comments > 0
        ? <Badge count={v.comments} size="small" color="blue" />
        : <Text type="secondary">—</Text>,
    },
    {
      title: '建立時間',
      dataIndex: 'createdAt',
      width: 100,
      render: (v: string) => <Text style={{ fontSize: 11 }} type="secondary">{dayjs(v).fromNow()}</Text>,
    },
    {
      title: '操作',
      width: 130,
      render: (_: unknown, record: LineEventData) => (
        <Space size={4}>
          {record.status === 'NEW' && (
            <Button size="small" type="primary" ghost style={{ fontSize: 11, height: 22, padding: '0 6px' }}
              onClick={() => changeStatus(record.id, 'start')}>
              開始
            </Button>
          )}
          {record.status === 'IN_PROGRESS' && (
            <Button size="small" style={{ fontSize: 11, height: 22, padding: '0 6px' }}
              onClick={() => { openDrawer(record); setTimeout(() => { setCloseMessage(''); setCloseModalOpen(true) }, 100) }}>
              解決
            </Button>
          )}
          {record.status === 'RESOLVED' && (
            <Button size="small" style={{ fontSize: 11, height: 22, padding: '0 6px' }}
              onClick={() => changeStatus(record.id, 'close')}>
              結案
            </Button>
          )}
          {record.status === 'CLOSED' && (
            <Button size="small" style={{ fontSize: 11, height: 22, padding: '0 6px' }}
              onClick={() => changeStatus(record.id, 'reopen')}>
              重開
            </Button>
          )}
        </Space>
      ),
    },
  ]

  // ── 渲染 ──────────────────────────────────────────

  return (
    <AppLayout>
      <div style={{ padding: '0 24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Page header */}
        <div style={{ padding: '16px 0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space>
            <Text strong style={{ fontSize: 18 }}>LINE 事件管理</Text>
            <Badge count={total} overflowCount={999} color="blue" />
          </Space>
          <Space>
            <Tooltip title="重新整理">
              <Button icon={<ReloadOutlined />} onClick={() => loadEvents()} loading={loading} />
            </Tooltip>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              建立事件
            </Button>
          </Space>
        </div>

        {/* Filters */}
        <Space wrap style={{ marginBottom: 12 }}>
          <Select
            allowClear placeholder="狀態篩選" style={{ width: 120 }}
            value={filterStatus} onChange={v => { setFilterStatus(v); setPage(1) }}
            options={Object.entries(EVENT_STATUS).map(([k, v]) => ({ value: k, label: v.label }))}
          />
          <Select
            allowClear placeholder="優先級" style={{ width: 100 }}
            value={filterPriority} onChange={v => { setFilterPriority(v); setPage(1) }}
            options={Object.entries(EVENT_PRIORITY).map(([k, v]) => ({ value: k, label: v.label }))}
          />
          <Select
            allowClear placeholder="指派人" style={{ width: 140 }}
            showSearch optionFilterProp="label"
            value={filterAssigneeId} onChange={v => { setFilterAssigneeId(v); setPage(1) }}
            options={staffList.map(u => ({ value: u.id, label: u.name || u.email }))}
          />
          <Select
            allowClear placeholder="SLA 狀態" style={{ width: 120 }}
            value={filterSlaBreached === undefined ? undefined : String(filterSlaBreached)}
            onChange={v => { setFilterSlaBreached(v === undefined ? undefined : v === 'true'); setPage(1) }}
            options={[
              { value: 'true', label: 'SLA 已超時' },
              { value: 'false', label: 'SLA 正常' },
            ]}
          />
        </Space>

        {/* Table */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <Table
            rowKey="id"
            dataSource={events}
            columns={columns}
            loading={loading}
            size="small"
            pagination={{
              current: page,
              pageSize: 20,
              total,
              showSizeChanger: false,
              showTotal: t => `共 ${t} 筆`,
              onChange: p => { setPage(p); loadEvents(p) },
            }}
            onRow={record => ({ onDoubleClick: () => openDrawer(record) })}
          />
        </div>
      </div>

      {/* Detail drawer */}
      <Drawer
        size="large"
        title={
          <Space>
            <Tag color={EVENT_PRIORITY[drawerEvent?.priority ?? 'NORMAL']?.color}>
              {EVENT_PRIORITY[drawerEvent?.priority ?? 'NORMAL']?.label}
            </Tag>
            <Text strong>{drawerEvent?.title || '(無標題)'}</Text>
          </Space>
        }
        placement="right"
        width={480}
        open={!!drawerEvent}
        onClose={() => setDrawerEvent(null)}
        extra={
          drawerEvent && (
            <Tag color={EVENT_STATUS[drawerEvent.status]?.tagColor}>
              {EVENT_STATUS[drawerEvent.status]?.label}
            </Tag>
          )
        }
      >
        {drawerEvent && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Description */}
            {drawerEvent.description && (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>問題說明</Text>
                <div style={{ marginTop: 4, padding: '8px 12px', background: '#f5f5f5', borderRadius: 6 }}>
                  <Text style={{ fontSize: 13 }}>{drawerEvent.description}</Text>
                </div>
              </div>
            )}

            {/* Meta */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>客戶</Text>
                <div style={{ marginTop: 2 }}>
                  {drawerEvent.partner
                    ? <Tag color="blue">{drawerEvent.partner.name}</Tag>
                    : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>}
                </div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>指派人</Text>
                <div style={{ marginTop: 2 }}>
                  {drawerEvent.assignee ? (
                    <Space size={4}>
                      <Avatar size={18} src={drawerEvent.assignee.image} icon={<UserOutlined />} />
                      <Text style={{ fontSize: 12 }}>{drawerEvent.assignee.name || drawerEvent.assignee.email}</Text>
                    </Space>
                  ) : <Text type="secondary" style={{ fontSize: 12 }}>未指派</Text>}
                </div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>專案</Text>
                <div style={{ marginTop: 2 }}>
                  <Text style={{ fontSize: 12 }}>{drawerEvent.project?.name ?? '—'}</Text>
                </div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>SLA 解決截止</Text>
                <div style={{ marginTop: 2 }}>
                  <SLATag due={drawerEvent.slaResolveDue} status={drawerEvent.status} />
                </div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>建立時間</Text>
                <div style={{ marginTop: 2 }}>
                  <Text style={{ fontSize: 12 }}>{dayjs(drawerEvent.createdAt).format('MM/DD HH:mm')}</Text>
                </div>
              </div>
            </div>

            {/* Labels */}
            <div>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>標籤（同步至關聯頻道）</Text>
              <Space wrap>
                {labelDefs.map(def => {
                  const has = (drawerEvent.labels || []).some(l => l.labelId === def.id)
                  return (
                    <Tag
                      key={def.id}
                      color={has ? def.color : 'default'}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleLabelChange(drawerEvent.id, def.id, has)}
                    >
                      {has ? '✓ ' : '+ '}{def.label}
                    </Tag>
                  )
                })}
              </Space>
            </div>

            {/* Status actions */}
            <div>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>狀態操作</Text>
              <Space wrap>
                {drawerEvent.status === 'NEW' && (
                  <Button size="small" type="primary" ghost onClick={() => changeStatus(drawerEvent.id, 'start')}>
                    開始處理
                  </Button>
                )}
                {drawerEvent.status === 'IN_PROGRESS' && (
                  <Button size="small" onClick={() => { setCloseMessage(''); setCloseModalOpen(true) }}>
                    標記解決
                  </Button>
                )}
                {drawerEvent.status === 'RESOLVED' && (
                  <Button size="small" onClick={() => changeStatus(drawerEvent.id, 'close')}>
                    確認結案
                  </Button>
                )}
                {drawerEvent.status === 'CLOSED' && (
                  <Button size="small" onClick={() => changeStatus(drawerEvent.id, 'reopen')}>
                    重新開啟
                  </Button>
                )}
              </Space>
            </div>

            {/* Related channels */}
            {drawerEvent.channels && drawerEvent.channels.length > 0 && (
              <div>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
                  <LinkOutlined style={{ marginRight: 4 }} />關聯頻道
                </Text>
                <Space wrap>
                  {drawerEvent.channels.map((ec) => (
                    <Tag key={ec.channel.id} style={{ cursor: 'pointer' }}
                      onClick={() => window.open(`/line-inbox?channel=${ec.channel.id}`, '_blank')}>
                      {ec.channel.channelName || ec.channel.id}
                    </Tag>
                  ))}
                </Space>
              </div>
            )}

            <Divider style={{ margin: '0' }} />

            {/* History */}
            {drawerHistories.length > 0 && (
              <div>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>狀態變更歷史</Text>
                <Timeline
                  items={drawerHistories.map(h => {
                    const ACTION_LABEL: Record<string, string> = {
                      assign: '指派', start: '開始處理', resolve: '標記解決',
                      close: '結案', reopen: '重新開啟', priority_change: '變更優先級',
                    }
                    return {
                      key: h.id,
                      dot: <ClockCircleOutlined style={{ fontSize: 11 }} />,
                      content: (
                        <div style={{ fontSize: 12 }}>
                          <Space size={6}>
                            <Text strong>{ACTION_LABEL[h.action] ?? h.action}</Text>
                            {h.fromStatus && h.toStatus && h.fromStatus !== h.toStatus && (
                              <Text type="secondary">{h.fromStatus} → {h.toStatus}</Text>
                            )}
                            <Text type="secondary">{h.byEmail.split('@')[0]}</Text>
                            <Text type="secondary">{dayjs(h.createdAt).format('MM/DD HH:mm')}</Text>
                          </Space>
                          {h.note && (
                            <div style={{ color: '#666', marginTop: 2, paddingLeft: 4, borderLeft: '2px solid #f0f0f0' }}>
                              {h.note}
                            </div>
                          )}
                        </div>
                      ),
                    }
                  })}
                />
              </div>
            )}

            <Divider style={{ margin: '0' }} />

            {/* Comments */}
            <div>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                <MessageOutlined style={{ marginRight: 4 }} />
                內部備註 ({drawerEvent._count.comments})
              </Text>
              {loadingComments ? (
                <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
              ) : drawerComments.length === 0 ? (
                <Empty description="尚無備註" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '8px 0' }} />
              ) : (
                <Timeline
                  style={{ maxHeight: 300, overflowY: 'auto' }}
                  items={drawerComments.map(c => ({
                    key: c.id,
                    dot: <ClockCircleOutlined style={{ fontSize: 12 }} />,
                    content: (
                      <div>
                        <Space style={{ marginBottom: 2 }}>
                          <Text type="secondary" style={{ fontSize: 11 }}>{c.authorEmail}</Text>
                          <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(c.createdAt).format('MM/DD HH:mm')}</Text>
                        </Space>
                        <div style={{ padding: '6px 10px', background: '#f5f5f5', borderRadius: 6, fontSize: 13 }}>
                          {c.content}
                        </div>
                      </div>
                    ),
                  }))}
                />
              )}
              {/* New comment input */}
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <TextArea
                  placeholder="新增備註..."
                  autoSize={{ minRows: 2, maxRows: 4 }}
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  style={{ flex: 1, fontSize: 13 }}
                />
                <Button
                  type="primary"
                  size="small"
                  loading={postingComment}
                  disabled={!commentText.trim()}
                  onClick={postComment}
                  style={{ alignSelf: 'flex-end' }}
                >
                  送出
                </Button>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Resolve modal */}
      <Modal
        title="解決回覆"
        open={closeModalOpen}
        onCancel={() => setCloseModalOpen(false)}
        onOk={() => {
          if (drawerEvent) changeStatus(drawerEvent.id, 'resolve', undefined, closeMessage)
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

      {/* Create modal */}
      <Modal
        title="建立事件"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); form.resetFields() }}
        onOk={() => form.submit()}
        confirmLoading={creating}
        okText="建立"
        cancelText="取消"
        width={480}
        destroyOnClose
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
              allowClear placeholder="選擇客戶（選填）"
              showSearch optionFilterProp="label"
              options={partnerList.map(p => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
          <Form.Item name="assigneeId" label="指派給">
            <Select
              allowClear placeholder="選擇處理人（選填）"
              showSearch optionFilterProp="label"
              options={staffList.map(u => ({ value: u.id, label: u.name || u.email }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </AppLayout>
  )
}

