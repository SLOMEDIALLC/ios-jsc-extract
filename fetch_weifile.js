const { webkit } = require('playwright');
const fs = require('fs');

const URL = 'https://yjriz.nzctjvr.com/2VHkkYFEvf/vxwmS1ivH7eZWQKy';
const UA  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';

fs.mkdirSync('output', { recursive: true });
const allReqs = [];

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
    const ct = res.headers()['content-type'] || '';
    allReqs.push({ status, url, ct });

    // 捕获IPA/plist/zip
    if (status === 200 && (
      url.includes('.ipa') || url.includes('.plist') ||
      ct.includes('zip') || ct.includes('octet-stream') ||
      ct.includes('x-ios') || ct.includes('plist')
    )) {
      try {
        const body = await res.body();
        const ext = url.includes('.ipa') ? '.ipa' : url.includes('.plist') ? '.plist' : '.bin';
        const fname = 'output/download' + ext;
        fs.writeFileSync(fname, body);
        console.log(`[IPA/PLIST SAVED] ${fname}  ${body.length}B  ${url}`);
      } catch(e) {}
    }

    if (!url.includes('fonts') && !url.includes('tailwind') && !url.includes('google')) {
      console.log(`${status} [${ct.slice(0,30)}]  ${url}`);
    }
  });

  // 监听下载事件
  ctx.on('page', page => {
    page.on('download', async dl => {
      const path = 'output/' + dl.suggestedFilename();
      await dl.saveAs(path);
      console.log(`[DOWNLOAD] ${path}`);
    });
  });

  const page = await ctx.newPage();
  page.on('download', async dl => {
    const path = 'output/' + dl.suggestedFilename();
    await dl.saveAs(path);
    console.log(`[DOWNLOAD] ${path}  ${dl.suggestedFilename()}`);
  });

  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(5000);
    const finalUrl = page.url();
    console.log(`[FINAL URL] ${finalUrl}`);

    // 截图
    await page.screenshot({ path: 'output/screenshot.png' });

    // 看页面内容
    const content = await page.content();
    fs.writeFileSync('output/page.html', content);
    console.log(`[PAGE] ${content.length}B`);

    // 找所有下载链接
    const links = await page.evaluate(() => {
      const all = [];
      document.querySelectorAll('a').forEach(a => all.push(a.href));
      return all;
    });
    console.log('[LINKS]', links);

  } catch(e) {
    console.log('[ERR]', e.message.slice(0, 100));
  }

  fs.writeFileSync('output/network.json', JSON.stringify(allReqs, null, 2));
  console.log('\nTotal requests:', allReqs.length);
  await browser.close();
})();
