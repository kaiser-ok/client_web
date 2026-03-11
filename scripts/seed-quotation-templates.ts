/**
 * 報價範本種子資料
 * 建立 3 個預設範本：VoIP 標準專案、智慧網管標準專案、設備採購（空白）
 *
 * Usage: npx tsx scripts/seed-quotation-templates.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding quotation templates...')

  // Template 1: VoIP 標準專案
  await prisma.quotationTemplate.upsert({
    where: { id: 'template-voip-standard' },
    update: {},
    create: {
      id: 'template-voip-standard',
      name: 'VoIP 標準專案',
      category: 'VOIP',
      description: 'IP PBX 標準建置，含 SBC、授權、IP Phone',
      items: [
        {
          productName: 'Ribbon SBC1000',
          sku: 'HW-RBN-OIGW-SBC1K',
          category: 'VoIP/SBC - Ribbon',
          quantity: 1,
          unitPrice: 80000,
          description: 'SBC 主機',
          sortOrder: 0,
        },
        {
          productName: 'SBC1000 擴充10路SIP授權',
          sku: 'SW-RBN-OIGW-SBC1K-SIP-E-10',
          category: 'VoIP/SBC - Ribbon',
          quantity: 1,
          unitPrice: 11500,
          description: 'SIP Trunk 授權',
          sortOrder: 1,
        },
        {
          productName: 'SBC1000 擴充4埠FXO授權',
          sku: 'SW-RBN-OIGW-SBC1K-FXO-4',
          category: 'VoIP/SBC - Ribbon',
          quantity: 1,
          unitPrice: 24000,
          description: 'FXO 類比線路授權',
          sortOrder: 2,
        },
        {
          productName: 'Yealink SIP-T30P',
          category: 'VoIP/IP Phone - Yealink',
          quantity: 10,
          unitPrice: 0,
          description: 'IP 話機（單價待填）',
          sortOrder: 3,
        },
        {
          productName: '第二年起保固費用',
          category: 'VoIP/SBC - Ribbon',
          quantity: 1,
          unitPrice: 0,
          description: '延長保固（單價待填）',
          sortOrder: 4,
        },
      ],
      defaultNotes: '含安裝設定、教育訓練',
      paymentTerms: '訂金30%、交機40%、驗收30%',
      sortOrder: 0,
      createdBy: 'system',
    },
  })
  console.log('  Created: VoIP 標準專案')

  // Template 2: 智慧網管標準專案
  await prisma.quotationTemplate.upsert({
    where: { id: 'template-smart-network-standard' },
    update: {},
    create: {
      id: 'template-smart-network-standard',
      name: '智慧網管標準專案',
      category: 'SMART_NETWORK',
      description: 'MikroTik 路由器 + 交換器 + AP 完整方案',
      items: [
        {
          productName: 'MikroTik CCR1036-8G-2S+',
          sku: 'HW-MT-RT-CCR1036-8G-2S+',
          category: '網路設備/Router - MikroTik',
          quantity: 1,
          unitPrice: 39800,
          description: '核心路由器',
          sortOrder: 0,
        },
        {
          productName: 'MikroTik CRS354-48P-4S+2Q+RM',
          sku: 'HW-MT-SW-CRS354-48P-4S+2Q+RM',
          category: '網路設備/Switch - MikroTik',
          quantity: 2,
          unitPrice: 34500,
          description: '48 Port PoE 交換器',
          sortOrder: 1,
        },
        {
          productName: 'MikroTik CRS326-24G-2S+RM',
          sku: 'HW-MT-SW-CRS326-24G-2S+RM',
          category: '網路設備/Switch - MikroTik',
          quantity: 4,
          unitPrice: 7620,
          description: '24 Port 交換器',
          sortOrder: 2,
        },
        {
          productName: 'Siraya AirZone 13W2',
          sku: 'HW-SRY-AP-AZ13W2',
          category: '網路設備/AP - Siraya',
          quantity: 10,
          unitPrice: 6000,
          description: '無線 AP',
          sortOrder: 3,
        },
      ],
      defaultNotes: '含網路規劃、設備安裝、系統設定',
      paymentTerms: '訂金30%、交機40%、驗收30%',
      sortOrder: 1,
      createdBy: 'system',
    },
  })
  console.log('  Created: 智慧網管標準專案')

  // Template 3: 設備採購（空白）
  await prisma.quotationTemplate.upsert({
    where: { id: 'template-equipment-blank' },
    update: {},
    create: {
      id: 'template-equipment-blank',
      name: '設備採購（空白）',
      category: 'EQUIPMENT',
      description: '空白範本，適用於單純設備採購',
      items: [],
      defaultNotes: '出貨後7天內付款',
      paymentTerms: '貨到付款',
      sortOrder: 2,
      createdBy: 'system',
    },
  })
  console.log('  Created: 設備採購（空白）')

  console.log('\nDone! 3 templates seeded.')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
