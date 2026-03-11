import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { odooClient } from '@/lib/odoo'

// Customer roles (subset of PartnerRole)
const CUSTOMER_ROLES = ['DEALER', 'END_USER']

// Helper: extract role and metadata from a partner's roles array
function extractCustomerFields(roles: Array<{ role: string; isPrimary?: boolean; metadata: unknown }>, roleFilter?: string) {
  // When filtering by a specific role, show that role; otherwise show primary
  const matchedRole = roleFilter
    ? roles.find(r => r.role === roleFilter)
    : (roles.find(r => r.isPrimary) || roles[0])
  const metadata = (matchedRole?.metadata as Record<string, unknown>) || {}
  return {
    role: matchedRole?.role || 'DEALER',
    salesRep: metadata.salesRep || null,
    partner: metadata.partner || null,
  }
}

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
    // Support both 'role' and legacy 'customerType' query param
    const roleFilter = searchParams.get('role') || searchParams.get('customerType') || ''

    // Build where clause - filter for partners with DEALER or END_USER role
    const where: Record<string, unknown> = {
      roles: {
        some: {
          role: roleFilter
            ? roleFilter  // Filter by specific role (DEALER or END_USER)
            : { in: CUSTOMER_ROLES },  // Show all customers
        },
      },
    }

    // Search filter
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' as const } },
        { aliases: { has: search } },
        { aliases: { hasSome: [search] } },
        { contact: { contains: search, mode: 'insensitive' as const } },
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
      roles: true,
      parent: { select: { id: true, name: true } },
      subsidiaries: { select: { id: true, name: true } },
      _count: {
        select: {
          activities: true,
          openItems: true,
          subsidiaries: true,
          deals: { where: activeDealsFilter },
        },
      },
    }

    // Map partners to response format
    const mapPartners = (partners: Array<{ roles: Array<{ role: string; metadata: unknown }>; [key: string]: unknown }>) =>
      partners.map(p => ({
        ...p,
        ...extractCustomerFields(p.roles, roleFilter || undefined),
      }))

    // For default sorting, use user-specific view data
    if (!sortField && userEmail) {
      const userViews = await prisma.partnerView.findMany({
        where: { userEmail },
        orderBy: [
          { viewCount: 'desc' },
          { lastViewedAt: 'desc' },
        ],
        select: { partnerId: true },
      })
      const viewedPartnerIds = userViews.map(v => v.partnerId)

      if (viewedPartnerIds.length > 0) {
        const viewedPartners = await prisma.partner.findMany({
          where: { ...where, id: { in: viewedPartnerIds } },
          include: partnerInclude,
        })

        const sortedViewedPartners = viewedPartnerIds
          .map(id => viewedPartners.find(c => c.id === id))
          .filter((c): c is NonNullable<typeof c> => c !== undefined)

        const remainingPartners = await prisma.partner.findMany({
          where: { ...where, id: { notIn: viewedPartnerIds } },
          include: partnerInclude,
          orderBy: { name: 'asc' },
        })

        const allPartners = [...sortedViewedPartners, ...remainingPartners]
        const total = allPartners.length
        const paginatedPartners = allPartners.slice((page - 1) * pageSize, page * pageSize)

        return NextResponse.json({
          customers: mapPartners(paginatedPartners),
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        })
      }
    }

    // Build orderBy for explicit sort field
    let orderBy: Record<string, unknown>[] = [{ name: 'asc' }]
    if (sortField === 'openItems') {
      orderBy = [{ openItems: { _count: sortOrder } }]
    } else if (sortField === 'deals') {
      orderBy = [{ deals: { _count: sortOrder } }]
    } else if (sortField === 'name') {
      orderBy = [{ name: sortOrder }]
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
      customers: mapPartners(partners),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (error) {
    console.error('Error fetching customers:', error)
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
    const { name, aliases, contact, phone, email, parentId, syncToOdoo, role = 'DEALER' } = body

    if (!name) {
      return NextResponse.json({ error: '客戶名稱為必填' }, { status: 400 })
    }

    const jiraLabel = `客戶:${name}`

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
      }
    }

    const partner = await prisma.partner.create({
      data: {
        name,
        aliases: aliases || [],
        contact,
        phone,
        email,
        jiraLabel,
        parentId: parentId || null,
        odooId: odooId,
        source: odooId ? 'ODOO' : 'MANUAL',
        roles: {
          create: {
            role,
            isPrimary: true,
          },
        },
      },
      include: {
        roles: true,
        parent: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({ ...partner, role }, { status: 201 })
  } catch (error) {
    console.error('Error creating customer:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
