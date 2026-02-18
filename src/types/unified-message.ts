export interface UnifiedMessage {
  id: string                    // crypto.randomUUID()
  channel: 'LINE' | 'SLACK' | 'EMAIL'
  channelMessageId: string      // LINE message.id / Slack ts / email messageId
  content: string
  timestamp: Date
  sender: {
    channelUserId: string       // LINE userId / Slack userId / email address
    displayName?: string
  }
  channelId?: string            // LINE group/room/user ID / Slack channel / undefined for email
  channelName?: string
  threadId?: string             // Slack thread_ts / email In-Reply-To
  subject?: string              // Email only
  partnerId?: string            // Resolved partner ID (if known at enqueue time)
  metadata?: Record<string, unknown>
}

export interface MessagePipelineJobData {
  message: UnifiedMessage
}
