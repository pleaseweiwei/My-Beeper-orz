package com.beeper.floatpet;

import android.app.Activity;
import android.content.*;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.*;
import android.widget.*;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;

/**
 * MainActivity — 桌宠设置中心
 * ─────────────────────────────
 * 功能区：
 *  • 启用 / 停止桌宠开关
 *  • API Key / Endpoint / 模型 输入
 *  • 人设 Prompt 输入
 *  • 定时间隔滑块（0 = 随机）
 *  • 请求 SYSTEM_ALERT_WINDOW 权限
 *  • 请求 MediaProjection（截屏）权限
 */
public class MainActivity extends AppCompatActivity {

    private static final int REQ_OVERLAY   = 1001;
    private static final int REQ_MEDIA_PRJ = 1002;

    private SharedPreferences _prefs;
    private MediaProjectionManager _mpMgr;

    /* UI refs */
    private Switch   _swEnable;
    private EditText _etApiKey, _etEndpoint, _etModel, _etPersona;
    private SeekBar  _seekInterval;
    private TextView _tvIntervalLabel;
    private Button   _btnTest;
    private TextView _tvStatus;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        _prefs = getSharedPreferences("floatpet_prefs", Context.MODE_PRIVATE);
        _mpMgr = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        _buildUI();
        _loadSettings();
    }

    /* ════════════════════════════════════════
       Build UI programmatically (no XML layout)
       ════════════════════════════════════════ */
    private void _buildUI() {
        final ScrollView scroll = new ScrollView(this);
        final LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(48, 64, 48, 64);
        root.setBackgroundColor(0xFF0D0D1A);

        /* ── Title ── */
        final TextView title = _label("🐾  桌宠 · FloatPet", 22, true);
        title.setTextColor(0xFFFFD700);
        root.addView(title);
        root.addView(_spacer(24));

        /* ── Enable Switch ── */
        final LinearLayout swRow = _row();
        final TextView swLabel = _label("启用悬浮桌宠", 15, false);
        swLabel.setTextColor(0xFFEEEEEE);
        _swEnable = new Switch(this);
        _swEnable.setChecked(false);
        swRow.addView(swLabel);
        swRow.addView(_flex());
        swRow.addView(_swEnable);
        root.addView(swRow);
        root.addView(_divider());

        /* ── API Key ── */
        root.addView(_label("API Key", 13, false));
        root.addView(_spacer(6));
        _etApiKey = _inputField("sk-...");
        _etApiKey.setInputType(android.text.InputType.TYPE_CLASS_TEXT |
                android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
        root.addView(_etApiKey);
        root.addView(_spacer(16));

        /* ── Endpoint ── */
        root.addView(_label("API Endpoint", 13, false));
        root.addView(_spacer(6));
        _etEndpoint = _inputField("https://api.openai.com/v1");
        root.addView(_etEndpoint);
        root.addView(_spacer(16));

        /* ── Model ── */
        root.addView(_label("模型", 13, false));
        root.addView(_spacer(6));
        _etModel = _inputField("gpt-4o");
        root.addView(_etModel);
        root.addView(_spacer(16));

        /* ── Persona ── */
        root.addView(_label("桌宠人设 Prompt（选填）", 13, false));
        root.addView(_spacer(6));
        _etPersona = _inputField("例：你是一只傲娇猫娘，说话带点tsundere腔调...");
        _etPersona.setMinLines(3);
        _etPersona.setMaxLines(6);
        _etPersona.setGravity(Gravity.TOP);
        root.addView(_etPersona);
        root.addView(_spacer(16));

        /* ── Interval ── */
        root.addView(_label("回复间隔（分钟）", 13, false));
        root.addView(_spacer(6));
        final LinearLayout sliderRow = _row();
        _seekInterval = new SeekBar(this);
        _seekInterval.setMax(60);
        _seekInterval.setProgress(10);
        LinearLayout.LayoutParams seekParams =
                new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        _seekInterval.setLayoutParams(seekParams);
        _tvIntervalLabel = _label("10 分钟", 14, true);
        _tvIntervalLabel.setTextColor(0xFFFFD700);
        _tvIntervalLabel.setMinWidth(120);
        _tvIntervalLabel.setGravity(Gravity.END);
        sliderRow.addView(_seekInterval);
        sliderRow.addView(_spacer(16));
        sliderRow.addView(_tvIntervalLabel);
        root.addView(sliderRow);
        root.addView(_hint("0 = 随机触发（3~15分钟随机）"));
        root.addView(_spacer(24));

        /* ── Save + Test buttons ── */
        final LinearLayout btnRow = _row();
        final Button btnSave = _button("保存设置", 0xFF4CAF50);
        btnSave.setOnClickListener(v -> _saveSettings());
        _btnTest = _button("手动触发一次", 0xFF2196F3);
        _btnTest.setOnClickListener(v -> _triggerScan());
        btnRow.addView(btnSave);
        btnRow.addView(_spacer(16));
        btnRow.addView(_btnTest);
        root.addView(btnRow);
        root.addView(_spacer(24));

        /* ── Status ── */
        _tvStatus = _label("就绪", 13, false);
        _tvStatus.setTextColor(0xFF88CC88);
        root.addView(_tvStatus);
        root.addView(_spacer(32));

        /* ── How-to hint ── */
        root.addView(_divider());
        root.addView(_spacer(16));
        root.addView(_label("使用说明", 14, true));
        root.addView(_spacer(8));
        final String[] tips = {
            "① 点击「保存设置」后，桌宠会请求「显示在其他应用上层」权限",
            "② 授权后，再次开启「截屏权限」（用于 AI 视觉分析）",
            "③ 桌宠将悬浮在所有 App 上层，可自由拖动",
            "④ 双击桌宠可立即触发一次 AI 吐槽",
            "⑤ 间隔设为 0 = 随机模式（3~15 分钟内随机触发）"
        };
        for (String tip : tips) {
            final TextView t = _label(tip, 12, false);
            t.setTextColor(0xFF999999);
            t.setPadding(0, 4, 0, 4);
            root.addView(t);
        }

        scroll.addView(root);
        setContentView(scroll);

        /* Listeners */
        _swEnable.setOnCheckedChangeListener((cb, checked) -> {
            if (checked) _onEnableToggle();
            else         _stopService();
        });

        _seekInterval.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean u) {
                _tvIntervalLabel.setText(p == 0 ? "随机" : p + " 分钟");
            }
            @Override public void onStartTrackingTouch(SeekBar s) {}
            @Override public void onStopTrackingTouch(SeekBar s) {}
        });
    }

    /* ════════════════════════════════════════
       Settings load / save
       ════════════════════════════════════════ */
    private void _loadSettings() {
        _etApiKey.setText(  _prefs.getString("api_key",      ""));
        _etEndpoint.setText(_prefs.getString("api_endpoint", "https://api.openai.com/v1"));
        _etModel.setText(   _prefs.getString("model",        "gpt-4o"));
        _etPersona.setText( _prefs.getString("persona",      ""));
        final int intv = _prefs.getInt("interval_min", 10);
        _seekInterval.setProgress(intv);
        _tvIntervalLabel.setText(intv == 0 ? "随机" : intv + " 分钟");
        final boolean running = _prefs.getBoolean("service_running", false);
        _swEnable.setChecked(running);
    }

    private void _saveSettings() {
        final String key      = _etApiKey.getText().toString().trim();
        final String endpoint = _etEndpoint.getText().toString().trim();
        final String model    = _etModel.getText().toString().trim();
        final String persona  = _etPersona.getText().toString().trim();
        final int    intv     = _seekInterval.getProgress();

        if (TextUtils.isEmpty(key)) {
            Toast.makeText(this, "请填写 API Key", Toast.LENGTH_SHORT).show();
            return;
        }

        _prefs.edit()
                .putString("api_key",      key)
                .putString("api_endpoint", endpoint.isEmpty() ? "https://api.openai.com/v1" : endpoint)
                .putString("model",        model.isEmpty()    ? "gpt-4o" : model)
                .putString("persona",      persona)
                .putInt("interval_min",    intv)
                .apply();

        _setStatus("设置已保存 ✓");
        Toast.makeText(this, "设置已保存", Toast.LENGTH_SHORT).show();
    }

    /* ════════════════════════════════════════
       Enable flow:
       1. Save settings
       2. Request SYSTEM_ALERT_WINDOW if needed
       3. Request MediaProjection (ScreenshotActivity)
       4. Start FloatingWindowService
       ════════════════════════════════════════ */
    private void _onEnableToggle() {
        _saveSettings();

        /* Step 1: SYSTEM_ALERT_WINDOW */
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && !Settings.canDrawOverlays(this)) {
            _setStatus("正在请求悬浮窗权限…");
            final Intent intent = new Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getPackageName()));
            startActivityForResult(intent, REQ_OVERLAY);
        } else {
            _requestMediaProjection();
        }
    }

    private void _requestMediaProjection() {
        _setStatus("正在请求截屏权限…");
        startActivityForResult(_mpMgr.createScreenCaptureIntent(), REQ_MEDIA_PRJ);
    }

    private void _startFloatingService(int resultCode, Intent data) {
        final Intent svc = new Intent(this, FloatingWindowService.class);
        svc.setAction(FloatingWindowService.ACTION_START);
        svc.putExtra(FloatingWindowService.EXTRA_API_KEY,      _prefs.getString("api_key",      ""));
        svc.putExtra(FloatingWindowService.EXTRA_API_ENDPOINT, _prefs.getString("api_endpoint", ""));
        svc.putExtra(FloatingWindowService.EXTRA_MODEL,        _prefs.getString("model",        "gpt-4o"));
        svc.putExtra(FloatingWindowService.EXTRA_PERSONA,      _prefs.getString("persona",      ""));
        svc.putExtra(FloatingWindowService.EXTRA_INTERVAL_MIN, _prefs.getInt("interval_min", 10));
        if (data != null) {
            svc.putExtra(FloatingWindowService.EXTRA_PROJECTION_CODE, resultCode);
            svc.putExtra(FloatingWindowService.EXTRA_PROJECTION_DATA, data);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(svc);
        } else {
            startService(svc);
        }
        _prefs.edit().putBoolean("service_running", true).apply();
        _setStatus("🐾 桌宠悬浮中！双击桌宠可触发 AI 吐槽");
    }

    private void _stopService() {
        final Intent svc = new Intent(this, FloatingWindowService.class);
        svc.setAction(FloatingWindowService.ACTION_STOP);
        startService(svc);
        _prefs.edit().putBoolean("service_running", false).apply();
        _setStatus("桌宠已关闭");
    }

    private void _triggerScan() {
        final Intent svc = new Intent(this, FloatingWindowService.class);
        svc.setAction(FloatingWindowService.ACTION_TRIGGER_SCAN);
        startService(svc);
        _setStatus("已触发一次扫描…");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_OVERLAY) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    && Settings.canDrawOverlays(this)) {
                _requestMediaProjection();
            } else {
                Toast.makeText(this, "需要「显示在其他应用上层」权限才能启用桌宠",
                        Toast.LENGTH_LONG).show();
                _swEnable.setChecked(false);
            }
        } else if (requestCode == REQ_MEDIA_PRJ) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                _startFloatingService(resultCode, data);
            } else {
                /* User denied screenshot; start without projection (text-only AI) */
                _setStatus("无截屏权限，桌宠将仅依赖文本上下文吐槽");
                _startFloatingService(-1, null);
            }
        }
    }

    /* ════════════════════════════════════════
       UI Helpers
       ════════════════════════════════════════ */
    private void _setStatus(String msg) {
        runOnUiThread(() -> _tvStatus.setText(msg));
    }

    private TextView _label(String text, int spSize, boolean bold) {
        final TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextSize(spSize);
        tv.setTextColor(0xFFCCCCCC);
        if (bold) tv.setTypeface(null, android.graphics.Typeface.BOLD);
        return tv;
    }

    private TextView _hint(String text) {
        final TextView tv = _label(text, 11, false);
        tv.setTextColor(0xFF777777);
        tv.setPadding(0, 4, 0, 0);
        return tv;
    }

    private EditText _inputField(String hint) {
        final EditText et = new EditText(this);
        et.setHint(hint);
        et.setHintTextColor(0xFF555555);
        et.setTextColor(0xFFEEEEEE);
        et.setBackgroundColor(0xFF1E1E2E);
        et.setPadding(24, 20, 24, 20);
        et.setTextSize(13);
        final LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        et.setLayoutParams(lp);
        return et;
    }

    private Button _button(String text, int bgColor) {
        final Button btn = new Button(this);
        btn.setText(text);
        btn.setTextColor(0xFFFFFFFF);
        btn.setBackgroundColor(bgColor);
        btn.setPadding(32, 20, 32, 20);
        btn.setTextSize(13);
        return btn;
    }

    private LinearLayout _row() {
        final LinearLayout ll = new LinearLayout(this);
        ll.setOrientation(LinearLayout.HORIZONTAL);
        ll.setGravity(Gravity.CENTER_VERTICAL);
        ll.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));
        return ll;
    }

    private View _flex() {
        final View v = new View(this);
        v.setLayoutParams(new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        return v;
    }

    private View _spacer(int dp) {
        final View v = new View(this);
        final int px = (int) (dp * getResources().getDisplayMetrics().density);
        v.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, px));
        return v;
    }

    private View _divider() {
        final View v = new View(this);
        v.setBackgroundColor(0xFF2A2A3A);
        v.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 1));
        return v;
    }
}
