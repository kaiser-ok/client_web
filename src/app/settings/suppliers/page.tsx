'use client'

import { useState } from 'react'
import { Card, Table, Button, Space, Input, App, Tag, Modal, Form } from 'antd'
import { SyncOutlined, PlusOutlined, ShopOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import AppLayout from '@/components/layout/AppLayout'
import dayjs from 'dayjs'

const fetcher = (url: string) => fetch(url).then(res => res.json())

interface Supplier {
  id: string
  name: string
  odooId: number | null
  email: string | null
  phone: string | null
  website: string | null
  notes: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export default function SuppliersPage() {
  const { message } = App.useApp()
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [form] = Form.useForm()

  const { data, isLoading, mutate } = useSWR<{ suppliers: Supplier[] }>(
    `/api/suppliers?search=${encodeURIComponent(search)}`,
    fetcher
  )

  const suppliers = data?.suppliers || []

  const handleSync = async () => {
    setSyncing(true)
    try {
      const response = await fetch('/api/suppliers/sync', { method: 'POST' })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || '同步失敗')
      }

      message.success(result.message)
      mutate()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '同步失敗')
    } finally {
      setSyncing(false)
    }
  }

  const handleAdd = async (values: { name: string; email?: string; phone?: string; website?: string; notes?: string }) => {
    try {
      const response = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || '新增失敗')
      }

      message.success('供應商已新增')
      setAddModalOpen(false)
      form.resetFields()
      mutate()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '新增失敗')
    }
  }

  const columns = [
    {
      title: '供應商名稱',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Supplier) => (
        <Space>
          <ShopOutlined />
          <span style={{ fontWeight: 500 }}>{name}</span>
          {record.odooId && <Tag color="purple">Odoo</Tag>}
        </Space>
      ),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      render: (email: string | null) => email || '-',
    },
    {
      title: '電話',
      dataIndex: 'phone',
      key: 'phone',
      render: (phone: string | null) => phone || '-',
    },
    {
      title: '網站',
      dataIndex: 'website',
      key: 'website',
      render: (website: string | null) =>
        website ? (
          <a href={website.startsWith('http') ? website : `https://${website}`} target="_blank" rel="noopener noreferrer">
            {website}
          </a>
        ) : (
          '-'
        ),
    },
    {
      title: '更新時間',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 150,
      render: (date: string) => dayjs(date).format('YYYY/MM/DD HH:mm'),
    },
  ]

  return (
    <AppLayout>
      <Card
        title={
          <Space>
            <ShopOutlined />
            供應商管理
            <Tag color="blue">{suppliers.length}</Tag>
          </Space>
        }
        extra={
          <Space>
            <Input.Search
              placeholder="搜尋供應商..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 200 }}
              allowClear
            />
            <Button icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>
              新增
            </Button>
            <Button
              type="primary"
              icon={<SyncOutlined spin={syncing} />}
              onClick={handleSync}
              loading={syncing}
            >
              從 Odoo 同步
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={suppliers}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Modal
        title="新增供應商"
        open={addModalOpen}
        forceRender
        onCancel={() => {
          setAddModalOpen(false)
          form.resetFields()
        }}
        onOk={() => form.submit()}
        okText="新增"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={handleAdd}>
          <Form.Item
            name="name"
            label="供應商名稱"
            rules={[{ required: true, message: '請輸入供應商名稱' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input type="email" />
          </Form.Item>
          <Form.Item name="phone" label="電話">
            <Input />
          </Form.Item>
          <Form.Item name="website" label="網站">
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="notes" label="備註">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </AppLayout>
  )
}
