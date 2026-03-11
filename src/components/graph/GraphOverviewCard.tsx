'use client'

import { Row, Col, Statistic, Card, Tag, Spin, Alert, Typography, Empty } from 'antd'
import {
  TeamOutlined,
  DollarOutlined,
  BugOutlined,
  ProjectOutlined,
  MailOutlined,
  PhoneOutlined,
  UserOutlined,
  BankOutlined,
} from '@ant-design/icons'
import { useGraphView } from '@/hooks/useGraphView'

const { Text, Title } = Typography

interface GraphOverviewCardProps {
  customerId: string
}

export default function GraphOverviewCard({ customerId }: GraphOverviewCardProps) {
  const { graphData, isLoading, isError, isEmpty } = useGraphView(customerId, '360')

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">載入圖譜資料中...</Text>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <Alert
        type="error"
        title="載入失敗"
        description="無法連接知識圖譜服務，請確認 Graphiti 服務是否正常運行。"
        showIcon
      />
    )
  }

  if (isEmpty || !graphData?.synced) {
    return (
      <Alert
        type="info"
        title="尚未同步至知識圖譜"
        description="此客戶的資料尚未同步到 Neo4j 知識圖譜。系統會在客戶資料變更時自動同步，或您可以透過管理介面手動觸發同步。"
        showIcon
      />
    )
  }

  const { contacts, deals, issues, projects, parent, subsidiaries } = graphData

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* A. Summary Statistics */}
      <Row gutter={16}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="聯絡人"
              value={contacts?.length || 0}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="成交紀錄"
              value={deals?.length || 0}
              prefix={<DollarOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="待處理問題"
              value={issues?.length || 0}
              prefix={<BugOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="進行中專案"
              value={projects?.length || 0}
              prefix={<ProjectOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* B. Contacts List */}
      <Card title={<><TeamOutlined /> 聯絡人</>} size="small">
        {contacts && contacts.length > 0 ? (
          <div>
            {contacts.map((contact, idx) => (
              <div
                key={String(contact.crm_id || idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 0',
                  borderBottom: idx < contacts.length - 1 ? '1px solid #f0f0f0' : undefined,
                }}
              >
                <UserOutlined style={{ fontSize: 16, color: '#1890ff' }} />
                <div style={{ flex: 1 }}>
                  <div>
                    <Text strong>{String(contact.name || '未知')}</Text>
                    {contact.title ? (
                      <Tag style={{ marginLeft: 8 }}>{String(contact.title)}</Tag>
                    ) : null}
                  </div>
                  <div>
                    {contact.email ? (
                      <Text type="secondary" style={{ marginRight: 12 }}>
                        <MailOutlined /> {String(contact.email)}
                      </Text>
                    ) : null}
                    {contact.phone ? (
                      <Text type="secondary">
                        <PhoneOutlined /> {String(contact.phone)}
                      </Text>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty description="無聯絡人資料" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Card>

      {/* C. Related Organizations */}
      <Card title={<><BankOutlined /> 關聯組織</>} size="small">
        {parent ? (
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary">母公司：</Text>
            <Tag color="purple">{String(parent.name || parent.crm_id)}</Tag>
          </div>
        ) : null}
        {subsidiaries && subsidiaries.length > 0 ? (
          <div>
            <Text type="secondary">子公司：</Text>
            <div style={{ marginTop: 4 }}>
              {subsidiaries.map((sub, idx) => (
                <Tag key={String(sub.crm_id || idx)} color="blue" style={{ marginBottom: 4 }}>
                  {String(sub.name || sub.crm_id)}
                </Tag>
              ))}
            </div>
          </div>
        ) : null}
        {!parent && (!subsidiaries || subsidiaries.length === 0) && (
          <Empty description="無關聯組織" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Card>

      {/* D. Deals & Issues Summary */}
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Card title={<><DollarOutlined /> 成交紀錄</>} size="small">
            {deals && deals.length > 0 ? (
              <div>
                {deals.map((deal, idx) => (
                  <div
                    key={String(deal.crm_id || idx)}
                    style={{
                      padding: '6px 0',
                      borderBottom: idx < deals.length - 1 ? '1px solid #f0f0f0' : undefined,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {deal.type ? <Tag color="blue">{String(deal.type)}</Tag> : null}
                      <Text>{String(deal.name || '未命名')}</Text>
                      {deal.amount && Number(deal.amount) > 0 ? (
                        <Tag color="green">${Number(deal.amount).toLocaleString()}</Tag>
                      ) : null}
                    </div>
                    {deal.sales_rep ? (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        業務：{String(deal.sales_rep)}
                      </Text>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <Empty description="無成交紀錄" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title={<><BugOutlined /> 待處理問題</>} size="small">
            {issues && issues.length > 0 ? (
              <div>
                {issues.map((issue, idx) => {
                  const status = String(issue.status || '')
                  const statusColor =
                    status.includes('Done') || status.includes('Closed') ? 'green' :
                    status.includes('Progress') ? 'blue' :
                    'orange'

                  return (
                    <div
                      key={String(issue.crm_id || idx)}
                      style={{
                        padding: '6px 0',
                        borderBottom: idx < issues.length - 1 ? '1px solid #f0f0f0' : undefined,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {issue.jira_key ? (
                          <Tag color="geekblue">{String(issue.jira_key)}</Tag>
                        ) : null}
                        <Text>{String(issue.summary || '未命名')}</Text>
                        {status ? <Tag color={statusColor}>{status}</Tag> : null}
                      </div>
                      {(issue.priority || issue.assignee) ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {issue.priority ? `優先級：${String(issue.priority)}` : null}
                          {issue.priority && issue.assignee ? ' · ' : null}
                          {issue.assignee ? `負責人：${String(issue.assignee)}` : null}
                        </Text>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <Empty description="無待處理問題" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}
