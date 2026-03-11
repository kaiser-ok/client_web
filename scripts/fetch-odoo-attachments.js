const xmlrpc = require('xmlrpc');
const fs = require('fs');
const path = require('path');

const url = '192.168.30.138';
const port = 8069;
const db = 'odoo';
const username = 'clientweb';
const password = '80426746';

const outputDir = '/opt/client-web/storage/quotation-samples';

// Attachment IDs to download (from ir_attachment query)
const attachments = [
  { id: 5464, name: '友訊科技_草屯商工_SNM_20251223-01.xlsx' },
  { id: 5261, name: '台大計中網路組_報價單_1141201.xlsx' },
  { id: 5428, name: '大同世界_屏科大_115年度維護_報價單_1141218.xlsx' },
  { id: 5384, name: '至興資通_含HA_IPPBX_20251208-02_7x8.xls' },
  { id: 5265, name: 'CHT_SBC1000_優洋企業_Teams_MA_20251201-01.xlsx' },
];

const commonClient = xmlrpc.createClient({ host: url, port, path: '/xmlrpc/2/common' });
const objectClient = xmlrpc.createClient({ host: url, port, path: '/xmlrpc/2/object' });

// Authenticate
commonClient.methodCall('authenticate', [db, username, password, {}], (err, uid) => {
  if (err) {
    console.error('Authentication error:', err);
    return;
  }

  if (!uid) {
    console.error('Authentication failed - invalid credentials');
    return;
  }

  console.log('Authenticated, UID:', uid);

  // Download each attachment
  let completed = 0;

  attachments.forEach((attachment) => {
    objectClient.methodCall(
      'execute_kw',
      [
        db,
        uid,
        password,
        'ir.attachment',
        'read',
        [[attachment.id]],
        { fields: ['name', 'datas'] }
      ],
      (err, result) => {
        if (err) {
          console.error(`Error reading attachment ${attachment.id}:`, err.message);
        } else if (result && result[0] && result[0].datas) {
          const buffer = Buffer.from(result[0].datas, 'base64');
          const filePath = path.join(outputDir, attachment.name);
          fs.writeFileSync(filePath, buffer);
          console.log(`Downloaded: ${attachment.name} (${buffer.length} bytes)`);
        } else {
          console.error(`No data for attachment ${attachment.id}`);
        }

        completed++;
        if (completed === attachments.length) {
          console.log('\nAll downloads completed');
        }
      }
    );
  });
});
