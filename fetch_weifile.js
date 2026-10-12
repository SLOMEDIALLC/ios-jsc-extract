const https = require('https');
const fs = require('fs');

const BASE = 'https://tt.axdqx.shop';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';

function get(path) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'tt.axdqx.shop',
      path: path,
      method: 'GET',
      headers: { 'User-Agent': UA },
      timeout: 8000,
      rejectUnauthorized: false
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data, size: data.length }));
    });
    req.on('error', () => resolve({ status: 0, body: '', size: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', size: 0 }); });
    req.end();
  });
}

async function main() {
  const found = [];
  const majors = [13, 14, 15, 16, 17, 18, 19, 26, 27];
  const minors = [0,1,2,3,4,5,6,7,8,9];
  const patches = ['', '_1', '_2', '_3', '_4', '_5', '_6', '_7', '_8'];

  for (const major of majors) {
    for (const minor of minors) {
      for (const patch of patches) {
        const fname = `ios_${major}_${minor}${patch}.json`;
        const r = await get(`/profiles/${fname}`);
        if (r.status === 200 && r.size > 50 && r.body.startsWith('{')) {
          console.log(`FOUND ${fname} ${r.size}B`);
          found.push({ fname, size: r.size });
        }
      }
    }
  }

  console.log(`\nTotal: ${found.length}`);
  fs.writeFileSync('output/profiles_found.json', JSON.stringify(found, null, 2));
}

fs.mkdirSync('output', { recursive: true });
main();
