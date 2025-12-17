import useSWR from 'swr'
import { OpenItem, OpenItemFilters, UpdateOpenItemInput, ReplyInput } from '@/types/open-item'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export function useOpenItems(
  customerId?: string,
  filters?: OpenItemFilters,
  sortField = 'jiraUpdated',
  sortOrder = 'desc'
) {
  const params = new URLSearchParams()

  if (customerId) params.set('customerId', customerId)
  if (filters?.status?.length) params.set('status', filters.status.join(','))
  if (filters?.waitingOn?.length) params.set('waitingOn', filters.waitingOn.join(','))
  if (filters?.assignee) params.set('assignee', filters.assignee)
  params.set('sortField', sortField)
  params.set('sortOrder', sortOrder)

  const { data, error, isLoading, mutate } = useSWR<OpenItem[]>(
    `/api/open-items?${params.toString()}`,
    fetcher
  )

  return {
    openItems: data || [],
    isLoading,
    isError: error,
    mutate,
  }
}

export async function updateOpenItem(id: string, data: UpdateOpenItemInput) {
  const response = await fetch(`/api/open-items/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '更新失敗')
  }

  return response.json()
}

export async function replyToOpenItem(id: string, data: ReplyInput) {
  const response = await fetch(`/api/open-items/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '回覆失敗')
  }

  return response.json()
}

export async function syncOpenItems(customerId: string, projectKey: string) {
  const response = await fetch('/api/open-items/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId, projectKey }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '同步失敗')
  }

  return response.json()
}
