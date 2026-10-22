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
    if (!url.includes('cloudfront') || !url.includes('static/')) {
      nets.push({ method: req.method(), url });
      console.log('[REQ]', req.method(), url);
    }
  });
  ctx.on('response', async res => {
    const url = res.url();
    const status = res.status();
    const ct = res.headers()['content-type'] || '';
    if (!url.includes('static/')) {
      console.log('[RES]', status, ct.slice(0,30), url.slice(0,100));
      if (url.includes('.ipa') || url.includes('.plist') || ct.includes('octet-stream')) {
        console.log('[IPA FOUND]', url);
        const body = await res.body().catch(()=>null);
        if (body) fs.writeFileSync('output/found.ipa', body);
      }
    }
  });

  const page = await ctx.newPage();
  await page.goto('https://yjriz.nzctjvr.com/2VHkkYFEvf/vxwmS1ivH7eZWQKy', {
    waitUntil: 'networkidle', timeout: 30000
  });
  await page.waitForTimeout(5000);
  
  // 找下载按钮并点击
  const buttons = await page.$$('button, a, [onclick]');
  for (const btn of buttons) {
    const text = await btn.innerText().catch(()=>'');
    console.log('[BTN]', text.slice(0,50));
  }
  
  fs.writeFileSync('output/net.json', JSON.stringify(nets, null, 2));
  await browser.close();
})();
