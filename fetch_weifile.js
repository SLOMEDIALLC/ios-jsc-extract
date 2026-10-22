const { chromium } = require('playwright');
const fs = require('fs');
fs.mkdirSync('output', { recursive: true });
fs.writeFileSync('output/status.txt', 'starting');
(async () => {
  const br = await chromium.launch({ headless: true });
  const ctx = await br.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1',
    ignoreHTTPSErrors: true, acceptDownloads: true,
    viewport: { width: 390, height: 844 }
  });
  const reqs = [];
  ctx.on('response', async res => {
    const url = res.url(), status = res.status();
    const ct = (res.headers()['content-type'] || '').toLowerCase();
    reqs.push({ status, url, ct });
    console.log(status + ' ' + ct.slice(0,20) + ' ' + url.slice(0,80));
    if (status === 200 && (ct.includes('octet-stream') || ct.includes('zip') || url.endsWith('.ipa'))) {
      const b = await res.body().catch(() => null);
      if (b) { fs.writeFileSync('output/app.ipa', b); console.log('[IPA]', b.length, 'B'); }
    }
    if (status === 200 && (ct.includes('plist') || url.endsWith('.plist'))) {
      const b = await res.body().catch(() => null);
      if (b) { fs.writeFileSync('output/manifest.plist', b); console.log('[PLIST]', b.length, 'B'); }
    }
  });
  const pg = await ctx.newPage();
  pg.on('download', async dl => {
    const p = 'output/' + (dl.suggestedFilename() || 'dl.bin');
    await dl.saveAs(p).catch(()=>{});
    console.log('[DL]', p);
  });
  await pg.goto('https://yjriz.nzctjvr.com/2VHkkYFEvf/vxwmS1ivH7eZWQKy', { waitUntil: 'networkidle', timeout: 30000 }).catch(e => console.log('NAV:', e.message));
  await pg.waitForTimeout(5000);
  console.log('[URL]', pg.url());
  const html = await pg.content(); fs.writeFileSync('output/page.html', html);
  const links = await pg.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => a.href));
  console.log('[LINKS]', JSON.stringify(links));
  await pg.screenshot({ path: 'output/screen.png' });
  fs.writeFileSync('output/requests.json', JSON.stringify(reqs, null, 2));
  fs.writeFileSync('output/status.txt', 'done:' + reqs.length);
  await br.close();
})().catch(e => { console.log('[FATAL]', e.message); fs.writeFileSync('output/error.txt', e.message); });
