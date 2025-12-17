import useSWR from 'swr'
import { Deal, CreateDealInput, UpdateDealInput } from '@/types/deal'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed to fetch')
  return res.json()
})

export function useDeals(customerId: string, limit = 10) {
  const { data, error, isLoading, mutate } = useSWR<Deal[]>(
    customerId ? `/api/deals?customerId=${customerId}&limit=${limit}` : null,
    fetcher
  )

  return {
    deals: data || [],
    isLoading,
    isError: error,
    mutate,
  }
}

export async function createDeal(input: CreateDealInput): Promise<Deal> {
  const response = await fetch('/api/deals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || '建立失敗')
  }

  return response.json()
}

export async function updateDeal(id: string, input: UpdateDealInput): Promise<Deal> {
  const response = await fetch(`/api/deals/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || '更新失敗')
  }

  return response.json()
}

export async function deleteDeal(id: string): Promise<void> {
  const response = await fetch(`/api/deals/${id}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || '刪除失敗')
  }
}
