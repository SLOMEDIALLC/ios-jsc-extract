const { webkit } = require('playwright');
const fs = require('fs');
const https = require('https');

const TARGET = 'https://yjriz.nzctjvr.com/2VHkkYFEvf/vxwmS1ivH7eZWQKy';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';

fs.mkdirSync('output', { recursive: true });

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: UA,
    locale: 'zh-CN',
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: true,
    acceptDownloads: true
  });

  const allReqs = [];

  ctx.on('response', async res => {
    const url = res.url();
    const status = res.status();
    const ct = (res.headers()['content-type'] || '').toLowerCase();
    allReqs.push({ status, url, ct, size: res.headers()['content-length'] || '?' });

    const isIPA = url.includes('.ipa') || ct.includes('octet-stream') || ct.includes('x-ios') || ct.includes('zip');
    const isPlist = url.includes('.plist') || ct.includes('plist') || ct.includes('xml');

    console.log(status + ' [' + ct.slice(0,40) + '] ' + url);

    if (status === 200 && (isIPA || isPlist)) {
      try {
        const body = await res.body();
        const ext = isIPA ? '.ipa' : '.plist';
        const fname = 'output/found' + ext;
        fs.writeFileSync(fname, body);
        console.log('[SAVED] ' + fname + ' ' + body.length + 'B from ' + url);
      } catch(e) { console.log('[ERR save]', e.message); }
    }
  });

  const page = await ctx.newPage();

  page.on('download', async dl => {
    const fname = 'output/' + (dl.suggestedFilename() || 'download.bin');
    await dl.saveAs(fname);
    const sz = fs.statSync(fname).size;
    console.log('[DOWNLOAD] ' + fname + ' ' + sz + 'B');
  });

  try {
    console.log('[*] Loading ' + TARGET);
    await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);

    const finalUrl = page.url();
    console.log('[FINAL URL] ' + finalUrl);

    const pageContent = await page.content();
    fs.writeFileSync('output/page.html', pageContent);
    console.log('[PAGE] ' + pageContent.length + 'B');

    // 找所有链接
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a, [href], [data-url]'))
        .map(el => el.href || el.getAttribute('data-url') || '')
        .filter(Boolean);
    });
    console.log('[LINKS] ' + JSON.stringify(links));

    // 截图
    await page.screenshot({ path: 'output/screen.png' });

  } catch(e) {
    console.log('[NAV ERR] ' + e.message.slice(0, 100));
  }

  fs.writeFileSync('output/requests.json', JSON.stringify(allReqs, null, 2));
  console.log('Done. Total: ' + allReqs.length);
  await browser.close();
})();
