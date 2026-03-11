'use client'

import { useState, useEffect } from 'react'
import {
  Card,
  Typography,
  Button,
  Table,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Popconfirm,
  AutoComplete,
  Spin,
  message,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import AppLayout from '@/components/layout/AppLayout'
import { useUser } from '@/hooks/useUser'
import { useRouter } from 'next/navigation'
import dayjs from '@/lib/dayjs'
import type { ColumnsType } from 'antd/es/table'

const { Title, Text } = Typography
const { TextArea } = Input

const CATEGORY_OPTIONS = [
  { value: 'VOIP', label: 'VoIP', color: 'blue' },
  { value: 'SMART_NETWORK', label: '智慧網管', color: 'green' },
  { value: 'EQUIPMENT', label: '設備', color: 'orange' },
  { value: 'CUSTOM', label: '自訂', color: 'default' },
]

interface TemplateItem {
  productId?: string
  sku?: string
  productName: string
  category?: string
  quantity: number
  unitPrice: number
  description?: string
  sortOrder?: number
}

interface QuotationTemplate {
  id: string
  name: string
  category: string
  description?: string
  items: TemplateItem[]
  defaultNotes?: string
  paymentTerms?: string
  isActive: boolean
  sortOrder: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface ProductOption {
  id: string
  name: string
  sku?: string | null
  category: string
  listPrice: number | null
}

export default function QuotationTemplatesPage() {
  const router = useRouter()
  const { role, isLoading: userLoading } = useUser()
  const [templates, setTemplates] = useState<QuotationTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<QuotationTemplate | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [form] = Form.useForm()
  const [editItems, setEditItems] = useState<TemplateItem[]>([])
  const [productOptions, setProductOptions] = useState<ProductOption[]>([])
  const [productSearching, setProductSearching] = useState(false)
  const [editingProductIndex, setEditingProductIndex] = useState<number | null>(null)

  // Redirect non-admin
  useEffect(() => {
    if (!userLoading && role !== 'ADMIN') {
      router.push('/')
    }
  }, [role, userLoading, router])

  // Fetch templates
  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/quotation-templates?isActive=true')
      if (response.ok) {
        const data = await response.json()
        setTemplates(data.templates || [])
      }
    } catch {
      message.error('載入範本失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (role === 'ADMIN') fetchTemplates()
  }, [role])

  // Search products
  const searchProducts = async (query: string) => {
    if (query.length < 2) return
    setProductSearching(true)
    try {
      const response = await fetch(`/api/quotations/products?q=${encodeURIComponent(query)}&limit=15&hasSku=true`)
      if (response.ok) {
        const data = await response.json()
        setProductOptions(data.products || [])
      }
    } catch {
      // ignore
    } finally {
      setProductSearching(false)
    }
  }

  const loadProducts = async () => {
    if (productOptions.length > 0) return
    setProductSearching(true)
    try {
      const response = await fetch('/api/quotations/products?limit=30&hasSku=true')
      if (response.ok) {
        const data = await response.json()
        setProductOptions(data.products || [])
      }
    } catch {
      // ignore
    } finally {
      setProductSearching(false)
    }
  }

  // Open modal
  const openModal = (template?: QuotationTemplate) => {
    if (template) {
      setEditingTemplate(template)
      form.setFieldsValue({
        name: template.name,
        category: template.category,
        description: template.description || '',
        defaultNotes: template.defaultNotes || '',
        paymentTerms: template.paymentTerms || '',
        sortOrder: template.sortOrder || 0,
      })
      setEditItems([...(template.items as TemplateItem[])])
    } else {
      setEditingTemplate(null)
      form.resetFields()
      setEditItems([])
    }
    setModalOpen(true)
  }

  // Save template
  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)

      const body = {
        ...values,
        items: editItems,
      }

      const url = editingTemplate
        ? `/api/quotation-templates/${editingTemplate.id}`
        : '/api/quotation-templates'
      const method = editingTemplate ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '儲存失敗')
      }

      message.success(editingTemplate ? '範本已更新' : '範本已建立')
      setModalOpen(false)
      fetchTemplates()
    } catch (error) {
      if (error instanceof Error && error.message !== 'Validation failed') {
        message.error(error.message)
      }
    } finally {
      setSaving(false)
    }
  }

  // Delete template
  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/quotation-templates/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('刪除失敗')
      message.success('範本已刪除')
      fetchTemplates()
    } catch {
      message.error('刪除範本失敗')
    }
  }

  // Edit item
  const updateEditItem = (index: number, field: keyof TemplateItem, value: unknown) => {
    setEditItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const addEditItem = () => {
    setEditItems(prev => [...prev, { productName: '', quantity: 1, unitPrice: 0 }])
    setEditingProductIndex(editItems.length)
  }

  const removeEditItem = (index: number) => {
    setEditItems(prev => prev.filter((_, i) => i !== index))
  }

  // Table columns
  const columns: ColumnsType<QuotationTemplate> = [
    {
      title: '名稱',
      dataIndex: 'name',
      render: (name) => <Text strong>{name}</Text>,
    },
    {
      title: '類別',
      dataIndex: 'category',
      width: 120,
      render: (category) => {
        const opt = CATEGORY_OPTIONS.find(c => c.value === category)
        return <Tag color={opt?.color}>{opt?.label || category}</Tag>
      },
    },
    {
      title: '產品數',
      key: 'itemCount',
      width: 80,
      align: 'center',
      render: (_, record) => (record.items as TemplateItem[]).length,
    },
    {
      title: '建立者',
      dataIndex: 'createdBy',
      width: 150,
      render: (email: string) => email?.split('@')[0] || email,
    },
    {
      title: '更新時間',
      dataIndex: 'updatedAt',
      width: 160,
      render: (date) => dayjs(date).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openModal(record)}
          />
          <Popconfirm
            title="確定要刪除此範本？"
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

  // Item editing columns for modal
  const itemColumns: ColumnsType<TemplateItem> = [
    {
      title: '產品',
      dataIndex: 'productName',
      render: (value, _, index) => {
        const isEditing = editingProductIndex === index

        if (isEditing || !value) {
          const options = productOptions.map(p => ({
            value: p.name,
            label: (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div>{p.name}</div>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {p.sku || p.category}
                  </Text>
                </div>
                {p.listPrice != null && p.listPrice > 0 && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    ${p.listPrice.toLocaleString()}
                  </Text>
                )}
              </div>
            ),
            product: p,
          }))

          return (
            <AutoComplete
              autoFocus
              placeholder="搜尋產品..."
              style={{ width: '100%' }}
              defaultValue={value || undefined}
              options={options}
              onSearch={(v) => {
                if (v.length >= 2) searchProducts(v)
              }}
              onFocus={() => loadProducts()}
              onSelect={(_, option) => {
                const p = (option as { product?: ProductOption }).product
                if (p) {
                  updateEditItem(index, 'productId', p.id)
                  updateEditItem(index, 'productName', p.name)
                  updateEditItem(index, 'sku', p.sku || undefined)
                  updateEditItem(index, 'category', p.category)
                  if (p.listPrice && p.listPrice > 0) {
                    updateEditItem(index, 'unitPrice', p.listPrice)
                  }
                }
                setEditingProductIndex(null)
              }}
              allowClear
              onBlur={() => setTimeout(() => setEditingProductIndex(null), 200)}
              notFoundContent={productSearching ? <Spin size="small" /> : null}
            />
          )
        }

        return (
          <div
            style={{ cursor: 'pointer' }}
            onClick={() => { setEditingProductIndex(index); loadProducts() }}
          >
            <Text strong>{value}</Text>
            {editItems[index]?.sku && (
              <div>
                <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                  {editItems[index].sku}
                </Text>
              </div>
            )}
          </div>
        )
      },
    },
    {
      title: '數量',
      dataIndex: 'quantity',
      width: 80,
      render: (value, _, index) => (
        <InputNumber
          min={1}
          value={value}
          onChange={v => updateEditItem(index, 'quantity', v || 1)}
          style={{ width: 70 }}
          size="small"
        />
      ),
    },
    {
      title: '單價',
      dataIndex: 'unitPrice',
      width: 120,
      render: (value, _, index) => (
        <InputNumber
          min={0}
          value={value}
          onChange={v => updateEditItem(index, 'unitPrice', v || 0)}
          formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          parser={v => v?.replace(/\$\s?|(,*)/g, '') as unknown as number}
          style={{ width: 110 }}
          size="small"
        />
      ),
    },
    {
      title: '說明',
      dataIndex: 'description',
      render: (value, _, index) => (
        <Input
          placeholder="說明..."
          value={value}
          onChange={e => updateEditItem(index, 'description', e.target.value)}
          size="small"
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 40,
      render: (_, __, index) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => removeEditItem(index)}
        />
      ),
    },
  ]

  if (userLoading) return <AppLayout><Spin /></AppLayout>
  if (role !== 'ADMIN') return null

  return (
    <AppLayout>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={4} style={{ margin: 0 }}>
          <FileTextOutlined style={{ marginRight: 8 }} />
          報價範本管理
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => openModal()}
        >
          新增範本
        </Button>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={templates}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>

      {/* Add/Edit Modal */}
      <Modal
        title={editingTemplate ? '編輯範本' : '新增範本'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        width={900}
        forceRender
        okText="儲存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item
              name="name"
              label="範本名稱"
              rules={[{ required: true, message: '請輸入名稱' }]}
              style={{ flex: 2 }}
            >
              <Input placeholder="例如：VoIP 標準專案" />
            </Form.Item>
            <Form.Item
              name="category"
              label="類別"
              rules={[{ required: true, message: '請選擇類別' }]}
              style={{ flex: 1 }}
            >
              <Select options={CATEGORY_OPTIONS} placeholder="選擇類別" />
            </Form.Item>
            <Form.Item name="sortOrder" label="排序" style={{ width: 80 }}>
              <InputNumber min={0} />
            </Form.Item>
          </div>

          <Form.Item name="description" label="說明">
            <Input placeholder="範本說明（選填）" />
          </Form.Item>
        </Form>

        {/* Items editor */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text strong>產品列表</Text>
            <Button size="small" icon={<PlusOutlined />} onClick={addEditItem}>
              新增產品
            </Button>
          </div>
          <Table
            dataSource={editItems}
            columns={itemColumns}
            rowKey={(_, index) => index?.toString() || '0'}
            pagination={false}
            size="small"
            bordered
            locale={{ emptyText: '尚無產品' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          <Form.Item name="defaultNotes" label="預設備註" style={{ flex: 1 }}>
            <TextArea rows={3} placeholder="報價備註..." />
          </Form.Item>
          <Form.Item name="paymentTerms" label="付款條件" style={{ flex: 1 }}>
            <TextArea rows={3} placeholder="例如：訂金30%、交機40%、驗收30%" />
          </Form.Item>
        </div>
      </Modal>
    </AppLayout>
  )
}
