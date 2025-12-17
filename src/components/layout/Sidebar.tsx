'use client'

import { Layout, Menu } from 'antd'
import {
  DashboardOutlined,
  TeamOutlined,
  FileTextOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { usePathname, useRouter } from 'next/navigation'
import type { MenuProps } from 'antd'

const { Sider } = Layout

interface SidebarProps {
  collapsed: boolean
  onCollapse?: (collapsed: boolean) => void
}

const menuItems: MenuProps['items'] = [
  {
    key: '/',
    icon: <DashboardOutlined />,
    label: '儀表板',
  },
  {
    key: '/customers',
    icon: <TeamOutlined />,
    label: '客戶管理',
  },
  {
    key: '/reports',
    icon: <FileTextOutlined />,
    label: '報表',
  },
  {
    key: '/settings',
    icon: <SettingOutlined />,
    label: '設定',
  },
]

export default function Sidebar({ collapsed, onCollapse }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    router.push(key)
  }

  // Find the matching menu key
  const selectedKey = menuItems?.find(
    item => item && 'key' in item && pathname.startsWith(item.key as string)
  )?.key as string || '/'

  return (
    <Sider
      trigger={null}
      collapsible
      collapsed={collapsed}
      onCollapse={onCollapse}
      breakpoint="lg"
      style={{
        overflow: 'auto',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        background: '#001529',
      }}
    >
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: collapsed ? 16 : 20,
          fontWeight: 'bold',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        {collapsed ? 'CRM' : '客戶管理'}
      </div>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[selectedKey]}
        items={menuItems}
        onClick={handleMenuClick}
      />
    </Sider>
  )
}
