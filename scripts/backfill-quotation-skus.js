/**
 * Backfill SKU into existing QuotationItem records
 *
 * Matches QuotationItem.productId against product-kb.json
 * and fills in the sku field where available.
 *
 * Usage: DATABASE_URL="postgresql://..." node scripts/backfill-quotation-skus.js
 */

const { Pool } = require('pg');
const fs = require('fs');

const KB_PATH = '/opt/client-web/storage/product-kb.json';

async function main() {
  console.log('=== Backfill QuotationItem SKU ===\n');

  // Load KB
  if (!fs.existsSync(KB_PATH)) {
    console.error('KB file not found:', KB_PATH);
    process.exit(1);
  }

  const kb = JSON.parse(fs.readFileSync(KB_PATH, 'utf-8'));

  // Build productId → SKU map
  const skuMap = new Map();
  for (const product of kb.products) {
    if (product.sku && product.id) {
      skuMap.set(product.id, product.sku);
    }
  }
  console.log(`Products with SKU in KB: ${skuMap.size}`);

  // Connect to database
  const dbUrl = process.env.DATABASE_URL || 'postgresql://chunwencheng:chunwencheng@localhost:5432/client_web';
  const pool = new Pool({ connectionString: dbUrl, max: 5 });

  // Find items without SKU that have a productId
  const { rows: items } = await pool.query(
    `SELECT id, "productId" FROM quotation_items WHERE sku IS NULL AND "productId" IS NOT NULL`
  );
  console.log(`QuotationItems without SKU (with productId): ${items.length}`);

  let updated = 0;
  for (const item of items) {
    const sku = skuMap.get(item.productId);
    if (sku) {
      await pool.query(
        `UPDATE quotation_items SET sku = $1 WHERE id = $2`,
        [sku, item.id]
      );
      updated++;
    }
  }

  console.log(`\nUpdated: ${updated} items`);
  console.log('Done.');

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
