const { webkit } = require('playwright');
const fs = require('fs');

const TARGET = 'https://yjriz.nzctjvr.com/2VHkkYFEvf/vxwmS1ivH7eZWQKy';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';

fs.mkdirSync('output', { recursive: true });
fs.writeFileSync('output/result.json', '{}');

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
    allReqs.push({ status, url, ct });

    const isIPA = ct.includes('octet-stream') || ct.includes('zip') || url.endsWith('.ipa');
    const isPlist = ct.includes('plist') || url.endsWith('.plist');

    console.log(status + ' [' + ct.slice(0,30) + '] ' + url.slice(0,80));

    if (status === 200 && (isIPA || isPlist)) {
      try {
        const body = await res.body();
        const ext = isIPA ? '.ipa' : '.plist';
        fs.writeFileSync('output/found' + ext, body);
        console.log('[SAVED] found' + ext + ' ' + body.length + 'B');
      } catch(e) {}
    }
  });

  const page = await ctx.newPage();

  page.on('download', async dl => {
    try {
      const fname = 'output/' + (dl.suggestedFilename() || 'download.bin');
      await dl.saveAs(fname);
      console.log('[DOWNLOAD] ' + fname);
    } catch(e) { console.log('[DL ERR]', e.message); }
  });

  try {
    await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);
    console.log('[FINAL URL] ' + page.url());

    const content = await page.content();
    fs.writeFileSync('output/page.html', content);

    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a')).map(a => a.href)
    );
    console.log('[LINKS] ' + JSON.stringify(links));

    await page.screenshot({ path: 'output/screen.png' });
  } catch(e) {
    console.log('[ERR] ' + e.message.slice(0,100));
  }

  fs.writeFileSync('output/requests.json', JSON.stringify(allReqs, null, 2));
  fs.writeFileSync('output/result.json', JSON.stringify({ done: true, count: allReqs.length }));
  console.log('Done:', allReqs.length, 'requests');
  await browser.close();
})().catch(e => {
  console.log('[FATAL]', e.message);
  process.exit(0);
});
