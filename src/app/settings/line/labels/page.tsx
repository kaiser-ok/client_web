'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Table,
  Button,
  Switch,
  Input,
  InputNumber,
  Tag,
  Space,
  App,
  Card,
  Form,
  Slider,
  Popconfirm,
  Typography,
  Tooltip,
  ColorPicker,
} from 'antd'
import {
  SaveOutlined,
  UndoOutlined,
  PlusOutlined,
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons'
import AppLayout from '@/components/layout/AppLayout'
import type { LineLabelConfig, LineLabelDefinition } from '@/types/line-label'

const { Title, Text } = Typography

const ANTD_COLORS = [
  'blue', 'red', 'orange', 'pink', 'green', 'cyan', 'purple', 'gold',
  'lime', 'magenta', 'volcano', 'geekblue',
]

export default function LineLabelSettingsPage() {
  const { message } = App.useApp()
  const [config, setConfig] = useState<LineLabelConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/line-labels')
      const data = await res.json()
      if (res.ok) {
        setConfig(data.config)
        setDirty(false)
      } else {
        message.error(data.error || '載入設定失敗')
      }
    } catch {
      message.error('載入設定失敗')
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    try {
      const res = await fetch('/api/settings/line-labels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      })
      const data = await res.json()
      if (res.ok) {
        setConfig(data.config)
        setDirty(false)
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

  const handleReset = async () => {
    try {
      const res = await fetch('/api/settings/line-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      })
      const data = await res.json()
      if (res.ok) {
        setConfig(data.config)
        setDirty(false)
        message.success('已重設為預設值')
      }
    } catch {
      message.error('重設失敗')
    }
  }

  const updateLabel = (index: number, field: keyof LineLabelDefinition, value: unknown) => {
    if (!config) return
    const labels = [...config.labels]
    labels[index] = { ...labels[index], [field]: value }
    setConfig({ ...config, labels })
    setDirty(true)
  }

  const addLabel = () => {
    if (!config) return
    const maxOrder = Math.max(...config.labels.map(l => l.order), 0)
    const newLabel: LineLabelDefinition = {
      id: `label_${Date.now()}`,
      label: '新標籤',
      description: '',
      color: 'blue',
      icon: 'TagOutlined',
      enabled: true,
      autoApply: false,
      keywords: [],
      order: maxOrder + 1,
    }
    setConfig({ ...config, labels: [...config.labels, newLabel] })
    setDirty(true)
  }

  const removeLabel = (index: number) => {
    if (!config) return
    const labels = config.labels.filter((_, i) => i !== index)
    setConfig({ ...config, labels })
    setDirty(true)
  }

  const moveLabel = (index: number, direction: 'up' | 'down') => {
    if (!config) return
    const labels = [...config.labels]
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= labels.length) return
    ;[labels[index], labels[newIndex]] = [labels[newIndex], labels[index]]
    // Update order values
    labels.forEach((l, i) => { l.order = i + 1 })
    setConfig({ ...config, labels })
    setDirty(true)
  }

  if (!config) {
    return (
      <AppLayout>
        <div style={{ padding: 24 }}>載入中...</div>
      </AppLayout>
    )
  }

  const columns = [
    {
      title: '排序',
      width: 80,
      render: (_: unknown, __: unknown, index: number) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<ArrowUpOutlined />}
            disabled={index === 0}
            onClick={() => moveLabel(index, 'up')}
          />
          <Button
            type="text"
            size="small"
            icon={<ArrowDownOutlined />}
            disabled={index === config.labels.length - 1}
            onClick={() => moveLabel(index, 'down')}
          />
        </Space>
      ),
    },
    {
      title: '啟用',
      width: 70,
      render: (_: unknown, __: unknown, index: number) => (
        <Switch
          checked={config.labels[index].enabled}
          onChange={v => updateLabel(index, 'enabled', v)}
          size="small"
        />
      ),
    },
    {
      title: '標籤',
      width: 150,
      render: (_: unknown, record: LineLabelDefinition, index: number) => (
        <Space direction="vertical" size={4}>
          <Tag color={record.color}>{record.label}</Tag>
          <Input
            size="small"
            value={record.label}
            onChange={e => updateLabel(index, 'label', e.target.value)}
            style={{ width: 120 }}
          />
        </Space>
      ),
    },
    {
      title: '顏色',
      width: 160,
      render: (_: unknown, record: LineLabelDefinition, index: number) => (
        <Space direction="vertical" size={4}>
          <Space wrap size={4}>
            {ANTD_COLORS.map(c => (
              <Tag
                key={c}
                color={c}
                style={{
                  cursor: 'pointer',
                  border: record.color === c ? '2px solid #333' : '2px solid transparent',
                  padding: '0 4px',
                  fontSize: 10,
                }}
                onClick={() => updateLabel(index, 'color', c)}
              >
                {c === record.color ? '✓' : ' '}
              </Tag>
            ))}
          </Space>
          <Space size={4}>
            <ColorPicker
              size="small"
              value={record.color.startsWith('#') ? record.color : undefined}
              onChange={(_, hex) => updateLabel(index, 'color', hex)}
            />
            {record.color.startsWith('#') && (
              <Tag color={record.color} style={{ fontSize: 10 }}>{record.color}</Tag>
            )}
          </Space>
        </Space>
      ),
    },
    {
      title: '說明',
      render: (_: unknown, record: LineLabelDefinition, index: number) => (
        <Input
          size="small"
          value={record.description}
          onChange={e => updateLabel(index, 'description', e.target.value)}
        />
      ),
    },
    {
      title: '關鍵字',
      width: 200,
      render: (_: unknown, record: LineLabelDefinition, index: number) => (
        <Input
          size="small"
          value={record.keywords.join(', ')}
          onChange={e => {
            const keywords = e.target.value.split(',').map(k => k.trim()).filter(Boolean)
            updateLabel(index, 'keywords', keywords)
          }}
          placeholder="逗號分隔"
        />
      ),
    },
    {
      title: '自動標注',
      width: 80,
      render: (_: unknown, __: unknown, index: number) => (
        <Tooltip title="LLM 可自動套用此標籤">
          <Switch
            checked={config.labels[index].autoApply}
            onChange={v => updateLabel(index, 'autoApply', v)}
            size="small"
          />
        </Tooltip>
      ),
    },
    {
      title: '',
      width: 50,
      render: (_: unknown, __: unknown, index: number) => (
        <Popconfirm
          title="確定刪除此標籤？"
          onConfirm={() => removeLabel(index)}
        >
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 1200 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Title level={4} style={{ margin: 0 }}>LINE 頻道標籤設定</Title>
          <Space>
            <Popconfirm title="確定重設為預設值？" onConfirm={handleReset}>
              <Button icon={<UndoOutlined />}>重設</Button>
            </Popconfirm>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={saving}
              disabled={!dirty}
            >
              儲存
            </Button>
          </Space>
        </div>

        {/* Label definitions */}
        <Card title="標籤定義" style={{ marginBottom: 24 }}>
          <Table
            dataSource={config.labels}
            columns={columns}
            rowKey="id"
            pagination={false}
            size="small"
            loading={loading}
          />
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={addLabel}
            style={{ width: '100%', marginTop: 12 }}
          >
            新增標籤
          </Button>
        </Card>

        {/* LLM Settings */}
        <Card title="LLM 自動標注設定">
          <Form layout="vertical" style={{ maxWidth: 500 }}>
            <Form.Item label="啟用 LLM 自動標注">
              <Switch
                checked={config.llmSettings.enabled}
                onChange={v => {
                  setConfig({ ...config, llmSettings: { ...config.llmSettings, enabled: v } })
                  setDirty(true)
                }}
              />
            </Form.Item>

            <Form.Item label={`Debounce 秒數 (${config.llmSettings.debounceSeconds}s)`}>
              <Slider
                min={30}
                max={600}
                step={30}
                value={config.llmSettings.debounceSeconds}
                onChange={v => {
                  setConfig({ ...config, llmSettings: { ...config.llmSettings, debounceSeconds: v } })
                  setDirty(true)
                }}
                disabled={!config.llmSettings.enabled}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                收到訊息後等待多久才觸發分析，避免頻繁呼叫 LLM
              </Text>
            </Form.Item>

            <Form.Item label="最少訊息數">
              <InputNumber
                min={1}
                max={20}
                value={config.llmSettings.minMessages}
                onChange={v => {
                  if (v) {
                    setConfig({ ...config, llmSettings: { ...config.llmSettings, minMessages: v } })
                    setDirty(true)
                  }
                }}
                disabled={!config.llmSettings.enabled}
              />
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                分析窗口內至少要有幾則訊息才觸發分析
              </Text>
            </Form.Item>

            <Form.Item label={`分析窗口 (${config.llmSettings.analysisWindow} 分鐘)`}>
              <Slider
                min={10}
                max={240}
                step={10}
                value={config.llmSettings.analysisWindow}
                onChange={v => {
                  setConfig({ ...config, llmSettings: { ...config.llmSettings, analysisWindow: v } })
                  setDirty(true)
                }}
                disabled={!config.llmSettings.enabled}
              />
            </Form.Item>

            <Form.Item label={`信心度門檻 (${config.llmSettings.autoApplyThreshold})`}>
              <Slider
                min={0.5}
                max={1}
                step={0.05}
                value={config.llmSettings.autoApplyThreshold}
                onChange={v => {
                  setConfig({ ...config, llmSettings: { ...config.llmSettings, autoApplyThreshold: v } })
                  setDirty(true)
                }}
                disabled={!config.llmSettings.enabled}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                LLM 信心度大於等於此值才自動套用標籤
              </Text>
            </Form.Item>

            <Form.Item label={`Temperature (${config.llmSettings.temperature})`}>
              <Slider
                min={0}
                max={1}
                step={0.1}
                value={config.llmSettings.temperature}
                onChange={v => {
                  setConfig({ ...config, llmSettings: { ...config.llmSettings, temperature: v } })
                  setDirty(true)
                }}
                disabled={!config.llmSettings.enabled}
              />
            </Form.Item>
          </Form>
        </Card>
      </div>
    </AppLayout>
  )
}
