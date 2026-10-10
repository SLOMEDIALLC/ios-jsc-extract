const { webkit } = require('playwright');
const fs = require('fs');

const C2 = 'https://sqwas.shapelie.com:8881';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';

fs.mkdirSync('output', { recursive: true });
const results = {};

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: UA, locale: 'zh-CN',
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: true
  });

  ctx.on('response', async res => {
    const url = res.url();
    const status = res.status();
    console.log(`${status} ${url}`);
    if (status === 200) {
      try {
        const body = await res.body();
        const fname = url.split('/').pop().split('?')[0] || 'index';
        if (body.length > 0 && body.length < 10000000) {
          fs.writeFileSync('output/' + fname, body);
          results[url] = body.length;
          console.log(`[SAVED] ${fname} ${body.length}B`);
        }
      } catch(e) {}
    }
  });

  const page = await ctx.newPage();

  // 探测所有可能的路由
  const paths = ['/', '/upload', '/api', '/admin', '/result', '/data', '/files',
                 '/status', '/health', '/ping', '/info', '/api/upload', '/api/result',
                 '/api/data', '/api/files', '/api/status'];

  for (const path of paths) {
    for (const port of [8881, 8882]) {
      const url = `https://sqwas.shapelie.com:${port}${path}`;
      try {
        const resp = await page.evaluate(async (u) => {
          try {
            const r = await fetch(u, { method: 'GET', mode: 'no-cors' });
            return { ok: r.ok, status: r.status, type: r.type };
          } catch(e) { return { error: e.message }; }
        }, url);
        console.log(`[FETCH] ${url}: ${JSON.stringify(resp)}`);
      } catch(e) {}
    }
  }

  // 也直接navigate
  try {
    await page.goto(`${C2}/`, { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(3000);
    const content = await page.content();
    fs.writeFileSync('output/c2_root.html', content);
    console.log(`[PAGE] c2_root.html ${content.length}B`);
  } catch(e) { console.log('[PAGE ERR]', e.message.slice(0,80)); }

  fs.writeFileSync('output/results.json', JSON.stringify(results, null, 2));
  console.log('\nDone:', Object.keys(results).length, 'files');
  await browser.close();
})();
