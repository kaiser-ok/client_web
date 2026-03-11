'use client'

import { useEffect, useState } from 'react'
import { Spin, Empty, Typography, Avatar, Space, Tooltip } from 'antd'
import { UserOutlined, MessageOutlined } from '@ant-design/icons'
import dynamic from 'next/dynamic'
import dayjs from '@/lib/dayjs'

const Column = dynamic(
  () => import('@ant-design/plots').then(mod => mod.Column),
  { ssr: false }
)
const Heatmap = dynamic(
  () => import('@ant-design/plots').then(mod => mod.Heatmap),
  { ssr: false }
)

const { Text, Title } = Typography

interface UserStat {
  userId: string
  displayName: string
  pictureUrl: string | null
  count: number
  hourly: { hour: string; count: number }[]
  weekday: { day: string; count: number }[]
  firstMessage: string
  lastMessage: string
}

interface ChannelStats {
  channelName: string
  totalMessages: number
  daily: { date: string; count: number }[]
  hourly: { hour: string; count: number }[]
  weekday: { day: string; count: number }[]
  monthly: { month: string; count: number }[]
  users: UserStat[]
}

interface LineActivityStatsProps {
  channelId: string
}

export default function LineActivityStats({ channelId }: LineActivityStatsProps) {
  const [stats, setStats] = useState<ChannelStats | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/line/channels/${channelId}/stats`)
        if (res.ok) {
          setStats(await res.json())
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [channelId])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" />
        <div style={{ marginTop: 12 }}><Text type="secondary">載入活動統計中...</Text></div>
      </div>
    )
  }

  if (!stats || stats.totalMessages === 0) {
    return <Empty description="尚無訊息資料" />
  }

  // Transform daily data for heatmap: week (row) x weekday (column)
  const heatmapData = stats.daily.map(d => {
    const date = new Date(d.date)
    const weekday = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]
    // Week label: use ISO week-based grouping
    const weekStart = new Date(d.date)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    const weekLabel = weekStart.toISOString().slice(0, 10)
    return {
      week: weekLabel,
      day: weekday,
      date: d.date,
      count: d.count,
    }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <MessageOutlined />
          <Text strong>近 12 個月共 {stats.totalMessages.toLocaleString()} 則訊息</Text>
          <Text type="secondary">
            {stats.users.length} 位參與者
          </Text>
        </Space>
      </div>

      {/* Activity Heatmap */}
      <div>
        <Title level={5} style={{ marginBottom: 8 }}>訊息活動熱力圖</Title>
        <div style={{ height: 160, overflow: 'hidden' }}>
          <Heatmap
            data={heatmapData}
            xField="week"
            yField="day"
            colorField="count"
            mark="cell"
            scale={{
              color: {
                type: 'sequential',
                palette: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
              },
              y: {
                type: 'cat',
                domain: ['日', '一', '二', '三', '四', '五', '六'],
              },
            }}
            style={{
              inset: 1,
              radius: 2,
            }}
            axis={{
              x: {
                labelFormatter: (v: string) => {
                  const d = new Date(v)
                  if (d.getDate() <= 7) {
                    return `${d.getMonth() + 1}月`
                  }
                  return ''
                },
                tickFilter: (_: unknown, i: number) => i % 4 === 0,
              },
              y: { title: false },
            }}
            tooltip={{
              title: (d: Record<string, unknown>) => String(d['date'] || ''),
              items: [
                { field: 'count', name: '訊息數' },
              ],
            }}
            legend={false}
          />
        </div>
      </div>

      {/* Monthly Trend */}
      <div>
        <Title level={5} style={{ marginBottom: 8 }}>月度訊息趨勢</Title>
        <div style={{ height: 200 }}>
          <Column
            data={stats.monthly}
            xField="month"
            yField="count"
            axis={{
              x: {
                labelFormatter: (v: string) => {
                  const parts = v.split('-')
                  return `${parts[1]}月`
                },
              },
              y: { title: '訊息數' },
            }}
            tooltip={{
              title: (d: Record<string, unknown>) => `${d['month']}`,
              items: [{ field: 'count', name: '訊息數' }],
            }}
            style={{ fill: '#1890ff', radiusTopLeft: 4, radiusTopRight: 4 }}
          />
        </div>
      </div>

      {/* Per-user frequency */}
      <div>
        <Title level={5} style={{ marginBottom: 8 }}>
          <UserOutlined style={{ marginRight: 4 }} />
          發言頻率排行
        </Title>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stats.users.map((user, idx) => {
            const maxCount = stats.users[0]?.count || 1
            const pct = Math.round((user.count / maxCount) * 100)
            return (
              <div
                key={user.userId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: idx % 2 === 0 ? '#fafafa' : '#fff',
                  border: '1px solid transparent',
                }}
              >
                <Text type="secondary" style={{ width: 20, textAlign: 'right' }}>
                  {idx + 1}
                </Text>
                <Avatar
                  src={user.pictureUrl}
                  icon={<UserOutlined />}
                  size="small"
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <Text strong style={{ fontSize: 13 }}>{user.displayName}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {user.count.toLocaleString()} 則
                    </Text>
                  </div>
                  <div style={{ position: 'relative', height: 6, background: '#f0f0f0', borderRadius: 3 }}>
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        height: '100%',
                        width: `${pct}%`,
                        background: '#91caff',
                        borderRadius: 3,
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                </div>
                <Tooltip title={`${dayjs(user.firstMessage).format('YYYY-MM-DD')} ~ ${dayjs(user.lastMessage).format('YYYY-MM-DD')}`}>
                  <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                    {dayjs(user.lastMessage).fromNow()}
                  </Text>
                </Tooltip>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
