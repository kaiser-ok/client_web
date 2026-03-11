'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Typography,
  Button,
  Space,
  Card,
  App,
  Tag,
  Select,
  Input,
  Progress,
  Spin,
  List,
  Badge,
  Drawer,
  Form,
  AutoComplete,
  DatePicker,
  Empty,
  Segmented,
  Radio,
} from 'antd'
import {
  AudioOutlined,
  AudioMutedOutlined,
  FormOutlined,
  CalendarOutlined,
  DollarOutlined,
  ToolOutlined,
  RobotOutlined,
  TeamOutlined,
  LeftOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  CopyOutlined,
  SaveOutlined,
  WarningOutlined,
  ArrowRightOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'

dayjs.extend(relativeTime)
dayjs.locale('zh-tw')

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

// ========== Types ==========

type MobileView = 'home' | 'record' | 'visit' | 'recent' | 'sales' | 'repair' | 'quote'

interface Customer {
  id: string
  name: string
}

interface OpenItem {
  id: string
  summary: string
  status: string
  priority: string
  waitingOn: string
  dueDate: string | null
  jiraKey: string | null
  customer?: { id: string; name: string }
}

interface SalesData {
  totalAmount: number
  dealCount: number
  deals: {
    id: string
    title: string
    amount: number
    status: string
    customer?: { name: string }
  }[]
}

// ========== Helpers ==========

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'blue',
  IN_PROGRESS: 'processing',
  RESOLVED: 'green',
  CLOSED: 'default',
  WAITING: 'orange',
}

const PRIORITY_COLORS: Record<string, string> = {
  Highest: 'red',
  High: 'orange',
  Medium: 'blue',
  Low: 'green',
  Lowest: 'default',
}

// ========== Main Component ==========

export default function MobilePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { message } = App.useApp()

  const [view, setView] = useState<MobileView>('home')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  if (status === 'loading' || !session) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  const menuItems: { key: MobileView; icon: React.ReactNode; label: string; color: string; badge?: number }[] = [
    { key: 'record', icon: <AudioOutlined style={{ fontSize: 28 }} />, label: '會議錄音', color: '#1890ff' },
    { key: 'visit', icon: <FormOutlined style={{ fontSize: 28 }} />, label: '登記拜訪', color: '#52c41a' },
    { key: 'recent', icon: <CalendarOutlined style={{ fontSize: 28 }} />, label: '近期事項', color: '#faad14' },
    { key: 'sales', icon: <DollarOutlined style={{ fontSize: 28 }} />, label: '查看業績', color: '#722ed1' },
    { key: 'repair', icon: <ToolOutlined style={{ fontSize: 28 }} />, label: '進行報修', color: '#f5222d' },
    { key: 'quote', icon: <RobotOutlined style={{ fontSize: 28 }} />, label: 'AI 報價', color: '#13c2c2' },
  ]

  if (view !== 'home') {
    return (
      <App>
        <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
          {/* Sub-page header */}
          <div style={{
            background: '#fff',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderBottom: '1px solid #f0f0f0',
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}>
            <Button
              type="text"
              icon={<LeftOutlined />}
              onClick={() => setView('home')}
              style={{ padding: '4px 8px' }}
            />
            <Text strong style={{ fontSize: 16 }}>
              {menuItems.find(m => m.key === view)?.label}
            </Text>
          </div>

          <div style={{ padding: 12 }}>
            {view === 'record' && <MobileRecordView />}
            {view === 'visit' && <MobileVisitView />}
            {view === 'recent' && <MobileRecentView />}
            {view === 'sales' && <MobileSalesView />}
            {view === 'repair' && <MobileRepairView />}
            {view === 'quote' && <MobileQuoteView />}
          </div>
        </div>
      </App>
    )
  }

  // Home view
  return (
    <App>
      <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
        <div style={{
          background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
          padding: '24px 16px 32px',
          color: '#fff',
        }}>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>
            {dayjs().format('YYYY/MM/DD (dd)')}
          </Text>
          <Title level={4} style={{ color: '#fff', margin: '4px 0 0' }}>
            {session.user?.name || session.user?.email}
          </Title>
        </div>

        <div style={{
          padding: '0 12px',
          marginTop: -16,
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
          }}>
            {menuItems.map(item => (
              <Card
                key={item.key}
                hoverable
                onClick={() => setView(item.key)}
                style={{ borderRadius: 12, textAlign: 'center' }}
                styles={{ body: { padding: '20px 8px' } }}
              >
                <div style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: `${item.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 8px',
                  color: item.color,
                }}>
                  {item.icon}
                </div>
                <Text strong style={{ fontSize: 13 }}>{item.label}</Text>
              </Card>
            ))}
          </div>

          {/* Quick link to desktop */}
          <div style={{ textAlign: 'center', marginTop: 24, paddingBottom: 24 }}>
            <Button type="link" onClick={() => router.push('/')}>
              前往桌面版 <ArrowRightOutlined />
            </Button>
          </div>
        </div>
      </div>
    </App>
  )
}

// ========== 1. 會議錄音 ==========

function MobileRecordView() {
  const { message } = App.useApp()
  const [recording, setRecording] = useState(false)
  const [paused, setPaused] = useState(false)
  const [duration, setDuration] = useState(0)
  const [audioLevel, setAudioLevel] = useState(0)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  const [transcribing, setTranscribing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [summaryText, setSummaryText] = useState('')
  const [summaryTitle, setSummaryTitle] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animRef = useRef<number | null>(null)

  useEffect(() => {
    fetch('/api/customers?pageSize=1000', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setCustomers(d.customers?.map((c: Customer) => ({ id: c.id, name: c.name })) || []))
      .catch(() => {})
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (animRef.current) cancelAnimationFrame(animRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const ctx = new AudioContext()
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      src.connect(analyser)
      analyserRef.current = analyser

      const updateLevel = () => {
        if (!analyserRef.current) return
        const data = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)))
        animRef.current = requestAnimationFrame(updateLevel)
      }
      updateLevel()

      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType: mime })
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime })
        setRecordedBlob(blob)
        setRecordedUrl(URL.createObjectURL(blob))
        streamRef.current?.getTracks().forEach(t => t.stop())
        if (animRef.current) cancelAnimationFrame(animRef.current)
        setAudioLevel(0)
      }
      recorder.start(1000)
      recorderRef.current = recorder

      setDuration(0)
      timerRef.current = setInterval(() => setDuration(p => p + 1), 1000)
      setRecording(true)
      setPaused(false)
      setRecordedBlob(null)
      setTranscript('')
      setSummaryText('')
      setSaved(false)
    } catch {
      message.error('無法存取麥克風')
    }
  }

  const togglePause = () => {
    if (!recorderRef.current) return
    if (paused) {
      recorderRef.current.resume()
      timerRef.current = setInterval(() => setDuration(p => p + 1), 1000)
      setPaused(false)
    } else {
      recorderRef.current.pause()
      if (timerRef.current) clearInterval(timerRef.current)
      setPaused(true)
    }
  }

  const stopRecording = () => {
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop()
    if (timerRef.current) clearInterval(timerRef.current)
    setRecording(false)
    setPaused(false)
  }

  const handleTranscribe = async () => {
    if (!recordedBlob) return
    setTranscribing(true)
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const file = new File([recordedBlob], `mic-${ts}.webm`, { type: recordedBlob.type })
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/transcriptions', { method: 'POST', body: form, credentials: 'include' })
      const data = await res.json()
      if (data.success) {
        setTranscript(data.transcript)
        message.success('轉錄完成')
      } else {
        message.error(data.error || '轉錄失敗')
      }
    } catch { message.error('轉錄失敗') }
    finally { setTranscribing(false) }
  }

  const handleSummarize = async () => {
    if (!transcript) return
    setSummarizing(true)
    try {
      const res = await fetch('/api/transcriptions/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'summarize', transcript, format: 'brief', partnerId: selectedPartnerId }),
      })
      const data = await res.json()
      if (data.success) {
        setSummaryTitle(data.title || '')
        setSummaryText(data.summary || '')
        message.success('摘要完成')
      } else { message.error('摘要失敗') }
    } catch { message.error('摘要失敗') }
    finally { setSummarizing(false) }
  }

  const handleSave = async () => {
    if (!selectedPartnerId) { message.error('請選擇客戶'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/transcriptions/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'save', partnerId: selectedPartnerId,
          title: summaryTitle || '會議記錄', summary: summaryText,
          keyPoints: [], actionItems: [], transcript,
        }),
      })
      const data = await res.json()
      if (data.success) { setSaved(true); message.success('已儲存') }
      else { message.error('儲存失敗') }
    } catch { message.error('儲存失敗') }
    finally { setSaving(false) }
  }

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="middle">
      {/* 客戶選擇 */}
      <Select
        showSearch
        allowClear
        placeholder="選擇客戶（選填）"
        style={{ width: '100%' }}
        value={selectedPartnerId}
        onChange={setSelectedPartnerId}
        filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
        options={customers.map(c => ({ value: c.id, label: c.name }))}
      />

      {/* 錄音控制 */}
      <Card style={{ textAlign: 'center' }}>
        {!recording && !recordedBlob && (
          <>
            <Button
              type="primary"
              shape="circle"
              icon={<AudioOutlined style={{ fontSize: 36 }} />}
              onClick={startRecording}
              style={{ width: 80, height: 80, marginBottom: 12 }}
            />
            <div><Text type="secondary">點擊開始錄音</Text></div>
          </>
        )}

        {recording && (
          <>
            <Tag color="red" style={{ fontSize: 18, padding: '6px 16px', marginBottom: 12 }}>
              {paused ? <AudioMutedOutlined /> : <AudioOutlined />}
              {' '}{paused ? '已暫停' : '錄音中'} {formatDuration(duration)}
            </Tag>
            <Progress
              percent={audioLevel}
              showInfo={false}
              strokeColor={audioLevel > 70 ? '#ff4d4f' : audioLevel > 40 ? '#faad14' : '#52c41a'}
              style={{ marginBottom: 16 }}
            />
            <Space size="large">
              <Button
                size="large"
                icon={paused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
                onClick={togglePause}
              >
                {paused ? '繼續' : '暫停'}
              </Button>
              <Button size="large" type="primary" danger onClick={stopRecording}>
                停止
              </Button>
            </Space>
          </>
        )}

        {!recording && recordedBlob && (
          <>
            <Tag color="green" style={{ fontSize: 14, padding: '4px 12px', marginBottom: 12 }}>
              錄音完成 — {formatDuration(duration)} ({(recordedBlob.size / 1024 / 1024).toFixed(1)} MB)
            </Tag>
            {recordedUrl && <audio controls src={recordedUrl} style={{ width: '100%', marginBottom: 12 }} />}
            <Space orientation="vertical" style={{ width: '100%' }}>
              <Button
                type="primary"
                block
                size="large"
                icon={<FileTextOutlined />}
                loading={transcribing}
                onClick={handleTranscribe}
              >
                轉錄文字
              </Button>
              <Button block onClick={startRecording}>重新錄音</Button>
            </Space>
          </>
        )}
      </Card>

      {/* 轉錄結果 */}
      {transcript && (
        <Card
          size="small"
          title="逐字稿"
          extra={<Button size="small" icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(transcript); message.success('已複製') }}>複製</Button>}
        >
          <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 13, maxHeight: 200, overflow: 'auto' }}>
            {transcript}
          </Paragraph>
          <Button
            type="primary"
            block
            icon={<RobotOutlined />}
            loading={summarizing}
            onClick={handleSummarize}
            style={{ marginTop: 8 }}
          >
            AI 快速摘要
          </Button>
        </Card>
      )}

      {/* 摘要 & 存檔 */}
      {summaryText && (
        <Card size="small" title="AI 摘要">
          <TextArea value={summaryText} onChange={e => setSummaryText(e.target.value)} rows={3} style={{ marginBottom: 12 }} />
          {!saved ? (
            <Button type="primary" block icon={<SaveOutlined />} loading={saving} onClick={handleSave} disabled={!selectedPartnerId}>
              儲存到客戶活動
            </Button>
          ) : (
            <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontSize: 14 }}>已儲存</Tag>
          )}
        </Card>
      )}
    </Space>
  )
}

// ========== 2. 登記拜訪 ==========

const VISIT_TITLE_PRESETS = [
  '例行拜訪',
  '需求訪談',
  '產品展示/Demo',
  '報價說明',
  '合約續約洽談',
  '售後服務/技術支援',
  '問題追蹤回報',
  '新客戶開發',
  '專案進度確認',
  '教育訓練',
]

function MobileVisitView() {
  const { message } = App.useApp()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [content, setContent] = useState('')
  const [eventDate, setEventDate] = useState<dayjs.Dayjs | null>(null)
  const [timeSlot, setTimeSlot] = useState<string>('AM')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/customers?pageSize=1000', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setCustomers(d.customers?.map((c: Customer) => ({ id: c.id, name: c.name })) || []))
      .catch(() => {})
  }, [])

  const handleSave = async () => {
    if (!partnerId) { message.error('請選擇客戶'); return }
    if (!title.trim()) { message.error('請輸入拜訪主題'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          partnerId,
          source: 'MANUAL',
          title: title.trim(),
          content: [
            timeSlot && eventDate ? `【${timeSlot === 'AM' ? '上午' : timeSlot === 'PM' ? '下午' : '全天'}】` : '',
            location.trim() ? `地點：${location.trim()}` : '',
            content.trim(),
          ].filter(Boolean).join('\n') || null,
          tags: ['拜訪'],
          eventDate: eventDate?.toISOString() || null,
        }),
      })
      if (res.ok) {
        setSaved(true)
        message.success('拜訪記錄已儲存')
      } else {
        message.error('儲存失敗')
      }
    } catch { message.error('儲存失敗') }
    finally { setSaving(false) }
  }

  if (saved) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 60 }}>
        <CheckCircleOutlined style={{ fontSize: 64, color: '#52c41a', marginBottom: 16 }} />
        <Title level={4}>拜訪記錄已儲存</Title>
        <Button type="primary" onClick={() => { setSaved(false); setTitle(''); setLocation(''); setContent(''); setEventDate(null); setTimeSlot('AM') }}>
          新增另一筆
        </Button>
      </div>
    )
  }

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="middle">
      <Select
        showSearch
        placeholder="選擇客戶 *"
        style={{ width: '100%' }}
        value={partnerId}
        onChange={setPartnerId}
        filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
        options={customers.map(c => ({ value: c.id, label: c.name }))}
      />
      <AutoComplete
        placeholder="拜訪主題 *（可選擇或自行輸入）"
        style={{ width: '100%' }}
        value={title}
        onChange={setTitle}
        options={VISIT_TITLE_PRESETS
          .filter(t => !title || t.toLowerCase().includes(title.toLowerCase()))
          .map(t => ({ value: t }))}
      />
      <Input
        placeholder="拜訪地點（選填）"
        value={location}
        onChange={e => setLocation(e.target.value)}
        prefix={<EnvironmentOutlined />}
      />
      <TextArea
        placeholder="拜訪內容（選填）"
        rows={4}
        value={content}
        onChange={e => setContent(e.target.value)}
      />
      <DatePicker
        placeholder="拜訪日期（選填）"
        style={{ width: '100%' }}
        value={eventDate}
        onChange={setEventDate}
      />
      <Segmented
        block
        value={timeSlot}
        onChange={(val) => setTimeSlot(val as string)}
        options={[
          { label: '上午', value: 'AM' },
          { label: '下午', value: 'PM' },
          { label: '全天', value: 'ALL_DAY' },
        ]}
      />
      <Button
        type="primary"
        block
        size="large"
        icon={<SaveOutlined />}
        loading={saving}
        onClick={handleSave}
        disabled={!partnerId || !title.trim()}
      >
        儲存拜訪記錄
      </Button>
    </Space>
  )
}

// ========== 3. 近期事項 ==========

function MobileRecentView() {
  const [items, setItems] = useState<OpenItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'overdue' | 'waiting'>('all')

  useEffect(() => {
    fetch('/api/open-items?status=OPEN,IN_PROGRESS,WAITING', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setItems(d.items || d || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = items.filter(item => {
    if (filter === 'overdue') return item.dueDate && dayjs(item.dueDate).isBefore(dayjs(), 'day')
    if (filter === 'waiting') return item.waitingOn === 'Customer'
    return true
  })

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="small">
      <Segmented
        block
        value={filter}
        onChange={v => setFilter(v as typeof filter)}
        options={[
          { value: 'all', label: `全部 (${items.length})` },
          { value: 'overdue', label: `逾期` },
          { value: 'waiting', label: `等客戶` },
        ]}
      />

      {filtered.length === 0 ? (
        <Empty description="沒有符合的項目" style={{ marginTop: 40 }} />
      ) : (
        filtered.map(item => (
          <Card key={item.id} size="small" style={{ borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              {item.jiraKey && <Tag color="blue" style={{ fontSize: 11 }}>{item.jiraKey}</Tag>}
              <Tag color={STATUS_COLORS[item.status] || 'default'} style={{ fontSize: 11 }}>{item.status}</Tag>
            </div>
            <Text strong style={{ fontSize: 14 }}>{item.summary}</Text>
            <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {item.customer && <Text type="secondary" style={{ fontSize: 12 }}>{item.customer.name}</Text>}
              {item.priority && <Tag color={PRIORITY_COLORS[item.priority] || 'default'} style={{ fontSize: 11 }}>{item.priority}</Tag>}
              {item.dueDate && (
                <Tag
                  color={dayjs(item.dueDate).isBefore(dayjs(), 'day') ? 'red' : 'default'}
                  icon={dayjs(item.dueDate).isBefore(dayjs(), 'day') ? <WarningOutlined /> : <ClockCircleOutlined />}
                  style={{ fontSize: 11 }}
                >
                  {dayjs(item.dueDate).format('MM/DD')}
                </Tag>
              )}
            </div>
          </Card>
        ))
      )}
    </Space>
  )
}

// ========== 4. 查看業績 ==========

function MobileSalesView() {
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('month')
  const [data, setData] = useState<SalesData>({ totalAmount: 0, dealCount: 0, deals: [] })

  useEffect(() => {
    setLoading(true)
    fetch(`/api/reports/sales?period=${period}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setData({
        totalAmount: d.totalAmount || 0,
        dealCount: d.dealCount || d.deals?.length || 0,
        deals: d.deals || [],
      }))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [period])

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="middle">
      <Segmented
        block
        value={period}
        onChange={v => setPeriod(v as typeof period)}
        options={[
          { value: 'month', label: '本月' },
          { value: 'quarter', label: '本季' },
          { value: 'year', label: '今年' },
        ]}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>總金額</Text>
              <Title level={4} style={{ margin: '4px 0 0', color: '#722ed1' }}>
                {(data.totalAmount / 10000).toFixed(0)}萬
              </Title>
            </Card>
            <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>成交數</Text>
              <Title level={4} style={{ margin: '4px 0 0', color: '#1890ff' }}>
                {data.dealCount}
              </Title>
            </Card>
          </div>

          {data.deals.length > 0 && (
            <Card size="small" title="成交明細" style={{ borderRadius: 8 }}>
              <List
                size="small"
                dataSource={data.deals.slice(0, 10)}
                renderItem={deal => (
                  <List.Item extra={<Text strong>${deal.amount?.toLocaleString()}</Text>}>
                    <List.Item.Meta
                      title={<Text style={{ fontSize: 13 }}>{deal.title}</Text>}
                      description={deal.customer?.name}
                    />
                  </List.Item>
                )}
              />
            </Card>
          )}
        </>
      )}
    </Space>
  )
}

// ========== 5. 進行報修 ==========

function MobileRepairView() {
  const { message } = App.useApp()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('Medium')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/customers?pageSize=1000', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setCustomers(d.customers?.map((c: Customer) => ({ id: c.id, name: c.name })) || []))
      .catch(() => {})
  }, [])

  const handleSubmit = async () => {
    if (!partnerId) { message.error('請選擇客戶'); return }
    if (!summary.trim()) { message.error('請輸入問題描述'); return }
    setSaving(true)
    try {
      // 建立為 open-item + activity
      const res = await fetch('/api/open-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          customerId: partnerId,
          summary: summary.trim(),
          description: description.trim() || null,
          priority,
          status: 'OPEN',
          source: 'MANUAL',
          tags: ['報修'],
        }),
      })
      if (res.ok) {
        setSaved(true)
        message.success('報修單已建立')
      } else {
        const data = await res.json()
        message.error(data.error || '建立失敗')
      }
    } catch { message.error('建立失敗') }
    finally { setSaving(false) }
  }

  if (saved) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 60 }}>
        <CheckCircleOutlined style={{ fontSize: 64, color: '#52c41a', marginBottom: 16 }} />
        <Title level={4}>報修單已建立</Title>
        <Button type="primary" onClick={() => { setSaved(false); setSummary(''); setDescription('') }}>
          新增另一筆
        </Button>
      </div>
    )
  }

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="middle">
      <Select
        showSearch
        placeholder="選擇客戶 *"
        style={{ width: '100%' }}
        value={partnerId}
        onChange={setPartnerId}
        filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
        options={customers.map(c => ({ value: c.id, label: c.name }))}
      />
      <Input
        placeholder="問題摘要 *"
        value={summary}
        onChange={e => setSummary(e.target.value)}
      />
      <TextArea
        placeholder="詳細描述（選填）"
        rows={4}
        value={description}
        onChange={e => setDescription(e.target.value)}
      />
      <div>
        <Text type="secondary" style={{ fontSize: 13, marginBottom: 4, display: 'block' }}>優先程度</Text>
        <Radio.Group value={priority} onChange={e => setPriority(e.target.value)} style={{ width: '100%' }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Radio.Button value="Low">低</Radio.Button>
            <Radio.Button value="Medium">中</Radio.Button>
            <Radio.Button value="High">高</Radio.Button>
            <Radio.Button value="Highest">緊急</Radio.Button>
          </Space>
        </Radio.Group>
      </div>
      <Button
        type="primary"
        block
        size="large"
        icon={<ToolOutlined />}
        loading={saving}
        onClick={handleSubmit}
        disabled={!partnerId || !summary.trim()}
      >
        提交報修
      </Button>
    </Space>
  )
}

// ========== 6. AI 報價 ==========

function MobileQuoteView() {
  const router = useRouter()

  return (
    <div style={{ textAlign: 'center', paddingTop: 40 }}>
      <RobotOutlined style={{ fontSize: 64, color: '#13c2c2', marginBottom: 16 }} />
      <Title level={4}>AI 報價</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
        使用 AI 助理快速產生報價單
      </Text>
      <Space orientation="vertical" style={{ width: '100%' }}>
        <Button type="primary" block size="large" onClick={() => router.push('/quotations/new')}>
          新增報價單
        </Button>
        <Button block size="large" onClick={() => router.push('/quotations')}>
          查看報價單列表
        </Button>
        <Button block size="large" icon={<RobotOutlined />} onClick={() => router.push('/chat')}>
          AI 助理對話報價
        </Button>
      </Space>
    </div>
  )
}
