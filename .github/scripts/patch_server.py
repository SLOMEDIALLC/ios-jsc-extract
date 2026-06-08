"""
Patching HTTP server for gooll DRM extraction.
Usage: python3 patch_server.py <serve_dir> <port> [real-device|simulator]
"""

import http.server
import socketserver
import os
import sys

SERVE_DIR = sys.argv[1]
PORT = int(sys.argv[2])
MODE = sys.argv[3] if len(sys.argv) > 3 else 'simulator'
print(f'[server] Mode: {MODE}', flush=True)

BEEF_ORIG = (
    'if(e[5]!==6.6){o("");try{o("");'
    'c.ws=c.Oi.Co(e[0]);c.ds=c.Oi.Co(e[1]);'
    'c.ys=c.Oi.Co(e[2]);c.As=c.Oi.Co(e[3]);'
    'c.Us=c.Oi.Co(e[4]);P.zn.Xn=c;t()}'
    'catch(t){o(t)}}else window.setTimeout(u,0)'
)

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


def patch_file(content, filename):
    """Apply patches to a JS file based on its name. Returns (patched_content, was_patched)."""
    patched = False

    # 1. 6beef463.js — JSC exploit instrumentation
    if '6beef463' in filename:
        if BEEF_ORIG in content:
            content = content.replace(BEEF_ORIG, BEEF_PATCH)
            print(f'[server] Patched {filename} — JSC exploit instrumented', flush=True)
            patched = True

    # 2. 9af53c1b.js — WASM 状态机 dump
    elif '9af53c1b' in filename:
        # STATE7: POST 回传 dump
        orig = 'E.TA(M, I, E.NA, E.EA)'
        repl = ('console.log("[STATE7-URL] "+M);'
                'console.log("[STATE7-BODY-LEN] "+I.length);'
                'console.log("[STATE7-BODY] "+I.slice(0,2000));'
                'E.TA(M, I, E.NA, E.EA)')
        if orig in content:
            content = content.replace(orig, repl)
            print(f'[server] Patched {filename} — STATE7 dump', flush=True)
            patched = True

        # STATE1: download dump
        orig = 'E.download(M, E.UA, E.error)'
        repl = 'console.log("[STATE1-FILE] "+M);E.download(M, E.UA, E.error)'
        if orig in content:
            content = content.replace(orig, repl)
            patched = True

        # LA(): 写入 WASM 内存 dump
        orig = 'D[1] = M.length, D[0] = BA'
        repl = ('console.log("[LA-WRITE] len="+M.length+" hex="+Array.from(M.slice(0,100),function(c){return("0"+c.charCodeAt(0).toString(16)).slice(-2)}).join(""));'
                'D[1] = M.length, D[0] = BA')
        if orig in content:
            content = content.replace(orig, repl)
            patched = True

    # 3. qbrdr payload 文件 — dump base64 解码后的原始数据
    elif 'window["qbrdr"]' in content:
        DUMP_CODE = (
            'var _qb64=document.currentScript?document.currentScript.textContent.match(/qbrdr.*?"([A-Za-z0-9+\\/=]{10,})"/):null;'
            'if(_qb64){try{var _qd=atob(_qb64[1]);'
            'console.log("[QBRDR-FILE] ' + filename + ' b64="+_qb64[1].length+" bytes="+_qd.length);'
            'var _qh="";for(var _qi=0;_qi<Math.min(_qd.length,500);_qi++)_qh+=("0"+_qd.charCodeAt(_qi).toString(16)).slice(-2);'
            'console.log("[QBRDR-HEX] "+_qh);'
            '}catch(_qe){console.log("[QBRDR-ERR] "+_qe);}};'
        )
        content = DUMP_CODE + content
        print(f'[server] Patched {filename} — qbrdr payload dump prepended', flush=True)
        patched = True

    return content, patched


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        p = self.path.split('?')[0].lstrip('/')
        full = os.path.join(SERVE_DIR, p)

        if os.path.isfile(full) and p.endswith('.js'):
            with open(full, 'r', encoding='utf-8') as f:
                content = f.read()

            content, was_patched = patch_file(content, p)

            if was_patched:
                data = content.encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/javascript; charset=utf-8')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return

        # 默认: 直接提供文件
        self.directory = SERVE_DIR
        super().do_GET()

    def log_message(self, fmt, *a):
        msg = fmt % a
        print(f'[HTTP] {msg}', flush=True)


os.chdir(SERVE_DIR)
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('', PORT), Handler) as s:
    print(f'[server] Listening on {PORT}', flush=True)
    s.serve_forever()
