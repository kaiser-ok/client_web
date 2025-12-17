import useSWR from 'swr'
import useSWRInfinite from 'swr/infinite'
import { Activity } from '@/types/activity'

const fetcher = (url: string) => fetch(url).then(res => res.json())

interface ActivitiesResponse {
  activities: Activity[]
  total: number
  hasMore: boolean
}

export function useActivities(
  customerId?: string,
  source?: string,
  limit = 50
) {
  const params = new URLSearchParams()
  if (customerId) params.set('customerId', customerId)
  if (source) params.set('source', source)
  params.set('limit', limit.toString())

  const { data, error, isLoading, mutate } = useSWR<ActivitiesResponse>(
    `/api/activities?${params.toString()}`,
    fetcher
  )

  return {
    activities: data?.activities || [],
    total: data?.total || 0,
    hasMore: data?.hasMore || false,
    isLoading,
    isError: error,
    mutate,
  }
}

export function useInfiniteActivities(
  customerId?: string,
  source?: string,
  pageSize = 20
) {
  const getKey = (pageIndex: number, previousPageData: ActivitiesResponse | null) => {
    if (previousPageData && !previousPageData.hasMore) return null

    const params = new URLSearchParams()
    if (customerId) params.set('customerId', customerId)
    if (source) params.set('source', source)
    params.set('limit', pageSize.toString())
    params.set('offset', (pageIndex * pageSize).toString())

    return `/api/activities?${params.toString()}`
  }

  const { data, error, isLoading, size, setSize, mutate } =
    useSWRInfinite<ActivitiesResponse>(getKey, fetcher)

  const activities = data?.flatMap(page => page.activities) || []
  const hasMore = data?.[data.length - 1]?.hasMore ?? false

  return {
    activities,
    isLoading,
    isError: error,
    hasMore,
    loadMore: () => setSize(size + 1),
    mutate,
  }
}

export async function createActivity(data: {
  customerId: string
  source: string
  title: string
  content?: string
  tags?: string[]
  attachments?: string[]
  jiraKey?: string
}) {
  const response = await fetch('/api/activities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '建立活動失敗')
  }

  return response.json()
}
