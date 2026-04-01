package com.beeper.floatpet;

import android.Manifest;
import android.app.Activity;
import android.content.*;
import android.content.pm.PackageManager;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.speech.*;
import android.webkit.*;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.util.ArrayList;

/**
 * MainActivity
 * ─────────────
 * 全屏 WebView 加载完整的 index.html。
 * 通过 AndroidBridge 提供：
 *   1. 悬浮桌宠启停（FloatingWindowService）
 *   2. 原生 SpeechRecognizer 语音识别（WebView 不支持 webkitSpeechRecognition）
 *   3. 麦克风 / 摄像头运行时权限
 *
 * ── 热更新说明 ──────────────────────────────────────────────────────────────
 * REMOTE_URL 指向 GitHub Pages，每次 git push 后内容自动部署。
 * App 启动时：有网络 → 加载远程最新版；无网络 / 加载失败 → 回退到本地 assets。
 * 只有改 Java 原生代码才需要重新安装 APK。
 * ───────────────────────────────────────────────────────────────────────────
 */
public class MainActivity extends AppCompatActivity {

    /**
     * 远程热更新地址（GitHub Pages）。
     * 如果你的 GitHub Pages 地址不同，改这里即可；留空 "" 则始终用本地 assets。
     * 格式示例：https://yourname.github.io/your-repo/
     */
    private static final String REMOTE_URL =
            "https://pleaseweiwei.github.io/My-Beeper-orz/";

    private static final int REQ_OVERLAY      = 1001;
    private static final int REQ_MEDIA_PRJ    = 1002;
    private static final int REQ_NOTIFICATION = 1003;
    private static final int REQ_AUDIO_CAMERA = 1004;

    private WebView                _webView;
    private MediaProjectionManager _mpMgr;
    private SharedPreferences      _prefs;

    /** 当前是否正在加载远程 URL（用于出错时回退本地）*/
    private boolean _loadedFromRemote = false;

    // 原生语音识别
    private SpeechRecognizer _speechRecognizer;
    private boolean          _srInterim = true;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        _prefs = getSharedPreferences("floatpet_prefs", Context.MODE_PRIVATE);
        _mpMgr = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);

        _setupWebView();
        _requestRuntimePermissions();
    }

    /* ════════════════════════════════════════
       WebView 初始化
       ════════════════════════════════════════ */
    private void _setupWebView() {
        _webView = new WebView(this);

        final WebSettings ws = _webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setAllowFileAccess(true);
        ws.setAllowContentAccess(true);
        ws.setAllowFileAccessFromFileURLs(true);
        ws.setAllowUniversalAccessFromFileURLs(true);
        ws.setMediaPlaybackRequiresUserGesture(false);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        ws.setCacheMode(WebSettings.LOAD_DEFAULT);
        ws.setGeolocationEnabled(true);

        _webView.setWebChromeClient(new WebChromeClient() {
            // 自动授权 WebRTC 麦克风 / 摄像头请求
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources()));
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(
                    String origin, GeolocationPermissions.Callback cb) {
                cb.invoke(origin, true, false);
            }

            @Override
            public boolean onJsAlert(WebView v, String url, String msg, JsResult r) {
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
                r.confirm();
                return true;
            }
        });

        _webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                _injectBridges();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return false;
            }

            /** 网络错误（DNS 失败、超时等）→ 回退本地 */
            @Override
            public void onReceivedError(WebView view, WebResourceRequest req,
                                        WebResourceError err) {
                if (req.isForMainFrame() && _loadedFromRemote) {
                    _fallbackToLocal(view);
                }
            }

            /** HTTP 4xx / 5xx → 回退本地 */
            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest req,
                                            WebResourceResponse resp) {
                if (req.isForMainFrame() && _loadedFromRemote
                        && resp.getStatusCode() >= 400) {
                    _fallbackToLocal(view);
                }
            }

            private void _fallbackToLocal(WebView view) {
                _loadedFromRemote = false;
                view.stopLoading();
                view.loadUrl("file:///android_asset/index.html");
                Toast.makeText(MainActivity.this,
                        "离线模式：使用本地缓存版本", Toast.LENGTH_SHORT).show();
            }
        });

        _webView.addJavascriptInterface(new AppBridge(), "AndroidBridge");
        setContentView(_webView);

        // ── 热更新：有网络时优先加载远程最新版 ──
        if (!REMOTE_URL.isEmpty() && _isNetworkAvailable()) {
            _loadedFromRemote = true;
            _webView.loadUrl(REMOTE_URL);
        } else {
            _webView.loadUrl("file:///android_asset/index.html");
        }
    }

    /* ════════════════════════════════════════
       页面载入后注入所有 JS 桥接 & Polyfill
       ════════════════════════════════════════ */
    private void _injectBridges() {
        _injectSpeechPolyfill();
        _injectFloatPetButton();
    }

    /**
     * 注入 SpeechRecognition Polyfill
     * ─────────────────────────────────
     * Android WebView 不支持 webkitSpeechRecognition，
     * 这里用 Android 原生 SpeechRecognizer 替换，
     * API 完全兼容原有 JS 代码（onresult / onend / continuous 等）。
     */
    private void _injectSpeechPolyfill() {
        final String js =
            "(function(){\n"
          + "  if(!window.AndroidBridge) return;\n"
          // 如果浏览器已原生支持就不替换（不太可能，但安全起见）
          + "  if(window._nativeSRReady) return;\n"
          + "  window._nativeSRReady = true;\n"
          + "\n"
          + "  function NativeSR(){\n"
          + "    this.lang='zh-CN';\n"
          + "    this.continuous=false;\n"
          + "    this.interimResults=true;\n"
          + "    this.maxAlternatives=1;\n"
          + "    this.onresult=null;\n"
          + "    this.onerror=null;\n"
          + "    this.onend=null;\n"
          + "    this.onstart=null;\n"
          + "  }\n"
          + "  NativeSR.prototype.start=function(){\n"
          + "    window.__activeSR=this;\n"
          + "    AndroidBridge.startSpeechRecognition(\n"
          + "      this.lang||'zh-CN',\n"
          + "      this.interimResults?1:0\n"
          + "    );\n"
          + "    if(this.onstart) this.onstart({});\n"
          + "  };\n"
          + "  NativeSR.prototype.stop=function(){\n"
          + "    AndroidBridge.stopSpeechRecognition();\n"
          + "  };\n"
          + "  NativeSR.prototype.abort=function(){\n"
          + "    AndroidBridge.stopSpeechRecognition();\n"
          + "  };\n"
          + "\n"
          // 回调：中间结果 / 最终结果
          + "  window.__srOnResult=function(text,isFinal){\n"
          + "    var sr=window.__activeSR;\n"
          + "    if(!sr||!sr.onresult) return;\n"
          + "    var alt={transcript:text,confidence:0.9};\n"
          + "    var res=[alt];\n"
          + "    res.isFinal=!!isFinal;\n"
          // 让 res[0] 可迭代（原生 SpeechRecognitionResult 是可迭代的）
          + "    res[Symbol.iterator]=function*(){yield alt;};\n"
          + "    var ev={resultIndex:0,results:[res]};\n"
          + "    ev.results[Symbol.iterator]=function*(){yield res;};\n"
          + "    sr.onresult(ev);\n"
          + "  };\n"
          + "  window.__srOnEnd=function(){\n"
          + "    var sr=window.__activeSR;\n"
          + "    window.__activeSR=null;\n"
          + "    if(sr&&sr.onend) sr.onend({});\n"
          + "  };\n"
          + "  window.__srOnError=function(err){\n"
          + "    var sr=window.__activeSR;\n"
          + "    window.__activeSR=null;\n"
          + "    if(sr&&sr.onerror) sr.onerror({error:err});\n"
          + "    if(sr&&sr.onend)   sr.onend({});\n"
          + "  };\n"
          + "\n"
          + "  window.SpeechRecognition=NativeSR;\n"
          + "  window.webkitSpeechRecognition=NativeSR;\n"
          + "  console.log('[FloatPet] SpeechRecognition polyfill loaded (Android native)');\n"
          + "})();";

        _webView.evaluateJavascript(js, null);
    }

    /** 注入右下角 🐾 悬浮桌宠控制按钮 */
    private void _injectFloatPetButton() {
        final boolean isRunning = _prefs.getBoolean("service_running", false);
        final String bg = isRunning
                ? "background:rgba(255,215,0,0.95);box-shadow:0 0 12px rgba(255,215,0,0.6);"
                : "background:rgba(30,30,50,0.88);box-shadow:0 2px 10px rgba(0,0,0,0.5);";

        final String js =
            "(function(){\n"
          + "  if(document.getElementById('__fpet_btn'))return;\n"
          + "  var b=document.createElement('div');\n"
          + "  b.id='__fpet_btn';\n"
          + "  b.title='悬浮桌宠';\n"
          + "  b.style='position:fixed;bottom:80px;right:14px;"
          +            "width:46px;height:46px;border-radius:50%;"
          +            bg
          +            "display:flex;align-items:center;justify-content:center;"
          +            "font-size:22px;z-index:2147483647;"
          +            "cursor:pointer;transition:transform .15s,box-shadow .15s;"
          +            "user-select:none;-webkit-user-select:none;';\n"
          + "  b.textContent='\\uD83D\\uDC3E';\n"    // 🐾
          + "  b.ontouchstart=function(){this.style.transform='scale(0.88)';};\n"
          + "  b.ontouchend=function(){this.style.transform='';this._tap();};\n"
          + "  b.onclick=function(){this._tap();};\n"
          + "  b._tap=function(){\n"
          + "    if(!window.AndroidBridge)return;\n"
          + "    if(AndroidBridge.isFloatingPetActive()){\n"
          + "      AndroidBridge.stopFloatingPet();\n"
          + "      this.style.background='rgba(30,30,50,0.88)';\n"
          + "      this.style.boxShadow='0 2px 10px rgba(0,0,0,0.5)';\n"
          + "    } else {\n"
          + "      AndroidBridge.launchFloatingPet();\n"
          + "    }\n"
          + "  };\n"
          + "  document.body.appendChild(b);\n"
          + "  window.__fpetSetActive=function(on){\n"
          + "    var el=document.getElementById('__fpet_btn');\n"
          + "    if(!el)return;\n"
          + "    if(on){\n"
          + "      el.style.background='rgba(255,215,0,0.95)';\n"
          + "      el.style.boxShadow='0 0 12px rgba(255,215,0,0.6)';\n"
          + "    } else {\n"
          + "      el.style.background='rgba(30,30,50,0.88)';\n"
          + "      el.style.boxShadow='0 2px 10px rgba(0,0,0,0.5)';\n"
          + "    }\n"
          + "  };\n"
          + "})();";

        _webView.evaluateJavascript(js, null);
    }

    private void _setButtonActive(boolean on) {
        runOnUiThread(() -> _webView.evaluateJavascript(
                "if(window.__fpetSetActive)__fpetSetActive(" + on + ");", null));
    }

    /* ════════════════════════════════════════
       JavaScript → Java Bridge
       ════════════════════════════════════════ */
    private class AppBridge {

        /* ── 悬浮桌宠 ── */

        @JavascriptInterface
        public void launchFloatingPet() {
            runOnUiThread(() -> {
                if (!Settings.canDrawOverlays(MainActivity.this)) {
                    startActivityForResult(
                        new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                Uri.parse("package:" + getPackageName())),
                        REQ_OVERLAY);
                } else {
                    _requestMediaProjection();
                }
            });
        }

        @JavascriptInterface
        public void stopFloatingPet() {
            runOnUiThread(() -> {
                startService(new Intent(MainActivity.this, FloatingWindowService.class)
                        .setAction(FloatingWindowService.ACTION_STOP));
                _prefs.edit().putBoolean("service_running", false).apply();
                _setButtonActive(false);
            });
        }

        @JavascriptInterface
        public boolean isFloatingPetActive() {
            return _prefs.getBoolean("service_running", false);
        }

        @JavascriptInterface
        public void saveAiSettings(String apiKey, String endpoint,
                                   String model, String persona, int intervalMin) {
            _prefs.edit()
                    .putString("api_key",      apiKey)
                    .putString("api_endpoint", endpoint.isEmpty()
                            ? "https://api.openai.com/v1" : endpoint)
                    .putString("model",        model.isEmpty() ? "gpt-4o" : model)
                    .putString("persona",      persona)
                    .putInt("interval_min",    intervalMin)
                    .apply();
            startService(new Intent(MainActivity.this, FloatingWindowService.class)
                    .setAction(FloatingWindowService.ACTION_SET_PERSONA)
                    .putExtra(FloatingWindowService.EXTRA_PERSONA, persona));
        }

        @JavascriptInterface
        public String getAiSettings() {
            return "{"
                + "\"apiKey\":\""    + _esc(_prefs.getString("api_key", ""))                   + "\","
                + "\"endpoint\":\""  + _esc(_prefs.getString("api_endpoint",
                                            "https://api.openai.com/v1"))                      + "\","
                + "\"model\":\""     + _esc(_prefs.getString("model", "gpt-4o"))               + "\","
                + "\"persona\":\""   + _esc(_prefs.getString("persona", ""))                   + "\","
                + "\"intervalMin\":" + _prefs.getInt("interval_min", 10)
                + "}";
        }

        @JavascriptInterface
        public void triggerPetScan() {
            runOnUiThread(() ->
                startService(new Intent(MainActivity.this, FloatingWindowService.class)
                        .setAction(FloatingWindowService.ACTION_TRIGGER_SCAN)));
        }

        /* ── 原生语音识别（替代 webkitSpeechRecognition）── */

        /**
         * JS 调用：开始录音识别
         * @param lang        语言代码，如 "zh-CN"
         * @param interimRes  是否需要中间结果（1=是，0=否）
         */
        @JavascriptInterface
        public void startSpeechRecognition(final String lang, final int interimRes) {
            runOnUiThread(() -> {
                // 确保有麦克风权限
                if (ContextCompat.checkSelfPermission(MainActivity.this,
                        Manifest.permission.RECORD_AUDIO)
                        != PackageManager.PERMISSION_GRANTED) {
                    _webView.evaluateJavascript(
                            "if(window.__srOnError)__srOnError('not-allowed');", null);
                    return;
                }

                // 销毁旧识别器
                if (_speechRecognizer != null) {
                    _speechRecognizer.destroy();
                    _speechRecognizer = null;
                }

                _srInterim = (interimRes == 1);
                _speechRecognizer = SpeechRecognizer.createSpeechRecognizer(
                        MainActivity.this);
                _speechRecognizer.setRecognitionListener(new RecognitionListener() {

                    @Override public void onReadyForSpeech(Bundle p)   {}
                    @Override public void onBeginningOfSpeech()        {}
                    @Override public void onRmsChanged(float v)        {}
                    @Override public void onBufferReceived(byte[] b)   {}
                    @Override public void onEvent(int t, Bundle b)     {}

                    @Override
                    public void onPartialResults(Bundle b) {
                        if (!_srInterim) return;
                        ArrayList<String> list =
                                b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        if (list != null && !list.isEmpty()) {
                            _fireSrResult(list.get(0), false);
                        }
                    }

                    @Override
                    public void onResults(Bundle b) {
                        ArrayList<String> list =
                                b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        if (list != null && !list.isEmpty()) {
                            _fireSrResult(list.get(0), true);
                        }
                        _webView.post(() -> _webView.evaluateJavascript(
                                "if(window.__srOnEnd)__srOnEnd();", null));
                    }

                    @Override
                    public void onError(int error) {
                        final String msg;
                        switch (error) {
                            case SpeechRecognizer.ERROR_NO_MATCH:      msg = "no-speech";     break;
                            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:msg = "no-speech";     break;
                            case SpeechRecognizer.ERROR_AUDIO:         msg = "audio-capture"; break;
                            case SpeechRecognizer.ERROR_NETWORK:       msg = "network";       break;
                            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                                                                       msg = "not-allowed";   break;
                            default:                                   msg = "aborted";       break;
                        }
                        _webView.post(() -> _webView.evaluateJavascript(
                                "if(window.__srOnError)__srOnError('" + msg + "');", null));
                    }

                    @Override public void onEndOfSpeech() {}
                });

                final Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                        RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE,
                        (lang == null || lang.isEmpty()) ? "zh-CN" : lang);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, _srInterim);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                // 允许较长的静音段，配合长按逻辑
                intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2000L);
                intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2000L);

                try {
                    _speechRecognizer.startListening(intent);
                } catch (Exception e) {
                    _webView.evaluateJavascript(
                            "if(window.__srOnError)__srOnError('audio-capture');", null);
                }
            });
        }

        /** JS 调用：停止录音（让识别器把当前片段结果返回） */
        @JavascriptInterface
        public void stopSpeechRecognition() {
            runOnUiThread(() -> {
                if (_speechRecognizer != null) {
                    _speechRecognizer.stopListening();
                }
            });
        }

        // 工具：推送识别结果给 JS
        private void _fireSrResult(String text, boolean isFinal) {
            // 转义单引号，防止 JS 注入
            final String safe = text.replace("\\", "\\\\")
                                    .replace("'", "\\'")
                                    .replace("\n", " ");
            _webView.post(() -> _webView.evaluateJavascript(
                    "if(window.__srOnResult)__srOnResult('" + safe + "'," + isFinal + ");",
                    null));
        }

        // 工具：JSON 字符串转义
        private String _esc(String s) {
            if (s == null) return "";
            return s.replace("\\", "\\\\").replace("\"", "\\\"")
                    .replace("\n", "\\n").replace("\r", "\\r");
        }
    }

    /* ════════════════════════════════════════
       网络检测
       ════════════════════════════════════════ */

    /** 检测是否有可用网络（Wi-Fi / 移动数据 / 以太网）*/
    private boolean _isNetworkAvailable() {
        android.net.ConnectivityManager cm =
                (android.net.ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        android.net.Network network = cm.getActiveNetwork();
        if (network == null) return false;
        android.net.NetworkCapabilities caps = cm.getNetworkCapabilities(network);
        return caps != null && (
                caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI)
             || caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR)
             || caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_ETHERNET));
    }

    /* ════════════════════════════════════════
       权限流程
       ════════════════════════════════════════ */

    /** 一次性请求麦克风 + 摄像头 */
    private void _requestRuntimePermissions() {
        final java.util.List<String> needed = new java.util.ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.RECORD_AUDIO);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.CAMERA);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this,
                    needed.toArray(new String[0]), REQ_AUDIO_CAMERA);
        }
    }

    private void _requestMediaProjection() {
        startActivityForResult(_mpMgr.createScreenCaptureIntent(), REQ_MEDIA_PRJ);
    }

    private void _startFloatingService(int resultCode, Intent data) {
        final Intent svc = new Intent(this, FloatingWindowService.class)
                .setAction(FloatingWindowService.ACTION_START)
                .putExtra(FloatingWindowService.EXTRA_API_KEY,
                        _prefs.getString("api_key", ""))
                .putExtra(FloatingWindowService.EXTRA_API_ENDPOINT,
                        _prefs.getString("api_endpoint", "https://api.openai.com/v1"))
                .putExtra(FloatingWindowService.EXTRA_MODEL,
                        _prefs.getString("model", "gpt-4o"))
                .putExtra(FloatingWindowService.EXTRA_PERSONA,
                        _prefs.getString("persona", ""))
                .putExtra(FloatingWindowService.EXTRA_INTERVAL_MIN,
                        _prefs.getInt("interval_min", 10));
        if (data != null) {
            svc.putExtra(FloatingWindowService.EXTRA_PROJECTION_CODE, resultCode);
            svc.putExtra(FloatingWindowService.EXTRA_PROJECTION_DATA, data);
        }
        startForegroundService(svc);
        _prefs.edit().putBoolean("service_running", true).apply();
        _setButtonActive(true);
        Toast.makeText(this, "🐾 桌宠已启动！可切换到其他 App", Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_OVERLAY) {
            if (Settings.canDrawOverlays(this)) {
                _requestMediaProjection();
            } else {
                Toast.makeText(this, "需要「显示在其他应用上层」权限", Toast.LENGTH_LONG).show();
            }
        } else if (req == REQ_MEDIA_PRJ) {
            if (res == Activity.RESULT_OK && data != null) {
                _startFloatingService(res, data);
            } else {
                _startFloatingService(-1, null);
                Toast.makeText(this, "桌宠已启动（无截屏权限，仅文本吐槽）", Toast.LENGTH_SHORT).show();
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] grants) {
        super.onRequestPermissionsResult(req, perms, grants);
        // 权限授予后重新注入 polyfill（确保 SR 可用）
        if (req == REQ_AUDIO_CAMERA && _webView != null) {
            _webView.postDelayed(this::_injectSpeechPolyfill, 500);
        }
    }

    /* ════════════════════════════════════════
       生命周期
       ════════════════════════════════════════ */
    @Override
    public void onBackPressed() {
        if (_webView != null && _webView.canGoBack()) {
            _webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (_webView != null) {
            _webView.postDelayed(this::_injectBridges, 300);
        }
    }

    @Override
    protected void onDestroy() {
        if (_speechRecognizer != null) {
            _speechRecognizer.destroy();
            _speechRecognizer = null;
        }
        if (_webView != null) {
            _webView.destroy();
            _webView = null;
        }
        super.onDestroy();
    }
}
