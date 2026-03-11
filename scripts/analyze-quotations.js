const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const samplesDir = '/opt/client-web/storage/quotation-samples';

const files = fs.readdirSync(samplesDir).filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'));

files.forEach((file) => {
  console.log('\n' + '='.repeat(80));
  console.log(`File: ${file}`);
  console.log('='.repeat(80));

  const filePath = path.join(samplesDir, file);
  const workbook = XLSX.readFile(filePath);

  workbook.SheetNames.forEach((sheetName) => {
    console.log(`\n--- Sheet: ${sheetName} ---`);

    const worksheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');

    console.log(`Range: ${worksheet['!ref']}`);
    console.log(`Rows: ${range.e.r - range.s.r + 1}, Cols: ${range.e.c - range.s.c + 1}`);

    // Convert to JSON to see structure
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    // Show first 25 rows
    console.log('\nFirst 25 rows:');
    data.slice(0, 25).forEach((row, idx) => {
      const rowStr = row.map(cell => {
        if (cell === null || cell === undefined || cell === '') return '';
        const s = String(cell).trim();
        return s.length > 30 ? s.substring(0, 30) + '...' : s;
      }).join(' | ');
      if (rowStr.replace(/\|/g, '').trim()) {
        console.log(`[${idx + 1}] ${rowStr}`);
      }
    });

    // Find potential product rows (rows with numbers that look like prices)
    console.log('\n--- Potential product rows (with prices) ---');
    data.forEach((row, idx) => {
      const hasPrice = row.some(cell => {
        const num = parseFloat(String(cell).replace(/,/g, ''));
        return !isNaN(num) && num >= 1000 && num <= 10000000;
      });

      const hasProductName = row.some(cell => {
        const s = String(cell);
        return s.length > 5 && /[\u4e00-\u9fff]|[A-Z]{2,}/.test(s);
      });

      if (hasPrice && hasProductName && idx > 3) {
        console.log(`[${idx + 1}] ${row.map(c => String(c || '').substring(0, 20)).join(' | ')}`);
      }
    });
  });
});

console.log('\n\n' + '='.repeat(80));
console.log('ANALYSIS COMPLETE');
console.log('='.repeat(80));
