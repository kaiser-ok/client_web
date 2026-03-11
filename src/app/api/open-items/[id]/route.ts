import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import jiraClient from '@/lib/jira'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { waitingOn, nextAction, dueDate } = body

    // Update local database
    const openItem = await prisma.openItem.update({
      where: { id },
      data: {
        waitingOn,
        nextAction,
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    })

    return NextResponse.json(openItem)
  } catch (error) {
    console.error('Error updating open item:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Handle reply action
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { content, source, updateWaitingOn, updateNextAction, updateDueDate } = body

    if (!content) {
      return NextResponse.json({ error: '回覆內容為必填' }, { status: 400 })
    }

    // Get the open item
    const openItem = await prisma.openItem.findUnique({
      where: { id },
      include: { partner: true },
    })

    if (!openItem) {
      return NextResponse.json({ error: '找不到此問題' }, { status: 404 })
    }

    // Add comment to Jira
    const replyPrefix = source ? `[來源: ${source}]\n` : ''
    await jiraClient.addComment(openItem.jiraKey, replyPrefix + content)

    // Update local open item
    const updateData: Record<string, unknown> = {
      lastReply: content.substring(0, 500),
      lastReplyBy: session.user.name || session.user.email,
      lastReplyAt: new Date(),
    }

    if (updateWaitingOn !== undefined) {
      updateData.waitingOn = updateWaitingOn
    }
    if (updateNextAction !== undefined) {
      updateData.nextAction = updateNextAction
    }
    if (updateDueDate !== undefined) {
      updateData.dueDate = updateDueDate ? new Date(updateDueDate) : null
    }

    await prisma.openItem.update({
      where: { id },
      data: updateData,
    })

    // Create activity record
    await prisma.activity.create({
      data: {
        partnerId: openItem.partnerId,
        source: source || 'MANUAL',
        title: `回覆 ${openItem.jiraKey}`,
        content,
        jiraKey: openItem.jiraKey,
        createdBy: session.user.email,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error adding reply:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '回覆失敗' },
      { status: 500 }
    )
  }
}
