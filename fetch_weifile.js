const { chromium } = require('playwright');
const fs = require('fs');
fs.mkdirSync('output', { recursive: true });

(async () => {
  const lines = [];
  const log = (...args) => { const m = args.join(' '); console.log(m); lines.push(m); };

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1'
  });

  ctx.on('request', req => {
    if (!req.url().includes('/static/')) log('[REQ]', req.method(), req.url());
  });
  ctx.on('response', async res => {
    const url = res.url();
    const ct = res.headers()['content-type'] || '';
    if (!url.includes('/static/')) log('[RES]', res.status(), ct.slice(0,30), url);
  });

  const page = await ctx.newPage();
  log('[*] goto');
  await page.goto('https://yjriz.nzctjvr.com/2VHkkYFEvf/vxwmS1ivH7eZWQKy', {
    waitUntil: 'networkidle', timeout: 30000
  }).catch(e => log('NAV:', e.message.slice(0,80)));
  
  log('[URL]', page.url());
  await page.waitForTimeout(5000);
  
  const html = await page.content();
  fs.writeFileSync('output/page.html', html);
  log('[HTML len]', html.length);
  
  await page.screenshot({ path: 'output/shot.png' });
  
  const links = await page.$$eval('a', els => els.map(e => e.href + ' | ' + e.innerText.slice(0,40)));
  log('[LINKS]', links.join('\n'));
  
  fs.writeFileSync('output/log.txt', lines.join('\n'));
  await browser.close();
  log('DONE');
  fs.writeFileSync('output/log.txt', lines.join('\n'));
})();
