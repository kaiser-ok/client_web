'use client'

import { useState } from 'react'
import { Modal, Form, Input, Select, DatePicker, message } from 'antd'
import { ACTIVITY_SOURCES } from '@/constants/waiting-on'
import { createActivity } from '@/hooks/useTimeline'

const { TextArea } = Input

interface AddActivityModalProps {
  open: boolean
  customerId: string
  onClose: () => void
  onSuccess: () => void
}

export default function AddActivityModal({
  open,
  customerId,
  onClose,
  onSuccess,
}: AddActivityModalProps) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (values: Record<string, unknown>) => {
    setLoading(true)
    try {
      await createActivity({
        customerId,
        source: values.source as string,
        title: values.title as string,
        content: values.content as string,
        tags: values.tags as string[],
        eventDate: values.eventDate ? (values.eventDate as { toISOString: () => string }).toISOString() : undefined,
      })
      message.success('活動已新增')
      form.resetFields()
      onSuccess()
      onClose()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '新增失敗')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title="新增活動"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="新增"
      cancelText="取消"
      forceRender
      confirmLoading={loading}
      destroyOnHidden={false}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        preserve={false}
        initialValues={{ source: 'MANUAL' }}
      >
        <Form.Item
          name="source"
          label="活動來源"
          rules={[{ required: true, message: '請選擇來源' }]}
        >
          <Select
            options={ACTIVITY_SOURCES.filter(s => s.value !== 'JIRA').map(s => ({
              value: s.value,
              label: s.label,
            }))}
          />
        </Form.Item>

        <Form.Item
          name="title"
          label="標題"
          rules={[{ required: true, message: '請輸入標題' }]}
        >
          <Input placeholder="例如：客戶電話討論需求" />
        </Form.Item>

        <Form.Item name="content" label="內容">
          <TextArea
            rows={4}
            placeholder="記錄詳細內容..."
            showCount
            maxLength={2000}
          />
        </Form.Item>

        <Form.Item name="eventDate" label="預計日期">
          <DatePicker
            style={{ width: '100%' }}
            placeholder="選擇預計發生日期（選填）"
            format="YYYY-MM-DD"
          />
        </Form.Item>

        <Form.Item name="tags" label="標籤">
          <Select
            mode="tags"
            placeholder="輸入標籤後按 Enter"
            style={{ width: '100%' }}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
