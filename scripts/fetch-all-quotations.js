const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const odooPool = new Pool({
  host: '192.168.30.138',
  port: 5432,
  database: 'odoo',
  user: 'proj',
  password: 'p20j2ead0n1y',
  max: 5,
});

const outputDir = '/opt/client-web/storage/quotation-samples';
const odooFilestore = '/opt/odoo/odoo17/filestore/odoo';

async function main() {
  // Query 80 Excel attachments from sale.order and crm.lead
  const query = `
    SELECT
      id,
      name,
      store_fname,
      res_model
    FROM ir_attachment
    WHERE (mimetype LIKE '%spreadsheet%' OR mimetype LIKE '%excel%')
      AND res_model IN ('sale.order', 'crm.lead')
      AND name NOT LIKE '%出貨%'
      AND name NOT LIKE '%SN MAC%'
      AND name NOT LIKE '%shipment%'
    ORDER BY create_date DESC
    LIMIT 80
  `;

  const result = await odooPool.query(query);
  console.log(`Found ${result.rows.length} Excel files to download`);

  const conn = new Client();

  conn.on('ready', () => {
    console.log('SSH Connected');

    conn.sftp((err, sftp) => {
      if (err) {
        console.error('SFTP error:', err);
        conn.end();
        odooPool.end();
        return;
      }

      let completed = 0;
      let downloaded = 0;
      let skipped = 0;
      let failed = 0;

      result.rows.forEach((file) => {
        const remotePath = `${odooFilestore}/${file.store_fname}`;
        // Clean filename
        const cleanName = file.name.replace(/[/\\?%*:|"<>]/g, '_');
        const localPath = path.join(outputDir, cleanName);

        // Skip if already exists
        if (fs.existsSync(localPath)) {
          skipped++;
          completed++;
          if (completed === result.rows.length) {
            finish();
          }
          return;
        }

        sftp.fastGet(remotePath, localPath, (err) => {
          if (err) {
            failed++;
            console.error(`Failed: ${cleanName}`);
          } else {
            downloaded++;
            console.log(`Downloaded: ${cleanName}`);
          }

          completed++;
          if (completed === result.rows.length) {
            finish();
          }
        });
      });

      function finish() {
        console.log(`\n--- Summary ---`);
        console.log(`Downloaded: ${downloaded}`);
        console.log(`Skipped (exists): ${skipped}`);
        console.log(`Failed: ${failed}`);
        console.log(`Total: ${completed}`);
        conn.end();
        odooPool.end();
      }
    });
  });

  conn.on('error', (err) => {
    console.error('SSH Connection error:', err);
    odooPool.end();
  });

  conn.connect({
    host: '192.168.30.138',
    port: 60022,
    username: 'clientweb',
    password: '80426746'
  });
}

main().catch(console.error);
