'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, Table, Button, Space, Input, App, Tag, Select, InputNumber, Tooltip, Popconfirm } from 'antd'
import { AppstoreOutlined, StarOutlined, StarFilled, DeleteOutlined, TagsOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import AppLayout from '@/components/layout/AppLayout'
import { useUser } from '@/hooks/useUser'
import { hasPermission } from '@/constants/roles'
import dayjs from '@/lib/dayjs'
import CategoryManageModal from '@/components/products/CategoryManageModal'
import type { ColumnsType } from 'antd/es/table'

const fetcher = (url: string) => fetch(url).then(res => res.json())

interface Product {
  id: string
  name: string
  sku: string | null
  category: string
  listPrice: number | null
  source: string
  priority: number
  updatedBy: string | null
  updatedAt: string | null
}

interface ProductsResponse {
  products: Product[]
  total: number
  page: number
  totalPages: number
  categories: string[]
}

export default function ProductsPage() {
  const router = useRouter()
  const { message } = App.useApp()
  const { user, isLoading: userLoading } = useUser()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState('priority')
  const [page, setPage] = useState(1)
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
  const [batchPriority, setBatchPriority] = useState<number>(50)
  const [updating, setUpdating] = useState<string | null>(null)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)

  // 權限檢查
  useEffect(() => {
    if (!userLoading && user && user.role !== 'ADMIN' && user.role !== 'FINANCE') {
      router.push('/')
    }
  }, [user, userLoading, router])

  const { data, isLoading, mutate } = useSWR<ProductsResponse>(
    `/api/products?page=${page}&q=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&sort=${sort}`,
    fetcher,
    { keepPreviousData: true }
  )

  const products = data?.products || []
  const categories = data?.categories || []
  const canEdit = hasPermission(user?.role, 'MANAGE_PRODUCT_PRIORITY')

  // 更新單一產品優先順序
  const handleUpdatePriority = async (productId: string, priority: number) => {
    setUpdating(productId)
    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || '更新失敗')
      }

      message.success('優先順序已更新')
      mutate()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新失敗')
    } finally {
      setUpdating(null)
    }
  }

  // 批量更新優先順序
  const handleBatchUpdate = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('請先選擇產品')
      return
    }

    setUpdating('batch')
    try {
      const response = await fetch('/api/products/batch-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: selectedRowKeys.map(id => ({ productId: id, priority: batchPriority })),
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || '更新失敗')
      }

      message.success(result.message)
      setSelectedRowKeys([])
      mutate()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新失敗')
    } finally {
      setUpdating(null)
    }
  }

  // 刪除單一產品
  const handleDelete = async (productId: string) => {
    setUpdating(productId)
    try {
      const response = await fetch(`/api/products/${productId}`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '刪除失敗')
      message.success(`已刪除：${result.deleted}`)
      mutate()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '刪除失敗')
    } finally {
      setUpdating(null)
    }
  }

  // 批量刪除
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return
    setUpdating('batch-delete')
    try {
      const results = await Promise.all(
        selectedRowKeys.map(id =>
          fetch(`/api/products/${id}`, { method: 'DELETE' }).then(res => res.json())
        )
      )
      const successCount = results.filter(r => r.success).length
      message.success(`已刪除 ${successCount} 個產品`)
      setSelectedRowKeys([])
      mutate()
    } catch (error) {
      message.error('批量刪除失敗')
    } finally {
      setUpdating(null)
    }
  }

  // 優先順序顏色
  const getPriorityColor = (priority: number) => {
    if (priority >= 80) return 'gold'
    if (priority >= 60) return 'blue'
    if (priority <= 30) return 'default'
    return 'green'
  }

  const columns: ColumnsType<Product> = [
    {
      title: '產品名稱',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string, record) => (
        <Space>
          {record.priority >= 80 ? (
            <StarFilled style={{ color: '#faad14' }} />
          ) : record.priority >= 60 ? (
            <StarOutlined style={{ color: '#1890ff' }} />
          ) : null}
          <Tooltip title={name}>
            <span style={{ fontWeight: record.priority >= 60 ? 500 : 400 }}>{name}</span>
          </Tooltip>
        </Space>
      ),
    },
    {
      title: 'SKU',
      dataIndex: 'sku',
      key: 'sku',
      width: 180,
      ellipsis: true,
      render: (sku: string | null) =>
        sku ? <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{sku}</span> : <span style={{ color: '#ccc' }}>-</span>,
    },
    {
      title: '分類',
      dataIndex: 'category',
      key: 'category',
      width: 180,
      ellipsis: true,
      render: (cat: string) => <Tag>{cat}</Tag>,
    },
    {
      title: '優先順序',
      dataIndex: 'priority',
      key: 'priority',
      width: 150,
      sorter: (a, b) => b.priority - a.priority,
      render: (priority: number, record) =>
        canEdit ? (
          <InputNumber
            min={1}
            max={100}
            value={priority}
            size="small"
            style={{ width: 80 }}
            disabled={updating === record.id}
            onChange={(value) => {
              if (value !== null && value !== priority) {
                handleUpdatePriority(record.id, value)
              }
            }}
          />
        ) : (
          <Tag color={getPriorityColor(priority)}>{priority}</Tag>
        ),
    },
    {
      title: '更新者',
      dataIndex: 'updatedBy',
      key: 'updatedBy',
      width: 150,
      ellipsis: true,
      render: (email: string | null) =>
        email ? <span style={{ color: '#666' }}>{email.split('@')[0]}</span> : '-',
    },
    {
      title: '更新時間',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 150,
      render: (date: string | null) =>
        date ? dayjs(date).format('YYYY/MM/DD HH:mm') : '-',
    },
    ...(canEdit
      ? [
          {
            title: '操作',
            key: 'actions',
            width: 70,
            render: (_: unknown, record: Product) => (
              <Popconfirm
                title={`確定要刪除「${record.name}」？`}
                description="此操作將從產品知識庫中移除"
                onConfirm={() => handleDelete(record.id)}
                okText="刪除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  loading={updating === record.id}
                />
              </Popconfirm>
            ),
          },
        ]
      : []),
  ]

  const rowSelection = canEdit
    ? {
        selectedRowKeys,
        onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as string[]),
      }
    : undefined

  if (userLoading) {
    return (
      <AppLayout>
        <Card loading />
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <Card
        title={
          <Space>
            <AppstoreOutlined />
            產品優先順序管理
            <Tag color="blue">{data?.total || 0}</Tag>
          </Space>
        }
        extra={
          <Space wrap>
            {canEdit && (
              <Button
                icon={<TagsOutlined />}
                onClick={() => setCategoryModalOpen(true)}
              >
                分類管理
              </Button>
            )}
            <Input.Search
              placeholder="搜尋產品..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              style={{ width: 200 }}
              allowClear
            />
            <Select
              placeholder="分類"
              value={category || undefined}
              onChange={(v) => {
                setCategory(v || '')
                setPage(1)
              }}
              style={{ width: 180 }}
              allowClear
              options={categories.map((c) => ({ value: c, label: c }))}
            />
            <Select
              value={sort}
              onChange={setSort}
              style={{ width: 140 }}
              options={[
                { value: 'priority', label: '按優先順序' },
                { value: 'name', label: '按名稱' },
                { value: 'category', label: '按分類' },
              ]}
            />
          </Space>
        }
      >
        {canEdit && selectedRowKeys.length > 0 && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 6 }}>
            <Space>
              <span>已選擇 {selectedRowKeys.length} 個產品</span>
              <InputNumber
                min={1}
                max={100}
                value={batchPriority}
                onChange={(v) => v && setBatchPriority(v)}
                style={{ width: 80 }}
              />
              <Button
                type="primary"
                onClick={handleBatchUpdate}
                loading={updating === 'batch'}
              >
                批量設定優先順序
              </Button>
              <Popconfirm
                title={`確定要刪除選中的 ${selectedRowKeys.length} 個產品？`}
                onConfirm={handleBatchDelete}
                okText="刪除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  loading={updating === 'batch-delete'}
                >
                  批量刪除
                </Button>
              </Popconfirm>
              <Button onClick={() => setSelectedRowKeys([])}>取消選擇</Button>
            </Space>
          </div>
        )}

        <Table
          dataSource={products}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          rowSelection={rowSelection}
          pagination={{
            current: page,
            pageSize: 50,
            total: data?.total || 0,
            showTotal: (total) => `共 ${total} 個產品`,
            showSizeChanger: false,
            onChange: (p) => setPage(p),
          }}
          size="middle"
        />
      </Card>

      <CategoryManageModal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        onCategoriesChanged={() => mutate()}
      />
    </AppLayout>
  )
}
