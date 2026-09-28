const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const IOS16_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const SILK_UA  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1';
const BASE     = 'https://vipusdtai.cam';

fs.mkdirSync('output/coruna', { recursive: true });
fs.mkdirSync('output/SilkPath/delivery', { recursive: true });

const captured = {};

async function tryChain(ua, targetFiles, chainName) {
  console.log(`\n[*] === ${chainName} (${ua.match(/OS ([0-9_]+)/)[1]}) ===`);
  const browser = await webkit.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: ua,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    viewport: { width: 390, height: 844 }
  });

  // 拦截所有响应，保存目标文件
  context.on('response', async response => {
    const url = response.url();
    const status = response.status();
    if (status === 200) {
      for (const f of targetFiles) {
        if (url.includes(f.split('/').pop()) || url.includes(f)) {
          try {
            const body = await response.body();
            if (body.length > 1000) {
              const outPath = path.join('output', f);
              fs.mkdirSync(path.dirname(outPath), { recursive: true });
              fs.writeFileSync(outPath, body);
              console.log(`[+] CAPTURED: ${f} (${body.length} bytes) from ${url}`);
              captured[f] = { url, size: body.length };
            }
          } catch(e) {}
        }
      }
    }
    if (url.includes('next-chain') || url.includes('coruna') || url.includes('SilkPath') || url.includes('silkpath')) {
      console.log(`  NET ${status} ${url}`);
    }
  });

  const page = await context.newPage();
  
  // 先访问主weifile.html，等JS自然执行
  try {
    console.log('[*] Loading weifile.html...');
    await page.goto(`${BASE}/channel/0.O.ZY/weifile/weifile.html`, { 
      waitUntil: 'load', timeout: 20000 
    });
    await page.waitForTimeout(8000);
  } catch(e) { console.log(`[!] ${e.message.slice(0,80)}`); }

  // 再等等看有没有延迟加载的请求
  await page.waitForTimeout(3000);

  // 主动fetch目标文件（带上已建立的session/cookie）
  for (const f of targetFiles) {
    if (!captured[f]) {
      for (const url of [
        `${BASE}/next-chain/${f}`,
        `${BASE}/${f}`,
        `${BASE}/channel/0.O.ZY/weifile/${f}`
      ]) {
        try {
          const result = await page.evaluate(async (u) => {
            const r = await fetch(u, { credentials: 'include', mode: 'cors' });
            if (!r.ok) return { ok: false, status: r.status };
            const buf = await r.arrayBuffer();
            const arr = Array.from(new Uint8Array(buf));
            return { ok: true, data: arr, status: r.status, size: arr.length };
          }, url);
          if (result.ok && result.size > 1000) {
            const buf = Buffer.from(result.data);
            const outPath = path.join('output', f);
            fs.mkdirSync(path.dirname(outPath), { recursive: true });
            fs.writeFileSync(outPath, buf);
            console.log(`[+] FETCHED: ${f} (${buf.length}B) from ${url}`);
            captured[f] = { url, size: buf.length };
            break;
          } else {
            console.log(`[-] ${result.status} ${url}`);
          }
        } catch(e) { console.log(`[-] err ${url}: ${e.message.slice(0,60)}`); }
      }
    }
  }

  await browser.close();
}

(async () => {
  await tryChain(IOS16_UA, ['coruna/group.html', 'coruna/coruna_loader.js'], 'coruna');
  await tryChain(SILK_UA,  ['SilkPath/delivery/silkpath_loader.js'], 'silkpath');
  
  fs.writeFileSync('output/captured.json', JSON.stringify(captured, null, 2));
  console.log('\n=== Final ===');
  console.log(JSON.stringify(captured, null, 2));
})();
