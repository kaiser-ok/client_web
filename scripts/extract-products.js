const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const samplesDir = '/opt/client-web/storage/quotation-samples';
const outputFile = '/opt/client-web/storage/product-knowledge.json';

const files = fs.readdirSync(samplesDir).filter(f => f.endsWith('.xlsx') || f.endsWith('.xls') || f.endsWith('.xlsm'));

const allProducts = [];
const productMap = new Map(); // For deduplication

files.forEach((file) => {
  try {
    const filePath = path.join(samplesDir, file);
    const workbook = XLSX.readFile(filePath);

    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      // Extract customer info (usually row 5)
      let customerName = '';
      let projectName = '';

      data.slice(0, 15).forEach((row) => {
        const rowStr = row.join(' ');
        if (rowStr.includes('公 司 名 稱') || rowStr.includes('公司名稱')) {
          const idx = row.findIndex(c => String(c).includes('公 司 名 稱') || String(c).includes('公司名稱'));
          if (idx !== -1 && row[idx + 1]) {
            customerName = String(row[idx + 1]).trim();
          }
        }
        if (rowStr.includes('專案') && !rowStr.includes('專案類別')) {
          const idx = row.findIndex(c => String(c).includes('專案'));
          if (idx !== -1 && row[idx + 1]) {
            projectName = String(row[idx + 1]).trim();
          }
        }
      });

      // Find header row (項次, 產品名稱, ...)
      let headerRowIdx = -1;
      data.forEach((row, idx) => {
        const rowStr = row.join(' ');
        if (rowStr.includes('項次') && rowStr.includes('產品名稱')) {
          headerRowIdx = idx;
        }
      });

      if (headerRowIdx === -1) return;

      // Parse product rows
      for (let i = headerRowIdx + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length < 5) continue;

        // Check if this is a product row (has item number or product name)
        const itemNum = row[0];
        const productName = String(row[1] || '').trim().replace(/\n/g, ' ');
        const spec = String(row[2] || '').trim().replace(/\n/g, ' ');

        // Find price columns
        let priceUnit = null;
        let quantity = null;
        let subtotal = null;

        for (let j = 3; j < row.length; j++) {
          const val = parseFloat(String(row[j]).replace(/,/g, ''));
          if (!isNaN(val) && val > 0) {
            if (priceUnit === null) priceUnit = val;
            else if (quantity === null) quantity = val;
            else if (subtotal === null) subtotal = val;
          }
        }

        // Skip if no valid product info
        if (!productName || productName.length < 2) continue;
        if (productName.includes('SUB TOTAL') || productName.includes('小計')) continue;
        if (productName.includes('保固條件') || productName.includes('付款條件')) continue;
        if (productName.includes('Remark') || productName.includes('註：')) continue;

        // Only include rows with prices
        if (priceUnit === null && subtotal === null) continue;

        const product = {
          name: productName,
          spec: spec.substring(0, 200),
          priceUnit: priceUnit,
          quantity: quantity,
          subtotal: subtotal,
          source: file,
          customer: customerName,
          project: projectName
        };

        // Deduplicate by product name
        const key = productName.toLowerCase().replace(/\s+/g, '');
        if (!productMap.has(key)) {
          productMap.set(key, product);
          allProducts.push(product);
        } else {
          // Update with more info if available
          const existing = productMap.get(key);
          if (!existing.spec && product.spec) {
            existing.spec = product.spec;
          }
          if (product.priceUnit && (!existing.priceUnit || product.priceUnit > existing.priceUnit)) {
            existing.priceUnit = product.priceUnit;
          }
        }
      }
    });
  } catch (err) {
    console.error(`Error processing ${file}:`, err.message);
  }
});

// Sort by product name
allProducts.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));

// Save to JSON
fs.writeFileSync(outputFile, JSON.stringify(allProducts, null, 2), 'utf-8');

console.log(`\nExtracted ${allProducts.length} unique products from ${files.length} files`);
console.log(`Saved to: ${outputFile}`);

// Show sample
console.log('\n--- Sample Products ---');
allProducts.slice(0, 20).forEach((p, i) => {
  console.log(`${i + 1}. ${p.name}`);
  if (p.spec) console.log(`   規格: ${p.spec.substring(0, 60)}...`);
  if (p.priceUnit) console.log(`   單價: $${p.priceUnit.toLocaleString()}`);
  console.log(`   來源: ${p.customer || p.source}`);
});
