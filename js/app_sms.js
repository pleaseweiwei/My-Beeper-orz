/* ============================================
   SMS 短信系统 v1.0
   韩系极简 · 系统通知 · 陌生人剧情 · 跨应用联动
   ============================================ */

const SMSApp = (() => {
  const STORAGE_KEY = 'smsApp_data_v1';
  let _db = { conversations: {} };
  let _currentThreadId = null;
  let _toastTimer = null;

  /* ─── Storage ─── */
  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) _db = JSON.parse(raw);
    } catch (e) {}
    if (!_db.conversations) _db.conversations = {};
  }
  function _save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_db)); } catch (e) {}
  }

  /* ─── Init ─── */
  function _init() {
    _load();
    _ensureSystemThreads();
  }

  function _ensureSystemThreads() {
    const defaults = [
      { id: 'sys_cainiao',  type: 'system', name: '菜鸟驿站', number: '95货运' },
      { id: 'sys_icbc',     type: 'system', name: '工商银行',  number: '95588'  },
      { id: 'sys_meituan',  type: 'system', name: '美团外卖',  number: '10106'  },
      { id: 'sys_taobao',   type: 'system', name: '淘宝',      number: '95095'  },
    ];
    defaults.forEach(d => {
      if (!_db.conversations[d.id]) {
        _db.conversations[d.id] = { ...d, messages: [], unread: 0, lastMessage: '', lastTime: 0 };
      }
    });
    _save();
  }

  /* ─── Open / Close App ─── */
  function open() {
    _load();
    const app = document.getElementById('smsApp');
    if (!app) return;
    app.classList.add('open');
    renderList();
    closeThread(); // ensure thread not open
  }

  function close() {
    const app = document.getElementById('smsApp');
    if (app) app.classList.remove('open');
    closeThread();
    _currentThreadId = null;
  }

  /* ─── Thread ─── */
  function openThread(threadId) {
    _currentThreadId = threadId;
    const view = document.getElementById('smsThreadView');
    if (!view) return;
    renderThread(threadId);
    view.classList.add('open');
    // mark read
    if (_db.conversations[threadId]) {
      _db.conversations[threadId].unread = 0;
      _save();
      renderList();
    }
  }

  function closeThread() {
    _currentThreadId = null;
    const view = document.getElementById('smsThreadView');
    if (view) view.classList.remove('open');
  }

  /* ─── Render List ─── */
  function renderList() {
    const container = document.getElementById('smsConvList');
    if (!container) return;

    const convs = Object.values(_db.conversations)
      .sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));

    if (!convs.length) {
      container.innerHTML = `
        <div style="text-align:center;padding:60px 20px;color:#ccc;">
          <i class="fas fa-comment-slash" style="font-size:32px;display:block;margin-bottom:12px;"></i>
          <div style="font-size:13px;">暂无短信</div>
        </div>`;
      return;
    }

    // Group: unread first, then system, then others
    const hasUnread = convs.filter(c => c.unread > 0);
    const noUnread  = convs.filter(c => !c.unread);

    let html = '';
    if (hasUnread.length) {
      html += `<div class="sms-section-label">未读</div>`;
      html += hasUnread.map(c => _convItemHtml(c)).join('');
    }
    html += noUnread.map(c => _convItemHtml(c)).join('');
    container.innerHTML = html;
  }

  function _convItemHtml(conv) {
    const initials = _getInitials(conv.name);
    const cls = conv.type === 'system' ? 'system' :
                conv.type === 'unknown' ? 'unknown' :
                conv.type === 'blocked' ? 'blocked' : '';
    const preview = _stripTags(conv.lastMessage || '').slice(0, 32) || '暂无消息';
    const timeStr = _fmtTime(conv.lastTime);
    return `
      <div class="sms-conversation-item" onclick="SMSApp.openThread('${_esc(conv.id)}')">
        <div class="sms-conv-avatar ${cls}">${_esc(initials)}</div>
        <div class="sms-conv-info">
          <div class="sms-conv-name">${_esc(conv.name)}</div>
          <div class="sms-conv-preview">${_esc(preview)}</div>
        </div>
        <div class="sms-conv-meta">
          <div class="sms-conv-time">${timeStr}</div>
          ${conv.unread > 0 ? `<div class="sms-unread-badge">${conv.unread}</div>` : ''}
        </div>
      </div>`;
  }

  /* ─── Render Thread ─── */
  function renderThread(threadId) {
    const conv = _db.conversations[threadId];
    if (!conv) return;

    /* Header */
    const header = document.getElementById('smsThreadHeader');
    if (header) {
      const initials = _getInitials(conv.name);
      const cls = conv.type === 'system' ? 'system' :
                  conv.type === 'unknown' ? 'unknown' :
                  conv.type === 'blocked' ? 'blocked' : '';
      const rightBadge = conv.type === 'blocked'
        ? `<span style="font-size:10px;background:#fee2e2;color:#c0392b;padding:3px 8px;border-radius:10px;font-weight:700;">已拉黑</span>`
        : conv.type === 'unknown' && conv.chatId
          ? `<i class="fas fa-phone" onclick="PhoneCallApp.callByFriendId('${conv.chatId}')" style="font-size:17px;color:#333;cursor:pointer;padding:4px;"></i>`
          : '';
      header.innerHTML = `
        <i class="fas fa-chevron-left" onclick="SMSApp.closeThread()"
           style="font-size:18px;color:#333;cursor:pointer;padding:4px 8px 4px 0;"></i>
        <div class="sms-thread-avatar ${cls}">${_esc(initials)}</div>
        <div class="sms-thread-info">
          <div class="sms-thread-name">${_esc(conv.name)}</div>
          <div class="sms-thread-number">${_esc(conv.number || '')}</div>
        </div>
        ${rightBadge}`;
    }

    /* Messages */
    const msgArea = document.getElementById('smsMessages');
    if (!msgArea) return;

    const msgs = conv.messages || [];
    if (!msgs.length) {
      msgArea.innerHTML = `<div style="text-align:center;color:#ccc;font-size:12px;padding:30px;">暂无消息</div>`;
    } else {
      let lastTimestamp = 0;
      let html = '';
      msgs.forEach(msg => {
        // 如果是第一条消息，或与上一条消息间隔超过5分钟(300000ms)，插入时间分隔块
        if (!lastTimestamp || (msg.timestamp - lastTimestamp > 300000)) {
          html += `<div class="sms-timestamp-divider">${_fmtDateTime(msg.timestamp)}</div>`;
        }
        lastTimestamp = msg.timestamp;
        const isSystem = (msg.type === 'received' && conv.type === 'system');
        const rowCls = msg.type === 'sent' ? 'sent' : `received${isSystem ? ' system-msg' : ''}`;
        const bubbleContent = _highlightContent(msg.text);
        html += `
          <div class="sms-msg-row ${rowCls}">
            <div class="sms-bubble">${bubbleContent}</div>
            <div class="sms-msg-time">${_fmtShortTime(msg.timestamp)}</div>
          </div>`;
      });
      msgArea.innerHTML = html;
    }
    msgArea.scrollTop = msgArea.scrollHeight;

    /* Hide/show input for system threads */
    const inputArea = document.getElementById('smsInputArea');
    if (inputArea) inputArea.style.display = conv.type === 'system' ? 'none' : 'flex';
  }

  /* ─── Send Message ─── */
  function sendMessage() {
    const input = document.getElementById('smsInput');
    if (!input || !_currentThreadId) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    _addMsg(_currentThreadId, text, 'sent');
    renderThread(_currentThreadId);

    const conv = _db.conversations[_currentThreadId];
    if (conv && conv.type !== 'system') {
      _showLoading(_currentThreadId);
      _triggerAI(_currentThreadId, text);
    }
  }

  function _addMsg(threadId, text, type) {
    const conv = _db.conversations[threadId];
    if (!conv) return;
    if (!conv.messages) conv.messages = [];
    conv.messages.push({ id: 'sm_' + Date.now(), text, type, timestamp: Date.now() });
    conv.lastMessage = text;
    conv.lastTime = Date.now();
    if (type === 'received') conv.unread = (conv.unread || 0) + 1;
    _save();
  }

  function _showLoading(threadId) {
    if (_currentThreadId !== threadId) return;
    const msgArea = document.getElementById('smsMessages');
    if (!msgArea) return;
    const el = document.createElement('div');
    el.className = 'sms-msg-row received';
    el.id = 'smsLoadingRow';
    el.innerHTML = '<div class="sms-loading"><span></span><span></span><span></span></div>';
    msgArea.appendChild(el);
    msgArea.scrollTop = msgArea.scrollHeight;
  }

  function _removeLoading() {
    const el = document.getElementById('smsLoadingRow');
    if (el) el.remove();
  }

  /* ─── AI Call ─── */
  async function _triggerAI(threadId, userText) {
    const conv = _db.conversations[threadId];
    if (!conv) return;

    const settingsJSON = localStorage.getItem('myCoolPhone_aiSettings');
    if (!settingsJSON) { _removeLoading(); return; }
    const settings = JSON.parse(settingsJSON);

    const systemPrompt = _buildPrompt(conv, userText);
    let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
    const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

    // Recent history (last 10)
    const history = (conv.messages || []).slice(-10).map(m => ({
      role: m.type === 'sent' ? 'user' : 'assistant',
      content: m.text
    }));

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
        body: JSON.stringify({
          model: settings.model,
          messages: [{ role: 'system', content: systemPrompt }, ...history],
          temperature: 0.88,
          max_tokens: 150
        })
      });

      _removeLoading();
      if (!res.ok) return;

      const data = await res.json();
      let reply = (data?.choices?.[0]?.message?.content || '').trim();

      // Strip forbidden action descriptions
      reply = reply.replace(/\*[^*\n]+\*/g, '').trim();
      reply = reply.replace(/\[STATUS[\s\S]*?\]/gi, '').trim();

      // Phone call trigger
      if (/\[PHONE_CALL\]/i.test(reply)) {
        reply = reply.replace(/\[PHONE_CALL\]/gi, '').trim();
        if (reply) {
          _addMsg(threadId, reply, 'received');
          if (_currentThreadId === threadId) renderThread(threadId);
        }
        const callChatId = conv.chatId || null;
        if (callChatId) {
          setTimeout(() => PhoneCallApp.triggerIncomingCall(callChatId, conv.number || '未知'), 1800);
        }
        renderList();
        return;
      }

      if (reply) {
        _addMsg(threadId, reply, 'received');
        if (_currentThreadId === threadId) renderThread(threadId);
        else showNotifToast(conv.name, reply, threadId);
        renderList();
      }
    } catch (e) {
      _removeLoading();
      console.error('[SMS] AI error:', e);
    }
  }

  function _buildPrompt(conv, userText) {
    let aiPersona = '';
    let aiName = conv.name;
    let contextNote = '';

    if (conv.chatId && typeof friendsData !== 'undefined') {
      const f = friendsData[conv.chatId] || {};
      aiPersona = f.persona || '';
      aiName = f.remark || f.realName || conv.name;
    }

    if (conv.type === 'unknown') {
      contextNote = `你是一个陌生人，通过短信联系用户。你可以是推销员、快递员、或与用户有某种隐藏关联的神秘人物。`;
    } else if (conv.type === 'blocked') {
      contextNote = `你是用户在微信里拉黑的那个人。你现在通过短信联系 TA，情绪可能是委屈、愤怒或苦苦哀求，想要和解。`;
    }

    const myPersona = (() => {
      if (typeof personasMeta === 'undefined' || typeof currentPersonaId === 'undefined') return '';
      return (personasMeta[currentPersonaId] || {}).persona || '';
    })();

    return `[SMS SYSTEM — 短信模式]
你是 ${aiName}，正在通过短信与用户沟通。

【你的身份与人设】
${aiPersona || '你是一个真实的人，用短信与用户联系。'}
${contextNote}

${myPersona ? `【用户信息】\n${myPersona}\n` : ''}

【短信铁律 — 绝对遵守】
1. 【禁止动作描写】：短信里没有 *动作*，只有文字。绝对不能写 *微笑* *看着你* 这类。
2. 【严格控制字数】：每条短信最多 60 字。短促、有力、真实。
3. 【语气风格】：
   - 系统通知：公事公办，只有信息
   - 陌生人/推销：礼貌或冷漠
   - 被拉黑角色：有情感张力，委屈或强势
   - 普通朋友：简短口语
4. 【不要 Markdown】：不要用 **加粗** 或 bullet points
5. 【触发电话】：如果你想改为打电话，在回复最后加 [PHONE_CALL] 标签

用户刚才发送的短信：${userText}
请回复一条简短的短信（不超过60字）：`;
  }

  /* ─── System Notifications ─── */

  /**
   * type: 'cainiao' | 'bank' | 'meituan' | 'taobao' | 'custom'
   * options: { code, area, cardNo, amount, direction, message, name, number, threadId }
   */
  function addSystemNotif(type, options = {}) {
    let threadId, name, message;

    switch (type) {
      case 'cainiao': {
        threadId = 'sys_cainiao';
        name = '菜鸟驿站';
        const area = options.area || _randomFrom(['3号货架','物业前台','快递柜A区','门卫处']);
        const code = options.code || _randomCode(4);
        message = `【菜鸟驿站】您有一个包裹已暂放${area}，取件码 ${code}。如有疑问请拨95货运。`;
        break;
      }
      case 'bank': {
        threadId = 'sys_icbc';
        name = '工商银行';
        const cardNo = options.cardNo || '8888';
        const amount = options.amount || ((Math.floor(Math.random() * 49800) / 100 + 5).toFixed(2));
        const dir = options.direction || '支出';
        message = `【工商银行】您尾号${cardNo}的储蓄卡${dir} ${amount} 元，如非本人操作请致电95588。`;
        break;
      }
      case 'meituan': {
        threadId = 'sys_meituan';
        name = '美团外卖';
        message = options.message || `【美团外卖】您的订单已送达，请好评支持骑手小哥～`;
        break;
      }
      case 'taobao': {
        threadId = 'sys_taobao';
        name = '淘宝';
        if (!_db.conversations[threadId]) {
          _db.conversations[threadId] = { id: threadId, type: 'system', name: '淘宝', number: '95095', messages: [], unread: 0, lastMessage: '', lastTime: 0 };
        }
        message = options.message || `【淘宝】您的宝贝已由菜鸟物流揽收，预计${_randomFrom(['明天','后天','大后天'])}送达。`;
        break;
      }
      case 'custom': {
        threadId = options.threadId || ('sys_custom_' + Date.now());
        name = options.name || '系统通知';
        if (!_db.conversations[threadId]) {
          _db.conversations[threadId] = { id: threadId, type: 'system', name, number: options.number || '', messages: [], unread: 0, lastMessage: '', lastTime: 0 };
        }
        message = options.message || '系统通知';
        break;
      }
      default: return;
    }

    _addMsg(threadId, message, 'received');
    _save();
    showNotifToast(name, message, threadId);
    renderList();
  }

  /* ─── Stranger / Plot-Hook SMS ─── */
  function injectStrangerSMS(fromName, number, message, chatId) {
    const threadId = 'stranger_' + (chatId || _randStr());

    if (!_db.conversations[threadId]) {
      _db.conversations[threadId] = {
        id: threadId, type: 'unknown',
        name: fromName || '未知号码',
        number: number || _genFakeNumber(),
        chatId: chatId || null,
        messages: [], unread: 0, lastMessage: '', lastTime: 0
      };
    }

    _addMsg(threadId, message, 'received');
    _save();
    showNotifToast(fromName || '未知号码', message, threadId);
    renderList();
  }

  /* ─── Blocked-Contact Harassment ─── */
  function triggerBlockedHarassment(chatId) {
    if (typeof friendsData === 'undefined' || !friendsData[chatId]) return;
    const friend = friendsData[chatId];
    if (!friend.isBlocked) return;

    const threadId = 'blocked_' + chatId;
    if (!_db.conversations[threadId]) {
      _db.conversations[threadId] = {
        id: threadId, type: 'blocked',
        name: friend.remark || friend.realName || '陌生人',
        number: _genFakeNumber(),
        chatId,
        messages: [], unread: 0, lastMessage: '', lastTime: 0
      };
    }

    _generateBlockedMsg(threadId, chatId);
  }

  async function _generateBlockedMsg(threadId, chatId) {
    const friend = (typeof friendsData !== 'undefined') ? (friendsData[chatId] || {}) : {};
    const settingsJSON = localStorage.getItem('myCoolPhone_aiSettings');
    if (!settingsJSON) return;
    const settings = JSON.parse(settingsJSON);

    let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
    const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

    const prompt = `你是 ${friend.remark || friend.realName || '某人'}。
人设：${(friend.persona || '').slice(0, 200)}
用户把你在微信上拉黑了，你非常委屈或愤怒。
现在用短信联系对方，写一条情感真实的短信（15-45字），
只有纯文字，不能有动作描写，不能有 *号，要像真实短信那样。`;

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
        body: JSON.stringify({ model: settings.model, messages: [{ role: 'user', content: prompt }], temperature: 0.9, max_tokens: 100 })
      });
      const data = await res.json();
      let msg = (data?.choices?.[0]?.message?.content || '').trim().replace(/\*[^*]+\*/g, '').trim();
      if (msg) {
        const conv = _db.conversations[threadId];
        _addMsg(threadId, msg, 'received');
        _save();
        showNotifToast(conv.name, msg, threadId);
        renderList();
      }
    } catch (e) {}
  }

  /* ─── Notification Toast ─── */
  function showNotifToast(sender, preview, threadId) {
    const toast = document.getElementById('smsNotifToast');
    if (!toast) return;

    const senderEl  = document.getElementById('smsNotifSender');
    const previewEl = document.getElementById('smsNotifPreview');
    if (senderEl)  senderEl.textContent  = sender;
    if (previewEl) previewEl.textContent = preview.slice(0, 45);

    toast.onclick = () => {
      toast.classList.remove('show');
      if (!document.getElementById('smsApp')?.classList.contains('open')) open();
      if (threadId) setTimeout(() => openThread(threadId), 120);
    };

    if (_toastTimer) clearTimeout(_toastTimer);
    toast.classList.remove('show');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.classList.add('show');
        _toastTimer = setTimeout(() => toast.classList.remove('show'), 4500);
      });
    });
  }

  /* ─── Cross-App: detect [SMS_TO_USER:...] in AI chat ─── */
  function checkForSMSTrigger(aiReply, chatId) {
    const re = /\[SMS_TO_USER:([^\]]{1,200})\]/i;
    const m = re.exec(aiReply);
    if (!m) return aiReply;
    const content = m[1];
    const clean = aiReply.replace(re, '').trim();

    const friend = (typeof friendsData !== 'undefined') ? (friendsData[chatId] || {}) : {};
    const fromName = friend.remark || friend.realName || '未知号码';
    injectStrangerSMS(fromName, _genFakeNumber(), content, chatId);
    return clean;
  }

  /* ─── Text Highlighting ─── */
  function _highlightContent(text) {
    let result = _esc(text);

    // Verification codes (4-8 digits) if context implies it
    if (/验证码|取件码|code|密码|口令/i.test(text)) {
      result = result.replace(/\b(\d{4,8})\b/g, '<span class="sms-highlight-code">$1</span>');
    }

    // Standalone code-like sequences (e.g. 8-3-1002 format)
    result = result.replace(/(\d{1,2}-\d{1,2}-\d{3,5})/g, '<span class="sms-highlight-code">$1</span>');

    // Links
    result = result.replace(/(https?:\/\/[^\s&lt;&gt;"]{5,})/g, '<span class="sms-highlight-link">$1</span>');

    return result;
  }

  /* ─── Helpers ─── */
  function _getInitials(name) {
    if (!name) return '?';
    const cjk = name.match(/[\u4e00-\u9fa5\u3040-\u30ff]+/);
    if (cjk) return name.replace(/[^\u4e00-\u9fa5]/g, '').slice(-2) || name.slice(0, 2);
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  function _fmtTime(ts) {
    if (!ts) return '';
    const now = new Date(), d = new Date(ts), diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (d.toDateString() === now.toDateString())
      return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    const yest = new Date(now); yest.setDate(yest.getDate() - 1);
    if (d.toDateString() === yest.toDateString()) return '昨天';
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  function _fmtShortTime(ts) {
    const d = new Date(ts);
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  }

  function _fmtDateTime(ts) {
    if (!ts) return '';
    const d = new Date(ts), now = new Date();
    const hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    let period, displayHour;
    if (hours >= 0 && hours < 6) { period = '凌晨'; displayHour = hours === 0 ? 12 : hours; }
    else if (hours >= 6 && hours < 12) { period = '上午'; displayHour = hours; }
    else if (hours === 12) { period = '中午'; displayHour = 12; }
    else if (hours >= 13 && hours < 18) { period = '下午'; displayHour = hours - 12; }
    else { period = '晚上'; displayHour = hours - 12; }
    const timeStr = `${period} ${displayHour}:${minutes}`;

    if (d.toDateString() === now.toDateString()) return timeStr;
    const yd = new Date(now); yd.setDate(yd.getDate() - 1);
    if (d.toDateString() === yd.toDateString()) return `昨天 ${timeStr}`;
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMsgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayDiff = Math.floor((startOfToday - startOfMsgDay) / 86400000);
    if (dayDiff < 7 && dayDiff >= 2) {
      const dayNames = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
      return `${dayNames[d.getDay()]} ${timeStr}`;
    }
    if (d.getFullYear() !== now.getFullYear()) return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 ${timeStr}`;
    return `${d.getMonth()+1}月${d.getDate()}日 ${timeStr}`;
  }

  function _genFakeNumber() {
    const pref = ['130','131','132','135','136','137','138','139','150','151','152','153','155','156','157','158','159','176','177','178','180','181','182','183','185','186','187','188','189'];
    return pref[Math.floor(Math.random() * pref.length)] + Math.floor(Math.random() * 1e8).toString().padStart(8, '0');
  }

  function _randomCode(len) {
    return Math.floor(Math.random() * Math.pow(10, len)).toString().padStart(len, '0');
  }

  function _randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function _randStr() { return Math.random().toString(36).slice(2, 8); }

  function _stripTags(s) { return (s || '').replace(/<[^>]+>/g, ''); }

  function _esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ─── Bootstrap ─── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  /* ─── Public API ─── */
  return {
    open,
    close,
    openThread,
    closeThread,
    renderList,
    renderThread,
    sendMessage,
    addSystemNotif,
    injectStrangerSMS,
    triggerBlockedHarassment,
    showNotifToast,
    checkForSMSTrigger,
    getDB: () => _db
  };
})();
