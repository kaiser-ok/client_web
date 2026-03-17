'use client'

import { useEffect } from 'react'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(res => res.json())

const HEARTBEAT_INTERVAL = 60 * 1000 // 1 minute

export function useOnlineUsers() {
  // Send heartbeat periodically
  useEffect(() => {
    const sendHeartbeat = () => {
      fetch('/api/online-users', { method: 'POST' }).catch(() => {})
    }

    // Send immediately on mount
    sendHeartbeat()

    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  // Poll online user count
  const { data } = useSWR<{ count: number; users: { name: string; email: string }[] }>(
    '/api/online-users',
    fetcher,
    { refreshInterval: 30 * 1000 } // refresh every 30s
  )

  return {
    count: data?.count ?? 0,
    users: data?.users ?? [],
  }
}
