const { webkit } = require('playwright');
const fs = require('fs');

const BASE = 'https://tt.axdqx.shop';
const URL  = BASE + '/?uid=uhtjf_q2ed_test';
const UAs = {
  '15': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  '18': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1',
};

fs.mkdirSync('output/profiles', { recursive: true });
const saved = {};

async function runUA(label, ua) {
  console.log(`\n[*] iOS ${label}`);
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: ua, locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai', viewport: { width:390, height:844 }
  });

  // 只拦截 http/https，跳过 blob:
  await ctx.route(/^https?:\/\//, async route => {
    const req = route.request();
    const reqUrl = req.url();
    try {
      const resp = await route.fetch();
      const status = resp.status();
      const fname = reqUrl.split('/').pop().split('?')[0];
      const isProfile = reqUrl.includes('/profiles/') && fname.endsWith('.json');
      const isWanted = isProfile ||
        /icloud_dumper|keychain|file_downloader|wifi_password|offsets_sbx1/.test(fname);

      if (status === 200 && isWanted && !saved[fname]) {
        const body = await resp.body();
        if (body.length > 10) {
          const outPath = isProfile ? `output/profiles/${fname}` : `output/${fname}`;
          fs.writeFileSync(outPath, body);
          saved[fname] = body.length;
          console.log(`[SAVED] ${outPath}  ${body.length}B`);
        }
      }
      if (!reqUrl.includes('statistic') && !reqUrl.includes('fonts.'))
        console.log(`  ${status} ${reqUrl.replace(BASE,'')}`);
      await route.fulfill({ response: resp });
    } catch(e) {
      console.log(`[ROUTE_ERR] ${reqUrl.slice(0,80)}: ${e.message.slice(0,60)}`);
      await route.continue();
    }
  });

  const page = await ctx.newPage();
  try {
    await page.goto(URL, { waitUntil:'load', timeout:20000 });
    console.log('[*] Loaded, waiting 20s...');
    await page.waitForTimeout(20000);
  } catch(e) { console.log('NAV:', e.message.slice(0,80)); }
  await browser.close();
}

(async () => {
  for (const [label, ua] of Object.entries(UAs)) await runUA(label, ua);
  console.log('\n=== Saved ===');
  Object.entries(saved).forEach(([k,v]) => console.log(`  ${k}: ${v}B`));
  fs.writeFileSync('output/summary.json', JSON.stringify(saved, null, 2));
})();
