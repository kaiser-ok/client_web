'use client'

import { Button, Card, Typography, Space } from 'antd'
import { GoogleOutlined } from '@ant-design/icons'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

const { Title, Text } = Typography

export default function LoginPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (session) {
      router.push('/')
    }
  }, [session, router])

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

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: 16,
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: 400,
          textAlign: 'center',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
        }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Title level={2} style={{ marginBottom: 8 }}>
              客戶管理系統
            </Title>
            <Text type="secondary">
              登入以管理您的客戶活動
            </Text>
          </div>

          <Button
            type="primary"
            size="large"
            icon={<GoogleOutlined />}
            onClick={() => signIn('google', { callbackUrl: '/' })}
            style={{
              width: '100%',
              height: 48,
              fontSize: 16,
            }}
          >
            使用 Google 帳號登入
          </Button>

          <Text type="secondary" style={{ fontSize: 12 }}>
            登入即表示您同意我們的服務條款
          </Text>
        </Space>
      </Card>
    </div>
  )
}
