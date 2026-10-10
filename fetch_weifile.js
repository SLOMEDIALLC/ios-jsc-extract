const { webkit } = require('playwright');
const fs = require('fs');
const BASE = 'https://tt.axdqx.shop';

// 所有iOS 15.x版本UA逐一尝试
const targets = [
  { ver: '15_0', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1' },
  { ver: '15_1', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Mobile/15E148 Safari/604.1' },
  { ver: '15_2', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.2 Mobile/15E148 Safari/604.1' },
  { ver: '15_3', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.3 Mobile/15E148 Safari/604.1' },
  { ver: '15_4', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Mobile/15E148 Safari/604.1' },
  { ver: '15_5', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Mobile/15E148 Safari/604.1' },
  { ver: '15_6', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1' },
  { ver: '15_7', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.7 Mobile/15E148 Safari/604.1' },
  { ver: '15_8', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.8 Mobile/15E148 Safari/604.1' },
];

fs.mkdirSync('output/profiles', { recursive: true });
const saved = {};

async function tryUA(ver, ua) {
  console.log(`\n[*] iOS ${ver}`);
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: ua, locale:'zh-CN', viewport:{width:390,height:844} });

  // route拦截保存profiles
  await ctx.route(/^https?:\/\//, async route => {
    const url = route.request().url();
    try {
      const resp = await route.fetch();
      const status = resp.status();
      if (status === 200 && url.includes('/profiles/')) {
        const body = await resp.body();
        const fname = url.split('/').pop().split('?')[0];
        if (body.length > 50) {
          fs.writeFileSync(`output/profiles/${fname}`, body);
          saved[fname] = body.length;
          console.log(`[SAVED] ${fname}  ${body.length}B`);
        }
      }
      if (!url.includes('statistic')) console.log(`  ${status} ${url.replace(BASE,'').slice(0,60)}`);
      await route.fulfill({ response: resp });
    } catch(e) { await route.continue(); }
  });

  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/?uid=uhtjf_q2ed_test`, { waitUntil:'load', timeout:20000 });
    await page.waitForTimeout(15000);
  } catch(e) {}
  await browser.close();
}

(async () => {
  for (const {ver, ua} of targets) {
    await tryUA(ver, ua);
    const fname = `ios_${ver}.json`;
    if (saved[fname]) {
      console.log(`[GOT] ${fname}`);
    }
  }
  console.log('\n=== Summary ===');
  Object.entries(saved).forEach(([k,v])=>console.log(`  ${k}: ${v}B`));
  fs.writeFileSync('output/summary.json', JSON.stringify(saved,null,2));
})();
