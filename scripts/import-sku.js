/**
 * Import SKU data from CSV to product-kb.json
 *
 * Reads storage/sku-data.csv and matches SKU to MikroTik products
 * in storage/product-kb.json using fuzzy matching on Description.
 */

const fs = require('fs');
const path = require('path');

const CSV_PATH = '/opt/client-web/storage/sku-data.csv';
const KB_PATH = '/opt/client-web/storage/product-kb.json';

// Parse CSV and extract SKU entries (skip category headers and empty rows)
function parseCSV() {
  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = content.split('\n');
  const entries = [];

  // Category header SKUs (like HW-MT-RT, HW-MT-ST) — skip these
  const categorySkus = new Set(['HW-MT-RT', 'HW-MT-ST', 'HW-MT-WL', 'HW-MT-AS', 'HW-MT-OT', 'HW-MT-MA']);

  for (const line of lines) {
    // CSV format: empty,empty,SKU,Description,EoL,...
    const cols = line.split(',');
    const sku = (cols[2] || '').trim();
    const description = (cols[3] || '').trim();
    const eol = (cols[4] || '').trim();

    // Skip empty, header, or category rows
    if (!sku || !description || sku === 'SKU' || categorySkus.has(sku)) continue;

    entries.push({ sku, description, eol });
  }

  return entries;
}

// Normalize string for comparison
function normalize(str) {
  return str.toLowerCase().replace(/[\s\-_()（）+]/g, '');
}

// Match CSV description to KB product name
function findBestMatch(description, products) {
  const descNorm = normalize(description);
  let bestMatch = null;
  let bestScore = 0;

  for (const product of products) {
    if (product.category !== 'MikroTik') continue;

    const nameNorm = normalize(product.name);

    // Exact match
    if (nameNorm === descNorm) {
      return { product, score: 100 };
    }

    // One contains the other
    if (nameNorm.includes(descNorm) || descNorm.includes(nameNorm)) {
      const longer = Math.max(nameNorm.length, descNorm.length);
      const shorter = Math.min(nameNorm.length, descNorm.length);
      const score = Math.round((shorter / longer) * 90);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = product;
      }
    }

    // Key model number matching (e.g., CCR2004, CRS326, RB5009)
    // Extract significant model identifiers
    const descTokens = description.split(/[\s\-_()（）+,]+/).filter(t => t.length >= 3);
    const nameTokens = product.name.split(/[\s\-_()（）+,]+/).filter(t => t.length >= 3);

    let tokenMatches = 0;
    for (const dt of descTokens) {
      for (const nt of nameTokens) {
        if (dt.toLowerCase() === nt.toLowerCase()) {
          tokenMatches++;
        }
      }
    }

    if (tokenMatches > 0) {
      const score = Math.round((tokenMatches / Math.max(descTokens.length, 1)) * 70);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = product;
      }
    }
  }

  return bestMatch ? { product: bestMatch, score: bestScore } : null;
}

function main() {
  console.log('=== SKU Import Script ===\n');

  // Load CSV
  const entries = parseCSV();
  console.log(`CSV entries: ${entries.length}`);

  // Load KB
  if (!fs.existsSync(KB_PATH)) {
    console.error('KB file not found:', KB_PATH);
    process.exit(1);
  }

  const kb = JSON.parse(fs.readFileSync(KB_PATH, 'utf-8'));
  const mikroTikProducts = kb.products.filter(p => p.category === 'MikroTik');
  console.log(`MikroTik products in KB: ${mikroTikProducts.length}`);
  console.log('');

  let matched = 0;
  let skipped = 0;
  const unmatched = [];

  for (const entry of entries) {
    const result = findBestMatch(entry.description, kb.products);

    if (result && result.score >= 40) {
      // Find the product in kb.products and update SKU
      const product = kb.products.find(p => p.id === result.product.id);
      if (product) {
        product.sku = entry.sku;
        matched++;
        console.log(`  ✓ ${entry.sku} → ${product.name} (score: ${result.score})`);
      }
    } else {
      unmatched.push(entry);
      skipped++;
    }
  }

  // Save updated KB
  fs.writeFileSync(KB_PATH, JSON.stringify(kb, null, 2), 'utf-8');

  console.log(`\n=== Summary ===`);
  console.log(`Matched: ${matched}`);
  console.log(`Unmatched: ${skipped}`);

  if (unmatched.length > 0) {
    console.log('\nUnmatched entries:');
    unmatched.forEach(e => console.log(`  ✗ ${e.sku}: ${e.description}`));
  }

  console.log(`\nKB saved to: ${KB_PATH}`);
}

main();
