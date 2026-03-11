/**
 * Slack API Client
 * 用於讀取 Slack 頻道訊息
 */

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN

interface SlackMessage {
  type: string
  user?: string
  text: string
  ts: string
  thread_ts?: string
  reply_count?: number
  reactions?: Array<{ name: string; count: number }>
}

interface SlackChannel {
  id: string
  name: string
  is_channel: boolean
  is_private: boolean
  is_member: boolean
  num_members?: number
  topic?: { value: string }
  purpose?: { value: string }
}

interface SlackUser {
  id: string
  name: string
  real_name: string
  profile: {
    display_name: string
    real_name: string
  }
}

interface ConversationsHistoryResponse {
  ok: boolean
  messages: SlackMessage[]
  has_more: boolean
  response_metadata?: {
    next_cursor: string
  }
  error?: string
}

interface ConversationsListResponse {
  ok: boolean
  channels: SlackChannel[]
  response_metadata?: {
    next_cursor: string
  }
  error?: string
}

interface UsersInfoResponse {
  ok: boolean
  user: SlackUser
  error?: string
}

/**
 * 建立 Slack API 客戶端
 */
export function createSlackClient(token?: string) {
  const botToken = token || SLACK_BOT_TOKEN

  if (!botToken) {
    throw new Error('SLACK_BOT_TOKEN is not configured')
  }

  const slackFetch = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
    const response = await fetch(`https://slack.com/api${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
        ...options.headers,
      },
    })

    if (!response.ok) {
      throw new Error(`Slack API HTTP error: ${response.status}`)
    }

    const data = await response.json()

    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`)
    }

    return data
  }

  // 快取使用者資訊
  const userCache = new Map<string, SlackUser>()

  return {
    /**
     * 列出所有頻道
     */
    async listChannels(options: {
      excludeArchived?: boolean
      types?: string // public_channel, private_channel
    } = {}): Promise<SlackChannel[]> {
      const { excludeArchived = true, types = 'public_channel,private_channel' } = options

      const allChannels: SlackChannel[] = []
      let cursor: string | undefined

      do {
        const params = new URLSearchParams({
          exclude_archived: excludeArchived.toString(),
          types,
          limit: '200',
        })
        if (cursor) {
          params.set('cursor', cursor)
        }

        const response = await slackFetch<ConversationsListResponse>(
          `/conversations.list?${params}`
        )

        allChannels.push(...response.channels)
        cursor = response.response_metadata?.next_cursor
      } while (cursor)

      return allChannels
    },

    /**
     * 取得頻道訊息歷史
     */
    async getChannelHistory(
      channelId: string,
      options: {
        oldest?: string // Unix timestamp
        latest?: string // Unix timestamp
        limit?: number
      } = {}
    ): Promise<SlackMessage[]> {
      const { oldest, latest, limit = 100 } = options

      const allMessages: SlackMessage[] = []
      let cursor: string | undefined

      do {
        const params = new URLSearchParams({
          channel: channelId,
          limit: Math.min(limit - allMessages.length, 200).toString(),
        })
        if (oldest) params.set('oldest', oldest)
        if (latest) params.set('latest', latest)
        if (cursor) params.set('cursor', cursor)

        const response = await slackFetch<ConversationsHistoryResponse>(
          `/conversations.history?${params}`
        )

        allMessages.push(...response.messages)
        cursor = response.response_metadata?.next_cursor

        // 達到限制數量就停止
        if (allMessages.length >= limit) break
      } while (cursor)

      return allMessages.slice(0, limit)
    },

    /**
     * 取得使用者資訊
     */
    async getUserInfo(userId: string): Promise<SlackUser> {
      // 檢查快取
      if (userCache.has(userId)) {
        return userCache.get(userId)!
      }

      const response = await slackFetch<UsersInfoResponse>(
        `/users.info?user=${userId}`
      )

      userCache.set(userId, response.user)
      return response.user
    },

    /**
     * 批次取得使用者名稱
     */
    async resolveUserNames(userIds: string[]): Promise<Map<string, string>> {
      const nameMap = new Map<string, string>()

      for (const userId of [...new Set(userIds)]) {
        try {
          const user = await this.getUserInfo(userId)
          nameMap.set(userId, user.profile.display_name || user.real_name || user.name)
        } catch {
          nameMap.set(userId, userId)
        }
      }

      return nameMap
    },

    /**
     * 取得頻道訊息並解析使用者名稱
     */
    async getChannelMessagesWithUserNames(
      channelId: string,
      options: {
        oldest?: string
        latest?: string
        limit?: number
      } = {}
    ): Promise<Array<{
      user: string
      text: string
      timestamp: string
      ts: string
    }>> {
      const messages = await this.getChannelHistory(channelId, options)

      // 過濾掉系統訊息，只保留使用者訊息
      const userMessages = messages.filter(m => m.user && m.text)

      // 取得所有使用者 ID
      const userIds = userMessages.map(m => m.user!).filter(Boolean)
      const userNames = await this.resolveUserNames(userIds)

      return userMessages.map(m => ({
        user: userNames.get(m.user!) || m.user!,
        text: m.text,
        timestamp: new Date(parseFloat(m.ts) * 1000).toLocaleString('zh-TW'),
        ts: m.ts,
      }))
    },

    /**
     * 搜尋頻道（根據名稱）
     */
    async findChannelByName(name: string): Promise<SlackChannel | null> {
      const channels = await this.listChannels()
      const normalizedName = name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '')

      return channels.find(ch => {
        const channelName = ch.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '')
        return channelName === normalizedName || channelName.includes(normalizedName)
      }) || null
    },
  }
}

/**
 * 計算時間範圍的 Unix timestamp
 */
export function getTimeRange(days: number): { oldest: string; latest: string } {
  const now = Date.now() / 1000
  const oldest = now - (days * 24 * 60 * 60)
  return {
    oldest: oldest.toString(),
    latest: now.toString(),
  }
}

export default createSlackClient
