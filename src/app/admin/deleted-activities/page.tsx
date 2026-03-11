'use client'

import { useState, useEffect } from 'react'
import {
  Table,
  Card,
  Typography,
  Space,
  Tag,
  Button,
  Tooltip,
  Statistic,
  Row,
  Col,
  App,
  Empty,
} from 'antd'
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  CopyOutlined,
  SlackOutlined,
} from '@ant-design/icons'
import { useUser } from '@/hooks/useUser'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'

dayjs.extend(relativeTime)
dayjs.locale('zh-tw')

const { Title, Text, Paragraph } = Typography

interface DeletedActivity {
  id: string
  customerId: string
  customerName: string
  originalId: string
  title: string
  content: string | null
  tags: string[]
  slackTimestamp: string | null
  slackChannel: string | null
  createdBy: string
  originalCreatedAt: string
  deletedBy: string
  deletedAt: string
  reason: string | null
}

interface CustomerStat {
  customerName: string
  count: number
}

export default function DeletedActivitiesPage() {
  const { role, isLoading: userLoading, isAuthenticated } = useUser()
  const router = useRouter()
  const { message, modal } = App.useApp()
  const [records, setRecords] = useState<DeletedActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<CustomerStat[]>([])
  const [page, setPage] = useState(1)
  const pageSize = 20

  useEffect(() => {
    if (!userLoading && isAuthenticated && role !== 'ADMIN') {
      message.error('權限不足')
      router.push('/')
    }
  }, [role, userLoading, isAuthenticated, router, message])

  useEffect(() => {
    if (role === 'ADMIN') {
      fetchRecords()
    }
  }, [role, page])

  const fetchRecords = async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/admin/deleted-slack-activities?limit=${pageSize}&offset=${(page - 1) * pageSize}`,
        { credentials: 'include' }
      )
      if (!res.ok) throw new Error('載入失敗')
      const data = await res.json()
      setRecords(data.records)
      setTotal(data.total)
      setStats(data.stats)
    } catch (error) {
      message.error('載入刪除記錄失敗')
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    try {
      const res = await fetch('/api/admin/deleted-slack-activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'export' }),
      })

      if (!res.ok) throw new Error('匯出失敗')
      const data = await res.json()

      modal.info({
        title: 'LLM 優化提示文字',
        width: 700,
        content: (
          <div>
            <Paragraph type="secondary" style={{ marginBottom: 16 }}>
              共 {data.count} 筆被刪除的活動記錄。以下提示文字可加入 LLM prompt 中，讓模型避免產生類似的無效事件：
            </Paragraph>
            <pre style={{
              background: '#f5f5f5',
              padding: 16,
              borderRadius: 8,
              maxHeight: 400,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              fontSize: 12,
            }}>
              {data.promptText || '（尚無足夠資料）'}
            </pre>
            <Button
              icon={<CopyOutlined />}
              onClick={() => {
                navigator.clipboard.writeText(data.promptText || '')
                message.success('已複製到剪貼簿')
              }}
              style={{ marginTop: 8 }}
            >
              複製
            </Button>
          </div>
        ),
        okText: '關閉',
      })
    } catch (error) {
      message.error('匯出失敗')
    }
  }

  const columns: ColumnsType<DeletedActivity> = [
    {
      title: '客戶',
      dataIndex: 'customerName',
      key: 'customerName',
      width: 120,
      render: (name) => <Tag>{name}</Tag>,
    },
    {
      title: '原始標題',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (title, record) => (
        <Tooltip title={record.content || '無內容'}>
          <Text>{title}</Text>
        </Tooltip>
      ),
    },
    {
      title: '標籤',
      dataIndex: 'tags',
      key: 'tags',
      width: 150,
      render: (tags: string[]) => (
        <Space wrap size={[4, 4]}>
          {tags.slice(0, 3).map((tag, i) => (
            <Tag key={i} style={{ fontSize: 11 }}>{tag}</Tag>
          ))}
          {tags.length > 3 && <Tag>+{tags.length - 3}</Tag>}
        </Space>
      ),
    },
    {
      title: '原始時間',
      dataIndex: 'originalCreatedAt',
      key: 'originalCreatedAt',
      width: 140,
      render: (date) => dayjs(date).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '刪除者',
      dataIndex: 'deletedBy',
      key: 'deletedBy',
      width: 150,
      ellipsis: true,
    },
    {
      title: '刪除時間',
      dataIndex: 'deletedAt',
      key: 'deletedAt',
      width: 120,
      render: (date) => (
        <Tooltip title={dayjs(date).format('YYYY-MM-DD HH:mm')}>
          <span>{dayjs(date).fromNow()}</span>
        </Tooltip>
      ),
    },
    {
      title: '原因',
      dataIndex: 'reason',
      key: 'reason',
      width: 150,
      ellipsis: true,
      render: (reason) => reason || <Text type="secondary">未說明</Text>,
    },
  ]

  if (userLoading || role !== 'ADMIN') {
    return null
  }

  return (
    <AppLayout>
      <Space style={{ marginBottom: 16 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push('/admin/users')}
        >
          返回
        </Button>
        <Title level={4} style={{ margin: 0 }}>
          <SlackOutlined style={{ marginRight: 8 }} />
          刪除的 Slack 活動記錄
        </Title>
      </Space>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="總刪除數" value={total} />
          </Card>
        </Col>
        <Col span={18}>
          <Card size="small" title="按客戶統計（前 10）">
            {stats.length > 0 ? (
              <Space wrap>
                {stats.map((s) => (
                  <Tag key={s.customerName} color="blue">
                    {s.customerName}: {s.count}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Text type="secondary">尚無資料</Text>
            )}
          </Card>
        </Col>
      </Row>

      <Card
        title="刪除記錄"
        extra={
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExport}
            disabled={total === 0}
          >
            匯出 LLM 優化提示
          </Button>
        }
      >
        {records.length === 0 && !loading ? (
          <Empty description="尚無刪除記錄" />
        ) : (
          <Table
            columns={columns}
            dataSource={records}
            rowKey="id"
            loading={loading}
            pagination={{
              current: page,
              pageSize,
              total,
              onChange: setPage,
              showTotal: (t) => `共 ${t} 筆`,
            }}
            size="small"
            scroll={{ x: 900 }}
          />
        )}
      </Card>
    </AppLayout>
  )
}
