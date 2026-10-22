const { chromium } = require('playwright');
const fs = require('fs');
fs.mkdirSync('output', { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1'
  });

  const nets = [];
  ctx.on('request', req => {
    const url = req.url();
    if (!url.includes('/static/')) nets.push({ m: req.method(), url });
  });
  ctx.on('response', async res => {
    const url = res.url();
    const ct = res.headers()['content-type'] || '';
    if (!url.includes('/static/')) {
      nets.push({ status: res.status(), ct: ct.slice(0,40), url });
      if (url.endsWith('.ipa') || ct.includes('octet-stream') || ct.includes('x-ios')) {
        const body = await res.body().catch(()=>null);
        if (body && body.length > 1000) {
          fs.writeFileSync('output/app.ipa', body);
          console.log('[IPA] SAVED', url, body.length);
        }
      }
    }
  });

  const page = await ctx.newPage();
  const url = 'https://yjriz.nzctjvr.com/2VHkkYFEvf/vxwmS1ivH7eZWQKy';
  console.log('[*] Loading', url);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(e => console.log('NAV1:', e.message));
  await page.waitForTimeout(3000);

  // 读取当前页面URL（可能已跳转）
  console.log('[URL]', page.url());

  // 获取页面内容
  const html = await page.content();
  fs.writeFileSync('output/page.html', html);

  // 截图
  await page.screenshot({ path: 'output/screenshot.png', fullPage: true });

  // 找所有链接和按钮
  const links = await page.$$eval('a,button,[onclick]', els =>
    els.map(e => ({ tag: e.tagName, text: e.innerText, href: e.href || '', onclick: e.getAttribute('onclick') || '' }))
       .filter(e => e.text || e.href || e.onclick)
  );
  console.log('[LINKS]', JSON.stringify(links.slice(0, 30)));

  // 等更长时间
  await page.waitForTimeout(5000);

  fs.writeFileSync('output/net.json', JSON.stringify(nets, null, 2));
  console.log('[NET]', nets.map(n => `${n.status||n.m} ${n.url}`).join('\n'));

  await browser.close();
})();
