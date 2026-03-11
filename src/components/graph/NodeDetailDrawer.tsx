'use client'

import { Drawer, Descriptions, Tag, Empty } from 'antd'
import { NODE_STYLE_MAP, getPrimaryLabel } from './graph-constants'

interface NodeDetailDrawerProps {
  open: boolean
  node: Record<string, unknown> | null
  onClose: () => void
}

const INTERNAL_KEYS = new Set(['_id', '_labels', 'id', '_elementId'])

function has(node: Record<string, unknown>, key: string): boolean {
  return node[key] != null && node[key] !== ''
}

function getNodeLabel(node: Record<string, unknown>): string {
  const labels = node._labels as string[] | undefined
  return labels ? getPrimaryLabel(labels) : 'Unknown'
}

function getNodeName(node: Record<string, unknown>): string {
  return String(node.name || node.summary || node.jira_key || node._id || '未知')
}

function renderOrganization(node: Record<string, unknown>) {
  return (
    <Descriptions column={1} size="small" bordered>
      {has(node, 'name') ? <Descriptions.Item label="名稱">{String(node.name)}</Descriptions.Item> : null}
      {has(node, 'email') ? <Descriptions.Item label="Email">{String(node.email)}</Descriptions.Item> : null}
      {has(node, 'phone') ? <Descriptions.Item label="電話">{String(node.phone)}</Descriptions.Item> : null}
      {has(node, 'website') ? <Descriptions.Item label="網站">{String(node.website)}</Descriptions.Item> : null}
      {has(node, 'aliases') ? <Descriptions.Item label="別名">{String(node.aliases)}</Descriptions.Item> : null}
      {has(node, 'crm_id') ? <Descriptions.Item label="CRM ID">{String(node.crm_id)}</Descriptions.Item> : null}
    </Descriptions>
  )
}

function renderPerson(node: Record<string, unknown>) {
  return (
    <Descriptions column={1} size="small" bordered>
      {has(node, 'name') ? <Descriptions.Item label="姓名">{String(node.name)}</Descriptions.Item> : null}
      {has(node, 'title') ? <Descriptions.Item label="職稱">{String(node.title)}</Descriptions.Item> : null}
      {has(node, 'email') ? <Descriptions.Item label="Email">{String(node.email)}</Descriptions.Item> : null}
      {has(node, 'phone') ? <Descriptions.Item label="電話">{String(node.phone)}</Descriptions.Item> : null}
    </Descriptions>
  )
}

function renderDeal(node: Record<string, unknown>) {
  return (
    <Descriptions column={1} size="small" bordered>
      {has(node, 'name') ? <Descriptions.Item label="名稱">{String(node.name)}</Descriptions.Item> : null}
      {has(node, 'type') ? <Descriptions.Item label="類型">{String(node.type)}</Descriptions.Item> : null}
      {has(node, 'amount') ? <Descriptions.Item label="金額">${Number(node.amount).toLocaleString()}</Descriptions.Item> : null}
      {has(node, 'sales_rep') ? <Descriptions.Item label="業務">{String(node.sales_rep)}</Descriptions.Item> : null}
      {has(node, 'closed_at') ? <Descriptions.Item label="成交日">{String(node.closed_at)}</Descriptions.Item> : null}
      {has(node, 'start_date') ? <Descriptions.Item label="開始日">{String(node.start_date)}</Descriptions.Item> : null}
      {has(node, 'end_date') ? <Descriptions.Item label="結束日">{String(node.end_date)}</Descriptions.Item> : null}
    </Descriptions>
  )
}

function renderIssue(node: Record<string, unknown>) {
  return (
    <Descriptions column={1} size="small" bordered>
      {has(node, 'jira_key') ? <Descriptions.Item label="Jira Key">{String(node.jira_key)}</Descriptions.Item> : null}
      {has(node, 'summary') ? <Descriptions.Item label="摘要">{String(node.summary)}</Descriptions.Item> : null}
      {has(node, 'status') ? <Descriptions.Item label="狀態">{String(node.status)}</Descriptions.Item> : null}
      {has(node, 'priority') ? <Descriptions.Item label="優先級">{String(node.priority)}</Descriptions.Item> : null}
      {has(node, 'assignee') ? <Descriptions.Item label="負責人">{String(node.assignee)}</Descriptions.Item> : null}
    </Descriptions>
  )
}

function renderProject(node: Record<string, unknown>) {
  return (
    <Descriptions column={1} size="small" bordered>
      {has(node, 'name') ? <Descriptions.Item label="名稱">{String(node.name)}</Descriptions.Item> : null}
      {has(node, 'type') ? <Descriptions.Item label="類型">{String(node.type)}</Descriptions.Item> : null}
      {has(node, 'status') ? <Descriptions.Item label="狀態">{String(node.status)}</Descriptions.Item> : null}
      {has(node, 'start_date') ? <Descriptions.Item label="開始日">{String(node.start_date)}</Descriptions.Item> : null}
      {has(node, 'end_date') ? <Descriptions.Item label="結束日">{String(node.end_date)}</Descriptions.Item> : null}
    </Descriptions>
  )
}

function renderProduct(node: Record<string, unknown>) {
  return (
    <Descriptions column={1} size="small" bordered>
      {has(node, 'name') ? <Descriptions.Item label="名稱">{String(node.name)}</Descriptions.Item> : null}
      {has(node, 'sku') ? <Descriptions.Item label="SKU">{String(node.sku)}</Descriptions.Item> : null}
      {has(node, 'category') ? <Descriptions.Item label="類別">{String(node.category)}</Descriptions.Item> : null}
    </Descriptions>
  )
}

function renderGeneric(node: Record<string, unknown>) {
  const entries = Object.entries(node).filter(([key]) => !INTERNAL_KEYS.has(key) && !key.startsWith('_'))
  if (entries.length === 0) return <Empty description="無屬性資料" image={Empty.PRESENTED_IMAGE_SIMPLE} />
  return (
    <Descriptions column={1} size="small" bordered>
      {entries.map(([key, value]) => (
        <Descriptions.Item key={key} label={key}>
          {value != null ? String(value) : '-'}
        </Descriptions.Item>
      ))}
    </Descriptions>
  )
}

const RENDERERS: Record<string, (node: Record<string, unknown>) => React.ReactNode> = {
  Organization: renderOrganization,
  Person: renderPerson,
  Deal: renderDeal,
  Issue: renderIssue,
  Project: renderProject,
  Product: renderProduct,
}

export default function NodeDetailDrawer({ open, node, onClose }: NodeDetailDrawerProps) {
  if (!node) return null

  const label = getNodeLabel(node)
  const name = getNodeName(node)
  const style = NODE_STYLE_MAP[label]
  const render = RENDERERS[label] || renderGeneric

  return (
    <Drawer
      title={
        <span>
          <Tag color={style?.stroke || '#999'}>{label}</Tag>
          {name}
        </span>
      }
      placement="right"
      width={380}
      open={open}
      onClose={onClose}
    >
      {render(node)}
    </Drawer>
  )
}
