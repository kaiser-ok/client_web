import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  CompanyConfig,
  DEFAULT_COMPANY_CONFIG,
  COMPANY_CONFIG_KEY,
} from '@/types/company'

/**
 * GET /api/settings/company
 * 取得公司資訊設定
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const config = await prisma.systemConfig.findUnique({
      where: { key: COMPANY_CONFIG_KEY },
    })

    if (config) {
      try {
        const parsed = JSON.parse(config.value) as CompanyConfig
        return NextResponse.json({ config: parsed })
      } catch {
        // JSON 解析失敗
      }
    }

    return NextResponse.json({ config: DEFAULT_COMPANY_CONFIG })
  } catch (error) {
    console.error('Get company config error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '取得設定失敗' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/settings/company
 * 更新公司資訊設定
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未授權' }, { status: 401 })
    }

    const body = await request.json()
    const {
      name,
      address,
      phone,
      email,
      contactPerson,
      contactTitle,
      logoPath,
      bankInfo,
      defaultTerms,
      taxRate,
      validDays,
    } = body

    // 取得現有設定
    const existingRecord = await prisma.systemConfig.findUnique({
      where: { key: COMPANY_CONFIG_KEY },
    })

    let existingConfig = DEFAULT_COMPANY_CONFIG
    if (existingRecord) {
      try {
        existingConfig = JSON.parse(existingRecord.value) as CompanyConfig
      } catch {
        // 使用預設值
      }
    }

    const updatedConfig: CompanyConfig = {
      ...existingConfig,
      name: name ?? existingConfig.name,
      address: address ?? existingConfig.address,
      phone: phone ?? existingConfig.phone,
      email: email ?? existingConfig.email,
      contactPerson: contactPerson ?? existingConfig.contactPerson,
      contactTitle: contactTitle ?? existingConfig.contactTitle,
      logoPath: logoPath ?? existingConfig.logoPath,
      bankInfo: bankInfo ?? existingConfig.bankInfo,
      defaultTerms: defaultTerms ?? existingConfig.defaultTerms,
      taxRate: taxRate ?? existingConfig.taxRate,
      validDays: validDays ?? existingConfig.validDays,
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.email,
    }

    await prisma.systemConfig.upsert({
      where: { key: COMPANY_CONFIG_KEY },
      update: {
        value: JSON.stringify(updatedConfig),
        updatedBy: session.user.email,
      },
      create: {
        key: COMPANY_CONFIG_KEY,
        value: JSON.stringify(updatedConfig),
        updatedBy: session.user.email,
      },
    })

    return NextResponse.json({
      success: true,
      config: updatedConfig,
    })
  } catch (error) {
    console.error('Update company config error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新設定失敗' },
      { status: 500 }
    )
  }
}
