'use client'

import { useState } from 'react'
import {
  Drawer,
  Button,
  Space,
  Typography,
  Divider,
  Form,
  Input,
  Select,
  DatePicker,
  message,
  List,
  Tag,
} from 'antd'
import {
  LinkOutlined,
  CopyOutlined,
  MessageOutlined,
} from '@ant-design/icons'
import WaitingOnSelect from '@/components/common/WaitingOnSelect'
import StatusBadge from '@/components/common/StatusBadge'
import PriorityBadge from '@/components/common/PriorityBadge'
import { WaitingOnTag } from '@/components/common/WaitingOnSelect'
import { REPLY_SOURCES, WaitingOnType } from '@/constants/waiting-on'
import { updateOpenItem, replyToOpenItem } from '@/hooks/useOpenItems'
import { OpenItem } from '@/types/open-item'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'

dayjs.extend(relativeTime)
dayjs.locale('zh-tw')

const { Text, Title, Paragraph } = Typography
const { TextArea } = Input

interface BottomSheetProps {
  open: boolean
  openItem: OpenItem | null
  onClose: () => void
  onUpdate: () => void
}

export default function BottomSheet({
  open,
  openItem,
  onClose,
  onUpdate,
}: BottomSheetProps) {
  const [form] = Form.useForm()
  const [replyForm] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [showReply, setShowReply] = useState(false)

  const handleUpdate = async (values: Record<string, unknown>) => {
    if (!openItem) return

    setLoading(true)
    try {
      await updateOpenItem(openItem.id, {
        waitingOn: values.waitingOn as WaitingOnType | null,
        nextAction: values.nextAction as string,
        dueDate: values.dueDate ? (values.dueDate as dayjs.Dayjs).toDate() : null,
      })
      message.success('已更新')
      onUpdate()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新失敗')
    } finally {
      setLoading(false)
    }
  }

  const handleReply = async (values: Record<string, unknown>) => {
    if (!openItem) return

    setLoading(true)
    try {
      await replyToOpenItem(openItem.id, {
        content: values.content as string,
        source: values.source as string,
      })
      message.success('回覆已送出')
      replyForm.resetFields()
      setShowReply(false)
      onUpdate()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '回覆失敗')
    } finally {
      setLoading(false)
    }
  }

  const copyKey = () => {
    if (openItem) {
      navigator.clipboard.writeText(openItem.jiraKey)
      message.success('已複製')
    }
  }

  const openInJira = () => {
    if (openItem) {
      const jiraHost = process.env.NEXT_PUBLIC_JIRA_HOST || 'https://your-domain.atlassian.net'
      window.open(`${jiraHost}/browse/${openItem.jiraKey}`, '_blank')
    }
  }

  if (!openItem) return null

  return (
    <Drawer
      title={openItem.jiraKey}
      placement="bottom"
      open={open}
      onClose={onClose}
      height="85%"
      extra={
        <Space>
          <Button icon={<CopyOutlined />} onClick={copyKey} size="small">
            複製
          </Button>
          <Button icon={<LinkOutlined />} onClick={openInJira} size="small">
            開啟 Jira
          </Button>
        </Space>
      }
    >
      {/* Issue Summary */}
      <Title level={5} style={{ marginTop: 0 }}>{openItem.summary}</Title>

      <Space wrap style={{ marginBottom: 16 }}>
        <StatusBadge status={openItem.status} />
        <PriorityBadge priority={openItem.priority} />
        <WaitingOnTag value={openItem.waitingOn} />
      </Space>

      {/* Meta Info */}
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary">
          負責人：{openItem.assignee || '-'} · 更新於 {dayjs(openItem.jiraUpdated).fromNow()}
        </Text>
      </div>

      {/* Next Action */}
      {openItem.nextAction && (
        <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
          <Text strong>下一步：</Text>
          <Paragraph style={{ marginBottom: 0, marginTop: 4 }}>
            {openItem.nextAction}
          </Paragraph>
        </div>
      )}

      {/* Last Reply */}
      {openItem.lastReply && (
        <div style={{ marginBottom: 16 }}>
          <Text strong>最後回覆：</Text>
          <div style={{ padding: 12, background: '#fafafa', borderRadius: 8, marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {openItem.lastReplyBy} · {dayjs(openItem.lastReplyAt).fromNow()}
            </Text>
            <Paragraph style={{ marginBottom: 0, marginTop: 4 }}>
              {openItem.lastReply}
            </Paragraph>
          </div>
        </div>
      )}

      <Divider />

      {/* Quick Reply */}
      {showReply ? (
        <Form form={replyForm} onFinish={handleReply} layout="vertical">
          <Form.Item
            name="content"
            rules={[{ required: true, message: '請輸入回覆' }]}
          >
            <TextArea rows={3} placeholder="輸入回覆..." />
          </Form.Item>
          <Form.Item name="source">
            <Select
              placeholder="來源（選填）"
              allowClear
              options={REPLY_SOURCES.map(s => ({ value: s.value, label: s.label }))}
            />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={loading}>
              送出
            </Button>
            <Button onClick={() => setShowReply(false)}>取消</Button>
          </Space>
        </Form>
      ) : (
        <Button
          icon={<MessageOutlined />}
          onClick={() => setShowReply(true)}
          block
          style={{ marginBottom: 16 }}
        >
          新增回覆
        </Button>
      )}

      <Divider>編輯資訊</Divider>

      {/* Edit Form */}
      <Form
        form={form}
        onFinish={handleUpdate}
        layout="vertical"
        initialValues={{
          waitingOn: openItem.waitingOn,
          nextAction: openItem.nextAction,
          dueDate: openItem.dueDate ? dayjs(openItem.dueDate) : undefined,
        }}
      >
        <Form.Item name="waitingOn" label="等待誰">
          <WaitingOnSelect style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="nextAction" label="下一步">
          <Input placeholder="下一步行動..." maxLength={80} />
        </Form.Item>
        <Form.Item name="dueDate" label="到期日">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={loading} block>
          儲存變更
        </Button>
      </Form>
    </Drawer>
  )
}
