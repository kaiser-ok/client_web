'use client'

import { useState, useEffect } from 'react'
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
  Select,
  Alert,
  Checkbox,
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  ApartmentOutlined,
  FileTextOutlined,
  MergeOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import SmartQuotationModal from '@/components/quotations/SmartQuotationModal'
import MergePartnerModal from '@/components/partners/MergePartnerModal'
import { useCustomers, createCustomer, deleteCustomer } from '@/hooks/useCustomer'
import { useUser } from '@/hooks/useUser'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import type { SorterResult } from 'antd/es/table/interface'
import type { CustomerWithRelations } from '@/types/customer'

const { Title } = Typography
const { Search } = Input

const ROLE_OPTIONS = [
  { value: 'DEALER', label: '經銷商', color: 'blue' },
  { value: 'END_USER', label: '最終用戶', color: 'green' },
  { value: 'SUPPLIER', label: '供應商', color: 'orange' },
]

export default function CustomersPage() {
  const router = useRouter()
  const { can } = useUser()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string | undefined>()
  const [page, setPage] = useState(1)
  const [sortField, setSortField] = useState<string | undefined>()
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>()
  const [modalOpen, setModalOpen] = useState(false)
  const [smartQuotationOpen, setSmartQuotationOpen] = useState(false)
  const [mergeModalOpen, setMergeModalOpen] = useState(false)
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null)
  const [form] = Form.useForm()
  const [users, setUsers] = useState<Array<{ id: string; name: string | null; email: string }>>([])

  const { customers, total, isLoading, isError, mutate } = useCustomers(search, page, 20, sortField, sortOrder, roleFilter)

  // Fetch users for salesRep select
  useEffect(() => {
    if (modalOpen && users.length === 0) {
      fetch('/api/users/list')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setUsers(data)
          }
        })
        .catch(console.error)
    }
  }, [modalOpen, users.length])

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

  const handleTableChange = (
    pagination: TablePaginationConfig,
    _filters: Record<string, unknown>,
    sorter: SorterResult<CustomerWithRelations> | SorterResult<CustomerWithRelations>[]
  ) => {
    if (pagination.current) {
      setPage(pagination.current)
    }
    const singleSorter = Array.isArray(sorter) ? sorter[0] : sorter
    const sortableColumns = ['openItems', 'deals']
    if (singleSorter.columnKey && sortableColumns.includes(singleSorter.columnKey as string)) {
      if (singleSorter.order) {
        setSortField(singleSorter.columnKey as string)
        setSortOrder(singleSorter.order === 'ascend' ? 'asc' : 'desc')
      } else {
        setSortField(undefined)
        setSortOrder(undefined)
      }
    }
  }

  // Get parent options for the select (customers without parent, excluding self)
  const parentOptions = customers
    ?.filter(c => !c.parentId)
    .map(c => ({ value: c.id, label: c.name })) || []

  const columns: ColumnsType<CustomerWithRelations> = [
    {
      title: '客戶名稱',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <Space>
          <a onClick={() => router.push(`/customers/${record.id}`)}>{name}</a>
          {record.parent && (
            <Tag color="blue" style={{ fontSize: 11 }}>
              {record.parent.name} 子公司
            </Tag>
          )}
          {(record._count?.subsidiaries ?? 0) > 0 && (
            <Tag color="purple" icon={<ApartmentOutlined />}>
              {record._count?.subsidiaries} 子公司
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 100,
      render: (role: string) => {
        const roleInfo = ROLE_OPTIONS.find(t => t.value === role)
        return roleInfo ? <Tag color={roleInfo.color}>{roleInfo.label}</Tag> : <Tag>{role || '經銷商'}</Tag>
      },
    },
    {
      title: '聯絡人',
      dataIndex: 'contact',
      key: 'contact',
      responsive: ['md'],
    },
    {
      title: '經銷商',
      dataIndex: 'partner',
      key: 'partner',
      render: (partner) => partner ? <Tag color="green">{partner}</Tag> : '-',
      responsive: ['lg'],
    },
    {
      title: '待處理',
      dataIndex: ['_count', 'openItems'],
      key: 'openItems',
      render: (count) => count > 0 ? <Tag color="orange">{count}</Tag> : '0',
      width: 80,
      sorter: true,
      sortOrder: sortField === 'openItems' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : undefined,
    },
    {
      title: '訂單數',
      dataIndex: ['_count', 'deals'],
      key: 'deals',
      render: (count) => count > 0 ? <Tag color="blue">{count}</Tag> : '0',
      width: 80,
      sorter: true,
      sortOrder: sortField === 'deals' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : undefined,
    },
    {
      title: '操作',
      key: 'actions',
      width: can('MERGE_PARTNER') ? 120 : 80,
      render: (_, record) => (
        <Space size={0}>
          {can('MERGE_PARTNER') && (
            <Button
              type="text"
              icon={<MergeOutlined />}
              title="合併客戶"
              onClick={() => {
                setMergeSourceId(record.id)
                setMergeModalOpen(true)
              }}
            />
          )}
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
          <Select
            placeholder="角色篩選"
            allowClear
            style={{ width: 120 }}
            value={roleFilter}
            onChange={(value) => {
              setRoleFilter(value)
              setPage(1)
            }}
            options={ROLE_OPTIONS}
          />
          <Search
            placeholder="搜尋客戶..."
            allowClear
            onSearch={setSearch}
            style={{ width: 200 }}
          />
          {can('MERGE_PARTNER') && (
            <Button
              icon={<MergeOutlined />}
              onClick={() => {
                setMergeSourceId(null)
                setMergeModalOpen(true)
              }}
            >
              合併客戶
            </Button>
          )}
          <Button
            icon={<FileTextOutlined />}
            onClick={() => setSmartQuotationOpen(true)}
          >
            智能報價
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setModalOpen(true)}
          >
            新增客戶
          </Button>
        </Space>
      </div>

      {isError && (
        <Alert
          title="載入失敗"
          description={isError.message || '無法載入客戶資料，請重新整理頁面'}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

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
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 筆`,
          }}
          onChange={handleTableChange}
          scroll={{ x: 600 }}
        />
      </Card>

      <Modal
        title="新增客戶"
        open={modalOpen}
        forceRender
        onCancel={() => {
          setModalOpen(false)
          form.resetFields()
        }}
        onOk={() => form.submit()}
        okText="建立"
        cancelText="取消"
        destroyOnHidden={false}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} preserve={false} initialValues={{ role: 'DEALER', syncToOdoo: false }}>
          <Form.Item
            name="name"
            label="名稱"
            rules={[{ required: true, message: '請輸入名稱' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="role" label="角色">
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
          <Form.Item name="parentId" label="母公司">
            <Select
              allowClear
              placeholder="選擇母公司（若為子公司）"
              options={parentOptions}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
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
            <Select
              allowClear
              placeholder="選擇負責業務"
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={users.map(u => ({
                value: u.name || u.email,
                label: u.name || u.email,
              }))}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.role !== cur.role}>
            {({ getFieldValue }) =>
              getFieldValue('role') === 'END_USER' && (
                <Form.Item name="partner" label="經銷商">
                  <Input placeholder="經銷商名稱" />
                </Form.Item>
              )
            }
          </Form.Item>
          <Form.Item name="syncToOdoo" valuePropName="checked">
            <Checkbox>同時新增到 Odoo</Checkbox>
          </Form.Item>
        </Form>
      </Modal>

      <SmartQuotationModal
        open={smartQuotationOpen}
        onClose={() => setSmartQuotationOpen(false)}
        onSuccess={(quotation) => {
          console.log('Quotation created:', quotation)
        }}
      />

      <MergePartnerModal
        open={mergeModalOpen}
        preselectedId={mergeSourceId}
        onClose={() => {
          setMergeModalOpen(false)
          setMergeSourceId(null)
        }}
        onSuccess={() => mutate()}
      />
    </AppLayout>
  )
}
