'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  Steps,
  Card,
  Button,
  Input,
  InputNumber,
  Select,
  Table,
  Typography,
  Space,
  Tag,
  Spin,
  Alert,
  Divider,
  AutoComplete,
  Tooltip,
  message,
  Result,
} from 'antd'
import {
  ShoppingOutlined,
  ProjectOutlined,
  UserOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  QuestionCircleOutlined,
  SendOutlined,
  PlusOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  SwapOutlined,
  DollarOutlined,
  HistoryOutlined,
  CopyOutlined,
  InboxOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import type { ColumnsType } from 'antd/es/table'

const { TextArea } = Input
const { Title, Text } = Typography

// Types
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
}

interface ProductItem {
  key: string
  productId?: string
  sku?: string
  productName: string
  category?: string
  quantity: number
  unitPrice: number
  description?: string
}

interface ProductOption {
  id: string
  name: string
  sku?: string | null
  category: string
  listPrice: number | null
}

interface ParsedItem {
  input: string
  matched?: {
    id: string
    name: string
    sku?: string
    category: string
    confidence: number
  }
  suggestions?: Array<{
    id: string
    name: string
    sku?: string
    category: string
    score: number
  }>
  quantity: number
  priceUnit?: number
  priceRange?: { min: number; max: number; avg: number }
  spec?: string
  description?: string
  descriptionSuggestions?: string[]
}

type QuotationType = 'equipment' | 'project'
type ProjectSubType = 'VOIP' | 'SMART_NETWORK' | 'OTHER'

const PROJECT_SUB_TYPES: { value: ProjectSubType; label: string; description: string }[] = [
  { value: 'VOIP', label: 'VoIP 專案', description: 'IP PBX、SBC、IP Phone 等語音通訊專案' },
  { value: 'SMART_NETWORK', label: '智慧網管專案', description: 'MikroTik 路由器、交換器、AP 等網路管理專案' },
  { value: 'OTHER', label: '其他專案', description: '自訂專案類型' },
]

const TEMPLATE_CATEGORY_MAP: Record<ProjectSubType, string> = {
  VOIP: 'VOIP',
  SMART_NETWORK: 'SMART_NETWORK',
  OTHER: 'CUSTOM',
}

export default function NewQuotationPage() {
  const router = useRouter()

  // Step state
  const [currentStep, setCurrentStep] = useState(0)

  // Step 1: Type selection
  const [quotationType, setQuotationType] = useState<QuotationType | null>(null)
  const [projectSubType, setProjectSubType] = useState<ProjectSubType | null>(null)

  // Step 2: Customer info
  const [customerMode, setCustomerMode] = useState<'select' | 'manual'>('select')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [customerOptions, setCustomerOptions] = useState<Array<{ value: string; label: string }>>([])
  const [customerSearching, setCustomerSearching] = useState(false)
  const [templates, setTemplates] = useState<QuotationTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [templatesLoading, setTemplatesLoading] = useState(false)

  // Step 3: Product items
  const [items, setItems] = useState<ProductItem[]>([])
  const [nlInput, setNlInput] = useState('')
  const [parsing, setParsing] = useState(false)
  const [notes, setNotes] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [editingProductIndex, setEditingProductIndex] = useState<number | null>(null)
  const [productOptions, setProductOptions] = useState<ProductOption[]>([])
  const [productSearching, setProductSearching] = useState(false)

  // Step 4: Confirmation
  const [submitting, setSubmitting] = useState(false)
  const [createdQuotation, setCreatedQuotation] = useState<{ id: string; quotationNo: string } | null>(null)

  // Load customers
  const searchCustomers = async (query: string) => {
    if (query.length < 1) return
    setCustomerSearching(true)
    try {
      const response = await fetch(`/api/quotations/parse?q=${encodeURIComponent(query)}&type=customer`)
      if (response.ok) {
        const data = await response.json()
        const suggestions = data.suggestions || []
        setCustomerOptions(suggestions.map((s: { id: string; name: string }) => ({
          value: s.id,
          label: s.name,
        })))
      }
    } catch {
      // ignore
    } finally {
      setCustomerSearching(false)
    }
  }

  const loadAllCustomers = async () => {
    if (customerOptions.length > 5) return
    setCustomerSearching(true)
    try {
      const response = await fetch('/api/quotations/parse?type=customer')
      if (response.ok) {
        const data = await response.json()
        const suggestions = data.suggestions || []
        setCustomerOptions(
          suggestions
            .map((s: { id: string; name: string }) => ({ value: s.id, label: s.name }))
            .sort((a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, 'zh-TW'))
        )
      }
    } catch {
      // ignore
    } finally {
      setCustomerSearching(false)
    }
  }

  // Load templates when project sub type changes
  useEffect(() => {
    if (quotationType === 'project' && projectSubType) {
      setTemplatesLoading(true)
      const category = TEMPLATE_CATEGORY_MAP[projectSubType]
      fetch(`/api/quotation-templates?category=${category}`)
        .then(res => res.json())
        .then(data => {
          setTemplates(data.templates || [])
        })
        .catch(() => setTemplates([]))
        .finally(() => setTemplatesLoading(false))
    }
  }, [quotationType, projectSubType])

  // Apply template
  const applyTemplate = useCallback((template: QuotationTemplate) => {
    const templateItems: ProductItem[] = (template.items as TemplateItem[]).map((item, index) => ({
      key: `template-${index}-${Date.now()}`,
      productId: item.productId,
      sku: item.sku,
      productName: item.productName,
      category: item.category,
      quantity: item.quantity || 1,
      unitPrice: item.unitPrice || 0,
      description: item.description,
    }))
    setItems(templateItems)
    if (template.defaultNotes) setNotes(template.defaultNotes)
    if (template.paymentTerms) setPaymentTerms(template.paymentTerms)
  }, [])

  // Search products
  const searchProducts = async (query: string) => {
    if (query.length < 2) return
    setProductSearching(true)
    try {
      const response = await fetch(`/api/quotations/products?q=${encodeURIComponent(query)}&limit=15`)
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
      const response = await fetch('/api/quotations/products?limit=30')
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

  // NL parse (equipment mode)
  const handleParse = async () => {
    if (!nlInput.trim()) return
    setParsing(true)
    try {
      const requestBody: Record<string, unknown> = { input: nlInput.trim() }
      if (customerId) requestBody.customerId = customerId
      if (customerName) requestBody.customerName = customerName

      const response = await fetch('/api/quotations/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) throw new Error('解析失敗')

      const result = await response.json()
      const parsedItems: ProductItem[] = (result.items || []).map((item: ParsedItem, index: number) => ({
        key: `parsed-${index}-${Date.now()}`,
        productId: item.matched?.id,
        sku: item.matched?.sku,
        productName: item.matched?.name || item.input,
        category: item.matched?.category,
        quantity: item.quantity || 1,
        unitPrice: item.priceUnit || item.priceRange?.avg || 0,
        description: item.description,
      }))

      setItems(prev => [...prev, ...parsedItems])
      if (result.notes && !notes) setNotes(result.notes)
      setNlInput('')
      message.success(`已解析 ${parsedItems.length} 個產品`)
    } catch {
      message.error('解析失敗，請稍後再試')
    } finally {
      setParsing(false)
    }
  }

  // Add empty item
  const addEmptyItem = () => {
    setItems(prev => [
      ...prev,
      {
        key: `manual-${Date.now()}`,
        productName: '',
        quantity: 1,
        unitPrice: 0,
      },
    ])
    setEditingProductIndex(items.length)
  }

  // Remove item
  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  // Update item
  const updateItem = (index: number, field: keyof ProductItem, value: unknown) => {
    setItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  // Calculate total
  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + (item.unitPrice || 0) * (item.quantity || 0), 0)
  }

  // Submit quotation
  const handleSubmit = async () => {
    if (!customerId && !customerName.trim()) {
      message.error('請選擇或輸入客戶')
      return
    }
    if (items.length === 0) {
      message.error('請新增產品項目')
      return
    }

    setSubmitting(true)
    try {
      // If manual mode, create a new Partner first
      let finalCustomerId = customerId
      if (!finalCustomerId && customerName.trim()) {
        const createRes = await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: customerName.trim() }),
        })
        if (!createRes.ok) {
          const err = await createRes.json()
          throw new Error(err.error || '建立客戶失敗')
        }
        const newCustomer = await createRes.json()
        finalCustomerId = newCustomer.id
        setCustomerId(finalCustomerId)
      }

      const submitItems = items.map(item => ({
        productId: item.productId,
        sku: item.sku,
        productName: item.productName,
        category: item.category,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        description: item.description,
      }))

      const body: Record<string, unknown> = {
        customerId: finalCustomerId,
        items: submitItems,
      }
      if (projectName) body.projectName = projectName
      if (notes) body.notes = notes
      // Append payment terms to notes if present
      if (paymentTerms) {
        body.notes = notes ? `${notes}\n\n付款條件：${paymentTerms}` : `付款條件：${paymentTerms}`
      }

      const response = await fetch('/api/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '建立報價單失敗')
      }

      const result = await response.json()
      setCreatedQuotation({ id: result.id, quotationNo: result.quotationNo })
      message.success('報價單建立成功')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '建立報價單失敗')
    } finally {
      setSubmitting(false)
    }
  }

  // Step validation
  const canProceed = () => {
    switch (currentStep) {
      case 0:
        if (quotationType === 'equipment') return true
        if (quotationType === 'project' && projectSubType) return true
        return false
      case 1:
        return customerMode === 'select' ? !!customerId : !!customerName.trim()
      case 2:
        return items.length > 0 && items.every(item => item.productName)
      default:
        return true
    }
  }

  // Product table columns
  const columns: ColumnsType<ProductItem> = [
    {
      title: '產品',
      dataIndex: 'productName',
      width: 280,
      render: (value, _, index) => {
        const isEditing = editingProductIndex === index

        if (isEditing || !value) {
          const options = productOptions.map(p => ({
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
              placeholder="搜尋產品名稱或 SKU..."
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
                  updateItem(index, 'productId', p.id)
                  updateItem(index, 'productName', p.name)
                  updateItem(index, 'sku', p.sku || undefined)
                  updateItem(index, 'category', p.category)
                  if (p.listPrice && p.listPrice > 0) {
                    updateItem(index, 'unitPrice', p.listPrice)
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
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text strong>{value}</Text>
              <Tooltip title="更換產品">
                <SwapOutlined
                  style={{ color: '#1890ff', cursor: 'pointer', fontSize: 13 }}
                  onClick={() => {
                    setEditingProductIndex(index)
                    loadProducts()
                  }}
                />
              </Tooltip>
            </div>
            {items[index]?.sku && (
              <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                {items[index].sku}
              </Text>
            )}
          </div>
        )
      },
    },
    {
      title: '數量',
      dataIndex: 'quantity',
      width: 100,
      render: (value, _, index) => (
        <InputNumber
          min={1}
          value={value}
          onChange={v => updateItem(index, 'quantity', v || 1)}
          style={{ width: 80 }}
        />
      ),
    },
    {
      title: '單價',
      dataIndex: 'unitPrice',
      width: 150,
      render: (value, _, index) => (
        <InputNumber
          min={0}
          value={value}
          onChange={v => updateItem(index, 'unitPrice', v || 0)}
          formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          parser={v => v?.replace(/\$\s?|(,*)/g, '') as unknown as number}
          style={{ width: 120 }}
          placeholder="價格"
        />
      ),
    },
    {
      title: '小計',
      key: 'subtotal',
      width: 120,
      render: (_, record) => {
        const subtotal = (record.unitPrice || 0) * (record.quantity || 0)
        return (
          <Text strong style={{ color: '#1890ff' }}>
            ${subtotal.toLocaleString()}
          </Text>
        )
      },
    },
    {
      title: '說明',
      dataIndex: 'description',
      render: (value, _, index) => (
        <Input
          placeholder="補充說明..."
          value={value}
          onChange={e => updateItem(index, 'description', e.target.value)}
          allowClear
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_, __, index) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => removeItem(index)}
        />
      ),
    },
  ]

  // Render step content
  const renderStep1 = () => (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <Title level={4} style={{ textAlign: 'center', marginBottom: 32 }}>
        請選擇報價類型
      </Title>

      <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
        {/* Equipment card */}
        <Card
          hoverable
          style={{
            width: 300,
            cursor: 'pointer',
            border: quotationType === 'equipment' ? '2px solid #1890ff' : '1px solid #d9d9d9',
            background: quotationType === 'equipment' ? '#e6f7ff' : undefined,
          }}
          onClick={() => {
            setQuotationType('equipment')
            setProjectSubType(null)
          }}
        >
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <InboxOutlined style={{ fontSize: 48, color: '#1890ff', marginBottom: 16 }} />
            <Title level={4} style={{ marginBottom: 8 }}>設備買賣</Title>
            <Text type="secondary">單純產品型號 + 數量即可</Text>
          </div>
        </Card>

        {/* Project card */}
        <Card
          hoverable
          style={{
            width: 300,
            cursor: 'pointer',
            border: quotationType === 'project' ? '2px solid #52c41a' : '1px solid #d9d9d9',
            background: quotationType === 'project' ? '#f6ffed' : undefined,
          }}
          onClick={() => {
            setQuotationType('project')
          }}
        >
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <ProjectOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
            <Title level={4} style={{ marginBottom: 8 }}>專案報價</Title>
            <Text type="secondary">VoIP 或智慧網管，含多項產品組合</Text>
          </div>
        </Card>
      </div>

      {/* Project sub-types */}
      {quotationType === 'project' && (
        <div style={{ marginTop: 32 }}>
          <Divider>選擇專案類型</Divider>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            {PROJECT_SUB_TYPES.map(type => (
              <Card
                key={type.value}
                size="small"
                hoverable
                style={{
                  width: 200,
                  cursor: 'pointer',
                  border: projectSubType === type.value ? '2px solid #52c41a' : '1px solid #d9d9d9',
                  background: projectSubType === type.value ? '#f6ffed' : undefined,
                }}
                onClick={() => setProjectSubType(type.value)}
              >
                <div style={{ textAlign: 'center' }}>
                  <Text strong>{type.label}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {type.description}
                  </Text>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  const renderStep2 = () => (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <Title level={4} style={{ marginBottom: 24 }}>客戶資訊</Title>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text strong>
            <UserOutlined /> 客戶 <span style={{ color: '#ff4d4f' }}>*</span>
          </Text>
          <Button
            type="link"
            size="small"
            onClick={() => {
              if (customerMode === 'select') {
                setCustomerMode('manual')
                setCustomerId(null)
              } else {
                setCustomerMode('select')
                setCustomerName('')
              }
            }}
          >
            {customerMode === 'select' ? '手動輸入公司名稱' : '選擇現有客戶'}
          </Button>
        </div>
        {customerMode === 'select' ? (
          <Select
            showSearch
            placeholder="搜尋或選擇客戶..."
            style={{ width: '100%' }}
            value={customerId || undefined}
            options={customerOptions}
            loading={customerSearching}
            filterOption={(input, option) =>
              (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
            }
            onSearch={(value) => {
              if (value.length >= 1) searchCustomers(value)
            }}
            onFocus={() => loadAllCustomers()}
            onChange={(value, option) => {
              setCustomerId(value as string)
              if (option && 'label' in option) {
                setCustomerName(option.label as string)
              }
            }}
            notFoundContent={customerSearching ? <Spin size="small" /> : '找不到客戶'}
            size="large"
          />
        ) : (
          <>
            <Input
              placeholder="輸入公司名稱，例如：台大資訊"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              size="large"
            />
            <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
              提交報價單時將自動建立此客戶
            </Text>
          </>
        )}
      </div>

      <div style={{ marginBottom: 24 }}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          <FileTextOutlined /> 專案名稱（選填）
        </Text>
        <Input
          placeholder="例如：XX公司 VoIP 建置案"
          value={projectName}
          onChange={e => setProjectName(e.target.value)}
          size="large"
        />
      </div>

      {/* Template selection for project type */}
      {quotationType === 'project' && projectSubType && (
        <div style={{ marginBottom: 24 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            <FileTextOutlined /> 選擇範本（選填）
          </Text>
          {templatesLoading ? (
            <Spin />
          ) : templates.length > 0 ? (
            <Select
              placeholder="選擇報價範本..."
              style={{ width: '100%' }}
              value={selectedTemplateId || undefined}
              allowClear
              onChange={(value) => {
                setSelectedTemplateId(value)
                if (value) {
                  const template = templates.find(t => t.id === value)
                  if (template) applyTemplate(template)
                } else {
                  setItems([])
                  setNotes('')
                  setPaymentTerms('')
                }
              }}
              size="large"
            >
              {templates.map(t => (
                <Select.Option key={t.id} value={t.id}>
                  <div>
                    <Text strong>{t.name}</Text>
                    {t.description && (
                      <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                        {t.description}
                      </Text>
                    )}
                    <Tag style={{ marginLeft: 8 }}>
                      {(t.items as TemplateItem[]).length} 項產品
                    </Tag>
                  </div>
                </Select.Option>
              ))}
            </Select>
          ) : (
            <Alert
              title="尚無此類型的報價範本"
              description="您仍可手動新增產品項目"
              type="info"
              showIcon
            />
          )}
        </div>
      )}
    </div>
  )

  const renderStep3 = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>產品明細</Title>
        <Space>
          <Button icon={<PlusOutlined />} onClick={addEmptyItem}>
            手動新增
          </Button>
        </Space>
      </div>

      {/* NL input for equipment mode */}
      {quotationType === 'equipment' && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            <SendOutlined /> 自然語言輸入
          </Text>
          <div style={{ display: 'flex', gap: 8 }}>
            <TextArea
              rows={2}
              placeholder="例如：CCR2004 x2, SBC1000 一台"
              value={nlInput}
              onChange={e => setNlInput(e.target.value)}
              style={{ flex: 1 }}
              onPressEnter={e => {
                if (!e.shiftKey) {
                  e.preventDefault()
                  handleParse()
                }
              }}
            />
            <Button
              type="primary"
              icon={parsing ? <Spin size="small" /> : <SendOutlined />}
              onClick={handleParse}
              disabled={parsing || !nlInput.trim()}
              style={{ height: 'auto' }}
            >
              解析
            </Button>
          </div>
        </Card>
      )}

      {/* Product table */}
      <Table
        dataSource={items}
        columns={columns}
        rowKey="key"
        pagination={false}
        size="middle"
        bordered
        locale={{ emptyText: '尚無產品，請新增或從範本載入' }}
      />

      {/* Total */}
      {items.length > 0 && (
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <Space size="large">
            <Text type="secondary">預估總金額：</Text>
            <Title level={3} style={{ margin: 0, color: '#1890ff' }}>
              ${calculateTotal().toLocaleString()}
            </Title>
          </Space>
        </div>
      )}

      {/* Notes and payment terms */}
      <Divider />
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 300 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>備註</Text>
          <TextArea
            rows={3}
            placeholder="報價備註..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>
        <div style={{ flex: 1, minWidth: 300 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>付款條件</Text>
          <TextArea
            rows={3}
            placeholder="例如：訂金30%、交機40%、驗收30%"
            value={paymentTerms}
            onChange={e => setPaymentTerms(e.target.value)}
          />
        </div>
      </div>
    </div>
  )

  const renderStep4 = () => {
    if (createdQuotation) {
      return (
        <Result
          status="success"
          title="報價單已建立"
          subTitle={
            <Space orientation="vertical" align="center">
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 12,
                background: '#f6ffed',
                border: '1px solid #b7eb8f',
                borderRadius: 8,
                padding: '16px 32px',
              }}>
                <Text type="secondary">報價單編號</Text>
                <Title level={2} style={{ margin: 0, color: '#1890ff', fontFamily: 'monospace' }}>
                  {createdQuotation.quotationNo}
                </Title>
                <Tooltip title="複製編號">
                  <Button
                    type="text"
                    icon={<CopyOutlined />}
                    onClick={() => {
                      navigator.clipboard.writeText(createdQuotation.quotationNo)
                      message.success('已複製報價單編號')
                    }}
                    style={{ color: '#1890ff' }}
                  />
                </Tooltip>
              </div>
              <Text type="secondary">
                客戶：{customerName}
                {projectName && ` / 專案：${projectName}`}
              </Text>
              <Text type="secondary">
                金額：${calculateTotal().toLocaleString()}（含稅）
              </Text>
            </Space>
          }
          extra={[
            <Button
              key="view"
              type="primary"
              icon={<FileTextOutlined />}
              onClick={() => router.push(`/quotations/${createdQuotation.id}`)}
            >
              查看報價單
            </Button>,
            <Button
              key="new"
              onClick={() => {
                // Reset all state
                setCurrentStep(0)
                setQuotationType(null)
                setProjectSubType(null)
                setCustomerMode('select')
                setCustomerId(null)
                setCustomerName('')
                setProjectName('')
                setSelectedTemplateId(null)
                setItems([])
                setNlInput('')
                setNotes('')
                setPaymentTerms('')
                setCreatedQuotation(null)
              }}
            >
              建立新報價
            </Button>,
            <Button
              key="list"
              onClick={() => router.push('/quotations')}
            >
              回列表
            </Button>,
          ]}
        />
      )
    }

    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <Title level={4} style={{ marginBottom: 24 }}>確認報價單</Title>

        {/* Summary */}
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space orientation="vertical" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text type="secondary">報價類型：</Text>
              <Tag color={quotationType === 'equipment' ? 'blue' : 'green'}>
                {quotationType === 'equipment' ? '設備買賣' : `專案報價 - ${PROJECT_SUB_TYPES.find(t => t.value === projectSubType)?.label || ''}`}
              </Tag>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text type="secondary">客戶：</Text>
              <Text strong>{customerName}</Text>
            </div>
            {projectName && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text type="secondary">專案名稱：</Text>
                <Text>{projectName}</Text>
              </div>
            )}
          </Space>
        </Card>

        {/* Items summary table */}
        <Table
          dataSource={items}
          rowKey="key"
          pagination={false}
          size="small"
          bordered
          columns={[
            { title: '產品', dataIndex: 'productName', key: 'productName' },
            { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 180, render: v => v || '-' },
            { title: '數量', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'center' as const },
            {
              title: '單價',
              dataIndex: 'unitPrice',
              key: 'unitPrice',
              width: 120,
              align: 'right' as const,
              render: (v: number) => `$${(v || 0).toLocaleString()}`,
            },
            {
              title: '小計',
              key: 'subtotal',
              width: 120,
              align: 'right' as const,
              render: (_: unknown, record: ProductItem) =>
                `$${((record.unitPrice || 0) * (record.quantity || 0)).toLocaleString()}`,
            },
          ]}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={4}>
                <Text strong>合計</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">
                <Text strong style={{ color: '#1890ff', fontSize: 16 }}>
                  ${calculateTotal().toLocaleString()}
                </Text>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />

        {/* Notes */}
        {notes && (
          <Card size="small" style={{ marginTop: 16 }}>
            <Text strong>備註：</Text>
            <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{notes}</div>
          </Card>
        )}
        {paymentTerms && (
          <Card size="small" style={{ marginTop: 8 }}>
            <Text strong>付款條件：</Text>
            <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{paymentTerms}</div>
          </Card>
        )}

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <Button
            type="primary"
            size="large"
            icon={<CheckCircleOutlined />}
            onClick={handleSubmit}
            loading={submitting}
            style={{ minWidth: 200 }}
          >
            建立報價單
          </Button>
        </div>
      </div>
    )
  }

  const stepContent = [renderStep1, renderStep2, renderStep3, renderStep4]

  return (
    <AppLayout>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={4} style={{ margin: 0 }}>
          <ShoppingOutlined style={{ marginRight: 8 }} />
          建立報價單
        </Title>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push('/quotations')}
        >
          回列表
        </Button>
      </div>

      <Card>
        <Steps
          current={currentStep}
          style={{ marginBottom: 32 }}
          items={[
            { title: '報價類型' },
            { title: '客戶資訊' },
            { title: '產品明細' },
            { title: '確認送出' },
          ]}
        />

        <div style={{ minHeight: 400, padding: '16px 0' }}>
          {stepContent[currentStep]()}
        </div>

        {/* Navigation buttons */}
        {!createdQuotation && (
          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => setCurrentStep(prev => prev - 1)}
              disabled={currentStep === 0}
            >
              上一步
            </Button>
            {currentStep < 3 && (
              <Button
                type="primary"
                icon={<ArrowRightOutlined />}
                onClick={() => setCurrentStep(prev => prev + 1)}
                disabled={!canProceed()}
              >
                下一步
              </Button>
            )}
          </div>
        )}
      </Card>
    </AppLayout>
  )
}
