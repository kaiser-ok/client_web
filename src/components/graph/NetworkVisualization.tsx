'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { Spin, Alert, Empty, Typography } from 'antd'
import type { Graph, NodeData, EdgeData } from '@antv/g6'
import { NetworkGraph } from '@ant-design/graphs'
import { useGraphView } from '@/hooks/useGraphView'
import { NODE_STYLE_MAP, getPrimaryLabel, formatRelType } from './graph-constants'
import NodeDetailDrawer from './NodeDetailDrawer'

const { Text } = Typography

interface NetworkVisualizationProps {
  customerId: string
  depth: number
}

function transformToG6Data(
  nodes: Record<string, unknown>[],
  relationships: Record<string, unknown>[]
): { nodes: NodeData[]; edges: EdgeData[] } {
  const g6Nodes: NodeData[] = nodes.map((node) => ({
    id: String(node._id),
    data: { ...node },
  }))

  const nodeIdSet = new Set(g6Nodes.map((n) => n.id))

  const g6Edges: EdgeData[] = relationships
    .map((rel) => ({
      source: String(rel._start),
      target: String(rel._end),
      data: { ...rel },
    }))
    .filter((edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target))

  return { nodes: g6Nodes, edges: g6Edges }
}

const NODE_SIZE_MAP: Record<string, number> = {
  Organization: 40,
  Person: 32,
  Deal: 32,
  Project: 32,
  Issue: 28,
  Product: 28,
}

export default function NetworkVisualization({ customerId, depth }: NetworkVisualizationProps) {
  const { graphData, isLoading, isError, isEmpty } = useGraphView(customerId, 'network', depth)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedNode, setSelectedNode] = useState<Record<string, unknown> | null>(null)
  const graphRef = useRef<Graph | null>(null)
  const unmountedRef = useRef(false)

  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
      if (graphRef.current) {
        try {
          graphRef.current.destroy()
        } catch {
          // graph already destroyed
        }
        graphRef.current = null
      }
    }
  }, [])

  const g6Data = useMemo(() => {
    if (!graphData || !graphData.synced) return null
    const rawNodes = (graphData as unknown as { nodes?: Record<string, unknown>[] }).nodes
    const rawRels = (graphData as unknown as { relationships?: Record<string, unknown>[] }).relationships
    if (!rawNodes || rawNodes.length === 0) return null
    return transformToG6Data(rawNodes, rawRels || [])
  }, [graphData])

  const nodeDataMap = useMemo(() => {
    if (!g6Data) return new Map<string, Record<string, unknown>>()
    const map = new Map<string, Record<string, unknown>>()
    for (const n of g6Data.nodes) {
      map.set(String(n.id), n.data || {})
    }
    return map
  }, [g6Data])

  const handleReady = useCallback(
    (graph: Graph) => {
      if (unmountedRef.current) return
      graphRef.current = graph
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      graph.on('node:click', (evt: any) => {
        if (unmountedRef.current) return
        const nodeId = String(evt.target?.id)
        const data = nodeDataMap.get(nodeId)
        if (data) {
          setSelectedNode(data)
          setDrawerOpen(true)
        }
      })
    },
    [nodeDataMap]
  )

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">載入關係網路中...</Text>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <Alert
        type="error"
        title="載入失敗"
        description="無法連接知識圖譜服務，請確認 Graphiti 服務是否正常運行。"
        showIcon
      />
    )
  }

  if (isEmpty || !graphData?.synced) {
    return (
      <Alert
        type="info"
        title="尚未同步至知識圖譜"
        description="此客戶的資料尚未同步到 Neo4j 知識圖譜。系統會在客戶資料變更時自動同步，或您可以透過管理介面手動觸發同步。"
        showIcon
      />
    )
  }

  if (!g6Data || g6Data.nodes.length === 0) {
    return <Empty description="無圖譜節點資料" />
  }

  const legendItems = Object.entries(NODE_STYLE_MAP)

  return (
    <div style={{ position: 'relative' }}>
      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 10,
          background: 'rgba(255,255,255,0.92)',
          borderRadius: 6,
          padding: '8px 12px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        {legendItems.map(([label, style]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: style.fill,
                border: `2px solid ${style.stroke}`,
              }}
            />
            <Text style={{ fontSize: 12 }}>{label}</Text>
          </div>
        ))}
      </div>

      <div style={{ height: 600 }}>
        <NetworkGraph
          data={g6Data}
          autoFit="view"
          node={{
            style: (nodeData: NodeData) => {
              const d = nodeData.data || {}
              const labels = (d._labels as string[]) || []
              const label = getPrimaryLabel(labels)
              const colorStyle = NODE_STYLE_MAP[label] || { fill: '#f0f0f0', stroke: '#999' }
              const isCenterNode = String(d.crm_id) === customerId
              const size = isCenterNode ? 48 : (NODE_SIZE_MAP[label] || 32)

              return {
                size,
                fill: colorStyle.fill,
                stroke: colorStyle.stroke,
                lineWidth: isCenterNode ? 3 : 1.5,
                labelText: String(d.name || d.summary || d.jira_key || ''),
                labelPlacement: 'bottom' as const,
                labelFontSize: 11,
                labelFill: '#333',
              }
            },
          }}
          edge={{
            style: (edgeData: EdgeData) => {
              const d = edgeData.data || {}
              const relType = String(d._type || '')
              return {
                stroke: '#c0c0c0',
                endArrow: true,
                labelText: formatRelType(relType),
                labelFontSize: 10,
                labelFill: '#888',
              }
            },
          }}
          layout={{
            type: 'd3-force',
            link: { distance: 150 },
            collide: { radius: 40 },
            manyBody: { strength: -300 },
          }}
          behaviors={['drag-canvas', 'zoom-canvas', 'drag-element', 'hover-activate']}
          plugins={[
            {
              type: 'tooltip',
              key: 'node-tooltip',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              getContent: (_: any, items: NodeData[]) => {
                if (!items || items.length === 0) return ''
                const item = items[0]
                const d = item.data || {}
                const labels = (d._labels as string[]) || []
                const label = getPrimaryLabel(labels)
                const name = String(d.name || d.summary || d.jira_key || '')
                return `<div style="padding:4px 8px"><b>${name}</b><br/><span style="color:#888">${label}</span></div>`
              },
            },
          ]}
          onReady={handleReady}
        />
      </div>

      <NodeDetailDrawer
        open={drawerOpen}
        node={selectedNode}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  )
}
