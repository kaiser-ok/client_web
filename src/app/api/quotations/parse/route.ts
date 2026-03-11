/**
 * 智能報價單解析 API
 * 接收自然語言輸入，解析客戶、產品、數量、金額
 */

import { NextRequest, NextResponse } from 'next/server'
import { chatCompletion } from '@/lib/llm'
import { prisma } from '@/lib/prisma'
import fs from 'fs'
import path from 'path'

// 產品知識庫路徑 - 使用絕對路徑確保可靠性
const KB_PATH = '/opt/client-web/storage/product-kb.json'

interface ProductKB {
  products: Array<{
    id: string
    name: string
    sku?: string
    category: string
    listPrice?: number
    priceRange?: { min: number; max: number; avg: number }
    spec?: string
    description?: string  // Odoo 銷售描述
    source: string
  }>
  customers: Array<{
    id: string  // cuid format from local DB
    name: string
    email?: string
    phone?: string
    aliases?: string[]
  }>
  priceHistory: Record<string, {
    prices: number[]
    min: number
    max: number
    avg: number
  }>
}

interface ParsedQuotation {
  customer: {
    input: string
    matched?: { id: string; name: string; confidence: number }
    suggestions?: Array<{ id: string; name: string; score: number }>
  }
  project?: string
  items: Array<{
    input: string
    matched?: {
      id: string
      name: string
      category: string
      confidence: number
    }
    suggestions?: Array<{
      id: string
      name: string
      category: string
      score: number
    }>
    quantity: number
    priceUnit?: number
    priceRange?: { min: number; max: number; avg: number }
    spec?: string
    description?: string
    descriptionSuggestions?: string[]  // 歷史說明建議
  }>
  totalAmount?: number
  notes?: string
}

// 從歷史報價單取得產品說明建議
async function getHistoricalDescriptions(productName: string): Promise<string[]> {
  try {
    // 查詢相似產品的歷史說明
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
      take: 50,
    })

    // 統計說明出現次數，取最常用的
    const descCounts = new Map<string, number>()
    for (const item of items) {
      if (item.description && item.description.trim()) {
        const desc = item.description.trim()
        descCounts.set(desc, (descCounts.get(desc) || 0) + 1)
      }
    }

    // 按出現次數排序，取前 5 個
    const sorted = Array.from(descCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([desc]) => desc)

    return sorted
  } catch (e) {
    console.error('Failed to get historical descriptions:', e)
    return []
  }
}

// 載入知識庫
function loadKB(): ProductKB | null {
  try {
    if (fs.existsSync(KB_PATH)) {
      const data = JSON.parse(fs.readFileSync(KB_PATH, 'utf-8'))
      console.log(`[Quotation] KB loaded: ${data.products?.length || 0} products, ${data.customers?.length || 0} customers`)
      return data
    } else {
      console.error(`[Quotation] KB file not found: ${KB_PATH}`)
    }
  } catch (e) {
    console.error('[Quotation] Failed to load product KB:', e)
  }
  return null
}

// 正規化中文異體字（台/臺 等常見差異）
function normalizeChinese(s: string): string {
  return s
    .replace(/臺/g, '台')
    .replace(/衛/g, '卫')  // 保留擴充空間
}

// 計算兩個字串的匹配分數
function scoreString(inputLower: string, target: string): number {
  const targetLower = normalizeChinese(target.toLowerCase().replace(/\s+/g, ''))
  const inputNorm = normalizeChinese(inputLower)
  if (!targetLower) return 0

  // 完全匹配
  if (targetLower === inputNorm) return 100

  // 包含匹配
  if (targetLower.includes(inputNorm) || inputNorm.includes(targetLower)) {
    const longer = Math.max(targetLower.length, inputNorm.length)
    const shorter = Math.min(targetLower.length, inputNorm.length)
    return Math.round((shorter / longer) * 90)
  }

  // 所有輸入字元都按順序出現在目標中（子序列匹配，如「台大」匹配「台灣大學」）
  if (inputNorm.length >= 2 && inputNorm.length < targetLower.length) {
    let ti = 0
    let matchedCount = 0
    for (let ii = 0; ii < inputNorm.length && ti < targetLower.length; ti++) {
      if (targetLower[ti] === inputNorm[ii]) {
        matchedCount++
        ii++
      }
    }
    if (matchedCount === inputNorm.length) {
      // 分數根據輸入長度佔目標長度的比例
      return Math.max(55, Math.round((inputNorm.length / targetLower.length) * 85))
    }
  }

  // 部分匹配（前幾個字）
  const inputChars = inputNorm.substring(0, 4)
  if (inputChars.length >= 2 && targetLower.includes(inputChars)) {
    return 50
  }

  return 0
}

// 模糊比對客戶（含別名）
function matchCustomer(
  input: string,
  customers: ProductKB['customers']
): { matched?: { id: string; name: string; confidence: number }; suggestions: Array<{ id: string; name: string; score: number }> } {
  const inputLower = input.toLowerCase().replace(/\s+/g, '')

  const scored = customers.map(c => {
    // 比對主名稱
    let bestScore = scoreString(inputLower, c.name)

    // 比對所有別名，取最高分
    if (c.aliases && c.aliases.length > 0) {
      for (const alias of c.aliases) {
        const aliasScore = scoreString(inputLower, alias)
        if (aliasScore > bestScore) {
          bestScore = aliasScore
        }
      }
    }

    return { ...c, score: bestScore }
  })

  const sorted = scored.filter(c => c.score > 0).sort((a, b) => b.score - a.score)

  if (sorted.length > 0 && sorted[0].score >= 70) {
    return {
      matched: { id: sorted[0].id, name: sorted[0].name, confidence: sorted[0].score / 100 },
      suggestions: sorted.slice(1, 4).map(c => ({ id: c.id, name: c.name, score: c.score }))
    }
  }

  return {
    suggestions: sorted.slice(0, 5).map(c => ({ id: c.id, name: c.name, score: c.score }))
  }
}

// 模糊比對產品
function matchProduct(
  input: string,
  products: ProductKB['products'],
  priceHistory: ProductKB['priceHistory']
): {
  matched?: { id: string; name: string; sku?: string; category: string; confidence: number }
  suggestions: Array<{ id: string; name: string; sku?: string; category: string; score: number }>
  priceRange?: { min: number; max: number; avg: number }
  spec?: string
  productDescription?: string  // Odoo 銷售描述
} {
  const inputLower = input.toLowerCase()
  const inputCompact = inputLower.replace(/\s+/g, '')

  const scored = products.map(p => {
    const nameLower = p.name.toLowerCase()
    const nameCompact = nameLower.replace(/\s+/g, '')

    // 完全匹配
    if (nameCompact === inputCompact) {
      return { ...p, score: 100 }
    }

    // SKU 匹配
    if (p.sku && p.sku.toLowerCase() === inputCompact) {
      return { ...p, score: 95 }
    }

    // 包含匹配（去空格版本）
    if (nameCompact.includes(inputCompact) || inputCompact.includes(nameCompact)) {
      const longer = Math.max(nameCompact.length, inputCompact.length)
      const shorter = Math.min(nameCompact.length, inputCompact.length)
      return { ...p, score: Math.round((shorter / longer) * 85) }
    }

    // 關鍵字匹配（保留空格以正確分割）
    const inputKeywords = inputLower.split(/[-_\s]+/).filter(k => k.length >= 2)
    const nameKeywords = nameLower.split(/[-_\s]+/).filter(k => k.length >= 2)

    if (inputKeywords.length > 0) {
      // 優先：詞級完全匹配（"ip" 匹配 "ip" 而非 "iphone" 中的子字串）
      const exactWordMatches = inputKeywords.filter(k =>
        nameKeywords.some(nk => nk === k)
      ).length
      if (exactWordMatches === inputKeywords.length) {
        return { ...p, score: Math.round((exactWordMatches / Math.max(inputKeywords.length, nameKeywords.length)) * 75) }
      }
      if (exactWordMatches > 0) {
        return { ...p, score: Math.round((exactWordMatches / inputKeywords.length) * 60) }
      }

      // 次選：子字串匹配（降低分數，避免 "phone" 匹配到 "iphone"）
      const substringMatches = inputKeywords.filter(k =>
        nameKeywords.some(nk => nk.includes(k) || k.includes(nk))
      ).length
      if (substringMatches > 0) {
        return { ...p, score: Math.round((substringMatches / inputKeywords.length) * 40) }
      }
    }

    return { ...p, score: 0 }
  })

  const sorted = scored.filter(p => p.score > 0).sort((a, b) => b.score - a.score)

  // 查找價格歷史
  const findPriceRange = (name: string) => {
    const key = name.toLowerCase().replace(/\s+/g, ' ').substring(0, 50)
    for (const [k, v] of Object.entries(priceHistory)) {
      if (k.includes(key.substring(0, 15)) || key.includes(k.substring(0, 15))) {
        return v
      }
    }
    return undefined
  }

  if (sorted.length > 0 && sorted[0].score >= 60) {
    const top = sorted[0]
    return {
      matched: { id: top.id, name: top.name, sku: top.sku || undefined, category: top.category, confidence: top.score / 100 },
      suggestions: sorted.slice(1, 4).map(p => ({ id: p.id, name: p.name, sku: p.sku || undefined, category: p.category, score: p.score })),
      priceRange: top.priceRange || findPriceRange(top.name),
      spec: top.spec,
      productDescription: top.description,  // Odoo 銷售描述
    }
  }

  return {
    suggestions: sorted.slice(0, 5).map(p => ({ id: p.id, name: p.name, sku: p.sku || undefined, category: p.category, score: p.score })),
    priceRange: sorted.length > 0 ? findPriceRange(sorted[0].name) : undefined,
    productDescription: sorted.length > 0 ? sorted[0].description : undefined,
  }
}

// 使用 LLM 解析輸入
async function parseWithLLM(input: string, products: ProductKB['products'], customers: ProductKB['customers']): Promise<{
  customer: string
  project?: string
  items: Array<{ name: string; quantity: number; price?: number; description?: string }>
  notes?: string
}> {
  // 產品範例（取前 50 個）
  const productExamples = products
    .slice(0, 50)
    .map(p => p.name)
    .join('、')

  // 客戶範例（取前 20 個）
  const customerExamples = customers
    .slice(0, 20)
    .map(c => c.name)
    .join('、')

  const systemPrompt = `你是一個專業的報價單助理。請從業務的描述中提取報價資訊。
回覆必須是有效的 JSON 格式。

重要規則：
- 數字金額（如「2000」「一台3500」「單價500」「每個1200」）是**單價 price**，不是產品名稱
- 中文數字（如「兩台」「三支」「五個」）是**數量 quantity**
- 產品名稱是實際的產品型號或品類名（如「IP-Phone」「交換機」「AP」）
- price 欄位只填數字，不要包含「元」「塊」等文字`

  const userPrompt = `請分析以下業務描述，提取報價資訊：

"${input}"

## 參考產品（僅供參考，不一定要完全匹配）
${productExamples}...

## 參考客戶（僅供參考，不一定要完全匹配）
${customerExamples}...

## 解析範例
輸入："台大要兩台IP-Phone, 一台2000"
→ customer: "台大", items: [{"name": "IP-Phone", "quantity": 2, "price": 2000}]

輸入："中研院 AP-305 x3 單價4500, 交換機一台35000"
→ customer: "中研院", items: [{"name": "AP-305", "quantity": 3, "price": 4500}, {"name": "交換機", "quantity": 1, "price": 35000}]

輸入："台積電需要10條Cat6網路線"
→ customer: "台積電", items: [{"name": "Cat6網路線", "quantity": 10, "price": null}]

## 提取欄位
1. customer: 客戶名稱（可能是簡稱）
2. project: 專案名稱（如有提及，否則 null）
3. items: 產品明細陣列，每個產品包含：
   - name: 產品名稱（不含數量和價格）
   - quantity: 數量（預設 1）
   - price: 單價數字（如有提及金額，注意：「一台2000」表示單價 2000）
   - description: 補充說明（如有）
4. notes: 其他備註

回覆 JSON 格式：
{
  "customer": "客戶名稱",
  "project": null,
  "items": [
    {"name": "產品名稱", "quantity": 1, "price": null, "description": null}
  ],
  "notes": null
}

只回覆 JSON，不要其他文字。`

  try {
    const response = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], {
      maxTokens: 1500,
      temperature: 0.2,
    })

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch (e) {
    console.error('LLM parse error:', e)
  }

  // 失敗時返回基本結構
  return {
    customer: input.split(/[,，\s]/)[0] || '未知客戶',
    items: [{ name: input, quantity: 1 }]
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { input, customerId, customerName } = body

    if (!input || typeof input !== 'string') {
      return NextResponse.json({ error: '請提供報價描述' }, { status: 400 })
    }

    // 載入知識庫
    const kb = loadKB()
    if (!kb) {
      console.error('[Quotation] KB load failed, returning error')
      return NextResponse.json({ error: '產品知識庫未載入' }, { status: 500 })
    }

    console.log(`[Quotation] Processing input: "${input.substring(0, 50)}..."`)
    if (customerName) {
      console.log(`[Quotation] Pre-filled customer: ${customerName} (${customerId})`)
    }

    // 如果已有客戶資訊，加入輸入中以幫助 LLM 理解
    const enhancedInput = customerName
      ? `客戶：${customerName}\n${input}`
      : input

    // 使用 LLM 解析
    let parsed
    try {
      parsed = await parseWithLLM(enhancedInput, kb.products, kb.customers)
      console.log('[Quotation] LLM parsed:', JSON.stringify(parsed).substring(0, 200))
    } catch (llmError) {
      console.error('[Quotation] LLM failed, using fallback:', llmError)
      // LLM 失敗時使用簡單解析
      parsed = {
        customer: customerName || input.split(/[,，\s]/)[0] || '未知客戶',
        items: [{ name: input, quantity: 1 }]
      }
    }

    // 如果有預填客戶，優先使用
    let customerMatch
    if (customerId && customerName) {
      // 從 KB 中找到該客戶或直接使用預填資訊
      const existingCustomer = kb.customers.find(c => c.id === customerId)
      customerMatch = {
        matched: {
          id: existingCustomer?.id || customerId,
          name: existingCustomer?.name || customerName,
          confidence: 1
        },
        suggestions: []
      }
    } else {
      // 比對客戶
      customerMatch = matchCustomer(parsed.customer, kb.customers)
    }

    // 比對產品並取得歷史說明
    const itemsWithMatch = await Promise.all(parsed.items.map(async item => {
      const productMatch = matchProduct(item.name, kb.products, kb.priceHistory)
      // item 可能來自 LLM (有 price) 或 fallback (沒有 price)
      const itemPrice = 'price' in item ? item.price : undefined

      // 取得歷史說明建議
      const productName = productMatch.matched?.name || item.name
      const historicalDescriptions = await getHistoricalDescriptions(productName)

      // 合併 Odoo 產品描述 + 歷史描述（Odoo 描述優先）
      const descriptionSuggestions: string[] = []
      if (productMatch.productDescription) {
        descriptionSuggestions.push(productMatch.productDescription)
      }
      historicalDescriptions.forEach(d => {
        if (!descriptionSuggestions.includes(d)) {
          descriptionSuggestions.push(d)
        }
      })

      return {
        input: item.name,
        matched: productMatch.matched,
        suggestions: productMatch.suggestions,
        quantity: item.quantity || 1,
        priceUnit: itemPrice || productMatch.priceRange?.avg,
        priceRange: productMatch.priceRange,
        spec: productMatch.spec,
        description: 'description' in item ? item.description : undefined,
        descriptionSuggestions: descriptionSuggestions.slice(0, 5),  // 最多 5 個建議
      }
    }))

    // 計算總金額
    const totalAmount = itemsWithMatch.reduce((sum, item) => {
      const price = item.priceUnit || item.priceRange?.avg || 0
      return sum + price * item.quantity
    }, 0)

    const result: ParsedQuotation = {
      customer: {
        input: parsed.customer,
        matched: customerMatch.matched,
        suggestions: customerMatch.suggestions
      },
      project: parsed.project,
      items: itemsWithMatch,
      totalAmount,
      notes: parsed.notes
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('Parse quotation error:', error)
    return NextResponse.json(
      { error: '解析失敗' },
      { status: 500 }
    )
  }
}

// 取得產品建議（用於自動完成）
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')
  const type = searchParams.get('type') || 'product' // product or customer

  const kb = loadKB()
  if (!kb) {
    return NextResponse.json({ suggestions: [] })
  }

  // 客戶：無 query 時回傳全部客戶列表
  if (type === 'customer') {
    if (!query) {
      return NextResponse.json({
        suggestions: kb.customers.map(c => ({ id: c.id, name: c.name, score: 0 }))
      })
    }
    const result = matchCustomer(query, kb.customers)
    return NextResponse.json({
      suggestions: result.matched
        ? [{ id: result.matched.id, name: result.matched.name, score: result.matched.confidence * 100 }, ...result.suggestions]
        : result.suggestions
    })
  }

  if (!query) {
    return NextResponse.json({ suggestions: [] })
  }

  // 產品建議
  const result = matchProduct(query, kb.products, kb.priceHistory)
  return NextResponse.json({
    suggestions: result.matched
      ? [{ ...result.matched, score: result.matched.confidence * 100 }, ...result.suggestions]
      : result.suggestions,
    priceRange: result.priceRange
  })
}
