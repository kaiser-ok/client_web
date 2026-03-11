import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id } = await params
    const userEmail = session.user?.email

    // Get partner with all relations
    const partner = await prisma.partner.findUnique({
      where: { id },
      include: {
        roles: {
          orderBy: { isPrimary: 'desc' },
        },
        parent: {
          select: { id: true, name: true },
        },
        subsidiaries: {
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        },
        projects: {
          select: {
            id: true,
            name: true,
            status: true,
            type: true,
            startDate: true,
            endDate: true,
          },
          orderBy: [
            { status: 'asc' },
            { updatedAt: 'desc' },
          ],
        },
        deals: {
          select: {
            id: true,
            name: true,
            type: true,
            amount: true,
            closedAt: true,
            startDate: true,
            endDate: true,
          },
          orderBy: { closedAt: 'desc' },
          take: 10,
        },
        _count: {
          select: {
            roles: true,
            activities: true,
            openItems: true,
            subsidiaries: true,
            projects: true,
            deals: true,
            files: true,
            technicalNotes: true,
          },
        },
      },
    })

    if (!partner) {
      return NextResponse.json({ error: 'Partner 不存在' }, { status: 404 })
    }

    // Record view for this user (upsert)
    if (userEmail) {
      await prisma.partnerView.upsert({
        where: {
          partnerId_userEmail: {
            partnerId: id,
            userEmail,
          },
        },
        create: {
          partnerId: id,
          userEmail,
          viewCount: 1,
          lastViewedAt: new Date(),
        },
        update: {
          viewCount: { increment: 1 },
          lastViewedAt: new Date(),
        },
      })
    }

    return NextResponse.json(partner)
  } catch (error) {
    console.error('Error fetching partner:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}

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
    const {
      name,
      aliases,
      contact,
      phone,
      email,
      website,
      parentId,
      slackChannelId,
      notes,
      isActive,
      jiraLabel,
    } = body

    // Prevent setting self as parent
    if (parentId === id) {
      return NextResponse.json({ error: '不能將自己設為母公司' }, { status: 400 })
    }

    // Auto-update Jira label if name changed and jiraLabel not explicitly provided
    const updatedJiraLabel = jiraLabel !== undefined ? jiraLabel : (name ? `客戶:${name}` : undefined)

    const partner = await prisma.partner.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(aliases !== undefined && { aliases }),
        ...(contact !== undefined && { contact: contact || null }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(email !== undefined && { email: email || null }),
        ...(website !== undefined && { website: website || null }),
        ...(parentId !== undefined && { parentId: parentId || null }),
        ...(slackChannelId !== undefined && { slackChannelId: slackChannelId || null }),
        ...(notes !== undefined && { notes: notes || null }),
        ...(isActive !== undefined && { isActive }),
        ...(updatedJiraLabel && { jiraLabel: updatedJiraLabel }),
      },
      include: {
        roles: {
          orderBy: { isPrimary: 'desc' },
        },
        parent: {
          select: { id: true, name: true },
        },
        subsidiaries: {
          select: { id: true, name: true },
        },
      },
    })

    return NextResponse.json(partner)
  } catch (error) {
    console.error('Error updating partner:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { id } = await params

    // Check if partner has any important relations that should prevent deletion
    const partner = await prisma.partner.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            deals: true,
            projects: true,
            subsidiaries: true,
          },
        },
      },
    })

    if (!partner) {
      return NextResponse.json({ error: 'Partner 不存在' }, { status: 404 })
    }

    // Warn if partner has active deals or projects
    if (partner._count.deals > 0 || partner._count.projects > 0) {
      const { searchParams } = new URL(request.url)
      const force = searchParams.get('force') === 'true'

      if (!force) {
        return NextResponse.json({
          error: '此 Partner 有關聯的成交記錄或專案，確定要刪除嗎？',
          requireConfirmation: true,
          counts: {
            deals: partner._count.deals,
            projects: partner._count.projects,
            subsidiaries: partner._count.subsidiaries,
          },
        }, { status: 409 })
      }
    }

    // Delete partner (cascade will handle related records)
    await prisma.partner.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting partner:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
