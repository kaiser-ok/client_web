'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Card,
  Typography,
  Button,
  Form,
  Input,
  InputNumber,
  Switch,
  Space,
  Table,
  Tag,
  App,
  Alert,
  Divider,
} from 'antd'
import { ApiOutlined, SendOutlined, ReloadOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { useUser } from '@/hooks/useUser'

const { Title, Paragraph } = Typography

interface OutboxRow {
  id: string
  eventId: string
  eventType: string
  status: string
  attempts: number
  responseCode: number | null
  lastError: string | null
  sentAt: string | null
  createdAt: string
  nextRetryAt: string
}

const STATUS_COLOR: Record<string, string> = {
  SENT: 'green',
  PENDING: 'blue',
  FAILED: 'orange',
  DEAD: 'red',
}

export default function EventPushSettingsPage() {
  const router = useRouter()
  const { role, isLoading: userLoading } = useUser()
  const { message } = App.useApp()
  const [form] = Form.useForm()

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [outbox, setOutbox] = useState<OutboxRow[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})

  const isAdmin = role === 'ADMIN'

  useEffect(() => {
    if (!userLoading && !isAdmin) router.replace('/')
  }, [userLoading, isAdmin, router])

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/event-push')
      const data = await res.json()
      if (res.ok) form.setFieldsValue(data)
      else message.error(data.error || '載入失敗')
    } catch {
      message.error('載入失敗')
    } finally {
      setLoading(false)
    }
  }, [form, message])

  const loadOutbox = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/event-push/outbox')
      const data = await res.json()
      if (res.ok) {
        setOutbox(data.recent)
        setCounts(data.counts)
      }
    } catch {
      /* 靜默 */
    }
  }, [])

  useEffect(() => {
    if (isAdmin) {
      loadConfig()
      loadOutbox()
    }
  }, [isAdmin, loadConfig, loadOutbox])

  const onSave = async (values: Record<string, unknown>) => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/event-push', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const data = await res.json()
      if (res.ok) {
        message.success('已儲存')
        form.setFieldsValue(data)
      } else {
        message.error(data.error || '儲存失敗')
      }
    } catch {
      message.error('儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  const onTest = async () => {
    setTesting(true)
    try {
      const res = await fetch('/api/settings/event-push/test', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        message.success(`連線成功：HTTP ${data.status}（${data.elapsedMs}ms）`)
      } else {
        message.error(`連線失敗：${data.error || 'HTTP ' + data.status}`)
      }
    } catch {
      message.error('測試失敗')
    } finally {
      setTesting(false)
    }
  }

  const columns = [
    {
      title: '時間',
      dataIndex: 'createdAt',
      render: (v: string) => new Date(v).toLocaleString('zh-TW'),
      width: 170,
    },
    { title: '類型', dataIndex: 'eventType', width: 130 },
    {
      title: '狀態',
      dataIndex: 'status',
      width: 100,
      render: (s: string) => <Tag color={STATUS_COLOR[s] || 'default'}>{s}</Tag>,
    },
    { title: '嘗試', dataIndex: 'attempts', width: 60 },
    { title: 'HTTP', dataIndex: 'responseCode', width: 70, render: (v: number | null) => v ?? '—' },
    {
      title: '錯誤',
      dataIndex: 'lastError',
      ellipsis: true,
      render: (v: string | null) => v || '—',
    },
  ]

  if (userLoading || !isAdmin) return null

  return (
    <AppLayout>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <Title level={3}>
          <ApiOutlined /> 事件外送設定
        </Title>
        <Paragraph type="secondary">
          LINE 事件管理產生新事件或狀態變更時，推送到外部系統。採 outbox 持久化 + 自動重送，
          對方系統回 2xx 即視為送達；失敗會每 2 分鐘自動重試（指數退避）。
        </Paragraph>

        <Card loading={loading} style={{ marginBottom: 24 }}>
          <Form form={form} layout="vertical" onFinish={onSave}>
            <Form.Item
              name="enabled"
              label="啟用外送"
              valuePropName="checked"
              extra="關閉時完全不推送、不寫入 outbox。設定與測試完成後再開啟。"
            >
              <Switch checkedChildren="開" unCheckedChildren="關" />
            </Form.Item>

            <Form.Item
              name="url"
              label="目標網址"
              rules={[{ required: true, message: '請輸入目標網址' }]}
            >
              <Input placeholder="http://192.168.30.187:3003/api/incidents" />
            </Form.Item>

            <Form.Item
              name="apiKey"
              label="API Key（X-API-Key Header）"
              extra="留空或不變更則沿用原金鑰；顯示 ******** 代表已設定。"
            >
              <Input.Password placeholder="輸入共用金鑰" autoComplete="new-password" />
            </Form.Item>

            <Space size="large">
              <Form.Item name="maxAttempts" label="最大重試次數">
                <InputNumber min={1} max={20} />
              </Form.Item>
              <Form.Item name="timeoutMs" label="逾時（毫秒）">
                <InputNumber min={1000} max={60000} step={1000} />
              </Form.Item>
            </Space>

            <Divider />
            <Space>
              <Button type="primary" htmlType="submit" loading={saving}>
                儲存
              </Button>
              <Button icon={<SendOutlined />} onClick={onTest} loading={testing}>
                測試連線
              </Button>
            </Space>
          </Form>
        </Card>

        <Card
          title="最近外送紀錄"
          extra={
            <Button size="small" icon={<ReloadOutlined />} onClick={loadOutbox}>
              重新整理
            </Button>
          }
        >
          <Space style={{ marginBottom: 12 }} wrap>
            {['SENT', 'PENDING', 'FAILED', 'DEAD'].map(s => (
              <Tag key={s} color={STATUS_COLOR[s]}>
                {s}: {counts[s] ?? 0}
              </Tag>
            ))}
          </Space>
          {counts.DEAD ? (
            <Alert
              type="error"
              showIcon
              title={`有 ${counts.DEAD} 筆事件多次重送後仍失敗（DEAD），請檢查對方系統`}
              style={{ marginBottom: 12 }}
            />
          ) : null}
          <Table
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={outbox}
            pagination={false}
            scroll={{ x: 700 }}
          />
        </Card>
      </div>
    </AppLayout>
  )
}
