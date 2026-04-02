package com.beeper.floatpet;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
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

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class MainActivity extends AppCompatActivity {

    private WebView mWebView;

    // ── OTA 热更新配置 ──────────────────────────────────────────────────────────
    // version.json 放在 GitHub 仓库根目录，内容示例：
    //   {"version":2,"url":"https://raw.githubusercontent.com/ljb0621/bono1122/main/web_update.zip"}
    private static final String OTA_VERSION_URL =
        "https://raw.githubusercontent.com/ljb0621/bono1122/main/version.json";
    private static final String OTA_DIR         = "www_ota";
    private static final String OTA_VER_FILE    = "www_ota/version.txt";

    // 文件选择 / 相机回调
    private ValueCallback<Uri[]> mFilePathCallback;
    private Uri mCameraPhotoUri;
    private static final int REQ_FILE_CHOOSER = 1001;
    private static final int REQ_CAMERA_PHOTO = 1002;
    private static final int REQ_PERMISSIONS  = 1003;
    private static final int REQ_OVERLAY_PERM = 1004;

    // 运行时权限列表
    private static final String[] RUNTIME_PERMISSIONS = {
        Manifest.permission.CAMERA,
        Manifest.permission.RECORD_AUDIO,
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
    };

    // ── 生命周期 ────────────────────────────────────────────────────────────────

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        mWebView = findViewById(R.id.webview);
        setupWebView();
        requestRuntimePermissions();

        // 优先加载 OTA 目录（已有热更新），否则加载内置 assets
        mWebView.loadUrl(getStartUrl());

        // 后台检查是否有新版本
        checkForOtaUpdate();
    }

    // ── OTA 热更新 ──────────────────────────────────────────────────────────────

    /**
     * 决定加载哪个 index.html：
     *   - filesDir/www_ota/index.html 存在 → 加载 OTA 版本
     *   - 否则 → 加载内置 assets/www/index.html
     */
    private String getStartUrl() {
        File otaIndex = new File(getFilesDir(), OTA_DIR + "/index.html");
        if (otaIndex.exists()) {
            return "file://" + otaIndex.getAbsolutePath();
        }
        return "file:///android_asset/www/index.html";
    }

    /** 读取内置 assets/www/version.txt 中的版本号（不存在返回 0）。 */
    private int getBundledVersion() {
        try (InputStream in = getAssets().open("www/version.txt")) {
            byte[] buf = new byte[16];
            int n = in.read(buf);
            return Integer.parseInt(new String(buf, 0, n).trim());
        } catch (Exception e) {
            return 0;
        }
    }

    /** 读取已安装的 OTA 版本号（不存在返回 0）。 */
    private int getOtaVersion() {
        File f = new File(getFilesDir(), OTA_VER_FILE);
        if (!f.exists()) return 0;
        try (BufferedReader r = new BufferedReader(
                new InputStreamReader(new FileInputStream(f)))) {
            return Integer.parseInt(r.readLine().trim());
        } catch (Exception e) {
            return 0;
        }
    }

    /** 后台线程：拉取 version.json，有新版本则下载并解压。 */
    private void checkForOtaUpdate() {
        ConnectivityManager cm =
            (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return;
        NetworkInfo ni = cm.getActiveNetworkInfo();
        if (ni == null || !ni.isConnected()) return;

        new Thread(() -> {
            try {
                String json = httpGet(OTA_VERSION_URL, 6000);
                if (json == null || json.isEmpty()) return;

                int remoteVer = extractInt(json, "version");
                String zipUrl  = extractStr(json, "url");
                if (zipUrl == null || zipUrl.isEmpty()) return;

                int currentVer = Math.max(getBundledVersion(), getOtaVersion());
                if (remoteVer <= currentVer) return; // 已是最新

                // 下载并解压更新包
                downloadAndExtractZip(zipUrl, remoteVer);

                runOnUiThread(() ->
                    Toast.makeText(this,
                        "✅ 已下载新版本 v" + remoteVer + "，下次启动生效",
                        Toast.LENGTH_LONG).show()
                );
            } catch (Exception ignored) {
                // 网络失败 / 解析失败：静默忽略，下次启动重试
            }
        }).start();
    }

    /** 下载 zip → 解压到 filesDir/www_ota/ → 写入版本号文件。 */
    private void downloadAndExtractZip(String zipUrl, int version) throws IOException {
        File tmpZip = new File(getCacheDir(), "web_update.zip");

        // 1. 下载 ZIP
        URL url = new URL(zipUrl);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(120000);
        conn.connect();
        try (InputStream in = conn.getInputStream();
             FileOutputStream out = new FileOutputStream(tmpZip)) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
        } finally {
            conn.disconnect();
        }

        // 2. 解压到临时目录
        File tmpDir = new File(getFilesDir(), "www_ota_tmp");
        deleteRecursive(tmpDir);
        tmpDir.mkdirs();

        try (ZipInputStream zis = new ZipInputStream(new FileInputStream(tmpZip))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                File outFile = new File(tmpDir, entry.getName());
                // 防止 Zip Slip 攻击
                if (!outFile.getCanonicalPath().startsWith(tmpDir.getCanonicalPath())) {
                    zis.closeEntry();
                    continue;
                }
                if (entry.isDirectory()) {
                    outFile.mkdirs();
                } else {
                    outFile.getParentFile().mkdirs();
                    try (FileOutputStream fos = new FileOutputStream(outFile)) {
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = zis.read(buf)) != -1) fos.write(buf, 0, n);
                    }
                }
                zis.closeEntry();
            }
        }

        // 3. 原子替换：删除旧 OTA 目录 → 重命名临时目录
        File otaDir = new File(getFilesDir(), OTA_DIR);
        deleteRecursive(otaDir);
        tmpDir.renameTo(otaDir);

        // 4. 写入版本号
        File versionFile = new File(getFilesDir(), OTA_VER_FILE);
        try (FileOutputStream fos = new FileOutputStream(versionFile)) {
            fos.write(String.valueOf(version).getBytes());
        }

        tmpZip.delete();
    }

    // ── 工具方法 ─────────────────────────────────────────────────────────────────

    private static void deleteRecursive(File f) {
        if (f == null || !f.exists()) return;
        if (f.isDirectory()) {
            File[] children = f.listFiles();
            if (children != null) {
                for (File c : children) deleteRecursive(c);
            }
        }
        f.delete();
    }

    private static String httpGet(String urlStr, int timeoutMs) throws IOException {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(timeoutMs);
        conn.setReadTimeout(timeoutMs);
        conn.setRequestProperty("Cache-Control", "no-cache");
        try (BufferedReader r = new BufferedReader(
                new InputStreamReader(conn.getInputStream()))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
            return sb.toString();
        } finally {
            conn.disconnect();
        }
    }

    private static int extractInt(String json, String key) {
        try {
            Matcher m = Pattern.compile("\"" + key + "\"\\s*:\\s*(\\d+)").matcher(json);
            if (m.find()) return Integer.parseInt(m.group(1));
        } catch (Exception ignored) {}
        return 0;
    }

    private static String extractStr(String json, String key) {
        try {
            Matcher m = Pattern.compile("\"" + key + "\"\\s*:\\s*\"([^\"]+)\"").matcher(json);
            if (m.find()) return m.group(1);
        } catch (Exception ignored) {}
        return null;
    }

    // ── WebView 初始化 ──────────────────────────────────────────────────────────

    private void setupWebView() {
        WebSettings s = mWebView.getSettings();

        // 基础
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);

        // 媒体
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);

        // 跨域（加载本地 assets / OTA 文件时需要）
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);

        // 混合内容（https 页面可请求 http 资源）
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // 视口
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);

        // 缓存
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        // User-Agent 追加标识供 JS 检测
        String ua = s.getUserAgentString();
        s.setUserAgentString(ua + " BeeperApp/1.0 Android");

        // 注册 JS 桥接
        mWebView.addJavascriptInterface(new AndroidBridge(this, mWebView), "AndroidBridge");

        // WebViewClient
        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("file://") || url.startsWith("https://") || url.startsWith("http://")) {
                    return false;
                }
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                } catch (Exception ignored) {}
                return true;
            }
        });

        // WebChromeClient：文件选择 / 摄像头 / 麦克风 / 定位 / JS 对话框
        mWebView.setWebChromeClient(new WebChromeClient() {

            @Override
            public boolean onShowFileChooser(WebView webView,
                                             ValueCallback<Uri[]> filePathCallback,
                                             FileChooserParams fileChooserParams) {
                if (mFilePathCallback != null) mFilePathCallback.onReceiveValue(null);
                mFilePathCallback = filePathCallback;

                // 将 accept 属性（可能含文件扩展名）转换为有效 MIME 类型
                String[] rawAccept = fileChooserParams.getAcceptTypes();
                String resolvedMime = resolveMimeType(rawAccept);
                boolean imageOnly  = isImageOnlyAccept(rawAccept);

                // 仅图片类型才提供相机选项
                Intent cameraIntent = null;
                if (imageOnly) {
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
                }

                Intent galleryIntent = new Intent(Intent.ACTION_GET_CONTENT);
                galleryIntent.addCategory(Intent.CATEGORY_OPENABLE);
                galleryIntent.setType(resolvedMime);
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
                if (!toGrant.isEmpty()) request.grant(toGrant.toArray(new String[0]));
                else request.deny();
            }

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

            @Override
            public void onReceivedTitle(WebView view, String title) {
                // 全屏无标题栏，不需要设置 ActionBar
            }
        });

        // Debug 模式下开启 WebView 远程调试（Chrome DevTools）
        WebView.setWebContentsDebuggingEnabled(true);
    }

    // ── 运行时权限 ──────────────────────────────────────────────────────────────

    private void requestRuntimePermissions() {
        List<String> needed = new ArrayList<>();
        for (String perm : RUNTIME_PERMISSIONS) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                needed.add(perm);
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            String[] media = {
                Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.READ_MEDIA_VIDEO,
                Manifest.permission.READ_MEDIA_AUDIO,
                Manifest.permission.POST_NOTIFICATIONS,
            };
            for (String p : media) {
                if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) {
                    needed.add(p);
                }
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
        if (requestCode == REQ_OVERLAY_PERM) {
            boolean granted = android.provider.Settings.canDrawOverlays(this);
            String js = "if(typeof window._onOverlayPermResult==='function')"
                      + "{window._onOverlayPermResult(" + granted + ");}";
            mWebView.post(() -> mWebView.evaluateJavascript(js, null));
        }
    }

    // ── 文件选择 / 相机 回调 ─────────────────────────────────────────────────────

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == REQ_FILE_CHOOSER) {
            if (mFilePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK) {
                if (data != null) {
                    android.net.Uri[] uris = WebChromeClient.FileChooserParams
                        .parseResult(resultCode, data);
                    if (uris != null) {
                        results = uris;
                    } else {
                        String ds = data.getDataString();
                        if (ds != null) results = new Uri[]{Uri.parse(ds)};
                    }
                } else if (mCameraPhotoUri != null) {
                    results = new Uri[]{mCameraPhotoUri};
                }
            }
            mFilePathCallback.onReceiveValue(results);
            mFilePathCallback = null;
            mCameraPhotoUri   = null;

        } else if (requestCode == REQ_CAMERA_PHOTO) {
            if (mFilePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && mCameraPhotoUri != null) {
                results = new Uri[]{mCameraPhotoUri};
            }
            mFilePathCallback.onReceiveValue(results);
            mFilePathCallback = null;
            mCameraPhotoUri   = null;
        }
    }

    // ── 创建拍照临时文件 ─────────────────────────────────────────────────────────

    private File createImageFile() throws IOException {
        String ts = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(new Date());
        File storageDir = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
        return File.createTempFile("BEEPER_" + ts + "_", ".jpg", storageDir);
    }

    // ── 生命周期：WebView 暂停/恢复/销毁 ─────────────────────────────────────────

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
        if (mWebView != null) mWebView.onPause();
    }

    @Override
    public void onBackPressed() {
        if (mWebView != null && mWebView.canGoBack()) {
            mWebView.goBack();
        } else {
            moveTaskToBack(true); // 按返回键退到后台而非退出
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

    // ── 供 AndroidBridge 调用的辅助方法 ─────────────────────────────────────────

    /** 在 UI 线程执行 JS。 */
    public void runJs(String js) {
        if (mWebView == null) return;
        mWebView.post(() -> mWebView.evaluateJavascript(js, null));
    }

    /** 返回悬浮窗权限申请的 requestCode，供 AndroidBridge 使用。 */
    public int getOverlayPermReqCode() {
        return REQ_OVERLAY_PERM;
    }

    // ── 文件选择 MIME 类型辅助 ────────────────────────────────────────────────────

    /**
     * 将 HTML input[accept] 的值（可能是扩展名如 .png / .json 或 MIME 类型）
     * 转换为 Android Intent 可用的单个 MIME 类型字符串。
     */
    private static String resolveMimeType(String[] acceptTypes) {
        if (acceptTypes == null || acceptTypes.length == 0) return "*/*";
        Set<String> mimes = new LinkedHashSet<>();
        for (String raw : acceptTypes) {
            String t = raw.trim().toLowerCase(Locale.US);
            if (t.isEmpty()) continue;
            if (t.contains("/")) {
                mimes.add(t); // 已是合法 MIME
            } else {
                switch (t) {
                    case ".jpg": case ".jpeg": mimes.add("image/jpeg"); break;
                    case ".png":  mimes.add("image/png");  break;
                    case ".gif":  mimes.add("image/gif");  break;
                    case ".webp": mimes.add("image/webp"); break;
                    case ".svg":  mimes.add("image/svg+xml"); break;
                    case ".bmp":  mimes.add("image/bmp");  break;
                    case ".json": mimes.add("application/json"); break;
                    case ".txt":  mimes.add("text/plain"); break;
                    case ".pdf":  mimes.add("application/pdf"); break;
                    case ".mp3":  mimes.add("audio/mpeg"); break;
                    case ".m4a":  mimes.add("audio/mp4");  break;
                    case ".wav":  mimes.add("audio/wav");  break;
                    case ".ogg":  mimes.add("audio/ogg");  break;
                    case ".lrc":  mimes.add("text/plain"); break;
                    case ".mp4":  mimes.add("video/mp4");  break;
                    case ".docx": mimes.add("application/vnd.openxmlformats-officedocument.wordprocessingml.document"); break;
                    default:      mimes.add("*/*"); break;
                }
            }
        }
        if (mimes.isEmpty() || mimes.contains("*/*")) return "*/*";
        if (mimes.size() == 1) return mimes.iterator().next();
        // 多类型：尝试合并为通配符
        boolean allImage = true, allAudio = true, allVideo = true;
        for (String m : mimes) {
            if (!m.startsWith("image/")) allImage = false;
            if (!m.startsWith("audio/")) allAudio = false;
            if (!m.startsWith("video/")) allVideo = false;
        }
        if (allImage) return "image/*";
        if (allAudio) return "audio/*";
        if (allVideo) return "video/*";
        return "*/*";
    }

    /**
     * 判断 accept 类型是否纯图片（只有图片类型才需要附加相机 Intent）。
     */
    private static boolean isImageOnlyAccept(String[] acceptTypes) {
        if (acceptTypes == null || acceptTypes.length == 0) return false;
        for (String raw : acceptTypes) {
            String t = raw.trim().toLowerCase(Locale.US);
            if (t.isEmpty()) continue;
            boolean img = t.startsWith("image/")
                || t.equals(".jpg") || t.equals(".jpeg") || t.equals(".png")
                || t.equals(".gif") || t.equals(".webp") || t.equals(".svg")
                || t.equals(".bmp");
            if (!img) return false;
        }
        return true;
    }
}
