'use client'

import { useState } from 'react'
import { Modal, Form, Input, Select, DatePicker, message, Divider } from 'antd'
import WaitingOnSelect from '@/components/common/WaitingOnSelect'
import { REPLY_SOURCES, WaitingOnType } from '@/constants/waiting-on'
import { replyToOpenItem } from '@/hooks/useOpenItems'
import { OpenItem } from '@/types/open-item'
import dayjs from 'dayjs'

const { TextArea } = Input

interface ReplyModalProps {
  open: boolean
  openItem: OpenItem | null
  onClose: () => void
  onSuccess: () => void
}

export default function ReplyModal({
  open,
  openItem,
  onClose,
  onSuccess,
}: ReplyModalProps) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (values: Record<string, unknown>) => {
    if (!openItem) return

    setLoading(true)
    try {
      await replyToOpenItem(openItem.id, {
        content: values.content as string,
        source: values.source as string,
        updateWaitingOn: values.waitingOn as WaitingOnType | null,
        updateNextAction: values.nextAction as string,
        updateDueDate: values.dueDate ? (values.dueDate as dayjs.Dayjs).toDate() : undefined,
      })
      message.success('回覆已送出')
      form.resetFields()
      onSuccess()
      onClose()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '回覆失敗')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title={`回覆 ${openItem?.jiraKey || ''}`}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="送出回覆"
      cancelText="取消"
      confirmLoading={loading}
      width={500}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          waitingOn: openItem?.waitingOn,
          nextAction: openItem?.nextAction,
          dueDate: openItem?.dueDate ? dayjs(openItem.dueDate) : undefined,
        }}
      >
        <Form.Item
          name="content"
          label="回覆內容"
          rules={[{ required: true, message: '請輸入回覆內容' }]}
        >
          <TextArea
            rows={4}
            placeholder="輸入回覆內容，將同步到 Jira comment..."
            showCount
            maxLength={2000}
          />
        </Form.Item>

        <Form.Item name="source" label="回覆來源">
          <Select
            placeholder="選擇來源（選填）"
            allowClear
            options={REPLY_SOURCES.map(s => ({ value: s.value, label: s.label }))}
          />
        </Form.Item>

        <Divider>同時更新（選填）</Divider>

        <Form.Item name="waitingOn" label="等待誰">
          <WaitingOnSelect style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item name="nextAction" label="下一步">
          <Input placeholder="例如：請客戶提供 log" maxLength={80} />
        </Form.Item>

        <Form.Item name="dueDate" label="到期日">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
