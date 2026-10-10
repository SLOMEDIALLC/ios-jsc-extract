const { webkit } = require('playwright');
const fs = require('fs');
const BASE = 'https://tt.axdqx.shop';
fs.mkdirSync('output/profiles', { recursive: true });
const saved = {};

const targets = [
  { ver: '18_3_1', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3.1 Mobile/15E148 Safari/604.1' },
  { ver: '18_4_1', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4.1 Mobile/15E148 Safari/604.1' },
  { ver: '18_7_1', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7.1 Mobile/15E148 Safari/604.1' },
];

(async () => {
  for (const { ver, ua } of targets) {
    console.log(`\n[*] iOS ${ver}`);
    const browser = await webkit.launch({ headless: true });
    const ctx = await browser.newContext({ userAgent: ua, locale:'zh-CN', viewport:{width:390,height:844} });

    // 拦截profiles请求
    await ctx.route(/^https?:\/\//, async route => {
      const url = route.request().url();
      try {
        const resp = await route.fetch();
        const fname = url.split('/').pop().split('?')[0];
        if (resp.status() === 200 && url.includes('/profiles/')) {
          const body = await resp.body();
          if (body.length > 10) {
            fs.writeFileSync(`output/profiles/${fname}`, body);
            saved[fname] = body.length;
            console.log(`[SAVED] ${fname}  ${body.length}B`);
          }
        }
        if (!url.includes('statistic')) console.log(`  ${resp.status()} ${url.replace(BASE,'')}`);
        await route.fulfill({ response: resp });
      } catch(e) { await route.continue(); }
    });

    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/?uid=uhtjf_q2ed_test`, { waitUntil:'load', timeout:20000 });
      await page.waitForTimeout(15000);
      // 也直接fetch
      const r = await page.evaluate(async (url) => {
        try {
          const resp = await fetch(url, { credentials:'include' });
          return { ok: resp.ok, status: resp.status, text: await resp.text() };
        } catch(e) { return { ok: false, error: e.message }; }
      }, `${BASE}/profiles/ios_${ver}.json?${Date.now()}`);
      console.log(`[FETCH] ios_${ver}.json: ${r.status||r.error}  ${r.text ? r.text.length+'B' : ''}`);
      if (r.ok && r.text && r.text.length > 10 && !r.text.includes('<!DOCTYPE')) {
        fs.writeFileSync(`output/profiles/ios_${ver}.json`, r.text);
        saved[`ios_${ver}.json`] = r.text.length;
        console.log(`[SAVED via eval] ios_${ver}.json`);
      }
    } catch(e) { console.log('ERR:', e.message.slice(0,80)); }
    await browser.close();
  }
  console.log('\n=== Done ===');
  Object.entries(saved).forEach(([k,v])=>console.log(`  ${k}: ${v}B`));
  fs.writeFileSync('output/summary.json', JSON.stringify(saved,null,2));
})();
