const { webkit } = require('playwright');
const fs = require('fs');
const BASE = 'https://tt.axdqx.shop';

const IOS15_VERS = ['15_0','15_1','15_2','15_3','15_4','15_5','15_6','15_7','15_8'];
fs.mkdirSync('output/profiles', { recursive: true });
const saved = {};

(async () => {
  for (const ver of IOS15_VERS) {
    const ua = `Mozilla/5.0 (iPhone; CPU iPhone OS ${ver} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${ver.split('_')[0]}.${ver.split('_')[1]} Mobile/15E148 Safari/604.1`;
    console.log(`\n[*] ${ver}`);

    const browser = await webkit.launch({ headless: true });
    const ctx = await browser.newContext({ userAgent: ua, locale:'zh-CN', viewport:{width:390,height:844} });

    // 纯response监听，不拦截
    ctx.on('response', async res => {
      const url = res.url();
      const status = res.status();
      if (status === 200 && url.includes('/profiles/')) {
        try {
          const body = await res.body();
          const fname = url.split('/').pop().split('?')[0];
          console.log(`[RESP] ${fname}  ${body.length}B  first:${body[0]}`);
          // 保存所有>10字节的响应
          if (body.length > 10) {
            const outPath = `output/profiles/${fname}`;
            fs.writeFileSync(outPath, body);
            saved[fname] = body.length;
            console.log(`[SAVED] ${fname}`);
          }
        } catch(e) { console.log(`[ERR] ${e.message.slice(0,50)}`); }
      }
      if (url.includes('/profiles/') || url.includes('rce_worker') || url.includes('sbx0')) {
        console.log(`  ${status} ${url.replace(BASE,'')}`);
      }
    });

    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/?uid=uhtjf_q2ed_test`, { waitUntil:'load', timeout:20000 });
      await page.waitForTimeout(18000);
    } catch(e) { console.log('NAV:', e.message.slice(0,50)); }
    await browser.close();

    const fname = `ios_${ver}.json`;
    if (saved[fname]) console.log(`[GOT] ${fname}`);
    else console.log(`[MISS] ${fname}`);
  }

  console.log('\n=== Saved ===');
  Object.entries(saved).forEach(([k,v])=>console.log(`  ${k}: ${v}B`));
  fs.writeFileSync('output/summary.json', JSON.stringify(saved,null,2));
})();
