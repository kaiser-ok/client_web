'use client'

import { useState } from 'react'
import { Card, Tag, Space, Typography, Avatar, Button, Popconfirm, Modal, Form, Input, DatePicker, App } from 'antd'
import {
  FileTextOutlined,
  EditOutlined,
  TeamOutlined,
  MessageOutlined,
  MailOutlined,
  FileOutlined,
  PhoneOutlined,
  LinkOutlined,
  SlackOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  AccountBookOutlined,
} from '@ant-design/icons'
import { Activity } from '@/types/activity'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'

dayjs.extend(relativeTime)
dayjs.locale('zh-tw')

const { Text, Paragraph, Title } = Typography
const { TextArea } = Input

interface ActivityCardProps {
  activity: Activity
  isAdmin?: boolean
  onDeleted?: () => void
  onUpdated?: () => void
}

const sourceConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  JIRA: { icon: <FileTextOutlined />, color: '#0052CC', label: 'Jira' },
  MANUAL: { icon: <EditOutlined />, color: '#52c41a', label: '手動輸入' },
  MEETING: { icon: <TeamOutlined />, color: '#722ed1', label: '會議' },
  LINE: { icon: <MessageOutlined />, color: '#00B900', label: 'LINE' },
  EMAIL: { icon: <MailOutlined />, color: '#1890ff', label: 'Email' },
  DOC: { icon: <FileOutlined />, color: '#faad14', label: '文件' },
  PHONE: { icon: <PhoneOutlined />, color: '#13c2c2', label: '電話' },
  SLACK: { icon: <SlackOutlined />, color: '#4A154B', label: 'Slack 彙整' },
  ERP: { icon: <AccountBookOutlined />, color: '#eb2f96', label: 'ERP 發票' },
}

export default function ActivityCard({ activity, isAdmin, onDeleted, onUpdated }: ActivityCardProps) {
  const config = sourceConfig[activity.source] || sourceConfig.MANUAL
  const { message } = App.useApp()
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [form] = Form.useForm()

  // Check if this is a future event
  const today = dayjs().startOf('day')
  const hasFutureEventDate = activity.eventDate && dayjs(activity.eventDate).isAfter(today)
  const isToday = activity.eventDate && dayjs(activity.eventDate).isSame(today, 'day')

  // 計算顯示時間：SLACK 來源優先使用 slackTimestamp
  const getDisplayTime = () => {
    if (activity.source === 'SLACK' && activity.slackTimestamp) {
      // slackTimestamp 格式為 "秒數.微秒" 或已格式化的時間字串
      const ts = activity.slackTimestamp
      if (ts.includes('.') && !ts.includes('-') && !ts.includes(':')) {
        // Slack 格式：1234567890.123456
        return dayjs(parseFloat(ts) * 1000)
      }
      // 已經是可解析的時間格式
      return dayjs(ts)
    }
    return dayjs(activity.createdAt)
  }
  const displayTime = getDisplayTime()

  const handleEdit = () => {
    form.setFieldsValue({
      title: activity.title,
      content: activity.content || '',
      tags: activity.tags?.join(', ') || '',
      eventDate: activity.eventDate ? dayjs(activity.eventDate) : null,
    })
    setEditModalOpen(true)
  }

  const handleUpdate = async (values: { title: string; content: string; tags: string; eventDate: dayjs.Dayjs | null }) => {
    try {
      const response = await fetch('/api/activities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activity.id,
          title: values.title,
          content: values.content || null,
          tags: values.tags ? values.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          eventDate: values.eventDate?.toISOString() || null,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '更新失敗')
      }

      message.success('活動已更新')
      setEditModalOpen(false)
      onUpdated?.()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新失敗')
    }
  }

  const handleDelete = async () => {
    try {
      setDeleting(true)
      const response = await fetch(`/api/activities?id=${activity.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '刪除失敗')
      }

      message.success('活動已刪除')
      onDeleted?.()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '刪除失敗')
    } finally {
      setDeleting(false)
    }
  }

  // Card style for future/today events
  const getCardStyle = () => {
    if (isToday) {
      return {
        marginBottom: 12,
        borderLeft: '4px solid #ff4d4f',
        background: '#fff1f0',
      }
    }
    if (hasFutureEventDate) {
      return {
        marginBottom: 12,
        borderLeft: '4px solid #1890ff',
        background: '#e6f7ff',
      }
    }
    return { marginBottom: 12 }
  }

  return (
    <>
      <Card size="small" style={getCardStyle()}>
        <div style={{ display: 'flex', gap: 12 }}>
          {/* Source Icon */}
          <Avatar
            icon={config.icon}
            style={{ backgroundColor: config.color, flexShrink: 0 }}
          />

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <Space size={4}>
                <Tag color={config.color}>{config.label}</Tag>
                {/* 只有 JIRA source 才顯示 Jira 連結，EMAIL 的 jiraKey 是 messageId 用於去重 */}
                {activity.jiraKey && activity.source === 'JIRA' && (
                  <Tag
                    color="blue"
                    icon={<LinkOutlined />}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      const jiraHost = process.env.NEXT_PUBLIC_JIRA_HOST || 'https://your-domain.atlassian.net'
                      window.open(`${jiraHost}/browse/${activity.jiraKey}`, '_blank')
                    }}
                  >
                    {activity.jiraKey}
                  </Tag>
                )}
              </Space>
              <Space size={4}>
                <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
                  {displayTime.fromNow()}
                </Text>
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={handleEdit}
                  title="編輯"
                />
                {/* SLACK 活動所有人都可刪除，其他活動僅管理員可刪除 */}
                {(isAdmin || activity.source === 'SLACK') && (
                  <Popconfirm
                    title="確定要刪除此活動？"
                    description={activity.source === 'SLACK' ? '刪除的紀錄將用於優化 LLM' : '刪除後無法復原'}
                    onConfirm={handleDelete}
                    okText="刪除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      loading={deleting}
                      title="刪除"
                    />
                  </Popconfirm>
                )}
              </Space>
            </div>

            {/* Title */}
            <Title level={5} style={{ margin: '4px 0 8px 0', fontSize: 14 }}>
              {activity.title}
            </Title>

            {/* Content */}
            {activity.content && (
              <Paragraph
                ellipsis={{ rows: 3, expandable: true, symbol: '展開' }}
                style={{ marginBottom: 8, color: '#666' }}
              >
                {activity.content}
              </Paragraph>
            )}

            {/* Event Date */}
            {activity.eventDate && (
              <div style={{ marginBottom: 8 }}>
                <Tag
                  icon={<CalendarOutlined />}
                  color={isToday ? 'red' : hasFutureEventDate ? 'blue' : 'default'}
                >
                  {isToday ? '今日' : hasFutureEventDate ? '即將' : '已過'}：{dayjs(activity.eventDate).format('YYYY-MM-DD')}
                </Tag>
              </div>
            )}

            {/* Tags */}
            {activity.tags && activity.tags.length > 0 && (
              <Space wrap size={[4, 4]} style={{ marginBottom: 8 }}>
                {activity.tags.map((tag, index) => (
                  <Tag key={index}>#{tag}</Tag>
                ))}
              </Space>
            )}

            {/* Footer */}
            <Space size={8}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {activity.createdBy} · {displayTime.format('YYYY-MM-DD HH:mm')}
              </Text>
            </Space>
          </div>
        </div>
      </Card>

      {/* Edit Modal */}
      <Modal
        title="編輯活動"
        open={editModalOpen}
        forceRender
        onCancel={() => {
          setEditModalOpen(false)
          form.resetFields()
        }}
        onOk={() => form.submit()}
        okText="儲存"
        cancelText="取消"
        destroyOnHidden={false}
      >
        <Form form={form} layout="vertical" onFinish={handleUpdate} preserve={false}>
          <Form.Item
            name="title"
            label="標題"
            rules={[{ required: true, message: '請輸入標題' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="content" label="內容">
            <TextArea rows={4} />
          </Form.Item>
          <Form.Item name="tags" label="標籤" extra="多個標籤請用逗號分隔">
            <Input placeholder="例如：重要, 待追蹤" />
          </Form.Item>
          <Form.Item name="eventDate" label="預計日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
