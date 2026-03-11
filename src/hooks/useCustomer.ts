import useSWR from 'swr'
import { Customer, CustomerWithRelations } from '@/types/customer'

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'API 請求失敗')
  }
  return res.json()
}

interface CustomersResponse {
  customers: CustomerWithRelations[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export function useCustomers(
  search?: string,
  page = 1,
  pageSize = 20,
  sortField?: string,
  sortOrder?: 'asc' | 'desc',
  role?: string
) {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  params.set('page', page.toString())
  params.set('pageSize', pageSize.toString())
  if (sortField) params.set('sortField', sortField)
  if (sortOrder) params.set('sortOrder', sortOrder)
  if (role) params.set('role', role)

  const { data, error, isLoading, mutate } = useSWR<CustomersResponse>(
    `/api/customers?${params.toString()}`,
    fetcher
  )

  return {
    customers: data?.customers || [],
    total: data?.total || 0,
    totalPages: data?.totalPages || 0,
    isLoading,
    isError: error,
    mutate,
  }
}

export function useCustomer(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<CustomerWithRelations>(
    id ? `/api/customers/${id}` : null,
    fetcher
  )

  return {
    customer: data,
    isLoading,
    isError: error,
    mutate,
  }
}

export async function createCustomer(data: Partial<Customer>) {
  const response = await fetch('/api/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '建立客戶失敗')
  }

  return response.json()
}

export async function updateCustomer(id: string, data: Partial<Customer>) {
  const response = await fetch(`/api/customers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '更新客戶失敗')
  }

  return response.json()
}

export async function deleteCustomer(id: string) {
  const response = await fetch(`/api/customers/${id}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '刪除客戶失敗')
  }

  return response.json()
}
