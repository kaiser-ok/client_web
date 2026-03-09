'use client'

import { useMemo } from 'react'
import { Layout, Menu } from 'antd'
import {
  DashboardOutlined,
  TeamOutlined,
  FileTextOutlined,
  SettingOutlined,
  UserOutlined,
  CloudSyncOutlined,
  LineChartOutlined,
  EyeOutlined,
  FolderOutlined,
  SlackOutlined,
  RobotOutlined,
  MailOutlined,
  DeleteOutlined,
  MessageOutlined,
  ShopOutlined,
  DollarOutlined,
  SearchOutlined,
  LinkOutlined,
  AppstoreOutlined,
  TrophyOutlined,
  AudioOutlined,
} from '@ant-design/icons'
import { usePathname, useRouter } from 'next/navigation'
import { useUser } from '@/hooks/useUser'
import { hasPermission } from '@/constants/roles'
import type { MenuProps } from 'antd'

const { Sider } = Layout

interface SidebarProps {
  collapsed: boolean
  onCollapse?: (collapsed: boolean) => void
}

export default function Sidebar({ collapsed, onCollapse }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { role } = useUser()

  const menuItems: MenuProps['items'] = useMemo(() => {
    const settingsChildren: MenuProps['items'] = []

    // ADMIN + SUPPORT 都可存取 LINE / Slack 整合
    if (role === 'ADMIN' || role === 'SUPPORT') {
      settingsChildren.push({
        key: '/settings/line',
        icon: <MessageOutlined />,
        label: 'LINE 整合',
      })
      settingsChildren.push({
        key: '/settings/slack',
        icon: <SlackOutlined />,
        label: 'Slack 整合',
      })
    }

    // Add admin-only settings
    if (role === 'ADMIN') {
      settingsChildren.push({
        key: '/settings/odoo',
        icon: <CloudSyncOutlined />,
        label: 'ERP 同步',
      })
      settingsChildren.push({
        key: '/settings/file-storage',
        icon: <FolderOutlined />,
        label: '檔案存儲',
      })
      settingsChildren.push({
        key: '/settings/llm',
        icon: <RobotOutlined />,
        label: 'LLM 設定',
      })
      settingsChildren.push({
        key: '/settings/gmail',
        icon: <MailOutlined />,
        label: 'Gmail 收信',
      })
      settingsChildren.push({
        key: '/admin/users',
        icon: <UserOutlined />,
        label: '使用者管理',
      })
      settingsChildren.push({
        key: '/admin/deleted-activities',
        icon: <DeleteOutlined />,
        label: 'LLM 優化記錄',
      })
      settingsChildren.push({
        key: '/settings/suppliers',
        icon: <ShopOutlined />,
        label: '供應商管理',
      })
      settingsChildren.push({
        key: '/settings/identity-resolution',
        icon: <LinkOutlined />,
        label: '身分識別',
      })
      settingsChildren.push({
        key: '/settings/quotation-templates',
        icon: <FileTextOutlined />,
        label: '報價範本',
      })
      settingsChildren.push({
        key: '/settings/products',
        icon: <AppstoreOutlined />,
        label: '產品管理',
      })
    }

    const items: MenuProps['items'] = [
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
        key: '/quotations',
        icon: <DollarOutlined />,
        label: '報價單',
      },
      {
        key: '/chat',
        icon: <RobotOutlined />,
        label: 'AI 助理',
      },
      {
        key: '/knowledge',
        icon: <SearchOutlined />,
        label: '知識圖譜',
      },
      {
        key: '/transcriptions',
        icon: <AudioOutlined />,
        label: '會議記錄',
      },
      {
        key: 'reports-menu',
        icon: <FileTextOutlined />,
        label: '報表',
        children: [
          {
            key: '/reports/activity-stats',
            icon: <LineChartOutlined />,
            label: '活動統計',
          },
          {
            key: '/reports/issues',
            icon: <FileTextOutlined />,
            label: 'Issue 統計',
          },
          {
            key: '/reports/customer-views',
            icon: <EyeOutlined />,
            label: '客戶查詢統計',
          },
          // 銷售報表 - 需要 VIEW_DEAL_AMOUNT 權限
          ...(hasPermission(role, 'VIEW_DEAL_AMOUNT')
            ? [
                {
                  key: '/reports/sales',
                  icon: <DollarOutlined />,
                  label: '銷售報表',
                },
              ]
            : []),
          // 獎金報表 - 需要 VIEW_BONUS 權限
          ...(hasPermission(role, 'VIEW_BONUS')
            ? [
                {
                  key: '/reports/bonus',
                  icon: <TrophyOutlined />,
                  label: '專案獎金',
                },
              ]
            : []),
        ],
      },
    ]

    // Show settings menu when there are visible items
    if (settingsChildren.length > 0) {
      items.push({
        key: 'settings-menu',
        icon: <SettingOutlined />,
        label: '設定',
        children: settingsChildren,
      })
    }

    return items
  }, [role])

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    // Only navigate if the key is an actual route (starts with /)
    // Skip parent menu items like 'settings-menu' and 'reports-menu'
    if (key.startsWith('/')) {
      router.push(key)
    }
  }

  // Find the matching menu key
  const getSelectedKey = () => {
    if (pathname.startsWith('/admin/')) return pathname
    // Match settings sub-pages (e.g., /settings/odoo, /settings/slack/classification)
    if (pathname.startsWith('/settings/odoo')) return '/settings/odoo'
    if (pathname.startsWith('/settings/file-storage')) return '/settings/file-storage'
    if (pathname.startsWith('/settings/slack')) return '/settings/slack'
    if (pathname.startsWith('/settings/line')) return '/settings/line'
    if (pathname.startsWith('/settings/llm')) return '/settings/llm'
    if (pathname.startsWith('/settings/gmail')) return '/settings/gmail'
    if (pathname.startsWith('/settings/suppliers')) return '/settings/suppliers'
    if (pathname.startsWith('/settings/identity-resolution')) return '/settings/identity-resolution'
    if (pathname.startsWith('/settings/quotation-templates')) return '/settings/quotation-templates'
    if (pathname.startsWith('/settings/products')) return '/settings/products'
    if (pathname === '/settings') return '/settings/odoo' // Default to odoo
    if (pathname.startsWith('/reports/')) return pathname
    if (pathname.startsWith('/quotations')) return '/quotations'
    if (pathname.startsWith('/knowledge')) return '/knowledge'
    if (pathname.startsWith('/transcriptions')) return '/transcriptions'
    if (pathname === '/') return '/'
    // Find menu item that matches the pathname (excluding root)
    const match = menuItems?.find(
      item => item && 'key' in item && item.key !== '/' && pathname.startsWith(item.key as string)
    )
    return match?.key as string || '/'
  }
  const selectedKey = getSelectedKey()

  // Auto-expand menus based on current path
  const getDefaultOpenKeys = () => {
    const keys: string[] = []
    if (pathname.startsWith('/admin/') || pathname.startsWith('/settings')) {
      keys.push('settings-menu')
    }
    if (pathname.startsWith('/reports')) {
      keys.push('reports-menu')
    }
    return keys
  }
  const defaultOpenKeys = getDefaultOpenKeys()

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
        defaultOpenKeys={defaultOpenKeys}
        items={menuItems}
        onClick={handleMenuClick}
      />
    </Sider>
  )
}
