const { webkit } = require('playwright');
const fs = require('fs');
const BASE = 'https://tt.axdqx.shop';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';

fs.mkdirSync('output', { recursive: true });
const allPluginReqs = [];

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: UA, locale:'zh-CN', viewport:{width:390,height:844} });

  // 监听所有请求（包括304）
  ctx.on('request', req => {
    if (req.url().includes('/plugins/')) {
      allPluginReqs.push({ type:'REQ', method:req.method(), url:req.url() });
      console.log(`[REQ] ${req.method()} ${req.url().replace(BASE,'')}`);
    }
  });

  ctx.on('response', async res => {
    const url = res.url();
    const status = res.status();
    if (url.includes('/plugins/')) {
      console.log(`[RES] ${status} ${url.replace(BASE,'')}`);
      allPluginReqs.push({ type:'RES', status, url });
      if ((status === 200 || status === 304) && url.includes('.js')) {
        try {
          const body = await res.body();
          const parts = url.replace(BASE,'').split('/');
          const cve = parts[2];
          const fname = (parts[3]||'unknown').split('?')[0];
          fs.mkdirSync(`output/plugins/${cve}`, { recursive: true });
          fs.writeFileSync(`output/plugins/${cve}/${fname}`, body);
          console.log(`[SAVED] ${cve}/${fname}  ${body.length}B`);
        } catch(e) {}
      }
    }
  });

  const page = await ctx.newPage();
  await page.goto(`${BASE}/?uid=uhtjf_q2ed_test`, { waitUntil:'load', timeout:20000 });
  await page.waitForTimeout(20000);

  fs.writeFileSync('output/plugin_requests.json', JSON.stringify(allPluginReqs, null, 2));
  console.log('\n=== All plugin requests ===');
  allPluginReqs.forEach(r => console.log(`${r.type} ${r.status||''} ${(r.url||'').replace(BASE,'')}`));
  await browser.close();
})();
