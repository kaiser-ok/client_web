'use client'

import { useState, useCallback } from 'react'
import {
  Modal,
  Input,
  Button,
  Table,
  InputNumber,
  Select,
  Spin,
  Alert,
  Typography,
  Space,
  Tag,
  Tooltip,
  message,
  Divider,
  AutoComplete,
} from 'antd'
import {
  SendOutlined,
  CheckCircleOutlined,
  QuestionCircleOutlined,
  DollarOutlined,
  UserOutlined,
  ShoppingOutlined,
  HistoryOutlined,
  FileTextOutlined,
  CopyOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import type { ColumnsType } from 'antd/es/table'

const { TextArea } = Input
const { Text, Title } = Typography

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
  descriptionSuggestions?: string[]  // 歷史說明建議
}

interface ParsedQuotation {
  customer: {
    input: string
    matched?: { id: string; name: string; confidence: number }
    suggestions?: Array<{ id: string; name: string; score: number }>
  }
  project?: string
  items: ParsedItem[]
  totalAmount?: number
  notes?: string
}

interface SmartQuotationModalProps {
  open: boolean
  customerId?: string
  customerName?: string
  onClose: () => void
  onSuccess?: (quotation: ParsedQuotation) => void
}

export default function SmartQuotationModal({
  open,
  customerId,
  customerName,
  onClose,
  onSuccess,
}: SmartQuotationModalProps) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [parsed, setParsed] = useState<ParsedQuotation | null>(null)
  const [editingItems, setEditingItems] = useState<ParsedItem[]>([])
  const [customerSearchOptions, setCustomerSearchOptions] = useState<Array<{ value: string; label: string }>>([])
  const [customerSearching, setCustomerSearching] = useState(false)
  const [createdQuotation, setCreatedQuotation] = useState<{ id: string; quotationNo: string } | null>(null)
  const [editingProductIndex, setEditingProductIndex] = useState<number | null>(null)
  const [productOptions, setProductOptions] = useState<Array<{ id: string; name: string; sku?: string | null; category: string; listPrice: number | null }>>([])
  const [productSearching, setProductSearching] = useState(false)

  // 解析輸入
  const handleParse = useCallback(async () => {
    if (!input.trim()) {
      message.warning('請輸入報價描述')
      return
    }

    setLoading(true)
    try {
      // 如果已有客戶資訊，帶入 API 以提高解析準確度
      const requestBody: Record<string, unknown> = { input: input.trim() }
      if (customerId) requestBody.customerId = customerId
      if (customerName) requestBody.customerName = customerName

      const response = await fetch('/api/quotations/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error('解析失敗')
      }

      const result: ParsedQuotation = await response.json()
      setParsed(result)
      setEditingItems([...result.items])

      // 預設客戶選項（讓 Select 能顯示已匹配的客戶名稱）
      const initialOptions: Array<{ value: string; label: string }> = []
      if (result.customer.matched) {
        initialOptions.push({ value: result.customer.matched.id, label: result.customer.matched.name })
      }
      if (result.customer.suggestions) {
        result.customer.suggestions.forEach(s => {
          if (!initialOptions.some(o => o.value === s.id)) {
            initialOptions.push({ value: s.id, label: s.name })
          }
        })
      }
      setCustomerSearchOptions(initialOptions)
    } catch (error) {
      message.error('解析失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }, [input, customerId, customerName])

  // 搜尋客戶（從 parse API 的 GET endpoint，使用 product-kb.json 客戶資料）
  const searchCustomers = async (query: string) => {
    if (query.length < 1) return
    setCustomerSearching(true)
    try {
      const response = await fetch(`/api/quotations/parse?q=${encodeURIComponent(query)}&type=customer`)
      if (response.ok) {
        const data = await response.json()
        const suggestions = data.suggestions || []
        const newOptions = suggestions.map((s: { id: string; name: string }) => ({
          value: s.id,
          label: s.name,
        }))
        // 合併：保留已匹配客戶 + 新搜尋結果
        setCustomerSearchOptions(prev => {
          const merged = [...prev]
          newOptions.forEach((opt: { value: string; label: string }) => {
            if (!merged.some(m => m.value === opt.value)) {
              merged.push(opt)
            }
          })
          return merged
        })
      }
    } catch (error) {
      console.error('Failed to search customers:', error)
    } finally {
      setCustomerSearching(false)
    }
  }

  // 載入全部客戶列表
  const loadCustomers = async () => {
    if (customerSearchOptions.length > 5) return
    setCustomerSearching(true)
    try {
      const response = await fetch('/api/quotations/parse?type=customer')
      if (response.ok) {
        const data = await response.json()
        const suggestions = data.suggestions || []
        const newOptions = suggestions.map((s: { id: string; name: string }) => ({
          value: s.id,
          label: s.name,
        }))
        setCustomerSearchOptions(prev => {
          const merged = [...prev]
          newOptions.forEach((opt: { value: string; label: string }) => {
            if (!merged.some(m => m.value === opt.value)) {
              merged.push(opt)
            }
          })
          merged.sort((a, b) => a.label.localeCompare(b.label, 'zh-TW'))
          return merged
        })
      }
    } catch (error) {
      console.error('Failed to load customers:', error)
    } finally {
      setCustomerSearching(false)
    }
  }

  // 選擇客戶
  const selectCustomer = (id: string, name: string) => {
    if (!parsed) return
    setParsed({
      ...parsed,
      customer: {
        ...parsed.customer,
        matched: { id, name, confidence: 1 },
      },
    })
  }

  // 搜尋產品
  const searchProducts = async (query: string) => {
    if (query.length < 2) return
    setProductSearching(true)
    try {
      const response = await fetch(`/api/quotations/products?q=${encodeURIComponent(query)}&limit=15`)
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

  const loadProducts = async () => {
    if (productOptions.length > 0) return
    setProductSearching(true)
    try {
      const response = await fetch('/api/quotations/products?limit=30')
      if (response.ok) {
        const data = await response.json()
        setProductOptions(data.products || [])
      }
    } catch (error) {
      console.error('Failed to load products:', error)
    } finally {
      setProductSearching(false)
    }
  }

  // 更新產品項目
  const updateItem = (index: number, field: keyof ParsedItem, value: unknown) => {
    setEditingItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  // 選擇產品建議
  const selectProduct = (index: number, product: { id: string; name: string; sku?: string; category: string }) => {
    setEditingItems(prev => {
      const updated = [...prev]
      updated[index] = {
        ...updated[index],
        matched: { ...product, confidence: 1 },
        input: product.name,
      }
      return updated
    })
  }

  // 計算總金額
  const calculateTotal = () => {
    return editingItems.reduce((sum, item) => {
      const price = item.priceUnit || item.priceRange?.avg || 0
      return sum + price * item.quantity
    }, 0)
  }

  // 確認建立
  const handleConfirm = async () => {
    if (!parsed) return

    // 確定客戶 ID
    const finalCustomerId = customerId || parsed.customer.matched?.id?.toString()
    if (!finalCustomerId) {
      message.error('請選擇客戶')
      return
    }

    // 準備儲存資料
    const items = editingItems.map(item => ({
      productId: item.matched?.id,
      sku: item.matched?.sku,
      productName: item.matched?.name || item.input,
      category: item.matched?.category,
      quantity: item.quantity,
      unitPrice: item.priceUnit || item.priceRange?.avg || 0,
      description: item.description,
    }))

    try {
      const response = await fetch('/api/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: finalCustomerId,
          projectName: parsed.project,
          items,
          notes: parsed.notes,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '儲存失敗')
      }

      const savedQuotation = await response.json()

      const finalQuotation: ParsedQuotation = {
        ...parsed,
        items: editingItems,
        totalAmount: calculateTotal(),
      }

      onSuccess?.(finalQuotation)
      setCreatedQuotation({ id: savedQuotation.id, quotationNo: savedQuotation.quotationNo })
    } catch (error) {
      message.error(error instanceof Error ? error.message : '儲存報價單失敗')
    }
  }

  // 關閉並重置
  const handleClose = () => {
    setInput('')
    setParsed(null)
    setEditingItems([])
    setCustomerSearchOptions([])
    setCreatedQuotation(null)
    setEditingProductIndex(null)
    setProductOptions([])
    onClose()
  }

  // 產品表格欄位
  const columns: ColumnsType<ParsedItem> = [
    {
      title: '產品',
      key: 'product',
      width: 280,
      render: (_, record, index) => {
        const isEditing = editingProductIndex === index

        // 搜尋模式：AutoComplete
        if (isEditing) {
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
            <div>
              <AutoComplete
                autoFocus
                placeholder="搜尋產品名稱或 SKU..."
                style={{ width: '100%' }}
                options={options}
                onSearch={(value) => {
                  if (value.length >= 2) searchProducts(value)
                }}
                onFocus={() => loadProducts()}
                onSelect={(_, option) => {
                  const p = (option as { product?: typeof productOptions[0] }).product
                  if (p) {
                    selectProduct(index, { id: p.id, name: p.name, sku: p.sku || undefined, category: p.category })
                    // 帶入參考價格
                    if (p.listPrice && p.listPrice > 0) {
                      updateItem(index, 'priceUnit', p.listPrice)
                    }
                  }
                  setEditingProductIndex(null)
                }}
                allowClear
                onBlur={() => setTimeout(() => setEditingProductIndex(null), 200)}
                notFoundContent={productSearching ? <Spin size="small" /> : null}
              />
              <Button
                type="text"
                size="small"
                onClick={() => setEditingProductIndex(null)}
                style={{ marginTop: 4 }}
              >
                取消
              </Button>
            </div>
          )
        }

        // 顯示模式
        // 收集建議（排除已選）
        const otherSuggestions = (record.suggestions || []).filter(s => s.id !== record.matched?.id)

        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {record.matched ? (
                <>
                  <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  <Text strong>{record.matched.name}</Text>
                </>
              ) : (
                <>
                  <QuestionCircleOutlined style={{ color: '#faad14' }} />
                  <Text type="warning">{record.input}</Text>
                </>
              )}
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
            {record.matched && (
              <div>
                {record.matched.sku && (
                  <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                    {record.matched.sku}
                  </Text>
                )}
                {record.matched.sku && <br />}
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {record.matched.category}
                </Text>
              </div>
            )}
            {otherSuggestions.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {record.matched ? '或選：' : '建議：'}
                </Text>
                <Space wrap size={4} style={{ marginTop: 2 }}>
                  {otherSuggestions.slice(0, 3).map(s => (
                    <Tag
                      key={s.id}
                      color="default"
                      style={{ cursor: 'pointer' }}
                      onClick={() => selectProduct(index, s)}
                    >
                      {s.name.substring(0, 15)}
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
      dataIndex: 'priceUnit',
      width: 150,
      render: (value, record, index) => (
        <div>
          <InputNumber
            min={0}
            value={value || record.priceRange?.avg}
            onChange={v => updateItem(index, 'priceUnit', v)}
            formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={v => v?.replace(/\$\s?|(,*)/g, '') as unknown as number}
            style={{ width: 120 }}
            placeholder="價格"
          />
          {record.priceRange && (
            <Tooltip title={`歷史價格：$${record.priceRange.min.toLocaleString()} ~ $${record.priceRange.max.toLocaleString()}`}>
              <DollarOutlined style={{ marginLeft: 4, color: '#1890ff', cursor: 'pointer' }} />
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      title: '小計',
      key: 'subtotal',
      width: 120,
      render: (_, record) => {
        const price = record.priceUnit || record.priceRange?.avg || 0
        const subtotal = price * record.quantity
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
      render: (value, record, index) => {
        const suggestions = record.descriptionSuggestions || []
        const options = suggestions.map(s => ({
          value: s,
          label: (
            <Space>
              <HistoryOutlined style={{ color: '#999' }} />
              <span>{s}</span>
            </Space>
          ),
        }))

        return (
          <div>
            <AutoComplete
              placeholder="補充說明..."
              value={value}
              onChange={v => updateItem(index, 'description', v)}
              options={options}
              style={{ width: '100%' }}
              allowClear
            />
            {suggestions.length > 0 && !value && (
              <div style={{ marginTop: 4 }}>
                <Tooltip title="從歷史資料推測的說明">
                  <HistoryOutlined style={{ color: '#1890ff', fontSize: 12, marginRight: 4 }} />
                </Tooltip>
                <Space size={4} wrap>
                  {suggestions.slice(0, 2).map((s, i) => (
                    <Tag
                      key={i}
                      color="default"
                      style={{ cursor: 'pointer', fontSize: 11 }}
                      onClick={() => updateItem(index, 'description', s)}
                    >
                      {s.length > 15 ? s.substring(0, 15) + '...' : s}
                    </Tag>
                  ))}
                </Space>
              </div>
            )}
          </div>
        )
      },
    },
  ]

  // 複製報價單編號
  const copyQuotationNo = () => {
    if (createdQuotation) {
      navigator.clipboard.writeText(createdQuotation.quotationNo)
      message.success('已複製報價單編號')
    }
  }

  // Modal footer 依狀態切換
  const getFooter = () => {
    if (createdQuotation) {
      return [
        <Button key="close" onClick={handleClose}>
          關閉
        </Button>,
        <Button
          key="view"
          type="primary"
          icon={<FileTextOutlined />}
          onClick={() => {
            router.push(`/quotations/${createdQuotation.id}`)
            handleClose()
          }}
        >
          查看報價單
        </Button>,
      ]
    }
    if (parsed) {
      return [
        <Button key="back" onClick={() => setParsed(null)}>
          重新輸入
        </Button>,
        <Button key="cancel" onClick={handleClose}>
          取消
        </Button>,
        <Button key="confirm" type="primary" onClick={handleConfirm}>
          確認建立
        </Button>,
      ]
    }
    return null
  }

  return (
    <Modal
      title={
        <Space>
          <ShoppingOutlined />
          智能報價單
          {createdQuotation && (
            <Tag color="green" style={{ marginLeft: 8 }}>已建立</Tag>
          )}
        </Space>
      }
      open={open}
      onCancel={handleClose}
      width={1000}
      footer={getFooter()}
      styles={{ body: { minHeight: 400 } }}
    >
      {createdQuotation ? (
        // 建立成功階段
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <CheckCircleOutlined style={{ fontSize: 64, color: '#52c41a', marginBottom: 24 }} />
          <Title level={3} style={{ marginBottom: 8 }}>報價單已建立</Title>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            background: '#f6ffed',
            border: '1px solid #b7eb8f',
            borderRadius: 8,
            padding: '16px 32px',
            marginBottom: 24,
          }}>
            <Text type="secondary">報價單編號</Text>
            <Title level={2} style={{ margin: 0, color: '#1890ff', fontFamily: 'monospace' }}>
              {createdQuotation.quotationNo}
            </Title>
            <Tooltip title="複製編號">
              <Button
                type="text"
                icon={<CopyOutlined />}
                onClick={copyQuotationNo}
                style={{ color: '#1890ff' }}
              />
            </Tooltip>
          </div>
          <div>
            <Text type="secondary">
              客戶：{parsed?.customer.matched?.name || parsed?.customer.input}
              {parsed?.project && ` / 專案：${parsed.project}`}
            </Text>
          </div>
          <div style={{ marginTop: 8 }}>
            <Text type="secondary">
              金額：${calculateTotal().toLocaleString()}（含稅）
            </Text>
          </div>
        </div>
      ) : !parsed ? (
        // 輸入階段
        <div>
          <Alert
            title="用自然語言描述報價需求"
            description="例如：幫台大報 2 台 MikroTik CCR2004，含一年 MA，大概 15 萬"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          {customerName && (
            <div style={{ marginBottom: 16 }}>
              <Space>
                <UserOutlined />
                <Text>客戶：</Text>
                <Tag color="blue">{customerName}</Tag>
              </Space>
            </div>
          )}

          <TextArea
            rows={4}
            placeholder="請描述報價需求...&#10;&#10;例如：&#10;• 友訊要 3 套智慧網管系統，大概 50 萬&#10;• 至興資通 IPPBX 專案，需要主機 + 50 台話機&#10;• 中華電信 SBC1000 延長保固兩年"
            value={input}
            onChange={e => setInput(e.target.value)}
            style={{ marginBottom: 16 }}
          />

          <Button
            type="primary"
            icon={loading ? <Spin size="small" /> : <SendOutlined />}
            onClick={handleParse}
            disabled={loading || !input.trim()}
            block
            size="large"
          >
            {loading ? '解析中...' : '解析報價需求'}
          </Button>
        </div>
      ) : (
        // 結果階段
        <div>
          {/* 客戶資訊 */}
          <div style={{ marginBottom: 16 }}>
            <Space align="center">
              <UserOutlined />
              <Text strong>客戶：</Text>
              <Select
                showSearch
                placeholder="搜尋或選擇客戶..."
                style={{ width: 300 }}
                value={parsed.customer.matched?.id || undefined}
                options={customerSearchOptions}
                loading={customerSearching}
                filterOption={(input, option) =>
                  (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
                }
                onSearch={(value) => {
                  if (value.length >= 2) {
                    searchCustomers(value)
                  }
                }}
                onFocus={() => loadCustomers()}
                onChange={(value, option) => {
                  if (option && 'label' in option) {
                    selectCustomer(value as string, option.label as string)
                  }
                }}
                notFoundContent={customerSearching ? <Spin size="small" /> : '找不到客戶'}
              />
              {!parsed.customer.matched && (
                <Tag color="orange" icon={<QuestionCircleOutlined />} style={{ marginLeft: 4 }}>
                  原始輸入：{parsed.customer.input}
                </Tag>
              )}

              {parsed.project && (
                <>
                  <Divider type="vertical" />
                  <Text type="secondary">專案：{parsed.project}</Text>
                </>
              )}
            </Space>
          </div>

          {/* 產品明細表格 */}
          <Table
            dataSource={editingItems}
            columns={columns}
            rowKey={(_, index) => index?.toString() || '0'}
            pagination={false}
            size="middle"
            bordered
          />

          {/* 總計 */}
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Space orientation="vertical" align="end" size={4}>
              <Space size="large">
                <Text type="secondary">預估總金額：</Text>
                <Title level={3} style={{ margin: 0, color: '#1890ff' }}>
                  ${calculateTotal().toLocaleString()}
                </Title>
              </Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                以上報價均為含稅價（含 5% 營業稅）
              </Text>
            </Space>
          </div>

          {parsed.notes && (
            <Alert
              title="備註"
              description={parsed.notes}
              type="info"
              style={{ marginTop: 16 }}
            />
          )}
        </div>
      )}
    </Modal>
  )
}
