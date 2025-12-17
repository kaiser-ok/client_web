'use client'

import { Layout, Button, Dropdown, Avatar, Space, Typography } from 'antd'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  LogoutOutlined,
} from '@ant-design/icons'
import { useSession, signOut } from 'next-auth/react'
import type { MenuProps } from 'antd'

const { Header: AntHeader } = Layout
const { Text } = Typography

interface HeaderProps {
  collapsed: boolean
  onToggle: () => void
  isMobile?: boolean
}

export default function Header({ collapsed, onToggle, isMobile }: HeaderProps) {
  const { data: session } = useSession()

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
      onClick: () => signOut({ callbackUrl: '/login' }),
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

      <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
        <Space style={{ cursor: 'pointer' }}>
          <Avatar
            src={session?.user?.image}
            icon={!session?.user?.image && <UserOutlined />}
            size="small"
          />
          {!isMobile && (
            <Text>{session?.user?.name || session?.user?.email}</Text>
          )}
        </Space>
      </Dropdown>
    </AntHeader>
  )
}
