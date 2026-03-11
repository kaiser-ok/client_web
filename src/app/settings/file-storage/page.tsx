'use client'

import { useState, useEffect } from 'react'
import { Card, Typography, Button, Space, Divider, Alert, Input, App } from 'antd'
import {
  FolderOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { useUser } from '@/hooks/useUser'

const { Title, Text } = Typography

export default function FileStorageSettingsPage() {
  const router = useRouter()
  const { role, isLoading } = useUser()
  const { message } = App.useApp()

  // 檔案存儲設定
  const [fileStoragePath, setFileStoragePath] = useState('')
  const [fileStorageConfigured, setFileStorageConfigured] = useState(false)
  const [savingFileStorage, setSavingFileStorage] = useState(false)

  const isAdmin = role === 'ADMIN'

  // Redirect non-admin users to home page
  useEffect(() => {
    if (!isLoading && !isAdmin) {
      router.replace('/')
    }
  }, [isLoading, isAdmin, router])

  // 載入檔案存儲設定
  useEffect(() => {
    if (isAdmin) {
      fetch('/api/settings/file-storage', { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          setFileStoragePath(data.rootPath || '')
          setFileStorageConfigured(data.configured)
        })
        .catch(err => console.error('Failed to load file storage config:', err))
    }
  }, [isAdmin])

  // Show nothing while checking permissions
  if (isLoading || !isAdmin) {
    return null
  }

  const saveFileStoragePath = async () => {
    if (!fileStoragePath.trim()) {
      message.error('請輸入有效的路徑')
      return
    }

    setSavingFileStorage(true)
    try {
      const res = await fetch('/api/settings/file-storage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rootPath: fileStoragePath.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setFileStorageConfigured(true)
        message.success('檔案存儲路徑已儲存')
      } else {
        message.error(data.error || '儲存失敗')
      }
    } catch (error) {
      message.error('儲存失敗')
    } finally {
      setSavingFileStorage(false)
    }
  }

  return (
    <AppLayout>
      <Title level={4} style={{ marginBottom: 24 }}>
        <FolderOutlined style={{ marginRight: 8 }} />
        檔案存儲設定
      </Title>

      <Card>
        <Text type="secondary">
          設定客戶檔案的存儲根目錄，所有客戶檔案將按「客戶名稱/年份」分類存放
        </Text>

        <Divider />

        <Space.Compact style={{ width: '100%', maxWidth: 500 }}>
          <Input
            value={fileStoragePath}
            onChange={e => setFileStoragePath(e.target.value)}
            placeholder="/data/customers"
            prefix={<FolderOutlined />}
            status={fileStorageConfigured ? undefined : 'warning'}
          />
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={savingFileStorage}
            onClick={saveFileStoragePath}
          >
            儲存
          </Button>
        </Space.Compact>

        {fileStorageConfigured && (
          <Alert
            style={{ marginTop: 16 }}
            type="success"
            showIcon
            title="已設定"
            description={
              <pre style={{ margin: 0, fontSize: 12 }}>
{`${fileStoragePath}/
├── 台積電/
│   ├── 2025/
│   │   ├── jira/     ← Jira 附件自動同步
│   │   └── 手動上傳檔案
│   └── 2024/
└── 聯發科/
    └── ...`}
              </pre>
            }
          />
        )}

        {!fileStorageConfigured && (
          <Alert
            style={{ marginTop: 16 }}
            type="warning"
            showIcon
            title="尚未設定"
            description="請設定檔案存儲根目錄，才能使用客戶檔案管理功能"
          />
        )}
      </Card>
    </AppLayout>
  )
}
