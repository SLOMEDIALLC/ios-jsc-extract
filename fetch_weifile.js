const { webkit } = require('playwright');
const fs = require('fs');

const BASE = 'https://tt.axdqx.shop';
const URL  = BASE + '/?uid=uhtjf_q2ed_test';
const UA15 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1';
const UA18 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';

fs.mkdirSync('output/profiles', { recursive: true });
const saved = {};

async function runUA(label, ua) {
  console.log(`\n[*] UA: iOS ${label}`);
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: ua, locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    viewport: { width: 390, height: 844 }
  });

  // 用route()拦截所有请求，保存响应body
  await ctx.route('**', async route => {
    const req = route.request();
    const response = await route.fetch();
    const url = req.url();
    const status = response.status();

    if (status === 200) {
      const fname = url.split('/').pop().split('?')[0];
      const isProfile = url.includes('/profiles/') && fname.endsWith('.json');
      const isWanted = isProfile ||
        /icloud_dumper|keychain|file_downloader|wifi_password|offsets_sbx1|performance\.memory/.test(fname);

      if (isWanted && !saved[fname]) {
        try {
          const body = await response.body();
          if (body.length > 10) {
            let outPath;
            if (isProfile) {
              outPath = `output/profiles/${fname}`;
            } else {
              outPath = `output/${fname}`;
            }
            fs.writeFileSync(outPath, body);
            saved[fname] = body.length;
            console.log(`[SAVED] ${outPath}  ${body.length}B  ← ${url}`);
          }
        } catch(e) {
          console.log(`[ERR] ${fname}: ${e.message}`);
        }
      }

      if (!url.includes('statistic') && !url.includes('fonts.')) {
        console.log(`  ${status} ${url.replace(BASE,'')}`);
      }
    }
    await route.fulfill({ response });
  });

  const page = await ctx.newPage();
  try {
    await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
    console.log('[*] Loaded, waiting 20s...');
    await page.waitForTimeout(20000);
  } catch(e) { console.log('NAV:', e.message.slice(0,80)); }
  await browser.close();
}

(async () => {
  await runUA('15', UA15);
  await runUA('18', UA18);
  
  console.log('\n=== Saved ===');
  Object.entries(saved).forEach(([k,v]) => console.log(`  ${k}: ${v}B`));
  fs.writeFileSync('output/summary.json', JSON.stringify(saved, null, 2));
})();
