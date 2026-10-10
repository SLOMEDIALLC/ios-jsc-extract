const { webkit } = require('playwright');
const fs = require('fs');

const BASE = 'https://tt.axdqx.shop';
const URL  = BASE + '/?uid=uhtjf_q2ed_test';

// 目标文件
const WANT = [
  'icloud_dumper.js','keychain_copier.js','keychain_dump.js',
  'file_downloader.js','wifi_password_dump.js','wifi_password_securityd.js',
  'loader.js','main.js',
  'ios_26_0.js','offsets_sbx1.js','performance.memory.js'
];

fs.mkdirSync('output', { recursive: true });
const saved = {};
const allNet = [];

const UAs = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
];

async function tryUA(ua) {
  console.log(`\n[UA] ${ua.match(/OS ([0-9_]+)/)[1]}`);
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: ua, locale:'zh-CN',
    timezoneId:'Asia/Shanghai',
    viewport:{ width:390, height:844 }
  });

  ctx.on('response', async res => {
    const url  = res.url();
    const status = res.status();
    const fname = url.split('/').pop().split('?')[0];
    allNet.push({ status, url });

    if (status === 200) {
      try {
        const body = await res.body();
        if (body.length > 100) {
          // 保存所有有意义的JS/HTML
          const isWanted = WANT.some(w => url.includes(w));
          const isJS = url.match(/\.(js|html)(\?|$)/);
          if ((isWanted || isJS) && !saved[fname]) {
            saved[fname] = body.length;
            fs.writeFileSync('output/' + fname, body);
            console.log(`[SAVED] ${fname}  ${body.length}B  ${url}`);
          }
        }
      } catch(e) {}
    }
    if (!url.includes('fonts.') && !url.includes('statistic') && !url.includes('tailwind')) {
      console.log(`  ${status} ${url.replace(BASE,'')}`);
    }
  });

  const page = await ctx.newPage();
  try {
    await page.goto(URL, { waitUntil:'load', timeout:20000 });
    await page.waitForTimeout(20000);
  } catch(e) { console.log('NAV:', e.message.slice(0,80)); }

  await browser.close();
}

(async () => {
  for (const ua of UAs) {
    await tryUA(ua);
    // 检查是否所有目标都已获取
    const missing = WANT.filter(w => !saved[w]);
    if (missing.length === 0) { console.log('All targets captured!'); break; }
    console.log('Still missing:', missing.join(', '));
  }

  fs.writeFileSync('output/network_log.json', JSON.stringify(allNet, null, 2));
  console.log('\n=== Saved files ===');
  Object.entries(saved).forEach(([k,v]) => console.log(`  ${k}  ${v}B`));
})();
