"""
Parse macOS WKWebView extraction results and write ios_summary.json.
Usage: python3 parse_results.py
"""
import re
import json
import os
import sys

log = ""
for path in ["output/sim_log.txt", "output/macos_wk_full.log",
             "output/ios_jsc_results.txt", "/tmp/ios_jsc_results.txt"]:
    if os.path.isfile(path):
        with open(path, errors="replace") as f:
            log += f.read() + "\n"

if not log.strip():
    print("[parse] No log files found", file=sys.stderr)

fire_lines  = re.findall(r'\[JSC-FIRE\][^\n]*',         log)
xn_lines    = re.findall(r'\[XN SET\][^\n]*',           log)
e5_lines    = re.findall(r'\[e5\][^\n]*',               log)
url_lines   = re.findall(r'\[DECRYPTED_JS_URL\][^\n]*', log)
xhr_lines   = re.findall(r'\[XHR\][^\n]*',              log)[:30]
jsc_errs    = re.findall(r'\[JSC ERR\][^\n]*',          log)

result = {
    "jsc_exploit_fired": len(xn_lines) > 0,
    "xn_lines":          xn_lines,
    "e5_lines":          e5_lines,
    "jsc_fire_lines":    fire_lines,
    "decrypted_js_urls": url_lines,
    "xhr_lines":         xhr_lines,
    "jsc_errors":        jsc_errs,
}

os.makedirs("output", exist_ok=True)
with open("output/ios_summary.json", "w") as f:
    json.dump(result, f, indent=2)

print(json.dumps(result, indent=2))
print("\n=== SUMMARY ===")
print(f"JSC exploit fired  : {result['jsc_exploit_fired']}")
print(f"[XN SET] count     : {len(xn_lines)}")
print(f"[JSC-FIRE] count   : {len(fire_lines)}")
print(f"Decrypted JS URLs  : {url_lines}")
if xn_lines:
    print("\nReal JSC keys captured:")
    for line in xn_lines:
        print(" ", line)
