'use client'

import { useState, useEffect, use } from 'react'
import {
  Card,
  Button,
  Typography,
  Descriptions,
  Table,
  Tag,
  Space,
  InputNumber,
  Input,
  Select,
  Skeleton,
  Divider,
  AutoComplete,
  Tooltip,
  Dropdown,
  App,
} from 'antd'
import {
  ArrowLeftOutlined,
  SaveOutlined,
  EditOutlined,
  PrinterOutlined,
  HistoryOutlined,
  PlusOutlined,
  DeleteOutlined,
  ThunderboltOutlined,
  LoadingOutlined,
  EyeOutlined,
  DownloadOutlined,
  MailOutlined,
} from '@ant-design/icons'
import QuotationPDFPreview from '@/components/quotations/QuotationPDFPreview'
import QuotationEmailModal from '@/components/quotations/QuotationEmailModal'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import type { ColumnsType } from 'antd/es/table'
import dayjs from '@/lib/dayjs'

const { Title, Text } = Typography

interface QuotationItem {
  id: string
  productId?: string
  sku?: string
  productName: string
  category?: string
  quantity: number
  unitPrice: number
  subtotal: number
  description?: string
}

interface Quotation {
  id: string
  quotationNo: string
  partner: {
    id: string
    name: string
    contact?: string
    email?: string
    phone?: string
  }
  projectName?: string
  status: string
  totalAmount: number
  notes?: string
  validUntil?: string
  items: QuotationItem[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: '草稿', color: 'default' },
  { value: 'SENT', label: '已送出', color: 'blue' },
  { value: 'APPROVED', label: '已核准', color: 'green' },
  { value: 'REJECTED', label: '已拒絕', color: 'red' },
  { value: 'CONVERTED', label: '已成交', color: 'purple' },
]

interface QuotationDetailPageProps {
  params: Promise<{ id: string }>
}

export default function QuotationDetailPage({ params }: QuotationDetailPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { message } = App.useApp()
  const [quotation, setQuotation] = useState<Quotation | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editItems, setEditItems] = useState<QuotationItem[]>([])
  const [editStatus, setEditStatus] = useState<string>('')
  const [editProjectName, setEditProjectName] = useState<string>('')
  const [editNotes, setEditNotes] = useState<string>('')
  const [descriptionSuggestions, setDescriptionSuggestions] = useState<Record<number, string[]>>({})
  const [productOptions, setProductOptions] = useState<Array<{ id: string; name: string; sku?: string | null; category: string; listPrice: number | null }>>([])
  const [productSearching, setProductSearching] = useState(false)
  const [generatingDescription, setGeneratingDescription] = useState<Record<number, boolean>>({})
  const [showPDFPreview, setShowPDFPreview] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // AI 生成產品說明
  const generateDescription = async (index: number) => {
    const item = editItems[index]
    if (!item.productName) {
      message.warning('請先選擇產品')
      return
    }

    setGeneratingDescription(prev => ({ ...prev, [index]: true }))
    try {
      const response = await fetch('/api/quotations/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: item.productName,
          category: item.category,
          quantity: item.quantity,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.description) {
          updateItem(index, 'description', data.description)
          message.success('已生成說明')
        }
      } else {
        message.error('生成失敗')
      }
    } catch (error) {
      console.error('Failed to generate description:', error)
      message.error('生成說明失敗')
    } finally {
      setGeneratingDescription(prev => ({ ...prev, [index]: false }))
    }
  }

  // 搜尋產品
  const searchProducts = async (query: string) => {
    setProductSearching(true)
    try {
      const response = await fetch(`/api/quotations/products?q=${encodeURIComponent(query)}&limit=20`)
      if (response.ok) {
        const data = await response.json()
        setProductOptions(data.products || [])
      }
    } catch (error) {
      console.error('Failed to search products:', error)
    } finally {
      setProductSearching(false)
    }
  }

  // 載入所有產品（初始時顯示）
  const loadAllProducts = async () => {
    try {
      const response = await fetch('/api/quotations/products?limit=50')
      if (response.ok) {
        const data = await response.json()
        setProductOptions(data.products || [])
      }
    } catch (error) {
      console.error('Failed to load products:', error)
    }
  }

  // 取得產品說明建議
  const fetchDescriptionSuggestions = async (productName: string, index: number, autoFill = false) => {
    try {
      const response = await fetch(`/api/quotations/suggestions?productName=${encodeURIComponent(productName)}`)
      if (response.ok) {
        const data = await response.json()
        const suggestions = data.suggestions || []
        setDescriptionSuggestions(prev => ({ ...prev, [index]: suggestions }))

        // 自動填入第一個建議
        if (autoFill && suggestions.length > 0) {
          setEditItems(prev => {
            const updated = [...prev]
            if (!updated[index].description) {
              updated[index] = { ...updated[index], description: suggestions[0] }
            }
            return updated
          })
        }
      }
    } catch (error) {
      console.error('Failed to fetch description suggestions:', error)
    }
  }

  // 進入編輯模式時載入所有產品的說明建議和產品列表
  const handleStartEdit = async () => {
    setEditing(true)
    // 載入產品列表
    loadAllProducts()
    // 為每個產品載入說明建議
    editItems.forEach((item, index) => {
      fetchDescriptionSuggestions(item.productName, index)
    })
  }

  // 新增品項
  const addItem = () => {
    const newItem: QuotationItem = {
      id: `new-${Date.now()}`,
      productName: '',
      quantity: 1,
      unitPrice: 0,
      subtotal: 0,
      description: '',
    }
    setEditItems(prev => [...prev, newItem])
  }

  // 刪除品項
  const removeItem = (index: number) => {
    setEditItems(prev => prev.filter((_, i) => i !== index))
    // 清除該項目的說明建議
    setDescriptionSuggestions(prev => {
      const updated = { ...prev }
      delete updated[index]
      return updated
    })
  }

  const fetchQuotation = async () => {
    try {
      const response = await fetch(`/api/quotations/${id}`)
      if (!response.ok) throw new Error('載入失敗')
      const data = await response.json()
      setQuotation(data)
      setEditItems(data.items)
      setEditStatus(data.status)
      setEditProjectName(data.projectName || '')
      setEditNotes(data.notes || '')
    } catch (error) {
      message.error('載入報價單失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQuotation()
  }, [id])

  const handleSave = async () => {
    setSaving(true)
    try {
      const items = editItems.map(item => ({
        productId: item.productId,
        sku: item.sku,
        productName: item.productName,
        category: item.category,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        description: item.description,
      }))

      const response = await fetch(`/api/quotations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: editProjectName,
          status: editStatus,
          notes: editNotes,
          items,
        }),
      })

      if (!response.ok) throw new Error('儲存失敗')

      message.success('報價單已更新')
      setEditing(false)
      fetchQuotation()
    } catch (error) {
      message.error('儲存報價單失敗')
    } finally {
      setSaving(false)
    }
  }

  const updateItem = (index: number, field: keyof QuotationItem, value: unknown) => {
    setEditItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      // 重新計算小計
      if (field === 'quantity' || field === 'unitPrice') {
        updated[index].subtotal = updated[index].quantity * Number(updated[index].unitPrice)
      }
      return updated
    })
  }

  const calculateTotal = () => {
    return editItems.reduce((sum, item) => sum + item.quantity * Number(item.unitPrice), 0)
  }

  const handleDownloadPDF = async () => {
    if (!quotation) return
    setDownloading(true)
    try {
      const response = await fetch(`/api/quotations/${id}/pdf?action=download`)
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '下載失敗')
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${quotation.quotationNo}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      message.success('PDF 已下載')
    } catch (error) {
      console.error('Download PDF error:', error)
      message.error(error instanceof Error ? error.message : '下載 PDF 失敗')
    } finally {
      setDownloading(false)
    }
  }

  const printMenuItems = [
    {
      key: 'preview',
      label: '預覽 PDF',
      icon: <EyeOutlined />,
      onClick: () => setShowPDFPreview(true),
    },
    {
      key: 'download',
      label: '下載 PDF',
      icon: <DownloadOutlined />,
      onClick: handleDownloadPDF,
    },
    {
      key: 'email',
      label: '寄送報價單',
      icon: <MailOutlined />,
      onClick: () => setShowEmailModal(true),
    },
  ]

  if (loading) {
    return (
      <AppLayout>
        <Skeleton active />
      </AppLayout>
    )
  }

  if (!quotation) {
    return (
      <AppLayout>
        <Card>
          <Text type="secondary">報價單不存在</Text>
        </Card>
      </AppLayout>
    )
  }

  const statusOption = STATUS_OPTIONS.find(s => s.value === quotation.status)

  // 產品選項（用於 AutoComplete）
  const getProductAutoCompleteOptions = (currentValue: string) => {
    const options = productOptions
      .filter(p => {
        if (!currentValue) return true
        const query = currentValue.toLowerCase()
        return p.name.toLowerCase().includes(query) || p.category.toLowerCase().includes(query) || (p.sku?.toLowerCase().includes(query) ?? false)
      })
      .map(p => ({
        value: p.name,
        label: (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div>{p.name}</div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {p.sku ? <span style={{ fontFamily: 'monospace' }}>{p.sku}</span> : p.category}
              </Text>
            </div>
            {p.listPrice != null && p.listPrice > 0 && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                參考: ${p.listPrice.toLocaleString()}
              </Text>
            )}
          </div>
        ),
        product: p,
      }))
    return options.slice(0, 15)
  }

  const columns: ColumnsType<QuotationItem> = [
    {
      title: '產品名稱',
      dataIndex: 'productName',
      width: 250,
      render: (name, record, index) =>
        editing ? (
          <AutoComplete
            value={name}
            options={getProductAutoCompleteOptions(name)}
            onSearch={(value) => {
              updateItem(index, 'productName', value)
              if (value.length >= 2) {
                searchProducts(value)
              }
            }}
            onChange={(value) => updateItem(index, 'productName', value)}
            onSelect={(value, option) => {
              const product = (option as { product?: { id: string; name: string; sku?: string | null; category: string; listPrice: number | null } }).product
              if (product) {
                setEditItems(prev => {
                  const updated = [...prev]
                  updated[index] = {
                    ...updated[index],
                    productId: product.id,
                    sku: product.sku || undefined,
                    productName: product.name,
                    category: product.category,
                    unitPrice: product.listPrice && product.listPrice > 0 ? product.listPrice : updated[index].unitPrice,
                    subtotal: updated[index].quantity * (product.listPrice && product.listPrice > 0 ? product.listPrice : Number(updated[index].unitPrice)),
                  }
                  return updated
                })
                // 載入該產品的說明建議並自動填入
                fetchDescriptionSuggestions(product.name, index, true)
              }
            }}
            onFocus={() => {
              if (productOptions.length === 0) {
                loadAllProducts()
              }
            }}
            placeholder="輸入產品名稱或選擇..."
            style={{ width: '100%' }}
            allowClear
          />
        ) : (
          <div>
            <div>{name}</div>
            {record.sku && (
              <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>{record.sku}</Text>
            )}
            {!record.sku && record.category && (
              <Text type="secondary" style={{ fontSize: 12 }}>{record.category}</Text>
            )}
          </div>
        ),
    },
    {
      title: '說明',
      dataIndex: 'description',
      width: 280,
      render: (value, record, index) => {
        if (!editing) return value || '-'

        const suggestions = descriptionSuggestions[index] || []
        const isGenerating = generatingDescription[index]

        // 下拉選項：歷史說明
        const options = suggestions.map(s => ({
          value: s,
          label: (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <HistoryOutlined style={{ color: '#999', flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{s}</span>
            </div>
          ),
        }))

        return (
          <div>
            <Space.Compact style={{ width: '100%' }}>
              <AutoComplete
                placeholder="輸入或選擇說明..."
                value={value}
                onChange={v => updateItem(index, 'description', v)}
                options={options}
                style={{ flex: 1 }}
                allowClear
                onFocus={() => {
                  if (!descriptionSuggestions[index] && record.productName) {
                    fetchDescriptionSuggestions(record.productName, index)
                  }
                }}
              />
              <Tooltip title="AI 生成說明">
                <Button
                  icon={isGenerating ? <LoadingOutlined /> : <ThunderboltOutlined />}
                  onClick={() => generateDescription(index)}
                  disabled={!record.productName || isGenerating}
                  style={{ color: isGenerating ? undefined : '#faad14' }}
                />
              </Tooltip>
            </Space.Compact>
            {suggestions.length > 0 && !value && (
              <div style={{ marginTop: 4 }}>
                <Space size={4} wrap>
                  {suggestions.slice(0, 3).map((s, i) => (
                    <Tag
                      key={i}
                      color="blue"
                      style={{ cursor: 'pointer', fontSize: 11 }}
                      onClick={() => updateItem(index, 'description', s)}
                    >
                      {s.length > 20 ? s.substring(0, 20) + '...' : s}
                    </Tag>
                  ))}
                </Space>
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
      align: 'center' as const,
      render: (value, _, index) =>
        editing ? (
          <InputNumber
            min={1}
            value={value}
            onChange={v => updateItem(index, 'quantity', v || 1)}
            style={{ width: 60 }}
          />
        ) : (
          value
        ),
    },
    {
      title: '單價',
      dataIndex: 'unitPrice',
      width: 120,
      align: 'right' as const,
      render: (value, _, index) =>
        editing ? (
          <InputNumber
            min={0}
            value={Number(value)}
            onChange={v => updateItem(index, 'unitPrice', v || 0)}
            formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={v => v?.replace(/\$\s?|(,*)/g, '') as unknown as number}
            style={{ width: 100 }}
          />
        ) : (
          `$${Number(value).toLocaleString()}`
        ),
    },
    {
      title: '小計',
      dataIndex: 'subtotal',
      width: 120,
      align: 'right' as const,
      render: (_, record) => {
        const subtotal = record.quantity * Number(record.unitPrice)
        return (
          <Text strong style={{ color: '#1890ff' }}>
            ${subtotal.toLocaleString()}
          </Text>
        )
      },
    },
    ...(editing ? [{
      title: '',
      key: 'action',
      width: 50,
      render: (_: unknown, __: QuotationItem, index: number) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => removeItem(index)}
        />
      ),
    }] : []),
  ]

  return (
    <AppLayout>
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => router.push('/quotations')}
        style={{ marginBottom: 16 }}
      >
        返回報價單列表
      </Button>

      <Card
        title={
          <Space>
            <Title level={4} style={{ margin: 0 }}>
              報價單 {quotation.quotationNo}
            </Title>
            {editing ? (
              <Select
                value={editStatus}
                onChange={setEditStatus}
                style={{ width: 120 }}
                options={STATUS_OPTIONS}
              />
            ) : (
              <Tag color={statusOption?.color}>{statusOption?.label}</Tag>
            )}
          </Space>
        }
        extra={
          <Space>
            {editing ? (
              <>
                <Button onClick={() => setEditing(false)}>取消</Button>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={saving}
                  onClick={handleSave}
                >
                  儲存
                </Button>
              </>
            ) : (
              <>
                <Dropdown
                  menu={{ items: printMenuItems }}
                  placement="bottomRight"
                >
                  <Button icon={<PrinterOutlined />} loading={downloading}>
                    列印 / 匯出
                  </Button>
                </Dropdown>
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={handleStartEdit}
                >
                  編輯
                </Button>
              </>
            )}
          </Space>
        }
      >
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} style={{ marginBottom: 24 }}>
          <Descriptions.Item label="客戶">
            <a onClick={() => router.push(`/customers/${quotation.partner.id}`)}>
              {quotation.partner.name}
            </a>
          </Descriptions.Item>
          <Descriptions.Item label="專案名稱">
            {editing ? (
              <Input
                value={editProjectName}
                onChange={e => setEditProjectName(e.target.value)}
                placeholder="專案名稱"
                style={{ width: 200 }}
              />
            ) : (
              quotation.projectName || '-'
            )}
          </Descriptions.Item>
          <Descriptions.Item label="建立者">{quotation.createdBy}</Descriptions.Item>
          <Descriptions.Item label="建立時間">
            {dayjs(quotation.createdAt).format('YYYY-MM-DD HH:mm')}
          </Descriptions.Item>
          <Descriptions.Item label="更新時間">
            {dayjs(quotation.updatedAt).format('YYYY-MM-DD HH:mm')}
          </Descriptions.Item>
          {quotation.partner.contact && (
            <Descriptions.Item label="聯絡人">{quotation.partner.contact}</Descriptions.Item>
          )}
        </Descriptions>

        <Divider style={{ marginTop: 24 }}>產品明細</Divider>

        <Table
          dataSource={editing ? editItems : quotation.items}
          columns={columns}
          rowKey="id"
          pagination={false}
          size="middle"
          bordered
        />

        {editing && (
          <Button
            type="dashed"
            onClick={addItem}
            icon={<PlusOutlined />}
            style={{ width: '100%', marginTop: 8 }}
          >
            新增品項
          </Button>
        )}

        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <Space orientation="vertical" align="end" size={4}>
            <Space size="large">
              <Text type="secondary">合計金額：</Text>
              <Title level={3} style={{ margin: 0, color: '#1890ff' }}>
                ${(editing ? calculateTotal() : Number(quotation.totalAmount)).toLocaleString()}
              </Title>
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              以上報價均為含稅價（含 5% 營業稅）
            </Text>
          </Space>
        </div>

        {(editing || quotation.notes) && (
          <>
            <Divider>備註</Divider>
            {editing ? (
              <Input.TextArea
                rows={3}
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                placeholder="報價單備註..."
              />
            ) : (
              <Text>{quotation.notes}</Text>
            )}
          </>
        )}
      </Card>

      <QuotationPDFPreview
        open={showPDFPreview}
        quotationId={id}
        quotationNo={quotation.quotationNo}
        onClose={() => setShowPDFPreview(false)}
        onSendEmail={() => setShowEmailModal(true)}
      />

      <QuotationEmailModal
        open={showEmailModal}
        quotationId={id}
        quotationNo={quotation.quotationNo}
        projectName={quotation.projectName}
        partnerName={quotation.partner.name}
        partnerEmail={quotation.partner.email}
        onClose={() => setShowEmailModal(false)}
        onSuccess={() => fetchQuotation()}
      />
    </AppLayout>
  )
}
