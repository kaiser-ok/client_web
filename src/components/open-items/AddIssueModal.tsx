'use client'

import { useState } from 'react'
import { Modal, Form, Input, Select, message } from 'antd'

const { TextArea } = Input

interface AddIssueModalProps {
  open: boolean
  customerId: string
  customerName: string
  onClose: () => void
  onSuccess: () => void
}

const ISSUE_TYPES = [
  { value: 'Bug', label: 'Bug (錯誤)' },
  { value: 'Task', label: 'Task (任務)' },
  { value: 'Story', label: 'Story (需求)' },
]

const PRIORITIES = [
  { value: 'Highest', label: '最高' },
  { value: 'High', label: '高' },
  { value: 'Medium', label: '中' },
  { value: 'Low', label: '低' },
  { value: 'Lowest', label: '最低' },
]

export default function AddIssueModal({
  open,
  customerId,
  customerName,
  onClose,
  onSuccess,
}: AddIssueModalProps) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (values: Record<string, unknown>) => {
    setLoading(true)
    try {
      const response = await fetch('/api/jira/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          summary: values.summary,
          description: values.description,
          issueType: values.issueType,
          priority: values.priority,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '建立失敗')
      }

      const result = await response.json()
      message.success(`報修已建立: ${result.issue.key}`)
      form.resetFields()
      onSuccess()
      onClose()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '建立失敗')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title={`新增報修 - ${customerName}`}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="建立"
      cancelText="取消"
      confirmLoading={loading}
      width={600}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ issueType: 'Bug', priority: 'Medium' }}
      >
        <Form.Item
          name="summary"
          label="標題"
          rules={[{ required: true, message: '請輸入標題' }]}
        >
          <Input placeholder="簡述問題或需求" />
        </Form.Item>

        <Form.Item name="description" label="詳細說明">
          <TextArea
            rows={4}
            placeholder="描述問題細節、重現步驟等..."
            showCount
            maxLength={2000}
          />
        </Form.Item>

        <div style={{ display: 'flex', gap: 16 }}>
          <Form.Item
            name="issueType"
            label="類型"
            style={{ flex: 1 }}
            rules={[{ required: true }]}
          >
            <Select options={ISSUE_TYPES} />
          </Form.Item>

          <Form.Item
            name="priority"
            label="優先級"
            style={{ flex: 1 }}
          >
            <Select options={PRIORITIES} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  )
}
