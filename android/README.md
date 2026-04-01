# FloatPet Android — 一体化 APK 构建指南

将整个「小手机」Web App 打包成 Android 原生 APK，**同时内置悬浮桌宠**。
装一个 APK，搞定所有功能。

---

## 架构说明

```
┌─────────────────────────────────────────────┐
│  FloatPet APK（一个安装包）                   │
│                                              │
│  ┌─────────────────────────────┐             │
│  │  MainActivity               │             │
│  │  全屏 WebView                │             │
│  │  加载 index.html             │  ← 原来所有  │
│  │  （聊天/语音/视频通话/…）      │    Web功能   │
│  └─────────────────────────────┘             │
│                           ▲                  │
│            点击右下角 🐾 按钮                 │
│                           ▼                  │
│  ┌─────────────────────────────┐             │
│  │  FloatingWindowService      │  ← 悬浮桌宠  │
│  │  TYPE_APPLICATION_OVERLAY   │    浮于所有  │
│  │  → 可浮在微信/抖音/桌面上    │    App 上层  │
│  └─────────────────────────────┘             │
└─────────────────────────────────────────────┘
```

**构建时**，Gradle 自动将项目根目录的 `index.html`、`js/`、`css/` 全部打包进 APK。

---

## 功能特性

| 功能 | 说明 |
|------|------|
| 📱 完整 Web App | 聊天、语音、视频通话、所有原有功能照常使用 |
| 🐾 悬浮桌宠 | 右下角 🐾 按钮一键启停，浮于任意 App 上层 |
| 🎤 语音输入 | Web Speech API，长按麦克风识别发送 |
| 📸 截屏分析 | 桌宠可实时截屏交给 AI 分析当前屏幕 |
| 🤖 AI 吐槽 | 支持 OpenAI / Gemini / 任意兼容接口 |
| 🔁 开机自启 | 重启后自动恢复桌宠 |

---

## 构建前提

| 工具 | 版本要求 |
|------|---------|
| Android Studio | Hedgehog 2023.1.1+ 或 Iguana 2023.2.1+ |
| JDK | 17（Android Studio 自带） |
| Android SDK | API 34（compileSdk）、API 26+（minSdk） |
| Gradle | 8.4（wrapper 自动下载） |
| AGP | 8.2.0 |

---

## 构建步骤

### 方法一：Android Studio（推荐）

1. 打开 Android Studio → **File > Open** → 选择 `android/` 目录
2. 等待 Gradle Sync 完成
3. **Gradle 会自动将根目录的 `index.html`、`js/`、`css/` 复制进 APK**（`copyWebAssets` 任务）
4. 连接手机（开发者选项 + USB 调试）或直接 **Build APK(s)**
5. APK 路径：`android/app/build/outputs/apk/debug/app-debug.apk`

### 方法二：命令行

```bash
cd android
gradlew.bat assembleDebug        # Windows
# ./gradlew assembleDebug        # macOS / Linux
```

---

## 安装后使用流程

1. 安装 APK，打开 **FloatPet**
2. App 内全屏运行完整的手机模拟界面（和浏览器里一模一样）
3. **右下角 🐾 按钮** → 首次点击依次授权：
   - ① 系统弹窗：**「显示在其他应用上层」** → 开启后返回
   - ② 系统弹窗：**「截屏权限」** → 点击「立即开始」（可拒绝，拒绝后桌宠仍可运行）
4. 桌宠启动成功，🐾 按钮变为**金色**
5. **切换到微信/抖音/任意 App**，桌宠仍然悬浮显示
6. 再次点击 🐾（回到 App 后）→ 关闭桌宠

---

## AI 设置（桌宠用）

桌宠的 AI 设置与网页内的 AI 设置共享 `SharedPreferences`。
在 App 内的设置页填写 API Key 后，桌宠自动读取，**无需重复配置**。

如需用代码设置（从 JS 调用桥接）：

```javascript
// 在网页内 JS 调用（App 内 WebView 有此 Bridge，浏览器无）
if (window.AndroidBridge) {
    AndroidBridge.saveAiSettings(
        "sk-xxx",                         // API Key
        "https://api.openai.com/v1",      // Endpoint
        "gpt-4o",                         // Model
        "你是一只傲娇猫娘",               // 人设 Prompt
        10                                // 吐槽间隔（分钟）
    );
}
```

---

## 权限说明

| 权限 | 用途 |
|------|------|
| `SYSTEM_ALERT_WINDOW` | 悬浮窗核心权限 |
| `FOREGROUND_SERVICE` | 前台服务保活 |
| `FOREGROUND_SERVICE_MEDIA_PROJECTION` | MediaProjection 截屏 |
| `POST_NOTIFICATIONS` | Android 13+ 前台通知 |
| `INTERNET` | AI API + 网页所有网络功能 |
| `RECORD_AUDIO` | 语音输入（Web Speech API） |
| `CAMERA` | 视频通话 |
| `VIBRATE` | 触摸震动 |
| `RECEIVE_BOOT_COMPLETED` | 开机自启 |

---

## 常见问题

**Q: 构建后 App 里是空白页？**
A: 确认 `copyWebAssets` 任务执行成功。可在 Android Studio 的 Gradle 面板中手动运行 `app > Tasks > other > copyWebAssets`，然后再 Build。

**Q: 桌宠消失了？**
A: 小米/华为/OPPO 等厂商会后台杀进程。设置 → 应用管理 → FloatPet → 电量/后台 → 设为"无限制"。

**Q: 语音识别没有反应？**
A: Web Speech API 在某些 Android WebView 版本上需要联网（使用 Google 语音服务）。确保手机有网络，或使用文字输入。

**Q: AI 设置在哪里填？**
A: 直接在 App 内的「设置」界面（就是原来网页里的设置），填写后桌宠自动读取，不需要单独配置。

---

## 技术细节

- **WebView 加载**：`file:///android_asset/index.html`（本地资源，无需服务器）
- **JS Bridge**：`window.AndroidBridge`（仅在 APK 内 WebView 有效，浏览器打开无此对象）
- **桌宠皮肤**：`floatpet_overlay.html`（独立于主界面，轻量 WebView）
- **设置同步**：`SharedPreferences("floatpet_prefs")` 在 MainActivity 和 FloatingWindowService 间共享
- **最低 SDK**：API 26（Android 8.0）
- **目标 SDK**：API 34（Android 14）
