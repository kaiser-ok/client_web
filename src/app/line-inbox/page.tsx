'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Input,
  Button,
  Space,
  Tag,
  App,
  Empty,
  Typography,
  Tooltip,
  Avatar,
  Spin,
  Upload,
  Image,
  Badge,
  Mentions,
  Popover,
} from 'antd'
import {
  MessageOutlined,
  TeamOutlined,
  UserOutlined,
  SendOutlined,
  ReloadOutlined,
  PictureOutlined,
  SearchOutlined,
  RobotOutlined,
  AlertOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  SmileOutlined,
  EnterOutlined,
  CloseCircleFilled,
} from '@ant-design/icons'
import Picker from '@emoji-mart/react'
import emojiData from '@emoji-mart/data'
import AppLayout from '@/components/layout/AppLayout'
import LineEmojiText from '@/components/line/LineEmojiText'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'

dayjs.extend(relativeTime)
dayjs.locale('zh-tw')

const { Text } = Typography

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
  { value: 'STAFF', label: '公司員工', color: 'blue' },
  { value: 'PARTNER', label: '經銷商', color: 'purple' },
  { value: 'CUSTOMER', label: '客戶', color: 'green' },
  { value: 'UNKNOWN', label: '未知', color: 'default' },
]

interface LineChannel {
  id: string
  lineChannelId: string
  channelType: string
  channelName: string | null
  partnerName: string | null
  partnerId: string | null
  projectName: string | null
  isActive: boolean
  isStaff?: boolean
  messageCount: number
  lastMessageAt: string | null
  associations: Array<{
    id: string
    partnerId: string
    partnerName: string | null
    role: string
  }>
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

interface TriageItem {
  channelId: string
  channelName: string
  partnerName: string | null
  status: 'urgent' | 'action_needed' | 'follow_up'
  summary: string
  lastCustomerMessage: string
  suggestion: string
}

const TRIAGE_STATUS = {
  urgent: { label: '緊急', color: '#ff4d4f', icon: <AlertOutlined />, tagColor: 'red' },
  action_needed: { label: '需處理', color: '#fa8c16', icon: <ExclamationCircleOutlined />, tagColor: 'orange' },
  follow_up: { label: '追蹤', color: '#1890ff', icon: <ClockCircleOutlined />, tagColor: 'blue' },
}

export default function LineInboxPage() {
  const { message } = App.useApp()
  const [channels, setChannels] = useState<LineChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [activeChannel, setActiveChannel] = useState<LineChannel | null>(null)
  const [chatMessages, setChatMessages] = useState<LineMessage[]>([])
  const [loadingChat, setLoadingChat] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [totalMessages, setTotalMessages] = useState(0)
  const [inputMessage, setInputMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [quotingMessage, setQuotingMessage] = useState<LineMessage | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastMessageTimestampRef = useRef<string | null>(null)
  // Track channels with new messages since last viewed
  const [updatedChannelIds, setUpdatedChannelIds] = useState<Set<string>>(new Set())
  // Triage state
  const [triageItems, setTriageItems] = useState<TriageItem[]>([])
  const [triageLoading, setTriageLoading] = useState(false)
  const [triageInfo, setTriageInfo] = useState<{ analyzedChannels: number; timeRange: number } | null>(null)
  const [showTriage, setShowTriage] = useState(false)

  // Derive unique users from chat messages for @mention
  const mentionOptions = useMemo(() => {
    const userMap = new Map<string, { displayName: string; pictureUrl: string | null; identityType: string }>()
    for (const msg of chatMessages) {
      if (msg.lineUserId.startsWith('SYSTEM_')) continue
      if (!userMap.has(msg.lineUserId)) {
        userMap.set(msg.lineUserId, {
          displayName: msg.displayName,
          pictureUrl: msg.pictureUrl,
          identityType: msg.identityType,
        })
      }
    }
    return Array.from(userMap.values()).map(u => ({
      value: u.displayName,
      label: (
        <Space>
          <Avatar src={u.pictureUrl} size="small" icon={<UserOutlined />} />
          <span>{u.displayName}</span>
          <Tag color={IDENTITY_TYPES.find(t => t.value === u.identityType)?.color || 'default'} style={{ fontSize: 11 }}>
            {IDENTITY_TYPES.find(t => t.value === u.identityType)?.label || '未知'}
          </Tag>
        </Space>
      ),
    }))
  }, [chatMessages])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatMessages.length > 0 && !loadingMore) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages, loadingMore])

  // Track last message timestamp for SSE incremental updates
  useEffect(() => {
    if (chatMessages.length > 0) {
      lastMessageTimestampRef.current = chatMessages[chatMessages.length - 1].timestamp
    }
  }, [chatMessages])

  // SSE for active channel
  useEffect(() => {
    if (!activeChannel) return

    const eventSource = new EventSource(`/api/line/events?channelId=${activeChannel.id}`)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'new_message') {
          if (lastMessageTimestampRef.current) {
            fetchNewMessages(activeChannel.id, lastMessageTimestampRef.current)
          } else {
            loadChatMessages(activeChannel.id)
          }
        }
      } catch {
        // ignore
      }
    }

    eventSource.onerror = () => {
      eventSource.close()
    }

    return () => {
      eventSource.close()
    }
  }, [activeChannel])

  // Poll channel list for updates (every 15 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      refreshChannelList()
    }, 15000)
    return () => clearInterval(interval)
  }, [activeChannel])

  const loadChannels = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/line/channels')
      const data = await res.json()
      if (res.ok) {
        setChannels(data.channels)
      }
    } catch {
      message.error('載入 LINE 頻道失敗')
    } finally {
      setLoading(false)
    }
  }, [message])

  // Refresh channel list silently (for detecting new messages)
  const refreshChannelList = async () => {
    try {
      const res = await fetch('/api/line/channels')
      const data = await res.json()
      if (res.ok) {
        const newChannels: LineChannel[] = data.channels
        // Detect channels with updated lastMessageAt
        setChannels(prev => {
          const prevMap = new Map(prev.map(c => [c.id, c.lastMessageAt]))
          const updated = new Set<string>()
          newChannels.forEach(c => {
            const prevTime = prevMap.get(c.id)
            if (prevTime && c.lastMessageAt && c.lastMessageAt !== prevTime) {
              // Don't mark active channel as updated
              if (!activeChannel || activeChannel.id !== c.id) {
                updated.add(c.id)
              }
            }
          })
          if (updated.size > 0) {
            setUpdatedChannelIds(prev => new Set([...prev, ...updated]))
          }
          return newChannels
        })
      }
    } catch {
      // silent fail
    }
  }

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
        const newMessages = [...data.messages].reverse()
        if (beforeTimestamp) {
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

  const loadMoreMessages = () => {
    if (!activeChannel || loadingMore || chatMessages.length === 0) return
    const oldestMessage = chatMessages[0]
    loadChatMessages(activeChannel.id, oldestMessage.timestamp)
  }

  const fetchNewMessages = async (channelId: string, afterTimestamp: string) => {
    try {
      const res = await fetch(`/api/line/channels/${channelId}?after=${encodeURIComponent(afterTimestamp)}`)
      const data = await res.json()
      if (res.ok && data.messages && data.messages.length > 0) {
        setChatMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id))
          const newMsgs = data.messages.filter((m: LineMessage) => !existingIds.has(m.id))
          return [...prev, ...newMsgs]
        })
      }
    } catch {
      // silent
    }
  }

  const openChat = (channel: LineChannel) => {
    setActiveChannel(channel)
    setChatMessages([])
    setInputMessage('')
    setQuotingMessage(null)
    loadChatMessages(channel.id)
    // Clear updated indicator for this channel
    setUpdatedChannelIds(prev => {
      const next = new Set(prev)
      next.delete(channel.id)
      return next
    })
  }

  const handleSendMessage = async () => {
    if (!activeChannel || !inputMessage.trim()) return

    // Build message with quote prefix
    let fullMessage = inputMessage.trim()
    if (quotingMessage) {
      const quotedContent = quotingMessage.content || `[${quotingMessage.messageType}]`
      const quotedLine = quotedContent.split('\n').map(l => `> ${l}`).join('\n')
      fullMessage = `${quotingMessage.displayName}：\n${quotedLine}\n\n${fullMessage}`
    }

    setSending(true)
    try {
      const res = await fetch(`/api/line/channels/${activeChannel.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: fullMessage }),
      })
      const data = await res.json()

      if (res.ok) {
        message.success('訊息已發送')
        setInputMessage('')
        setQuotingMessage(null)
        loadChatMessages(activeChannel.id)
      } else {
        message.error(data.error || '發送失敗')
      }
    } catch {
      message.error('發送失敗')
    } finally {
      setSending(false)
    }
  }

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
        loadChatMessages(activeChannel.id)
      } else {
        message.error(data.error || '發送失敗')
      }
    } catch {
      message.error('發送失敗')
    } finally {
      setUploadingImage(false)
    }
    return false
  }

  useEffect(() => {
    loadChannels()
  }, [loadChannels])

  // AI Triage
  const runTriage = async (hours = 24) => {
    setTriageLoading(true)
    setShowTriage(true)
    try {
      const res = await fetch('/api/line/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours }),
      })
      const data = await res.json()
      if (res.ok) {
        setTriageItems(data.items || [])
        setTriageInfo({ analyzedChannels: data.analyzedChannels, timeRange: data.timeRange })
        if (data.items.length === 0) {
          message.success('所有頻道目前無需處理')
        }
      } else {
        message.error(data.error || '分析失敗')
      }
    } catch {
      message.error('分析失敗')
    } finally {
      setTriageLoading(false)
    }
  }

  const handleTriageClick = (channelId: string) => {
    const channel = channels.find(c => c.id === channelId)
    if (channel) {
      openChat(channel)
    }
  }

  const getChannelTypeIcon = (type: string) => {
    switch (type) {
      case 'GROUP':
        return <TeamOutlined />
      case 'ROOM':
        return <MessageOutlined />
      default:
        return <UserOutlined />
    }
  }

  const getChannelTypeLabel = (type: string) => {
    switch (type) {
      case 'GROUP': return '群組'
      case 'ROOM': return '聊天室'
      default: return '1:1'
    }
  }

  // Filter channels by search
  const filteredChannels = channels
    .filter(c => {
      if (!searchText) return true
      const search = searchText.toLowerCase()
      return (
        (c.channelName || '').toLowerCase().includes(search) ||
        (c.partnerName || '').toLowerCase().includes(search) ||
        c.associations.some(a => (a.partnerName || '').toLowerCase().includes(search))
      )
    })
    .sort((a, b) => {
      // 尚無訊息的放最後
      if (!a.lastMessageAt && !b.lastMessageAt) return 0
      if (!a.lastMessageAt) return 1
      if (!b.lastMessageAt) return -1
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    })

  // Get last message preview for channel list
  const getChannelPreview = (channel: LineChannel) => {
    if (!channel.lastMessageAt) return '尚無訊息'
    return dayjs(channel.lastMessageAt).fromNow()
  }

  return (
    <AppLayout>
      <style>{`.line-msg-row:hover .line-msg-reply-btn { opacity: 1 !important; }`}</style>
      <div style={{ display: 'flex', height: 'calc(100vh - 140px)', margin: -24, marginTop: -24 }}>
        {/* Left: Channel list */}
        <div style={{
          width: activeChannel ? 320 : '100%',
          maxWidth: activeChannel ? 320 : 600,
          borderRight: '1px solid #f0f0f0',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#fff',
        }}>
          {/* Search header */}
          <div style={{
            padding: '16px',
            borderBottom: '1px solid #f0f0f0',
          }}>
            <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
              <Space>
                <Avatar size="small" style={{ backgroundColor: '#00B900' }} icon={<MessageOutlined />} />
                <Text strong style={{ fontSize: 16 }}>LINE 收件箱</Text>
              </Space>
              <Space size={4}>
                <Tooltip title="AI 分析待處理項目">
                  <Button
                    type={showTriage ? 'primary' : 'text'}
                    icon={<RobotOutlined />}
                    onClick={() => showTriage ? setShowTriage(false) : runTriage()}
                    loading={triageLoading}
                    size="small"
                    style={showTriage ? { backgroundColor: '#00B900', borderColor: '#00B900' } : {}}
                  />
                </Tooltip>
                <Button
                  type="text"
                  icon={<ReloadOutlined spin={loading} />}
                  onClick={loadChannels}
                  size="small"
                />
              </Space>
            </Space>
            <Input
              prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="搜尋頻道或客戶..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              allowClear
            />
          </div>

          {/* Triage panel */}
          {showTriage && (
            <div style={{
              borderBottom: '1px solid #f0f0f0',
              backgroundColor: '#fafafa',
              maxHeight: 300,
              overflow: 'auto',
            }}>
              {triageLoading ? (
                <div style={{ textAlign: 'center', padding: 24 }}>
                  <Spin size="small" />
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>AI 分析中...</Text>
                  </div>
                </div>
              ) : triageItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 16 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {triageInfo ? `已分析 ${triageInfo.analyzedChannels} 個頻道，目前無待處理項目` : '點擊 AI 按鈕開始分析'}
                  </Text>
                </div>
              ) : (
                <div style={{ padding: '8px 0' }}>
                  <div style={{ padding: '0 16px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      分析 {triageInfo?.analyzedChannels} 個頻道 · 最近 {triageInfo?.timeRange}h
                    </Text>
                    <Button type="link" size="small" style={{ fontSize: 11, padding: 0 }} onClick={() => runTriage()}>
                      重新分析
                    </Button>
                  </div>
                  {triageItems.map((item, idx) => {
                    const statusInfo = TRIAGE_STATUS[item.status]
                    return (
                      <div
                        key={idx}
                        onClick={() => handleTriageClick(item.channelId)}
                        style={{
                          padding: '8px 16px',
                          cursor: 'pointer',
                          borderLeft: `3px solid ${statusInfo.color}`,
                          marginBottom: 1,
                          backgroundColor: '#fff',
                          transition: 'background-color 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <Tag color={statusInfo.tagColor} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                            {statusInfo.label}
                          </Tag>
                          <Text strong style={{ fontSize: 13 }}>{item.channelName}</Text>
                          {item.partnerName && (
                            <Text type="secondary" style={{ fontSize: 11 }}>({item.partnerName})</Text>
                          )}
                        </div>
                        <Text style={{ fontSize: 12, display: 'block' }}>{item.summary}</Text>
                        {item.suggestion && (
                          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
                            建議：{item.suggestion}
                          </Text>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Channel list */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
            ) : filteredChannels.length === 0 ? (
              <Empty description="沒有頻道" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 40 }} />
            ) : (
              filteredChannels.map(channel => {
                const isActive = activeChannel?.id === channel.id
                const hasUpdate = updatedChannelIds.has(channel.id)
                return (
                  <div
                    key={channel.id}
                    onClick={() => openChat(channel)}
                    style={{
                      padding: '12px 16px',
                      cursor: 'pointer',
                      backgroundColor: isActive ? '#e6f7e6' : 'transparent',
                      borderBottom: '1px solid #f5f5f5',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = '#fafafa' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <Badge dot={hasUpdate} offset={[-4, 4]}>
                      <Avatar
                        size={44}
                        style={{ backgroundColor: '#00B900', flexShrink: 0 }}
                        icon={getChannelTypeIcon(channel.channelType)}
                      />
                    </Badge>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text strong ellipsis style={{ maxWidth: 160 }}>
                          {channel.channelName || channel.lineChannelId}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>
                          {getChannelPreview(channel)}
                        </Text>
                      </div>
                      <div style={{ marginTop: 2 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {getChannelTypeLabel(channel.channelType)}
                          {' · '}
                          {channel.messageCount} 則
                        </Text>
                      </div>
                      {(channel.partnerName || channel.associations.length > 0) && (
                        <div style={{ marginTop: 2 }}>
                          {channel.partnerName && (
                            <Tag color="blue" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                              {channel.partnerName}
                            </Tag>
                          )}
                          {channel.associations.slice(0, 2).map(a => (
                            <Tag key={a.id} color="cyan" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: '0 0 0 4px' }}>
                              {a.partnerName}
                            </Tag>
                          ))}
                          {channel.associations.length > 2 && (
                            <Text type="secondary" style={{ fontSize: 10 }}>
                              +{channel.associations.length - 2}
                            </Text>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right: Chat area */}
        {activeChannel ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#fff' }}>
            {/* Chat header */}
            <div style={{
              padding: '12px 20px',
              borderBottom: '1px solid #f0f0f0',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              backgroundColor: '#fafafa',
            }}>
              <Avatar style={{ backgroundColor: '#00B900' }} icon={getChannelTypeIcon(activeChannel.channelType)} />
              <div style={{ flex: 1 }}>
                <Text strong style={{ fontSize: 15 }}>
                  {activeChannel.channelName || activeChannel.lineChannelId}
                </Text>
                <br />
                <Space size={4}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {getChannelTypeLabel(activeChannel.channelType)}
                  </Text>
                  {activeChannel.partnerName && (
                    <Tag color="blue" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                      {activeChannel.partnerName}
                    </Tag>
                  )}
                </Space>
              </div>
              <Button
                type="text"
                icon={<ReloadOutlined spin={loadingChat} />}
                onClick={() => loadChatMessages(activeChannel.id)}
              />
            </div>

            {/* Messages area */}
            <div style={{
              flex: 1,
              overflow: 'auto',
              padding: 16,
              backgroundColor: '#e5ddd5',
            }}>
              {loadingChat ? (
                <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
              ) : chatMessages.length === 0 ? (
                <Empty description="尚無訊息" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <>
                  {hasMoreMessages && (
                    <div style={{ textAlign: 'center', marginBottom: 16 }}>
                      <Button size="small" loading={loadingMore} onClick={loadMoreMessages}>
                        載入更早的訊息 ({chatMessages.length} / {totalMessages})
                      </Button>
                    </div>
                  )}
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
                          <Avatar
                            size={32}
                            src={msg.pictureUrl}
                            icon={<UserOutlined />}
                          />
                        )}
                        <div style={{ maxWidth: '70%' }} className="line-msg-row">
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexDirection: isStaff ? 'row-reverse' : 'row' }}>
                          <div style={{ flex: '0 1 auto', minWidth: 0 }}>
                          {hasMedia ? (
                            <div style={{
                              padding: 4,
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
                              />
                            </div>
                          ) : isImage && !normalizedUrl ? (
                            <div style={{
                              padding: '16px 24px',
                              borderRadius: 12,
                              backgroundColor: isStaff ? '#00B900' : '#fff',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: 4,
                            }}>
                              <PictureOutlined style={{ fontSize: 32, color: isStaff ? '#fff' : '#bbb' }} />
                              <Text style={{ fontSize: 11, color: isStaff ? 'rgba(255,255,255,0.7)' : '#999' }}>
                                圖片（無法顯示）
                              </Text>
                            </div>
                          ) : (
                            <div style={{
                              padding: '8px 12px',
                              borderRadius: isStaff ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                              backgroundColor: isStaff ? '#00B900' : '#fff',
                              color: isStaff ? '#fff' : '#000',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                            }}>
                              {msg.content ? (
                                <LineEmojiText
                                  content={msg.content}
                                  style={{ color: isStaff ? '#fff' : '#000' }}
                                />
                              ) : (
                                <Text style={{ color: isStaff ? '#fff' : '#000' }}>
                                  {`[${msg.messageType}]`}
                                </Text>
                              )}
                            </div>
                          )}
                          </div>
                          <Tooltip title="引用回覆">
                            <Button
                              type="text"
                              size="small"
                              icon={<EnterOutlined />}
                              className="line-msg-reply-btn"
                              style={{ opacity: 0, transition: 'opacity 0.2s', flexShrink: 0 }}
                              onClick={() => setQuotingMessage(msg)}
                            />
                          </Tooltip>
                          </div>
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

            {/* Quote preview */}
            {quotingMessage && (
              <div style={{
                padding: '8px 12px',
                borderTop: '1px solid #f0f0f0',
                backgroundColor: '#fafafa',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <div style={{
                  borderLeft: '3px solid #00B900',
                  paddingLeft: 8,
                  flex: 1,
                  minWidth: 0,
                }}>
                  <Text strong style={{ fontSize: 12, color: '#00B900', display: 'block' }}>
                    {quotingMessage.displayName}
                  </Text>
                  <Text type="secondary" ellipsis style={{ fontSize: 12 }}>
                    {quotingMessage.content || `[${quotingMessage.messageType}]`}
                  </Text>
                </div>
                <Button
                  type="text"
                  size="small"
                  icon={<CloseCircleFilled style={{ color: '#999' }} />}
                  onClick={() => setQuotingMessage(null)}
                />
              </div>
            )}

            {/* Input area */}
            <div style={{
              padding: 12,
              borderTop: '1px solid #f0f0f0',
              backgroundColor: '#fff',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-end',
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
              <Popover
                content={
                  <Picker
                    data={emojiData}
                    onEmojiSelect={(emoji: { native: string }) => {
                      setInputMessage(prev => prev + emoji.native)
                      setEmojiPickerOpen(false)
                    }}
                    locale="zh"
                    previewPosition="none"
                    skinTonePosition="none"
                    theme="light"
                  />
                }
                trigger="click"
                open={emojiPickerOpen}
                onOpenChange={setEmojiPickerOpen}
                placement="topLeft"
              >
                <Button
                  type="text"
                  icon={<SmileOutlined />}
                  style={{ color: '#666' }}
                />
              </Popover>
              <Mentions
                placeholder="輸入訊息... 輸入 @ 提及用戶"
                value={inputMessage}
                onChange={setInputMessage}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                autoSize={{ minRows: 1, maxRows: 4 }}
                style={{ flex: 1 }}
                disabled={sending}
                options={mentionOptions}
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
        ) : (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f5f5f5',
          }}>
            <Empty
              description="選擇一個頻道開始對話"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          </div>
        )}
      </div>
    </AppLayout>
  )
}
