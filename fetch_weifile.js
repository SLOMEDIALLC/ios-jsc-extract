const https = require('https');
const dns = require('dns');

const HOST = 'tt.axdqx.shop';

(async () => {
  console.log('=== DNS ===');
  try {
    const addrs = await dns.promises.resolve4(HOST);
    console.log('A records:', addrs);
  } catch(e) { console.log('DNS error:', e.message); }

  console.log('\n=== HTTPS GET /rce_loader.js ===');
  const req = https.get({
    host: HOST,
    path: '/rce_loader.js',
    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1' },
    timeout: 15000
  }, res => {
    let len = 0;
    res.on('data', c => len += c.length);
    res.on('end', () => {
      console.log(`status: ${res.statusCode}`);
      console.log(`size: ${len}B`);
      console.log(`headers:`, JSON.stringify(res.headers));
    });
  });
  req.on('timeout', () => { console.log('TIMEOUT'); req.destroy(); });
  req.on('error', e => console.log('ERROR:', e.code, e.message));
})();
