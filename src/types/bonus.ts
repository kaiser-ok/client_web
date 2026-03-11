export interface ProjectCostItem {
  id?: string
  category: string
  description: string
  amount: number
}

export interface BonusMember {
  id?: string
  userId: string
  userName?: string
  userEmail?: string
  role: string
  yearOffset: number
  contributionPct: number
  score?: number
}

export interface ProjectBonusEvalData {
  id: string
  projectId: string
  projectName?: string
  partnerName?: string
  dealName?: string
  dealAmount: number
  year: number
  totalCost: number
  projectAmount: number
  baseScore: number
  importanceAdj: number
  qualityAdj: number
  efficiencyAdj: number
  totalScore: number
  warrantyYears: number
  scoreSpreadPcts: number[] | null
  status: string
  evaluatedBy?: string
  approvedBy?: string
  notes?: string
  createdBy: string
  createdAt: string
  updatedAt: string
  costs: ProjectCostItem[]
  members: BonusMember[]
}

export interface BonusReportRow {
  userId: string
  userName: string
  userEmail: string
  totalScore: number
  projects: Array<{
    projectId: string
    projectName: string
    partnerName: string
    role: string
    contributionPct: number
    score: number
  }>
}

export interface BonusReport {
  year: number
  totalBonusPool: number
  allMembersTotal: number
  rows: BonusReportRow[]
}
