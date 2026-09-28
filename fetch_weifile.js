const { webkit } = require('playwright');
const fs = require('fs');

const IOS16_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

fs.mkdirSync('output', { recursive: true });
const allNet = [];

(async () => {
  const browser = await webkit.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: IOS16_UA,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    viewport: { width: 390, height: 844 }
  });

  context.on('request', req => {
    allNet.push({ type: 'REQ', method: req.method(), url: req.url() });
  });

  context.on('response', async response => {
    const url = response.url();
    const status = response.status();
    allNet.push({ type: 'RES', status, url });
    console.log(`${status} ${url}`);
    
    // 保存所有200的JS文件（排除已知的）
    if (status === 200 && url.includes('.js') && !url.includes('cdn.') && !url.includes('fonts.')) {
      try {
        const body = await response.body();
        if (body.length > 1000 && body.length !== 6659) {
          const fn = url.split('/').pop().split('?')[0] || 'unknown.js';
          fs.writeFileSync('output/' + fn, body);
          console.log(`[SAVED] ${fn} ${body.length}B`);
        }
      } catch(e) {}
    }
  });

  // 也捕获Worker里的请求
  context.on('worker', worker => {
    console.log('[WORKER]', worker.url());
  });

  const page = await context.newPage();
  try {
    await page.goto('https://vipusdtai.cam/channel/0.O.ZY/weifile/weifile.html', { 
      waitUntil: 'networkidle', timeout: 25000 
    });
    // 等更长时间捕获懒加载的模块
    await page.waitForTimeout(10000);
  } catch(e) { console.log('NAV:', e.message.slice(0,100)); }

  fs.writeFileSync('output/network_log.json', JSON.stringify(allNet, null, 2));
  console.log('\nTotal network events:', allNet.length);
  await browser.close();
})();
