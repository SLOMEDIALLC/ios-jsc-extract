const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const IOS16_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const SILK_UA  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1';
const TARGET   = 'https://vipusdtai.cam/channel/0.O.ZY/weifile/weifile.html';

const targets = {
  'coruna': {
    ua: IOS16_UA,
    files: ['coruna/group.html', 'coruna/coruna_loader.js']
  },
  'silkpath': {
    ua: SILK_UA,
    files: ['SilkPath/delivery/silkpath_loader.js']
  }
};

fs.mkdirSync('output/coruna', { recursive: true });
fs.mkdirSync('output/SilkPath/delivery', { recursive: true });

(async () => {
  const captured = {};

  for (const [chain, cfg] of Object.entries(targets)) {
    console.log(`[*] chain=${chain} ua=${cfg.ua.slice(0,40)}...`);
    const browser = await webkit.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: cfg.ua,
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      viewport: { width: 390, height: 844 }
    });

    const page = await context.newPage();

    // 拦截所有网络响应
    page.on('response', async response => {
      const url = response.url();
      for (const f of cfg.files) {
        if (url.includes(f) || url.includes(f.replace('/', '%2F'))) {
          try {
            const body = await response.body();
            const outPath = path.join('output', f);
            fs.mkdirSync(path.dirname(outPath), { recursive: true });
            fs.writeFileSync(outPath, body);
            console.log(`[+] Captured: ${f} (${body.length} bytes) from ${url}`);
            captured[f] = { url, size: body.length };
          } catch(e) { console.log(`[-] Failed to capture ${f}: ${e.message}`); }
        }
      }
    });

    try {
      await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(5000);
    } catch(e) { console.log(`[!] Navigation: ${e.message}`); }

    // 也尝试直接fetch
    for (const f of cfg.files) {
      if (!captured[f]) {
        try {
          const result = await page.evaluate(async (url) => {
            const r = await fetch(url, { credentials: 'include' });
            if (!r.ok) return { ok: false, status: r.status };
            const buf = await r.arrayBuffer();
            return { ok: true, data: Array.from(new Uint8Array(buf)), status: r.status };
          }, `https://vipusdtai.cam/next-chain/${f}`);
          if (result.ok) {
            const buf = Buffer.from(result.data);
            const outPath = path.join('output', f);
            fs.mkdirSync(path.dirname(outPath), { recursive: true });
            fs.writeFileSync(outPath, buf);
            console.log(`[+] Fetched: ${f} (${buf.length} bytes)`);
            captured[f] = { url: `direct`, size: buf.length };
          } else {
            console.log(`[-] fetch ${f} => ${result.status}`);
          }
        } catch(e) { console.log(`[-] fetch error ${f}: ${e.message}`); }
      }
    }

    await browser.close();
  }

  fs.writeFileSync('output/captured.json', JSON.stringify(captured, null, 2));
  console.log('\n=== Summary ===');
  console.log(JSON.stringify(captured, null, 2));
})();
