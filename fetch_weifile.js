const { chromium } = require('playwright');
const https = require('https');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const TARGET = 'https://yjriz.nzctjvr.com/2VHkkYFEvf/vxwmS1ivH7eZWQKy';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

fs.mkdirSync('output', { recursive: true });

function aesDec(encB64, nonce) {
  const key32 = crypto.createHash('md5').update(nonce + '@&!36SECRET').digest('hex');
  const key = Buffer.from(key32.slice(0, 16));
  const iv  = Buffer.from(key32.slice(16, 32));
  const ct  = Buffer.from(encB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  decipher.setAutoPadding(true);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(dec.toString());
}

function dlFile(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    proto.get(url, { headers: { 'User-Agent': UA } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return dlFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: UA, locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
    viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true
  });

  const captured = {};

  ctx.on('request', req => {
    const url = req.url();
    const hdrs = req.headers();
    if (url.includes('/api/') || url.includes('/ipa/')) {
      const nonce = hdrs['x-resp-enc'] || hdrs['x-req-enc'] || '';
      if (nonce) captured['req_' + url.split('/').pop().split('?')[0]] = nonce;
      console.log('[REQ]', req.method(), url.slice(0, 100), '| nonce:', nonce.slice(0,20));
    }
  });

  ctx.on('response', async res => {
    const url = res.url();
    const status = res.status();
    const hdrs = res.headers();
    const nonce = hdrs['x-resp-enc'] || '';

    if (url.includes('/api/') || url.includes('/ipa/')) {
      console.log('[RES]', status, url.slice(0, 100), '| nonce:', nonce.slice(0,20));
      try {
        const body = await res.text();
        const k = url.includes('getPlistPath') ? 'getPlistPath' :
                  url.includes('download_app_info') ? 'download_app_info' :
                  url.split('/').pop().split('?')[0];
        captured[k] = { url, nonce, body, status };
        console.log('  body:', body.slice(0, 100));
        fs.writeFileSync('output/cap_' + k + '.txt', JSON.stringify({ url, nonce, body }, null, 2));
      } catch(e) {}
    }

    if (status === 200 && (url.includes('.plist') || url.includes('/plist'))) {
      const b = await res.body().catch(() => null);
      if (b && b.length > 100) {
        fs.writeFileSync('output/manifest.plist', b);
        console.log('[PLIST]', b.length, 'B', url);
        captured['plistUrl'] = url;
      }
    }
  });

  const page = await ctx.newPage();
  try {
    await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(8000);
    console.log('[URL]', page.url());
  } catch(e) { console.log('[NAV]', e.message.slice(0, 80)); }

  let plistUrl = null;
  for (const [k, v] of Object.entries(captured)) {
    if (v && v.nonce && v.body && v.body.length > 20) {
      try {
        const dec = aesDec(v.body, v.nonce);
        console.log('[DEC]', k, JSON.stringify(dec).slice(0, 200));
        fs.writeFileSync('output/dec_' + k + '.json', JSON.stringify(dec, null, 2));
        if (dec.plistFullPath) { plistUrl = decodeURIComponent(dec.plistFullPath); console.log('[PLIST URL]', plistUrl); }
        if (dec.download_url) { captured['downloadUrl'] = dec.download_url; }
      } catch(e) { console.log('[DEC ERR]', k, e.message.slice(0,50)); }
    }
  }

  if (fs.existsSync('output/manifest.plist')) {
    const pc = fs.readFileSync('output/manifest.plist', 'utf8');
    const m = pc.match(/<key>url<\/key>\s*<string>([^<]+)<\/string>/);
    if (m) { fs.writeFileSync('output/ipa_url.txt', m[1]); console.log('[IPA URL]', m[1]); }
  } else if (plistUrl) {
    await dlFile(plistUrl, 'output/manifest.plist').catch(e => console.log('[DL PLIST ERR]', e.message));
    if (fs.existsSync('output/manifest.plist')) {
      const pc = fs.readFileSync('output/manifest.plist', 'utf8');
      const m = pc.match(/<key>url<\/key>\s*<string>([^<]+)<\/string>/);
      if (m) { fs.writeFileSync('output/ipa_url.txt', m[1]); console.log('[IPA URL]', m[1]); }
    }
  }

  fs.writeFileSync('output/captured.json', JSON.stringify(captured, null, 2));
  fs.writeFileSync('output/result.json', JSON.stringify({ done: true, keys: Object.keys(captured) }));
  console.log('Done, keys:', Object.keys(captured).join(', '));
  await browser.close();
})().catch(e => { console.log('[FATAL]', e.message); fs.writeFileSync('output/error.txt', e.message); fs.writeFileSync('output/result.json', '{}'); });
