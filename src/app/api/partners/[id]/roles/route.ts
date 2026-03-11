import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { PartnerRoleType } from '@/types/partner'

const VALID_ROLES: PartnerRoleType[] = ['DEALER', 'END_USER', 'SUPPLIER']

// GET /api/partners/[id]/roles - List roles for a partner
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

    const roles = await prisma.partnerRole.findMany({
      where: { partnerId: id },
      orderBy: { isPrimary: 'desc' },
    })

    return NextResponse.json(roles)
  } catch (error) {
    console.error('Error fetching partner roles:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}

// POST /api/partners/[id]/roles - Add a role to partner
export async function POST(
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
    const { role, isPrimary, metadata } = body

    // Validate role
    if (!role || !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: `無效的角色，必須是: ${VALID_ROLES.join(', ')}` }, { status: 400 })
    }

    // Check if partner exists
    const partner = await prisma.partner.findUnique({
      where: { id },
    })

    if (!partner) {
      return NextResponse.json({ error: 'Partner 不存在' }, { status: 404 })
    }

    // Check if role already exists
    const existingRole = await prisma.partnerRole.findUnique({
      where: {
        partnerId_role: {
          partnerId: id,
          role,
        },
      },
    })

    if (existingRole) {
      return NextResponse.json({ error: '此角色已存在' }, { status: 409 })
    }

    // If setting as primary, unset other primary roles
    if (isPrimary) {
      await prisma.partnerRole.updateMany({
        where: { partnerId: id, isPrimary: true },
        data: { isPrimary: false },
      })
    }

    // Create the role
    const newRole = await prisma.partnerRole.create({
      data: {
        partnerId: id,
        role,
        isPrimary: isPrimary || false,
        metadata: metadata || null,
      },
    })

    return NextResponse.json(newRole, { status: 201 })
  } catch (error) {
    console.error('Error adding partner role:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}

// PUT /api/partners/[id]/roles - Update a role (for setting isPrimary or metadata)
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
    const { roleId, isPrimary, metadata } = body

    if (!roleId) {
      return NextResponse.json({ error: 'roleId 為必填' }, { status: 400 })
    }

    // Check if role exists
    const existingRole = await prisma.partnerRole.findFirst({
      where: {
        id: roleId,
        partnerId: id,
      },
    })

    if (!existingRole) {
      return NextResponse.json({ error: '角色不存在' }, { status: 404 })
    }

    // If setting as primary, unset other primary roles
    if (isPrimary) {
      await prisma.partnerRole.updateMany({
        where: { partnerId: id, isPrimary: true, id: { not: roleId } },
        data: { isPrimary: false },
      })
    }

    const updatedRole = await prisma.partnerRole.update({
      where: { id: roleId },
      data: {
        ...(isPrimary !== undefined && { isPrimary }),
        ...(metadata !== undefined && { metadata }),
      },
    })

    return NextResponse.json(updatedRole)
  } catch (error) {
    console.error('Error updating partner role:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}

// DELETE /api/partners/[id]/roles?roleId=xxx - Remove a role from partner
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
    const { searchParams } = new URL(request.url)
    const roleId = searchParams.get('roleId')
    const role = searchParams.get('role') as PartnerRoleType | null

    if (!roleId && !role) {
      return NextResponse.json({ error: '需要提供 roleId 或 role' }, { status: 400 })
    }

    // Check partner's role count
    const roleCount = await prisma.partnerRole.count({
      where: { partnerId: id },
    })

    if (roleCount <= 1) {
      return NextResponse.json({ error: 'Partner 至少需要保留一個角色' }, { status: 400 })
    }

    // Find the role to delete
    let roleToDelete
    if (roleId) {
      roleToDelete = await prisma.partnerRole.findFirst({
        where: { id: roleId, partnerId: id },
      })
    } else if (role) {
      roleToDelete = await prisma.partnerRole.findUnique({
        where: {
          partnerId_role: {
            partnerId: id,
            role,
          },
        },
      })
    }

    if (!roleToDelete) {
      return NextResponse.json({ error: '角色不存在' }, { status: 404 })
    }

    // If deleting primary role, set another role as primary
    if (roleToDelete.isPrimary) {
      const anotherRole = await prisma.partnerRole.findFirst({
        where: {
          partnerId: id,
          id: { not: roleToDelete.id },
        },
      })

      if (anotherRole) {
        await prisma.partnerRole.update({
          where: { id: anotherRole.id },
          data: { isPrimary: true },
        })
      }
    }

    // Delete the role
    await prisma.partnerRole.delete({
      where: { id: roleToDelete.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing partner role:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
