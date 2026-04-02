package com.beeper.floatpet;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

/**
 * JS → 原生桥接层
 * 通过 window.AndroidBridge.xxx() 在 WebView JS 中调用原生功能
 */
public class AndroidBridge {

    private final MainActivity mActivity;
    private final WebView      mWebView;
    private final SharedPreferences mPrefs;

    public AndroidBridge(MainActivity activity, WebView webView) {
        this.mActivity = activity;
        this.mWebView  = webView;
        this.mPrefs    = activity.getSharedPreferences("beeper_prefs", Context.MODE_PRIVATE);
    }

    // ─────────────────────────────────────────────────────────────
    //  平台标识
    // ─────────────────────────────────────────────────────────────
    @JavascriptInterface
    public String getPlatform() {
        return "android";
    }

    // ─────────────────────────────────────────────────────────────
    //  悬浮窗权限检查
    // ─────────────────────────────────────────────────────────────
    @JavascriptInterface
    public boolean canDrawOverlays() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return Settings.canDrawOverlays(mActivity);
        }
        return true;  // Android 5 以下不需要动态申请
    }

    // ─────────────────────────────────────────────────────────────
    //  申请悬浮窗权限（跳转系统设置）
    // ─────────────────────────────────────────────────────────────
    @JavascriptInterface
    public void requestOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            mActivity.runOnUiThread(() -> {
                Intent intent = new Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + mActivity.getPackageName()));
                mActivity.startActivityForResult(intent, mActivity.getOverlayPermReqCode());
            });
        }
    }

    // ─────────────────────────────────────────────────────────────
    //  启动悬浮窗服务
    // ─────────────────────────────────────────────────────────────
    @JavascriptInterface
    public void startFloatPet() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(mActivity)) {
            requestOverlayPermission();
            return;
        }
        // 持久化状态，供开机自启使用
        mPrefs.edit().putBoolean("float_pet_enabled", true).apply();

        mActivity.runOnUiThread(() -> {
            try {
                Intent intent = new Intent(mActivity, FloatPetService.class);
                intent.setAction(FloatPetService.ACTION_START);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    mActivity.startForegroundService(intent);
                } else {
                    mActivity.startService(intent);
                }
                // 提示用户：悬浮窗服务已启动，需要按 Home 键才能看到系统级效果
                android.widget.Toast.makeText(mActivity,
                    "🐾 悬浮桌宠服务已启动！\n现在按 Home 键退出 App，桌宠将悬浮在桌面上方",
                    android.widget.Toast.LENGTH_LONG).show();
            } catch (Exception e) {
                android.widget.Toast.makeText(mActivity,
                    "❌ 服务启动失败：" + e.getMessage(),
                    android.widget.Toast.LENGTH_LONG).show();
            }
        });
    }

    // ─────────────────────────────────────────────────────────────
    //  停止悬浮窗服务
    // ─────────────────────────────────────────────────────────────
    @JavascriptInterface
    public void stopFloatPet() {
        mPrefs.edit().putBoolean("float_pet_enabled", false).apply();
        mActivity.runOnUiThread(() -> {
            Intent intent = new Intent(mActivity, FloatPetService.class);
            intent.setAction(FloatPetService.ACTION_STOP);
            mActivity.startService(intent);
        });
    }

    // ─────────────────────────────────────────────────────────────
    //  查询服务是否运行
    // ─────────────────────────────────────────────────────────────
    @JavascriptInterface
    public boolean isFloatPetRunning() {
        return FloatPetService.isRunning;
    }

    // ─────────────────────────────────────────────────────────────
    //  SharedPreferences KV（主 WebView ↔ overlay WebView 共享数据）
    // ─────────────────────────────────────────────────────────────
    @JavascriptInterface
    public void saveString(String key, String value) {
        mPrefs.edit().putString(key, value).apply();
    }

    @JavascriptInterface
    public String getString(String key, String defaultValue) {
        return mPrefs.getString(key, defaultValue);
    }

    @JavascriptInterface
    public void saveBoolean(String key, boolean value) {
        mPrefs.edit().putBoolean(key, value).apply();
    }

    @JavascriptInterface
    public boolean getBoolean(String key, boolean defaultValue) {
        return mPrefs.getBoolean(key, defaultValue);
    }

    // ─────────────────────────────────────────────────────────────
    //  振动反馈（增强版，支持自定义模式）
    // ─────────────────────────────────────────────────────────────
    @JavascriptInterface
    public void vibrate(int ms) {
        try {
            android.os.Vibrator v = (android.os.Vibrator)
                mActivity.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(android.os.VibrationEffect.createOneShot(
                        ms, android.os.VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    v.vibrate(ms);
                }
            }
        } catch (Exception ignored) {}
    }

    // ─────────────────────────────────────────────────────────────
    //  分享文本（调用系统分享面板）
    // ─────────────────────────────────────────────────────────────
    @JavascriptInterface
    public void shareText(String text) {
        mActivity.runOnUiThread(() -> {
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("text/plain");
            intent.putExtra(Intent.EXTRA_TEXT, text);
            mActivity.startActivity(Intent.createChooser(intent, "分享"));
        });
    }

    // ─────────────────────────────────────────────────────────────
    //  打开外部 URL（使用系统浏览器）
    // ─────────────────────────────────────────────────────────────
    @JavascriptInterface
    public void openUrl(String url) {
        mActivity.runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                mActivity.startActivity(intent);
            } catch (Exception ignored) {}
        });
    }

    // ─────────────────────────────────────────────────────────────
    //  Toast 提示
    // ─────────────────────────────────────────────────────────────
    @JavascriptInterface
    public void showToast(String message) {
        mActivity.runOnUiThread(() ->
            android.widget.Toast.makeText(mActivity, message,
                android.widget.Toast.LENGTH_SHORT).show());
    }

    // ─────────────────────────────────────────────────────────────
    //  获取 Android 系统信息（供 JS 侧设备感知）
    // ─────────────────────────────────────────────────────────────
    @JavascriptInterface
    public String getDeviceInfo() {
        return "{\"brand\":\"" + Build.BRAND + "\","
             + "\"model\":\"" + Build.MODEL + "\","
             + "\"sdk\":"    + Build.VERSION.SDK_INT + ","
             + "\"release\":\"" + Build.VERSION.RELEASE + "\"}";
    }

    // ─────────────────────────────────────────────────────────────
    //  在主线程执行任意 JS（供 FloatPetService 通知主 WebView）
    // ─────────────────────────────────────────────────────────────
    public void evalJs(String js) {
        mActivity.runJs(js);
    }
}
