'use client'

import { useState } from 'react'
import { Modal, Form, Input, InputNumber, DatePicker, Upload, Select, Switch, message, Button } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import type { UploadFile, UploadProps } from 'antd'
import { createDeal } from '@/hooks/useDeals'
import { DEAL_TYPES, DealType } from '@/types/deal'
import dayjs from 'dayjs'

const { TextArea } = Input
const { RangePicker } = DatePicker

interface AddDealModalProps {
  open: boolean
  customerId: string
  onClose: () => void
  onSuccess: () => void
}

interface UploadedFile {
  url: string
  filename: string
}

export default function AddDealModal({
  open,
  customerId,
  onClose,
  onSuccess,
}: AddDealModalProps) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [dealType, setDealType] = useState<DealType>('PURCHASE')

  const handleUpload: UploadProps['customRequest'] = async (options) => {
    const { file, onSuccess: uploadSuccess, onError } = options

    const formData = new FormData()
    formData.append('file', file as File)

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '上傳失敗')
      }

      const result = await response.json()
      setUploadedFiles(prev => [...prev, { url: result.url, filename: result.filename }])
      uploadSuccess?.(result)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '上傳失敗')
      onError?.(error as Error)
    }
  }

  const handleRemoveFile = (file: UploadFile) => {
    setFileList(prev => prev.filter(f => f.uid !== file.uid))
    const fileName = file.name
    setUploadedFiles(prev => prev.filter(f => f.filename !== fileName))
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    setLoading(true)
    try {
      const servicePeriod = values.servicePeriod as [dayjs.Dayjs, dayjs.Dayjs] | undefined

      await createDeal({
        customerId,
        name: values.name as string,
        type: values.type as DealType,
        amount: values.amount as number | undefined,
        products: values.products as string | undefined,
        salesRep: values.salesRep as string | undefined,
        closedAt: (values.closedAt as dayjs.Dayjs).toDate(),
        startDate: servicePeriod?.[0]?.toDate(),
        endDate: servicePeriod?.[1]?.toDate(),
        autoRenew: values.autoRenew as boolean | undefined,
        remindDays: values.remindDays as number | undefined,
        notes: values.notes as string | undefined,
        attachments: uploadedFiles.map(f => f.url),
      })
      message.success('案件已新增')
      form.resetFields()
      setFileList([])
      setUploadedFiles([])
      setDealType('PURCHASE')
      onSuccess()
      onClose()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '新增失敗')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    form.resetFields()
    setFileList([])
    setUploadedFiles([])
    setDealType('PURCHASE')
    onClose()
  }

  const showServicePeriod = dealType !== 'PURCHASE' || form.getFieldValue('hasWarranty')

  return (
    <Modal
      title="新增成交/合約"
      open={open}
      onCancel={handleCancel}
      onOk={() => form.submit()}
      okText="新增"
      cancelText="取消"
      forceRender
      confirmLoading={loading}
      width={560}
      destroyOnHidden={false}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        preserve={false}
        initialValues={{
          type: 'PURCHASE',
          closedAt: dayjs(),
          autoRenew: false,
          remindDays: 30,
        }}
        onValuesChange={(changed: { type?: DealType }) => {
          if (changed.type) setDealType(changed.type)
        }}
      >
        <Form.Item
          name="type"
          label="類型"
          rules={[{ required: true }]}
        >
          <Select options={DEAL_TYPES} />
        </Form.Item>

        <Form.Item
          name="name"
          label="案件名稱"
          rules={[{ required: true, message: '請輸入案件名稱' }]}
        >
          <Input placeholder="例如：2024年度授權續約" />
        </Form.Item>

        <div style={{ display: 'flex', gap: 16 }}>
          <Form.Item
            name="amount"
            label="金額"
            style={{ flex: 1 }}
          >
            <InputNumber
              style={{ width: '100%' }}
              placeholder="0"
              formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={value => value?.replace(/\$\s?|(,*)/g, '') as unknown as number}
            />
          </Form.Item>

          <Form.Item
            name="closedAt"
            label="成交日期"
            style={{ flex: 1 }}
            rules={[{ required: true, message: '請選擇日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </div>

        <Form.Item
          name="servicePeriod"
          label={dealType === 'PURCHASE' ? '保固期間（選填）' : '服務期間'}
          rules={dealType !== 'PURCHASE' ? [{ required: true, message: '請選擇期間' }] : []}
        >
          <RangePicker style={{ width: '100%' }} />
        </Form.Item>

        {(dealType !== 'PURCHASE') && (
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
            <Form.Item name="autoRenew" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch />
            </Form.Item>
            <span>自動續約</span>

            <Form.Item
              name="remindDays"
              label="到期前提醒（天）"
              style={{ flex: 1, marginBottom: 0, marginLeft: 16 }}
            >
              <InputNumber min={1} max={365} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        )}

        <Form.Item name="products" label="產品項目">
          <Input placeholder="例如：企業版授權 x 50" />
        </Form.Item>

        <Form.Item name="salesRep" label="負責業務">
          <Input placeholder="業務姓名" />
        </Form.Item>

        <Form.Item name="notes" label="備註">
          <TextArea
            rows={2}
            placeholder="其他說明..."
            showCount
            maxLength={500}
          />
        </Form.Item>

        <Form.Item label="附件">
          <Upload
            fileList={fileList}
            customRequest={handleUpload}
            onChange={({ fileList }) => setFileList(fileList)}
            onRemove={handleRemoveFile}
            multiple
          >
            <Button icon={<UploadOutlined />}>上傳檔案</Button>
          </Upload>
          <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
            支援多個檔案，單檔最大 10MB
          </div>
        </Form.Item>
      </Form>
    </Modal>
  )
}
