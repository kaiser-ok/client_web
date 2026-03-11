/**
 * LINE Messaging API Client
 * 用於接收與處理 LINE Official Account 訊息
 */

import crypto from 'crypto'

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET

// LINE Webhook Event Types
export interface LineWebhookEvent {
  type: 'message' | 'follow' | 'unfollow' | 'join' | 'leave' | 'memberJoined' | 'memberLeft' | 'postback'
  timestamp: number
  source: LineSource
  replyToken?: string
  message?: LineMessageEvent
}

export interface LineSource {
  type: 'user' | 'group' | 'room'
  userId?: string
  groupId?: string
  roomId?: string
}

export interface LineMessageEvent {
  id: string
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'location' | 'sticker'
  text?: string
  fileName?: string
  fileSize?: number
  title?: string
  address?: string
  latitude?: number
  longitude?: number
  packageId?: string
  stickerId?: string
  contentProvider?: {
    type: 'line' | 'external'
    originalContentUrl?: string
    previewImageUrl?: string
  }
}

export interface LineWebhookBody {
  destination: string
  events: LineWebhookEvent[]
}

export interface LineUserProfile {
  userId: string
  displayName: string
  pictureUrl?: string
  statusMessage?: string
}

export interface LineGroupSummary {
  groupId: string
  groupName: string
  pictureUrl?: string
}

interface LineApiError {
  message: string
  details?: Array<{ property: string; message: string }>
}

/**
 * 驗證 LINE Webhook 簽章
 */
export function verifySignature(body: string, signature: string, secret?: string): boolean {
  const channelSecret = secret || LINE_CHANNEL_SECRET
  if (!channelSecret) {
    console.error('LINE_CHANNEL_SECRET is not configured')
    return false
  }

  const expectedSignature = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64')

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}

/**
 * 建立 LINE API 客戶端
 */
export function createLineClient(token?: string) {
  const accessToken = token || LINE_CHANNEL_ACCESS_TOKEN

  if (!accessToken) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured')
  }

  const lineFetch = async <T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> => {
    const response = await fetch(`https://api.line.me/v2${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as LineApiError
      throw new Error(
        `LINE API error: ${response.status} - ${errorData.message || 'Unknown error'}`
      )
    }

    // Some endpoints return empty body (204)
    if (response.status === 204) {
      return {} as T
    }

    return response.json()
  }

  // 快取使用者資訊
  const userCache = new Map<string, LineUserProfile>()

  return {
    /**
     * 取得使用者資料
     */
    async getUserProfile(userId: string): Promise<LineUserProfile> {
      // 檢查快取
      if (userCache.has(userId)) {
        return userCache.get(userId)!
      }

      const profile = await lineFetch<LineUserProfile>(`/bot/profile/${userId}`)
      userCache.set(userId, profile)
      return profile
    },

    /**
     * 取得群組資訊
     */
    async getGroupSummary(groupId: string): Promise<LineGroupSummary> {
      return lineFetch<LineGroupSummary>(`/bot/group/${groupId}/summary`)
    },

    /**
     * 取得群組成員的使用者資料
     */
    async getGroupMemberProfile(
      groupId: string,
      userId: string
    ): Promise<LineUserProfile> {
      const cacheKey = `${groupId}:${userId}`
      if (userCache.has(cacheKey)) {
        return userCache.get(cacheKey)!
      }

      const profile = await lineFetch<LineUserProfile>(
        `/bot/group/${groupId}/member/${userId}`
      )
      userCache.set(cacheKey, profile)
      return profile
    },

    /**
     * 取得聊天室成員的使用者資料
     */
    async getRoomMemberProfile(
      roomId: string,
      userId: string
    ): Promise<LineUserProfile> {
      const cacheKey = `${roomId}:${userId}`
      if (userCache.has(cacheKey)) {
        return userCache.get(cacheKey)!
      }

      const profile = await lineFetch<LineUserProfile>(
        `/bot/room/${roomId}/member/${userId}`
      )
      userCache.set(cacheKey, profile)
      return profile
    },

    /**
     * 回覆訊息
     */
    async replyMessage(
      replyToken: string,
      messages: Array<{ type: string; text?: string; [key: string]: unknown }>
    ): Promise<void> {
      await lineFetch('/bot/message/reply', {
        method: 'POST',
        body: JSON.stringify({
          replyToken,
          messages,
        }),
      })
    },

    /**
     * 主動推送訊息
     */
    async pushMessage(
      to: string, // userId, groupId, or roomId
      messages: Array<{ type: string; text?: string; [key: string]: unknown }>
    ): Promise<void> {
      await lineFetch('/bot/message/push', {
        method: 'POST',
        body: JSON.stringify({
          to,
          messages,
        }),
      })
    },

    /**
     * 取得訊息內容（圖片、影片、檔案等）
     * 回傳 Buffer
     */
    async getMessageContent(messageId: string): Promise<Buffer> {
      const response = await fetch(
        `https://api-data.line.me/v2/bot/message/${messageId}/content`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )

      if (!response.ok) {
        throw new Error(`Failed to get message content: ${response.status}`)
      }

      return Buffer.from(await response.arrayBuffer())
    },

    /**
     * 離開群組
     */
    async leaveGroup(groupId: string): Promise<void> {
      await lineFetch(`/bot/group/${groupId}/leave`, {
        method: 'POST',
      })
    },

    /**
     * 離開聊天室
     */
    async leaveRoom(roomId: string): Promise<void> {
      await lineFetch(`/bot/room/${roomId}/leave`, {
        method: 'POST',
      })
    },

    /**
     * 取得使用者資料（從事件中取得適當的來源）
     */
    async getUserProfileFromEvent(event: LineWebhookEvent): Promise<LineUserProfile | null> {
      const { source } = event
      if (!source.userId) return null

      try {
        if (source.type === 'group' && source.groupId) {
          return await this.getGroupMemberProfile(source.groupId, source.userId)
        } else if (source.type === 'room' && source.roomId) {
          return await this.getRoomMemberProfile(source.roomId, source.userId)
        } else {
          return await this.getUserProfile(source.userId)
        }
      } catch (error) {
        console.error('Failed to get user profile:', error)
        return null
      }
    },

    /**
     * 解析事件來源的頻道 ID
     */
    getChannelIdFromEvent(event: LineWebhookEvent): string {
      const { source } = event
      if (source.type === 'group') return source.groupId!
      if (source.type === 'room') return source.roomId!
      return source.userId!
    },

    /**
     * 解析事件來源的頻道類型
     */
    getChannelTypeFromEvent(event: LineWebhookEvent): 'GROUP' | 'ROOM' | 'USER' {
      const { source } = event
      if (source.type === 'group') return 'GROUP'
      if (source.type === 'room') return 'ROOM'
      return 'USER'
    },
  }
}

/**
 * 解析 LINE 訊息內容為純文字
 */
export function parseMessageContent(message: LineMessageEvent): string | null {
  switch (message.type) {
    case 'text':
      return message.text || null
    case 'image':
      return '[圖片]'
    case 'video':
      return '[影片]'
    case 'audio':
      return '[語音]'
    case 'file':
      return `[檔案: ${message.fileName || '未知'}]`
    case 'location':
      return `[位置: ${message.title || message.address || '未知地點'}]`
    case 'sticker':
      return '[貼圖]'
    default:
      return null
  }
}

/**
 * 格式化 LINE 訊息用於 LLM 分析
 */
export function formatMessageForLLM(
  message: {
    displayName: string
    content: string
    timestamp: Date
  }
): string {
  const time = message.timestamp.toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `[${time}] ${message.displayName}: ${message.content}`
}

export default createLineClient
