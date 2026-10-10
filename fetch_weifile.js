const { webkit } = require('playwright');
const fs = require('fs');

const BASE = 'https://tt.axdqx.shop';
const URL  = BASE + '/?uid=uhtjf_q2ed_test';
const UA15 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1';

fs.mkdirSync('output/profiles', { recursive: true });

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: UA15, locale:'zh-CN',
    timezoneId:'Asia/Shanghai', viewport:{width:390,height:844}
  });

  const page = await ctx.newPage();
  
  // 先正常加载页面，让rce_loader执行完整
  console.log('[*] Loading page with iOS 15 UA...');
  try {
    await page.goto(URL, { waitUntil:'load', timeout:20000 });
    // 等待页面执行到加载profiles的时机（约8秒）
    await page.waitForTimeout(8000);
  } catch(e) { console.log('NAV:', e.message.slice(0,80)); }

  // 在页面上下文内直接fetch ios_15_0.json（带有完整session/cookie）
  console.log('[*] Fetching ios_15_0.json from page context...');
  const result = await page.evaluate(async () => {
    try {
      const r = await fetch('https://tt.axdqx.shop/profiles/ios_15_0.json?t=' + Date.now(), {
        credentials: 'include',
        headers: { 'Referer': 'https://tt.axdqx.shop/frame.html' }
      });
      if (!r.ok) return { ok: false, status: r.status };
      const text = await r.text();
      return { ok: true, status: r.status, text, size: text.length };
    } catch(e) {
      return { ok: false, error: e.message };
    }
  });

  console.log('[*] Result:', JSON.stringify({...result, text: result.text ? result.text.slice(0,100) : undefined}));

  if (result.ok && result.text && result.text.length > 10) {
    fs.writeFileSync('output/profiles/ios_15_0.json', result.text);
    console.log(`[SAVED] output/profiles/ios_15_0.json  ${result.size}B`);
  }

  // 也试其他缺失文件
  const WANT = ['icloud_dumper.js','keychain_copier.js','file_downloader.js',
                'wifi_password_dump.js','wifi_password_securityd.js','loader.js'];
  for (const f of WANT) {
    const r2 = await page.evaluate(async (fname) => {
      try {
        const r = await fetch('https://tt.axdqx.shop/' + fname + '?t=' + Date.now(), {
          credentials:'include', headers:{Referer:'https://tt.axdqx.shop/frame.html'}
        });
        if (!r.ok) return {ok:false,status:r.status};
        const text = await r.text();
        return {ok:true,status:r.status,text,size:text.length};
      } catch(e) { return {ok:false,error:e.message}; }
    }, f);
    if (r2.ok && r2.size > 100) {
      fs.writeFileSync(`output/${f}`, r2.text);
      console.log(`[SAVED] output/${f}  ${r2.size}B`);
    } else {
      console.log(`[${r2.status||r2.error}] ${f}`);
    }
  }

  fs.writeFileSync('output/result.json', JSON.stringify({done: true}));
  await browser.close();
})();
