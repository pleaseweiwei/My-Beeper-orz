package com.beeper.floatpet;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;

/**
 * 开机自启广播接收器
 * 如果用户之前启用了桌宠悬浮窗，开机后自动恢复
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !"android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            return;
        }

        // 检查用户是否之前开启了桌宠服务
        SharedPreferences prefs = context.getSharedPreferences(
            "beeper_prefs", Context.MODE_PRIVATE);
        boolean floatPetEnabled = prefs.getBoolean("float_pet_enabled", false);

        if (!floatPetEnabled) return;

        // 检查是否有悬浮窗权限
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(context)) return;
        }

        // 启动悬浮窗服务
        Intent serviceIntent = new Intent(context, FloatPetService.class);
        serviceIntent.setAction(FloatPetService.ACTION_START);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }
    }
}
