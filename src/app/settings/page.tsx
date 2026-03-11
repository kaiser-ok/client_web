'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to the first settings sub-page
    router.replace('/settings/odoo')
  }, [router])

  return null
}
