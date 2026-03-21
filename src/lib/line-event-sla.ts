/**
 * LINE 事件 SLA 計算工具
 */

export interface SLARule {
  priority: string
  responseMinutes: number
  resolveMinutes: number
}

export const DEFAULT_SLA_RULES: SLARule[] = [
  { priority: 'P1',     responseMinutes: 30,   resolveMinutes: 240   },
  { priority: 'P2',     responseMinutes: 120,  resolveMinutes: 1440  },
  { priority: 'NORMAL', responseMinutes: 480,  resolveMinutes: 4320  },
]

export function getSLARule(priority: string, rules: SLARule[] = DEFAULT_SLA_RULES): SLARule {
  return rules.find(r => r.priority === priority) ?? rules.find(r => r.priority === 'NORMAL')!
}

export function calcSLADueDates(priority: string, from: Date = new Date(), rules?: SLARule[]) {
  const rule = getSLARule(priority, rules)
  const slaResponseDue = new Date(from.getTime() + rule.responseMinutes * 60 * 1000)
  const slaResolveDue  = new Date(from.getTime() + rule.resolveMinutes  * 60 * 1000)
  return { slaResponseDue, slaResolveDue }
}

export type SLAStatus = 'ok' | 'warning' | 'breached'

export function getSLAStatus(due: Date | null, now: Date = new Date()): SLAStatus {
  if (!due) return 'ok'
  const remaining = due.getTime() - now.getTime()
  const total = due.getTime() - (due.getTime() - 24 * 60 * 60 * 1000) // rough
  if (remaining <= 0) return 'breached'
  // 剩餘時間 < 25% 視為警告，但至少剩不到 1 小時時警告
  if (remaining < 60 * 60 * 1000) return 'warning'
  return 'ok'
}
