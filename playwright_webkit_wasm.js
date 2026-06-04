/**
 * Use Playwright WebKit (JavaScriptCore) to intercept Wasm from obfuscated JS.
 * WebKit uses JSC — the same engine as iOS Safari — so the e[5]!==6.6 check
 * passes and P.zn.Xn gets properly initialized.
 */
const { webkit } = require('playwright');
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CI_MODE   = process.argv.includes('--ci') || process.env.CI === 'true';
const SERVE_DIR = path.resolve('参考/1DECX7UIQIB1Z/gooll');
const OUT_DIR   = path.resolve('参考解密完整/wasm/webkit');
const JSON_OUT  = path.resolve('output/result.json');
const PORT      = 8766;
const TARGET    = '7f01616a0505c05bbe02aeee8a21665f5d2401a3.html';
const WASM2WAT  = path.join('node_modules/.bin/wasm2wat');
const IOS_UA    = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
if (CI_MODE) console.log('[ci] CI mode enabled');

// ─── Local HTTP server ────────────────────────────────────────────────────────
function createServer() {
    return http.createServer((req, res) => {
        const u = req.url.split('?')[0];
        const fp = path.join(SERVE_DIR, decodeURIComponent(u.slice(1)));
        if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
            const ext = path.extname(fp);
            const ct = ext === '.js' ? 'application/javascript' :
                       ext === '.html' ? 'text/html' :
                       'application/octet-stream';
            res.writeHead(200, { 'Content-Type': ct });
            res.end(fs.readFileSync(fp));
        } else {
            res.writeHead(404); res.end('Not found');
        }
    });
}

async function main() {
    const server = createServer();
    await new Promise(r => server.listen(PORT, r));
    console.log(`[server] http://localhost:${PORT}/ → ${SERVE_DIR}`);

    // ── Patch 6beef463: debug e[5] + force JSC branch + safe Co ──────────────
    const BEEF_FILE = path.join(SERVE_DIR, '6beef463953ff422511395b79735ec990bed65f4.js');
    let beefPatched = null;
    if (fs.existsSync(BEEF_FILE)) {
        let src = fs.readFileSync(BEEF_FILE, 'utf8');
        const ORIG = 'if(e[5]!==6.6){o("");try{o("");c.ws=c.Oi.Co(e[0]);c.ds=c.Oi.Co(e[1]);c.ys=c.Oi.Co(e[2]);c.As=c.Oi.Co(e[3]);c.Us=c.Oi.Co(e[4]);P.zn.Xn=c;t()}catch(t){o(t)}}else window.setTimeout(u,0)';
        const PATCH = '{const _sC=(v)=>{try{return c.Oi.Co(v)}catch(_e){console.log("[Co ERR]",String(_e));return 0n}};console.log("[e5]",typeof e[5],String(e[5]));try{window.__e5_value=String(e[5]);}catch(_){};try{e.forEach((v,i)=>{try{console.log("[e"+i+"]",typeof v,String(v))}catch(_){}});}catch(_){};o("");try{o("");c.ws=_sC(e[0]);c.ds=_sC(e[1]);c.ys=_sC(e[2]);c.As=_sC(e[3]);c.Us=_sC(e[4]);console.log("[Xn]","ws="+String(c.ws),"ds="+String(c.ds));P.zn.Xn=c;t()}catch(t){o(t);console.log("[JSC ERR]",t&&String(t))}}';
        if (src.includes(ORIG)) {
            beefPatched = src.replace(ORIG, PATCH);
            console.log('[patch] 6beef463 debug-patched OK');
        } else {
            console.log('[patch] 6beef463 ORIG not found — check string');
        }
    }

    const browser = await webkit.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: IOS_UA,
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        javaScriptEnabled: true,
    });
    const page = await context.newPage();

    // Intercept Wasm + patch P.On() + monitor P.zn.Xn
    await page.addInitScript(`
        (function() {
            // ── Patch WebAssembly to capture bytes ─────────────────────────
            const _origCompile     = WebAssembly.compile;
            const _origInstantiate = WebAssembly.instantiate;
            const _origModule      = WebAssembly.Module;
            const _origCSt         = WebAssembly.compileStreaming;
            const _origISt         = WebAssembly.instantiateStreaming;
            window.__wasm_captured = [];

            function captureBytes(src, bytes, tag) {
                try {
                    const buf = bytes instanceof ArrayBuffer ? bytes :
                                bytes instanceof Uint8Array  ? bytes.buffer : null;
                    if (!buf) return;
                    const view = new Uint8Array(buf);
                    if (view[0]===0 && view[1]===0x61 && view[2]===0x73 && view[3]===0x6d) {
                        const arr = Array.from(view);
                        window.__wasm_captured.push({ arr, len: arr.length, tag });
                        console.log('[wasm] CAPTURED magic=0061736d len=' + arr.length + ' tag=' + tag);
                    }
                } catch(e) {}
            }

            WebAssembly.Module = function(bytes, ...a) {
                captureBytes('Module', bytes, 'new_Module');
                return new _origModule(bytes, ...a);
            };
            Object.setPrototypeOf(WebAssembly.Module, _origModule);
            WebAssembly.Module.prototype = _origModule.prototype;

            WebAssembly.compile = function(bytes) {
                captureBytes('compile', bytes, 'compile');
                return _origCompile(bytes);
            };
            WebAssembly.instantiate = function(bytes, imports) {
                captureBytes('instantiate', bytes, 'instantiate');
                return _origInstantiate(bytes, imports);
            };
            WebAssembly.compileStreaming = function(resp) {
                resp.then(r => r.arrayBuffer().then(b => captureBytes('cs', b, 'compileStreaming'))).catch(()=>{});
                return _origCSt(resp);
            };
            WebAssembly.instantiateStreaming = function(resp, imports) {
                resp.then(r => r.arrayBuffer().then(b => captureBytes('is', b, 'instStreaming'))).catch(()=>{});
                return _origISt(resp, imports);
            };

            // ── Monitor P.zn.Xn ───────────────────────────────────────────
            let _monitorDone = false;
            function installXnMonitor() {
                try {
                    const obC = globalThis.obChTK;
                    if (!obC) { setTimeout(installXnMonitor, 200); return; }
                    const P = obC.hPL3On('14669ca3b1519ba2a8f40be287f646d4d7593eb0');
                    if (!P || !P.zn) { setTimeout(installXnMonitor, 200); return; }
                    if (_monitorDone) return; _monitorDone = true;
                    let _xn = P.zn.Xn;
                    Object.defineProperty(P.zn, 'Xn', {
                        get() { return _xn; },
                        set(v) {
                            const st = new Error().stack.split('\\n')[1]||'';
                            console.log('[XN SET] ' + (v==null?'null':v==undefined?'undef':typeof v) + ' ' + st.trim().slice(0,80));
                            _xn = v;
                        },
                        configurable: true, enumerable: true
                    });
                    console.log('[XN monitor] installed, current=' + (_xn==null?'null':_xn==undefined?'undef':typeof _xn));
                } catch(e) { console.log('[XN monitor ERR] ' + e.message); }
            }
            setTimeout(installXnMonitor, 300);

            // ── Fake Worker: bypass blob Worker for scanner ────────────────
            // Playwright WebKit can't load blob: Workers → use fake Worker
            // type constants: n=0 ignore, r=1 retry, i=2 success, s=3 start
            const _OrigWorker = window.Worker;
            window.Worker = function(url, opts) {
                const urlStr = String(url);
                if (urlStr.startsWith('blob:')) {
                    console.log('[FakeWorker] blob url intercepted');
                    let _onmsg = null;
                    const fw = {
                        _listeners: [],
                        postMessage(data) {
                            const t = data && data.type;
                            console.log('[FakeWorker] got postMessage type=' + t);
                            // type=3(s)=start → reply type=2(i)=success
                            if (t === 3) {
                                const reply = () => {
                                    console.log('[FakeWorker] sending type=2 success');
                                    const evt = { data: { type: 2 } };
                                    if (_onmsg) _onmsg(evt);
                                    fw._listeners.forEach(fn => fn(evt));
                                };
                                setTimeout(reply, 100);
                            }
                        },
                        terminate() { console.log('[FakeWorker] terminate'); },
                        addEventListener(type, fn) {
                            if (type === 'message') fw._listeners.push(fn);
                        },
                        removeEventListener() {}
                    };
                    Object.defineProperty(fw, 'onmessage', {
                        get() { return _onmsg; },
                        set(fn) { _onmsg = fn; console.log('[FakeWorker] onmessage set'); },
                        configurable: true
                    });
                    Object.defineProperty(fw, 'onerror', {
                        get() { return null; },
                        set(fn) {},
                        configurable: true
                    });
                    return fw;
                }
                // Real non-blob Worker
                const w = new _OrigWorker(url, opts);
                console.log('[Worker] real, url=' + urlStr.slice(0,30));
                return w;
            };

            // ── Patch anti-bot: override P.On() ───────────────────────────
            const __origST = window.setTimeout;
            window.setTimeout = function(fn, delay, ...args) {
                if (typeof fn === 'function' && delay <= 100) {
                    return __origST(function() {
                        try {
                            if (typeof fqMaGkNK !== 'undefined') {
                                fqMaGkNK.On = () => false;
                                console.log('[patch] fqMaGkNK.On = false');
                            }
                        } catch(e) {}
                        fn.apply(this, args);
                    }, delay);
                }
                return __origST(fn, delay, ...args);
            };

            // ── XHR monitor ───────────────────────────────────────────────
            const _xhrOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(m, url, ...a) {
                console.log('[XHR] ' + m + ' ' + String(url).slice(-70));
                return _xhrOpen.call(this, m, url, ...a);
            };

            // ── Log P.zn.Rn.Ad calls ──────────────────────────────────────
            function patchRnAd() {
                try {
                    const P = globalThis.obChTK.hPL3On('14669ca3b1519ba2a8f40be287f646d4d7593eb0');
                    if (P && P.zn && P.zn.Rn && P.zn.Rn.Ad) {
                        const _origAd = P.zn.Rn.Ad.bind(P.zn.Rn);
                        P.zn.Rn.Ad = function(...args) {
                            console.log('[Rn.Ad] called with ' + args.length + ' args, key type=' + typeof args[1]);
                            return _origAd(...args);
                        };
                        console.log('[patch] P.zn.Rn.Ad wrapped');
                        return true;
                    }
                } catch(e) {}
                return false;
            }
            function tryPatchRnAd() {
                if (!patchRnAd()) setTimeout(tryPatchRnAd, 500);
            }
            setTimeout(tryPatchRnAd, 1000);
        })();
    `);

    // Route intercept for patched beef463
    if (beefPatched) {
        await page.route('**/6beef463953ff422511395b79735ec990bed65f4.js**', async route => {
            console.log('[route] Serving patched 6beef463');
            await route.fulfill({ status: 200, contentType: 'application/javascript', body: beefPatched });
        });
    }

    page.on('console', msg => {
        const t = msg.text();
        if (t.length < 500) console.log(' PAGE:', t);
    });
    page.on('pageerror', err => console.error(' PAGE ERR:', err.message.slice(0, 200)));

    console.log(`[webkit] Navigating to http://localhost:${PORT}/${TARGET}`);
    try {
        await page.goto(`http://localhost:${PORT}/${TARGET}`, {
            waitUntil: 'networkidle',
            timeout: 30000,
        });
    } catch (e) {
        console.log('[nav] timeout/warn:', e.message.slice(0, 100));
    }

    // After page load: patch P, call explicit ZKvD0e, call P.lr()
    const HASHES = [
        'ba712ef6c1bf20758e69ab945d2cdfd51e53dcd8',
        '35fceec39ceadf8b93ba3a29fe4643cb25994558',
        'b5135768e043d1b362977b8ba9bff678b9946bcb',
        '477db22c8e27d5a7bd72ca8e4bc502bdca6d0aba',
        '29b874a9a6cc9fa9d487b31144e130827bf941bb',
        '9db8a84aa7caa5665f522873f49293e8eebccd5c',
        '171a7da1934de9e0efb9c1645f4575f88e482873',
        '91b278ddb2aec817b10c1535e0963da74f9b8eeb',
        'b586c88246144bc7975ad4e27ec6d62716bf34ea',
        'e3b6ba10484875fabaed84076774a54b87752b8a',
        '57cb8c6431c5efe203f5bfa5a1a83f705cb350b8',
        'd11d34e4d96a4c0539e441d861c5783db8a1c6e9',
        'ea3da0cfb0a5bdb8c440dd4a963f94cbd39d9e44',
        '7d8f5bae97f37aa318bccd652bf0c1dc38fd8396',
        '7f809f320823063b55f26ba0d29cf197e2e333a8',
        'c03c6f666a04dd77cfe56cda4da77a131cbb8f1c',
    ];

    await page.evaluate(async (hashes) => {
        // Patch P.On()
        try {
            const P = globalThis.obChTK.hPL3On('14669ca3b1519ba2a8f40be287f646d4d7593eb0');
            if (P) { P.On = () => false; console.log('[patch] P.On = false'); }
        } catch(e) { console.log('[patch] P err:', e.message); }

        // Load all known modules
        console.log('[load] Loading all ' + hashes.length + ' modules via ZKvD0e...');
        for (const h of hashes) {
            try {
                const mod = await globalThis.obChTK.ZKvD0e(h);
                const shortH = h.slice(0,8);
                console.log('[ZKvD0e] OK: ' + shortH);

                // For 6beef463 (e3b6ba10): call r.si() to trigger ht()->a()->Worker->u()
                if (shortH === 'e3b6ba10' && mod && typeof mod.si === 'function') {
                    console.log('[si] Calling r.si() to start scanner...');
                    try {
                        const xnResult = await Promise.race([
                            mod.si(),
                            new Promise((_,rej) => setTimeout(() => rej(new Error('timeout')), 15000))
                        ]);
                        console.log('[si] resolved: ' + (xnResult==null?'null':xnResult==undefined?'undef':typeof xnResult));
                    } catch(siErr) {
                        console.log('[si] ERR/timeout: ' + siErr.message.slice(0,80));
                    }
                }
            } catch(e) {
                console.log('[ZKvD0e] ERR ' + h.slice(0,8) + ': ' + e.message.slice(0,60));
            }
        }

        // Wait a moment for any async init triggered by si()
        await new Promise(r => setTimeout(r, 1000));

        // State check
        try {
            const P = globalThis.obChTK.hPL3On('14669ca3b1519ba2a8f40be287f646d4d7593eb0');
            const zn = P && P.zn;
            if (zn) {
                console.log('[state] Xn=' + (zn.Xn==null?'null':zn.Xn==undefined?'undef':typeof zn.Xn));
                console.log('[state] Rn=' + (zn.Rn==null?'null':zn.Rn==undefined?'undef':typeof zn.Rn));
                console.log('[state] runtime=' + JSON.stringify(zn.runtime));
                console.log('[state] P.On()=' + P.On());
                // List all P.zn keys
                console.log('[state] zn.keys=' + Object.keys(zn).join(','));
            }
        } catch(e) { console.log('[state ERR]', e.message); }

        // Try P.init
        try {
            const P = globalThis.obChTK.hPL3On('14669ca3b1519ba2a8f40be287f646d4d7593eb0');
            await P.init();
            console.log('[P.init] OK');
        } catch(e) { 
            const stack = e.stack ? e.stack.split('\n').slice(0,4).join(' | ') : '';
            console.log('[P.init ERR] msg=' + JSON.stringify(e.message) + ' stack=' + stack.slice(0,200)); 
        }

        // Try P.lr with full error stack
        try {
            const P = globalThis.obChTK.hPL3On('14669ca3b1519ba2a8f40be287f646d4d7593eb0');
            await P.lr();
            console.log('[P.lr] OK');
        } catch(e) { 
            const stack = e.stack ? e.stack.split('\n').slice(0,5).join(' | ') : '';
            console.log('[P.lr ERR] msg=' + JSON.stringify(e.message) + ' stack=' + stack.slice(0,300));
        }

        // Try to start the c03c6f module
        try {
            const mod = await globalThis.obChTK.ZKvD0e('c03c6f666a04dd77cfe56cda4da77a131cbb8f1c');
            if (mod && mod.lA) { await mod.lA(); console.log('[lA] OK'); }
            else if (mod && mod.start) { await mod.start(); console.log('[start] OK'); }
        } catch(e) { 
            const stack = e.stack ? e.stack.split('\n').slice(0,4).join(' | ') : '';
            console.log('[lA/start ERR] msg=' + JSON.stringify(e.message) + ' ' + stack.slice(0,200)); 
        }
    }, HASHES);

    // Wait up to 120s (30s in CI) for Wasm captures
    const MAX_WAIT = CI_MODE ? 30 : 120;
    let lastCount = 0;
    let e5Seen = 'unknown';
    console.log(`[wait] Watching for Wasm captures (up to ${MAX_WAIT}s)...`);
    for (let i = 0; i < MAX_WAIT; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const count = await page.evaluate(() => (window.__wasm_captured || []).length);
        const xnState = await page.evaluate(() => {
            try {
                const P = globalThis.obChTK && globalThis.obChTK.hPL3On('14669ca3b1519ba2a8f40be287f646d4d7593eb0');
                const xn = P && P.zn && P.zn.Xn;
                return xn==null?'null':xn==undefined?'undef':typeof xn;
            } catch(e) { return 'err'; }
        }).catch(() => 'err');
        // Capture e5 value from page logs
        const e5Val = await page.evaluate(() => window.__e5_value).catch(() => null);
        if (e5Val !== null && e5Val !== undefined) e5Seen = String(e5Val);
        process.stdout.write(`\r  ${i+1}s  wasm=${count}  Xn=${xnState}  e5=${e5Seen}  `);
        if (count > lastCount) {
            lastCount = count;
            console.log(`\n  [+${i+1}s] NEW wasm! total=${count}`);
        }
        if (count > 1 && i >= 5) break;
    }
    console.log();

    // Collect and save
    const captured = await page.evaluate(() => window.__wasm_captured || []);
    const xnFinal = await page.evaluate(() => {
        try {
            const P = globalThis.obChTK && globalThis.obChTK.hPL3On('14669ca3b1519ba2a8f40be287f646d4d7593eb0');
            return (P && P.zn && P.zn.Xn) ? 'true' : 'false';
        } catch(e) { return 'false'; }
    }).catch(() => 'false');
    console.log(`\n[result] Captured ${captured.length} Wasm module(s), Xn=${xnFinal}, e5=${e5Seen}`);

    // Save JSON result for CI
    const result = { xn_set: xnFinal, e5_value: e5Seen, wasm_count: captured.length, timestamp: new Date().toISOString() };
    fs.writeFileSync(JSON_OUT, JSON.stringify(result, null, 2));
    console.log(`[ci] Saved result → ${JSON_OUT}`);

    await browser.close();
    server.close();

    for (let i = 0; i < captured.length; i++) {
        const { arr, len, tag } = captured[i];
        const buf = Buffer.from(arr);
        const name = `webkit_wasm_${i}.wasm`;
        const fp = path.join(OUT_DIR, name);
        fs.writeFileSync(fp, buf);
        console.log(`  saved ${name}  (${len} bytes)  tag=${tag}`);
        // Decompile
        const watPath = fp.replace('.wasm', '.wat');
        try {
            execSync(`"${WASM2WAT}" "${fp}" -o "${watPath}"`, { stdio: 'pipe' });
            console.log(`    → .wat  (${fs.statSync(watPath).size} chars)`);
        } catch(e) {
            console.log('    → wasm2wat failed');
        }
    }

    console.log(`\n[done] Output: ${OUT_DIR}`);
}

main().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });
