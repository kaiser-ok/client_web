'use client'

import { Card, Space, Typography, Button, Tag } from 'antd'
import { MessageOutlined, MoreOutlined } from '@ant-design/icons'
import StatusBadge from '@/components/common/StatusBadge'
import PriorityBadge from '@/components/common/PriorityBadge'
import { WaitingOnTag } from '@/components/common/WaitingOnSelect'
import { OpenItem } from '@/types/open-item'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'

dayjs.extend(relativeTime)
dayjs.locale('zh-tw')

const { Text, Paragraph } = Typography

interface OpenItemsCardProps {
  item: OpenItem
  onReply: () => void
  onMore: () => void
}

export default function OpenItemsCard({ item, onReply, onMore }: OpenItemsCardProps) {
  const isOverdue = item.dueDate && new Date(item.dueDate) < new Date()

  return (
    <Card
      size="small"
      style={{ marginBottom: 12 }}
      actions={[
        <Button
          key="reply"
          type="text"
          icon={<MessageOutlined />}
          onClick={onReply}
        >
          回覆
        </Button>,
        <Button
          key="more"
          type="text"
          icon={<MoreOutlined />}
          onClick={onMore}
        >
          更多
        </Button>,
      ]}
    >
      {/* Line 1: Key + Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text strong style={{ color: '#1890ff' }}>{item.jiraKey}</Text>
        <StatusBadge status={item.status} />
      </div>

      {/* Line 2: Summary */}
      <Paragraph
        ellipsis={{ rows: 2 }}
        style={{ marginBottom: 8, fontWeight: 500 }}
      >
        {item.summary}
      </Paragraph>

      {/* Meta line */}
      <Space wrap size={[8, 4]} style={{ marginBottom: 8 }}>
        <PriorityBadge priority={item.priority} />
        {item.assignee && <Text type="secondary">{item.assignee}</Text>}
        <WaitingOnTag value={item.waitingOn} />
        <Text type="secondary">{dayjs(item.jiraUpdated).fromNow()}</Text>
        {isOverdue && <Tag color="error">逾期</Tag>}
      </Space>

      {/* Next Action */}
      {item.nextAction && (
        <div style={{
          padding: '8px 12px',
          background: '#f0f5ff',
          borderRadius: 6,
          marginBottom: 8,
        }}>
          <Text type="secondary" style={{ fontSize: 12 }}>下一步：</Text>
          <Paragraph ellipsis={{ rows: 1 }} style={{ marginBottom: 0, fontSize: 13 }}>
            {item.nextAction}
          </Paragraph>
        </div>
      )}

      {/* Last Reply */}
      {item.lastReply && (
        <div style={{
          padding: '8px 12px',
          background: '#fafafa',
          borderRadius: 6,
        }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {item.lastReplyBy} · {dayjs(item.lastReplyAt).fromNow()}
          </Text>
          <Paragraph ellipsis={{ rows: 1 }} style={{ marginBottom: 0, fontSize: 13 }}>
            {item.lastReply}
          </Paragraph>
        </div>
      )}
    </Card>
  )
}
