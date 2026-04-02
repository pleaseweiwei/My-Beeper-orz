package com.beeper.floatpet;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.app.NotificationCompat;

/**
 * FloatPetService — 系统级悬浮窗前台服务
 *
 * 通过 WindowManager 在所有 App 上层显示一个透明 WebView，
 * 加载 floatpet_overlay.html，实现真正的安卓桌宠悬浮效果。
 */
public class FloatPetService extends Service {

    public static final String ACTION_START = "com.beeper.floatpet.START";
    public static final String ACTION_STOP  = "com.beeper.floatpet.STOP";

    /** 供 JS 桥接查询服务状态 */
    public static volatile boolean isRunning = false;

    private static final String CHANNEL_ID   = "FloatPetChannel";
    private static final int    NOTIF_ID     = 42;

    private WindowManager windowManager;
    private WebView overlayWebView;
    private WindowManager.LayoutParams layoutParams;

    /* 拖动状态 */
    private int lastRawX, lastRawY;
    private boolean isDragging = false;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!isRunning) {
            createNotificationChannel();
            startForeground(NOTIF_ID, buildNotification());
            showOverlay();
            isRunning = true;
        }
        return START_STICKY;
    }

    /* ════════════════════════════════════════
       创建悬浮窗 WebView
       ════════════════════════════════════════ */
    private void showOverlay() {
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);

        // API 26+ 使用 TYPE_APPLICATION_OVERLAY，更低版本用 TYPE_PHONE
        int windowType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;

        float density = getResources().getDisplayMetrics().density;
        int initW = (int)(220 * density);   // 初始宽 220dp
        int initH = (int)(280 * density);   // 初始高 280dp

        layoutParams = new WindowManager.LayoutParams(
            initW, initH,
            windowType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            PixelFormat.TRANSLUCENT
        );
        layoutParams.gravity = Gravity.TOP | Gravity.START;
        layoutParams.x = 20;
        // FIX: 初始 Y 设为屏幕高度的 1/3，避免被前置摄像头遮挡
        int screenH = getResources().getDisplayMetrics().heightPixels;
        layoutParams.y = screenH / 3;

        // 创建 overlay 专用 WebView
        overlayWebView = new WebView(this);
        overlayWebView.setBackgroundColor(Color.TRANSPARENT);

        WebSettings ws = overlayWebView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setAllowFileAccess(true);
        ws.setAllowFileAccessFromFileURLs(true);
        ws.setAllowUniversalAccessFromFileURLs(true);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        ws.setCacheMode(WebSettings.LOAD_DEFAULT);
        ws.setMediaPlaybackRequiresUserGesture(false);

        // 注入 overlay 专用桥接（关闭、调整大小、打开主 App）
        overlayWebView.addJavascriptInterface(new OverlayBridge(this), "OverlayBridge");

        overlayWebView.setWebViewClient(new WebViewClient());

        // Chrome 远程调试
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        // 加载独立悬浮页面（优先 OTA 目录，与主 App 共享 file:// localStorage）
        overlayWebView.loadUrl(getOverlayUrl());

        // FIX: 触摸拖动处理
        // ACTION_DOWN 返回 true 以独占整个触摸序列，确保 MOVE 事件能正确触发拖动。
        // 短按（未拖动）则在 ACTION_UP 时调用 performClick() 模拟点击传给 WebView。
        overlayWebView.setOnTouchListener((v, event) -> {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    lastRawX = (int) event.getRawX();
                    lastRawY = (int) event.getRawY();
                    isDragging = false;
                    return true; // 独占触摸序列，保证后续 MOVE 事件能触发

                case MotionEvent.ACTION_MOVE:
                    int dx = (int) event.getRawX() - lastRawX;
                    int dy = (int) event.getRawY() - lastRawY;
                    if (!isDragging && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
                        isDragging = true;
                    }
                    if (isDragging) {
                        layoutParams.x += dx;
                        layoutParams.y += dy;
                        lastRawX = (int) event.getRawX();
                        lastRawY = (int) event.getRawY();
                        try {
                            windowManager.updateViewLayout(overlayWebView, layoutParams);
                        } catch (Exception ignored) {}
                        return true;
                    }
                    return true;

                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    if (!isDragging) {
                        // 短按未拖动 → 模拟点击传给 WebView
                        v.performClick();
                    }
                    isDragging = false;
                    return true;
            }
            return false;
        });

        windowManager.addView(overlayWebView, layoutParams);
    }

    /**
     * 优先从 OTA 目录加载 floatpet_overlay.html，
     * OTA 不存在时回退到 APK 内置 assets。
     * 这样 floatpet_overlay.html 改动可以走 OTA，无需重装 APK。
     */
    private String getOverlayUrl() {
        java.io.File otaFile = new java.io.File(getFilesDir(), "www_ota/floatpet_overlay.html");
        if (otaFile.exists()) {
            return "file://" + otaFile.getAbsolutePath();
        }
        return "file:///android_asset/www/floatpet_overlay.html";
    }

    /* ════════════════════════════════════════
       OverlayBridge — 注入到 overlay WebView
       ════════════════════════════════════════ */
    public class OverlayBridge {

        private final Context ctx;

        public OverlayBridge(Context ctx) {
            this.ctx = ctx;
        }

        /** 调整悬浮窗尺寸（dp） */
        @JavascriptInterface
        public void resize(final int widthDp, final int heightDp) {
            if (overlayWebView == null) return;
            float d = getResources().getDisplayMetrics().density;
            layoutParams.width  = (int)(widthDp  * d);
            layoutParams.height = (int)(heightDp * d);
            overlayWebView.post(() -> {
                try { windowManager.updateViewLayout(overlayWebView, layoutParams); }
                catch (Exception ignored) {}
            });
        }

        /** 点击桌宠 → 打开主 App */
        @JavascriptInterface
        public void openMainApp() {
            Intent intent = new Intent(ctx, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            ctx.startActivity(intent);
        }

        /** 停止悬浮窗服务 */
        @JavascriptInterface
        public void stopService() {
            stopSelf();
        }

        /**
         * 从 SharedPreferences 读取数据
         * FIX: 改用 beeper_prefs，与 AndroidBridge（主 WebView）共享同一存储，
         * 这样主 App 通过 AndroidBridge.saveString 写入的数据，overlay 这里可以直接读到。
         */
        @JavascriptInterface
        public String getSharedPref(String key) {
            SharedPreferences prefs = ctx.getSharedPreferences("beeper_prefs", Context.MODE_PRIVATE);
            return prefs.getString(key, "");
        }

        /** 保存数据到 SharedPreferences */
        @JavascriptInterface
        public void setSharedPref(String key, String value) {
            SharedPreferences prefs = ctx.getSharedPreferences("beeper_prefs", Context.MODE_PRIVATE);
            prefs.edit().putString(key, value).apply();
        }
    }

    /* ════════════════════════════════════════
       通知栏（前台服务必须）
       ════════════════════════════════════════ */
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "桌宠悬浮窗", NotificationManager.IMPORTANCE_LOW
            );
            ch.setDescription("保持桌宠悬浮在所有 App 上层");
            ch.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private Notification buildNotification() {
        // 点击通知 → 打开主 App
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int piFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                : PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent openPI = PendingIntent.getActivity(this, 0, openIntent, piFlags);

        // "停止"动作
        Intent stopIntent = new Intent(this, FloatPetService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPI = PendingIntent.getService(this, 1, stopIntent, piFlags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("桌宠运行中 🐾")
            .setContentText("悬浮在所有应用上层 · 点击返回")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(openPI)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    /* ════════════════════════════════════════
       生命周期
       ════════════════════════════════════════ */
    @Override
    public void onDestroy() {
        super.onDestroy();
        isRunning = false;
        if (windowManager != null && overlayWebView != null) {
            try {
                windowManager.removeView(overlayWebView);
                overlayWebView.destroy();
            } catch (Exception ignored) {}
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
