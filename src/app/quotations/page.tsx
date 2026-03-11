'use client'

import { useState, useEffect } from 'react'
import {
  Table,
  Button,
  Typography,
  Card,
  Tag,
  Space,
  Select,
  message,
  Popconfirm,
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import SmartQuotationModal from '@/components/quotations/SmartQuotationModal'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import dayjs from '@/lib/dayjs'

const { Title } = Typography

interface QuotationItem {
  id: string
  productName: string
  quantity: number
  unitPrice: number
  subtotal: number
}

interface Quotation {
  id: string
  quotationNo: string
  customer: { id: string; name: string }
  projectName?: string
  status: string
  totalAmount: number
  items: QuotationItem[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface QuotationResponse {
  quotations: Quotation[]
  total: number
  page: number
  totalPages: number
  canViewAll: boolean
}

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: '草稿', color: 'default' },
  { value: 'SENT', label: '已送出', color: 'blue' },
  { value: 'APPROVED', label: '已核准', color: 'green' },
  { value: 'REJECTED', label: '已拒絕', color: 'red' },
  { value: 'CONVERTED', label: '已成交', color: 'purple' },
]

export default function QuotationsPage() {
  const router = useRouter()
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string | undefined>()
  const [smartQuotationOpen, setSmartQuotationOpen] = useState(false)
  const [canViewAll, setCanViewAll] = useState(false)

  const fetchQuotations = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: page.toString() })
      if (statusFilter) params.append('status', statusFilter)

      const response = await fetch(`/api/quotations?${params}`)
      if (!response.ok) throw new Error('載入失敗')

      const data: QuotationResponse = await response.json()
      setQuotations(data.quotations)
      setTotal(data.total)
      setCanViewAll(data.canViewAll)
    } catch (error) {
      message.error('載入報價單失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQuotations()
  }, [page, statusFilter])

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/quotations/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('刪除失敗')
      message.success('報價單已刪除')
      fetchQuotations()
    } catch (error) {
      message.error('刪除報價單失敗')
    }
  }

  const handleTableChange = (pagination: TablePaginationConfig) => {
    if (pagination.current) setPage(pagination.current)
  }

  const columns: ColumnsType<Quotation> = [
    {
      title: '編號',
      dataIndex: 'quotationNo',
      width: 100,
      render: (quotationNo, record) => (
        <a onClick={() => router.push(`/quotations/${record.id}`)}>
          {quotationNo}
        </a>
      ),
    },
    {
      title: '客戶',
      dataIndex: ['customer', 'name'],
      render: (name, record) => (
        record.customer ? (
          <a onClick={() => router.push(`/customers/${record.customer.id}`)}>
            {name}
          </a>
        ) : (
          <span>{name || '-'}</span>
        )
      ),
    },
    {
      title: '專案',
      dataIndex: 'projectName',
      render: (name) => name || '-',
    },
    {
      title: '項目',
      dataIndex: 'items',
      render: (items: QuotationItem[]) => (
        <Space orientation="vertical" size={0}>
          {items.slice(0, 2).map((item, i) => (
            <span key={i} style={{ fontSize: 12 }}>
              {item.productName} x{item.quantity}
            </span>
          ))}
          {items.length > 2 && (
            <span style={{ fontSize: 12, color: '#999' }}>
              +{items.length - 2} 項...
            </span>
          )}
        </Space>
      ),
    },
    {
      title: '金額',
      dataIndex: 'totalAmount',
      width: 120,
      render: (amount) => (
        <span style={{ color: '#1890ff', fontWeight: 500 }}>
          ${Number(amount).toLocaleString()}
        </span>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      width: 100,
      render: (status) => {
        const option = STATUS_OPTIONS.find(s => s.value === status)
        return <Tag color={option?.color}>{option?.label || status}</Tag>
      },
    },
    // 只有管理員/財務可以看到建立者欄位
    ...(canViewAll ? [{
      title: '建立者',
      dataIndex: 'createdBy',
      width: 150,
      render: (email: string) => email?.split('@')[0] || email,
    }] : []),
    {
      title: '建立時間',
      dataIndex: 'createdAt',
      width: 140,
      render: (date) => dayjs(date).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => router.push(`/quotations/${record.id}`)}
          />
          <Popconfirm
            title="確定要刪除此報價單？"
            onConfirm={() => handleDelete(record.id)}
            okText="確定"
            cancelText="取消"
          >
            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <AppLayout>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}>報價單管理</Title>
        <Space wrap>
          <Select
            placeholder="狀態篩選"
            allowClear
            style={{ width: 120 }}
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value)
              setPage(1)
            }}
            options={STATUS_OPTIONS}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => router.push('/quotations/new')}
          >
            建立報價
          </Button>
        </Space>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={quotations}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            total,
            pageSize: 20,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 筆`,
          }}
          onChange={handleTableChange}
          scroll={{ x: 900 }}
        />
      </Card>

      <SmartQuotationModal
        open={smartQuotationOpen}
        onClose={() => setSmartQuotationOpen(false)}
        onSuccess={() => {
          fetchQuotations()
        }}
      />
    </AppLayout>
  )
}
