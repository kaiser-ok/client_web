/**
 * Chat Skills - 結構化查詢技能
 * LLM 意圖分類後呼叫對應的資料庫查詢
 */

import { prisma } from './prisma'
import { chatCompletion } from './llm'
import { odooClient } from './odoo'

export interface SkillResult {
  skill: string
  data: unknown
  summary: string // 給 LLM 用的結構化文字
}

// ============================================================
// Skill: expiring_contracts - 快到期的合約/維護案
// ============================================================
async function expiringContracts(params: { days?: number }): Promise<SkillResult> {
  const days = params.days || 90
  const now = new Date()
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

  const deals = await prisma.deal.findMany({
    where: {
      endDate: {
        gte: now,
        lte: future,
      },
    },
    include: { partner: { select: { name: true } } },
    orderBy: { endDate: 'asc' },
  })

  // 也找已過期但未處理的
  const expired = await prisma.deal.findMany({
    where: {
      endDate: {
        lt: now,
        gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000), // 過期 90 天內
      },
    },
    include: { partner: { select: { name: true } } },
    orderBy: { endDate: 'desc' },
    take: 10,
  })

  const formatDeal = (d: typeof deals[0], isExpired = false) => {
    const daysLeft = Math.ceil((d.endDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    const status = isExpired ? `已過期 ${Math.abs(daysLeft)} 天` : `剩餘 ${daysLeft} 天`
    return [
      `- ${d.partner.name}｜${d.name}`,
      `  類型：${d.projectType || d.type}｜金額：${d.amount || '未填'}`,
      `  到期日：${d.endDate!.toISOString().slice(0, 10)}（${status}）`,
      d.autoRenew ? '  自動續約：是' : '',
      d.salesRep ? `  負責業務：${d.salesRep}` : '',
    ].filter(Boolean).join('\n')
  }

  const lines: string[] = []
  if (expired.length > 0) {
    lines.push(`【已過期（近 90 天）】共 ${expired.length} 筆`)
    lines.push(...expired.map(d => formatDeal(d, true)))
    lines.push('')
  }
  if (deals.length > 0) {
    lines.push(`【即將到期（${days} 天內）】共 ${deals.length} 筆`)
    lines.push(...deals.map(d => formatDeal(d)))
  }
  if (deals.length === 0 && expired.length === 0) {
    lines.push(`未來 ${days} 天內沒有即將到期的合約。`)
  }

  return {
    skill: 'expiring_contracts',
    data: { expiring: deals, expired },
    summary: lines.join('\n'),
  }
}

// ============================================================
// Skill: customer_deals - 某客戶的訂單
// ============================================================
async function customerDeals(params: { customerName?: string; partnerId?: string }): Promise<SkillResult> {
  let partner
  if (params.partnerId) {
    partner = await prisma.partner.findUnique({ where: { id: params.partnerId } })
  } else if (params.customerName) {
    partner = await prisma.partner.findFirst({
      where: {
        OR: [
          { name: { contains: params.customerName, mode: 'insensitive' } },
          { aliases: { has: params.customerName } },
        ],
      },
    })
  }

  if (!partner) {
    return {
      skill: 'customer_deals',
      data: null,
      summary: `找不到客戶「${params.customerName || params.partnerId}」`,
    }
  }

  const deals = await prisma.deal.findMany({
    where: { partnerId: partner.id },
    orderBy: { closedAt: 'desc' },
  })

  const totalAmount = deals.reduce((sum, d) => sum + (d.amount ? Number(d.amount) : 0), 0)

  const lines = [
    `客戶：${partner.name}`,
    `訂單總數：${deals.length} 筆｜總金額：${totalAmount.toLocaleString()}`,
    '',
  ]

  for (const d of deals) {
    lines.push([
      `- ${d.name}｜${d.projectType || d.type}`,
      `  金額：${d.amount || '未填'}｜成交：${d.closedAt.toISOString().slice(0, 10)}`,
      d.endDate ? `  服務到期：${d.endDate.toISOString().slice(0, 10)}` : '',
      d.products ? `  產品：${d.products}` : '',
      d.salesRep ? `  業務：${d.salesRep}` : '',
    ].filter(Boolean).join('\n'))
  }

  return {
    skill: 'customer_deals',
    data: { partner, deals, totalAmount },
    summary: lines.join('\n'),
  }
}

// ============================================================
// Skill: deal_summary - 營收/訂單統計
// ============================================================
async function dealSummary(params: { year?: number; groupBy?: string }): Promise<SkillResult> {
  const year = params.year || new Date().getFullYear()
  const startDate = new Date(`${year}-01-01`)
  const endDate = new Date(`${year + 1}-01-01`)

  const deals = await prisma.deal.findMany({
    where: {
      closedAt: { gte: startDate, lt: endDate },
    },
    include: { partner: { select: { name: true } } },
    orderBy: { closedAt: 'asc' },
  })

  const totalAmount = deals.reduce((sum, d) => sum + (d.amount ? Number(d.amount) : 0), 0)

  // 按類型統計
  const byType = new Map<string, { count: number; amount: number }>()
  for (const d of deals) {
    const key = d.projectType || d.type
    const entry = byType.get(key) || { count: 0, amount: 0 }
    entry.count++
    entry.amount += d.amount ? Number(d.amount) : 0
    byType.set(key, entry)
  }

  // 按月統計
  const byMonth = new Map<string, { count: number; amount: number }>()
  for (const d of deals) {
    const month = d.closedAt.toISOString().slice(0, 7)
    const entry = byMonth.get(month) || { count: 0, amount: 0 }
    entry.count++
    entry.amount += d.amount ? Number(d.amount) : 0
    byMonth.set(month, entry)
  }

  // 按業務統計
  const bySalesRep = new Map<string, { count: number; amount: number }>()
  for (const d of deals) {
    const rep = d.salesRep || '未指定'
    const entry = bySalesRep.get(rep) || { count: 0, amount: 0 }
    entry.count++
    entry.amount += d.amount ? Number(d.amount) : 0
    bySalesRep.set(rep, entry)
  }

  const lines = [
    `【${year} 年訂單統計】`,
    `總計：${deals.length} 筆｜總金額：${totalAmount.toLocaleString()}`,
    '',
    '【按類型】',
    ...[...byType.entries()]
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([type, v]) => `  ${type}：${v.count} 筆，${v.amount.toLocaleString()}`),
    '',
    '【按月份】',
    ...[...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => `  ${month}：${v.count} 筆，${v.amount.toLocaleString()}`),
    '',
    '【按業務】',
    ...[...bySalesRep.entries()]
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([rep, v]) => `  ${rep}：${v.count} 筆，${v.amount.toLocaleString()}`),
  ]

  return {
    skill: 'deal_summary',
    data: { year, totalAmount, deals: deals.length, byType: Object.fromEntries(byType), byMonth: Object.fromEntries(byMonth) },
    summary: lines.join('\n'),
  }
}

// ============================================================
// Skill: customer_activities - 某客戶最近動態
// ============================================================
async function customerActivities(params: { customerName?: string; partnerId?: string; limit?: number }): Promise<SkillResult> {
  let partner
  if (params.partnerId) {
    partner = await prisma.partner.findUnique({ where: { id: params.partnerId } })
  } else if (params.customerName) {
    partner = await prisma.partner.findFirst({
      where: {
        OR: [
          { name: { contains: params.customerName, mode: 'insensitive' } },
          { aliases: { has: params.customerName } },
        ],
      },
    })
  }

  if (!partner) {
    return {
      skill: 'customer_activities',
      data: null,
      summary: `找不到客戶「${params.customerName || params.partnerId}」`,
    }
  }

  const activities = await prisma.activity.findMany({
    where: { partnerId: partner.id },
    orderBy: { createdAt: 'desc' },
    take: params.limit || 20,
  })

  const lines = [
    `客戶：${partner.name}｜最近 ${activities.length} 筆活動`,
    '',
  ]

  for (const a of activities) {
    lines.push([
      `- [${a.createdAt.toISOString().slice(0, 10)}] ${a.title}`,
      `  來源：${a.source}`,
      a.content ? `  ${a.content.slice(0, 200)}` : '',
      a.tags.length > 0 ? `  標籤：${a.tags.join(', ')}` : '',
    ].filter(Boolean).join('\n'))
  }

  if (activities.length === 0) {
    lines.push('此客戶目前沒有活動記錄。')
  }

  return {
    skill: 'customer_activities',
    data: { partner, activities },
    summary: lines.join('\n'),
  }
}

// ============================================================
// Skill: overdue_items - 逾期/待處理事項
// ============================================================
async function overdueItems(params: { customerName?: string; partnerId?: string; status?: string }): Promise<SkillResult> {
  const where: Record<string, unknown> = {
    status: { notIn: ['Done', 'Closed', 'done', 'closed', 'DONE', 'CLOSED'] },
  }

  if (params.partnerId) {
    where.partnerId = params.partnerId
  } else if (params.customerName) {
    const partner = await prisma.partner.findFirst({
      where: {
        OR: [
          { name: { contains: params.customerName, mode: 'insensitive' } },
          { aliases: { has: params.customerName } },
        ],
      },
    })
    if (partner) where.partnerId = partner.id
  }

  const items = await prisma.openItem.findMany({
    where,
    include: { partner: { select: { name: true } } },
    orderBy: [
      { priority: 'asc' },
      { dueDate: 'asc' },
    ],
    take: 30,
  })

  const now = new Date()
  const overdue = items.filter(i => i.dueDate && i.dueDate < now)
  const upcoming = items.filter(i => !i.dueDate || i.dueDate >= now)

  const formatItem = (item: typeof items[0]) => {
    const dueDateStr = item.dueDate
      ? item.dueDate.toISOString().slice(0, 10)
      : '無期限'
    const isOverdue = item.dueDate && item.dueDate < now
    return [
      `- [${item.priority || '-'}] ${item.summary}`,
      `  客戶：${item.partner.name}｜狀態：${item.status}`,
      `  到期：${dueDateStr}${isOverdue ? ' ⚠ 已逾期' : ''}`,
      item.assignee ? `  負責人：${item.assignee}` : '',
      item.waitingOn ? `  等待：${item.waitingOn}` : '',
      item.jiraKey ? `  Jira：${item.jiraKey}` : '',
    ].filter(Boolean).join('\n')
  }

  const lines: string[] = [
    `待處理事項：共 ${items.length} 筆（逾期 ${overdue.length} 筆）`,
    '',
  ]

  if (overdue.length > 0) {
    lines.push('【已逾期】')
    lines.push(...overdue.map(formatItem))
    lines.push('')
  }

  if (upcoming.length > 0) {
    lines.push('【進行中】')
    lines.push(...upcoming.map(formatItem))
  }

  if (items.length === 0) {
    lines.push('目前沒有待處理事項。')
  }

  return {
    skill: 'overdue_items',
    data: { overdue, upcoming, total: items.length },
    summary: lines.join('\n'),
  }
}

// ============================================================
// Skill: serial_lookup - 設備序號查詢
// ============================================================
async function serialLookup(params: { serialNo: string }): Promise<SkillResult> {
  const { serialNo } = params
  if (!serialNo) {
    return { skill: 'serial_lookup', data: null, summary: '請提供設備序號。' }
  }

  const info = await odooClient.getSerialInfo(serialNo.trim().toUpperCase())
  if (!info) {
    return {
      skill: 'serial_lookup',
      data: null,
      summary: `找不到序號「${serialNo}」的出貨記錄，請確認序號是否正確。`,
    }
  }

  const lines = [
    `序號：${info.serialNo}`,
    `產品：${info.productName}`,
    `案子名稱：${info.saleOrderName || '—'}${info.projectName ? `（${info.projectName}）` : ''}`,
    info.clientOrderRef ? `客戶參照：${info.clientOrderRef}` : '',
    `客戶：${info.partnerName || '—'}`,
    info.orderDeliveryDate ? `訂單交貨日期：${info.orderDeliveryDate}` : '',
    `出貨日期：${info.deliveryDate || '尚未出貨'}`,
  ].filter(Boolean).join('\n')

  return { skill: 'serial_lookup', data: info, summary: lines }
}

// ============================================================
// Intent Classification - 意圖分類
// ============================================================

export interface ClassifiedIntent {
  skill: string | null  // null = 使用 RAG
  params: Record<string, unknown>
  reasoning: string
}

const INTENT_SYSTEM_PROMPT = `你是一個意圖分類器。根據用戶的問題，判斷應該使用哪個技能（skill）來回答。

可用的技能：
1. expiring_contracts - 查詢即將到期或已過期的合約/維護案。參數：days（天數，預設90）
2. customer_deals - 查詢特定客戶的所有訂單。參數：customerName（客戶名稱）
3. deal_summary - 訂單/營收統計。參數：year（年份）
4. customer_activities - 查詢特定客戶的最近動態/活動記錄。參數：customerName（客戶名稱），limit（筆數）
5. overdue_items - 查詢逾期或待處理的事項/issue。參數：customerName（客戶名稱，可選）
6. serial_lookup - 查詢設備序號的出貨資訊（案子名稱、出貨日期、客戶、產品）。參數：serialNo（序號）
7. rag - 其他問題，使用向量搜尋。

回覆格式必須是純 JSON，不要有其他文字：
{"skill": "技能名稱", "params": {參數物件}, "reasoning": "判斷原因"}

範例：
用戶：快到期的維護合約
回覆：{"skill": "expiring_contracts", "params": {"days": 90}, "reasoning": "用戶詢問即將到期的合約"}

用戶：友訊科技買了什麼
回覆：{"skill": "customer_deals", "params": {"customerName": "友訊科技"}, "reasoning": "用戶查詢特定客戶的訂單"}

用戶：今年的營收如何
回覆：{"skill": "deal_summary", "params": {"year": 2026}, "reasoning": "用戶詢問年度營收統計"}

用戶：有什麼逾期的案件
回覆：{"skill": "overdue_items", "params": {}, "reasoning": "用戶詢問逾期待處理事項"}

用戶：HHE0A35RZ8D 是哪個案子的
回覆：{"skill": "serial_lookup", "params": {"serialNo": "HHE0A35RZ8D"}, "reasoning": "用戶查詢設備序號"}

用戶：序號 HHE0ACAG0Q5 什麼時候出貨
回覆：{"skill": "serial_lookup", "params": {"serialNo": "HHE0ACAG0Q5"}, "reasoning": "用戶查詢出貨時間"}

用戶：VoIP 系統的技術架構是什麼
回覆：{"skill": "rag", "params": {}, "reasoning": "技術問題需要搜尋文件"}
`

export async function classifyIntent(query: string, partnerId?: string): Promise<ClassifiedIntent> {
  try {
    const result = await chatCompletion(
      [
        { role: 'system', content: INTENT_SYSTEM_PROMPT },
        { role: 'user', content: query },
      ],
      { maxTokens: 200, temperature: 0.1 }
    )

    // 提取 JSON
    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { skill: null, params: {}, reasoning: 'Failed to parse intent' }
    }

    const parsed = JSON.parse(jsonMatch[0])

    // 如果有指定 partnerId，加到 params
    if (partnerId && parsed.skill !== 'deal_summary' && parsed.skill !== 'rag') {
      parsed.params.partnerId = partnerId
    }

    if (parsed.skill === 'rag') {
      return { skill: null, params: parsed.params || {}, reasoning: parsed.reasoning }
    }

    return {
      skill: parsed.skill,
      params: parsed.params || {},
      reasoning: parsed.reasoning,
    }
  } catch (error) {
    console.error('Intent classification error:', error)
    return { skill: null, params: {}, reasoning: 'Classification failed, falling back to RAG' }
  }
}

// ============================================================
// Execute Skill
// ============================================================

const SKILL_MAP: Record<string, (params: Record<string, unknown>) => Promise<SkillResult>> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expiring_contracts: (p: any) => expiringContracts(p),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customer_deals: (p: any) => customerDeals(p),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deal_summary: (p: any) => dealSummary(p),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customer_activities: (p: any) => customerActivities(p),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  overdue_items: (p: any) => overdueItems(p),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serial_lookup: (p: any) => serialLookup(p as { serialNo: string }),
}

export async function executeSkill(skillName: string, params: Record<string, unknown>): Promise<SkillResult | null> {
  const fn = SKILL_MAP[skillName]
  if (!fn) return null
  return fn(params)
}
