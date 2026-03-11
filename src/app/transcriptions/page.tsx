'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Card,
  Typography,
  Button,
  Space,
  Upload,
  Input,
  App,
  Spin,
  Slider,
  Switch,
  Collapse,
  Segmented,
  Tag,
  Progress,
  Select,
  List,
  Divider,
  Alert,
  Radio,
} from 'antd'
import {
  AudioOutlined,
  UploadOutlined,
  SoundOutlined,
  CopyOutlined,
  SettingOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  DeleteOutlined,
  AudioMutedOutlined,
  FileTextOutlined,
  SaveOutlined,
  CheckCircleOutlined,
  RobotOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import type { UploadFile } from 'antd'
import AppLayout from '@/components/layout/AppLayout'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

interface ASRSettings {
  maxNewTokens: number
  temperature: number
  topP: number
  doSample: boolean
  repetitionPenalty: number
}

const DEFAULT_SETTINGS: ASRSettings = {
  maxNewTokens: 32768,
  temperature: 0.0,
  topP: 1.0,
  doSample: false,
  repetitionPenalty: 1.0,
}

type InputMode = 'upload' | 'mic'

type SummaryFormat = 'brief' | 'meeting' | 'detailed'

const SUMMARY_FORMATS: { value: SummaryFormat; label: string; description: string }[] = [
  { value: 'brief', label: '簡要摘要', description: '100 字內精簡重點' },
  { value: 'meeting', label: '會議摘要', description: '含結論、決議、追蹤項目' },
  { value: 'detailed', label: '詳細記錄', description: '完整重點整理、待辦、參與者' },
]

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function TranscriptionPage() {
  const { message } = App.useApp()

  const [inputMode, setInputMode] = useState<InputMode>('upload')
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [contextInfo, setContextInfo] = useState('')
  const [transcribing, setTranscribing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [filename, setFilename] = useState('')
  const [settings, setSettings] = useState<ASRSettings>({ ...DEFAULT_SETTINGS })
  const abortRef = useRef<AbortController | null>(null)

  // LLM summary state
  const [summaryFormat, setSummaryFormat] = useState<SummaryFormat>('meeting')
  const [summarizing, setSummarizing] = useState(false)
  const [summaryTitle, setSummaryTitle] = useState('')
  const [summaryText, setSummaryText] = useState('')
  const [keyPoints, setKeyPoints] = useState<string[]>([])
  const [actionItems, setActionItems] = useState<string[]>([])
  const [participants, setParticipants] = useState<string[]>([])

  // Customer selection & save state
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([])
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedActivityId, setSavedActivityId] = useState<string | null>(null)
  const [savedTranscriptPath, setSavedTranscriptPath] = useState<string | null>(null)

  // Mic recording state
  const [recording, setRecording] = useState(false)
  const [paused, setPaused] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  const [audioLevel, setAudioLevel] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Load customers on mount
  useEffect(() => {
    fetchCustomers()
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (recordedUrl) URL.revokeObjectURL(recordedUrl)
      stopMicStream()
    }
  }, [])

  const stopMicStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      const updateLevel = () => {
        if (!analyserRef.current) return
        const data = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)))
        animFrameRef.current = requestAnimationFrame(updateLevel)
      }
      updateLevel()

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        setRecordedBlob(blob)
        if (recordedUrl) URL.revokeObjectURL(recordedUrl)
        setRecordedUrl(URL.createObjectURL(blob))
        stopMicStream()
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
        setAudioLevel(0)
      }

      recorder.start(1000)
      mediaRecorderRef.current = recorder

      setRecordingDuration(0)
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)

      setRecording(true)
      setPaused(false)
      setRecordedBlob(null)
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl)
        setRecordedUrl(null)
      }
    } catch {
      message.error('無法存取麥克風，請確認瀏覽器已授權')
    }
  }

  const pauseRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause()
      if (timerRef.current) clearInterval(timerRef.current)
      setPaused(true)
    }
  }

  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume()
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)
      setPaused(false)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setRecording(false)
    setPaused(false)
  }

  const discardRecording = () => {
    setRecordedBlob(null)
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl)
      setRecordedUrl(null)
    }
    setRecordingDuration(0)
  }

  const handleTranscribe = async () => {
    let fileToSend: File | null = null
    let sendFilename = ''

    if (inputMode === 'upload') {
      if (fileList.length === 0 || !fileList[0].originFileObj) {
        message.error('請先上傳音檔')
        return
      }
      fileToSend = fileList[0].originFileObj
      sendFilename = fileToSend.name
    } else {
      if (!recordedBlob) {
        message.error('請先錄音')
        return
      }
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      sendFilename = `mic-recording-${ts}.webm`
      fileToSend = new File([recordedBlob], sendFilename, { type: recordedBlob.type })
    }

    setTranscribing(true)
    setTranscript('')
    abortRef.current = new AbortController()

    try {
      const formData = new FormData()
      formData.append('file', fileToSend)
      formData.append('contextInfo', contextInfo)
      formData.append('settings', JSON.stringify(settings))

      const res = await fetch('/api/transcriptions', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        signal: abortRef.current.signal,
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setTranscript(data.transcript)
        setFilename(data.filename)
        message.success('轉錄完成')
      } else {
        message.error(data.error || '轉錄失敗')
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        message.info('已取消轉錄')
      } else {
        message.error('轉錄失敗')
      }
    } finally {
      setTranscribing(false)
      abortRef.current = null
    }
  }

  const handleCancel = () => {
    abortRef.current?.abort()
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(transcript)
    message.success('已複製到剪貼簿')
  }

  // 載入客戶清單
  const fetchCustomers = async () => {
    if (customers.length > 0) return
    setLoadingCustomers(true)
    try {
      const res = await fetch('/api/customers?pageSize=1000', { credentials: 'include' })
      const data = await res.json()
      if (res.ok) {
        setCustomers(data.customers.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })))
      }
    } catch {
      message.error('載入客戶清單失敗')
    } finally {
      setLoadingCustomers(false)
    }
  }

  // LLM 摘要
  const handleSummarize = async () => {
    if (!transcript) return
    setSummarizing(true)
    setSavedActivityId(null)
    setSavedTranscriptPath(null)
    try {
      const res = await fetch('/api/transcriptions/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'summarize',
          transcript,
          format: summaryFormat,
          partnerId: selectedPartnerId,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setSummaryTitle(data.title || '')
        setSummaryText(data.summary || '')
        setKeyPoints(data.keyPoints || [])
        setActionItems(data.actionItems || [])
        setParticipants(data.participants || [])
        message.success('摘要產生完成')
      } else {
        message.error(data.error || '摘要產生失敗')
      }
    } catch {
      message.error('摘要產生失敗')
    } finally {
      setSummarizing(false)
    }
  }

  // 存檔為活動
  const handleSave = async () => {
    if (!selectedPartnerId) {
      message.error('請選擇客戶')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/transcriptions/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'save',
          partnerId: selectedPartnerId,
          title: summaryTitle || '會議記錄',
          summary: summaryText,
          keyPoints,
          actionItems,
          transcript,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setSavedActivityId(data.activityId)
        setSavedTranscriptPath(data.transcriptFilePath || null)
        message.success('已儲存為客戶活動記錄')
      } else {
        message.error(data.error || '儲存失敗')
      }
    } catch {
      message.error('儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  const hasAudio = inputMode === 'upload' ? fileList.length > 0 : !!recordedBlob

  return (
    <AppLayout>
      <Title level={4} style={{ marginBottom: 24 }}>
        <AudioOutlined style={{ marginRight: 8 }} />
        會議記錄轉錄
      </Title>

      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        {/* 客戶選擇（前置） */}
        <Card
          title={<><TeamOutlined style={{ marginRight: 8 }} />關聯客戶</>}
          size="small"
        >
          <Space orientation="vertical" style={{ width: '100%' }} size="small">
            <Select
              showSearch
              allowClear
              placeholder="選擇客戶（選填，可於存檔時再選）"
              style={{ width: '100%', maxWidth: 400 }}
              value={selectedPartnerId}
              onChange={setSelectedPartnerId}
              loading={loadingCustomers}
              filterOption={(input, option) =>
                (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={customers.map(c => ({ value: c.id, label: c.name }))}
            />
            <Text type="secondary">
              選擇客戶後，AI 摘要可參考該客戶的上下文資訊，提升辨識準確度
            </Text>
          </Space>
        </Card>

        {/* 輸入來源 */}
        <Card
          title={<><SoundOutlined style={{ marginRight: 8 }} />音訊來源</>}
          extra={
            <Segmented
              value={inputMode}
              onChange={(v) => setInputMode(v as InputMode)}
              options={[
                { value: 'upload', label: '上傳檔案', icon: <UploadOutlined /> },
                { value: 'mic', label: '麥克風錄音', icon: <AudioOutlined /> },
              ]}
            />
          }
        >
          <Space orientation="vertical" style={{ width: '100%' }} size="middle">
            {inputMode === 'upload' ? (
              <Upload.Dragger
                fileList={fileList}
                beforeUpload={(file) => {
                  setFileList([{ ...file, originFileObj: file, uid: file.uid, name: file.name }] as UploadFile[])
                  return false
                }}
                onRemove={() => setFileList([])}
                maxCount={1}
                accept="audio/*,video/*,.wav,.mp3,.m4a,.ogg,.flac,.webm,.mp4"
              >
                <p className="ant-upload-drag-icon">
                  <UploadOutlined style={{ fontSize: 48, color: '#1890ff' }} />
                </p>
                <p className="ant-upload-text">點擊或拖曳音檔到此區域</p>
                <p className="ant-upload-hint">
                  支援 WAV、MP3、M4A、OGG、FLAC、WebM、MP4 等格式
                </p>
              </Upload.Dragger>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                {!recording && !recordedBlob && (
                  <div>
                    <Button
                      type="primary"
                      shape="circle"
                      size="large"
                      icon={<AudioOutlined style={{ fontSize: 32 }} />}
                      onClick={startRecording}
                      style={{ width: 80, height: 80 }}
                    />
                    <div style={{ marginTop: 12 }}>
                      <Text type="secondary">點擊開始錄音</Text>
                    </div>
                  </div>
                )}

                {recording && (
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <Tag color="red" style={{ fontSize: 16, padding: '4px 12px' }}>
                        {paused ? <AudioMutedOutlined /> : <AudioOutlined />}
                        {' '}{paused ? '已暫停' : '錄音中'}
                        {' '}{formatDuration(recordingDuration)}
                      </Tag>
                    </div>

                    <Progress
                      percent={audioLevel}
                      showInfo={false}
                      strokeColor={audioLevel > 70 ? '#ff4d4f' : audioLevel > 40 ? '#faad14' : '#52c41a'}
                      style={{ maxWidth: 300, margin: '0 auto 16px' }}
                    />

                    <Space size="middle">
                      {paused ? (
                        <Button icon={<PlayCircleOutlined />} onClick={resumeRecording} size="large">
                          繼續
                        </Button>
                      ) : (
                        <Button icon={<PauseCircleOutlined />} onClick={pauseRecording} size="large">
                          暫停
                        </Button>
                      )}
                      <Button type="primary" danger onClick={stopRecording} size="large">
                        停止錄音
                      </Button>
                    </Space>
                  </div>
                )}

                {!recording && recordedBlob && (
                  <div>
                    <Tag color="green" style={{ fontSize: 14, padding: '4px 12px', marginBottom: 16 }}>
                      錄音完成 — {formatDuration(recordingDuration)}
                      {' '}({(recordedBlob.size / 1024 / 1024).toFixed(1)} MB)
                    </Tag>

                    {recordedUrl && (
                      <div style={{ marginBottom: 16 }}>
                        <audio controls src={recordedUrl} style={{ maxWidth: '100%' }} />
                      </div>
                    )}

                    <Space>
                      <Button icon={<AudioOutlined />} onClick={startRecording}>
                        重新錄音
                      </Button>
                      <Button icon={<DeleteOutlined />} danger onClick={discardRecording}>
                        捨棄
                      </Button>
                    </Space>
                  </div>
                )}
              </div>
            )}

            <TextArea
              rows={2}
              placeholder="上下文資訊（選填）：例如與會人員、會議主題等，有助提升辨識準確度"
              value={contextInfo}
              onChange={(e) => setContextInfo(e.target.value)}
            />

            {/* ASR 參數設定 */}
            <Collapse
              ghost
              items={[
                {
                  key: 'settings',
                  label: (
                    <Space>
                      <SettingOutlined />
                      <Text>ASR 進階參數</Text>
                    </Space>
                  ),
                  children: (
                    <Card size="small">
                      <Space orientation="vertical" style={{ width: '100%' }} size="small">
                        <div>
                          <Text>Max New Tokens: <Text strong>{settings.maxNewTokens}</Text></Text>
                          <Slider min={4096} max={65536} step={1024} value={settings.maxNewTokens} onChange={(v) => setSettings({ ...settings, maxNewTokens: v })} />
                        </div>
                        <div>
                          <Text>Temperature: <Text strong>{settings.temperature}</Text></Text>
                          <Slider min={0} max={2} step={0.1} value={settings.temperature} onChange={(v) => setSettings({ ...settings, temperature: v })} />
                        </div>
                        <div>
                          <Text>Top-p (Nucleus Sampling): <Text strong>{settings.topP}</Text></Text>
                          <Slider min={0} max={1} step={0.05} value={settings.topP} onChange={(v) => setSettings({ ...settings, topP: v })} />
                        </div>
                        <div>
                          <Text>Repetition Penalty: <Text strong>{settings.repetitionPenalty}</Text></Text>
                          <Slider min={1.0} max={1.2} step={0.01} value={settings.repetitionPenalty} onChange={(v) => setSettings({ ...settings, repetitionPenalty: v })} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Text>Enable Sampling:</Text>
                          <Switch checked={settings.doSample} onChange={(v) => setSettings({ ...settings, doSample: v })} />
                        </div>
                        <Button size="small" onClick={() => setSettings({ ...DEFAULT_SETTINGS })}>
                          重設為預設值
                        </Button>
                      </Space>
                    </Card>
                  ),
                },
              ]}
            />

            <Space>
              <Button
                type="primary"
                icon={<AudioOutlined />}
                loading={transcribing}
                onClick={handleTranscribe}
                disabled={!hasAudio || recording}
                size="large"
              >
                開始轉錄
              </Button>
              {transcribing && (
                <Button danger onClick={handleCancel}>取消</Button>
              )}
            </Space>

            {transcribing && (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <Spin size="large" />
                <div style={{ marginTop: 12 }}>
                  <Text type="secondary">正在轉錄中，較長的音檔可能需要數分鐘...</Text>
                </div>
              </div>
            )}
          </Space>
        </Card>

        {/* 轉錄結果 */}
        {transcript && (
          <Card
            title={<>轉錄結果 {filename && <Text type="secondary" style={{ fontSize: 14 }}>— {filename}</Text>}</>}
            extra={
              <Button icon={<CopyOutlined />} onClick={handleCopy}>複製</Button>
            }
          >
            <Paragraph
              style={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
                fontSize: 14,
                lineHeight: 1.8,
                maxHeight: 400,
                overflow: 'auto',
              }}
            >
              {transcript}
            </Paragraph>

            <Divider />

            {/* 摘要格式選擇 + AI 摘要按鈕 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <Text strong>摘要格式：</Text>
              <Radio.Group
                value={summaryFormat}
                onChange={(e) => setSummaryFormat(e.target.value)}
                optionType="button"
                buttonStyle="solid"
              >
                {SUMMARY_FORMATS.map(f => (
                  <Radio.Button key={f.value} value={f.value}>
                    {f.label}
                  </Radio.Button>
                ))}
              </Radio.Group>
              <Button
                type="primary"
                icon={<RobotOutlined />}
                loading={summarizing}
                onClick={handleSummarize}
              >
                產生 AI 摘要
              </Button>
            </div>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary">
                {SUMMARY_FORMATS.find(f => f.value === summaryFormat)?.description}
              </Text>
            </div>
          </Card>
        )}

        {/* LLM 摘要結果 */}
        {(summaryText || summarizing) && (
          <Card title={<><FileTextOutlined style={{ marginRight: 8 }} />會議摘要</>}>
            {summarizing ? (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <Spin size="large" />
                <div style={{ marginTop: 12 }}>
                  <Text type="secondary">AI 正在分析會議內容...</Text>
                </div>
              </div>
            ) : (
              <Space orientation="vertical" style={{ width: '100%' }} size="middle">
                {/* 標題 */}
                <div>
                  <Text type="secondary">會議主題</Text>
                  <Input
                    value={summaryTitle}
                    onChange={(e) => setSummaryTitle(e.target.value)}
                    style={{ marginTop: 4 }}
                  />
                </div>

                {/* 摘要 */}
                <div>
                  <Text type="secondary">摘要</Text>
                  <TextArea
                    value={summaryText}
                    onChange={(e) => setSummaryText(e.target.value)}
                    rows={3}
                    style={{ marginTop: 4 }}
                  />
                </div>

                {/* 重點 */}
                {keyPoints.length > 0 && (
                  <div>
                    <Text type="secondary">重點</Text>
                    <List
                      size="small"
                      bordered
                      dataSource={keyPoints}
                      renderItem={(item, idx) => (
                        <List.Item>
                          <Input
                            variant="borderless"
                            value={item}
                            onChange={(e) => {
                              const updated = [...keyPoints]
                              updated[idx] = e.target.value
                              setKeyPoints(updated)
                            }}
                          />
                        </List.Item>
                      )}
                      style={{ marginTop: 4 }}
                    />
                  </div>
                )}

                {/* 待辦事項 */}
                {actionItems.length > 0 && (
                  <div>
                    <Text type="secondary">待辦事項</Text>
                    <List
                      size="small"
                      bordered
                      dataSource={actionItems}
                      renderItem={(item, idx) => (
                        <List.Item>
                          <Input
                            variant="borderless"
                            value={item}
                            onChange={(e) => {
                              const updated = [...actionItems]
                              updated[idx] = e.target.value
                              setActionItems(updated)
                            }}
                          />
                        </List.Item>
                      )}
                      style={{ marginTop: 4 }}
                    />
                  </div>
                )}

                {/* 參與者 */}
                {participants.length > 0 && (
                  <div>
                    <Text type="secondary">參與者</Text>
                    <div style={{ marginTop: 4 }}>
                      {participants.map((p, i) => (
                        <Tag key={i}>{p}</Tag>
                      ))}
                    </div>
                  </div>
                )}

                <Divider />

                {/* 存檔 */}
                <div>
                  <Text strong>存檔為客戶活動記錄</Text>
                  <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {!selectedPartnerId && (
                      <Select
                        showSearch
                        placeholder="選擇客戶"
                        style={{ minWidth: 250 }}
                        value={selectedPartnerId}
                        onChange={setSelectedPartnerId}
                        loading={loadingCustomers}
                        filterOption={(input, option) =>
                          (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                        options={customers.map(c => ({ value: c.id, label: c.name }))}
                      />
                    )}
                    {selectedPartnerId && (
                      <Tag color="blue" style={{ fontSize: 14, padding: '4px 8px' }}>
                        {customers.find(c => c.id === selectedPartnerId)?.name}
                      </Tag>
                    )}
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      loading={saving}
                      onClick={handleSave}
                      disabled={!selectedPartnerId}
                    >
                      儲存
                    </Button>
                  </div>
                </div>

                {savedActivityId && (
                  <Alert
                    type="success"
                    showIcon
                    icon={<CheckCircleOutlined />}
                    message="已成功儲存"
                    description={
                      <Space orientation="vertical" size="small">
                        <a
                          href={`/customers/${selectedPartnerId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          前往查看客戶活動記錄
                        </a>
                        {savedTranscriptPath && (
                          <Text type="secondary">
                            逐字稿已存檔至客戶檔案區：<Text code>{savedTranscriptPath}</Text>
                          </Text>
                        )}
                      </Space>
                    }
                  />
                )}
              </Space>
            )}
          </Card>
        )}
      </Space>
    </AppLayout>
  )
}
