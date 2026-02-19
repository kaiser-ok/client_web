'use client'

import { useState } from 'react'
import { Modal, Input, Button, List, Tag, Space, App, Popconfirm, Empty } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(res => res.json())

interface Category {
  id: string | null
  name: string
  source: 'db' | 'kb' | 'both'
  createdBy: string | null
  createdAt: string | null
}

interface CategoriesResponse {
  categories: Category[]
}

interface Props {
  open: boolean
  onClose: () => void
  onCategoriesChanged: () => void
}

const sourceConfig = {
  db: { label: '自訂', color: 'blue' },
  kb: { label: '產品庫', color: 'default' },
  both: { label: '產品庫+自訂', color: 'green' },
} as const

export default function CategoryManageModal({ open, onClose, onCategoriesChanged }: Props) {
  const { message } = App.useApp()
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data, isLoading, mutate } = useSWR<CategoriesResponse>(
    open ? '/api/products/categories' : null,
    fetcher
  )

  const categories = data?.categories || []

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name) {
      message.warning('請輸入分類名稱')
      return
    }

    setAdding(true)
    try {
      const res = await fetch('/api/products/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || '新增失敗')
      }

      message.success(`已新增分類「${name}」`)
      setNewName('')
      mutate()
      onCategoriesChanged()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '新增失敗')
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/products/categories?id=${id}`, { method: 'DELETE' })
      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || '刪除失敗')
      }

      message.success(`已刪除分類「${name}」`)
      mutate()
      onCategoriesChanged()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '刪除失敗')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Modal
      title="分類管理"
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
    >
      <div style={{ marginBottom: 16 }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="輸入新分類名稱"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onPressEnter={handleAdd}
            disabled={adding}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            loading={adding}
          >
            新增
          </Button>
        </Space.Compact>
      </div>

      <List
        loading={isLoading}
        dataSource={categories}
        locale={{ emptyText: <Empty description="尚無分類" /> }}
        size="small"
        style={{ maxHeight: 400, overflow: 'auto' }}
        renderItem={(item) => {
          const config = sourceConfig[item.source]
          const canDelete = item.source === 'db' || item.source === 'both'
          const hasDbRecord = item.id != null

          return (
            <List.Item
              actions={
                canDelete && hasDbRecord
                  ? [
                      <Popconfirm
                        key="delete"
                        title={`確定要刪除自訂分類「${item.name}」？`}
                        description={
                          item.source === 'both'
                            ? '僅刪除自訂記錄，產品庫來源仍會顯示'
                            : undefined
                        }
                        onConfirm={() => handleDelete(item.id!, item.name)}
                        okText="刪除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                      >
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          loading={deletingId === item.id}
                        />
                      </Popconfirm>,
                    ]
                  : undefined
              }
            >
              <Space>
                <span>{item.name}</span>
                <Tag color={config.color}>{config.label}</Tag>
              </Space>
            </List.Item>
          )
        }}
      />
    </Modal>
  )
}
