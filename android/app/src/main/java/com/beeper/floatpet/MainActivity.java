package com.beeper.floatpet;

import android.app.Activity;
import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.provider.Settings;
import android.net.Uri;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;

public class MainActivity extends Activity {
    private static final int REQUEST_RUNTIME_PERMISSIONS = 1001;
    private static final int REQUEST_FILE_CHOOSER = 1002;
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private AndroidBridge androidBridge;

    WebView getWebView() { return webView; }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.web_view);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new AppChromeClient());
        androidBridge = new AndroidBridge(this);
        webView.addJavascriptInterface(androidBridge, "AndroidBridge");
        ensureWebRoot();
        webView.loadUrl(getWebRootIndexUrl());
        requestRuntimePermissions();
    }

    String getWebRootDirPath() {
        return new File(getFilesDir(), "webroot").getAbsolutePath();
    }

    String getWebRootIndexUrl() {
        return "file://" + getWebRootDirPath() + "/index.html";
    }

    File getWebRootDir() {
        return new File(getWebRootDirPath());
    }

    private void ensureWebRoot() {
        File root = getWebRootDir();
        File index = new File(root, "index.html");
        if (index.exists()) return;
        copyAssetDir("www", root);
    }

    void resetWebRootToAssets() {
        deleteRecursive(getWebRootDir());
        ensureWebRoot();
    }

    private void copyAssetDir(String assetPath, File outDir) {
        try {
            if (!outDir.exists()) outDir.mkdirs();
            String[] children = getAssets().list(assetPath);
            if (children == null || children.length == 0) {
                copyAssetFile(assetPath, outDir);
                return;
            }
            for (String child : children) {
                String childAsset = assetPath.isEmpty() ? child : assetPath + "/" + child;
                File target = new File(outDir, child);
                String[] nested = getAssets().list(childAsset);
                if (nested != null && nested.length > 0) {
                    copyAssetDir(childAsset, target);
                } else {
                    copyAssetFile(childAsset, target);
                }
            }
        } catch (IOException ignored) { }
    }

    private void copyAssetFile(String assetPath, File outFile) throws IOException {
        File parent = outFile.getParentFile();
        if (parent != null && !parent.exists()) parent.mkdirs();
        try (FileInputStream in = new FileInputStream(getAssets().openFd(assetPath).getFileDescriptor());) {
            throw new IOException("Asset direct descriptor copy not supported");
        } catch (Exception ex) {
            try (java.io.InputStream in = getAssets().open(assetPath);
                 FileOutputStream out = new FileOutputStream(outFile)) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            }
        }
    }

    private void deleteRecursive(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) deleteRecursive(child);
            }
        }
        file.delete();
    }

    private void requestRuntimePermissions() {
        if (android.os.Build.VERSION.SDK_INT < 23) return;
        java.util.ArrayList<String> permissions = new java.util.ArrayList<>();
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
            permissions.add(Manifest.permission.CAMERA);
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
            permissions.add(Manifest.permission.RECORD_AUDIO);
        if (android.os.Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            permissions.add(Manifest.permission.POST_NOTIFICATIONS);
        if (!permissions.isEmpty()) requestPermissions(
                permissions.toArray(new String[0]), REQUEST_RUNTIME_PERMISSIONS);
    }

    private final class AppChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                        FileChooserParams params) {
            if (filePathCallback != null) filePathCallback.onReceiveValue(null);
            filePathCallback = callback;
            try {
                Intent intent = params.createIntent();
                startActivityForResult(intent, REQUEST_FILE_CHOOSER);
            } catch (Exception error) {
                filePathCallback = null;
                callback.onReceiveValue(null);
                return false;
            }
            return true;
        }

        @Override
        public void onPermissionRequest(final android.webkit.PermissionRequest request) {
            runOnUiThread(() -> {
                if (android.os.Build.VERSION.SDK_INT >= 21) request.grant(request.getResources());
            });
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_FILE_CHOOSER || filePathCallback == null) return;
        Uri[] results = resultCode == RESULT_OK ? WebChromeClient.FileChooserParams.parseResult(resultCode, data) : null;
        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (androidBridge != null) androidBridge.destroy();
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}