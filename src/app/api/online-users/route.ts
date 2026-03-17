import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// In-memory store for active user heartbeats
// Key: unique session identifier, Value: { name, email, lastSeen }
const activeUsers = new Map<string, { name: string; email: string; lastSeen: number }>()

const TIMEOUT_MS = 2 * 60 * 1000 // 2 minutes - user considered offline after this

function cleanExpired() {
  const now = Date.now()
  for (const [key, value] of activeUsers) {
    if (now - value.lastSeen > TIMEOUT_MS) {
      activeUsers.delete(key)
    }
  }
}

// POST - heartbeat from client
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const key = session.user.email
    activeUsers.set(key, {
      name: session.user.name || session.user.email,
      email: session.user.email,
      lastSeen: Date.now(),
    })

    cleanExpired()

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}

// GET - return online user count and list
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    cleanExpired()

    const users = Array.from(activeUsers.values()).map(u => ({
      name: u.name,
      email: u.email,
    }))

    return NextResponse.json({
      count: users.length,
      users,
    })
  } catch {
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
