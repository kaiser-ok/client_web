'use client'

import { useState, useEffect } from 'react'
import { Table, Select, Card, App, Tag, Avatar, Space, Typography, Button, Popconfirm } from 'antd'
import { UserOutlined, StopOutlined, CheckCircleOutlined, DeleteOutlined } from '@ant-design/icons'
import { useUser } from '@/hooks/useUser'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import type { ColumnsType } from 'antd/es/table'

const { Title } = Typography

interface User {
  id: string
  email: string
  name: string | null
  image: string | null
  role: string
  active: boolean
  createdAt: string
  updatedAt: string
}

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: '管理員', color: 'red' },
  { value: 'SALES', label: '業務', color: 'blue' },
  { value: 'FINANCE', label: '財務', color: 'green' },
  { value: 'SUPPORT', label: '服務支援', color: 'orange' },
  { value: 'RD', label: '研發', color: 'purple' },
]

export default function AdminUsersPage() {
  const { message } = App.useApp()
  const { role, user, isLoading: userLoading, isAuthenticated } = useUser()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    if (!userLoading && isAuthenticated && role !== 'ADMIN') {
      message.error('權限不足')
      router.push('/')
    }
  }, [role, userLoading, isAuthenticated, router])

  useEffect(() => {
    if (role === 'ADMIN') {
      fetchUsers()
    }
  }, [role])

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users', { credentials: 'include' })
      if (!res.ok) throw new Error('載入失敗')
      const data = await res.json()
      setUsers(data)
    } catch {
      message.error('載入使用者失敗')
    } finally {
      setLoading(false)
    }
  }

  const handleRoleChange = async (uid: string, newRole: string) => {
    setUpdating(uid)
    try {
      const res = await fetch(`/api/users/${uid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role: newRole }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '更新失敗')
      }

      const updatedUser = await res.json()
      setUsers(users.map(u => u.id === uid ? updatedUser : u))
      message.success('角色已更新')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新失敗')
    } finally {
      setUpdating(null)
    }
  }

  const handleToggleActive = async (uid: string) => {
    setUpdating(uid)
    try {
      const res = await fetch(`/api/users/${uid}`, {
        method: 'PATCH',
        credentials: 'include',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '操作失敗')
      }

      const updatedUser = await res.json()
      setUsers(users.map(u => u.id === uid ? updatedUser : u))
      message.success(updatedUser.active ? '已啟用' : '已停用')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '操作失敗')
    } finally {
      setUpdating(null)
    }
  }

  const handleDelete = async (uid: string) => {
    setUpdating(uid)
    try {
      const res = await fetch(`/api/users/${uid}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '刪除失敗')
      }

      setUsers(users.filter(u => u.id !== uid))
      message.success('使用者已刪除')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '刪除失敗')
    } finally {
      setUpdating(null)
    }
  }

  const getRoleTag = (r: string) => {
    const option = ROLE_OPTIONS.find(o => o.value === r)
    return option ? (
      <Tag color={option.color}>{option.label}</Tag>
    ) : (
      <Tag>{r}</Tag>
    )
  }

  const columns: ColumnsType<User> = [
    {
      title: '使用者',
      key: 'user',
      render: (_, record) => (
        <Space>
          <Avatar src={record.image} icon={<UserOutlined />} style={!record.active ? { opacity: 0.4 } : undefined} />
          <div>
            <div style={!record.active ? { color: '#999' } : undefined}>
              {record.name || '未設定'}
              {!record.active && <Tag color="default" style={{ marginLeft: 8 }}>已停用</Tag>}
            </div>
            <div style={{ fontSize: 12, color: '#999' }}>{record.email}</div>
          </div>
        </Space>
      ),
    },
    {
      title: '目前角色',
      dataIndex: 'role',
      key: 'currentRole',
      render: (r: string) => getRoleTag(r),
    },
    {
      title: '變更角色',
      key: 'changeRole',
      render: (_, record) => (
        <Select
          value={record.role}
          onChange={(value) => handleRoleChange(record.id, value)}
          loading={updating === record.id}
          disabled={updating !== null || !record.active}
          style={{ width: 140 }}
          options={ROLE_OPTIONS.map(r => ({
            value: r.value,
            label: r.label,
          }))}
        />
      ),
    },
    {
      title: '建立時間',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleDateString('zh-TW'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_, record) => {
        const isSelf = record.id === user?.id
        if (isSelf) return <span style={{ color: '#999', fontSize: 12 }}>目前登入</span>
        return (
          <Space>
            <Popconfirm
              title={record.active ? '確定要停用此使用者？' : '確定要啟用此使用者？'}
              description={record.active ? '停用後該使用者將無法登入' : '啟用後該使用者可正常登入'}
              onConfirm={() => handleToggleActive(record.id)}
              okText="確定"
              cancelText="取消"
            >
              <Button
                type="text"
                size="small"
                icon={record.active ? <StopOutlined /> : <CheckCircleOutlined />}
                loading={updating === record.id}
                danger={record.active}
                style={!record.active ? { color: '#52c41a' } : undefined}
              >
                {record.active ? '停用' : '啟用'}
              </Button>
            </Popconfirm>
            <Popconfirm
              title="確定要刪除此使用者？"
              description="刪除後將無法恢復"
              onConfirm={() => handleDelete(record.id)}
              okText="確定"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                loading={updating === record.id}
              >
                刪除
              </Button>
            </Popconfirm>
          </Space>
        )
      },
    },
  ]

  if (userLoading || role !== 'ADMIN') {
    return null
  }

  return (
    <AppLayout>
      <Title level={4} style={{ marginBottom: 24 }}>使用者管理</Title>
      <Card>
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>
    </AppLayout>
  )
}
