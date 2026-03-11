'use client'

import { useState, useEffect } from 'react'
import {
  Card,
  Typography,
  Button,
  Space,
  Divider,
  Table,
  Tag,
  Switch,
  Input,
  Modal,
  Form,
  Select,
  InputNumber,
  Popconfirm,
  App,
  Tabs,
  Alert,
  Tooltip,
  Badge,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
  SaveOutlined,
  ReloadOutlined,
  QuestionCircleOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { useUser } from '@/hooks/useUser'
import type {
  SlackClassificationConfig,
  CategoryDefinition,
  PriorityRule,
  PriorityCondition,
} from '@/types/slack-classification'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

export default function SlackClassificationSettingsPage() {
  const router = useRouter()
  const { role, isLoading } = useUser()
  const { message, modal } = App.useApp()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<SlackClassificationConfig | null>(null)
  const [editingRule, setEditingRule] = useState<PriorityRule | null>(null)
  const [ruleModalOpen, setRuleModalOpen] = useState(false)
  const [form] = Form.useForm()

  const canAccessSlack = role === 'ADMIN' || role === 'SUPPORT'

  // 載入設定
  useEffect(() => {
    if (canAccessSlack) {
      loadConfig()
    }
  }, [canAccessSlack])

  // 權限檢查
  useEffect(() => {
    if (!isLoading && !canAccessSlack) {
      router.replace('/')
    }
  }, [isLoading, canAccessSlack, router])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/slack-classification', {
        credentials: 'include',
      })
      const data = await res.json()
      if (res.ok) {
        setConfig(data.config)
      } else {
        message.error(data.error || '載入設定失敗')
      }
    } catch (error) {
      message.error('載入設定失敗')
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    if (!config) return

    setSaving(true)
    try {
      const res = await fetch('/api/settings/slack-classification', {
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
    } catch (error) {
      message.error('儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  const resetConfig = async () => {
    modal.confirm({
      title: '確認重置',
      content: '確定要重置為預設設定嗎？所有自訂規則將會遺失。',
      okText: '確認重置',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await fetch('/api/settings/slack-classification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ action: 'reset' }),
          })
          const data = await res.json()
          if (res.ok) {
            setConfig(data.config)
            message.success('已重置為預設設定')
          } else {
            message.error(data.error || '重置失敗')
          }
        } catch (error) {
          message.error('重置失敗')
        }
      },
    })
  }

  // 更新分類啟用狀態
  const toggleCategory = (categoryId: string, enabled: boolean) => {
    if (!config) return
    setConfig({
      ...config,
      categories: config.categories.map(c =>
        c.id === categoryId ? { ...c, enabled } : c
      ),
    })
  }

  // 更新分類關鍵字
  const updateCategoryKeywords = (categoryId: string, keywords: string[]) => {
    if (!config) return
    setConfig({
      ...config,
      categories: config.categories.map(c =>
        c.id === categoryId ? { ...c, keywords } : c
      ),
    })
  }

  // 更新規則啟用狀態
  const toggleRule = (ruleId: string, enabled: boolean) => {
    if (!config) return
    setConfig({
      ...config,
      priorityRules: config.priorityRules.map(r =>
        r.id === ruleId ? { ...r, enabled } : r
      ),
    })
  }

  // 刪除規則
  const deleteRule = (ruleId: string) => {
    if (!config) return
    setConfig({
      ...config,
      priorityRules: config.priorityRules.filter(r => r.id !== ruleId),
    })
  }

  // 移動規則順序
  const moveRule = (ruleId: string, direction: 'up' | 'down') => {
    if (!config) return
    const rules = [...config.priorityRules].sort((a, b) => a.order - b.order)
    const index = rules.findIndex(r => r.id === ruleId)
    if (index === -1) return

    if (direction === 'up' && index > 0) {
      const temp = rules[index - 1].order
      rules[index - 1].order = rules[index].order
      rules[index].order = temp
    } else if (direction === 'down' && index < rules.length - 1) {
      const temp = rules[index + 1].order
      rules[index + 1].order = rules[index].order
      rules[index].order = temp
    }

    setConfig({ ...config, priorityRules: rules })
  }

  // 開啟規則編輯 Modal
  const openRuleModal = (rule?: PriorityRule) => {
    if (rule) {
      setEditingRule(rule)
      form.setFieldsValue({
        name: rule.name,
        description: rule.description,
        priority: rule.priority,
        keywords: rule.conditions
          .filter(c => c.type === 'keyword')
          .flatMap(c => Array.isArray(c.value) ? c.value : [c.value])
          .join(', '),
        channelPattern: rule.conditions
          .filter(c => c.type === 'channel')
          .map(c => c.value)
          .join(', '),
      })
    } else {
      setEditingRule(null)
      form.resetFields()
    }
    setRuleModalOpen(true)
  }

  // 儲存規則
  const saveRule = async () => {
    try {
      const values = await form.validateFields()
      if (!config) return

      const conditions: PriorityCondition[] = []

      // 關鍵字條件
      if (values.keywords) {
        const keywords = values.keywords.split(',').map((k: string) => k.trim()).filter(Boolean)
        if (keywords.length > 0) {
          conditions.push({
            type: 'keyword',
            operator: 'contains',
            value: keywords,
          })
        }
      }

      // 頻道條件
      if (values.channelPattern) {
        conditions.push({
          type: 'channel',
          operator: 'contains',
          value: values.channelPattern.trim(),
        })
      }

      if (conditions.length === 0) {
        message.error('請至少設定一個條件')
        return
      }

      const newRule: PriorityRule = {
        id: editingRule?.id || `rule_${Date.now()}`,
        name: values.name,
        description: values.description || '',
        priority: values.priority,
        conditions,
        enabled: true,
        order: editingRule?.order || config.priorityRules.length + 1,
      }

      if (editingRule) {
        setConfig({
          ...config,
          priorityRules: config.priorityRules.map(r =>
            r.id === editingRule.id ? newRule : r
          ),
        })
      } else {
        setConfig({
          ...config,
          priorityRules: [...config.priorityRules, newRule],
        })
      }

      setRuleModalOpen(false)
      message.success(editingRule ? '規則已更新' : '規則已新增')
    } catch (error) {
      // Form validation error
    }
  }

  const priorityColor = {
    high: 'red',
    medium: 'orange',
    low: 'default',
  }

  const priorityLabel = {
    high: '高',
    medium: '中',
    low: '低',
  }

  // 分類表格欄位
  const categoryColumns = [
    {
      title: '啟用',
      dataIndex: 'enabled',
      width: 80,
      render: (enabled: boolean, record: CategoryDefinition) => (
        <Switch
          checked={enabled}
          onChange={v => toggleCategory(record.id, v)}
          size="small"
        />
      ),
    },
    {
      title: '分類',
      dataIndex: 'label',
      width: 120,
      render: (label: string, record: CategoryDefinition) => (
        <Space>
          <Text strong>{label}</Text>
          <Tooltip title={record.description}>
            <QuestionCircleOutlined style={{ color: '#999' }} />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: '關鍵字',
      dataIndex: 'keywords',
      render: (keywords: string[], record: CategoryDefinition) => (
        <Select
          mode="tags"
          style={{ width: '100%' }}
          value={keywords}
          onChange={v => updateCategoryKeywords(record.id, v)}
          placeholder="輸入關鍵字後按 Enter"
          tokenSeparators={[',']}
        />
      ),
    },
  ]

  // 優先級規則表格欄位
  const ruleColumns = [
    {
      title: '順序',
      dataIndex: 'order',
      width: 100,
      render: (order: number, record: PriorityRule, index: number) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<ArrowUpOutlined />}
            disabled={index === 0}
            onClick={() => moveRule(record.id, 'up')}
          />
          <Button
            type="text"
            size="small"
            icon={<ArrowDownOutlined />}
            disabled={index === (config?.priorityRules.length || 0) - 1}
            onClick={() => moveRule(record.id, 'down')}
          />
        </Space>
      ),
    },
    {
      title: '啟用',
      dataIndex: 'enabled',
      width: 80,
      render: (enabled: boolean, record: PriorityRule) => (
        <Switch
          checked={enabled}
          onChange={v => toggleRule(record.id, v)}
          size="small"
        />
      ),
    },
    {
      title: '優先級',
      dataIndex: 'priority',
      width: 100,
      render: (priority: 'high' | 'medium' | 'low') => (
        <Tag color={priorityColor[priority]}>{priorityLabel[priority]}</Tag>
      ),
    },
    {
      title: '規則名稱',
      dataIndex: 'name',
      width: 150,
    },
    {
      title: '條件',
      dataIndex: 'conditions',
      render: (conditions: PriorityCondition[]) => (
        <Space wrap size="small">
          {conditions.map((c, i) => {
            const values = Array.isArray(c.value) ? c.value : [c.value]
            return values.slice(0, 3).map((v, j) => (
              <Tag key={`${i}-${j}`} color="blue">
                {c.type === 'keyword' ? v : `頻道: ${v}`}
              </Tag>
            ))
          })}
          {conditions.some(c => Array.isArray(c.value) && c.value.length > 3) && (
            <Tag>...</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '操作',
      width: 120,
      render: (_: unknown, record: PriorityRule) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openRuleModal(record)}
          />
          <Popconfirm
            title="確定要刪除此規則？"
            onConfirm={() => deleteRule(record.id)}
            okText="刪除"
            cancelText="取消"
          >
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // 載入中或非管理員時只顯示 Modal（保持 Form 連接）
  if (isLoading || !canAccessSlack) {
    return (
      <>
        <Modal
          title={editingRule ? '編輯規則' : '新增規則'}
          open={false}
          destroyOnHidden={false}
        >
          <Form form={form} layout="vertical" preserve={false} />
        </Modal>
      </>
    )
  }

  return (
    <AppLayout>
      <Space style={{ marginBottom: 16 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push('/settings/slack')}
        >
          返回
        </Button>
        <Title level={4} style={{ margin: 0 }}>
          Slack 訊息分類設定
        </Title>
      </Space>

      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        title="訊息分類說明"
        description="系統會根據以下規則判斷 Slack 訊息的分類和優先級。優先級規則按順序評估，符合條件即停止。"
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
        <Button
          icon={<ReloadOutlined />}
          onClick={resetConfig}
        >
          重置為預設
        </Button>
        {config && (
          <Text type="secondary" style={{ marginLeft: 16 }}>
            上次更新：{new Date(config.updatedAt).toLocaleString('zh-TW')} by {config.updatedBy}
          </Text>
        )}
      </Space>

      <Tabs
        defaultActiveKey="priority"
        items={[
          {
            key: 'priority',
            label: (
              <Badge count={config?.priorityRules.filter(r => r.enabled).length} size="small">
                <span style={{ marginRight: 8 }}>優先級規則</span>
              </Badge>
            ),
            children: (
              <Card
                title="優先級判斷規則"
                extra={
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => openRuleModal()}
                  >
                    新增規則
                  </Button>
                }
              >
                <Paragraph type="secondary">
                  規則按順序評估，符合任一條件即判定為該優先級。未符合任何規則的訊息預設為「中」優先級。
                </Paragraph>
                <Table
                  dataSource={config?.priorityRules.sort((a, b) => a.order - b.order)}
                  columns={ruleColumns}
                  rowKey="id"
                  loading={loading}
                  pagination={false}
                  size="small"
                />
              </Card>
            ),
          },
          {
            key: 'categories',
            label: (
              <Badge count={config?.categories.filter(c => c.enabled).length} size="small">
                <span style={{ marginRight: 8 }}>分類定義</span>
              </Badge>
            ),
            children: (
              <Card title="訊息分類">
                <Paragraph type="secondary">
                  定義訊息的分類類型和對應的關鍵字。LLM 分類時會參考這些定義。
                </Paragraph>
                <Table
                  dataSource={config?.categories}
                  columns={categoryColumns}
                  rowKey="id"
                  loading={loading}
                  pagination={false}
                  size="small"
                />
              </Card>
            ),
          },
          {
            key: 'llm',
            label: 'LLM 設定',
            children: (
              <Card title="Slack 分類 LLM 設定">
                <Alert
                  style={{ marginBottom: 16 }}
                  type="info"
                  showIcon
                  title="LLM 連線設定請至「設定 → LLM 設定」進行管理"
                />

                <Form layout="vertical" style={{ maxWidth: 500 }}>
                  <Form.Item label="啟用 LLM 分類">
                    <Switch
                      checked={config?.llmSettings.enabled}
                      onChange={v => config && setConfig({
                        ...config,
                        llmSettings: { ...config.llmSettings, enabled: v },
                      })}
                    />
                    <Text type="secondary" style={{ marginLeft: 8 }}>
                      使用 LLM 進行智慧分類
                    </Text>
                  </Form.Item>

                  <Divider>批次設定</Divider>

                  <Form.Item label="批次模式">
                    <Select
                      value={config?.llmSettings.batchMode || 'count'}
                      onChange={v => config && setConfig({
                        ...config,
                        llmSettings: { ...config.llmSettings, batchMode: v },
                      })}
                      style={{ width: 200 }}
                    >
                      <Select.Option value="count">按訊息數量</Select.Option>
                      <Select.Option value="date">按日期分組</Select.Option>
                    </Select>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {config?.llmSettings.batchMode === 'date'
                        ? '同一天的訊息一起處理，保留對話上下文'
                        : '固定數量的訊息為一批次處理'
                      }
                    </Text>
                  </Form.Item>

                  {config?.llmSettings.batchMode !== 'date' && (
                    <Form.Item label="批次大小">
                      <InputNumber
                        min={1}
                        max={50}
                        value={config?.llmSettings.batchSize}
                        onChange={v => config && setConfig({
                          ...config,
                          llmSettings: { ...config.llmSettings, batchSize: v || 10 },
                        })}
                      />
                      <Text type="secondary" style={{ marginLeft: 8 }}>
                        每次 LLM 請求處理的訊息數量
                      </Text>
                    </Form.Item>
                  )}

                  <Divider>備援設定</Divider>

                  <Form.Item label="關鍵字備援">
                    <Switch
                      checked={config?.llmSettings.fallbackToKeywords}
                      onChange={v => config && setConfig({
                        ...config,
                        llmSettings: { ...config.llmSettings, fallbackToKeywords: v },
                      })}
                    />
                    <Text type="secondary" style={{ marginLeft: 8 }}>
                      LLM 失敗時使用關鍵字判斷
                    </Text>
                  </Form.Item>
                </Form>
              </Card>
            ),
          },
        ]}
      />

      {/* 規則編輯 Modal */}
      <Modal
        title={editingRule ? '編輯規則' : '新增規則'}
        open={ruleModalOpen}
        onOk={saveRule}
        onCancel={() => setRuleModalOpen(false)}
        okText="儲存"
        cancelText="取消"
        width={600}
        destroyOnHidden={false}
        forceRender
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="name"
            label="規則名稱"
            rules={[{ required: true, message: '請輸入規則名稱' }]}
          >
            <Input placeholder="例：故障關鍵字" />
          </Form.Item>
          <Form.Item name="description" label="說明">
            <Input placeholder="例：包含當機、故障等關鍵字的訊息" />
          </Form.Item>
          <Form.Item
            name="priority"
            label="優先級"
            rules={[{ required: true, message: '請選擇優先級' }]}
          >
            <Select placeholder="選擇優先級">
              <Select.Option value="high">
                <Tag color="red">高</Tag> - 需立即處理
              </Select.Option>
              <Select.Option value="medium">
                <Tag color="orange">中</Tag> - 一般工作事項
              </Select.Option>
              <Select.Option value="low">
                <Tag>低</Tag> - 可忽略
              </Select.Option>
            </Select>
          </Form.Item>
          <Divider>條件設定</Divider>
          <Form.Item
            name="keywords"
            label="關鍵字（逗號分隔）"
            tooltip="訊息內容包含任一關鍵字即符合"
          >
            <TextArea
              rows={2}
              placeholder="當機, 故障, 異常, 連不上, error"
            />
          </Form.Item>
          <Form.Item
            name="channelPattern"
            label="頻道名稱（包含）"
            tooltip="訊息來自包含此字串的頻道"
          >
            <Input placeholder="例：fae_客戶關懷部" />
          </Form.Item>
        </Form>
      </Modal>
    </AppLayout>
  )
}
