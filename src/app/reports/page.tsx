'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Spin } from 'antd'
import AppLayout from '@/components/layout/AppLayout'

export default function ReportsPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/reports/issues')
  }, [router])

  return (
    <AppLayout>
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" />
      </div>
    </AppLayout>
  )
}
