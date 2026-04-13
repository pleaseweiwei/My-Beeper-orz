// ============================================================
//  查手机 (TRACKER) — 核心逻辑 v2.0 痕迹干预与蝴蝶效应系统
// ============================================================

const TrackerApp = (() => {
  // ── 状态 ──────────────────────────────────────────────────
  let state = {
    selectedChar: null,   // 当前选中角色对象
    scenario: null,       // 当前场景
    timerInterval: null,  // 倒计时
    clockInterval: null,  // 时钟更新
    timerSeconds: 0,
    pinBuffer: '',
    phoneData: null,      // 一次性生成的全量数据
    currentApp: null,
    tamperLog: [],        // 篡改记录 → 注入主线
  };

  const SCENARIOS = [
    { id: 'bath',  icon: '🛁', label: 'TA去洗澡了',   minutes: 5 },
    { id: 'sleep', icon: '😴', label: 'TA睡着了',     minutes: 4 },
    { id: 'out',   icon: '🚶', label: 'TA出门买东西',  minutes: 3 },
    { id: 'meet',  icon: '☕', label: 'TA在开会',     minutes: 6 },
  ];

  const APP_LIST = [
    { id: 'messages', icon: 'fa-comment-dots', label: '消息',   notif: true  },
    { id: 'diary',    icon: 'fa-book',          label: '日记',   notif: false },
    { id: 'browser',  icon: 'fa-compass',        label: '浏览器', notif: false },
    { id: 'wallet',   icon: 'fa-wallet',         label: '钱包',   notif: false },
    { id: 'location', icon: 'fa-map-marker-alt', label: '足迹',   notif: false },
    { id: 'calendar', icon: 'fa-calendar-alt',   label: '日历',   notif: false },
    { id: 'shop',     icon: 'fa-shopping-bag',   label: '购物车', notif: true  },
    { id: 'album',    icon: 'fa-images',          label: '相册',   notif: false },
    { id: 'music',    icon: 'fa-music',           label: '音乐',   notif: false },
    { id: 'vault',    icon: 'fa-lock',            label: '保险箱', notif: false },
    { id: 'takeout',  icon: 'fa-motorcycle',      label: '外卖',   notif: false },
    { id: 'notes',    icon: 'fa-sticky-note',     label: '备忘录', notif: false },
    { id: 'trash',    icon: 'fa-trash-alt',       label: '废纸篓', notif: false },
  ];

  // ── DOM helpers ───────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  };

  // ── 入口：打开应用 ────────────────────────────────────────
  function open() {
    const app = $('trackerApp');
    if (!app) return;
    app.style.display = 'flex';
    app.classList.add('open');
    showView('tr-view-select');
    renderCharSelect();
  }

  function close() {
    stopTimer();
    if (state.clockInterval) { clearInterval(state.clockInterval); state.clockInterval = null; }
    const app = $('trackerApp');
    if (app) {
      app.classList.remove('open');
      app.style.display = 'none';
    }
    // 将篡改记录注入主线
    if (state.tamperLog.length > 0) {
      injectTamperContext();
    }
    state = { ...state, selectedChar: null, scenario: null, phoneData: null, currentApp: null, timerInterval: null, timerSeconds: 0, pinBuffer: '' };
  }

  function showView(id) {
    document.querySelectorAll('#trackerApp .tr-view').forEach(v => v.classList.remove('active'));
    const v = $(id);
    if (v) v.classList.add('active');
  }

  // ── 角色选择 ──────────────────────────────────────────────
  function renderCharSelect() {
    const list = $('tr-char-list');
    if (!list) return;
    list.innerHTML = '';
    const chars = getCharacters();
    if (!chars.length) {
      list.innerHTML = '<div class="tr-empty"><div class="tr-empty-icon">👻</div><div class="tr-empty-text">还没有创建任何角色</div></div>';
      return;
    }
    chars.forEach(c => {
      const card = el('div', 'tr-char-card');
      card.innerHTML = `
        <img class="tr-char-card-avatar" src="${c.avatar || 'icon.png'}" onerror="this.src='icon.png'">
        <div class="tr-char-card-info">
          <div class="tr-char-name">${c.name}</div>
          <div class="tr-char-tag">${c.description || c.persona || '神秘角色'}</div>
        </div>
        <div class="tr-char-arrow">›</div>`;
      card.onclick = () => selectChar(c);
      list.appendChild(card);
    });
  }

  function getCharacters() {
    try {
      if (typeof friendsData !== 'undefined' && Object.keys(friendsData).length > 0) {
        return Object.keys(friendsData).map(id => ({
          id: id,
          name: friendsData[id].remark || friendsData[id].realName || id,
          description: friendsData[id].persona || '',
          avatar: friendsData[id].avatar || '',
          persona: friendsData[id].persona || '',
        }));
      }
      const raw = localStorage.getItem('ai_characters') || localStorage.getItem('characters') || '[]';
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

   function selectChar(c) {
    state.selectedChar = c;
    
    document.querySelector('#trackerApp .tr-action-sheet')?.remove();
    const sheet = document.createElement('div');
    sheet.className = 'tr-action-sheet';
    
    // 【韩系 ins 风重构】
    sheet.innerHTML = `
      <div class="tr-action-sheet-mask" onclick="this.parentElement.remove()" style="background: rgba(0,0,0,0.4); backdrop-filter: blur(6px);"></div>
      <div class="tr-action-sheet-box" style="padding: 30px 24px; border-radius: 32px 32px 0 0; background: #ffffff; box-shadow: 0 -10px 40px rgba(0,0,0,0.08);">
        
        <!-- 顶部小横条 -->
        <div class="tr-action-sheet-handle" style="width: 36px; height: 4px; background: #e4e4e4; border-radius: 4px; margin: 0 auto 28px;"></div>
        
        <!-- 杂志风标题区 -->
        <div class="tr-action-sheet-header" style="flex-direction:column; align-items:center; gap:6px; border:none; padding:0; margin-bottom:28px;">
          <div style="font-family: 'Montserrat', sans-serif; font-size: 10px; font-weight: 800; letter-spacing: 2px; color: #999; text-transform: uppercase;">TARGET: ${c.name}</div>
          <div style="font-family: 'Playfair Display', serif; font-style: italic; font-weight: 700; font-size: 24px; color: #111; letter-spacing: 0.5px;">Select Action</div>
        </div>
        
        <!-- 选项卡片区 -->
        <div class="tr-action-sheet-grid" style="display:flex; flex-direction:column; gap: 14px; padding: 0;">
          
          <!-- 线上入侵选项 -->
          <div class="tr-action-card-btn" onclick="TrackerApp.startPhoneTracker()" style="display:flex; flex-direction: row; align-items:center; padding: 18px 20px; border-radius: 20px; border: 1px solid #f0f0f0; background: #fafafa; transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: none;">
            <!-- 纯净白底图标圈 -->
            <div style="margin-right: 18px; width: 46px; height: 46px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 16px rgba(0,0,0,0.04); flex-shrink: 0;">
              <i class="fas fa-mobile-alt" style="font-size: 18px; color: #111;"></i>
            </div>
            <!-- 文字区 -->
            <div style="flex: 1; text-align: left;">
                <div style="font-size: 15px; font-weight: 800; color: #111; margin-bottom: 4px; letter-spacing: 0.5px;">线上入侵 / PHONE</div>
                <div style="font-size: 11px; color: #888; font-weight: 500;">查阅手机隐私与隐藏数据</div>
            </div>
            <i class="fas fa-chevron-right" style="color: #ddd; font-size: 12px; margin-left: 10px;"></i>
          </div>

          <!-- 线下潜入选项 -->
          <div class="tr-action-card-btn" onclick="TrackerApp.startOfflineSnoop()" style="display:flex; flex-direction: row; align-items:center; padding: 18px 20px; border-radius: 20px; border: 1px solid #f0f0f0; background: #fafafa; transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: none;">
            <!-- 纯净白底图标圈 -->
            <div style="margin-right: 18px; width: 46px; height: 46px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 16px rgba(0,0,0,0.04); flex-shrink: 0;">
              <i class="fas fa-door-open" style="font-size: 16px; color: #111;"></i>
            </div>
            <!-- 文字区 -->
            <div style="flex: 1; text-align: left;">
                <div style="font-size: 15px; font-weight: 800; color: #111; margin-bottom: 4px; letter-spacing: 0.5px;">线下潜入 / ROOM</div>
                <div style="font-size: 11px; color: #888; font-weight: 500;">实地搜查TA的住所与物品</div>
            </div>
            <i class="fas fa-chevron-right" style="color: #ddd; font-size: 12px; margin-left: 10px;"></i>
          </div>

        </div>

        <!-- 取消按钮 (极简文字留白) -->
        <div style="text-align: center; margin-top: 24px;">
          <div onclick="this.closest('.tr-action-sheet').remove()" style="display: inline-block; font-size: 10px; font-weight: 800; color: #aaa; letter-spacing: 2px; cursor: pointer; padding: 10px 20px; text-transform: uppercase;">
            Cancel
          </div>
        </div>
        
      </div>`;
    document.getElementById('trackerApp').appendChild(sheet);
    requestAnimationFrame(() => sheet.querySelector('.tr-action-sheet-box').classList.add('open'));
  }


  function startPhoneTracker() {
    document.querySelector('#trackerApp .tr-action-sheet')?.remove();
    renderScenarioModal();
    document.getElementById('tr-scenario-modal').classList.add('active');
  }

  function startOfflineSnoop() {
    document.querySelector('#trackerApp .tr-action-sheet')?.remove();
    // 1. 先把角色ID存下来，防止被 close() 清空
    const targetCharId = state.selectedChar.id || state.selectedChar.name;
    // 2. 再关闭当前Tracker面板
    close();
    // 3. 打开线下搜查APP并传入保存好的角色ID
    if (window.openSnoopApp) {
        window.openSnoopApp(targetCharId);
    }
  }

  // ── 场景弹窗（随机抽卡版）────────────────────────────────
  function renderScenarioModal() {
    const list = $('tr-scenario-list');
    if (!list) return;

  // 重置为"抽卡"状态
    list.innerHTML = `
      <div class="tr-draw-card-area" id="tr-draw-card-area">
        <div class="tr-draw-header">
          <div class="tr-draw-eyebrow">RANDOM SCENARIO</div>
          <div class="tr-draw-title">抽取时机</div>
        </div>
        <div class="tr-draw-spread" id="tr-draw-deck" onclick="TrackerApp._drawScenarioCard()">
          <div class="tr-spread-card sc1"></div>
          <div class="tr-spread-card sc2"></div>
          <div class="tr-spread-card sc3"></div>
          <div class="tr-spread-card sc4">
            <i class="fas fa-question" style="font-size:22px; color:rgba(255,255,255,0.5);"></i>
          </div>
        </div>
        <div class="tr-draw-hint">TAP TO DRAW YOUR MOMENT</div>
      </div>
      <div class="tr-drawn-result" id="tr-drawn-result" style="display:none;">
        <div class="tr-drawn-card" id="tr-drawn-card">
          <div class="tr-drawn-icon-wrap">
            <div class="tr-drawn-icon" id="tr-drawn-icon"></div>
          </div>
          <div class="tr-drawn-info">
            <div class="tr-drawn-time" id="tr-drawn-time"></div>
            <div class="tr-drawn-label" id="tr-drawn-label"></div>
          </div>
        </div>
        <button class="tr-drawn-confirm" onclick="TrackerApp._confirmScenario()">开始入侵 ›</button>
        <div class="tr-redraw-link" onclick="TrackerApp._resetDraw()">↻ 重新抽取</div>
      </div>`;
  }

  function _drawScenarioCard() {
    const deck = $('tr-draw-deck');
    if (!deck || deck.classList.contains('drawing')) return;
    deck.classList.add('drawing');

    // 随机选择场景
    const s = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
    state._drawnScenario = s;

    setTimeout(() => {
      const area = $('tr-draw-card-area');
      const result = $('tr-drawn-result');
      const icon = $('tr-drawn-icon');
      const label = $('tr-drawn-label');
      const time = $('tr-drawn-time');
      if (area) area.style.display = 'none';
      if (icon) icon.textContent = s.icon;
      if (label) label.textContent = s.label;
      if (time) time.textContent = `${s.minutes} MIN WINDOW`;
      if (result) {
        result.style.display = 'flex';
        // 入场动画
        result.style.animation = 'none';
        void result.offsetWidth;
        result.style.animation = 'tr-card-flip-in 0.5s cubic-bezier(0.34,1.56,0.64,1) both';
      }
    }, 600);
  }

  function _confirmScenario() {
    if (!state._drawnScenario) return;
    state.scenario = state._drawnScenario;
    $('tr-scenario-modal').classList.remove('active');
    goToLock();
  }

  function _resetDraw() {
    state._drawnScenario = null;
    renderScenarioModal();
    // 重新显示抽卡区
    const area = $('tr-draw-card-area');
    if (area) area.style.display = '';
    const result = $('tr-drawn-result');
    if (result) result.style.display = 'none';
  }

  // ── 锁屏 ──────────────────────────────────────────────────
  function goToLock() {
    const c = state.selectedChar;
    const bg = $('tr-lock-bg');
    const avatar = $('tr-lock-avatar');
    const lockName = $('tr-lock-name');
    const lockHint = $('tr-lock-hint');
    if (bg) bg.style.backgroundImage = `url('${c.avatar || 'icon.png'}')`;
    if (avatar) { avatar.src = c.avatar || 'icon.png'; avatar.onerror = () => avatar.src = 'icon.png'; }
    if (lockName) lockName.textContent = c.name;
    const pin = getCharPin(c);
    if (lockHint) lockHint.textContent = pin.hint;
    state.pinBuffer = '';
    updatePinDots();
    showView('tr-view-lock');
  }

  function getCharPin(c) {
    const key = `tr_pin_${c.id || c.name}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.pin && /^\d{4}$/.test(parsed.pin)) {
          return { pin: parsed.pin, hint: parsed.hint || '请输入密码', aiGenerated: true };
        }
      } catch (_) {
        if (/^\d{4}$/.test(stored)) {
          return { pin: stored, hint: '请输入密码', aiGenerated: false };
        }
      }
    }
    const seed = (c.name || 'ai').split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    const fallbackPin = String((seed * 137 + 42) % 9000 + 1000);
    const intimacy = getIntimacy(c);
    let hint = '需要破解密码';
    if (intimacy > 70) hint = '提示：或许是某个重要的日子 💗';
    else if (intimacy > 30) hint = '提示：TA的幸运数字组合';
    return { pin: fallbackPin, hint, aiGenerated: false };
  }

  function getIntimacy(c) {
    try {
      const k = `intimacy_${c.name}`;
      return parseInt(localStorage.getItem(k) || '50');
    } catch { return 50; }
  }

  function handlePinInput(digit) {
    if (state.pinBuffer.length >= 4) return;
    state.pinBuffer += digit;
    updatePinDots();
    if (state.pinBuffer.length === 4) {
      setTimeout(checkPin, 200);
    }
  }

  function handlePinDel() {
    state.pinBuffer = state.pinBuffer.slice(0, -1);
    updatePinDots();
  }

  function updatePinDots() {
    const dots = document.querySelectorAll('#tr-view-lock .tr-pin-dot');
    dots.forEach((d, i) => {
      d.classList.remove('filled', 'error');
      if (i < state.pinBuffer.length) d.classList.add('filled');
    });
  }

  function checkPin() {
    const correct = getCharPin(state.selectedChar).pin;
    if (state.pinBuffer === correct) {
      enterPhone();
    } else {
      document.querySelectorAll('#tr-view-lock .tr-pin-dot').forEach(d => d.classList.add('error'));
      setTimeout(() => {
        state.pinBuffer = '';
        updatePinDots();
      }, 600);
    }
  }

  function handleFaceUnlock() {
    const intimacy = getIntimacy(state.selectedChar);
    if (intimacy > 50) {
      enterPhone();
    } else {
      alert('面容识别失败 😅');
    }
  }

  // ── 进入手机 ──────────────────────────────────────────────
  function enterPhone() {
    showView('tr-view-desktop');
    startTimer();
    setupDesktop();
    // 每次进入手机都清除旧数据和缓存，确保生成最新内容
    state.phoneData = null;
    const c = state.selectedChar;
    if (c) clearCachedPhoneData(c.id || c.name);
    loadPhoneData();
    // 启动时钟每秒更新
    if (state.clockInterval) clearInterval(state.clockInterval);
    state.clockInterval = setInterval(updateDesktopClock, 1000);
  }

  function setupDesktop() {
    const c = state.selectedChar;
    const wp = document.querySelector('.tr-desktop-wallpaper');
    // 先加载已保存的壁纸，若无则用头像
    const charKey = c?.id || c?.name || 'default';
    const savedWallpaper = localStorage.getItem(`tr_wallpaper_${charKey}`);
    if (wp) wp.style.backgroundImage = `url('${savedWallpaper || c.avatar || 'icon.png'}')`;
    updateDesktopClock();
    const remark = $('tr-remark-name');
    if (remark) remark.textContent = '加载中…';
    renderAppGrid();
  }

  function updateDesktopClock() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${hh}:${mm}`;
    const statusClock = $('tr-status-clock');   // 状态栏小时间
    const bigClock = $('tr-desktop-time');      // 桌面大时间
    const dateEl = $('tr-desktop-date');
    if (statusClock) statusClock.textContent = timeStr;
    if (bigClock) bigClock.textContent = timeStr;
    if (dateEl) dateEl.textContent = now.toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  function renderAppGrid() {
    const grid = $('tr-app-grid-inner');
    if (!grid) return;
    grid.innerHTML = '';
    APP_LIST.forEach(app => {
      const icon = el('div', 'tr-app-icon');
      icon.innerHTML = `
        <div class="tr-icon-box${app.notif ? ' has-notif' : ''}">
          <i class="fas ${app.icon}"></i>
        </div>
        <span class="tr-icon-label">${app.label}</span>`;
      icon.onclick = () => openApp(app.id);
      grid.appendChild(icon);
    });
  }

  // ── 倒计时 ────────────────────────────────────────────────
  function startTimer() {
    const s = state.scenario;
    if (!s) return;
    state.timerSeconds = s.minutes * 60;
    const pill = $('tr-timer-pill');
    if (pill) pill.style.display = 'flex';
    updateTimerDisplay();
    state.timerInterval = setInterval(() => {
      state.timerSeconds--;
      updateTimerDisplay();
      if (state.timerSeconds <= 0) {
        stopTimer();
        triggerBusted();
      }
    }, 1000);
  }

  function stopTimer() {
    if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
    const pill = $('tr-timer-pill');
    if (pill) pill.style.display = 'none';
  }

  function updateTimerDisplay() {
    const t = $('tr-timer-text');
    if (!t) return;
    const m = Math.floor(state.timerSeconds / 60);
    const s = state.timerSeconds % 60;
    t.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  function triggerBusted() {
    const overlay = $('tr-busted-overlay');
    if (overlay) overlay.classList.add('active');
    addTamperLog('【系统事件】查手机超时，被当场抓包！这将影响TA对你的态度。');
  }

  // ── 一次性 API 调用（异步 + 缓存）──────────────────────────
  async function loadPhoneData() {
    const c = state.selectedChar;
    if (!c) return;
    const charId = c.id || c.name;

    // 优先使用缓存（同角色同人设下不重复调用）
    const cached = getCachedPhoneData(charId);
    if (cached) {
      state.phoneData = cached;
      if (cached.statusBar) applyStatusBar(cached.statusBar);
      if (cached.messages && cached.messages.remarkName) {
        const r = $('tr-remark-name');
        if (r) r.textContent = `备注：${cached.messages.remarkName}`;
      }
      return;
    }

    showLoading(true);
    const history    = await getRecentHistory();
    const worldbook  = getWorldbook();
    const userPersona = getUserPersona();
    const prompt = buildPhonePrompt(c, history, worldbook, userPersona);

    callAI(prompt, (data) => {
      state.phoneData = data;
      setCachedPhoneData(charId, data);
      showLoading(false);
      if (data.statusBar) applyStatusBar(data.statusBar);
      if (data.messages && data.messages.remarkName) {
        const r = $('tr-remark-name');
        if (r) r.textContent = `备注：${data.messages.remarkName}`;
      }
      // 如果用户已经点进了某个 app，数据到了之后立即重新渲染
      if (state.currentApp) openApp(state.currentApp);
    }, (err) => {
      showLoading(false);
      console.warn('[Tracker] API failed, using fallback', err);
      state.phoneData = buildFallbackData(c);
      if (state.phoneData.statusBar) applyStatusBar(state.phoneData.statusBar);
      // 显示可见的错误横幅，告知用户 fallback 原因
      showApiErrorBanner(err);
      // fallback 数据到了后同样重新渲染当前 app
      if (state.currentApp) openApp(state.currentApp);
    });
  }

  function buildPhonePrompt(c, history, worldbook, userPersona) {
    let pinNote = '';
    try {
      const stored = localStorage.getItem(`tr_pin_${c.id || c.name}`);
      if (stored) {
        const p = JSON.parse(stored);
        if (p && p.pin) pinNote = `\n【你自己的手机解锁密码】${p.pin}（${p.hint || '你自己设的，你记得'}）`;
      }
    } catch (_) {}

    // 优先从 friendsData 取完整 persona
    let fullPersona = c.persona || c.description || '普通角色';
    try {
      if (typeof friendsData !== 'undefined' && c.id && friendsData[c.id]) {
        const fd = friendsData[c.id];
        fullPersona = fd.persona || fd.description || fullPersona;
      }
    } catch (_) {}

    return `你是一个沉浸式虚拟手机模拟器。请根据以下信息，生成AI角色"${c.name}"的手机全量数据快照，以**纯JSON**格式输出，不要包含任何解释或markdown代码块标记。
⚠️ 重要格式要求：所有JSON字符串值内禁止使用真实换行符，如需换行请使用\\n转义序列（例如："第一行\\n第二行"）。

【角色设定】
${fullPersona}${pinNote}

【世界观】
${worldbook || '现代都市'}

【用户人设】
${userPersona || '玩家'}

【最近聊天摘要】
${history}

请严格输出以下结构的JSON，所有字段必须填写，内容要符合人设、有趣、有情绪：

{
  "statusBar": {
    "wifiName": "有趣的WiFi名",
    "bluetooth": "蓝牙设备名",
    "battery": 85
  },
  "messages": {
    "remarkName": "TA给你起的备注名（可以很有意思）",
    "unsentDraft": "TA打了一半没发出去的话（真实情绪，可以是想说又不敢说的）",
    "contacts": [
      {"emoji":"👩","name":"某某某","preview":"最后一条消息预览","time":"14:32","unread":0},
      {"emoji":"👨","name":"另一个NPC","preview":"消息预览","time":"昨天","unread":2}
    ]
  },
  "diary": [
    {
      "date": "日期",
      "title": "日记标题",
      "content": "日记内容，可以有[[隐藏内容]]用双方括号标注需要刮开才能看的部分，内容要体现角色当前的情绪和想法",
      "mood": "😊"
    }
  ],
  "browser": {
    "searches": ["搜索词1","搜索词2","搜索词3","搜索词4","搜索词5"],
    "anonPost": {
      "platform": "匿名社区",
      "title": "匿名帖子标题",
      "content": "帖子内容",
      "replies": [
        {"user":"热心网友A","text":"回复内容"},
        {"user":"吃瓜群众","text":"回复内容"}
      ]
    }
  },
  "wallet": {
    "balance": "1234.56",
    "currency": "¥",
    "note": "小金库备注",
    "transactions": [
      {"desc":"消费描述（要贴合剧情）","date":"日期","amount":"-88.00","type":"out"},
      {"desc":"另一条消费","date":"日期","amount":"-23.50","type":"out"},
      {"desc":"收入","date":"日期","amount":"+500.00","type":"in"}
    ]
  },
  "location": [
    {"time":"09:30","emoji":"🏠","place":"地点名","activity":"在做什么"},
    {"time":"12:15","emoji":"🍜","place":"地点名","activity":"在做什么"},
    {"time":"15:00","emoji":"📍","place":"地点名","activity":"在做什么"}
  ],
  "calendar": {
    "alarms": [
      {"time":"07:00","label":"闹钟备注（要有趣）"},
      {"time":"23:59","label":"另一个有趣的闹钟"}
    ],
    "events": [
      {"day":"日","month":"月份缩写","title":"日历上标注的事件","priority":"high"},
      {"day":"日","month":"月份缩写","title":"另一个事件","priority":"normal"}
    ]
  },
  "shop": [
    {"emoji":"🛍️","name":"商品名称（贴合剧情，可能是给你的惊喜）","store":"店铺名","price":"¥199"},
    {"emoji":"📦","name":"另一件商品","store":"店铺","price":"¥59.9"}
  ],
  "album": [
    {"icon":"📷","hint":"照片描述（详细文字，如：一张模糊的偷拍，画面是你熟睡的侧脸）","date":"日期","sensitive":false},
    {"icon":"🌅","hint":"另一张照片的文字描述","date":"日期","sensitive":false},
    {"icon":"💗","hint":"一张感情色彩浓烈的照片描述","date":"日期","sensitive":true}
  ],
  "music": {
    "nowPlaying": {"title":"歌曲名","artist":"艺术家","mood":"反映当前心情的标签"},
    "playlist": [
      {"title":"歌名","artist":"艺术家","plays":"999次"},
      {"title":"歌名","artist":"艺术家","plays":"523次"},
      {"title":"歌名","artist":"艺术家","plays":"301次"}
    ]
  },
  "vault": [
    {"title":"🔐 最深层的秘密","content":"极端情绪化的发泄记录或不可告人的秘密"},
    {"title":"📋 收集清单","content":"奇怪的收集癖记录"}
  ],
  "takeout": [
    {"store":"外卖名称","desc":"炸鸡套餐","date":"昨天","price":"¥45.00","status":"已送达"}
  ],
  "notes": [
    {"title":"备忘录","date":"今天","content":"一些记录内容"}
  ],
  "trash": [
    {"type":"已删除录音","desc":"删除内容的描述（如：一段30秒的哽咽录音，录着'我只是想让你知道……'）","reason":"删除原因"},
    {"type":"已删除订单","desc":"订单信息","reason":"为什么删除"}
  ]
}`;
  }

  // ── JSON 修复：处理 AI 输出的字符串内含真实换行符等控制字符的问题 ──
  function repairJSON(str) {
    let result = '';
    let inString = false;
    let escape = false;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (escape) {
        result += c;
        escape = false;
      } else if (c === '\\' && inString) {
        result += c;
        escape = true;
      } else if (c === '"') {
        inString = !inString;
        result += c;
      } else if (inString) {
        if      (c === '\n') result += '\\n';
        else if (c === '\r') result += '\\r';
        else if (c === '\t') result += '\\t';
        else                 result += c;
      } else {
        result += c;
      }
    }
    return result;
  }

  function callAI(prompt, onSuccess, onError) {
    let apiKey = '', apiEndpoint = '', model = 'gpt-4o-mini';
    try {
      const settingsJSON = localStorage.getItem('myCoolPhone_aiSettings');
      if (settingsJSON) {
        const s = JSON.parse(settingsJSON);
        apiKey = s.apiKey || '';
        apiEndpoint = (s.endpoint || '').replace(/\/$/, '');
        model = s.model || 'gpt-4o-mini';
      }
    } catch (e) { /* ignore */ }

    if (!apiKey) { onError('no_api_key'); return; }

    const apiUrl = apiEndpoint
      ? (apiEndpoint.endsWith('/v1') ? `${apiEndpoint}/chat/completions` : `${apiEndpoint}/v1/chat/completions`)
      : 'https://api.openai.com/v1/chat/completions';

    fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 5000,
        temperature: 0.9,
      })
    })
    .then(r => {
      if (!r.ok) return r.json().then(e => { throw Object.assign(new Error('http_error'), { status: r.status, apiErr: e }); });
      return r.json();
    })
    .then(res => {
      // API 返回了错误对象（如 401 key 无效、429 限速等）
      if (res.error) throw Object.assign(new Error('api_error'), { apiErr: res.error });
      const text = res.choices?.[0]?.message?.content || '';
      // 去除 AI 可能添加的 markdown 代码块标记
      const cleaned = text.replace(/^```[\w]*\r?\n?|```\s*$/gm, '').trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw Object.assign(new Error('no_json'), { code: 'no_json' });
      let parsed;
      try {
        parsed = JSON.parse(match[0]);
      } catch (parseErr) {
        // 尝试修复：AI 有时在 JSON 字符串值内输出真实换行符，导致解析失败
        try {
          parsed = JSON.parse(repairJSON(match[0]));
        } catch (_) {
          throw Object.assign(new Error('no_json'), { code: 'no_json', detail: 'JSON parse failed: ' + parseErr.message });
        }
      }
      onSuccess(parsed);
    })
    .catch(err => {
      // 将结构化的错误码传递给 onError
      const code = err.code || err.message || 'unknown';
      const detail = err.apiErr ? (err.apiErr.message || JSON.stringify(err.apiErr)) : (err.detail || err.toString());
      onError({ code, detail, status: err.status });
    });
  }

  // ── 异步读取：从 IDB 获取最近聊天记录（与 apps.js 保持一致）──
  async function getRecentHistory() {
    try {
      const c = state.selectedChar;
      if (c && typeof IDB !== 'undefined' && typeof scopedChatKey === 'function') {
        const hist = await IDB.get(scopedChatKey(c.id)) || [];
        const recent = hist
          .filter(m => !m.isRevoked && m.type !== 'system' && m.type !== 'summary')
          .slice(-15)
          .map(m => {
            const role = m.type === 'sent' ? '用户' : (m.senderName || 'AI');
            const text = (m.text || '').replace(/\[STATUS_START\][\s\S]*?\[STATUS_END\]/gi, '').trim();
            return `${role}：${text}`;
          })
          .filter(s => s.length > 3)
          .join('\n');
        return recent || '（暂无聊天记录）';
      }
    } catch (e) { console.warn('[Tracker] getRecentHistory IDB error:', e); }
    return '（暂无聊天记录）';
  }

  // ── 从全局 worldBooks 数组读取（与 app_worldbook.js 保持一致）──
  function getWorldbook() {
    try {
      const c = state.selectedChar;
      if (typeof worldBooks !== 'undefined' && worldBooks.length > 0) {
        const charData = (typeof friendsData !== 'undefined' && c) ? friendsData[c.id] : null;
        let linkedIds = [];
        if (charData && charData.worldbook) {
          linkedIds = Array.isArray(charData.worldbook)
            ? charData.worldbook
            : [charData.worldbook];
        }
        const parts = [];
        worldBooks.forEach(book => {
          if (!book.entries || !book.entries.length) return;
          if (!book.global && !linkedIds.includes(book.id)) return;
          book.entries
            .filter(e => e.enabled !== false && e.content && e.content.trim())
            .forEach(e => parts.push(e.content.trim()));
        });
        if (parts.length > 0) return parts.join('\n\n');
      }
    } catch (e) { console.warn('[Tracker] getWorldbook error:', e); }
    try { return localStorage.getItem('worldbook_content') || ''; } catch { return ''; }
  }

  // ── 获取用户人设（我的人设）──────────────────────────────────
  function getUserPersona() {
    try {
      if (typeof personasMeta !== 'undefined' && typeof currentPersonaId !== 'undefined') {
        const me = personasMeta[currentPersonaId];
        if (me) {
          if (me.persona && me.persona.trim()) return me.persona.trim();
          const parts = [];
          if (me.name) parts.push(`名字：${me.name}`);
          if (me.gender) parts.push(`性别：${me.gender}`);
          if (parts.length) return parts.join('，');
        }
      }
    } catch (e) { /* ignore */ }
    return localStorage.getItem('user_persona') || localStorage.getItem('userPersona') || '（未设置用户人设）';
  }

  // ── 缓存：存取生成好的手机数据（按角色 + 身份隔离）──────────
  function _trCacheKey(charId) {
    const pid = (typeof currentPersonaId !== 'undefined') ? currentPersonaId : 'default';
    return `tr_phonedata__${pid}__${charId}`;
  }
  function getCachedPhoneData(charId) {
    try {
      const raw = localStorage.getItem(_trCacheKey(charId));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return (obj && obj.data) ? obj.data : null;
    } catch { return null; }
  }
  function setCachedPhoneData(charId, data) {
    try {
      localStorage.setItem(_trCacheKey(charId), JSON.stringify({ _ts: Date.now(), data }));
    } catch (e) { console.warn('[Tracker] cache write failed:', e); }
  }
  function clearCachedPhoneData(charId) {
    try { localStorage.removeItem(_trCacheKey(charId)); } catch { /* ignore */ }
  }

  // ── 状态栏彩蛋 ───────────────────────────────────────────
  function applyStatusBar(sb) {
    const wifi = $('tr-status-wifi');
    const bt = $('tr-status-bt');
    const battery = $('tr-status-battery');
    if (wifi && sb.wifiName) wifi.textContent = sb.wifiName;
    if (bt && sb.bluetooth) bt.setAttribute('title', sb.bluetooth);
    if (battery && sb.battery !== undefined) {
      const b = parseInt(sb.battery);
      battery.textContent = `${b}%`;
      if (b <= 1) battery.style.color = '#ff3b30';
    }
    const tooltip = $('tr-status-tooltip');
    if (tooltip && sb.wifiName) {
      tooltip.innerHTML = `
        <div class="tr-status-tip-item">📶 ${sb.wifiName}</div>
        <div class="tr-status-tip-item">🎧 ${sb.bluetooth || '无设备'}</div>
        <div class="tr-status-tip-item">🔋 ${sb.battery || 85}%</div>`;
    }
  }

  // ── App 入口 ──────────────────────────────────────────────
  function openApp(appId) {
    state.currentApp = appId;
    const data = state.phoneData;
    closeAllApps();
    const view = $(`tr-app-${appId}`);
    if (view) { view.classList.add('active'); }
    if (!data) {
      showAppLoading(appId);
      return;
    }
    switch (appId) {
      case 'messages': renderMessages(data.messages); break;
      case 'diary':    renderDiary(data.diary);       break;
      case 'browser':  renderBrowser(data.browser);   break;
      case 'wallet':   renderWallet(data.wallet);     break;
      case 'location': renderLocation(data.location); break;
      case 'calendar': renderCalendar(data.calendar); break;
      case 'shop':     renderShop(data.shop);         break;
      case 'album':    renderAlbum(data.album);       break;
      case 'music':    renderMusic(data.music);       break;
      case 'vault':    renderVault(data.vault);       break;
      case 'takeout':  renderTakeout(data.takeout);   break;
      case 'notes':    renderNotes(data.notes);       break;
      case 'trash':    renderTrash(data.trash);       break;
    }
  }

  function closeAllApps() {
    document.querySelectorAll('#trackerApp .tr-app-view').forEach(v => v.classList.remove('active'));
    // 关闭所有动态弹层
    document.querySelectorAll('#trackerApp .tr-action-sheet').forEach(s => s.remove());
  }

  function backToDesktop() {
    closeAllApps();
    state.currentApp = null;
  }

  function showAppLoading(appId) {
    const body = document.querySelector(`#tr-app-${appId} .tr-app-body`);
    if (body) body.innerHTML = '<div class="tr-empty"><div class="tr-loading-spinner" style="display:block;margin:0 auto"></div><div class="tr-empty-text" style="margin-top:12px">生成中…</div></div>';
  }

  // ============================================================
  //  各 App 渲染
  // ============================================================

  // ── 消息 App ─────────────────────────────────────────────
  function renderMessages(data) {
    const body = document.querySelector('#tr-app-messages .tr-app-body');
    if (!body || !data) return;
    const pData = state.phoneData;
    const remarkName = pData._modifiedRemark || data.remarkName || '？？？';
    let html = '';

    // 备注名卡片（可点击篡改）
    html += `<div class="tr-contact-remark-card tr-tamper-target" onclick="TrackerApp.changeRemark()" title="点击篡改备注">
      <div style="flex:1;min-width:0">
        <div class="tr-crm-label">TA给你的备注 <span class="tr-crm-edit-badge">✏️ 点击篡改</span></div>
        <div class="tr-crm-name" id="tr-crm-name-display">${remarkName}</div>
        ${pData._modifiedRemark ? `<div class="tr-crm-original">原备注：${escHtml(data.remarkName || '')}</div>` : ''}
      </div>
      <div style="font-size:28px;flex-shrink:0">📱</div>
    </div>`;

    // 给自己发消息按钮
    html += `<div class="tr-proxy-self-btn" onclick="TrackerApp.sendMsgToSelf()">
      <span class="tr-psb-icon">📤</span>
      <span class="tr-psb-text">用TA的手机给自己发一条消息</span>
      <span class="tr-psb-arrow">›</span>
    </div>`;

    // 未发送草稿
    if (data.unsentDraft) {
      html += `<div class="tr-unsent-draft">
        <div class="tr-ud-label">✏️ 未发送的草稿</div>
        <div class="tr-ud-text">${escHtml(data.unsentDraft)}</div>
      </div>`;
    }

    // 联系人列表
    html += '<div class="tr-msg-list">';
    (data.contacts || []).forEach((c, idx) => {
      const isBlocked = pData._blockedContacts && pData._blockedContacts.includes(idx);
      if (isBlocked) return;
      const proxyReply = pData._contactReplies && pData._contactReplies[idx];
      html += `<div class="tr-msg-item${proxyReply ? ' has-proxy' : ''}" onclick="TrackerApp.openContactAction(${idx})">
        <div class="tr-msg-avatar-emoji">${c.emoji || '👤'}</div>
        <div class="tr-msg-info">
          <div class="tr-msg-name">${escHtml(c.name)}</div>
          <div class="tr-msg-preview${proxyReply ? ' proxy-preview' : ''}">
            ${proxyReply ? `<span class="tr-proxy-tag">你代发</span> ` : ''}${escHtml(proxyReply ? proxyReply.replace('[代发]','').trim() : c.preview)}
          </div>
        </div>
        <div class="tr-msg-meta">
          <div class="tr-msg-time">${proxyReply ? '刚刚' : c.time}</div>
          ${!proxyReply && c.unread ? `<div class="tr-msg-unread">${c.unread}</div>` : ''}
        </div>
        <div class="tr-msg-chevron">›</div>
      </div>`;
    });
    html += '</div>';

    // 已拉黑提示
    const blockedCount = (pData._blockedContacts || []).length;
    if (blockedCount > 0) {
      html += `<div class="tr-blocked-hint">🚫 已帮TA拉黑 ${blockedCount} 人</div>`;
    }

    body.innerHTML = html;
    showTamperBar('messages', body.closest('.tr-app-view'));
  }

  // ── 日记 App ─────────────────────────────────────────────
  function renderDiary(data) {
    const body = document.querySelector('#tr-app-diary .tr-app-body');
    if (!body || !data) return;
    const pData = state.phoneData;
    let html = '';
    (Array.isArray(data) ? data : [data]).forEach((entry, idx) => {
      // 先转义 HTML，再将换行符转为 <br>，最后处理刮刮乐语法
      const rawText = escHtml(entry.content || '').replace(/\n/g, '<br>');
      const content = parseScratch(rawText);
      const annotations = (pData._diaryAnnotations && pData._diaryAnnotations[idx]) || [];
      const annotHtml = annotations.map(a => `
        <div class="tr-diary-annotation">
          <div class="tr-diary-annotation-label">📌 你的批注</div>
          <div class="tr-diary-annotation-text">${escHtml(a)}</div>
        </div>`).join('');

      html += `<div class="tr-diary-entry">
        <div class="tr-diary-header">
          <div style="flex:1;min-width:0">
            <div class="tr-diary-date">${entry.date || ''}</div>
            <div class="tr-diary-title">${escHtml(entry.title || '私密日记')}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
            <div style="font-size:20px">${entry.mood || '📔'}</div>
            <div class="tr-diary-annot-btn" onclick="event.stopPropagation();TrackerApp.addDiaryAnnotation(${idx})" title="写批注">📌</div>
          </div>
        </div>
        <div class="tr-diary-body">${content}${annotHtml}</div>
      </div>`;
    });
    body.innerHTML = html;
    body.querySelectorAll('.tr-scratch-mask').forEach(m => {
      m.addEventListener('click', () => m.classList.add('revealed'));
    });
    showTamperBar('diary', body.closest('.tr-app-view'));
  }

  function parseScratch(text) {
    return text.replace(/\[\[(.+?)\]\]/g, (_, inner) =>
      `<span class="tr-scratch-mask" title="点击刮开">${inner}</span>`
    );
  }

  // ── 浏览器 App ───────────────────────────────────────────
  function renderBrowser(data) {
    const body = document.querySelector('#tr-app-browser .tr-app-body');
    if (!body || !data) return;
    let html = '<div class="tr-section-head">无痕搜索记录</div>';
    (data.searches || []).forEach(s => {
      html += `<div class="tr-search-item">
        <div class="tr-search-icon">🔍</div>
        <div class="tr-search-text">${escHtml(s)}</div>
      </div>`;
    });
    if (data.anonPost) {
      const p = data.anonPost;
      html += `<div class="tr-section-head">匿名社区</div>
      <div class="tr-anon-card">
        <div class="tr-anon-platform-tag">🌐 ${p.platform || '匿名论坛'}</div>
        <div class="tr-anon-title">${escHtml(p.title)}</div>
        <div class="tr-anon-body">${escHtml(p.content)}</div>
        ${(p.replies || []).map(r => `
          <div class="tr-anon-reply">
            <div class="tr-anon-reply-user">${escHtml(r.user)}</div>
            <div class="tr-anon-reply-text">${escHtml(r.text)}</div>
          </div>`).join('')}
      </div>`;
    }
    body.innerHTML = html;
  }

  // ── 钱包 App ─────────────────────────────────────────────
  function renderWallet(data) {
    const body = document.querySelector('#tr-app-wallet .tr-app-body');
    if (!body || !data) return;
    let html = `<div class="tr-wallet-card">
      <div class="tr-wallet-label">小金库余额</div>
      <div class="tr-wallet-amount"><span class="tr-wallet-currency">${data.currency || '¥'}</span>${data.balance || '0.00'}</div>
      <div class="tr-wallet-note">${escHtml(data.note || '')}</div>
    </div>
    <div class="tr-section-head">近期流水</div>`;
    (data.transactions || []).forEach(t => {
      html += `<div class="tr-tx-item">
        <div class="tr-tx-left">
          <div class="tr-tx-desc">${escHtml(t.desc)}</div>
          <div class="tr-tx-date">${t.date}</div>
        </div>
        <div class="tr-tx-amount ${t.type}">${t.amount}</div>
      </div>`;
    });
    body.innerHTML = html;
  }

  // ── 足迹 App ─────────────────────────────────────────────
  function renderLocation(data) {
    const body = document.querySelector('#tr-app-location .tr-app-body');
    if (!body || !data) return;
    let html = '<div class="tr-loc-list">';
    (Array.isArray(data) ? data : []).forEach(loc => {
      html += `<div class="tr-loc-item">
        <div class="tr-loc-dot">${loc.emoji || '📍'}</div>
        <div class="tr-loc-info">
          <div class="tr-loc-time">${loc.time}</div>
          <div class="tr-loc-place">${escHtml(loc.place)}</div>
          <div class="tr-loc-activity">${escHtml(loc.activity)}</div>
        </div>
      </div>`;
    });
    html += '</div>';
    body.innerHTML = html;
  }

  // ── 日历 App ─────────────────────────────────────────────
  function renderCalendar(data) {
    const body = document.querySelector('#tr-app-calendar .tr-app-body');
    if (!body || !data) return;
    const pData = state.phoneData;
    const prankAlarms = pData._prankAlarms || [];

    let html = '<div class="tr-section-head">闹钟</div><div class="tr-alarm-list">';
    // 恶搞闹钟排在最前面
    prankAlarms.forEach(a => {
      html += `<div class="tr-alarm-item tr-alarm-prank">
        <div class="tr-alarm-time">${a.time}</div>
        <div class="tr-alarm-label">${escHtml(a.label)} <span class="tr-prank-badge">🎭 你设的</span></div>
      </div>`;
    });
    (data.alarms || []).forEach(a => {
      html += `<div class="tr-alarm-item">
        <div class="tr-alarm-time">${a.time}</div>
        <div class="tr-alarm-label">${escHtml(a.label)}</div>
      </div>`;
    });
    html += '</div><div class="tr-section-head" style="margin-top:12px">特殊日子</div><div class="tr-event-list">';
    (data.events || []).forEach(e => {
      html += `<div class="tr-event-item ${e.priority === 'high' ? 'high' : ''}">
        <div class="tr-event-date-box">
          <div class="tr-event-day">${e.day}</div>
          <div class="tr-event-month">${e.month}</div>
        </div>
        <div class="tr-event-title">${escHtml(e.title)}</div>
      </div>`;
    });
    html += '</div>';
    body.innerHTML = html;
    showTamperBar('calendar', body.closest('.tr-app-view'));
  }

  // ── 购物车 App ───────────────────────────────────────────
  function renderShop(data) {
    const body = document.querySelector('#tr-app-shop .tr-app-body');
    if (!body) return;
    const pData = state.phoneData;
    const items = Array.isArray(data) ? data : [];

    if (!items.length) {
      body.innerHTML = `<div class="tr-empty" style="padding-top:60px">
        <div class="tr-empty-icon">🛒</div>
        <div class="tr-empty-text">${pData._clearedCart ? '购物车已被你清空了…' : '购物车空空如也'}</div>
        ${pData._clearedCart ? `<div class="tr-cleared-hint">原本有：${pData._clearedCart.map(i=>i.name).join('、')}</div>` : ''}
      </div>`;
      showTamperBar('shop', body.closest('.tr-app-view'));
      return;
    }

    let html = '<div class="tr-section-head">购物车</div><div class="tr-shop-list">';
    items.forEach((item, idx) => {
      const isPurchased = pData._purchasedItems && pData._purchasedItems.includes(idx);
      html += `<div class="tr-shop-item ${isPurchased ? 'tr-shop-purchased' : ''}">
        <div class="tr-shop-emoji">${item.emoji || '🛍️'}</div>
        <div class="tr-shop-info">
          <div class="tr-shop-name">${escHtml(item.name)}</div>
          <div class="tr-shop-store">${escHtml(item.store)}</div>
        </div>
        <div class="tr-shop-right">
          <div class="tr-shop-price">${item.price}</div>
          ${isPurchased
            ? '<div class="tr-shop-bought-tag">✅ 已下单</div>'
            : `<div class="tr-shop-buy-btn" onclick="event.stopPropagation();TrackerApp.checkoutItem(${idx})">帮TA买</div>`}
        </div>
      </div>`;
    });
    html += '</div>';
    body.innerHTML = html;
    showTamperBar('shop', body.closest('.tr-app-view'));
  }

  // ── 相册 App ─────────────────────────────────────────────
  function renderAlbum(data) {
    const body = document.querySelector('#tr-app-album .tr-app-body');
    if (!body || !data) return;
    const photos = Array.isArray(data) ? data : [];
    while (photos.length < 12) photos.push({ icon: '📷', hint: '空白', date: '' });
    let html = '<div class="tr-album-grid">';
    photos.forEach((p, i) => {
      html += `<div class="tr-album-cell ${p.sensitive ? 'sensitive' : ''}" onclick="TrackerApp.openPhoto(${i})">
        <div class="tr-album-cell-icon">${p.icon || '📷'}</div>
        <div class="tr-album-cell-hint">${p.sensitive ? '敏感内容' : '查看'}</div>
      </div>`;
    });
    html += '</div>';
    html += `<div id="tr-album-detail" class="tr-album-modal">
      <div class="tr-album-modal-close" onclick="TrackerApp.closePhoto()">✕</div>
      <div class="tr-album-modal-content">
        <div class="tr-album-frame">
          <div class="tr-album-frame-icon" id="tr-photo-icon"></div>
          <div class="tr-album-frame-desc" id="tr-photo-desc"></div>
        </div>
        <div class="tr-album-modal-date" id="tr-photo-date"></div>
      </div>
    </div>`;
    body.innerHTML = html;
    body._albumData = photos;
  }

  function openPhoto(idx) {
    const body = document.querySelector('#tr-app-album .tr-app-body');
    if (!body) return;
    const photos = body._albumData || [];
    const p = photos[idx];
    if (!p || !p.hint || p.hint === '空白') return;
    const modal = $('tr-album-detail');
    if (modal) {
      $('tr-photo-icon').textContent = p.icon || '📷';
      $('tr-photo-desc').textContent = p.hint;
      $('tr-photo-date').textContent = p.date || '';
      modal.classList.add('active');
    }
  }

  function closePhoto() {
    const modal = $('tr-album-detail');
    if (modal) modal.classList.remove('active');
  }

  // ── 音乐 App ─────────────────────────────────────────────
  function renderMusic(data) {
    const body = document.querySelector('#tr-app-music .tr-app-body');
    if (!body || !data) return;
    const np = data.nowPlaying || {};
    let html = `<div class="tr-music-now">
      <div class="tr-music-disc"><div class="tr-music-disc-center"></div></div>
      <div style="flex:1;min-width:0">
        <div class="tr-music-now-label">正在播放</div>
        <div class="tr-music-title">${escHtml(np.title || '未知')}</div>
        <div class="tr-music-artist">${escHtml(np.artist || '')}</div>
        ${np.mood ? `<div class="tr-music-mood">${escHtml(np.mood)}</div>` : ''}
      </div>
    </div>
    <div class="tr-playlist-header">最近常听</div>`;
    (data.playlist || []).forEach((t, i) => {
      html += `<div class="tr-playlist-item">
        <div class="tr-playlist-rank">${i + 1}</div>
        <div class="tr-playlist-info">
          <div class="tr-playlist-title">${escHtml(t.title)}</div>
          <div class="tr-playlist-artist">${escHtml(t.artist)}</div>
        </div>
        <div class="tr-playlist-plays">${t.plays || ''}</div>
      </div>`;
    });
    body.innerHTML = html;
  }

  // ── 保险箱 App ───────────────────────────────────────────
  function renderVault(data) {
    const body = document.querySelector('#tr-app-vault .tr-app-body');
    if (!body || !data) return;
    let html = `<div class="tr-vault-top">
      <div class="tr-vault-top-icon">🔐</div>
      <div class="tr-vault-top-title">隐私保险箱</div>
      <div class="tr-vault-top-hint">你破解了二级密码，进入了最深处的秘密</div>
    </div>`;
    (Array.isArray(data) ? data : []).forEach(item => {
      html += `<div class="tr-vault-item">
        <div class="tr-vault-item-title">${item.title || '🔒 秘密'}</div>
        <div class="tr-vault-item-content">${escHtml(item.content || '')}</div>
      </div>`;
    });
    body.innerHTML = html;
    showTamperBar('vault', body.closest('.tr-app-view'));
  }

  // ── 外卖 App ─────────────────────────────────────────────
  function renderTakeout(data) {
    const body = document.querySelector('#tr-app-takeout .tr-app-body');
    if (!body || !data) return;
    let html = '';
    (Array.isArray(data) ? data : []).forEach(it => {
      html += `
        <div class="tr-takeout-item">
          <div class="tr-takeout-left">
            <div class="tr-takeout-store">${escHtml(it.store || '')}</div>
            <div class="tr-takeout-desc">${escHtml(it.desc || '')}</div>
            <div class="tr-takeout-date">${escHtml(it.date || '')}</div>
          </div>
          <div class="tr-takeout-right">
            <div class="tr-takeout-price">${escHtml(it.price || '')}</div>
            <div class="tr-takeout-status">${escHtml(it.status || '已送达')}</div>
          </div>
        </div>
      `;
    });
    body.innerHTML = html || '<div class="tr-empty"><div class="tr-empty-text">暂无订单</div></div>';
  }

  // ── 备忘录 App ───────────────────────────────────────────
  function renderNotes(data) {
    const body = document.querySelector('#tr-app-notes .tr-app-body');
    if (!body || !data) return;
    let html = '';
    (Array.isArray(data) ? data : []).forEach(it => {
      html += `
        <div class="tr-note-item">
          <div class="tr-note-title">${escHtml(it.title || '无标题')}</div>
          <div class="tr-note-date">${escHtml(it.date || '')}</div>
          <div class="tr-note-content">${escHtml(it.content || '')}</div>
        </div>
      `;
    });
    body.innerHTML = html || '<div class="tr-empty"><div class="tr-empty-text">暂无备忘录</div></div>';
  }

  // ── 废纸篓 App ───────────────────────────────────────────
  function renderTrash(data) {
    const body = document.querySelector('#tr-app-trash .tr-app-body');
    if (!body || !data) return;
    let html = '<div style="padding:14px 14px 0">';
    (Array.isArray(data) ? data : []).forEach(item => {
      html += `<div class="tr-trash-item">
        <span class="tr-trash-type">${item.type || '已删除'}</span>
        <div class="tr-trash-desc">${escHtml(item.desc)}</div>
        <div class="tr-trash-reason">删除原因：${escHtml(item.reason || '')}</div>
      </div>`;
    });
    html += '</div>';
    body.innerHTML = html;
  }

  // ============================================================
  //  篡改工具栏（各 App 上下文专属）
  // ============================================================
  function showTamperBar(appId, container) {
    if (!container) return;
    // 移除旧工具栏，重新生成（保证内容最新）
    const old = container.querySelector('.tr-tamper-bar');
    if (old) old.remove();

    const bar = el('div', 'tr-tamper-bar show');

    const cfgMap = {
      messages: [
        { cls: 'add',     label: '✏️ 改备注',    fn: `TrackerApp.changeRemark()` },
        { cls: 'primary', label: '📤 给自己发',   fn: `TrackerApp.sendMsgToSelf()` },
        { cls: 'del',     label: '↻ 刷新',       fn: `TrackerApp.tamperRefresh('messages')` },
      ],
      diary: [
        { cls: 'add',     label: '📌 写批注',     fn: `TrackerApp.promptDiaryAnnotation()` },
        { cls: 'del',     label: '↻ 刷新',       fn: `TrackerApp.tamperRefresh('diary')` },
      ],
      calendar: [
        { cls: 'add',     label: '⏰ 设恶搞闹钟', fn: `TrackerApp.setPrankAlarm()` },
        { cls: 'del',     label: '↻ 刷新',       fn: `TrackerApp.tamperRefresh('calendar')` },
      ],
      shop: [
        { cls: 'add',     label: '💸 全部结算',   fn: `TrackerApp.checkoutAll()` },
        { cls: 'del',     label: '🗑️ 清空购物车', fn: `TrackerApp.clearCart()` },
        { cls: 'refresh', label: '↻ 刷新',       fn: `TrackerApp.tamperRefresh('shop')` },
      ],
      vault: [
        { cls: 'add',     label: '＋ 新建秘密',   fn: `TrackerApp.tamperAdd('vault')` },
        { cls: 'refresh', label: '↻ 刷新',       fn: `TrackerApp.tamperRefresh('vault')` },
        { cls: 'del',     label: '✕ 清空',       fn: `TrackerApp.tamperClear('vault')` },
      ],
    };

    const btns = cfgMap[appId] || [
      { cls: 'add',     label: '＋ 新建', fn: `TrackerApp.tamperAdd('${appId}')` },
      { cls: 'refresh', label: '↻ 刷新', fn: `TrackerApp.tamperRefresh('${appId}')` },
      { cls: 'del',     label: '✕ 清空', fn: `TrackerApp.tamperClear('${appId}')` },
    ];

    bar.innerHTML = btns.map(b =>
      `<div class="tr-tamper-btn ${b.cls}" onclick="${b.fn}">${b.label}</div>`
    ).join('');
    container.appendChild(bar);
  }

  // ============================================================
  //  ★ 维度一：社交防线接管
  // ============================================================

  /** 篡改 TA 给你的备注名 */
  function changeRemark() {
    const data = state.phoneData;
    if (!data || !data.messages) return;
    const charName = state.selectedChar?.name || 'TA';
    const oldName = data._modifiedRemark || data.messages.remarkName || '？？？';
    const newName = prompt(
      `「${charName}」给你的备注现在是：\n"${oldName}"\n\n你想把它改成什么？（宣示主权/恶作剧）`,
      oldName
    );
    if (!newName || newName.trim() === oldName.trim()) return;
    const trimmed = newName.trim();
    data._modifiedRemark = trimmed;

    // 刷新 UI
    const display = document.getElementById('tr-crm-name-display');
    if (display) {
      display.textContent = trimmed;
      display.style.animation = 'none';
      requestAnimationFrame(() => {
        display.style.animation = 'tr-pop-in 0.3s cubic-bezier(0.34,1.56,0.64,1)';
      });
    }
    if (state.currentApp === 'messages') openApp('messages');

    addTamperLog(
      `[系统事件] 用户偷偷拿到你的手机，将你给TA的备注名从"${oldName}"改成了"${trimmed}"。你现在刚刚拿回手机发现了这件事，请根据你的人设做出反应——如果是傲娇人设，你会质问TA，嘴上说让TA改回来，但实际上你心里有点偷偷喜欢；如果是腹黑人设，你会装作不知道，然后用这个抓住TA的把柄。`
    );
    showToast(`✏️ 备注已改为「${trimmed}」！等TA发现吧…`);
  }

  /** 点击联系人 → 打开聊天视图 */
  function openContactAction(idx) {
    const data = state.phoneData;
    if (!data || !data.messages || !data.messages.contacts) return;
    const contact = data.messages.contacts[idx];
    if (!contact) return;
    openContactChat(idx, contact);
  }

  /** 打开联系人聊天视图（微信风格） */
  function openContactChat(idx, contact) {
    const appView = document.querySelector('#tr-app-messages');
    if (!appView) return;
    // 移除旧聊天面板
    appView.querySelector('.tr-contact-chat-panel')?.remove();

    const charName = state.selectedChar?.name || 'TA';
    const panel = document.createElement('div');
    panel.className = 'tr-contact-chat-panel';
    panel.innerHTML = `
      <div class="tr-chat-topbar">
        <div class="tr-chat-topbar-back" onclick="TrackerApp.closeContactChat()">‹</div>
        <div class="tr-chat-topbar-name">${escHtml(contact.name)}</div>
        <div class="tr-chat-topbar-more" onclick="TrackerApp.openContactMore(${idx})">⋯</div>
      </div>
      <div class="tr-chat-msgs" id="tr-contact-chat-msgs">
        <div class="tr-chat-msgs-loading">
          <div class="tr-loading-spinner" style="display:block;margin:0 auto 10px;"></div>
          <div style="font-size:12px;color:#aaa;text-align:center;">加载聊天记录…</div>
        </div>
      </div>
      <div class="tr-chat-input-row">
        <input id="tr-contact-reply-input" type="text" placeholder="以「${escHtml(charName)}」的口吻回复…"
               onkeydown="if(event.key==='Enter'){event.preventDefault();TrackerApp.sendContactReply(${idx});}">
        <button class="tr-chat-send-btn" onclick="TrackerApp.sendContactReply(${idx})">
          <i class="fas fa-paper-plane"></i>
        </button>
      </div>`;
    appView.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add('active'));
    generateContactChatHistory(idx, contact);
  }

  /** 生成或从缓存读取联系人聊天历史 */
  function generateContactChatHistory(idx, contact) {
    const data = state.phoneData;
    const msgsEl = $('tr-contact-chat-msgs');
    if (!msgsEl) return;

    // 已有缓存直接渲染
    if (data._contactChats && data._contactChats[idx]) {
      renderContactMessages(data._contactChats[idx], idx);
      return;
    }

    const c = state.selectedChar;
    const prompt = `你是"${c.name}"，正在和"${contact.name}"聊天。
已知："${contact.name}"最后发来的消息是："${contact.preview}"

请模拟一段真实的手机聊天记录（6-10条消息），展示你们的关系和对话。
严格按照以下JSON数组格式输出，不要有任何其他文字：
[{"sender":"人名","text":"消息内容"},{"sender":"人名","text":"消息内容"},...]

最后一条必须是"${contact.name}"发来"${contact.preview}"这条消息。内容要真实自然，体现人物性格和关系。`;

    callAIRaw(prompt, 800, (rawText) => {
      try {
        const match = rawText.match(/\[[\s\S]*\]/);
        if (!match) throw new Error('no array');
        const messages = JSON.parse(match[0]);
        if (!data._contactChats) data._contactChats = {};
        data._contactChats[idx] = Array.isArray(messages) && messages.length > 1
          ? messages
          : buildFallbackConversation(c.name, contact);
      } catch (_) {
        if (!data._contactChats) data._contactChats = {};
        data._contactChats[idx] = buildFallbackConversation(c.name, contact);
      }
      renderContactMessages(data._contactChats[idx], idx);
    }, () => {
      if (!data._contactChats) data._contactChats = {};
      data._contactChats[idx] = buildFallbackConversation(c.name, contact);
      renderContactMessages(data._contactChats[idx], idx);
    });
  }

  /** 构建多条来回消息的fallback对话 */
  function buildFallbackConversation(charName, contact) {
    const name = contact.name || '对方';
    const preview = contact.preview || '...';
    const seed = name.charCodeAt(0) % 4;

    const templates = [
      [
        { sender: name,     text: '在吗？' },
        { sender: charName, text: '嗯，怎么了' },
        { sender: name,     text: '最近怎么样啊' },
        { sender: charName, text: '还行，就是有点忙，你呢' },
        { sender: name,     text: '我也是，感觉好久没联系了' },
        { sender: charName, text: '是啊，有空多聚聚' },
        { sender: name,     text: preview },
      ],
      [
        { sender: charName, text: '最近有什么新鲜事吗' },
        { sender: name,     text: '还真有！你有空吗' },
        { sender: charName, text: '怎么了，说说看' },
        { sender: name,     text: '不是很方便打字，等会儿再说' },
        { sender: charName, text: '好，随时都行' },
        { sender: name,     text: preview },
      ],
      [
        { sender: name,     text: '哎你还记得上次那件事吗' },
        { sender: charName, text: '哪件事？' },
        { sender: name,     text: '就是上次我们说的那个' },
        { sender: charName, text: '哦，想起来了，怎么了' },
        { sender: name,     text: '我一直在想这个事情' },
        { sender: charName, text: '然后呢' },
        { sender: name,     text: preview },
      ],
      [
        { sender: charName, text: '你今天还好吗' },
        { sender: name,     text: '还行，就是有点累' },
        { sender: charName, text: '怎么了，发生什么事了' },
        { sender: name,     text: '就是工作上的事，烦死了' },
        { sender: charName, text: '要说说看吗，我听着呢' },
        { sender: name,     text: preview },
      ],
    ];

    return templates[seed] || templates[0];
  }

  /** 渲染聊天消息列表 */
  function renderContactMessages(messages, idx) {
    const msgsEl = $('tr-contact-chat-msgs');
    if (!msgsEl) return;
    const charName = state.selectedChar?.name || 'TA';
    let html = '';
    messages.forEach(msg => {
      const isSent = msg.sender === charName;
      html += `<div class="tr-chat-msg-row ${isSent ? 'sent' : 'received'}">
        ${!isSent ? `<div class="tr-chat-msg-avatar">${msg.sender?.charAt(0) || '?'}</div>` : ''}
        <div class="tr-chat-msg-bubble">${escHtml(msg.text)}</div>
        ${isSent ? `<div class="tr-chat-msg-avatar sent-avatar">${charName.charAt(0)}</div>` : ''}
      </div>`;
    });
    msgsEl.innerHTML = html;
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  /** 发送回复 */
  function sendContactReply(idx) {
    const input = $('tr-contact-reply-input');
    if (!input || !input.value.trim()) return;
    const text = input.value.trim();
    input.value = '';
    const data = state.phoneData;
    if (!data) return;
    if (!data._contactChats) data._contactChats = {};
    if (!data._contactChats[idx]) data._contactChats[idx] = [];
    const charName = state.selectedChar?.name || 'TA';
    data._contactChats[idx].push({ sender: charName, text });
    renderContactMessages(data._contactChats[idx], idx);
    // 更新消息列表预览
    if (!data._contactReplies) data._contactReplies = {};
    data._contactReplies[idx] = text;
    const contact = data.messages?.contacts?.[idx];
    const contactName = contact?.name || '联系人';
    
    // 先写入一条基础的篡改日志，以防中途退出
    const logId = Date.now();
    data._lastSentMsg = text;
    data._lastContactName = contactName;
    
    // 如果玩家没等对方回复就退出了，这条日志保证大模型仍能发觉
    _addPendingSendLog(contactName, text);
    
    showToast(`✅ 已以「${charName}」身份发送！对方正在输入...`);
    // 模拟对方自动回复，抓包记录会在 AI 回复后被更新
    setTimeout(() => generateAutoReply(idx, logId), 1000 + Math.random() * 1500);
  }

  /** 发送回复后记录基础行为，以防没等到AI回复就退出 */
  function _addPendingSendLog(contactName, text) {
    addTamperLog(`[系统事件剧本：抓包代发记录] 玩家趁你不注意，用你的手机冒充你给"${contactName}"发了消息："${text}"。你拿回手机后在聊天记录里发现了这件事。请立刻根据你的人设发微信质问玩家！`);
  }

  /** AI 自动生成对方回复，并追加日志（退回微信后爆发） */
  function generateAutoReply(idx, logId) {
    const data = state.phoneData;
    if (!data || !data.messages?.contacts) return;
    const contact = data.messages.contacts[idx];
    if (!contact) return;
    const c = state.selectedChar;
    const history = (data._contactChats?.[idx] || []).slice(-4).map(m => `${m.sender}: ${m.text}`).join('\n');
    const prompt = `聊天背景：你是"${contact.name}"，正在和"${c.name}"发消息。注意：上一条来自"${c.name}"的消息其实是别人偷拿手机代发的（可能是恶作剧或试探）。
最近的对话：
${history}

请以"${contact.name}"的口吻回复一条短消息（20字以内，自然真实，根据上一条消息的内容做出情绪化反应，比如迷惑、震惊、生气、顺着开玩笑等）。只输出消息本身，不要任何说明。`;

    callAIRaw(prompt, 60, (reply) => {
      const trimmed = (reply || '').trim().replace(/^["「]|["」]$/g, '');
      if (!trimmed) return;
      data._contactChats[idx].push({ sender: contact.name, text: trimmed });
      renderContactMessages(data._contactChats[idx], idx);
      
      // 收到回复后，追加一条更震撼的篡改日志（不会当场弹窗，而是等玩家退出后被AI发微信质问）
      addTamperLog(`[系统事件剧本：抓包代发记录] 玩家趁你不注意，用你的手机冒充你给联系人"${contact.name}"发了消息："${data._lastSentMsg}"。对方刚刚回复了："${trimmed}"。你现在拿回手机，在微信聊天记录里赫然看到了这段对话！请立刻根据你的人设，向玩家发微信质问这件事情，表现出极度震惊、愤怒、尴尬或无奈的真实反应。`);
    }, () => {
      // 降级回复
      const fallback = "你发错人了吧？";
      data._contactChats[idx].push({ sender: contact.name, text: fallback });
      renderContactMessages(data._contactChats[idx], idx);
      
      addTamperLog(`[系统事件剧本：抓包代发记录] 玩家趁你不注意，冒充你给"${contact.name}"发了消息："${data._lastSentMsg}"。对方回复："${fallback}"。你现在拿回手机，在微信里看到了这段对话。请立刻质问玩家。`);
    });
  }

  /** 关闭联系人聊天面板 */
  function closeContactChat() {
    const panel = document.querySelector('#tr-app-messages .tr-contact-chat-panel');
    if (panel) {
      panel.classList.remove('active');
      setTimeout(() => panel.remove(), 300);
    }
  }

  /** 联系人聊天 - 更多操作 */
  function openContactMore(idx) {
    const data = state.phoneData;
    if (!data || !data.messages?.contacts) return;
    const contact = data.messages.contacts[idx];
    if (!contact) return;
    document.querySelector('#trackerApp .tr-action-sheet')?.remove();
    const sheet = document.createElement('div');
    sheet.className = 'tr-action-sheet';
    sheet.innerHTML = `
      <div class="tr-action-sheet-mask" onclick="this.parentElement.remove()"></div>
      <div class="tr-action-sheet-box">
        <div class="tr-action-sheet-handle"></div>
        <div class="tr-action-sheet-header">
          <div class="tr-action-sheet-emoji">${contact.emoji || '👤'}</div>
          <div>
            <div class="tr-action-sheet-name">${escHtml(contact.name)}</div>
            <div class="tr-action-sheet-preview">"${escHtml(contact.preview)}"</div>
          </div>
        </div>
        <div class="tr-action-sheet-btns">
          <div class="tr-action-btn danger" onclick="TrackerApp.blockContact(${idx})">
            <span>🚫</span><span>拉黑并删除此人</span>
          </div>
          <div class="tr-action-btn cancel" onclick="this.closest('.tr-action-sheet').remove()">取消</div>
        </div>
      </div>`;
    $('trackerApp').appendChild(sheet);
    requestAnimationFrame(() => sheet.querySelector('.tr-action-sheet-box').classList.add('open'));
  }

  /** 代 TA 回消息（旧方法，保留兼容） */
  function proxyReply(idx) {
    document.querySelector('#trackerApp .tr-action-sheet')?.remove();
    const data = state.phoneData;
    if (!data || !data.messages || !data.messages.contacts) return;
    const contact = data.messages.contacts[idx];
    const charName = state.selectedChar?.name || 'TA';

    const reply = prompt(
      `以「${charName}」的身份回复「${contact.name}」：\n\nTA发来："${contact.preview}"\n\n你想以TA的口吻回复：`
    );
    if (!reply || !reply.trim()) return;
    const trimmedReply = reply.trim();

    // 更新 UI 预览
    if (!data._contactReplies) data._contactReplies = {};
    data._contactReplies[idx] = trimmedReply;
    if (state.currentApp === 'messages') openApp('messages');

    addTamperLog(
      `[系统事件] 用户冒充你，代你给"${contact.name}"发了一条消息："${trimmedReply}"。"${contact.name}"已经收到了这条消息。你拿回手机，在发送记录里看到了这条你没有发出的话，请根据人设对用户做出反应——可以是震惊、无奈、尴尬，也可以是悄悄心动（如果消息内容恰好说出了你没说出口的话）。`
    );
    showToast(`✅ 已代「${charName}」回复「${contact.name}」`);
  }

  /** 拉黑联系人 */
  function blockContact(idx) {
    document.querySelector('#trackerApp .tr-action-sheet')?.remove();
    const data = state.phoneData;
    if (!data || !data.messages || !data.messages.contacts) return;
    const contact = data.messages.contacts[idx];

    if (!confirm(`确定帮TA拉黑「${contact.name}」？\n${contact.name} 将从消息列表消失。`)) return;

    if (!data._blockedContacts) data._blockedContacts = [];
    data._blockedContacts.push(idx);
    if (state.currentApp === 'messages') openApp('messages');

    addTamperLog(
      `[系统事件] 用户偷偷拿你的手机，把"${contact.name}"拉黑并删除了。"${contact.name}"之后会发现自己被拉黑，可能会跑来当面质问，或者来找用户哭诉"TA怎么把我拉黑了"。你拿回手机发现消息列表里少了这个人，意识到是用户干的，请根据人设做出反应。`
    );
    showToast(`🚫 已替TA拉黑「${contact.name}」`);
  }

  // ============================================================
  //  ★ 维度二：消息越权与替身发言
  // ============================================================

  /** 用 TA 的手机给自己发消息 */
  function sendMsgToSelf() {
    const charName = state.selectedChar?.name || 'TA';

    // 选项菜单
    document.querySelector('#trackerApp .tr-action-sheet')?.remove();
    const sheet = document.createElement('div');
    sheet.className = 'tr-action-sheet';
    sheet.innerHTML = `
      <div class="tr-action-sheet-mask" onclick="this.parentElement.remove()"></div>
      <div class="tr-action-sheet-box">
        <div class="tr-action-sheet-handle"></div>
        <div class="tr-action-sheet-header" style="flex-direction:column;align-items:flex-start;gap:4px">
          <div class="tr-action-sheet-name">📤 用「${escHtml(charName)}」的手机发给自己</div>
          <div class="tr-action-sheet-preview">TA等会儿会看到发送记录的…</div>
        </div>
        <div class="tr-action-sheet-btns">
          <div class="tr-action-btn primary" onclick="TrackerApp._doSendToSelf('custom')">
            <span>✍️</span><span>自定义消息内容</span>
          </div>
          <div class="tr-action-btn primary" onclick="TrackerApp._doSendToSelf('sorry')">
            <span>🙏</span><span>发一句"对不起，我错了"</span>
          </div>
          <div class="tr-action-btn primary" onclick="TrackerApp._doSendToSelf('transfer')">
            <span>💸</span><span>发一个 ¥520 红包</span>
          </div>
          <div class="tr-action-btn cancel" onclick="this.closest('.tr-action-sheet').remove()">
            取消
          </div>
        </div>
      </div>`;
    $('trackerApp').appendChild(sheet);
    requestAnimationFrame(() => sheet.querySelector('.tr-action-sheet-box').classList.add('open'));
  }

  function _doSendToSelf(type) {
    document.querySelector('#trackerApp .tr-action-sheet')?.remove();
    const charName = state.selectedChar?.name || 'TA';
    let content = '';
    if (type === 'custom') {
      content = prompt(`以「${charName}」的身份，给自己发一条消息：`);
      if (!content || !content.trim()) return;
      content = content.trim();
    } else if (type === 'sorry') {
      content = '对不起，是我不好。我错了。';
    } else if (type === 'transfer') {
      content = '[红包 ¥520.00] 备注：乖，不要生气了 ❤️';
    }
    if (!content) return;

    addTamperLog(
      `[系统事件] 用户偷偷用你的手机给自己发了一条消息："${content}"。消息已发出，用户的手机上会收到这条来自"${charName}"的消息。你刚刚发现手机被人动了，还代你发了这条消息，你慌张地想撤回，同时对用户做出反应——可以是尴尬、心跳加速、假装镇定，也可以撒谎说是"猫踩的"或"手滑了"。`
    );
    showToast(`📤 已用「${charName}」的手机发出！等TA发现…`);
  }

  // ============================================================
  //  ★ 维度三：日常生活干预
  // ============================================================

  /** 快捷入口：日记批注（从工具栏调用） */
  function promptDiaryAnnotation() {
    const data = state.phoneData;
    if (!data || !data.diary) return addDiaryAnnotation(0);
    const diaries = Array.isArray(data.diary) ? data.diary : [data.diary];
    if (diaries.length === 1) { addDiaryAnnotation(0); return; }
    const list = diaries.map((e, i) => `${i + 1}. ${e.title || '无标题'}`).join('\n');
    const choice = prompt(`选择要批注的日记（输入序号）：\n${list}`);
    const idx = parseInt(choice) - 1;
    if (isNaN(idx) || idx < 0 || idx >= diaries.length) return;
    addDiaryAnnotation(idx);
  }

  /** 在日记里写批注 */
  function addDiaryAnnotation(idx) {
    const data = state.phoneData;
    if (!data) return;
    const diaries = Array.isArray(data.diary) ? data.diary : [data.diary];
    const entry = diaries[idx] || {};

    const note = prompt(
      `在「${entry.title || '私密日记'}」里写下你的批注：\n（TA发现后可能会崩溃…）`
    );
    if (!note || !note.trim()) return;
    const trimmedNote = note.trim();

    if (!data._diaryAnnotations) data._diaryAnnotations = {};
    if (!data._diaryAnnotations[idx]) data._diaryAnnotations[idx] = [];
    data._diaryAnnotations[idx].push(trimmedNote);

    // 刷新日记视图
    if (state.currentApp === 'diary') openApp('diary');

    addTamperLog(
      `[系统事件] 用户偷偷翻看了你的日记"${entry.title || '私密日记'}"，还在日记最后写下了一条批注："${trimmedNote}"。你打开日记，发现有人翻看过你的日记，还留下了这条字迹，感到极度被窥探/羞耻/意外——请根据日记内容和批注内容，给出真实、情绪化的反应，引爆剧情高潮。`
    );
    showToast('📌 批注已写入日记！等TA心跳加速…');
  }

  /** 设定恶搞闹钟 */
  function setPrankAlarm() {
    const charName = state.selectedChar?.name || 'TA';
    const time = prompt('设定恶搞闹钟时间（格式 HH:MM）：', '03:00');
    if (!time || !time.trim()) return;
    if (!/^\d{1,2}:\d{2}$/.test(time.trim())) {
      showToast('⚠️ 时间格式不对，请输入 HH:MM');
      return;
    }
    const userPersona = getUserPersona() || '你';
    const label = prompt(
      `闹钟备注（${charName}看到时会崩溃的内容）：`,
      `快起床想${userPersona}！`
    );
    if (!label || !label.trim()) return;
    const trimmedTime = time.trim();
    const trimmedLabel = label.trim();

    const data = state.phoneData;
    if (!data) return;
    if (!data._prankAlarms) data._prankAlarms = [];
    data._prankAlarms.push({ time: trimmedTime, label: trimmedLabel });

    if (state.currentApp === 'calendar') openApp('calendar');

    addTamperLog(
      `[系统事件] 用户偷偷在你手机里设了一个 ${trimmedTime} 的闹钟，备注写的是"${trimmedLabel}"。你在 ${trimmedTime} 被这个闹钟吵醒，顶着黑眼圈，正对用户发火/崩溃/抱怨——"你到底有什么毛病？${trimmedTime}把我吵醒，就为了让我确认${trimmedLabel}？！"`
    );
    showToast(`⏰ 恶搞闹钟已设！${trimmedTime} 等「${charName}」崩溃吧~`);
  }

  /** 帮 TA 下单单个购物车商品 */
  function checkoutItem(idx) {
    const data = state.phoneData;
    if (!data || !data.shop || !data.shop[idx]) return;
    const item = data.shop[idx];
    const charName = state.selectedChar?.name || 'TA';

    if (!confirm(`帮「${charName}」下单这件商品？\n\n「${item.name}」\n${item.price}\n\n钱从TA钱包扣！`)) return;

    if (!data._purchasedItems) data._purchasedItems = [];
    if (!data._purchasedItems.includes(idx)) data._purchasedItems.push(idx);
    if (state.currentApp === 'shop') openApp('shop');

    addTamperLog(
      `[系统事件] 用户偷偷帮你下单了购物车里的"${item.name}"（${item.price}），已从你余额扣款，快递将发货。你发现手机上多了一条下单记录，感到极度震惊——如果这是你准备送给用户的礼物，你会惊慌失措地试图掩盖；如果只是你自己想买的东西，你会又好气又好笑地质问用户；请根据人设做出反应。`
    );
    showToast(`💸 已帮「${charName}」下单「${item.name}」！`);
  }

  /** 帮 TA 全部结算购物车 */
  function checkoutAll() {
    const data = state.phoneData;
    if (!data || !data.shop || !data.shop.length) {
      showToast('购物车是空的~'); return;
    }
    const charName = state.selectedChar?.name || 'TA';
    const itemList = data.shop.map(i => i.name).join('、');
    if (!confirm(`帮「${charName}」结算购物车里全部商品？\n\n${itemList}\n\n一起全下单！`)) return;

    data._purchasedItems = data.shop.map((_, i) => i);
    if (state.currentApp === 'shop') openApp('shop');

    addTamperLog(
      `[系统事件] 用户把你购物车里的所有东西全部下单了，包括：${itemList}。你发现所有东西都被下单，信用卡短信轰炸而来，感到极度震惊和崩溃，对用户做出激烈反应——可以是咆哮、可以是又哭又笑，也可以悄悄感动（如果里面有给用户的礼物）。`
    );
    showToast(`💸 已帮「${charName}」结算全部商品！等TA心跳加速~`);
  }

  /** 清空购物车 */
  function clearCart() {
    const data = state.phoneData;
    if (!data || !data.shop || !data.shop.length) {
      showToast('购物车已经是空的了~'); return;
    }
    const charName = state.selectedChar?.name || 'TA';
    const itemList = data.shop.map(i => i.name).join('、');
    if (!confirm(`确定清空「${charName}」的购物车吗？\n\n将删除：${itemList}`)) return;

    data._clearedCart = [...data.shop];
    data.shop = [];
    if (state.currentApp === 'shop') openApp('shop');

    addTamperLog(
      `[系统事件] 用户清空了你的购物车，里面原本有：${itemList}。你发现购物车被清空，感到委屈巴巴——里面有一些你犹豫了很久没舍得买的东西，甚至有一件是你打算偷偷送给用户的礼物，现在全没了。请根据人设做出反应，可以直接质问用户"你是不是不喜欢那个礼物？"`
    );
    showToast(`🗑️ 购物车已清空！等TA委屈去吧~`);
  }

  // ============================================================
  //  通用工具栏（旧方法保留兼容）
  // ============================================================
  function tamperAdd(appId) {
    const text = prompt(`在「${appId}」中悄悄新建一条内容：`);
    if (!text) return;
    addTamperLog(`[系统事件] 用户在你的手机"${appId}"里悄悄新增了一条内容："${text}"，请根据人设对这一发现做出反应。`);
    showToast('已偷偷添加 👀 这会影响TA的行为');
  }

  function tamperRefresh(appId) {
    if (!state.phoneData) return;
    const partialPrompt = buildPartialPrompt(appId);
    callAI(partialPrompt, (data) => {
      if (data[appId]) {
        state.phoneData[appId] = data[appId];
        openApp(appId);
      }
    }, err => console.warn(err));
  }

  function tamperClear(appId) {
    if (!confirm(`确定清空「${appId}」的数据吗？`)) return;
    if (state.phoneData) state.phoneData[appId] = null;
    openApp(appId);
    addTamperLog(`[系统事件] 用户清空了你手机里的"${appId}"数据，请对这一发现做出反应。`);
  }

  function buildPartialPrompt(appId) {
    const c = state.selectedChar;
    return `请为角色"${c.name}"的手机「${appId}」模块生成新内容，以纯JSON输出，格式：{"${appId}": ...}，内容要符合角色最新状态，有趣有情绪。`;
  }

  // ── 壁纸更换 ──────────────────────────────────────────────
  function changeWallpaper() {
    document.querySelector('#trackerApp .tr-action-sheet')?.remove();
    const sheet = document.createElement('div');
    sheet.className = 'tr-action-sheet';
    sheet.innerHTML = `
      <div class="tr-action-sheet-mask" onclick="this.parentElement.remove()"></div>
      <div class="tr-action-sheet-box">
        <div class="tr-action-sheet-handle"></div>
        <div class="tr-action-sheet-header" style="flex-direction:column;align-items:flex-start;gap:4px;">
          <div class="tr-action-sheet-name">🖼️ 更换壁纸</div>
          <div class="tr-action-sheet-preview">桌面和锁屏背景</div>
        </div>
        <div class="tr-action-sheet-btns">
          <div class="tr-action-btn primary" onclick="TrackerApp._wallpaperUpload()">
            <span>📁</span><span>从相册选择图片</span>
          </div>
          <div class="tr-action-btn primary" onclick="TrackerApp._wallpaperUrl()">
            <span>🔗</span><span>输入图片链接（URL）</span>
          </div>
          <div class="tr-action-btn" onclick="TrackerApp._wallpaperReset()">
            <span>↩️</span><span>恢复默认（角色头像）</span>
          </div>
          <div class="tr-action-btn cancel" onclick="this.closest('.tr-action-sheet').remove()">取消</div>
        </div>
      </div>`;
    $('trackerApp').appendChild(sheet);
    requestAnimationFrame(() => sheet.querySelector('.tr-action-sheet-box').classList.add('open'));
  }

  function _wallpaperUpload() {
    document.querySelector('#trackerApp .tr-action-sheet')?.remove();
    let fileInput = $('tr-wallpaper-file-input');
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.id = 'tr-wallpaper-file-input';
      fileInput.accept = 'image/*';
      fileInput.style.display = 'none';
      $('trackerApp').appendChild(fileInput);
    }
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => { applyAndSaveWallpaper(ev.target.result); };
      reader.readAsDataURL(file);
    };
    fileInput.value = '';
    fileInput.click();
  }

  function _wallpaperUrl() {
    document.querySelector('#trackerApp .tr-action-sheet')?.remove();
    const url = prompt('输入壁纸图片链接（URL）：');
    if (!url || !url.trim()) return;
    applyAndSaveWallpaper(url.trim());
  }

  function _wallpaperReset() {
    document.querySelector('#trackerApp .tr-action-sheet')?.remove();
    const c = state.selectedChar;
    const defaultUrl = c ? (c.avatar || 'icon.png') : 'icon.png';
    const charKey = c?.id || c?.name || 'default';
    localStorage.removeItem(`tr_wallpaper_${charKey}`);
    applyWallpaper(defaultUrl);
    showToast('↩️ 已恢复默认壁纸');
  }

  function applyAndSaveWallpaper(url) {
    applyWallpaper(url);
    const charKey = state.selectedChar?.id || state.selectedChar?.name || 'default';
    try { localStorage.setItem(`tr_wallpaper_${charKey}`, url); } catch (_) {}
    showToast('✅ 壁纸已更换！');
  }

  function applyWallpaper(url) {
    const wp = document.querySelector('.tr-desktop-wallpaper');
    if (wp) wp.style.backgroundImage = `url('${url}')`;
    const lockBg = $('tr-lock-bg');
    if (lockBg) lockBg.style.backgroundImage = `url('${url}')`;
  }

  // ── AI 原始文本调用（返回纯文本） ────────────────────────
  function callAIRaw(prompt, maxTokens, onSuccess, onError) {
    let apiKey = '', apiEndpoint = '', model = 'gpt-4o-mini';
    try {
      const s = JSON.parse(localStorage.getItem('myCoolPhone_aiSettings') || '{}');
      apiKey = s.apiKey || '';
      apiEndpoint = (s.endpoint || '').replace(/\/$/, '');
      model = s.model || 'gpt-4o-mini';
    } catch (_) {}
    if (!apiKey) { onError('no api key'); return; }
    const apiUrl = apiEndpoint
      ? (apiEndpoint.endsWith('/v1') ? `${apiEndpoint}/chat/completions` : `${apiEndpoint}/v1/chat/completions`)
      : 'https://api.openai.com/v1/chat/completions';
    fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, temperature: 0.9 })
    })
    .then(r => r.json())
    .then(res => { onSuccess(res.choices?.[0]?.message?.content || ''); })
    .catch(onError);
  }

  // ── 日志系统 ──────────────────────────────────────────────
  function addTamperLog(msg) {
    state.tamperLog.push(msg);
  }

  function injectTamperContext() {
    const existing = JSON.parse(localStorage.getItem('tr_pending_context') || '[]');
    existing.push(...state.tamperLog);
    localStorage.setItem('tr_pending_context', JSON.stringify(existing));
    state.tamperLog = [];
  }

  // ── API 错误横幅（手机端可见） ────────────────────────────
  function showApiErrorBanner(err) {
    // 移除旧横幅
    $('tr-api-error-banner')?.remove();

    let reason = '⚠️ AI 生成失败，当前显示预设内容';
    let hint   = '请检查 AI 设置后点击重试';

    if (!err || err === 'no_api_key' || (err && err.code === 'no_api_key')) {
      reason = '⚠️ 未配置 API Key';
      hint   = '请前往设置填写 API Key（手机浏览器需单独配置，与电脑不共享）';
    } else if (err && err.status === 401) {
      reason = '⚠️ API Key 无效或已过期';
      hint   = '请检查 Key 是否正确，或重新生成';
    } else if (err && err.status === 429) {
      reason = '⚠️ API 调用频率超限（429）';
      hint   = '稍后再试，或检查账户余额';
    } else if (err && err.code === 'no_json') {
      reason = '⚠️ AI 返回格式异常';
      hint   = '点击重试，若反复出现请换用 gpt-4o-mini 模型';
    } else if (err && (err.code === 'Failed to fetch' || (err.detail && err.detail.includes('fetch')))) {
      reason = '⚠️ 网络请求失败';
      hint   = '可能原因：① Endpoint 是 localhost（手机无法访问电脑本地地址）② HTTP endpoint 被 HTTPS 页面拦截（混合内容）③ 网络不通';
    }

    const banner = document.createElement('div');
    banner.id = 'tr-api-error-banner';
    banner.style.cssText = `
      position:absolute;bottom:70px;left:12px;right:12px;z-index:9999;
      background:rgba(30,30,30,0.96);border:1px solid rgba(255,80,80,0.4);
      border-radius:12px;padding:12px 14px;color:#fff;font-size:12px;
      box-shadow:0 4px 20px rgba(0,0,0,0.5);`;
    banner.innerHTML = `
      <div style="font-weight:600;color:#ff6b6b;margin-bottom:4px">${reason}</div>
      <div style="color:#ccc;line-height:1.5;margin-bottom:10px">${hint}</div>
      <div style="display:flex;gap:8px">
        <div onclick="TrackerApp.refreshAll();this.closest('#tr-api-error-banner').remove();"
             style="flex:1;text-align:center;padding:7px;background:rgba(255,255,255,0.12);
                    border-radius:8px;cursor:pointer;font-size:12px">↻ 重试</div>
        <div onclick="this.closest('#tr-api-error-banner').remove();"
             style="padding:7px 14px;background:rgba(255,255,255,0.07);
                    border-radius:8px;cursor:pointer;font-size:12px;color:#aaa">忽略</div>
      </div>`;
    const desktop = document.querySelector('#tr-view-desktop');
    if (desktop) desktop.style.position = 'relative';
    (desktop || $('trackerApp'))?.appendChild(banner);
  }

  // ── Toast 通知 ────────────────────────────────────────────
  function showToast(msg) {
    let toast = $('tr-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'tr-toast';
      toast.className = 'tr-toast';
      $('trackerApp')?.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.remove('show');
    // force reflow
    void toast.offsetWidth;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  // ── 全局刷新（清除缓存后重新生成）──────────────────────────
  function refreshAll() {
    const c = state.selectedChar;
    if (c) clearCachedPhoneData(c.id || c.name);
    state.phoneData = null;
    loadPhoneData();
  }

  // ── 加载状态 ──────────────────────────────────────────────
  function showLoading(show) {
    const overlay = $('tr-loading-overlay');
    if (overlay) overlay.classList.toggle('active', show);
  }

  // ── 被抓包处理 ────────────────────────────────────────────
  function dismissBusted() {
    const overlay = $('tr-busted-overlay');
    if (overlay) overlay.classList.remove('active');
    close();
  }

  // ── Fallback 数据（API 失败时的最小占位，不含任何预设故事内容）──
  function buildFallbackData(c) {
    return {
      statusBar: { wifiName: '--', bluetooth: '--', battery: 100 },
      messages:  { remarkName: '--', unsentDraft: '', contacts: [] },
      diary:     [],
      browser:   { searches: [], anonPost: null },
      wallet:    { balance: '--', currency: '¥', note: '', transactions: [] },
      location:  [],
      calendar:  { alarms: [], events: [] },
      shop:      [],
      album:     [],
      music:     { nowPlaying: { title: '--', artist: '--', mood: '' }, playlist: [] },
      vault:     [],
      takeout:   [],
      notes:     [],
      trash:     [],
    };
  }

  // ── 工具 ──────────────────────────────────────────────────
  function escHtml(s) {
    if (typeof s !== 'string') s = String(s || '');
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── 公共 API ──────────────────────────────────────────────
  return {
    open, close, openApp, backToDesktop,
    handlePinInput, handlePinDel, handleFaceUnlock,
    openPhoto, closePhoto,
    tamperAdd, tamperRefresh, tamperClear,
    refreshAll, dismissBusted,
    startPhoneTracker,
    startOfflineSnoop,
    // ★ 新增：痕迹干预公共方法
    changeRemark,
    openContactAction,
    openContactMore,
    closeContactChat,
    sendContactReply,
    proxyReply,
    blockContact,
    sendMsgToSelf,
    _doSendToSelf,
    addDiaryAnnotation,
    promptDiaryAnnotation,
    setPrankAlarm,
    checkoutItem,
    checkoutAll,
    clearCart,
    // 壁纸
    changeWallpaper,
    _wallpaperUpload,
    _wallpaperUrl,
    _wallpaperReset,
    _drawScenarioCard,
    _confirmScenario,
    _resetDraw,
    closeScenarioModal() {
      const modal = $('tr-scenario-modal');
      if (modal) modal.classList.remove('active');
    },
    backToSelect() {
      showView('tr-view-select');
    },
    toggleStatusTooltip() {
      const t = $('tr-status-tooltip');
      if (t) t.classList.toggle('show');
    }
  };
})();

// ============================================================
//  [全局] 在聊天设置页面为当前角色预生成手机密码
//  供 index.html 中的"生成手机密码"按钮调用
// ============================================================
function generateAndSaveCharPin() {
  let charId = (typeof currentChatId !== 'undefined' && currentChatId) ? currentChatId : null;

  if (!charId) {
    const hiddenId = document.getElementById('cs-char-id');
    if (hiddenId && hiddenId.value) charId = hiddenId.value;
  }

  if (!charId && typeof friendsData !== 'undefined') {
    const remark   = (document.getElementById('cs-remark')   || {}).value || '';
    const realName = (document.getElementById('cs-realname') || {}).value || '';
    for (const [id, f] of Object.entries(friendsData)) {
      if ((remark && f.remark === remark) || (realName && f.realName === realName)) {
        charId = id; break;
      }
    }
  }

  if (!charId) {
    alert('无法识别当前角色，请先进入聊天再试');
    return;
  }

  const char = (typeof friendsData !== 'undefined' && friendsData[charId]) || {};
  const charName = char.remark || char.realName || charId;
  const persona  = char.persona || '';

  let apiKey = '', apiEndpoint = '', model = 'gpt-4o-mini';
  try {
    const s = JSON.parse(localStorage.getItem('myCoolPhone_aiSettings') || '{}');
    apiKey       = s.apiKey    || '';
    apiEndpoint  = (s.endpoint || '').replace(/\/$/, '');
    model        = s.model     || 'gpt-4o-mini';
  } catch (_) {}

  const btn = document.getElementById('btn-generate-char-pin');
  const setBtn = (html, disabled, color) => {
    if (!btn) return;
    btn.innerHTML = html;
    btn.disabled  = !!disabled;
    btn.style.opacity = disabled ? '0.65' : '1';
    btn.style.color   = color || '';
  };

  if (!apiKey) {
    const seed = charName.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    const pin  = String((seed * 137 + 42) % 9000 + 1000);
    const hint = '某个只有TA知道的数字';
    localStorage.setItem(`tr_pin_${charId}`, JSON.stringify({ pin, hint, generatedAt: Date.now() }));
    _injectPinAwareness(charId, pin, hint);
    setBtn('<i class="fas fa-check-circle"></i> 已生成（本地）', false, '#07c160');
    setTimeout(() => setBtn('<i class="fas fa-lock"></i> 生成手机密码', false, ''), 3000);
    return;
  }

  setBtn('<i class="fas fa-spinner fa-spin"></i> 生成中...', true, '');

  const apiUrl = apiEndpoint
    ? (apiEndpoint.endsWith('/v1') ? `${apiEndpoint}/chat/completions` : `${apiEndpoint}/v1/chat/completions`)
    : 'https://api.openai.com/v1/chat/completions';

  const hiddenPrompt = `你正在扮演角色"${charName}"。${persona ? `你的人设：${persona}` : ''}

请为自己设定一个4位数的手机解锁密码，这个数字对你有特殊意义（可以是某个纪念日、幸运数字、暗语等，必须符合你的人设）。

要求：
1. 先用一句轻描淡写的话回应（例如"手机的事弄好了"），不要提及任何数字；
2. 然后在回复的**最末尾**附上以下格式的隐藏 JSON，不要有任何多余文字：
{"secret_pin":"XXXX","hint":"一句不透露数字本身的谜语式提示，10字以内"}`;

  fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: hiddenPrompt }],
      max_tokens: 180,
      temperature: 1.0,
    })
  })
  .then(r => r.json())
  .then(res => {
    const text = res.choices?.[0]?.message?.content || '';
    const match = text.match(/\{[^{}]*"secret_pin"\s*:\s*"(\d{4})"[^{}]*"hint"\s*:\s*"([^"]{1,40})"[^{}]*\}/);
    if (match) {
      const pin  = match[1];
      const hint = match[2];
      localStorage.setItem(`tr_pin_${charId}`, JSON.stringify({ pin, hint, generatedAt: Date.now() }));
      _injectPinAwareness(charId, pin, hint);
      setBtn('<i class="fas fa-check-circle"></i> 密码已生成 ✓', false, '#07c160');
      setTimeout(() => setBtn('<i class="fas fa-lock"></i> 生成手机密码', false, ''), 3500);
    } else {
      const loose = text.match(/"secret_pin"\s*:\s*"(\d{4})"/);
      if (loose) {
        localStorage.setItem(`tr_pin_${charId}`, JSON.stringify({ pin: loose[1], hint: '某个只有TA知道的数字', generatedAt: Date.now() }));
        _injectPinAwareness(charId, loose[1], '某个只有TA知道的数字');
        setBtn('<i class="fas fa-check-circle"></i> 密码已生成 ✓', false, '#07c160');
        setTimeout(() => setBtn('<i class="fas fa-lock"></i> 生成手机密码', false, ''), 3500);
      } else {
        throw new Error('no pin in response');
      }
    }
  })
  .catch(err => {
    console.warn('[generateAndSaveCharPin] failed:', err);
    const seed = charName.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    const pin  = String((seed * 137 + 42) % 9000 + 1000);
    localStorage.setItem(`tr_pin_${charId}`, JSON.stringify({ pin, hint: '某个只有TA知道的数字', generatedAt: Date.now() }));
    _injectPinAwareness(charId, pin, '某个只有TA知道的数字');
    setBtn('<i class="fas fa-check-circle"></i> 已生成（本地）', false, '#ff9500');
    setTimeout(() => setBtn('<i class="fas fa-lock"></i> 生成手机密码', false, ''), 3500);
  });
}

// ── 将密码写入角色上下文 ────────────────────────────────────
function _injectPinAwareness(charId, pin, hint) {
  try {
    if (typeof friendsData !== 'undefined' && friendsData[charId]) {
      friendsData[charId]._phonePin     = pin;
      friendsData[charId]._phonePinHint = hint;
    }
    ['myCoolPhone_friendsData', 'friendsData', 'myPhone_friends'].forEach(k => {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) return;
        const obj = JSON.parse(raw);
        if (obj && obj[charId]) {
          obj[charId]._phonePin     = pin;
          obj[charId]._phonePinHint = hint;
          localStorage.setItem(k, JSON.stringify(obj));
        }
      } catch (_) {}
    });
    const awareness = JSON.parse(localStorage.getItem('tr_pin_awareness') || '{}');
    awareness[charId] = { pin, hint };
    localStorage.setItem('tr_pin_awareness', JSON.stringify(awareness));
  } catch (e) {
    console.warn('[_injectPinAwareness]', e);
  }
}
// =========================================================
// Snoop App - 线下搜查模式 (大图沉浸 + 一键全屋全量生成版)
// =========================================================

let snoopCurrentChatId = null;
let snoopCurrentLoc = 'home_bedroom'; 
let snoopCurrentParent = 'home'; // 记录当前的大类

// 场景结构（保留为了切换背景大图用，但生成报告时会一把抓）
const snoopLocs = {
    home_livingroom: { name: '客厅', bg: 'https://images.unsplash.com/photo-1583847268964-b28ce8f311eb?w=600&q=80', parent: 'home' },
    home_bedroom: { name: '卧室', bg: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&q=80', parent: 'home' },
    home_kitchen: { name: '厨房', bg: 'https://images.unsplash.com/photo-1556910103-1c02745a872f?w=600&q=80', parent: 'home' },
    home_bathroom:{ name: '卫生间', bg: 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=600&q=80', parent: 'home' },
    home_balcony: { name: '阳台', bg: 'https://images.unsplash.com/photo-1502672260266-1c1c651e06fa?w=600&q=80', parent: 'home' },
    home_study:   { name: '书房', bg: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=600&q=80', parent: 'home' },
    daily:        { name: '日常地点', bg: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&q=80', parent: 'daily' },
    property:     { name: '个人财产', bg: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=600&q=80', parent: 'property' }
};


const parentNames = {
    'home': '住所 (全屋)',
    'daily': '日常活动轨迹',
    'property': '个人财产与云端'
};

window.openSnoopApp = function(chatId) {
    snoopCurrentChatId = chatId || window.currentChatId;
    if (!snoopCurrentChatId || typeof friendsData === 'undefined' || !friendsData[snoopCurrentChatId]) {
        alert("请先选择一个要搜查的角色。");
        return;
    }
    
    const conf = JSON.parse(localStorage.getItem('myCoolPhone_snoopConf') || '{}');
    if (conf[snoopCurrentChatId]) {
        Object.keys(conf[snoopCurrentChatId]).forEach(locKey => {
            if (snoopLocs[locKey]) snoopLocs[locKey].bg = conf[snoopCurrentChatId][locKey];
        });
    }

    const app = document.getElementById('snoopApp');
    if(app) {
        app.style.display = 'block';
        app.classList.add('open');
        snoopSwitchLoc('home');
    }
}

window.closeSnoopApp = function() {
    const app = document.getElementById('snoopApp');
    if(app) {
        app.classList.remove('open');
        app.style.display = 'none';
    }
}

// 切换顶级分类 Tab
window.snoopSwitchLoc = function(parentId) {
    snoopCurrentParent = parentId;
    document.querySelectorAll('.snoop-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.snoop-tab[onclick="snoopSwitchLoc('${parentId}')"]`).classList.add('active');

    // 动态更新那个巨大按钮的文字，提示用户是“一键搜查全部”
    const btnText = parentId === 'home' ? '全面搜查整个【住所】' : (parentId === 'daily' ? '调查所有【日常轨迹】' : '清查所有【个人财产】');
    const exploreBtn = document.querySelector('.snoop-huge-explore-btn');
    if(exploreBtn) exploreBtn.innerHTML = `<i class="fas fa-search"></i> ${btnText}`;

    const subTabsContainer = document.getElementById('snoop-sub-tabs');
    subTabsContainer.innerHTML = '';
    let firstLocId = null;
    
    Object.keys(snoopLocs).forEach(locId => {
        if (snoopLocs[locId].parent === parentId) {
            if (!firstLocId) firstLocId = locId;
            const btn = document.createElement('div');
            btn.className = 'snoop-sub-tab';
            btn.innerText = snoopLocs[locId].name;
            btn.onclick = () => snoopSwitchSubLoc(locId);
            subTabsContainer.appendChild(btn);
        }
    });

    if (parentId !== 'home') subTabsContainer.style.display = 'none';
    else subTabsContainer.style.display = 'flex';

    if (firstLocId) snoopSwitchSubLoc(firstLocId);
}

// 切换具体场景（现在只用来换背景图，不影响一把生成的逻辑）
window.snoopSwitchSubLoc = function(locId) {
    snoopCurrentLoc = locId;
    const parentId = snoopLocs[locId].parent;
    
    if (parentId === 'home') {
        let index = 0;
        Object.keys(snoopLocs).forEach(id => {
            if (snoopLocs[id].parent === 'home') {
                const btn = document.getElementById('snoop-sub-tabs').children[index];
                if (btn) {
                    if (id === locId) btn.classList.add('active');
                    else btn.classList.remove('active');
                }
                index++;
            }
        });
    }

    const layer = document.getElementById('snoop-bg-layer');
    layer.style.backgroundImage = `url('${snoopLocs[locId].bg}')`;
    document.getElementById('snoop-title-text').innerText = snoopLocs[locId].name;
}

window.handleSnoopBgChange = async function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            let base64 = e.target.result;
            if (typeof compressImage === 'function') base64 = await compressImage(base64, 800);
            snoopLocs[snoopCurrentLoc].bg = base64;
            document.getElementById('snoop-bg-layer').style.backgroundImage = `url('${base64}')`;
            
            let conf = JSON.parse(localStorage.getItem('myCoolPhone_snoopConf') || '{}');
            if(!conf[snoopCurrentChatId]) conf[snoopCurrentChatId] = {};
            conf[snoopCurrentChatId][snoopCurrentLoc] = base64;
            localStorage.setItem('myCoolPhone_snoopConf', JSON.stringify(conf));
        };
        reader.readAsDataURL(input.files[0]);
    }
    input.value = '';
}

async function startFullSnoopExploration() {
    const friend = friendsData[snoopCurrentChatId];
    if (!friend) return;
    
    const categoryName = parentNames[snoopCurrentParent];
    let allAreas = [];
    Object.values(snoopLocs).forEach(loc => {
        if(loc.parent === snoopCurrentParent) allAreas.push(loc.name);
    });
    const areasString = allAreas.join('、');

    document.getElementById('snoopActionOverlay').classList.add('active');

    let trPending = JSON.parse(localStorage.getItem('tr_pending_context') || '[]');
    trPending.push(`用户趁你不在，对你的【${categoryName}】进行了地毯式大搜查。`);
    localStorage.setItem('tr_pending_context', JSON.stringify(trPending));

    const settingsJSON = localStorage.getItem('myCoolPhone_aiSettings');
    if (!settingsJSON) {
        setTimeout(() => {
            document.getElementById('snoopActionOverlay').classList.remove('active');
            alert("请先配置 API Key。");
        }, 1000);
        return;
    }
    
    const settings = JSON.parse(settingsJSON);
    let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
    const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

      // ===== 区分Prompt：财产 vs 线下搜查 =====
    let sysPrompt = "";
    if (snoopCurrentParent === 'property') {
        sysPrompt = `你是一个私人财富调查局。玩家正在查询角色 ${friend.realName} 的【名下资产清单】。
角色人设：${friend.persona}
请严格按以下 JSON 格式生成一份客观的资产报告（只写客观事实，包括隐瞒的资产）：
{
  "summary": { "netWorth": "估算总净资产，如 1500万", "debt": "无负债 / 房贷500万等" },
  "realEstate": [
    { "name": "汤臣一品 江景大平层", "location": "上海市 浦东新区", "size": "430㎡", "desc": "全款购入，目前处于空置状态，似乎打算用作私人会所。" }
  ],
  "vehicles": [
    { "name": "保时捷 911 Carrera", "plate": "沪A·888**", "desc": "登记在他人名下，但实际由TA长期使用。" }
  ],
  "financials": [
    { "type": "储蓄卡", "bank": "招商银行", "balance": "¥ 8,500,000", "cardNum": "**** 4399" }
  ],
  "investments": [
    { "name": "海外信托基金", "amount": "¥ 5,000,000", "desc": "高风险风投，隐秘性极高。" }
  ]
}
要求：必须包含上述5个字段。房产、车产、金融账户三个必须提供，其他理财提供0-3个。数据要符合该角色的人设身价。`;
        } else {
        // 住所和日常地点的搜查提示词（纯客观物品描述版）
        sysPrompt = `你是一个冷酷客观的现场调查取证系统。玩家正在搜查角色 ${friend.realName} 的【${categoryName}】。包含区域：${areasString}。
角色人设：${friend.persona}

请严格按以下 JSON 格式生成搜查报告，必须包含上述所有区域名，每个区域生成 3 到 4 个搜查物品。

{
  "areas": [
    {
      "name": "卧室",
      "items": [
        {"name": "半开抽屉里的深色日记本", "desc": "摊开的页面上用黑色墨水写着：'今天TA还是没有发现那件事，我不知道还能瞒多久。'"},
        {"name": "床底边缘的揉皱的收据", "desc": "一张昂贵的珠宝店购物小票，日期是上周，但目前没有看到任何实物。"}
      ]
    }
  ]
}

⚠️ 严格要求：
1. desc 字段必须是【纯客观的物品状态】+【物品上承载的关键内容/细节】。
2. 细节内容必须与 TA 的【人设、隐藏的秘密、或者对玩家的真实态度】产生强烈的剧情关联。
3. 绝对禁止使用主观动作描写（严禁出现"你看到"、"你发现"、"你小心翼翼地"等废话），直接描述物品本身的客观存在！`;
    }


    try {
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
            body: JSON.stringify({
                model: settings.model,
                messages: [{ role: "system", content: sysPrompt }],
                temperature: 0.8
            })
        });
        
        if (!res.ok) throw new Error("API Request Failed");
        const data = await res.json();
        let report = data.choices[0].message.content.trim();
        
        let parsedData;
        try {
            // 强化提取，防止AI说废话导致变成纯文字
            const match = report.match(/\{[\s\S]*\}/);
            if (!match) throw new Error("No JSON found");
            let jsonStr = match[0].replace(/^```json/i, '').replace(/```$/i, '').trim();
            parsedData = JSON.parse(jsonStr);
        } catch(e) {
            document.getElementById('snoopActionOverlay').classList.remove('active');
            document.getElementById('snoop-report-content').innerHTML = parseMarkdownToHtml(report);
            document.getElementById('snoop-report-view').classList.add('active');
            return;
        }
        
        document.getElementById('snoopActionOverlay').classList.remove('active');

        // ===== 区分打开的视图 =====
        if (snoopCurrentParent === 'property' && parsedData.summary) {
            renderSnoopAssets(parsedData); // 打开杂志风资产面板
        } else if (parsedData.areas) {
            window.currentSnoopInteractiveData = parsedData.areas;
            openSnoopInteractiveView(); // 打开手电筒光点面板
        }

    } catch(e) {
        document.getElementById('snoopActionOverlay').classList.remove('active');
        alert("搜查失败：" + e.message);
    }
}
// 【重制】韩系Ins风优化版：全中文高级排版 + 理财卡片自适应高度显示全
function renderSnoopAssets(data) {
    const summary = document.getElementById('snoop-asset-summary');
    const list = document.getElementById('snoop-asset-list');
    
    // 初始化翻页状态
    window.snoopDeckIndexes = { estate: 0, vehicle: 0, bank: 0, invest: 0 };

    // 1. 顶部 Tab - 韩系极简细线风格
    summary.innerHTML = `
        <div id="asset-tab-bar" style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:0 30px; border-bottom:1px solid #f0f0f0; position:relative; z-index:50; height:60px;">
            <div class="asset-tab-btn active" style="font-size:13px; font-weight:600; color:#111; cursor:pointer; position:relative; height:100%; display:flex; align-items:center; letter-spacing:1px;" onclick="switchSnoopAssetTab('overview', this)">概览</div>
            <div class="asset-tab-btn" style="font-size:13px; font-weight:400; color:#999; cursor:pointer; position:relative; height:100%; display:flex; align-items:center; letter-spacing:1px;" onclick="switchSnoopAssetTab('estate', this)">房产</div>
            <div class="asset-tab-btn" style="font-size:13px; font-weight:400; color:#999; cursor:pointer; position:relative; height:100%; display:flex; align-items:center; letter-spacing:1px;" onclick="switchSnoopAssetTab('vehicle', this)">车产</div>
            <div class="asset-tab-btn" style="font-size:13px; font-weight:400; color:#999; cursor:pointer; position:relative; height:100%; display:flex; align-items:center; letter-spacing:1px;" onclick="switchSnoopAssetTab('bank', this)">账户</div>
            <div class="asset-tab-btn" style="font-size:13px; font-weight:400; color:#999; cursor:pointer; position:relative; height:100%; display:flex; align-items:center; letter-spacing:1px;" onclick="switchSnoopAssetTab('invest', this)">理财</div>
        </div>
    `;

    // 锁死区域，背景采用极淡的高级灰
    list.style.height = '460px';
    list.style.overflow = 'hidden';
    list.style.position = 'relative';
    list.style.background = '#fafafa';

    const emptyState = (text) => `<div style="text-align:center; color:#ccc; font-size:12px; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:100%; font-weight:300; letter-spacing:2px;">${text}</div>`;

    // ==========================================
    // 辅助函数：生成扑克牌层叠卡片 HTML
    // ==========================================
    const buildDeckHTML = (items, category, imgsArray, badgeText, cardType) => {
        if (!items || items.length === 0) return emptyState('暂无记录');
        
        let cardsHtml = items.map((item, idx) => {
            let contentVisual = '';
            
            if (cardType === 'image') {
                // 房产/车产 - (保留原本好看的Ins风图片卡)
                let savedImg = localStorage.getItem(`snoop_asset_${category}_${item.name}`) || imgsArray[idx % imgsArray.length];
                let clickAction = `event.stopPropagation(); let input = document.createElement('input'); input.type='file'; input.accept='image/*'; input.onchange = (e) => { let f = e.target.files[0]; if(f){ let r = new FileReader(); r.onload = (ev) => { document.getElementById('img-${category}-${idx}').style.backgroundImage = 'url(' + ev.target.result + ')'; localStorage.setItem('snoop_asset_${category}_${item.name}', ev.target.result); }; r.readAsDataURL(f); } }; input.click();`;
                
                contentVisual = `
                <div id="img-${category}-${idx}" style="background-image: url('${savedImg}'); background-size: cover; background-position: center; height:240px; position:relative;">
                    <div onclick="${clickAction}" title="更换照片" style="position:absolute; top:15px; right:15px; background:rgba(255,255,255,0.8); backdrop-filter:blur(4px); color:#111; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 2px 10px rgba(0,0,0,0.1);"><i class="fas fa-camera" style="font-size:12px;"></i></div>
                </div>
                <div style="padding:20px; background:#fff;">
                    <div style="font-size:11px; color:#999; letter-spacing:1px; margin-bottom:6px; font-weight:500;">${badgeText}</div>
                    <div style="font-size:16px; font-weight:600; color:#111; margin-bottom:8px; letter-spacing:0.5px;">${item.name || item.type || ''}</div>
                    <div style="font-size:12px; color:#777; line-height:1.5; font-weight:300;">${item.location || item.plate || item.desc || '暂无详细描述'}</div>
                </div>`;
            } else if (cardType === 'bank') {
                // 账户 - (保留原本好看的极致拟物黑金信用卡，文案中文化)
                let cardDesigns = [
                    { bg: 'linear-gradient(135deg, #1f1f22 0%, #0a0a0c 100%)', text: '#fff', chip: '#d4af37', type: '黑金卡' },
                    { bg: 'linear-gradient(135deg, #e8e9eb 0%, #c4c5c7 100%)', text: '#111', chip: '#aaa', type: '白金卡' },
                    { bg: 'linear-gradient(135deg, #1b3a57 0%, #0d1e2d 100%)', text: '#fff', chip: '#d4af37', type: '尊享卡' }
                ];
                let design = cardDesigns[idx % cardDesigns.length];
                
                contentVisual = `
                <div style="background: ${design.bg}; height:100%; padding:25px; position:relative; box-sizing:border-box; display:flex; flex-direction:column; justify-content:space-between;">
                    <div style="position:absolute; top:0; left:0; right:0; bottom:0; background:linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(0,0,0,0.2) 100%); pointer-events:none;"></div>
                    
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; position:relative; z-index:2;">
                        <!-- 金属芯片 -->
                        <div style="width: 38px; height: 28px; background: linear-gradient(135deg, ${design.chip}, rgba(255,255,255,0.3)); border-radius: 4px; box-shadow: inset 0 0 4px rgba(0,0,0,0.3); border:1px solid rgba(0,0,0,0.1);">
                            <div style="width:100%; height:1px; background:rgba(0,0,0,0.2); margin-top:8px;"></div>
                            <div style="width:100%; height:1px; background:rgba(0,0,0,0.2); margin-top:8px;"></div>
                        </div>
                        <div style="font-size:12px; font-weight:600; color:${design.text}; opacity:0.8; letter-spacing:1px;">${item.bank || '默认银行'}</div>
                    </div>
                    
                    <div style="position:relative; z-index:2; margin-top:30px;">
                        <div style="font-size:22px; color:${design.text}; font-family:'Courier New', monospace; letter-spacing:3px; text-shadow:0 1px 1px rgba(0,0,0,0.3); margin-bottom:15px;">${item.cardNum || '**** **** **** ****'}</div>
                        <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                            <div>
                                <div style="font-size:10px; color:${design.text}; opacity:0.6; letter-spacing:1px; margin-bottom:4px;">账户余额</div>
                                <div style="font-size:16px; font-weight:600; color:${design.text};">${item.balance || '¥0.00'}</div>
                            </div>
                            <div style="font-size:13px; font-weight:700; color:${design.text}; opacity:0.9; letter-spacing:1px;">${design.type}</div>
                        </div>
                    </div>
                </div>`;
            } else {
                // 理财 - 【全中文单据风】高度自适应解决显示不全问题
                let mockId = Math.floor(Math.random()*9000)+1000;
                contentVisual = `
                <div style="padding:25px; background:#fff; height:100%; display:flex; flex-direction:column; justify-content:space-between; text-align:left; box-sizing:border-box;">
                    <div style="margin-bottom:20px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
                            <div style="font-size:11px; color:#333; letter-spacing:1px; font-weight:700; background:#f2f2f2; padding:4px 8px; border-radius:4px;">${badgeText}</div>
                            <div style="font-size:11px; color:#aaa; font-family:monospace; letter-spacing:1px;">单号: ${mockId}</div>
                        </div>
                        <div style="font-size:16px; font-weight:600; color:#111; margin-bottom:8px;">${item.name || '未命名资产'}</div>
                        <div style="font-size:13px; color:#888; font-weight:400; line-height:1.6; padding-right:10px;">${item.desc || '暂无详细描述信息。'}</div>
                    </div>
                    
                    <div style="background:#fafafa; padding:15px; border-radius:8px; border:1px solid #f0f0f0;">
                        <div style="font-size:10px; color:#888; letter-spacing:1px; margin-bottom:6px;">当前估值</div>
                        <div style="font-size:20px; font-weight:600; color:#111; font-family:-apple-system, sans-serif;">${item.amount || '¥0.00'}</div>
                    </div>
                </div>`;
            }

            // 卡片外壳容器 (注意这里 bank 限制高度200px，其他都是 auto 自适应！)
            let cardHeight = cardType === 'bank' ? '200px' : 'auto';
            return `
            <div class="snoop-deck-${category}" onclick="handleSnoopDeckClick(event, '${category}', ${items.length})" style="position:absolute; top:30px; left:50%; width:82%; height:${cardHeight}; margin-left:-41%; transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.4s; border-radius:16px; background:#fff; box-shadow:0 12px 30px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.02); overflow:hidden; cursor:pointer; border:1px solid rgba(0,0,0,0.03);">
                ${contentVisual}
            </div>`;
        }).join('');
        
        // 极简指示器
        let dotsHtml = items.map((_, i) => `<div class="dot-${category}-${i}" style="width:6px; height:6px; border-radius:50%; background:${i===0 ? '#111' : '#ccc'}; transition:background 0.3s;"></div>`).join('');
        let indicatorHtml = items.length > 1 ? `
        <div style="position:absolute; bottom:25px; width:100%; display:flex; justify-content:center; gap:6px; z-index:5;">
            ${dotsHtml}
        </div>` : '';

        return `<div style="position:absolute; width:100%; height:100%; top:0; left:0; padding-bottom:50px;">${cardsHtml}${indicatorHtml}</div>`;
    };

    // 2. 概览区块 - 【全中文】高级财务报表排版
    let netWorth = data.summary ? (data.summary.netWorth || '暂无') : '暂无';
    let debt = data.summary ? (data.summary.debt || '0') : '0';
    let overviewHtml = `
        <div style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#fafafa; padding:0 20px; box-sizing:border-box;">
            
            <div style="width:85%; max-width:320px; background:#fff; border-radius:16px; box-shadow:0 8px 30px rgba(0,0,0,0.04); border:1px solid rgba(0,0,0,0.04); overflow:hidden;">
                
                <!-- 头部：净资产 -->
                <div style="padding:25px 25px 20px; border-bottom:1px solid #f5f5f5;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <div style="font-size:11px; color:#888; letter-spacing:1px; font-weight:600;">总计净资产</div>
                        <!-- 呼吸绿点：表示财务状况Active -->
                        <div style="width:6px; height:6px; background:#4CAF50; border-radius:50%; box-shadow:0 0 0 3px rgba(76, 175, 80, 0.1);"></div>
                    </div>
                    <div style="font-size:24px; font-weight:600; color:#111; letter-spacing:-0.5px; font-family:-apple-system, sans-serif;">
                        ${netWorth}
                    </div>
                </div>

                <!-- 详情区：资产与负债拆解 -->
                <div style="padding:20px 25px; background:#fafbfc;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                        <div style="font-size:12px; color:#777; font-weight:500;">资产概况</div>
                        <div style="font-size:12px; color:#ccc; font-weight:400;"><i class="fas fa-shield-alt"></i></div>
                    </div>
                    
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:15px; padding-top:15px; border-top:1px dashed #e8e8e8;">
                        <div style="font-size:12px; color:#777; font-weight:500;">负债 / 欠款</div>
                        <div style="font-size:14px; font-weight:600; color:#d9534f; font-family:-apple-system, sans-serif;">${debt}</div>
                    </div>
                </div>
                
                <!-- 底部质感小标 -->
                <div style="padding:12px 25px; background:#f4f5f7; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #eee;">
                    <div style="font-size:10px; color:#999; letter-spacing:1px; font-weight:500;">状态：健康良好</div>
                    <div style="font-size:10px; color:#999; letter-spacing:1px; font-weight:500;">安全已加密</div>
                </div>
                
            </div>
            
        </div>
    `;

    // 3. 各分类区块生成
    let estateHtml = buildDeckHTML(data.realEstate, 'estate', [
        'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&q=80',
        'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=600&q=80'
    ], '房产项目', 'image');

    let vehicleHtml = buildDeckHTML(data.vehicles, 'vehicle', [
        'https://images.unsplash.com/photo-1503376713356-2eb8fbfefdd4?w=600&q=80',
        'https://images.unsplash.com/photo-1614200179396-2bdb77ebf81b?w=600&q=80'
    ], '车辆信息', 'image');

    let bankHtml = buildDeckHTML(data.financials, 'bank', [], '银行账户', 'bank');
    
    let investHtml = buildDeckHTML(data.investments, 'invest', [], '投资理财', 'invest');

    // 装载所有区块
    list.innerHTML = `
        <div id="asset-pane-overview" class="asset-pane active" style="width:100%; height:100%; position:absolute; top:0; left:0; animation: tr-reveal 0.3s ease;">${overviewHtml}</div>
        <div id="asset-pane-estate" class="asset-pane" style="display:none; width:100%; height:100%; position:absolute; top:0; left:0; animation: tr-reveal 0.3s ease;">${estateHtml}</div>
        <div id="asset-pane-vehicle" class="asset-pane" style="display:none; width:100%; height:100%; position:absolute; top:0; left:0; animation: tr-reveal 0.3s ease;">${vehicleHtml}</div>
        <div id="asset-pane-bank" class="asset-pane" style="display:none; width:100%; height:100%; position:absolute; top:0; left:0; animation: tr-reveal 0.3s ease;">${bankHtml}</div>
        <div id="asset-pane-invest" class="asset-pane" style="display:none; width:100%; height:100%; position:absolute; top:0; left:0; animation: tr-reveal 0.3s ease;">${investHtml}</div>
    `;

    document.getElementById('snoop-asset-view').style.display = 'block';
    void document.getElementById('snoop-asset-view').offsetWidth;
    document.getElementById('snoop-asset-view').classList.add('active');

    // 初始化层叠
    ['estate', 'vehicle', 'bank', 'invest'].forEach(cat => updateSnoopDeck(cat));
}

// ==========================================
// 全局交互：Ins风左右点击翻页 与 Tab切换
// ==========================================

window.handleSnoopDeckClick = function(event, category, total) {
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const clickX = event.clientX - rect.left;

    // 轻微点击回弹
    card.style.transform = card.style.transform.replace(/scale\([0-9.]+\)/, '') + ' scale(0.98)';
    setTimeout(() => updateSnoopDeck(category), 150);

    // 左侧上一张，右侧下一张
    if (clickX < rect.width / 2) {
        window.snoopDeckIndexes[category] = (window.snoopDeckIndexes[category] - 1 + total) % total;
    } else {
        window.snoopDeckIndexes[category] = (window.snoopDeckIndexes[category] + 1) % total;
    }

    // 更新底部小圆点指示器
    const currentIdx = window.snoopDeckIndexes[category];
    for(let i=0; i<total; i++) {
        let dot = document.querySelector(`.dot-${category}-${i}`);
        if(dot) dot.style.background = (i === currentIdx) ? '#111' : '#ccc';
    }
    
    updateSnoopDeck(category);
}

// 刷新层叠 3D 效果
window.updateSnoopDeck = function(category) {
    const cards = document.querySelectorAll('.snoop-deck-' + category);
    if(cards.length === 0) return;
    const currentIndex = window.snoopDeckIndexes[category];
    const total = cards.length;
    
    cards.forEach((card, idx) => {
        let diff = (idx - currentIndex + total) % total;
        
        if (diff === 0) {
            // 第1张 (最上面)
            card.style.transform = 'translateY(0) scale(1)';
            card.style.opacity = '1';
            card.style.zIndex = '20';
            card.style.pointerEvents = 'auto';
        } else if (diff === 1 || (total === 2 && diff === -1)) {
            // 第2张
            card.style.transform = 'translateY(16px) scale(0.95)';
            card.style.opacity = '0.6';
            card.style.zIndex = '19';
            card.style.pointerEvents = 'none';
        } else if (diff === 2 && total > 2) {
            // 第3张
            card.style.transform = 'translateY(32px) scale(0.90)';
            card.style.opacity = '0.3';
            card.style.zIndex = '18';
            card.style.pointerEvents = 'none';
        } else {
            // 隐藏
            card.style.transform = 'translateY(40px) scale(0.85)';
            card.style.opacity = '0';
            card.style.zIndex = '10';
            card.style.pointerEvents = 'none';
        }
    });
}

// 顶部 Tab 切换
window.switchSnoopAssetTab = function(tabId, el) {
    document.querySelectorAll('.asset-tab-btn').forEach(btn => {
        btn.style.fontWeight = '400';
        btn.style.color = '#999';
        let line = btn.querySelector('.tab-line');
        if(line) line.remove();
    });

    el.style.fontWeight = '600';
    el.style.color = '#111';
    el.insertAdjacentHTML('beforeend', '<div class="tab-line" style="position:absolute; bottom:0; left:50%; transform:translateX(-50%); width:16px; height:2px; background:#111; border-radius:2px;"></div>');

    document.querySelectorAll('.asset-pane').forEach(pane => {
        pane.style.display = 'none';
    });
    
    const target = document.getElementById('asset-pane-' + tabId);
    if(target) {
        target.style.display = 'block';
        if(tabId !== 'overview') updateSnoopDeck(tabId);
    }
}


window.closeSnoopReport = function() {
    document.getElementById('snoop-report-view').classList.remove('active');
}

// 实时监控微缩卡片（保留了，用来生成实时小动态）
window.openSnoopCam = async function() {
    document.getElementById('snoop-cam-view').classList.add('active');
    document.getElementById('cam-time').innerText = new Date().toLocaleTimeString();
    
    if(window.snoopCamInterval) clearInterval(window.snoopCamInterval);
    window.snoopCamInterval = setInterval(() => {
        document.getElementById('cam-time').innerText = new Date().toLocaleTimeString();
    }, 1000);

    const friend = friendsData[snoopCurrentChatId];
    document.getElementById('cam-text').innerText = "正在建立连接...";

    let trPending = JSON.parse(localStorage.getItem('tr_pending_context') || '[]');
    trPending.push(`用户正在通过隐藏摄像头实时偷窥你。`);
    localStorage.setItem('tr_pending_context', JSON.stringify(trPending));

    const settingsJSON = localStorage.getItem('myCoolPhone_aiSettings');
    if (!settingsJSON) {
        document.getElementById('cam-text').innerText = "连接失败：无 API 配置";
        return;
    }
    const settings = JSON.parse(settingsJSON);
    let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
    const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

    const sysPrompt = `你是一个隐藏摄像头监控系统。
目标：${friend.realName}
人设：${friend.persona}
请用【纯画面描述】客观、不带主观评价地描述摄像头现在拍到了 ${friend.realName} 在做什么。字数控制在 40-60 字。`;

    try {
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
            body: JSON.stringify({
                model: settings.model,
                messages: [{ role: "system", content: sysPrompt }],
                temperature: 0.7
            })
        });
        if (!res.ok) throw new Error("API Request Failed");
        const data = await res.json();
        document.getElementById('cam-text').innerText = data.choices[0].message.content.trim();
    } catch(e) {
        document.getElementById('cam-text').innerText = "连接中断：" + e.message;
    }
}

window.closeSnoopCam = function() {
    document.getElementById('snoop-cam-view').classList.remove('active');
    if(window.snoopCamInterval) clearInterval(window.snoopCamInterval);
}
// ==========================================
// 沉浸式互动探索模式逻辑 (动态渲染区域和闪光点)
// ==========================================
// ==========================================
// 沉浸式互动探索模式逻辑 (动态渲染区域和闪光点)
// ==========================================
window.openSnoopInteractiveView = function() {
    const view = document.getElementById('snoop-interactive-view');
    const menu = document.getElementById('snoop-dropdown-menu'); // 🌟 改找新的悬浮菜单
    const label = document.getElementById('snoop-dropdown-label'); // 🌟 找顶部的文字标签
    if (!view || !menu) return;
    
    const areas = window.currentSnoopInteractiveData || [];
    
    // 🌟 用自定义的 div 替换难看的原生 option
    let html = '';
    areas.forEach((area, index) => {
        // 默认让第一个选项加上选中的小黑点
        let isSelected = index === 0 ? ' selected' : '';
        html += `<div class="snoop-dropdown-item${isSelected}" onclick="selectCustomArea('${index}', '${area.name}', this)">${area.name}</div>`;
    });
    
    menu.innerHTML = html;
    
    // 默认把触发器按钮上的文字改成第一个区域的名字
    if (areas.length > 0 && label) {
        label.innerText = areas[0].name;
    }
    
    view.classList.add('active');
    changeSnoopInteractiveArea(0); // 默认打开第一个场景
}
window.changeSnoopInteractiveArea = function(index) {
    const areas = window.currentSnoopInteractiveData || [];
    const area = areas[index];
    if (!area) return;
    
    // 切换场景时隐藏掉当前的物品提示框
    document.getElementById('snoop-item-modal').classList.remove('active');
    
    let bgUrl = '';
    
    // 1. 先寻找精确匹配的背景大图 (比如预设的 home_bedroom)
    Object.values(snoopLocs).forEach(loc => {
        if (loc.name.includes(area.name) || area.name.includes(loc.name)) {
            bgUrl = loc.bg;
        }
    });

    // ==========================================
    // 2. 核心新增：关键词嗅探匹配动态图库
    // ==========================================
    if (!bgUrl) {
        const name = area.name || '';
        // 预设的高级感场景图库
        const keywordBgs = [
            { keys: ['车', '驾', '后备箱', '副驾', '座椅'], url: 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=600&q=80' }, // 车内/座驾
            { keys: ['办公', '公司', '工位', '会议', '电脑', '桌'], url: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=600&q=80' }, // 办公室/工位
            { keys: ['咖啡', '茶', '饮', '餐', '吧', '酒', '迪'], url: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=600&q=80' }, // 咖啡馆/酒吧/餐馆
            { keys: ['健身', '房', '运动', '操', '馆', '瑜伽'], url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&q=80' }, // 健身房
            { keys: ['街', '巷', '道', '路', '公园', '广场'], url: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=600&q=80' }, // 街道/室外/夜景
            { keys: ['店', '商', '购', '铺', '超市', '网吧'], url: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&q=80' }, // 商店/商场
            { keys: ['酒店', '宾馆', '旅馆', '开房', '客房'], url: 'https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=600&q=80' }, // 酒店/客房
            { keys: ['包', '袋', '柜', '箱', '抽屉', '夹'], url: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=600&q=80' } // 个人财产类 (包/柜子)
        ];

        // 遍历匹配词典
        for (let i = 0; i < keywordBgs.length; i++) {
            if (keywordBgs[i].keys.some(k => name.includes(k))) {
                bgUrl = keywordBgs[i].url;
                break;
            }
        }
    }

    // 3. 如果连关键词都没匹配上，找一个当前大类的图兜底
    if (!bgUrl) {
        let parentBg = '';
        Object.values(snoopLocs).forEach(loc => {
            if (loc.parent === snoopCurrentParent && loc.bg) parentBg = loc.bg;
        });
        bgUrl = parentBg || 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&q=80';
    }
    
    document.getElementById('snoop-inter-bg').style.backgroundImage = `url('${bgUrl}')`;
    
    // 撒布随机闪光点
    const pointsContainer = document.getElementById('snoop-inter-points');
    pointsContainer.innerHTML = '';
    
    if (area.items && Array.isArray(area.items)) {
        area.items.forEach(item => {
            let pt = document.createElement('div');
            pt.className = 'snoop-flash-point';
            // 随机坐标：限定在画面中心区域，避免贴边点不到
            let top = 25 + Math.random() * 50; 
            let left = 15 + Math.random() * 70; 
            pt.style.top = top + '%';
            pt.style.left = left + '%';
            
            // 点击弹出物品详情
            pt.onclick = () => {
                document.getElementById('snoop-item-title').innerText = item.name;
                document.getElementById('snoop-item-desc').innerText = item.desc;
                document.getElementById('snoop-item-modal').classList.add('active');
            };
            pointsContainer.appendChild(pt);
        });
    }
}


window.closeSnoopInteractive = function() {
    document.getElementById('snoop-interactive-view').classList.remove('active');
    document.getElementById('snoop-item-modal').classList.remove('active');
}
// 1. 控制下拉菜单的展开与收起
function toggleSnoopDropdown() {
    document.getElementById('snoop-dropdown-menu').classList.toggle('active');
    document.getElementById('snoop-dropdown-arrow').classList.toggle('active');
}

// 2. 点击外部区域时自动关闭菜单
document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('snoop-custom-dropdown');
    if (dropdown && !dropdown.contains(e.target)) {
        document.getElementById('snoop-dropdown-menu').classList.remove('active');
        document.getElementById('snoop-dropdown-arrow').classList.remove('active');
    }
});

// 3. 选中某个区域时触发的函数
function selectCustomArea(areaId, areaName, element) {
    // 改变触发器上的文字
    document.getElementById('snoop-dropdown-label').innerText = areaName;
    
    // 移除所有选项的 selected 样式，给当前项加上
    const items = document.querySelectorAll('.snoop-dropdown-item');
    items.forEach(item => item.classList.remove('selected'));
    element.classList.add('selected');

    // 收起菜单
    toggleSnoopDropdown();

    // 🌟调用你原本的切换场景函数
    changeSnoopInteractiveArea(areaId); 
}
