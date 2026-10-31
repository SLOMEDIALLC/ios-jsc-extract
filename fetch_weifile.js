const { webkit } = require('playwright');
const fs = require('fs');

const BASE = 'https://i.131422.com';
const URL  = BASE + '/go/998ca563';

const UAS = {
  'ios15': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  'ios16': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1',
  'ios17': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'ios18_5': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  'ios18_6': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  'ios18_7': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1',
};

fs.mkdirSync('output', { recursive: true });
const manifest = {};

async function runUA(label, ua) {
  console.log(`\n########## UA ${label} ##########`);
  manifest[label] = { requests: [], files: {} };
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: ua, locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
    viewport: { width: 390, height: 844 }
  });

  const seen = new Set();
  ctx.on('response', async res => {
    const url = res.url();
    const status = res.status();
    if (!url.startsWith('http')) return;
    const fname = url.split('/').pop().split('?')[0];
    const key = status + ' ' + url;
    if (!seen.has(key)) {
      seen.add(key);
      let size = 0;
      try { size = (await res.body()).length; } catch(e) {}
      manifest[label].requests.push({ status, url, size });
      console.log(`  ${status} ${size}B  ${url.replace(BASE,'')}`);
    }
    // 保存所有 js / json
    if (status === 200 && /\.(js|json)$/.test(fname) && !url.includes('recaptcha') && !url.includes('qrcode')) {
      try {
        const body = await res.body();
        if (body.length > 20) {
          const dir = 'output/' + label;
          fs.mkdirSync(dir, { recursive: true });
          if (!fs.existsSync(dir + '/' + fname)) {
            fs.writeFileSync(dir + '/' + fname, body);
            manifest[label].files[fname] = body.length;
            console.log(`  [SAVED] ${label}/${fname} ${body.length}B`);
          }
        }
      } catch(e) {}
    }
  });

  // 额外：拦截 XHR 内容（Worker 内的请求 response 事件也能抓到）
  const page = await ctx.newPage();
  page.on('console', msg => {
    const t = msg.text();
    if (/getjs|getJS|load|module|error/i.test(t) && t.length < 300) {
      console.log(`  [PAGE] ${t}`);
    }
  });

  try {
    await page.goto(URL, { waitUntil: 'load', timeout: 25000 });
    console.log('  [*] loaded, waiting 45s for chain...');
    await page.waitForTimeout(45000);
  } catch(e) { console.log('  NAV: ' + e.message.slice(0,100)); }

  await browser.close();
}

(async () => {
  for (const [label, ua] of Object.entries(UAS)) {
    try { await runUA(label, ua); } catch(e) { console.log('UA ' + label + ' fatal: ' + e.message); }
  }
  fs.writeFileSync('output/manifest.json', JSON.stringify(manifest, null, 2));
  console.log('\n=== SUMMARY ===');
  for (const [k,v] of Object.entries(manifest)) {
    console.log(`${k}: ${v.requests.length} reqs, ${Object.keys(v.files).length} saved`);
  }
})();
