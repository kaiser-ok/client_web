'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Card,
  Typography,
  Row,
  Col,
  Statistic,
  Spin,
  Select,
  Empty,
  Button,
  Space,
  Table,
  DatePicker,
  Segmented,
  Tag,
} from 'antd'
import {
  DollarOutlined,
  ShoppingCartOutlined,
  TagOutlined,
  RiseOutlined,
  FallOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import dynamic from 'next/dynamic'
import dayjs, { Dayjs } from 'dayjs'
import Link from 'next/link'
import AppLayout from '@/components/layout/AppLayout'
import type { SalesReportData } from '@/types/sales-report'

// Dynamic import for charts to avoid SSR issues
const Line = dynamic(() => import('@ant-design/charts').then((mod) => mod.Line), { ssr: false })
const Pie = dynamic(() => import('@ant-design/charts').then((mod) => mod.Pie), { ssr: false })
const Column = dynamic(() => import('@ant-design/charts').then((mod) => mod.Column), { ssr: false })

const { Title } = Typography
const { RangePicker } = DatePicker

type GroupBy = 'month' | 'quarter' | 'year'

interface ApiResponse extends SalesReportData {
  filters: {
    salesReps: string[]
    projectTypes: string[]
  }
}

export default function SalesReportPage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf('year'),
    dayjs(),
  ])
  const [groupBy, setGroupBy] = useState<GroupBy>('month')
  const [salesRep, setSalesRep] = useState<string | undefined>()
  const [projectType, setProjectType] = useState<string | undefined>()
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        startDate: dateRange[0].format('YYYY-MM-DD'),
        endDate: dateRange[1].format('YYYY-MM-DD'),
        groupBy,
        includeYoY: 'true',
      })
      if (salesRep) params.append('salesRep', salesRep)
      if (projectType) params.append('projectType', projectType)

      const res = await fetch(`/api/reports/sales?${params}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      if (res.ok) {
        const result = await res.json()
        setData(result)
        setLastUpdated(new Date())
      }
    } catch (error) {
      console.error('Error fetching sales report:', error)
    } finally {
      setLoading(false)
    }
  }, [dateRange, groupBy, salesRep, projectType])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 格式化金額
  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`
    }
    return `$${value.toLocaleString()}`
  }

  // 趨勢圖資料轉換
  const trendChartData = data?.timeSeries.flatMap((item) => {
    const result = [{ period: item.period, value: item.revenue, type: '今年' }]
    if (item.prevYearRevenue !== undefined) {
      result.push({ period: item.period, value: item.prevYearRevenue, type: '去年' })
    }
    return result
  }) || []

  const trendConfig = {
    data: trendChartData,
    xField: 'period',
    yField: 'value',
    colorField: 'type',
    height: 300,
    point: { shapeField: 'circle', sizeField: 3 },
    style: { lineWidth: 2 },
    scale: { color: { range: ['#1890ff', '#d9d9d9'] } },
    axis: {
      y: { labelFormatter: (v: number) => formatCurrency(v) },
    },
    tooltip: {
      items: [{ channel: 'y', valueFormatter: (v: number) => `$${v.toLocaleString()}` }],
    },
  }

  // 專案類型圓餅圖
  const pieConfig = {
    data: data?.byProjectType || [],
    angleField: 'revenue',
    colorField: 'projectType',
    height: 300,
    innerRadius: 0.5,
    label: {
      text: 'projectType',
      style: { fontSize: 12 },
    },
    legend: { position: 'right' as const },
    tooltip: {
      items: [
        { field: 'revenue', valueFormatter: (v: number) => `$${v.toLocaleString()}` },
        { field: 'percentage', valueFormatter: (v: number) => `${v.toFixed(1)}%` },
      ],
    },
  }

  // 業務員業績長條圖
  const salesRepChartData = data?.bySalesRep.slice(0, 10) || []
  const salesRepConfig = {
    data: salesRepChartData,
    xField: 'salesRep',
    yField: 'revenue',
    height: 300,
    label: {
      text: (d: { revenue: number }) => formatCurrency(d.revenue),
      position: 'top' as const,
      style: { fontSize: 11 },
    },
    style: { fill: '#1890ff' },
    axis: {
      y: { labelFormatter: (v: number) => formatCurrency(v) },
      x: { labelAutoRotate: true },
    },
    tooltip: {
      items: [{ channel: 'y', valueFormatter: (v: number) => `$${v.toLocaleString()}` }],
    },
  }

  // 月度同期比較圖
  const monthlyComparisonData = data?.monthlyComparison?.flatMap((item) => [
    { month: item.month, value: item.currentYear, type: '今年' },
    { month: item.previousYear > 0 ? item.month : '', value: item.previousYear, type: '去年' },
  ]).filter(d => d.month) || []

  const monthlyComparisonConfig = {
    data: monthlyComparisonData,
    xField: 'month',
    yField: 'value',
    colorField: 'type',
    group: true,
    height: 300,
    scale: { color: { range: ['#1890ff', '#d9d9d9'] } },
    axis: {
      y: { labelFormatter: (v: number) => formatCurrency(v) },
    },
    tooltip: {
      items: [{ channel: 'y', valueFormatter: (v: number) => `$${v.toLocaleString()}` }],
    },
  }

  // Top 客戶表格
  const customerColumns = [
    {
      title: '排名',
      key: 'rank',
      width: 60,
      render: (_: unknown, __: unknown, index: number) => (
        <Tag color={index < 3 ? 'gold' : 'default'}>{index + 1}</Tag>
      ),
    },
    {
      title: '客戶名稱',
      dataIndex: 'customerName',
      key: 'customerName',
      render: (name: string, record: { customerId: string }) => (
        <Link href={`/customers/${record.customerId}`} style={{ color: '#1890ff' }}>
          {name}
        </Link>
      ),
    },
    {
      title: '銷售額',
      dataIndex: 'revenue',
      key: 'revenue',
      render: (v: number) => `$${v.toLocaleString()}`,
      sorter: (a: { revenue: number }, b: { revenue: number }) => a.revenue - b.revenue,
      defaultSortOrder: 'descend' as const,
    },
    {
      title: '成交數',
      dataIndex: 'dealCount',
      key: 'dealCount',
      width: 80,
    },
  ]

  const yoyGrowth = data?.summary.yoyGrowth

  return (
    <AppLayout>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          銷售報表
        </Title>
        <Space wrap>
          {lastUpdated && (
            <span style={{ color: '#999', fontSize: 12 }}>
              更新: {lastUpdated.toLocaleTimeString('zh-TW')}
            </span>
          )}
          <RangePicker
            value={dateRange}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setDateRange([dates[0], dates[1]])
              }
            }}
            presets={[
              { label: '今年', value: [dayjs().startOf('year'), dayjs()] },
              {
                label: '去年',
                value: [
                  dayjs().subtract(1, 'year').startOf('year'),
                  dayjs().subtract(1, 'year').endOf('year'),
                ],
              },
              { label: '最近 12 個月', value: [dayjs().subtract(12, 'month'), dayjs()] },
              { label: '最近 3 年', value: [dayjs().subtract(3, 'year'), dayjs()] },
            ]}
          />
          <Segmented
            value={groupBy}
            onChange={(v) => setGroupBy(v as GroupBy)}
            options={[
              { label: '月度', value: 'month' },
              { label: '季度', value: 'quarter' },
              { label: '年度', value: 'year' },
            ]}
          />
          <Select
            value={salesRep}
            onChange={setSalesRep}
            placeholder="業務員"
            style={{ width: 120 }}
            options={[
              { label: '全部', value: undefined },
              ...(data?.filters.salesReps.map((s) => ({ label: s, value: s })) || []),
            ]}
          />
          <Select
            value={projectType}
            onChange={setProjectType}
            placeholder="專案類型"
            style={{ width: 140 }}
            options={[
              { label: '全部', value: undefined },
              ...(data?.filters.projectTypes.map((p) => ({ label: p, value: p })) || []),
            ]}
          />
          <Button icon={<ReloadOutlined spin={loading} />} onClick={fetchData} disabled={loading}>
            刷新
          </Button>
        </Space>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : !data ? (
        <Empty description="無法載入報表資料" />
      ) : (
        <>
          {/* KPI Cards */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={12} sm={6}>
              <Card>
                <Statistic
                  title="總銷售額"
                  value={data.summary.totalRevenue}
                  prefix={<DollarOutlined />}
                  formatter={(v) => `$${Number(v).toLocaleString()}`}
                  styles={{ content: { color: '#1890ff' } }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card>
                <Statistic
                  title="成交數"
                  value={data.summary.dealCount}
                  prefix={<ShoppingCartOutlined />}
                  suffix="件"
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card>
                <Statistic
                  title="平均單價"
                  value={data.summary.avgDealSize}
                  prefix={<TagOutlined />}
                  formatter={(v) => `$${Math.round(Number(v)).toLocaleString()}`}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card>
                <Statistic
                  title="YoY 成長"
                  value={yoyGrowth !== null && yoyGrowth !== undefined ? Math.abs(yoyGrowth) : '-'}
                  prefix={
                    yoyGrowth !== null && yoyGrowth !== undefined ? (
                      yoyGrowth >= 0 ? (
                        <RiseOutlined />
                      ) : (
                        <FallOutlined />
                      )
                    ) : null
                  }
                  suffix={yoyGrowth !== null && yoyGrowth !== undefined ? '%' : ''}
                  precision={1}
                  styles={{
                    content: {
                      color:
                        yoyGrowth !== null && yoyGrowth !== undefined
                          ? yoyGrowth >= 0
                            ? '#52c41a'
                            : '#ff4d4f'
                          : undefined,
                    },
                  }}
                />
              </Card>
            </Col>
          </Row>

          {/* Charts Row 1 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} lg={16}>
              <Card title="銷售趨勢">
                <Line {...trendConfig} />
              </Card>
            </Col>
            <Col xs={24} lg={8}>
              <Card title="專案類型分布">
                <Pie {...pieConfig} />
              </Card>
            </Col>
          </Row>

          {/* Charts Row 2 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} lg={12}>
              <Card title="業務員業績 (Top 10)">
                <Column {...salesRepConfig} />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="Top 10 客戶">
                <Table
                  dataSource={data.topCustomers}
                  columns={customerColumns}
                  rowKey="customerId"
                  pagination={false}
                  size="small"
                />
              </Card>
            </Col>
          </Row>

          {/* Monthly YoY Comparison */}
          {data.monthlyComparison && data.monthlyComparison.length > 0 && (
            <Card title="月度同期比較 (今年 vs 去年)">
              <Column {...monthlyComparisonConfig} />
            </Card>
          )}
        </>
      )}
    </AppLayout>
  )
}
