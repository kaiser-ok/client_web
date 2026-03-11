'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Redirect to the unified LINE settings page
export default function LineUsersPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/settings/line')
  }, [router])

  return null
}
