/**
 * Dify API 整合
 * 用於與 Dify 平台進行 AI 對話和知識庫管理
 */

// Dify 配置
const DIFY_API_URL = process.env.DIFY_API_URL || 'http://localhost:8080/v1'
const DIFY_API_KEY = process.env.DIFY_API_KEY || ''

export interface DifyChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface DifyChatRequest {
  query: string
  inputs?: Record<string, string>
  conversationId?: string
  user?: string
  responseMode?: 'streaming' | 'blocking'
  files?: Array<{
    type: 'image' | 'document'
    transfer_method: 'remote_url' | 'local_file'
    url?: string
    upload_file_id?: string
  }>
}

export interface DifyChatResponse {
  message_id: string
  conversation_id: string
  mode: string
  answer: string
  metadata: {
    usage: {
      prompt_tokens: number
      completion_tokens: number
      total_tokens: number
    }
    retriever_resources?: Array<{
      position: number
      dataset_id: string
      dataset_name: string
      document_id: string
      document_name: string
      segment_id: string
      score: number
      content: string
    }>
  }
  created_at: number
}

export interface DifyStreamEvent {
  event: 'message' | 'message_end' | 'message_replace' | 'error' | 'ping'
  task_id?: string
  message_id?: string
  conversation_id?: string
  answer?: string
  metadata?: DifyChatResponse['metadata']
}

export interface DifyDataset {
  id: string
  name: string
  description: string
  permission: string
  data_source_type: string
  indexing_technique: string
  created_at: number
  updated_at: number
  document_count: number
  word_count: number
}

/**
 * 檢查 Dify 服務是否可用
 */
export async function checkDifyHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${DIFY_API_URL.replace('/v1', '')}/health`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${DIFY_API_KEY}`,
      },
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * 發送對話請求（阻塞模式）
 */
export async function chatWithDify(
  request: DifyChatRequest,
  appApiKey?: string
): Promise<DifyChatResponse> {
  const apiKey = appApiKey || DIFY_API_KEY

  if (!apiKey) {
    throw new Error('DIFY_API_KEY is not configured')
  }

  const response = await fetch(`${DIFY_API_URL}/chat-messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: request.inputs || {},
      query: request.query,
      response_mode: 'blocking',
      conversation_id: request.conversationId || '',
      user: request.user || 'client-web-user',
      files: request.files || [],
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`Dify API error: ${response.status} - ${JSON.stringify(error)}`)
  }

  return response.json()
}

/**
 * 發送對話請求（串流模式）
 */
export async function* chatWithDifyStream(
  request: DifyChatRequest,
  appApiKey?: string
): AsyncGenerator<DifyStreamEvent> {
  const apiKey = appApiKey || DIFY_API_KEY

  if (!apiKey) {
    throw new Error('DIFY_API_KEY is not configured')
  }

  const response = await fetch(`${DIFY_API_URL}/chat-messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: request.inputs || {},
      query: request.query,
      response_mode: 'streaming',
      conversation_id: request.conversationId || '',
      user: request.user || 'client-web-user',
      files: request.files || [],
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`Dify API error: ${response.status} - ${JSON.stringify(error)}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Response body is not readable')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue
          try {
            const event = JSON.parse(data) as DifyStreamEvent
            yield event
          } catch {
            // 忽略解析錯誤
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * 獲取對話歷史
 */
export async function getConversationMessages(
  conversationId: string,
  options: {
    user?: string
    firstId?: string
    limit?: number
  } = {},
  appApiKey?: string
): Promise<{
  data: Array<{
    id: string
    conversation_id: string
    inputs: Record<string, string>
    query: string
    answer: string
    created_at: number
  }>
  has_more: boolean
  limit: number
}> {
  const apiKey = appApiKey || DIFY_API_KEY

  const params = new URLSearchParams({
    user: options.user || 'client-web-user',
    conversation_id: conversationId,
  })

  if (options.firstId) params.set('first_id', options.firstId)
  if (options.limit) params.set('limit', options.limit.toString())

  const response = await fetch(`${DIFY_API_URL}/messages?${params}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Dify API error: ${response.status}`)
  }

  return response.json()
}

/**
 * 獲取對話列表
 */
export async function getConversations(
  options: {
    user?: string
    lastId?: string
    limit?: number
    sortBy?: 'created_at' | 'updated_at'
  } = {},
  appApiKey?: string
): Promise<{
  data: Array<{
    id: string
    name: string
    inputs: Record<string, string>
    status: string
    created_at: number
    updated_at: number
  }>
  has_more: boolean
  limit: number
}> {
  const apiKey = appApiKey || DIFY_API_KEY

  const params = new URLSearchParams({
    user: options.user || 'client-web-user',
  })

  if (options.lastId) params.set('last_id', options.lastId)
  if (options.limit) params.set('limit', options.limit.toString())
  if (options.sortBy) params.set('sort_by', options.sortBy)

  const response = await fetch(`${DIFY_API_URL}/conversations?${params}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Dify API error: ${response.status}`)
  }

  return response.json()
}

/**
 * 刪除對話
 */
export async function deleteConversation(
  conversationId: string,
  user?: string,
  appApiKey?: string
): Promise<void> {
  const apiKey = appApiKey || DIFY_API_KEY

  const response = await fetch(`${DIFY_API_URL}/conversations/${conversationId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user: user || 'client-web-user',
    }),
  })

  if (!response.ok) {
    throw new Error(`Dify API error: ${response.status}`)
  }
}

/**
 * 重新命名對話
 */
export async function renameConversation(
  conversationId: string,
  name: string,
  user?: string,
  appApiKey?: string
): Promise<void> {
  const apiKey = appApiKey || DIFY_API_KEY

  const response = await fetch(`${DIFY_API_URL}/conversations/${conversationId}/name`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      user: user || 'client-web-user',
    }),
  })

  if (!response.ok) {
    throw new Error(`Dify API error: ${response.status}`)
  }
}

// ============ 知識庫 API ============

/**
 * 獲取知識庫列表
 */
export async function getDatasets(
  options: {
    page?: number
    limit?: number
  } = {}
): Promise<{
  data: DifyDataset[]
  has_more: boolean
  limit: number
  total: number
  page: number
}> {
  const params = new URLSearchParams()
  if (options.page) params.set('page', options.page.toString())
  if (options.limit) params.set('limit', options.limit.toString())

  const response = await fetch(`${DIFY_API_URL}/datasets?${params}`, {
    headers: {
      'Authorization': `Bearer ${DIFY_API_KEY}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Dify API error: ${response.status}`)
  }

  return response.json()
}

/**
 * 創建知識庫
 */
export async function createDataset(
  name: string,
  options: {
    description?: string
    indexingTechnique?: 'high_quality' | 'economy'
    permission?: 'only_me' | 'all_team_members'
  } = {}
): Promise<DifyDataset> {
  const response = await fetch(`${DIFY_API_URL}/datasets`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DIFY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      description: options.description || '',
      indexing_technique: options.indexingTechnique || 'high_quality',
      permission: options.permission || 'only_me',
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`Dify API error: ${response.status} - ${JSON.stringify(error)}`)
  }

  return response.json()
}

/**
 * 上傳文檔到知識庫
 */
export async function uploadDocument(
  datasetId: string,
  file: File | Blob,
  options: {
    name?: string
    indexingTechnique?: 'high_quality' | 'economy'
    processRule?: {
      mode: 'automatic' | 'custom'
      rules?: {
        pre_processing_rules?: Array<{
          id: string
          enabled: boolean
        }>
        segmentation?: {
          separator: string
          max_tokens: number
        }
      }
    }
  } = {}
): Promise<{
  document: {
    id: string
    position: number
    data_source_type: string
    name: string
    created_from: string
    created_at: number
    tokens: number
    indexing_status: string
  }
  batch: string
}> {
  const formData = new FormData()
  formData.append('file', file, options.name || 'document')
  formData.append('data', JSON.stringify({
    indexing_technique: options.indexingTechnique || 'high_quality',
    process_rule: options.processRule || { mode: 'automatic' },
  }))

  const response = await fetch(
    `${DIFY_API_URL}/datasets/${datasetId}/document/create_by_file`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DIFY_API_KEY}`,
      },
      body: formData,
    }
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`Dify API error: ${response.status} - ${JSON.stringify(error)}`)
  }

  return response.json()
}

/**
 * 通過文本創建文檔
 */
export async function createDocumentByText(
  datasetId: string,
  name: string,
  text: string,
  options: {
    indexingTechnique?: 'high_quality' | 'economy'
    processRule?: {
      mode: 'automatic' | 'custom'
      rules?: {
        pre_processing_rules?: Array<{
          id: string
          enabled: boolean
        }>
        segmentation?: {
          separator: string
          max_tokens: number
        }
      }
    }
  } = {}
): Promise<{
  document: {
    id: string
    name: string
    created_at: number
  }
  batch: string
}> {
  const response = await fetch(
    `${DIFY_API_URL}/datasets/${datasetId}/document/create_by_text`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DIFY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        text,
        indexing_technique: options.indexingTechnique || 'high_quality',
        process_rule: options.processRule || { mode: 'automatic' },
      }),
    }
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`Dify API error: ${response.status} - ${JSON.stringify(error)}`)
  }

  return response.json()
}

/**
 * 同步 LINE 訊息到 Dify 知識庫
 */
export async function syncLineChannelToDify(
  datasetId: string,
  channelId: string,
  channelName: string,
  messages: Array<{
    timestamp: Date
    displayName: string
    content: string
  }>
): Promise<{ documentId: string }> {
  // 格式化訊息
  const content = messages
    .map(m => {
      const time = m.timestamp.toISOString().slice(0, 16).replace('T', ' ')
      return `[${time}] ${m.displayName}: ${m.content}`
    })
    .join('\n')

  // 創建文檔
  const result = await createDocumentByText(
    datasetId,
    `LINE-${channelName}-${new Date().toISOString().slice(0, 10)}`,
    content,
    {
      indexingTechnique: 'high_quality',
      processRule: {
        mode: 'custom',
        rules: {
          segmentation: {
            separator: '\n',
            max_tokens: 500,
          },
        },
      },
    }
  )

  return { documentId: result.document.id }
}
