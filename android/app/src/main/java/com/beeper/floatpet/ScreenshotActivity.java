package com.beeper.floatpet;

import android.app.Activity;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.os.Bundle;

/**
 * ScreenshotActivity
 * ──────────────────
 * 透明 Activity，唯一职责：弹出系统截屏授权对话框。
 * 用户点击「立即开始」后，将 resultCode + data 转发给 FloatingWindowService。
 */
public class ScreenshotActivity extends Activity {

    private static final int REQ_CAPTURE = 100;
    private MediaProjectionManager _mpMgr;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        _mpMgr = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        startActivityForResult(_mpMgr.createScreenCaptureIntent(), REQ_CAPTURE);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_CAPTURE) {
            if (resultCode == RESULT_OK && data != null) {
                final Intent svc = new Intent(this, FloatingWindowService.class);
                svc.setAction(FloatingWindowService.ACTION_START);
                svc.putExtra(FloatingWindowService.EXTRA_PROJECTION_CODE, resultCode);
                svc.putExtra(FloatingWindowService.EXTRA_PROJECTION_DATA, data);
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    startForegroundService(svc);
                } else {
                    startService(svc);
                }
            }
            finish();
        }
    }
}
