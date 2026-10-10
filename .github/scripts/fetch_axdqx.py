"""
BrowserStack Real iOS Safari — 拦截XHR/fetch，保存缺失文件
"""
import os, sys, time, json, re

BS_USER = os.environ["BS_USERNAME"]
BS_KEY  = os.environ["BS_ACCESS_KEY"]
TARGET  = "https://tt.axdqx.shop/?uid=uhtjf_q2ed_test"
OUT     = "output"
os.makedirs(OUT, exist_ok=True)
os.makedirs(f"{OUT}/profiles", exist_ok=True)
os.makedirs(f"{OUT}/plugins", exist_ok=True)

from selenium import webdriver
from selenium.webdriver.common.options import ArgOptions

INTERCEPT_JS = """
if (!window.__interceptInstalled) {
  window.__interceptInstalled = true;
  window.__captured = {};
  window.__capturedList = [];

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m, url) {
    this._url = String(url);
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    this.addEventListener('load', function() {
      const url = this._url || '';
      const fname = url.split('/').pop().split('?')[0];
      if (this.status === 200 && this.responseText && this.responseText.length > 50) {
        window.__captured[fname] = {url: url, body: this.responseText};
        window.__capturedList.push({url: url, fname: fname, size: this.responseText.length});
        console.log('[CAP] ' + fname + ' ' + this.responseText.length);
      }
    });
    return origSend.apply(this, arguments);
  };

  const origFetch = window.fetch;
  window.fetch = async function(url, opts) {
    const resp = await origFetch(url, opts);
    try {
      const clone = resp.clone();
      const text = await clone.text();
      const fname = String(url).split('/').pop().split('?')[0];
      if (resp.ok && text.length > 50) {
        window.__captured[fname] = {url: String(url), body: text};
        window.__capturedList.push({url: String(url), fname: fname, size: text.length});
        console.log('[CAP] ' + fname + ' ' + text.length);
      }
    } catch(e) {}
    return resp;
  };
  console.log('[INTERCEPT] OK');
}
"""

def make_driver(ios_ver, device_name):
    options = ArgOptions()
    options.set_capability("browserName", "Safari")
    options.set_capability("bstack:options", {
        "deviceName":      device_name,
        "osVersion":       ios_ver,
        "realMobile":      "true",
        "local":           "true",
        "localIdentifier": "axdqx-fetch",
        "networkLogs":     "true",
        "consoleLogs":     "verbose",
        "debug":           "true",
        "sessionName":     f"axdqx-{device_name}-{ios_ver}",
    })
    hub = f"https://{BS_USER}:{BS_KEY}@hub.browserstack.com/wd/hub"
    return webdriver.Remote(command_executor=hub, options=options)

def run(ios_ver, device, wait=90):
    print(f"\n[*] iOS {ios_ver} / {device}")
    driver = make_driver(ios_ver, device)
    print(f"[*] Session: {driver.session_id}")
    all_captured = {}
    try:
        driver.get(TARGET)
        print(f"[*] Loaded {TARGET}")
        time.sleep(3)
        driver.execute_script(INTERCEPT_JS)
        print(f"[*] Waiting {wait}s...")
        for i in range(0, wait, 20):
            time.sleep(20)
            try:
                lst = driver.execute_script("return (window.__capturedList||[]).map(function(x){return x.fname+':'+x.size;});")
                print(f"  [{i+20}s] {lst}")
            except: pass
        # 收集
        cap = driver.execute_script("return window.__captured || {};") or {}
        for fname, data in cap.items():
            body = data.get('body','') if isinstance(data,dict) else str(data)
            url  = data.get('url','') if isinstance(data,dict) else ''
            if not body: continue
            # 按路径分类保存
            if re.search(r'ios_\d+', fname) and fname.endswith('.json'):
                path = f"{OUT}/profiles/{fname}"
            elif 'exploit.js' in fname and 'CVE' in url:
                cve = re.search(r'CVE-[\d-]+', url)
                if cve:
                    d = f"{OUT}/plugins/{cve.group()}"
                    os.makedirs(d, exist_ok=True)
                    path = f"{d}/exploit.js"
                else:
                    path = f"{OUT}/{fname}"
            else:
                path = f"{OUT}/{fname}"
            with open(path,'w',encoding='utf-8') as f:
                f.write(body)
            print(f"[SAVED] {path} ({len(body)}B)")
            all_captured[fname] = len(body)
    except Exception as e:
        print(f"[!] {e}")
    finally:
        driver.quit()
    return all_captured

saved = {}
# iOS 15 — ios_15_0.json
saved.update(run("15", "iPhone 13", wait=70))
# iOS 18.4 — post-exploitation data modules
saved.update(run("18", "iPhone 14 Pro", wait=100))

print(f"\n=== Saved {len(saved)} files ===")
for k,v in saved.items(): print(f"  {k}: {v}B")
with open(f"{OUT}/summary.json",'w') as f:
    json.dump(saved, f, indent=2)
