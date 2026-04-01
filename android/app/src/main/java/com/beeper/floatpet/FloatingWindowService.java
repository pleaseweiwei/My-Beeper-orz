package com.beeper.floatpet;

import android.app.*;
import android.content.*;
import android.graphics.*;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.*;
import android.os.*;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.*;
import android.webkit.*;
import android.widget.*;

import androidx.core.app.NotificationCompat;

import org.json.*;

import java.io.*;
import java.net.*;
import java.nio.ByteBuffer;
import java.util.*;
import java.util.concurrent.*;

/**
 * FloatingWindowService
 * ─────────────────────
 * 悬浮桌宠的核心服务：
 *  1. SYSTEM_ALERT_WINDOW 透明浮层（WebView 渲染桌宠皮肤）
 *  2. MediaProjection 截屏（每 N 分钟或手动触发）
 *  3. 截图 → Base64 → AI Vision API → 气泡台词
 *  4. 定时器管理（随机 / 固定间隔）
 *  5. JavaScript Bridge 供 WebView 调用
 */
public class FloatingWindowService extends Service {

    private static final String TAG        = "FloatPetService";
    private static final String CHANNEL_ID = "floatpet_channel";
    private static final int    NOTIF_ID   = 1001;

    /* ── Intent action constants ── */
    public static final String ACTION_START          = "com.beeper.floatpet.START";
    public static final String ACTION_STOP           = "com.beeper.floatpet.STOP";
    public static final String ACTION_TRIGGER_SCAN   = "com.beeper.floatpet.TRIGGER_SCAN";
    public static final String ACTION_SET_INTERVAL   = "com.beeper.floatpet.SET_INTERVAL";
    public static final String ACTION_SET_STYLE      = "com.beeper.floatpet.SET_STYLE";
    public static final String ACTION_SET_PERSONA    = "com.beeper.floatpet.SET_PERSONA";
    public static final String EXTRA_INTERVAL_MIN    = "interval_min";
    public static final String EXTRA_STYLE_HTML      = "style_html";
    public static final String EXTRA_PERSONA         = "persona";
    public static final String EXTRA_API_KEY         = "api_key";
    public static final String EXTRA_API_ENDPOINT    = "api_endpoint";
    public static final String EXTRA_MODEL           = "model";
    public static final String EXTRA_PROJECTION_DATA = "projection_data";
    public static final String EXTRA_PROJECTION_CODE = "projection_code";

    /* ── UI Views ── */
    private WindowManager _wm;
    private View          _floatRoot;
    private WebView       _petWebView;
    private TextView      _bubbleText;
    private View          _bubbleWrap;

    /* ── State ── */
    private int     _intervalMin = 10;
    private String  _persona     = "";
    private String  _apiKey      = "";
    private String  _apiEndpoint = "https://api.openai.com/v1";
    private String  _model       = "gpt-4o";
    private boolean _scanning    = false;

    /* ── Timer ── */
    private final Handler  _mainHandler   = new Handler(Looper.getMainLooper());
    private       Runnable _timerRunnable = null;

    /* ── Bubble hide runnable (kept to allow cancellation) ── */
    private Runnable _bubbleHideRunnable = null;

    /* ── Background executor ── */
    private final ExecutorService _exec = Executors.newSingleThreadExecutor();

    /* ── MediaProjection ── */
    private MediaProjectionManager _mpMgr;
    private MediaProjection         _mediaProjection;
    private VirtualDisplay          _virtualDisplay;
    private ImageReader             _imageReader;
    private int _screenWidth, _screenHeight, _screenDensity;

    /* ── SharedPrefs ── */
    private SharedPreferences _prefs;

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
        _mpMgr = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;
        final String action = intent.getAction();
        if (action == null) {
            action_start(intent);
            return START_STICKY;
        }
        switch (action) {
            case ACTION_START:        action_start(intent);              break;
            case ACTION_STOP:         action_stop();                     break;
            case ACTION_TRIGGER_SCAN: triggerScan(true);                 break;
            case ACTION_SET_INTERVAL:
                _intervalMin = intent.getIntExtra(EXTRA_INTERVAL_MIN, 10);
                _prefs.edit().putInt("interval_min", _intervalMin).apply();
                _rescheduleTimer();
                break;
            case ACTION_SET_STYLE:
                final String html = intent.getStringExtra(EXTRA_STYLE_HTML);
                if (html != null && _petWebView != null) {
                    _mainHandler.post(() -> _petWebView.loadDataWithBaseURL(
                            "file:///android_asset/", html, "text/html", "utf-8", null));
                }
                break;
            case ACTION_SET_PERSONA:
                final String p = intent.getStringExtra(EXTRA_PERSONA);
                if (p != null) _persona = p;
                _savePrefs();
                break;
        }
        return START_STICKY;
    }

    private void action_start(Intent intent) {
        if (intent.hasExtra(EXTRA_API_KEY))      _apiKey      = intent.getStringExtra(EXTRA_API_KEY);
        if (intent.hasExtra(EXTRA_API_ENDPOINT)) _apiEndpoint = intent.getStringExtra(EXTRA_API_ENDPOINT);
        if (intent.hasExtra(EXTRA_MODEL))        _model       = intent.getStringExtra(EXTRA_MODEL);
        if (intent.hasExtra(EXTRA_PERSONA))      _persona     = intent.getStringExtra(EXTRA_PERSONA);
        if (intent.hasExtra(EXTRA_INTERVAL_MIN)) _intervalMin = intent.getIntExtra(EXTRA_INTERVAL_MIN, 10);

        /* MediaProjection token (provided by ScreenshotActivity / MainActivity) */
        if (intent.hasExtra(EXTRA_PROJECTION_DATA)) {
            final int    code = intent.getIntExtra(EXTRA_PROJECTION_CODE, -1);
            final Intent data = intent.getParcelableExtra(EXTRA_PROJECTION_DATA);
            if (data != null && _mpMgr != null) {
                _mediaProjection = _mpMgr.getMediaProjection(code, data);
            }
        }

        _savePrefs();
        if (_floatRoot == null) _buildFloatWindow();
        _rescheduleTimer();
    }

    private void action_stop() {
        _cancelTimer();
        _destroyFloatWindow();
        _releaseProjection();
        stopSelf();
    }

    @Override
    public void onDestroy() {
        _cancelTimer();
        _destroyFloatWindow();
        _releaseProjection();
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

        final WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                dpToPx(140), dpToPx(160),
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = _prefs.getInt("float_x", 40);
        params.y = _prefs.getInt("float_y", 200);

        _floatRoot = _buildFloatView();
        _wm.addView(_floatRoot, params);

        /* Combined drag + double-tap listener */
        final GestureDetector gd = new GestureDetector(this,
                new GestureDetector.SimpleOnGestureListener() {
                    @Override
                    public boolean onDoubleTap(MotionEvent e) {
                        triggerScan(true);
                        return true;
                    }
                });
        final FloatTouchListener ftl = new FloatTouchListener(params);
        _floatRoot.setOnTouchListener((v, ev) -> {
            gd.onTouchEvent(ev);
            return ftl.onTouch(v, ev);
        });
    }

    private View _buildFloatView() {
        final FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.TRANSPARENT);

        /* WebView — renders floatpet_overlay.html */
        _petWebView = new WebView(this);
        final WebSettings ws = _petWebView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(true);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        _petWebView.setBackgroundColor(Color.TRANSPARENT);
        _petWebView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        _petWebView.loadUrl("file:///android_asset/floatpet_overlay.html");

        final FrameLayout.LayoutParams wvLp =
                new FrameLayout.LayoutParams(dpToPx(140), dpToPx(140));
        wvLp.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        root.addView(_petWebView, wvLp);

        /* Bubble */
        _bubbleWrap = new FrameLayout(this);
        _bubbleWrap.setVisibility(View.GONE);
        _bubbleWrap.setBackground(_makeBubbleDrawable());

        _bubbleText = new TextView(this);
        _bubbleText.setTextColor(Color.parseColor("#1a1a1a"));
        _bubbleText.setTextSize(12f);
        _bubbleText.setPadding(dpToPx(12), dpToPx(8), dpToPx(12), dpToPx(8));
        _bubbleText.setMaxWidth(dpToPx(200));
        _bubbleText.setLineSpacing(0, 1.3f);
        ((FrameLayout) _bubbleWrap).addView(_bubbleText);

        final FrameLayout.LayoutParams bwLp =
                new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.WRAP_CONTENT,
                        FrameLayout.LayoutParams.WRAP_CONTENT);
        bwLp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        bwLp.topMargin = dpToPx(4);
        root.addView(_bubbleWrap, bwLp);

        return root;
    }

    private void _destroyFloatWindow() {
        if (_floatRoot != null && _wm != null) {
            try { _wm.removeView(_floatRoot); } catch (Exception ignored) {}
            _floatRoot   = null;
            _petWebView  = null;
            _bubbleWrap  = null;
            _bubbleText  = null;
        }
    }

    /* ════════════════════════════════════════
       Timer
       ════════════════════════════════════════ */
    private void _rescheduleTimer() {
        _cancelTimer();
        final long delayMs = (_intervalMin == 0)
                ? (long) ((3 + Math.random() * 12) * 60_000)
                : (long) _intervalMin * 60_000L;
        _timerRunnable = () -> triggerScan(false);
        _mainHandler.postDelayed(_timerRunnable, delayMs);
        Log.d(TAG, "Next scan in " + delayMs / 1000 + "s");
    }

    private void _cancelTimer() {
        if (_timerRunnable != null) {
            _mainHandler.removeCallbacks(_timerRunnable);
            _timerRunnable = null;
        }
    }

    /* ════════════════════════════════════════
       Screen Capture
       ════════════════════════════════════════ */
    private void triggerScan(boolean manual) {
        if (_scanning) return;
        _scanning = true;
        showBubble("…", 5000);
        _playScanAnim();

        if (_mediaProjection != null) {
            _exec.submit(() -> {
                final String b64 = _captureScreenshot();
                _mainHandler.post(() -> _callAI(_buildContext(), b64, manual));
            });
        } else {
            _callAI(_buildContext(), null, manual);
        }
    }

    private String _captureScreenshot() {
        ImageReader reader = null;
        VirtualDisplay vd  = null;
        try {
            reader = ImageReader.newInstance(
                    _screenWidth, _screenHeight, PixelFormat.RGBA_8888, 2);
            vd = _mediaProjection.createVirtualDisplay(
                    "FloatPetCapture", _screenWidth, _screenHeight, _screenDensity,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                    reader.getSurface(), null, null);

            Thread.sleep(400);

            final Image image = reader.acquireLatestImage();
            if (image == null) return null;

            try {
                final Image.Plane[] planes    = image.getPlanes();
                final ByteBuffer    buf        = planes[0].getBuffer();
                final int           rowStride  = planes[0].getRowStride();
                final int           pixelStride= planes[0].getPixelStride();
                final int           rowPadding = rowStride - pixelStride * _screenWidth;

                Bitmap bitmap = Bitmap.createBitmap(
                        _screenWidth + rowPadding / pixelStride,
                        _screenHeight, Bitmap.Config.ARGB_8888);
                bitmap.copyPixelsFromBuffer(buf);

                Bitmap scaled = Bitmap.createScaledBitmap(
                        bitmap,
                        (int) (_screenWidth  * 0.4f),
                        (int) (_screenHeight * 0.4f),
                        true);
                bitmap.recycle();

                final ByteArrayOutputStream baos = new ByteArrayOutputStream();
                scaled.compress(Bitmap.CompressFormat.JPEG, 65, baos);
                scaled.recycle();
                return Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
            } finally {
                image.close();
            }
        } catch (Exception e) {
            Log.e(TAG, "Screenshot failed", e);
            return null;
        } finally {
            if (vd     != null) { vd.release();    }
            if (reader != null) { reader.close();   }
        }
    }

    private void _releaseProjection() {
        if (_virtualDisplay  != null) { _virtualDisplay.release();  _virtualDisplay  = null; }
        if (_imageReader     != null) { _imageReader.close();        _imageReader     = null; }
        if (_mediaProjection != null) { _mediaProjection.stop();     _mediaProjection = null; }
    }

    /* ════════════════════════════════════════
       Context builder
       ════════════════════════════════════════ */
    private String _buildContext() {
        final List<String> parts = new ArrayList<>();

        final Calendar cal = Calendar.getInstance();
        final int h = cal.get(Calendar.HOUR_OF_DAY);
        final int m = cal.get(Calendar.MINUTE);
        String timeLabel;
        if      (h >= 23 || h < 4)  timeLabel = "深夜";
        else if (h >= 22)            timeLabel = "夜深了";
        else if (h >= 20)            timeLabel = "晚上";
        else if (h >= 18)            timeLabel = "傍晚";
        else if (h < 6)              timeLabel = "凌晨";
        else if (h < 8)              timeLabel = "清晨";
        else                         timeLabel = "白天";
        parts.add("现在" + timeLabel + h + "点" + (m > 0 ? m + "分" : ""));

        final IntentFilter ifilter     = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
        final Intent       battStatus  = registerReceiver(null, ifilter);
        if (battStatus != null) {
            final int level   = battStatus.getIntExtra(BatteryManager.EXTRA_LEVEL,  -1);
            final int scale   = battStatus.getIntExtra(BatteryManager.EXTRA_SCALE,  -1);
            final int status  = battStatus.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            if (level >= 0 && scale > 0) {
                final int pct      = (int) (level * 100f / scale);
                final boolean chg  = (status == BatteryManager.BATTERY_STATUS_CHARGING
                        || status == BatteryManager.BATTERY_STATUS_FULL);
                if (chg)         parts.add("充电中" + pct + "%");
                else if (pct <= 15) parts.add("电量低" + pct + "%快没电了");
                else             parts.add("电量" + pct + "%");
            }
        }

        final String savedCtx = _prefs.getString("runtime_ctx", "");
        if (!savedCtx.isEmpty()) parts.add(savedCtx);

        return String.join("；", parts);
    }

    /* ════════════════════════════════════════
       AI API call
       ════════════════════════════════════════ */
    private void _callAI(String context, String screenshotB64, boolean manual) {
        if (_apiKey == null || _apiKey.isEmpty()) {
            showBubble("请在设置里填写 API Key ><", 8000);
            _scanning = false;
            if (!manual) _rescheduleTimer();
            return;
        }

        final String  sysPrompt = _buildSystemPrompt(context);
        final boolean isGemini  = _apiEndpoint != null
                && _apiEndpoint.contains("generativelanguage.googleapis.com");

        _exec.submit(() -> {
            String reply = "";
            try {
                reply = isGemini
                        ? _callGemini(sysPrompt, context, screenshotB64)
                        : _callOpenAI(sysPrompt, context, screenshotB64);
            } catch (Exception e) {
                reply = "网络出了点问题，稍后再试 ><";
                Log.e(TAG, "AI call failed", e);
            }
            final String finalReply = reply;
            _mainHandler.post(() -> {
                showBubble(finalReply, 12000);
                _scanning = false;
                if (!manual) _rescheduleTimer();
            });
        });
    }

    private String _buildSystemPrompt(String context) {
        return "你是一个悬浮在手机屏幕上的桌宠。\n"
                + (_persona == null || _persona.isEmpty() ? "" : "你的人设：" + _persona + "\n")
                + "性格活泼，言简意赅。\n"
                + "你刚刚\"偷看\"了主人的手机屏幕，根据看到的信息，说一句符合你性格的简短吐槽或评论（15~45字，不加引号，直接说）。\n"
                + "不要说\"我看到了\"这类开场白，直接切入评论。禁止生成Markdown格式。";
    }

    private String _callOpenAI(String sysPrompt, String ctx, String b64) throws Exception {
        final String base = _apiEndpoint.replaceAll("/+$", "");
        final String url  = base.endsWith("/chat/completions")
                ? base : base + "/chat/completions";

        final JSONArray userContent = new JSONArray();
        userContent.put(new JSONObject().put("type", "text").put("text", "屏幕情报：" + ctx));
        if (b64 != null && !b64.isEmpty()) {
            userContent.put(new JSONObject()
                    .put("type", "image_url")
                    .put("image_url", new JSONObject()
                            .put("url", "data:image/jpeg;base64," + b64)
                            .put("detail", "low")));
        }

        final JSONObject body = new JSONObject()
                .put("model",       _model)
                .put("max_tokens",  120)
                .put("temperature", 0.9)
                .put("messages", new JSONArray()
                        .put(new JSONObject().put("role", "system").put("content", sysPrompt))
                        .put(new JSONObject().put("role", "user").put("content", userContent)));

        final String resp = _httpPost(url, body.toString(), "Bearer " + _apiKey);
        return new JSONObject(resp)
                .getJSONArray("choices").getJSONObject(0)
                .getJSONObject("message").getString("content").trim();
    }

    private String _callGemini(String sysPrompt, String ctx, String b64) throws Exception {
        final String mdl = _model.replace("models/", "");
        final String url = "https://generativelanguage.googleapis.com/v1beta/models/"
                + mdl + ":generateContent?key=" + _apiKey;

        final JSONArray parts = new JSONArray();
        parts.put(new JSONObject().put("text", sysPrompt + "\n\n屏幕情报：" + ctx));
        if (b64 != null && !b64.isEmpty()) {
            parts.put(new JSONObject().put("inline_data",
                    new JSONObject()
                            .put("mime_type", "image/jpeg")
                            .put("data", b64)));
        }
        final JSONObject body = new JSONObject()
                .put("contents", new JSONArray()
                        .put(new JSONObject().put("parts", parts)));

        final String resp = _httpPost(url, body.toString(), null);
        return new JSONObject(resp)
                .getJSONArray("candidates").getJSONObject(0)
                .getJSONObject("content")
                .getJSONArray("parts").getJSONObject(0)
                .getString("text").trim();
    }

    private String _httpPost(String urlStr, String jsonBody, String authHeader) throws Exception {
        final HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        try {
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            if (authHeader != null) conn.setRequestProperty("Authorization", authHeader);
            conn.setDoOutput(true);
            conn.setConnectTimeout(15_000);
            conn.setReadTimeout(30_000);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(jsonBody.getBytes("UTF-8"));
            }

            final int code = conn.getResponseCode();
            final InputStream is = (code < 400) ? conn.getInputStream() : conn.getErrorStream();
            final StringBuilder sb = new StringBuilder();
            try (BufferedReader br = new BufferedReader(new InputStreamReader(is, "UTF-8"))) {
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
            }
            if (code >= 400) {
                Log.e(TAG, "API error " + code + ": " + sb);
                throw new IOException("HTTP " + code + ": " + sb.toString().substring(0, Math.min(200, sb.length())));
            }
            return sb.toString();
        } finally {
            conn.disconnect();
        }
    }

    /* ════════════════════════════════════════
       Bubble UI
       ════════════════════════════════════════ */
    public void showBubble(final String text, final int durationMs) {
        _mainHandler.post(() -> {
            if (_bubbleText == null || _bubbleWrap == null) return;
            _bubbleText.setText(text);
            _bubbleWrap.setAlpha(1f);
            _bubbleWrap.setVisibility(View.VISIBLE);

            /* Cancel any pending hide */
            if (_bubbleHideRunnable != null) {
                _mainHandler.removeCallbacks(_bubbleHideRunnable);
            }
            _bubbleHideRunnable = () -> {
                if (_bubbleWrap != null) {
                    _bubbleWrap.animate().alpha(0f).setDuration(300)
                            .withEndAction(() -> {
                                if (_bubbleWrap != null) _bubbleWrap.setVisibility(View.GONE);
                            }).start();
                }
            };
            _mainHandler.postDelayed(_bubbleHideRunnable, durationMs);
        });
    }

    private void _playScanAnim() {
        if (_petWebView != null) {
            _mainHandler.post(() ->
                _petWebView.evaluateJavascript("if(window.petStartScan)petStartScan();", null));
        }
    }

    /* ════════════════════════════════════════
       Notification
       ════════════════════════════════════════ */
    private void _createNotificationChannel() {
        final NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "桌宠悬浮服务", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("保持桌宠悬浮在所有 App 上层");
        ch.setShowBadge(false);
        ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE))
                .createNotificationChannel(ch);
    }

    private Notification _buildNotification() {
        final Intent stopIntent = new Intent(this, FloatingWindowService.class)
                .setAction(ACTION_STOP);
        final PendingIntent stopPi = PendingIntent.getService(
                this, 0, stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        final Intent openIntent = new Intent(this, MainActivity.class);
        final PendingIntent openPi = PendingIntent.getActivity(
                this, 0, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("🐾 桌宠悬浮中")
                .setContentText("悬浮在所有 App 上层 · 双击桌宠可手动触发 AI 吐槽")
                .setSmallIcon(android.R.drawable.btn_star_big_on)
                .setContentIntent(openPi)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "关闭桌宠", stopPi)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    /* ════════════════════════════════════════
       Helpers
       ════════════════════════════════════════ */
    private void _initDisplayMetrics() {
        final DisplayMetrics dm = new DisplayMetrics();
        ((WindowManager) getSystemService(Context.WINDOW_SERVICE))
                .getDefaultDisplay().getRealMetrics(dm);
        _screenWidth   = dm.widthPixels;
        _screenHeight  = dm.heightPixels;
        _screenDensity = dm.densityDpi;
    }

    private int dpToPx(int dp) {
        return (int) (dp * getResources().getDisplayMetrics().density + 0.5f);
    }

    private android.graphics.drawable.Drawable _makeBubbleDrawable() {
        final android.graphics.drawable.GradientDrawable gd =
                new android.graphics.drawable.GradientDrawable();
        gd.setColor(Color.parseColor("#FFFFFAEE"));
        gd.setCornerRadius(dpToPx(14));
        gd.setStroke(2, Color.parseColor("#FFE0A0"));
        return gd;
    }

    private void _loadPrefs() {
        _intervalMin = _prefs.getInt("interval_min",    10);
        _apiKey      = _prefs.getString("api_key",      "");
        _apiEndpoint = _prefs.getString("api_endpoint", "https://api.openai.com/v1");
        _model       = _prefs.getString("model",        "gpt-4o");
        _persona     = _prefs.getString("persona",      "");
    }

    private void _savePrefs() {
        _prefs.edit()
                .putInt("interval_min",     _intervalMin)
                .putString("api_key",       _apiKey)
                .putString("api_endpoint",  _apiEndpoint)
                .putString("model",         _model)
                .putString("persona",       _persona)
                .apply();
    }

    /* ════════════════════════════════════════
       Drag Touch Listener
       ════════════════════════════════════════ */
    private class FloatTouchListener implements View.OnTouchListener {
        private final WindowManager.LayoutParams params;
        private int   initX, initY;
        private float initTouchX, initTouchY;
        private boolean moved;

        FloatTouchListener(WindowManager.LayoutParams p) { this.params = p; }

        @Override
        public boolean onTouch(View v, MotionEvent ev) {
            switch (ev.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    initX      = params.x;      initY      = params.y;
                    initTouchX = ev.getRawX();  initTouchY = ev.getRawY();
                    moved = false;
                    break;
                case MotionEvent.ACTION_MOVE:
                    final int dx = (int) (ev.getRawX() - initTouchX);
                    final int dy = (int) (ev.getRawY() - initTouchY);
                    if (Math.abs(dx) + Math.abs(dy) > 8) moved = true;
                    if (moved) {
                        params.x = initX + dx;
                        params.y = initY + dy;
                        if (_wm != null && _floatRoot != null)
                            _wm.updateViewLayout(_floatRoot, params);
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
        }
    }

    /* ════════════════════════════════════════
       JavaScript Bridge
       ════════════════════════════════════════ */
    private class AndroidBridge {

        @JavascriptInterface
        public void showBubble(String text) {
            FloatingWindowService.this.showBubble(text, 10000);
        }

        @JavascriptInterface
        public void triggerScan() {
            _mainHandler.post(() -> FloatingWindowService.this.triggerScan(true));
        }

        @JavascriptInterface
        public void setInterval(int minutes) {
            _intervalMin = minutes;
            _savePrefs();
            _rescheduleTimer();
        }

        @JavascriptInterface
        public String getPersona() { return _persona != null ? _persona : ""; }

        @JavascriptInterface
        public String getApiKey() { return _apiKey != null ? _apiKey : ""; }

        @JavascriptInterface
        public String getModel() { return _model != null ? _model : "gpt-4o"; }

        @JavascriptInterface
        public int getIntervalMin() { return _intervalMin; }

        @JavascriptInterface
        public void vibrate() {
            final Vibrator vib = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vib == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vib.vibrate(VibrationEffect.createWaveform(new long[]{0, 15, 25, 15}, -1));
            } else {
                vib.vibrate(new long[]{0, 15, 25, 15}, -1);
            }
        }

        @JavascriptInterface
        public void saveRuntimeCtx(String ctx) {
            if (ctx != null) _prefs.edit().putString("runtime_ctx", ctx).apply();
        }
    }
}
