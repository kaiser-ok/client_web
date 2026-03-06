'use client'

import { useState, useEffect } from 'react'
import {
  Card,
  Typography,
  Button,
  Space,
  Divider,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Tag,
  App,
  Alert,
} from 'antd'
import {
  RobotOutlined,
  SaveOutlined,
  ApiOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { useUser } from '@/hooks/useUser'
import type { LLMConfig, LLMProviderConfig } from '@/types/llm'

const { Title, Text } = Typography

export default function LLMSettingsPage() {
  const router = useRouter()
  const { role, isLoading: userLoading } = useUser()
  const { message } = App.useApp()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingPrimary, setTestingPrimary] = useState(false)
  const [testingSecondary, setTestingSecondary] = useState(false)
  const [primaryStatus, setPrimaryStatus] = useState<'success' | 'error' | null>(null)
  const [secondaryStatus, setSecondaryStatus] = useState<'success' | 'error' | null>(null)
  const [config, setConfig] = useState<LLMConfig | null>(null)

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
      const res = await fetch('/api/settings/llm', { credentials: 'include' })
      const data = await res.json()
      if (res.ok) {
        setConfig(data.config)
      } else {
        message.error(data.error || '載入設定失敗')
      }
    } catch {
      message.error('載入設定失敗')
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    if (!config) return

    setSaving(true)
    try {
      const res = await fetch('/api/settings/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ config }),
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

  const testConnection = async (provider: 'primary' | 'secondary') => {
    const setTesting = provider === 'primary' ? setTestingPrimary : setTestingSecondary
    const setStatus = provider === 'primary' ? setPrimaryStatus : setSecondaryStatus

    setTesting(true)
    setStatus(null)

    try {
      const res = await fetch('/api/settings/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'test', provider }),
      })
      const data = await res.json()
      if (data.success) {
        setStatus('success')
        message.success(`${provider === 'primary' ? 'Primary' : 'Secondary'} 連線成功`)
      } else {
        setStatus('error')
        message.error(data.message || '連線失敗')
      }
    } catch {
      setStatus('error')
      message.error('連線測試失敗')
    } finally {
      setTesting(false)
    }
  }

  const updatePrimary = (updates: Partial<LLMProviderConfig>) => {
    if (!config) return
    setConfig({
      ...config,
      primary: { ...config.primary, ...updates },
    })
    setPrimaryStatus(null)
  }

  const updateSecondary = (updates: Partial<LLMProviderConfig>) => {
    if (!config) return
    setConfig({
      ...config,
      secondary: { ...(config.secondary || { type: 'openrouter', baseUrl: '', model: '' }), ...updates },
    })
    setSecondaryStatus(null)
  }

  const swapPrimarySecondary = () => {
    if (!config) return
    const oldPrimary = { ...config.primary }
    const oldSecondary = config.secondary ? { ...config.secondary } : { type: 'vllm' as const, baseUrl: '', model: '' }
    setConfig({
      ...config,
      primary: oldSecondary,
      secondary: oldPrimary,
    })
    setPrimaryStatus(null)
    setSecondaryStatus(null)
    message.info('已對調 Primary / Secondary，請記得儲存')
  }

  if (userLoading || !isAdmin) {
    return null
  }

  return (
    <AppLayout>
      <Title level={4} style={{ marginBottom: 24 }}>
        <RobotOutlined style={{ marginRight: 8 }} />
        LLM 設定
      </Title>

      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        title="共用 LLM 設定"
        description="此設定適用於所有使用 LLM 的功能，包括 Slack 訊息分類、對話彙整等。"
      />

      <Space style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={saving}
          onClick={saveConfig}
        >
          儲存設定
        </Button>
        {config && (
          <Text type="secondary">
            上次更新：{new Date(config.updatedAt).toLocaleString('zh-TW')} by {config.updatedBy}
          </Text>
        )}
      </Space>

      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {/* Primary LLM */}
        <Card
          title={
            <Space>
              <Tag color="blue">Primary</Tag>
              主要 LLM
              {primaryStatus === 'success' && <CheckCircleOutlined style={{ color: '#52c41a' }} />}
              {primaryStatus === 'error' && <CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
            </Space>
          }
          extra={
            <Button
              icon={testingPrimary ? <LoadingOutlined /> : <ApiOutlined />}
              loading={testingPrimary}
              onClick={() => testConnection('primary')}
            >
              測試連線
            </Button>
          }
          loading={loading}
        >
          <Form layout="vertical" style={{ maxWidth: 500 }}>
            <Form.Item label="提供者類型">
              <Select
                value={config?.primary?.type || 'vllm'}
                onChange={v => updatePrimary({ type: v })}
                style={{ width: 200 }}
              >
                <Select.Option value="vllm">vLLM (自架)</Select.Option>
                <Select.Option value="openrouter">OpenRouter</Select.Option>
                <Select.Option value="openai">OpenAI</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item label="API 位址">
              <Input
                value={config?.primary?.baseUrl}
                onChange={e => updatePrimary({ baseUrl: e.target.value })}
                placeholder={
                  config?.primary?.type === 'openrouter'
                    ? 'https://openrouter.ai/api'
                    : config?.primary?.type === 'openai'
                    ? 'https://api.openai.com'
                    : 'http://192.168.30.46:8000'
                }
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {config?.primary?.type === 'vllm' && '自架 vLLM 服務的 HTTP 位址'}
                {config?.primary?.type === 'openrouter' && 'OpenRouter API 端點'}
                {config?.primary?.type === 'openai' && 'OpenAI API 端點'}
              </Text>
            </Form.Item>

            <Form.Item label="模型名稱">
              <Input
                value={config?.primary?.model}
                onChange={e => updatePrimary({ model: e.target.value })}
                placeholder={
                  config?.primary?.type === 'openrouter'
                    ? 'anthropic/claude-3.5-sonnet'
                    : config?.primary?.type === 'openai'
                    ? 'gpt-4o'
                    : '/models/gpt-oss-120b'
                }
              />
            </Form.Item>

            {config?.primary?.type !== 'vllm' && (
              <Form.Item label="API Key">
                <Input.Password
                  value={config?.primary?.apiKey}
                  onChange={e => updatePrimary({ apiKey: e.target.value })}
                  placeholder="sk-..."
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {config?.primary?.apiKey === '******' ? '已設定 (輸入新值以覆蓋)' : '尚未設定'}
                </Text>
              </Form.Item>
            )}
          </Form>
        </Card>

        {/* Swap button */}
        <div style={{ textAlign: 'center' }}>
          <Button
            icon={<SwapOutlined />}
            onClick={swapPrimarySecondary}
            disabled={!config}
          >
            對調 Primary / Secondary
          </Button>
        </div>

        {/* Secondary LLM */}
        <Card
          title={
            <Space>
              <Tag color="orange">Secondary</Tag>
              備援 LLM
              <Switch
                size="small"
                checked={config?.useSecondaryOnFailure}
                onChange={v => config && setConfig({ ...config, useSecondaryOnFailure: v })}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Primary 失敗時自動切換
              </Text>
              {secondaryStatus === 'success' && <CheckCircleOutlined style={{ color: '#52c41a' }} />}
              {secondaryStatus === 'error' && <CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
            </Space>
          }
          extra={
            <Button
              icon={testingSecondary ? <LoadingOutlined /> : <ApiOutlined />}
              loading={testingSecondary}
              onClick={() => testConnection('secondary')}
              disabled={!config?.useSecondaryOnFailure}
            >
              測試連線
            </Button>
          }
          loading={loading}
        >
          <Form layout="vertical" style={{ maxWidth: 500 }}>
            <Form.Item label="提供者類型">
              <Select
                value={config?.secondary?.type || 'openrouter'}
                onChange={v => updateSecondary({ type: v })}
                style={{ width: 200 }}
                disabled={!config?.useSecondaryOnFailure}
              >
                <Select.Option value="vllm">vLLM (自架)</Select.Option>
                <Select.Option value="openrouter">OpenRouter</Select.Option>
                <Select.Option value="openai">OpenAI</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item label="API 位址">
              <Input
                value={config?.secondary?.baseUrl}
                onChange={e => updateSecondary({ baseUrl: e.target.value })}
                placeholder="https://openrouter.ai/api"
                disabled={!config?.useSecondaryOnFailure}
              />
            </Form.Item>

            <Form.Item label="模型名稱">
              <Input
                value={config?.secondary?.model}
                onChange={e => updateSecondary({ model: e.target.value })}
                placeholder="anthropic/claude-3.5-sonnet"
                disabled={!config?.useSecondaryOnFailure}
              />
            </Form.Item>

            {config?.secondary?.type !== 'vllm' && (
              <Form.Item label="API Key">
                <Input.Password
                  value={config?.secondary?.apiKey}
                  onChange={e => updateSecondary({ apiKey: e.target.value })}
                  placeholder="sk-..."
                  disabled={!config?.useSecondaryOnFailure}
                />
              </Form.Item>
            )}
          </Form>
        </Card>

        {/* 通用參數 */}
        <Card title="通用參數" loading={loading}>
          <Form layout="vertical" style={{ maxWidth: 500 }}>
            <Form.Item label="預設 Temperature">
              <InputNumber
                min={0}
                max={1}
                step={0.1}
                value={config?.defaultTemperature}
                onChange={v => config && setConfig({ ...config, defaultTemperature: v || 0.2 })}
              />
              <Text type="secondary" style={{ marginLeft: 8 }}>
                數值越低結果越穩定 (0-1)
              </Text>
            </Form.Item>

            <Form.Item label="預設 Max Tokens">
              <InputNumber
                min={100}
                max={8000}
                step={100}
                value={config?.defaultMaxTokens}
                onChange={v => config && setConfig({ ...config, defaultMaxTokens: v || 2000 })}
              />
              <Text type="secondary" style={{ marginLeft: 8 }}>
                每次請求的最大回應長度
              </Text>
            </Form.Item>
          </Form>
        </Card>
      </Space>
    </AppLayout>
  )
}
