package com.beeper.floatpet;

import android.app.*;
import android.content.*;
import android.graphics.*;
import android.os.*;
import android.util.DisplayMetrics;
import android.view.*;
import android.webkit.*;
import android.widget.*;

import androidx.core.app.NotificationCompat;

import org.json.*;

import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;

/**
 * FloatingWindowService
 * ─────────────────────
 * 系统级悬浮桌宠服务（AI 角色版）：
 *  1. TYPE_APPLICATION_OVERLAY 透明浮层（WebView 渲染 floatpet_overlay.html）
 *  2. 角色头像 / 气泡由主 App 通过 Intent 注入（与 app_floatpet.js 完全绑定）
 *  3. 服务自有定时器：App 关闭后仍可定时调用 AI 生成气泡（文本模式，无截图）
 *  4. 单击桌宠 → 打开主 App；双击 → 手动触发 AI
 *  5. 可拖动，位置持久化
 */
public class FloatingWindowService extends Service {

    private static final String TAG        = "FloatPetService";
    private static final String CHANNEL_ID = "floatpet_channel";
    private static final int    NOTIF_ID   = 1001;

    /* ── Intent actions ── */
    public static final String ACTION_START          = "com.beeper.floatpet.START";
    public static final String ACTION_STOP           = "com.beeper.floatpet.STOP";
    public static final String ACTION_TRIGGER_SCAN   = "com.beeper.floatpet.TRIGGER_SCAN";
    public static final String ACTION_SET_INTERVAL   = "com.beeper.floatpet.SET_INTERVAL";
    public static final String ACTION_SET_STYLE      = "com.beeper.floatpet.SET_STYLE";
    public static final String ACTION_SET_PERSONA    = "com.beeper.floatpet.SET_PERSONA";
    public static final String ACTION_UPDATE_AVATAR  = "com.beeper.floatpet.UPDATE_AVATAR";
    public static final String ACTION_SHOW_BUBBLE    = "com.beeper.floatpet.SHOW_BUBBLE";
    public static final String ACTION_SHOW_THINKING  = "com.beeper.floatpet.SHOW_THINKING";

    /* ── Intent extras ── */
    public static final String EXTRA_INTERVAL_MIN    = "interval_min";
    public static final String EXTRA_STYLE_HTML      = "style_html";
    public static final String EXTRA_PERSONA         = "persona";
    public static final String EXTRA_API_KEY         = "api_key";
    public static final String EXTRA_API_ENDPOINT    = "api_endpoint";
    public static final String EXTRA_MODEL           = "model";
    public static final String EXTRA_PROJECTION_DATA = "projection_data";   // kept for compat
    public static final String EXTRA_PROJECTION_CODE = "projection_code";   // kept for compat
    public static final String EXTRA_AVATAR_URL      = "avatar_url";
    public static final String EXTRA_CHAR_NAME       = "char_name";
    public static final String EXTRA_BUBBLE_TEXT     = "bubble_text";

    /* ── UI ── */
    private WindowManager _wm;
    private View          _floatRoot;
    private WebView       _petWebView;

    /* ── State ── */
    private int     _intervalMin    = 10;
    private String  _persona        = "";
    private String  _apiKey         = "";
    private String  _apiEndpoint    = "https://api.openai.com/v1";
    private String  _model          = "gpt-4o";
    private String  _charName       = "";
    private String  _avatarUrl      = "";
    private boolean _scanning       = false;
    private boolean _overlayReady   = false;   // WebView onPageFinished 后为 true

    /* ── Timer ── */
    private final Handler  _mainHandler   = new Handler(Looper.getMainLooper());
    private       Runnable _timerRunnable = null;

    /* ── Background executor ── */
    private final ExecutorService _exec = Executors.newSingleThreadExecutor();

    /* ── SharedPrefs ── */
    private SharedPreferences _prefs;

    /* ── Screen metrics ── */
    private int _screenWidth, _screenHeight;

    /* ════════════════════════════════════════
       Service lifecycle
       ════════════════════════════════════════ */
    @Override
    public void onCreate() {
        super.onCreate();
        _prefs = getSharedPreferences("floatpet_prefs", Context.MODE_PRIVATE);
        _loadPrefs();
        _createNotificationChannel();
        startForeground(NOTIF_ID, _buildNotification());
        _initDisplayMetrics();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;
        final String action = intent.getAction();

        if (ACTION_STOP.equals(action)) {
            action_stop();
            return START_NOT_STICKY;
        }
        if (ACTION_UPDATE_AVATAR.equals(action)) {
            final String url  = intent.getStringExtra(EXTRA_AVATAR_URL);
            final String name = intent.getStringExtra(EXTRA_CHAR_NAME);
            _mainHandler.post(() -> _updateAvatarInWebView(url, name));
            return START_STICKY;
        }
        if (ACTION_SHOW_BUBBLE.equals(action)) {
            final String text = intent.getStringExtra(EXTRA_BUBBLE_TEXT);
            _mainHandler.post(() -> _showBubbleInWebView(text, 12000));
            return START_STICKY;
        }
        if (ACTION_SHOW_THINKING.equals(action)) {
            _mainHandler.post(this::_showThinkingInWebView);
            return START_STICKY;
        }
        if (ACTION_TRIGGER_SCAN.equals(action)) {
            _mainHandler.post(() -> _triggerAI(true));
            return START_STICKY;
        }
        if (ACTION_SET_INTERVAL.equals(action)) {
            _intervalMin = intent.getIntExtra(EXTRA_INTERVAL_MIN, 10);
            _prefs.edit().putInt("interval_min", _intervalMin).apply();
            _rescheduleTimer();
            return START_STICKY;
        }
        if (ACTION_SET_PERSONA.equals(action)) {
            final String p = intent.getStringExtra(EXTRA_PERSONA);
            if (p != null) { _persona = p; _savePrefs(); }
            return START_STICKY;
        }

        /* ACTION_START (or null action = restart by system) */
        _action_start(intent);
        return START_STICKY;
    }

    private void _action_start(Intent intent) {
        if (intent.hasExtra(EXTRA_API_KEY))      _apiKey      = intent.getStringExtra(EXTRA_API_KEY);
        if (intent.hasExtra(EXTRA_API_ENDPOINT)) _apiEndpoint = intent.getStringExtra(EXTRA_API_ENDPOINT);
        if (intent.hasExtra(EXTRA_MODEL))        _model       = intent.getStringExtra(EXTRA_MODEL);
        if (intent.hasExtra(EXTRA_PERSONA))      _persona     = intent.getStringExtra(EXTRA_PERSONA);
        if (intent.hasExtra(EXTRA_CHAR_NAME))    _charName    = intent.getStringExtra(EXTRA_CHAR_NAME);
        if (intent.hasExtra(EXTRA_AVATAR_URL))   _avatarUrl   = intent.getStringExtra(EXTRA_AVATAR_URL);
        if (intent.hasExtra(EXTRA_INTERVAL_MIN)) _intervalMin = intent.getIntExtra(EXTRA_INTERVAL_MIN, 10);
        _savePrefs();

        if (_floatRoot == null) _buildFloatWindow();
        _rescheduleTimer();
    }

    private void action_stop() {
        _cancelTimer();
        _destroyFloatWindow();
        _exec.shutdownNow();
        _prefs.edit().putBoolean("service_running", false).apply();
        stopSelf();
    }

    @Override
    public void onDestroy() {
        _cancelTimer();
        _destroyFloatWindow();
        _exec.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    /* ════════════════════════════════════════
       Build Floating Window
       ════════════════════════════════════════ */
    private void _buildFloatWindow() {
        _wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);

        final int wPx = dpToPx(130);
        final int hPx = dpToPx(260);   // tall enough to include bubble above avatar

        final WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                wPx, hPx,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = _prefs.getInt("float_x", _screenWidth - wPx - dpToPx(8));
        params.y = _prefs.getInt("float_y", _screenHeight / 2);

        /* WebView loads floatpet_overlay.html */
        _petWebView = new WebView(getApplicationContext());
        _petWebView.setBackgroundColor(Color.TRANSPARENT);

        final WebSettings ws = _petWebView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(true);
        ws.setAllowFileAccessFromFileURLs(true);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        ws.setMediaPlaybackRequiresUserGesture(false);

        _petWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                _overlayReady = true;
                // Push avatar that was set before page loaded
                if (!_avatarUrl.isEmpty()) {
                    _updateAvatarInWebView(_avatarUrl, _charName);
                }
            }
        });
        _petWebView.addJavascriptInterface(new OverlayBridge(), "AndroidBridge");
        _petWebView.loadUrl("file:///android_asset/floatpet_overlay.html");

        _floatRoot = _petWebView;

        /* Drag + tap gesture */
        final GestureDetector gd = new GestureDetector(this,
                new GestureDetector.SimpleOnGestureListener() {
                    @Override
                    public boolean onSingleTapConfirmed(MotionEvent e) {
                        _openMainApp();
                        return true;
                    }
                    @Override
                    public boolean onDoubleTap(MotionEvent e) {
                        _triggerAI(true);
                        return true;
                    }
                });

        final int[] _drag = {0, 0, 0, 0};  // initX, initY, initTX, initTY
        final boolean[] _moved = {false};

        _petWebView.setOnTouchListener((v, ev) -> {
            gd.onTouchEvent(ev);
            switch (ev.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    _drag[0] = params.x; _drag[1] = params.y;
                    _drag[2] = (int) ev.getRawX(); _drag[3] = (int) ev.getRawY();
                    _moved[0] = false;
                    break;
                case MotionEvent.ACTION_MOVE:
                    int dx = (int) ev.getRawX() - _drag[2];
                    int dy = (int) ev.getRawY() - _drag[3];
                    if (Math.abs(dx) + Math.abs(dy) > 8) _moved[0] = true;
                    if (_moved[0]) {
                        params.x = Math.max(0, Math.min(_screenWidth  - wPx, _drag[0] + dx));
                        params.y = Math.max(0, Math.min(_screenHeight - hPx, _drag[1] + dy));
                        try { _wm.updateViewLayout(_floatRoot, params); } catch (Exception ignored) {}
                    }
                    break;
                case MotionEvent.ACTION_UP:
                    _prefs.edit()
                          .putInt("float_x", params.x)
                          .putInt("float_y", params.y)
                          .apply();
                    break;
            }
            return true;
        });

        try {
            _wm.addView(_floatRoot, params);
        } catch (Exception e) {
            stopSelf();
        }
    }

    private void _destroyFloatWindow() {
        if (_floatRoot != null && _wm != null) {
            try { _wm.removeView(_floatRoot); } catch (Exception ignored) {}
        }
        if (_petWebView != null) {
            _petWebView.destroy();
            _petWebView = null;
        }
        _floatRoot    = null;
        _overlayReady = false;
    }

    /* ════════════════════════════════════════
       WebView helpers
       ════════════════════════════════════════ */
    private void _updateAvatarInWebView(String url, String name) {
        if (url  != null) _avatarUrl = url;
        if (name != null) _charName  = name;
        _savePrefs();
        if (_petWebView == null || !_overlayReady) return;
        final String safeUrl  = _esc(_avatarUrl);
        final String safeName = _esc(_charName);
        _petWebView.evaluateJavascript(
            "if(window.setAvatar)setAvatar('" + safeUrl + "','" + safeName + "');", null);
    }

    private void _showBubbleInWebView(String text, int ms) {
        if (_petWebView == null || text == null) return;
        // First line only for overlay brevity
        String first = text.split("[\n。！？!?]")[0].trim();
        if (first.isEmpty()) first = text;
        if (first.length() > 60) first = first.substring(0, 60) + "…";
        final String safe = _esc(first);
        _petWebView.evaluateJavascript(
            "if(window.showBubble)showBubble('" + safe + "'," + ms + ");", null);
    }

    private void _showThinkingInWebView() {
        if (_petWebView == null) return;
        _petWebView.evaluateJavascript(
            "if(window.petStartScan)petStartScan();", null);
    }

    /* ════════════════════════════════════════
       Open main app
       ════════════════════════════════════════ */
    private void _openMainApp() {
        try {
            Intent i = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (i != null) {
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(i);
            }
        } catch (Exception ignored) {}
    }

    /* ════════════════════════════════════════
       Timer (自有定时 AI，App 关闭后仍可运行)
       ════════════════════════════════════════ */
    private void _rescheduleTimer() {
        _cancelTimer();
        final long delayMs = (_intervalMin == 0)
                ? (long) ((3 + Math.random() * 12) * 60_000)
                : (long) _intervalMin * 60_000L;
        _timerRunnable = () -> _triggerAI(false);
        _mainHandler.postDelayed(_timerRunnable, delayMs);
    }

    private void _cancelTimer() {
        if (_timerRunnable != null) {
            _mainHandler.removeCallbacks(_timerRunnable);
            _timerRunnable = null;
        }
    }

    /* ════════════════════════════════════════
       AI call (text only, no screenshot)
       ════════════════════════════════════════ */
    private void _triggerAI(boolean manual) {
        if (_scanning) return;
        _scanning = true;
        _showThinkingInWebView();
        _callAI(_buildContext(), manual);
    }

    private String _buildContext() {
        final List<String> parts = new ArrayList<>();
        final Calendar cal = Calendar.getInstance();
        final int h = cal.get(Calendar.HOUR_OF_DAY);
        final int m = cal.get(Calendar.MINUTE);
        String tl;
        if      (h >= 23 || h < 4) tl = "深夜";
        else if (h >= 22)          tl = "夜深了";
        else if (h >= 20)          tl = "晚上";
        else if (h >= 18)          tl = "傍晚";
        else if (h < 6)            tl = "凌晨";
        else if (h < 8)            tl = "清晨";
        else                       tl = "白天";
        parts.add("现在" + tl + h + "点" + (m > 0 ? m + "分" : ""));

        try {
            final IntentFilter f  = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
            final Intent bs       = registerReceiver(null, f);
            if (bs != null) {
                final int level  = bs.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                final int scale  = bs.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
                final int status = bs.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
                if (level >= 0 && scale > 0) {
                    final int pct = (int) (level * 100f / scale);
                    final boolean chg = (status == BatteryManager.BATTERY_STATUS_CHARGING
                            || status == BatteryManager.BATTERY_STATUS_FULL);
                    if (chg)          parts.add("充电中" + pct + "%");
                    else if (pct<=15) parts.add("电量低" + pct + "%快没电了");
                    else              parts.add("电量" + pct + "%");
                }
            }
        } catch (Exception ignored) {}

        return String.join("；", parts);
    }

    private void _callAI(String context, boolean manual) {
        if (_apiKey == null || _apiKey.isEmpty()) {
            _showBubbleInWebView("请在设置里填写 API Key ><", 8000);
            _scanning = false;
            if (!manual) _rescheduleTimer();
            return;
        }
        final String myName = _charName.isEmpty() ? "主人" : _charName;
        final String sysP   = "你是一个悬浮在手机屏幕上角落里的桌宠。\n"
                + (_persona == null || _persona.isEmpty() ? "" : "你的角色设定：" + _persona + "\n")
                + "你关心" + myName + "，偶尔冒出来说一句话。\n"
                + "根据当前情景，用你自己的语气说1~2句话（每句15~25字，禁止Markdown，直接说）。";

        final boolean isGemini = _apiEndpoint != null
                && _apiEndpoint.contains("generativelanguage.googleapis.com");

        _exec.submit(() -> {
            String reply = "";
            try {
                reply = isGemini
                        ? _callGemini(sysP, context)
                        : _callOpenAI(sysP, context);
            } catch (Exception e) {
                reply = "……（网络好像出了点问题）";
            }
            final String finalReply = reply;
            _mainHandler.post(() -> {
                _showBubbleInWebView(finalReply, 12000);
                _scanning = false;
                if (!manual) _rescheduleTimer();
            });
        });
    }

    private String _callOpenAI(String sysP, String ctx) throws Exception {
        final String base = _apiEndpoint.replaceAll("/+$", "");
        final String url  = base.endsWith("/v1") ? base + "/chat/completions"
                                                 : base + "/v1/chat/completions";
        final JSONObject body = new JSONObject()
                .put("model",       _model)
                .put("max_tokens",  120)
                .put("temperature", 0.9)
                .put("messages", new JSONArray()
                        .put(new JSONObject().put("role","system").put("content", sysP))
                        .put(new JSONObject().put("role","user")
                                .put("content", "情景：" + ctx)));
        final String resp = _httpPost(url, body.toString(), "Bearer " + _apiKey);
        return new JSONObject(resp)
                .getJSONArray("choices").getJSONObject(0)
                .getJSONObject("message").getString("content").trim();
    }

    private String _callGemini(String sysP, String ctx) throws Exception {
        final String mdl = _model.replace("models/","");
        final String url = "https://generativelanguage.googleapis.com/v1beta/models/"
                + mdl + ":generateContent?key=" + _apiKey;
        final JSONObject body = new JSONObject()
                .put("contents", new JSONArray()
                        .put(new JSONObject().put("parts", new JSONArray()
                                .put(new JSONObject().put("text",
                                        sysP + "\n\n情景：" + ctx)))));
        final String resp = _httpPost(url, body.toString(), null);
        return new JSONObject(resp)
                .getJSONArray("candidates").getJSONObject(0)
                .getJSONObject("content")
                .getJSONArray("parts").getJSONObject(0)
                .getString("text").trim();
    }

    private String _httpPost(String urlStr, String json, String auth) throws Exception {
        final HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        try {
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            if (auth != null) conn.setRequestProperty("Authorization", auth);
            conn.setDoOutput(true);
            conn.setConnectTimeout(15_000);
            conn.setReadTimeout(30_000);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(json.getBytes("UTF-8"));
            }
            final int code = conn.getResponseCode();
            final InputStream is = (code < 400) ? conn.getInputStream() : conn.getErrorStream();
            final StringBuilder sb = new StringBuilder();
            try (BufferedReader br = new BufferedReader(new InputStreamReader(is, "UTF-8"))) {
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
            }
            if (code >= 400) throw new IOException("HTTP " + code);
            return sb.toString();
        } finally { conn.disconnect(); }
    }

    /* ════════════════════════════════════════
       Notification
       ════════════════════════════════════════ */
    private void _createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            final NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "桌宠悬浮中", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE))
                    .createNotificationChannel(ch);
        }
    }

    private Notification _buildNotification() {
        final Intent stopI = new Intent(this, FloatingWindowService.class)
                .setAction(ACTION_STOP);
        final PendingIntent stopPi = PendingIntent.getService(this, 0, stopI,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        final Intent openI = new Intent(this, MainActivity.class);
        openI.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        final PendingIntent openPi = PendingIntent.getActivity(this, 0, openI,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("🐾 " + (_charName.isEmpty() ? "桌宠" : _charName) + " 悬浮中")
                .setContentText("单击桌宠返回 App · 双击触发 AI 说话")
                .setSmallIcon(android.R.drawable.btn_star_big_on)
                .setContentIntent(openPi)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "关闭桌宠", stopPi)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    /* ════════════════════════════════════════
       JavaScript Bridge (for overlay WebView)
       ════════════════════════════════════════ */
    private class OverlayBridge {

        @JavascriptInterface
        public void vibrate() {
            try {
                @SuppressWarnings("deprecation")
                android.os.Vibrator v = (android.os.Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (v == null) return;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(android.os.VibrationEffect.createWaveform(
                            new long[]{0, 12, 20, 12}, -1));
                } else {
                    v.vibrate(new long[]{0, 12, 20, 12}, -1);
                }
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void openApp() {
            _mainHandler.post(() -> _openMainApp());
        }

        @JavascriptInterface
        public void triggerScan() {
            _mainHandler.post(() -> _triggerAI(true));
        }

        @JavascriptInterface
        public int getIntervalMin() { return _intervalMin; }
    }

    /* ════════════════════════════════════════
       Helpers
       ════════════════════════════════════════ */
    private void _initDisplayMetrics() {
        final DisplayMetrics dm = new DisplayMetrics();
        ((WindowManager) getSystemService(Context.WINDOW_SERVICE))
                .getDefaultDisplay().getRealMetrics(dm);
        _screenWidth  = dm.widthPixels;
        _screenHeight = dm.heightPixels;
    }

    private int dpToPx(int dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
    }

    private String _esc(String s) {
        if (s == null) return "";
        return s.replace("\\","\\\\").replace("'","\\'")
                .replace("\n"," ").replace("\r","");
    }

    private void _loadPrefs() {
        _intervalMin = _prefs.getInt("interval_min",    10);
        _apiKey      = _prefs.getString("api_key",      "");
        _apiEndpoint = _prefs.getString("api_endpoint", "https://api.openai.com/v1");
        _model       = _prefs.getString("model",        "gpt-4o");
        _persona     = _prefs.getString("persona",      "");
        _charName    = _prefs.getString("char_name",    "");
        _avatarUrl   = _prefs.getString("avatar_url",   "");
    }

    private void _savePrefs() {
        _prefs.edit()
              .putInt("interval_min",    _intervalMin)
              .putString("api_key",       _apiKey)
              .putString("api_endpoint",  _apiEndpoint)
              .putString("model",         _model)
              .putString("persona",       _persona)
              .putString("char_name",     _charName)
              .putString("avatar_url",    _avatarUrl)
              .apply();
    }
}
