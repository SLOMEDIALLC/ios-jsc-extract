const { webkit } = require('playwright');
const fs = require('fs');
const BASE = 'https://tt.axdqx.shop';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1';

fs.mkdirSync('output/profiles', { recursive: true });
const saved = {};

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: UA, locale:'zh-CN', viewport:{width:390,height:844} });

  ctx.on('response', async res => {
    const url = res.url();
    const status = res.status();
    if (!url.includes('statistic')) console.log(`${status} ${url.replace(BASE,'')}`);
    if (status === 200 && url.includes('/profiles/')) {
      try {
        const body = await res.body();
        const fname = url.split('/').pop().split('?')[0];
        if (body.length > 50 && body[0] === 123) { // '{'
          fs.writeFileSync(`output/profiles/${fname}`, body);
          saved[fname] = body.length;
          console.log(`[SAVED] ${fname}  ${body.length}B`);
        }
      } catch(e) {}
    }
  });

  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/?uid=uhtjf_q2ed_test`, { waitUntil:'load', timeout:20000 });
    await page.waitForTimeout(20000);
  } catch(e) { console.log('NAV:', e.message.slice(0,80)); }

  console.log('\n=== Done ===');
  Object.entries(saved).forEach(([k,v])=>console.log(`  ${k}: ${v}B`));
  fs.writeFileSync('output/summary.json', JSON.stringify(saved,null,2));
  await browser.close();
})();
