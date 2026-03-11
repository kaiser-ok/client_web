'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Modal,
  Steps,
  Select,
  Button,
  Alert,
  Descriptions,
  Tag,
  Checkbox,
  Spin,
  message,
  Space,
  Divider,
  Row,
  Col,
} from 'antd'
import {
  SwapOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons'

interface PartnerOption {
  id: string
  name: string
  odooId?: number | null
}

interface MergePreview {
  dryRun: boolean
  swapped: boolean
  bothHaveOdoo: boolean
  source: {
    id: string
    name: string
    odooId: number | null
    aliases: string[]
    contact: string | null
    phone: string | null
    email: string | null
    website: string | null
    notes: string | null
    odooTags: string[]
    jiraLabel: string | null
    slackChannelId: string | null
    roles: Array<{ role: string; isPrimary: boolean }>
    _count: Record<string, number>
  }
  target: {
    id: string
    name: string
    odooId: number | null
    aliases: string[]
    contact: string | null
    phone: string | null
    email: string | null
    website: string | null
    notes: string | null
    odooTags: string[]
    jiraLabel: string | null
    slackChannelId: string | null
    roles: Array<{ role: string; isPrimary: boolean }>
    _count: Record<string, number>
  }
}

interface MergePartnerModalProps {
  open: boolean
  preselectedId?: string | null
  onClose: () => void
  onSuccess: () => void
}

const COUNT_LABELS: Record<string, string> = {
  activities: '活動',
  openItems: '待處理',
  deals: '訂單',
  projects: '專案',
  endUserProjects: '終端用戶專案',
  files: '檔案',
  technicalNotes: '技術文件',
  contacts: '聯絡人',
  lineChannels: 'LINE 頻道',
  lineUsers: 'LINE 用戶',
  lineChannelAssociations: 'LINE 關聯',
  identityMappings: '身分對應',
  subsidiaries: '子公司',
  views: '瀏覽紀錄',
  quotations: '報價單',
  slackChannelMappings: 'Slack 對應',
  documentChunks: '文件區塊',
}

export default function MergePartnerModal({ open, preselectedId, onClose, onSuccess }: MergePartnerModalProps) {
  const [step, setStep] = useState(0)
  const [sourceId, setSourceId] = useState<string | undefined>()
  const [targetId, setTargetId] = useState<string | undefined>()
  const [partners, setPartners] = useState<PartnerOption[]>([])
  const [loadingPartners, setLoadingPartners] = useState(false)
  const [preview, setPreview] = useState<MergePreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [executing, setExecuting] = useState(false)

  // 載入客戶列表
  const fetchPartners = useCallback(async () => {
    setLoadingPartners(true)
    try {
      const res = await fetch('/api/partners?pageSize=9999&isActive=true')
      const data = await res.json()
      if (data.partners) {
        setPartners(data.partners.map((p: PartnerOption) => ({ id: p.id, name: p.name, odooId: p.odooId })))
      }
    } catch {
      message.error('無法載入客戶列表')
    } finally {
      setLoadingPartners(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      fetchPartners()
      // 如果有預選 ID，設為 sourceId
      if (preselectedId) {
        setSourceId(preselectedId)
      }
    }
  }, [open, preselectedId, fetchPartners])

  const reset = () => {
    setStep(0)
    setSourceId(preselectedId || undefined)
    setTargetId(undefined)
    setPreview(null)
    setConfirmed(false)
    setExecuting(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  // Step 2: 取得預覽
  const fetchPreview = async () => {
    if (!sourceId || !targetId) return
    setLoadingPreview(true)
    try {
      const res = await fetch('/api/partners/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, targetId, dryRun: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        message.error(data.error || '預覽失敗')
        return
      }
      setPreview(data)
      setStep(1)
    } catch {
      message.error('預覽請求失敗')
    } finally {
      setLoadingPreview(false)
    }
  }

  // Step 3: 執行合併
  const executeMerge = async () => {
    if (!preview) return
    setExecuting(true)
    try {
      const res = await fetch('/api/partners/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: preview.source.id, targetId: preview.target.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        message.error(data.error || '合併失敗')
        return
      }
      message.success(data.message || '合併成功')
      handleClose()
      onSuccess()
    } catch {
      message.error('合併請求失敗')
    } finally {
      setExecuting(false)
    }
  }

  const renderCountItems = (counts: Record<string, number>) => {
    const items = Object.entries(counts).filter(([, v]) => v > 0)
    if (items.length === 0) return <Tag>無關聯記錄</Tag>
    return (
      <Space wrap>
        {items.map(([key, val]) => (
          <Tag key={key} color="blue">{COUNT_LABELS[key] || key}: {val}</Tag>
        ))}
      </Space>
    )
  }

  const renderStep0 = () => (
    <div style={{ padding: '16px 0' }}>
      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>來源客戶（將被合併）</div>
          <Select
            showSearch
            placeholder="搜尋並選擇來源客戶..."
            style={{ width: '100%' }}
            value={sourceId}
            onChange={setSourceId}
            loading={loadingPartners}
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
            options={partners
              .filter((p) => p.id !== targetId)
              .map((p) => ({
                value: p.id,
                label: `${p.name}${p.odooId ? ` (Odoo #${p.odooId})` : ''}`,
              }))}
          />
        </div>
        <div style={{ textAlign: 'center' }}>
          <ArrowRightOutlined style={{ fontSize: 24, color: '#999', transform: 'rotate(90deg)' }} />
        </div>
        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>目標客戶（保留）</div>
          <Select
            showSearch
            placeholder="搜尋並選擇目標客戶..."
            style={{ width: '100%' }}
            value={targetId}
            onChange={setTargetId}
            loading={loadingPartners}
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
            options={partners
              .filter((p) => p.id !== sourceId)
              .map((p) => ({
                value: p.id,
                label: `${p.name}${p.odooId ? ` (Odoo #${p.odooId})` : ''}`,
              }))}
          />
        </div>
        <Alert
          title="提示"
          description="若來源客戶有 Odoo ID 而目標沒有，系統會自動交換，確保 Odoo 記錄作為保留方。"
          type="info"
          showIcon
        />
      </Space>
    </div>
  )

  const renderStep1 = () => {
    if (!preview) return null
    return (
      <div style={{ padding: '16px 0' }}>
        {preview.swapped && !preview.bothHaveOdoo && (
          <Alert
            title="已自動交換"
            description={`系統已自動交換來源與目標，因為「${preview.target.name}」有 Odoo ID，將作為保留方。`}
            type="warning"
            icon={<SwapOutlined />}
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        {preview.bothHaveOdoo && (
          <Alert
            title="兩個客戶都有 Odoo ID"
            description={`合併後將保留目標方的 Odoo #${preview.target.odooId}，來源方的 Odoo #${preview.source.odooId} 將被清除。`}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <div style={{ background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 12, color: '#cf1322' }}>
                將被合併（停用）
              </div>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="名稱">{preview.source.name}</Descriptions.Item>
                <Descriptions.Item label="Odoo ID">{preview.source.odooId || '-'}</Descriptions.Item>
                <Descriptions.Item label="聯絡人">{preview.source.contact || '-'}</Descriptions.Item>
                <Descriptions.Item label="電話">{preview.source.phone || '-'}</Descriptions.Item>
                <Descriptions.Item label="Email">{preview.source.email || '-'}</Descriptions.Item>
                <Descriptions.Item label="網站">{preview.source.website || '-'}</Descriptions.Item>
                <Descriptions.Item label="角色">
                  <Space wrap>
                    {preview.source.roles.map((r) => (
                      <Tag key={r.role} color={r.isPrimary ? 'green' : 'default'}>{r.role}</Tag>
                    ))}
                  </Space>
                </Descriptions.Item>
              </Descriptions>
              <Divider style={{ margin: '12px 0' }}>關聯記錄</Divider>
              {renderCountItems(preview.source._count)}
            </div>
          </Col>
          <Col xs={24} md={12}>
            <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 12, color: '#389e0d' }}>
                <CheckCircleOutlined /> 保留（目標）
              </div>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="名稱">{preview.target.name}</Descriptions.Item>
                <Descriptions.Item label="Odoo ID">{preview.target.odooId || '-'}</Descriptions.Item>
                <Descriptions.Item label="聯絡人">{preview.target.contact || '-'}</Descriptions.Item>
                <Descriptions.Item label="電話">{preview.target.phone || '-'}</Descriptions.Item>
                <Descriptions.Item label="Email">{preview.target.email || '-'}</Descriptions.Item>
                <Descriptions.Item label="網站">{preview.target.website || '-'}</Descriptions.Item>
                <Descriptions.Item label="角色">
                  <Space wrap>
                    {preview.target.roles.map((r) => (
                      <Tag key={r.role} color={r.isPrimary ? 'green' : 'default'}>{r.role}</Tag>
                    ))}
                  </Space>
                </Descriptions.Item>
              </Descriptions>
              <Divider style={{ margin: '12px 0' }}>現有記錄</Divider>
              {renderCountItems(preview.target._count)}
            </div>
          </Col>
        </Row>
      </div>
    )
  }

  const renderStep2 = () => {
    if (!preview) return null
    const totalRecords = Object.values(preview.source._count).reduce((a, b) => a + b, 0)
    return (
      <div style={{ padding: '16px 0' }}>
        <Alert
          title="確認合併"
          description={
            <div>
              <p>即將執行以下操作：</p>
              <ul style={{ paddingLeft: 20 }}>
                <li>將「<strong>{preview.source.name}</strong>」的所有記錄（共 {totalRecords} 筆）移至「<strong>{preview.target.name}</strong>」</li>
                <li>「{preview.source.name}」將被標記為 <Tag color="red">[已合併]</Tag> 並停用</li>
                <li>欄位資料（聯絡人、電話等）若目標為空，將從來源補上</li>
                <li>來源客戶名稱將加入目標的別名（aliases）</li>
              </ul>
            </div>
          }
          type="warning"
          icon={<WarningOutlined />}
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Checkbox
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        >
          我了解此操作無法輕易復原
        </Checkbox>
      </div>
    )
  }

  const steps = [
    { title: '選擇客戶' },
    { title: '預覽' },
    { title: '確認' },
  ]

  const canNext = step === 0 ? (sourceId && targetId) : step === 1

  return (
    <Modal
      title="合併客戶"
      open={open}
      onCancel={handleClose}
      width={720}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={handleClose}>取消</Button>
          {step > 0 && (
            <Button onClick={() => { setStep(step - 1); setConfirmed(false) }}>
              上一步
            </Button>
          )}
          {step < 2 ? (
            <Button
              type="primary"
              disabled={!canNext}
              loading={loadingPreview}
              onClick={step === 0 ? fetchPreview : () => setStep(2)}
            >
              下一步
            </Button>
          ) : (
            <Button
              type="primary"
              danger
              disabled={!confirmed}
              loading={executing}
              onClick={executeMerge}
            >
              執行合併
            </Button>
          )}
        </Space>
      }
    >
      <Steps current={step} items={steps} style={{ marginBottom: 16 }} />
      {step === 0 && renderStep0()}
      {step === 1 && (loadingPreview ? <Spin style={{ display: 'block', textAlign: 'center', padding: 40 }} /> : renderStep1())}
      {step === 2 && renderStep2()}
    </Modal>
  )
}
