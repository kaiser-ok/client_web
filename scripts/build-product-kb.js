const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const samplesDir = '/opt/client-web/storage/quotation-samples';
const outputFile = '/opt/client-web/storage/product-kb.json';

const odooPool = new Pool({
  host: '192.168.30.138',
  port: 5432,
  database: 'odoo',
  user: 'proj',
  password: 'p20j2ead0n1y',
  max: 5,
});

const localPool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'client_web',
  user: 'chunwencheng',
  password: 'chunwencheng',
  max: 5,
});

async function getOdooProducts() {
  const query = `
    SELECT
      pp.id,
      pt.name->>'zh_TW' as product_name,
      pt.list_price,
      pc.name as category,
      pt.default_code as sku,
      pt.description_sale->>'zh_TW' as description_sale
    FROM product_product pp
    JOIN product_template pt ON pp.product_tmpl_id = pt.id
    LEFT JOIN product_category pc ON pt.categ_id = pc.id
    WHERE pt.active = true AND pt.sale_ok = true
    ORDER BY pt.name->>'zh_TW'
  `;
  const result = await odooPool.query(query);
  return result.rows;
}

async function getLocalCustomers() {
  const query = `
    SELECT
      id,
      name,
      email,
      phone,
      aliases
    FROM partners
    ORDER BY name
  `;
  const result = await localPool.query(query);
  return result.rows;
}

function extractQuotationProducts() {
  const files = fs.readdirSync(samplesDir).filter(f =>
    f.endsWith('.xlsx') || f.endsWith('.xls') || f.endsWith('.xlsm')
  );

  const products = [];

  files.forEach((file) => {
    try {
      const filePath = path.join(samplesDir, file);
      const workbook = XLSX.readFile(filePath);

      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        // Extract customer
        let customer = '';
        let project = '';
        data.slice(0, 15).forEach((row) => {
          const rowStr = row.join(' ');
          if (rowStr.includes('公司名稱')) {
            const idx = row.findIndex(c => String(c).includes('公司名稱'));
            if (idx !== -1 && row[idx + 1]) {
              customer = String(row[idx + 1]).trim();
            }
          }
          if (rowStr.includes('專案') && !rowStr.includes('類別')) {
            const idx = row.findIndex(c => String(c).includes('專案'));
            if (idx !== -1 && row[idx + 1]) {
              project = String(row[idx + 1]).trim();
            }
          }
        });

        // Find header
        let headerRowIdx = -1;
        data.forEach((row, idx) => {
          if (row.join(' ').includes('項次') && row.join(' ').includes('產品名稱')) {
            headerRowIdx = idx;
          }
        });

        if (headerRowIdx === -1) return;

        // Extract products
        for (let i = headerRowIdx + 1; i < Math.min(headerRowIdx + 30, data.length); i++) {
          const row = data[i];
          if (!row || row.length < 5) continue;

          const itemNum = row[0];
          const productName = String(row[1] || '').trim().replace(/\n/g, ' ');
          const spec = String(row[2] || '').trim().replace(/\n/g, ' ');

          if (!productName || productName.length < 2) continue;
          if (/SUB TOTAL|小計|保固條件|付款條件|Remark|註：|未稅|營業稅|含稅/.test(productName)) continue;

          // Find price and quantity
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

          if (priceUnit === null && subtotal === null) continue;

          products.push({
            name: productName,
            spec: spec.substring(0, 300),
            priceUnit,
            quantity,
            subtotal,
            customer,
            project,
            source: file
          });
        }
      });
    } catch (err) {
      // Skip errors
    }
  });

  return products;
}

function buildProductKB(odooProducts, quotationProducts) {
  const kb = {
    products: [],
    aliases: {},
    priceHistory: {},
    categories: new Set(),
  };

  // Add Odoo products
  odooProducts.forEach(p => {
    if (!p.product_name) return;

    kb.products.push({
      id: `odoo-${p.id}`,
      name: p.product_name,
      sku: p.sku || null,
      category: p.category || 'Other',
      listPrice: p.list_price || 0,
      description: p.description_sale ? p.description_sale.trim() : null,  // 銷售描述
      source: 'odoo'
    });

    if (p.category) kb.categories.add(p.category);
  });

  // Merge quotation products
  const productPrices = new Map();

  quotationProducts.forEach(p => {
    const key = p.name.toLowerCase().replace(/\s+/g, ' ').substring(0, 50);

    if (!productPrices.has(key)) {
      productPrices.set(key, {
        name: p.name,
        spec: p.spec,
        prices: [],
        customers: new Set(),
        sources: []
      });
    }

    const entry = productPrices.get(key);
    if (p.priceUnit) entry.prices.push(p.priceUnit);
    if (p.customer) entry.customers.add(p.customer);
    entry.sources.push(p.source);
    if (p.spec && p.spec.length > (entry.spec?.length || 0)) {
      entry.spec = p.spec;
    }
  });

  // Add unique quotation products
  productPrices.forEach((value, key) => {
    // Skip if already in Odoo (fuzzy match)
    const existsInOdoo = kb.products.some(p =>
      p.name.toLowerCase().includes(key.substring(0, 15)) ||
      key.includes(p.name.toLowerCase().substring(0, 15))
    );

    if (!existsInOdoo && value.prices.length > 0) {
      kb.products.push({
        id: `quote-${key.substring(0, 20)}`,
        name: value.name,
        spec: value.spec,
        category: 'From Quotations',
        priceRange: {
          min: Math.min(...value.prices),
          max: Math.max(...value.prices),
          avg: value.prices.reduce((a, b) => a + b, 0) / value.prices.length
        },
        customers: [...value.customers].slice(0, 5),
        source: 'quotation'
      });
    }

    // Store price history
    if (value.prices.length > 0) {
      kb.priceHistory[key] = {
        prices: value.prices,
        min: Math.min(...value.prices),
        max: Math.max(...value.prices),
        avg: Math.round(value.prices.reduce((a, b) => a + b, 0) / value.prices.length)
      };
    }
  });

  kb.categories = [...kb.categories];

  return kb;
}

async function main() {
  console.log('Building Product Knowledge Base...\n');

  // Get Odoo products
  console.log('1. Fetching Odoo products...');
  const odooProducts = await getOdooProducts();
  console.log(`   Found ${odooProducts.length} products in Odoo`);

  // Get local customers (from client-web database)
  console.log('2. Fetching local customers...');
  const localCustomers = await getLocalCustomers();
  console.log(`   Found ${localCustomers.length} customers in local DB`);

  // Extract quotation products
  console.log('3. Extracting products from quotations...');
  const quotationProducts = extractQuotationProducts();
  console.log(`   Found ${quotationProducts.length} product entries`);

  // Build KB
  console.log('4. Building knowledge base...');
  const kb = buildProductKB(odooProducts, quotationProducts);
  kb.customers = localCustomers.map(c => ({
    id: c.id,  // cuid format from local DB
    name: c.name,
    email: c.email,
    phone: c.phone,
    aliases: c.aliases || []
  }));

  // Preserve existing SKU values from previous KB (e.g., imported from CSV)
  try {
    if (fs.existsSync(outputFile)) {
      const existingKB = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
      const skuMap = new Map();
      (existingKB.products || []).forEach(p => {
        if (p.sku) skuMap.set(p.id, p.sku);
      });
      let preserved = 0;
      kb.products.forEach(p => {
        if (!p.sku && skuMap.has(p.id)) {
          p.sku = skuMap.get(p.id);
          preserved++;
        }
      });
      if (preserved > 0) {
        console.log(`   Preserved ${preserved} existing SKU values`);
      }
    }
  } catch (e) {
    console.warn('   Warning: could not preserve existing SKUs:', e.message);
  }

  // Save
  fs.writeFileSync(outputFile, JSON.stringify(kb, null, 2), 'utf-8');

  console.log(`\n--- Knowledge Base Summary ---`);
  console.log(`Products: ${kb.products.length}`);
  console.log(`Categories: ${kb.categories.length}`);
  console.log(`Price History Entries: ${Object.keys(kb.priceHistory).length}`);
  console.log(`Customers: ${kb.customers.length}`);
  console.log(`\nSaved to: ${outputFile}`);

  await odooPool.end();
  await localPool.end();
}

main().catch(console.error);
