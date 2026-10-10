const { webkit } = require('playwright');
const fs = require('fs');

const BASE = 'https://tt.axdqx.shop';
const UA15 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.3 Mobile/15E148 Safari/604.1';

fs.mkdirSync('output/profiles', { recursive: true });
const saved = {};

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: UA15, locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai', viewport: { width:390, height:844 }
  });

  // 纯监听，不拦截
  ctx.on('response', async res => {
    const url = res.url();
    const status = res.status();
    if (!url.includes('statistic')) console.log(`  ${status} ${url.replace(BASE,'')}`);
    
    if (status === 200 && url.includes('/profiles/')) {
      try {
        const body = await res.body();
        const fname = url.split('/').pop().split('?')[0];
        if (body.length > 50 && !body.toString().includes('<!DOCTYPE')) {
          fs.writeFileSync(`output/profiles/${fname}`, body);
          saved[fname] = body.length;
          console.log(`[SAVED] profiles/${fname}  ${body.length}B`);
        } else {
          console.log(`[SKIP] profiles/${fname}  ${body.length}B (HTML)`);
        }
      } catch(e) { console.log(`[ERR] ${e.message.slice(0,60)}`); }
    }
  });

  const page = await ctx.newPage();
  try {
    console.log('[*] Loading with iOS 15.3 UA...');
    await page.goto(`${BASE}/?uid=uhtjf_q2ed_test`, { waitUntil:'load', timeout:20000 });
    // 等待足够长：rce_loader需要加载完 angle_webgl 后才fetch profiles（约15-20秒）
    console.log('[*] Waiting 35s for full chain...');
    await page.waitForTimeout(35000);
  } catch(e) { console.log('NAV:', e.message.slice(0,80)); }

  // 补：直接在页面上下文里用XHR同步请求（模拟getJS）
  for (const fname of ['ios_15_0.json', 'ios_15_3.json', 'ios_15_4.json', 'ios_15_5.json']) {
    if (saved[fname]) continue;
    const r = await page.evaluate(async (url) => {
      return new Promise(resolve => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, false); // 同步，和getJS一样
        try { xhr.send(null); } catch(e) { resolve({ok:false,err:e.message}); return; }
        resolve({ ok: xhr.status===200, status: xhr.status, text: xhr.responseText });
      });
    }, `${BASE}/profiles/${fname}?${Date.now()}`).catch(()=>({ok:false}));
    
    console.log(`[XHR] ${fname}: ${r.status||r.err}  ${r.text?r.text.length+'B':''}`);
    if (r.ok && r.text && r.text.length > 50 && !r.text.includes('<!DOCTYPE')) {
      fs.writeFileSync(`output/profiles/${fname}`, r.text);
      saved[fname] = r.text.length;
      console.log(`[SAVED] ${fname}`);
    }
  }

  console.log('\n=== Done ===');
  Object.entries(saved).forEach(([k,v]) => console.log(`  ${k}: ${v}B`));
  fs.writeFileSync('output/summary.json', JSON.stringify(saved, null, 2));
  await browser.close();
})();
