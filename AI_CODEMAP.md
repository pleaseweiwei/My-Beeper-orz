# AI_CODEMAP.md

> 用途：后续让 AI 修改这个项目时，**先读这份代码地图，再动代码**。  
> 项目类型：**单页应用（SPA）**，以 `index.html + 全局 JavaScript 函数` 为主，不是模块化打包项目。

---

## 1. 给 AI 的工作规则

在修改这个项目之前，请先遵守以下规则：

1. **先读本文件，再改代码。**
2. **先判断功能属于哪个模块，再打开对应文件。**
3. 这个项目的大量界面容器都写在 `index.html`，所以：
   - 改 UI / 弹窗 / 页面结构时，通常要同时看：
     - `index.html`
     - 对应的 `js/app_xxx.js` 或 `js/apps.js`
4. 不要一上来全局重构，优先做**局部修改**。
5. 如果功能属于某个独立 App，优先改对应的 `js/app_xxx.js`，不要无脑继续把逻辑堆进 `js/apps.js`。
6. 如果改动涉及按钮点击、弹窗开关、渲染列表、视图切换，先搜索：
   - HTML 中的 `id=`
   - HTML 中的 `onclick=`
   - JS 中的 `render` / `open` / `close` / `save` / `load` 函数
7. 如果是新功能：
   - 属于聊天主系统 → 优先放入 `js/apps.js`
   - 属于子 App → 优先放入对应 `js/app_xxx.js`
8. 这个项目依赖**脚本加载顺序**，不要随意调整 `index.html` 末尾的 `<script>` 顺序。

---

## 2. 项目结构总览

这是一个模拟手机界面的前端项目，功能集中在一个 `index.html` 中，通过多个 JS 文件驱动不同 App 和系统模块。

### 根目录结构

```text
/
├─ index.html                # 主页面，包含几乎所有视图容器、弹窗、App DOM
├─ manifest.json             # PWA 配置
├─ service-worker.js         # PWA Service Worker（缓存/离线支持）
├─ icon.png                  # 应用图标
├─ AI_CODEMAP.md             # 当前这份 AI 代码地图
├─ version.json              # 版本号配置（OTA 更新用）
├─ version.txt               # 纯文本版本号
├─ make_zip.js / make_zip.py # 打包 web_update.zip 脚本
├─ download_libs.js          # 下载第三方库到 lib/ 目录
├─ download_fonts.js         # 下载 Google Fonts 到 lib/fonts/
├─ patch_index.js            # 将 CDN 引用替换为本地 lib/ 路径
├─ 发布OTA更新.bat            # Windows 一键发布 OTA 更新脚本
├─ android/                  # Android 原生包装层（WebView + FloatPet 悬浮窗）
│  ├─ BUILD_GUIDE.md         # Android 编译指南
│  ├─ 一键编译APK.bat         # Windows 一键编译脚本
│  ├─ copy_assets.bat        # 将 web 资源复制到 assets/www/
│  ├─ build.gradle / settings.gradle / gradle.properties
│  └─ app/src/main/
│     ├─ AndroidManifest.xml
│     ├─ assets/www/          # Web 资源镜像（index.html, js/, css/, lib/）
│     │  ├─ floatpet_overlay.html  # Android 悬浮窗内嵌的 H5 页面
│     │  └─ version.txt
│     ├─ res/                 # Android 资源（图标、布局、主题等）
│     └─ java/com/beeper/floatpet/
│        ├─ MainActivity.java       # WebView 主 Activity
│        ├─ FloatPetService.java     # 系统级悬浮窗 Service
│        ├─ AndroidBridge.java       # JS ↔ Android 桥接接口
│        └─ BootReceiver.java        # 开机自启动接收器
├─ css/
│  ├─ style.css              # 主样式
│  ├─ animations.css         # 动画样式
│  ├─ base.css               # 基础样式
│  ├─ modules.css            # 模块样式
│  ├─ overrides.css          # 覆盖样式/补丁样式（末尾含 Bubble App v3.0 全量样式）
│  ├─ bubble.css             # Bubble 偶像模块专属样式
│  ├─ music.css              # 音乐播放器专属样式
│  ├─ video_call.css         # 通话界面专属样式
│  ├─ tracker.css            # 查手机(Tracker)模块专属样式
│  ├─ novel.css              # 小说 App 专属样式
│  ├─ galgame.css            # Gal 游戏模块专属样式
│  ├─ sms_phone.css          # 短信 & 电话模块共享样式
│  ├─ floatpet.css           # 悬浮宠物模块专属样式
│  ├─ nexus.css              # 羁绊星图(Nexus)模块专属样式
│  ├─ favorites.css          # 收藏夹模块专属样式
│  └─ desktop_sort.css       # 桌面图标排序模块专属样式
└─ js/
   ├─ core.js                # 基础 UI 行为
   ├─ apps.js                # 主业务中枢：聊天/设置/好友/朋友圈/AI/摘要/线下模式等
   ├─ desktop_sort.js        # 桌面图标拖拽排序模块
   ├─ app_worldbook.js       # 世界书模块
   ├─ app_bubble.js          # Bubble 模块
   ├─ app_music.js           # 音乐模块
   ├─ app_pay.js             # 钱包模块
   ├─ app_pet.js             # 电子宠物模块
   ├─ app_lovespace.js       # 情侣空间模块
   ├─ app_arcade.js          # 双人游戏模块
   ├─ app_map.js             # 地图模块
   ├─ app_live.js            # LIVE 社交模块
   ├─ app_persona.js         # User 人设生成系统模块
   ├─ app_voice_call.js      # 语音/视频通话模块
   ├─ app_memory.js          # 五维记忆引擎模块
   ├─ app_transfer.js        # 双向虚拟转账模块
   ├─ app_groupchat.js       # 群聊完整功能模块
   ├─ app_tracker.js         # 查手机模拟器模块（痕迹干预 & 蝴蝶效应）
   ├─ app_novel.js           # 小说 App（AI 生成/阅读/书架/排行榜）
   ├─ app_imagegen.js        # 图像生成双引擎（NovelAI + Pollinations）
   ├─ app_galgame.js         # Gal 游戏 / 视觉小说互动模块
   ├─ app_sms.js             # 短信 App 模拟模块
   ├─ app_phone_call.js      # 普通电话模拟模块
   ├─ app_floatpet.js        # 悬浮宠物（FloatPet）模块
   ├─ app_nexus.js           # 羁绊星图（Nexus）— 角色关系网络可视化
   ├─ app_favorites.js       # 收藏夹功能模块
   ├─ app_offline_msg.js     # 离线消息辅助函数模块
   ├─ app_pat.js             # 摸头互动模块
   └─ app_battery_notify.js  # 电量提示模块
```

---

## 2.5 根目录配置文件说明

---

### `service-worker.js`
**作用：PWA Service Worker，负责资源缓存与离线支持。**

- 监听 `install`、`activate`、`fetch` 事件
- 缓存核心静态资源（CSS / JS / 图标等）
- 离线访问时从缓存提供响应

**什么时候看：**
- 应用离线无法加载时
- 需要更新缓存策略时
- 发布新版本需要清除旧缓存时

---

### `version.json` / `version.txt`
**作用：版本号管理，用于 OTA 更新检测。**

- `version.json` — JSON 格式版本号配置
- `version.txt` — 纯文本版本号
- Android 端 `assets/www/version.txt` 与此同步

---

### 构建与发布工具

| 文件 | 作用 |
|---|---|
| `make_zip.js` / `make_zip.py` | 将 web 资源打包为 `web_update.zip`（OTA 增量更新包） |
| `download_libs.js` | 下载第三方 JS 库（如 html2canvas、mammoth 等）到 `lib/` |
| `download_fonts.js` | 下载 Google Fonts 字体文件到 `lib/fonts/` |
| `patch_index.js` | 将 index.html 中的 CDN 引用替换为本地 `lib/` 路径 |
| `发布OTA更新.bat` | Windows 一键执行：打包 zip → 上传/部署 |
| `android/copy_assets.bat` | 将 web 根目录文件复制到 `android/app/src/main/assets/www/` |
| `android/一键编译APK.bat` | Windows 一键编译 Android APK |

---

### `android/`
**作用：Android 原生包装层，WebView 主应用 + FloatPet 悬浮窗功能。**

- `MainActivity.java` — WebView 主 Activity，加载 `assets/www/index.html`
- `AndroidBridge.java` — JS ↔ Android 桥接接口（`@JavascriptInterface` 注解方法）
- `FloatPetService.java` — 系统级悬浮窗 Service，负责创建和管理悬浮宠物窗口
- `BootReceiver.java` — 开机自启动接收器
- `assets/www/` — Web 资源镜像目录（由 `copy_assets.bat` 同步）
- `assets/www/floatpet_overlay.html` — 悬浮窗内嵌的 H5 页面

**什么时候看：**
- 需要改 Android WebView 行为或 JS 桥接接口时
- 需要改 Android 悬浮窗权限或 Service 行为时
- 需要改悬浮宠物在 Android 端的展示逻辑时
- 打包发布 Android APK 时

---

## 3. 真实入口与加载顺序

### 页面入口
- **入口文件：`index.html`**

### JS 加载顺序（来自 `index.html`）
```html
<script src="js/core.js"></script>
<script src="js/apps.js"></script>
<script src="js/desktop_sort.js"></script>
<script src="js/app_worldbook.js"></script>
<script src="js/app_bubble.js"></script>
<script src="js/app_music.js"></script>
<script src="js/app_pay.js"></script>
<script src="js/app_pet.js"></script>
<script src="js/app_lovespace.js"></script>
<script src="js/app_arcade.js"></script>
<script src="js/app_map.js"></script>
<script src="js/app_live.js"></script>
<script src="js/app_persona.js"></script>
<script src="js/app_voice_call.js"></script>
<script src="js/app_memory.js"></script>
<script src="js/app_transfer.js"></script>
<script src="js/app_groupchat.js"></script>
<script src="js/app_sms.js"></script>
<script src="js/app_phone_call.js"></script>
<script src="js/app_galgame.js"></script>
<script src="js/app_tracker.js"></script>
<script src="js/app_novel.js"></script>
<script src="js/app_imagegen.js"></script>
<script src="js/app_floatpet.js"></script>
<script src="js/app_nexus.js"></script>
<script src="js/app_favorites.js"></script>
<script src="js/app_offline_msg.js"></script>
<script src="js/app_pat.js"></script>
<script src="js/app_battery_notify.js"></script>
```

### 结论
- `core.js` 是底层基础行为
- `apps.js` 是主系统中枢
- `desktop_sort.js` 是桌面图标排序（紧跟在 apps.js 之后）
- 中间的 `app_*.js` 是分模块扩展
- 后半段新增模块依赖前面的全局变量（`friendsData`、`IDB`、`appendMessage` 等）
- `app_imagegen.js` 是纯工具函数集合，挂钩到聊天气泡系统
- `app_nexus.js`、`app_favorites.js`、`app_offline_msg.js`、`app_pat.js`、`app_battery_notify.js` 在最末尾加载
- **不要随便调整顺序**，否则可能打破全局函数依赖

---

## 4. 每个文件负责什么

---

### `index.html`
**作用：整个应用的页面骨架。**

这里不只是首页，而是塞了大量完整 App 和弹窗容器，包括但不限于：

- 手机主页 / 多页桌面
- WeChat 主界面
- 聊天层
- 设置页
- 预设管理
- 聊天设置页
- 好友资料页
- 宠物 App
- 地图 App
- Love Space App
- WorldBook App
- LIVE App
- Bubble App
- Music Player
- Offline Mode
- Summary / 记忆中枢（含存档列表）
- Arcade / Game App
- Pay App
- 通话界面（视频通话主界面 + 来电遮罩 + 悬浮球）
- 群聊设置页 / 群聊各种弹窗（红包、投票、群视频、加成员）
- Tracker App（查手机）
- Novel App（小说）
- Galgame App
- SMS App（短信）
- Phone Call App（电话）
- FloatPet App（悬浮宠物）
- Nexus App（羁绊星图）
- Favorites App（收藏夹）
- 各种 modal、overlay、浮层、文件输入框

**什么时候先看它：**
- 改按钮位置/文案
- 改页面结构
- 改某个弹窗内容
- 改某个 App 容器
- 找元素 `id`
- 找 `onclick` 绑定

---

### `js/core.js`
**作用：基础 UI 行为。**

目前已确认有：
- `setVh()` — 设置视口高度 CSS 变量
- `updateClock()` — 更新时钟显示
- `toggleChat()` — 切换聊天界面

**适合放：**
- 全局基础交互
- 所有模块都会依赖的简单 UI 切换

---

### `js/apps.js`
**作用：主业务中枢，最重要的核心文件。**

这是整个项目最重的文件之一，已经包含大量系统级功能：

#### 主要功能范围
- AI 聊天主逻辑
- 好友数据管理
- 好感度 / 心声卡（Mind State）
- 主题设置 / 字体 / 壁纸 / 图标自定义
- API 设置 / 模型拉取 / provider 切换
- 预设保存与切换
- 聊天列表 / 通讯录 / 朋友圈
- 消息存档 / 历史记录
- 朋友圈评论 / AI 互动
- 弹幕系统
- 添加好友 / 删除好友 / 群聊入口
- 线下模式（Offline / Tavern）
- 聊天气泡菜单 / 转发 / 删除 / 撤回 / 重回
- 语音发送 / 录音 / 转写
- 剧情总结 / 记忆中枢
- Persona / 身份系统
- 首页可编辑信息恢复
- IDB（IndexedDB）异步存储引擎
- 各种全局存储与数据迁移
- 表情包系统
- 正则脚本系统

#### 典型函数类型
- 数据类：`loadFriendsData`、`saveFriendsData`、`loadChatHistory`、`saveMessageToHistory`
- UI 渲染类：`refreshMindCardUI`、`renderMomentsFeed`、`restoreFriendListUI`、`renderSummaryUI`
- AI 请求类：`sendMessageToAI`、`callAiForSpecialTask`、`triggerAiReactionForMoment`、`triggerAIReplyForPendingContext`
- 配置类：`initThemeSettings`、`saveAllSettings`、`fetchAndPopulateModels`、`initPersonaSystem`

**什么时候先看它：**
- 聊天功能
- AI 回复逻辑
- 好友 / 通讯录
- 朋友圈
- 设置 / 预设 / 主题
- 线下模式
- 总结记忆
- 身份切换
- 任何"全局系统功能"

**注意：**
- 这是"大总管文件"
- 改动前先搜索目标函数，确认没有同名功能散落在别的 app 文件里
- `app_groupchat.js` 会**覆写** `window.sendMessageToAI` 和 `window.appendMessage`，群聊时会劫持这两个函数

---

### `js/desktop_sort.js`
**作用：桌面图标拖拽排序模块。**

暴露为 `window.DesktopSort`（IIFE 模块模式）。  
关键 CSS：`css/desktop_sort.css`

已确认功能：
- 长按桌面图标进入编辑模式（抖动动画）
- 拖拽排序（Pointer Events 实现）
- 保存/恢复图标顺序到 localStorage
- 点击空白区域退出编辑模式

关键函数：
- `init()` — 初始化排序系统
- `enterEditMode()` / `exitEditMode()` — 进入/退出编辑模式
- `saveOrder()` / `restoreOrder()` — 持久化图标顺序
- `initSortables()` — 绑定拖拽事件

**什么时候看：**
- 改桌面图标排列逻辑
- 改长按抖动效果
- 改拖拽排序行为

---

### `js/app_worldbook.js`
**作用：世界书 / Lorebook 管理。**

已确认核心函数：
- `loadWorldBooks`、`saveWorldBooksData`、`renderShelf`、`openBookDetail`、`renderEntriesList`、`constructWorldInfoPrompt`

**负责：**
- 世界书加载、保存
- 书架视图
- 条目编辑
- 将世界书内容拼进提示词

---

### `js/app_bubble.js`
**作用：Bubble 偶像 / 粉丝经济模拟。**

已确认功能：
- 粉丝模式（追星视角）：关注爱豆、查看公开动态、私信解锁机制、粉丝商城
- 爱豆模式（偶像运营视角）：发布内容、粉丝互动、周边商品、公关危机
- 豆瓣经济系统（虚拟货币）
- AI 自动生成动态和互动内容
- 背包系统

---

### `js/app_music.js`
**作用：音乐播放器。**

已确认功能：
- 音乐数据加载/保存
- 播放列表管理
- Player UI（翻转卡片、歌词显示）
- 多源搜索（网易云等）
- 导入本地音乐/URL
- 歌词解析（LRC 格式）
- "一起听"功能（同步给 AI 好友）
- 首页 Now Playing 小组件同步

---

### `js/app_pay.js`
**作用：钱包 / 金融 / 兼职 / 股市 / 投资。**

已确认功能范围非常大，包括：
- 钱包主页、账单、零钱 / 银行卡 / 理财
- 亲密付、每月收入、兼职小游戏、模拟股市
- 小游戏：接金币、调酒师、打地鼠

**注意：`app_transfer.js` 直接读写 `payData.balance`，与本文件共享余额数据。**

---

### `js/app_pet.js`
**作用：电子宠物系统。**

已确认功能：
- 宠物状态管理（饱食度、心情、清洁度）
- 房间 / 家具系统（拖拽放置）
- 商店系统
- 宠物朋友圈
- 旅行系统
- 领养流程
- 宠物设置
- 便便清理

---

### `js/app_lovespace.js`
**作用：情侣空间 / 双人宇宙。**

已确认功能：
- 大厅与关系入口
- Journal / 手账（可自定义字体和纸张）
- 冰箱（食物保鲜倒计时）
- QA 问答
- Tasks 任务系统
- 自动事件生成
- 做饭系统（食材选择 + AI 生成菜谱）

---

### `js/app_arcade.js`
**作用：双人游乐场小游戏合集。**

包含：真心话、Emoji 同频、平行宇宙逃亡、扭蛋机、同居领地战、骰子、娃娃机（Claw）、飞行棋、抽鬼牌、翻翻乐、双人跳跃等。

---

### `js/app_map.js`
**作用：地图与地点探索。**

已确认功能：地图数据读写、地图列表、地点列表 / marker、地点编辑、角色选择、场景探索弹窗。

---

### `js/app_live.js`
**作用：LIVE 社交内容流。**

已确认功能：LIVE 数据读写、动态发布与浏览、AI 互动反馈。

---

### `js/app_persona.js`
**作用：User 人设生成系统。**

已确认功能：
- 人设档案填表（55个细分维度）
- AI 一键扩写生成设定
- 头像上传与预览
- 人设档案导入导出（TXT）
- 世界书 & 角色数据关联渲染
- 全局身份切换和加载同步

---

### `js/app_voice_call.js`
**作用：语音 & 视频通话模块。**

核心状态对象：`VideoCallState`（全局单例）

已确认功能：
- 可视化通话模式（画中画 + 真实摄像头）
- 纯文字/头像通话模式
- AI 主动发起来电（`triggerIncomingCall`）
- 来电铃声（Web Audio API 合成）
- 摄像头开关 / 前后摄切换
- TTS 语音朗读 AI 回复（Minimax TTS）
- 通话中截帧发给 AI
- 最小化为悬浮球（可拖拽）
- 挂断后自动注入聊天历史并触发 AI 感想
- 解析 AI 回复中的 `[VIDEO_CALL]` 标签触发来电

---

### `js/app_memory.js`
**作用：五维记忆引擎 v2.0 — 增强聊天上下文质量。**

> 这个文件是"记忆中间件"，不直接渲染 App 界面，而是向 `apps.js` 提供构建上下文的工具函数。

已确认功能：
- `buildTimestampedContext(history, memoryLimit)` — 带时间戳的上下文字符串
- `condenseSummaries()` — AI 压缩多段总结
- `buildLinkedMemoryContext(chatSettings)` — 跨聊天上下文注入
- `buildSituationalAwareness(chatSettings)` — 时间感知字符串
- `saveCheckpoint()` / `loadCheckpoint(cpId)` / `deleteCheckpoint(cpId)` — 存档读档
- `renderCheckpointList()` — 存档列表 UI

---

### `js/app_transfer.js`
**作用：双向虚拟转账与资产联动系统。**

暴露为 `window.TransferApp`（IIFE 模块模式）。

关键公开 API：
- `TransferApp.openTransferModal()`
- `TransferApp.confirmUserTransfer()`
- `TransferApp.userAcceptAITransfer(id)` / `userRejectAITransfer(id)`
- `TransferApp.parseAndHandleAITransfer(text)`
- `TransferApp.openLedger()`

依赖：`app_pay.js`（`payData.balance`）、`apps.js`（`saveMessageToHistory`、`appendMessage`）

---

### `js/app_groupchat.js`
**作用：群聊完整功能模块 V2.0。**

> 注意：此文件会**覆写**全局的 `window.sendMessageToAI` 和 `window.appendMessage`，群聊时劫持这两个核心函数。

已确认功能：群聊 AI 回复引擎、智能调度器、视角记忆切片、后台活跃系统、@ 艾特功能、匿名聊天模式、发红包、群投票、群视频通话、悄悄话/拉小群系统、群聊设置页、群聊线下模式。

---

### `js/app_tracker.js`
**作用：查手机模拟器 v2.0 — 痕迹干预与蝴蝶效应系统。**

暴露为 `window.TrackerApp`（IIFE 模块模式）。  
关键 CSS：`css/tracker.css`  
关键容器 ID：`trackerApp`

#### 功能流程
1. **角色选择**（从 `friendsData` 加载可选角色列表）
2. **场景抽卡**（随机从4个场景中抽取：洗澡/睡觉/出门/开会，每个场景有倒计时窗口）
3. **锁屏解锁**（PIN码/面容识别，PIN 由 `generateAndSaveCharPin()` 预生成并存 localStorage）
4. **手机桌面**（倒计时压力、仿 iOS 桌面、11个 App 图标）
5. **AI 一次性生成全量手机数据**（单次 API 调用，生成包含11个模块的完整 JSON）
6. **各 App 渲染**：消息、日记、浏览器、钱包、足迹、日历、购物车、相册、音乐、保险箱、废纸篓
7. **篡改工具栏**：每个 App 内均有上下文操作按钮

#### 蝴蝶效应机制
- 所有篡改操作通过 `addTamperLog(msg)` 记录到 `state.tamperLog`
- 关闭 App 时调用 `injectTamperContext()`，将日志写入 `localStorage` 的 `tr_pending_context`
- `apps.js` 的 `triggerAIReplyForPendingContext()` 会消费此队列，在下次聊天时让 AI 根据这些事件做出剧情反应

---

### `js/app_novel.js`
**作用：小说 App — AI 生成 / 阅读 / 书架 / 排行榜。**

暴露为 `window.NovelApp`（IIFE 模块模式），通过 MutationObserver 在容器 `open` 时自动 `init()`。  
关键 CSS：`css/novel.css`  
关键容器 ID：`novelApp`

#### 四栏底部 Tab 结构
| Tab | 功能 |
|---|---|
| 论坛 | 所有 AI 生成的书、按热度排序、类型筛选、AI 生成面板 |
| 书架 | 收藏的书 + 导入的 TXT |
| 排行榜 | 全部书按热度排名、AI 编辑点评 |
| 我的 | 用户主页、作品数、粉丝数、作者工坊（大纲扩写 + 发布章节） |

#### AI 生成流程
1. 选择角色（可多选，从 `friendsData` 读取）
2. 选择题材（10种类型）
3. 随机摇梗（从 `TROPE_POOL` 抽取灵感碎片）
4. 选择生成章数（1/2/3/5章）
5. 逐章调用 API 生成

#### 社交联动
- 分享给微信角色（`shareToWeChat`）：发送小说卡片气泡，AI 角色发送读后感

---

### `js/app_imagegen.js`
**作用：图像生成双引擎模块（NovelAI + Pollinations Flux）。**

> 这个文件**没有专属 App 容器**，是工具函数集合，挂钩到聊天气泡系统。

#### 双引擎
| 引擎 | 函数 | 特点 |
|---|---|---|
| NovelAI (NAI) | `generateImageNai()` | 需要 NAI API Key；支持 V3/V4/V4.5 |
| Pollinations | `generateImagePollinations()` | 免费；支持 flux 等模型 |

#### 与聊天系统的挂钩
AI 回复中嵌入 `[NAIIMAG:prompt]`、`[REALIMAG:prompt]` 等格式触发自动生图。  
通过 `window.processImagegenFromAIReply(rawReply, chatId)` 被 `apps.js` 调用。

---

### `js/app_galgame.js`
**作用：Gal 游戏 / 视觉小说风格互动模块。**

关键 CSS：`css/galgame.css`  
关键容器 ID：`galgameApp`

已确认功能：
- 大厅/存档/角色选择界面
- 多角色选择（从 `friendsData` 读取）
- AI 生成世界观 + 手动输入
- 对话演出系统（立绘 + 对话框 + 旁白 + 分支选项）
- 好感度实时显示
- 背景图预设 / 自定义
- 存档/读档系统（多存档槽位）
- 立绘上传与缩放
- Bad End 演出

关键函数：
- `openGalgameApp()` / `closeGalgameApp()` — 开关
- `startGalgame()` — 开始游戏（调用 AI 生成第一段剧情）
- `playNextGalDialogue()` — 推进下一段对话
- `handleOptionClick(option)` — 处理玩家选择
- `saveGalgame()` / `loadGalgame()` — 存档读档

---

### `js/app_sms.js`
**作用：短信 App 模拟模块。**

暴露为 `window.SmsApp`（IIFE 模块模式）。  
关键 CSS：`css/sms_phone.css`（与电话模块共享）  
关键容器 ID：`smsApp`

已确认功能：
- 短信列表 / 对话详情界面
- 系统短信自动生成（验证码、运营商通知等）
- AI 对话短信（角色之间通过短信 AI 聊天）
- 陌生人短信注入（`injectStrangerSMS`）
- 被拉黑好友的骚扰短信（`triggerBlockedHarassment`）
- 短信通知 Toast
- AI 回复中 `[SMS:...]` 标签触发短信（`checkForSMSTrigger`）

关键函数：
- `SmsApp.open()` / `SmsApp.close()` — 开关
- `SmsApp.addSystemNotif(type, options)` — 添加系统通知短信
- `SmsApp.injectStrangerSMS(fromName, number, message, chatId)` — 注入陌生人短信
- `SmsApp.checkForSMSTrigger(aiReply, chatId)` — 检查 AI 回复中的短信触发指令

---

### `js/app_phone_call.js`
**作用：普通电话（拨号盘/通话记录/AI语音通话）模拟模块。**

暴露为 `window.PhoneCallApp`（IIFE 模块模式）。  
关键 CSS：`css/sms_phone.css`（与短信模块共享）  
关键容器 ID：`phoneApp`（拨号盘主界面）、`phoneIncomingOverlay`（来电遮罩）、`phoneCallView`（通话中界面）、`phoneTranscriptPage`（通话记录详情）

> 注意：与 `app_voice_call.js` 不同，本模块是**轻量文字通话 + 拨号盘 UI**，`app_voice_call.js` 是带摄像头/视频的全功能通话。

已确认功能：
- 拨号盘界面 + 通话记录列表
- AI 来电（`triggerIncomingCall`）+ 来电铃声
- 通话中文字对话（类电话交谈风格 AI 对话）
- Jump Scare 来电（`jumpScare`，延迟突然来电）
- TTS 语音朗读
- 静音 / 免提 / TTS 开关
- 通话记录保存与查看
- 通话文字记录页面
- AI 回复中 `[PHONE_CALL]` 标签触发来电（`checkForPhoneCallRequest`）

关键函数：
- `PhoneCallApp.openDialer()` / `PhoneCallApp.closeDialer()` — 打开/关闭拨号盘
- `PhoneCallApp.triggerIncomingCall(chatId, number)` — 触发来电
- `PhoneCallApp.callByFriendId(chatId)` — 主动拨打
- `PhoneCallApp.jumpScare(chatId, delayMs)` — Jump Scare 来电
- `PhoneCallApp.checkForPhoneCallRequest(aiReply, chatId)` — 检查 AI 回复中的来电触发

---

### `js/app_floatpet.js`
**作用：悬浮宠物（FloatPet）模块 — 屏幕上的智能宠物伴侣。**

暴露为 `window.FloatPetApp`（IIFE 模块模式）。  
关键 CSS：`css/floatpet.css`  
关联 Android：`android/app/src/main/java/com/beeper/floatpet/FloatPetService.java`、`assets/www/floatpet_overlay.html`

已确认功能：
- 可拖拽悬浮宠物（Pointer Events）
- 多种外观风格（Emoji / 自定义图片 / GIF / Live2D / 网页视图）
- 自动漫步行为（随机游走 + 边缘吸附）
- 定时观察模式（截屏/读取屏幕文本 → AI 生成吐槽/观察）
- 思考气泡 + 多段文字轮播
- 闪光 / 扫描线动画效果
- Android 悬浮窗支持（通过 `AndroidBridge` 通信）
- 角色同步（跟随当前聊天角色切换外观和人设）
- IndexedDB 持久化配置

关键函数：
- `FloatPetApp.onToggle(checkbox)` — 总开关
- `FloatPetApp.triggerObserve(manual)` — 手动触发观察
- `FloatPetApp.syncToSettings(charId)` — 同步角色设置
- `FloatPetApp.setStyle(val)` — 切换外观风格

---

### `js/app_nexus.js` ⭐ 新增
**作用：羁绊星图（NEXUS）— 角色关系网络可视化与 NPC 造物熔炉。**

暴露为 `window.NexusApp`（IIFE 模块模式）。  
关键 CSS：`css/nexus.css`  
关键容器 ID：`nexusApp`

#### 功能概览
- **力导向关系图**：以"我"为中心，AI好友/NPC 为节点，关系线连接，支持拖拽/缩放/平移
- **造物熔炉**：3步骤 NPC 生成面板（选择世界书+人设基底 → 输入生成要求 → AI生成/本地生成）
- **双向羁绊定义**：节点间可定义关系标签、双视角描述（"Ta眼中的我" / "我眼中的Ta"）、张力值
- **环形操作菜单**：点击节点弹出聊天/连线/编辑/删除操作
- **档案面板**：查看/编辑角色的好感度、标签、人设补充、关系拓扑
- **好友自动同步**：从 `friendsData` 自动同步已有好友到星图
- **群组检测**：三角关系自动提示创建群聊
- **星空背景动画**：Canvas 绘制星空 + 雪花粒子 + 水晶雪花
- **系统提示词注入**：`getNexusSystemPrompt(npcId)` 为 NPC 生成完整的关系感知提示词

#### 数据存储
- 节点数据 key：`nexus_nodes__${personaId}`
- 连线数据 key：`nexus_links__${personaId}`
- 按当前人设 ID 隔离数据

#### 关键函数
- `NexusApp.open()` / `NexusApp.close()` — 打开/关闭星图
- `NexusApp.getNexusSystemPrompt(npcId)` — 获取 NPC 的羁绊感知系统提示词
- `NexusApp.getPersonaForNPC(id)` — 获取 NPC 角色数据
- `NexusApp.syncFriends()` — 同步好友列表到星图

#### 依赖
- `apps.js`：`friendsData`、`personasMeta`、`currentPersonaId`、`openChatDetail`、`callAI`
- `app_worldbook.js`：`worldBooks`
- `app_groupchat.js`：`AppGroupChat.open()`

**什么时候看：**
- 改角色关系图可视化
- 改 NPC 生成（造物熔炉）逻辑
- 改羁绊定义和双视角系统
- 改节点操作菜单
- 改星图数据结构

---

### `js/app_favorites.js` ⭐ 新增
**作用：收藏夹功能模块 — 跨聊天/朋友圈的内容收藏管理。**

暴露为 `window.FavoritesApp`（IIFE 模块模式）。  
关键 CSS：`css/favorites.css`  
关键容器 ID：`favoritesApp`

#### 功能概览
- **收藏来源 A — 聊天多选**：在聊天中勾选消息后点"收藏"，批量保存到收藏夹
- **收藏来源 B — 朋友圈星标**：在朋友圈动态卡片上点星星图标，一键收藏动态（含图片、评论、点赞数）
- **收藏列表渲染**：卡片式展示，按保存时间倒序，显示作者头像/名字/来源标签/时间
- **内容类型支持**：普通文本、表情包、语音消息、转账消息、AI描述图（文字图）、动态含图片
- **搜索功能**：关键词搜索收藏内容和作者名
- **编辑模式**：多选删除
- **作者信息实时解析**：渲染时从 `friendsData` 实时查询最新名字和头像

#### 数据存储
- 存储 key：`myCoolPhone_favorites`（JSON 数组）

#### 关键函数
- `FavoritesApp.open()` / `FavoritesApp.close()` — 打开/关闭收藏夹
- `FavoritesApp.addFromChat()` — 从聊天多选中添加收藏
- `FavoritesApp.toggleMomentFavorite(momentId)` — 切换朋友圈动态收藏状态
- `FavoritesApp.isMomentFavorited(momentId)` — 检查是否已收藏
- `FavoritesApp.revealImageDesc(encoded)` — 弹窗显示文字图描述

#### 依赖
- `apps.js`：`friendsData`、`momentsFeed`、`currentChatId`、`personasMeta`、`currentPersonaId`、`showToast`、`allStickers`

**什么时候看：**
- 改收藏夹 UI 或卡片样式
- 改收藏触发逻辑（聊天多选/朋友圈星标）
- 改收藏内容的渲染方式

---

### `js/app_offline_msg.js` ⭐ 新增
**作用：离线消息辅助函数模块 — 为离线模式提供世界书注入和 UI 更新工具。**

> 这是一个小型辅助模块，不含独立 App 界面。

已确认函数：
- `_offmsg_getWorldbookText(friend)` — 获取好友关联的世界书文本（供离线消息 AI 使用）
- `_offmsg_refreshBadge(friendId)` — 刷新好友列表的未读角标
- `_offmsg_refreshChatListItem(friendId, lastText)` — 更新聊天列表项的最后消息预览

**什么时候看：**
- 改离线消息的世界书上下文注入
- 改离线消息的未读角标逻辑

---

### `js/app_pat.js` ⭐ 新增
**作用：摸头互动模块 — 模拟摸头/拍头的触觉互动。**

暴露为 `window.PatApp`（IIFE 模块模式）。

已确认功能：
- 打开摸头弹窗（`openPatModal`）
- 确认摸头操作（`confirmPat`）— 发送摸头消息到聊天
- 用户摸头（`doUserPat`）— 附加后缀描述
- 屏幕震动效果（`shakeScreen`）
- 摸头通知显示（`appendPatNotice`）
- AI 回复中摸头指令解析（`parseAndHandleAIPat`）— AI 也可以反向摸头用户

关键函数：
- `PatApp.openPatModal(chatId)` — 打开摸头交互界面
- `PatApp.parseAndHandleAIPat(text, chatId)` — 解析 AI 回复中的摸头指令

**什么时候看：**
- 改摸头互动的 UI 或动画
- 改 AI 摸头触发逻辑

---

## 5. 改功能时先看哪个文件

---

### A. 聊天主系统 / AI 回复 / 微信界面
先看：`index.html`、`js/apps.js`  
搜索：`wechatApp`、`chatLayer`、`chatMessages`、`sendMessageToAI`

---

### B. 好友 / 通讯录 / 添加好友
先看：`index.html`、`js/apps.js`  
搜索：`contacts-list-container`、`add-friend-modal`、`loadFriendsData`

---

### C. 群聊
先看：`index.html`、`js/app_groupchat.js`  
搜索：`groupsData`、`groupSettingsPage`、`sendGroupMessageToAI`  
> **注意：** `app_groupchat.js` 覆写了 `window.sendMessageToAI`

---

### D. 朋友圈 / Moments
先看：`index.html`、`js/apps.js`  
搜索：`moments-feed-list`、`renderMomentsFeed`、`triggerAiReactionForMoment`

---

### E. 设置 / API / 模型 / 主题 / 预设
先看：`index.html`、`js/apps.js`  
搜索：`settingsView`、`initThemeSettings`、`saveAllSettings`、`fetchAndPopulateModels`

---

### F. 世界书
先看：`index.html`、`js/app_worldbook.js`  
搜索：`worldBookApp`、`renderShelf`、`constructWorldInfoPrompt`

---

### G. Bubble
先看：`index.html`、`js/app_bubble.js`  
搜索：`bubbleApp`、`bb-idol-view`、`bbRenderLanding`

---

### H. 音乐播放器
先看：`index.html`、`js/app_music.js`  
搜索：`musicPlayerView`、`renderPlaylist`、`openMusicPlayer`

---

### I. 钱包 / 理财 / 股市 / 打工
先看：`index.html`、`js/app_pay.js`  
搜索：`payApp`、`renderPayMainPage`、`initStockMarket`

---

### J. 虚拟转账
先看：`js/app_transfer.js`、`js/app_pay.js`（余额数据）  
搜索：`TransferApp`、`openTransferModal`、`appendTransferBubble`、`[TRANSFER:`

---

### K. 宠物
先看：`index.html`、`js/app_pet.js`  
搜索：`petApp`、`pet-room-stage`、`loadPetData`

---

### L. Love Space / 双人宇宙
先看：`index.html`、`js/app_lovespace.js`  
搜索：`loveSpaceApp`、`ls2-lobby-view`、`renderLs2Journal`

---

### M. 地图
先看：`index.html`、`js/app_map.js`  
搜索：`mapApp`、`renderMapList`、`openSceneModal`

---

### N. LIVE
先看：`index.html`、`js/app_live.js`  
搜索：`liveApp`、`live-tab-discover`、`renderLiveUI`

---

### O. Arcade 小游戏
先看：`index.html`、`js/app_arcade.js`  
搜索：`gameApp`、`gc-view-lobby`、`g1_` ~ `g11_`

---

### P. 线下模式 / Tavern 风格聊天
先看：`index.html`、`js/apps.js`  
搜索：`offlineModeView`、`offline-log-container`、`renderOfflineHistory`

---

### Q. 剧情总结 / 记忆中枢 / 存档读档
先看：`index.html`、`js/apps.js`（总结触发）、`js/app_memory.js`（存档/上下文构建）  
搜索：`summaryPageView`、`saveCheckpoint`、`buildTimestampedContext`

---

### R. 身份系统与人设生成器
先看：`index.html`、`js/apps.js`、`js/app_persona.js`  
搜索：`identity-modal`、`personaBuilderApp`、`PB_KEYS`

---

### S. 语音/视频通话
先看：`index.html`、`js/app_voice_call.js`  
搜索：`video-call-view`、`startVideoCall`、`triggerIncomingCall`、`VideoCallState`

---

### T. 查手机（Tracker）
先看：`index.html`、`js/app_tracker.js`  
搜索：`trackerApp`、`TrackerApp`、`tr-view-select`、`tr-view-lock`、`tr-view-desktop`

---

### U. 小说 App（Novel）
先看：`index.html`、`js/app_novel.js`  
搜索：`novelApp`、`NovelApp`、`novel-tab-forum`、`novel-fullreader`

---

### V. 图像生成（ImageGen）
先看：`js/app_imagegen.js`（无专属容器，挂钩到聊天系统）  
搜索：`processImagegenFromAIReply`、`parseAndHandleImageCommands`、`generateImages`

---

### W. Gal 游戏
先看：`index.html`、`js/app_galgame.js`  
搜索：`galgameApp`、`openGalgameApp`、`startGalgame`

---

### X. 短信 App
先看：`index.html`、`js/app_sms.js`  
搜索：`smsApp`、`SmsApp`、`checkForSMSTrigger`

---

### Y. 电话 App
先看：`index.html`、`js/app_phone_call.js`  
搜索：`phoneApp`、`PhoneCallApp`、`openDialer`、`checkForPhoneCallRequest`

---

### Z. 悬浮宠物（FloatPet）
先看：`index.html`、`js/app_floatpet.js`  
如需改 Android 端：`android/app/src/main/java/com/beeper/floatpet/`  
搜索：`FloatPetApp`、`floatpet`

---

### AA. 羁绊星图（Nexus） ⭐ 新增
先看：`index.html`、`js/app_nexus.js`  
搜索：`nexusApp`、`NexusApp`、`nexus-world`、`nexus-forge-panel`

关键词：
- `nexus-node-` — 节点 DOM 元素前缀
- `nexus-action-ring` — 环形操作菜单
- `nexus-profile-sheet` — 角色档案面板
- `nexus-connect-modal` — 羁绊定义弹窗
- `nexus-forge-panel` — 造物熔炉面板

---

### BB. 收藏夹（Favorites） ⭐ 新增
先看：`index.html`、`js/app_favorites.js`  
搜索：`favoritesApp`、`FavoritesApp`、`fav-content`、`moment-fav-star`

---

### CC. 桌面图标排序 ⭐ 新增
先看：`index.html`、`js/desktop_sort.js`  
搜索：`DesktopSort`、`desktop-sort`

---

### DD. 摸头互动 ⭐ 新增
先看：`js/app_pat.js`  
搜索：`PatApp`、`openPatModal`、`parseAndHandleAIPat`

---

### EE. 电量状态提示 ⭐ 新增
先看：`js/app_battery_notify.js`
搜索：`triggerBatteryNotification`、`showBatteryBanner`
作用：当手机电量变化时，通过调用 AI 接口生成符合当前设定角色的吐槽或提示横幅。

---

## 6. `index.html` 中的重要 App 容器 ID

| 功能 | 关键容器 ID |
|---|---|
| 微信主应用 | `wechatApp` |
| 聊天层 | `chatLayer` |
| 设置页 | `settingsView` |
| 聊天设置页 | `chatSettingsPage` |
| 好友资料页 | `contactProfilePage` |
| 宠物 | `petApp` |
| 地图 | `mapApp` |
| Love Space | `loveSpaceApp` |
| WorldBook | `worldBookApp` |
| LIVE | `liveApp` |
| Bubble | `bubbleApp` |
| Music Player | `musicPlayerView` |
| Offline Mode | `offlineModeView` |
| Summary / 记忆中枢 | `summaryPageView` |
| 存档列表（在记忆中枢内） | `checkpoint-list-container` |
| Arcade | `gameApp` |
| Pay | `payApp` |
| User 人设生成器 | `personaBuilderApp` |
| 表情包管理中枢 | `stickerManagerPage` |
| 通话主界面 | `video-call-view` |
| 来电遮罩层 | `incoming-call-overlay` |
| 通话悬浮球 | `vc-floating-bubble` |
| 群聊设置页 | `groupSettingsPage` |
| 群聊加成员弹窗 | `group-add-member-modal` |
| 群红包弹窗 | `group-redpacket-modal` |
| 群投票弹窗 | `group-vote-modal` |
| 群视频通话弹窗 | `group-video-call-modal` |
| 查手机 App | `trackerApp` |
| 小说 App | `novelApp` |
| Gal 游戏 App | `galgameApp` |
| 短信 App | `smsApp` |
| 电话 App（拨号盘） | `phoneApp` |
| 电话来电遮罩 | `phoneIncomingOverlay` |
| 电话通话中界面 | `phoneCallView` |
| 电话通话记录详情 | `phoneTranscriptPage` |
| 悬浮宠物设置（在设置页内） | FloatPet DOM 由 JS 动态生成 |
| 羁绊星图 App | `nexusApp` |
| 收藏夹 App | `favoritesApp` |
| 图像生成测试弹窗 | `imagegen-test-modal` |
| 图像全屏查看 | `imagegen-fullscreen-overlay` |

---

## 7. CSS 文件怎么理解

| 文件 | 用途 |
|---|---|
| `css/style.css` | 主样式，大部分视觉都可能在这里 |
| `css/animations.css` | 动画和过渡效果 |
| `css/base.css` | 基础样式、通用 reset / 基础变量类样式 |
| `css/modules.css` | 分模块组件样式 |
| `css/overrides.css` | 覆盖/补丁性质样式（末尾含 Bubble App v3.0 全量样式） |
| `css/bubble.css` | Bubble 偶像模块专属样式 |
| `css/music.css` | 音乐播放器专属样式 |
| `css/video_call.css` | 通话界面专属样式（`.vc-*` 前缀类名） |
| `css/tracker.css` | 查手机模块专属样式（`.tr-*` 前缀类名） |
| `css/novel.css` | 小说 App 专属样式（`.novel-*` 前缀类名） |
| `css/galgame.css` | Gal 游戏模块专属样式 |
| `css/sms_phone.css` | 短信 & 电话模块共享样式 |
| `css/floatpet.css` | 悬浮宠物专属样式 |
| `css/nexus.css` | 羁绊星图专属样式（`.nexus-*` 前缀类名） |
| `css/favorites.css` | 收藏夹专属样式（`.fav-*`、`.favorite-*` 前缀类名） |
| `css/desktop_sort.css` | 桌面图标排序专属样式 |

### 改样式的建议
- 改查手机界面 → 优先看 `css/tracker.css`（`.tr-*` 前缀）
- 改小说 App → 优先看 `css/novel.css`（`.novel-*` 前缀）
- 改通话界面 → 优先看 `css/video_call.css`（`.vc-*` 前缀）
- 改 Bubble 样式 → 优先看 `css/bubble.css` 或 `css/overrides.css` 末尾
- 改音乐播放器 → 优先看 `css/music.css`
- 改短信/电话界面 → 优先看 `css/sms_phone.css`
- 改悬浮宠物 → 优先看 `css/floatpet.css`
- 改羁绊星图 → 优先看 `css/nexus.css`（`.nexus-*` 前缀）
- 改收藏夹 → 优先看 `css/favorites.css`（`.fav-*` 前缀）
- 改桌面排序 → 优先看 `css/desktop_sort.css`
- 不清楚样式来源时，先全局搜索类名/ID

---

## 8. 常见修改流程建议

### 场景 1：改某个 App 的界面
1. 先在 `index.html` 找到对应 App 容器
2. 找对应按钮 / `onclick`
3. 再打开对应 `js/app_xxx.js`
4. 找渲染函数、打开函数、保存函数
5. 最后查相关 CSS

### 场景 2：改聊天或 AI 行为
1. 先看 `js/apps.js`
2. 如果是群聊相关，看 `js/app_groupchat.js`（它覆写了 `sendMessageToAI`）
3. 如果涉及图像生成，看 `js/app_imagegen.js`

### 场景 3：改弹窗
1. 在 `index.html` 搜弹窗容器 `id`
2. 找打开函数：`openXxx`
3. 找关闭函数：`closeXxx` / `toggleXxx`
4. 找提交/保存函数：`saveXxx` / `confirmXxx`

### 场景 4：加一个新功能
先判断属于哪种：

- 聊天主系统 → `js/apps.js`
- 群聊 → `js/app_groupchat.js`
- 通话 → `js/app_voice_call.js`
- 记忆/存档/上下文 → `js/app_memory.js`
- 转账 → `js/app_transfer.js`
- 世界书 → `js/app_worldbook.js`
- 查手机 → `js/app_tracker.js`
- 小说 → `js/app_novel.js`
- 图像生成 → `js/app_imagegen.js`
- Gal 游戏 → `js/app_galgame.js`
- 短信 → `js/app_sms.js`
- 电话 → `js/app_phone_call.js`
- 悬浮宠物 → `js/app_floatpet.js`
- 羁绊星图 → `js/app_nexus.js`
- 收藏夹 → `js/app_favorites.js`
- 摸头互动 → `js/app_pat.js`
- 桌面排序 → `js/desktop_sort.js`
- LIVE → `js/app_live.js`
- 宠物 → `js/app_pet.js`
- 钱包 → `js/app_pay.js`
- 小游戏 → `js/app_arcade.js`
- 用户人设 → `js/app_persona.js`

---

## 9. 模块间关键依赖关系

| 文件 | 依赖 / 覆写关系 |
|---|---|
| `app_groupchat.js` | **覆写** `window.sendMessageToAI`（群聊时劫持）<br>**覆写** `window.appendMessage`（处理红包/投票卡片）<br>依赖 `apps.js` 的 `IDB`、`friendsData`、`currentChatId` |
| `app_transfer.js` | 依赖 `app_pay.js` 的 `payData.balance`、`savePayData()`<br>依赖 `apps.js` 的 `saveMessageToHistory`、`appendMessage` |
| `app_memory.js` | 依赖 `apps.js` 的 `IDB`、`friendsData`、`loadChatHistory`<br>暴露工具函数供 `apps.js` 调用 |
| `app_voice_call.js` | 依赖 `apps.js` 的 `friendsData`、`appendMessage`、`sendMessageToAI`<br>依赖 `app_persona.js` 的 `personasMeta`、`currentPersonaId` |
| `app_tracker.js` | 依赖 `apps.js` 的 `friendsData`、`IDB`、`scopedChatKey`、`triggerAIReplyForPendingContext`<br>依赖 `app_worldbook.js` 的 `worldBooks`<br>依赖 `app_persona.js` 的 `personasMeta`、`currentPersonaId`<br>写入 `tr_pending_context`（由 `apps.js` 消费） |
| `app_novel.js` | 依赖 `apps.js` 的 `friendsData`、`appendMessage`、`saveMessageToHistory`<br>依赖 `app_persona.js` 的 `personasMeta`、`currentPersonaId`<br>依赖 `app_worldbook.js` 的 `worldBooks` |
| `app_imagegen.js` | 依赖 `apps.js` 的 `friendsData`、`currentChatId`、`appendMessage`、`saveMessageToHistory`、`IDB`<br>通过 `window.processImagegenFromAIReply` 被 `apps.js` 调用 |
| `app_nexus.js` | 依赖 `apps.js` 的 `friendsData`、`personasMeta`、`currentPersonaId`、`openChatDetail`、`callAI`<br>依赖 `app_worldbook.js` 的 `worldBooks`<br>依赖 `app_groupchat.js` 的 `AppGroupChat.open()` |
| `app_favorites.js` | 依赖 `apps.js` 的 `friendsData`、`momentsFeed`、`currentChatId`、`personasMeta`、`currentPersonaId`、`showToast`、`allStickers`<br>钩入 `renderMomentsFeed` 注入收藏星标 |
| `app_offline_msg.js` | 依赖 `apps.js` 的 `friendsData`<br>依赖 `app_worldbook.js` 的世界书数据 |
| `app_pat.js` | 依赖 `apps.js` 的聊天系统（发送消息到聊天） |
| `app_phone_call.js` | 依赖 `apps.js` 的 `friendsData`、`callAI`/`aiChat`<br>依赖 `app_persona.js` 的 `personasMeta`、`currentPersonaId` |
| `app_sms.js` | 依赖 `apps.js` 的 `friendsData`、`callAI`/`aiChat`<br>依赖 `app_persona.js` 的 `personasMeta`、`currentPersonaId` |
| `app_floatpet.js` | 依赖 `apps.js` 的 `friendsData`、`currentChatId`<br>依赖 `app_worldbook.js`、`app_persona.js`<br>使用 IndexedDB 独立存储 |
| `desktop_sort.js` | 依赖 `apps.js` 中桌面 DOM 结构已渲染完成 |

---

## 10. 对后续 AI 最重要的判断结论

### 这个项目最重要的几个事实
1. **`index.html` 非常大，是整个系统的 DOM 总装配文件**
2. **`js/apps.js` 是总业务核心**
3. **其余 `js/app_xxx.js` 是各子 App 模块**
4. **`app_groupchat.js` 会覆写全局 `sendMessageToAI` 和 `appendMessage`，群聊时行为与私聊完全不同**
5. **`app_tracker.js` 的"蝴蝶效应"通过 `tr_pending_context` 向聊天主线注入事件，由 `apps.js` 消费**
6. **`app_imagegen.js` 是工具函数集合，没有独立容器，通过钩子函数挂载到聊天气泡系统**
7. **`app_nexus.js` 的羁绊星图通过 `getNexusSystemPrompt()` 向 AI 提供关系感知上下文**
8. **`app_favorites.js` 钩入 `renderMomentsFeed` 为朋友圈注入收藏星标按钮**

### 所以修改前请先判断：
- 这是"系统级功能"还是"子 App 功能"？
- 改动是"DOM 结构"还是"业务逻辑"？
- 是只改一个模块，还是会影响多个模块？
- 如果是群聊相关，是否会与 `app_groupchat.js` 的函数覆写冲突？
- 如果涉及 AI 回复后处理，是否需要同时检查 `app_imagegen.js`、`app_sms.js`、`app_phone_call.js`、`app_pat.js` 的钩子？

---

## 11. 给后续 AI 的最短执行提示词

```text
你现在要修改这个项目，请先遵守以下规则：

1. 先阅读 AI_CODEMAP.md，再开始改代码。
2. 这个项目是 index.html + 全局 JS 的单页应用。
3. index.html 里包含大量 App 容器和弹窗，不是只有首页。
4. 聊天、设置、好友、朋友圈、线下模式、总结记忆、身份系统等核心逻辑主要在 js/apps.js。
5. 各独立 App 逻辑分别在：
   - js/app_worldbook.js      世界书
   - js/app_bubble.js         Bubble 偶像/粉丝经济
   - js/app_music.js          音乐播放器
   - js/app_pay.js            钱包/股市/打工
   - js/app_pet.js            电子宠物
   - js/app_lovespace.js      情侣空间
   - js/app_arcade.js         小游戏
   - js/app_map.js            地图探索
   - js/app_live.js           LIVE 社交流
   - js/app_persona.js        User 人设生成器
   - js/app_voice_call.js     语音/视频通话（含来电、TTS、摄像头）
   - js/app_memory.js         五维记忆引擎（存档读档、跨聊天记忆、时间感知）
   - js/app_transfer.js       双向虚拟转账（window.TransferApp）
   - js/app_groupchat.js      群聊（覆写 sendMessageToAI 和 appendMessage！）
   - js/app_tracker.js        查手机模拟器（TrackerApp，蝴蝶效应注入聊天主线）
   - js/app_novel.js          小说 App（NovelApp，AI生成/阅读/分享）
   - js/app_imagegen.js       图像生成双引擎（NAI + Pollinations，挂钩到聊天气泡）
   - js/app_galgame.js        Gal 游戏/视觉小说
   - js/app_sms.js            短信 App（SmsApp，AI短信+系统通知+陌生人注入）
   - js/app_phone_call.js     电话 App（PhoneCallApp，拨号盘+AI语音通话+JumpScare）
   - js/app_floatpet.js       悬浮宠物（FloatPetApp，含 Android 端）
   - js/app_nexus.js          羁绊星图（NexusApp，关系网络+NPC造物熔炉）
   - js/app_favorites.js      收藏夹（FavoritesApp，聊天+朋友圈收藏）
   - js/app_offline_msg.js    离线消息辅助函数
   - js/app_pat.js            摸头互动（PatApp）
   - js/app_battery_notify.js 电量提示（调用AI根据电量变化吐槽）
   - js/desktop_sort.js       桌面图标拖拽排序（DesktopSort）
6. 修改前先判断功能归属到哪个文件。
7. 涉及界面时同时检查 index.html 和对应 JS 文件。
8. 不要随便调整 script 加载顺序。
9. 优先局部修改，不要无必要重构 apps.js。
10. 改群聊相关功能前，必须先看 app_groupchat.js，它覆写了核心全局函数。
11. app_tracker.js 的蝴蝶效应通过 localStorage 的 tr_pending_context 向 apps.js 注入聊天上下文。
12. app_imagegen.js 没有独立 App 容器，是工具函数集合，由 apps.js 通过 processImagegenFromAIReply 调用。
13. app_nexus.js 的 getNexusSystemPrompt() 为 NPC 提供关系感知上下文。
14. app_favorites.js 钩入 renderMomentsFeed 注入收藏星标。
```

---

## 12. 后续维护建议

如果以后继续扩展项目，建议同步更新本文件，重点补这几类信息：

- 新增了哪个 App
- 新增了哪个关键容器 ID
- 新增了哪个核心 JS 文件
- 某个功能从 `apps.js` 拆分到了哪个新文件
- 哪些功能存在跨模块依赖
- 哪些文件覆写了全局函数（当前：`app_groupchat.js` 覆写了 `sendMessageToAI` 和 `appendMessage`）
- 哪些文件钩入了其他模块的渲染流程（当前：`app_favorites.js` 钩入 `renderMomentsFeed`）

---

## 13. 一句话版本

> **先看 `AI_CODEMAP.md` → 再判断是改 `index.html`、`js/apps.js`，还是某个 `js/app_xxx.js`。群聊必看 `app_groupchat.js`（覆写全局函数）；查手机改 `app_tracker.js`；小说改 `app_novel.js`；图像生成改 `app_imagegen.js`（无独立容器）；羁绊星图改 `app_nexus.js`；收藏夹改 `app_favorites.js`；电话改 `app_phone_call.js`；短信改 `app_sms.js`。**
