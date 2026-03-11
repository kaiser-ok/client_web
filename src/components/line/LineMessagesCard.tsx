'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Card,
  Button,
  Space,
  Tag,
  App,
  Empty,
  Select,
  Typography,
  Tooltip,
  Popconfirm,
  Avatar,
  Input,
  Spin,
  Upload,
  Image,
  Modal,
  Form,
  Collapse,
} from 'antd'
import {
  MessageOutlined,
  PlusOutlined,
  DeleteOutlined,
  SyncOutlined,
  TeamOutlined,
  UserOutlined,
  SendOutlined,
  ArrowLeftOutlined,
  ReloadOutlined,
  PictureOutlined,
  EditOutlined,
  ShopOutlined,
  CustomerServiceOutlined,
  QuestionOutlined,
  FileTextOutlined,
  BulbOutlined,
  ToolOutlined,
  CheckCircleOutlined,
  PlusCircleOutlined,
  SaveOutlined,
  BarChartOutlined,
} from '@ant-design/icons'
import LineActivityStats from './LineActivityStats'
import dayjs from 'dayjs'

const { Text } = Typography

/**
 * 將 mediaUrl 正規化為相對路徑
 * 舊資料可能存的是絕對 URL（如 https://localhost:3000/api/uploads/line/...）
 * 需要轉為相對路徑以便瀏覽器正確載入
 */
function normalizeMediaUrl(url: string | null): string | null {
  if (!url) return null
  if (url.startsWith('/')) return url
  try {
    const parsed = new URL(url)
    return parsed.pathname
  } catch {
    return url
  }
}

const IDENTITY_TYPES = [
  { value: 'STAFF', label: '公司員工', icon: <TeamOutlined />, color: 'blue' },
  { value: 'PARTNER', label: '經銷商', icon: <ShopOutlined />, color: 'purple' },
  { value: 'CUSTOMER', label: '客戶', icon: <CustomerServiceOutlined />, color: 'green' },
  { value: 'UNKNOWN', label: '未知', icon: <QuestionOutlined />, color: 'default' },
]

interface ChannelAssociation {
  id: string
  customerId: string | null
  customerName: string | null
  customerType: string | null
  supplierId: string | null
  supplierName: string | null
  role: string
}

interface LineChannel {
  id: string
  lineChannelId: string
  channelType: 'GROUP' | 'ROOM' | 'USER'
  channelName: string | null
  customerId: string | null
  projectId: string | null
  projectName: string | null
  messageCount: number
  lastMessageAt: string | null
  associations?: ChannelAssociation[]
}

interface LineMessage {
  id: string
  lineUserId: string
  displayName: string
  pictureUrl: string | null
  identityType: string
  messageType: string
  content: string | null
  mediaUrl: string | null
  timestamp: string
}

interface MonthlySummary {
  month: string
  totalMessages: number
  decisions: Array<{
    date: string
    content: string
    participants: string[]
  }>
  technicalIssues: Array<{
    date: string
    content: string
    status?: string
  }>
  actionItems: Array<{
    date: string
    content: string
    assignee?: string
  }>
  highlights: string[]
}

interface LineMessagesCardProps {
  customerId: string
}

export default function LineMessagesCard({ customerId }: LineMessagesCardProps) {
  const { message } = App.useApp()
  const [channels, setChannels] = useState<LineChannel[]>([])
  const [allChannels, setAllChannels] = useState<LineChannel[]>([])
  const [loading, setLoading] = useState(false)
  const [addingChannel, setAddingChannel] = useState(false)
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)

  // Chat state
  const [chatView, setChatView] = useState<'messages' | 'stats'>('messages')
  const [activeChannel, setActiveChannel] = useState<LineChannel | null>(null)
  const [chatMessages, setChatMessages] = useState<LineMessage[]>([])
  const [loadingChat, setLoadingChat] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [totalMessages, setTotalMessages] = useState(0)
  const [inputMessage, setInputMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesTopRef = useRef<HTMLDivElement>(null)
  const lastMessageTimestampRef = useRef<string | null>(null)

  // Summary state
  const [summaryModalOpen, setSummaryModalOpen] = useState(false)
  const [summaries, setSummaries] = useState<MonthlySummary[]>([])
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [savingSummary, setSavingSummary] = useState(false)
  const [hasSavedSummary, setHasSavedSummary] = useState(false)
  const [addingToTimeline, setAddingToTimeline] = useState<string | null>(null)

  // User identity editing
  const [editingUser, setEditingUser] = useState<{
    lineUserId: string
    displayName: string
    pictureUrl: string | null
    identityType: string
  } | null>(null)
  const [savingIdentity, setSavingIdentity] = useState(false)
  const [identityForm] = Form.useForm()

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (chatMessages.length > 0) {
      scrollToBottom()
      // 更新最後訊息時間戳記
      lastMessageTimestampRef.current = chatMessages[chatMessages.length - 1].timestamp
    }
  }, [chatMessages])

  // SSE: Real-time message updates when chat is open
  useEffect(() => {
    if (!activeChannel) return

    const eventSource = new EventSource(`/api/line/events?channelId=${activeChannel.id}`)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'message') {
          // 收到新訊息通知，增量更新（只取得新訊息）
          if (lastMessageTimestampRef.current) {
            fetchNewMessages(activeChannel.id, lastMessageTimestampRef.current)
          } else {
            // 沒有現有訊息，完整載入
            loadChatMessages(activeChannel.id)
          }
        }
      } catch {
        // ignore parse errors
      }
    }

    eventSource.onerror = () => {
      // 連接錯誤時，關閉並稍後重試
      eventSource.close()
    }

    return () => {
      eventSource.close()
    }
  }, [activeChannel])

  // Load customer's LINE channels
  const loadChannels = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/line/channels?customerId=${customerId}`)
      const data = await res.json()
      if (res.ok) {
        setChannels(data.channels)
      }
    } catch {
      message.error('載入 LINE 頻道失敗')
    } finally {
      setLoading(false)
    }
  }, [customerId, message])

  // Load all unmapped channels for adding
  const loadAllChannels = async () => {
    try {
      const res = await fetch('/api/line/channels?includeInactive=true')
      const data = await res.json()
      if (res.ok) {
        const unmapped = data.channels.filter(
          (c: LineChannel) => !c.customerId || c.customerId !== customerId
        )
        setAllChannels(unmapped)
      }
    } catch {
      // ignore
    }
  }

  // Load messages for active channel
  const loadChatMessages = async (channelId: string, beforeTimestamp?: string) => {
    if (beforeTimestamp) {
      setLoadingMore(true)
    } else {
      setLoadingChat(true)
    }
    try {
      let url = `/api/line/channels/${channelId}?limit=100`
      if (beforeTimestamp) {
        url += `&before=${encodeURIComponent(beforeTimestamp)}`
      }
      const res = await fetch(url)
      const data = await res.json()
      if (res.ok) {
        // Reverse to show oldest first (chat style)
        const newMessages = [...data.messages].reverse()
        if (beforeTimestamp) {
          // Prepend older messages
          setChatMessages(prev => [...newMessages, ...prev])
        } else {
          setChatMessages(newMessages)
        }
        setHasMoreMessages(data.pagination?.hasMore || false)
        setTotalMessages(data.pagination?.total || 0)
      }
    } catch {
      message.error('載入訊息失敗')
    } finally {
      setLoadingChat(false)
      setLoadingMore(false)
    }
  }

  // Load more (older) messages
  const loadMoreMessages = () => {
    if (!activeChannel || loadingMore || chatMessages.length === 0) return
    const oldestMessage = chatMessages[0]
    loadChatMessages(activeChannel.id, oldestMessage.timestamp)
  }

  // Fetch only new messages (incremental update)
  const fetchNewMessages = async (channelId: string, afterTimestamp: string) => {
    try {
      const res = await fetch(`/api/line/channels/${channelId}?after=${encodeURIComponent(afterTimestamp)}`)
      const data = await res.json()
      if (res.ok && data.messages && data.messages.length > 0) {
        // Append new messages (already in ascending order)
        setChatMessages(prev => {
          // Filter out duplicates by id
          const existingIds = new Set(prev.map(m => m.id))
          const newMsgs = data.messages.filter((m: LineMessage) => !existingIds.has(m.id))
          return [...prev, ...newMsgs]
        })
      }
    } catch {
      // Silent fail for incremental updates
    }
  }

  // Open chat for a channel
  const openChat = (channel: LineChannel) => {
    setActiveChannel(channel)
    setChatMessages([])
    loadChatMessages(channel.id)
  }

  // Close chat
  const closeChat = () => {
    setActiveChannel(null)
    setChatMessages([])
    setInputMessage('')
    setHasMoreMessages(false)
    setTotalMessages(0)
    setChatView('messages')
  }

  // Add summary item to timeline
  const addToTimeline = async (type: 'decision' | 'issue' | 'action', item: { date: string; content: string; participants?: string[]; status?: string; assignee?: string }, month: string) => {
    const itemKey = `${type}-${month}-${item.date}-${item.content.slice(0, 20)}`
    setAddingToTimeline(itemKey)

    try {
      // 解析日期
      const [monthPart, dayPart] = item.date.split('/')
      const year = month.split('-')[0]
      const eventDate = `${year}-${monthPart.padStart(2, '0')}-${dayPart.padStart(2, '0')}`

      // 根據類型設定標題前綴
      const titlePrefix = type === 'decision' ? '【決策】' : type === 'issue' ? '【技術】' : '【待辦】'
      const title = `${titlePrefix} ${item.content.slice(0, 50)}`

      // 組合內容
      let content = item.content
      if (item.participants && item.participants.length > 0) {
        content += `\n\n參與者：${item.participants.join('、')}`
      }
      if (item.status) {
        content += `\n狀態：${item.status}`
      }
      if (item.assignee) {
        content += `\n負責人：${item.assignee}`
      }
      content += `\n\n來源：LINE 群組「${activeChannel?.channelName || ''}」月度摘要`

      const res = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          source: 'LINE',
          title,
          content,
          tags: [type === 'decision' ? '決策' : type === 'issue' ? '技術問題' : '待辦'],
          eventDate,
        }),
      })

      if (res.ok) {
        message.success('已加入時間軸')
      } else {
        const data = await res.json()
        message.error(data.error || '加入失敗')
      }
    } catch {
      message.error('加入失敗')
    } finally {
      setAddingToTimeline(null)
    }
  }

  // Load saved summary
  const loadSavedSummary = async () => {
    if (!activeChannel) return

    setLoadingSummary(true)
    setSummaryModalOpen(true)
    setSummaries([])

    try {
      const res = await fetch(`/api/line/channels/${activeChannel.id}/summary`)
      const data = await res.json()

      if (res.ok && data.summaries && data.summaries.length > 0) {
        setSummaries(data.summaries)
        setHasSavedSummary(true)
      } else {
        // No saved summary, generate new
        setHasSavedSummary(false)
        await doGenerateSummary()
      }
    } catch {
      setHasSavedSummary(false)
      await doGenerateSummary()
    } finally {
      setLoadingSummary(false)
    }
  }

  // Generate summary (actual LLM call)
  const doGenerateSummary = async () => {
    if (!activeChannel) return

    setLoadingSummary(true)
    setSummaries([])
    setHasSavedSummary(false)

    try {
      const res = await fetch(`/api/line/channels/${activeChannel.id}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()

      if (res.ok && data.summaries) {
        setSummaries(data.summaries)
        if (data.summaries.length === 0) {
          message.info('訊息不足，無法生成摘要')
        }
      } else {
        message.error(data.error || '生成摘要失敗')
      }
    } catch {
      message.error('生成摘要失敗')
    } finally {
      setLoadingSummary(false)
    }
  }

  // Save summary
  const saveSummary = async () => {
    if (!activeChannel || summaries.length === 0) return

    setSavingSummary(true)
    try {
      const res = await fetch(`/api/line/channels/${activeChannel.id}/summary`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summaries }),
      })
      const data = await res.json()

      if (res.ok) {
        message.success(`已儲存 ${data.count} 個月份的摘要`)
        setHasSavedSummary(true)
      } else {
        message.error(data.error || '儲存失敗')
      }
    } catch {
      message.error('儲存失敗')
    } finally {
      setSavingSummary(false)
    }
  }

  // Send message
  const handleSendMessage = async () => {
    if (!activeChannel || !inputMessage.trim()) return

    setSending(true)
    try {
      const res = await fetch(`/api/line/channels/${activeChannel.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: inputMessage.trim() }),
      })
      const data = await res.json()

      if (res.ok) {
        message.success('訊息已發送')
        setInputMessage('')
        // 重新載入訊息以顯示剛發送的訊息
        if (activeChannel) {
          loadChatMessages(activeChannel.id)
        }
      } else {
        message.error(data.error || '發送失敗')
      }
    } catch {
      message.error('發送失敗')
    } finally {
      setSending(false)
    }
  }

  // Send image
  const handleUploadImage = async (file: File) => {
    if (!activeChannel) return false

    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`/api/line/channels/${activeChannel.id}/messages`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (res.ok) {
        message.success('圖片已發送')
        // 重新載入訊息以顯示剛發送的圖片
        if (activeChannel) {
          loadChatMessages(activeChannel.id)
        }
      } else {
        message.error(data.error || '發送失敗')
      }
    } catch {
      message.error('發送失敗')
    } finally {
      setUploadingImage(false)
    }
    return false // Prevent default upload behavior
  }

  // Open user identity editor
  const openUserEditor = (msg: LineMessage) => {
    setEditingUser({
      lineUserId: msg.lineUserId,
      displayName: msg.displayName,
      pictureUrl: msg.pictureUrl,
      identityType: msg.identityType,
    })
    identityForm.setFieldsValue({
      identityType: msg.identityType,
    })
  }

  // Save user identity
  const handleSaveIdentity = async () => {
    if (!editingUser) return

    setSavingIdentity(true)
    try {
      const values = await identityForm.validateFields()
      const res = await fetch(`/api/line/users/by-line-id/${editingUser.lineUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityType: values.identityType,
          customerId: values.identityType === 'CUSTOMER' ? customerId : null,
        }),
      })

      if (res.ok) {
        message.success('已更新使用者身分')
        setEditingUser(null)
        // Reload messages to update identity
        if (activeChannel) {
          loadChatMessages(activeChannel.id)
        }
      } else {
        const data = await res.json()
        message.error(data.error || '更新失敗')
      }
    } catch {
      message.error('更新失敗')
    } finally {
      setSavingIdentity(false)
    }
  }

  useEffect(() => {
    loadChannels()
  }, [loadChannels])

  // Add channel association to customer
  const handleAddChannel = async () => {
    if (!selectedChannelId) return

    setAddingChannel(true)
    try {
      const res = await fetch(`/api/line/channels/${selectedChannelId}/associations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, role: 'DEALER' }),
      })
      if (res.ok) {
        message.success('已新增 LINE 頻道關聯')
        setSelectedChannelId(null)
        loadChannels()
      } else {
        const data = await res.json()
        message.error(data.error || '新增失敗')
      }
    } catch {
      message.error('新增失敗')
    } finally {
      setAddingChannel(false)
    }
  }

  // Remove channel from customer
  // Remove channel association from customer
  const handleRemoveChannel = async (channelId: string, associationId?: string) => {
    try {
      // 如果有 associationId，刪除關聯
      if (associationId) {
        const res = await fetch(`/api/line/channels/${channelId}/associations?associationId=${associationId}`, {
          method: 'DELETE',
        })
        if (res.ok) {
          message.success('已移除 LINE 頻道關聯')
          loadChannels()
        } else {
          const data = await res.json()
          message.error(data.error || '移除失敗')
        }
      } else {
        // 向後相容：清除舊的 customerId
        const res = await fetch(`/api/line/channels/${channelId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerId: null }),
        })
        if (res.ok) {
          message.success('已移除 LINE 頻道')
          loadChannels()
        } else {
          const data = await res.json()
          message.error(data.error || '移除失敗')
        }
      }
    } catch {
      message.error('移除失敗')
    }
  }

  const getChannelTypeIcon = (type: string) => {
    switch (type) {
      case 'GROUP':
        return <TeamOutlined style={{ color: '#00B900' }} />
      case 'ROOM':
        return <MessageOutlined style={{ color: '#00B900' }} />
      default:
        return <UserOutlined style={{ color: '#00B900' }} />
    }
  }

  const getChannelTypeLabel = (type: string) => {
    switch (type) {
      case 'GROUP':
        return '群組'
      case 'ROOM':
        return '聊天室'
      default:
        return '1:1'
    }
  }

  // Channel options for select
  const channelOptions = allChannels
    .filter(c => !channels.find(ch => ch.id === c.id))
    .map(c => ({
      value: c.id,
      label: `${c.channelName || c.lineChannelId} (${getChannelTypeLabel(c.channelType)})`,
    }))

  // Render chat view
  const renderChatView = () => {
    if (!activeChannel) return null

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 500 }}>
        {/* Chat header */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          backgroundColor: '#fafafa',
        }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={closeChat}
          />
          {getChannelTypeIcon(activeChannel.channelType)}
          <div style={{ flex: 1 }}>
            <Text strong>{activeChannel.channelName || activeChannel.lineChannelId}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {getChannelTypeLabel(activeChannel.channelType)}
            </Text>
          </div>
          <Tooltip title="活動統計">
            <Button
              type={chatView === 'stats' ? 'primary' : 'text'}
              icon={<BarChartOutlined />}
              onClick={() => setChatView(chatView === 'stats' ? 'messages' : 'stats')}
              size="small"
            />
          </Tooltip>
          <Tooltip title="生成月度摘要">
            <Button
              type="text"
              icon={<FileTextOutlined />}
              onClick={loadSavedSummary}
              loading={loadingSummary}
            />
          </Tooltip>
          {chatView === 'messages' && (
            <Button
              type="text"
              icon={<ReloadOutlined spin={loadingChat} />}
              onClick={() => loadChatMessages(activeChannel.id)}
            />
          )}
        </div>

        {/* Stats view */}
        {chatView === 'stats' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 16, backgroundColor: '#fff' }}>
            <LineActivityStats channelId={activeChannel.id} />
          </div>
        )}

        {/* Messages area */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: 16,
          backgroundColor: '#e5ddd5',
          display: chatView === 'messages' ? 'block' : 'none',
        }}>
          {loadingChat ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin />
            </div>
          ) : chatMessages.length === 0 ? (
            <Empty description="尚無訊息" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <>
              {/* Load more button */}
              {hasMoreMessages && (
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <Button
                    size="small"
                    loading={loadingMore}
                    onClick={loadMoreMessages}
                  >
                    載入更早的訊息 ({chatMessages.length} / {totalMessages})
                  </Button>
                </div>
              )}
              <div ref={messagesTopRef} />
              {chatMessages.map(msg => {
                const isStaff = msg.identityType === 'STAFF'
                const isSticker = msg.messageType === 'sticker'
                const isImage = msg.messageType === 'image'
                const normalizedUrl = normalizeMediaUrl(msg.mediaUrl)
                const hasMedia = (isSticker || isImage) && normalizedUrl

                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      flexDirection: isStaff ? 'row-reverse' : 'row',
                      marginBottom: 12,
                      gap: 8,
                    }}
                  >
                    {!isStaff && (
                      <Tooltip title="點擊設定身分">
                        <Avatar
                          size={32}
                          src={msg.pictureUrl}
                          icon={<UserOutlined />}
                          style={{ cursor: 'pointer' }}
                          onClick={() => openUserEditor(msg)}
                        />
                      </Tooltip>
                    )}
                    <div style={{ maxWidth: '70%' }}>
                      {!isStaff && (
                        <Space size={4}>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {msg.displayName}
                          </Text>
                          {msg.identityType && msg.identityType !== 'UNKNOWN' && (
                            <Tag
                              color={IDENTITY_TYPES.find(t => t.value === msg.identityType)?.color}
                              style={{ fontSize: 10, lineHeight: '14px', padding: '0 4px', margin: 0 }}
                            >
                              {IDENTITY_TYPES.find(t => t.value === msg.identityType)?.label}
                            </Tag>
                          )}
                        </Space>
                      )}
                      {hasMedia ? (
                        <div style={{
                          padding: isSticker ? 4 : 4,
                          backgroundColor: isStaff && isImage ? '#00B900' : (isSticker ? 'transparent' : undefined),
                          borderRadius: isImage ? 12 : 0,
                        }}>
                          <Image
                            src={normalizedUrl!}
                            alt={isSticker ? '貼圖' : '圖片'}
                            style={{
                              maxWidth: isSticker ? 120 : 200,
                              maxHeight: isSticker ? 120 : 200,
                              borderRadius: isImage ? 8 : 0,
                            }}
                            preview={isImage}
                            fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMIAAADDCAYAAADQvc6UAAABRWlDQ1BJQ0MgUHJvZmlsZQAAKJFjYGASSSwoyGFhYGDIzSspCnJ3UoiIjFJgf8LAwSDCIMogwMCcmFxc4BgQ4ANUwgCjUcG3awyMIPqyLsis7PPOq3QdDFcvjV3jOD1boQVTPQrgSkktTgbSf4A4LbmgqISBgTEFyFYuLykAsTuAbJEioKOA7DkgdjqEvQHEToKwj4DVhAQ5A9k3gGyB5IxEoBmML4BsnSQk8XQkNtReEOBxcfXxUQg1Mjc0dyHgXNJBSWpFCYh2zi+oLMpMzyhRcASGUqqCZ16yno6CkYGRAQMDKMwhqj/fAIcloxgHQqxAjIHBEugw5sUIsSQpBobtQPdLciLEVJYzMPBHMDBsayhILEqEO4DxG0txmrERhM29nYGBddr//5/DGRjYNRkY/l7////39v///y4Dmn+LgesALMsNAFFhFQMAAAAJcEhZcwAALiMAAC4jAXilP3YAAAAHdElNRQfmDAMRMBLj"
                          />
                        </div>
                      ) : isImage && !normalizedUrl ? (
                        <div
                          style={{
                            padding: '16px 24px',
                            borderRadius: 12,
                            backgroundColor: isStaff ? '#00B900' : '#fff',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <PictureOutlined style={{ fontSize: 32, color: isStaff ? '#fff' : '#bbb' }} />
                          <Text style={{ fontSize: 11, color: isStaff ? 'rgba(255,255,255,0.7)' : '#999' }}>
                            圖片（無法顯示）
                          </Text>
                        </div>
                      ) : (
                        <div
                          style={{
                            padding: '8px 12px',
                            borderRadius: isStaff ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                            backgroundColor: isStaff ? '#00B900' : '#fff',
                            color: isStaff ? '#fff' : '#000',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                          }}
                        >
                          <Text style={{ color: isStaff ? '#fff' : '#000', whiteSpace: 'pre-wrap' }}>
                            {msg.content || `[${msg.messageType}]`}
                          </Text>
                        </div>
                      )}
                      <Text
                        type="secondary"
                        style={{
                          fontSize: 10,
                          marginLeft: 4,
                          display: 'block',
                          textAlign: isStaff ? 'right' : 'left',
                        }}
                      >
                        {dayjs(msg.timestamp).format('MM/DD HH:mm')}
                      </Text>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input area */}
        <div style={{
          padding: 12,
          borderTop: '1px solid #f0f0f0',
          backgroundColor: '#fff',
          gap: 8,
          alignItems: 'flex-end',
          display: chatView === 'messages' ? 'flex' : 'none',
        }}>
          <Upload
            accept="image/*"
            showUploadList={false}
            beforeUpload={handleUploadImage}
            disabled={uploadingImage}
          >
            <Button
              type="text"
              icon={<PictureOutlined />}
              loading={uploadingImage}
              style={{ color: '#666' }}
            />
          </Upload>
          <Input.TextArea
            placeholder="輸入訊息..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault()
                handleSendMessage()
              }
            }}
            autoSize={{ minRows: 1, maxRows: 4 }}
            style={{ flex: 1 }}
            disabled={sending}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSendMessage}
            loading={sending}
            disabled={!inputMessage.trim()}
            style={{ backgroundColor: '#00B900', borderColor: '#00B900' }}
          >
            發送
          </Button>
        </div>
      </div>
    )
  }

  // Render channel list
  const renderChannelList = () => (
    <>
      {/* Add channel section */}
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Select
            style={{ width: 300 }}
            placeholder="選擇要新增的 LINE 頻道"
            value={selectedChannelId}
            onChange={setSelectedChannelId}
            onFocus={loadAllChannels}
            options={channelOptions}
            showSearch
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
            allowClear
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAddChannel}
            loading={addingChannel}
            disabled={!selectedChannelId}
          >
            新增頻道
          </Button>
        </Space>
      </div>

      {/* Channels list */}
      {channels.length === 0 ? (
        <Empty description="尚未關聯任何 LINE 頻道" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div>
          {channels.map((channel) => (
            <div
              key={channel.id}
              style={{
                cursor: 'pointer',
                padding: '12px 16px',
                borderRadius: 8,
                marginBottom: 8,
                border: '1px solid #f0f0f0',
                transition: 'background-color 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              onClick={() => openChat(channel)}
            >
              <Avatar
                size={48}
                style={{ backgroundColor: '#00B900', flexShrink: 0 }}
                icon={getChannelTypeIcon(channel.channelType)}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>
                  <Space>
                    <Text strong>{channel.channelName || channel.lineChannelId}</Text>
                    {channel.projectName && (
                      <Tag color="purple">{channel.projectName}</Tag>
                    )}
                  </Space>
                </div>
                <Space>
                  <Text type="secondary">{getChannelTypeLabel(channel.channelType)}</Text>
                  <Text type="secondary">·</Text>
                  <Text type="secondary">{channel.messageCount} 則訊息</Text>
                  {channel.lastMessageAt && (
                    <>
                      <Text type="secondary">·</Text>
                      <Tooltip title={dayjs(channel.lastMessageAt).format('YYYY-MM-DD HH:mm:ss')}>
                        <Text type="secondary">{dayjs(channel.lastMessageAt).fromNow()}</Text>
                      </Tooltip>
                    </>
                  )}
                </Space>
                {channel.associations && channel.associations.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <Space size={4} wrap>
                      {channel.associations.map(a => (
                        <Tag
                          key={a.id}
                          color={a.supplierId ? 'purple' : 'blue'}
                          style={{ margin: 0 }}
                        >
                          {a.supplierId ? (
                            <><ShopOutlined /> {a.supplierName}</>
                          ) : (
                            <><CustomerServiceOutlined /> {a.customerName}</>
                          )}
                        </Tag>
                      ))}
                    </Space>
                  </div>
                )}
              </div>
              <Popconfirm
                title="確定要移除此頻道？"
                description="移除後此頻道將不再與此客戶關聯"
                onConfirm={(e) => {
                  e?.stopPropagation()
                  const association = channel.associations?.find(a => a.customerId === customerId)
                  handleRemoveChannel(channel.id, association?.id)
                }}
                onCancel={(e) => e?.stopPropagation()}
                okText="移除"
                cancelText="取消"
              >
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  size="small"
                  onClick={(e) => e.stopPropagation()}
                >
                  移除
                </Button>
              </Popconfirm>
            </div>
          ))}
        </div>
      )}
    </>
  )

  return (
    <>
      <Card
        title={
          <Space>
            <Avatar size="small" style={{ backgroundColor: '#00B900' }} icon={<MessageOutlined />} />
            LINE 訊息
          </Space>
        }
        extra={
          !activeChannel && (
            <Button
              icon={<SyncOutlined spin={loading} />}
              onClick={loadChannels}
              loading={loading}
            >
              重新整理
            </Button>
          )
        }
        bodyStyle={{ padding: activeChannel ? 0 : 24 }}
      >
        {activeChannel ? renderChatView() : renderChannelList()}
      </Card>

      {/* User identity editing modal */}
      <Modal
        forceRender
        title={
          <Space>
            <Avatar src={editingUser?.pictureUrl} icon={<UserOutlined />} size="small" />
            設定使用者身分：{editingUser?.displayName}
          </Space>
        }
        open={!!editingUser}
        onCancel={() => {
          setEditingUser(null)
          identityForm.resetFields()
        }}
        onOk={handleSaveIdentity}
        okText="儲存"
        cancelText="取消"
        confirmLoading={savingIdentity}
      >
        <Form form={identityForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="identityType"
            label="身分類型"
            rules={[{ required: true, message: '請選擇身分類型' }]}
          >
            <Select
              options={IDENTITY_TYPES.map(t => ({
                value: t.value,
                label: (
                  <Space>
                    {t.icon}
                    {t.label}
                  </Space>
                ),
              }))}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.identityType !== curr.identityType}>
            {({ getFieldValue }) => {
              const type = getFieldValue('identityType')
              if (type === 'CUSTOMER') {
                return (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    此使用者將被標記為此客戶的聯絡人
                  </Text>
                )
              }
              return null
            }}
          </Form.Item>
        </Form>
      </Modal>

      {/* Summary Modal */}
      <Modal
        title={
          <Space>
            <FileTextOutlined />
            月度摘要 - {activeChannel?.channelName || ''}
          </Space>
        }
        open={summaryModalOpen}
        onCancel={() => setSummaryModalOpen(false)}
        width={800}
        footer={summaries.length > 0 ? (
          <Space>
            <Button
              onClick={() => doGenerateSummary()}
              loading={loadingSummary}
              icon={<ReloadOutlined />}
            >
              重新生成
            </Button>
            <Button
              type="primary"
              onClick={saveSummary}
              loading={savingSummary}
              icon={<SaveOutlined />}
            >
              {hasSavedSummary ? '更新儲存' : '儲存摘要'}
            </Button>
          </Space>
        ) : null}
      >
        {loadingSummary ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>
              <Text type="secondary">正在分析對話記錄，請稍候...</Text>
            </div>
          </div>
        ) : summaries.length === 0 ? (
          <Empty description="訊息不足，無法生成摘要" />
        ) : (
          <Collapse
            defaultActiveKey={summaries.length > 0 ? [summaries[0].month] : []}
            items={summaries.map(summary => ({
              key: summary.month,
              label: (
                <Space>
                  <Text strong>{summary.month}</Text>
                  <Tag>{summary.totalMessages} 則訊息</Tag>
                </Space>
              ),
              children: (
                <div>
                  {/* Highlights */}
                  {summary.highlights.length > 0 && (
                    <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f6ffed', borderRadius: 8 }}>
                      <Space align="start">
                        <BulbOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                        <div>
                          <Text strong style={{ color: '#52c41a' }}>月度亮點</Text>
                          <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
                            {summary.highlights.map((h, i) => (
                              <li key={i}>{h}</li>
                            ))}
                          </ul>
                        </div>
                      </Space>
                    </div>
                  )}

                  {/* Decisions */}
                  {summary.decisions.length > 0 && (
                    <>
                      <div style={{ margin: '12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CheckCircleOutlined style={{ color: '#1890ff' }} />
                        <Text strong>重要決策</Text>
                        <Tag color="blue">{summary.decisions.length}</Tag>
                      </div>
                      <div>
                        {summary.decisions.map((item, idx) => {
                          const itemKey = `decision-${summary.month}-${item.date}-${item.content.slice(0, 20)}`
                          return (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                              <div>
                                <Space>
                                  <Tag color="blue">{item.date}</Tag>
                                  <Text>{item.content}</Text>
                                </Space>
                                {item.participants.length > 0 && (
                                  <div>
                                    <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                                      參與者：{item.participants.join('、')}
                                    </Text>
                                  </div>
                                )}
                              </div>
                              <Tooltip title="加入時間軸">
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<PlusCircleOutlined />}
                                  loading={addingToTimeline === itemKey}
                                  onClick={() => addToTimeline('decision', item, summary.month)}
                                />
                              </Tooltip>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}

                  {/* Technical Issues */}
                  {summary.technicalIssues.length > 0 && (
                    <>
                      <div style={{ margin: '12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ToolOutlined style={{ color: '#fa8c16' }} />
                        <Text strong>技術問題</Text>
                        <Tag color="orange">{summary.technicalIssues.length}</Tag>
                      </div>
                      <div>
                        {summary.technicalIssues.map((item, idx) => {
                          const itemKey = `issue-${summary.month}-${item.date}-${item.content.slice(0, 20)}`
                          return (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                              <Space>
                                <Tag color="orange">{item.date}</Tag>
                                <Text>{item.content}</Text>
                                {item.status && (
                                  <Tag color={item.status === '已解決' ? 'green' : item.status === '處理中' ? 'processing' : 'default'}>
                                    {item.status}
                                  </Tag>
                                )}
                              </Space>
                              <Tooltip title="加入時間軸">
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<PlusCircleOutlined />}
                                  loading={addingToTimeline === itemKey}
                                  onClick={() => addToTimeline('issue', item, summary.month)}
                                />
                              </Tooltip>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}

                  {/* Action Items */}
                  {summary.actionItems.length > 0 && (
                    <>
                      <div style={{ margin: '12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <EditOutlined style={{ color: '#eb2f96' }} />
                        <Text strong>待辦/追蹤</Text>
                        <Tag color="magenta">{summary.actionItems.length}</Tag>
                      </div>
                      <div>
                        {summary.actionItems.map((item, idx) => {
                          const itemKey = `action-${summary.month}-${item.date}-${item.content.slice(0, 20)}`
                          return (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                              <Space>
                                <Tag color="magenta">{item.date}</Tag>
                                <Text>{item.content}</Text>
                                {item.assignee && (
                                  <Tag icon={<UserOutlined />}>{item.assignee}</Tag>
                                )}
                              </Space>
                              <Tooltip title="加入時間軸">
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<PlusCircleOutlined />}
                                  loading={addingToTimeline === itemKey}
                                  onClick={() => addToTimeline('action', item, summary.month)}
                                />
                              </Tooltip>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              ),
            }))}
          />
        )}
      </Modal>
    </>
  )
}
