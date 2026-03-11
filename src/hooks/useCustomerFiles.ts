import useSWR from 'swr'

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then(res => res.json())

export interface CustomerFile {
  id: string
  year: number
  filename: string
  storedPath: string
  fileSize: number
  mimeType: string | null
  source: 'MANUAL' | 'JIRA'
  jiraIssueKey: string | null
  uploadedBy: string
  uploadedAt: string
}

export interface YearInfo {
  year: number
  count: number
}

export function useCustomerFiles(customerId: string, year?: number, path?: string) {
  const queryParams = new URLSearchParams()
  if (year) queryParams.set('year', year.toString())
  if (path) queryParams.set('path', path)

  const queryString = queryParams.toString()
  const url = `/api/customers/${customerId}/files${queryString ? `?${queryString}` : ''}`

  const { data, error, mutate } = useSWR(customerId ? url : null, fetcher)

  return {
    files: (data?.files || []) as CustomerFile[],
    years: (data?.years || []) as number[],
    directories: (data?.directories || []) as string[],
    currentYear: data?.currentYear || new Date().getFullYear(),
    currentPath: data?.currentPath || '',
    isLoading: !error && !data,
    error,
    mutate,
  }
}

export function useCustomerFileYears(customerId: string) {
  const { data, error, mutate } = useSWR(
    customerId ? `/api/customers/${customerId}/files/years` : null,
    fetcher
  )

  return {
    years: (data?.years || []) as YearInfo[],
    isLoading: !error && !data,
    error,
    mutate,
  }
}

export async function uploadFile(
  customerId: string,
  file: File,
  path?: string
): Promise<{ success: boolean; file?: CustomerFile; error?: string }> {
  const formData = new FormData()
  formData.append('file', file)
  if (path) formData.append('path', path)

  const response = await fetch(`/api/customers/${customerId}/files/upload`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  })

  const data = await response.json()

  if (!response.ok) {
    return { success: false, error: data.error || '上傳失敗' }
  }

  return { success: true, file: data.file }
}

export async function deleteFile(
  customerId: string,
  fileId: string
): Promise<{ success: boolean; error?: string }> {
  const response = await fetch(`/api/customers/${customerId}/files/${fileId}`, {
    method: 'DELETE',
    credentials: 'include',
  })

  const data = await response.json()

  if (!response.ok) {
    return { success: false, error: data.error || '刪除失敗' }
  }

  return { success: true }
}

export async function syncJiraAttachments(
  customerId: string
): Promise<{ success: boolean; stats?: { synced: number; skipped: number }; error?: string }> {
  const response = await fetch(`/api/customers/${customerId}/files/sync-jira`, {
    method: 'POST',
    credentials: 'include',
  })

  const data = await response.json()

  if (!response.ok) {
    return { success: false, error: data.error || '同步失敗' }
  }

  return { success: true, stats: data.stats }
}

export function getDownloadUrl(customerId: string, fileId: string): string {
  return `/api/customers/${customerId}/files/${fileId}/download`
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
