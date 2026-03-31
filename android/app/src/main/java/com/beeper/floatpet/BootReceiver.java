package com.beeper.floatpet;

import android.content.*;
import android.os.Build;
import android.provider.Settings;

/**
 * BootReceiver — 开机自启
 * ────────────────────────
 * 若用户上次退出前桌宠处于运行状态，开机后自动重启服务。
 * 注意：截屏权限（MediaProjection）在重启后需要用户重新授权，
 * 因此重启时以"无截屏"模式启动，仅依赖文本上下文。
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;

        final SharedPreferences prefs =
                ctx.getSharedPreferences("floatpet_prefs", Context.MODE_PRIVATE);

        /* Only restart if user had the service running before reboot */
        if (!prefs.getBoolean("service_running", false)) return;

        /* Require SYSTEM_ALERT_WINDOW to already be granted */
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && !Settings.canDrawOverlays(ctx)) return;

        final Intent svc = new Intent(ctx, FloatingWindowService.class);
        svc.setAction(FloatingWindowService.ACTION_START);
        svc.putExtra(FloatingWindowService.EXTRA_API_KEY,
                prefs.getString("api_key",      ""));
        svc.putExtra(FloatingWindowService.EXTRA_API_ENDPOINT,
                prefs.getString("api_endpoint", "https://api.openai.com/v1"));
        svc.putExtra(FloatingWindowService.EXTRA_MODEL,
                prefs.getString("model",        "gpt-4o"));
        svc.putExtra(FloatingWindowService.EXTRA_PERSONA,
                prefs.getString("persona",      ""));
        svc.putExtra(FloatingWindowService.EXTRA_INTERVAL_MIN,
                prefs.getInt("interval_min", 10));
        /* No MediaProjection token — will run in text-only mode */

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(svc);
        } else {
            ctx.startService(svc);
        }
    }
}
