'use client'

import { Card, Table, Tag, Space, Empty, Tooltip } from 'antd'
import type { TableColumnsType } from 'antd'
import { ProjectOutlined, ShopOutlined, LinkOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import useSWR from 'swr'
import { useUser } from '@/hooks/useUser'

const fetcher = (url: string) => fetch(url).then(res => res.json())

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

interface EndUserProjectsCardProps {
  customerId: string
  limit?: number
}

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: '進行中', color: 'green' },
  { value: 'COMPLETED', label: '已完成', color: 'blue' },
  { value: 'ON_HOLD', label: '暫停', color: 'orange' },
  { value: 'CANCELLED', label: '取消', color: 'default' },
]

const getStatusInfo = (status: string) => {
  return STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0]
}

export default function EndUserProjectsCard({ customerId, limit }: EndUserProjectsCardProps) {
  const { can } = useUser()
  const canViewOdoo = can('VIEW_DEAL_AMOUNT')

  const { data, isLoading } = useSWR<{ projects: EndUserProject[] }>(
    `/api/customers/${customerId}/end-user-projects`,
    fetcher
  )

  const projects = data?.projects || []
  const displayProjects = limit ? projects.slice(0, limit) : projects

  if (projects.length === 0 && !isLoading) {
    return null // 沒有專案時不顯示此卡片
  }

  const columns: TableColumnsType<EndUserProject> = [
    {
      title: '專案名稱',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Space orientation="vertical" size={0}>
          <Space wrap>
            <ProjectOutlined />
            <span style={{ fontWeight: 500 }}>{name}</span>
            {record.type && (
              <Tag color="purple">{record.type}</Tag>
            )}
            {record.activityCount > 0 && (
              <Tag>{record.activityCount} 活動</Tag>
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

  return (
    <Card
      title={
        <Space>
          <ProjectOutlined />
          作為最終用戶的專案
          {projects.length > 0 && <Tag color="green">{projects.length}</Tag>}
        </Space>
      }
    >
      {displayProjects.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="尚無專案"
        />
      ) : (
        <Table
          dataSource={displayProjects}
          columns={columns}
          rowKey="id"
          size="small"
          loading={isLoading}
          pagination={false}
        />
      )}
      {limit && projects.length > limit && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          還有 {projects.length - limit} 個專案
        </div>
      )}
    </Card>
  )
}
