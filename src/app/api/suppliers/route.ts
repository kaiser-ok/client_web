import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * GET: 取得供應商列表 (Partners with SUPPLIER role)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''

    const where = {
      roles: {
        some: { role: 'SUPPLIER' },
      },
      ...(search
        ? {
            name: {
              contains: search,
              mode: 'insensitive' as const,
            },
          }
        : {}),
    }

    const suppliers = await prisma.partner.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        roles: {
          select: { role: true, isPrimary: true },
        },
      },
    })

    return NextResponse.json({ suppliers })
  } catch (error) {
    console.error('Error fetching suppliers:', error)
    return NextResponse.json({ error: '取得供應商列表失敗' }, { status: 500 })
  }
}

/**
 * POST: 新增供應商 (Create Partner with SUPPLIER role)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const { name, email, phone, website, notes } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: '供應商名稱為必填' }, { status: 400 })
    }

    const supplier = await prisma.partner.create({
      data: {
        name: name.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        website: website?.trim() || null,
        notes: notes?.trim() || null,
        source: 'MANUAL',
        roles: {
          create: {
            role: 'SUPPLIER',
            isPrimary: true,
          },
        },
      },
      include: {
        roles: {
          select: { role: true, isPrimary: true },
        },
      },
    })

    return NextResponse.json({ success: true, supplier })
  } catch (error) {
    console.error('Error creating supplier:', error)
    return NextResponse.json({ error: '新增供應商失敗' }, { status: 500 })
  }
}
