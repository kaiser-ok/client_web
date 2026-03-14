'use client'

import React from 'react'

const LINE_EMOJI_REGEX = /\{\{LINE_EMOJI:([^:]+):([^}]+)\}\}/g

/**
 * LINE emoji CDN URL
 * https://stickershop.line-scdn.net/sticonshop/v1/sticon/{productId}/iPhone/{emojiId}.png
 */
function getLineEmojiUrl(productId: string, emojiId: string): string {
  return `https://stickershop.line-scdn.net/sticonshop/v1/sticon/${productId}/iPhone/${emojiId}.png`
}

/**
 * Renders text content with inline LINE emoji images.
 * Replaces {{LINE_EMOJI:productId:emojiId}} markers with <img> tags.
 */
export default function LineEmojiText({
  content,
  style,
}: {
  content: string
  style?: React.CSSProperties
}) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  // Reset regex state
  LINE_EMOJI_REGEX.lastIndex = 0

  while ((match = LINE_EMOJI_REGEX.exec(content)) !== null) {
    // Add text before the emoji
    if (match.index > lastIndex) {
      parts.push(content.substring(lastIndex, match.index))
    }

    const [, productId, emojiId] = match
    parts.push(
      <img
        key={match.index}
        src={getLineEmojiUrl(productId, emojiId)}
        alt="emoji"
        style={{
          width: 20,
          height: 20,
          verticalAlign: 'text-bottom',
          display: 'inline',
        }}
      />
    )

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(content.substring(lastIndex))
  }

  // No emojis found, render plain text
  if (parts.length === 0) {
    return <span style={style}>{content}</span>
  }

  return <span style={{ ...style, whiteSpace: 'pre-wrap' }}>{parts}</span>
}
