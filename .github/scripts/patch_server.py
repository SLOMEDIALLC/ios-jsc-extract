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
                print('[server] WARNING: BEEF_ORIG pattern not found in 6beef463.js', flush=True)
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
        pass


os.chdir(SERVE_DIR)
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('', PORT), Handler) as s:
    print(f'[server] Listening on {PORT}', flush=True)
    s.serve_forever()
