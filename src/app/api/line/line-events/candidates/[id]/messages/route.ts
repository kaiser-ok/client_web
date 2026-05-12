import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

const BUFFER_MS = 30 * 60 * 1000 // 30 min buffer before/after window

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const candidate = await prisma.lineEventCandidate.findUnique({
    where: { id },
    select: { channelId: true, messageWindowStart: true, messageWindowEnd: true },
  })

  if (!candidate) return NextResponse.json({ error: '候選不存在' }, { status: 404 })

  const from = new Date(candidate.messageWindowStart.getTime() - BUFFER_MS)
  const to = new Date(candidate.messageWindowEnd.getTime() + BUFFER_MS)

  const messages = await prisma.lineMessage.findMany({
    where: {
      channelId: candidate.channelId,
      timestamp: { gte: from, lte: to },
    },
    orderBy: { timestamp: 'asc' },
    select: {
      id: true,
      lineUserId: true,
      messageType: true,
      content: true,
      mediaUrl: true,
      timestamp: true,
    },
  })

  const userIds = [...new Set(messages.map(m => m.lineUserId))]
  const users = await prisma.lineUser.findMany({
    where: { lineUserId: { in: userIds } },
    select: { lineUserId: true, displayName: true, pictureUrl: true, identityType: true },
  })
  const userMap = new Map(users.map(u => [u.lineUserId, u]))

  return NextResponse.json({
    windowStart: candidate.messageWindowStart,
    windowEnd: candidate.messageWindowEnd,
    messages: messages.map(m => ({
      id: m.id,
      lineUserId: m.lineUserId,
      displayName: userMap.get(m.lineUserId)?.displayName || 'Unknown',
      pictureUrl: userMap.get(m.lineUserId)?.pictureUrl || null,
      identityType: userMap.get(m.lineUserId)?.identityType || 'UNKNOWN',
      messageType: m.messageType,
      content: m.content,
      mediaUrl: m.mediaUrl,
      timestamp: m.timestamp,
      inWindow: m.timestamp >= candidate.messageWindowStart && m.timestamp <= candidate.messageWindowEnd,
    })),
  })
}
