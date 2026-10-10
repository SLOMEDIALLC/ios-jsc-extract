const { webkit } = require('playwright');
const fs = require('fs');
const BASE = 'https://tt.axdqx.shop';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';

fs.mkdirSync('output', { recursive: true });
const found = {};

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: UA, locale:'zh-CN', viewport:{width:390,height:844} });

  // 监听所有响应，捕获plugins目录
  ctx.on('response', async res => {
    const url = res.url();
    const status = res.status();
    if (url.includes('/plugins/')) {
      console.log(`${status} ${url.replace(BASE,'')}`);
      if (status === 200) {
        try {
          const body = await res.body();
          const parts = url.replace(BASE,'').split('/');
          // /plugins/CVE-xxx/exploit.js
          if (parts.length >= 3 && parts[1] === 'plugins') {
            const cve = parts[2];
            const fname = parts[3] ? parts[3].split('?')[0] : 'unknown';
            if (!found[cve]) found[cve] = {};
            found[cve][fname] = body.length;
            fs.mkdirSync(`output/plugins/${cve}`, { recursive: true });
            fs.writeFileSync(`output/plugins/${cve}/${fname}`, body);
            console.log(`[SAVED] plugins/${cve}/${fname}  ${body.length}B`);
          }
        } catch(e) {}
      }
    }
  });

  const page = await ctx.newPage();
  await page.goto(`${BASE}/?uid=uhtjf_q2ed_test`, { waitUntil:'load', timeout:20000 });
  await page.waitForTimeout(20000);

  // 额外：在页面内fetch所有可能的CVE目录
  const cveList = [
    'CVE-2025-24243','CVE-2025-31203','CVE-2025-31250','CVE-2026-10001',
    'CVE-2025-14174','CVE-2025-24201','CVE-2025-31200','CVE-2025-43520','CVE-2025-43529',
    'CVE-2026-20700','CVE-2026-31001','CVE-2022-32893','CVE-2023-37450','CVE-2024-23222',
    // 额外测试非exploit.js文件
  ];
  
  for (const cve of cveList) {
    for (const fname of ['exploit.js','main.js','stage1.js','payload.js','config.js','offsets.js']) {
      const r = await page.evaluate(async (url) => {
        try {
          const resp = await fetch(url, { credentials:'include' });
          const text = await resp.text();
          return { status: resp.status, size: text.length, preview: text.slice(0,50) };
        } catch(e) { return { error: e.message }; }
      }, `${BASE}/plugins/${cve}/${fname}?${Date.now()}`);
      
      if (r.status === 200 && r.size > 100) {
        console.log(`[FETCH] plugins/${cve}/${fname}: ${r.size}B  ${r.preview}`);
        if (!found[cve]) found[cve] = {};
        found[cve][fname] = r.size;
      }
    }
  }

  console.log('\n=== Found ===');
  console.log(JSON.stringify(found, null, 2));
  fs.writeFileSync('output/plugins_found.json', JSON.stringify(found, null, 2));
  await browser.close();
})();
