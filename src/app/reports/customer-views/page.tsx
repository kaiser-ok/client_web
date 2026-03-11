'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, Typography, Spin, Table, Tag, Tabs, Empty, DatePicker, Space, Button } from 'antd'
import {
  TeamOutlined,
  UserOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import AppLayout from '@/components/layout/AppLayout'
import Link from 'next/link'
import dayjs, { Dayjs } from 'dayjs'

const { Title } = Typography
const { RangePicker } = DatePicker

interface CustomerViewStat {
  customerId: string
  customerName: string
  partner: string | null
  totalViews: number
  uniqueUsers: number
}

interface UserViewStat {
  userEmail: string
  userName: string
  totalViews: number
  uniqueCustomers: number
}

interface UserDetailStat {
  customerId: string
  customerName: string
  partner: string | null
  viewCount: number
  lastViewedAt: string
}

export default function CustomerViewsReportPage() {
  const [customerViewStats, setCustomerViewStats] = useState<CustomerViewStat[]>([])
  const [userViewStats, setUserViewStats] = useState<UserViewStat[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([])
  const [userDetails, setUserDetails] = useState<Record<string, UserDetailStat[]>>({})
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({})

  const buildDateParams = useCallback(() => {
    if (!dateRange || !dateRange[0] || !dateRange[1]) return ''
    return `&startDate=${dateRange[0].format('YYYY-MM-DD')}&endDate=${dateRange[1].format('YYYY-MM-DD')}`
  }, [dateRange])

  const fetchViewStats = useCallback(async () => {
    setLoading(true)
    try {
      const dateParams = buildDateParams()
      const [customerRes, userRes] = await Promise.all([
        fetch(`/api/reports/customer-views?groupBy=customer&limit=50${dateParams}`, { credentials: 'include' }),
        fetch(`/api/reports/customer-views?groupBy=user&limit=50${dateParams}`, { credentials: 'include' }),
      ])
      if (customerRes.ok) {
        const result = await customerRes.json()
        setCustomerViewStats(result.stats || [])
      }
      if (userRes.ok) {
        const result = await userRes.json()
        setUserViewStats(result.stats || [])
      }
      // Reset expanded rows and details when fetching new data
      setExpandedRowKeys([])
      setUserDetails({})
    } catch (error) {
      console.error('Error fetching view stats:', error)
    } finally {
      setLoading(false)
    }
  }, [buildDateParams])

  const fetchUserDetails = async (userEmail: string) => {
    if (userDetails[userEmail]) return // Already loaded

    setLoadingDetails(prev => ({ ...prev, [userEmail]: true }))
    try {
      const dateParams = buildDateParams()
      const res = await fetch(
        `/api/reports/customer-views?groupBy=user-detail&userEmail=${encodeURIComponent(userEmail)}${dateParams}`,
        { credentials: 'include' }
      )
      if (res.ok) {
        const result = await res.json()
        setUserDetails(prev => ({ ...prev, [userEmail]: result.stats || [] }))
      }
    } catch (error) {
      console.error('Error fetching user details:', error)
    } finally {
      setLoadingDetails(prev => ({ ...prev, [userEmail]: false }))
    }
  }

  useEffect(() => {
    fetchViewStats()
  }, [fetchViewStats])

  const handleExpand = (expanded: boolean, record: UserViewStat) => {
    if (expanded) {
      setExpandedRowKeys(prev => [...prev, record.userEmail])
      fetchUserDetails(record.userEmail)
    } else {
      setExpandedRowKeys(prev => prev.filter(key => key !== record.userEmail))
    }
  }

  const expandedRowRender = (record: UserViewStat) => {
    const details = userDetails[record.userEmail]
    const isLoading = loadingDetails[record.userEmail]

    if (isLoading) {
      return <div style={{ padding: 20, textAlign: 'center' }}><Spin /></div>
    }

    if (!details || details.length === 0) {
      return <Empty description="無詳細資料" image={Empty.PRESENTED_IMAGE_SIMPLE} />
    }

    return (
      <Table
        dataSource={details}
        rowKey="customerId"
        pagination={false}
        size="small"
        columns={[
          {
            title: '客戶名稱',
            dataIndex: 'customerName',
            key: 'customerName',
            render: (name, rec) => (
              <Link href={`/customers/${rec.customerId}`}>{name}</Link>
            ),
          },
          {
            title: '經銷商',
            dataIndex: 'partner',
            key: 'partner',
            render: (partner) => partner ? <Tag color="green">{partner}</Tag> : '-',
          },
          {
            title: '查詢次數',
            dataIndex: 'viewCount',
            key: 'viewCount',
            render: (count) => <Tag color="blue">{count}</Tag>,
          },
          {
            title: '最後查詢時間',
            dataIndex: 'lastViewedAt',
            key: 'lastViewedAt',
            render: (date) => dayjs(date).format('YYYY-MM-DD HH:mm'),
          },
        ]}
      />
    )
  }

  return (
    <AppLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          客戶查詢統計
        </Title>
        <Space wrap>
          <RangePicker
            value={dateRange}
            onChange={(dates) => setDateRange(dates)}
            placeholder={['開始日期', '結束日期']}
            allowClear
            presets={[
              { label: '今天', value: [dayjs(), dayjs()] },
              { label: '最近 7 天', value: [dayjs().subtract(7, 'day'), dayjs()] },
              { label: '最近 30 天', value: [dayjs().subtract(30, 'day'), dayjs()] },
              { label: '最近 90 天', value: [dayjs().subtract(90, 'day'), dayjs()] },
              { label: '本月', value: [dayjs().startOf('month'), dayjs()] },
              { label: '上月', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchViewStats}>
            查詢
          </Button>
        </Space>
      </div>

      <Card>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin size="large" />
          </div>
        ) : customerViewStats.length === 0 && userViewStats.length === 0 ? (
          <Empty description="尚無查詢記錄" />
        ) : (
          <Tabs
            items={[
              {
                key: 'customer',
                label: (
                  <span>
                    <TeamOutlined /> 熱門客戶
                  </span>
                ),
                children: (
                  <Table
                    dataSource={customerViewStats}
                    rowKey="customerId"
                    pagination={{ pageSize: 20 }}
                    columns={[
                      {
                        title: '排名',
                        key: 'rank',
                        width: 60,
                        render: (_, __, index) => (
                          <Tag color={index < 3 ? 'gold' : 'default'}>{index + 1}</Tag>
                        ),
                      },
                      {
                        title: '客戶名稱',
                        dataIndex: 'customerName',
                        key: 'customerName',
                        render: (name, record) => (
                          <Link href={`/customers/${record.customerId}`}>{name}</Link>
                        ),
                      },
                      {
                        title: '經銷商',
                        dataIndex: 'partner',
                        key: 'partner',
                        render: (partner) => partner ? <Tag color="green">{partner}</Tag> : '-',
                      },
                      {
                        title: '查詢次數',
                        dataIndex: 'totalViews',
                        key: 'totalViews',
                        sorter: (a, b) => a.totalViews - b.totalViews,
                        defaultSortOrder: 'descend',
                        render: (count) => <Tag color="blue">{count}</Tag>,
                      },
                      {
                        title: '查詢人數',
                        dataIndex: 'uniqueUsers',
                        key: 'uniqueUsers',
                        sorter: (a, b) => a.uniqueUsers - b.uniqueUsers,
                        render: (count) => count,
                      },
                    ]}
                  />
                ),
              },
              {
                key: 'user',
                label: (
                  <span>
                    <UserOutlined /> 使用者活動
                  </span>
                ),
                children: (
                  <Table
                    dataSource={userViewStats}
                    rowKey="userEmail"
                    pagination={{ pageSize: 20 }}
                    expandable={{
                      expandedRowKeys,
                      onExpand: handleExpand,
                      expandedRowRender,
                      rowExpandable: () => true,
                    }}
                    columns={[
                      {
                        title: '排名',
                        key: 'rank',
                        width: 60,
                        render: (_, __, index) => (
                          <Tag color={index < 3 ? 'gold' : 'default'}>{index + 1}</Tag>
                        ),
                      },
                      {
                        title: '使用者',
                        dataIndex: 'userName',
                        key: 'userName',
                      },
                      {
                        title: 'Email',
                        dataIndex: 'userEmail',
                        key: 'userEmail',
                        responsive: ['md'],
                      },
                      {
                        title: '查詢次數',
                        dataIndex: 'totalViews',
                        key: 'totalViews',
                        sorter: (a, b) => a.totalViews - b.totalViews,
                        defaultSortOrder: 'descend',
                        render: (count) => <Tag color="blue">{count}</Tag>,
                      },
                      {
                        title: '查詢客戶數',
                        dataIndex: 'uniqueCustomers',
                        key: 'uniqueCustomers',
                        sorter: (a, b) => a.uniqueCustomers - b.uniqueCustomers,
                      },
                    ]}
                  />
                ),
              },
            ]}
          />
        )}
      </Card>
    </AppLayout>
  )
}
