'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Card,
  Input,
  Button,
  Tag,
  Typography,
  Space,
  Spin,
  Empty,
  Tabs,
  Collapse,
  message,
} from 'antd'
import {
  SearchOutlined,
  MessageOutlined,
  SlackOutlined,
  MailOutlined,
  SendOutlined,
  RobotOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import AppLayout from '@/components/layout/AppLayout'

const { Text, Paragraph, Title } = Typography
const { TextArea } = Input

interface SearchResult {
  content: string
  platform: string
  timestamp: string
  sender?: string
  relevance_score: number
}

interface AskResponse {
  answer: string
  sources: Array<{
    index: number
    content: string
    score: number
  }>
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: Array<{
    index: number
    content: string
    score: number
  }>
  timestamp: Date
}

const platformIcons: Record<string, React.ReactNode> = {
  SLACK: <SlackOutlined style={{ color: '#4A154B' }} />,
  LINE: <MessageOutlined style={{ color: '#00B900' }} />,
  EMAIL: <MailOutlined style={{ color: '#EA4335' }} />,
  UNKNOWN: <FileTextOutlined />,
}

const platformColors: Record<string, string> = {
  SLACK: 'purple',
  LINE: 'green',
  EMAIL: 'red',
  UNKNOWN: 'default',
}

export default function KnowledgePage() {
  const [activeTab, setActiveTab] = useState('chat')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    setSearchLoading(true)
    try {
      const res = await fetch('/api/graphiti/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, limit: 20 }),
      })

      if (!res.ok) throw new Error('搜尋失敗')

      const data = await res.json()
      setSearchResults(data.results || [])
    } catch (error) {
      message.error('搜尋失敗')
      console.error(error)
    } finally {
      setSearchLoading(false)
    }
  }

  const handleAsk = async () => {
    if (!chatInput.trim()) return

    const userMessage: ChatMessage = {
      role: 'user',
      content: chatInput,
      timestamp: new Date(),
    }

    setChatMessages(prev => [...prev, userMessage])
    setChatInput('')
    setChatLoading(true)

    try {
      const res = await fetch('/api/graphiti/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: chatInput, contextMessages: 15 }),
      })

      if (!res.ok) throw new Error('查詢失敗')

      const data: { answer: string; sources: AskResponse['sources'] } = await res.json()

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.answer,
        sources: data.sources,
        timestamp: new Date(),
      }

      setChatMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      message.error('查詢失敗')
      console.error(error)

      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: '抱歉，查詢時發生錯誤，請稍後再試。',
        timestamp: new Date(),
      }
      setChatMessages(prev => [...prev, errorMessage])
    } finally {
      setChatLoading(false)
    }
  }

  const renderSearchTab = () => (
    <div>
      <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
        <Input
          size="large"
          placeholder="搜尋訊息內容..."
          prefix={<SearchOutlined />}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onPressEnter={handleSearch}
        />
        <Button
          type="primary"
          size="large"
          icon={<SearchOutlined />}
          onClick={handleSearch}
          loading={searchLoading}
        >
          搜尋
        </Button>
      </Space.Compact>

      {searchLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : searchResults.length > 0 ? (
        <div>
          {searchResults.map((item, index) => (
            <div key={index} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ flexShrink: 0 }}>{platformIcons[item.platform] || platformIcons.UNKNOWN}</div>
              <div style={{ flex: 1 }}>
                <div style={{ marginBottom: 4 }}>
                  <Space>
                    <Tag color={platformColors[item.platform] || 'default'}>
                      {item.platform}
                    </Tag>
                    {item.sender && <Text type="secondary">{item.sender}</Text>}
                  </Space>
                </div>
                <Paragraph
                  style={{ marginBottom: 4 }}
                  ellipsis={{ rows: 3, expandable: true }}
                >
                  {item.content}
                </Paragraph>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {new Date(item.timestamp).toLocaleString('zh-TW')}
                </Text>
              </div>
            </div>
          ))}
        </div>
      ) : searchQuery ? (
        <Empty description="沒有找到相關訊息" />
      ) : (
        <Empty description="輸入關鍵字開始搜尋" />
      )}
    </div>
  )

  const renderChatTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 280px)' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0' }}>
        {chatMessages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <RobotOutlined style={{ fontSize: 48, color: '#1890ff', marginBottom: 16 }} />
            <Title level={4}>知識圖譜問答</Title>
            <Paragraph type="secondary">
              詢問關於客戶溝通記錄的問題，例如：
            </Paragraph>
            <Space orientation="vertical">
              <Button
                type="dashed"
                onClick={() => setChatInput('最近有哪些客戶反映問題？')}
              >
                最近有哪些客戶反映問題？
              </Button>
              <Button
                type="dashed"
                onClick={() => setChatInput('太奇雲端的客戶上次聯繫我們是什麼事情？')}
              >
                太奇雲端的客戶上次聯繫我們是什麼事情？
              </Button>
              <Button
                type="dashed"
                onClick={() => setChatInput('有哪些客戶詢問過報價或合約？')}
              >
                有哪些客戶詢問過報價或合約？
              </Button>
            </Space>
          </div>
        ) : (
          <div>
            {chatMessages.map((msg, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: 16,
                }}
              >
                <Card
                  size="small"
                  style={{
                    maxWidth: '80%',
                    backgroundColor: msg.role === 'user' ? '#1890ff' : '#f5f5f5',
                  }}
                  styles={{ body: { padding: '12px 16px' } }}
                >
                  <Paragraph
                    style={{
                      marginBottom: 0,
                      color: msg.role === 'user' ? '#fff' : 'inherit',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {msg.content}
                  </Paragraph>

                  {msg.sources && msg.sources.length > 0 && (
                    <Collapse
                      size="small"
                      style={{ marginTop: 12 }}
                      items={[
                        {
                          key: '1',
                          label: `參考來源 (${msg.sources.length})`,
                          children: (
                            <div>
                              {msg.sources.slice(0, 5).map((source: any) => (
                                <div key={source.index} style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    [{source.index}] {source.content}
                                  </Text>
                                </div>
                              ))}
                            </div>
                          ),
                        },
                      ]}
                    />
                  )}
                </Card>
              </div>
            ))}
            {chatLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16 }}>
                <Card size="small" style={{ backgroundColor: '#f5f5f5' }}>
                  <Spin size="small" /> 思考中...
                </Card>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
        <Space.Compact style={{ width: '100%' }}>
          <TextArea
            placeholder="輸入問題..."
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onPressEnter={e => {
              if (!e.shiftKey) {
                e.preventDefault()
                handleAsk()
              }
            }}
            autoSize={{ minRows: 1, maxRows: 4 }}
            style={{ resize: 'none' }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleAsk}
            loading={chatLoading}
            style={{ height: 'auto' }}
          >
            發送
          </Button>
        </Space.Compact>
      </div>
    </div>
  )

  return (
    <AppLayout>
      <div style={{ padding: 24 }}>
        <Title level={3} style={{ marginBottom: 24 }}>
          <RobotOutlined /> 知識圖譜
        </Title>

        <Card>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: 'chat',
                label: (
                  <span>
                    <RobotOutlined /> 智能問答
                  </span>
                ),
                children: renderChatTab(),
              },
              {
                key: 'search',
                label: (
                  <span>
                    <SearchOutlined /> 訊息搜尋
                  </span>
                ),
                children: renderSearchTab(),
              },
            ]}
          />
        </Card>
      </div>
    </AppLayout>
  )
}
