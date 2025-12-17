import type { Metadata } from 'next'
import { AntdRegistry } from '@ant-design/nextjs-registry'
import { Providers } from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: '客戶管理系統',
  description: '客戶活動追蹤與 Jira 整合平台',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-TW">
      <body>
        <AntdRegistry>
          <Providers>{children}</Providers>
        </AntdRegistry>
      </body>
    </html>
  )
}
