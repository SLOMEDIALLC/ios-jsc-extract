const { webkit } = require('playwright');
const fs = require('fs');

const IOS16_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const BASE = 'https://vipusdtai.cam/channel/0.O.ZY/weifile';

fs.mkdirSync('output/mods', { recursive: true });

const allReqs = [];
const savedFiles = {};

(async () => {
  const browser = await webkit.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: IOS16_UA,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    viewport: { width: 390, height: 844 }
  });

  context.on('response', async response => {
    const url = response.url();
    const status = response.status();
    allReqs.push({ status, url, size: 0 });

    if (status === 200) {
      try {
        const body = await response.body();
        allReqs[allReqs.length-1].size = body.length;
        
        // 保存所有sha1命名的js模块
        const sha1Match = url.match(/\/([a-f0-9]{40})\.js/);
        if (sha1Match && body.length > 500) {
          const sha = sha1Match[1];
          if (!savedFiles[sha]) {
            savedFiles[sha] = body.length;
            fs.writeFileSync('output/mods/' + sha + '.js', body);
            console.log('[MOD] ' + sha.slice(0,8) + ' ' + body.length + 'B from ' + url);
          }
        }
        // 也保存其他JS文件
        else if (url.includes('.js') && !url.includes('cdn.') && !url.includes('fonts.') && body.length > 500 && body.length !== 6659) {
          const fn = url.split('/').pop().split('?')[0];
          if (fn && !savedFiles[fn]) {
            savedFiles[fn] = body.length;
            fs.writeFileSync('output/' + fn, body);
            console.log('[JS] ' + fn + ' ' + body.length + 'B');
          }
        }
      } catch(e) {}
    }
    
    if (!url.includes('fonts.') && !url.includes('cdn.tail') && !url.includes('statistic')) {
      console.log(status + ' ' + url.replace('https://vipusdtai.cam','[cam]'));
    }
  });

  const page = await context.newPage();
  
  try {
    console.log('[*] Loading weifile.html with iOS 16 UA...');
    await page.goto('https://vipusdtai.cam/channel/0.O.ZY/weifile/weifile.html', {
      waitUntil: 'load', timeout: 20000
    });
    // 等足够长时间让exploit链完整执行
    console.log('[*] Waiting 35s for full exploit chain execution...');
    await page.waitForTimeout(35000);
  } catch(e) { console.log('NAV: ' + e.message.slice(0,100)); }

  console.log('\n=== Summary ===');
  console.log('Total requests:', allReqs.length);
  console.log('Saved modules:', Object.keys(savedFiles).length);
  
  const sha1reqs = allReqs.filter(r => r.url.match(/[a-f0-9]{40}\.js/));
  console.log('SHA1 module requests:', sha1reqs.length);
  sha1reqs.forEach(r => console.log('  ' + r.status + ' ' + r.size + 'B ' + r.url.split('/').pop()));

  fs.writeFileSync('output/network_log.json', JSON.stringify(allReqs, null, 2));
  fs.writeFileSync('output/module_list.json', JSON.stringify(Object.keys(savedFiles), null, 2));
  
  await browser.close();
})();
