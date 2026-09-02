package com.beeper.floatpet;

import android.content.Context;
import android.content.SharedPreferences;
import android.provider.Settings;
import android.content.Intent;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class AndroidBridge {
    private final Context context;
    private final SharedPreferences prefs;
    private final MainActivity activity;
    private SpeechRecognizer speechRecognizer;
    private String speechCallback;

    AndroidBridge(MainActivity activity) {
        this.activity = activity;
        Context context = activity;
        this.context = context.getApplicationContext();
        this.prefs = this.context.getSharedPreferences("beeper_native", Context.MODE_PRIVATE);
    }

    @JavascriptInterface public String getPlatform() { return "android"; }
    @JavascriptInterface public void saveString(String key, String value) { prefs.edit().putString(key, value == null ? "" : value).apply(); }
    @JavascriptInterface public String getString(String key) { return prefs.getString(key, ""); }
    @JavascriptInterface public boolean canDrawOverlays() { return Settings.canDrawOverlays(context); }
    @JavascriptInterface public void requestOverlayPermission() {
        if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(context)) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    android.net.Uri.parse("package:" + context.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        }
    }
    @JavascriptInterface public void startFloatPet() {
        if (!canDrawOverlays()) {
            FloatPetStub.showPermissionNotice(context);
            return;
        }
        context.startService(new Intent(context, FloatPetService.class));
    }
    @JavascriptInterface public void stopFloatPet() {
        context.stopService(new Intent(context, FloatPetService.class));
    }
    @JavascriptInterface public void startNativeSpeechRecognition(String callback) {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            sendSpeechResult("");
            return;
        }
        speechCallback = callback;
        activity.runOnUiThread(() -> {
            stopRecognizerOnly();
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(activity);
            speechRecognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onResults(android.os.Bundle results) {
                    ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    sendSpeechResult(matches == null || matches.isEmpty() ? "" : matches.get(0));
                    stopRecognizerOnly();
                }
                @Override public void onError(int error) { sendSpeechResult(""); stopRecognizerOnly(); }
                @Override public void onReadyForSpeech(android.os.Bundle b) { }
                @Override public void onBeginningOfSpeech() { }
                @Override public void onRmsChanged(float v) { }
                @Override public void onBufferReceived(byte[] b) { }
                @Override public void onEndOfSpeech() { }
                @Override public void onPartialResults(android.os.Bundle b) { }
                @Override public void onEvent(int t, android.os.Bundle b) { }
            });
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.SIMPLIFIED_CHINESE.toLanguageTag());
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
            speechRecognizer.startListening(intent);
        });
    }

    @JavascriptInterface public void stopNativeSpeechRecognition() {
        activity.runOnUiThread(this::stopRecognizerOnly);
    }

    @JavascriptInterface public void applyWebUpdate(String zipUrl, String version) {
        final String cleanUrl = zipUrl == null ? "" : zipUrl.trim();
        if (cleanUrl.isEmpty()) return;
        new Thread(() -> {
            try {
                File webRoot = activity.getWebRootDir();
                if (!webRoot.exists()) webRoot.mkdirs();
                File zipFile = new File(activity.getFilesDir(), "web_update.zip");
                downloadFile(cleanUrl, zipFile);
                deleteRecursive(webRoot);
                webRoot.mkdirs();
                unzip(zipFile, webRoot);
                zipFile.delete();
                activity.runOnUiThread(() -> {
                    WebView view = activity.getWebView();
                    if (view != null) view.loadUrl(activity.getWebRootIndexUrl() + "?v=" + System.currentTimeMillis());
                });
            } catch (Exception e) {
                activity.runOnUiThread(() -> {
                    WebView view = activity.getWebView();
                    if (view != null) view.evaluateJavascript("alert('更新失败：" + escapeJs(e.getMessage()) + "')", null);
                });
            }
        }).start();
    }

    private void downloadFile(String urlStr, File outFile) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        conn.setInstanceFollowRedirects(true);
        conn.connect();
        try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(outFile)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
        } finally {
            conn.disconnect();
        }
    }

    private void unzip(File zipFile, File destDir) throws Exception {
        try (ZipInputStream zis = new ZipInputStream(new java.io.FileInputStream(zipFile))) {
            ZipEntry entry;
            byte[] buffer = new byte[8192];
            while ((entry = zis.getNextEntry()) != null) {
                File outFile = new File(destDir, entry.getName());
                if (entry.isDirectory()) {
                    outFile.mkdirs();
                } else {
                    File parent = outFile.getParentFile();
                    if (parent != null && !parent.exists()) parent.mkdirs();
                    try (FileOutputStream out = new FileOutputStream(outFile)) {
                        int read;
                        while ((read = zis.read(buffer)) != -1) out.write(buffer, 0, read);
                    }
                }
                zis.closeEntry();
            }
        }
    }

    private void deleteRecursive(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) deleteRecursive(child);
        }
        file.delete();
    }

    private String escapeJs(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ").replace("\r", " ");
    }

    private void sendSpeechResult(String text) {
        final String callback = speechCallback;
        if (callback == null || callback.isEmpty()) return;
        speechCallback = null;
        final String safeText = org.json.JSONObject.quote(text == null ? "" : text);
        activity.runOnUiThread(() -> {
            WebView view = activity.getWebView();
            if (view != null) view.evaluateJavascript(callback + "(" + safeText + ")", null);
        });
    }

    private void stopRecognizerOnly() {
        if (speechRecognizer != null) {
            speechRecognizer.cancel();
            speechRecognizer.destroy();
            speechRecognizer = null;
        }
    }

    void destroy() {
        activity.runOnUiThread(() -> {
            speechCallback = null;
            stopRecognizerOnly();
        });
    }
}