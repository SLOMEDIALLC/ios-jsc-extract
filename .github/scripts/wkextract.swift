// macOS command-line WKWebView extractor — uses real Apple JSC (ARM64)
// NSApplication.shared + setActivationPolicy(.prohibited) = headless WKWebView
//
// compile:  swiftc -framework WebKit -framework AppKit -framework Foundation wkextract.swift -o wkextract
// run:      ./wkextract

import Foundation
import WebKit
import AppKit

let TARGET_URL  = "http://127.0.0.1:8765/7f01616a0505c05bbe02aeee8a21665f5d2401a3.html"
let TIMEOUT_SEC: Double = 150

// JS injected at document start:
//  - captures console.log (including [JSC-FIRE], [XN SET] from patched 6beef463)
//  - intercepts XMLHttpRequest.open  → logs [XHR] and [DECRYPTED_JS_URL]
//  - intercepts window.fetch         → same
let CAPTURE_JS = """
(function(){
  window.__logs    = [];
  window.__done    = false;
  window.__pullIdx = 0;

  window.onerror = function(m,s,l,c,e) {
    window.__logs.push('[JSERR] ' + m + ' ' + s + ':' + l);
  };

  var _c = console.log.bind(console);
  console.log = function() {
    var s = Array.prototype.slice.call(arguments).map(function(v) {
      return typeof v === 'object' ? JSON.stringify(v) : String(v);
    }).join(' ');
    _c(s);
    window.__logs.push(s);
    // Signal done when JSC keys extracted or first decrypted URL appears
    if (s.indexOf('[XN SET]') >= 0 ||
        s.indexOf('[DECRYPTED_JS_URL]') >= 0 ||
        s.indexOf('[si] resolved:') >= 0) {
      window.__done = true;
    }
  };
  console.error = function() { console.log.apply(console, arguments); };
  console.warn  = function() { console.log.apply(console, arguments); };

  // Intercept XHR — the WASM state machine calls U.download() → XHR after
  // decrypting the qbrdr payload; capturing the URL gives us the decrypted path.
  var _xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (url) {
      var u = String(url);
      window.__logs.push('[XHR] ' + method + ' ' + u);
      if (u.indexOf('.js') >= 0 && u.indexOf('6beef463') < 0) {
        window.__logs.push('[DECRYPTED_JS_URL] ' + u);
        window.__done = true;
      }
    }
    return _xhrOpen.apply(this, arguments);
  };

  // Intercept fetch
  if (window.fetch) {
    var _f = window.fetch;
    window.fetch = function(url, opts) {
      var u = typeof url === 'string' ? url : (url && url.url ? url.url : String(url));
      window.__logs.push('[FETCH] ' + u);
      if (u.indexOf('.js') >= 0) {
        window.__logs.push('[DECRYPTED_JS_URL] ' + u);
        window.__done = true;
      }
      return _f.apply(window, arguments);
    };
  }
})();
"""

// Shared state (accessed from main thread only via RunLoop)
var allLogs   = [String]()
var pullIdx   = 0
var lastRetry = Date()

class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var wv: WKWebView!
    var pollTimer: Timer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let ucc = WKUserContentController()
        ucc.addUserScript(WKUserScript(
            source:          CAPTURE_JS,
            injectionTime:   .atDocumentStart,
            forMainFrameOnly: false))

        let cfg = WKWebViewConfiguration()
        cfg.userContentController = ucc

        wv = WKWebView(frame: CGRect(x: 0, y: 0, width: 1280, height: 900),
                       configuration: cfg)
        wv.navigationDelegate = self

        print("[MACWK] Loading \(TARGET_URL)")
        wv.load(URLRequest(url: URL(string: TARGET_URL)!))
        lastRetry = Date()

        pollTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { _ in
            self.poll()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + TIMEOUT_SEC) {
            self.finish()
        }
    }

    func poll() {
        let idx     = pullIdx
        let elapsed = -lastRetry.timeIntervalSinceNow
        let js = """
        (function(){
          var L = window.__logs || [];
          var n = L.slice(\(idx));
          return JSON.stringify({
            logs: n,
            done: window.__done || false,
            rs:   document.readyState,
            url:  location.href
          });
        })()
        """
        wv.evaluateJavaScript(js) { [weak self] res, err in
            guard let self = self else { return }
            if let err = err { print("[POLL ERR] \(err)"); return }
            guard let str = res as? String,
                  let d   = str.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any]
            else { return }

            let url = obj["url"] as? String ?? ""
            let rs  = obj["rs"]  as? String ?? ""

            if let logs = obj["logs"] as? [String], !logs.isEmpty {
                allLogs.append(contentsOf: logs)
                pullIdx += logs.count
                for log in logs { print("[JS] \(log)") }
            }

            print("[STATUS] rs=\(rs) url=\(String(url.prefix(80))) logs=\(allLogs.count)")

            // Retry if navigation stuck at about:blank
            if (url == "about:blank" || url.isEmpty) && elapsed > 12 {
                print("[MACWK] Stuck on about:blank after \(Int(elapsed))s, retrying…")
                self.wv.load(URLRequest(url: URL(string: TARGET_URL)!))
                lastRetry = Date()
            }

            if let done = obj["done"] as? Bool, done { self.finish() }
        }
    }

    // MARK: - WKNavigationDelegate
    func webView(_ wv: WKWebView, didFinish n: WKNavigation!) {
        print("[NAV] didFinish url=\(wv.url?.absoluteString ?? "?")")
    }
    func webView(_ wv: WKWebView, didFail n: WKNavigation!, withError e: Error) {
        print("[NAV] didFail: \(e)")
    }
    func webView(_ wv: WKWebView,
                 didFailProvisionalNavigation n: WKNavigation!,
                 withError e: Error) {
        print("[NAV] provisionalFail: \(e)")
    }

    // MARK: - finish
    func finish() {
        pollTimer?.invalidate()
        let out = allLogs.joined(separator: "\n")
        print("[iOS JSC OUTPUT START]")
        print(out.isEmpty ? "(no JS logs captured)" : out)
        print("[iOS JSC OUTPUT END]")
        try? out.write(toFile: "/tmp/ios_jsc_results.txt",
                       atomically: true, encoding: .utf8)
        NSApp.terminate(nil)
    }
}

// Entry point
let app      = NSApplication.shared
app.setActivationPolicy(.prohibited)   // headless — no Dock icon
let delegate = AppDelegate()
app.delegate = delegate
app.run()
