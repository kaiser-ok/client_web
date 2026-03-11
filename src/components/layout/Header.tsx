'use client'

import { Layout, Button, Dropdown, Avatar, Space, Typography, Select, Tag } from 'antd'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  LogoutOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import { signOut } from 'next-auth/react'
import { useUser } from '@/hooks/useUser'
import { UserRole } from '@/constants/roles'
import type { MenuProps } from 'antd'

const { Header: AntHeader } = Layout
const { Text } = Typography

const ROLE_OPTIONS: { value: UserRole; label: string; color: string }[] = [
  { value: 'ADMIN', label: '管理員', color: 'red' },
  { value: 'SALES', label: '業務', color: 'blue' },
  { value: 'FINANCE', label: '財務', color: 'green' },
  { value: 'SUPPORT', label: '服務支援', color: 'orange' },
  { value: 'RD', label: '研發', color: 'purple' },
]

interface HeaderProps {
  collapsed: boolean
  onToggle: () => void
  isMobile?: boolean
}

export default function Header({ collapsed, onToggle, isMobile }: HeaderProps) {
  const { user, role, isAdmin, isImpersonating, setRole, clearImpersonation } = useUser()

  const getRoleLabel = (r: string) => {
    const option = ROLE_OPTIONS.find(o => o.value === r)
    return option?.label || r
  }

  const getRoleColor = (r: string) => {
    const option = ROLE_OPTIONS.find(o => o.value === r)
    return option?.color || 'default'
  }

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') {
      signOut({ callbackUrl: '/login' })
    }
  }

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '個人資料',
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '登出',
    },
  ]

  return (
    <AntHeader
      style={{
        padding: '0 16px',
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <Space>
        <Button
          type="text"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onToggle}
          style={{ fontSize: '16px', width: 40, height: 40 }}
        />
        {!isMobile && (
          <Text strong style={{ fontSize: 18 }}>
            客戶管理系統
          </Text>
        )}
      </Space>

      <Space size="middle">
        {/* Role indicator / switcher for admin */}
        {isAdmin ? (
          <Space size="small">
            <SwapOutlined style={{ color: '#999' }} />
            <Select
              value={role}
              onChange={(value) => setRole(value as UserRole)}
              style={{ width: 110 }}
              size="small"
              options={ROLE_OPTIONS.map(r => ({
                value: r.value,
                label: r.label,
              }))}
            />
            {isImpersonating && (
              <Button size="small" type="link" onClick={clearImpersonation}>
                還原
              </Button>
            )}
          </Space>
        ) : (
          <Tag color={getRoleColor(role)}>{getRoleLabel(role)}</Tag>
        )}

        <Dropdown menu={{ items: userMenuItems, onClick: handleMenuClick }} placement="bottomRight" trigger={['click']}>
          <Space style={{ cursor: 'pointer' }}>
            <Avatar
              src={user?.image}
              icon={!user?.image && <UserOutlined />}
              size="small"
            />
            {!isMobile && (
              <Text>{user?.name || user?.email}</Text>
            )}
          </Space>
        </Dropdown>
      </Space>
    </AntHeader>
  )
}
