'use client'

import { useEffect, useState, useCallback } from 'react'
import { Row, Col, Card, Statistic, Typography, Segmented, Spin, Tag, Table, Tooltip, Badge, Space, Divider } from 'antd'
import {
  MessageOutlined,
  SlackOutlined,
  MailOutlined,
  TeamOutlined,
  ProjectOutlined,
  DollarOutlined,
  FileTextOutlined,
  EditOutlined,
  AudioOutlined,
  RiseOutlined,
  FallOutlined,
  SyncOutlined,
  LineChartOutlined,
  UserOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons'
import AppLayout from '@/components/layout/AppLayout'
import Link from 'next/link'
import dayjs from '@/lib/dayjs'

const { Title, Text } = Typography

interface StatItem {
  current: number
  previous: number
}

interface ActivityBreakdown {
  source: string
  count: number
}

interface TrendItem {
  date: string
  count: number
  source?: string
}

interface MyOpenItem {
  id: string
  jiraKey: string
  summary: string
  status: string
  priority: string | null
  waitingOn: string | null
  dueDate: string | null
  jiraUpdated: string
  partner: { name: string } | null
}

interface MyActivity {
  id: string
  title: string
  source: string
  createdAt: string
  partner: { id: string; name: string } | null
}

interface StatsData {
  range: string
  startDate: string
  stats: {
    lineMessages: StatItem
    slackActivities: StatItem
    emailActivities: StatItem
    newPartners: StatItem
    newProjects: StatItem
    newDeals: StatItem
    newQuotations: StatItem
    manualActivities: StatItem
    meetingActivities: StatItem
    totalActivities: StatItem
  }
  activeLineChannels: number
  activityBreakdown: ActivityBreakdown[]
  personal: {
    myActivities: number
    myOpenItems: MyOpenItem[]
    myRecentActivities: MyActivity[]
    myDeals: number
    myQuotations: number
  }
  trends: {
    line: TrendItem[]
    activity: TrendItem[]
  }
}

const SOURCE_LABELS: Record<string, string> = {
  JIRA: 'Jira',
  MANUAL: '手動紀錄',
  MEETING: '會議',
  LINE: 'LINE',
  EMAIL: 'Email',
  DOC: '文件',
  SLACK: 'Slack',
  ERP: 'ERP',
}

const SOURCE_COLORS: Record<string, string> = {
  JIRA: 'blue',
  MANUAL: 'green',
  MEETING: 'purple',
  LINE: 'lime',
  EMAIL: 'orange',
  DOC: 'cyan',
  SLACK: 'magenta',
  ERP: 'gold',
}

const RANGE_LABELS: Record<string, string> = {
  today: '今日',
  week: '本週',
  month: '本月',
}

const COMPARE_LABELS: Record<string, string> = {
  today: '昨日',
  week: '上週',
  month: '上月',
}

const WAITING_ON_COLORS: Record<string, string> = {
  Customer: 'orange',
  Sales: 'blue',
  IT: 'green',
  RD: 'purple',
  PM: 'cyan',
  Partner: 'gold',
}

const PRIORITY_COLORS: Record<string, string> = {
  Highest: '#ff4d4f',
  High: '#fa8c16',
  Medium: '#faad14',
  Low: '#52c41a',
  Lowest: '#8c8c8c',
}

function TrendIndicator({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (previous === 0 && current === 0) return null
  const diff = current - previous
  if (diff === 0) return <Text type="secondary" style={{ fontSize: 12 }}>與{label}持平</Text>

  const pct = previous > 0 ? Math.round((diff / previous) * 100) : 0
  const isUp = diff > 0

  return (
    <Tooltip title={`${label}：${previous}`}>
      <Text
        type={isUp ? 'success' : 'danger'}
        style={{ fontSize: 12 }}
      >
        {isUp ? <RiseOutlined /> : <FallOutlined />}
        {' '}{isUp ? '+' : ''}{diff}
        {previous > 0 && ` (${isUp ? '+' : ''}${pct}%)`}
      </Text>
    </Tooltip>
  )
}

export default function ActivityStatsPage() {
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<string>('today')

  const fetchStats = useCallback(async (r: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/dashboard/activity-stats?range=${r}`, { credentials: 'include' })
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (error) {
      console.error('Error fetching activity stats:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats(range)
  }, [range, fetchStats])

  const stats = data?.stats
  const personal = data?.personal
  const compareLabel = COMPARE_LABELS[range] || '上期'

  const statCards = stats ? [
    {
      title: 'LINE 訊息',
      icon: <MessageOutlined style={{ color: '#00C300' }} />,
      value: stats.lineMessages.current,
      prev: stats.lineMessages.previous,
      extra: data?.activeLineChannels ? `${data.activeLineChannels} 個活躍頻道` : undefined,
    },
    {
      title: 'Slack 活動',
      icon: <SlackOutlined style={{ color: '#4A154B' }} />,
      value: stats.slackActivities.current,
      prev: stats.slackActivities.previous,
    },
    {
      title: 'Email 活動',
      icon: <MailOutlined style={{ color: '#EA4335' }} />,
      value: stats.emailActivities.current,
      prev: stats.emailActivities.previous,
    },
    {
      title: '手動紀錄',
      icon: <EditOutlined style={{ color: '#1890ff' }} />,
      value: stats.manualActivities.current,
      prev: stats.manualActivities.previous,
    },
    {
      title: '會議記錄',
      icon: <AudioOutlined style={{ color: '#722ED1' }} />,
      value: stats.meetingActivities.current,
      prev: stats.meetingActivities.previous,
    },
  ] : []

  const businessCards = stats ? [
    {
      title: '新客戶',
      icon: <TeamOutlined style={{ color: '#13C2C2' }} />,
      value: stats.newPartners.current,
      prev: stats.newPartners.previous,
    },
    {
      title: '新專案',
      icon: <ProjectOutlined style={{ color: '#FA8C16' }} />,
      value: stats.newProjects.current,
      prev: stats.newProjects.previous,
    },
    {
      title: '新成交',
      icon: <DollarOutlined style={{ color: '#52C41A' }} />,
      value: stats.newDeals.current,
      prev: stats.newDeals.previous,
    },
    {
      title: '新報價單',
      icon: <FileTextOutlined style={{ color: '#2F54EB' }} />,
      value: stats.newQuotations.current,
      prev: stats.newQuotations.previous,
    },
  ] : []

  // Build daily trend table data
  const trendTableData = (() => {
    if (!data?.trends) return []
    const dateMap = new Map<string, Record<string, number>>()

    for (const item of data.trends.line) {
      const dateStr = dayjs(item.date).format('YYYY-MM-DD')
      if (!dateMap.has(dateStr)) dateMap.set(dateStr, {})
      dateMap.get(dateStr)!.LINE_MSG = (dateMap.get(dateStr)!.LINE_MSG || 0) + item.count
    }

    for (const item of data.trends.activity) {
      const dateStr = dayjs(item.date).format('YYYY-MM-DD')
      if (!dateMap.has(dateStr)) dateMap.set(dateStr, {})
      if (item.source) {
        dateMap.get(dateStr)![item.source] = (dateMap.get(dateStr)![item.source] || 0) + item.count
      }
    }

    return Array.from(dateMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, counts]) => ({
        key: date,
        date,
        ...counts,
        total: Object.values(counts).reduce((sum, v) => sum + v, 0),
      }))
  })()

  const trendColumns = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      render: (v: string) => dayjs(v).format('MM/DD (dd)'),
    },
    { title: 'LINE', dataIndex: 'LINE_MSG', key: 'LINE_MSG', render: (v: number) => v || '-' },
    { title: 'Slack', dataIndex: 'SLACK', key: 'SLACK', render: (v: number) => v || '-' },
    { title: 'Email', dataIndex: 'EMAIL', key: 'EMAIL', render: (v: number) => v || '-' },
    { title: '手動', dataIndex: 'MANUAL', key: 'MANUAL', render: (v: number) => v || '-' },
    { title: '會議', dataIndex: 'MEETING', key: 'MEETING', render: (v: number) => v || '-' },
    { title: 'Jira', dataIndex: 'JIRA', key: 'JIRA', render: (v: number) => v || '-' },
    {
      title: '合計',
      dataIndex: 'total',
      key: 'total',
      render: (v: number) => <Text strong>{v}</Text>,
    },
  ]

  return (
    <AppLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <Title level={4} style={{ margin: 0 }}>
          <LineChartOutlined /> 活動統計
        </Title>
        <Segmented
          options={[
            { label: '今日', value: 'today' },
            { label: '本週', value: 'week' },
            { label: '本月', value: 'month' },
          ]}
          value={range}
          onChange={(v) => setRange(v as string)}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : !data ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Text type="secondary">無法載入資料</Text>
        </div>
      ) : (
        <>
          {/* ===== Personal Dashboard ===== */}
          <Card
            title={<><UserOutlined /> 我的工作概覽</>}
            style={{ marginBottom: 24 }}
            size="small"
          >
            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
              <Col xs={8} sm={6} md={4}>
                <Statistic
                  title={`${RANGE_LABELS[range]}活動`}
                  value={personal?.myActivities || 0}
                  styles={{ content: { fontSize: 20 } }}
                />
              </Col>
              <Col xs={8} sm={6} md={4}>
                <Statistic
                  title="待處理 Issues"
                  value={personal?.myOpenItems.length || 0}
                  styles={{ content: { fontSize: 20, color: (personal?.myOpenItems.length || 0) > 0 ? '#fa8c16' : undefined } }}
                />
              </Col>
              <Col xs={8} sm={6} md={4}>
                <Statistic
                  title={`${RANGE_LABELS[range]}成交`}
                  value={personal?.myDeals || 0}
                  styles={{ content: { fontSize: 20 } }}
                />
              </Col>
              <Col xs={8} sm={6} md={4}>
                <Statistic
                  title={`${RANGE_LABELS[range]}報價`}
                  value={personal?.myQuotations || 0}
                  styles={{ content: { fontSize: 20 } }}
                />
              </Col>
            </Row>

            {/* My open items */}
            {personal && personal.myOpenItems.length > 0 && (
              <>
                <Divider style={{ margin: '12px 0' }} />
                <Text strong style={{ marginBottom: 8, display: 'block' }}>
                  <ExclamationCircleOutlined /> 我負責的待處理 Issues
                </Text>
                <div>
                  {personal.myOpenItems.map((item) => {
                    const isOverdue = item.dueDate && dayjs(item.dueDate).isBefore(dayjs(), 'day')
                    return (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Space size={4} wrap>
                            <Tag color="blue" style={{ margin: 0 }}>{item.jiraKey}</Tag>
                            <Text style={{ fontSize: 13 }}>{item.summary}</Text>
                          </Space>
                          <div style={{ marginTop: 4 }}>
                            <Space size={4} wrap>
                              <Tag>{item.status}</Tag>
                              {item.priority && (
                                <Text style={{ color: PRIORITY_COLORS[item.priority] || '#8c8c8c', fontSize: 12 }}>
                                  {item.priority}
                                </Text>
                              )}
                              {item.waitingOn && (
                                <Tag color={WAITING_ON_COLORS[item.waitingOn]} style={{ margin: 0 }}>
                                  等待: {item.waitingOn}
                                </Tag>
                              )}
                              {item.partner && (
                                <Text type="secondary" style={{ fontSize: 12 }}>{item.partner.name}</Text>
                              )}
                              {isOverdue && (
                                <Badge status="error" text={<Text type="danger" style={{ fontSize: 12 }}>逾期 {dayjs(item.dueDate).format('MM/DD')}</Text>} />
                              )}
                              {item.dueDate && !isOverdue && (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  到期 {dayjs(item.dueDate).format('MM/DD')}
                                </Text>
                              )}
                            </Space>
                          </div>
                        </div>
                        <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap', marginLeft: 8 }}>
                          {dayjs(item.jiraUpdated).fromNow()}
                        </Text>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* My recent activities */}
            {personal && personal.myRecentActivities.length > 0 && (
              <>
                <Divider style={{ margin: '12px 0' }} />
                <Text strong style={{ marginBottom: 8, display: 'block' }}>
                  <EditOutlined /> 我的近期活動
                </Text>
                <div>
                  {personal.myRecentActivities.map((item) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <Space size={4} wrap style={{ flex: 1 }}>
                        <Tag color={SOURCE_COLORS[item.source]} style={{ margin: 0 }}>
                          {SOURCE_LABELS[item.source] || item.source}
                        </Tag>
                        <Text style={{ fontSize: 13 }}>{item.title}</Text>
                        {item.partner && (
                          <Link href={`/customers/${item.partner.id}`}>
                            <Text type="secondary" style={{ fontSize: 12 }}>{item.partner.name}</Text>
                          </Link>
                        )}
                      </Space>
                      <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        {dayjs(item.createdAt).fromNow()}
                      </Text>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          {/* ===== Team-wide Stats ===== */}
          <Divider>全團隊統計</Divider>

          {/* Summary card */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <Row align="middle" justify="space-between">
              <Col>
                <Statistic
                  title={`${RANGE_LABELS[range]}活動總數`}
                  value={stats?.totalActivities.current || 0}
                  prefix={<SyncOutlined />}
                />
              </Col>
              <Col>
                <TrendIndicator
                  current={stats?.totalActivities.current || 0}
                  previous={stats?.totalActivities.previous || 0}
                  label={compareLabel}
                />
              </Col>
            </Row>
          </Card>

          {/* Communication channels */}
          <Title level={5} style={{ marginBottom: 12 }}>通訊管道</Title>
          <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
            {statCards.map((card) => (
              <Col xs={12} sm={8} md={6} lg={4} key={card.title}>
                <Card size="small">
                  <Statistic
                    title={card.title}
                    value={card.value}
                    prefix={card.icon}
                    styles={{ content: { fontSize: 24 } }}
                  />
                  <div style={{ marginTop: 4 }}>
                    <TrendIndicator current={card.value} previous={card.prev} label={compareLabel} />
                  </div>
                  {card.extra && (
                    <Text type="secondary" style={{ fontSize: 11 }}>{card.extra}</Text>
                  )}
                </Card>
              </Col>
            ))}
          </Row>

          {/* Business metrics */}
          <Title level={5} style={{ marginBottom: 12 }}>業務指標</Title>
          <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
            {businessCards.map((card) => (
              <Col xs={12} sm={8} md={6} key={card.title}>
                <Card size="small">
                  <Statistic
                    title={card.title}
                    value={card.value}
                    prefix={card.icon}
                    styles={{ content: { fontSize: 24 } }}
                  />
                  <div style={{ marginTop: 4 }}>
                    <TrendIndicator current={card.value} previous={card.prev} label={compareLabel} />
                  </div>
                </Card>
              </Col>
            ))}
          </Row>

          {/* Activity breakdown */}
          {data.activityBreakdown.length > 0 && (
            <Card title="活動來源分佈" size="small" style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {data.activityBreakdown.map((item) => (
                  <Tag
                    key={item.source}
                    color={SOURCE_COLORS[item.source] || 'default'}
                    style={{ fontSize: 14, padding: '4px 12px' }}
                  >
                    {SOURCE_LABELS[item.source] || item.source}: {item.count}
                  </Tag>
                ))}
              </div>
            </Card>
          )}

          {/* Daily trend table */}
          {trendTableData.length > 0 && (
            <Card title="每日趨勢" size="small">
              <Table
                dataSource={trendTableData}
                columns={trendColumns}
                pagination={false}
                size="small"
                scroll={{ x: 600 }}
              />
            </Card>
          )}
        </>
      )}
    </AppLayout>
  )
}
