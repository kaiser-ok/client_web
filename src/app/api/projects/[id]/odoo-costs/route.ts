import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { hasPermission } from '@/constants/roles'
import odooClient from '@/lib/odoo'

// GET: 從 Odoo 取得該專案的出貨紀錄作為外部成本
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const userRole = (session.user as { role?: string })?.role
    if (!hasPermission(userRole, 'EDIT_BONUS')) {
      return NextResponse.json({ error: '無權限' }, { status: 403 })
    }

    const { id: projectId } = await params

    // Get project with deal
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { deal: { select: { odooId: true, name: true } } },
    })

    if (!project) {
      return NextResponse.json({ error: '專案不存在' }, { status: 404 })
    }

    if (!project.deal?.odooId) {
      return NextResponse.json({ error: '此專案無關聯的 Odoo 訂單' }, { status: 400 })
    }

    const saleOrderId = project.deal.odooId
    const items = await odooClient.getDeliveryCosts(saleOrderId)

    return NextResponse.json({
      saleOrderId,
      dealName: project.deal.name,
      items,
      totalCost: items.reduce((sum, item) => sum + item.total_cost, 0),
    })
  } catch (error) {
    console.error('Error fetching Odoo costs:', error)
    return NextResponse.json({ error: '取得 Odoo 出貨資料失敗' }, { status: 500 })
  }
}
