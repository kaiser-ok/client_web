'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, Typography, Row, Col, Statistic, Spin, Select, Empty, Button, Space } from 'antd'
import {
  FileAddOutlined,
  CheckCircleOutlined,
  RiseOutlined,
  FallOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import dynamic from 'next/dynamic'
import AppLayout from '@/components/layout/AppLayout'

// Dynamic import for charts to avoid SSR issues
const Line = dynamic(
  () => import('@ant-design/charts').then((mod) => mod.Line),
  { ssr: false }
)

const { Title } = Typography

interface DailyData {
  date: string
  created: number
  resolved: number
}

interface ReportData {
  chartData: DailyData[]
  summary: {
    totalCreated: number
    totalResolved: number
    avgCreatedPerDay: number
    avgResolvedPerDay: number
    period: string
  }
}

export default function IssueReportsPage() {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports/daily-issues?days=${days}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      if (res.ok) {
        const result = await res.json()
        setData(result)
        setLastUpdated(new Date())
      }
    } catch (error) {
      console.error('Error fetching report:', error)
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 自動刷新（每 5 分鐘）
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      fetchData()
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchData])

  // Transform data for multi-line chart
  const chartData = data?.chartData.flatMap((item) => [
    { date: item.date, value: item.created, type: '新建' },
    { date: item.date, value: item.resolved, type: '已解決' },
  ]) || []

  const config = {
    data: chartData,
    xField: 'date',
    yField: 'value',
    colorField: 'type',
    height: 400,
    point: {
      shapeField: 'square',
      sizeField: 4,
    },
    interaction: {
      tooltip: {
        marker: false,
      },
    },
    style: {
      lineWidth: 2,
    },
    scale: {
      color: {
        range: ['#1890ff', '#52c41a'],
      },
    },
  }

  const netChange = data ? data.summary.totalCreated - data.summary.totalResolved : 0

  return (
    <AppLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <Title level={4} style={{ margin: 0 }}>
          Issue 統計報表
        </Title>
        <Space wrap>
          {lastUpdated && (
            <span style={{ color: '#999', fontSize: 12 }}>
              更新: {lastUpdated.toLocaleTimeString('zh-TW')}
            </span>
          )}
          <Button
            icon={<ReloadOutlined spin={loading} />}
            onClick={fetchData}
            disabled={loading}
          >
            刷新
          </Button>
          <Select
            value={autoRefresh}
            onChange={setAutoRefresh}
            style={{ width: 120 }}
            options={[
              { value: false, label: '手動刷新' },
              { value: true, label: '每 5 分鐘' },
            ]}
          />
          <Select
            value={days}
            onChange={setDays}
            style={{ width: 120 }}
            options={[
              { value: 7, label: '最近 7 天' },
              { value: 14, label: '最近 14 天' },
              { value: 30, label: '最近 30 天' },
              { value: 60, label: '最近 60 天' },
              { value: 90, label: '最近 90 天' },
            ]}
          />
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
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={12} sm={6}>
              <Card>
                <Statistic
                  title="新建問題"
                  value={data.summary.totalCreated}
                  prefix={<FileAddOutlined />}
                  styles={{ content: { color: '#1890ff' } }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card>
                <Statistic
                  title="已解決"
                  value={data.summary.totalResolved}
                  prefix={<CheckCircleOutlined />}
                  styles={{ content: { color: '#52c41a' } }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card>
                <Statistic
                  title="淨增減"
                  value={netChange}
                  prefix={netChange >= 0 ? <RiseOutlined /> : <FallOutlined />}
                  styles={{ content: { color: netChange >= 0 ? '#ff4d4f' : '#52c41a' } }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card>
                <Statistic
                  title="日均新建"
                  value={data.summary.avgCreatedPerDay}
                  suffix="件/天"
                  precision={1}
                />
              </Card>
            </Col>
          </Row>

          <Card title="Issue 每日數量統計">
            <Line {...config} />
            <div style={{ textAlign: 'center', marginTop: 16, color: '#999' }}>
              統計期間: {data.summary.period}
            </div>
          </Card>
        </>
      )}
    </AppLayout>
  )
}
