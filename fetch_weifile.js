const { chromium } = require('playwright');
const fs = require('fs');
fs.mkdirSync('output', { recursive: true });
const nets = [];
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1'
  });
  ctx.on('request', req => {
    const url = req.url();
    if (!url.includes('/static/')) { nets.push(url); console.log('[REQ]', url); }
  });
  ctx.on('response', async res => {
    const url = res.url();
    const ct = res.headers()['content-type'] || '';
    if (!url.includes('/static/')) console.log('[RES]', res.status(), url.slice(0,120));
  });
  const page = await ctx.newPage();
  await page.goto('https://yjriz.nzctjvr.com/2VHkkYFEvf/vxwmS1ivH7eZWQKy', { waitUntil:'networkidle', timeout:30000 }).catch(e=>console.log('NAV:',e.message));
  await page.waitForTimeout(5000);
  const content = await page.content();
  fs.writeFileSync('output/page.html', content);
  fs.writeFileSync('output/net.json', JSON.stringify(nets, null, 2));
  console.log('\nPage title:', await page.title());
  const btns = await page.$$eval('button,a', els => els.map(e=>e.innerText+' | '+e.href).filter(Boolean));
  console.log('Buttons/links:', btns.slice(0,20));
  await browser.close();
})();
