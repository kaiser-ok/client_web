import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import * as OpenCC from 'opencc-js'

const ASR_BASE_URL = process.env.ASR_BASE_URL || 'http://192.168.30.47:7860'

// 簡體轉繁體轉換器
const s2tConverter = OpenCC.Converter({ from: 'cn', to: 'tw' })

/**
 * POST /api/transcriptions
 * 上傳音檔到 Gradio ASR 服務進行轉錄
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const contextInfo = (formData.get('contextInfo') as string) || ''
    const settingsRaw = formData.get('settings') as string | null

    // 解析 ASR 參數（前端可調整）
    const defaults = {
      maxNewTokens: 32768,
      temperature: 0.0,
      topP: 1.0,
      doSample: false,
      repetitionPenalty: 1.0,
    }
    const settings = settingsRaw ? { ...defaults, ...JSON.parse(settingsRaw) } : defaults

    if (!file) {
      return NextResponse.json({ error: '請上傳音檔' }, { status: 400 })
    }

    // Step 1: 上傳檔案到 Gradio
    const uploadForm = new FormData()
    uploadForm.append('files', file)

    const uploadRes = await fetch(`${ASR_BASE_URL}/gradio_api/upload`, {
      method: 'POST',
      body: uploadForm,
    })

    if (!uploadRes.ok) {
      const text = await uploadRes.text()
      console.error('Gradio upload failed:', text)
      return NextResponse.json({ error: 'ASR 服務上傳失敗' }, { status: 502 })
    }

    const uploadedFiles = await uploadRes.json()
    const filePath = uploadedFiles[0] // Gradio 回傳的伺服器端路徑

    // Step 2: 呼叫轉錄 API
    const transcribeRes = await fetch(`${ASR_BASE_URL}/gradio_api/call/transcribe_audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [
          { path: filePath, meta: { _type: 'gradio.FileData' }, orig_name: file.name },
          '', // audio_path_input
          '', // start_time
          '', // end_time
          settings.maxNewTokens,
          settings.temperature,
          settings.topP,
          settings.doSample,
          settings.repetitionPenalty,
          contextInfo,
        ],
      }),
    })

    if (!transcribeRes.ok) {
      const text = await transcribeRes.text()
      console.error('Gradio transcribe call failed:', text)
      return NextResponse.json({ error: 'ASR 轉錄請求失敗' }, { status: 502 })
    }

    const { event_id } = await transcribeRes.json()

    // Step 3: 取得串流結果
    const resultRes = await fetch(
      `${ASR_BASE_URL}/gradio_api/call/transcribe_audio/${event_id}`,
    )

    if (!resultRes.ok) {
      return NextResponse.json({ error: 'ASR 結果取得失敗' }, { status: 502 })
    }

    // 解析 SSE 串流，取得最終結果
    const sseText = await resultRes.text()
    const rawTranscript = parseGradioSSE(sseText)

    // 簡體轉繁體
    const transcript = s2tConverter(rawTranscript)

    return NextResponse.json({
      success: true,
      transcript,
      filename: file.name,
    })
  } catch (error) {
    console.error('Transcription error:', error)
    return NextResponse.json({ error: '轉錄失敗' }, { status: 500 })
  }
}

/**
 * 解析 Gradio SSE 回傳格式
 * 格式: "event: ...\ndata: [...]\n\n"
 */
function parseGradioSSE(sseText: string): string {
  const lines = sseText.split('\n')
  let lastData = ''

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      lastData = line.slice(6)
    }
  }

  if (!lastData) return ''

  try {
    const parsed = JSON.parse(lastData)
    // Gradio 回傳 [transcription_text, html_segments]
    if (Array.isArray(parsed)) {
      return parsed[0] || ''
    }
    return ''
  } catch {
    return lastData
  }
}
