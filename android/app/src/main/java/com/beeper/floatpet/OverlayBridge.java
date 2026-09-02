package com.beeper.floatpet;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.webkit.JavascriptInterface;

final class OverlayBridge {
    private final Context context;
    private final FloatPetService service;
    private final SharedPreferences prefs;
    OverlayBridge(Context context, FloatPetService service) {
        this.context = context.getApplicationContext();
        this.service = service;
        prefs = this.context.getSharedPreferences("beeper_native", Context.MODE_PRIVATE);
    }
    @JavascriptInterface public String getSharedPref(String key) { return prefs.getString(key, ""); }
    @JavascriptInterface public void close() { context.stopService(new Intent(context, FloatPetService.class)); }
    @JavascriptInterface public void moveBy(int deltaX, int deltaY) { service.moveBy(deltaX, deltaY); }
    @JavascriptInterface public void openMainApp() {
        Intent i = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (i != null) { i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); context.startActivity(i); }
    }
}