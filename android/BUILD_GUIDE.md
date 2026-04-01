# 📱 小手机 APK 构建指南

## 架构说明

```
小手机（Web App）
    │
    ├── 主 WebView（MainActivity）
    │       └── 加载 file:///android_asset/www/index.html
    │           完整运行所有功能，通过 window.AndroidBridge 调用原生
    │
    └── 系统悬浮窗服务（FloatPetService）
            └── 独立 WebView 加载 floatpet_overlay.html
                悬浮在所有 App 上层，可拖动，点击开主 App
```

---

## 一、环境准备

| 工具 | 版本要求 | 下载地址 |
|------|----------|----------|
| JDK | 17+ | https://adoptium.net |
| Android Studio | Hedgehog+ | https://developer.android.com/studio |
| Android SDK | API 34 | 通过 Android Studio SDK Manager 安装 |

> 也可只安装 **命令行工具**（不需要 Android Studio GUI）：  
> https://developer.android.com/studio#command-tools

---

## 二、一键复制 Web 资源

在 **项目根目录**（`小手机/`）双击运行：

```
android\copy_assets.bat
```

该脚本会把所有 `css/`、`js/`、`index.html`、`icon.png` 复制到：
```
android/app/src/main/assets/www/
```

> ⚠️ **每次修改 Web 代码后**，都需要重新运行此脚本再编译 APK。

---

## 三、编译 APK

### 方式一：命令行（推荐）

```bat
cd android
gradlew.bat assembleDebug
```

首次运行会自动下载 Gradle，耗时约 5~10 分钟（取决于网速）。

编译成功后 APK 路径：
```
android\app\build\outputs\apk\debug\app-debug.apk
```

### 方式二：Android Studio

1. File → Open → 选择 `android/` 文件夹
2. 等待 Gradle Sync 完成
3. Build → Build Bundle(s) / APK(s) → Build APK(s)

---

## 四、安装到手机

```bat
adb install android\app\build\outputs\apk\debug\app-debug.apk
```

或直接把 APK 文件传到手机，用文件管理器安装（需允许"安装未知来源应用"）。

---

## 五、首次运行 & 悬浮窗权限

1. 打开 App → 进入**角色设置** → 找到"桌宠"开关
2. 打开开关 → 弹出"ANDROID PERMISSIONS"仿权限弹窗
3. 点击**「允许」**
   - **普通浏览器/模拟器**：仅在 WebView 内启动桌宠动画
   - **真实安卓设备（APK）**：额外弹出系统设置页，授予 `显示在其他应用上层` 权限后，桌宠会**真正悬浮在所有 App 上层**
4. 回到主屏，最小化 App → 桌宠悬浮窗已出现 🐾

---

## 六、JS ↔ 原生 桥接 API

在 WebView 的 JS 中可以调用：

```js
// 检测是否在 APK 内
if (window.AndroidBridge) {
    // 检查悬浮窗权限
    AndroidBridge.canDrawOverlays()          // → boolean

    // 申请权限（跳转系统设置）
    AndroidBridge.requestOverlayPermission()

    // 启动 / 停止悬浮窗服务
    AndroidBridge.startFloatPet()
    AndroidBridge.stopFloatPet()

    // 查询服务是否运行
    AndroidBridge.isFloatPetRunning()        // → boolean

    // SharedPreferences KV（与 overlay WebView 共享）
    AndroidBridge.saveString(key, value)
    AndroidBridge.getString(key, defaultVal) // → string

    // 平台标识
    AndroidBridge.getPlatform()              // → "android"
}
```

权限结果回调（`requestOverlayPermission` 后自动触发）：
```js
window._onOverlayPermResult = function(granted) { ... };
```

---

## 七、悬浮窗 overlay JS 桥接

`floatpet_overlay.html` 内可调用：

```js
OverlayBridge.resize(widthDp, heightDp)   // 调整悬浮窗尺寸
OverlayBridge.openMainApp()               // 打开主 App
OverlayBridge.stopService()               // 停止悬浮窗
OverlayBridge.getSharedPref(key)          // 读 SharedPreferences
OverlayBridge.setSharedPref(key, value)   // 写 SharedPreferences
```

---

## 八、Chrome 远程调试

APK 为 **debug** 包，WebView 调试已开启。

1. 手机连接电脑（USB调试开启）
2. Chrome 打开 `chrome://inspect`
3. 找到 `app-debug` 进程 → inspect
4. 即可在 DevTools 调试主 WebView 和 overlay WebView

---

## 九、发布 Release APK

1. 在 `android/app/build.gradle` 的 `release` 块中设置签名配置
2. 执行：
   ```bat
   gradlew.bat assembleRelease
   ```
3. 关闭 WebView 调试（`MainActivity.java` 中 `setWebContentsDebuggingEnabled(false)`）

---

## 文件结构速览

```
android/
├── build.gradle                   根项目 Gradle
├── settings.gradle                模块注册
├── gradle.properties              JVM / AndroidX 配置
├── copy_assets.bat                ← 每次改 Web 代码后运行这个
├── gradle/wrapper/
│   └── gradle-wrapper.properties  Gradle 版本锁定
└── app/
    ├── build.gradle               应用模块构建配置
    ├── proguard-rules.pro         混淆规则（保护桥接方法）
    └── src/main/
        ├── AndroidManifest.xml    权限声明、组件注册
        ├── assets/www/            ← Web 资源（由脚本复制）
        │   ├── index.html         完整 Web App 入口
        │   ├── floatpet_overlay.html  悬浮窗独立页面
        │   ├── css/
        │   └── js/
        ├── java/com/beeper/floatpet/
        │   ├── MainActivity.java  全屏 WebView 主界面
        │   ├── AndroidBridge.java JS→原生桥接（注入主WebView）
        │   └── FloatPetService.java  系统级悬浮窗前台服务
        └── res/
            ├── layout/activity_main.xml
            ├── values/{strings,themes,colors}.xml
            ├── xml/network_security_config.xml
            ├── drawable/ic_launcher_foreground.xml
            └── mipmap-anydpi-v26/{ic_launcher,ic_launcher_round}.xml
