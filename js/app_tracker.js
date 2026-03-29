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
          description: (friendsData[id].persona || '').slice(0, 60),
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
    renderScenarioModal();
    $('tr-scenario-modal').classList.add('active');
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
  "trash": [
    {"type":"已删除录音","desc":"删除内容的描述（如：一段30秒的哽咽录音，录着'我只是想让你知道……'）","reason":"删除原因"},
    {"type":"已删除订单","desc":"订单信息","reason":"为什么删除"}
  ]
}`;
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
        throw Object.assign(new Error('no_json'), { code: 'no_json', detail: 'JSON parse failed: ' + parseErr.message });
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
      const content = parseScratch(escHtml(entry.content || ''));
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
    addTamperLog(`[系统事件] 用户以你的身份，给"${contactName}"发了一条消息："${text}"。你的手机上留下了这条发送记录，你拿回手机后会发现。请根据消息内容和你的人设做出反应。`);
    showToast(`✅ 已以「${charName}」身份发送！`);
    // 模拟对方自动回复
    setTimeout(() => generateAutoReply(idx), 1500 + Math.random() * 2000);
  }

  /** AI 自动生成对方回复 */
  function generateAutoReply(idx) {
    const data = state.phoneData;
    if (!data || !data.messages?.contacts) return;
    const contact = data.messages.contacts[idx];
    if (!contact) return;
    const c = state.selectedChar;
    const history = (data._contactChats?.[idx] || []).slice(-4).map(m => `${m.sender}: ${m.text}`).join('\n');
    const prompt = `聊天背景：你是"${contact.name}"，正在和"${c.name}"发消息。
最近的对话：
${history}

请以"${contact.name}"的口吻回复一条短消息（15字以内，自然真实）。只输出消息本身，不要任何说明。`;

    callAIRaw(prompt, 60, (reply) => {
      const trimmed = (reply || '').trim().replace(/^["「]|["」]$/g, '');
      if (!trimmed) return;
      data._contactChats[idx].push({ sender: contact.name, text: trimmed });
      renderContactMessages(data._contactChats[idx], idx);
    }, () => {});
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
  const persona  = (char.persona || '').slice(0, 300);

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
