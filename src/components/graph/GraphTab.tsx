'use client'

import { useState } from 'react'
import { Segmented, Select, Space, Spin } from 'antd'
import { TableOutlined, PartitionOutlined } from '@ant-design/icons'
import dynamic from 'next/dynamic'
import GraphOverviewCard from './GraphOverviewCard'

const NetworkVisualization = dynamic(() => import('./NetworkVisualization'), {
  ssr: false,
  loading: () => (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <Spin size="large" />
    </div>
  ),
})

interface GraphTabProps {
  customerId: string
}

type ViewMode = 'overview' | 'network'

export default function GraphTab({ customerId }: GraphTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('overview')
  const [depth, setDepth] = useState(2)

  const handleViewChange = (v: string) => {
    setViewMode(v as ViewMode)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Segmented
          value={viewMode}
          onChange={handleViewChange}
          options={[
            { label: '資料總覽', value: 'overview', icon: <TableOutlined /> },
            { label: '關係網路', value: 'network', icon: <PartitionOutlined /> },
          ]}
        />
        {viewMode === 'network' && (
          <Space>
            <span style={{ fontSize: 13, color: '#666' }}>深度：</span>
            <Select
              value={depth}
              onChange={setDepth}
              size="small"
              style={{ width: 80 }}
              options={[
                { label: '1 層', value: 1 },
                { label: '2 層', value: 2 },
                { label: '3 層', value: 3 },
              ]}
            />
          </Space>
        )}
      </div>

      <div style={{ display: viewMode === 'overview' ? 'block' : 'none' }}>
        <GraphOverviewCard customerId={customerId} />
      </div>
      {viewMode === 'network' && (
        <div>
          <NetworkVisualization customerId={customerId} depth={depth} />
        </div>
      )}
    </div>
  )
}
