import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { odooClient } from '@/lib/odoo'

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    // Only admin can sync
    if (session.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: '權限不足' }, { status: 403 })
    }

    // Test Odoo connection first
    const connected = await odooClient.testConnection()
    if (!connected) {
      return NextResponse.json({ error: '無法連線到 Odoo 資料庫' }, { status: 500 })
    }

    // Get employees from Odoo
    const odooEmployees = await odooClient.getEmployees()

    let created = 0
    let updated = 0
    let skipped = 0

    for (const employee of odooEmployees) {
      // Skip if no email (required for user login)
      if (!employee.email) {
        skipped++
        continue
      }

      // Check if user with this email already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: employee.email },
      })

      if (existingUser) {
        // Update existing user name if different
        if (existingUser.name !== employee.name) {
          await prisma.user.update({
            where: { email: employee.email },
            data: { name: employee.name },
          })
          updated++
        } else {
          skipped++
        }
      } else {
        // Create new user with default SUPPORT role
        await prisma.user.create({
          data: {
            email: employee.email,
            name: employee.name,
            role: 'SUPPORT', // Default role for new employees
          },
        })
        created++
      }
    }

    return NextResponse.json({
      success: true,
      message: '員工同步完成',
      stats: {
        total: odooEmployees.length,
        created,
        updated,
        skipped,
      },
    })
  } catch (error) {
    console.error('Error syncing employees from Odoo:', error)
    return NextResponse.json({ error: '同步失敗' }, { status: 500 })
  }
}
