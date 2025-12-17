'use client'

import { Row, Col, Card, Statistic, Typography } from 'antd'
import {
  TeamOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import AppLayout from '@/components/layout/AppLayout'

const { Title } = Typography

export default function DashboardPage() {
  return (
    <AppLayout>
      <Title level={4} style={{ marginBottom: 24 }}>
        儀表板
      </Title>

      <Row gutter={[16, 16]}>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <Statistic
              title="客戶總數"
              value={0}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <Statistic
              title="待處理問題"
              value={0}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <Statistic
              title="等待客戶回覆"
              value={0}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <Statistic
              title="逾期問題"
              value={0}
              prefix={<WarningOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginTop: 24 }}>
        <Title level={5}>最近活動</Title>
        <div style={{ color: '#999', padding: '40px 0', textAlign: 'center' }}>
          尚無活動記錄
        </div>
      </Card>
    </AppLayout>
  )
}
