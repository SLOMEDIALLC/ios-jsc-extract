"""
BrowserStack App Automate — iOS JSC DRM Extraction
运行在真实 iPhone 上，等待 JSC JIT exploit 触发，捕获解密密钥。

用法:
  python3 bs_run.py <app_url> <bs_local_identifier>
"""

import sys
import os
import time
import json
import base64
import re

from appium import webdriver
from appium.options import XCUITestOptions

BS_USER = os.environ["BS_USERNAME"]
BS_KEY  = os.environ["BS_ACCESS_KEY"]
APP_URL = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("BS_APP_URL", "")
LOCAL_ID = sys.argv[2] if len(sys.argv) > 2 else "jsc-extract"

# ── 设备配置 ─────────────────────────────────────────────────────────────────
# iOS 17.x 设备：exploit 的 JSC 内存偏移量基于 iOS 17.2 编写
# 真实 iOS 17.x JSC → pm exploit 正常工作（不需要 Worker bypass）
CAPABILITIES = {
    "platformName":            "iOS",
    "deviceName":              "iPhone 15",
    "platformVersion":         "17",        # BrowserStack 会选 17.x 最新版
    "app":                     APP_URL,
    "browserstack.user":       BS_USER,
    "browserstack.key":        BS_KEY,
    "browserstack.local":      "true",      # 通过 Tunnel 访问我们的 patch server
    "browserstack.localIdentifier": LOCAL_ID,
    "browserstack.debug":      "true",
    "browserstack.networkLogs":"true",
    "browserstack.appiumLogs": "true",
    "newCommandTimeout":       400,
    "fullReset":               False,
}

APPIUM_HUB = "https://hub.browserstack.com/wd/hub"
WAIT_SECS  = 330   # 框架初始化 ~120s + exploit 运行时间

def main():
    os.makedirs("output", exist_ok=True)
    print(f"[BS] Connecting to BrowserStack hub…")
    print(f"[BS] App URL: {APP_URL}")
    print(f"[BS] Device: iPhone 15 iOS 17.x")

    options = XCUITestOptions()
    for k, v in CAPABILITIES.items():
        options.set_capability(k, v)

    driver = webdriver.Remote(APPIUM_HUB, options=options)
    session_id = driver.session_id
    print(f"[BS] Session started: {session_id}")
    print(f"[BS] Dashboard: https://app-automate.browserstack.com/builds/{session_id}")

    # ── 等待 exploit 触发 ──────────────────────────────────────────────────
    print(f"[BS] Waiting {WAIT_SECS}s for JSC exploit to fire…")
    for i in range(0, WAIT_SECS, 30):
        time.sleep(30)
        elapsed = i + 30
        print(f"[BS] {elapsed}s / {WAIT_SECS}s elapsed")

        # 每 30s 检查一次 syslog，看 exploit 是否已触发
        try:
            logs = driver.get_log("syslog")
            for entry in logs[-200:]:  # 检查最近 200 条
                msg = entry.get("message", "")
                if "[XN SET]" in msg or "[DECRYPTED_JS_URL]" in msg:
                    print(f"[BS] 🎉 EXPLOIT FIRED! {msg}")
                    break
        except Exception:
            pass

    # ── 收集日志 ───────────────────────────────────────────────────────────
    print("[BS] Collecting syslog…")
    all_logs = []
    try:
        logs = driver.get_log("syslog")
        for entry in logs:
            msg = entry.get("message", "")
            all_logs.append(msg)
    except Exception as e:
        print(f"[BS] syslog error: {e}")

    log_text = "\n".join(all_logs)
    print("[iOS JSC OUTPUT START]")
    # 过滤关键行
    for line in all_logs:
        if any(k in line for k in ["[XN SET]", "[JSC-FIRE]", "[DECRYPTED", "[XHR]", "[JSERR]", "[PROMISE", "[U-TICK]"]):
            print(line)
    print("[iOS JSC OUTPUT END]")

    with open("output/bs_syslog.txt", "w", encoding="utf-8") as f:
        f.write(log_text)

    # ── 读取 App Documents 文件（最可靠的结果获取方式）─────────────────────
    print("[BS] Reading results file from device…")
    try:
        result_b64 = driver.execute_script(
            "mobile: getFile",
            {"remotePath": "@com.test.iosextract/Documents/ios_jsc_results.txt"}
        )
        result_text = base64.b64decode(result_b64).decode("utf-8", errors="replace")
        print(f"[BS] Results file ({len(result_text)} chars):")
        print(result_text[:2000])
        with open("output/ios_jsc_results.txt", "w", encoding="utf-8") as f:
            f.write(result_text)
    except Exception as e:
        print(f"[BS] Could not read results file: {e}")
        # 从 syslog 中提取
        with open("output/ios_jsc_results.txt", "w", encoding="utf-8") as f:
            for line in all_logs:
                if any(k in line for k in ["[XN SET]", "[JSC", "[DECRYPTED", "[XHR]"]):
                    f.write(line + "\n")

    # ── 解析关键结果 ───────────────────────────────────────────────────────
    xn_lines  = re.findall(r'\[XN SET\][^\n]*', log_text)
    url_lines = re.findall(r'\[DECRYPTED_JS_URL\][^\n]*', log_text)
    err_lines = re.findall(r'\[JSC ERR\][^\n]*', log_text)

    summary = {
        "jsc_exploit_fired": len(xn_lines) > 0,
        "xn_lines":          xn_lines,
        "decrypted_js_urls": url_lines,
        "jsc_errors":        err_lines,
        "session_id":        session_id,
    }
    with open("output/ios_summary.json", "w") as f:
        json.dump(summary, f, indent=2)

    print("\n=== SUMMARY ===")
    print(json.dumps(summary, indent=2))

    driver.quit()
    print("[BS] Session ended")

    return 0 if summary["jsc_exploit_fired"] else 1

if __name__ == "__main__":
    sys.exit(main())
