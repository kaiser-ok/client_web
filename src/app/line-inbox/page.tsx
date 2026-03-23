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
  Checkbox,
  Divider,
  Modal,
  Form,
  Select,
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
  FlagOutlined,
  FlagFilled,
  TagsOutlined,
  TagOutlined,
  CheckOutlined,
  CloseOutlined,
  PlusOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  BellOutlined,
  BellFilled,
} from '@ant-design/icons'
import Picker from '@emoji-mart/react'
import emojiData from '@emoji-mart/data'
import AppLayout from '@/components/layout/AppLayout'
import LineEmojiText from '@/components/line/LineEmojiText'
import LineEventPanel from '@/components/line/LineEventPanel'
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
    // 外部 URL（如 LINE 貼圖 CDN）保持完整，只對本機 URL 取 pathname
    if (parsed.hostname === 'localhost' || parsed.hostname === window.location.hostname) {
      return parsed.pathname
    }
    return url
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

interface ChannelLabel {
  id: string
  channelId: string
  labelId: string
  source: string
  confidence: number | null
  appliedBy: string | null
  appliedAt: string
  note: string | null
}

interface LabelDefinition {
  id: string
  label: string
  description: string
  color: string
  icon: string
  enabled: boolean
  autoApply: boolean
  keywords: string[]
  order: number
}

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
  needsFollowUp?: boolean
  followUpNote?: string | null
  followUpAt?: string | null
  followUpBy?: string | null
  status?: string
  messageCount: number
  lastMessageAt: string | null
  labels?: ChannelLabel[]
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
  quoteToken: string | null
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

const CHANNEL_STATUS: Record<string, { label: string; color: string; tagColor: string }> = {
  OPEN:        { label: '待處理', color: '#ff4d4f', tagColor: 'error' },
  IN_PROGRESS: { label: '處理中', color: '#fa8c16', tagColor: 'warning' },
  CLEAR:       { label: '已清除', color: '#52c41a', tagColor: 'success' },
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
  const mentionActiveRef = useRef(false)
  const [filterFollowUp, setFilterFollowUp] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string[]>([])
  // Label system
  const [labelDefs, setLabelDefs] = useState<LabelDefinition[]>([])
  const [filterLabels, setFilterLabels] = useState<string[]>([])
  const [labelPopoverOpen, setLabelPopoverOpen] = useState(false)
  const [headerLabelPopoverOpen, setHeaderLabelPopoverOpen] = useState(false)
  // Track channels with new messages since last viewed
  const [updatedChannelIds, setUpdatedChannelIds] = useState<Set<string>>(new Set())
  // Triage state
  const [triageItems, setTriageItems] = useState<TriageItem[]>([])
  const [triageLoading, setTriageLoading] = useState(false)
  const [triageInfo, setTriageInfo] = useState<{ analyzedChannels: number; timeRange: number } | null>(null)
  const [showTriage, setShowTriage] = useState(false)
  const [showEventsPanel, setShowEventsPanel] = useState(false)
  // Message selection & event creation
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set())
  const [createEventOpen, setCreateEventOpen] = useState(false)
  const [creatingEvent, setCreatingEvent] = useState(false)
  const [staffList, setStaffList] = useState<{ id: string; name: string | null; email: string }[]>([])
  const [createEventForm] = Form.useForm()
  const [suggestedTitles, setSuggestedTitles] = useState<string[]>([])
  const [assigneeReason, setAssigneeReason] = useState<string | null>(null)
  const [assigneeSource, setAssigneeSource] = useState<'channel' | 'partner' | 'skill' | 'llm' | null>(null)
  const [requiredSkills, setRequiredSkills] = useState<string[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('line_sound_notify') !== 'off' } catch { return true }
  })

  // Play a two-tone notification chime via Web Audio API (no external file needed)
  const playNotificationSound = useCallback(() => {
    try {
      const ctx = new AudioContext()
      const gain = ctx.createGain()
      gain.connect(ctx.destination)
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      const osc = ctx.createOscillator()
      osc.connect(gain)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.15)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.5)
    } catch {
      // Browser may block AudioContext without user gesture
    }
  }, [])

  // Derive unique users from chat messages for @mention
  const { mentionOptions, mentionUserMap } = useMemo(() => {
    const lineUserMap = new Map<string, { displayName: string; pictureUrl: string | null; identityType: string; lineUserId: string }>()
    for (const msg of chatMessages) {
      if (msg.lineUserId.startsWith('SYSTEM_')) continue
      if (!lineUserMap.has(msg.lineUserId)) {
        lineUserMap.set(msg.lineUserId, {
          displayName: msg.displayName,
          pictureUrl: msg.pictureUrl,
          identityType: msg.identityType,
          lineUserId: msg.lineUserId,
        })
      }
    }
    // displayName → lineUserId for mention parsing
    const mentionUserMap = new Map<string, string>()
    const options = Array.from(lineUserMap.values()).map(u => {
      mentionUserMap.set(u.displayName, u.lineUserId)
      return {
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
      }
    })
    return { mentionOptions: options, mentionUserMap }
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
      // 3 秒後自動重連
      setTimeout(() => {
        if (activeChannel) {
          setActiveChannel({ ...activeChannel })
        }
      }, 3000)
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
            if (soundEnabled) playNotificationSound()
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

    let fullMessage = inputMessage.trim()

    // 使用 LINE 原生 quoteToken；若無（自己發出的訊息或舊訊息）則 fallback 文字引用
    let quoteToken: string | null = null
    if (quotingMessage) {
      if (quotingMessage.quoteToken) {
        quoteToken = quotingMessage.quoteToken
      } else {
        const quotedContent = quotingMessage.content || `[${quotingMessage.messageType}]`
        const quotedLine = quotedContent.split('\n').map((l: string) => `> ${l}`).join('\n')
        fullMessage = `${quotingMessage.displayName}：\n${quotedLine}\n\n${fullMessage}`
      }
    }

    // Parse @mentions from text → LINE mentionees format
    type Mentionee = { index: number; length: number; lineUserId: string }
    const mentionees: Mentionee[] = []
    for (const [displayName, lineUserId] of mentionUserMap.entries()) {
      const tag = `@${displayName}`
      let pos = 0
      while (true) {
        const idx = fullMessage.indexOf(tag, pos)
        if (idx === -1) break
        mentionees.push({ index: idx, length: tag.length, lineUserId })
        pos = idx + tag.length
      }
    }

    setSending(true)
    try {
      const res = await fetch(`/api/line/channels/${activeChannel.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: fullMessage,
          mentionees: mentionees.length > 0 ? mentionees : undefined,
          quoteToken: quoteToken || undefined,
        }),
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

  const toggleFollowUp = async (channel: LineChannel) => {
    const newValue = !channel.needsFollowUp
    try {
      const res = await fetch(`/api/line/channels/${channel.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ needsFollowUp: newValue }),
      })
      if (res.ok) {
        // Update local state
        setChannels(prev => prev.map(c =>
          c.id === channel.id ? { ...c, needsFollowUp: newValue } : c
        ))
        if (activeChannel?.id === channel.id) {
          setActiveChannel(prev => prev ? { ...prev, needsFollowUp: newValue } : prev)
        }
        message.success(newValue ? '已標記追蹤' : '已取消追蹤')
      }
    } catch {
      message.error('操作失敗')
    }
  }

  const changeChannelStatus = async (channel: LineChannel, newStatus: string) => {
    try {
      const res = await fetch(`/api/line/channels/${channel.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        setChannels(prev => prev.map(c =>
          c.id === channel.id ? { ...c, status: newStatus } : c
        ))
        if (activeChannel?.id === channel.id) {
          setActiveChannel(prev => prev ? { ...prev, status: newStatus } : prev)
        }
        message.success(`狀態已更新：${CHANNEL_STATUS[newStatus]?.label}`)
      }
    } catch {
      message.error('操作失敗')
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

  // Load label definitions
  const loadLabelDefs = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/line-labels')
      const data = await res.json()
      if (res.ok && data.config?.labels) {
        setLabelDefs(data.config.labels.filter((l: LabelDefinition) => l.enabled))
      }
    } catch {
      // silent
    }
  }, [])

  // Toggle label on a channel
  const toggleChannelLabel = async (channelId: string, labelId: string, hasLabel: boolean) => {
    try {
      const res = await fetch(`/api/line/channels/${channelId}/labels`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: hasLabel ? 'remove' : 'add',
          labelId,
        }),
      })
      if (res.ok) {
        // Refresh channels to update labels
        await refreshChannelList()
        // Update active channel labels if needed
        if (activeChannel?.id === channelId) {
          const channelRes = await fetch(`/api/line/channels/${channelId}?limit=0`)
          const channelData = await channelRes.json()
          if (channelRes.ok && channelData.channel?.labels) {
            setActiveChannel(prev => prev ? { ...prev, labels: channelData.channel.labels } : prev)
            // Also update in channels list
            setChannels(prev => prev.map(c =>
              c.id === channelId ? { ...c, labels: channelData.channel.labels } : c
            ))
          }
        }
        message.success(hasLabel ? '已移除標籤' : '已加上標籤')
      }
    } catch {
      message.error('操作失敗')
    }
  }

  // Get label definition by ID
  const getLabelDef = (labelId: string): LabelDefinition | undefined => {
    return labelDefs.find(l => l.id === labelId)
  }

  useEffect(() => {
    loadChannels()
    loadLabelDefs()
    fetch('/api/users').then(r => r.json()).then(d => setStaffList(d.users ?? d)).catch(() => {})
  }, [loadChannels, loadLabelDefs])

  const exitSelectionMode = () => {
    setSelectionMode(false)
    setSelectedMsgIds(new Set())
  }

  const toggleMsgSelect = (msgId: string) => {
    setSelectedMsgIds(prev => {
      const next = new Set(prev)
      if (next.has(msgId)) next.delete(msgId)
      else next.add(msgId)
      return next
    })
  }

  const loadAISuggestions = async () => {
    if (!activeChannel || selectedMsgIds.size === 0) return
    setLoadingSuggestions(true)
    setSuggestedTitles([])
    try {
      const selectedMsgs = chatMessages
        .filter(m => selectedMsgIds.has(m.id))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

      const res = await fetch('/api/line/ai/suggest-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: selectedMsgs.map(m => ({
            displayName: m.displayName,
            content: m.content,
            messageType: m.messageType,
            identityType: m.identityType,
            lineUserId: m.lineUserId,
          })),
          channelId: activeChannel.id,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setSuggestedTitles(data.titles || [])
        setAssigneeReason(data.assigneeReason || null)
        setAssigneeSource(data.assigneeSource || null)
        setRequiredSkills(data.requiredSkills || [])
        if (data.suggestedAssignee) {
          createEventForm.setFieldsValue({ assigneeId: data.suggestedAssignee.id })
        }
      }
    } catch { /* ignore */ }
    finally { setLoadingSuggestions(false) }
  }

  const handleCreateEventFromMessages = async (values: { title: string; priority: string; description?: string; assigneeId?: string }) => {
    if (!activeChannel) return
    setCreatingEvent(true)
    try {
      const selectedMsgs = chatMessages
        .filter(m => selectedMsgIds.has(m.id))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

      const msgContext = selectedMsgs
        .map(m => `${m.displayName}: ${m.content || `[${m.messageType}]`}`)
        .join('\n')

      const description = values.description
        ? `${values.description}\n\n[訊息記錄]\n${msgContext}`
        : `[訊息記錄]\n${msgContext}`

      const res = await fetch('/api/line/line-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: values.title,
          description,
          priority: values.priority,
          assigneeId: values.assigneeId,
          channelIds: [{ channelId: activeChannel.id, startMessageId: selectedMsgs[0]?.id ?? null }],
        }),
      })
      if (res.ok) {
        message.success('事件已建立')
        createEventForm.resetFields()
        setCreateEventOpen(false)
        exitSelectionMode()
      } else {
        message.error('建立失敗')
      }
    } finally {
      setCreatingEvent(false)
    }
  }

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

  // Filter channels by search, follow-up, labels, and status
  const filteredChannels = channels
    .filter(c => {
      if (filterFollowUp && !c.needsFollowUp) return false
      if (filterStatus.length > 0 && !filterStatus.includes(c.status || 'CLEAR')) return false
      // Label filter
      if (filterLabels.length > 0) {
        const channelLabelIds = (c.labels || []).map(l => l.labelId)
        if (!filterLabels.some(fl => channelLabelIds.includes(fl))) return false
      }
      if (!searchText) return true
      const search = searchText.toLowerCase()
      return (
        (c.channelName || '').toLowerCase().includes(search) ||
        (c.partnerName || '').toLowerCase().includes(search) ||
        c.associations.some(a => (a.partnerName || '').toLowerCase().includes(search))
      )
    })
    .sort((a, b) => {
      // 狀態排序：OPEN > IN_PROGRESS > CLEAR
      const statusOrder: Record<string, number> = { OPEN: 0, IN_PROGRESS: 1, CLEAR: 2 }
      const aOrder = statusOrder[a.status || 'CLEAR'] ?? 2
      const bOrder = statusOrder[b.status || 'CLEAR'] ?? 2
      if (aOrder !== bOrder) return aOrder - bOrder
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
                <Tooltip title={soundEnabled ? '關閉聲音通知' : '開啟聲音通知'}>
                  <Button
                    type="text"
                    size="small"
                    icon={soundEnabled ? <BellFilled style={{ color: '#1890ff' }} /> : <BellOutlined style={{ color: '#bbb' }} />}
                    onClick={() => setSoundEnabled(v => {
                      const next = !v
                      try { localStorage.setItem('line_sound_notify', next ? 'on' : 'off') } catch {}
                      return next
                    })}
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
            <Space style={{ width: '100%' }}>
              <Input
                prefix={<SearchOutlined style={{ color: '#bbb' }} />}
                placeholder="搜尋頻道或客戶..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                allowClear
                style={{ flex: 1 }}
              />
              <Popover
                trigger="click"
                open={labelPopoverOpen}
                onOpenChange={setLabelPopoverOpen}
                placement="bottomRight"
                content={
                  <div style={{ minWidth: 180 }}>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
                      按狀態篩選
                    </Text>
                    {Object.entries(CHANNEL_STATUS).map(([key, val]) => (
                      <div key={key} style={{ marginBottom: 4 }}>
                        <Checkbox
                          checked={filterStatus.includes(key)}
                          onChange={e => {
                            setFilterStatus(prev =>
                              e.target.checked ? [...prev, key] : prev.filter(s => s !== key)
                            )
                          }}
                        >
                          <Tag color={val.tagColor} style={{ fontSize: 11 }}>{val.label}</Tag>
                        </Checkbox>
                      </div>
                    ))}
                    <Divider style={{ margin: '8px 0' }} />
                    <div style={{ marginBottom: 8 }}>
                      <Checkbox
                        checked={filterFollowUp}
                        onChange={e => setFilterFollowUp(e.target.checked)}
                      >
                        <FlagFilled style={{ color: '#ff4d4f', marginRight: 4 }} />
                        只看追蹤中
                      </Checkbox>
                    </div>
                    {labelDefs.length > 0 && (
                      <>
                        <Divider style={{ margin: '8px 0' }} />
                        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
                          按標籤篩選
                        </Text>
                        {labelDefs.map(ld => (
                          <div key={ld.id} style={{ marginBottom: 4 }}>
                            <Checkbox
                              checked={filterLabels.includes(ld.id)}
                              onChange={e => {
                                setFilterLabels(prev =>
                                  e.target.checked
                                    ? [...prev, ld.id]
                                    : prev.filter(id => id !== ld.id)
                                )
                              }}
                            >
                              <Tag color={ld.color} style={{ fontSize: 11 }}>{ld.label}</Tag>
                            </Checkbox>
                          </div>
                        ))}
                      </>
                    )}
                    {(filterLabels.length > 0 || filterFollowUp || filterStatus.length > 0) && (
                      <Button
                        type="link"
                        size="small"
                        onClick={() => { setFilterLabels([]); setFilterFollowUp(false); setFilterStatus([]) }}
                        style={{ padding: 0, fontSize: 11 }}
                      >
                        清除所有篩選
                      </Button>
                    )}
                  </div>
                }
              >
                <Tooltip title="篩選">
                  <Badge count={filterLabels.length + (filterFollowUp ? 1 : 0) + filterStatus.length} size="small">
                    <Button
                      type={(filterFollowUp || filterLabels.length > 0 || filterStatus.length > 0) ? 'primary' : 'text'}
                      icon={<TagsOutlined />}
                      size="small"
                      danger={filterFollowUp || filterLabels.length > 0 || filterStatus.length > 0}
                    />
                  </Badge>
                </Tooltip>
              </Popover>
            </Space>
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
                      paddingLeft: hasUpdate ? 13 : 16,
                      cursor: 'pointer',
                      backgroundColor: isActive ? '#e6f7e6' : hasUpdate ? '#fffbe6' : 'transparent',
                      borderBottom: '1px solid #f5f5f5',
                      borderLeft: hasUpdate ? '3px solid #faad14' : '3px solid transparent',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = hasUpdate ? '#fff3cc' : '#fafafa' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = hasUpdate ? '#fffbe6' : 'transparent' }}
                  >
                    <Badge dot={hasUpdate} color="#faad14" offset={[-4, 4]} styles={{ indicator: { width: 10, height: 10, boxShadow: '0 0 0 2px #fff' } }}>
                      <Avatar
                        size={44}
                        style={{ backgroundColor: '#00B900', flexShrink: 0 }}
                        icon={getChannelTypeIcon(channel.channelType)}
                      />
                    </Badge>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                          {channel.needsFollowUp && (
                            <FlagFilled style={{ color: '#ff4d4f', fontSize: 12, flexShrink: 0 }} />
                          )}
                          <Text strong ellipsis style={{ maxWidth: channel.needsFollowUp ? 145 : 160, color: hasUpdate ? '#d46b08' : undefined }}>
                            {channel.channelName || channel.lineChannelId}
                          </Text>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          {hasUpdate && (
                            <Tag color="warning" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0, fontWeight: 600 }}>
                              新訊息
                            </Tag>
                          )}
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {getChannelPreview(channel)}
                          </Text>
                        </div>
                      </div>
                      <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {getChannelTypeLabel(channel.channelType)}
                          {' · '}
                          {channel.messageCount} 則
                        </Text>
                        {channel.status && channel.status !== 'CLEAR' && CHANNEL_STATUS[channel.status] && (
                          <Tag
                            color={CHANNEL_STATUS[channel.status].tagColor}
                            style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}
                          >
                            {CHANNEL_STATUS[channel.status].label}
                          </Tag>
                        )}
                      </div>
                      {/* Labels */}
                      {channel.labels && channel.labels.length > 0 && (
                        <div style={{ marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                          {channel.labels.map(cl => {
                            const def = getLabelDef(cl.labelId)
                            if (!def) return null
                            return (
                              <Tag
                                key={cl.id}
                                color={def.color}
                                style={{
                                  fontSize: 10,
                                  lineHeight: '16px',
                                  padding: '0 4px',
                                  margin: 0,
                                  borderStyle: cl.source === 'llm' ? 'dashed' : 'solid',
                                }}
                              >
                                {def.label}
                              </Tag>
                            )
                          })}
                        </div>
                      )}
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
                <Space size={4} wrap>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {getChannelTypeLabel(activeChannel.channelType)}
                  </Text>
                  {activeChannel.partnerName && (
                    <Tag color="blue" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                      {activeChannel.partnerName}
                    </Tag>
                  )}
                  {(activeChannel.labels || []).map(cl => {
                    const def = getLabelDef(cl.labelId)
                    if (!def) return null
                    return (
                      <Tag
                        key={cl.id}
                        color={def.color}
                        style={{
                          fontSize: 10,
                          lineHeight: '16px',
                          padding: '0 4px',
                          margin: 0,
                          borderStyle: cl.source === 'llm' ? 'dashed' : 'solid',
                        }}
                      >
                        {def.label}
                      </Tag>
                    )
                  })}
                </Space>
              </div>
              <Popover
                trigger="click"
                open={headerLabelPopoverOpen}
                onOpenChange={setHeaderLabelPopoverOpen}
                placement="bottomRight"
                content={
                  <div style={{ minWidth: 200 }}>
                    <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                      頻道標籤
                    </Text>
                    {labelDefs.map(ld => {
                      const existing = (activeChannel.labels || []).find(l => l.labelId === ld.id)
                      const hasLabel = !!existing
                      const isLLM = existing?.source === 'llm'
                      return (
                        <div
                          key={ld.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '4px 0',
                          }}
                        >
                          <Tag
                            color={ld.color}
                            style={{
                              cursor: 'pointer',
                              borderStyle: isLLM ? 'dashed' : 'solid',
                            }}
                            onClick={() => toggleChannelLabel(activeChannel.id, ld.id, hasLabel)}
                          >
                            {hasLabel ? <CheckOutlined style={{ marginRight: 4 }} /> : <PlusOutlined style={{ marginRight: 4 }} />}
                            {ld.label}
                          </Tag>
                          {isLLM && existing?.confidence && (
                            <Text type="secondary" style={{ fontSize: 10 }}>
                              AI {Math.round(existing.confidence * 100)}%
                            </Text>
                          )}
                        </div>
                      )
                    })}
                    <Divider style={{ margin: '8px 0' }} />
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>頻道狀態</Text>
                    <Space orientation="vertical" style={{ width: '100%' }}>
                      {Object.entries(CHANNEL_STATUS).map(([key, val]) => {
                        const isActive = (activeChannel.status || 'OPEN') === key
                        return (
                          <Tag
                            key={key}
                            color={isActive ? val.tagColor : 'default'}
                            style={{ cursor: 'pointer', width: '100%', textAlign: 'center', margin: 0 }}
                            onClick={() => !isActive && changeChannelStatus(activeChannel, key)}
                          >
                            {isActive && <CheckOutlined style={{ marginRight: 4 }} />}
                            {val.label}
                          </Tag>
                        )
                      })}
                    </Space>
                    <Divider style={{ margin: '8px 0' }} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Checkbox
                        checked={activeChannel.needsFollowUp}
                        onChange={() => toggleFollowUp(activeChannel)}
                      >
                        <FlagFilled style={{ color: '#ff4d4f', marginRight: 4 }} />
                        <Text style={{ fontSize: 12 }}>舊版追蹤</Text>
                      </Checkbox>
                    </div>
                  </div>
                }
              >
                <Tooltip title="管理標籤">
                  <Badge count={(activeChannel.labels || []).length} size="small" offset={[-4, 4]}>
                    <Button
                      type="text"
                      icon={<TagsOutlined />}
                    />
                  </Badge>
                </Tooltip>
              </Popover>
              <Tooltip title={showEventsPanel ? '關閉事件面板' : '事件管理'}>
                <Button
                  type={showEventsPanel ? 'primary' : 'text'}
                  icon={<CalendarOutlined />}
                  onClick={() => setShowEventsPanel(v => !v)}
                />
              </Tooltip>
              <Tooltip title={selectionMode ? '退出選取' : '選取訊息建立事件'}>
                <Button
                  type={selectionMode ? 'primary' : 'text'}
                  icon={<CheckSquareOutlined />}
                  onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
                />
              </Tooltip>
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
                          alignItems: 'flex-start',
                          cursor: selectionMode ? 'pointer' : 'default',
                          backgroundColor: selectionMode && selectedMsgIds.has(msg.id) ? 'rgba(0,185,0,0.08)' : undefined,
                          borderRadius: 8,
                          padding: selectionMode ? '4px 8px' : undefined,
                        }}
                        onClick={selectionMode ? () => toggleMsgSelect(msg.id) : undefined}
                      >
                        {selectionMode && (
                          <Checkbox
                            checked={selectedMsgIds.has(msg.id)}
                            style={{ alignSelf: 'center', flexShrink: 0 }}
                            onClick={e => e.stopPropagation()}
                            onChange={() => toggleMsgSelect(msg.id)}
                          />
                        )}
                        {!isStaff && (
                          <Avatar
                            size={32}
                            src={msg.pictureUrl}
                            icon={<UserOutlined />}
                          />
                        )}
                        <div style={{ maxWidth: '70%' }} className="line-msg-row">
                          <div style={{ textAlign: isStaff ? 'right' : 'left' }}>
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
                          </div>
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

            {/* Selection mode action bar */}
            {selectionMode && (
              <div style={{
                padding: '8px 16px',
                backgroundColor: selectedMsgIds.size > 0 ? '#e6f7ff' : '#fafafa',
                borderTop: '1px solid #d9d9d9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <Text style={{ fontSize: 13 }}>
                  {selectedMsgIds.size > 0 ? `已選取 ${selectedMsgIds.size} 則訊息` : '點選訊息以選取'}
                </Text>
                <Space>
                  <Button size="small" onClick={exitSelectionMode}>取消</Button>
                  <Button
                    type="primary"
                    size="small"
                    icon={<PlusOutlined />}
                    disabled={selectedMsgIds.size === 0}
                    onClick={() => { setCreateEventOpen(true); loadAISuggestions() }}
                  >
                    建立事件
                  </Button>
                </Space>
              </div>
            )}

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
                onSearch={() => { mentionActiveRef.current = true }}
                onSelect={() => { mentionActiveRef.current = false }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    if (mentionActiveRef.current) return
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

        {/* Right: Events panel */}
        {activeChannel && showEventsPanel && (
          <div style={{
            width: 320,
            borderLeft: '1px solid #f0f0f0',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#fafafa',
            flexShrink: 0,
            overflow: 'hidden',
          }}>
            <LineEventPanel
              channelId={activeChannel.id}
              onNavigateToEvents={() => window.open('/line-events', '_blank')}
            />
          </div>
        )}
      </div>
      {/* Create event from messages modal */}
      <Modal
        title={<Space><CheckSquareOutlined />從訊息建立事件</Space>}
        open={createEventOpen}
        onCancel={() => { setCreateEventOpen(false); createEventForm.resetFields(); setSuggestedTitles([]); setAssigneeReason(null); setAssigneeSource(null); setRequiredSkills([]) }}
        onOk={() => createEventForm.submit()}
        confirmLoading={creatingEvent}
        okText="建立"
        cancelText="取消"
        width={500}
        destroyOnHidden
      >
        <Form form={createEventForm} layout="vertical" onFinish={handleCreateEventFromMessages} style={{ marginTop: 12 }}>
          {/* AI 建議標題 */}
          <Form.Item label={
            <Space>
              <RobotOutlined style={{ color: '#1890ff' }} />
              <span>AI 建議標題</span>
              {loadingSuggestions && <Spin size="small" />}
            </Space>
          }>
            {loadingSuggestions ? (
              <div style={{ color: '#999', fontSize: 12 }}>AI 分析中...</div>
            ) : suggestedTitles.length > 0 ? (
              <Space wrap>
                {suggestedTitles.map((t, i) => (
                  <Tag
                    key={i}
                    color="blue"
                    style={{ cursor: 'pointer', padding: '4px 8px', fontSize: 12 }}
                    onClick={() => createEventForm.setFieldsValue({ title: t })}
                  >
                    {t}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Button size="small" icon={<RobotOutlined />} onClick={loadAISuggestions}>重新產生</Button>
            )}
          </Form.Item>

          <Form.Item name="title" label="事件標題" rules={[{ required: true, message: '請輸入標題' }]}>
            <Input placeholder="點選上方建議或自行輸入" />
          </Form.Item>
          <Form.Item name="priority" label="優先級" initialValue="NORMAL">
            <Select options={[
              { value: 'P1', label: <Tag color="red">P1 緊急</Tag> },
              { value: 'P2', label: <Tag color="orange">P2 重要</Tag> },
              { value: 'NORMAL', label: <Tag>一般</Tag> },
            ]} />
          </Form.Item>
          {!loadingSuggestions && requiredSkills.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>偵測到需要技能：</Text>
              {requiredSkills.map(s => <Tag key={s} color="purple" style={{ fontSize: 11 }}>{s}</Tag>)}
            </div>
          )}
          <Form.Item name="assigneeId" label={
            <Space>
              <span>指派給</span>
              {!loadingSuggestions && assigneeSource && (() => {
                const sourceMap: Record<string, { label: string; color: string }> = {
                  channel: { label: '頻道歷史', color: 'blue' },
                  partner: { label: '客戶歷史', color: 'cyan' },
                  skill: { label: '技能配對', color: 'green' },
                  llm: { label: 'AI 建議', color: 'purple' },
                }
                const s = sourceMap[assigneeSource]
                return s ? <Tag color={s.color} style={{ fontSize: 10 }}>{s.label}{assigneeReason ? `：${assigneeReason}` : ''}</Tag> : null
              })()}
              {loadingSuggestions && <Spin size="small" />}
            </Space>
          }>
            <Select
              allowClear placeholder="選擇處理人（選填）"
              showSearch optionFilterProp="label"
              options={staffList.map(u => ({ value: u.id, label: u.name || u.email }))}
            />
          </Form.Item>
          <Form.Item name="description" label="補充說明">
            <Input.TextArea rows={2} placeholder="（選填）額外說明" />
          </Form.Item>
          <div style={{ background: '#f5f5f5', borderRadius: 6, padding: '8px 12px', maxHeight: 140, overflow: 'auto' }}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
              已選取 {selectedMsgIds.size} 則訊息：
            </Text>
            {chatMessages
              .filter(m => selectedMsgIds.has(m.id))
              .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
              .map(m => (
                <div key={m.id} style={{ fontSize: 12, marginTop: 2 }}>
                  <Text strong style={{ fontSize: 11 }}>{m.displayName}: </Text>
                  <Text style={{ fontSize: 11 }}>{m.content || `[${m.messageType}]`}</Text>
                </div>
              ))}
          </div>
        </Form>
      </Modal>
    </AppLayout>
  )
}
