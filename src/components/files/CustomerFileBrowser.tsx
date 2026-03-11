'use client'

import { useState } from 'react'
import {
  Card,
  Table,
  Button,
  Space,
  Select,
  Upload,
  Tag,
  Popconfirm,
  Empty,
  Spin,
  App,
  Tooltip,
} from 'antd'
import type { UploadProps, TableColumnsType } from 'antd'
import {
  UploadOutlined,
  DownloadOutlined,
  DeleteOutlined,
  FolderOutlined,
  FileOutlined,
  SyncOutlined,
  CloudDownloadOutlined,
  DollarOutlined,
  LockOutlined,
} from '@ant-design/icons'
import {
  useCustomerFiles,
  useCustomerFileYears,
  uploadFile,
  deleteFile,
  syncJiraAttachments,
  getDownloadUrl,
  formatFileSize,
  CustomerFile,
} from '@/hooks/useCustomerFiles'
import { useUser } from '@/hooks/useUser'
import dayjs from 'dayjs'

interface CustomerFileBrowserProps {
  customerId: string
  customerName: string
}

export default function CustomerFileBrowser({
  customerId,
  customerName,
}: CustomerFileBrowserProps) {
  const { message } = App.useApp()
  const { role } = useUser()
  const isAdmin = role === 'ADMIN'
  const canAccessFinance = role === 'ADMIN' || role === 'FINANCE'

  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  const [selectedPath, setSelectedPath] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const { files, directories, isLoading, mutate } = useCustomerFiles(
    customerId,
    selectedYear,
    selectedPath
  )
  const { years, mutate: mutateYears } = useCustomerFileYears(customerId)

  // 上傳檔案
  const handleUpload: UploadProps['customRequest'] = async (options) => {
    const { file, onSuccess, onError } = options
    setUploading(true)

    try {
      const result = await uploadFile(customerId, file as File, selectedPath || undefined)
      if (result.success) {
        message.success('上傳成功')
        mutate()
        mutateYears()
        onSuccess?.(result)
      } else {
        message.error(result.error || '上傳失敗')
        onError?.(new Error(result.error))
      }
    } catch (error) {
      message.error('上傳失敗')
      onError?.(error as Error)
    } finally {
      setUploading(false)
    }
  }

  // 刪除檔案
  const handleDelete = async (fileId: string) => {
    const result = await deleteFile(customerId, fileId)
    if (result.success) {
      message.success('已刪除')
      mutate()
      mutateYears()
    } else {
      message.error(result.error || '刪除失敗')
    }
  }

  // 同步 Jira 附件
  const handleSyncJira = async () => {
    setSyncing(true)
    try {
      const result = await syncJiraAttachments(customerId)
      if (result.success) {
        message.success(`同步完成：新增 ${result.stats?.synced || 0} 個，略過 ${result.stats?.skipped || 0} 個`)
        mutate()
        mutateYears()
      } else {
        message.error(result.error || '同步失敗')
      }
    } catch (error) {
      message.error('同步失敗')
    } finally {
      setSyncing(false)
    }
  }

  // 表格欄位定義
  const columns: TableColumnsType<CustomerFile> = [
    {
      title: '檔案名稱',
      dataIndex: 'filename',
      key: 'filename',
      render: (filename: string, record) => (
        <Space>
          <FileOutlined />
          <span>{filename}</span>
          {record.source === 'JIRA' && (
            <Tag color="blue" style={{ marginLeft: 4 }}>
              Jira
            </Tag>
          )}
          {record.jiraIssueKey && (
            <Tag color="purple">{record.jiraIssueKey}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '大小',
      dataIndex: 'fileSize',
      key: 'fileSize',
      width: 100,
      render: (size: number) => formatFileSize(size),
    },
    {
      title: '上傳者',
      dataIndex: 'uploadedBy',
      key: 'uploadedBy',
      width: 150,
      render: (email: string) => email?.split('@')[0] || email,
    },
    {
      title: '上傳時間',
      dataIndex: 'uploadedAt',
      key: 'uploadedAt',
      width: 150,
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<DownloadOutlined />}
            href={getDownloadUrl(customerId, record.id)}
            target="_blank"
            size="small"
          >
            下載
          </Button>
          {isAdmin && (
            <Popconfirm
              title="確定要刪除此檔案？"
              onConfirm={() => handleDelete(record.id)}
              okText="確定"
              cancelText="取消"
            >
              <Button type="link" danger icon={<DeleteOutlined />} size="small">
                刪除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  // 年份選項
  const yearOptions = years.length > 0
    ? years.map(y => ({
        value: y.year,
        label: `${y.year} 年${y.count > 0 ? ` (${y.count})` : ''}`,
      }))
    : [{ value: new Date().getFullYear(), label: `${new Date().getFullYear()} 年` }]

  // 目錄選項（包含特殊目錄）
  const getFolderLabel = (folder: string) => {
    switch (folder) {
      case 'jira':
        return 'Jira 附件'
      case 'finance':
        return '財務文件'
      default:
        return folder
    }
  }

  const pathOptions = [
    { value: '', label: '全部檔案' },
    { value: 'jira', label: 'Jira 附件' },
    // 財務目錄（需要權限）
    ...(canAccessFinance ? [{ value: 'finance', label: '💰 財務文件' }] : []),
    // 其他目錄
    ...directories
      .filter(d => d !== 'jira' && d !== 'finance')
      .map(d => ({ value: d, label: d })),
  ]

  return (
    <Card
      title={
        <Space>
          <FolderOutlined />
          <span>檔案管理</span>
          <Select
            value={selectedYear}
            onChange={setSelectedYear}
            options={yearOptions}
            style={{ width: 120 }}
            size="small"
          />
          <Select
            value={selectedPath}
            onChange={setSelectedPath}
            options={pathOptions}
            style={{ width: 140 }}
            size="small"
            placeholder="選擇目錄"
          />
          {selectedPath === 'finance' && (
            <Tag icon={<LockOutlined />} color="gold">
              僅財務/管理員可存取
            </Tag>
          )}
        </Space>
      }
      extra={
        <Space>
          <Button
            icon={<CloudDownloadOutlined />}
            onClick={handleSyncJira}
            loading={syncing}
          >
            同步 Jira 附件
          </Button>
          <Upload
            customRequest={handleUpload}
            showUploadList={false}
            multiple
          >
            <Button type="primary" icon={<UploadOutlined />} loading={uploading}>
              上傳檔案
            </Button>
          </Upload>
        </Space>
      }
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : files.length === 0 ? (
        <Empty
          description={
            selectedPath
              ? `${selectedYear} 年 ${selectedPath} 目錄下沒有檔案`
              : `${selectedYear} 年沒有檔案`
          }
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Upload customRequest={handleUpload} showUploadList={false}>
            <Button type="primary" icon={<UploadOutlined />}>
              上傳第一個檔案
            </Button>
          </Upload>
        </Empty>
      ) : (
        <Table
          dataSource={files}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 個檔案`,
          }}
        />
      )}
    </Card>
  )
}
