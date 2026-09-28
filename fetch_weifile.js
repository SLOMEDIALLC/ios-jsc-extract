const { webkit } = require('playwright');
const fs = require('fs');

const IOS16_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const BASE = 'https://vipusdtai.cam';

const allRequests = [];

(async () => {
  const browser = await webkit.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: IOS16_UA,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    viewport: { width: 390, height: 844 }
  });

  context.on('request', req => {
    allRequests.push({ method: req.method(), url: req.url() });
  });

  context.on('response', async response => {
    const url = response.url();
    const status = response.status();
    console.log(`${status} ${url}`);
    // Save any 200 JS/HTML files
    if (status === 200 && (url.includes('.js') || url.includes('.html'))) {
      try {
        const body = await response.body();
        if (body.length > 500 && body.length !== 6659) {
          const fn = url.split('/').pop().split('?')[0] || 'index.html';
          fs.writeFileSync('output/' + fn, body);
          console.log(`[SAVED] ${fn} ${body.length}B`);
        }
      } catch(e) {}
    }
  });

  const page = await context.newPage();
  try {
    await page.goto(`${BASE}/channel/0.O.ZY/weifile/weifile.html`, { 
      waitUntil: 'networkidle', timeout: 25000 
    });
    await page.waitForTimeout(5000);
  } catch(e) { console.log(`NAV: ${e.message.slice(0,100)}`); }

  fs.writeFileSync('output/all_requests.json', JSON.stringify(allRequests, null, 2));
  console.log('\nTotal requests:', allRequests.length);
  await browser.close();
})();
