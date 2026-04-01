package com.beeper.floatpet;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

/**
 * BootReceiver
 * ─────────────
 * 开机自启：若上次运行时悬浮桌宠处于开启状态，开机后自动重启 FloatingWindowService。
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;

        final SharedPreferences prefs =
                context.getSharedPreferences("floatpet_prefs", Context.MODE_PRIVATE);
        if (!prefs.getBoolean("service_running", false)) return;

        final Intent svc = new Intent(context, FloatingWindowService.class)
                .setAction(FloatingWindowService.ACTION_START);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(svc);
        } else {
            context.startService(svc);
        }
    }
}
