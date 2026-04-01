package com.beeper.floatpet;

import android.Manifest;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.speech.*;
import android.webkit.*;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;

/**
 * MainActivity
 * ─────────────
 * 全屏 WebView 加载完整的 index.html。
 * 通过 AndroidBridge 提供：
 *   1. 悬浮桌宠启停（FloatingWindowService）+ 角色头像/气泡同步
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
     */
    private static final String REMOTE_URL =
            "https://pleaseweiwei.github.io/My-Beeper-orz/";

    private static final int REQ_OVERLAY      = 1001;
    private static final int REQ_NOTIFICATION = 1003;
    private static final int REQ_AUDIO_CAMERA = 1004;

    private WebView           _webView;
    private SharedPreferences _prefs;

    /** 当前是否正在加载远程 URL（用于出错时回退本地）*/
    private boolean _loadedFromRemote = false;

    /** 标记是否正在等待悬浮窗权限返回（部分 ROM 不触发 onActivityResult，在 onResume 兜底）*/
    private boolean _waitingForOverlay = false;

    // 原生语音识别
    private SpeechRecognizer _speechRecognizer;
    private boolean          _srInterim = true;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        _prefs = getSharedPreferences("floatpet_prefs", Context.MODE_PRIVATE);
        _setupWebView();
        _requestRuntimePermissions();
        // 启动 3 秒后静默检测更新，不影响启动体验
        new Handler(Looper.getMainLooper()).postDelayed(this::_checkForUpdate, 3000);
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

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req,
                                        WebResourceError err) {
                if (req.isForMainFrame() && _loadedFromRemote) {
                    _fallbackToLocal(view);
                }
            }

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
     */
    private void _injectSpeechPolyfill() {
        final String js =
            "(function(){\n"
          + "  if(!window.AndroidBridge) return;\n"
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
          + "  window.__srOnResult=function(text,isFinal){\n"
          + "    var sr=window.__activeSR;\n"
          + "    if(!sr||!sr.onresult) return;\n"
          + "    var alt={transcript:text,confidence:0.9};\n"
          + "    var res=[alt];\n"
          + "    res.isFinal=!!isFinal;\n"
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
          + "  b.textContent='\\uD83D\\uDC3E';\n"
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

        /* ── 悬浮桌宠启停 ── */

        @JavascriptInterface
        public void launchFloatingPet() {
            runOnUiThread(() -> {
                if (!Settings.canDrawOverlays(MainActivity.this)) {
                    _waitingForOverlay = true;
                    startActivityForResult(
                        new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                Uri.parse("package:" + getPackageName())),
                        REQ_OVERLAY);
                } else {
                    _startFloatingService();
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

        /* ── 角色头像 / 气泡同步（app_floatpet.js 调用）── */

        /**
         * 更新悬浮窗中显示的角色头像和名字。
         * 由 app_floatpet.js 在启动桌宠时调用。
         */
        @JavascriptInterface
        public void updateOverlayAvatar(String avatarUrl, String charName) {
            if (!_prefs.getBoolean("service_running", false)) return;
            final Intent i = new Intent(MainActivity.this, FloatingWindowService.class)
                    .setAction(FloatingWindowService.ACTION_UPDATE_AVATAR)
                    .putExtra(FloatingWindowService.EXTRA_AVATAR_URL,  avatarUrl  != null ? avatarUrl  : "")
                    .putExtra(FloatingWindowService.EXTRA_CHAR_NAME,   charName   != null ? charName   : "");
            startService(i);
        }

        /**
         * 将 AI 生成的气泡文字推送到系统悬浮窗。
         * 由 app_floatpet.js 的 _showBubble() 调用。
         */
        @JavascriptInterface
        public void sendOverlayBubble(String text) {
            if (!_prefs.getBoolean("service_running", false)) return;
            final Intent i = new Intent(MainActivity.this, FloatingWindowService.class)
                    .setAction(FloatingWindowService.ACTION_SHOW_BUBBLE)
                    .putExtra(FloatingWindowService.EXTRA_BUBBLE_TEXT, text != null ? text : "");
            startService(i);
        }

        /**
         * 让系统悬浮窗显示「思考中」动画。
         * 由 app_floatpet.js 的 _showThinkingBubble() 调用。
         */
        @JavascriptInterface
        public void sendOverlayThinking() {
            if (!_prefs.getBoolean("service_running", false)) return;
            startService(new Intent(MainActivity.this, FloatingWindowService.class)
                    .setAction(FloatingWindowService.ACTION_SHOW_THINKING));
        }

        /* ── AI 设置存储（供服务关闭后重启时恢复）── */

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
            // 如果服务运行中，同步 persona 设置
            if (_prefs.getBoolean("service_running", false)) {
                startService(new Intent(MainActivity.this, FloatingWindowService.class)
                        .setAction(FloatingWindowService.ACTION_SET_PERSONA)
                        .putExtra(FloatingWindowService.EXTRA_PERSONA, persona));
            }
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
            if (_prefs.getBoolean("service_running", false)) {
                startService(new Intent(MainActivity.this, FloatingWindowService.class)
                        .setAction(FloatingWindowService.ACTION_TRIGGER_SCAN));
            }
        }

        /* ── 原生语音识别（替代 webkitSpeechRecognition）── */

        @JavascriptInterface
        public void startSpeechRecognition(final String lang, final int interimRes) {
            runOnUiThread(() -> {
                if (ContextCompat.checkSelfPermission(MainActivity.this,
                        Manifest.permission.RECORD_AUDIO)
                        != PackageManager.PERMISSION_GRANTED) {
                    _webView.evaluateJavascript(
                            "if(window.__srOnError)__srOnError('not-allowed');", null);
                    return;
                }

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

        @JavascriptInterface
        public void stopSpeechRecognition() {
            runOnUiThread(() -> {
                if (_speechRecognizer != null) {
                    _speechRecognizer.stopListening();
                }
            });
        }

        private void _fireSrResult(String text, boolean isFinal) {
            final String safe = text.replace("\\", "\\\\")
                                    .replace("'", "\\'")
                                    .replace("\n", " ");
            _webView.post(() -> _webView.evaluateJavascript(
                    "if(window.__srOnResult)__srOnResult('" + safe + "'," + isFinal + ");",
                    null));
        }

        private String _esc(String s) {
            if (s == null) return "";
            return s.replace("\\", "\\\\").replace("\"", "\\\"")
                    .replace("\n", "\\n").replace("\r", "\\r");
        }
    }

    /* ════════════════════════════════════════
       启动悬浮服务（无需 MediaProjection）
       ════════════════════════════════════════ */
    private void _startFloatingService() {
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
                .putExtra(FloatingWindowService.EXTRA_CHAR_NAME,
                        _prefs.getString("char_name", ""))
                .putExtra(FloatingWindowService.EXTRA_AVATAR_URL,
                        _prefs.getString("avatar_url", ""))
                .putExtra(FloatingWindowService.EXTRA_INTERVAL_MIN,
                        _prefs.getInt("interval_min", 10));
        startForegroundService(svc);
        _prefs.edit().putBoolean("service_running", true).apply();
        _setButtonActive(true);
        Toast.makeText(this, "🐾 桌宠已启动！可切换到其他 App", Toast.LENGTH_SHORT).show();
    }

    /* ════════════════════════════════════════
       网络检测
       ════════════════════════════════════════ */
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

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_OVERLAY) {
            _waitingForOverlay = false;
            // 部分设备权限生效有短暂延迟，延迟 500ms 再检查
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                if (Settings.canDrawOverlays(MainActivity.this)) {
                    _startFloatingService();
                } else {
                    Toast.makeText(MainActivity.this,
                            "需要「显示在其他应用上层」权限", Toast.LENGTH_LONG).show();
                }
            }, 500);
        }
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] grants) {
        super.onRequestPermissionsResult(req, perms, grants);
        if (req == REQ_AUDIO_CAMERA && _webView != null) {
            _webView.postDelayed(this::_injectSpeechPolyfill, 500);
        }
    }

    /* ════════════════════════════════════════
       App 内自动更新
       ════════════════════════════════════════ */

    /**
     * 在子线程中拉取 version.json，与当前 versionCode 对比，
     * 有新版本则在主线程弹确认对话框。
     */
    private void _checkForUpdate() {
        if (!_isNetworkAvailable()) return;
        new Thread(() -> {
            try {
                final String versionUrl =
                    "https://raw.githubusercontent.com/ljb0621/bono1122/main/version.json";
                HttpURLConnection conn =
                    (HttpURLConnection) new URL(versionUrl).openConnection();
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                conn.setRequestProperty("Cache-Control", "no-cache");

                BufferedReader br = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), "UTF-8"));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
                br.close();
                conn.disconnect();

                JSONObject json  = new JSONObject(sb.toString());
                int latestCode   = json.getInt("versionCode");
                String latestName = json.optString("versionName", "新版本");
                String apkUrl    = json.getString("apkUrl");
                String notes     = json.optString("notes", "");

                int currentCode  = BuildConfig.VERSION_CODE;
                if (latestCode > currentCode) {
                    runOnUiThread(() ->
                        _showUpdateDialog(latestName, notes, apkUrl));
                }
            } catch (Exception e) {
                // 静默失败，不影响正常使用
            }
        }).start();
    }

    private void _showUpdateDialog(String version, String notes, String apkUrl) {
        String msg = "发现新版本 " + version + "\n\n"
            + (notes.isEmpty() ? "包含最新功能与修复。" : notes)
            + "\n\n是否立即下载并更新？";
        new AlertDialog.Builder(this)
            .setTitle("🎉 发现新版本")
            .setMessage(msg)
            .setCancelable(true)
            .setPositiveButton("立即更新", (d, w) -> _downloadAndInstall(apkUrl))
            .setNegativeButton("下次再说", null)
            .show();
    }

    /**
     * 使用系统 DownloadManager 后台下载 APK，
     * 下载完成后通过广播触发安装界面。
     */
    private void _downloadAndInstall(String apkUrl) {
        try {
            // 清理旧的安装包
            File dest = new File(getExternalFilesDir(null), "update.apk");
            if (dest.exists()) dest.delete();

            DownloadManager.Request req =
                new DownloadManager.Request(Uri.parse(apkUrl));
            req.setTitle("Beeper 正在更新...");
            req.setDescription("新版本 APK 下载中，完成后点击安装");
            req.setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalFilesDir(this, null, "update.apk");
            req.setMimeType("application/vnd.android.package-archive");
            req.addRequestHeader("Cache-Control", "no-cache");

            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            long downloadId = dm.enqueue(req);

            // 注册一次性广播，下载完成后触发安装
            BroadcastReceiver receiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context ctx, Intent intent) {
                    long id = intent.getLongExtra(
                        DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (id == downloadId) {
                        try { unregisterReceiver(this); } catch (Exception ignore) {}
                        _installApk();
                    }
                }
            };
            registerReceiver(receiver,
                new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));

            Toast.makeText(this,
                "⬇️ 正在后台下载新版本，下载完成会提示安装",
                Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            Toast.makeText(this,
                "下载失败：" + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    /** 用 FileProvider 提供 content URI，启动系统安装界面 */
    private void _installApk() {
        try {
            File apkFile = new File(getExternalFilesDir(null), "update.apk");
            if (!apkFile.exists()) {
                runOnUiThread(() -> Toast.makeText(this,
                    "安装文件未找到，请重试", Toast.LENGTH_SHORT).show());
                return;
            }
            Uri apkUri = FileProvider.getUriForFile(
                this, getPackageName() + ".fileprovider", apkFile);

            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(apkUri,
                "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(install);
        } catch (Exception e) {
            runOnUiThread(() -> Toast.makeText(this,
                "请在通知栏点击安装", Toast.LENGTH_LONG).show());
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
        // 部分国产 ROM（MIUI / ColorOS 等）从系统设置返回时不触发 onActivityResult，
        // 在 onResume 里兜底处理悬浮窗权限
        if (_waitingForOverlay) {
            _waitingForOverlay = false;
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                if (Settings.canDrawOverlays(MainActivity.this)) {
                    _startFloatingService();
                } else {
                    Toast.makeText(MainActivity.this,
                            "需要「显示在其他应用上层」权限", Toast.LENGTH_LONG).show();
                }
            }, 500);
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
