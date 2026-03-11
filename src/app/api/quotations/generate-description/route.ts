/**
 * AI 生成產品說明 API
 */

import { NextRequest, NextResponse } from 'next/server'
import { chatCompletion } from '@/lib/llm'
import { prisma } from '@/lib/prisma'
import fs from 'fs'

const KB_PATH = '/opt/client-web/storage/product-kb.json'

interface Product {
  id: string
  name: string
  category: string
  description?: string | null
}

interface ProductKB {
  products: Product[]
}

// 載入知識庫
function loadKB(): ProductKB | null {
  try {
    if (fs.existsSync(KB_PATH)) {
      return JSON.parse(fs.readFileSync(KB_PATH, 'utf-8'))
    }
  } catch (e) {
    console.error('Failed to load KB:', e)
  }
  return null
}

// 取得歷史說明
async function getHistoricalDescriptions(productName: string): Promise<string[]> {
  try {
    const items = await prisma.quotationItem.findMany({
      where: {
        productName: {
          contains: productName.substring(0, 10),
          mode: 'insensitive',
        },
        description: {
          not: null,
        },
      },
      select: {
        description: true,
      },
      orderBy: {
        quotation: {
          createdAt: 'desc',
        },
      },
      take: 10,
    })

    return items
      .map(item => item.description)
      .filter((desc): desc is string => !!desc && desc.trim() !== '')
  } catch (e) {
    console.error('Failed to get historical descriptions:', e)
    return []
  }
}

export async function POST(request: NextRequest) {
  try {
    const { productName, category, quantity } = await request.json()

    if (!productName) {
      return NextResponse.json({ error: '缺少產品名稱' }, { status: 400 })
    }

    // 從知識庫取得產品資訊
    const kb = loadKB()
    const product = kb?.products.find(p =>
      p.name.toLowerCase().includes(productName.toLowerCase()) ||
      productName.toLowerCase().includes(p.name.toLowerCase())
    )

    // 取得歷史說明作為參考
    const historicalDescriptions = await getHistoricalDescriptions(productName)

    const systemPrompt = `你是一個專業的產品報價助理，擅長撰寫簡潔清晰的產品說明。
請用繁體中文回答，說明要簡短（15-40字），專業且具體。`

    const userPrompt = `請為以下產品撰寫一段簡短的報價單說明：

產品名稱：${productName}
${category ? `產品分類：${category}` : ''}
${quantity ? `數量：${quantity}` : ''}
${product?.description ? `原廠描述：${product.description}` : ''}
${historicalDescriptions.length > 0 ? `歷史說明參考：\n${historicalDescriptions.slice(0, 3).map((d, i) => `${i + 1}. ${d}`).join('\n')}` : ''}

要求：
1. 說明要簡短精準（15-40字）
2. 著重產品特色或規格
3. 適合放在報價單上
4. 不要重複產品名稱

只回覆說明文字，不要加引號或其他格式。`

    const description = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], {
      maxTokens: 200,
      temperature: 0.5,
    })

    return NextResponse.json({
      description: description.trim(),
      source: 'ai',
    })
  } catch (error) {
    console.error('Failed to generate description:', error)
    return NextResponse.json(
      { error: '生成說明失敗' },
      { status: 500 }
    )
  }
}
