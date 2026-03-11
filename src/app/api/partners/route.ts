import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { odooClient } from '@/lib/odoo'
import { PartnerRoleType } from '@/types/partner'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const userEmail = session.user?.email
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const sortField = searchParams.get('sortField') || ''
    const sortOrder = searchParams.get('sortOrder') || 'asc'
    const rolesParam = searchParams.get('roles') || '' // CUSTOMER,SUPPLIER,PARTNER
    const isActive = searchParams.get('isActive')
    const hasOdooId = searchParams.get('hasOdooId')

    // Build where clause
    const where: Record<string, unknown> = {}

    // Active filter
    if (isActive !== null && isActive !== '') {
      where.isActive = isActive === 'true'
    }

    // Odoo ID filter
    if (hasOdooId !== null && hasOdooId !== '') {
      if (hasOdooId === 'true') {
        where.odooId = { not: null }
      } else {
        where.odooId = null
      }
    }

    // Role filter
    if (rolesParam) {
      const roles = rolesParam.split(',').filter(Boolean) as PartnerRoleType[]
      if (roles.length > 0) {
        where.roles = {
          some: {
            role: { in: roles }
          }
        }
      }
    }

    // Search filter
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' as const } },
        { aliases: { hasSome: [search] } },
        { contact: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
      ]
    }

    // Filter for active (non-expired) deals
    const activeDealsFilter = {
      OR: [
        { endDate: null },
        { endDate: { gte: new Date() } },
      ],
    }

    // Common include configuration
    const partnerInclude = {
      roles: {
        orderBy: { isPrimary: 'desc' as const },
      },
      parent: { select: { id: true, name: true } },
      subsidiaries: { select: { id: true, name: true } },
      _count: {
        select: {
          roles: true,
          activities: true,
          openItems: true,
          subsidiaries: true,
          deals: { where: activeDealsFilter },
          projects: true,
          files: true,
        },
      },
    }

    // For default sorting, use user-specific view data
    if (!sortField && userEmail) {
      // Get user's viewed partners sorted by viewCount and lastViewedAt
      const userViews = await prisma.partnerView.findMany({
        where: { userEmail },
        orderBy: [
          { viewCount: 'desc' },
          { lastViewedAt: 'desc' },
        ],
        select: { partnerId: true },
      })
      const viewedPartnerIds = userViews.map(v => v.partnerId)

      // If user has viewed some partners, show those first
      if (viewedPartnerIds.length > 0) {
        // Get viewed partners
        const viewedPartners = await prisma.partner.findMany({
          where: {
            ...where,
            id: { in: viewedPartnerIds },
          },
          include: partnerInclude,
        })

        // Sort viewed partners by the order in viewedPartnerIds
        const sortedViewedPartners = viewedPartnerIds
          .map(id => viewedPartners.find(p => p.id === id))
          .filter((p): p is NonNullable<typeof p> => p !== undefined)

        // Get remaining partners (not viewed by this user)
        const remainingPartners = await prisma.partner.findMany({
          where: {
            ...where,
            id: { notIn: viewedPartnerIds },
          },
          include: partnerInclude,
          orderBy: { name: 'asc' },
        })

        // Combine and paginate
        const allPartners = [...sortedViewedPartners, ...remainingPartners]
        const total = allPartners.length
        const paginatedPartners = allPartners.slice((page - 1) * pageSize, page * pageSize)

        return NextResponse.json({
          partners: paginatedPartners,
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        })
      }
      // If no viewed partners, fall through to default sorting
    }

    // Build orderBy for explicit sort field
    let orderBy: Record<string, unknown>[] = [{ name: 'asc' }]
    if (sortField === 'openItems') {
      orderBy = [{ openItems: { _count: sortOrder } }]
    } else if (sortField === 'deals') {
      orderBy = [{ deals: { _count: sortOrder } }]
    } else if (sortField === 'name') {
      orderBy = [{ name: sortOrder }]
    } else if (sortField === 'createdAt') {
      orderBy = [{ createdAt: sortOrder }]
    } else if (sortField === 'updatedAt') {
      orderBy = [{ updatedAt: sortOrder }]
    }

    const [partners, total] = await Promise.all([
      prisma.partner.findMany({
        where,
        include: partnerInclude,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.partner.count({ where }),
    ])

    return NextResponse.json({
      partners,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (error) {
    console.error('Error fetching partners:', error)
    const errorMessage = error instanceof Error ? error.message : '伺服器錯誤'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const {
      name,
      aliases,
      contact,
      phone,
      email,
      website,
      parentId,
      notes,
      roles,
      syncToOdoo,
    } = body

    if (!name) {
      return NextResponse.json({ error: '名稱為必填' }, { status: 400 })
    }

    // Validate roles
    const validRoles: PartnerRoleType[] = ['DEALER', 'END_USER', 'SUPPLIER']
    const partnerRoles = (roles || [{ role: 'DEALER', isPrimary: true }]) as Array<{
      role: PartnerRoleType
      isPrimary?: boolean
      metadata?: Record<string, unknown>
    }>

    for (const r of partnerRoles) {
      if (!validRoles.includes(r.role)) {
        return NextResponse.json({ error: `無效的角色: ${r.role}` }, { status: 400 })
      }
    }

    // Auto-generate Jira label from partner name
    const jiraLabel = `客戶:${name}`

    // If syncToOdoo is true, create partner in Odoo first
    let odooId: number | null = null
    if (syncToOdoo) {
      try {
        odooId = await odooClient.createPartner({
          name,
          email: email || null,
          phone: phone || null,
          is_company: true,
        })
      } catch (odooError) {
        console.error('Error creating partner in Odoo:', odooError)
        // Continue without Odoo sync, but log the error
      }
    }

    // Ensure exactly one primary role
    const hasPrimary = partnerRoles.some(r => r.isPrimary)
    if (!hasPrimary && partnerRoles.length > 0) {
      partnerRoles[0].isPrimary = true
    }

    const partner = await prisma.partner.create({
      data: {
        name,
        aliases: aliases || [],
        contact,
        phone,
        email,
        website,
        jiraLabel,
        parentId: parentId || null,
        odooId,
        source: odooId ? 'ODOO' : 'MANUAL',
        notes,
        roles: {
          create: partnerRoles.map(r => ({
            role: r.role,
            isPrimary: r.isPrimary || false,
            ...(r.metadata ? { metadata: r.metadata as Prisma.InputJsonValue } : {}),
          })),
        },
      },
      include: {
        roles: true,
        parent: {
          select: { id: true, name: true },
        },
      },
    })

    return NextResponse.json(partner, { status: 201 })
  } catch (error) {
    console.error('Error creating partner:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
