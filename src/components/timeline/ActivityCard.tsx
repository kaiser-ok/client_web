'use client'

import { Card, Tag, Space, Typography, Avatar } from 'antd'
import {
  FileTextOutlined,
  EditOutlined,
  TeamOutlined,
  MessageOutlined,
  MailOutlined,
  FileOutlined,
  PhoneOutlined,
  LinkOutlined,
} from '@ant-design/icons'
import { Activity } from '@/types/activity'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'

dayjs.extend(relativeTime)
dayjs.locale('zh-tw')

const { Text, Paragraph, Title } = Typography

interface ActivityCardProps {
  activity: Activity
}

const sourceConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  JIRA: { icon: <FileTextOutlined />, color: '#0052CC', label: 'Jira' },
  MANUAL: { icon: <EditOutlined />, color: '#52c41a', label: '手動輸入' },
  MEETING: { icon: <TeamOutlined />, color: '#722ed1', label: '會議' },
  LINE: { icon: <MessageOutlined />, color: '#00B900', label: 'LINE' },
  EMAIL: { icon: <MailOutlined />, color: '#1890ff', label: 'Email' },
  DOC: { icon: <FileOutlined />, color: '#faad14', label: '文件' },
  PHONE: { icon: <PhoneOutlined />, color: '#13c2c2', label: '電話' },
}

export default function ActivityCard({ activity }: ActivityCardProps) {
  const config = sourceConfig[activity.source] || sourceConfig.MANUAL

  return (
    <Card size="small" style={{ marginBottom: 12 }}>
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
              {activity.jiraKey && (
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
            <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
              {dayjs(activity.createdAt).fromNow()}
            </Text>
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

          {/* Tags */}
          {activity.tags && activity.tags.length > 0 && (
            <Space wrap size={[4, 4]} style={{ marginBottom: 8 }}>
              {activity.tags.map((tag, index) => (
                <Tag key={index}>#{tag}</Tag>
              ))}
            </Space>
          )}

          {/* Footer */}
          <Text type="secondary" style={{ fontSize: 12 }}>
            {activity.createdBy} · {dayjs(activity.createdAt).format('YYYY-MM-DD HH:mm')}
          </Text>
        </div>
      </div>
    </Card>
  )
}
