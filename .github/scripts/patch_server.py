"""
Patching HTTP server for gooll DRM extraction.

Usage: python3 patch_server.py <serve_dir> <port>

Key fix: BEEF_PATCH now KEEPS the if(e[5]!==6.6) condition so the JSC JIT
exploit must actually fire (real heap-pointer keys) before [XN SET] is logged.
The old patch removed the condition, making the code run immediately with wrong
constant keys (wn(0xdeadn) = 0xDEAD), producing garbage decryption.
"""

import http.server
import socketserver
import os
import sys

SERVE_DIR = sys.argv[1]
PORT = int(sys.argv[2])
# mode: 'simulator' (需要 Worker bypass) | 'real-device' (真实 iOS JSC，不需要 bypass)
MODE = sys.argv[3] if len(sys.argv) > 3 else 'simulator'
print(f'[server] Mode: {MODE}', flush=True)

# Original minified code (must match exactly)
BEEF_ORIG = (
    'if(e[5]!==6.6){o("");try{o("");'
    'c.ws=c.Oi.Co(e[0]);c.ds=c.Oi.Co(e[1]);'
    'c.ys=c.Oi.Co(e[2]);c.As=c.Oi.Co(e[3]);'
    'c.Us=c.Oi.Co(e[4]);P.zn.Xn=c;t()}'
    'catch(t){o(t)}}else window.setTimeout(u,0)'
)

# Patched version: keeps the condition, adds full logging of real JSC heap-pointer keys
BEEF_PATCH = (
    'if(e[5]!==6.6){'
    'console.log("[JSC-FIRE] e[5]="+String(e[5]));'
    'try{e.forEach(function(v,i){'
    'try{console.log("[e"+i+"] type="+typeof v+" val="+String(v));}catch(_){}'
    '});}catch(_){};'
    'o("");try{o("");'
    'c.ws=c.Oi.Co(e[0]);c.ds=c.Oi.Co(e[1]);'
    'c.ys=c.Oi.Co(e[2]);c.As=c.Oi.Co(e[3]);'
    'c.Us=c.Oi.Co(e[4]);'
    'console.log("[XN SET]",'
    '"ws="+String(c.ws),"ds="+String(c.ds),'
    '"ys="+String(c.ys),"As="+String(c.As),'
    '"Us="+String(c.Us));'
    'P.zn.Xn=c;t();'
    '}catch(t){o(t);console.log("[JSC ERR]",String(t));}'
    '}else window.setTimeout(u,0)'
)

# iOS Simulator uses macOS JSC (not real iOS JSC), so the Worker-based pm exploit
# fails because the hardcoded JSC memory offsets (tt[X]=78528 etc.) are wrong.
# Patch: skip the Worker phase, start u() loop directly so the simple type-confusion
# (spreading arrays with WebAssembly instances) can attempt to fire instead.
WORKER_ORIG = '};a()};class ut{'
WORKER_PATCH = '};console.log("[PATCH] Worker bypassed, scheduling u()");window.setTimeout(u,0)};class ut{'

# Also add diagnostic at start of u() to confirm it runs each iteration
U_DIAG_ORIG = 'const u=()=>{const n='
U_DIAG_PATCH = 'const u=()=>{console.log("[U-TICK] e[5]="+String(e[5]));const n='


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        p = self.path.split('?')[0].lstrip('/')
        full = os.path.join(SERVE_DIR, p)
        if '6beef463' in p and os.path.isfile(full):
            with open(full, 'r', encoding='utf-8') as f:
                content = f.read()
            if BEEF_ORIG in content:
                content = content.replace(BEEF_ORIG, BEEF_PATCH)
                print('[server] Patched 6beef463.js — JSC exploit instrumented', flush=True)
            else:
                print('[server] WARNING: BEEF_ORIG not found in 6beef463.js', flush=True)
        # 拦截 9af53c1b.js — 注入 WASM 状态机 dump
        # 在 wA() 的每个状态分支里 dump g.buffer 内容
        if '9af53c1b' in p and os.path.isfile(full):
            with open(full, 'r', encoding='utf-8') as f:
                content = f.read()
            # 在 TA(M, I, 调用前注入 dump — 这是状态7(UA) POST 的地方
            TA_ORIG = 'E.TA(M, I, E.NA, E.EA)'
            TA_PATCH = (
                'console.log("[STATE7-URL] "+M);'
                'console.log("[STATE7-BODY-LEN] "+I.length);'
                'console.log("[STATE7-BODY] "+I.slice(0,2000));'
                'E.TA(M, I, E.NA, E.EA)'
            )
            if TA_ORIG in content:
                content = content.replace(TA_ORIG, TA_PATCH)
                print('[server] Patched 9af53c1b.js — STATE7 POST dump added', flush=True)
            # 在 download 调用前 dump 文件名 — 状态1(wA)
            DL_ORIG = 'E.download(M, E.UA, E.error)'
            DL_PATCH = (
                'console.log("[STATE1-FILE] "+M);'
                'E.download(M, E.UA, E.error)'
            )
            if DL_ORIG in content:
                content = content.replace(DL_ORIG, DL_PATCH)
                print('[server] Patched 9af53c1b.js — STATE1 download dump added', flush=True)
            # 在 LA() 入口 dump 写入的数据
            LA_ORIG = 'D[1] = M.length, D[0] = BA'
            LA_PATCH = (
                'console.log("[LA-WRITE] len="+M.length+" first200="+M.slice(0,200));'
                'D[1] = M.length, D[0] = BA'
            )
            if LA_ORIG in content:
                content = content.replace(LA_ORIG, LA_PATCH)
                print('[server] Patched 9af53c1b.js — LA() write dump added', flush=True)
            # 在 sA() 副作用前 dump — 状态6(TA)
            SA_ORIG = 'E.sA()'
            SA_PATCH = 'console.log("[STATE6-SIDE-EFFECT]"),E.sA()'
            if SA_ORIG in content:
                content = content.replace(SA_ORIG, SA_PATCH, 1)  # 只替换wA里的第一个
                print('[server] Patched 9af53c1b.js — STATE6 dump added', flush=True)
            data = content.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
            # Worker bypass 只在 Simulator 模式下使用
            # 真实 iOS JSC (real-device) 偏移量正确，pm exploit 可正常运行，不需要 bypass
            if MODE == 'simulator':
                if WORKER_ORIG in content:
                    content = content.replace(WORKER_ORIG, WORKER_PATCH)
                    print('[server] [sim] Worker bypass applied', flush=True)
                if U_DIAG_ORIG in content:
                    content = content.replace(U_DIAG_ORIG, U_DIAG_PATCH)
                    print('[server] [sim] u() diagnostic applied', flush=True)
            else:
                print('[server] [real-device] Worker bypass SKIPPED — real iOS JSC handles pm exploit', flush=True)
            data = content.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            self.directory = SERVE_DIR
            super().do_GET()

    def log_message(self, fmt, *a):
        # 记录所有请求到日志，方便分析 qbrdr 解密后访问了哪些 URL
        msg = fmt % a
        print(f'[HTTP] {msg}', flush=True)


os.chdir(SERVE_DIR)
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('', PORT), Handler) as s:
    print(f'[server] Listening on {PORT}', flush=True)
    s.serve_forever()
