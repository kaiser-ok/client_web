'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Card,
  Input,
  Button,
  Typography,
  Spin,
  Empty,
  Select,
  Tag,
  Collapse,
  Tooltip,
  message,
} from 'antd'
import {
  SendOutlined,
  RobotOutlined,
  UserOutlined,
  FileTextOutlined,
  ClearOutlined,
  MessageOutlined,
  LineOutlined,
  MailOutlined,
} from '@ant-design/icons'
import AppLayout from '@/components/layout/AppLayout'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  const parseInline = (text: string): React.ReactNode => {
    // Bold + italic, bold, italic, code, then plain text
    const parts = text.split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
    return parts.map((part, idx) => {
      if (part.startsWith('***') && part.endsWith('***')) return <strong key={idx}><em>{part.slice(3, -3)}</em></strong>
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={idx}>{part.slice(2, -2)}</strong>
      if (part.startsWith('*') && part.endsWith('*')) return <em key={idx}>{part.slice(1, -1)}</em>
      if (part.startsWith('`') && part.endsWith('`')) return <code key={idx} className="md-code">{part.slice(1, -1)}</code>
      return part
    })
  }

  while (i < lines.length) {
    const line = lines[i]

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      elements.push(<pre key={i} className="md-pre"><code>{codeLines.join('\n')}</code></pre>)
      i++
      continue
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && lines[i + 1].match(/^\|?[\s\-|]+\|?$/)) {
      const headers = line.split('|').map(h => h.trim()).filter(Boolean)
      i += 2 // skip separator
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(lines[i].split('|').map(c => c.trim()).filter(Boolean))
        i++
      }
      elements.push(
        <table key={i} className="md-table">
          <thead><tr>{headers.map((h, hi) => <th key={hi}>{parseInline(h)}</th>)}</tr></thead>
          <tbody>{rows.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{parseInline(cell)}</td>)}</tr>)}</tbody>
        </table>
      )
      continue
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
    if (headingMatch) {
      const level = headingMatch[1].length as 1|2|3|4|5|6
      const Tag = `h${level}` as keyof JSX.IntrinsicElements
      elements.push(<Tag key={i} className={`md-h${level}`}>{parseInline(headingMatch[2])}</Tag>)
      i++
      continue
    }

    // Unordered list
    if (line.match(/^[-*+]\s+/)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^[-*+]\s+/)) {
        items.push(lines[i].replace(/^[-*+]\s+/, ''))
        i++
      }
      elements.push(<ul key={i} className="md-ul">{items.map((item, idx) => <li key={idx}>{parseInline(item)}</li>)}</ul>)
      continue
    }

    // Ordered list
    if (line.match(/^\d+\.\s+/)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''))
        i++
      }
      elements.push(<ol key={i} className="md-ol">{items.map((item, idx) => <li key={idx}>{parseInline(item)}</li>)}</ol>)
      continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      elements.push(<blockquote key={i} className="md-blockquote">{parseInline(line.slice(2))}</blockquote>)
      i++
      continue
    }

    // HR
    if (line.match(/^[-*_]{3,}$/)) {
      elements.push(<hr key={i} className="md-hr" />)
      i++
      continue
    }

    // Empty line
    if (line.trim() === '') {
      i++
      continue
    }

    // Paragraph
    elements.push(<p key={i} className="md-p">{parseInline(line)}</p>)
    i++
  }

  return <div className="chat-markdown">{elements}</div>
}

interface Source {
  id: string
  sourceType: string
  sourceId: string
  preview: string
  similarity: number
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  timestamp: Date
}

interface Customer {
  id: string
  name: string
}

const SOURCE_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  LINE: { label: 'LINE', icon: <MessageOutlined />, color: 'green' },
  EMAIL: { label: 'Email', icon: <MailOutlined />, color: 'blue' },
  ACTIVITY: { label: '活動', icon: <FileTextOutlined />, color: 'purple' },
  DEAL: { label: '訂單', icon: <FileTextOutlined />, color: 'gold' },
  FILE: { label: '檔案', icon: <FileTextOutlined />, color: 'orange' },
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<string | undefined>()
  const [sourceType, setSourceType] = useState<string | undefined>()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Fetch customers for filter
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const res = await fetch('/api/customers?limit=100', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          setCustomers(data.customers || [])
        }
      } catch (error) {
        console.error('Error fetching customers:', error)
      }
    }
    fetchCustomers()
  }, [])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/rag/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          query: userMessage.content,
          partnerId: selectedCustomer,
          sourceType,
          limit: 5,
        }),
      })

      if (!res.ok) {
        throw new Error('請求失敗')
      }

      const data = await res.json()

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.answer,
        sources: data.sources,
        timestamp: new Date(),
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Chat error:', error)
      message.error('發送訊息時發生錯誤')

      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: '抱歉，處理您的問題時發生錯誤。請稍後再試。',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }, [input, loading, selectedCustomer, sourceType])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([])
  }

  const getSourceConfig = (type: string) => {
    return SOURCE_TYPE_CONFIG[type] || { label: type, icon: <FileTextOutlined />, color: 'default' }
  }

  return (
    <AppLayout>
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>
            <RobotOutlined style={{ marginRight: 8 }} />
            AI 助理
          </Title>
          <div style={{ display: 'flex', gap: 8 }}>
            <Select
              allowClear
              placeholder="選擇客戶篩選"
              style={{ width: 180 }}
              value={selectedCustomer}
              onChange={setSelectedCustomer}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={customers.map(c => ({ value: c.id, label: c.name }))}
            />
            <Select
              allowClear
              placeholder="來源類型"
              style={{ width: 120 }}
              value={sourceType}
              onChange={setSourceType}
              options={[
                { value: 'LINE', label: 'LINE 訊息' },
                { value: 'EMAIL', label: 'Email' },
                { value: 'ACTIVITY', label: '活動記錄' },
                { value: 'DEAL', label: '訂單' },
                { value: 'FILE', label: '檔案' },
              ]}
            />
            <Tooltip title="清除對話">
              <Button
                icon={<ClearOutlined />}
                onClick={clearChat}
                disabled={messages.length === 0}
              />
            </Tooltip>
          </div>
        </div>

        {/* Messages Area */}
        <Card
          style={{
            flex: 1,
            overflow: 'auto',
            marginBottom: 16,
            background: '#fafafa',
          }}
          styles={{ body: { padding: 16 } }}
        >
          {messages.length === 0 ? (
            <Empty
              image={<RobotOutlined style={{ fontSize: 64, color: '#bfbfbf' }} />}
              description={
                <div>
                  <Text type="secondary">開始與 AI 助理對話</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    可以詢問客戶相關問題，AI 會從 LINE 訊息、活動記錄、訂單等資料中搜尋答案
                  </Text>
                </div>
              }
              style={{ marginTop: 60 }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      maxWidth: '80%',
                      background: msg.role === 'user' ? '#1890ff' : '#fff',
                      color: msg.role === 'user' ? '#fff' : 'inherit',
                      padding: '12px 16px',
                      borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      {msg.role === 'user' ? (
                        <UserOutlined />
                      ) : (
                        <RobotOutlined />
                      )}
                      <Text
                        style={{
                          fontSize: 12,
                          color: msg.role === 'user' ? 'rgba(255,255,255,0.8)' : '#999',
                        }}
                      >
                        {msg.role === 'user' ? '您' : 'AI 助理'}
                        {' · '}
                        {msg.timestamp.toLocaleTimeString('zh-TW', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </div>
                    {msg.role === 'user' ? (
                      <Paragraph
                        style={{
                          margin: 0,
                          whiteSpace: 'pre-wrap',
                          color: '#fff',
                        }}
                      >
                        {msg.content}
                      </Paragraph>
                    ) : (
                      <MarkdownRenderer content={msg.content} />
                    )}

                    {/* Sources */}
                    {msg.sources && msg.sources.length > 0 && (
                      <Collapse
                        ghost
                        size="small"
                        style={{ marginTop: 8 }}
                        items={[
                          {
                            key: 'sources',
                            label: (
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                參考來源 ({msg.sources.length})
                              </Text>
                            ),
                            children: (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {msg.sources.map((source, idx) => {
                                  const config = getSourceConfig(source.sourceType)
                                  return (
                                    <div
                                      key={source.id}
                                      style={{
                                        background: '#f5f5f5',
                                        padding: 8,
                                        borderRadius: 4,
                                        fontSize: 12,
                                      }}
                                    >
                                      <div style={{ marginBottom: 4 }}>
                                        <Tag color={config.color} icon={config.icon}>
                                          {config.label}
                                        </Tag>
                                        <Text type="secondary">
                                          相似度: {(source.similarity * 100).toFixed(0)}%
                                        </Text>
                                      </div>
                                      <Text type="secondary">{source.preview}</Text>
                                    </div>
                                  )
                                })}
                              </div>
                            ),
                          },
                        ]}
                      />
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div
                    style={{
                      background: '#fff',
                      padding: '12px 16px',
                      borderRadius: '16px 16px 16px 4px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    }}
                  >
                    <Spin size="small" />
                    <Text type="secondary" style={{ marginLeft: 8 }}>
                      AI 正在思考...
                    </Text>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </Card>

        {/* Input Area */}
        <div style={{ display: 'flex', gap: 8 }}>
          <TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="輸入您的問題... (Enter 發送, Shift+Enter 換行)"
            autoSize={{ minRows: 1, maxRows: 4 }}
            style={{ flex: 1 }}
            disabled={loading}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={sendMessage}
            loading={loading}
            disabled={!input.trim()}
            style={{ height: 'auto' }}
          >
            發送
          </Button>
        </div>
      </div>
    </AppLayout>
  )
}
