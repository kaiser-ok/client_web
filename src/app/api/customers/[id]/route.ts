import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// Customer roles (subset of PartnerRole)
const CUSTOMER_ROLES = ['DEALER', 'END_USER']

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

    const customer = await prisma.partner.findUnique({
      where: { id },
      include: {
        roles: true,
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
            startDate: true,
            endDate: true,
          },
          orderBy: [
            { status: 'asc' },
            { updatedAt: 'desc' },
          ],
        },
        _count: {
          select: {
            activities: true,
            openItems: true,
            subsidiaries: true,
            projects: true,
          },
        },
      },
    })

    if (!customer) {
      return NextResponse.json({ error: '客戶不存在' }, { status: 404 })
    }

    // Record view
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

    // Extract role and metadata
    const primaryRole = customer.roles.find(r => CUSTOMER_ROLES.includes(r.role)) || customer.roles[0]
    const metadata = (primaryRole?.metadata as Record<string, unknown>) || {}
    return NextResponse.json({
      ...customer,
      role: primaryRole?.role || 'DEALER',
      salesRep: metadata.salesRep || null,
      partner: metadata.partner || null,
    })
  } catch (error) {
    console.error('Error fetching customer:', error)
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
    const { name, aliases, contact, phone, email, website, parentId, slackChannelId, notes, isActive, role: newRole, salesRep, partner: partnerField } = body

    // Prevent setting self as parent
    if (parentId === id) {
      return NextResponse.json({ error: '不能將自己設為母公司' }, { status: 400 })
    }

    const jiraLabel = name ? `客戶:${name}` : undefined

    const partnerRecord = await prisma.partner.update({
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
        ...(jiraLabel && { jiraLabel }),
      },
      include: {
        roles: true,
        parent: { select: { id: true, name: true } },
        subsidiaries: { select: { id: true, name: true } },
      },
    })

    // Handle role change: replace all roles with the new single role
    if (newRole !== undefined) {
      const currentRoles = partnerRecord.roles
      const currentRole = currentRoles[0]

      if (!currentRole || currentRole.role !== newRole) {
        // Preserve metadata from old role
        const oldMetadata = (currentRole?.metadata as Record<string, unknown>) || {}

        // Delete all existing roles
        await prisma.partnerRole.deleteMany({ where: { partnerId: id } })

        // Create new role with preserved metadata
        await prisma.partnerRole.create({
          data: {
            partnerId: id,
            role: newRole,
            isPrimary: true,
            metadata: {
              ...oldMetadata,
              ...(salesRep !== undefined && { salesRep: salesRep || null }),
              ...(partnerField !== undefined && { partner: partnerField || null }),
            },
          },
        })
      } else if (salesRep !== undefined || partnerField !== undefined) {
        // Same role, just update metadata
        const existingMetadata = (currentRole.metadata as Record<string, unknown>) || {}
        await prisma.partnerRole.update({
          where: { id: currentRole.id },
          data: {
            metadata: {
              ...existingMetadata,
              ...(salesRep !== undefined && { salesRep: salesRep || null }),
              ...(partnerField !== undefined && { partner: partnerField || null }),
            },
          },
        })
      }
    } else if (salesRep !== undefined || partnerField !== undefined) {
      // No role change, just update metadata on existing role
      const currentRole = partnerRecord.roles[0]
      if (currentRole) {
        const existingMetadata = (currentRole.metadata as Record<string, unknown>) || {}
        await prisma.partnerRole.update({
          where: { id: currentRole.id },
          data: {
            metadata: {
              ...existingMetadata,
              ...(salesRep !== undefined && { salesRep: salesRep || null }),
              ...(partnerField !== undefined && { partner: partnerField || null }),
            },
          },
        })
      }
    }

    // Re-fetch final state
    const updatedRoles = await prisma.partnerRole.findMany({ where: { partnerId: id } })
    const primaryRole = updatedRoles[0]
    const metadata = (primaryRole?.metadata as Record<string, unknown>) || {}

    return NextResponse.json({
      ...partnerRecord,
      roles: updatedRoles,
      role: primaryRole?.role || 'DEALER',
      salesRep: metadata.salesRep || null,
      partner: metadata.partner || null,
    })
  } catch (error) {
    console.error('Error updating customer:', error)
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
    await prisma.partner.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting customer:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
