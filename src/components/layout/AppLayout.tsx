'use client'

import { useState, useEffect } from 'react'
import { Layout, App } from 'antd'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Header from './Header'
import Sidebar from './Sidebar'
import MobileNav from './MobileNav'

const { Content } = Layout

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
      if (window.innerWidth < 768) {
        setCollapsed(true)
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  if (status === 'loading') {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        載入中...
      </div>
    )
  }

  if (!session) {
    return null
  }

  const handleToggle = () => {
    if (isMobile) {
      setMobileNavOpen(true)
    } else {
      setCollapsed(!collapsed)
    }
  }

  return (
    <App>
      <Layout style={{ minHeight: '100vh' }}>
        {!isMobile && <Sidebar collapsed={collapsed} />}

        <MobileNav
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
        />

        <Layout style={{ marginLeft: isMobile ? 0 : (collapsed ? 80 : 200) }}>
          <Header
            collapsed={collapsed}
            onToggle={handleToggle}
            isMobile={isMobile}
          />
          <Content
            style={{
              margin: isMobile ? '16px 8px' : '24px 16px',
              padding: isMobile ? 16 : 24,
              background: '#fff',
              borderRadius: 8,
              minHeight: 280,
            }}
          >
            {children}
          </Content>
        </Layout>
      </Layout>
    </App>
  )
}
