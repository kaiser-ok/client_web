// 銷售報表類型定義

export interface SalesReportSummary {
  totalRevenue: number
  invoicedRevenue: number
  invoiceCount: number
  unpaidRevenue: number
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

export interface UninvoicedOrder {
  id: string
  name: string
  projectName: string | null
  partnerId: string
  partnerName: string
  salesRep: string | null
  projectType: string | null
  closedAt: string
  amount: number           // 訂單含稅總額
  amountToInvoice: number  // 待開票金額（含稅；Odoo amount_to_invoice 由 amount_total 推算）
  daysOpen: number         // 成交至今天數
  odooUrl: string | null   // Odoo 訂單表單連結（取不到 web.base.url 時為 null）
}

export interface UninvoicedBucket {
  bucket: string
  orderCount: number
  amountToInvoice: number
}

export interface UninvoicedBacklog {
  orderCount: number
  totalAmountToInvoice: number   // 含稅
  byAge: UninvoicedBucket[]
  bySalesRep: UninvoicedBucket[]
  orders: UninvoicedOrder[]
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
  uninvoiced: UninvoicedBacklog
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
