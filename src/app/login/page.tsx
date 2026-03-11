'use client'

import { Button, Card, Typography, Space, Form, Input, Tabs, message } from 'antd'
import { GoogleOutlined, UserOutlined, LockOutlined, WindowsOutlined } from '@ant-design/icons'
import { signIn, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

const { Title, Text } = Typography

function LoginContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()

  // 檢查是否有錯誤
  const error = searchParams.get('error')

  useEffect(() => {
    if (session) {
      router.push('/')
    }
  }, [session, router])

  useEffect(() => {
    if (error === 'CredentialsSignin') {
      message.error('帳號或密碼錯誤')
    }
  }, [error])

  const handleAdLogin = async (values: { username: string; password: string }) => {
    setLoading(true)
    try {
      const result = await signIn('ldap', {
        username: values.username,
        password: values.password,
        redirect: false,
      })

      if (result?.error) {
        message.error('帳號或密碼錯誤')
      } else if (result?.ok) {
        router.push('/')
      }
    } catch {
      message.error('登入失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  const tabItems = [
    {
      key: 'ad',
      label: (
        <span>
          <WindowsOutlined /> AD 帳號
        </span>
      ),
      children: (
        <Form
          form={form}
          onFinish={handleAdLogin}
          layout="vertical"
          size="large"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '請輸入帳號' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="AD 帳號"
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '請輸入密碼' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密碼"
              autoComplete="current-password"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              style={{ width: '100%', height: 48 }}
            >
              登入
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'google',
      label: (
        <span>
          <GoogleOutlined /> Google
        </span>
      ),
      children: (
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
      ),
    },
  ]

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
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Title level={2} style={{ marginBottom: 8 }}>
              客戶管理系統
            </Title>
            <Text type="secondary">
              登入以管理您的客戶活動
            </Text>
          </div>

          <Tabs
            defaultActiveKey="ad"
            items={tabItems}
            centered
            destroyInactiveTabPane={false}
          />

          <Text type="secondary" style={{ fontSize: 12 }}>
            登入即表示您同意我們的服務條款
          </Text>
        </Space>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        載入中...
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
