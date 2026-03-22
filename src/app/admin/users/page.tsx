'use client'

import { useState, useEffect } from 'react'
import {
  Table, Select, Card, App, Tag, Avatar, Space, Typography,
  Button, Popconfirm, Switch, Input, Tooltip,
} from 'antd'
import {
  UserOutlined, StopOutlined, CheckCircleOutlined, DeleteOutlined,
  CrownOutlined, ToolOutlined,
} from '@ant-design/icons'
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
  department: string | null
  isManager: boolean
  skills: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

function parseSkills(raw: string | null): string[] {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

const PREDEFINED_SKILLS = [
  '網路', '伺服器', '資安', '雲端', '客服',
  '業務', '財務', '軟體開發', '硬體', '資料庫',
  '虛擬化', 'Linux', 'Windows', '備份', 'AI/ML',
]

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
  // inline dept editing
  const [editingDept, setEditingDept] = useState<string | null>(null)
  const [deptValue, setDeptValue] = useState('')

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

  const updateUser = async (uid: string, patch: Record<string, unknown>) => {
    setUpdating(uid)
    try {
      const res = await fetch(`/api/users/${uid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '更新失敗')
      }
      const updatedUser = await res.json()
      setUsers(prev => prev.map(u => u.id === uid ? updatedUser : u))
      return true
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新失敗')
      return false
    } finally {
      setUpdating(null)
    }
  }

  const handleRoleChange = (uid: string, newRole: string) => {
    updateUser(uid, { role: newRole }).then(ok => ok && message.success('角色已更新'))
  }

  const handleManagerToggle = (uid: string, val: boolean) => {
    updateUser(uid, { isManager: val }).then(ok => ok && message.success(val ? '已設為部門主管' : '已取消主管身份'))
  }

  const handleSkillsChange = (uid: string, skills: string[]) => {
    updateUser(uid, { skills }).then(ok => ok && message.success('技能已更新'))
  }

  const handleDeptSave = async (uid: string) => {
    const ok = await updateUser(uid, { department: deptValue.trim() })
    if (ok) {
      message.success('部門已更新')
      setEditingDept(null)
    }
  }

  const handleToggleActive = async (uid: string) => {
    setUpdating(uid)
    try {
      const res = await fetch(`/api/users/${uid}`, { method: 'PATCH', credentials: 'include' })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || '操作失敗') }
      const updatedUser = await res.json()
      setUsers(prev => prev.map(u => u.id === uid ? updatedUser : u))
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
      const res = await fetch(`/api/users/${uid}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || '刪除失敗') }
      setUsers(prev => prev.filter(u => u.id !== uid))
      message.success('使用者已刪除')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '刪除失敗')
    } finally {
      setUpdating(null)
    }
  }

  const getRoleTag = (r: string) => {
    const option = ROLE_OPTIONS.find(o => o.value === r)
    return option ? <Tag color={option.color}>{option.label}</Tag> : <Tag>{r}</Tag>
  }

  const columns: ColumnsType<User> = [
    {
      title: '使用者',
      key: 'user',
      render: (_, record) => (
        <Space>
          <Avatar src={record.image} icon={<UserOutlined />} style={!record.active ? { opacity: 0.4 } : undefined} />
          <div>
            <Space size={4}>
              <span style={!record.active ? { color: '#999' } : undefined}>
                {record.name || '未設定'}
              </span>
              {record.isManager && (
                <Tooltip title="部門主管">
                  <CrownOutlined style={{ color: '#faad14' }} />
                </Tooltip>
              )}
              {!record.active && <Tag color="default">已停用</Tag>}
            </Space>
            <div style={{ fontSize: 12, color: '#999' }}>{record.email}</div>
          </div>
        </Space>
      ),
    },
    {
      title: '部門',
      key: 'department',
      width: 160,
      render: (_, record) => {
        const isSelf = record.id === user?.id
        if (editingDept === record.id) {
          return (
            <Space.Compact size="small">
              <Input
                value={deptValue}
                onChange={e => setDeptValue(e.target.value)}
                onPressEnter={() => handleDeptSave(record.id)}
                placeholder="部門名稱"
                style={{ width: 100 }}
                autoFocus
              />
              <Button size="small" type="primary" onClick={() => handleDeptSave(record.id)} loading={updating === record.id}>確定</Button>
              <Button size="small" onClick={() => setEditingDept(null)}>取消</Button>
            </Space.Compact>
          )
        }
        return (
          <span
            style={{ cursor: isSelf ? 'default' : 'pointer', color: record.department ? undefined : '#bbb' }}
            onClick={() => {
              if (isSelf) return
              setEditingDept(record.id)
              setDeptValue(record.department || '')
            }}
          >
            {record.department || (isSelf ? '—' : '點擊設定')}
          </span>
        )
      },
    },
    {
      title: '角色',
      key: 'role',
      width: 160,
      render: (_, record) => (
        <Select
          value={record.role}
          onChange={value => handleRoleChange(record.id, value)}
          loading={updating === record.id}
          disabled={updating !== null || !record.active}
          style={{ width: 130 }}
          options={ROLE_OPTIONS.map(r => ({ value: r.value, label: r.label }))}
        />
      ),
    },
    {
      title: (
        <Tooltip title="主管可額外擁有：編輯獎金、管理客戶、查看業績金額、編輯專案">
          <Space size={4}>部門主管 <span style={{ color: '#faad14' }}>ⓘ</span></Space>
        </Tooltip>
      ),
      key: 'isManager',
      width: 110,
      align: 'center',
      render: (_, record) => {
        const isSelf = record.id === user?.id
        return (
          <Switch
            checked={record.isManager}
            onChange={val => handleManagerToggle(record.id, val)}
            disabled={updating !== null || !record.active || isSelf}
            checkedChildren={<CrownOutlined />}
            unCheckedChildren="—"
            size="small"
          />
        )
      },
    },
    {
      title: (
        <Tooltip title="用於 AI 指派事件的技能配對">
          <Space size={4}><ToolOutlined />技能 <span style={{ color: '#faad14' }}>ⓘ</span></Space>
        </Tooltip>
      ),
      key: 'skills',
      width: 220,
      render: (_, record) => (
        <Select
          mode="tags"
          size="small"
          value={parseSkills(record.skills)}
          onChange={val => handleSkillsChange(record.id, val)}
          disabled={updating !== null || !record.active}
          loading={updating === record.id}
          options={PREDEFINED_SKILLS.map(s => ({ value: s, label: s }))}
          placeholder="新增技能標籤"
          style={{ width: '100%', minWidth: 160 }}
          maxTagCount={3}
          tokenSeparators={[',']}
        />
      ),
    },
    {
      title: '建立時間',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 110,
      render: (date: string) => new Date(date).toLocaleDateString('zh-TW'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
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
                type="text" size="small"
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
              okText="確定" cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button type="text" size="small" danger icon={<DeleteOutlined />} loading={updating === record.id}>
                刪除
              </Button>
            </Popconfirm>
          </Space>
        )
      },
    },
  ]

  if (userLoading || role !== 'ADMIN') return null

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
