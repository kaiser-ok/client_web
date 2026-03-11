'use client'

import { useState, useEffect } from 'react'
import {
  Card,
  Typography,
  Button,
  Space,
  Form,
  InputNumber,
  Switch,
  Tag,
  App,
  Alert,
  Descriptions,
  Input,
  Divider,
  List,
} from 'antd'
import {
  MailOutlined,
  SaveOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ApiOutlined,
  DisconnectOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { useUser } from '@/hooks/useUser'
import type { GmailConfig } from '@/types/gmail'

const { Title, Text, Link } = Typography

export default function GmailSettingsPage() {
  const router = useRouter()
  const { role, isLoading: userLoading } = useUser()
  const { message } = App.useApp()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [config, setConfig] = useState<GmailConfig | null>(null)
  const [email, setEmail] = useState('')
  const [appPassword, setAppPassword] = useState('')
  const [syncResult, setSyncResult] = useState<{
    success: boolean
    message: string
    result?: {
      successCount: number
      failedCount: number
      unmatchedCount: number
      unmatchedEmails?: Array<{
        messageId: string
        subject: string
        from: string
        recipients: string[]
        date: string
      }>
    }
  } | null>(null)

  const isAdmin = role === 'ADMIN'

  // 權限檢查
  useEffect(() => {
    if (!userLoading && !isAdmin) {
      router.replace('/')
    }
  }, [userLoading, isAdmin, router])

  // 載入設定
  useEffect(() => {
    if (isAdmin) {
      loadConfig()
    }
  }, [isAdmin])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/gmail', { credentials: 'include' })
      const data = await res.json()
      if (res.ok) {
        setConfig(data.config)
        setEmail(data.config.email || '')
      } else {
        message.error(data.error || '載入設定失敗')
      }
    } catch {
      message.error('載入設定失敗')
    } finally {
      setLoading(false)
    }
  }

  const saveConnection = async () => {
    if (!email || !appPassword) {
      message.error('請輸入 Email 和 App Password')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/settings/gmail', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          appPassword,
          connect: true,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setConfig(data.config)
        setAppPassword('')
        message.success('連線設定已儲存')
      } else {
        message.error(data.error || '儲存失敗')
      }
    } catch {
      message.error('儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  const disconnect = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/gmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'disconnect' }),
      })
      const data = await res.json()
      if (res.ok) {
        message.success('已中斷連接')
        loadConfig()
        setEmail('')
        setAppPassword('')
      } else {
        message.error(data.error || '中斷連接失敗')
      }
    } catch {
      message.error('中斷連接失敗')
    } finally {
      setSaving(false)
    }
  }

  const saveSyncSettings = async () => {
    if (!config) return

    setSaving(true)
    try {
      const res = await fetch('/api/settings/gmail', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          syncSettings: config.syncSettings,
          internalDomains: config.internalDomains,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setConfig(data.config)
        message.success('設定已儲存')
      } else {
        message.error(data.error || '儲存失敗')
      }
    } catch {
      message.error('儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async () => {
    setTesting(true)
    try {
      const res = await fetch('/api/settings/gmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'test' }),
      })
      const data = await res.json()
      if (data.success) {
        message.success(`連線成功！收件匣約有 ${data.inboxCount} 封信件`)
      } else {
        message.error(data.message || '連線失敗')
      }
    } catch {
      message.error('連線測試失敗')
    } finally {
      setTesting(false)
    }
  }

  const runSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/gmail/sync', {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (res.ok) {
        setSyncResult({
          success: true,
          message: data.message,
          result: data.result,
        })
        message.success(data.message)
        loadConfig()
      } else {
        setSyncResult({
          success: false,
          message: data.error || '同步失敗',
        })
        message.error(data.error || '同步失敗')
      }
    } catch {
      setSyncResult({
        success: false,
        message: '同步失敗',
      })
      message.error('同步失敗')
    } finally {
      setSyncing(false)
    }
  }

  if (userLoading || !isAdmin) {
    return null
  }

  return (
    <AppLayout>
      <Title level={4} style={{ marginBottom: 24 }}>
        <MailOutlined style={{ marginRight: 8 }} />
        Gmail 收信設定
      </Title>

      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        title="系統收件信箱"
        description="設定一個專屬的 Gmail 信箱（如 gentrice.mailer@gmail.com），同事寄信給客戶時 CC 到此信箱，系統會自動處理並建立客戶活動記錄。"
      />

      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        {/* 連接設定 */}
        <Card
          title={
            <Space>
              連接設定
              {config?.connected ? (
                <Tag color="success" icon={<CheckCircleOutlined />}>已連接</Tag>
              ) : (
                <Tag color="default" icon={<CloseCircleOutlined />}>未連接</Tag>
              )}
            </Space>
          }
          loading={loading}
        >
          {config?.connected ? (
            <Space orientation="vertical" style={{ width: '100%' }}>
              <Descriptions column={1} size="small">
                <Descriptions.Item label="已連接信箱">
                  <Text strong>{config.email}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="上次更新">
                  {new Date(config.updatedAt).toLocaleString('zh-TW')} by {config.updatedBy}
                </Descriptions.Item>
              </Descriptions>
              <Space>
                <Button
                  icon={testing ? <LoadingOutlined /> : <ApiOutlined />}
                  loading={testing}
                  onClick={testConnection}
                >
                  測試連線
                </Button>
                <Button
                  danger
                  icon={<DisconnectOutlined />}
                  loading={saving}
                  onClick={disconnect}
                >
                  中斷連接
                </Button>
              </Space>
            </Space>
          ) : (
            <Form layout="vertical" style={{ maxWidth: 400 }}>
              <Form.Item label="Gmail 信箱" required>
                <Input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="gentrice.mailer@gmail.com"
                />
              </Form.Item>
              <Form.Item
                label="App Password"
                required
                help={
                  <span>
                    需先在 Gmail 啟用兩步驟驗證，再產生{' '}
                    <Link href="https://myaccount.google.com/apppasswords" target="_blank">
                      應用程式密碼
                    </Link>
                  </span>
                }
              >
                <Input.Password
                  value={appPassword}
                  onChange={e => setAppPassword(e.target.value)}
                  placeholder="xxxx xxxx xxxx xxxx"
                />
              </Form.Item>
              <Form.Item>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={saving}
                  onClick={saveConnection}
                >
                  儲存並連接
                </Button>
              </Form.Item>
            </Form>
          )}
        </Card>

        {/* 同步功能 */}
        {config?.connected && (
          <Card
            title="信件同步"
            extra={
              <Button
                type="primary"
                icon={syncing ? <LoadingOutlined /> : <SyncOutlined />}
                loading={syncing}
                onClick={runSync}
              >
                立即同步
              </Button>
            }
            loading={loading}
          >
            <Space orientation="vertical" style={{ width: '100%' }}>
              {config.lastSyncAt && (
                <Descriptions column={2} size="small">
                  <Descriptions.Item label="上次同步">
                    {new Date(config.lastSyncAt).toLocaleString('zh-TW')}
                  </Descriptions.Item>
                  {config.lastSyncResult && (
                    <>
                      <Descriptions.Item label="成功">
                        <Text type="success">{config.lastSyncResult.success}</Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="失敗">
                        <Text type="danger">{config.lastSyncResult.failed}</Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="未匹配">
                        <Text type="warning">{config.lastSyncResult.unmatched}</Text>
                      </Descriptions.Item>
                    </>
                  )}
                </Descriptions>
              )}

              {syncResult && (
                <Alert
                  type={syncResult.success ? 'success' : 'error'}
                  title={syncResult.message}
                  description={
                    syncResult.result && syncResult.result.unmatchedEmails && syncResult.result.unmatchedEmails.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <Text strong>未匹配的信件（無法找到對應客戶）：</Text>
                        <List
                          size="small"
                          dataSource={syncResult.result.unmatchedEmails.slice(0, 5)}
                          renderItem={item => (
                            <List.Item>
                              <Text ellipsis style={{ maxWidth: 400 }}>
                                {item.subject || '(無主旨)'} - 來自 {item.from}
                              </Text>
                            </List.Item>
                          )}
                        />
                        {syncResult.result.unmatchedEmails.length > 5 && (
                          <Text type="secondary">
                            ...還有 {syncResult.result.unmatchedEmails.length - 5} 封
                          </Text>
                        )}
                      </div>
                    )
                  }
                  showIcon
                  style={{ marginTop: 16 }}
                />
              )}
            </Space>
          </Card>
        )}

        {/* 同步設定 */}
        <Card
          title="同步設定"
          extra={
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={saveSyncSettings}
            >
              儲存設定
            </Button>
          }
          loading={loading}
        >
          <Form layout="vertical" style={{ maxWidth: 500 }}>
            <Form.Item label="自動同步">
              <Switch
                checked={config?.syncSettings?.enabled}
                onChange={v => config && setConfig({
                  ...config,
                  syncSettings: { ...config.syncSettings, enabled: v },
                })}
              />
              <Text type="secondary" style={{ marginLeft: 8 }}>
                （需搭配 cron job 呼叫 /api/gmail/sync）
              </Text>
            </Form.Item>

            <Form.Item label="同步間隔（分鐘）">
              <InputNumber
                min={5}
                max={1440}
                value={config?.syncSettings?.intervalMinutes}
                onChange={v => config && setConfig({
                  ...config,
                  syncSettings: { ...config.syncSettings, intervalMinutes: v || 30 },
                })}
                disabled={!config?.syncSettings?.enabled}
              />
            </Form.Item>

            <Form.Item label="取最近幾天的信件">
              <InputNumber
                min={1}
                max={30}
                value={config?.syncSettings?.daysToFetch}
                onChange={v => config && setConfig({
                  ...config,
                  syncSettings: { ...config.syncSettings, daysToFetch: v || 7 },
                })}
              />
            </Form.Item>

            <Divider />

            <Form.Item
              label="內部網域（排除匹配）"
              help="這些網域的 email 不會用於匹配客戶，每行一個"
            >
              <Input.TextArea
                rows={4}
                value={config?.internalDomains?.join('\n')}
                onChange={e => config && setConfig({
                  ...config,
                  internalDomains: e.target.value.split('\n').map(s => s.trim()).filter(Boolean),
                })}
                placeholder="gentrice.net&#10;gentrice.com"
              />
            </Form.Item>
          </Form>
        </Card>

        {/* 說明 */}
        <Card title="設定步驟">
          <Space orientation="vertical">
            <Text>
              <strong>1. 啟用兩步驟驗證：</strong>
              前往 <Link href="https://myaccount.google.com/security" target="_blank">Google 帳戶安全性</Link>，啟用「兩步驟驗證」。
            </Text>
            <Text>
              <strong>2. 產生應用程式密碼：</strong>
              前往 <Link href="https://myaccount.google.com/apppasswords" target="_blank">應用程式密碼</Link>，選擇「郵件」，產生 16 位密碼。
            </Text>
            <Text>
              <strong>3. 輸入連線資訊：</strong>
              在上方輸入 Gmail 地址和應用程式密碼，點擊「儲存並連接」。
            </Text>
            <Text>
              <strong>4. 同事寄信時 CC：</strong>
              寄信給客戶時，在 CC 欄位加入系統信箱地址。
            </Text>
            <Text>
              <strong>5. 執行同步：</strong>
              點擊「立即同步」，系統會自動匹配客戶並建立活動記錄。
            </Text>
          </Space>
        </Card>
      </Space>
    </AppLayout>
  )
}
