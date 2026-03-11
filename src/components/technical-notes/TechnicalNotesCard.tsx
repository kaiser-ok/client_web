'use client'

import { useState, useEffect } from 'react'
import { Card, Tag, Input, Select, Empty, Spin, Typography, Space, Collapse, Badge, Pagination } from 'antd'
import { FileTextOutlined, SearchOutlined, ClockCircleOutlined, UserOutlined } from '@ant-design/icons'

const { Text, Paragraph } = Typography
const { Search } = Input

interface TechnicalNote {
  id: string
  category: string
  title: string
  content: string
  participants: string[]
  keywords: string[]
  createdAt: string
}

interface TechnicalNotesCardProps {
  customerId: string
  limit?: number
}

// 分類對應的顏色和標籤
const CATEGORY_CONFIG: Record<string, { color: string; label: string }> = {
  technical: { color: 'blue', label: '技術討論' },
  maintenance: { color: 'orange', label: '維護作業' },
  security: { color: 'red', label: '資安相關' },
  speedtest: { color: 'cyan', label: '測速系統' },
  training: { color: 'purple', label: '內部訓練' },
  admin: { color: 'default', label: '行政事務' },
}

export default function TechnicalNotesCard({ customerId, limit }: TechnicalNotesCardProps) {
  const [notes, setNotes] = useState<TechnicalNote[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string | undefined>()
  const [categoryStats, setCategoryStats] = useState<Record<string, number>>({})
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = limit || 20

  useEffect(() => {
    fetchNotes()
  }, [customerId, search, category, page])

  const fetchNotes = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: ((page - 1) * pageSize).toString(),
      })
      if (search) params.set('search', search)
      if (category) params.set('category', category)

      const response = await fetch(`/api/customers/${customerId}/technical-notes?${params}`)
      if (response.ok) {
        const data = await response.json()
        setNotes(data.notes)
        setTotal(data.total)
        setCategoryStats(data.categoryStats || {})
      }
    } catch (error) {
      console.error('Failed to fetch technical notes:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const categoryOptions = Object.entries(CATEGORY_CONFIG).map(([key, config]) => ({
    value: key,
    label: (
      <Space>
        <Tag color={config.color}>{config.label}</Tag>
        {categoryStats[key] && <Badge count={categoryStats[key]} style={{ backgroundColor: '#999' }} />}
      </Space>
    ),
  }))

  return (
    <Card
      title={
        <Space>
          <FileTextOutlined />
          <span>技術文件</span>
          {total > 0 && <Badge count={total} style={{ backgroundColor: '#1890ff' }} />}
        </Space>
      }
      extra={
        <Space>
          <Select
            allowClear
            placeholder="篩選分類"
            style={{ width: 160 }}
            options={categoryOptions}
            value={category}
            onChange={(val) => {
              setCategory(val)
              setPage(1)
            }}
          />
          <Search
            placeholder="搜尋關鍵字"
            allowClear
            style={{ width: 200 }}
            onSearch={(val) => {
              setSearch(val)
              setPage(1)
            }}
            prefix={<SearchOutlined />}
          />
        </Space>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : notes.length === 0 ? (
        <Empty description="目前沒有技術文件" />
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notes.map((note) => {
              const config = CATEGORY_CONFIG[note.category] || { color: 'default', label: note.category }
              return (
                <div key={note.id} style={{ borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
                  <Collapse
                    ghost
                    items={[
                      {
                        key: note.id,
                        label: (
                          <Space orientation="vertical" size={4} style={{ width: '100%' }}>
                            <Space wrap>
                              <Tag color={config.color}>{config.label}</Tag>
                              <Text strong>{note.title}</Text>
                            </Space>
                            <Space size="middle" style={{ fontSize: 12, color: '#999' }}>
                              <span>
                                <ClockCircleOutlined /> {formatDate(note.createdAt)}
                              </span>
                              {note.participants.length > 0 && (
                                <span>
                                  <UserOutlined /> {note.participants.slice(0, 3).join(', ')}
                                  {note.participants.length > 3 && ` +${note.participants.length - 3}`}
                                </span>
                              )}
                            </Space>
                            {note.keywords.length > 0 && (
                              <Space size={4} wrap>
                                {note.keywords.slice(0, 5).map((kw, idx) => (
                                  <Tag key={idx} style={{ fontSize: 11 }}>
                                    {kw}
                                  </Tag>
                                ))}
                              </Space>
                            )}
                          </Space>
                        ),
                        children: (
                          <Paragraph
                            style={{
                              whiteSpace: 'pre-wrap',
                              backgroundColor: '#fafafa',
                              padding: 12,
                              borderRadius: 4,
                              maxHeight: 300,
                              overflow: 'auto',
                            }}
                          >
                            {note.content}
                          </Paragraph>
                        ),
                      },
                    ]}
                  />
                </div>
              )
            })}
          </div>
          {!limit && total > pageSize && (
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Pagination
                current={page}
                pageSize={pageSize}
                total={total}
                onChange={setPage}
                showSizeChanger={false}
                size="small"
              />
            </div>
          )}
        </>
      )}
    </Card>
  )
}
