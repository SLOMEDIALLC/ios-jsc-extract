import UIKit
import WebKit

let kTargetURL = "http://bs-local.com:8765/7f01616a0505c05bbe02aeee8a21665f5d2401a3.html"
let kTimeout: Double = 600   // framework init ~2min + exploit loop needs time

// Capture JS: spoof iOS env + intercept console.log / XHR / fetch
let kCaptureJS = """
(function(){
  // ── iOS 伪装（框架检查 platform/userAgent）──────────────────────────────
  try { Object.defineProperty(navigator,'platform',{get:function(){return 'iPhone';},configurable:true}); } catch(e){}
  try { Object.defineProperty(navigator,'maxTouchPoints',{get:function(){return 5;},configurable:true}); } catch(e){}
  if(!window.TouchEvent){try{window.TouchEvent=function TouchEvent(){};}catch(e){}}

  // ── 日志捕获 ──────────────────────────────────────────────────────────────
  window.__logs=[];
  window.__done=false;
  window.onerror=function(m,s,l,c,e){
    window.__logs.push('[JSERR] '+m+' '+s+':'+l+' col='+c);
    return false; // don't suppress
  };
  window.addEventListener('unhandledrejection',function(e){
    window.__logs.push('[PROMISE_ERR] '+(e.reason?String(e.reason):'unknown'));
  });
  var _c=console.log.bind(console);
  console.log=function(){
    var s=Array.prototype.slice.call(arguments).map(function(v){
      return typeof v==='object'?JSON.stringify(v):String(v);
    }).join(' ');
    _c(s); window.__logs.push(s);
    // 追踪所有解密出的 URL（不要在第一个出现时就退出，等 WASM 链跑完）
    if(s.indexOf('[DECRYPTED_JS_URL]')>=0){
      if(!window.__decryptedURLs) window.__decryptedURLs=[];
      window.__decryptedURLs.push(s);
      window.__lastDecryptTime=Date.now();
      // 不设 __done=true，等链跑完
    }
    // 只在 [XN SET] 时设标记，但不退出
    if(s.indexOf('[XN SET]')>=0||s.indexOf('[si] resolved')>=0){
      // exploit成功后立即 dump（不要延迟，因为 __done=true 会触发退出）
      if(s.indexOf('[XN SET]')>=0){
        try{
          var P = globalThis.obChTK.hPL3On('14669ca3b1519ba2a8f40be287f646d4d7593eb0');
          // dump P.zn 属性
          var zn = P.zn;
          console.log('[P.zn] Tn='+String(zn.Tn)+' pn='+String(zn.pn));
          console.log('[P.zn] Kn='+String(zn.Kn));
          console.log('[P.zn] runtime='+zn.runtime+' xn='+zn.xn+' dn='+zn.dn);
          console.log('[P.zn] Sn='+zn.Sn+' qn='+zn.qn+' kn='+zn.kn+' Qn='+zn.Qn);
          // dump PhZuiP（WASM 打包数据里的字符串）
          var wasm = window.PhZuiP;
          if(wasm){
            console.log('[DUMP] PhZuiP length='+wasm.length);
            var bytes = new Uint8Array(wasm.buffer);
            var str='', start=0;
            for(var i=0;i<Math.min(bytes.length,50000);i++){
              var b=bytes[i];
              if(b>=32&&b<127){
                if(str.length===0) start=i;
                str+=String.fromCharCode(b);
              }else{
                if(str.length>4) console.log('[WASM-DATA] off='+start+' len='+str.length+' '+str.slice(0,150)+'');
                str='';
              }
            }
          } else { console.log('[DUMP] PhZuiP not found'); }
        }catch(e){ console.log('[DUMP-ERR] '+String(e)); }
      }
      // 不要立即退出，等足够长时间让所有 qbrdr 解密 + WASM 状态机 + POST 完成
      // 30秒后再设置 done
      if(!window.__doneScheduled){
        window.__doneScheduled=true;
        setTimeout(function(){ window.__done=true; }, 30000);
      }
    }
  };
  console.error=function(){console.log.apply(console,arguments);};
  console.warn=function(){console.log.apply(console,arguments);};

  // ── XHR 拦截 + 拦截 qbrdr 解密 dump WASM 内存 ──────────────────────────
  var _xhrOpen=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(m,u){
    if(u){
      window.__logs.push('[XHR] '+m+' '+u);
      if(typeof u==='string'&&u.indexOf('.js')>=0&&u.indexOf('6beef463')<0){
        window.__logs.push('[DECRYPTED_JS_URL] '+u);
      }
    }
    return _xhrOpen.apply(this,arguments);
  };

  // ── 拦截 window.qbrdr 调用，dump 解密后的 WASM 内存 ──────────────────────
  // qbrdr(base64) 被调用时 = 加密数据写入 WASM 内存
  // 之后 WASM 解密 → 状态机输出结果
  // 我们 hook LA() 函数（写入 WASM 内存的入口）来追踪状态变化
  window.__qbrdrCount = 0;
  window.__wasmDumps = [];
  var _origQbrdr = null;
  Object.defineProperty(window, 'qbrdr', {
    set: function(fn) {
      _origQbrdr = fn;
      // 包装 qbrdr 函数
      var wrapped = function(b64) {
        window.__qbrdrCount++;
        console.log('[QBRDR] call #'+window.__qbrdrCount+' base64_len='+b64.length);
        // 调用原始 qbrdr
        var result = _origQbrdr(b64);
        // qbrdr 调用后，WASM 会开始解密
        // 等一小段时间让 WASM 处理完，然后 dump 状态
        setTimeout(function(){
          try {
            // 尝试找到 WASM buffer 并 dump
            // PhZuiP 是 9af53c1b.js 创建的
            if(window.PhZuiP){
              var bytes = new Uint8Array(window.PhZuiP.buffer);
              // dump 前 1000 字节的 hex
              var hex='';
              for(var i=0;i<Math.min(bytes.length,500);i++) hex+=('0'+bytes[i].toString(16)).slice(-2);
              console.log('[WASM-DUMP] PhZuiP first500hex='+hex);
              // 扫描 ASCII 字符串
              var str='',start=0;
              for(var i=0;i<Math.min(bytes.length,100000);i++){
                var b=bytes[i];
                if(b>=32&&b<127){if(!str.length)start=i;str+=String.fromCharCode(b);}
                else{if(str.length>5)console.log('[WASM-STR] off='+start+' '+str.slice(0,200));str='';}
              }
            }
          }catch(e){console.log('[DUMP-ERR] '+String(e));}
        }, 2000);
        return result;
      };
      // 替换为包装版本
      window['qbrdr'] = wrapped;
    },
    get: function() { return _origQbrdr; },
    configurable: true
  });

  // ── 拦截 XHR send 来捕获 POST body（状态7 UA 回传数据）──────────────────
  var _xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(body) {
    if(body && body.length > 10) {
      console.log('[POST-BODY] len='+body.length+' data='+String(body).slice(0,500));
    }
    return _xhrSend.apply(this, arguments);
  };

  // ── fetch 拦截 ────────────────────────────────────────────────────────────
  if(window.fetch){
    var _f=window.fetch;
    window.fetch=function(url,opts){
      var u=typeof url==='string'?url:(url&&url.url?url.url:String(url));
      window.__logs.push('[FETCH] '+u);
      if(u.indexOf('.js')>=0&&u.indexOf('6beef463')<0){
        window.__logs.push('[DECRYPTED_JS_URL] '+u);
        if(!window.__decryptedURLs) window.__decryptedURLs=[];
        window.__decryptedURLs.push(u);
        window.__lastDecryptTime=Date.now();
      }
      return _f.apply(window,arguments);
    };
  }
})();
"""

var allLogs   = [String]()
var pullIdx   = 0
var lastRetry = Date()

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, WKNavigationDelegate {
    var window: UIWindow?
    var wv: WKWebView!
    var pollTimer: Timer?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let ucc = WKUserContentController()
        ucc.addUserScript(WKUserScript(
            source: kCaptureJS, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        let cfg = WKWebViewConfiguration()
        cfg.userContentController = ucc

        wv = WKWebView(frame: UIScreen.main.bounds, configuration: cfg)
        // iOS UA — framework validates userAgent for Version/X.X or iOS/X.X
        wv.customUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
        wv.navigationDelegate = self
        wv.load(URLRequest(url: URL(string: kTargetURL)!))
        lastRetry = Date()

        window = UIWindow(frame: UIScreen.main.bounds)
        window?.rootViewController = UIViewController()
        window?.rootViewController?.view.addSubview(wv)
        window?.makeKeyAndVisible()

        pollTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { _ in self.poll() }
        DispatchQueue.main.asyncAfter(deadline: .now() + kTimeout) { self.finish() }

        NSLog("[APP] Started loading \(kTargetURL)")
        return true
    }

    func poll() {
        let idx = pullIdx
        let elapsed = -lastRetry.timeIntervalSinceNow
        let js = """
        (function(){
          var L=window.__logs||[];
          var n=L.slice(\(idx));
          var urls=window.__decryptedURLs||[];
          var lastT=window.__lastDecryptTime||0;
          var idle=lastT>0?(Date.now()-lastT)/1000:-1;
          // 自动退出条件：有解密URL且60秒没新URL出现（链跑完了）
          var chainDone=urls.length>0&&idle>60;
          return JSON.stringify({
            logs:n,
            done:window.__done||chainDone,
            rs:document.readyState,
            url:location.href,
            decryptedCount:urls.length,
            idleSecs:Math.round(idle)
          });
        })()
        """
        wv.evaluateJavaScript(js) { [weak self] res, err in
            guard let self = self else { return }
            if let err = err { NSLog("[POLL ERR] \(err)"); return }
            guard let str = res as? String,
                  let d   = str.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: d) as? [String:Any] else { return }

            let url = obj["url"] as? String ?? ""
            let rs  = obj["rs"]  as? String ?? ""
            if let logs = obj["logs"] as? [String], !logs.isEmpty {
                allLogs.append(contentsOf: logs)
                pullIdx += logs.count
                for log in logs { NSLog("[JS] \(log)") }
            }
            let decryptCount = obj["decryptedCount"] as? Int ?? 0
            let idleSecs = obj["idleSecs"] as? Int ?? -1
            NSLog("[STATUS] rs=\(rs) url=\(String(url.prefix(60))) logs=\(allLogs.count) qbrdr_decrypted=\(decryptCount) idle=\(idleSecs)s")

            if (url == "about:blank" || url.isEmpty) && elapsed > 12 {
                NSLog("[APP] Stuck on about:blank \(Int(elapsed))s, retrying…")
                self.wv.load(URLRequest(url: URL(string: kTargetURL)!))
                lastRetry = Date()
            }
            if let done = obj["done"] as? Bool, done { self.finish() }
        }
    }

    func webView(_ wv: WKWebView, didFinish n: WKNavigation!) {
        NSLog("[NAV] didFinish url=\(wv.url?.absoluteString ?? "?")")
    }
    func webView(_ wv: WKWebView, didFail n: WKNavigation!, withError e: Error) {
        NSLog("[NAV] didFail: \(e)")
    }
    func webView(_ wv: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) {
        NSLog("[NAV] provisionalFail: \(e)")
    }

    func finish() {
        pollTimer?.invalidate()
        let out = allLogs.joined(separator: "\n")
        NSLog("[iOS JSC OUTPUT START]")
        NSLog("%@", out.isEmpty ? "(no JS logs captured)" : out)
        NSLog("[iOS JSC OUTPUT END]")

        // /tmp/ path for Simulator
        try? out.write(toFile: "/tmp/ios_jsc_results.txt", atomically: true, encoding: .utf8)

        // Documents/ path for real device — readable via Appium getFile
        if let docsDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
            let filePath = docsDir.appendingPathComponent("ios_jsc_results.txt")
            try? out.write(to: filePath, atomically: true, encoding: .utf8)
            NSLog("[APP] Results written to \(filePath.path)")
        }
        exit(0)
    }
}
