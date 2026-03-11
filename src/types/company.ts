export interface BankInfo {
  bankName: string
  branchName: string
  bankCode: string
  accountNumber: string
  accountName: string
}

export interface CompanyConfig {
  version: string
  name: string
  address: string
  phone: string
  email: string
  contactPerson: string
  contactTitle: string
  logoPath: string
  bankInfo: BankInfo
  defaultTerms: string[]
  taxRate: number
  validDays: number
  updatedAt: string
  updatedBy: string
}

export const COMPANY_CONFIG_KEY = 'company_config'

export const DEFAULT_COMPANY_CONFIG: CompanyConfig = {
  version: '1.0',
  name: '',
  address: '',
  phone: '',
  email: '',
  contactPerson: '',
  contactTitle: '',
  logoPath: '/images/company-logo.png',
  bankInfo: {
    bankName: '',
    branchName: '',
    bankCode: '',
    accountNumber: '',
    accountName: '',
  },
  defaultTerms: [
    '付款條件：訂單確認回簽後支付 30% 訂金，硬體設備到貨支付 40%，系統驗收完成後支付尾款 30%。',
    '交貨期限：硬體設備約 14-21 個工作天（視原廠庫存而定）；軟體服務依雙方確認之專案時程為主。',
    '保固說明：硬體設備依原廠保固條款；客製化設定服務提供 3 個月非人為故障免費保修。',
  ],
  taxRate: 0.05,
  validDays: 30,
  updatedAt: new Date().toISOString(),
  updatedBy: '',
}

export interface QuotationPDFData {
  quotation: {
    quotationNo: string
    projectName?: string
    validUntil?: Date | string
    createdAt: Date | string
    notes?: string
    totalAmount: number
  }
  partner: {
    name: string
    contact?: string
    phone?: string
    email?: string
    address?: string
  }
  items: {
    productId?: string
    sku?: string
    productName: string
    category?: string
    description?: string
    quantity: number
    unitPrice: number
    subtotal: number
  }[]
  company: CompanyConfig
}
