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
      { id: 'sys_starbucks',type: 'system', name: '星巴克',    number: '1069888' },
      { id: 'sys_police',   type: 'system', name: '反诈中心',  number: '96110'   }
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

  function openWith(chatId) {
    if (!chatId) return;
    _load();

    let targetThreadId = null;
    // 优先寻找已有对话
    for (const tid in _db.conversations) {
      if (_db.conversations[tid].chatId === chatId) {
        // 找到与该好友的最近对话
        if (!targetThreadId || (_db.conversations[tid].lastTime > _db.conversations[targetThreadId].lastTime)) {
          targetThreadId = tid;
        }
      }
    }

    // 若没有则创建新对话
    if (!targetThreadId) {
      targetThreadId = 'friend_' + chatId;
      const friend = (typeof friendsData !== 'undefined' && friendsData[chatId]) ? friendsData[chatId] : null;
      const name = friend ? (friend.remark || friend.realName || friend.name || '未知联系人') : '未知联系人';
      _db.conversations[targetThreadId] = {
        id: targetThreadId,
        type: 'friend',
        name: name,
        number: _genFakeNumber(), // 生成假号码
        chatId: chatId,
        messages: [],
        unread: 0,
        lastMessage: '',
        lastTime: Date.now()
      };
      _save();
    }

    open();
    setTimeout(() => openThread(targetThreadId), 50);
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
          <i class="fas fa-comment-slash" style="font-size: calc(32px * var(--font-scale));display:block;margin-bottom:12px;"></i>
          <div style="font-size: calc(13px * var(--font-scale));">暂无短信</div>
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
        ? `<span style="font-size: calc(10px * var(--font-scale));background:#fee2e2;color:#c0392b;padding:3px 8px;border-radius:10px;font-weight:700;">已拉黑</span>`
        : conv.type === 'unknown' && conv.chatId
          ? `<i class="fas fa-phone" onclick="PhoneCallApp.callByFriendId('${conv.chatId}')" style="font-size: calc(17px * var(--font-scale));color:#333;cursor:pointer;padding:4px;"></i>`
          : '';
      header.innerHTML = `
        <i class="fas fa-chevron-left" onclick="SMSApp.closeThread()"
           style="font-size: calc(18px * var(--font-scale));color:#333;cursor:pointer;padding:4px 8px 4px 0;"></i>
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
      msgArea.innerHTML = `<div style="text-align:center;color:#ccc;font-size: calc(12px * var(--font-scale));padding:30px;">暂无消息</div>`;
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

    let messages = [{ role: 'system', content: systemPrompt }, ...history];

    const wbData = (typeof constructWorldInfoPrompt === 'function' && conv.chatId)
        ? constructWorldInfoPrompt(userText || '[短信沟通中]', conv.chatId)
        : { before_char: '', after_char: '', depth_items: [] };
    
    if (wbData && wbData.depth_items && wbData.depth_items.length > 0) {
        wbData.depth_items.sort((a, b) => b.depth - a.depth);
        wbData.depth_items.forEach(item => {
            const depth = parseInt(item.depth) || 2;
            const insertIndex = Math.max(0, messages.length - depth);
            messages.splice(insertIndex, 0, { role: "system", content: item.content });
        });
    }

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
        body: JSON.stringify({
          model: settings.model,
          messages: messages,
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

      // WeChat invite trigger
      let wechatTriggered = false;
      if (/\[ADD_WECHAT\]/i.test(reply)) {
          reply = reply.replace(/\[ADD_WECHAT\]/gi, '').trim();
          wechatTriggered = true;
      }

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
        
        // 弹出添加微信申请
        if(wechatTriggered && conv.type === 'unknown' && typeof PhoneCallApp !== 'undefined') {
            setTimeout(() => {
                PhoneCallApp.openWechatInvite(conv.number);
            }, 1000);
        }
        
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
    let historyCtx = '';

    if (conv.chatId && typeof friendsData !== 'undefined') {
      const f = friendsData[conv.chatId] || {};
      aiPersona = f.persona || '';
      aiName = f.remark || f.realName || conv.name;
      if (f.summaries && f.summaries.length > 0) {
        historyCtx = f.summaries.slice(-3).map(s => s.text).join('；');
      }
    }

    if (conv.type === 'unknown') {
      contextNote = `你是一个陌生人，通过短信联系用户。你可以是送错外卖的骑手、发错号码的相亲对象、推销员或与用户有某种隐藏关联的神秘人物。请表现出极强的生活化和日常感，语气可以焦急、试探或尴尬。`;
    } else if (conv.type === 'blocked') {
      const now = new Date();
      const timeStr = `${now.getHours()}点${now.getMinutes()}分`;
      contextNote = `[客观状态]：用户刚才在微信里把你拉黑了，目前你处于被拉黑状态。当前时间是 ${timeStr}。
请完全基于你的性格和人设（暴躁、傲娇、卑微或冷静），自主决定给用户发什么内容的短信。可以带一些生活状态（如抱怨天气、刚下班等）。`;
      if (historyCtx) contextNote += `\n[你们被拉黑前的近期记忆]：\n${historyCtx}`;
    }

    const myPersona = (() => {
      if (typeof personasMeta === 'undefined' || typeof currentPersonaId === 'undefined') return '';
      return (personasMeta[currentPersonaId] || {}).persona || '';
    })();

    const wbData = (typeof constructWorldInfoPrompt === 'function' && conv.chatId)
        ? constructWorldInfoPrompt(userText || '[短信沟通中]', conv.chatId)
        : { before_char: '', after_char: '', depth_items: [] };

    return `[SMS SYSTEM — 短信模式]
你是 ${aiName}，正在通过短信与用户沟通。

【你的身份与人设】
${aiPersona || '你是一个真实的人，用短信与用户联系。'}
${contextNote}

${myPersona ? `【用户信息】\n${myPersona}\n` : ''}
${wbData.before_char ? `【世界设定】\n${wbData.before_char}\n` : ''}
${wbData.after_char  ? `【补充设定】\n${wbData.after_char}\n` : ''}

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
   * type: 'cainiao' | 'bank' | 'meituan' | 'taobao' | 'starbucks' | 'police' | 'custom'
   * options: { code, area, cardNo, amount, direction, message, name, number, threadId }
   */
  function addSystemNotif(type, options = {}) {
    let threadId, name, message;

    switch (type) {
      case 'cainiao': {
        threadId = 'sys_cainiao';
        name = '菜鸟驿站';
        const area = options.area || _randomFrom(['3号货架','物业前台','快递柜A区(下层)','消防栓背后的纸箱上','门卫处桌底下']);
        const code = options.code || _randomCode(4);
        message = `【菜鸟驿站】您有一个包裹已暂放${area}，取件码 ${code}。请及时取走，如有疑问请拨95货运。`;
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
      case 'starbucks': {
        threadId = 'sys_starbucks';
        name = '星巴克';
        if (!_db.conversations[threadId]) {
          _db.conversations[threadId] = { id: threadId, type: 'system', name: '星巴克', number: '1069888', messages: [], unread: 0, lastMessage: '', lastTime: 0 };
        }
        const wens = [
          '周一的冰美式，拯救你的无力感。全场饮品买一赠一。',
          '下雨天和热拿铁更配哦。点击领取你的专属7折券。',
          '疲惫的下午，不如来杯星冰乐？今日双杯立减15元。'
        ];
        message = options.message || `【星巴克】${_randomFrom(wens)} 回T退订`;
        break;
      }
      case 'police': {
        threadId = 'sys_police';
        name = '反诈中心';
        if (!_db.conversations[threadId]) {
          _db.conversations[threadId] = { id: threadId, type: 'system', name: '反诈中心', number: '96110', messages: [], unread: 0, lastMessage: '', lastTime: 0 };
        }
        message = options.message || `【公安交警/反诈中心】提示：近期冒充快递员、客服退款诈骗多发。请勿点击陌生链接，不随意透露验证码！如遇可疑情况请拨打110。`;
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

  /* ─── API Driven Random Daily Event ─── */
  async function triggerRandomDailyEvent() {
    const settingsJSON = localStorage.getItem('myCoolPhone_aiSettings');
    if (!settingsJSON) return;
    const settings = JSON.parse(settingsJSON);

    let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
    const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

    const prompt = `[任务]
请扮演一个随机的真实生活中的“陌生人”，给我发一条莫名其妙但极具日常感的短信。
角色可能是：
1. 送错外卖/快递极其焦急的骑手
2. 喝醉酒发错短信的前任/相亲对象
3. 问你是不是在楼上跳绳的暴躁邻居
4. 让你明天把某个报表交一下的糊涂老板（把你当成了他员工）
5. 驾校教练喊你练车

【要求】
- 短信字数 15-40 字以内。
- 非常真实口语化。绝对不要动作描写。
- 格式：直接输出短信内容，不要加任何其他解释。`;

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
        body: JSON.stringify({ model: settings.model, messages: [{ role: 'user', content: prompt }], temperature: 0.9, max_tokens: 100 })
      });
      const data = await res.json();
      let msg = (data?.choices?.[0]?.message?.content || '').trim();
      if (msg) {
        injectStrangerSMS('未知号码', _genFakeNumber(), msg);
      }
    } catch (e) {
      console.error('[SMS] Random event error:', e);
    }
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

    const now = new Date();
    const timeStr = `${now.getHours()}点${now.getMinutes()}分`;
    let historyCtx = '';
    if (friend.summaries && friend.summaries.length > 0) {
      historyCtx = friend.summaries.slice(-3).map(s => s.text).join('；');
    }

    const prompt = `[客观状态]
你(${friend.remark || friend.realName || '某人'})刚才在微信上被用户拉黑了。
当前时间：${timeStr}。

【你的人设】
${friend.persona || ''}
${historyCtx ? `【你们最近的经历/记忆】\n${historyCtx}\n` : ''}

【任务】
请完全基于你的人设，决定此刻你要给用户发的一条真实短信。
- 不受任何情绪限制，傲娇就死鸭子嘴硬，暴躁就质问，冷静就陈述事实，完全取决于你的性格。
- 短信长度 15-45 字，纯文字，绝对不能有动作描写（不能用*号或()包裹动作）。
- 如果你觉得必须立刻打电话，可以在回复最后加上 [PHONE_CALL] 标签，系统会自动拨打过去。`;

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
    openWith,
    openThread,
    closeThread,
    renderList,
    renderThread,
    sendMessage,
    addSystemNotif,
    injectStrangerSMS,
    triggerRandomDailyEvent,
    triggerBlockedHarassment,
    showNotifToast,
    checkForSMSTrigger,
    getDB: () => _db
  };
})();
