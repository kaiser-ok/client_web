'use client'

import { useState, useEffect } from 'react'
import { Modal, Form, Input, Button, Space, App, Alert } from 'antd'
import { SendOutlined, LoadingOutlined } from '@ant-design/icons'

interface QuotationEmailModalProps {
  open: boolean
  quotationId: string
  quotationNo: string
  projectName?: string
  partnerName: string
  partnerEmail?: string
  onClose: () => void
  onSuccess?: () => void
}

export default function QuotationEmailModal({
  open,
  quotationId,
  quotationNo,
  projectName,
  partnerName,
  partnerEmail,
  onClose,
  onSuccess,
}: QuotationEmailModalProps) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        to: partnerEmail || '',
        cc: '',
        subject: `報價單 ${quotationNo}${projectName ? ` - ${projectName}` : ''}`,
        message: `您好，

附上報價單 ${quotationNo}${projectName ? ` - ${projectName}` : ''}，煩請參閱。

如有任何問題，歡迎隨時與我們聯繫。

謝謝！`,
      })
    }
  }, [open, quotationNo, projectName, partnerEmail, form])

  const handleSend = async () => {
    try {
      const values = await form.validateFields()
      setSending(true)

      const toEmails = values.to
        .split(/[,;\s]+/)
        .map((e: string) => e.trim())
        .filter((e: string) => e)

      const ccEmails = values.cc
        ? values.cc
            .split(/[,;\s]+/)
            .map((e: string) => e.trim())
            .filter((e: string) => e)
        : undefined

      const response = await fetch(`/api/quotations/${quotationId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toEmails,
          cc: ccEmails,
          subject: values.subject,
          message: values.message,
        }),
      })

      const data = await response.json()

      if (data.success) {
        message.success(`報價單已寄送至 ${toEmails.join(', ')}`)
        onClose()
        onSuccess?.()
      } else {
        message.error(data.error || '發送失敗')
      }
    } catch (error) {
      console.error('Send email error:', error)
      if (error instanceof Error && error.message !== 'Validation failed') {
        message.error(error.message || '發送失敗')
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      title={`寄送報價單 - ${quotationNo}`}
      open={open}
      onCancel={onClose}
      width={600}
      forceRender
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button
            type="primary"
            icon={sending ? <LoadingOutlined /> : <SendOutlined />}
            loading={sending}
            onClick={handleSend}
          >
            發送
          </Button>
        </Space>
      }
    >
      <Alert
        title={`將寄送報價單 PDF 給 ${partnerName}`}
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Form form={form} layout="vertical">
        <Form.Item
          name="to"
          label="收件人"
          rules={[
            { required: true, message: '請輸入收件人 Email' },
          ]}
          extra="多個 Email 請用逗號分隔"
        >
          <Input placeholder="customer@example.com" />
        </Form.Item>

        <Form.Item
          name="cc"
          label="副本 (CC)"
          extra="多個 Email 請用逗號分隔"
        >
          <Input placeholder="sales@company.com" />
        </Form.Item>

        <Form.Item
          name="subject"
          label="主旨"
          rules={[{ required: true, message: '請輸入郵件主旨' }]}
        >
          <Input />
        </Form.Item>

        <Form.Item
          name="message"
          label="內文"
          rules={[{ required: true, message: '請輸入郵件內文' }]}
        >
          <Input.TextArea rows={8} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
