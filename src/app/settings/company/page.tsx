'use client'

import { useState, useEffect } from 'react'
import {
  Card,
  Typography,
  Button,
  Space,
  Form,
  Input,
  InputNumber,
  App,
  Divider,
  List,
} from 'antd'
import {
  SaveOutlined,
  PlusOutlined,
  DeleteOutlined,
  BankOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { useUser } from '@/hooks/useUser'
import type { CompanyConfig, BankInfo } from '@/types/company'

const { Title, Text } = Typography

export default function CompanySettingsPage() {
  const router = useRouter()
  const { role, isLoading: userLoading } = useUser()
  const { message } = App.useApp()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<CompanyConfig | null>(null)
  const [form] = Form.useForm()

  const isAdmin = role === 'ADMIN'

  useEffect(() => {
    if (!userLoading && !isAdmin) {
      router.replace('/')
    }
  }, [userLoading, isAdmin, router])

  useEffect(() => {
    if (isAdmin) {
      loadConfig()
    }
  }, [isAdmin])

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/settings/company')
      if (response.ok) {
        const data = await response.json()
        setConfig(data.config)
      }
    } catch (error) {
      console.error('Failed to load config:', error)
      message.error('載入設定失敗')
    } finally {
      setLoading(false)
    }
  }

  // 當 config 載入完成且不在 loading 狀態時，設定表單值
  useEffect(() => {
    if (config && !loading) {
      form.setFieldsValue({
        ...config,
        defaultTerms: config.defaultTerms || [],
      })
    }
  }, [config, loading, form])

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)

      const response = await fetch('/api/settings/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })

      if (response.ok) {
        const data = await response.json()
        setConfig(data.config)
        message.success('公司資訊已更新')
      } else {
        const error = await response.json()
        message.error(error.error || '更新失敗')
      }
    } catch (error) {
      console.error('Failed to save config:', error)
      if (error instanceof Error && error.message !== 'Validation failed') {
        message.error('儲存失敗')
      }
    } finally {
      setSaving(false)
    }
  }

  if (userLoading || loading) {
    return (
      <AppLayout>
        <Card loading={true} />
      </AppLayout>
    )
  }

  if (!isAdmin) {
    return null
  }

  return (
    <AppLayout>
      <Card
        title={
          <Space>
            <BankOutlined />
            <span>公司資訊設定</span>
          </Space>
        }
        extra={
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSave}
          >
            儲存設定
          </Button>
        }
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={config || undefined}
        >
          <Title level={5}>基本資訊</Title>

          <Form.Item
            name="name"
            label="公司名稱"
            rules={[{ required: true, message: '請輸入公司名稱' }]}
          >
            <Input placeholder="公司名稱" />
          </Form.Item>

          <Form.Item name="address" label="公司地址">
            <Input placeholder="台北市..." />
          </Form.Item>

          <Space size="large" style={{ width: '100%' }}>
            <Form.Item name="phone" label="電話" style={{ flex: 1 }}>
              <Input placeholder="02-1234-5678" />
            </Form.Item>
            <Form.Item name="email" label="Email" style={{ flex: 1 }}>
              <Input placeholder="sales@company.com" />
            </Form.Item>
          </Space>

          <Space size="large" style={{ width: '100%' }}>
            <Form.Item name="contactPerson" label="聯絡人" style={{ flex: 1 }}>
              <Input placeholder="王大明" />
            </Form.Item>
            <Form.Item name="contactTitle" label="職稱" style={{ flex: 1 }}>
              <Input placeholder="專案經理" />
            </Form.Item>
          </Space>

          <Divider />
          <Title level={5}>匯款資訊</Title>

          <Space size="large" style={{ width: '100%' }}>
            <Form.Item
              name={['bankInfo', 'bankName']}
              label="銀行名稱"
              style={{ flex: 1 }}
            >
              <Input placeholder="玉山銀行" />
            </Form.Item>
            <Form.Item
              name={['bankInfo', 'bankCode']}
              label="銀行代碼"
              style={{ flex: 1 }}
            >
              <Input placeholder="808" />
            </Form.Item>
            <Form.Item
              name={['bankInfo', 'branchName']}
              label="分行名稱"
              style={{ flex: 1 }}
            >
              <Input placeholder="內湖分行" />
            </Form.Item>
          </Space>

          <Space size="large" style={{ width: '100%' }}>
            <Form.Item
              name={['bankInfo', 'accountNumber']}
              label="帳號"
              style={{ flex: 1 }}
            >
              <Input placeholder="1234-5678-9012" />
            </Form.Item>
            <Form.Item
              name={['bankInfo', 'accountName']}
              label="戶名"
              style={{ flex: 1 }}
            >
              <Input placeholder="公司名稱" />
            </Form.Item>
          </Space>

          <Divider />
          <Title level={5}>報價單設定</Title>

          <Space size="large" style={{ width: '100%' }}>
            <Form.Item
              name="taxRate"
              label="稅率"
              style={{ flex: 1 }}
            >
              <InputNumber
                min={0}
                max={1}
                step={0.01}
                formatter={value => `${(Number(value) * 100).toFixed(0)}%`}
                parser={value => (Number(value?.replace('%', '')) / 100) as unknown as 0}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item
              name="validDays"
              label="報價有效天數"
              style={{ flex: 1 }}
            >
              <InputNumber min={1} max={365} addonAfter="天" style={{ width: '100%' }} />
            </Form.Item>
          </Space>

          <Form.Item name="logoPath" label="Logo 路徑">
            <Input placeholder="/images/company-logo.png" />
          </Form.Item>

          <Divider />
          <Title level={5}>預設條款</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            這些條款會顯示在報價單的備註與條款區域
          </Text>

          <Form.List name="defaultTerms">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Space key={key} style={{ display: 'flex', marginBottom: 8, width: '100%' }} align="start">
                    <Form.Item
                      {...restField}
                      name={name}
                      style={{ marginBottom: 0, flex: 1 }}
                    >
                      <Input.TextArea
                        rows={2}
                        placeholder="輸入條款內容..."
                      />
                    </Form.Item>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(name)}
                    />
                  </Space>
                ))}
                <Form.Item>
                  <Button
                    type="dashed"
                    onClick={() => add('')}
                    icon={<PlusOutlined />}
                    style={{ width: '100%' }}
                  >
                    新增條款
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>

          {config?.updatedAt && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              最後更新：{new Date(config.updatedAt).toLocaleString('zh-TW')}
              {config.updatedBy && ` (${config.updatedBy})`}
            </Text>
          )}
        </Form>
      </Card>
    </AppLayout>
  )
}
