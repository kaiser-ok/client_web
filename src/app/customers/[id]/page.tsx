'use client'

import { useState, use } from 'react'
import { Tabs, Card, Modal, Form, Input, Button, Select, App, Popconfirm } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import CustomerHeader from '@/components/customers/CustomerHeader'
import OpenItemsTable from '@/components/open-items/OpenItemsTable'
import ActivityTimeline from '@/components/timeline/ActivityTimeline'
import AddActivityModal from '@/components/timeline/AddActivityModal'
import AddIssueModal from '@/components/open-items/AddIssueModal'
import DealsCard from '@/components/deals/DealsCard'
import CustomerFileBrowser from '@/components/files/CustomerFileBrowser'
import TechnicalNotesCard from '@/components/technical-notes/TechnicalNotesCard'
import ProjectsCard from '@/components/projects/ProjectsCard'
import LineMessagesCard from '@/components/line/LineMessagesCard'
import SmartQuotationModal from '@/components/quotations/SmartQuotationModal'
import GraphTab from '@/components/graph/GraphTab'
import { useCustomer, useCustomers, updateCustomer } from '@/hooks/useCustomer'

interface CustomerDetailPageProps {
  params: Promise<{ id: string }>
}

export default function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { message } = App.useApp()
  const { customer, isLoading, mutate } = useCustomer(id)
  const { customers: allCustomers } = useCustomers('', 1, 500) // Get all customers for parent selection
  const [activeTab, setActiveTab] = useState('overview')

  // Filter out current customer and its subsidiaries from parent options
  const parentOptions = allCustomers
    .filter(c => c.id !== id && c.parentId !== id) // Exclude self and its children
    .map(c => ({ value: c.id, label: c.name }))
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [addActivityOpen, setAddActivityOpen] = useState(false)
  const [addIssueOpen, setAddIssueOpen] = useState(false)
  const [smartQuotationOpen, setSmartQuotationOpen] = useState(false)
  const [form] = Form.useForm()

  const handleEdit = () => {
    if (customer) {
      setEditModalOpen(true)
    }
  }

  const handleUpdate = async (values: Record<string, unknown>) => {
    try {
      await updateCustomer(id, values)
      message.success('客戶資料已更新')
      setEditModalOpen(false)
      mutate()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新失敗')
    }
  }

  const handleSync = async () => {
    try {
      const response = await fetch(`/api/open-items/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: id }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '同步失敗')
      }

      const result = await response.json()
      message.success(`Jira 同步完成，共 ${result.syncedCount} 筆`)
      mutate()
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Jira 同步失敗')
    }
  }

  const handleSyncOdooTags = async () => {
    try {
      const response = await fetch(`/api/odoo/sync-tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: id }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '同步失敗')
      }

      const result = await response.json()
      if (result.count > 0) {
        message.success(`ERP 標籤同步完成，共 ${result.count} 個標籤：${result.tags.join(', ')}`)
      } else {
        message.info('此客戶在 ERP 訂單中沒有標籤')
      }
      mutate()
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'ERP 標籤同步失敗')
    }
  }

  const handleSyncInvoices = async () => {
    try {
      const response = await fetch(`/api/odoo/sync-invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: id }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '同步失敗')
      }

      const result = await response.json()
      message.success(result.message)
      mutate()
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'ERP 發票同步失敗')
    }
  }

  const handleSyncDeals = async () => {
    try {
      const response = await fetch(`/api/customers/${id}/sync-deals`, {
        method: 'POST',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '同步失敗')
      }

      const result = await response.json()
      message.success(result.message)
      mutate()
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'ERP 訂單同步失敗')
    }
  }

  const handleSyncEmails = async () => {
    try {
      const response = await fetch(`/api/gmail/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: id, maxResults: 50 }),
      })

      const result = await response.json()

      if (!response.ok) {
        // 需要重新授權
        if (result.needReauth) {
          message.warning('需要重新授權 Gmail 存取權限，請重新登入')
          return
        }
        throw new Error(result.error || '同步失敗')
      }

      if (result.newEmails > 0) {
        message.success(`Email 同步完成，新增 ${result.newEmails} 封信件到活動記錄`)
      } else if (result.totalFound > 0) {
        message.info(`找到 ${result.totalFound} 封信件，但都已存在於活動記錄中`)
      } else {
        message.info('沒有找到與此客戶相關的信件')
      }
      mutate()
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Email 同步失敗')
    }
  }

  const handleSummarizeSlack = async (force = false, days = 30) => {
    if (!customer?.slackChannelId) {
      message.warning('此客戶尚未設定 Slack 頻道，請先在編輯頁面設定')
      return
    }

    try {
      const daysLabel = days > 30 ? `${days} 天` : '30 天'
      message.loading({
        content: force
          ? `正在重新彙整 ${daysLabel} Slack 對話（分批處理中）...`
          : '正在彙整新的 Slack 對話...',
        key: 'slack-summarize'
      })

      const response = await fetch(`/api/slack/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: id, days, force }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || '彙整失敗')
      }

      if (result.messageCount === 0) {
        const msg = result.skippedInfo
          ? `自 ${result.skippedInfo.lastSyncTime} 之後沒有新對話`
          : '過去 30 天內沒有對話記錄'
        message.info({ content: msg, key: 'slack-summarize' })
      } else if (result.eventCount === 0) {
        message.info({
          content: `找到 ${result.messageCount} 則${result.isIncremental ? '新' : ''}訊息，但沒有重要事件`,
          key: 'slack-summarize'
        })
      } else {
        const timelineInfo = result.timelineCount > 0 ? `時間軸 ${result.timelineCount} 筆` : ''
        const techInfo = result.technicalNoteCount > 0 ? `技術文件 ${result.technicalNoteCount} 筆` : ''
        const ignoredInfo = result.ignoredCount > 0 ? `忽略 ${result.ignoredCount} 筆` : ''
        const categoryInfo = [timelineInfo, techInfo, ignoredInfo].filter(Boolean).join('、')
        const batchNote = result.batchCount > 1 ? `，共 ${result.batchCount} 批次` : ''
        const incrementalNote = result.isIncremental ? '（增量同步）' : ''
        message.success({
          content: `已從 ${result.messageCount} 則訊息中提取 ${result.eventCount} 個事件${incrementalNote}${batchNote}（${categoryInfo}）`,
          key: 'slack-summarize',
        })
      }
      mutate()
    } catch (error) {
      message.error({
        content: error instanceof Error ? error.message : 'Slack 彙整失敗',
        key: 'slack-summarize',
      })
    }
  }

  const handleClearSlackActivities = async () => {
    try {
      message.loading({ content: '正在清除 Slack 活動...', key: 'slack-clear' })

      const response = await fetch(`/api/activities?source=SLACK&customerId=${id}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || '清除失敗')
      }

      if (result.deleted === 0) {
        message.info({ content: '沒有 Slack 活動記錄需要清除', key: 'slack-clear' })
      } else {
        message.success({
          content: `已清除 ${result.deleted} 筆 Slack 活動記錄`,
          key: 'slack-clear',
        })
      }
      mutate()
    } catch (error) {
      message.error({
        content: error instanceof Error ? error.message : '清除 Slack 活動失敗',
        key: 'slack-clear',
      })
    }
  }

  const tabItems = [
    {
      key: 'overview',
      label: '總覽',
      children: (
        <div>
          <div style={{ marginBottom: 16 }}>
            <ProjectsCard customerId={id} limit={5} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 16 }}>
            <DealsCard customerId={id} limit={5} />
            <Card title="最近活動">
              <ActivityTimeline customerId={id} limit={5} />
            </Card>
          </div>
        </div>
      ),
    },
    {
      key: 'open-items',
      label: '待處理問題',
      children: <OpenItemsTable customerId={id} />,
    },
    {
      key: 'timeline',
      label: '活動時間軸',
      children: <ActivityTimeline customerId={id} />,
    },
    {
      key: 'files',
      label: '檔案',
      children: <CustomerFileBrowser customerId={id} customerName={customer?.name || ''} />,
    },
    {
      key: 'technical-notes',
      label: '技術文件',
      children: <TechnicalNotesCard customerId={id} />,
    },
    {
      key: 'line-messages',
      label: 'LINE 訊息',
      children: <LineMessagesCard customerId={id} />,
    },
    {
      key: 'graph',
      label: '關係圖譜',
      children: <GraphTab customerId={id} />,
    },
  ]

  return (
    <AppLayout>
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => router.push('/customers')}
        style={{ marginBottom: 16 }}
      >
        返回客戶列表
      </Button>

      <CustomerHeader
        customer={customer}
        isLoading={isLoading}
        onEdit={handleEdit}
        onSync={handleSync}
        onSyncOdooTags={handleSyncOdooTags}
        onSyncEmails={handleSyncEmails}
        onSyncInvoices={handleSyncInvoices}
        onSyncDeals={handleSyncDeals}
        onSummarizeSlack={(force, days) => handleSummarizeSlack(force, days)}
        onClearSlackActivities={handleClearSlackActivities}
        onAddActivity={() => setAddActivityOpen(true)}
        onAddIssue={() => setAddIssueOpen(true)}
        onSmartQuotation={() => setSmartQuotationOpen(true)}
      />

      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
        />
      </Card>

      <Modal
        title="編輯客戶資料"
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false)
          form.resetFields()
        }}
        onOk={() => form.submit()}
        okText="儲存"
        cancelText="取消"
        destroyOnHidden={false}
        forceRender
        afterOpenChange={(open) => {
          if (open && customer) {
            form.setFieldsValue({
              ...customer,
              role: customer.role || 'DEALER',
              aliases: customer.aliases || [],
              parentId: customer.parentId || undefined,
              slackChannelId: customer.slackChannelId || undefined,
              notes: customer.notes || '',
            })
          }
        }}
      >
        <Form form={form} layout="vertical" onFinish={handleUpdate} preserve={false}>
          <Form.Item
            name="name"
            label="名稱"
            rules={[{ required: true, message: '請輸入名稱' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="role" label="角色">
            <Select
              options={[
                { value: 'DEALER', label: '經銷商' },
                { value: 'END_USER', label: '最終用戶' },
                { value: 'SUPPLIER', label: '供應商' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="aliases"
            label="別名"
            tooltip="用於匯入資料時比對客戶，按 Enter 新增"
          >
            <Select
              mode="tags"
              placeholder="輸入別名後按 Enter（如：台積電、TSMC）"
              tokenSeparators={[',']}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="contact" label="聯絡人">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="電話">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input type="email" />
          </Form.Item>
          <Form.Item name="salesRep" label="負責業務">
            <Input />
          </Form.Item>
          <Form.Item name="partner" label="經銷商">
            <Input placeholder="經銷商名稱" />
          </Form.Item>
          <Form.Item name="parentId" label="母公司">
            <Select
              allowClear
              placeholder="選擇母公司（若為子公司）"
              options={parentOptions}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          <Form.Item name="slackChannelId" label="Slack 頻道 ID">
            <Input placeholder="例如：C01234567（從 Slack 頻道詳細資訊取得）" />
          </Form.Item>
          <Form.Item name="notes" label="備註">
            <Input.TextArea rows={4} placeholder="客戶相關備註..." />
          </Form.Item>
        </Form>
      </Modal>

      <AddActivityModal
        open={addActivityOpen}
        customerId={id}
        onClose={() => setAddActivityOpen(false)}
        onSuccess={mutate}
      />

      <AddIssueModal
        open={addIssueOpen}
        customerId={id}
        customerName={customer?.name || ''}
        onClose={() => setAddIssueOpen(false)}
        onSuccess={mutate}
      />

      <SmartQuotationModal
        open={smartQuotationOpen}
        customerId={id}
        customerName={customer?.name}
        onClose={() => setSmartQuotationOpen(false)}
        onSuccess={(quotation) => {
          console.log('Quotation created:', quotation)
          // TODO: 可以在這裡處理報價單建立後的邏輯
          // 例如：跳轉到報價單編輯頁面或顯示確認訊息
        }}
      />
    </AppLayout>
  )
}
