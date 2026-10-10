const { webkit } = require('playwright');
const fs = require('fs');

const BASE = 'https://tt.axdqx.shop';
const URL  = BASE + '/?uid=uhtjf_q2ed_test';

const UAs = {
  '15': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  '18': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1',
};

const WANT_PATTERNS = [
  /ios_\d+_\d+\.json/,
  /icloud_dumper\.js/, /keychain_copier\.js/, /keychain_dump\.js/,
  /file_downloader\.js/, /wifi_password.*\.js/,
  /loader\.js/, /main\.js/,
  /offsets_sbx1\.js/, /performance\.memory\.js/,
];

fs.mkdirSync('output/profiles', { recursive: true });
fs.mkdirSync('output/plugins', { recursive: true });
const saved = {};

async function runUA(label, ua) {
  console.log(`\n[*] UA: iOS ${label}`);
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: ua, locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    viewport: { width: 390, height: 844 }
  });

  ctx.on('response', async res => {
    const url = res.url();
    const status = res.status();
    const fname = url.split('/').pop().split('?')[0];
    
    const isWanted = WANT_PATTERNS.some(p => p.test(fname)) ||
                     url.includes('/profiles/') || url.includes('/plugins/');

    if (status === 200 && isWanted) {
      try {
        const body = await res.body();
        if (body.length > 50) {
          let outPath;
          if (url.includes('/profiles/')) {
            outPath = `output/profiles/${fname}`;
          } else if (url.includes('/plugins/')) {
            const cve = url.match(/CVE-[\d-]+/);
            if (cve) {
              fs.mkdirSync(`output/plugins/${cve[0]}`, { recursive: true });
              outPath = `output/plugins/${cve[0]}/exploit.js`;
            } else outPath = `output/${fname}`;
          } else {
            outPath = `output/${fname}`;
          }
          if (!saved[outPath]) {
            saved[outPath] = body.length;
            fs.writeFileSync(outPath, body);
            console.log(`[SAVED] ${outPath} ${body.length}B  ← ${url}`);
          }
        }
      } catch(e) {}
    }
    
    // 打印所有非静态请求
    if (!url.includes('fonts.') && !url.includes('statistic') && !url.includes('tailwind')) {
      console.log(`  ${status} ${url.replace(BASE, '')}`);
    }
  });

  const page = await ctx.newPage();
  try {
    await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
    await page.waitForTimeout(25000);
  } catch(e) { console.log('NAV:', e.message.slice(0,80)); }
  await browser.close();
}

(async () => {
  for (const [label, ua] of Object.entries(UAs)) {
    await runUA(label, ua);
  }
  
  console.log('\n=== Saved ===');
  Object.entries(saved).forEach(([k,v]) => console.log(`  ${k}: ${v}B`));
  fs.writeFileSync('output/summary.json', JSON.stringify(saved, null, 2));
})();
