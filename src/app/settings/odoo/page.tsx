'use client'

import { useState, useEffect } from 'react'
import { Card, Typography, Button, Space, Divider, Alert, Statistic, Row, Col, App } from 'antd'
import {
  TeamOutlined,
  ShoppingOutlined,
  UserOutlined,
  CloudSyncOutlined,
  ShopOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { useUser } from '@/hooks/useUser'

const { Title, Text } = Typography

interface SyncResult {
  success: boolean
  message: string
  stats: {
    total: number
    created: number
    updated: number
    linked?: number
    skipped?: number
  }
}

export default function OdooSettingsPage() {
  const router = useRouter()
  const { role, isLoading } = useUser()
  const { message } = App.useApp()
  const [syncingCustomers, setSyncingCustomers] = useState(false)
  const [syncingDeals, setSyncingDeals] = useState(false)
  const [syncingEmployees, setSyncingEmployees] = useState(false)
  const [syncingSuppliers, setSyncingSuppliers] = useState(false)
  const [customerResult, setCustomerResult] = useState<SyncResult | null>(null)
  const [dealResult, setDealResult] = useState<SyncResult | null>(null)
  const [employeeResult, setEmployeeResult] = useState<SyncResult | null>(null)
  const [supplierResult, setSupplierResult] = useState<SyncResult | null>(null)

  const isAdmin = role === 'ADMIN'

  // Redirect non-admin users to home page
  useEffect(() => {
    if (!isLoading && !isAdmin) {
      router.replace('/')
    }
  }, [isLoading, isAdmin, router])

  // Show nothing while checking permissions
  if (isLoading || !isAdmin) {
    return null
  }

  const syncCustomers = async () => {
    setSyncingCustomers(true)
    setCustomerResult(null)
    try {
      const res = await fetch('/api/odoo/sync-customers', {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (res.ok) {
        setCustomerResult(data)
        message.success(data.message)
      } else {
        message.error(data.error || '同步失敗')
      }
    } catch (error) {
      message.error('同步失敗')
    } finally {
      setSyncingCustomers(false)
    }
  }

  const syncDeals = async () => {
    setSyncingDeals(true)
    setDealResult(null)
    try {
      const res = await fetch('/api/odoo/sync-deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ limit: 500 }),
      })
      const data = await res.json()
      if (res.ok) {
        setDealResult(data)
        message.success(data.message)
      } else {
        message.error(data.error || '同步失敗')
      }
    } catch (error) {
      message.error('同步失敗')
    } finally {
      setSyncingDeals(false)
    }
  }

  const syncEmployees = async () => {
    setSyncingEmployees(true)
    setEmployeeResult(null)
    try {
      const res = await fetch('/api/odoo/sync-employees', {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (res.ok) {
        setEmployeeResult(data)
        message.success(data.message)
      } else {
        message.error(data.error || '同步失敗')
      }
    } catch (error) {
      message.error('同步失敗')
    } finally {
      setSyncingEmployees(false)
    }
  }

  const syncSuppliers = async () => {
    setSyncingSuppliers(true)
    setSupplierResult(null)
    try {
      const res = await fetch('/api/suppliers/sync', {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (res.ok) {
        setSupplierResult({
          success: true,
          message: data.message,
          stats: {
            total: data.total,
            created: data.created,
            updated: data.updated,
          },
        })
        message.success(data.message)
      } else {
        message.error(data.error || '同步失敗')
      }
    } catch (error) {
      message.error('同步失敗')
    } finally {
      setSyncingSuppliers(false)
    }
  }

  return (
    <AppLayout>
      <Title level={4} style={{ marginBottom: 24 }}>
        <CloudSyncOutlined style={{ marginRight: 8 }} />
        ERP 資料同步
      </Title>

      <Card>
        <Text type="secondary">
          從 ERP 系統同步客戶資料和成交訂單
        </Text>

        <Divider />

        {/* Customer Sync */}
        <div style={{ marginBottom: 24 }}>
          <Space align="start" size="large">
            <Button
              type="primary"
              icon={<TeamOutlined />}
              loading={syncingCustomers}
              onClick={syncCustomers}
              size="large"
            >
              同步客戶資料
            </Button>
            <div>
              <Text strong>客戶同步</Text>
              <br />
              <Text type="secondary">
                從 ERP 同步公司客戶資料
              </Text>
            </div>
          </Space>

          {customerResult && (
            <Card size="small" style={{ marginTop: 16, background: '#f6ffed' }}>
              <Row gutter={16}>
                <Col span={6}>
                  <Statistic title="總筆數" value={customerResult.stats.total} />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="新增"
                    value={customerResult.stats.created}
                    styles={{ content: { color: '#52c41a' } }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="更新"
                    value={customerResult.stats.updated}
                    styles={{ content: { color: '#1890ff' } }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="關聯"
                    value={customerResult.stats.linked || 0}
                    styles={{ content: { color: '#faad14' } }}
                  />
                </Col>
              </Row>
            </Card>
          )}
        </div>

        <Divider />

        {/* Deals Sync */}
        <div style={{ marginBottom: 24 }}>
          <Space align="start" size="large">
            <Button
              type="primary"
              icon={<ShoppingOutlined />}
              loading={syncingDeals}
              onClick={syncDeals}
              size="large"
            >
              同步訂單資料
            </Button>
            <div>
              <Text strong>訂單同步</Text>
              <br />
              <Text type="secondary">
                從 ERP 同步已確認的訂單
              </Text>
            </div>
          </Space>

          {dealResult && (
            <Card size="small" style={{ marginTop: 16, background: '#f6ffed' }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic title="總筆數" value={dealResult.stats.total} />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="新增"
                    value={dealResult.stats.created}
                    styles={{ content: { color: '#52c41a' } }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="更新"
                    value={dealResult.stats.updated}
                    styles={{ content: { color: '#1890ff' } }}
                  />
                </Col>
              </Row>
            </Card>
          )}
        </div>

        <Divider />

        {/* Employee Sync */}
        <div style={{ marginBottom: 24 }}>
          <Space align="start" size="large">
            <Button
              type="primary"
              icon={<UserOutlined />}
              loading={syncingEmployees}
              onClick={syncEmployees}
              size="large"
            >
              同步員工清單
            </Button>
            <div>
              <Text strong>員工同步</Text>
              <br />
              <Text type="secondary">
                從 ERP 聯絡人中同步有「員工」標籤的人員到系統使用者
              </Text>
            </div>
          </Space>

          {employeeResult && (
            <Card size="small" style={{ marginTop: 16, background: '#f6ffed' }}>
              <Row gutter={16}>
                <Col span={6}>
                  <Statistic title="總筆數" value={employeeResult.stats.total} />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="新增"
                    value={employeeResult.stats.created}
                    styles={{ content: { color: '#52c41a' } }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="更新"
                    value={employeeResult.stats.updated}
                    styles={{ content: { color: '#1890ff' } }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="略過"
                    value={employeeResult.stats.skipped || 0}
                    styles={{ content: { color: '#999' } }}
                  />
                </Col>
              </Row>
            </Card>
          )}
        </div>

        <Divider />

        {/* Supplier Sync */}
        <div style={{ marginBottom: 24 }}>
          <Space align="start" size="large">
            <Button
              type="primary"
              icon={<ShopOutlined />}
              loading={syncingSuppliers}
              onClick={syncSuppliers}
              size="large"
            >
              同步供應商/經銷商
            </Button>
            <div>
              <Text strong>供應商同步</Text>
              <br />
              <Text type="secondary">
                從 ERP 同步有「供應商」標籤的聯絡人
              </Text>
            </div>
          </Space>

          {supplierResult && (
            <Card size="small" style={{ marginTop: 16, background: '#f6ffed' }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic title="總筆數" value={supplierResult.stats.total} />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="新增"
                    value={supplierResult.stats.created}
                    styles={{ content: { color: '#52c41a' } }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="更新"
                    value={supplierResult.stats.updated}
                    styles={{ content: { color: '#1890ff' } }}
                  />
                </Col>
              </Row>
            </Card>
          )}
        </div>

        <Divider />

        <Alert
          type="info"
          showIcon
          title="同步說明"
          description={
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>客戶同步：會比對名稱，相同名稱會自動關聯</li>
              <li>訂單同步：只同步狀態為「已確認」的訂單</li>
              <li>員工同步：同步 ERP 中有「員工」標籤的聯絡人，需要有 Email 才會建立</li>
              <li>供應商同步：同步 ERP 中有「供應商」標籤的聯絡人</li>
              <li>重複執行不會產生重複資料，會更新現有記錄</li>
              <li>手動建立的資料不會被覆蓋</li>
            </ul>
          }
        />
      </Card>
    </AppLayout>
  )
}
