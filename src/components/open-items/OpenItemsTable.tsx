'use client'

import { useState } from 'react'
import {
  Table,
  Button,
  Space,
  Typography,
  Tooltip,
  DatePicker,
  Select,
  message,
  Empty,
  Spin,
  Tag,
} from 'antd'
import {
  MessageOutlined,
  LinkOutlined,
  CopyOutlined,
  ExpandOutlined,
} from '@ant-design/icons'
import type { ColumnsType, TableProps } from 'antd/es/table'
import StatusBadge from '@/components/common/StatusBadge'
import PriorityBadge from '@/components/common/PriorityBadge'
import { WaitingOnTag } from '@/components/common/WaitingOnSelect'
import WaitingOnSelect from '@/components/common/WaitingOnSelect'
import InlineEdit from '@/components/common/InlineEdit'
import OpenItemsCard from './OpenItemsCard'
import OpenItemFilters from './OpenItemFilters'
import ReplyModal from './ReplyModal'
import BottomSheet from './BottomSheet'
import { useOpenItems, updateOpenItem } from '@/hooks/useOpenItems'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { OpenItem } from '@/types/open-item'
import { WaitingOnType } from '@/constants/waiting-on'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'

dayjs.extend(relativeTime)
dayjs.locale('zh-tw')

const { Text, Paragraph } = Typography

interface OpenItemsTableProps {
  customerId: string
  compact?: boolean
}

export default function OpenItemsTable({ customerId, compact }: OpenItemsTableProps) {
  const isMobile = useIsMobile()
  const [filters, setFilters] = useState<Record<string, unknown>>({})
  const [sortField, setSortField] = useState('jiraUpdated')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [replyModalOpen, setReplyModalOpen] = useState(false)
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<OpenItem | null>(null)

  const { openItems, isLoading, mutate } = useOpenItems(
    customerId,
    filters as any,
    sortField,
    sortOrder
  )

  const handleReply = (item: OpenItem) => {
    setSelectedItem(item)
    if (isMobile) {
      setBottomSheetOpen(true)
    } else {
      setReplyModalOpen(true)
    }
  }

  const handleMore = (item: OpenItem) => {
    setSelectedItem(item)
    setBottomSheetOpen(true)
  }

  const handleWaitingOnChange = async (item: OpenItem, value: WaitingOnType | null) => {
    try {
      await updateOpenItem(item.id, { waitingOn: value })
      message.success('已更新')
      mutate()
    } catch (error) {
      message.error('更新失敗')
    }
  }

  const handleNextActionChange = async (item: OpenItem, value: string) => {
    try {
      await updateOpenItem(item.id, { nextAction: value })
      message.success('已更新')
      mutate()
    } catch (error) {
      message.error('更新失敗')
      throw error
    }
  }

  const handleDueDateChange = async (item: OpenItem, date: dayjs.Dayjs | null) => {
    try {
      await updateOpenItem(item.id, { dueDate: date?.toDate() || null })
      message.success('已更新')
      mutate()
    } catch (error) {
      message.error('更新失敗')
    }
  }

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key)
    message.success('已複製')
  }

  const openInJira = (key: string) => {
    const jiraHost = process.env.NEXT_PUBLIC_JIRA_HOST || 'https://your-domain.atlassian.net'
    window.open(`${jiraHost}/browse/${key}`, '_blank')
  }

  const columns: ColumnsType<OpenItem> = [
    {
      title: 'Key',
      dataIndex: 'jiraKey',
      key: 'jiraKey',
      width: 100,
      fixed: 'left',
      render: (key: string) => (
        <Space size={4}>
          <a onClick={() => openInJira(key)}>{key}</a>
          <Tooltip title="複製">
            <CopyOutlined
              style={{ fontSize: 12, color: '#999', cursor: 'pointer' }}
              onClick={() => copyKey(key)}
            />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: '標題',
      dataIndex: 'summary',
      key: 'summary',
      ellipsis: { showTitle: false },
      render: (summary: string) => (
        <Tooltip title={summary}>
          <Text ellipsis style={{ maxWidth: 200 }}>{summary}</Text>
        </Tooltip>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => <StatusBadge status={status} />,
    },
    {
      title: '優先級',
      dataIndex: 'priority',
      key: 'priority',
      width: 70,
      render: (priority: string) => <PriorityBadge priority={priority} />,
    },
    {
      title: '負責人',
      dataIndex: 'assignee',
      key: 'assignee',
      width: 100,
      ellipsis: true,
      render: (assignee: string) => assignee || '-',
    },
    {
      title: '等待誰',
      dataIndex: 'waitingOn',
      key: 'waitingOn',
      width: 120,
      render: (_, record) => (
        <WaitingOnSelect
          value={record.waitingOn}
          onChange={(value) => handleWaitingOnChange(record, value)}
        />
      ),
    },
    {
      title: '下一步',
      dataIndex: 'nextAction',
      key: 'nextAction',
      width: 200,
      render: (_, record) => (
        <InlineEdit
          value={record.nextAction}
          onSave={(value) => handleNextActionChange(record, value)}
          placeholder="點擊設定..."
        />
      ),
    },
    {
      title: '到期日',
      dataIndex: 'dueDate',
      key: 'dueDate',
      width: 130,
      sorter: true,
      render: (date: string, record) => {
        const isOverdue = date && new Date(date) < new Date()
        return (
          <DatePicker
            value={date ? dayjs(date) : null}
            onChange={(d) => handleDueDateChange(record, d)}
            size="small"
            style={{ width: '100%' }}
            status={isOverdue ? 'error' : undefined}
          />
        )
      },
    },
    {
      title: '更新',
      dataIndex: 'jiraUpdated',
      key: 'jiraUpdated',
      width: 100,
      sorter: true,
      render: (date: string) => (
        <Tooltip title={dayjs(date).format('YYYY-MM-DD HH:mm')}>
          {dayjs(date).fromNow()}
        </Tooltip>
      ),
    },
    {
      title: '最後回覆',
      dataIndex: 'lastReply',
      key: 'lastReply',
      width: 180,
      ellipsis: true,
      render: (reply: string, record) => {
        if (!reply) return '-'
        return (
          <Tooltip title={reply}>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {record.lastReplyBy}
              </Text>
              <br />
              <Text ellipsis style={{ fontSize: 12 }}>{reply}</Text>
            </div>
          </Tooltip>
        )
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="回覆">
            <Button
              type="text"
              icon={<MessageOutlined />}
              onClick={() => handleReply(record)}
            />
          </Tooltip>
          <Tooltip title="開啟 Jira">
            <Button
              type="text"
              icon={<LinkOutlined />}
              onClick={() => openInJira(record.jiraKey)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ]

  // Compact columns for overview tab
  const compactColumns = columns.filter(col =>
    ['jiraKey', 'summary', 'status', 'waitingOn', 'jiraUpdated', 'actions'].includes(col.key as string)
  )

  const handleTableChange: TableProps<OpenItem>['onChange'] = (pagination, filters, sorter) => {
    if (!Array.isArray(sorter) && sorter.field) {
      setSortField(sorter.field as string)
      setSortOrder(sorter.order === 'ascend' ? 'asc' : 'desc')
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin size="large" />
      </div>
    )
  }

  // Empty state
  if (openItems.length === 0) {
    return (
      <Empty
        description="尚無待處理問題"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    )
  }

  // Mobile view
  if (isMobile) {
    return (
      <>
        <OpenItemFilters
          filters={filters}
          onFilterChange={setFilters}
          compact
        />

        <Select
          value={`${sortField}-${sortOrder}`}
          onChange={(value) => {
            const [field, order] = value.split('-')
            setSortField(field)
            setSortOrder(order as 'asc' | 'desc')
          }}
          style={{ width: '100%', marginBottom: 16 }}
          options={[
            { value: 'dueDate-asc', label: '到期日最早' },
            { value: 'jiraUpdated-desc', label: '最久未更新' },
            { value: 'priority-desc', label: '優先級最高' },
            { value: 'lastReplyAt-desc', label: '最新回覆' },
          ]}
        />

        {openItems.map(item => (
          <OpenItemsCard
            key={item.id}
            item={item}
            onReply={() => handleReply(item)}
            onMore={() => handleMore(item)}
          />
        ))}

        <BottomSheet
          open={bottomSheetOpen}
          openItem={selectedItem}
          onClose={() => setBottomSheetOpen(false)}
          onUpdate={mutate}
        />
      </>
    )
  }

  // Desktop view
  return (
    <>
      {!compact && (
        <OpenItemFilters filters={filters} onFilterChange={setFilters} />
      )}

      <Table
        columns={compact ? compactColumns : columns}
        dataSource={openItems}
        rowKey="id"
        size="small"
        scroll={{ x: compact ? 600 : 1400 }}
        onChange={handleTableChange}
        pagination={compact ? { pageSize: 5, hideOnSinglePage: true } : { pageSize: 20 }}
      />

      <ReplyModal
        open={replyModalOpen}
        openItem={selectedItem}
        onClose={() => setReplyModalOpen(false)}
        onSuccess={mutate}
      />

      <BottomSheet
        open={bottomSheetOpen}
        openItem={selectedItem}
        onClose={() => setBottomSheetOpen(false)}
        onUpdate={mutate}
      />
    </>
  )
}
