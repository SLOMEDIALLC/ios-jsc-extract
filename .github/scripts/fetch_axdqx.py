"""
BrowserStack Real iOS Safari — 访问 axdqx.shop，拦截所有XHR/fetch响应，保存缺失文件
"""
import os, sys, time, json, re, base64, requests

BS_USER = os.environ["BS_USERNAME"]
BS_KEY  = os.environ["BS_ACCESS_KEY"]
TARGET  = "https://tt.axdqx.shop/?uid=uhtjf_q2ed_test"
OUT     = "output"
os.makedirs(OUT, exist_ok=True)

WANT = [
    "ios_15_0.json",
    "icloud_dumper.js", "keychain_copier.js", "keychain_dump.js",
    "file_downloader.js", "wifi_password_dump.js", "wifi_password_securityd.js",
    "loader.js", "main.js",
]

from selenium import webdriver
from selenium.webdriver.common.by import By

def run_ios(ios_ver, device, wait_secs=90):
    print(f"\n[*] Starting iOS {ios_ver} on {device}")
    caps = {
        "browserName":     "Safari",
        "browserVersion":  ios_ver,
        "bstack:options":  {
            "deviceName":          device,
            "osVersion":           ios_ver,
            "realMobile":          "true",
            "local":               "true",
            "localIdentifier":     "axdqx-fetch",
            "networkLogs":         "true",
            "consoleLogs":         "verbose",
            "debug":               "true",
            "seleniumVersion":     "4.0.0",
            "sessionName":         f"axdqx-{device}-ios{ios_ver}",
        }
    }
    hub = f"https://{BS_USER}:{BS_KEY}@hub.browserstack.com/wd/hub"
    
    driver = webdriver.Remote(command_executor=hub, desired_capabilities=caps)
    session_id = driver.session_id
    print(f"[*] Session: {session_id}")
    
    # 注入XHR/fetch拦截器
    intercept_js = """
window.__captured = {};
window.__capturedList = [];

// 拦截 XMLHttpRequest
const _open = XMLHttpRequest.prototype.open;
const _send = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open = function(method, url) {
    this._url = url;
    return _open.apply(this, arguments);
};
XMLHttpRequest.prototype.send = function() {
    this.addEventListener('load', function() {
        const fname = this._url.split('/').pop().split('?')[0];
        if (this.status === 200 && this.responseText && this.responseText.length > 100) {
            window.__captured[fname] = this.responseText;
            window.__capturedList.push({url: this._url, size: this.responseText.length, fname: fname});
            console.log('[CAPTURED] ' + fname + ' ' + this.responseText.length + 'B from ' + this._url);
        }
    });
    return _send.apply(this, arguments);
};

// 拦截 fetch
const _fetch = window.fetch;
window.fetch = async function(url, opts) {
    const resp = await _fetch(url, opts);
    const clone = resp.clone();
    try {
        const text = await clone.text();
        const fname = String(url).split('/').pop().split('?')[0];
        if (resp.ok && text.length > 100) {
            window.__captured[fname] = text;
            window.__capturedList.push({url: String(url), size: text.length, fname: fname});
            console.log('[CAPTURED] ' + fname + ' ' + text.length + 'B');
        }
    } catch(e) {}
    return resp;
};
console.log('[INTERCEPT] XHR/fetch interceptors installed');
"""
    
    try:
        driver.get(TARGET)
        print(f"[*] Navigated to {TARGET}")
        time.sleep(2)
        driver.execute_script(intercept_js)
        print(f"[*] Interceptors installed, waiting {wait_secs}s...")
        
        for i in range(0, wait_secs, 15):
            time.sleep(15)
            elapsed = i + 15
            try:
                captured = driver.execute_script("return Object.keys(window.__captured || {});")
                print(f"  [{elapsed}s] captured so far: {captured}")
            except: pass
        
        # 收集所有捕获的文件
        print("[*] Collecting captured files...")
        captured = driver.execute_script("return window.__captured || {};") or {}
        captured_list = driver.execute_script("return window.__capturedList || [];") or []
        
        print(f"[*] Total captured: {len(captured)} files")
        for item in captured_list:
            print(f"  {item['size']}B  {item['url']}")
        
        for fname, content in captured.items():
            # 保存profiles和plugins子目录
            if fname.endswith('.json') and 'ios_' in fname:
                os.makedirs(f"{OUT}/profiles", exist_ok=True)
                path = f"{OUT}/profiles/{fname}"
            elif 'exploit.js' in fname:
                os.makedirs(f"{OUT}/plugins", exist_ok=True)
                path = f"{OUT}/plugins/{fname}"
            else:
                path = f"{OUT}/{fname}"
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"[SAVED] {path} ({len(content)}B)")
        
        # 也获取console logs
        try:
            logs = driver.get_log('browser')
            captured_log = [l for l in logs if 'CAPTURED' in l.get('message','')]
            print(f"[*] Console CAPTURED logs: {len(captured_log)}")
            for l in captured_log: print(" ", l['message'])
        except Exception as e:
            print(f"[*] Console log err: {e}")
            
    except Exception as e:
        print(f"[!] Error: {e}")
    finally:
        driver.quit()
        print(f"[*] Session ended: {session_id}")
    
    return captured

# iOS 15 — 用于获取 ios_15_0.json
saved = {}
print("=== Run 1: iOS 15 for ios_15_0.json ===")
r1 = run_ios("15", "iPhone 13", wait_secs=60)
saved.update(r1)

# iOS 18.4 — 用于获取 pe_main.js动态加载的数据采集模块
print("\n=== Run 2: iOS 18.4 for post-exploitation files ===")
r2 = run_ios("18", "iPhone 14", wait_secs=90)
saved.update(r2)

print(f"\n=== Total saved: {len(saved)} files ===")
for k in saved: print(f"  {k}")

with open(f"{OUT}/captured_summary.json", 'w') as f:
    json.dump({k: len(v) for k,v in saved.items()}, f, indent=2)
