'use client'

import { SessionProvider } from 'next-auth/react'
import { ConfigProvider, App } from 'antd'
import zhTW from 'antd/locale/zh_TW'

const theme = {
  token: {
    colorPrimary: '#1890ff',
    borderRadius: 6,
  },
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ConfigProvider locale={zhTW} theme={theme}>
        <App>{children}</App>
      </ConfigProvider>
    </SessionProvider>
  )
}
