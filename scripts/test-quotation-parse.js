// 測試智能報價單解析

async function testParse() {
  const testCases = [
    '幫台大報 2 台 MikroTik CCR2004，含一年 MA',
    '友訊要 3 套智慧網管系統，大概 50 萬',
    '至興資通的 IPPBX 專案，需要主機 + 50 台話機 + 安裝設定',
    '中華電信 SBC1000 延長保固兩年',
  ]

  console.log('='.repeat(60))
  console.log('智能報價單解析測試')
  console.log('='.repeat(60))

  for (const input of testCases) {
    console.log(`\n輸入: "${input}"`)
    console.log('-'.repeat(40))

    try {
      const response = await fetch('http://localhost:3000/api/quotations/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input })
      })

      if (!response.ok) {
        console.log('錯誤:', response.status)
        continue
      }

      const result = await response.json()

      console.log('客戶:', result.customer.input)
      if (result.customer.matched) {
        console.log(`  → 比對: ${result.customer.matched.name} (${(result.customer.matched.confidence * 100).toFixed(0)}%)`)
      }

      console.log('產品:')
      result.items.forEach((item, i) => {
        console.log(`  ${i + 1}. ${item.input} x ${item.quantity}`)
        if (item.matched) {
          console.log(`     → ${item.matched.name} (${(item.matched.confidence * 100).toFixed(0)}%)`)
        }
        if (item.priceRange) {
          console.log(`     價格: $${item.priceRange.min.toLocaleString()} ~ $${item.priceRange.max.toLocaleString()}`)
        }
      })

      if (result.totalAmount) {
        console.log(`預估總額: $${result.totalAmount.toLocaleString()}`)
      }

    } catch (e) {
      console.log('錯誤:', e.message)
    }
  }
}

testParse()
