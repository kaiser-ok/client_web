'use client'

import { useState } from 'react'
import {
  Card, Table, Select, InputNumber, Button, Row, Col, Statistic, Tag,
  Space, App, Popconfirm, Typography, Modal, Form, Input,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  BankOutlined, PlusOutlined, DeleteOutlined, GiftOutlined,
  CheckCircleOutlined, SettingOutlined,
} from '@ant-design/icons'
import useSWR from 'swr'
import AppLayout from '@/components/layout/AppLayout'
import { useUser } from '@/hooks/useUser'
import { DEFAULT_CREDIT_POOL_SIZE } from '@/constants/bonus'
import type { CreditPoolAllocationItem } from '@/types/bonus'

const { Text } = Typography
const fetcher = (url: string) => fetch(url).then(r => r.json())

const currentYear = new Date().getFullYear()
const yearOptions = Array.from({ length: 8 }, (_, i) => currentYear + 5 - i)

interface EvalOption {
  evalId: string
  projectName: string
  partnerName: string
  totalScore: number
  year: number
}

export default function CreditPoolPage() {
  const { message } = App.useApp()
  const { can } = useUser()
  const [year, setYear] = useState(currentYear)
  const canApprove = can('APPROVE_BONUS')
  const canEdit = can('EDIT_BONUS')

  // Pool data
  const { data: poolData, isLoading, mutate } = useSWR(
    `/api/credit-pool?year=${year}`,
    fetcher
  )

  // Available evals for allocation
  const { data: bonusData } = useSWR(
    `/api/reports/bonus?year=${year}`,
    fetcher
  )

  const pool = poolData?.pool
  const allocations: CreditPoolAllocationItem[] = pool?.allocations || []

  // Pool setup modal
  const [setupModalOpen, setSetupModalOpen] = useState(false)
  const [setupForm] = Form.useForm()
  const [setupSaving, setSaving] = useState(false)

  // Allocation modal
  const [allocModalOpen, setAllocModalOpen] = useState(false)
  const [allocForm] = Form.useForm()
  const [allocSaving, setAllocSaving] = useState(false)

  const handleSetupPool = async () => {
    try {
      const values = await setupForm.validateFields()
      setSaving(true)
      const res = await fetch('/api/credit-pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          totalPoints: values.totalPoints,
          description: values.description,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        message.error(data.error || '設定失敗')
        return
      }
      message.success('點數池已設定')
      setSetupModalOpen(false)
      mutate()
    } catch {
      // validation error
    } finally {
      setSaving(false)
    }
  }

  const handleAllocate = async () => {
    try {
      const values = await allocForm.validateFields()
      setAllocSaving(true)
      const res = await fetch('/api/credit-pool/allocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          evalId: values.evalId,
          points: values.points,
          reason: values.reason,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        message.error(data.error || '分配失敗')
        return
      }
      message.success('已分配點數')
      setAllocModalOpen(false)
      allocForm.resetFields()
      mutate()
    } catch {
      // validation error
    } finally {
      setAllocSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/credit-pool/allocations?id=${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        message.error(data.error || '撤回失敗')
        return
      }
      message.success('已撤回分配')
      mutate()
    } catch {
      message.error('撤回失敗')
    }
  }

  // Build eval options from bonus report data
  const evalOptions: EvalOption[] = (bonusData?.projectSummary || []).map(
    (p: { evalId: string; projectName: string; partnerName: string; totalScore: number; evalYear: number }) => ({
      evalId: p.evalId,
      projectName: p.projectName,
      partnerName: p.partnerName,
      totalScore: p.totalScore,
      year: p.evalYear,
    })
  )

  const allocationColumns: TableColumnsType<CreditPoolAllocationItem> = [
    {
      title: '專案名稱',
      dataIndex: 'projectName',
      ellipsis: true,
    },
    {
      title: '客戶',
      dataIndex: 'partnerName',
      width: 140,
      ellipsis: true,
    },
    {
      title: '分配點數',
      dataIndex: 'points',
      width: 100,
      align: 'right' as const,
      render: (v: number) => <Text strong style={{ color: '#722ed1' }}>{v.toFixed(2)}</Text>,
    },
    {
      title: '原因',
      dataIndex: 'reason',
      ellipsis: true,
    },
    {
      title: '分配者',
      dataIndex: 'allocatedBy',
      width: 160,
      ellipsis: true,
    },
    {
      title: '時間',
      dataIndex: 'createdAt',
      width: 160,
      render: (v: string) => new Date(v).toLocaleString('zh-TW'),
    },
    ...(canEdit
      ? [
          {
            title: '操作',
            width: 80,
            align: 'center' as const,
            render: (_: unknown, record: CreditPoolAllocationItem) => (
              <Popconfirm
                title="確定要撤回此分配？"
                onConfirm={() => handleDelete(record.id)}
              >
                <Button type="text" danger icon={<DeleteOutlined />} size="small" />
              </Popconfirm>
            ),
          },
        ]
      : []),
  ]

  return (
    <AppLayout>
      <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
        <Card
          title={
            <Space>
              <BankOutlined style={{ color: '#722ed1' }} />
              點數池管理
            </Space>
          }
          extra={
            <Space>
              <Select
                value={year}
                onChange={setYear}
                options={yearOptions.map(y => ({ value: y, label: `${y} 年` }))}
                style={{ width: 120 }}
              />
              {canApprove && (
                <Button
                  icon={<SettingOutlined />}
                  onClick={() => {
                    setupForm.setFieldsValue({
                      totalPoints: pool?.totalPoints ?? DEFAULT_CREDIT_POOL_SIZE,
                      description: pool?.description || '',
                    })
                    setSetupModalOpen(true)
                  }}
                >
                  設定點數池
                </Button>
              )}
            </Space>
          }
        >
          {/* Pool Summary */}
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="總點數"
                  value={pool?.totalPoints ?? 0}
                  precision={2}
                  prefix={<BankOutlined />}
                  styles={{ content: { color: '#1890ff' } }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="已分配"
                  value={pool?.allocatedPoints ?? 0}
                  precision={2}
                  prefix={<CheckCircleOutlined />}
                  styles={{ content: { color: '#722ed1' } }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="剩餘"
                  value={pool?.remainingPoints ?? 0}
                  precision={2}
                  prefix={<GiftOutlined />}
                  styles={{ content: { color: (pool?.remainingPoints ?? 0) > 0 ? '#389e0d' : '#cf1322' } }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="分配筆數"
                  value={allocations.length}
                />
              </Card>
            </Col>
          </Row>

          {pool?.description && (
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary">說明：{pool.description}</Text>
            </div>
          )}

          {/* Allocations Table */}
          <Card
            size="small"
            title="分配紀錄"
            extra={
              canEdit && pool ? (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    allocForm.resetFields()
                    setAllocModalOpen(true)
                  }}
                  disabled={!pool || (pool.remainingPoints ?? 0) <= 0}
                >
                  新增分配
                </Button>
              ) : null
            }
          >
            {!pool ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
                {canApprove
                  ? '尚未建立點數池，請點擊「設定點數池」建立'
                  : '尚未建立點數池'}
              </div>
            ) : (
              <Table
                dataSource={allocations}
                columns={allocationColumns}
                rowKey="id"
                size="small"
                loading={isLoading}
                pagination={false}
                locale={{ emptyText: '尚無分配紀錄' }}
                summary={() => {
                  if (allocations.length === 0) return null
                  const total = allocations.reduce((s, a) => s + a.points, 0)
                  return (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={2} align="right">
                        <Text strong>合計</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="right">
                        <Text strong style={{ color: '#722ed1' }}>
                          {total.toFixed(2)}
                        </Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={3} colSpan={4} />
                    </Table.Summary.Row>
                  )
                }}
              />
            )}
          </Card>

          {/* Formula explanation */}
          <Card size="small" style={{ marginTop: 16, background: '#fafafa' }}>
            <Text type="secondary">
              池點數分配後，會疊加到專案總分計算中：有效總分 = 專案總分（公式） + 池點數 |
              成員分數 = 有效總分 × 年度攤分比例 × 貢獻比例 |
              池點數與公式分數一樣，經過保固攤分和貢獻比例分配
            </Text>
          </Card>
        </Card>
      </div>

      {/* Setup Pool Modal */}
      <Modal
        title={`設定 ${year} 年度點數池`}
        open={setupModalOpen}
        forceRender
        onCancel={() => setSetupModalOpen(false)}
        onOk={handleSetupPool}
        confirmLoading={setupSaving}
        okText="確認"
        cancelText="取消"
      >
        <Form form={setupForm} layout="vertical">
          <Form.Item
            name="totalPoints"
            label="總點數"
            rules={[{ required: true, message: '請輸入總點數' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              precision={2}
              placeholder={`預設 ${DEFAULT_CREDIT_POOL_SIZE}`}
            />
          </Form.Item>
          <Form.Item name="description" label="說明（選填）">
            <Input.TextArea rows={3} placeholder="例如：2026 年度額外獎勵點數" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Allocation Modal */}
      <Modal
        title="新增點數分配"
        open={allocModalOpen}
        forceRender
        onCancel={() => setAllocModalOpen(false)}
        onOk={handleAllocate}
        confirmLoading={allocSaving}
        okText="分配"
        cancelText="取消"
      >
        <Form form={allocForm} layout="vertical">
          <Form.Item
            name="evalId"
            label="選擇專案"
            rules={[{ required: true, message: '請選擇專案' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="搜尋專案名稱"
              options={evalOptions.map(e => ({
                value: e.evalId,
                label: `${e.projectName} (${e.partnerName}) - 公式分 ${e.totalScore.toFixed(2)}`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="points"
            label={`分配點數（剩餘 ${(pool?.remainingPoints ?? 0).toFixed(2)}）`}
            rules={[
              { required: true, message: '請輸入點數' },
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0.01}
              max={pool?.remainingPoints ?? 0}
              precision={2}
              placeholder="輸入分配點數"
            />
          </Form.Item>
          <Form.Item
            name="reason"
            label="原因（必填，審計用）"
            rules={[{ required: true, message: '請填寫分配原因' }]}
          >
            <Input.TextArea rows={3} placeholder="例如：專案表現優異，額外獎勵" />
          </Form.Item>
        </Form>
      </Modal>
    </AppLayout>
  )
}
