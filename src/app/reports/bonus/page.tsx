'use client'

import { useState } from 'react'
import {
  Card, Table, Select, InputNumber, Button, Row, Col, Statistic, Tag,
  Space, message, Popconfirm, Typography, Collapse,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  TrophyOutlined, DollarOutlined, SaveOutlined, TeamOutlined,
  ProjectOutlined, CheckCircleOutlined, ClockCircleOutlined,
} from '@ant-design/icons'
import useSWR from 'swr'
import AppLayout from '@/components/layout/AppLayout'
import BonusEvalModal from '@/components/bonus/BonusEvalModal'
import { useUser } from '@/hooks/useUser'
import { EVAL_STATUS, COST_CATEGORIES, MEMBER_ROLES } from '@/constants/bonus'

const { Text } = Typography
const fetcher = (url: string) => fetch(url).then(r => r.json())

const currentYear = new Date().getFullYear()
// 過去 2 年 + 當年 + 未來 5 年，由新到舊排列
const yearOptions = Array.from({ length: 8 }, (_, i) => currentYear + 5 - i)

interface ProjectSummary {
  evalId: string
  projectId: string
  projectName: string
  partnerName: string
  dealName?: string
  dealAmount: number
  totalCost: number
  projectAmount: number
  baseScore: number
  importanceAdj: number
  qualityAdj: number
  efficiencyAdj: number
  totalScore: number
  effectiveScore: number
  warrantyYears: number
  scoreSpreadPcts: number[] | null
  spreadRatio: number
  evalYear: number
  status: string
  memberCount: number
  costs: Array<{ category: string; description: string; amount: number }>
}

interface BonusRow {
  userId: string
  userName: string
  userEmail: string
  totalScore: number
  confirmedScore: number
  projectedScore: number
  bonusAmount: number
  confirmedBonusAmount: number
  projectedBonusAmount: number
  projects: Array<{
    evalId: string
    projectId: string
    projectName: string
    partnerName: string
    role: string
    contributionPct: number
    score: number
    yearOffset?: number
    evalYear?: number
    warrantyYears?: number
    status: string
  }>
}

export default function BonusReportPage() {
  const { can } = useUser()
  const [year, setYear] = useState(currentYear)
  const [pointRate, setPointRate] = useState<number | null>(null)
  const [editingRate, setEditingRate] = useState(false)

  const canApprove = can('APPROVE_BONUS')
  const [evalModal, setEvalModal] = useState<{ projectId: string; projectName: string } | null>(null)

  const { data, isLoading, mutate } = useSWR(
    `/api/reports/bonus?year=${year}`,
    fetcher,
    { onSuccess: (d) => { if (pointRate === null) setPointRate(d.pointRate ?? 1000) } }
  )

  const handleSaveRate = async () => {
    try {
      const res = await fetch('/api/reports/bonus', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, pointRate }),
      })
      if (!res.ok) throw new Error()
      message.success('每點兌換金額已更新')
      setEditingRate(false)
      mutate()
    } catch {
      message.error('更新失敗')
    }
  }

  const getCostLabel = (cat: string) => COST_CATEGORIES.find(c => c.value === cat)?.label || cat
  const getRoleLabel = (role: string) => MEMBER_ROLES.find(r => r.value === role)?.label || role
  const getStatusTag = (status: string) => {
    const s = EVAL_STATUS.find(e => e.value === status)
    return <Tag color={s?.color || 'default'}>{s?.label || status}</Tag>
  }

  const rows: BonusRow[] = data?.rows || []
  const projectSummary: ProjectSummary[] = data?.projectSummary || []
  const allMembersTotal: number = data?.allMembersTotal || 0
  const confirmedTotal: number = data?.confirmedTotal || 0
  const projectedTotal: number = data?.projectedTotal || 0

  const memberColumns: TableColumnsType<BonusRow> = [
    {
      title: '排名', width: 60,
      render: (_, __, i) => <Text strong>{i + 1}</Text>,
    },
    {
      title: '姓名', dataIndex: 'userName',
      render: (name: string, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          <div style={{ fontSize: 12, color: '#999' }}>{record.userEmail}</div>
        </div>
      ),
    },
    {
      title: '參與專案數', width: 100, align: 'center' as const,
      render: (_, record) => record.projects.length,
    },
    {
      title: '確認點數', dataIndex: 'confirmedScore', width: 110, align: 'right' as const,
      render: (v: number) => v > 0 ? <Text strong style={{ color: '#389e0d' }}>{v.toFixed(2)}</Text> : <Text type="secondary">-</Text>,
      sorter: (a, b) => a.confirmedScore - b.confirmedScore,
    },
    {
      title: '預計撥發', dataIndex: 'projectedScore', width: 110, align: 'right' as const,
      render: (v: number) => v > 0 ? <Text style={{ color: '#d48806' }}>{v.toFixed(2)}</Text> : <Text type="secondary">-</Text>,
      sorter: (a, b) => a.projectedScore - b.projectedScore,
    },
    {
      title: '合計點數', dataIndex: 'totalScore', width: 110, align: 'right' as const,
      render: (v: number) => <Text strong style={{ color: '#722ed1' }}>{v.toFixed(2)}</Text>,
      sorter: (a, b) => a.totalScore - b.totalScore,
      defaultSortOrder: 'descend' as const,
    },
    {
      title: '預估業績獎金', width: 180, align: 'right' as const,
      render: (_: unknown, record: BonusRow) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ color: '#cf1322' }}>${record.bonusAmount.toLocaleString()}</Text>
          {record.confirmedBonusAmount > 0 && record.projectedBonusAmount > 0 && (
            <Text style={{ fontSize: 11, color: '#999' }}>
              確認 ${record.confirmedBonusAmount.toLocaleString()} + 預計 ${record.projectedBonusAmount.toLocaleString()}
            </Text>
          )}
        </Space>
      ),
    },
  ]

  const projectColumns: TableColumnsType<ProjectSummary> = [
    { title: '專案名稱', dataIndex: 'projectName', ellipsis: true },
    { title: '客戶', dataIndex: 'partnerName', width: 120, ellipsis: true },
    { title: '訂單', dataIndex: 'dealName', width: 100 },
    {
      title: '成案金額', dataIndex: 'dealAmount', width: 110, align: 'right' as const,
      render: (v: number) => `$${v.toLocaleString()}`,
    },
    {
      title: '外部成本', dataIndex: 'totalCost', width: 100, align: 'right' as const,
      render: (v: number) => v > 0 ? <Text type="danger">-${v.toLocaleString()}</Text> : '-',
    },
    {
      title: '專案金額', dataIndex: 'projectAmount', width: 110, align: 'right' as const,
      render: (v: number) => <Text strong>${v.toLocaleString()}</Text>,
    },
    {
      title: '基礎分', dataIndex: 'baseScore', width: 80, align: 'right' as const,
      render: (v: number) => v.toFixed(2),
    },
    {
      title: '調整', width: 120,
      render: (_, record) => {
        const adj = record.importanceAdj + record.qualityAdj + record.efficiencyAdj
        return (
          <span style={{ color: adj >= 0 ? '#3f8600' : '#cf1322' }}>
            {adj >= 0 ? '+' : ''}{adj}%
          </span>
        )
      },
    },
    {
      title: '專案總分', dataIndex: 'totalScore', width: 90, align: 'right' as const,
      render: (v: number) => <Text strong>{v.toFixed(2)}</Text>,
    },
    {
      title: '本年度計分', width: 120, align: 'right' as const,
      render: (_: unknown, record: ProjectSummary) => {
        if (record.warrantyYears <= 1) {
          return <Text strong style={{ color: '#722ed1' }}>{record.totalScore.toFixed(2)}</Text>
        }
        return (
          <Space orientation="vertical" size={0}>
            <Text strong style={{ color: '#722ed1' }}>{record.effectiveScore.toFixed(2)}</Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              ({Math.round(record.spreadRatio * 100)}% / {record.warrantyYears}年保固)
            </Text>
          </Space>
        )
      },
    },
    {
      title: '成員數', dataIndex: 'memberCount', width: 70, align: 'center' as const,
    },
    {
      title: '狀態', dataIndex: 'status', width: 90,
      render: (v: string) => getStatusTag(v),
    },
  ]

  return (
    <AppLayout>
      <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
        <Card
          title={
            <Space>
              <TrophyOutlined style={{ color: '#722ed1' }} />
              年度專案預估業績獎金報表
            </Space>
          }
          extra={
            <Space>
              <Select
                value={year}
                onChange={v => { setYear(v); setPointRate(null) }}
                options={yearOptions.map(y => ({ value: y, label: `${y} 年` }))}
                style={{ width: 120 }}
              />
            </Space>
          }
        >
          {/* Summary Stats */}
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={4}>
              <Card size="small">
                <Statistic
                  title="評估專案數"
                  value={data?.evalCount || 0}
                  prefix={<ProjectOutlined />}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <Statistic
                  title="確認點數"
                  value={confirmedTotal}
                  precision={2}
                  prefix={<CheckCircleOutlined />}
                  styles={{ content: { color: '#389e0d' } }}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <Statistic
                  title="預計撥發點數"
                  value={projectedTotal}
                  precision={2}
                  prefix={<ClockCircleOutlined />}
                  styles={{ content: { color: '#d48806' } }}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <Statistic
                  title="全員專案分合計"
                  value={allMembersTotal}
                  precision={2}
                  prefix={<TrophyOutlined />}
                  styles={{ content: { color: '#722ed1' } }}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <Statistic
                  title="參與人數"
                  value={rows.length}
                  prefix={<TeamOutlined />}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                {editingRate ? (
                  <Space>
                    <InputNumber
                      value={pointRate}
                      onChange={v => setPointRate(v)}
                      formatter={v => `$ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      style={{ width: 160 }}
                    />
                    <Button type="primary" size="small" icon={<SaveOutlined />} onClick={handleSaveRate}>存</Button>
                    <Button size="small" onClick={() => setEditingRate(false)}>取消</Button>
                  </Space>
                ) : (
                  <Statistic
                    title={
                      <Space>
                        每點兌換金額
                        {canApprove && (
                          <Button type="link" size="small" onClick={() => setEditingRate(true)}>設定</Button>
                        )}
                      </Space>
                    }
                    value={data?.pointRate ?? 1000}
                    prefix={<DollarOutlined />}
                    suffix="元/點"
                    styles={{ content: { color: '#cf1322' } }}
                  />
                )}
              </Card>
            </Col>
          </Row>

          {/* Member Bonus Table */}
          <Card
            size="small"
            title={<Space><TeamOutlined /> 個人預估業績獎金</Space>}
            style={{ marginBottom: 16 }}
          >
            <Table
              dataSource={rows}
              columns={memberColumns}
              rowKey="userId"
              size="small"
              loading={isLoading}
              pagination={false}
              expandable={{
                expandedRowRender: (record) => (
                  <Table
                    dataSource={record.projects}
                    rowKey="evalId"
                    size="small"
                    pagination={false}
                    columns={[
                      {
                        title: '專案', dataIndex: 'projectName', ellipsis: true,
                        render: (name: string, r: BonusRow['projects'][0]) => (
                          <a onClick={() => setEvalModal({ projectId: r.projectId, projectName: name })}>
                            {name}
                          </a>
                        ),
                      },
                      { title: '客戶', dataIndex: 'partnerName', width: 120 },
                      {
                        title: '角色', dataIndex: 'role', width: 100,
                        render: (v: string) => getRoleLabel(v),
                      },
                      {
                        title: '貢獻比例', dataIndex: 'contributionPct', width: 90, align: 'right' as const,
                        render: (v: number) => `${v}%`,
                      },
                      {
                        title: '個人專案分', dataIndex: 'score', width: 130, align: 'right' as const,
                        render: (v: number, r: BonusRow['projects'][0]) => (
                          <Space orientation="vertical" size={0}>
                            <Text strong style={{ color: '#722ed1' }}>{v.toFixed(2)}</Text>
                            {r.warrantyYears && r.warrantyYears > 1 && (
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                (保固第 {(r.yearOffset ?? 0) + 1} 年)
                              </Text>
                            )}
                          </Space>
                        ),
                      },
                      {
                        title: '狀態', dataIndex: 'status', width: 90,
                        render: (v: string) => getStatusTag(v),
                      },
                    ]}
                  />
                ),
              }}
              summary={() => {
                if (rows.length === 0) return null
                const totalBonus = rows.reduce((s, r) => s + r.bonusAmount, 0)
                const totalConfirmedBonus = rows.reduce((s, r) => s + r.confirmedBonusAmount, 0)
                const totalProjectedBonus = rows.reduce((s, r) => s + r.projectedBonusAmount, 0)
                return (
                  <Table.Summary fixed>
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={4} align="right">
                        <Text strong>合計</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={4} align="right">
                        <Text strong style={{ color: '#389e0d' }}>{confirmedTotal.toFixed(2)}</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={5} align="right">
                        <Text strong style={{ color: '#d48806' }}>{projectedTotal.toFixed(2)}</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={6} align="right">
                        <Text strong style={{ color: '#722ed1' }}>{allMembersTotal.toFixed(2)}</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={7} align="right">
                        <Space direction="vertical" size={0}>
                          <Text strong style={{ color: '#cf1322' }}>${totalBonus.toLocaleString()}</Text>
                          {totalConfirmedBonus > 0 && totalProjectedBonus > 0 && (
                            <Text style={{ fontSize: 11, color: '#999' }}>
                              確認 ${totalConfirmedBonus.toLocaleString()} + 預計 ${totalProjectedBonus.toLocaleString()}
                            </Text>
                          )}
                        </Space>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  </Table.Summary>
                )
              }}
            />
          </Card>

          {/* Project Summary */}
          <Collapse
            items={[{
              key: 'projects',
              label: <Space><ProjectOutlined /> 專案評估明細 ({projectSummary.length})</Space>,
              children: (
                <Table
                  dataSource={projectSummary}
                  columns={projectColumns}
                  rowKey="evalId"
                  size="small"
                  loading={isLoading}
                  pagination={false}
                  expandable={{
                    expandedRowRender: (record) => (
                      <div style={{ padding: '8px 0' }}>
                        {record.costs.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <Text type="secondary">外部成本：</Text>
                            {record.costs.map((c, i) => (
                              <Tag key={i}>{getCostLabel(c.category)}: {c.description} (${c.amount.toLocaleString()})</Tag>
                            ))}
                          </div>
                        )}
                        <Text type="secondary">
                          重要性 +{record.importanceAdj}% | 質量 {record.qualityAdj >= 0 ? '+' : ''}{record.qualityAdj}% | 時效 {record.efficiencyAdj >= 0 ? '+' : ''}{record.efficiencyAdj}%
                        </Text>
                        {record.warrantyYears > 1 && record.scoreSpreadPcts && (
                          <div style={{ marginTop: 4 }}>
                            <Text type="secondary">
                              保固 {record.warrantyYears} 年攤分：
                              {record.scoreSpreadPcts.map((pct: number, i: number) => (
                                <Tag key={i} color={record.evalYear + i === year ? 'blue' : 'default'} style={{ marginLeft: 4 }}>
                                  {record.evalYear + i}年 {pct}%
                                </Tag>
                              ))}
                            </Text>
                          </div>
                        )}
                      </div>
                    ),
                  }}
                />
              ),
            }]}
          />

          {/* Formula explanation */}
          <Card size="small" style={{ marginTop: 16, background: '#fafafa' }}>
            <Text type="secondary">
              計算公式：專案金額 = 成案金額 - 外部成本 | 基礎分 = 專案金額 / 10萬 |
              專案總分 = 基礎分 x (100% + 重要性 + 質量 + 時效) |
              本年度計分 = 專案總分 x 當年攤分比例（有延長保固時攤分至各年度） |
              個人專案分 = 本年度計分 x 貢獻比例 |
              預估業績獎金 = 個人專案分 x 每點兌換金額
            </Text>
          </Card>
        </Card>
      </div>
      {evalModal && (
        <BonusEvalModal
          open={true}
          onClose={() => { setEvalModal(null); mutate() }}
          projectId={evalModal.projectId}
          projectName={evalModal.projectName}
        />
      )}
    </AppLayout>
  )
}
