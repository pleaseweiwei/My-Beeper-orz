package com.beeper.floatpet;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.GeolocationPermissions;
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {

    private WebView mWebView;

    // 文件选择 / 相机回调
    private ValueCallback<Uri[]> mFilePathCallback;
    private Uri mCameraPhotoUri;
    private static final int REQ_FILE_CHOOSER  = 1001;
    private static final int REQ_CAMERA_PHOTO  = 1002;
    private static final int REQ_PERMISSIONS   = 1003;
    private static final int REQ_OVERLAY_PERM  = 1004;

    // 待请求的运行时权限列表
    private static final String[] RUNTIME_PERMISSIONS = {
        Manifest.permission.CAMERA,
        Manifest.permission.RECORD_AUDIO,
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        mWebView = findViewById(R.id.webview);
        setupWebView();

        // 批量申请运行时权限（Android 6+）
        requestRuntimePermissions();

        // 加载完整 Web App
        mWebView.loadUrl("file:///android_asset/www/index.html");
    }

    // ─────────────────────────────────────────────────────────────
    //  WebView 完整配置
    // ─────────────────────────────────────────────────────────────
    private void setupWebView() {
        WebSettings s = mWebView.getSettings();

        // 基础
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);

        // 媒体
        s.setMediaPlaybackRequiresUserGesture(false);   // 音乐自动播放
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);

        // 跨域（加载本地 assets 时需要）
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);

        // 混合内容（允许 https 页面加载 http 资源）
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // 缩放 / 布局
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);

        // 缓存
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        // User-Agent 追加标识，供 JS 侧检测
        String ua = s.getUserAgentString();
        s.setUserAgentString(ua + " BeeperApp/1.0 Android");

        // 注入 JS 桥接
        mWebView.addJavascriptInterface(new AndroidBridge(this, mWebView), "AndroidBridge");

        // WebViewClient：拦截自定义 scheme / 权限回调
        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                // 允许 file:// 和 https:// 正常加载
                if (url.startsWith("file://") || url.startsWith("https://") || url.startsWith("http://")) {
                    return false;
                }
                // 处理其他 scheme（tel: mailto: 等）
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                } catch (Exception ignored) {}
                return true;
            }
        });

        // WebChromeClient：文件选择 / 摄像头 / 麦克风 / 地理位置 / JS 对话框
        mWebView.setWebChromeClient(new WebChromeClient() {

            // ── 文件选择（图片上传、imagegen 等） ──────────────────
            @Override
            public boolean onShowFileChooser(WebView webView,
                                             ValueCallback<Uri[]> filePathCallback,
                                             FileChooserParams fileChooserParams) {
                if (mFilePathCallback != null) {
                    mFilePathCallback.onReceiveValue(null);
                }
                mFilePathCallback = filePathCallback;

                // 同时提供"相机拍照"和"文件管理器"两个来源
                Intent cameraIntent = null;
                try {
                    File photoFile = createImageFile();
                    mCameraPhotoUri = FileProvider.getUriForFile(
                        MainActivity.this,
                        getPackageName() + ".fileprovider",
                        photoFile);
                    cameraIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, mCameraPhotoUri);
                } catch (IOException e) {
                    mCameraPhotoUri = null;
                }

                Intent galleryIntent = new Intent(Intent.ACTION_GET_CONTENT);
                galleryIntent.addCategory(Intent.CATEGORY_OPENABLE);
                galleryIntent.setType("*/*");
                String[] mimeTypes = fileChooserParams.getAcceptTypes();
                if (mimeTypes != null && mimeTypes.length > 0 && !mimeTypes[0].isEmpty()) {
                    galleryIntent.setType(mimeTypes[0]);
                }

                // 多文件选择支持
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2) {
                    galleryIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }

                Intent chooserIntent = Intent.createChooser(galleryIntent, "选择文件");
                if (cameraIntent != null) {
                    chooserIntent.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cameraIntent});
                }

                startActivityForResult(chooserIntent, REQ_FILE_CHOOSER);
                return true;
            }

            // ── WebRTC 权限（麦克风/摄像头） ───────────────────────
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                String[] resources = request.getResources();
                List<String> toGrant = new ArrayList<>();
                for (String res : resources) {
                    if (res.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                        if (ContextCompat.checkSelfPermission(MainActivity.this,
                                Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                            toGrant.add(res);
                        }
                    } else if (res.equals(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                        if (ContextCompat.checkSelfPermission(MainActivity.this,
                                Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                            toGrant.add(res);
                        }
                    } else {
                        toGrant.add(res);
                    }
                }
                if (!toGrant.isEmpty()) {
                    request.grant(toGrant.toArray(new String[0]));
                } else {
                    request.deny();
                }
            }

            // ── 地理位置 ───────────────────────────────────────────
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin,
                                                           GeolocationPermissions.Callback callback) {
                if (ContextCompat.checkSelfPermission(MainActivity.this,
                        Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                } else {
                    ActivityCompat.requestPermissions(MainActivity.this,
                        new String[]{Manifest.permission.ACCESS_FINE_LOCATION,
                                     Manifest.permission.ACCESS_COARSE_LOCATION},
                        REQ_PERMISSIONS);
                    callback.invoke(origin, false, false);
                }
            }

            // ── JS 对话框 ──────────────────────────────────────────
            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton("确定", (d, w) -> result.confirm())
                    .setOnCancelListener(d -> result.cancel())
                    .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton("确定", (d, w) -> result.confirm())
                    .setNegativeButton("取消", (d, w) -> result.cancel())
                    .setOnCancelListener(d -> result.cancel())
                    .show();
                return true;
            }

            // ── 进度 / 标题 ────────────────────────────────────────
            @Override
            public void onReceivedTitle(WebView view, String title) {
                // 不设置 ActionBar 标题（全屏无标题栏）
            }
        });

        // Debug 模式下开启 WebView 远程调试（Chrome DevTools）
        WebView.setWebContentsDebuggingEnabled(true);
    }

    // ─────────────────────────────────────────────────────────────
    //  运行时权限申请
    // ─────────────────────────────────────────────────────────────
    private void requestRuntimePermissions() {
        List<String> needed = new ArrayList<>();
        for (String perm : RUNTIME_PERMISSIONS) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                needed.add(perm);
            }
        }
        // Android 13+ 媒体权限
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES)
                    != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.READ_MEDIA_IMAGES);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_VIDEO)
                    != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.READ_MEDIA_VIDEO);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_AUDIO)
                    != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.READ_MEDIA_AUDIO);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        }
        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this,
                needed.toArray(new String[0]), REQ_PERMISSIONS);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode,
                                           @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        // 通知 JS 侧权限结果（悬浮窗权限回调）
        if (requestCode == REQ_OVERLAY_PERM) {
            boolean granted = android.provider.Settings.canDrawOverlays(this);
            String js = "if(typeof window._onOverlayPermResult==='function')"
                      + "{window._onOverlayPermResult(" + granted + ");}";
            mWebView.post(() -> mWebView.evaluateJavascript(js, null));
        }
    }

    // ─────────────────────────────────────────────────────────────
    //  文件选择 / 相机 回调
    // ─────────────────────────────────────────────────────────────
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == REQ_FILE_CHOOSER) {
            if (mFilePathCallback == null) return;

            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK) {
                if (data != null) {
                    String dataString = data.getDataString();
                    android.net.Uri[] uris = WebChromeClient.FileChooserParams
                        .parseResult(resultCode, data);
                    if (uris != null) {
                        results = uris;
                    } else if (dataString != null) {
                        results = new Uri[]{Uri.parse(dataString)};
                    }
                } else if (mCameraPhotoUri != null) {
                    // 从相机拍照返回
                    results = new Uri[]{mCameraPhotoUri};
                }
            }
            mFilePathCallback.onReceiveValue(results);
            mFilePathCallback = null;
            mCameraPhotoUri  = null;

        } else if (requestCode == REQ_CAMERA_PHOTO) {
            if (mFilePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && mCameraPhotoUri != null) {
                results = new Uri[]{mCameraPhotoUri};
            }
            mFilePathCallback.onReceiveValue(results);
            mFilePathCallback = null;
            mCameraPhotoUri  = null;
        }
    }

    // ─────────────────────────────────────────────────────────────
    //  创建相机拍照临时文件
    // ─────────────────────────────────────────────────────────────
    private File createImageFile() throws IOException {
        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault())
            .format(new Date());
        String imageFileName = "BEEPER_" + timeStamp + "_";
        File storageDir = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
        return File.createTempFile(imageFileName, ".jpg", storageDir);
    }

    // ─────────────────────────────────────────────────────────────
    //  生命周期：WebView 暂停/恢复（节省电量/保持音乐）
    // ─────────────────────────────────────────────────────────────
    @Override
    protected void onResume() {
        super.onResume();
        if (mWebView != null) {
            mWebView.onResume();
            mWebView.resumeTimers();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (mWebView != null) {
            mWebView.onPause();
            // 不 pauseTimers()，让音乐/定时器后台继续运行
        }
    }

    @Override
    public void onBackPressed() {
        // 返回键：优先让 WebView 内页面后退
        if (mWebView != null && mWebView.canGoBack()) {
            mWebView.goBack();
        } else {
            // 回到桌面但不退出（保持后台运行）
            moveTaskToBack(true);
        }
    }

    @Override
    protected void onDestroy() {
        if (mWebView != null) {
            mWebView.stopLoading();
            mWebView.destroy();
            mWebView = null;
        }
        super.onDestroy();
    }

    // ─────────────────────────────────────────────────────────────
    //  供 AndroidBridge 调用：在 UI 线程执行 JS
    // ─────────────────────────────────────────────────────────────
    public void runJs(String js) {
        if (mWebView == null) return;
        mWebView.post(() -> mWebView.evaluateJavascript(js, null));
    }

    // 供 AndroidBridge 获取 REQ_OVERLAY_PERM 常量
    public int getOverlayPermReqCode() {
        return REQ_OVERLAY_PERM;
    }
}
