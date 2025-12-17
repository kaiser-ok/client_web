'use client'

import { useState, use } from 'react'
import { Tabs, Card, Modal, Form, Input, message, Button } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import CustomerHeader from '@/components/customers/CustomerHeader'
import OpenItemsTable from '@/components/open-items/OpenItemsTable'
import ActivityTimeline from '@/components/timeline/ActivityTimeline'
import { useCustomer, updateCustomer } from '@/hooks/useCustomer'

interface CustomerDetailPageProps {
  params: Promise<{ id: string }>
}

export default function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { customer, isLoading, mutate } = useCustomer(id)
  const [activeTab, setActiveTab] = useState('overview')
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [form] = Form.useForm()

  const handleEdit = () => {
    if (customer) {
      form.setFieldsValue(customer)
      setEditModalOpen(true)
    }
  }

  const handleUpdate = async (values: Record<string, unknown>) => {
    try {
      await updateCustomer(id, values)
      message.success('客戶資料已更新')
      setEditModalOpen(false)
      mutate()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新失敗')
    }
  }

  const handleSync = async () => {
    if (!customer?.jiraProject) {
      message.warning('此客戶尚未設定 Jira 專案')
      return
    }

    try {
      const response = await fetch(`/api/open-items/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: id,
          projectKey: customer.jiraProject,
        }),
      })

      if (!response.ok) {
        throw new Error('同步失敗')
      }

      message.success('Jira 同步完成')
      mutate()
    } catch (error) {
      message.error('Jira 同步失敗，請檢查設定')
    }
  }

  const tabItems = [
    {
      key: 'overview',
      label: '總覽',
      children: (
        <div>
          <Card title="待處理問題" style={{ marginBottom: 16 }}>
            <OpenItemsTable customerId={id} compact />
          </Card>
          <Card title="最近活動">
            <ActivityTimeline customerId={id} limit={5} />
          </Card>
        </div>
      ),
    },
    {
      key: 'open-items',
      label: '待處理問題',
      children: <OpenItemsTable customerId={id} />,
    },
    {
      key: 'timeline',
      label: '活動時間軸',
      children: <ActivityTimeline customerId={id} />,
    },
  ]

  return (
    <AppLayout>
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => router.push('/customers')}
        style={{ marginBottom: 16 }}
      >
        返回客戶列表
      </Button>

      <CustomerHeader
        customer={customer}
        isLoading={isLoading}
        onEdit={handleEdit}
        onSync={handleSync}
      />

      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
        />
      </Card>

      <Modal
        title="編輯客戶資料"
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false)
          form.resetFields()
        }}
        onOk={() => form.submit()}
        okText="儲存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={handleUpdate}>
          <Form.Item
            name="name"
            label="客戶名稱"
            rules={[{ required: true, message: '請輸入客戶名稱' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="contact" label="聯絡人">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="電話">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input type="email" />
          </Form.Item>
          <Form.Item name="salesRep" label="負責業務">
            <Input />
          </Form.Item>
          <Form.Item name="jiraProject" label="Jira 專案代碼">
            <Input placeholder="例如：ABC" />
          </Form.Item>
        </Form>
      </Modal>
    </AppLayout>
  )
}
