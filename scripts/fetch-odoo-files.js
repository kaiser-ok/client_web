const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();

const files = [
  { store_fname: 'c1/c13b0dfb1341b711deb5b8f3303f903bea8fab2d', name: '友訊科技_草屯商工_SNM_20251223-01.xlsx' },
  { store_fname: '22/22495ffce48986b3b7ccb518752b12016b32d765', name: '台大計中網路組_報價單_1141201.xlsx' },
  { store_fname: '41/416bca4b5a734584d5a72a8186b2d0f79e2a8810', name: '大同世界_屏科大_115年度維護_報價單_1141218.xlsx' },
  { store_fname: 'b8/b81b1941c717eaa29b78320baca1e4ea5b96446d', name: '至興資通_含HA_IPPBX_20251208-02_7x8.xls' },
  { store_fname: '49/49a87e419a724502708374c056a87171b95d4c6e', name: 'CHT_SBC1000_優洋企業_Teams_MA_20251201-01.xlsx' },
];

const outputDir = '/opt/client-web/storage/quotation-samples';
const odooFilestore = '/opt/odoo/odoo17/filestore/odoo';

conn.on('ready', () => {
  console.log('SSH Connected');

  conn.sftp((err, sftp) => {
    if (err) {
      console.error('SFTP error:', err);
      conn.end();
      return;
    }

    let completed = 0;

    files.forEach((file) => {
      const remotePath = `${odooFilestore}/${file.store_fname}`;
      const localPath = path.join(outputDir, file.name);

      sftp.fastGet(remotePath, localPath, (err) => {
        if (err) {
          console.error(`Failed to download ${file.name}:`, err.message);
        } else {
          console.log(`Downloaded: ${file.name}`);
        }

        completed++;
        if (completed === files.length) {
          console.log('\nAll downloads completed');
          conn.end();
        }
      });
    });
  });
});

conn.on('error', (err) => {
  console.error('SSH Connection error:', err);
});

conn.connect({
  host: '192.168.30.138',
  port: 60022,
  username: 'clientweb',
  password: '80426746'
});
