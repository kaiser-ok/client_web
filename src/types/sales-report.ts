// 銷售報表類型定義

export interface SalesReportSummary {
  totalRevenue: number
  dealCount: number
  avgDealSize: number
  period: string
  yoyGrowth?: number
  yoyRevenueChange?: number
}

export interface TimeSeriesData {
  period: string
  revenue: number
  dealCount: number
  prevYearRevenue?: number
}

export interface ProjectTypeBreakdown {
  projectType: string
  revenue: number
  dealCount: number
  percentage: number
}

export interface SalesRepBreakdown {
  salesRep: string
  revenue: number
  dealCount: number
  avgDealSize: number
}

export interface TopCustomer {
  customerId: string
  customerName: string
  revenue: number
  dealCount: number
}

export interface MonthlyComparison {
  month: string
  currentYear: number
  previousYear: number
  growth: number
}

export interface SalesReportData {
  summary: SalesReportSummary
  timeSeries: TimeSeriesData[]
  byProjectType: ProjectTypeBreakdown[]
  bySalesRep: SalesRepBreakdown[]
  topCustomers: TopCustomer[]
  monthlyComparison?: MonthlyComparison[]
}

export interface SalesReportFilters {
  startDate?: string
  endDate?: string
  groupBy?: 'month' | 'quarter' | 'year'
  includeYoY?: boolean
  salesRep?: string
  projectType?: string
}
