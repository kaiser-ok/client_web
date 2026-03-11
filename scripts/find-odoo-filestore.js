const { Client } = require('ssh2');

const conn = new Client();

conn.on('ready', () => {
  console.log('SSH Connected');

  // Find Odoo filestore location
  conn.exec('find /home /var /opt -name "filestore" -type d 2>/dev/null | head -10', (err, stream) => {
    if (err) {
      console.error('Exec error:', err);
      conn.end();
      return;
    }

    let output = '';
    stream.on('data', (data) => {
      output += data.toString();
    });

    stream.on('close', () => {
      console.log('Possible filestore locations:');
      console.log(output);

      // Also check odoo config
      conn.exec('cat /etc/odoo/odoo.conf 2>/dev/null || cat /home/*/odoo.conf 2>/dev/null || find /home -name "odoo.conf" 2>/dev/null | head -3', (err, stream2) => {
        if (err) {
          conn.end();
          return;
        }

        let configOutput = '';
        stream2.on('data', (data) => {
          configOutput += data.toString();
        });

        stream2.on('close', () => {
          console.log('\nOdoo config:');
          console.log(configOutput);
          conn.end();
        });
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
