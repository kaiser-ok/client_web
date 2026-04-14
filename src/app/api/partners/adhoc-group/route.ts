import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ADHOC_GROUP_NAME = '臨時客戶'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: '未授權' }, { status: 401 })

  let group = await prisma.partner.findFirst({
    where: {
      name: ADHOC_GROUP_NAME,
      roles: { some: { role: 'END_USER' } },
      parentId: null,
    },
    select: { id: true, name: true },
  })

  if (!group) {
    group = await prisma.partner.create({
      data: {
        name: ADHOC_GROUP_NAME,
        source: 'MANUAL',
        roles: { create: { role: 'END_USER', isPrimary: true } },
      },
      select: { id: true, name: true },
    })
  }

  return NextResponse.json(group)
}
