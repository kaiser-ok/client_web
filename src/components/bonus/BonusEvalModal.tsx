'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Modal, Form, InputNumber, Input, Select, Button, Table, Space, Collapse,
  Slider, Card, Statistic, Row, Col, Tag, Divider, App, Popconfirm, Tabs, Alert, Switch, AutoComplete,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, DollarOutlined, PercentageOutlined,
  TrophyOutlined, CheckCircleOutlined, CloudDownloadOutlined, RollbackOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import {
  COST_CATEGORIES, MEMBER_ROLES, DEFAULT_ALLOCATION, SCORE_ADJUSTMENTS,
  WARRANTY_SPREAD_TEMPLATES, WARRANTY_YEAR_RD_DEFAULT_PCT,
  BONUS_CATEGORIES, BONUS_CATEGORY_DIVISOR,
} from '@/constants/bonus'
import type { ProjectCostItem, BonusMember, ProjectBonusEvalData } from '@/types/bonus'
import { useUser } from '@/hooks/useUser'

interface Props {
  open: boolean
  onClose: () => void
  projectId: string
  projectName: string
  projectType?: string // MA, PURCHASE, etc.
  dealAmount?: number
  dealName?: string
}

export default function BonusEvalModal({
  open, onClose, projectId, projectName, projectType, dealAmount: initialDealAmount, dealName,
}: Props) {
  const { message } = App.useApp()
  const { role, can } = useUser()
  const canApproveBase = can('APPROVE_BONUS')
  const canEdit = can('EDIT_BONUS')
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [evalData, setEvalData] = useState<ProjectBonusEvalData | null>(null)
  const [costs, setCosts] = useState<ProjectCostItem[]>([])
  // membersByYear: key = yearOffset (0, 1, 2...), value = members for that year
  const [membersByYear, setMembersByYear] = useState<Record<number, BonusMember[]>>({ 0: [] })
  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string }>>([])
  const [dealAmount, setDealAmount] = useState(initialDealAmount || 0)
  const [importanceAdj, setImportanceAdj] = useState(0)
  const [qualityAdj, setQualityAdj] = useState(0)
  const [efficiencyAdj, setEfficiencyAdj] = useState(0)
  const [warrantyYears, setWarrantyYears] = useState(1)
  const [scoreSpreadPcts, setScoreSpreadPcts] = useState<number[]>([100])
  const [activeYearTab, setActiveYearTab] = useState('0')
  const [costCollapseKeys, setCostCollapseKeys] = useState<string[]>([])
  const [bonusCategory, setBonusCategory] = useState<string>('STANDARD')
  const [isDirectAllocation, setIsDirectAllocation] = useState(false)
  // Credit pool allocation (direct mode)
  const [poolInfo, setPoolInfo] = useState<{ totalPoints: number; remainingPoints: number } | null>(null)
  const [allocPoints, setAllocPoints] = useState<number | null>(null)
  const [allocReason, setAllocReason] = useState('')
  const [allocating, setAllocating] = useState(false)
  const [partnerId, setPartnerId] = useState<string | null>(null)

  // Fetch pool info for a given year (used in direct allocation mode)
  const fetchPoolInfo = useCallback(async (year: number) => {
    try {
      const res = await fetch(`/api/credit-pool?year=${year}`)
      if (!res.ok) { setPoolInfo(null); return }
      const data = await res.json()
      if (data.pool) {
        const allocated = (data.pool.allocations || []).reduce((s: number, a: { points: number }) => s + Number(a.points), 0)
        setPoolInfo({ totalPoints: Number(data.pool.totalPoints), remainingPoints: Number(data.pool.totalPoints) - allocated })
      } else {
        setPoolInfo(null)
      }
    } catch { setPoolInfo(null) }
  }, [])

  // Fetch eval data + users
  useEffect(() => {
    if (!open) return
    setLoading(true)
    Promise.all([
      fetch(`/api/projects/${projectId}/bonus-eval`).then(r => {
        if (!r.ok) throw new Error(`bonus-eval ${r.status}: ${projectId}`)
        return r.json()
      }),
      fetch('/api/users').then(r => r.json()),
    ]).then(([evalRes, usersRes]) => {
      setUsers(Array.isArray(usersRes) ? usersRes : usersRes.users || [])

      if (evalRes.eval) {
        const ev = evalRes.eval
        setEvalData(ev)
        setPartnerId(ev.partnerId || null)
        setDealAmount(Number(ev.dealAmount))
        const loadedCosts = ev.costs.map((c: ProjectCostItem) => ({
          id: c.id,
          category: c.category,
          description: c.description,
          amount: Number(c.amount),
        }))
        setCosts(loadedCosts)
        setCostCollapseKeys(loadedCosts.length > 0 && loadedCosts.length <= 5 ? ['costs'] : [])
        // Group members by yearOffset
        const grouped: Record<number, BonusMember[]> = {}
        const wYears = ev.warrantyYears || 1
        for (let i = 0; i < wYears; i++) grouped[i] = []
        for (const m of ev.members) {
          const yo = m.yearOffset ?? 0
          if (!grouped[yo]) grouped[yo] = []
          grouped[yo].push({
            id: m.id,
            userId: m.userId,
            userName: m.userName,
            userEmail: m.userEmail,
            role: m.role,
            yearOffset: yo,
            contributionPct: Number(m.contributionPct),
          })
        }
        setMembersByYear(grouped)
        setBonusCategory(ev.bonusCategory || 'STANDARD')
        const isDirect = ev.isDirectAllocation || false
        setIsDirectAllocation(isDirect)
        setImportanceAdj(Number(ev.importanceAdj))
        setQualityAdj(Number(ev.qualityAdj))
        setEfficiencyAdj(Number(ev.efficiencyAdj))
        setWarrantyYears(wYears)
        setScoreSpreadPcts(ev.scoreSpreadPcts || [100])
        form.setFieldsValue({
          year: ev.year,
          notes: ev.notes,
        })
        if (isDirect) fetchPoolInfo(ev.year)
      } else {
        // New eval - set defaults
        setPartnerId(evalRes.project?.partner?.id || null)
        const effectiveDealAmount = initialDealAmount || (evalRes.project?.deal?.amount ? Number(evalRes.project.deal.amount) : 0)
        // Default to direct allocation when there's no deal amount
        const defaultDirect = !effectiveDealAmount
        setIsDirectAllocation(defaultDirect)
        setPoolInfo(null)
        setDealAmount(effectiveDealAmount)
        setCosts([])
        setCostCollapseKeys([])
        setMembersByYear({ 0: [] })
        setBonusCategory('STANDARD')
        setImportanceAdj(0)
        setQualityAdj(0)
        setEfficiencyAdj(0)
        setWarrantyYears(1)
        setScoreSpreadPcts([100])
        form.setFieldsValue({
          year: new Date().getFullYear(),
          notes: '',
        })
      }
      setActiveYearTab('0')
    }).catch(() => {
      message.error('載入資料失敗')
    }).finally(() => setLoading(false))
  }, [open, projectId, initialDealAmount, form, fetchPoolInfo])

  // Fetch pool info when switching to direct allocation mode (new eval)
  useEffect(() => {
    if (isDirectAllocation && !evalData) {
      const year = form.getFieldValue('year') || new Date().getFullYear()
      fetchPoolInfo(year)
    }
  }, [isDirectAllocation, evalData, form, fetchPoolInfo])

  // Computed scores
  const totalCost = useMemo(() => costs.reduce((s, c) => s + Number(c.amount || 0), 0), [costs])
  const projectAmount = useMemo(() => dealAmount - totalCost, [dealAmount, totalCost])
  const divisor = BONUS_CATEGORY_DIVISOR[bonusCategory] || 100000
  const baseScore = useMemo(() => projectAmount / divisor, [projectAmount, divisor])
  const multiplier = useMemo(() => 1 + (importanceAdj + qualityAdj + efficiencyAdj) / 100, [importanceAdj, qualityAdj, efficiencyAdj])
  const totalScore = useMemo(() => baseScore * multiplier, [baseScore, multiplier])

  // Per-year score and pct totals
  const yearScores = useMemo(() => {
    const result: Record<number, { yearScore: number; totalPct: number }> = {}
    for (let i = 0; i < warrantyYears; i++) {
      const pct = scoreSpreadPcts[i] ?? 0
      const yearScore = totalScore * pct / 100
      const members = membersByYear[i] || []
      const totalPct = members.reduce((s, m) => s + Number(m.contributionPct || 0), 0)
      result[i] = { yearScore, totalPct }
    }
    return result
  }, [warrantyYears, scoreSpreadPcts, totalScore, membersByYear])

  const addCost = useCallback(() => {
    setCosts(prev => [{ id: `_new_${Date.now()}`, category: 'HARDWARE', description: '', amount: 0 }, ...prev])
  }, [])

  const removeCost = useCallback((index: number) => {
    setCosts(prev => prev.filter((_, i) => i !== index))
  }, [])

  const updateCost = useCallback((index: number, field: string, value: string | number) => {
    setCosts(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c))
  }, [])

  const [importingOdoo, setImportingOdoo] = useState(false)

  const importOdooCosts = useCallback(async () => {
    setImportingOdoo(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/odoo-costs`)
      const data = await res.json()
      if (!res.ok) {
        message.error(data.error || '取得 Odoo 資料失敗')
        return
      }
      if (!data.items || data.items.length === 0) {
        message.info('此訂單無出貨紀錄')
        return
      }
      const newCosts: ProjectCostItem[] = data.items.map((item: { product_name: string; qty: number; total_cost: number; date_done: string | null }, i: number) => ({
        id: `_odoo_${Date.now()}_${i}`,
        category: 'HARDWARE',
        description: `${item.product_name} x${item.qty}${item.date_done ? ` (${item.date_done})` : ''}`,
        amount: item.total_cost,
      }))
      setCosts(prev => [...prev, ...newCosts])
      message.success(`已匯入 ${newCosts.length} 筆出貨紀錄`)
    } catch {
      message.error('匯入 Odoo 資料失敗')
    } finally {
      setImportingOdoo(false)
    }
  }, [projectId])

  const addMember = useCallback((yearOffset: number) => {
    setMembersByYear(prev => ({
      ...prev,
      [yearOffset]: [...(prev[yearOffset] || []), { id: `_new_${Date.now()}_${Math.random().toString(36).slice(2)}`, userId: '', role: 'ENGINEER', yearOffset, contributionPct: 0 }],
    }))
  }, [])

  const removeMember = useCallback((yearOffset: number, index: number) => {
    setMembersByYear(prev => ({
      ...prev,
      [yearOffset]: (prev[yearOffset] || []).filter((_, i) => i !== index),
    }))
  }, [])

  const updateMember = useCallback((yearOffset: number, index: number, field: string, value: string | number) => {
    setMembersByYear(prev => ({
      ...prev,
      [yearOffset]: (prev[yearOffset] || []).map((m, i) => i === index ? { ...m, [field]: value } : m),
    }))
  }, [])

  const handleMemberSearch = useCallback((searchText: string, yearOffset: number, index: number) => {
    if (!searchText) return
    const lower = searchText.toLowerCase()
    const matched = users.filter(u =>
      (u.name || u.email).toLowerCase().includes(lower)
    )
    if (matched.length === 1) {
      const u = matched[0]
      setMembersByYear(prev => ({
        ...prev,
        [yearOffset]: (prev[yearOffset] || []).map((m, i) =>
          i === index
            ? { ...m, userId: u.id, userName: u.name, userEmail: u.email }
            : m
        ),
      }))
    }
  }, [users])

  // Apply default allocation for a specific year
  const applyDefaultAllocation = useCallback((yearOffset: number) => {
    const yearMembers = membersByYear[yearOffset] || []
    if (yearMembers.length === 0) return

    const allocKey = projectType === 'MA' ? 'MA' : 'SYSTEM'
    const alloc = DEFAULT_ALLOCATION[allocKey]
    if (!alloc) return

    const newMembers = yearMembers.map(m => {
      const defaultPct = alloc[m.role] || 0
      const sameRoleCount = yearMembers.filter(mm => mm.role === m.role).length
      return { ...m, contributionPct: sameRoleCount > 0 ? defaultPct / sameRoleCount : 0 }
    })
    setMembersByYear(prev => ({ ...prev, [yearOffset]: newMembers }))
    message.info(`已套用${allocKey === 'MA' ? '維運' : '系統專案'}預設比例`)
  }, [membersByYear, projectType])

  // Generate warranty year members from year 0 members
  // Rules: exclude SALES, RD defaults to 30%
  const generateWarrantyYearMembers = useCallback((yearOffset: number) => {
    const year0Members = membersByYear[0] || []
    if (year0Members.length === 0) {
      message.warning('請先設定第 1 年的成員')
      return
    }

    // Filter out SALES, keep others
    const warrantyMembers: BonusMember[] = []
    let rdTotal = 0

    for (const m of year0Members) {
      if (m.role === 'SALES') continue // 業務不帶入保固年份
      if (!m.userId) continue
      warrantyMembers.push({
        userId: m.userId,
        userName: m.userName,
        userEmail: m.userEmail,
        role: m.role,
        yearOffset,
        contributionPct: 0, // will be set below
      })
    }

    // Set default percentages: RD members get 30% total, rest distributed
    const rdMembers = warrantyMembers.filter(m => m.role === 'ENGINEER')
    const nonRdMembers = warrantyMembers.filter(m => m.role !== 'ENGINEER')

    if (rdMembers.length > 0) {
      rdTotal = WARRANTY_YEAR_RD_DEFAULT_PCT
      const perRd = rdTotal / rdMembers.length
      rdMembers.forEach(m => { m.contributionPct = Math.round(perRd * 10) / 10 })
    }

    // Distribute remaining to non-RD members equally
    const remaining = 100 - rdTotal
    if (nonRdMembers.length > 0) {
      const perNonRd = remaining / nonRdMembers.length
      nonRdMembers.forEach(m => { m.contributionPct = Math.round(perNonRd * 10) / 10 })
    } else if (rdMembers.length > 0) {
      // If only RD members, give them 100%
      const perRd = 100 / rdMembers.length
      rdMembers.forEach(m => { m.contributionPct = Math.round(perRd * 10) / 10 })
    }

    setMembersByYear(prev => ({ ...prev, [yearOffset]: warrantyMembers }))
    message.info(`已從第 1 年帶入成員（排除業務，RD 預設 ${WARRANTY_YEAR_RD_DEFAULT_PCT}%）`)
  }, [membersByYear])

  // Handle warranty years change
  const handleWarrantyYearsChange = useCallback((newYears: number) => {
    setWarrantyYears(newYears)
    const template = WARRANTY_SPREAD_TEMPLATES[newYears]
    setScoreSpreadPcts(template ? [...template.pcts] : Array(newYears).fill(Math.round(100 / newYears)))

    // Initialize empty member lists for new years, remove extra years
    setMembersByYear(prev => {
      const next: Record<number, BonusMember[]> = {}
      for (let i = 0; i < newYears; i++) {
        next[i] = prev[i] || []
      }
      return next
    })
  }, [])

  // Flatten membersByYear for save
  const allMembers = useMemo(() => {
    const flat: BonusMember[] = []
    for (let i = 0; i < warrantyYears; i++) {
      for (const m of (membersByYear[i] || [])) {
        flat.push({ ...m, yearOffset: i })
      }
    }
    return flat
  }, [membersByYear, warrantyYears])

  const handleSave = async (submitStatus?: string) => {

    setSaving(true)
    try {
      const values = form.getFieldsValue()
      const year = values.year || new Date().getFullYear()
      const res = await fetch(`/api/projects/${projectId}/bonus-eval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          isDirectAllocation,
          dealAmount: isDirectAllocation ? 0 : dealAmount,
          costs: isDirectAllocation ? [] : costs,
          members: allMembers.map(m => ({
            userId: m.userId,
            role: m.role,
            yearOffset: m.yearOffset,
            contributionPct: m.contributionPct,
          })),
          bonusCategory,
          importanceAdj,
          qualityAdj,
          efficiencyAdj,
          warrantyYears,
          scoreSpreadPcts,
          notes: values.notes,
          status: submitStatus || evalData?.status || 'DRAFT',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        message.error(data.error || '儲存失敗')
        return
      }

      // If direct allocation mode and points/reason filled, allocate immediately
      if (isDirectAllocation && allocPoints && allocReason.trim() && data.eval?.id) {
        const allocRes = await fetch('/api/credit-pool/allocations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year, evalId: data.eval.id, points: allocPoints, reason: allocReason }),
        })
        const allocData = await allocRes.json()
        if (!allocRes.ok) {
          message.warning(`儲存成功，但點數分配失敗：${allocData.error || '未知錯誤'}`)
        } else {
          message.success(`儲存成功，已分配 ${allocPoints} 點`)
          setAllocPoints(null)
          setAllocReason('')
        }
        // Reload eval with updated pool allocations
        const evalRes = await fetch(`/api/projects/${projectId}/bonus-eval`).then(r => r.json())
        if (evalRes.eval) setEvalData(evalRes.eval)
        await fetchPoolInfo(year)
      } else {
        message.success('儲存成功')
        // Reload eval data to reflect latest state
        if (isDirectAllocation) {
          const evalRes = await fetch(`/api/projects/${projectId}/bonus-eval`).then(r => r.json())
          if (evalRes.eval) setEvalData(evalRes.eval)
          await fetchPoolInfo(year)
        }
      }

      if (submitStatus !== 'DRAFT') {
        onClose()
      }
    } catch {
      message.error('儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  const handleApprove = async (action: 'approve' | 'reject' | 'paid' | 'revert') => {
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/bonus-eval`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) {
        message.error(data.error || '操作失敗')
        return
      }
      message.success(action === 'approve' ? '已核准' : action === 'revert' ? '已退回草稿' : '已退回')
      onClose()
    } catch {
      message.error('操作失敗')
    } finally {
      setSaving(false)
    }
  }

  // Credit pool allocation handlers
  const handleAllocate = async () => {
    if (!evalData || !allocPoints || !allocReason.trim()) {
      message.error('請填寫點數與原因')
      return
    }
    setAllocating(true)
    try {
      const year = form.getFieldValue('year') || evalData.year
      const res = await fetch('/api/credit-pool/allocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, evalId: evalData.id, points: allocPoints, reason: allocReason }),
      })
      const data = await res.json()
      if (!res.ok) { message.error(data.error || '分配失敗'); return }
      message.success(`已分配 ${allocPoints} 點`)
      setAllocPoints(null)
      setAllocReason('')
      // Reload eval data and pool info
      const [evalRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/bonus-eval`).then(r => r.json()),
        fetchPoolInfo(year),
      ])
      if (evalRes.eval) setEvalData(evalRes.eval)
    } catch { message.error('分配失敗') } finally { setAllocating(false) }
  }

  const handleRevokeAllocation = async (allocationId: string) => {
    setAllocating(true)
    try {
      const res = await fetch(`/api/credit-pool/allocations?id=${allocationId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { message.error(data.error || '撤回失敗'); return }
      message.success('已撤回分配')
      const year = form.getFieldValue('year') || evalData?.year
      const [evalRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/bonus-eval`).then(r => r.json()),
        fetchPoolInfo(year),
      ])
      if (evalRes.eval) setEvalData(evalRes.eval)
    } catch { message.error('撤回失敗') } finally { setAllocating(false) }
  }

  // FINANCE can approve when dealAmount < 300000
  const canApprove = canApproveBase || (role === 'FINANCE' && dealAmount < 300000)

  const isReadOnly = !canEdit || evalData?.status === 'APPROVED' || evalData?.status === 'PAID'

  // Render member table for a specific yearOffset
  const renderMemberTable = (yearOffset: number) => {
    const yearMembers = membersByYear[yearOffset] || []
    const { yearScore, totalPct } = yearScores[yearOffset] || { yearScore: 0, totalPct: 0 }
    const isWarrantyYear = yearOffset > 0

    return (
      <div>
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            {totalPct > 0 && (
              <Tag color={Math.abs(totalPct - 100) < 0.01 ? 'green' : totalPct > 100 ? 'red' : 'orange'}>
                合計 {totalPct.toFixed(1)}%
              </Tag>
            )}
            {isDirectAllocation ? (
              <Tag color="purple">
                點數分配比例（{scoreSpreadPcts[yearOffset] ?? 0}% 攤分）
              </Tag>
            ) : (
              <Tag color="purple">
                年度積分：{yearScore.toFixed(2)} 分 ({scoreSpreadPcts[yearOffset] ?? 0}%)
              </Tag>
            )}
          </Space>
          {!isReadOnly && (
            <Space>
              <Button type="link" icon={<PlusOutlined />} onClick={() => addMember(yearOffset)} size="small">新增</Button>
              {isWarrantyYear && (
                <Button type="link" onClick={() => generateWarrantyYearMembers(yearOffset)} size="small">
                  從第 1 年帶入
                </Button>
              )}
              {yearMembers.length > 0 && (
                <Button type="link" icon={<PercentageOutlined />} onClick={() => applyDefaultAllocation(yearOffset)} size="small">
                  套用預設比例
                </Button>
              )}
            </Space>
          )}
        </div>
        {yearMembers.length > 0 ? (
          <Table
            dataSource={yearMembers}
            rowKey={record => record.id || `${record.userId}-${record.yearOffset}`}
            pagination={false}
            size="small"
            summary={() => {
              const totalMemberScore = yearMembers.reduce((s, m) => s + yearScore * (m.contributionPct || 0) / 100, 0)
              const pctOk = Math.abs(totalPct - 100) < 0.01
              const pctOver = totalPct > 100
              return (
                <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 'bold' }}>
                  <Table.Summary.Cell index={0} colSpan={2} align="right">
                    小計
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2}>
                    <span style={{ color: pctOk ? '#52c41a' : pctOver ? '#ff4d4f' : '#faad14' }}>
                      {totalPct.toFixed(1)}%
                      {!pctOk && <span style={{ fontSize: 12, marginLeft: 4 }}>（{pctOver ? '超過' : '剩餘'} {Math.abs(100 - totalPct).toFixed(1)}%）</span>}
                    </span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3}>
                    <span style={{ color: '#722ed1' }}>
                      {totalMemberScore.toFixed(2)}
                    </span>
                  </Table.Summary.Cell>
                  {!isReadOnly && <Table.Summary.Cell index={4} />}
                </Table.Summary.Row>
              )
            }}
            columns={[
              {
                title: '成員', dataIndex: 'userId', width: 200,
                render: (val: string, record: BonusMember, i: number) => isReadOnly ? (
                  <span>{record.userName || record.userEmail || val}</span>
                ) : (
                  <Select
                    value={val || undefined}
                    onChange={v => updateMember(yearOffset, i, 'userId', v)}
                    onSearch={text => handleMemberSearch(text, yearOffset, i)}
                    style={{ width: '100%' }}
                    placeholder="選擇成員"
                    showSearch
                    optionFilterProp="label"
                    options={users.map(u => ({
                      value: u.id,
                      label: u.name || u.email,
                    }))}
                  />
                ),
              },
              {
                title: '角色', dataIndex: 'role', width: 130,
                render: (val: string, _: BonusMember, i: number) => (
                  <Select value={val} onChange={v => updateMember(yearOffset, i, 'role', v)} style={{ width: '100%' }} disabled={isReadOnly}>
                    {MEMBER_ROLES.map(r => <Select.Option key={r.value} value={r.value}>{r.label}</Select.Option>)}
                  </Select>
                ),
              },
              {
                title: '貢獻比例 (%)', dataIndex: 'contributionPct', width: 130,
                render: (val: number, _: BonusMember, i: number) => (
                  <InputNumber
                    value={val}
                    onChange={v => updateMember(yearOffset, i, 'contributionPct', v || 0)}
                    min={0}
                    max={100}
                    precision={1}
                    style={{ width: '100%' }}
                    disabled={isReadOnly}
                  />
                ),
              },
              {
                title: isDirectAllocation ? '分配點數' : '個人專案分', width: 120,
                render: (_: unknown, record: BonusMember) => (
                  isDirectAllocation ? (() => {
                    const totalPool = evalData?.poolPoints || allocPoints || 0
                    const pts = totalPool * (record.contributionPct || 0) / 100
                    return pts > 0
                      ? <b style={{ color: '#722ed1' }}>{pts.toFixed(2)} 點</b>
                      : <span style={{ color: '#999' }}>—</span>
                  })() : (
                    <span style={{ fontWeight: 'bold', color: '#722ed1' }}>
                      {(yearScore * (record.contributionPct || 0) / 100).toFixed(2)}
                    </span>
                  )
                ),
              },
              ...(!isReadOnly ? [{
                title: '', width: 40,
                render: (_: unknown, __: BonusMember, i: number) => (
                  <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeMember(yearOffset, i)} size="small" />
                ),
              }] : []),
            ]}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '16px 0', color: '#999' }}>
            尚無成員，點擊「新增」或{isWarrantyYear ? '「從第 1 年帶入」' : '手動添加'}
          </div>
        )}
      </div>
    )
  }

  const evalYear = form.getFieldValue('year') || new Date().getFullYear()

  return (
    <Modal
      title={
        <Space>
          <span>專案獎金評估 - {projectName}</span>
          {partnerId && (
            <Button
              type="link"
              size="small"
              icon={<TeamOutlined />}
              href={`/customers/${partnerId}`}
              target="_blank"
              style={{ padding: '0 4px' }}
            >
              前往客戶頁面
            </Button>
          )}
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={900}
      footer={null}
      destroyOnHidden={false}
      forceRender
    >
      <Form form={form} layout="vertical" disabled={loading}>
        {/* Mode toggle for new evals */}
        {!evalData && !isReadOnly && (
          <Alert
            style={{ marginBottom: 16 }}
            type="info"
            title={
              <Space>
                <span>分配模式：</span>
                <Switch
                  checked={isDirectAllocation}
                  onChange={setIsDirectAllocation}
                  checkedChildren="直接分配點數"
                  unCheckedChildren="公式計算"
                />
                {isDirectAllocation && (
                  <span style={{ color: '#595959', fontSize: 12 }}>
                    不輸入金額，點數由 Credit Pool 管理員直接分配，不計入業績統計
                  </span>
                )}
              </Space>
            }
          />
        )}
        {evalData?.isDirectAllocation && (
          <Alert
            style={{ marginBottom: 16 }}
            type="warning"
            title="直接分配模式：此專案不計入業績統計，點數由 Credit Pool 直接分配"
            showIcon
          />
        )}

        {/* Score Summary */}
        <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
          {isDirectAllocation ? (
            <Row gutter={16}>
              <Col span={8}>
                <Statistic
                  title="公式積分"
                  value={0}
                  prefix={<TrophyOutlined />}
                  precision={2}
                  styles={{ content: { fontSize: 16, color: '#999' } }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Credit Pool 點數"
                  value={evalData?.poolPoints || 0}
                  precision={2}
                  styles={{ content: { fontSize: 16, color: '#722ed1' } }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="有效總分"
                  value={evalData?.poolPoints || 0}
                  prefix={<TrophyOutlined />}
                  precision={2}
                  styles={{ content: { fontSize: 18, color: '#722ed1', fontWeight: 'bold' } }}
                />
              </Col>
            </Row>
          ) : (
            <Row gutter={16}>
              <Col span={4}>
                <Statistic
                  title="成案金額"
                  value={dealAmount}
                  prefix={<DollarOutlined />}
                  precision={0}
                  styles={{ content: { fontSize: 16 } }}
                />
              </Col>
              <Col span={4}>
                <Statistic
                  title="外部成本"
                  value={totalCost}
                  precision={0}
                  styles={{ content: { fontSize: 16, color: totalCost > 0 ? '#cf1322' : undefined } }}
                />
              </Col>
              <Col span={4}>
                <Statistic
                  title="專案金額"
                  value={projectAmount}
                  precision={0}
                  styles={{ content: { fontSize: 16, color: '#1890ff' } }}
                />
              </Col>
              <Col span={4}>
                <Statistic
                  title={`基礎分（${divisor === 100000 ? '10萬/點' : '30萬/點'}）`}
                  value={baseScore}
                  precision={2}
                  styles={{ content: { fontSize: 16 } }}
                />
              </Col>
              <Col span={4}>
                <Statistic
                  title="調整係數"
                  value={multiplier * 100}
                  suffix="%"
                  precision={0}
                  styles={{ content: { fontSize: 16, color: multiplier >= 1 ? '#3f8600' : '#cf1322' } }}
                />
              </Col>
              <Col span={4}>
                <Statistic
                  title="專案總分"
                  value={totalScore}
                  prefix={<TrophyOutlined />}
                  precision={2}
                  styles={{ content: { fontSize: 18, color: '#722ed1', fontWeight: 'bold' } }}
                />
              </Col>
            </Row>
          )}
          {!isDirectAllocation && evalData?.poolPoints != null && evalData.poolPoints > 0 && (
            <Row gutter={16} style={{ marginTop: 8 }}>
              <Col span={12}>
                <Tag color="purple" style={{ fontSize: 13, padding: '2px 8px' }}>
                  池點數：+{evalData.poolPoints.toFixed(2)}
                </Tag>
              </Col>
              <Col span={12} style={{ textAlign: 'right' }}>
                <Tag color="blue" style={{ fontSize: 13, padding: '2px 8px' }}>
                  有效總分：{(totalScore + evalData.poolPoints).toFixed(2)}
                </Tag>
              </Col>
            </Row>
          )}
        </Card>

        {/* Credit Pool Allocation Panel */}
        {isDirectAllocation && (
          <Card
            size="small"
            title={<span style={{ color: '#722ed1' }}>Credit Pool 點數分配</span>}
            style={{ marginBottom: 16 }}
            extra={poolInfo ? (
              <Space>
                <Tag color="blue">池總點數：{poolInfo.totalPoints}</Tag>
                <Tag color={poolInfo.remainingPoints > 0 ? 'green' : 'red'}>
                  剩餘：{poolInfo.remainingPoints.toFixed(2)} 點
                </Tag>
              </Space>
            ) : <Tag color="orange">尚無點數池（需先建立）</Tag>}
          >
            {/* Existing allocations */}
            {(evalData?.poolAllocations || []).length > 0 && (
              <Table
                size="small"
                pagination={false}
                style={{ marginBottom: 12 }}
                dataSource={evalData!.poolAllocations}
                rowKey="id"
                columns={[
                  { title: '點數', dataIndex: 'points', width: 80, render: (v: number) => <b style={{ color: '#722ed1' }}>{Number(v).toFixed(2)}</b> },
                  { title: '原因', dataIndex: 'reason' },
                  { title: '分配人', dataIndex: 'allocatedBy', width: 120 },
                  ...(role === 'ADMIN' ? [{
                    title: '', width: 60,
                    render: (_: unknown, row: { id: string }) => (
                      <Popconfirm title="確定撤回此分配？" onConfirm={() => handleRevokeAllocation(row.id)}>
                        <Button type="text" danger icon={<DeleteOutlined />} size="small" loading={allocating} />
                      </Popconfirm>
                    ),
                  }] : []),
                ]}
              />
            )}
            {/* Input form */}
            {role === 'ADMIN' && !isReadOnly && (
              <Space.Compact style={{ width: '100%' }}>
                <InputNumber
                  placeholder="點數"
                  value={allocPoints}
                  onChange={setAllocPoints}
                  min={0.01}
                  precision={2}
                  style={{ width: 120 }}
                />
                <AutoComplete
                  placeholder="原因（必填，可手動輸入）"
                  value={allocReason}
                  onChange={setAllocReason}
                  style={{ flex: 1 }}
                  options={[
                    { value: '內部專案' },
                    { value: '行銷業務需求' },
                  ]}
                  filterOption={(input, option) =>
                    (option?.value as string).includes(input)
                  }
                />
                {evalData ? (
                  <Button
                    type="primary"
                    loading={allocating}
                    onClick={handleAllocate}
                    disabled={!allocPoints || !allocReason.trim()}
                  >
                    立即分配
                  </Button>
                ) : (
                  <Button type="default" disabled>
                    儲存時分配
                  </Button>
                )}
              </Space.Compact>
            )}
            {!evalData && allocPoints && allocReason.trim() && (
              <div style={{ marginTop: 6, color: '#595959', fontSize: 12 }}>
                ✓ 點擊「儲存草稿」後將自動分配 {allocPoints} 點
              </div>
            )}
            {role !== 'ADMIN' && (
              <div style={{ color: '#999', fontSize: 12 }}>僅管理員可分配點數</div>
            )}
          </Card>
        )}

        <Row gutter={16}>
          <Col span={6}>
            <Form.Item label="評估年度" name="year">
              <InputNumber style={{ width: '100%' }} disabled={isReadOnly} />
            </Form.Item>
          </Col>
          {!isDirectAllocation && (
            <>
              <Col span={6}>
                <Form.Item label="獎金類別">
                  <Select
                    value={bonusCategory}
                    onChange={setBonusCategory}
                    disabled={isReadOnly}
                    options={BONUS_CATEGORIES.map(c => ({
                      value: c.value,
                      label: `${c.label}（${c.description}）`,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="成案金額">
                  <InputNumber
                    style={{ width: '100%' }}
                    value={dealAmount}
                    onChange={v => setDealAmount(v || 0)}
                    formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    disabled={isReadOnly}
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="關聯訂單">
                  <Input value={dealName || '-'} disabled />
                </Form.Item>
              </Col>
            </>
          )}
        </Row>

        {/* Warranty Score Spread */}
        <Divider style={{ margin: '12px 0 8px' }}>保固攤分</Divider>
        <Row gutter={16} align="middle">
          <Col span={6}>
            <Form.Item label="保固年數">
              <Select
                value={warrantyYears}
                onChange={handleWarrantyYearsChange}
                disabled={isReadOnly}
                style={{ width: '100%' }}
                options={[1, 2, 3, 4, 5].map(n => ({
                  value: n,
                  label: WARRANTY_SPREAD_TEMPLATES[n]?.label || `${n} 年`,
                }))}
              />
            </Form.Item>
          </Col>
          {warrantyYears > 1 && scoreSpreadPcts.map((pct, i) => (
            <Col span={Math.min(4, Math.floor(18 / warrantyYears))} key={i}>
              <Form.Item label={`第 ${i + 1} 年`}>
                <Space.Compact style={{ width: '100%' }}>
                  <InputNumber
                    value={pct}
                    onChange={(v) => {
                      const newPcts = [...scoreSpreadPcts]
                      newPcts[i] = v || 0
                      setScoreSpreadPcts(newPcts)
                    }}
                    min={0}
                    max={100}
                    precision={0}
                    style={{ width: '100%' }}
                    disabled={isReadOnly}
                  />
                  <Button disabled style={{ pointerEvents: 'none', color: '#595959' }}>%</Button>
                </Space.Compact>
              </Form.Item>
            </Col>
          ))}
          {warrantyYears > 1 && (
            <Col span={3}>
              <Tag
                color={Math.abs(scoreSpreadPcts.reduce((s, p) => s + p, 0) - 100) < 0.01 ? 'green' : 'red'}
                style={{ marginTop: 4 }}
              >
                合計 {scoreSpreadPcts.reduce((s, p) => s + p, 0)}%
              </Tag>
            </Col>
          )}
        </Row>
        {warrantyYears > 1 && (
          <div style={{ marginBottom: 12 }}>
            <Space size={16}>
              {scoreSpreadPcts.map((pct, i) => (
                <Tag key={i} color={i === 0 ? 'blue' : 'default'}>
                  {evalYear + i} 年：{(totalScore * pct / 100).toFixed(2)} 分 ({pct}%)
                </Tag>
              ))}
            </Space>
          </div>
        )}

        {/* Score Adjustments — hidden for direct allocation */}
        {!isDirectAllocation && (
          <>
            <Divider style={{ margin: '12px 0 8px' }}>評分調整</Divider>
            <Row gutter={24}>
              <Col span={8}>
                <Form.Item label={`${SCORE_ADJUSTMENTS.importance.label} (${importanceAdj >= 0 ? '+' : ''}${importanceAdj}%)`}>
                  <Slider
                    min={SCORE_ADJUSTMENTS.importance.min}
                    max={SCORE_ADJUSTMENTS.importance.max}
                    value={importanceAdj}
                    onChange={setImportanceAdj}
                    marks={{ 0: '0%', 10: '10%', 20: '20%' }}
                    disabled={isReadOnly}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label={`${SCORE_ADJUSTMENTS.quality.label} (${qualityAdj >= 0 ? '+' : ''}${qualityAdj}%)`}>
                  <Slider
                    min={SCORE_ADJUSTMENTS.quality.min}
                    max={SCORE_ADJUSTMENTS.quality.max}
                    value={qualityAdj}
                    onChange={setQualityAdj}
                    marks={{ '-10': '-10%', 0: '0%', 10: '10%' }}
                    disabled={isReadOnly}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label={`${SCORE_ADJUSTMENTS.efficiency.label} (${efficiencyAdj >= 0 ? '+' : ''}${efficiencyAdj}%)`}>
                  <Slider
                    min={SCORE_ADJUSTMENTS.efficiency.min}
                    max={SCORE_ADJUSTMENTS.efficiency.max}
                    value={efficiencyAdj}
                    onChange={setEfficiencyAdj}
                    marks={{ '-10': '-10%', 0: '0%', 10: '10%' }}
                    disabled={isReadOnly}
                  />
                </Form.Item>
              </Col>
            </Row>
          </>
        )}

        {/* External Costs — hidden for direct allocation */}
        {!isDirectAllocation && (
        <><Divider style={{ margin: '12px 0 8px' }}>外部成本</Divider>
        <Collapse
          size="small"
          activeKey={costCollapseKeys}
          onChange={keys => setCostCollapseKeys(keys as string[])}
          style={{ marginBottom: 16 }}
          items={[{
            key: 'costs',
            label: (
              <Space>
                <span>外部成本明細</span>
                <Tag>{costs.length} 筆</Tag>
                {totalCost > 0 && <Tag color="red">合計 ${totalCost.toLocaleString()}</Tag>}
              </Space>
            ),
            extra: !isReadOnly ? (
              <Space onClick={e => e.stopPropagation()}>
                <Button type="link" icon={<PlusOutlined />} onClick={addCost} size="small">新增</Button>
                <Button type="link" icon={<CloudDownloadOutlined />} onClick={importOdooCosts} loading={importingOdoo} size="small">
                  從 Odoo 帶入
                </Button>
              </Space>
            ) : undefined,
            children: costs.length > 0 ? (
              <Table
                dataSource={costs}
                rowKey={record => record.id || `${record.category}-${record.description}-${record.amount}`}
                pagination={false}
                size="small"
                columns={[
                  {
                    title: '類別', dataIndex: 'category', width: 150,
                    render: (val: string, _: ProjectCostItem, i: number) => (
                      <Select value={val} onChange={v => updateCost(i, 'category', v)} style={{ width: '100%' }} disabled={isReadOnly}>
                        {COST_CATEGORIES.map(c => <Select.Option key={c.value} value={c.value}>{c.label}</Select.Option>)}
                      </Select>
                    ),
                  },
                  {
                    title: '說明', dataIndex: 'description',
                    render: (val: string, _: ProjectCostItem, i: number) => (
                      <Input value={val} onChange={e => updateCost(i, 'description', e.target.value)} disabled={isReadOnly} />
                    ),
                  },
                  {
                    title: '金額', dataIndex: 'amount', width: 150,
                    render: (val: number, _: ProjectCostItem, i: number) => (
                      <InputNumber
                        value={val}
                        onChange={v => updateCost(i, 'amount', v || 0)}
                        style={{ width: '100%' }}
                        formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        disabled={isReadOnly}
                      />
                    ),
                  },
                  ...(!isReadOnly ? [{
                    title: '', width: 40,
                    render: (_: unknown, __: ProjectCostItem, i: number) => (
                      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeCost(i)} size="small" />
                    ),
                  }] : []),
                ]}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '8px 0', color: '#999' }}>尚無外部成本</div>
            ),
          }]}
        /></>)}

        {/* Members - Per Year Tabs */}
        <Divider style={{ margin: '12px 0 8px' }}>成員分配</Divider>
        {warrantyYears === 1 ? (
          // Single year - no tabs needed
          renderMemberTable(0)
        ) : (
          <Tabs
            activeKey={activeYearTab}
            onChange={setActiveYearTab}
            size="small"
            items={Array.from({ length: warrantyYears }, (_, i) => {
              const { totalPct } = yearScores[i] || { totalPct: 0 }
              const memberCount = (membersByYear[i] || []).length
              return {
                key: String(i),
                label: (
                  <Space size={4}>
                    <span>{evalYear + i} 年{i === 0 ? '（首年）' : `（保固第 ${i + 1} 年）`}</span>
                    {memberCount > 0 && (
                      <Tag
                        color={Math.abs(totalPct - 100) < 0.01 ? 'green' : totalPct > 100 ? 'red' : 'orange'}
                        style={{ marginInlineEnd: 0 }}
                      >
                        {memberCount}人
                      </Tag>
                    )}
                  </Space>
                ),
                children: renderMemberTable(i),
              }
            })}
          />
        )}

        <Form.Item label="備註" name="notes" style={{ marginTop: 16 }}>
          <Input.TextArea rows={2} disabled={isReadOnly} />
        </Form.Item>

        {/* Status & Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <div>
            {evalData && (
              <Tag color={
                evalData.status === 'APPROVED' ? 'green' :
                evalData.status === 'PAID' ? 'purple' :
                evalData.status === 'EVALUATED' ? 'blue' : 'default'
              }>
                {evalData.status === 'APPROVED' ? '已核准' :
                 evalData.status === 'PAID' ? '已發放' :
                 evalData.status === 'EVALUATED' ? '已評估' : '草稿'}
              </Tag>
            )}
          </div>
          <Space>
            {evalData?.status === 'EVALUATED' && canApprove && (
              <>
                <Popconfirm title="確定核准此評估？" onConfirm={() => handleApprove('approve')}>
                  <Button type="primary" icon={<CheckCircleOutlined />} loading={saving}>核准</Button>
                </Popconfirm>
                <Popconfirm title="確定退回？" onConfirm={() => handleApprove('reject')}>
                  <Button danger loading={saving}>退回</Button>
                </Popconfirm>
              </>
            )}
            {evalData?.status === 'APPROVED' && canEdit && (
              <Popconfirm title="確定退回草稿重新編輯？核准狀態將被撤銷。" onConfirm={() => handleApprove('revert')}>
                <Button icon={<RollbackOutlined />} loading={saving}>退回草稿</Button>
              </Popconfirm>
            )}
            {!isReadOnly && (
              <>
                <Button onClick={() => handleSave('DRAFT')} loading={saving}>儲存草稿</Button>
                <Button type="primary" onClick={() => handleSave('EVALUATED')} loading={saving}>提交評估</Button>
              </>
            )}
            <Button onClick={onClose}>關閉</Button>
          </Space>
        </div>
      </Form>
    </Modal>
  )
}
