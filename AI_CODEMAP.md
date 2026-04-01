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
├─ android/                  # Android 原生悬浮窗包装层（FloatPet 用）
│  ├─ README.md
│  └─ app/src/main/
│     ├─ AndroidManifest.xml
│     ├─ assets/floatpet_overlay.html   # Android 悬浮窗内嵌的 H5 页面
│     └─ java/com/beeper/floatpet/
│        ├─ MainActivity.java
│        ├─ FloatingWindowService.java
│        ├─ ScreenshotActivity.java
│        └─ BootReceiver.java
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
│  ├─ sms_phone.css          # 短信 & 电话模块专属样式
│  └─ floatpet.css           # 悬浮宠物模块专属样式
└─ js/
   ├─ core.js                # 基础 UI 行为
   ├─ apps.js                # 主业务中枢：聊天/设置/好友/朋友圈/AI/摘要/线下模式等
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
   └─ app_floatpet.js        # 悬浮宠物（FloatPet）模块
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

> **历史备注：** 项目曾使用过三个一次性维护脚本（`_fix_groupchat.js`、`fix_bubble.py`、`add_bubble_css.py`），均已执行完毕后删除。其中 `add_bubble_css.py` 将 Bubble App v3.0 全量样式注入了 `css/overrides.css` 末尾，如需修改 Bubble 样式，直接编辑 `css/overrides.css` 末尾或 `css/bubble.css` 即可。

---

### `android/`
**作用：Android 原生包装层，专门用于 FloatPet 悬浮窗功能。**

- `FloatingWindowService.java` — 系统级悬浮窗 Service，负责创建和管理悬浮宠物窗口
- `MainActivity.java` — 启动入口，请求悬浮窗权限并启动 Service
- `ScreenshotActivity.java` — 截图辅助 Activity
- `BootReceiver.java` — 开机自启动接收器
- `assets/floatpet_overlay.html` — 悬浮窗内嵌的 H5 前端页面（对应 `js/app_floatpet.js` 的前端逻辑）

**什么时候看：**
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
```

### 结论
- `core.js` 是底层基础行为
- `apps.js` 是主系统中枢
- 中间的 `app_*.js` 是分模块扩展
- 后半段新增模块（`app_sms.js` 起）依赖前面的全局变量（`friendsData`、`IDB`、`appendMessage` 等）
- `app_imagegen.js` 是纯工具函数集合，挂钩到聊天气泡系统
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
- `updateClock()`
- `toggleChat()`

**适合放：**
- 全局基础交互
- 所有模块都会依赖的简单 UI 切换

**不适合放：**
- 复杂业务逻辑
- 某个独立 App 的专属逻辑

---

### `js/apps.js`
**作用：主业务中枢，最重要的核心文件。**

这是整个项目最重的文件之一，已经包含大量系统级功能：

#### 主要功能范围
- AI 聊天主逻辑
- 好友数据管理
- 好感度 / 心声卡
- 主题设置 / 字体 / 壁纸 / 图标自定义
- API 设置 / 模型拉取 / provider 切换
- 预设保存与切换
- 聊天列表 / 通讯录 / 朋友圈
- 消息存档 / 历史记录
- 朋友圈评论 / AI 互动
- 弹幕
- 添加好友 / 删除好友 / 群聊入口
- 线下模式（Offline / Tavern）
- 聊天气泡菜单 / 转发 / 删除 / 撤回 / 重回
- 语音发送 / 录音 / 转写
- 剧情总结 / 记忆中枢
- Persona / 身份系统
- 首页可编辑信息恢复
- 各种全局存储与数据迁移

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

### `js/app_worldbook.js`
**作用：世界书 / Lorebook 管理。**

已确认核心函数：
- `loadWorldBooks`、`saveWorldBooksData`、`renderShelf`、`openBookDetail`、`renderEntriesList`、`constructWorldInfoPrompt`

**负责：**
- 世界书加载、保存
- 书架视图
- 条目编辑
- 将世界书内容拼进提示词

**什么时候看：**
- 改世界书 UI
- 改世界书导入导出
- 改关键词注入逻辑
- 改 AI 使用世界书的方式

---

### `js/app_bubble.js`
**作用：Bubble 偶像 / 粉丝模式。**

已确认功能：
- 爱豆发消息历史
- AI 粉丝反应
- 路人评论生成
- Bubble 评论区渲染
- Bubble 数据读写

**什么时候看：**
- 改 Bubble 爱豆模式
- 改 Bubble 粉丝模式
- 改评论流 / 路人回复 / 偶像广播

---

### `js/app_music.js`
**作用：音乐播放器。**

已确认功能：
- 音乐数据加载/保存
- 播放列表
- Player UI
- 首页音乐组件同步

**什么时候看：**
- 改音乐播放器
- 改导入音乐
- 改首页 Now Playing 小组件

---

### `js/app_pay.js`
**作用：钱包 / 金融 / 兼职 / 股市 / 投资。**

已确认功能范围非常大，包括：
- 钱包主页、账单、零钱 / 银行卡 / 理财
- 亲密付、每月收入、兼职小游戏、模拟股市、顶流造星企划

典型函数：
- `loadPayData`、`savePayData`、`renderPayMainPage`、`renderYuebaoPage`、`renderCareerPage`
- `startJobTimer`、`initStockMarket`、`generateNewMarket`

**注意：`app_transfer.js` 直接读写 `payData.balance`，与本文件共享余额数据。**

---

### `js/app_pet.js`
**作用：电子宠物系统。**

已确认功能：
- 宠物状态、房间 / 家具、拖拽、商店、宠物朋友圈、旅行、领养流程、宠物设置

---

### `js/app_lovespace.js`
**作用：情侣空间 / 双人宇宙。**

已确认功能：
- 大厅与关系入口、Journal / 手账、冰箱、QA、Tasks、自动事件、绑定关系

---

### `js/app_arcade.js`
**作用：双人游乐场小游戏合集。**

包含：真心话、Emoji 同频、平行宇宙逃亡、扭蛋机、同居领地战、骰子、娃娃机、飞行棋、抽鬼牌、翻翻乐、双人跳跃等。

---

### `js/app_map.js`
**作用：地图与地点探索。**

已确认功能：地图数据读写、地图列表、地点列表 / marker、地点编辑、角色选择、场景探索弹窗。

---

### `js/app_live.js`
**作用：LIVE 社交内容流。**

已确认功能：LIVE 数据读写、Discover / Friends / Messages / Me 等页面、发布动态、AI 互动反馈。

---

### `js/app_persona.js`
**作用：User 人设生成系统 (无 Tab 滚动填表 + 灵动魔法动画版)。**

已确认功能：
- 人设档案填表 (55个细分维度)
- AI 一键扩写生成设定
- 头像上传与预览
- 人设档案导入导出 (TXT)
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

**关键全局函数：**
- `startVideoCall(chatId, type, members)`
- `triggerIncomingCall(chatId)`
- `acceptIncomingCall()` / `rejectIncomingCall()`
- `endVideoCall()`
- `openVideoCallFromChat()`
- `checkForVideoCallRequest(replyText, chatId)`

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

已确认功能：群聊 AI 回复引擎、智能调度器、视角记忆切片、后台活跃系统、@ 艾特功能、匿名聊天模式、发红包、群投票、群视频通话、悄悄话/拉小群系统、群聊设置页。

---

### `js/app_tracker.js` ⭐ 新增
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

#### 核心篡改操作（影响主线剧情）
| 操作 | 函数 | 注入上下文说明 |
|---|---|---|
| 改备注名 | `changeRemark()` | 将变更注入 `tamperLog` |
| 代TA给联系人发消息 | `sendContactReply(idx)` | 注入"冒充发消息"上下文 |
| 拉黑联系人 | `blockContact(idx)` | 注入"帮TA拉黑"上下文 |
| 用TA手机给自己发消息 | `sendMsgToSelf()` → `_doSendToSelf()` | 注入"偷发消息"上下文 |
| 写日记批注 | `addDiaryAnnotation(idx)` | 注入"翻日记写批注"上下文 |
| 设恶搞闹钟 | `setPrankAlarm()` | 注入"设闹钟"上下文 |
| 帮TA下单 | `checkoutItem(idx)` / `checkoutAll()` | 注入"下单"上下文 |
| 清空购物车 | `clearCart()` | 注入"清空购物车"上下文 |

#### 蝴蝶效应机制
- 所有篡改操作通过 `addTamperLog(msg)` 记录到 `state.tamperLog`
- 关闭 App 时调用 `injectTamperContext()`，将日志写入 `localStorage` 的 `tr_pending_context`
- `apps.js` 的 `triggerAIReplyForPendingContext()` 会消费此队列，在下次聊天时让 AI 根据这些事件做出剧情反应

#### 联系人聊天子系统
- `openContactChat(idx, contact)` — 在消息 App 内打开微信风格的聊天面板
- `generateContactChatHistory(idx, contact)` — AI 生成或从缓存读取聊天历史（6-10条）
- `generateAutoReply(idx)` — 对方自动 AI 回复（发消息后约1.5-3.5秒触发）
- `buildFallbackConversation(charName, contact)` — API 失败时的本地 fallback 对话

#### 数据缓存
- 手机数据缓存 key：`tr_phonedata__${personaId}__${charId}`
- PIN 码存储 key：`tr_pin_${charId}`
- 壁纸存储 key：`tr_wallpaper_${charKey}`
- 每次进入手机会清除旧缓存，强制重新生成

#### 关键全局函数
- `TrackerApp.open()` — 打开 App（从桌面图标或 dock 触发）
- `TrackerApp.close()` — 关闭并触发蝴蝶效应注入
- `generateAndSaveCharPin()` — 全局函数，在聊天设置页为角色预生成手机密码
- `_injectPinAwareness(charId, pin, hint)` — 将 PIN 写入角色上下文数据

**什么时候看：**
- 改查手机流程（角色选择/场景/锁屏/桌面）
- 改 AI 生成手机数据的 prompt 结构
- 改篡改操作的种类和上下文注入内容
- 改联系人聊天子系统
- 改 PIN 码生成和存储逻辑
- 改蝴蝶效应触发机制

---

### `js/app_novel.js` ⭐ 新增
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
5. 逐章调用 API 生成（第1章包含书名，后续章节基于上一章末尾续写）

#### 阅读器功能
- 段落级评论（点击气泡数 → 底部弹出评论列表，AI 生成 + 本地随机池）
- 划线分享（双击段落 → 发送片段给陪读角色，AI 生成陪读回应）
- 续写下一章（最后一页显示续写按钮，调用 API 生成）
- 陪读系统（伴读角色随机在阅读过程中出现对话气泡）
- 防沉迷系统（凌晨0-4点弹出警告，10分钟小睡选项）

#### TXT 导入
- 支持文件上传或文本粘贴
- 自动按"第X章"分割为多页
- 存入 `state.books`，`isImported: true` 标记

#### 社交联动
- 分享给微信角色（`shareToWeChat`）：发送小说卡片气泡，2分钟后 AI 角色发送读后感
- 读后感 AI 生成（`triggerPostReadingReaction`）：写入聊天历史并触发未读角标

#### 数据持久化
- 存储 key：`novel_state_v3`（含书架、收藏、我的作品、陪读角色设置、热度统计）
- 待发送反应队列：`novel_pending_reactions`

**什么时候看：**
- 改小说生成流程或 prompt
- 改阅读器功能（评论、划线、续写）
- 改陪读/防沉迷/分享逻辑
- 改书架、导入、排行榜

---

### `js/app_imagegen.js` ⭐ 新增
**作用：图像生成双引擎模块（NovelAI + Pollinations Flux）。**

> 这个文件**没有专属 App 容器**，是工具函数集合，挂钩到聊天气泡系统。

关键设置 key：`myCoolPhone_imagegenSettings`

#### 双引擎对比
| 引擎 | 函数 | 特点 |
|---|---|---|
| NovelAI (NAI) | `generateImageNai()` | 需要 NAI API Key；支持 V3/V4/V4.5；SSE 流式响应；需 CORS 代理 |
| Pollinations | `generateImagePollinations()` | 免费；支持 flux 等模型；自动重试3次 |

#### 与聊天系统的挂钩
AI 回复文本中可以嵌入以下格式触发自动生图：

| 格式 | 引擎 | 说明 |
|---|---|---|
| `{"type":"naiimag","prompt":"..."}` | NAI | JSON格式 |
| `[NAIIMAG:prompt]` | NAI | 标签格式 |
| `[REALIMAG:prompt]` | Pollinations | 标签格式 |

- `parseAndHandleImageCommands(rawReply, chatId)` — 解析并异步触发生图，返回去掉指令后的纯文本
- `window.processImagegenFromAIReply(rawReply, chatId)` — `apps.js` 调用的入口钩子

#### 图片气泡功能
- 重绘（`rerollImage`）：新 seed 重新生成
- 下载（`downloadGeneratedImage`）
- 全屏查看（`openImageFullscreen`）
- 长按右键菜单（`showImageBubbleMenu`）
- 历史恢复（`tryRestoreGeneratedImageBubble`）：从 `[GENIMG_DATA:...] ` 格式恢复图片气泡

#### 提示词构建
- `buildFinalPrompt(aiScenePrompt, chatId)` — 场景词 + 角色专属正面词 + 系统默认词
- `buildFinalNegativePrompt(chatId)` — 角色专属负面词 + 系统默认负面词
- 角色专属词存在 `friendsData[chatId].imagegenSettings.charPositivePrompt/charNegativePrompt`

#### 线下模式自动生图
- `generateOfflineModeImage(sceneDescription, chatId)` — 线下模式 AI 回复后自动插入插图（需在设置中开启 `offlineAutoImage`）

#### 设置 UI
- `window.initImagegenSettingsUI()` — 初始化设置页中的图像生成配置项
- `window.saveImagegenSettingsUI()` — 保存设置
- `window.openImagegenTestModal()` — 打开测试生成弹窗

**什么时候看：**
- 改图像生成引擎参数或模型选项
- 改 AI 回复触发生图的指令格式
- 改图片气泡 UI（重绘/下载/全屏）
- 改提示词构建逻辑
- 改设置页中的图像生成配置
- 改线下模式自动插图

---

### `js/app_galgame.js` ⭐ 新增
**作用：Gal 游戏 / 视觉小说风格互动模块。**

关键 CSS：`css/galgame.css`  
关键容器 ID：`galgameApp`（待确认）

**已知特征：**
- 提供视觉小说风格的剧情演出界面
- 可能包含立绘展示、场景背景、对话框系统

**什么时候看：**
- 改 Gal 游戏风格对话演出界面
- 改场景/立绘/背景逻辑
- 改 Gal 游戏专属 prompt 或剧情推进逻辑

---

### `js/app_sms.js` ⭐ 新增
**作用：短信 App 模拟模块。**

关键 CSS：`css/sms_phone.css`（与电话模块共享）

**已知特征：**
- 模拟手机短信界面
- 可能支持 AI 生成短信内容
- 与 `app_phone_call.js` 共享样式文件

**什么时候看：**
- 改短信列表或对话界面
- 改短信 AI 内容生成逻辑

---

### `js/app_phone_call.js` ⭐ 新增
**作用：普通电话（拨号盘/通话记录）模拟模块。**

关键 CSS：`css/sms_phone.css`（与短信模块共享）

> 注意：与 `app_voice_call.js` 不同，本模块是 **UI 模拟层**（拨号盘 / 通话记录），`app_voice_call.js` 是带 AI 对话的真实语音/视频通话功能。

**什么时候看：**
- 改拨号盘 UI
- 改通话记录列表
- 改与 `app_voice_call.js` 的联动逻辑

---

### `js/app_floatpet.js` ⭐ 新增
**作用：悬浮宠物（FloatPet）模块。**

关键 CSS：`css/floatpet.css`  
关联 Android：`android/app/src/main/assets/floatpet_overlay.html`

**已知特征：**
- 在屏幕上显示可拖拽的悬浮宠物角色
- Android 端通过 `FloatingWindowService` 以系统级悬浮窗呈现
- Web 端与 Android 端共用 `floatpet_overlay.html` 作为前端渲染层

**什么时候看：**
- 改悬浮宠物的外观/动画
- 改宠物与用户的互动行为
- 改 Web 端悬浮层逻辑
- 改 Android 悬浮窗权限或 Service 行为（需同看 `android/` 目录）

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
搜索：`bubbleApp`、`bb-idol-view`、`renderCommentsModal`

---

### H. 音乐播放器
先看：`index.html`、`js/app_music.js`  
搜索：`musicPlayerView`、`renderPlaylist`、`updatePlayerUI`

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
搜索：`identity-modal`、`personaBuilderApp`、`generatePersonaByAI`、`PB_KEYS`

---

### S. 语音/视频通话
先看：`index.html`、`js/app_voice_call.js`  
搜索：`video-call-view`、`startVideoCall`、`triggerIncomingCall`、`VideoCallState`

---

### T. 查手机（Tracker） ⭐ 新增
先看：`index.html`、`js/app_tracker.js`  
搜索：`trackerApp`、`TrackerApp`、`tr-view-select`、`tr-view-lock`、`tr-view-desktop`、`tr-app-`

关键词：
- `tr-scenario-modal` — 场景抽卡弹窗
- `tr-pin-dot` — PIN 码输入点
- `tr-timer-pill` — 倒计时胶囊
- `tr-app-messages` / `tr-app-diary` 等 — 各 App 视图容器
- `generateAndSaveCharPin` — 角色密码生成（聊天设置页调用）
- `tr_pending_context` — 蝴蝶效应待处理队列（localStorage）

---

### U. 小说 App（Novel） ⭐ 新增
先看：`index.html`、`js/app_novel.js`  
搜索：`novelApp`、`NovelApp`、`novel-tab-forum`、`novel-fullreader`

关键词：
- `novel-bottom-tabs` — 底部 Tab 栏
- `novel-gen-panel` — AI 生成面板
- `novel-comment-sheet` — 段落评论底部弹出
- `novel-antiaddict-overlay` — 防沉迷遮罩
- `novel_state_v3` — 持久化存储 key
- `novel_pending_reactions` — 读后感待触发队列

---

### V. 图像生成（ImageGen） ⭐ 新增
先看：`js/app_imagegen.js`（无专属容器，挂钩到聊天系统）  
搜索：`processImagegenFromAIReply`、`parseAndHandleImageCommands`、`generateImages`、`IMAGEGEN_SETTINGS_KEY`

关键词：
- `imagegen-test-modal` — 测试生成弹窗
- `imagegen-fullscreen-overlay` — 全屏查看遮罩
- `imagegen-context-menu` — 图片右键菜单
- `[REALIMAG:`、`[NAIIMAG:`、`"type":"naiimag"` — AI 回复中的生图指令格式
- `[GENIMG_DATA:` — 历史记录中图片数据的存储格式

---

### W. Gal 游戏 ⭐ 新增
先看：`index.html`、`js/app_galgame.js`  
搜索：`galgameApp`（或类似容器 ID）

---

### X. 短信 App ⭐ 新增
先看：`index.html`、`js/app_sms.js`  
搜索：`smsApp`（或类似容器 ID）、`css/sms_phone.css`

---

### Y. 电话 App ⭐ 新增
先看：`index.html`、`js/app_phone_call.js`  
搜索：`phoneCallApp`（或类似容器 ID）、`css/sms_phone.css`

---

### Z. 悬浮宠物（FloatPet） ⭐ 新增
先看：`index.html`、`js/app_floatpet.js`  
如需改 Android 端：`android/app/src/main/java/com/beeper/floatpet/`  
搜索：`floatPetApp`（或类似容器 ID）、`floatpet_overlay.html`

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
| Gal 游戏 App | `galgameApp`（待确认） |
| 短信 App | `smsApp`（待确认） |
| 电话 App | `phoneCallApp`（待确认） |
| 悬浮宠物 App | `floatPetApp`（待确认） |
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

### 改样式的建议
- 改查手机界面 → 优先看 `css/tracker.css`（`.tr-*` 前缀）
- 改小说 App → 优先看 `css/novel.css`（`.novel-*` 前缀）
- 改通话界面 → 优先看 `css/video_call.css`（`.vc-*` 前缀）
- 改 Bubble 样式 → 优先看 `css/bubble.css` 或 `css/overrides.css` 末尾
- 改音乐播放器 → 优先看 `css/music.css`
- 改短信/电话界面 → 优先看 `css/sms_phone.css`
- 改悬浮宠物 → 优先看 `css/floatpet.css`
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
| `app_tracker.js` | 依赖 `apps.js` 的 `friendsData`、`IDB`、`scopedChatKey`、`triggerAIReplyForPendingContext`<br>依赖 `app_worldbook.js` 的 `worldBooks`<br>依赖 `app_persona.js` 的 `personasMeta`、`currentPersonaId`<br>写入 `tr_pending_context`（由 `apps.js` 的 `triggerAIReplyForPendingContext` 消费） |
| `app_novel.js` | 依赖 `apps.js` 的 `friendsData`、`appendMessage`、`saveMessageToHistory`、`currentChatId`<br>依赖 `app_persona.js` 的 `personasMeta`、`currentPersonaId`<br>依赖 `app_worldbook.js` 的 `worldBooks` |
| `app_imagegen.js` | 依赖 `apps.js` 的 `friendsData`、`currentChatId`、`appendMessage`、`saveMessageToHistory`、`IDB`、`scopedChatKey`<br>通过 `window.processImagegenFromAIReply` 被 `apps.js` 调用 |

---

## 10. 对后续 AI 最重要的判断结论

### 这个项目最重要的几个事实
1. **`index.html` 非常大，是整个系统的 DOM 总装配文件**
2. **`js/apps.js` 是总业务核心**
3. **其余 `js/app_xxx.js` 是各子 App 模块**
4. **`app_groupchat.js` 会覆写全局 `sendMessageToAI` 和 `appendMessage`，群聊时行为与私聊完全不同**
5. **`app_tracker.js` 的"蝴蝶效应"通过 `tr_pending_context` 向聊天主线注入事件，由 `apps.js` 消费**
6. **`app_imagegen.js` 是工具函数集合，没有独立容器，通过钩子函数挂载到聊天气泡系统**

### 所以修改前请先判断：
- 这是"系统级功能"还是"子 App 功能"？
- 改动是"DOM 结构"还是"业务逻辑"？
- 是只改一个模块，还是会影响多个模块？
- 如果是群聊相关，是否会与 `app_groupchat.js` 的函数覆写冲突？
- 如果涉及 AI 回复后处理，是否需要同时检查 `app_imagegen.js` 的钩子？

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
   - js/app_bubble.js         Bubble 偶像
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
   - js/app_sms.js            短信 App
   - js/app_phone_call.js     电话 App（UI模拟，与 app_voice_call.js 不同）
   - js/app_floatpet.js       悬浮宠物（含 Android 端 android/ 目录）
6. 修改前先判断功能归属到哪个文件。
7. 涉及界面时同时检查 index.html 和对应 JS 文件。
8. 不要随便调整 script 加载顺序。
9. 优先局部修改，不要无必要重构 apps.js。
10. 改群聊相关功能前，必须先看 app_groupchat.js，它覆写了核心全局函数。
11. app_tracker.js 的蝴蝶效应通过 localStorage 的 tr_pending_context 向 apps.js 注入聊天上下文。
12. app_imagegen.js 没有独立 App 容器，是工具函数集合，由 apps.js 通过 processImagegenFromAIReply 调用。
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

---

## 13. 一句话版本

> **先看 `AI_CODEMAP.md` → 再判断是改 `index.html`、`js/apps.js`，还是某个 `js/app_xxx.js`。群聊必看 `app_groupchat.js`（覆写全局函数）；查手机改 `app_tracker.js`；小说改 `app_novel.js`；图像生成改 `app_imagegen.js`（无独立容器，挂钩聊天系统）。**
