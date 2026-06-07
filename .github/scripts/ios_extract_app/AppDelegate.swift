import UIKit
import WebKit

let kTargetURL = "http://127.0.0.1:8765/7f01616a0505c05bbe02aeee8a21665f5d2401a3.html"
let kTimeout: Double = 300   // framework init ~2min + exploit loop needs time

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
    if(s.indexOf('[XN SET]')>=0||s.indexOf('[DECRYPTED_JS_URL]')>=0||s.indexOf('[si] resolved')>=0){
      window.__done=true;
    }
  };
  console.error=function(){console.log.apply(console,arguments);};
  console.warn=function(){console.log.apply(console,arguments);};

  // ── XHR 拦截（捕捉解密后的 JS URL）──────────────────────────────────────
  var _xhrOpen=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(m,u){
    if(u){
      window.__logs.push('[XHR] '+m+' '+u);
      if(typeof u==='string'&&u.indexOf('.js')>=0&&u.indexOf('6beef463')<0){
        window.__logs.push('[DECRYPTED_JS_URL] '+u);
        window.__done=true;
      }
    }
    return _xhrOpen.apply(this,arguments);
  };

  // ── fetch 拦截 ────────────────────────────────────────────────────────────
  if(window.fetch){
    var _f=window.fetch;
    window.fetch=function(url,opts){
      var u=typeof url==='string'?url:(url&&url.url?url.url:String(url));
      window.__logs.push('[FETCH] '+u);
      if(u.indexOf('.js')>=0&&u.indexOf('6beef463')<0){
        window.__logs.push('[DECRYPTED_JS_URL] '+u); window.__done=true;
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
        wv.customUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1"
        wv.navigationDelegate = self
        wv.load(URLRequest(url: URL(string: kTargetURL)!))
        lastRetry = Date()

        window = UIWindow(frame: UIScreen.main.bounds)
        window?.rootViewController = UIViewController()
        window?.rootViewController?.view.addSubview(wv)
        window?.makeKeyAndVisible()

        pollTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { _ in self.poll() }
        DispatchQueue.main.asyncAfter(deadline: .now() + kTimeout) { self.finish() }

        print("[APP] Started loading \(kTargetURL)")
        return true
    }

    func poll() {
        let idx = pullIdx
        let elapsed = -lastRetry.timeIntervalSinceNow
        let js = """
        (function(){
          var L=window.__logs||[];
          var n=L.slice(\(idx));
          return JSON.stringify({logs:n,done:window.__done||false,rs:document.readyState,url:location.href});
        })()
        """
        wv.evaluateJavaScript(js) { [weak self] res, err in
            guard let self = self else { return }
            if let err = err { print("[POLL ERR] \(err)"); return }
            guard let str = res as? String,
                  let d   = str.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: d) as? [String:Any] else { return }

            let url = obj["url"] as? String ?? ""
            let rs  = obj["rs"]  as? String ?? ""
            if let logs = obj["logs"] as? [String], !logs.isEmpty {
                allLogs.append(contentsOf: logs)
                pullIdx += logs.count
                for log in logs { print("[JS] \(log)") }
            }
            print("[STATUS] rs=\(rs) url=\(String(url.prefix(80))) logs=\(allLogs.count)")

            if (url == "about:blank" || url.isEmpty) && elapsed > 12 {
                print("[APP] Stuck on about:blank \(Int(elapsed))s, retrying…")
                self.wv.load(URLRequest(url: URL(string: kTargetURL)!))
                lastRetry = Date()
            }
            if let done = obj["done"] as? Bool, done { self.finish() }
        }
    }

    func webView(_ wv: WKWebView, didFinish n: WKNavigation!) {
        print("[NAV] didFinish url=\(wv.url?.absoluteString ?? "?")")
    }
    func webView(_ wv: WKWebView, didFail n: WKNavigation!, withError e: Error) {
        print("[NAV] didFail: \(e)")
    }
    func webView(_ wv: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) {
        print("[NAV] provisionalFail: \(e)")
    }

    func finish() {
        pollTimer?.invalidate()
        let out = allLogs.joined(separator: "\n")
        print("[iOS JSC OUTPUT START]")
        print(out.isEmpty ? "(no JS logs captured)" : out)
        print("[iOS JSC OUTPUT END]")

        // /tmp/ path for Simulator
        try? out.write(toFile: "/tmp/ios_jsc_results.txt", atomically: true, encoding: .utf8)

        // Documents/ path for real device — readable via Appium getFile
        if let docsDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
            let filePath = docsDir.appendingPathComponent("ios_jsc_results.txt")
            try? out.write(to: filePath, atomically: true, encoding: .utf8)
            print("[APP] Results written to \(filePath.path)")
        }
        exit(0)
    }
}
