'use client'

import { useState } from 'react'
import {
  Card, Table, Select, Tag, Space, Typography, Row, Col, Statistic,
  Button, message, Tooltip,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  TrophyOutlined, CalendarOutlined, CheckCircleOutlined,
  ClockCircleOutlined, PlusCircleOutlined, SendOutlined, EditOutlined, SwapOutlined,
} from '@ant-design/icons'
import useSWR from 'swr'
import AppLayout from '@/components/layout/AppLayout'
import { useUser } from '@/hooks/useUser'
import { MEMBER_ROLES } from '@/constants/bonus'

const { Text } = Typography
const fetcher = (url: string) => fetch(url).then(r => r.json())

const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1

const yearOptions = Array.from({ length: 4 }, (_, i) => currentYear - i)
const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)

interface CreditEvent {
  eventType: 'ASSIGNED' | 'EVALUATED' | 'APPROVED' | 'SCORE_CHANGED'
  evalId: string
  userId: string
  userName: string
  projectId: string
  projectName: string
  partnerName: string
  role: string
  yearOffset: number
  contributionPct: number
  score: number
  oldScore?: number
  oldContributionPct?: number
  evalStatus: string
  evalYear: number
  eventDate: string | null
  changedBy?: string
}

const EVENT_TYPE_CONFIG = {
  ASSIGNED: { label: '新增指派', color: 'blue', icon: <PlusCircleOutlined /> },
  EVALUATED: { label: '已提交評估', color: 'gold', icon: <ClockCircleOutlined /> },
  APPROVED: { label: '已核准確認', color: 'green', icon: <CheckCircleOutlined /> },
  SCORE_CHANGED: { label: '點數異動', color: 'purple', icon: <SwapOutlined /> },
}

const DRAFT_TAG = { label: '草稿/待評估', color: 'default', icon: <EditOutlined /> }

function getRoleLabel(role: string) {
  return MEMBER_ROLES.find(r => r.value === role)?.label || role
}

export default function BonusMonthlyPage() {
  const { role } = useUser()
  const isAdmin = role === 'ADMIN'
  const canViewOthers = ['ADMIN', 'FINANCE', 'MANAGER'].includes(role || '')

  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(undefined)
  const [sending, setSending] = useState(false)

  const { data: usersData } = useSWR(
    canViewOthers ? '/api/users' : null,
    fetcher
  )
  const userOptions: { id: string; name: string; email: string }[] = usersData
    ? (Array.isArray(usersData) ? usersData : usersData.users || [])
    : []

  const apiUrl = `/api/reports/bonus/monthly?year=${year}&month=${month}${selectedUserId ? `&userId=${selectedUserId}` : ''}`
  const { data, isLoading } = useSWR(apiUrl, fetcher)
  const isAllMode = data?.isAllMode === true

  const events: CreditEvent[] = data?.events || []
  const ytd = data?.ytd || { confirmed: 0, projected: 0, total: 0 }

  const handleSendTest = async () => {
    setSending(true)
    try {
      const res = await fetch('/api/reports/bonus/monthly/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month }),
      })
      const result = await res.json()
      if (result.sent !== undefined) {
        message.success(`已發送 ${result.sent} 封，略過 ${result.skipped} 封，失敗 ${result.errors} 封`)
      } else {
        message.error(result.error || '發送失敗')
      }
    } catch {
      message.error('發送失敗')
    } finally {
      setSending(false)
    }
  }

  const columns: TableColumnsType<CreditEvent> = [
    ...(isAllMode ? [{
      title: '成員', dataIndex: 'userName', width: 110,
      render: (name: string) => <Text strong>{name}</Text>,
    }] : []),
    {
      title: '類型', dataIndex: 'eventType', width: 120,
      render: (v: CreditEvent['eventType'], record: CreditEvent) => {
        const cfg = (record.evalStatus === 'DRAFT' && v === 'ASSIGNED') ? DRAFT_TAG : EVENT_TYPE_CONFIG[v]
        return <Tag color={cfg.color} icon={cfg.icon}>{cfg.label}</Tag>
      },
    },
    {
      title: '專案', dataIndex: 'projectName',
      render: (name: string, record) => (
        <div>
          <a href={`/reports/bonus?projectId=${record.projectId}`}>{name}</a>
          <div style={{ fontSize: 12, color: '#999' }}>{record.partnerName}</div>
        </div>
      ),
    },
    {
      title: '角色', dataIndex: 'role', width: 100,
      render: (v: string, record) => (
        <div>
          <div>{getRoleLabel(v)}</div>
          {record.yearOffset > 0 && (
            <div style={{ fontSize: 11, color: '#aaa' }}>保固第 {record.yearOffset + 1} 年</div>
          )}
        </div>
      ),
    },
    {
      title: '貢獻比例', dataIndex: 'contributionPct', width: 90, align: 'right' as const,
      render: (v: number) => `${v}%`,
    },
    {
      title: '點數', dataIndex: 'score', width: 130, align: 'right' as const,
      render: (v: number, record: CreditEvent) => {
        if (record.evalStatus === 'DRAFT' && record.eventType !== 'SCORE_CHANGED') {
          return <Tooltip title="草稿階段尚未計算點數，不計入預計點數"><Text type="secondary">待計算</Text></Tooltip>
        }
        if (record.eventType === 'SCORE_CHANGED' && record.oldScore !== undefined) {
          const diff = v - record.oldScore
          return (
            <Tooltip title={`貢獻比例：${record.oldContributionPct}% → ${record.contributionPct}%`}>
              <Space size={4}>
                <Text delete type="secondary" style={{ fontSize: 12 }}>{record.oldScore.toFixed(2)}</Text>
                <Text strong style={{ color: '#722ed1' }}>{v.toFixed(2)}</Text>
                <Text style={{ fontSize: 11, color: diff >= 0 ? '#389e0d' : '#cf1322' }}>
                  ({diff >= 0 ? '+' : ''}{diff.toFixed(2)})
                </Text>
              </Space>
            </Tooltip>
          )
        }
        return (
          <Text strong style={{ color: record.eventType === 'APPROVED' ? '#389e0d' : '#722ed1' }}>
            {v.toFixed(2)}
          </Text>
        )
      },
      sorter: (a, b) => a.score - b.score,
    },
    {
      title: '評估年度', dataIndex: 'evalYear', width: 90, align: 'center' as const,
      render: (v: number) => `${v} 年`,
    },
    {
      title: '日期', dataIndex: 'eventDate', width: 110,
      render: (v: string | null) => v
        ? new Date(v).toLocaleDateString('zh-TW')
        : <Text type="secondary">-</Text>,
    },
  ]

  return (
    <AppLayout>
      <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
        <Card
          title={
            <Space>
              <CalendarOutlined style={{ color: '#722ed1' }} />
              個人月度點數報表
            </Space>
          }
          extra={
            <Space>
              {canViewOthers && (
                <Select
                  value={selectedUserId}
                  onChange={setSelectedUserId}
                  placeholder="查看指定成員"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  style={{ width: 160 }}
                  options={[
                    ...(isAdmin ? [{ value: '__all__', label: '📋 全部成員' }] : []),
                    ...userOptions.map(u => ({
                      value: u.id,
                      label: u.name || u.email,
                    })),
                  ]}
                />
              )}
              <Select
                value={year}
                onChange={setYear}
                options={yearOptions.map(y => ({ value: y, label: `${y} 年` }))}
                style={{ width: 100 }}
              />
              <Select
                value={month}
                onChange={setMonth}
                options={monthOptions.map(m => ({ value: m, label: `${m} 月` }))}
                style={{ width: 80 }}
              />
              {isAdmin && (
                <Tooltip title={`發送 ${year}年${month}月 月報給所有成員`}>
                  <Button
                    icon={<SendOutlined />}
                    loading={sending}
                    onClick={handleSendTest}
                  >
                    發送月報
                  </Button>
                </Tooltip>
              )}
            </Space>
          }
        >
          {/* YTD Summary */}
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col flex="1">
              <Card size="small">
                <Statistic
                  title={`${year} 年確認點數`}
                  value={ytd.confirmed}
                  precision={2}
                  prefix={<CheckCircleOutlined />}
                  styles={{ content: { color: '#389e0d' } }}
                />
              </Card>
            </Col>
            <Col flex="1">
              <Card size="small">
                <Statistic
                  title={`${year} 年預計點數`}
                  value={ytd.projected}
                  precision={2}
                  prefix={<ClockCircleOutlined />}
                  styles={{ content: { color: '#d48806' } }}
                />
              </Card>
            </Col>
            <Col flex="1">
              <Card size="small">
                <Statistic
                  title={`${year} 年累計點數`}
                  value={ytd.total}
                  precision={2}
                  prefix={<TrophyOutlined />}
                  styles={{ content: { color: '#722ed1' } }}
                />
              </Card>
            </Col>
          </Row>

          {/* Monthly events */}
          <Card
            size="small"
            title={
              <Space>
                <CalendarOutlined />
                {year} 年 {month} 月點數變動明細
                <Text type="secondary" style={{ fontSize: 12 }}>({events.length} 筆)</Text>
              </Space>
            }
          >
            <Table
              key={isAllMode ? '__all__' : (selectedUserId || '__self__')}
              dataSource={events}
              columns={columns}
              rowKey={(r) => `${r.userId}-${r.evalId}-${r.eventType}`}
              size="small"
              loading={isLoading}
              pagination={false}
              locale={{ emptyText: '本月無點數變動記錄' }}
            />
          </Card>

          {/* Legend */}
          <div style={{ marginTop: 16, padding: '12px 16px', background: '#fafafa', borderRadius: 6 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <Space separator="｜" wrap>
                <span><Tag color="default" style={{ margin: 0 }}>草稿/待評估</Tag> 已加入但評估尚未提交，點數待計算，不計入預計點數</span>
                <span><Tag color="blue" style={{ margin: 0 }}>新增指派</Tag> 本月被加入專案評估</span>
                <span><Tag color="gold" style={{ margin: 0 }}>已提交評估</Tag> 評估已送出待核准，點數預計中</span>
                <span><Tag color="green" style={{ margin: 0 }}>已核准確認</Tag> 評估已核准，點數已確認</span>
                <span><Tag color="purple" style={{ margin: 0 }}>點數異動</Tag> 本月點數或貢獻比例被修改（顯示舊值 → 新值）</span>
              </Space>
            </Text>
          </div>
        </Card>
      </div>
    </AppLayout>
  )
}
