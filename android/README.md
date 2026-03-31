# 🐾 FloatPet · Android 原生悬浮桌宠

> 桌宠悬浮在所有 App 上层，定时截屏后发送给 AI Vision 模型，用你设定的人设 Prompt 生成吐槽台词，显示在气泡里。

---

## 项目结构

```
android/
├── app/
│   ├── build.gradle                          ← Gradle 构建配置
│   └── src/main/
│       ├── AndroidManifest.xml               ← 权限声明 + 组件注册
│       ├── assets/
│       │   └── floatpet_overlay.html         ← 悬浮窗 WebView UI（桌宠皮肤）
│       └── java/com/beeper/floatpet/
│           ├── MainActivity.java             ← 设置中心 Activity
│           ├── FloatingWindowService.java    ← 核心悬浮窗 + AI 服务
│           ├── ScreenshotActivity.java       ← 透明 Activity，触发截屏授权
│           └── BootReceiver.java             ← 开机自启
```

---

## 核心技术原理

| 功能 | 技术实现 |
|------|----------|
| 悬浮在所有 App 上层 | `SYSTEM_ALERT_WINDOW` 权限 + `TYPE_APPLICATION_OVERLAY` 窗口 |
| 截取当前屏幕 | `MediaProjection` API → `VirtualDisplay` → `ImageReader` → JPEG Base64 |
| AI 视觉分析 | 截图 + 上下文文本 → OpenAI Vision / Claude / Gemini API |
| 桌宠 UI | `WebView` 加载 `floatpet_overlay.html`，原生 CSS 动画 |
| 定时触发 | `Handler.postDelayed()`，支持固定间隔或随机模式 |
| 双击触发 | `GestureDetector.onDoubleTap()` + JS Bridge |
| 拖动移位 | `WindowManager.updateViewLayout()` |
| 开机自启 | `RECEIVE_BOOT_COMPLETED` + `BootReceiver` |

---

## 快速开始

### 1. 环境要求

- **Android Studio** Hedgehog (2023.1.1) 或更新
- **JDK 11+**
- **Android SDK** API 34（`compileSdk`），最低支持 API 23（Android 6.0）

### 2. 克隆并打开项目

```bash
# 在项目根目录执行
cd android
# 用 Android Studio 打开 android/ 目录，或：
./gradlew assembleDebug
```

### 3. 配置 API Key

在 `MainActivity` 的设置界面填写：

| 字段 | 说明 | 示例 |
|------|------|------|
| **API Key** | 你的 AI 服务 API Key | `sk-...` |
| **API Endpoint** | OpenAI 兼容端点（留空用官方）| `https://api.openai.com/v1` |
| **模型** | 支持视觉的模型 | `gpt-4o` / `gemini-1.5-flash` / `claude-3-5-sonnet` |
| **人设 Prompt** | 桌宠的性格设定（选填）| `你是一只傲娇猫娘…` |
| **回复间隔** | 0 = 随机（3~15分钟），1~60 = 固定分钟 | `10` |

> **支持的 AI 服务：**
> - OpenAI（`gpt-4o`, `gpt-4o-mini`）
> - Anthropic Claude（通过兼容端点）
> - Google Gemini（`gemini-1.5-flash`, `gemini-pro-vision`）
> - 任何 OpenAI 兼容的本地/云端端点

### 4. 授权流程

启用开关后，App 会依次引导你完成两项授权：

```
① 系统弹窗：「允许 FloatPet 显示在其他应用上层」
   → 跳转到系统设置页，打开开关后返回

② 系统弹窗：「FloatPet 要开始录制您的屏幕」
   → 点击「立即开始」授权截屏
   （若拒绝，桌宠仍可运行，但仅使用时间/电量等文本上下文）
```

### 5. 使用方式

| 操作 | 效果 |
|------|------|
| 启用开关 | 桌宠出现，悬浮在屏幕上 |
| 拖动桌宠 | 自由移动位置（自动保存） |
| **双击桌宠** | 立即触发一次 AI 截屏 + 吐槽 |
| 点击通知栏「关闭桌宠」| 停止服务 |
| 间隔计时到 | 自动截屏 → AI → 气泡弹出 |

---

## 自定义桌宠皮肤

编辑 `app/src/main/assets/floatpet_overlay.html`：

- 替换 `<img id="avatar-img">` 的 `src` 为你的图片 URL 或 base64
- 修改 CSS 动画（`petBob`、`petPulse`、`ringPulse`）
- 嵌入 GIF：将 `<img>` 替换为 GIF 路径
- 嵌入 Live2D：在 HTML 中加载 Live2D Cubism SDK

---

## 数据流图

```
定时器到期 / 双击
       ↓
FloatingWindowService.triggerScan()
       ↓
WebView.evaluateJavascript("petStartScan()")  ← 扫描动画
       ↓
MediaProjection → VirtualDisplay → ImageReader
       ↓
Bitmap → JPEG → Base64
       ↓
buildContext()  ← 时间 + 电量 + 已保存的使用统计
       ↓
HTTP POST → AI Vision API
       ↓
AI 返回台词文本
       ↓
showBubble(text)  ← 气泡显示 + 震动反馈
       ↓
rescheduleTimer()  ← 下一次计划
```

---

## 权限说明

| 权限 | 用途 |
|------|------|
| `SYSTEM_ALERT_WINDOW` | 悬浮窗核心权限，允许在所有 App 上层显示 |
| `FOREGROUND_SERVICE` | 保持服务在后台持续运行 |
| `FOREGROUND_SERVICE_MEDIA_PROJECTION` | Android 14+ 要求声明截屏前台服务类型 |
| `POST_NOTIFICATIONS` | Android 13+ 显示前台服务通知 |
| `INTERNET` | 调用 AI API |
| `VIBRATE` | 气泡弹出时震动反馈 |
| `RECEIVE_BOOT_COMPLETED` | 开机自启（可在系统设置中关闭） |

> `MediaProjection` 截屏授权是**运行时弹窗**，不在 AndroidManifest 声明，每次重启后需重新授权。

---

## 构建发布版 APK

```bash
cd android
./gradlew assembleRelease
# APK 输出路径：app/build/outputs/apk/release/app-release.apk
```

> 发布前需要在 `build.gradle` 配置签名：
> ```groovy
> android {
>   signingConfigs {
>     release {
>       storeFile file("your-keystore.jks")
>       storePassword "..."
>       keyAlias "..."
>       keyPassword "..."
>     }
>   }
> }
> ```

---

## 与 Web 版（index.html）的关系

Web 版（`js/app_floatpet.js`）和 Android 原生版共享相同的**设计语言**和**AI 交互逻辑**：

| 特性 | Web 版 | Android 原生版 |
|------|--------|----------------|
| 悬浮层级 | phone 容器内 z-index | 系统级 `TYPE_APPLICATION_OVERLAY` |
| 截屏 | `html2canvas` 截取 WebView | `MediaProjection` 截取真实屏幕 |
| AI 调用 | 浏览器 `fetch` | `HttpURLConnection`（子线程） |
| 桌宠 UI | 直接 DOM | Android WebView 加载 HTML |
| 定时器 | `setTimeout` | `Handler.postDelayed` |
| 配置存储 | `localStorage` | `SharedPreferences` |

Web 版 `floatpet_overlay.html` 资产可以直接移植到 Android 版使用，只需调用 `window.AndroidBridge` 代替直接 API 调用。
