'use client'

import { useState } from 'react'
import {
  Table,
  Button,
  Input,
  Space,
  Typography,
  Card,
  Modal,
  Form,
  message,
  Popconfirm,
  Tag,
} from 'antd'
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { useCustomers, createCustomer, deleteCustomer } from '@/hooks/useCustomer'
import type { ColumnsType } from 'antd/es/table'
import type { CustomerWithRelations } from '@/types/customer'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'

dayjs.extend(relativeTime)
dayjs.locale('zh-tw')

const { Title } = Typography
const { Search } = Input

export default function CustomersPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()

  const { customers, total, isLoading, mutate } = useCustomers(search, page)

  const handleCreate = async (values: Record<string, unknown>) => {
    try {
      await createCustomer(values)
      message.success('客戶建立成功')
      setModalOpen(false)
      form.resetFields()
      mutate()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '建立失敗')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteCustomer(id)
      message.success('客戶已刪除')
      mutate()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '刪除失敗')
    }
  }

  const columns: ColumnsType<CustomerWithRelations> = [
    {
      title: '客戶名稱',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <a onClick={() => router.push(`/customers/${record.id}`)}>{name}</a>
      ),
    },
    {
      title: '聯絡人',
      dataIndex: 'contact',
      key: 'contact',
      responsive: ['md'],
    },
    {
      title: 'Jira 專案',
      dataIndex: 'jiraProject',
      key: 'jiraProject',
      render: (project) => project ? <Tag color="blue">{project}</Tag> : '-',
      responsive: ['lg'],
    },
    {
      title: '待處理',
      dataIndex: ['_count', 'openItems'],
      key: 'openItems',
      render: (count) => count > 0 ? <Tag color="orange">{count}</Tag> : '0',
      width: 80,
    },
    {
      title: '更新時間',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (date) => dayjs(date).fromNow(),
      responsive: ['md'],
      width: 120,
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => router.push(`/customers/${record.id}`)}
          />
          <Popconfirm
            title="確定要刪除此客戶？"
            description="此操作無法復原"
            onConfirm={() => handleDelete(record.id)}
            okText="確定"
            cancelText="取消"
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <AppLayout>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}>客戶管理</Title>
        <Space wrap>
          <Search
            placeholder="搜尋客戶..."
            allowClear
            onSearch={setSearch}
            style={{ width: 200 }}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setModalOpen(true)}
          >
            新增客戶
          </Button>
        </Space>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={customers}
          rowKey="id"
          loading={isLoading}
          pagination={{
            current: page,
            total,
            pageSize: 20,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 筆`,
          }}
          scroll={{ x: 600 }}
        />
      </Card>

      <Modal
        title="新增客戶"
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          form.resetFields()
        }}
        onOk={() => form.submit()}
        okText="建立"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
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
