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
├─ service-worker.js         # PWA / 缓存逻辑
├─ icon.png                  # 应用图标
├─ AI_CODEMAP.md             # 当前这份 AI 代码地图
├─ node_modules/             # Node依赖目录（内含如 Puppeteer 等本地工具），由于是原生前端项目，页面运行时无需打包或加载此目录
├─ css/
│  ├─ style.css              # 主样式
│  ├─ animations.css         # 动画样式
│  ├─ base.css               # 基础样式
│  ├─ modules.css            # 模块样式
│  └─ overrides.css          # 覆盖样式/补丁样式
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
   └─ app_persona.js         # User 人设生成系统模块
```

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
```

### 结论
- `core.js` 是底层基础行为
- `apps.js` 是主系统中枢
- 后面的 `app_*.js` 是分模块扩展
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
- Summary / 记忆中枢
- Arcade / Game App
- Pay App
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
- 添加好友 / 删除好友 / 群聊
- 线下模式（Offline / Tavern）
- 聊天气泡菜单 / 转发 / 删除 / 撤回 / 重回
- 语音发送 / 录音 / 转写
- 剧情总结 / 记忆中枢
- Persona / 身份系统
- 首页可编辑信息恢复
- 各种全局存储与数据迁移

#### 典型函数类型
- 数据类：
  - `loadFriendsData`
  - `saveFriendsData`
  - `loadChatHistory`
  - `saveMessageToHistory`
- UI 渲染类：
  - `refreshMindCardUI`
  - `renderMomentsFeed`
  - `restoreFriendListUI`
  - `renderSummaryUI`
- AI 请求类：
  - `sendMessageToAI`
  - `callAiForSpecialTask`
  - `triggerAiReactionForMoment`
  - `triggerAIReplyForPendingContext`
- 配置类：
  - `initThemeSettings`
  - `saveAllSettings`
  - `fetchAndPopulateModels`
  - `initPersonaSystem`

**什么时候先看它：**
- 聊天功能
- AI 回复逻辑
- 好友 / 通讯录
- 朋友圈
- 设置 / 预设 / 主题
- 线下模式
- 总结记忆
- 身份切换
- 任何“全局系统功能”

**注意：**
- 这是“大总管文件”
- 改动前先搜索目标函数，确认没有同名功能散落在别的 app 文件里

---

### `js/app_worldbook.js`
**作用：世界书 / Lorebook 管理。**

已确认核心函数：
- `loadWorldBooks`
- `saveWorldBooksData`
- `renderShelf`
- `openBookDetail`
- `renderEntriesList`
- `constructWorldInfoPrompt`

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
- 钱包主页
- 账单
- 零钱 / 银行卡 / 理财
- 亲密付
- 每月收入
- 兼职小游戏
- 模拟股市
- 顶流造星企划

**典型函数：**
- `loadPayData`
- `savePayData`
- `renderPayMainPage`
- `renderYuebaoPage`
- `renderCareerPage`
- `startJobTimer`
- `initStockMarket`
- `generateNewMarket`

**什么时候看：**
- 改钱包页面
- 改收支逻辑
- 改兼职玩法
- 改股票数据和交易
- 改投资小游戏

---

### `js/app_pet.js`
**作用：电子宠物系统。**

已确认功能：
- 宠物状态
- 房间 / 家具
- 拖拽
- 商店
- 宠物朋友圈
- 旅行
- 领养流程
- 宠物设置

**什么时候看：**
- 改宠物成长
- 改宠物房间
- 改商店
- 改旅行 / 相册 / 宠物动态

---

### `js/app_lovespace.js`
**作用：情侣空间 / 双人宇宙。**

已确认功能：
- 大厅与关系入口
- Journal / 手账
- 冰箱
- QA
- Tasks
- 自动事件
- 绑定关系
- 页面切换和设置

**什么时候看：**
- 改情侣空间主界面
- 改手账
- 改冰箱贴纸
- 改自动生成逻辑
- 改情侣任务和互动

---

### `js/app_arcade.js`
**作用：双人游乐场小游戏合集。**

已确认包含多组小游戏逻辑，例如：
- 真心话
- Emoji 同频
- 平行宇宙逃亡
- 扭蛋机
- 同居领地战
- 骰子
- 娃娃机
- 飞行棋
- 抽鬼牌
- 翻翻乐
- 双人跳跃

**什么时候看：**
- 改小游戏规则
- 改小游戏胜负逻辑
- 改 AI 对手表现
- 改分数或结算流程

---

### `js/app_map.js`
**作用：地图与地点探索。**

已确认功能：
- 地图数据读写
- 地图列表
- 地点列表 / marker
- 地点编辑
- 角色选择
- 场景探索弹窗

**什么时候看：**
- 改地图主界面
- 改地点编辑
- 改探索流程
- 改地点与角色绑定

---

### `js/app_live.js`
**作用：LIVE 社交内容流。**

已确认功能：
- LIVE 数据读写
- Discover / Friends / Messages / Me 等页面
- 发布动态
- AI 互动反馈
- 个人页同步

**什么时候看：**
- 改 LIVE 五个 Tab
- 改动态发布
- 改 AI 点赞评论
- 改直播感 / 社交流表现

---

### `js/app_persona.js`
**作用：User 人设生成系统 (无 Tab 滚动填表 + 灵动魔法动画版)。**

已确认功能：
- 人设档案填表 (55个细分维度)
- AI 一键扩写生成设定
- 头像上传与预览
- 人设档案导入导出 (TXT)
- 全局身份切换和加载同步

**什么时候看：**
- 改人设档案表单字段 (`PB_KEYS`)
- 改 AI 自动生成的 prompt 格式
- 改头像预览或人设弹窗逻辑
- 改人设导出功能

---

## 5. 改功能时先看哪个文件

---

### A. 聊天主系统 / AI 回复 / 微信界面
先看：
- `index.html`
- `js/apps.js`

关键词建议搜索：
- `wechatApp`
- `chatLayer`
- `chatMessages`
- `chatForm`
- `sendMessageToAI`
- `toggleChat`
- `openChatSettingsPage`

---

### B. 好友 / 通讯录 / 添加好友 / 群聊
先看：
- `index.html`
- `js/apps.js`

关键词建议搜索：
- `contacts-list-container`
- `add-friend-modal`
- `create-group-modal`
- `loadFriendsData`
- `saveFriendsData`
- `deleteFriendInternal`

---

### C. 朋友圈 / Moments
先看：
- `index.html`
- `js/apps.js`

关键词建议搜索：
- `moments-feed-list`
- `post-moment-modal`
- `renderMomentsFeed`
- `triggerAiReactionForMoment`
- `triggerAiReplyToComment`

---

### D. 设置 / API / 模型 / 主题 / 预设
先看：
- `index.html`
- `js/apps.js`

关键词建议搜索：
- `settingsView`
- `preset-editor`
- `initThemeSettings`
- `saveAllSettings`
- `fetchAndPopulateModels`
- `saveThemeConfig`

---

### E. 世界书
先看：
- `index.html`
- `js/app_worldbook.js`

关键词建议搜索：
- `worldBookApp`
- `wb-shelf-view`
- `wb-detail-view`
- `renderShelf`
- `constructWorldInfoPrompt`

---

### F. Bubble
先看：
- `index.html`
- `js/app_bubble.js`

关键词建议搜索：
- `bubbleApp`
- `bb-idol-view`
- `bb-fan-view`
- `renderCommentsModal`

---

### G. 音乐播放器
先看：
- `index.html`
- `js/app_music.js`

关键词建议搜索：
- `musicPlayerView`
- `global-audio-player`
- `renderPlaylist`
- `updatePlayerUI`

---

### H. 钱包 / 理财 / 股市 / 打工
先看：
- `index.html`
- `js/app_pay.js`

关键词建议搜索：
- `payApp`
- `coin-game-view`
- `pay-page-stock`
- `renderPayMainPage`
- `renderYuebaoPage`
- `initStockMarket`

---

### I. 宠物
先看：
- `index.html`
- `js/app_pet.js`

关键词建议搜索：
- `petApp`
- `pet-room-stage`
- `pet-settings-modal`
- `loadPetData`
- `updatePetStatsUI`
- `renderShopList`

---

### J. Love Space / 双人宇宙
先看：
- `index.html`
- `js/app_lovespace.js`

关键词建议搜索：
- `loveSpaceApp`
- `ls2-lobby-view`
- `ls2-main-view`
- `renderLs2Journal`
- `renderLs2Fridge`
- `renderLs2Tasks`

---

### K. 地图
先看：
- `index.html`
- `js/app_map.js`

关键词建议搜索：
- `mapApp`
- `map-canvas`
- `map-sidebar`
- `renderMapList`
- `renderMapView`
- `openSceneModal`

---

### L. LIVE
先看：
- `index.html`
- `js/app_live.js`

关键词建议搜索：
- `liveApp`
- `live-tab-discover`
- `live-tab-messages`
- `renderLiveUI`
- `triggerLiveReactions`

---

### M. Arcade 小游戏
先看：
- `index.html`
- `js/app_arcade.js`

关键词建议搜索：
- `gameApp`
- `gc-view-lobby`
- `g1_`
- `g2_`
- `g3_`
- `g4_`
- `g5_`
- `g6_`
- `g7_`
- `g8_`
- `g9_`
- `g10_`
- `g11`

---

### N. 线下模式 / Tavern 风格聊天
先看：
- `index.html`
- `js/apps.js`

关键词建议搜索：
- `offlineModeView`
- `offline-log-container`
- `offline-settings-panel`
- `renderOfflineHistory`
- `triggerOfflineRetry`
- `updateOfflineMessage`

---

### O. 剧情总结 / 记忆中枢
先看：
- `index.html`
- `js/apps.js`

关键词建议搜索：
- `summaryPageView`
- `renderSummaryUI`
- `executeSummaryProcess`
- `generateGrandSummary`

---

### P. 身份系统与人设生成器 / Persona
先看：
- `index.html`
- `js/apps.js` (身份系统核心逻辑)
- `js/app_persona.js` (人设填表与 AI 生成)

关键词建议搜索：
- `identity-modal`
- `personaBuilderApp`
- `initPersonaSystem`
- `applyPersonaToUI`
- `generatePersonaByAI`
- `PB_KEYS`

---

## 6. `index.html` 中的重要 App 容器 ID

这些容器通常就是对应 JS 模块的落点。

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
| Arcade | `gameApp` |
| Pay | `payApp` |
| User 人设生成器 | `personaBuilderApp` |
| 表情包管理中枢 | `stickerManagerPage` |

---

## 7. CSS 文件怎么理解

| 文件 | 用途 |
|---|---|
| `css/style.css` | 主样式，大部分视觉都可能在这里 |
| `css/animations.css` | 动画和过渡效果 |
| `css/base.css` | 基础样式、通用 reset / 基础变量类样式 |
| `css/modules.css` | 分模块组件样式 |
| `css/overrides.css` | 覆盖/补丁性质样式 |

### 改样式的建议
- 不清楚样式来源时，先全局搜索类名/ID
- 小修优先改已有文件，不建议一开始就再新建更多样式文件
- 如果是“临时补丁式改动”，通常适合放在 `overrides.css`

---

## 8. 常见修改流程建议

### 场景 1：改某个 App 的界面
1. 先在 `index.html` 找到对应 App 容器
2. 找对应按钮 / `onclick`
3. 再打开对应 `js/app_xxx.js`
4. 找渲染函数、打开函数、保存函数
5. 最后查相关 CSS

---

### 场景 2：改聊天或 AI 行为
1. 先看 `js/apps.js`
2. 搜索：
   - `sendMessageToAI`
   - `loadChatHistory`
   - `saveMessageToHistory`
   - `renderOfflineHistory`
   - `callAiForSpecialTask`
3. 如果 UI 也要改，再回看 `index.html`

---

### 场景 3：改弹窗
1. 在 `index.html` 搜弹窗容器 `id`
2. 找打开函数：`openXxx`
3. 找关闭函数：`closeXxx` / `toggleXxx`
4. 找提交/保存函数：`saveXxx` / `confirmXxx`

---

### 场景 4：加一个新功能
先判断属于哪种：

- 属于聊天主系统 → `js/apps.js`
- 属于世界书 → `js/app_worldbook.js`
- 属于 LIVE → `js/app_live.js`
- 属于宠物 → `js/app_pet.js`
- 属于钱包 → `js/app_pay.js`
- 属于小游戏 → `js/app_arcade.js`
- 属于用户人设填表/生成 → `js/app_persona.js`

如果需要新页面：
- 容器写到 `index.html`
- 行为写到对应 JS 模块
- 样式写到合适的 CSS 文件

---

## 9. 对后续 AI 最重要的判断结论

### 这个项目最重要的三个事实
1. **`index.html` 非常大，是整个系统的 DOM 总装配文件**
2. **`js/apps.js` 是总业务核心**
3. **其余 `js/app_xxx.js` 是各子 App 模块**

### 所以修改前请先判断：
- 这是“系统级功能”还是“子 App 功能”？
- 改动是“DOM 结构”还是“业务逻辑”？
- 是只改一个模块，还是会影响多个模块？

---

## 10. 给后续 AI 的最短执行提示词

如果要把这份目录交给另一个 AI，可以直接先喂它这段：

```text
你现在要修改这个项目，但请先遵守以下规则：

1. 先阅读 AI_CODEMAP.md，再开始改代码。
2. 这个项目是 index.html + 全局 JS 的单页应用。
3. index.html 里包含大量 App 容器和弹窗，不是只有首页。
4. 聊天、设置、好友、朋友圈、线下模式、总结记忆、身份系统等核心逻辑主要在 js/apps.js。
5. 各独立 App 逻辑分别在：
   - js/app_worldbook.js
   - js/app_bubble.js
   - js/app_music.js
   - js/app_pay.js
   - js/app_pet.js
   - js/app_lovespace.js
   - js/app_arcade.js
   - js/app_map.js
   - js/app_live.js
   - js/app_persona.js
6. 修改前先判断功能归属到哪个文件。
7. 涉及界面时同时检查 index.html 和对应 JS 文件。
8. 不要随便调整 script 加载顺序。
9. 优先局部修改，不要无必要重构 apps.js。
```

---

## 11. 后续维护建议

如果以后继续扩展项目，建议同步更新本文件，重点补这几类信息：

- 新增了哪个 App
- 新增了哪个关键容器 ID
- 新增了哪个核心 JS 文件
- 某个功能从 `apps.js` 拆分到了哪个新文件
- 哪些功能存在跨模块依赖

---

## 12. 一句话版本

> **先看 `AI_CODEMAP.md` → 再判断是改 `index.html`、`js/apps.js`，还是某个 `js/app_xxx.js`。**
