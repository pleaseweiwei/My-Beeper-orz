
/* =========================================================
   Love Space (LS2) - Clean Full Module (Index.html aligned)
   依赖：
   - IDB (你的 IndexedDB wrapper)
   - friendsData, personasMeta, currentPersonaId
   - loadChatHistory(chatId)
   - saveMessageToHistory(chatId, msg)
   - callAiForSpecialTask(prompt)
   - showToast(msg) / showKAlert / showKConfirm / showKPrompt (可选，有则用)
   - compressImage(base64, maxWidth) (可选，用于贴纸/磁贴压缩)
   ========================================================= */

const LS2_STORE_KEY = 'myCoolPhone_ls2_store';

let ls2Store = {};              // { `${personaId}_${aiId}`: ls2Data }
let ls2Data = null;             // 当前空间数据
let ls2PendingAiId = null;      // 正在邀请的对象
let fridgeTimerInterval = null; // 冰箱倒计时刷新

// ===== 小工具：兼容你有/没有 showKPrompt 的情况 =====
function stripDialogHtml(html = '') {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '');
}

function ls2Prompt(title, desc, placeholder = '', cb) {
  if (typeof showKPrompt === 'function') return showKPrompt(title, desc, placeholder, cb);
  const v = prompt(`${title}\n${desc}`, placeholder);
  cb(v);
}
function ls2Alert(html, cb) {
  if (typeof showKAlert === 'function') return showKAlert(html, cb);
  alert(stripDialogHtml(html));
  if (cb) cb();
}
function ls2Confirm(title, desc, onOk, onCancel) {
  if (typeof showKConfirm === 'function') return showKConfirm(title, desc, onOk, onCancel);
  if (confirm(`${title}\n\n${stripDialogHtml(desc)}`)) onOk();
  else if (onCancel) onCancel();
}

function ls2Key(aiId) {
  return `${currentPersonaId}_${aiId}`;
}

function createDefaultLs2Data() {
  return {
    isOpen: false,
    partnerId: null,
    myPersona: '',
    startDate: 0,

    settings: {
      autoStatus: true,
      autoJournal: true,
      autoFridge: true,
      intervalHrs: 4,
      lastGenTime: 0,

      fridgeBg: '',
      spaceBg: '',
      journalCover: '',

      // 字体：输入 URL（ttf/woff2）或留空
      fontMeUrl: '',
      fontAiUrl: '',
      fontMeFamily: '', // 运行时写入
      fontAiFamily: ''  // 运行时写入

      // 纸张 CSS：由纸张弹窗保存
      // journalPaperCSS: "background-color:...; background-image:...; ..."
    },

    // Radar / Status
    statusLog: [], // [{time:"HH:MM", text:"..."}]
    lastStatusDate: '',

    // Journal (多页)
    journals: [], // [{id,date,me,ai,stickersMe,stickersAi}]
    currentJournalIndex: 0,

    // Fridge
    fridgeOut: [], // 外面贴纸/照片 [{id,type:'note'|'img', text/by/color/x/y/rot}]
    fridgeIn: [],  // 冰箱内食物/购物 [{id,emoji,name,unlockTime|null}]
    dietLog: '',

    // Q&A
    qaHistory: [], // [{time,q,myA,aiA,reaction}]

    // Tasks
    tasks: { me: [], ai: [], evalText: '' }
  };
}

// ====== Store Load/Save ======
async function loadLs2Store() {
  try {
    const saved = await IDB.get(LS2_STORE_KEY);
    if (saved && typeof saved === 'object') ls2Store = saved;
    else ls2Store = {};
  } catch (e) {
    console.error('[LS2] load store failed', e);
    ls2Store = {};
  }
}
async function saveLs2Store() {
  try {
    await IDB.set(LS2_STORE_KEY, ls2Store);
  } catch (e) {
    console.error('[LS2] save store failed', e);
  }
}

// ====== View Switch ======
function ls2ShowView(viewId) {
  const views = [
    document.getElementById('ls2-lobby-view'),
    document.getElementById('ls2-setup-view'),
    document.getElementById('ls2-main-view')
  ];

  views.forEach(view => {
    if (!view) return;
    const isActive = view.id === viewId;
    view.classList.toggle('active', isActive);
    view.hidden = !isActive;
    view.style.display = '';
  });
}

// ====== Public: Open/Close App ======
window.openLoveSpaceApp = async function () {
  const app = document.getElementById('loveSpaceApp');
  if (!app) return;
  app.classList.add('open');

  await loadLs2Store();

  const me = personasMeta?.[currentPersonaId] || {};
  const nameEl = document.getElementById('ls2-lobby-my-name');
  const avaEl = document.getElementById('ls2-lobby-my-avatar');
  if (nameEl) nameEl.innerText = me.name || 'Me';
  if (avaEl) avaEl.src = me.avatar || (typeof AVATAR_USER !== 'undefined' ? AVATAR_USER : '');

  ls2Data = null;
  ls2PendingAiId = null;
  ls2ShowView('ls2-lobby-view');
  renderLs2LobbyList();
};

window.closeLoveSpaceApp = function () {
  const app = document.getElementById('loveSpaceApp');
  if (app) app.classList.remove('open');

  const door = document.getElementById('ls2-fridge-door');
  const inside = document.getElementById('ls2-fridge-inner');
  if (door) door.classList.remove('open');
  if (inside) {
    inside.classList.remove('open');
    inside.style.display = '';
  }

  if (fridgeTimerInterval) clearInterval(fridgeTimerInterval);
  fridgeTimerInterval = null;
};

// ====== Lobby Render ======
function renderLs2LobbyList() {
  const list = document.getElementById('ls2-lobby-list');
  if (!list) return;

  const friendIds = Object.keys(friendsData || {});
  if (friendIds.length === 0) {
    list.innerHTML = '<div class="chic-empty">暂无好友，请先在微信里添加 AI。</div>';
    return;
  }

  let gridHtml = '<div class="ls2-partner-grid">';
  friendIds.forEach(aiId => {
    const ai = friendsData[aiId];
    const space = ls2Store[ls2Key(aiId)];
    const isBound = !!(space && space.isOpen);

    const avatar = ai?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(ai?.realName || aiId)}`;
    const displayName = ai?.remark || ai?.realName || aiId;

    const btnText = isBound ? '进入空间' : '发送邀请';
    const statusText = isBound ? 'SOUL BOUND' : 'UNBOUND';
    const statusCls = isBound ? 'pc-status bound' : 'pc-status';
    const btnCls = isBound ? 'pc-btn active' : 'pc-btn';
    const action = isBound ? `ls2EnterSpace('${aiId}')` : `ls2GoToSetup('${aiId}')`;

    gridHtml += `
      <div class="partner-card" onclick="${action}">
        <img src="${avatar}" class="pc-bg">
        <div class="pc-overlay">
          <div class="pc-name">${displayName}</div>
          <div class="${statusCls}">${statusText}</div>
          <div class="${btnCls}">${btnText}</div>
        </div>
      </div>
    `;
  });
  gridHtml += '</div>';
  list.innerHTML = gridHtml;
}

// ====== Setup / Invitation ======
window.ls2BackToLobby = function () {
  ls2Data = null;
  ls2PendingAiId = null;

  const door = document.getElementById('ls2-fridge-door');
  const inside = document.getElementById('ls2-fridge-inner');
  if (door) door.classList.remove('open');
  if (inside) {
    inside.classList.remove('open');
    inside.style.display = '';
  }

  if (fridgeTimerInterval) clearInterval(fridgeTimerInterval);
  fridgeTimerInterval = null;
  renderLs2LobbyList();
  ls2ShowView('ls2-lobby-view');
};

window.ls2GoToSetup = function (aiId) {
  ls2PendingAiId = aiId;
  const ai = friendsData?.[aiId] || {};
  const me = personasMeta?.[currentPersonaId] || {};

  const meImg = document.getElementById('ls2-setup-me-img');
  const aiImg = document.getElementById('ls2-setup-ai-img');
  const meName = document.getElementById('ls2-setup-me-name');
  const aiName = document.getElementById('ls2-setup-ai-name');

  if (meImg) meImg.src = me.avatar || (typeof AVATAR_USER !== 'undefined' ? AVATAR_USER : '');
  if (aiImg) aiImg.src = ai.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(ai.realName || aiId)}`;
  if (meName) meName.innerText = me.name || '我';
  if (aiName) aiName.innerText = ai.remark || ai.realName || aiId;

  ls2ShowView('ls2-setup-view');
};

async function ls2InjectMemory(aiId, desc) {
  // 写到聊天记录里作为“线下事件记忆”，方便模型有上下文
  try {
    await saveMessageToHistory(aiId, {
      text: `[Love Space 事件] ${desc}`,
      type: 'received',
      senderName: 'System',
      isOffline: true
    });
  } catch (e) {
    console.warn('[LS2] inject memory failed', e);
  }
}

window.ls2SendInvitation = async function () {
  if (!ls2PendingAiId) return;
  const aiId = ls2PendingAiId;
  const ai = friendsData?.[aiId];
  if (!ai) return;

  const btn = document.getElementById('ls2-btn-invite');
  const old = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> 心跳连接中...'; btn.style.pointerEvents = 'none'; }

  const myP = personasMeta?.[currentPersonaId]?.persona || '普通人';

  const prompt = `
[System Command]
User wants to open a "Love Space" with you.
User persona: "${myP}"
You are: ${ai.realName || aiId}
Your persona: ${ai.persona || ''}

Reply with JSON only:
{"accept": true, "msg": "一句简短的接受/回应"}
  `.trim();

  const res = await callAiForSpecialTask(prompt);

  if (btn) { btn.innerHTML = old; btn.style.pointerEvents = 'auto'; }

  if (!res) return ls2Alert('对方没有回应，稍后再试一次。');

  let data;
  try {
    data = JSON.parse(res.replace(/```json/gi, '').replace(/```/g, '').trim());
  } catch (e) {
    console.error(res);
    return ls2Alert('解析失败：对方的回复不是标准 JSON。');
  }

  if (!data.accept) return ls2Alert('对方婉拒了你的邀请。');

  const key = ls2Key(aiId);
  if (!ls2Store[key]) ls2Store[key] = createDefaultLs2Data();

  ls2Data = ls2Store[key];
  ls2Data.isOpen = true;
  ls2Data.partnerId = aiId;
  ls2Data.myPersona = myP;
  if (!ls2Data.startDate) ls2Data.startDate = Date.now();

  // 初始化日记第一页
  ensureJournalInitialized();

  await saveLs2Store();
  if (typeof showToast === 'function') showToast(data.msg || '连接成功');

  await ls2InjectMemory(aiId, '我们开通了 Love Space（情侣空间）。');

  window.ls2EnterSpace(aiId);
};

// ====== Enter Space ======
window.ls2EnterSpace = function (aiId) {
  const key = ls2Key(aiId);
  if (!ls2Store[key]) ls2Store[key] = createDefaultLs2Data();
  ls2Data = ls2Store[key];

  if (!ls2Data.isOpen) {
    // 未绑定就走 setup
    return window.ls2GoToSetup(aiId);
  }

  ls2ShowView('ls2-main-view');
  ls2UpdateHeader();
  window.ls2SwitchTab('status'); // 默认 radar
  checkAutoGeneration();
};

window.ls2Disconnect = async function () {
  if (!ls2Data || !ls2Data.partnerId) return;
  const aiId = ls2Data.partnerId;

  ls2Confirm(
    '解除灵魂绑定',
    "确定要解除绑定并清空该空间的数据吗？<br><br><span style='color:#ff4d4f; font-size:11px;'>此操作无法恢复</span>",
    async () => {
      ls2Store[ls2Key(aiId)] = createDefaultLs2Data();
      await saveLs2Store();
      window.ls2ToggleSettings(); // 关设置
      window.ls2BackToLobby();
    }
  );
};

function ls2UpdateHeader() {
  if (!ls2Data || !ls2Data.partnerId) return;

  const ai = friendsData?.[ls2Data.partnerId] || {};
  const me = personasMeta?.[currentPersonaId] || {};

  const aiAvatarEl = document.getElementById('ls2-avatar-ai');
  const meAvatarEl = document.getElementById('ls2-avatar-me');
  const meNameEl = document.getElementById('ls2-name-me');
  const aiNameEl = document.getElementById('ls2-name-ai');
  const daysEl = document.getElementById('ls2-days-count');
  const bgEl = document.getElementById('ls2-space-bg');

  if (aiAvatarEl) aiAvatarEl.src = ai.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(ai.realName || ls2Data.partnerId)}`;
  if (meAvatarEl) meAvatarEl.src = me.avatar || (typeof AVATAR_USER !== 'undefined' ? AVATAR_USER : '');

  if (meNameEl) meNameEl.innerText = me.name || 'Me';
  if (aiNameEl) aiNameEl.innerText = ai.remark || ai.realName || 'AI';

  const start = ls2Data.startDate || Date.now();
  const days = Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24)) + 1;
  if (daysEl) daysEl.innerText = days < 10 ? `0${days}` : String(days);

  if (bgEl) {
    const bg = ls2Data.settings?.spaceBg;
    if (bg && bg.trim()) bgEl.style.backgroundImage = `url('${bg}')`;
  }
}

// ====== Tabs ======
window.ls2SwitchTab = function (tabName, btnEl) {
  // 内容切换
  document.querySelectorAll('.ls2-tab-content').forEach(el => el.classList.remove('active'));
  const tab = document.getElementById(`ls2-tab-${tabName}`);
  if (tab) tab.classList.add('active');

  // 圆岛导航高亮
  document.querySelectorAll('.ls2-nav-item').forEach(el => el.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  else {
    const autoBtn = document.querySelector(`.ls2-nav-item[onclick*="'${tabName}'"]`);
    if (autoBtn) autoBtn.classList.add('active');
  }

  // 刷新对应内容
  if (tabName === 'status') renderLs2Status();
  if (tabName === 'journal') renderLs2Journal();
  if (tabName === 'fridge') renderLs2Fridge();
  if (tabName === 'qa') renderLs2QA();
  if (tabName === 'tasks') renderLs2Tasks();

  // 切走手账时强制合上书（避免遮挡）
  if (tabName !== 'journal' && typeof closeJournalBook === 'function') closeJournalBook();
};

// ============================================================
//  RADAR / STATUS
// ============================================================
window.ls2GenerateStatus = async function () {
  if (!ls2Data || !ls2Data.partnerId) return;
  const aiId = ls2Data.partnerId;
  const ai = friendsData?.[aiId] || {};

  if (typeof showToast === 'function') showToast('正在扫描信号...');

  // 0点清空当天记录
  const today = new Date().toLocaleDateString();
  if (ls2Data.lastStatusDate !== today) {
    ls2Data.statusLog = [];
    ls2Data.lastStatusDate = today;
  }

  const history = await loadChatHistory(aiId);
  const recent = (history || []).slice(-15).map(m => `${m.senderName === 'ME' ? 'User' : (ai.realName || aiId)}: ${m.text}`).join('\n');

  const lastTimeStr = (ls2Data.statusLog && ls2Data.statusLog.length)
    ? (ls2Data.statusLog[ls2Data.statusLog.length - 1].time || '00:00')
    : '00:00';

  const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const prompt = `
[System Command]
你要生成「追踪/系统日志」时间轴，目标对象是：${ai.realName || aiId}

【硬性规则（必须遵守）】
1) 只写“事件/行为”，不要写任何表情、语气词、情绪、心声、对话内容
   - 禁止：哈哈、呜呜、(｡•-•｡)、“我觉得/我想/我生气了”、任何引号里的聊天句子
2) 只用第三人称“Ta”，不要出现“我/你”
3) 文风要像：权限日志 / 设备日志 / 位置轨迹日志 / App 使用记录
4) 每条必须是“可落地的动作 + 对象/地点/设备 + 结果”
5) 不要写解释，不要写建议，不要写总结段落

【内容覆盖范围（尽量多样化）】
- 位置：到达/离开某地点、停留时长、今日停留地点数量、移动轨迹（例如：从A到B）
- App：进入/退出某App、停留时长、切换前后台
- 设备：在 iPhone 15 / iPhone 15 Pro 登录/退出、网络状态变化（Wi‑Fi/4G/无网）
- 权限：开启/关闭“始终定位”、开启/关闭“手机状态查看权限”、相册/麦克风/相机权限的开关
- 敏感操作：查看“敏感操作记录”、修改隐私设置、清除记录、绑定/解绑
- 屏幕状态：打开手机/锁屏/关机、累计使用时长、最后一次解锁时间

【输出数量】
- 输出 10 ~ 18 条，时间从 "${lastTimeStr}" 到 "${nowStr}"
- 时间要合理递增（可以不均匀）

【输出格式（严格 JSON，不要 markdown，不要多余文字）】
[
  {"time":"13:40","text":"Ta ..."},
  {"time":"13:58","text":"Ta ..."}
]

【参考风格（照这个力度写，但内容要根据上下文自由生成）】
- Ta刚刚到达了这个地点：重庆市渝北区北部新区高新园K2-4地块
- Ta刚刚离开了这个地点：重庆市渝北区北部新区高新园K2-4地块
- Ta今日停留了2个地方
- Ta在洪湖西路已经超过了2小时
- Ta进入了LinkUp
- Ta在iPhone 15上登录了账号
- Ta在iPhone 15 Pro上退出了账号
- Ta查看了你的敏感操作记录
- Ta开启了始终定位权限 / Ta关闭了始终定位权限
- Ta对你开启了手机状态查看权限 / Ta对你关闭了手机状态查看权限
- Ta打开了手机 / Ta关闭了手机（使用时长2小时15分）

【输入上下文（供你参考，不要原样复读）】
最近聊天内容：
${recent || '(no recent chats)'}
`.trim();


  const res = await callAiForSpecialTask(prompt);
  if (!res) return;

  try {
    const arr = JSON.parse(res.replace(/```json/gi, '').replace(/```/g, '').trim());
    if (!Array.isArray(arr)) throw new Error('Not array');

    if (!ls2Data.statusLog) ls2Data.statusLog = [];
    ls2Data.statusLog = ls2Data.statusLog.concat(arr);

    ls2Store[ls2Key(aiId)] = ls2Data;
    await saveLs2Store();

    renderLs2Status();
    if (typeof showToast === 'function') showToast('追踪记录已追加');
  } catch (e) {
    console.error(res);
    if (typeof showToast === 'function') showToast('追踪失败：JSON解析错误');
  }
};

function renderLs2Status() {
  const c = document.getElementById('ls2-radar-container');
  if (!c) return;

  const log = ls2Data?.statusLog || [];
  if (!log.length) {
    c.innerHTML = '<div class="chic-empty" style="text-align:center; padding: 40px; color:#aaa;">暂无追踪记录，点击上方按钮扫描</div>';
    return;
  }

  let html = '<div class="ls2-timeline-container">';
  log.forEach(s => {
    const text = String(s.text || '');
    const isHighlight = /敏感|关闭|退出|异常|离开|定位|飞行|酒店|酒吧|夜店/.test(text);
    html += `
      <div class="ls2-tl-item ${isHighlight ? 'highlight' : ''}">
        <div class="ls2-tl-time">${s.time || ''}</div>
        <div class="ls2-tl-dot"></div>
        <div class="ls2-tl-content">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      </div>
    `;
  });
  html += '</div>';
  c.innerHTML = html;
}

// ============================================================
//  JOURNAL (多页 + 贴纸 + 字体 + 纸张)
// ============================================================
function ensureJournalInitialized() {
  if (!ls2Data.journals || !Array.isArray(ls2Data.journals) || ls2Data.journals.length === 0) {
    ls2Data.journals = [{
      id: Date.now(),
      date: new Date().toLocaleDateString(),
      me: '',
      ai: '',
      stickersMe: [],
      stickersAi: []
    }];
    ls2Data.currentJournalIndex = 0;
  }
}

function ensureFontStyleTag() {
  let tag = document.getElementById('ls2-dynamic-fonts');
  if (!tag) {
    tag = document.createElement('style');
    tag.id = 'ls2-dynamic-fonts';
    document.head.appendChild(tag);
  }
  return tag;
}

function applyJournalFonts() {
  if (!ls2Data || !ls2Data.settings) return;

  const s = ls2Data.settings;
  const tag = ensureFontStyleTag();

  let css = '';
  // 我的字体
  if (s.fontMeUrl && /^https?:\/\//i.test(s.fontMeUrl)) {
    css += `@font-face{font-family:'LS2FontMe';src:url('${s.fontMeUrl}');font-display:swap;}\n`;
    s.fontMeFamily = `'LS2FontMe', 'Caveat', 'Alex Brush', cursive`;
  } else {
    s.fontMeFamily = `'Caveat', 'Alex Brush', cursive`;
  }
  // TA字体
  if (s.fontAiUrl && /^https?:\/\//i.test(s.fontAiUrl)) {
    css += `@font-face{font-family:'LS2FontAi';src:url('${s.fontAiUrl}');font-display:swap;}\n`;
    s.fontAiFamily = `'LS2FontAi', 'Caveat', 'Alex Brush', cursive`;
  } else {
    s.fontAiFamily = `'Caveat', 'Alex Brush', cursive`;
  }

  tag.innerHTML = css;

  const meEl = document.getElementById('ls2-journal-me');
  const aiEl = document.getElementById('ls2-journal-ai');
  if (meEl) { meEl.style.fontFamily = s.fontMeFamily; meEl.style.fontSize = '20px'; }
  if (aiEl) { aiEl.style.fontFamily = s.fontAiFamily; aiEl.style.fontSize = '20px'; }
}

function applyJournalPaper() {
  const paperEl = document.getElementById('journal-paper');
  if (!paperEl) return;

  // 不要把 className 清空（你的 CSS 需要 paper-texture 等）
  // 只覆盖 style
  paperEl.style.removeProperty('background');
  paperEl.style.removeProperty('backgroundImage');
  paperEl.style.removeProperty('backgroundSize');
  paperEl.style.removeProperty('backgroundColor');

  const css = ls2Data?.settings?.journalPaperCSS || '';
  if (css) paperEl.style.cssText += ';' + css;
}

window.openJournalBook = function () {
  const cover = document.getElementById('journal-cover');
  if (cover) cover.classList.add('opened');
  applyJournalPaper();
};

window.closeJournalBook = function () {
  const cover = document.getElementById('journal-cover');
  if (cover) cover.classList.remove('opened');
};

window.switchJournalTab = function (tab) {
  const tabs = document.querySelectorAll('.j-tab');
  const mePage = document.getElementById('j-page-me');
  const aiPage = document.getElementById('j-page-ai');

  if (tabs && tabs.length >= 2) {
    tabs[0].classList.remove('active');
    tabs[1].classList.remove('active');
  }

  const showMe = tab === 'me';

  if (showMe) {
    if (tabs[0]) tabs[0].classList.add('active');
  } else {
    if (tabs[1]) tabs[1].classList.add('active');
  }

  if (mePage) {
    mePage.classList.toggle('active', showMe);
    mePage.hidden = !showMe;
    mePage.style.display = '';
  }
  if (aiPage) {
    aiPage.classList.toggle('active', !showMe);
    aiPage.hidden = showMe;
    aiPage.style.display = '';
  }

  renderLs2Journal(); // 切页后重绘贴纸（贴纸分 me/ai）
};

window.journalPrevPage = function () {
  ensureJournalInitialized();
  if (ls2Data.currentJournalIndex > 0) {
    ls2Data.currentJournalIndex--;
    ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
    saveLs2Store();
    renderLs2Journal();
  } else {
    if (typeof showToast === 'function') showToast('已经是第一页啦');
  }
};

window.journalNextPage = function () {
  ensureJournalInitialized();
  if (ls2Data.currentJournalIndex < ls2Data.journals.length - 1) {
    ls2Data.currentJournalIndex++;
    ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
    saveLs2Store();
    renderLs2Journal();
  } else {
    if (typeof showToast === 'function') showToast('已经是最后一页啦');
  }
};

window.journalNewPage = function () {
  ensureJournalInitialized();
  ls2Data.journals.push({
    id: Date.now(),
    date: new Date().toLocaleDateString(),
    me: '',
    ai: '',
    stickersMe: [],
    stickersAi: []
  });
  ls2Data.currentJournalIndex = ls2Data.journals.length - 1;

  ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
  saveLs2Store();
  renderLs2Journal();
  if (typeof showToast === 'function') showToast('已开启新的一天日记');
};

// 保存手账文本（你 HTML 的 onblur 会调用）
window.ls2SaveJournalData = function () {
  ensureJournalInitialized();
  const idx = ls2Data.currentJournalIndex || 0;
  const j = ls2Data.journals[idx];

  const meEl = document.getElementById('ls2-journal-me');
  const aiEl = document.getElementById('ls2-journal-ai');
  if (meEl) j.me = meEl.value || '';
  if (aiEl) j.ai = aiEl.value || '';

  ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
  saveLs2Store();
};

// 生成 TA 的日记
window.ls2GenerateJournal = async function (isAuto = false) {
  if (!ls2Data || !ls2Data.partnerId) return;
  ensureJournalInitialized();

  const aiId = ls2Data.partnerId;
  const ai = friendsData?.[aiId] || {};

  if (!isAuto && typeof showToast === 'function') showToast('正在生成 TA 的日记...');

  const history = await loadChatHistory(aiId);
  const recent = (history || []).slice(-20).map(m => `${m.senderName === 'ME' ? 'Her(User)' : 'Me'}: ${m.text}`).join('\n');

    const idx = ls2Data.currentJournalIndex || 0;
  const j = ls2Data.journals[idx];
  
  // 提取今天你这页上的照片和贴纸内容，扔给AI
  let userStickersInfo = (j.stickersMe || []).map(s => {
      if (s.type === 'note') return `贴了张便利贴写着："${s.content}"`;
      if (s.type === 'img') return `贴了一张照片（照片描述：${s.desc || '一张照片'}）`;
      return '';
  }).filter(Boolean).join('；');

  const prompt = `
[System Command]
Roleplay: You are ${ai.realName || aiId}
Persona: ${ai.persona || ''}

Task:
Write a diary entry for today.
- Language: Chinese
- First person "我"
- 100-200 words

[Context of User's Diary Today]
User's diary text: "${j.me || '无记录'}"
User added to their diary page: ${userStickersInfo || '没有贴其他东西'}

[Instruction]
Generate YOUR diary for today. You can react to what the user wrote or the photos they attached, or talk about recent chats.
Recent chats:
${recent || '(no recent chats)'}

At the end of your diary, if you want to attach some stickers or photos of your own as annotations, use this EXACT format on a new line:
[STICKER: shape=shape-heart, color=#ffcccc, text=想你！]
(Available shapes: shape-rect, shape-square, shape-rounded, shape-circle, shape-heart, shape-star)
[PHOTO: desc=一张看海的照片]

Do not use markdown code blocks, just output the text and the tags.
  `.trim();

  const res = await callAiForSpecialTask(prompt);
  if (!res) return;

  let diary = res.replace(/```/g, '').trim();

  // 解析AI生成的异形便利贴与图片
  const stickerRegex = /$$STICKER:\s*shape=(.*?),\s*color=(.*?),\s*text=(.*?)$$/gi;
  const photoRegex = /$$PHOTO:\s*desc=(.*?)$$/gi;

  let match;
  if (!j.stickersAi) j.stickersAi = [];

  while ((match = stickerRegex.exec(diary)) !== null) {
      j.stickersAi.push({
          id: Date.now() + Math.random(),
          type: 'note',
          shape: match.trim(),
          bg: match.trim(),
          content: match.trim(),
          x: 20 + Math.random() * 50,
          y: 20 + Math.random() * 50,
          rot: Math.random() * 20 - 10,
          scale: 1
      });
  }
  while ((match = photoRegex.exec(diary)) !== null) {
      j.stickersAi.push({
          id: Date.now() + Math.random(),
          type: 'img',
          shape: 'shape-rect',
          content: 'https://images.unsplash.com/photo-1518134346374-184f9d21cea2?q=80&w=300&auto=format&fit=crop', // 给AI用的网图占位
          desc: match.trim(),
          hasBorder: true,
          x: 20 + Math.random() * 50,
          y: 20 + Math.random() * 50,
          rot: Math.random() * 20 - 10,
          scale: 1
      });
  }

  diary = diary.replace(stickerRegex, '').replace(photoRegex, '').trim();

  ls2Data.journals[idx].ai = diary;
  ls2Store[ls2Key(aiId)] = ls2Data;
  await saveLs2Store();

  if (!isAuto) {
    renderLs2Journal();
    if (typeof showToast === 'function') showToast('日记已更新');
  } else {
    await ls2InjectMemory(aiId, 'TA写完了今天的日记。');
  }
};


// 贴纸弹窗入口（你 HTML 的工具栏会调用）
window.ls2AddJournalSticker = function () {
    const modal = document.getElementById('ls2-sticker-modal');
    if (!modal) return;

    // reset
    const text = document.getElementById('ls2-sticker-text');
    const preview = document.getElementById('ls2-sticker-preview');
    const border = document.getElementById('ls2-sticker-border');
    const color = document.getElementById('ls2-sticker-color');
    const shape = document.getElementById('ls2-sticker-shape');

    if (text) text.value = '';
    if (preview) { preview.style.backgroundImage = 'none'; preview.dataset.src = ''; }
    if (border) border.checked = false;
    if (color) color.value = '#fff4e6';
    if (shape) shape.value = 'shape-rect';
    
    const bgPreview = document.getElementById('ls2-sticker-bg-preview');
    if(bgPreview) { bgPreview.style.display = 'none'; bgPreview.style.backgroundImage = 'none'; }
    const bgVal = document.getElementById('ls2-sticker-bg-val');
    if(bgVal) bgVal.value = '';
    const imgDesc = document.getElementById('ls2-sticker-img-desc');
    if(imgDesc) imgDesc.value = '';

    window.ls2SwitchStickerTab('text');
    modal.classList.add('active');
};


window.ls2SwitchStickerTab = function (type) {
  const btnText = document.getElementById('tab-sticker-text');
  const btnImg = document.getElementById('tab-sticker-img');
  const pText = document.getElementById('sticker-panel-text');
  const pImg = document.getElementById('sticker-panel-img');
  const modal = document.getElementById('ls2-sticker-modal');

  if (!modal) return;
  modal.dataset.mode = type;

  if (btnText) btnText.className = type === 'text' ? 'tab-btn active' : 'tab-btn';
  if (btnImg) btnImg.className = type === 'img' ? 'tab-btn active' : 'tab-btn';

  if (pText) {
    pText.hidden = type !== 'text';
    pText.style.display = '';
  }
  if (pImg) {
    pImg.hidden = type !== 'img';
    pImg.style.display = '';
  }
};

window.ls2SetStickerColor = function (color) {
  const el = document.getElementById('ls2-sticker-color');
  if (el) el.value = color;
};

window.ls2HandleStickerFile = async function (input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    let base64 = e.target.result;
    try {
      if (typeof compressImage === 'function') base64 = await compressImage(base64, 400);
    } catch {}
    const preview = document.getElementById('ls2-sticker-preview');
    if (preview) {
      preview.style.backgroundImage = `url('${base64}')`;
      preview.dataset.src = base64;
    }
  };
  reader.readAsDataURL(file);
  input.value = '';
};

window.ls2ConfirmAddSticker = function () {
  if (!ls2Data || !ls2Data.partnerId) return;
  ensureJournalInitialized();

  const modal = document.getElementById('ls2-sticker-modal');
  const mode = modal?.dataset?.mode || 'text';
  const shape = document.getElementById('ls2-sticker-shape')?.value || 'shape-rect';

  const isMeTab = document.querySelectorAll('.j-tab')?.[0]?.classList.contains('active');
  const idx = ls2Data.currentJournalIndex || 0;
  const j = ls2Data.journals[idx];

  const sticker = {
    id: Date.now(),
    type: mode === 'img' ? 'img' : 'note',
    x: 40,
    y: 35,
    rot: Math.random() * 10 - 5,
    shape,
    hasBorder: false
  };

    sticker.scale = 1; // 默认缩放比例
  if (sticker.type === 'note') {
    const txt = (document.getElementById('ls2-sticker-text')?.value || '').trim();
    if (!txt) return ls2Alert('请输入文字内容');
    sticker.content = txt;
    sticker.bg = document.getElementById('ls2-sticker-color')?.value || '#fff4e6';
    sticker.bgImg = document.getElementById('ls2-sticker-bg-val')?.value || '';
  } else {
    const src = document.getElementById('ls2-sticker-preview')?.dataset?.src || '';
    if (!src) return ls2Alert('请选择图片');
    sticker.content = src;
    sticker.desc = document.getElementById('ls2-sticker-img-desc')?.value || '一张照片';
    sticker.hasBorder = !!document.getElementById('ls2-sticker-border')?.checked;
  }


  if (isMeTab) {
    if (!j.stickersMe) j.stickersMe = [];
    j.stickersMe.push(sticker);
  } else {
    if (!j.stickersAi) j.stickersAi = [];
    j.stickersAi.push(sticker);
  }

  ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
  saveLs2Store();
  renderLs2Journal();

  modal?.classList.remove('active');
};

window.ls2DelSticker = function (stickerId) {
  if (!ls2Data || !ls2Data.partnerId) return;
  ensureJournalInitialized();

  const isMeTab = document.querySelectorAll('.j-tab')?.[0]?.classList.contains('active');
  const idx = ls2Data.currentJournalIndex || 0;
  const j = ls2Data.journals[idx];

  if (isMeTab) j.stickersMe = (j.stickersMe || []).filter(s => String(s.id) !== String(stickerId));
  else j.stickersAi = (j.stickersAi || []).filter(s => String(s.id) !== String(stickerId));

  ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
  saveLs2Store();
  renderLs2Journal();
};


// 纸张弹窗
window.openPaperModal = function () {
  const modal = document.getElementById('ls2-paper-modal');
  const list = document.getElementById('paper-preview-list');
  if (!modal || !list) return;

  list.innerHTML = '';

  const papers = [
    { name: '纯白相纸', css: 'background-color:#fff; background-image:none;' },
    { name: '方格笔记', css: 'background-color:#fff; background-image:linear-gradient(#e5e5e5 1px, transparent 1px),linear-gradient(90deg,#e5e5e5 1px, transparent 1px); background-size:20px 20px;' },
    { name: '横线信笺', css: 'background-color:#fff; background-image:repeating-linear-gradient(transparent, transparent 23px, #e5e5e5 24px); background-size:100% 100%;' },
    { name: '点阵手账', css: 'background-color:#fff; background-image:radial-gradient(#ccc 1.5px, transparent 1.5px); background-size:20px 20px;' },
    { name: '复古羊皮', css: 'background-color:#f8f1e5; background-image:url("https://www.transparenttextures.com/patterns/aged-paper.png"); background-size:auto;' }
  ];

  papers.forEach(p => {
    const div = document.createElement('div');
    div.className = 'paper-preview-item';
    div.innerHTML = `<div class="paper-preview-name">${p.name}</div>`;
    div.style.cssText += p.css;

    div.onclick = () => {
      if (!ls2Data.settings) ls2Data.settings = {};
      ls2Data.settings.journalPaperCSS = p.css;
      ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
      saveLs2Store();
      applyJournalPaper();
      modal.classList.remove('active');
    };
    list.appendChild(div);
  });

  modal.classList.add('active');
};

// 渲染手账页（最终唯一版本）
function renderLs2Journal() {
  if (!ls2Data || !ls2Data.partnerId) return;
  ensureJournalInitialized();

  // 封面
  const cover = document.getElementById('journal-cover');
  const coverBg = ls2Data.settings?.journalCover;
  if (cover && coverBg) {
    cover.style.backgroundImage = `url('${coverBg}')`;
    cover.style.backgroundSize = 'cover';
    cover.style.backgroundPosition = 'center';
  }

  applyJournalFonts();
  applyJournalPaper();

  const idx = ls2Data.currentJournalIndex || 0;
  const j = ls2Data.journals[idx];

  const dateEl = document.getElementById('journal-date-display');
  if (dateEl) dateEl.innerText = j.date || '';

  const meEl = document.getElementById('ls2-journal-me');
  const aiEl = document.getElementById('ls2-journal-ai');
  if (meEl) meEl.value = j.me || '';
  if (aiEl) aiEl.value = j.ai || '';

  // 贴纸
  const container = document.getElementById('ls2-journal-stickers');
  if (!container) return;
  container.innerHTML = '';

  const isMeTab = document.querySelectorAll('.j-tab')?.[0]?.classList.contains('active');
  const stickers = isMeTab ? (j.stickersMe || []) : (j.stickersAi || []);

  stickers.forEach(s => {
    const el = document.createElement('div');
    el.className = `ls2-note type-${s.type}`;
    el.style.left = (s.x || 40) + '%';
    el.style.top = (s.y || 35) + '%';
    
    const scale = s.scale || 1;
    el.style.transform = `rotate(${s.rot || 0}deg) scale(${scale})`;
    el.style.transformOrigin = 'center center';

        const delBtn = `<div class="note-control-btn note-del-btn" onclick="ls2DelSticker('${s.id}'); event.stopPropagation();"><i class="fas fa-times"></i></div>`;
    const scaleBtns = `
      <div class="note-control-btn scale-up-btn" onclick="ls2ScaleNote('${s.id}', 0.1); event.stopPropagation();"><i class="fas fa-search-plus"></i></div>
      <div class="note-control-btn scale-down-btn" onclick="ls2ScaleNote('${s.id}', -0.1); event.stopPropagation();"><i class="fas fa-search-minus"></i></div>
    `;


    const shapeClass = s.shape || 'shape-rect';
    let innerStyle = ``;
        let innerHtml = '';
    // 彻底去掉便利贴和照片上的胶带装饰
    const tapeHtml = ''; 


    if (s.type === 'note') {
      if (s.bgImg) {
          innerStyle += `background-image:url('${s.bgImg}'); background-size:cover; background-position:center; color:#fff; text-shadow:0 1px 3px rgba(0,0,0,0.8);`;
      } else {
          innerStyle += `background-color:${s.bg || '#fff4e6'}; color:#333;`;
      }
      const fontF = isMeTab ? (ls2Data.settings.fontMeFamily || '') : (ls2Data.settings.fontAiFamily || '');
      innerStyle += `font-family:${fontF}; font-size:18px; padding:15px;`;
      innerHtml = `<span>${String(s.content || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`;
    } else {
      el.style.width = '110px';
      el.style.height = '110px';
      if (s.hasBorder) {
          innerStyle += `background:#fff; padding:6px;`;
          innerHtml = `<img src="${s.content}" style="width:100%;height:100%;display:block;object-fit:cover;border-radius:inherit;">`;
      } else {
          innerHtml = `<img src="${s.content}" style="width:100%;height:100%;display:block;object-fit:contain;border-radius:inherit;">`;
      }
    }

    el.innerHTML = `
      ${delBtn}${scaleBtns}
      <div class="sticker-inner ${shapeClass}" style="${innerStyle}">
          ${innerHtml}
      </div>
    `;

    ls2MakeDraggablePercent(el, s, document.getElementById('journal-paper'), () => {
      ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
      saveLs2Store();
    });

    container.appendChild(el);
  });

}

// 拖拽（百分比定位）
function ls2MakeDraggablePercent(el, dataObj, boundsEl, onSave) {
  let startX = 0, startY = 0;
  el.onpointerdown = (e) => {
     const ctrlBtn = e.target.closest('.note-control-btn');
    if (ctrlBtn) return;

    el.setPointerCapture(e.pointerId);
    startX = e.clientX - el.offsetLeft;
    startY = e.clientY - el.offsetTop;
    el.style.zIndex = 999;

    const onMove = (ev) => {
      const px = ((ev.clientX - startX) / boundsEl.clientWidth) * 100;
      const py = ((ev.clientY - startY) / boundsEl.clientHeight) * 100;

      el.style.left = Math.max(0, Math.min(90, px)) + '%';
      el.style.top = Math.max(0, Math.min(90, py)) + '%';
    };

    const onUp = (ev) => {
      try { el.releasePointerCapture(ev.pointerId); } catch {}
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.style.zIndex = 50;

      dataObj.x = parseFloat(el.style.left);
      dataObj.y = parseFloat(el.style.top);

      if (onSave) onSave();
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  };
}

// ============================================================
//  FRIDGE
// ============================================================
window.ls2ToggleFridgeDoor = function () {
  const door = document.getElementById('ls2-fridge-door');
  const inside = document.getElementById('ls2-fridge-inner');
  if (!door || !inside) return;

  inside.style.display = '';

  if (door.classList.contains('open')) {
    door.classList.remove('open');
    inside.classList.remove('open');
  } else {
    door.classList.add('open');
    requestAnimationFrame(() => {
      inside.classList.add('open');
      renderFridgeInside();
      startFridgeTimer();
    });
  }
};

window.ls2AddFridgeItem = function (type) {
  if (!ls2Data || !ls2Data.partnerId) return;
  if (!ls2Data.fridgeOut) ls2Data.fridgeOut = [];

  const aiId = ls2Data.partnerId;
  const ai = friendsData?.[aiId] || {};

  if (type === 'note' || type === 'buy') {
    const title = type === 'buy' ? '喊TA买菜' : '贴留言';
    const desc = type === 'buy' ? '写下你想让TA买的食材/物品：' : '写一张便利贴：';

    ls2Prompt(title, desc, '输入内容...', async (text) => {
      text = (text || '').trim();
      if (!text) return;

      ls2Data.fridgeOut.push({
        id: Date.now(),
        type: 'note',
        text,
        by: 'me',
        color: ['pink', 'blue', 'white'][Math.floor(Math.random() * 3)],
        x: 20 + Math.random() * 50,
        y: 10 + Math.random() * 60,
        rot: Math.random() * 20 - 10
      });

      // buy：同时投递到 fridgeIn（30~90秒解锁）
      if (type === 'buy') {
        if (!ls2Data.fridgeIn) ls2Data.fridgeIn = [];
        const isBlindBox = text.includes('盲盒') || text.includes('冰块') || Math.random() < 0.15;
        ls2Data.fridgeIn.push({
          id: Date.now() + 1,
          emoji: isBlindBox ? '🧊' : '🛍️',
          name: text,
          unlockTime: Date.now() + (Math.random() * 60000 + 30000)
        });

        // 同时给微信AI一条“你看到冰箱清单了”的提示（可选）
        try {
          if (typeof sendMessageToAI === 'function') {
            sendMessageToAI(`[System: User left a grocery list on the fridge: "${text}". Reply briefly as ${ai.realName || 'you'} and say when you will buy it.]`);
          }
        } catch {}
      }

      ls2Store[ls2Key(aiId)] = ls2Data;
      await saveLs2Store();
      renderLs2Fridge();
      if (typeof showToast === 'function') showToast(type === 'buy' ? '清单已贴上，等待TA送达' : '留言已贴上');
    });
  }

  if (type === 'magnet') {
    const fileInput = document.getElementById('global-img-changer');
    if (!fileInput) return;

    // 这里不强行劫持你的全局 handleImageFileChange
    // 用一次性 onchange 来拿到图片，完事还原
    const prev = fileInput.onchange;
    fileInput.onchange = async (e) => {
      try {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
          let base64 = evt.target.result;
          try {
            if (typeof compressImage === 'function') base64 = await compressImage(base64, 300);
          } catch {}

          ls2Data.fridgeOut.push({
            id: Date.now(),
            type: 'img',
            text: base64,
            x: 30 + Math.random() * 40,
            y: 10 + Math.random() * 60,
            rot: Math.random() * 20 - 10
          });

          ls2Store[ls2Key(aiId)] = ls2Data;
          await saveLs2Store();
          renderLs2Fridge();
          if (typeof showToast === 'function') showToast('照片磁贴已贴上');
        };
        reader.readAsDataURL(f);
      } finally {
        fileInput.value = '';
        fileInput.onchange = prev;
      }
    };

    fileInput.click();
  }
};

window.ls2DelFridgeItem = function (id) {
  if (!ls2Data || !ls2Data.partnerId) return;
  ls2Data.fridgeOut = (ls2Data.fridgeOut || []).filter(x => x.id !== id);
  ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
  saveLs2Store();
  renderLs2Fridge();
};

function renderLs2Fridge() {
  const door = document.getElementById('ls2-fridge-door');
  const stage = document.getElementById('ls2-fridge-surface');
  if (!door || !stage || !ls2Data) return;

  // door bg
  const bg = ls2Data.settings?.fridgeBg;
  if (bg && bg.trim()) door.style.backgroundImage = `url('${bg}')`;

  stage.innerHTML = '';
  (ls2Data.fridgeOut || []).forEach(n => {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = (n.x || 30) + '%';
    el.style.top = (n.y || 30) + '%';
    el.style.transform = `rotate(${n.rot || 0}deg)`;
    el.style.pointerEvents = 'auto';

    if (n.type === 'note') {
      el.className = `ls2-note crooked ${n.color || 'white'}`;
      const who = n.by === 'me' ? 'Me' : (friendsData?.[ls2Data.partnerId]?.realName || 'TA');
      el.innerHTML = `
        <div style="font-size:10px; color:#aaa; margin-bottom:6px;">${who}</div>
        <div>${String(n.text || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        <i class="fas fa-trash note-del" onclick="ls2DelFridgeItem(${n.id}); event.stopPropagation();"></i>
      `;
    } else {
      el.innerHTML = `
        <img src="${n.text}" class="f-magnet-img" style="width:90px;border-radius:12px;box-shadow:0 6px 15px rgba(0,0,0,0.12);display:block;">
        <i class="fas fa-times note-del" style="position:absolute; bottom:-10px; right:-10px; background:#fff; border-radius:50%; padding:2px;" onclick="ls2DelFridgeItem(${n.id}); event.stopPropagation();"></i>
      `;
    }

    ls2MakeDraggablePercent(el, n, door, async () => {
      ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
      await saveLs2Store();
    });

    stage.appendChild(el);
  });
}

function renderFridgeInside() {
  const s1 = document.getElementById('f-shelf-1');
  const s2 = document.getElementById('f-shelf-2');
  const s3 = document.getElementById('f-shelf-3');
  if (!s1 || !s2 || !s3) return;

  s1.innerHTML = '';
  s2.innerHTML = '';
  s3.innerHTML = '';

  const arr = ls2Data?.fridgeIn || [];
  arr.forEach((item, idx) => {
    const locked = item.unlockTime && Date.now() < item.unlockTime;
    const shelf = idx % 3 === 0 ? s1 : (idx % 3 === 1 ? s2 : s3);

    if (locked) {
      const sec = Math.ceil((item.unlockTime - Date.now()) / 1000);
      shelf.insertAdjacentHTML('beforeend', `
        <div class="f-item" style="opacity:.5;filter:grayscale(100%);position:relative;">
          ${item.emoji || '🍎'}
          <div class="f-item-timer">${sec}s</div>
        </div>
      `);
    } else {
      shelf.insertAdjacentHTML('beforeend', `
        <div class="f-item" title="${(item.name||'').replace(/"/g,'&quot;')}" onclick="ls2EatFood(${item.id})">${item.emoji || '🍎'}</div>
      `);
    }
  });
}

function startFridgeTimer() {
  if (fridgeTimerInterval) clearInterval(fridgeTimerInterval);
  fridgeTimerInterval = setInterval(async () => {
    // 只有打开门才刷新，省资源
    const inside = document.getElementById('ls2-fridge-inner');
    if (!inside || !inside.classList.contains('open')) return;

    let changed = false;
    (ls2Data.fridgeIn || []).forEach(item => {
      if (item.unlockTime && Date.now() >= item.unlockTime) {
        item.unlockTime = null;
        changed = true;
      }
    });

    if (changed) {
      ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
      await saveLs2Store();
    }
    renderFridgeInside();
  }, 1000);
}

window.ls2EatFood = async function (id) {
  if (!ls2Data) return;
  const item = (ls2Data.fridgeIn || []).find(x => x.id === id);
  if (!item) return;

  if (item.emoji === '🧊' || (item.name && (item.name.includes('盲盒') || item.name.includes('冰块')))) {
      if (typeof window.ls2OpenBlindBoxModal === 'function') {
          window.ls2OpenBlindBoxModal(id, item.name);
      }
      return;
  }

  ls2Data.fridgeIn = (ls2Data.fridgeIn || []).filter(x => x.id !== id);
  ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
  await saveLs2Store();
  renderFridgeInside();
  if (typeof showToast === 'function') showToast('吃掉啦');
};

// 饮食记录
window.ls2LogDiet = async function () {
  if (!ls2Data || !ls2Data.partnerId) return;
  const input = document.getElementById('my-diet-input');
  const box = document.getElementById('diet-ai-reaction');
  if (!input || !box) return;

  const text = (input.value || '').trim();
  if (!text) return;

  const ai = friendsData?.[ls2Data.partnerId] || {};
  box.style.display = 'block';
  box.innerText = 'AI正在计算热量...';

  const prompt = `
[System Command]
You are ${ai.realName || 'TA'}.
User diet log: "${text}"
Return JSON only:
{"calories": 500, "comment":"一句简短吐槽/夸奖/提醒"}
  `.trim();

  const res = await callAiForSpecialTask(prompt);
  if (!res) return;

  try {
    const data = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim());
    box.innerHTML = `<b>预估热量: ${data.calories} kcal</b><br>${String(data.comment || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}`;
    ls2Data.dietLog = (ls2Data.dietLog || '') + `[我] ${text} (${data.calories}kcal)\n`;
    ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
    await saveLs2Store();
  } catch (e) {
    box.innerText = '计算失败（JSON解析错误）';
  }
};

window.ls2CheckAiDiet = async function () {
  if (!ls2Data || !ls2Data.partnerId) return;
  const box = document.getElementById('diet-ai-reaction');
  if (!box) return;

  const ai = friendsData?.[ls2Data.partnerId] || {};
  box.style.display = 'block';
  box.innerText = '正在查岗 TA 今天吃了什么...';

  const prompt = `
[System Command]
You are ${ai.realName || 'TA'}.
Generate a fake but plausible diet log for today consistent with persona.
Return JSON only:
{"diet":"...", "calories": 1200}
  `.trim();

  const res = await callAiForSpecialTask(prompt);
  if (!res) return;

  try {
    const data = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim());
    box.innerHTML = `<b>${ai.realName || 'TA'} 的饮食查岗:</b><br>${String(data.diet||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}<br><span style="color:#aaa;font-size:10px;">预估热量: ${data.calories} kcal</span>`;
    ls2Data.dietLog = (ls2Data.dietLog || '') + `[TA] ${data.diet}\n`;
    ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
    await saveLs2Store();
  } catch {}
};

// ============================================================
//  Q&A
// ============================================================
window.ls2GenerateQA = async function () {
  if (!ls2Data || !ls2Data.partnerId) return;
  const aiId = ls2Data.partnerId;
  const ai = friendsData?.[aiId] || {};

  // 先让 AI 出题
  if (typeof showToast === 'function') showToast('正在抽取今日灵魂拷问...');
  const qPrompt = `
[System Command]
You are a relationship Q&A generator.
Create ONE deep but daily-life-feeling question for a couple.
Return JSON only: {"q":"..."}
  `.trim();
  const qRes = await callAiForSpecialTask(qPrompt);
  if (!qRes) return;

  let q = '今天你最想对我说的一句话是什么？';
  try {
    const data = JSON.parse(qRes.replace(/```json/gi,'').replace(/```/g,'').trim());
    if (data.q) q = String(data.q).trim();
  } catch {}

  // 问用户回答
  ls2Prompt('今日灵魂拷问', q, '我：', async (myA) => {
    myA = (myA || '').trim();
    if (!myA) return;

    // AI 回答 + reaction
    const aPrompt = `
[System Command]
You are ${ai.realName || aiId}. Persona: ${ai.persona || ''}
Question: "${q}"
User answer: "${myA}"
Now give your answer (as ${ai.realName||'TA'}) and then a short reaction sentence.
Return JSON only:
{"aiA":"...", "reaction":"..."}
    `.trim();

    const aRes = await callAiForSpecialTask(aPrompt);
    let aiA = '';
    let reaction = '';
    try {
      const data = JSON.parse(aRes.replace(/```json/gi,'').replace(/```/g,'').trim());
      aiA = (data.aiA || '').trim();
      reaction = (data.reaction || '').trim();
    } catch {
      aiA = '这个问题…我想认真回答你。';
      reaction = '你刚才那句话，我记下了。';
    }

    const entry = {
      time: Date.now(),
      q, myA, aiA, reaction
    };
    if (!ls2Data.qaHistory) ls2Data.qaHistory = [];
    ls2Data.qaHistory.unshift(entry);

    ls2Store[ls2Key(aiId)] = ls2Data;
    await saveLs2Store();
    renderLs2QA();

    await ls2InjectMemory(aiId, `完成了一次 Q&A：${q}`);
  });
};

function renderLs2QA() {
  const container = document.getElementById('ls2-qa-container');
  const history = document.getElementById('ls2-qa-history');
  if (!container || !history) return;

  const arr = ls2Data?.qaHistory || [];
  if (!arr.length) {
    container.innerHTML = '';
    history.innerHTML = '<div class="chic-empty" style="padding:20px; text-align:center;">暂无问答记录</div>';
    return;
  }

  const top = arr[0];
  container.innerHTML = `
    <div class="qa-card-flat">
      <div class="qa-q-text">${top.q}</div>
      <div class="qa-answer-row"><div class="qa-a-label">我</div><div class="qa-a-text">${top.myA}</div></div>
      <div class="qa-answer-row"><div class="qa-a-label">TA</div><div class="qa-a-text">${top.aiA}</div></div>
      <div class="qa-reaction">"${top.reaction || ''}"</div>
    </div>
  `;

  history.innerHTML = '';
  arr.slice(1).forEach(i => {
    history.innerHTML += `
      <div class="qa-history-item">
        <div class="qa-hi-q" style="font-size:12px;font-weight:bold;color:#111;margin-bottom:4px;">${i.q}</div>
        <div class="qa-hi-a" style="font-size:11px;color:#666;">我: ${i.myA}<br>TA: ${i.aiA}</div>
      </div>
    `;
  });
}

// ============================================================
//  TASKS
// ============================================================
window.ls2AddTask = function (who) {
  if (!ls2Data || !ls2Data.partnerId) return;

  ls2Prompt('添加清单', who === 'me' ? '写一条你今天要做的事：' : '写一条TA要做的事：', '例如：喝水 8 杯', async (text) => {
    text = (text || '').trim();
    if (!text) return;

    const task = {
      id: Date.now(),
      desc: text,
      current: 0,
      max: 1
    };

    if (!ls2Data.tasks) ls2Data.tasks = { me: [], ai: [], evalText: '' };
    ls2Data.tasks[who] = ls2Data.tasks[who] || [];
    ls2Data.tasks[who].unshift(task);

    ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
    await saveLs2Store();
    renderLs2Tasks();
  });
};

window.ls2DelTask = async function (who, id) {
  if (!ls2Data?.tasks) return;
  ls2Data.tasks[who] = (ls2Data.tasks[who] || []).filter(t => t.id !== id);
  ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
  await saveLs2Store();
  renderLs2Tasks();
};

window.ls2TaskTick = async function (who, id) {
  const list = ls2Data?.tasks?.[who] || [];
  const t = list.find(x => x.id === id);
  if (!t) return;

  if (t.current < t.max) t.current++;
  else t.current = t.max;

  ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
  await saveLs2Store();
  renderLs2Tasks();
};

window.ls2GenerateAITask = async function () {
  if (!ls2Data || !ls2Data.partnerId) return;
  const ai = friendsData?.[ls2Data.partnerId] || {};

  if (typeof showToast === 'function') showToast('正在为 TA 生成今日清单...');

  const prompt = `
[System Command]
You are ${ai.realName || 'TA'}.
Persona: ${ai.persona || ''}

Generate 3 daily tasks for yourself (realistic).
Return JSON only:
[
  {"desc":"...", "max":1},
  {"desc":"...", "max":2},
  {"desc":"...", "max":1}
]
  `.trim();

  const res = await callAiForSpecialTask(prompt);
  if (!res) return;

  try {
    const arr = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim());
    if (!Array.isArray(arr)) throw new Error('not array');

    if (!ls2Data.tasks) ls2Data.tasks = { me: [], ai: [], evalText: '' };
    ls2Data.tasks.ai = arr.map(it => ({
      id: Date.now() + Math.random(),
      desc: String(it.desc || '').trim(),
      current: 0,
      max: Math.max(1, parseInt(it.max, 10) || 1)
    })).filter(x => x.desc);

    ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
    await saveLs2Store();
    renderLs2Tasks();
  } catch (e) {
    console.error(res);
    if (typeof showToast === 'function') showToast('生成失败：JSON解析错误');
  }
};

window.ls2EvalTasks = async function () {
  if (!ls2Data || !ls2Data.partnerId) return;
  const ai = friendsData?.[ls2Data.partnerId] || {};

  const meTasks = (ls2Data.tasks?.me || []).map(t => `${t.desc} (${t.current}/${t.max})`).join('\n') || '(无)';
  const aiTasks = (ls2Data.tasks?.ai || []).map(t => `${t.desc} (${t.current}/${t.max})`).join('\n') || '(无)';

  const prompt = `
[System Command]
You are a daily couple coach.
User tasks:
${meTasks}

Partner(${ai.realName || 'TA'}) tasks:
${aiTasks}

Write a short end-of-day evaluation (Chinese), cute but not too long.
Return JSON only: {"text":"..."}
  `.trim();

  const res = await callAiForSpecialTask(prompt);
  if (!res) return;

  try {
    const data = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim());
    if (!ls2Data.tasks) ls2Data.tasks = { me: [], ai: [], evalText: '' };
    ls2Data.tasks.evalText = data.text || '今天也辛苦啦。';

    ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
    await saveLs2Store();
    renderLs2Tasks();

    await ls2InjectMemory(ls2Data.partnerId, '生成了一份日结报告。');
  } catch {
    if (typeof showToast === 'function') showToast('日结报告解析失败');
  }
};

function renderLs2Tasks() {
  const meBox = document.getElementById('ls2-tasks-me');
  const aiBox = document.getElementById('ls2-tasks-ai');
  const evalText = document.getElementById('ls2-task-eval-text');
  if (!meBox || !aiBox || !evalText) return;

  const tasks = ls2Data?.tasks || { me: [], ai: [], evalText: '' };

  const renderOne = (who) => {
    const list = tasks[who] || [];
    if (!list.length) return '<div class="chic-empty">暂无数据</div>';
    return list.map(t => `
      <div class="flat-task-item">
        <div style="flex:1;">
          <div class="fti-desc">${t.desc}</div>
          <div class="fti-prog">${t.current}/${t.max}</div>
        </div>
        <div class="fti-actions">
          <div class="fti-btn ${t.current >= t.max ? 'done' : ''}" onclick="ls2TaskTick('${who}', ${t.id})">
            <i class="fas ${t.current >= t.max ? 'fa-check' : 'fa-plus'}"></i>
          </div>
          <i class="fas fa-times fti-del" onclick="ls2DelTask('${who}', ${t.id})"></i>
        </div>
      </div>
    `).join('');
  };

  meBox.innerHTML = renderOne('me');
  aiBox.innerHTML = renderOne('ai');
  evalText.innerText = tasks.evalText || '等待日结...';
}

// ============================================================
//  SETTINGS MODAL
// ============================================================
window.ls2ToggleSettings = function () {
  const m = document.getElementById('ls2-settings-modal');
  if (!m || !ls2Data) return;

  const isActive = m.classList.contains('active');
  if (isActive) {
    m.classList.remove('active');
    return;
  }

  // fill values
  const spaceBg = document.getElementById('ls2-set-space-bg');
  const fridgeBg = document.getElementById('ls2-set-fridge-bg');
  const coverBg = document.getElementById('ls2-set-journal-cover');

  const fontMe = document.getElementById('ls2-set-font-me');
  const fontAi = document.getElementById('ls2-set-font-ai');

  const tStatus = document.getElementById('ls2-set-status');
  const tJournal = document.getElementById('ls2-set-journal');
  const tFridge = document.getElementById('ls2-set-fridge');
  const interval = document.getElementById('ls2-set-interval');

  if (spaceBg) spaceBg.value = ls2Data.settings?.spaceBg || '';
  if (fridgeBg) fridgeBg.value = ls2Data.settings?.fridgeBg || '';
  if (coverBg) coverBg.value = ls2Data.settings?.journalCover || '';

  if (fontMe) fontMe.value = ls2Data.settings?.fontMeUrl || '';
  if (fontAi) fontAi.value = ls2Data.settings?.fontAiUrl || '';

  if (tStatus) tStatus.checked = !!ls2Data.settings?.autoStatus;
  if (tJournal) tJournal.checked = !!ls2Data.settings?.autoJournal;
  if (tFridge) tFridge.checked = !!ls2Data.settings?.autoFridge;
  if (interval) interval.value = ls2Data.settings?.intervalHrs || 4;

  m.classList.add('active');
};

window.ls2SaveSettingsBtn = async function () {
  if (!ls2Data || !ls2Data.partnerId) return;
  if (!ls2Data.settings) ls2Data.settings = {};

  const spaceBg = document.getElementById('ls2-set-space-bg');
  const fridgeBg = document.getElementById('ls2-set-fridge-bg');
  const coverBg = document.getElementById('ls2-set-journal-cover');

  const fontMe = document.getElementById('ls2-set-font-me');
  const fontAi = document.getElementById('ls2-set-font-ai');

  const tStatus = document.getElementById('ls2-set-status');
  const tJournal = document.getElementById('ls2-set-journal');
  const tFridge = document.getElementById('ls2-set-fridge');
  const interval = document.getElementById('ls2-set-interval');

  if (spaceBg) ls2Data.settings.spaceBg = spaceBg.value.trim();
  if (fridgeBg) ls2Data.settings.fridgeBg = fridgeBg.value.trim();
  if (coverBg) ls2Data.settings.journalCover = coverBg.value.trim();

  if (fontMe) ls2Data.settings.fontMeUrl = fontMe.value.trim();
  if (fontAi) ls2Data.settings.fontAiUrl = fontAi.value.trim();

  ls2Data.settings.autoStatus = !!tStatus?.checked;
  ls2Data.settings.autoJournal = !!tJournal?.checked;
  ls2Data.settings.autoFridge = !!tFridge?.checked;
  ls2Data.settings.intervalHrs = parseFloat(interval?.value) || 4;

  ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
  await saveLs2Store();

  // 立即应用 UI
  ls2UpdateHeader();
  renderLs2Journal();
  renderLs2Fridge();

  // 关闭弹窗
  const m = document.getElementById('ls2-settings-modal');
  if (m) m.classList.remove('active');

  if (typeof showToast === 'function') showToast('设置已保存');
};

// ============================================================
//  AUTO GENERATION (00:00 / interval)
// ============================================================
function checkAutoGeneration() {
  if (!ls2Data || !ls2Data.partnerId) return;

  // 示例：只做“跨日自动生成 TA 日记”
  const today = new Date().toLocaleDateString();
  if (!ls2Data.settings) ls2Data.settings = {};
  const last = ls2Data.settings.lastJournalDate || '';

  if (ls2Data.settings.autoJournal && last !== today) {
    ls2Data.settings.lastJournalDate = today;
    ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
    saveLs2Store();

    // 静默生成
    window.ls2GenerateJournal(true);
  }
}

// ============================================================
//  INIT HOOK (optional)
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // LoveSpace 本身不强制初始化，openLoveSpaceApp 时会 load store
  // 但可以预加载一次避免第一次点开卡顿
  // loadLs2Store().catch(()=>{});
});
// === [新增] 处理底图上传与清除 ===
window.ls2HandleStickerBgFile = function(input) {
    if (input.files && input.files[0]) { // 修正：必须是 files[0]
        const reader = new FileReader();
        reader.onload = async (e) => {
            let base64 = e.target.result;
            if (typeof compressImage === 'function') base64 = await compressImage(base64, 400);
            const preview = document.getElementById('ls2-sticker-bg-preview');
            const val = document.getElementById('ls2-sticker-bg-val');
            if (preview && val) {
                preview.style.backgroundImage = `url('${base64}')`;
                preview.style.display = 'block';
                val.value = base64;
            }
        };
        reader.readAsDataURL(input.files[0]); // 修正：必须是 files[0]
    }
    input.value = '';
}

window.ls2ClearStickerBg = function() {
    const preview = document.getElementById('ls2-sticker-bg-preview');
    const val = document.getElementById('ls2-sticker-bg-val');
    if (preview && val) {
        preview.style.display = 'none';
        preview.style.backgroundImage = 'none';
        val.value = '';
    }
}

// === [新增] 处理贴纸放大缩小 ===
window.ls2ScaleNote = function(stickerId, diff) {
    if (!ls2Data || !ls2Data.partnerId) return;
    
    const isMeTab = document.querySelectorAll('.j-tab')?.[0]?.classList.contains('active'); 
    const idx = ls2Data.currentJournalIndex || 0;
    const j = ls2Data.journals[idx];
    
    const stickers = isMeTab ? (j.stickersMe || []) : (j.stickersAi || []);
    // 【核心修复】加上 String() 转换，防止浮点数精度丢失找不到贴纸
    const s = stickers.find(x => String(x.id) === String(stickerId));
    
    if (s) {
        s.scale = (s.scale || 1) + diff;
        if (s.scale < 0.3) s.scale = 0.3; // 限制最小缩放比例
        if (s.scale > 4) s.scale = 4;     // 限制最大缩放比例
        ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
        saveLs2Store();
        renderLs2Journal();
    }
}

// === [新增] 盲盒与料理功能 (适配原生UI) ===
let currentBlindBoxItem = null;
let blindBoxSmashCount = 0;

window.ls2OpenBlindBoxModal = function (itemId, itemName) {
    currentBlindBoxItem = { id: itemId, name: itemName };
    blindBoxSmashCount = 0;
    
    const modal = document.getElementById('ls2-blindbox-modal');
    if (!modal) return;
    
    document.getElementById('ls2-bb-icon').innerText = '🧊';
    document.getElementById('ls2-bb-title').innerText = '神秘冰块';
    document.getElementById('ls2-bb-content').innerText = '点击下方的按钮敲碎冰块！';
    
    const btn = document.getElementById('ls2-bb-smash-btn');
    if (btn) {
        btn.innerText = '敲击 (0/3)';
        btn.style.display = 'block';
    }
    
    modal.classList.add('active');
};

window.ls2SmashBlindBox = async function () {
    if (!currentBlindBoxItem) return;
    blindBoxSmashCount++;
    
    const btn = document.getElementById('ls2-bb-smash-btn');
    if (btn) btn.innerText = `敲击 (${blindBoxSmashCount}/3)`;
    
    const icon = document.getElementById('ls2-bb-icon');
    if (icon) {
        icon.style.transform = `scale(${1 - blindBoxSmashCount * 0.1}) rotate(${Math.random() * 20 - 10}deg)`;
    }
    
    if (blindBoxSmashCount >= 3) {
        if (btn) btn.style.display = 'none';
        document.getElementById('ls2-bb-content').innerText = '冰块裂开了，正在解冻...';
        
        const aiId = ls2Data.partnerId;
        const ai = friendsData?.[aiId] || {};
        
        const prompt = `
[System Command]
User just smashed open a frozen fridge blind box named "${currentBlindBoxItem.name}".
Generate a surprise food item and a short fun comment from ${ai.realName || 'Partner'}.
Return JSON only:
{"emoji":"🎁", "name":"...", "comment":"..."}
        `.trim();
        
        const res = await callAiForSpecialTask(prompt);
        if (!res) {
            document.getElementById('ls2-bb-content').innerText = '敲碎失败了...';
            return;
        }
        
        try {
            const data = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim());
            
            if (icon) {
                icon.innerText = data.emoji || '🎁';
                icon.style.transform = 'scale(1)';
            }
            document.getElementById('ls2-bb-title').innerText = data.name || '神秘礼物';
            document.getElementById('ls2-bb-content').innerHTML = `<b>获得：${data.emoji} ${data.name}</b><br><br>${ai.realName || 'TA'}说：${data.comment}`;
            
            // 更新冰箱数据
            if (ls2Data && ls2Data.fridgeIn) {
                const idx = ls2Data.fridgeIn.findIndex(x => x.id === currentBlindBoxItem.id);
                if (idx !== -1) {
                    ls2Data.fridgeIn[idx].emoji = data.emoji || '🎁';
                    ls2Data.fridgeIn[idx].name = data.name || '神秘礼物';
                    ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
                    await saveLs2Store();
                    renderFridgeInside();
                }
            }
        } catch (e) {
            document.getElementById('ls2-bb-content').innerText = '解析盲盒物品失败';
        }
    }
};

let currentCookSelectedIds = [];

window.ls2OpenCookModal = function () {
    if (!ls2Data || !ls2Data.fridgeIn || ls2Data.fridgeIn.length < 2) {
        return ls2Alert('冰箱里至少需要2种食材才能做饭哦~');
    }
    
    currentCookSelectedIds = [];
    const modal = document.getElementById('ls2-cook-modal');
    if (!modal) return;
    
    renderCookIngredients();
    renderCookSelected();
    
    document.getElementById('ls2-cook-result').style.display = 'none';
    
    modal.classList.add('active');
};

function renderCookIngredients() {
    const container = document.getElementById('ls2-cook-ingredients');
    if (!container) return;
    
    let html = '';
    (ls2Data.fridgeIn || []).forEach(item => {
        // 不要显示冰块或者盲盒
        if (item.emoji === '🧊' || (item.name && item.name.includes('盲盒'))) return;
        // 如果未解锁，不可选
        const isLocked = item.unlockTime && Date.now() < item.unlockTime;
        if (isLocked) return;
        // 如果已经被选中了，就不显示在可用列表
        if (currentCookSelectedIds.includes(item.id)) return;
        
        html += `<div style="padding: 8px 12px; background: #f0f0f0; border-radius: 20px; cursor: pointer; display: flex; align-items: center; gap: 5px; font-size: 13px;" onclick="selectCookIngredient(${item.id})">
            ${item.emoji} ${item.name}
        </div>`;
    });
    
    if (!html) html = '<div style="color:#aaa; font-size:12px;">没有更多可用食材了</div>';
    container.innerHTML = html;
}

function renderCookSelected() {
    const container = document.getElementById('ls2-cook-selected');
    if (!container) return;
    
    let html = '';
    currentCookSelectedIds.forEach(id => {
        const item = ls2Data.fridgeIn.find(x => x.id === id);
        if (item) {
            html += `<div style="padding: 8px 12px; background: #fff4e6; border: 1px solid #ffd8a8; border-radius: 20px; cursor: pointer; display: flex; align-items: center; gap: 5px; font-size: 13px;" onclick="deselectCookIngredient(${item.id})">
                ${item.emoji} ${item.name} <i class="fas fa-times" style="font-size:10px; color:#ff7e67; margin-left:4px;"></i>
            </div>`;
        }
    });
    
    if (!html) html = '<div style="color:#aaa; font-size:12px; align-self: center;">点击上方食材添加到这里</div>';
    container.innerHTML = html;
}

window.selectCookIngredient = function (id) {
    if (currentCookSelectedIds.length >= 3) {
        if (typeof showToast === 'function') showToast('最多只能选择3种食材');
        return;
    }
    currentCookSelectedIds.push(id);
    renderCookIngredients();
    renderCookSelected();
};

window.deselectCookIngredient = function (id) {
    currentCookSelectedIds = currentCookSelectedIds.filter(x => x !== id);
    renderCookIngredients();
    renderCookSelected();
};

window.ls2StartCooking = async function () {
    if (currentCookSelectedIds.length < 2) {
        if (typeof showToast === 'function') showToast('至少需要2种食材');
        return;
    }
    
    if (!ls2Data || !ls2Data.partnerId) return;
    const aiId = ls2Data.partnerId;
    const ai = friendsData?.[aiId] || {};
    
    const itemNames = currentCookSelectedIds.map(id => {
        const item = ls2Data.fridgeIn.find(x => x.id === id);
        return item ? item.name : '';
    }).filter(Boolean);
    
    if (typeof showToast === 'function') showToast('AI主厨正在烹饪中...');
    
    const prompt = `
[System Command]
User wants to cook a meal using these ingredients: ${itemNames.join('、')}.
Generate a creative, delicious (or funny/disastrous) dish.
Return JSON only:
{"emoji":"🍲", "name":"...", "desc":"一段幽默的美食点评（像中华小当家一样）"}
    `.trim();
    
    const res = await callAiForSpecialTask(prompt);
    if (!res) return;
    
    try {
        const data = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim());
        
        // 删掉用过的食材
        ls2Data.fridgeIn = ls2Data.fridgeIn.filter(x => !currentCookSelectedIds.includes(x.id));
        
        // 增加新料理
        ls2Data.fridgeIn.push({
            id: Date.now(),
            emoji: data.emoji || '🍲',
            name: data.name || '神秘料理',
            unlockTime: null
        });
        
        ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
        await saveLs2Store();
        renderFridgeInside();
        
        // 更新UI
        const resultBox = document.getElementById('ls2-cook-result');
        const dishEl = document.getElementById('ls2-cook-dish');
        const commentEl = document.getElementById('ls2-cook-comment');
        
        if (resultBox && dishEl && commentEl) {
            dishEl.innerHTML = `${data.emoji} ${data.name}`;
            commentEl.innerHTML = `"${data.desc}"`;
            resultBox.style.display = 'block';
            
            // 清空选择
            currentCookSelectedIds = [];
            renderCookIngredients();
            renderCookSelected();
        }
        
    } catch (e) {
        if (typeof showToast === 'function') showToast('烹饪失败：主厨炸毁了厨房（JSON错误）');
    }
};
