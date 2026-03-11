const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const samplesDir = '/opt/client-web/storage/quotation-samples';
const files = fs.readdirSync(samplesDir).filter(f => f.endsWith('.xlsx') || f.endsWith('.xls') || f.endsWith('.xlsm'));

const analysis = {
  totalFiles: files.length,
  issues: {
    missingCustomer: 0,
    missingProject: 0,
    missingSpec: 0,
    inconsistentPricing: 0,
    noProductCode: 0,
    longSpecLines: 0,
    duplicateProducts: new Set(),
  },
  patterns: {
    customers: new Map(),
    products: new Map(),
    priceRanges: new Map(),
  },
  recommendations: []
};

files.forEach((file) => {
  try {
    const filePath = path.join(samplesDir, file);
    const workbook = XLSX.readFile(filePath);

    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      // Check for customer info
      let hasCustomer = false;
      let hasProject = false;

      data.slice(0, 15).forEach((row) => {
        const rowStr = row.join(' ');
        if (rowStr.includes('公司名稱') && row.some(c => String(c).length > 3)) {
          hasCustomer = true;
          const idx = row.findIndex(c => String(c).includes('公司名稱'));
          if (idx !== -1 && row[idx + 1]) {
            const customer = String(row[idx + 1]).trim();
            analysis.patterns.customers.set(customer, (analysis.patterns.customers.get(customer) || 0) + 1);
          }
        }
        if (rowStr.includes('專案') && row.some(c => String(c).length > 3)) {
          hasProject = true;
        }
      });

      if (!hasCustomer) analysis.issues.missingCustomer++;
      if (!hasProject) analysis.issues.missingProject++;

      // Find products and analyze
      let headerRowIdx = -1;
      data.forEach((row, idx) => {
        const rowStr = row.join(' ');
        if (rowStr.includes('項次') && rowStr.includes('產品名稱')) {
          headerRowIdx = idx;
        }
      });

      if (headerRowIdx === -1) return;

      for (let i = headerRowIdx + 1; i < Math.min(headerRowIdx + 30, data.length); i++) {
        const row = data[i];
        if (!row || row.length < 5) continue;

        const productName = String(row[1] || '').trim();
        const spec = String(row[2] || '').trim();

        if (!productName || productName.length < 2) continue;
        if (productName.includes('SUB TOTAL') || productName.includes('小計')) continue;

        // Check for missing specs
        if (!spec || spec.length < 10) {
          analysis.issues.missingSpec++;
        }

        // Check for long specs
        if (spec.length > 500) {
          analysis.issues.longSpecLines++;
        }

        // Track product names for duplicates
        const normalizedName = productName.toLowerCase().replace(/\s+/g, ' ');
        analysis.issues.duplicateProducts.add(normalizedName);

        // Track products and prices
        let price = null;
        for (let j = 3; j < row.length; j++) {
          const val = parseFloat(String(row[j]).replace(/,/g, ''));
          if (!isNaN(val) && val > 100) {
            price = val;
            break;
          }
        }

        if (price) {
          const key = normalizedName.substring(0, 30);
          if (!analysis.patterns.priceRanges.has(key)) {
            analysis.patterns.priceRanges.set(key, []);
          }
          analysis.patterns.priceRanges.get(key).push(price);
        }

        // Check for product codes
        if (!/[A-Z]{2,}[-_]?\d+|SKU|PN:|P\/N/i.test(productName)) {
          analysis.issues.noProductCode++;
        }
      }
    });
  } catch (err) {
    // Skip errors
  }
});

// Find inconsistent pricing
analysis.patterns.priceRanges.forEach((prices, product) => {
  if (prices.length > 1) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (max > min * 1.5) {
      analysis.issues.inconsistentPricing++;
    }
  }
});

console.log('='.repeat(80));
console.log('報價單分析報告 - 改進建議');
console.log('='.repeat(80));

console.log(`\n分析報價單數量: ${analysis.totalFiles}`);

console.log('\n--- 發現的問題 ---\n');

console.log(`1. 缺少客戶名稱: ${analysis.issues.missingCustomer} 份`);
console.log(`2. 缺少專案名稱: ${analysis.issues.missingProject} 份`);
console.log(`3. 產品規格過短或缺失: ${analysis.issues.missingSpec} 次`);
console.log(`4. 產品規格過長(>500字): ${analysis.issues.longSpecLines} 次`);
console.log(`5. 產品名稱無編碼/型號: ${analysis.issues.noProductCode} 次`);
console.log(`6. 同產品價格差異大(>50%): ${analysis.issues.inconsistentPricing} 個`);

console.log('\n--- 常見客戶 (Top 10) ---\n');

const topCustomers = [...analysis.patterns.customers.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

topCustomers.forEach(([customer, count], i) => {
  console.log(`${i + 1}. ${customer} (${count} 份)`);
});

console.log('\n--- 價格變動大的產品 ---\n');

analysis.patterns.priceRanges.forEach((prices, product) => {
  if (prices.length > 1) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (max > min * 1.3) {
      console.log(`• ${product.substring(0, 40)}`);
      console.log(`  範圍: $${min.toLocaleString()} ~ $${max.toLocaleString()} (差異: ${((max/min - 1) * 100).toFixed(0)}%)`);
    }
  }
});

console.log('\n' + '='.repeat(80));
console.log('改進建議');
console.log('='.repeat(80));

const recommendations = [
  '1. 【產品標準化】建立產品主檔，統一產品名稱和編碼',
  '   - 例如: "SBC 1000 系統" 應統一為 "RBN-SBC1000" 或類似編碼',
  '   - 建立產品別名對照表，支援模糊搜尋',
  '',
  '2. 【規格模板化】為常見產品建立規格模板',
  '   - 維護類: 維護期間、服務時間(5x8/7x24)、SLA',
  '   - 硬體類: 規格、保固年限、數量',
  '   - 軟體類: 授權數量、版本、維護期限',
  '',
  '3. 【價格管理】建立價格參考機制',
  '   - 顯示歷史報價範圍',
  '   - 提醒價格異常 (如差異超過 30%)',
  '   - 區分公開價格 vs 專案價格',
  '',
  '4. 【客戶資料自動填入】',
  '   - 連結 Odoo 客戶資料',
  '   - 自動帶入聯絡人、電話、Email',
  '   - 記錄歷史交易紀錄',
  '',
  '5. 【專案型報價模板】',
  '   - IPPBX 專案: 主機 + 話機 + 安裝 + 維護',
  '   - 智慧網管專案: 系統 + 設備 + MA',
  '   - SBC 專案: Gateway + 授權 + 保固',
  '',
  '6. 【智能輸入】業務用自然語言描述即可生成報價草稿',
  '   - 輸入: "幫台大報 2 台 MikroTik CCR2004，含一年 MA"',
  '   - 系統自動: 比對客戶、產品、建議價格、生成報價單',
];

recommendations.forEach(r => console.log(r));
