package com.beeper.floatpet;

import android.app.Service;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.IBinder;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

/** System-level floating pet window. Configuration is shared with the main WebView. */
public class FloatPetService extends Service {
    private WindowManager windowManager;
    private WebView overlay;
    private WindowManager.LayoutParams params;

    @Override public void onCreate() {
        super.onCreate();
        if (!Settings.canDrawOverlays(this)) { stopSelf(); return; }
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        overlay = new WebView(this);
        WebSettings settings = overlay.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        overlay.setBackgroundColor(android.graphics.Color.TRANSPARENT);
        overlay.setOverScrollMode(View.OVER_SCROLL_NEVER);
        overlay.addJavascriptInterface(new OverlayBridge(this, this), "OverlayBridge");
        overlay.loadUrl("file:///android_asset/www/floatpet_overlay.html");
        int type = android.os.Build.VERSION.SDK_INT >= 26
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        params = new WindowManager.LayoutParams(150, 190, type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = 24;
        params.y = 180;
        windowManager.addView(overlay, params);
    }

    void moveBy(int deltaX, int deltaY) {
        if (windowManager == null || overlay == null || params == null) return;
        params.x += deltaX;
        params.y += deltaY;
        try {
            windowManager.updateViewLayout(overlay, params);
        } catch (IllegalArgumentException ignored) {
            // The system may remove the window while the service is stopping.
        }
    }

    @Override public void onDestroy() {
        if (overlay != null && windowManager != null) {
            try { windowManager.removeView(overlay); } catch (IllegalArgumentException ignored) { }
        }
        overlay = null; super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}