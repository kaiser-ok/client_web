'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Row, Col, Card, Statistic, Typography, Button, Spin, Empty, Modal, Tag } from 'antd'
import {
  TeamOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  SyncOutlined,
  FileProtectOutlined,
} from '@ant-design/icons'
import AppLayout from '@/components/layout/AppLayout'
import IssueCard from '@/components/dashboard/IssueCard'
import Link from 'next/link'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'

dayjs.extend(relativeTime)
dayjs.locale('zh-tw')

const { Title, Text } = Typography

interface DashboardStats {
  customerCount: number
  pendingIssues: number
  waitingCustomer: number
  overdueIssues: number
  expiringContracts: number
  syncedAt: string
}

interface Activity {
  id: string
  title: string
  content?: string
  source: string
  createdAt: string
  customer?: {
    name: string
  }
}

interface JiraIssue {
  key: string
  fields: {
    summary: string
    status: {
      name: string
    }
    priority?: {
      name: string
    }
    assignee?: {
      displayName: string
    }
    updated: string
  }
}

type IssueType = 'pending' | 'waiting' | 'overdue'

const ISSUE_TYPE_CONFIG: Record<IssueType, { title: string; color: string }> = {
  pending: { title: '待處理問題', color: '#1890ff' },
  waiting: { title: '等待客戶回覆', color: '#faad14' },
  overdue: { title: '逾期問題', color: '#ff4d4f' },
}

interface ExpiringContract {
  id: string
  name: string
  endDate: string
  customer?: {
    id: string
    name: string
  }
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalType, setModalType] = useState<IssueType>('pending')
  const [issues, setIssues] = useState<JiraIssue[]>([])
  const [loadingIssues, setLoadingIssues] = useState(false)
  const [hasUpdates, setHasUpdates] = useState(false)
  const lastSyncRef = useRef<number>(0)
  const [contractsModalOpen, setContractsModalOpen] = useState(false)
  const [expiringContracts, setExpiringContracts] = useState<ExpiringContract[]>([])
  const [loadingContracts, setLoadingContracts] = useState(false)

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/dashboard/stats', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const fetchActivities = async () => {
    try {
      const res = await fetch('/api/activities?limit=10', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setActivities(data.activities || [])
      }
    } catch (error) {
      console.error('Error fetching activities:', error)
    }
  }

  const syncStats = useCallback(async (force = false) => {
    // Prevent syncing too frequently (minimum 1 minute between syncs)
    const now = Date.now()
    if (!force && now - lastSyncRef.current < 60000) {
      return
    }

    setSyncing(true)
    lastSyncRef.current = now
    try {
      const res = await fetch('/api/dashboard/sync?force=true', {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Error syncing stats:', error)
    } finally {
      setSyncing(false)
    }
  }, [])

  const openIssuesModal = async (type: IssueType) => {
    setModalType(type)
    setModalOpen(true)
    setLoadingIssues(true)
    try {
      const res = await fetch(`/api/dashboard/issues?type=${type}`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setIssues(data.issues || [])
      }
    } catch (error) {
      console.error('Error fetching issues:', error)
    } finally {
      setLoadingIssues(false)
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      // First fetch cached stats to check last sync time
      const statsRes = await fetch('/api/dashboard/stats', { credentials: 'include' })
      if (statsRes.ok) {
        const cachedStats = await statsRes.json()
        const syncedAt = new Date(cachedStats.syncedAt).getTime()
        const oneMinuteAgo = Date.now() - 60 * 1000

        if (syncedAt > oneMinuteAgo) {
          // Within 1 minute, use cached data
          setStats(cachedStats)
        } else {
          // Older than 1 minute, sync from Jira
          const syncRes = await fetch('/api/dashboard/sync?force=true', {
            method: 'POST',
            credentials: 'include'
          })
          if (syncRes.ok) {
            const newStats = await syncRes.json()
            setStats(newStats)
          }
        }
      }
      await fetchActivities()
      setLoading(false)
    }
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto sync if stats are stale (older than 1 hour)
  useEffect(() => {
    if (stats && !syncing) {
      const syncedAt = new Date(stats.syncedAt).getTime()
      const hourAgo = Date.now() - 60 * 60 * 1000
      if (syncedAt < hourAgo) {
        syncStats()
      }
    }
  }, [stats])

  // Refresh stats when page becomes visible (user returns to tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncStats()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [syncStats])

  // Handle modal close - sync if there were updates
  const handleModalClose = useCallback(() => {
    setModalOpen(false)
    if (hasUpdates) {
      syncStats(true) // Force sync after updates
      setHasUpdates(false)
    }
  }, [hasUpdates, syncStats])

  // Called when an issue is updated in the modal
  const handleIssueUpdated = useCallback(() => {
    setHasUpdates(true)
    // Refresh the issues list
    fetch(`/api/dashboard/issues?type=${modalType}`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => setIssues(data.issues || []))
      .catch(err => console.error('Error refreshing issues:', err))
  }, [modalType])

  const openContractsModal = async () => {
    setContractsModalOpen(true)
    setLoadingContracts(true)
    try {
      const res = await fetch('/api/dashboard/expiring-contracts', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setExpiringContracts(data.contracts || [])
      }
    } catch (error) {
      console.error('Error fetching expiring contracts:', error)
    } finally {
      setLoadingContracts(false)
    }
  }

  const getSourceLabel = (source: string) => {
    const labels: Record<string, string> = {
      JIRA: 'Jira',
      MANUAL: '手動',
      MEETING: '會議',
      LINE: 'LINE',
      EMAIL: 'Email',
      DOC: '文件',
    }
    return labels[source] || source
  }

  return (
    <AppLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>
          儀表板
        </Title>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {stats && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              更新於 {dayjs(stats.syncedAt).fromNow()}
            </Text>
          )}
          <Button
            icon={<SyncOutlined spin={syncing} />}
            onClick={() => syncStats()}
            loading={syncing}
            size="small"
          >
            同步
          </Button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={12} sm={12} md={6}>
              <Card>
                <Statistic
                  title="客戶總數"
                  value={stats?.customerCount || 0}
                  prefix={<TeamOutlined />}
                />
              </Card>
            </Col>
            <Col xs={12} sm={12} md={6}>
              <Card
                hoverable
                style={{ cursor: 'pointer' }}
                onClick={() => stats?.pendingIssues && openIssuesModal('pending')}
              >
                <Statistic
                  title="待處理問題"
                  value={stats?.pendingIssues || 0}
                  prefix={<FileTextOutlined />}
                  styles={{ content: { color: '#1890ff' } }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={12} md={6}>
              <Card
                hoverable
                style={{ cursor: 'pointer' }}
                onClick={() => stats?.waitingCustomer && openIssuesModal('waiting')}
              >
                <Statistic
                  title="等待客戶回覆"
                  value={stats?.waitingCustomer || 0}
                  prefix={<ClockCircleOutlined />}
                  styles={{ content: { color: '#faad14' } }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={12} md={6}>
              <Card
                hoverable
                style={{ cursor: 'pointer' }}
                onClick={() => stats?.overdueIssues && openIssuesModal('overdue')}
              >
                <Statistic
                  title="逾期問題"
                  value={stats?.overdueIssues || 0}
                  prefix={<WarningOutlined />}
                  styles={{ content: { color: '#ff4d4f' } }}
                />
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} md={12}>
              <Card
                hoverable
                style={{ cursor: 'pointer' }}
                onClick={() => stats?.expiringContracts && openContractsModal()}
              >
                <Statistic
                  title="即將到期合約 (30天內)"
                  value={stats?.expiringContracts || 0}
                  prefix={<FileProtectOutlined />}
                  styles={{ content: { color: stats?.expiringContracts ? '#fa8c16' : undefined } }}
                />
              </Card>
            </Col>
          </Row>

          <Card style={{ marginTop: 24 }}>
            <Title level={5}>最近活動</Title>
            {activities.length === 0 ? (
              <Empty
                description="尚無活動記錄"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ) : (
              <div>
                {activities.map((activity) => (
                  <div
                    key={activity.id}
                    style={{
                      padding: '12px 0',
                      borderBottom: '1px solid #f0f0f0',
                    }}
                  >
                    <div>
                      <Text>{activity.title}</Text>
                      {activity.customer && (
                        <Text type="secondary" style={{ marginLeft: 8 }}>
                          - {activity.customer.name}
                        </Text>
                      )}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {getSourceLabel(activity.source)} · {dayjs(activity.createdAt).fromNow()}
                    </Text>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      <Modal
        title={ISSUE_TYPE_CONFIG[modalType].title}
        open={modalOpen}
        onCancel={handleModalClose}
        footer={null}
        width={700}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        {loadingIssues ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : issues.length === 0 ? (
          <Empty description="沒有問題" />
        ) : (
          <div>
            {issues.map((issue) => (
              <IssueCard
                key={issue.key}
                issue={issue}
                color={ISSUE_TYPE_CONFIG[modalType].color}
                onUpdated={handleIssueUpdated}
              />
            ))}
          </div>
        )}
      </Modal>

      <Modal
        title="即將到期合約 (30天內)"
        open={contractsModalOpen}
        onCancel={() => setContractsModalOpen(false)}
        footer={null}
        width={600}
      >
        {loadingContracts ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : expiringContracts.length === 0 ? (
          <Empty description="沒有即將到期的合約" />
        ) : (
          <div>
            {expiringContracts.map((contract) => (
              <div
                key={contract.id}
                style={{
                  padding: '12px 0',
                  borderBottom: '1px solid #f0f0f0',
                }}
              >
                <div style={{ marginBottom: 4 }}>
                  {contract.customer ? (
                    <Link href={`/customers/${contract.customer.id}`}>
                      {contract.name}
                    </Link>
                  ) : (
                    <Text>{contract.name}</Text>
                  )}
                </div>
                <div>
                  {contract.customer && (
                    <Text type="secondary">客戶：{contract.customer.name}</Text>
                  )}
                  <br />
                  <Tag color="orange">
                    到期日：{dayjs(contract.endDate).format('YYYY-MM-DD')}
                  </Tag>
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    ({dayjs(contract.endDate).fromNow()})
                  </Text>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </AppLayout>
  )
}
