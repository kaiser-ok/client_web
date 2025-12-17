'use client'

import { Drawer, Menu } from 'antd'
import {
  DashboardOutlined,
  TeamOutlined,
  FileTextOutlined,
  SettingOutlined,
  CloseOutlined,
} from '@ant-design/icons'
import { usePathname, useRouter } from 'next/navigation'
import type { MenuProps } from 'antd'

interface MobileNavProps {
  open: boolean
  onClose: () => void
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

export default function MobileNav({ open, onClose }: MobileNavProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    router.push(key)
    onClose()
  }

  const selectedKey = menuItems?.find(
    item => item && 'key' in item && pathname.startsWith(item.key as string)
  )?.key as string || '/'

  return (
    <Drawer
      title="客戶管理系統"
      placement="left"
      onClose={onClose}
      open={open}
      closeIcon={<CloseOutlined />}
      styles={{
        body: { padding: 0 },
        wrapper: { width: 280 },
      }}
    >
      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        items={menuItems}
        onClick={handleMenuClick}
        style={{ border: 'none' }}
      />
    </Drawer>
  )
}
