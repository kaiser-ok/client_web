'use client'

import { useState, useEffect } from 'react'
import { Modal, Button, Space, Spin, App } from 'antd'
import {
  DownloadOutlined,
  MailOutlined,
  LoadingOutlined,
} from '@ant-design/icons'

interface QuotationPDFPreviewProps {
  open: boolean
  quotationId: string
  quotationNo: string
  onClose: () => void
  onSendEmail: () => void
}

export default function QuotationPDFPreview({
  open,
  quotationId,
  quotationNo,
  onClose,
  onSendEmail,
}: QuotationPDFPreviewProps) {
  const { message } = App.useApp()
  const [loading, setLoading] = useState(false)
  const [pdfData, setPdfData] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (open && quotationId) {
      loadPDF()
    } else {
      setPdfData(null)
    }
  }, [open, quotationId])

  const loadPDF = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/quotations/${quotationId}/pdf?action=preview`)
      const data = await response.json()

      if (data.success && data.pdf) {
        setPdfData(data.pdf)
      } else {
        message.error(data.error || '載入 PDF 失敗')
      }
    } catch (error) {
      console.error('Load PDF error:', error)
      message.error('載入 PDF 失敗')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const response = await fetch(`/api/quotations/${quotationId}/pdf?action=download`)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '下載失敗')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${quotationNo}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      message.success('PDF 已下載')
    } catch (error) {
      console.error('Download PDF error:', error)
      message.error(error instanceof Error ? error.message : '下載 PDF 失敗')
    } finally {
      setDownloading(false)
    }
  }

  const handleSendEmail = () => {
    onClose()
    onSendEmail()
  }

  return (
    <Modal
      title={`報價單預覽 - ${quotationNo}`}
      open={open}
      onCancel={onClose}
      width={900}
      style={{ top: 20 }}
      footer={
        <Space>
          <Button onClick={onClose}>關閉</Button>
          <Button
            icon={<DownloadOutlined />}
            loading={downloading}
            onClick={handleDownload}
          >
            下載 PDF
          </Button>
          <Button
            type="primary"
            icon={<MailOutlined />}
            onClick={handleSendEmail}
          >
            寄送報價單
          </Button>
        </Space>
      }
    >
      <div style={{ minHeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        {loading ? (
          <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} tip="正在生成 PDF..." />
        ) : pdfData ? (
          <iframe
            src={`data:application/pdf;base64,${pdfData}`}
            style={{ width: '100%', height: 700, border: 'none' }}
            title="PDF Preview"
          />
        ) : (
          <div style={{ color: '#999' }}>PDF 載入失敗，請重試</div>
        )}
      </div>
    </Modal>
  )
}
