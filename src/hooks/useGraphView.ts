import useSWR from 'swr'
import { Organization360Response } from '@/lib/graphiti'

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'API 請求失敗')
  }
  return res.json()
}

interface GraphViewResponse extends Organization360Response {
  synced: boolean
}

export function useGraphView(customerId: string | null, view: '360' | 'network' = '360', depth: number = 2) {
  const url = customerId
    ? `/api/customers/${customerId}/graph-view?view=${view}${view === 'network' ? `&depth=${depth}` : ''}`
    : null
  const { data, error, isLoading, mutate } = useSWR<GraphViewResponse>(
    url,
    fetcher,
    {
      revalidateOnFocus: false,
    }
  )

  return {
    graphData: data,
    isLoading,
    isError: error,
    isEmpty: data ? !data.synced : false,
    mutate,
  }
}
