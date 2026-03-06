'use client'

import { useState, useRef, useCallback } from 'react'
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  App,
  Empty,
  Spin,
  Tooltip,
  Popover,
  Popconfirm,
  InputNumber,
  Tabs,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  PlusOutlined,
  ProjectOutlined,
  EditOutlined,
  DeleteOutlined,
  PictureOutlined,
  ShoppingOutlined,
  LinkOutlined,
  SearchOutlined,
  ShopOutlined,
  TrophyOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import useSWR from 'swr'
import ReactMarkdown from 'react-markdown'
import { useUser } from '@/hooks/useUser'
import BonusEvalModal from '@/components/bonus/BonusEvalModal'

const fetcher = (url: string) => fetch(url).then(res => res.json())

interface ProductLine {
  name: string
  description: string | null
  quantity: number
  unitPrice: number
  subtotal: number
}

interface Project {
  id: string
  name: string
  type: string | null
  description: string | null
  products: ProductLine[] | null
  dealId: string | null
  dealAmount: number | null
  odooId: number | null
  odooOrderName: string | null
  bonusEvalStatus: string | null
  bonusEvalScore: number | null
  endUserId: string | null
  endUserName: string | null
  status: string
  startDate: string | null
  endDate: string | null
  activityCount: number
  lineChannelCount: number
  createdAt: string
}

interface EndUser {
  id: string
  name: string
}

interface EndUserProject {
  id: string
  name: string
  type: string | null
  dealerId: string
  dealerName: string
  odooId: number | null
  odooOrderName: string | null
  status: string
  startDate: string | null
  endDate: string | null
  activityCount: number
}

const ODOO_BASE_URL = 'https://odoo.gentrice.net/web#'

const getOdooOrderUrl = (odooId: number) => {
  return `${ODOO_BASE_URL}id=${odooId}&cids=1-2&menu_id=227&action=339&model=sale.order&view_type=form`
}

interface ProjectsCardProps {
  customerId: string
  limit?: number
}

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: '進行中', color: 'green' },
  { value: 'COMPLETED', label: '已完成', color: 'blue' },
  { value: 'ON_HOLD', label: '暫停', color: 'orange' },
  { value: 'CANCELLED', label: '取消', color: 'default' },
]

const PROJECT_TYPE_OPTIONS = [
  { value: 'CHT(共契)', label: 'CHT(共契)' },
  { value: 'VOIP', label: 'VOIP' },
  { value: '智慧網管', label: '智慧網管' },
  { value: '網通設備', label: '網通設備' },
  { value: '維護案_SNM', label: '維護案_SNM' },
  { value: '維護案_VOIP', label: '維護案_VOIP' },
  { value: '維護案_智慧網管', label: '維護案_智慧網管' },
  { value: '維護案_其他', label: '維護案_其他' },
  { value: '其他', label: '其他' },
]

const getStatusInfo = (status: string) => {
  return STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0]
}

export default function ProjectsCard({ customerId, limit }: ProjectsCardProps) {
  const { message } = App.useApp()
  const { can } = useUser()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [uploading, setUploading] = useState(false)
  const [form] = Form.useForm()
  const textAreaRef = useRef<HTMLTextAreaElement>(null)
  const descriptionValue = Form.useWatch('description', form)

  const canEdit = can('EDIT_PROJECT')
  const canDelete = can('DELETE_PROJECT')
  const canViewOdoo = can('VIEW_DEAL_AMOUNT')
  const canViewBonus = can('VIEW_BONUS')
  const [bonusProject, setBonusProject] = useState<Project | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE')

  const { data, isLoading, mutate } = useSWR<{ projects: Project[] }>(
    `/api/customers/${customerId}/projects`,
    fetcher
  )

  // 取得作為最終用戶的專案
  const { data: endUserProjectsData, isLoading: isLoadingEndUser } = useSWR<{ projects: EndUserProject[] }>(
    `/api/customers/${customerId}/end-user-projects`,
    fetcher
  )
  const endUserProjects = endUserProjectsData?.projects || []

  // 取得最終用戶列表（role = END_USER）
  const { data: endUsersData } = useSWR<{ customers: EndUser[] }>(
    '/api/customers?role=END_USER&pageSize=500',
    fetcher
  )
  const endUserOptions = endUsersData?.customers?.map(c => ({ value: c.id, label: c.name })) || []

  // 計算兩個字串的共同前綴長度
  const commonPrefixLength = (a: string, b: string): number => {
    let i = 0
    while (i < a.length && i < b.length && a[i] === b[i]) i++
    return i
  }

  // 自動匹配最終用戶：多種匹配策略
  const findBestEndUserMatch = useCallback(() => {
    const projectName = form.getFieldValue('name')
    if (!projectName || !endUsersData?.customers?.length) {
      message.info('請先輸入專案名稱')
      return
    }

    const customers = endUsersData.customers

    // 策略1：完全包含匹配（用戶名稱出現在專案名稱中）
    const exactMatches = customers
      .filter(c => projectName.includes(c.name))
      .sort((a, b) => b.name.length - a.name.length)

    if (exactMatches.length > 0) {
      form.setFieldValue('endUserId', exactMatches[0].id)
      message.success(`完全匹配: ${exactMatches[0].name}`)
      return
    }

    // 策略2：前綴匹配（專案名稱與用戶名稱有共同前綴，至少2個字）
    const prefixMatches = customers
      .map(c => ({ customer: c, prefixLen: commonPrefixLength(projectName, c.name) }))
      .filter(m => m.prefixLen >= 2) // 至少2個字的共同前綴
      .sort((a, b) => b.prefixLen - a.prefixLen)

    if (prefixMatches.length > 0) {
      const best = prefixMatches[0]
      form.setFieldValue('endUserId', best.customer.id)
      message.success(`前綴匹配: ${best.customer.name}（共同前綴: ${projectName.substring(0, best.prefixLen)}）`)
      return
    }

    // 策略3：關鍵字匹配（縣市名稱）
    const locationKeywords = ['臺北', '台北', '新北', '桃園', '臺中', '台中', '臺南', '台南', '高雄',
      '基隆', '新竹', '嘉義', '宜蘭', '苗栗', '彰化', '南投', '雲林', '屏東', '花蓮', '臺東', '台東',
      '澎湖', '金門', '連江', '馬祖']

    for (const keyword of locationKeywords) {
      if (projectName.includes(keyword)) {
        const keywordMatches = customers.filter(c => c.name.includes(keyword))
        if (keywordMatches.length > 0) {
          // 優先選擇名稱較短的（通常是主要單位）
          keywordMatches.sort((a, b) => a.name.length - b.name.length)
          form.setFieldValue('endUserId', keywordMatches[0].id)
          message.success(`關鍵字匹配（${keyword}）: ${keywordMatches[0].name}`)
          return
        }
      }
    }

    message.info('找不到匹配的最終用戶')
  }, [form, endUsersData, message])

  const projects = data?.projects || []
  const filteredProjects = statusFilter ? projects.filter(p => p.status === statusFilter) : projects
  const displayProjects = limit ? filteredProjects.slice(0, limit) : filteredProjects

  // 上傳圖片
  const uploadImage = useCallback(async (file: File, projectId: string): Promise<string | null> => {
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch(
        `/api/customers/${customerId}/projects/${projectId}/images`,
        {
          method: 'POST',
          body: formData,
        }
      )

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || '上傳失敗')
      }

      return result.markdown
    } catch (error) {
      message.error(error instanceof Error ? error.message : '圖片上傳失敗')
      return null
    }
  }, [customerId, message])

  // 處理貼上事件
  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue

        // 需要先有專案 ID 才能上傳
        if (!editingProject?.id) {
          message.warning('請先儲存專案後再貼上圖片')
          return
        }

        setUploading(true)
        const markdown = await uploadImage(file, editingProject.id)
        setUploading(false)

        if (markdown) {
          // 插入 markdown 到說明欄位
          const currentValue = form.getFieldValue('description') || ''
          const textarea = textAreaRef.current

          if (textarea) {
            const start = textarea.selectionStart
            const end = textarea.selectionEnd
            const newValue = currentValue.substring(0, start) + markdown + '\n' + currentValue.substring(end)
            form.setFieldValue('description', newValue)
          } else {
            form.setFieldValue('description', currentValue + '\n' + markdown)
          }

          message.success('圖片已貼上')
        }
        break
      }
    }
  }, [editingProject, form, message, uploadImage])

  const handleAdd = () => {
    setEditingProject(null)
    form.resetFields()
    setModalOpen(true)
  }

  const handleEdit = (project: Project) => {
    setEditingProject(project)
    form.setFieldsValue({
      name: project.name,
      type: project.type,
      description: project.description,
      products: project.products || [],
      endUserId: project.endUserId,
      status: project.status,
      startDate: project.startDate ? dayjs(project.startDate) : null,
      endDate: project.endDate ? dayjs(project.endDate) : null,
    })
    setModalOpen(true)
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    try {
      const payload = {
        ...values,
        startDate: values.startDate ? (values.startDate as dayjs.Dayjs).toISOString() : null,
        endDate: values.endDate ? (values.endDate as dayjs.Dayjs).toISOString() : null,
      }

      const url = editingProject
        ? `/api/customers/${customerId}/projects/${editingProject.id}`
        : `/api/customers/${customerId}/projects`

      const response = await fetch(url, {
        method: editingProject ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || '操作失敗')
      }

      message.success(editingProject ? '專案已更新' : '專案已建立')
      await mutate()
      setModalOpen(false)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '操作失敗')
    }
  }

  const handleDelete = async (projectId: string) => {
    try {
      const response = await fetch(
        `/api/customers/${customerId}/projects/${projectId}`,
        { method: 'DELETE' }
      )

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || '刪除失敗')
      }

      message.success('專案已刪除')
      mutate()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '刪除失敗')
    }
  }

  const columns: TableColumnsType<Project> = [
    {
      title: '專案名稱',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Space direction="vertical" size={0}>
          <Space wrap>
            <ProjectOutlined />
            <span style={{ fontWeight: 500 }}>{name}</span>
            {record.type && (
              <Tag color="purple">{record.type}</Tag>
            )}
            {record.activityCount > 0 && (
              <Tag>{record.activityCount} 活動</Tag>
            )}
            {record.endUserName && (
              <Tag color="green">用戶: {record.endUserName}</Tag>
            )}
            {canViewOdoo && record.odooId && (
              <Tooltip title={`Odoo 訂單: ${record.odooOrderName}`}>
                <a
                  href={getOdooOrderUrl(record.odooId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#722ed1' }}
                >
                  <LinkOutlined />
                </a>
              </Tooltip>
            )}
          </Space>
          {/* 產品明細 */}
          {record.products && record.products.length > 0 && (
            <Popover
              title={`產品明細 (${record.products.length} 項)`}
              content={
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', minWidth: 300 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0, background: '#fff' }}>
                        <th style={{ padding: '4px 12px 4px 0', textAlign: 'left' }}>品名</th>
                        <th style={{ padding: '4px 12px 4px 0', textAlign: 'left' }}>說明</th>
                        <th style={{ padding: '4px 0', textAlign: 'right' }}>數量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {record.products.map((p, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f5f5f5' }}>
                          <td style={{ padding: '4px 12px 4px 0', verticalAlign: 'top' }}>{p.name}</td>
                          <td style={{ padding: '4px 12px 4px 0', color: '#666', fontSize: 12, maxWidth: 250 }}>
                            {p.description || '-'}
                          </td>
                          <td style={{ padding: '4px 0', textAlign: 'right', verticalAlign: 'top' }}>{p.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              }
              trigger="click"
            >
              <Button type="link" size="small" icon={<ShoppingOutlined />} style={{ padding: 0 }}>
                {record.products.length} 項產品
              </Button>
            </Popover>
          )}
          {/* 說明 */}
          {record.description && (
            record.description.includes('![') ? (
              <Popover
                title="專案說明"
                content={
                  <div style={{ maxWidth: 400, maxHeight: 300, overflow: 'auto' }}>
                    <ReactMarkdown
                      components={{
                        img: ({ src, alt }) => (
                          <img
                            src={src}
                            alt={alt || ''}
                            style={{ maxWidth: '100%', borderRadius: 4 }}
                          />
                        ),
                      }}
                    >
                      {record.description}
                    </ReactMarkdown>
                  </div>
                }
                trigger="click"
              >
                <Button type="link" size="small" icon={<PictureOutlined />} style={{ padding: 0 }}>
                  查看說明
                </Button>
              </Popover>
            ) : (
              <span style={{ color: '#888', fontSize: 12 }}>
                {record.description.length > 50
                  ? record.description.substring(0, 50) + '...'
                  : record.description}
              </span>
            )
          )}
        </Space>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const info = getStatusInfo(status)
        return <Tag color={info.color}>{info.label}</Tag>
      },
    },
    {
      title: '期間',
      key: 'period',
      width: 180,
      render: (_, record) => {
        if (!record.startDate && !record.endDate) return '-'
        const start = record.startDate ? dayjs(record.startDate).format('YYYY/MM') : '?'
        const end = record.endDate ? dayjs(record.endDate).format('YYYY/MM') : '進行中'
        return `${start} ~ ${end}`
      },
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_, record) => (
        <Space>
          {canViewBonus && record.dealId && (
            <Tooltip title={record.bonusEvalStatus ? `獎金評估: ${record.bonusEvalStatus}` : '獎金評估'}>
              <Button
                type="text"
                size="small"
                icon={<TrophyOutlined />}
                style={record.bonusEvalStatus === 'APPROVED' ? { color: '#52c41a' } : record.bonusEvalStatus === 'PAID' ? { color: '#722ed1' } : undefined}
                onClick={() => setBonusProject(record)}
              />
            </Tooltip>
          )}
          {canEdit && (
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          )}
          {canDelete && (
            <Popconfirm
              title="確定要刪除此專案？"
              description="相關的活動和 LINE 頻道關聯將被解除"
              onConfirm={() => handleDelete(record.id)}
              okText="確定"
              cancelText="取消"
            >
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  // 作為最終用戶的專案表格欄位
  const endUserColumns: TableColumnsType<EndUserProject> = [
    {
      title: '專案名稱',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Space direction="vertical" size={0}>
          <Space wrap>
            <ProjectOutlined />
            <span style={{ fontWeight: 500 }}>{name}</span>
            {record.type && <Tag color="purple">{record.type}</Tag>}
            {record.activityCount > 0 && <Tag>{record.activityCount} 活動</Tag>}
            {canViewOdoo && record.odooId && (
              <Tooltip title={`Odoo 訂單: ${record.odooOrderName}`}>
                <a href={getOdooOrderUrl(record.odooId)} target="_blank" rel="noopener noreferrer" style={{ color: '#722ed1' }}>
                  <LinkOutlined />
                </a>
              </Tooltip>
            )}
          </Space>
          <Space style={{ fontSize: 12, color: '#666' }}>
            <ShopOutlined />
            <span>經銷商: {record.dealerName}</span>
          </Space>
        </Space>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const info = getStatusInfo(status)
        return <Tag color={info.color}>{info.label}</Tag>
      },
    },
    {
      title: '期間',
      key: 'period',
      width: 180,
      render: (_, record) => {
        if (!record.startDate && !record.endDate) return '-'
        const start = record.startDate ? dayjs(record.startDate).format('YYYY/MM') : '?'
        const end = record.endDate ? dayjs(record.endDate).format('YYYY/MM') : '進行中'
        return `${start} ~ ${end}`
      },
    },
  ]

  const filteredEndUserProjects = statusFilter ? endUserProjects.filter(p => p.status === statusFilter) : endUserProjects
  const totalProjects = filteredProjects.length + filteredEndUserProjects.length

  // 自有專案內容
  const ownProjectsContent = (
    <>
      {displayProjects.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚無專案">
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              建立第一個專案
            </Button>
          )}
        </Empty>
      ) : (
        <Table dataSource={displayProjects} columns={columns} rowKey="id" size="small" loading={isLoading} pagination={false} />
      )}
      {limit && filteredProjects.length > limit && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>還有 {filteredProjects.length - limit} 個專案</div>
      )}
    </>
  )

  // 作為最終用戶的專案內容
  const displayEndUserProjects = limit ? filteredEndUserProjects.slice(0, limit) : filteredEndUserProjects
  const endUserProjectsContent = (
    <>
      {displayEndUserProjects.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="無相關專案" />
      ) : (
        <Table
          dataSource={displayEndUserProjects}
          columns={endUserColumns}
          rowKey="id"
          size="small"
          loading={isLoadingEndUser}
          pagination={false}
        />
      )}
      {limit && filteredEndUserProjects.length > limit && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>還有 {filteredEndUserProjects.length - limit} 個專案</div>
      )}
    </>
  )

  return (
    <>
      <Card
        title={
          <Space>
            <ProjectOutlined />
            專案
            {totalProjects > 0 && <Tag>{totalProjects}</Tag>}
          </Space>
        }
        extra={
          <Space>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 110 }}
              size="small"
              allowClear
              placeholder="全部狀態"
              options={STATUS_OPTIONS.map(s => ({ value: s.value, label: s.label }))}
            />
            {canEdit && (
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAdd}>
                新增專案
              </Button>
            )}
          </Space>
        }
      >
        {endUserProjects.length > 0 ? (
          <Tabs
            defaultActiveKey="dealer"
            size="small"
            items={[
              {
                key: 'dealer',
                label: <span>經銷專案 <Tag color="green">{filteredEndUserProjects.length}</Tag></span>,
                children: endUserProjectsContent,
              },
              {
                key: 'direct',
                label: <span>直銷專案 {filteredProjects.length > 0 && <Tag>{filteredProjects.length}</Tag>}</span>,
                children: ownProjectsContent,
              },
            ]}
          />
        ) : (
          ownProjectsContent
        )}
      </Card>

      <Modal
        title={editingProject ? '編輯專案' : '新增專案'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="儲存"
        cancelText="取消"
        destroyOnHidden={false}
        width={700}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ status: 'ACTIVE' }}
        >
          <Form.Item
            name="name"
            label="專案名稱"
            rules={[{ required: true, message: '請輸入專案名稱' }]}
          >
            <Input placeholder="例如：2024 網路升級案" />
          </Form.Item>
          <Form.Item name="type" label="專案類型">
            <Select
              allowClear
              placeholder="選擇專案類型"
              options={PROJECT_TYPE_OPTIONS}
            />
          </Form.Item>
          <Form.Item label="最終用戶">
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="endUserId" noStyle>
                <Select
                  allowClear
                  placeholder="選擇最終用戶（選填）"
                  options={endUserOptions}
                  showSearch
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Tooltip title="從專案名稱自動匹配">
                <Button icon={<SearchOutlined />} onClick={findBestEndUserMatch} />
              </Tooltip>
            </Space.Compact>
          </Form.Item>
          <Form.Item
            name="description"
            label={
              <Space>
                說明
                {editingProject && (
                  <Tooltip title="可直接貼上圖片（Ctrl+V）">
                    <PictureOutlined style={{ color: '#1890ff' }} />
                  </Tooltip>
                )}
                {uploading && <Spin size="small" />}
              </Space>
            }
            extra={editingProject ? '支援貼上圖片，圖片會自動上傳' : '儲存後可貼上圖片'}
          >
            <Input.TextArea
              ref={textAreaRef as unknown as React.Ref<HTMLTextAreaElement>}
              rows={6}
              placeholder="專案說明（選填），可貼上圖片"
              onPaste={handlePaste}
            />
          </Form.Item>
          {descriptionValue && descriptionValue.includes('![') && (
            <Form.Item label="預覽">
              <div
                style={{
                  border: '1px solid #d9d9d9',
                  borderRadius: 6,
                  padding: 12,
                  backgroundColor: '#fafafa',
                  maxHeight: 300,
                  overflow: 'auto',
                }}
              >
                <ReactMarkdown
                  components={{
                    img: ({ src, alt }) => (
                      <img
                        src={src}
                        alt={alt || ''}
                        style={{ maxWidth: '100%', borderRadius: 4 }}
                      />
                    ),
                  }}
                >
                  {descriptionValue}
                </ReactMarkdown>
              </div>
            </Form.Item>
          )}
          <Form.List name="products">
            {(fields, { add, remove }) => (
              <Form.Item label="產品明細">
                {fields.map(({ key, name, ...restField }) => (
                  <div key={key} style={{ marginBottom: 12, padding: 8, background: '#fafafa', borderRadius: 4 }}>
                    <Space style={{ display: 'flex', marginBottom: 4 }} align="baseline">
                      <Form.Item
                        {...restField}
                        name={[name, 'name']}
                        rules={[{ required: true, message: '請輸入品名' }]}
                        style={{ marginBottom: 0, width: 280 }}
                      >
                        <Input placeholder="品名" />
                      </Form.Item>
                      <Form.Item
                        {...restField}
                        name={[name, 'quantity']}
                        style={{ marginBottom: 0, width: 100 }}
                      >
                        <InputNumber placeholder="數量" min={0} style={{ width: '100%' }} />
                      </Form.Item>
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => remove(name)}
                      />
                    </Space>
                    <Form.Item
                      {...restField}
                      name={[name, 'description']}
                      style={{ marginBottom: 0 }}
                    >
                      <Input placeholder="說明（選填）" style={{ width: '100%' }} />
                    </Form.Item>
                  </div>
                ))}
                <Button type="dashed" onClick={() => add({ name: '', quantity: 1, description: '' })} icon={<PlusOutlined />}>
                  新增產品
                </Button>
              </Form.Item>
            )}
          </Form.List>
          <Form.Item name="status" label="狀態">
            <Select
              options={STATUS_OPTIONS.map(s => ({
                value: s.value,
                label: s.label,
              }))}
            />
          </Form.Item>
          <Space style={{ width: '100%' }}>
            <Form.Item name="startDate" label="開始日期" style={{ marginBottom: 0 }}>
              <DatePicker placeholder="選擇日期" />
            </Form.Item>
            <Form.Item name="endDate" label="結束日期" style={{ marginBottom: 0 }}>
              <DatePicker placeholder="選擇日期" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      {bonusProject && (
        <BonusEvalModal
          open={!!bonusProject}
          onClose={() => { setBonusProject(null); mutate() }}
          projectId={bonusProject.id}
          projectName={bonusProject.name}
          projectType={bonusProject.type || undefined}
          dealAmount={bonusProject.dealAmount || undefined}
          dealName={bonusProject.odooOrderName || undefined}
        />
      )}
    </>
  )
}
