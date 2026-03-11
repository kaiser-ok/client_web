'use client'

import { useState } from 'react'
import { Card, Tag, Typography, Input, Button, Space, message, Tooltip } from 'antd'
import { SendOutlined, SwapOutlined, ExportOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'

const { Text } = Typography
const { TextArea } = Input

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

interface Transition {
  id: string
  name: string
}

interface IssueCardProps {
  issue: JiraIssue
  color: string
  onUpdated?: () => void
}

export default function IssueCard({ issue, color, onUpdated }: IssueCardProps) {
  const [showReply, setShowReply] = useState(false)
  const [showStatus, setShowStatus] = useState(false)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [transitions, setTransitions] = useState<Transition[]>([])
  const [loadingTransitions, setLoadingTransitions] = useState(false)

  const handleAddComment = async () => {
    if (!comment.trim()) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/jira/issues/${issue.key}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ body: comment }),
      })

      if (res.ok) {
        message.success('回覆已新增')
        setComment('')
        setShowReply(false)
        onUpdated?.()
      } else {
        message.error('新增回覆失敗')
      }
    } catch (error) {
      console.error('Error adding comment:', error)
      message.error('新增回覆失敗')
    } finally {
      setSubmitting(false)
    }
  }

  const loadTransitions = async () => {
    if (transitions.length > 0) {
      setShowStatus(true)
      return
    }

    setLoadingTransitions(true)
    try {
      const res = await fetch(`/api/jira/issues/${issue.key}/transitions`, {
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setTransitions(data.transitions || [])
        setShowStatus(true)
      }
    } catch (error) {
      console.error('Error loading transitions:', error)
      message.error('載入狀態失敗')
    } finally {
      setLoadingTransitions(false)
    }
  }

  const handleTransition = async (transitionId: string) => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/jira/issues/${issue.key}/transitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ transitionId }),
      })

      if (res.ok) {
        message.success('狀態已更新')
        setShowStatus(false)
        onUpdated?.()
      } else {
        const data = await res.json()
        message.error(data.error || '更新狀態失敗')
      }
    } catch (error) {
      console.error('Error transitioning issue:', error)
      message.error('更新狀態失敗')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card
      size="small"
      style={{ marginBottom: 12 }}
      title={
        <Space>
          <a
            href={`https://gentrice.atlassian.net/browse/${issue.key}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {issue.key} <ExportOutlined style={{ fontSize: 12 }} />
          </a>
        </Space>
      }
      extra={
        <Space size="small">
          <Tooltip title="回覆">
            <Button
              type="text"
              size="small"
              icon={<SendOutlined />}
              onClick={() => setShowReply(!showReply)}
            />
          </Tooltip>
          <Tooltip title="變更狀態">
            <Button
              type="text"
              size="small"
              icon={<SwapOutlined />}
              loading={loadingTransitions}
              onClick={loadTransitions}
            />
          </Tooltip>
        </Space>
      }
    >
      <div style={{ marginBottom: 8 }}>
        <Text strong>{issue.fields.summary}</Text>
      </div>

      <Space wrap size="small">
        <Tag color={color}>{issue.fields.status.name}</Tag>
        {issue.fields.priority && <Tag>{issue.fields.priority.name}</Tag>}
        {issue.fields.assignee && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {issue.fields.assignee.displayName}
          </Text>
        )}
        <Text type="secondary" style={{ fontSize: 12 }}>
          {dayjs(issue.fields.updated).fromNow()}
        </Text>
      </Space>

      {showStatus && transitions.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
            變更狀態為：
          </Text>
          <Space wrap>
            {transitions.map((t) => (
              <Button
                key={t.id}
                size="small"
                loading={submitting}
                onClick={() => handleTransition(t.id)}
              >
                {t.name}
              </Button>
            ))}
            <Button size="small" type="text" onClick={() => setShowStatus(false)}>
              取消
            </Button>
          </Space>
        </div>
      )}

      {showReply && (
        <div style={{ marginTop: 12 }}>
          <TextArea
            rows={3}
            placeholder="輸入回覆內容..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <Space>
            <Button
              type="primary"
              size="small"
              loading={submitting}
              onClick={handleAddComment}
              disabled={!comment.trim()}
            >
              送出
            </Button>
            <Button size="small" onClick={() => setShowReply(false)}>
              取消
            </Button>
          </Space>
        </div>
      )}
    </Card>
  )
}
