/* ============================================
   纯语音电话系统 v1.0
   韩系极简 · 声波纹 · SFX引擎 · 严格电话Prompt
   ============================================ */

const PhoneCallApp = (() => {
  const STORAGE_KEY = 'phoneCallApp_data_v1';

  const _state = {
    active:       false,
    chatId:       null,
    number:       null,
    isIncoming:   false,
    startTime:    null,
    timerHandle:  null,
    messages:     [],   // {role, content}
    transcripts:  [],   // string[]
    isMuted:      false,
    isSpeaker:    false,
    ttsEnabled:   false,
    currentSFX:   null,
    currentAudio: null,
  };

  let _callData = { records: [] };
  let _ringtoneHandle = null;
  let currentNumber = "";
  
  // 电话簿结构：号码映射到人设
  let phoneBookData = {};
  
  function loadPhoneBook() {
      try {
          let pb = localStorage.getItem('phoneBookData');
          if(pb) phoneBookData = JSON.parse(pb);
      } catch(e) {}
  }
  
  function savePhoneBook() {
      try {
          localStorage.setItem('phoneBookData', JSON.stringify(phoneBookData));
      } catch(e) {}
  }
  
  loadPhoneBook();

  /* ─── Storage ─── */
  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) _callData = JSON.parse(raw);
    } catch (e) {}
    if (!_callData.records) _callData.records = [];
  }
  function _save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_callData)); } catch (e) {}
  }

  /* ─── Dialer / History ─── */
  function openDialer() {
    _load();
    const app = document.getElementById('phoneApp');
    if (!app) return;
    app.classList.add('open');
    switchTab('contacts'); // 默认打开联系人
  }

  function closeDialer() {
    const app = document.getElementById('phoneApp');
    if (app) app.classList.remove('open');
    closeTranscript();
  }
  
  function switchTab(tabId) {
      document.querySelectorAll('.phone-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.phone-view-content').forEach(v => v.classList.remove('active'));
      
      const tabEl = document.querySelector(`.phone-tab[onclick="PhoneCallApp.switchTab('${tabId}')"]`);
      if(tabEl) tabEl.classList.add('active');
      
      const viewEl = document.getElementById(`phone-view-${tabId}`);
      if(viewEl) viewEl.classList.add('active');
      
      if(tabId === 'contacts') renderContacts();
      if(tabId === 'recents') _renderHistory();
      if(tabId === 'keypad') {
          currentNumber = "";
          const numberInput = document.getElementById('phone-dial-number');
          if(numberInput) numberInput.innerText = "";
          suggestMatches("");
      }
  }
  
  // 生成随机 11 位电话号码
  function generateRandomPhoneNumber() {
      const prefix = ['13', '15', '17', '18', '19'][Math.floor(Math.random() * 5)];
      let num = prefix;
      for(let i=0; i<9; i++) num += Math.floor(Math.random() * 10);
      return num;
  }
  
  // 按键输入
  function typeNum(n) {
      if(currentNumber.length >= 15) return;
      currentNumber += n;
      const numberInput = document.getElementById('phone-dial-number');
      if(numberInput) {
          numberInput.innerText = currentNumber;
          suggestMatches(currentNumber);
      }
  }
  
  // 删除号码
  function delNum() {
      if(currentNumber.length === 0) return;
      currentNumber = currentNumber.slice(0, -1);
      const numberInput = document.getElementById('phone-dial-number');
      if(numberInput) {
          numberInput.innerText = currentNumber;
          suggestMatches(currentNumber);
      }
  }
  
  // 号码匹配建议
  function suggestMatches(num) {
      const suggestEl = document.getElementById('phone-match-suggest');
      if(!suggestEl) return;
      
      if(!num) { suggestEl.innerText = ""; return; }
      
      // 在微信好友中查找
      let match = Object.values(friendsData || {}).find(f => 
          (f.chatSettings && f.chatSettings.phoneNumber && f.chatSettings.phoneNumber.includes(num))
      );
      
      // 在电话簿中查找
      if(!match) {
          for(let n in phoneBookData) {
              if(n.includes(num)) {
                  match = { realName: phoneBookData[n].name, isUnknown: true, number: n };
                  break;
              }
          }
      }
      
      if(match) {
          let dispName = match.remark || match.realName || match.name || "未知联系人";
          suggestEl.innerText = dispName;
          suggestEl.onclick = () => {
              currentNumber = match.number || (match.chatSettings && match.chatSettings.phoneNumber);
              document.getElementById('phone-dial-number').innerText = currentNumber;
              suggestMatches(currentNumber);
          };
      } else {
          suggestEl.innerText = "";
          suggestEl.onclick = null;
      }
  }
  
  // 拨打电话
  function makeCall() {
      if(!currentNumber) return;
      
      // 检查是否是微信好友
      let friendId = Object.keys(friendsData || {}).find(id => {
          let f = friendsData[id];
          return f.chatSettings && f.chatSettings.phoneNumber === currentNumber;
      });
      
      if(friendId) {
          callByFriendId(friendId);
          return;
      }
      
      // 不是微信好友，看看电话簿有没有
      if(!phoneBookData[currentNumber]) {
          // 生成随机人设
          const genders = ['男', '女'];
          const ages = ['年轻人', '中年人', '老人', '小孩'];
          const traits = ['暴躁', '温柔', '冷漠', '热情', '神秘', '推销员', '送外卖的', '找错人了', '前任', '暗恋者'];
          
          let g = genders[Math.floor(Math.random() * genders.length)];
          let a = ages[Math.floor(Math.random() * ages.length)];
          let t = traits[Math.floor(Math.random() * traits.length)];
          
          phoneBookData[currentNumber] = {
              name: `未知号码(${currentNumber.slice(-4)})`,
              persona: `你是一个${a}${g}，性格${t}。接到一个陌生电话。`,
              number: currentNumber
          };
          savePhoneBook();
      }
      
      _state.isIncoming = false;
      _state.chatId = null; // 临时角色，不在微信列表里
      _state.number = currentNumber;
      _launchCallView(null, currentNumber, phoneBookData[currentNumber]);
  }
  
  // 渲染联系人卡片 (堆叠)
  function renderContacts() {
      const container = document.getElementById('phone-contacts-stack');
      if(!container) return;
      
      let html = '';
      
      // 微信好友
      Object.values(friendsData || {}).forEach(f => {
          if(f.isBlocked) return;
          let name = f.remark || f.realName;
          let avatar = f.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
          let num = (f.chatSettings && f.chatSettings.phoneNumber) || "未设置号码";
          let id = Object.keys(friendsData).find(k => friendsData[k] === f);
          
          html += `
          <div class="phone-contact-card">
              <img class="c-avatar" src="${avatar}" onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=err'">
              <div class="c-name">${name} <i class="fab fa-weixin" style="color:#07c160;font-size: calc(12px * var(--font-scale));margin-left:4px;" title="微信好友"></i></div>
              <div class="c-num">${num}</div>
              <div class="c-actions">
                  <div class="c-btn msg" onclick="PhoneCallApp.closeDialer(); SMSApp.openWith('${id}')"><i class="fas fa-comment-dots"></i></div>
                  <div class="c-btn call" onclick="PhoneCallApp.callByFriendId('${id}')"><i class="fas fa-phone"></i></div>
              </div>
          </div>
          `;
      });
      
      // 电话簿里的陌生人
      Object.values(phoneBookData).forEach(p => {
          html += `
          <div class="phone-contact-card" style="background:#f9f9f9;">
              <div class="c-avatar" style="background:#ddd;display:flex;align-items:center;justify-content:center;font-size: calc(24px * var(--font-scale));color:#fff;"><i class="fas fa-user-secret"></i></div>
              <div class="c-name">${p.name}</div>
              <div class="c-num">${p.number}</div>
              <div style="font-size: calc(10px * var(--font-scale)); color:#888; margin-bottom:10px;">${p.persona}</div>
              <div class="c-actions">
                  <div class="c-btn edit" onclick="PhoneCallApp.editPersona('${p.number}')" title="修改人设" style="background:#e0e0e0;color:#333;"><i class="fas fa-edit"></i></div>
                  <div class="c-btn msg" onclick="PhoneCallApp.openWechatInvite('${p.number}')" title="添加微信"><i class="fas fa-user-plus"></i></div>
                  <div class="c-btn call" onclick="PhoneCallApp.callUnknown('${p.number}')"><i class="fas fa-phone"></i></div>
              </div>
          </div>
          `;
      });
      
      container.innerHTML = html;
  }
  
  function editPersona(number) {
      const p = phoneBookData[number];
      if(!p) return;
      const newPersona = prompt(`修改 ${p.name} 的人设：`, p.persona);
      if(newPersona !== null && newPersona.trim() !== '') {
          p.persona = newPersona.trim();
          savePhoneBook();
          renderContacts();
          if(typeof showToast === 'function') showToast("人设已更新");
      }
  }
  
  function callUnknown(number) {
      currentNumber = number;
      makeCall();
  }
  
  // 打开微信添加好友弹窗
  function openWechatInvite(number) {
      const p = phoneBookData[number];
      if(!p) return;
      
      const modal = document.getElementById('wechat-invite-modal');
      if(!modal) return;
      
      document.getElementById('wechat-invite-avatar').src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.name}`;
      document.getElementById('wechat-invite-name').innerText = p.name;
      document.getElementById('wechat-invite-msg').value = `你好，我是刚刚和你通电话的。`;
      
      modal._targetNumber = number;
      modal.classList.add('active');
  }
  
  function sendWechatRequest() {
      const modal = document.getElementById('wechat-invite-modal');
      const number = modal._targetNumber;
      const msg = document.getElementById('wechat-invite-msg').value;
      const p = phoneBookData[number];
      
      if(!p) return;
      
      // 自动同意并添加到微信好友
      const newId = p.name;
      if(!friendsData[newId]) {
          friendsData[newId] = {
              realName: p.name,
              remark: p.name,
              avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.name}`,
              persona: p.persona,
              greeting: `[通过电话号码搜索添加]\n你好，我是刚刚给你打电话的。`,
              chatSettings: { phoneNumber: p.number }
          };
          
          // 从电话簿删除
          delete phoneBookData[number];
          savePhoneBook();
          
          if(typeof saveFriendsData === 'function') saveFriendsData();
          if(typeof rebuildContactsList === 'function') rebuildContactsList();
          
          if(typeof showToast === 'function') showToast("对方已同意好友申请");
      }
      
      modal.classList.remove('active');
      renderContacts();
  }

  function _renderHistory() {
    const container = document.getElementById('phoneCallHistoryList');
    if (!container) return;

    if (!_callData.records.length) {
      container.innerHTML = `
        <div style="text-align:center;padding:60px 20px;color:#ccc;">
          <i class="fas fa-phone-slash" style="font-size: calc(32px * var(--font-scale));display:block;margin-bottom:12px;"></i>
          <div style="font-size: calc(13px * var(--font-scale));">暂无通话记录</div>
        </div>`;
      return;
    }

    container.innerHTML = _callData.records.slice().reverse().map(rec => {
      const friend = (typeof friendsData !== 'undefined') ? (friendsData[rec.chatId] || {}) : {};
      const name = friend.remark || friend.realName || rec.name || '未知';
      const initials = _initials(name);
      const timeStr = _fmtTime(rec.time);
      const typeColor = rec.type === 'missed' ? 'color:#ff3b30' : 'color:#999';
      const typeLabel = rec.type === 'missed' ? '未接来电' : rec.type === 'incoming' ? '来电' : '拨出';
      return `
        <div class="phone-record-item" onclick="PhoneCallApp.openTranscript('${rec.id}')">
          <div class="phone-record-avatar">${_esc(initials)}</div>
          <div class="phone-record-info">
            <div class="phone-record-name">${_esc(name)}</div>
            <div class="phone-record-meta">
              <span style="${typeColor}">${typeLabel}</span>
              &nbsp;·&nbsp;${timeStr}
            </div>
          </div>
          <div class="phone-record-duration">${rec.duration || '--'}</div>
        </div>`;
    }).join('');
  }

  /* ─── Incoming Call ─── */
  function triggerIncomingCall(chatId, number) {
    if (_state.active) return;

    const overlay = document.getElementById('phoneIncomingOverlay');
    if (!overlay) return;

    const friend = (typeof friendsData !== 'undefined') ? (friendsData[chatId] || {}) : {};
    const name     = friend.remark || friend.realName || '未知来电';
    const avatar   = friend.avatar || '';
    const initials = _initials(name);

    _state.isIncoming = true;
    _state.chatId     = chatId;
    _state.number     = number || '';

    const avatarHtml = avatar
      ? `<img src="${_esc(avatar)}" style="width:104px;height:104px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,0.18);" onerror="this.replaceWith(document.querySelector('#_phoneInitialsTpl').content.cloneNode(true))">`
      : `<div class="phone-incoming-avatar-initials">${_esc(initials)}</div>`;

    overlay.innerHTML = `
      <div class="phone-incoming-avatar-ring">${avatarHtml}</div>
      <div class="phone-incoming-name">${_esc(name)}</div>
      <div class="phone-incoming-number">${_esc(number || '未知号码')}</div>
      <div class="phone-incoming-subtitle">语音通话</div>
      <div class="phone-incoming-actions">
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
          <div class="phone-incoming-btn message" onclick="PhoneCallApp.rejectWithSMS()">
            <i class="fas fa-comment-dots"></i>
          </div>
          <div class="phone-incoming-label">短信回复</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
          <div class="phone-incoming-btn reject" onclick="PhoneCallApp.rejectCall()">
            <i class="fas fa-phone-slash"></i>
          </div>
          <div class="phone-incoming-label">拒接</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
          <div class="phone-incoming-btn accept" onclick="PhoneCallApp.acceptCall()">
            <i class="fas fa-phone"></i>
          </div>
          <div class="phone-incoming-label">接听</div>
        </div>
      </div>`;

    overlay.classList.add('active');
    _startRingtone();
  }

  function acceptCall() {
    _stopRingtone();
    const overlay = document.getElementById('phoneIncomingOverlay');
    if (overlay) overlay.classList.remove('active');
    _launchCallView(_state.chatId, _state.number);
  }

  function rejectCall() {
    _stopRingtone();
    const overlay = document.getElementById('phoneIncomingOverlay');
    if (overlay) overlay.classList.remove('active');
    _saveRecord({ type: 'missed', duration: null });
    _state.isIncoming = false;
    _state.chatId = null;
  }

  function rejectWithSMS() {
    const chatId = _state.chatId;
    const number = _state.number;
    rejectCall();
    if (chatId && typeof SMSApp !== 'undefined') {
      const friend = (typeof friendsData !== 'undefined') ? (friendsData[chatId] || {}) : {};
      const name = friend.remark || friend.realName || '未知';
      setTimeout(() => {
        SMSApp.injectStrangerSMS(name, number, '稍后再给你回电话。', chatId);
      }, 400);
    }
  }

  /* ─── Call by friend ID (from SMS app) ─── */
  function callByFriendId(chatId) {
    if (!chatId) return;
    const friend = (typeof friendsData !== 'undefined') ? (friendsData[chatId] || {}) : {};
    const number = (friend.chatSettings || {}).phoneNumber ||
      ('1' + Math.floor(Math.random() * 1e10).toString().padStart(10, '0'));
    _state.isIncoming = false;
    _state.chatId     = chatId;
    _state.number     = number;
    _launchCallView(chatId, number);
  }

  /* ─── Jump Scare (background trigger) ─── */
  function jumpScare(chatId, delayMs) {
    const delay = delayMs ?? (Math.random() * 5000 + 2000);
    setTimeout(() => triggerIncomingCall(chatId, '未知号码'), delay);
  }

  /* ─── Launch Call View ─── */
  function _launchCallView(chatId, number, unknownData = null) {
    const view = document.getElementById('phoneCallView');
    if (!view) return;

    let name = '未知';
    let avatar = '';
    let initials = '?';
    
    if(unknownData) {
        name = unknownData.name;
        _state.unknownData = unknownData;
    } else {
        const friend   = (typeof friendsData !== 'undefined') ? (friendsData[chatId] || {}) : {};
        name     = friend.remark || friend.realName || '未知';
        avatar   = friend.avatar || '';
        initials = _initials(name);
        _state.unknownData = null;
    }

    _state.active       = true;
    _state.chatId       = chatId;
    _state.number       = number;
    _state.startTime    = Date.now();
    _state.messages     = [];
    _state.transcripts  = [];
    _state.isMuted      = false;
    _state.isSpeaker    = false;
    _state.ttsEnabled   = false;
    _state.currentSFX   = null;
    _state.currentAudio = null;

    const avatarHtml = avatar
      ? `<img class="phone-call-avatar" src="${_esc(avatar)}" onerror="this.outerHTML='<div class=phone-call-avatar-initials>${_esc(initials)}</div>'">`
      : `<div class="phone-call-avatar-initials">${_esc(initials)}</div>`;

    const bars = Array.from({ length: 9 }, () => '<div class="bar"></div>').join('');

    view.innerHTML = `
      <div class="phone-call-top">
        ${avatarHtml}
        <div class="phone-call-name">${_esc(name)}</div>
        <div class="phone-call-status">正在通话中</div>
        <div class="phone-call-timer" id="phoneTimer">00:00</div>
      </div>

      <div class="phone-waveform-container">
        <div class="phone-sfx-tag" id="phoneSfxTag" style="display:none;"></div>
        <div class="phone-waveform idle" id="phoneWaveform">${bars}</div>
        <div class="phone-call-transcript" id="phoneTranscript"></div>
      </div>

      <div class="phone-controls">
        <div class="phone-ctrl-item" onclick="PhoneCallApp.toggleMute()">
          <div class="phone-ctrl-btn" id="phoneMuteBtn"><i class="fas fa-microphone-slash"></i></div>
          <div class="phone-ctrl-label">静音</div>
        </div>
        <div class="phone-ctrl-item" onclick="PhoneCallApp.focusInput()">
          <div class="phone-ctrl-btn" id="phoneKeypadBtn"><i class="fas fa-keyboard"></i></div>
          <div class="phone-ctrl-label">键盘</div>
        </div>
        <div class="phone-ctrl-item" onclick="PhoneCallApp.toggleSpeaker()">
          <div class="phone-ctrl-btn" id="phoneSpeakerBtn"><i class="fas fa-volume-up"></i></div>
          <div class="phone-ctrl-label">免提</div>
        </div>
        <div class="phone-ctrl-item" onclick="PhoneCallApp.toggleTTS()">
          <div class="phone-ctrl-btn" id="phoneTtsBtn"><i class="fas fa-robot"></i></div>
          <div class="phone-ctrl-label">AI语音</div>
        </div>
        <div class="phone-ctrl-item">
          <div class="phone-ctrl-btn end" onclick="PhoneCallApp.hangUp()"><i class="fas fa-phone-slash"></i></div>
          <div class="phone-ctrl-label">挂断</div>
        </div>
        <div class="phone-ctrl-item" onclick="PhoneCallApp.rerollReply()">
          <div class="phone-ctrl-btn"><i class="fas fa-redo"></i></div>
          <div class="phone-ctrl-label">重回</div>
        </div>
      </div>

      <div class="phone-input-area">
        <input type="text" id="phoneInput" placeholder="说点什么…"
               onkeydown="if(event.key==='Enter'){event.preventDefault();PhoneCallApp.sendMessage();}">
        <div class="phone-input-send" onclick="PhoneCallApp.sendMessage()">
          <i class="fas fa-paper-plane"></i>
        </div>
      </div>`;

    view.classList.add('active');

    // Timer
    _state.timerHandle = setInterval(() => {
      const el = document.getElementById('phoneTimer');
      if (el) {
        const sec = Math.floor((Date.now() - _state.startTime) / 1000);
        el.textContent = _fmtDuration(sec);
      }
    }, 1000);

    // AI opening
    setTimeout(() => _triggerAI('[电话接通，对方第一句话]'), 600);
  }

  /* ─── Controls ─── */
  function toggleMute() {
    _state.isMuted = !_state.isMuted;
    const btn = document.getElementById('phoneMuteBtn');
    if (btn) btn.classList.toggle('active', _state.isMuted);
    if (typeof showToast === 'function') showToast(_state.isMuted ? '麦克风已静音' : '麦克风已恢复');
  }

  function toggleSpeaker() {
    _state.isSpeaker = !_state.isSpeaker;
    const btn = document.getElementById('phoneSpeakerBtn');
    if (btn) btn.classList.toggle('active', _state.isSpeaker);
    if (typeof showToast === 'function') showToast(_state.isSpeaker ? '免提已开启' : '免提已关闭');
  }

  function toggleTTS() {
    _state.ttsEnabled = !_state.ttsEnabled;
    const btn = document.getElementById('phoneTtsBtn');
    if (btn) btn.classList.toggle('active', _state.ttsEnabled);
    if (typeof showToast === 'function') showToast(_state.ttsEnabled ? 'AI语音已开启' : 'AI语音已关闭');
  }

  function focusInput() {
    const inp = document.getElementById('phoneInput');
    if (inp) inp.focus();
  }

  /* ─── Messaging ─── */
  function sendMessage() {
    const input = document.getElementById('phoneInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    _appendLine(text, 'user');
    _state.messages.push({ role: 'user', content: text });
    _state.transcripts.push(`[Me] ${text}`);
    _triggerAI(text);
  }

  function rerollReply() {
    // Remove last AI line from transcript DOM
    const box = document.getElementById('phoneTranscript');
    if (box) {
      const lines = box.querySelectorAll('.phone-transcript-line.ai');
      if (lines.length) lines[lines.length - 1].remove();
    }
    // Remove last assistant message
    for (let i = _state.messages.length - 1; i >= 0; i--) {
      if (_state.messages[i].role === 'assistant') {
        _state.messages.splice(i, 1);
        break;
      }
    }
    // Re-trigger with last user text
    for (let i = _state.messages.length - 1; i >= 0; i--) {
      if (_state.messages[i].role === 'user') {
        _triggerAI(_state.messages[i].content);
        return;
      }
    }
    _triggerAI('[重新说一下]');
  }

  function _appendLine(text, role) {
    const box = document.getElementById('phoneTranscript');
    if (!box) return;
    const div = document.createElement('div');
    div.className = `phone-transcript-line ${role}`;
    div.textContent = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  /* ─── AI ─── */
  async function _triggerAI(userText) {
    const settingsJSON = localStorage.getItem('myCoolPhone_aiSettings');
    if (!settingsJSON) return;
    const settings = JSON.parse(settingsJSON);

    _setWaveform(true);

    const systemPrompt = _buildPhonePrompt();
    let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
    const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ..._state.messages.slice(-8),
      { role: 'user', content: userText }
    ];

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
        body: JSON.stringify({ model: settings.model, messages, temperature: 0.88, max_tokens: 120 })
      });

      _setWaveform(false);

      if (!res.ok) return;
      const data = await res.json();
      let reply = (data?.choices?.[0]?.message?.content || '').trim();

      // Parse SFX tag (must be at start)
      const sfxMatch = /^\[SFX:\s*([^\]]+)\]/i.exec(reply);
      if (sfxMatch) {
        _showSFX(sfxMatch[1].trim());
        reply = reply.replace(sfxMatch[0], '').trim();
        _state.currentSFX = sfxMatch[1].trim();
      }

      // Strip any action descriptions (phone mode: forbidden)
      reply = reply.replace(/\*[^*\n]+\*/g, '').trim();
      reply = reply.replace(/（[^）]{1,30}）/g, '').trim(); // also strip （brackets）
      reply = reply.replace(/\[STATUS[\s\S]*?\]/gi, '').trim();

      if (!reply) { _setWaveform(false); return; }

      _state.messages.push({ role: 'user',      content: userText });
      _state.messages.push({ role: 'assistant', content: reply });
      _state.transcripts.push(`[AI] ${reply}`);

      _appendLine(reply, 'ai');

      if (_state.ttsEnabled) _playTTS(reply);

    } catch (e) {
      _setWaveform(false);
      console.error('[PhoneCall] AI error:', e);
    }
  }

  function _buildPhonePrompt() {
    const chatId = _state.chatId;
    let aiName = '对方';
    let aiPersona = '你是一个真实的人，正在接一通电话。';
    
    if(_state.unknownData) {
        aiName = _state.unknownData.name;
        aiPersona = _state.unknownData.persona;
    } else {
        const friend = (typeof friendsData !== 'undefined') ? (friendsData[chatId] || {}) : {};
        aiName    = friend.remark || friend.realName || '对方';
        aiPersona = friend.persona || aiPersona;
    }

    const myPersona = (() => {
      if (typeof personasMeta === 'undefined' || typeof currentPersonaId === 'undefined') return '';
      return (personasMeta[currentPersonaId] || {}).persona || '';
    })();

    // Recent chat history for context
    let historyCtx = '';
    const friend = (typeof friendsData !== 'undefined') ? (friendsData[chatId] || {}) : {};
    if (typeof friendsData !== 'undefined' && friend.summaries?.length) {
      historyCtx = friend.summaries.slice(-3).map(s => s.text).join('；');
    }

    // Call context
    const now = new Date();
    const timeStr = `${now.getHours()}点${now.getMinutes()}分`;
    const isBlocked = friend.isBlocked ? true : false;
    
    // 随机生活场景 (让AI的开场白和环境音更有真实感)
    const randomScenarios = [
      '你刚洗完澡，正在用毛巾擦头发',
      '你正在嘈杂的地铁上，信号时好时坏',
      '你正在便利店排队结账',
      '你在深夜的阳台吹风，周围很安静',
      '你正准备睡觉，突然接到了电话',
      '你正在一边吃外卖一边看剧',
      '你在外面走路，周围有风声和车流声'
    ];
    const currentScenario = randomScenarios[Math.floor(Math.random() * randomScenarios.length)];

    // Count recent missed calls
    let recentMissedCount = 0;
    if (_callData && _callData.records) {
      const fiveMinsAgo = Date.now() - 5 * 60 * 1000;
      recentMissedCount = _callData.records.filter(r => r.chatId === chatId && r.type === 'missed' && r.time > fiveMinsAgo).length;
    }

    let statusCtx = `当前时间：${timeStr}。\n[当前你的随机生活场景]：${currentScenario}`;
    if (isBlocked) {
      statusCtx += `\n[特别注意：你现在在微信上被用户拉黑了！这是拉黑状态下的电话。]`;
    }
    if (recentMissedCount > 0) {
      statusCtx += `\n[在此之前，有 ${recentMissedCount} 通未接电话。]`;
    }

    return `[PHONE CALL — 电话通话模式]
你是 ${aiName}，正在和用户打一通真实的语音电话。

【当前客观状态与情境】
${statusCtx}

【你的人设】
${aiPersona}

${myPersona ? `【用户身份】\n${myPersona}\n` : ''}
${historyCtx ? `【背景记忆】\n${historyCtx}\n` : ''}

【任务要求】
请完全基于你的人设和当前的客观状态（如拉黑、未接来电等），决定你在电话里的情绪和态度。

╔══════════════════════════════════════╗
║   电话模式最高铁律 — 绝对不可违反    ║
╚══════════════════════════════════════╝

【铁律一：绝对禁止动作描写】
✗ 错误：（微笑着说）你好啊  
✗ 错误：*轻轻一笑* 是我  
✗ 错误：[看着窗外] 今天天气不错  
✓ 正确：你好啊  
✓ 正确：喂？是我，刚才在忙。  
因为对方在电话里根本看不见你！一切视觉描写都禁止。

【铁律二：语气词与停顿】
模拟真实通话的口吻。必须使用：
"喂？""呃……""那个……""哈，是吗""嗯嗯""等一下""哦对"等口语。
可用省略号表示停顿和思考。语气要自然，结合你当前的【随机生活场景】，比如吃东西含糊不清、风大听不清等。

【铁律三：环境音 SFX 指令】
结合你的【随机生活场景】，在整个回复的最开头输出匹配的环境音指令（如没有可不写）：
[SFX: 吹风机的声音] 或 [SFX: 便利店欢迎光临的门铃声] 或 [SFX: 嚼薯片的声音]
每次回复只允许一个 SFX 标签（如果有的话）。

【铁律四：短促互动】
电话是即时对话，不是单方面表演。
每句话控制在 20 字以内，然后等待对方回应。
不要长篇大论。

【铁律五：自然挂断】
如果对话已到尽头，说 "好，那先这样" 或 "改天再聊" 等真实的结束语。

现在开始，接起电话：`;
  }

  /* ─── Waveform ─── */
  function _setWaveform(active) {
    const wf = document.getElementById('phoneWaveform');
    if (!wf) return;
    if (active) wf.classList.remove('idle');
    else        wf.classList.add('idle');
  }

  function _showSFX(text) {
    const tag = document.getElementById('phoneSfxTag');
    if (!tag) return;
    tag.textContent = `🎵 ${text}`;
    tag.style.display = 'block';
    clearTimeout(tag._sfxTimer);
    tag._sfxTimer = setTimeout(() => { tag.style.display = 'none'; }, 9000);
  }

  /* ─── TTS ─── */
  async function _playTTS(text) {
    try {
      const settingsJSON = localStorage.getItem('myCoolPhone_aiSettings');
      if (!settingsJSON) return;
      const settings = JSON.parse(settingsJSON);
      if (!settings.provider?.startsWith('minimax') || !settings.apiKey) return;

      let voiceId  = 'female-shaonv';
      let speed    = 1.0;
      
      if(!_state.unknownData) {
          const friend = (typeof friendsData !== 'undefined') ? (friendsData[_state.chatId] || {}) : {};
          const cs = friend.chatSettings || {};
          if(cs.voiceId) voiceId = cs.voiceId;
          if(cs.voiceSpeed) speed = cs.voiceSpeed;
      }
      
      const groupId  = settings.voiceGroupId || settings.groupId || '';
      const isGlobal = settings.provider === 'minimax_global';
      const url = isGlobal
        ? `https://api.minimaxi.com/v1/t2a_v2?GroupId=${groupId}`
        : `https://api.minimax.chat/v1/t2a_v2?GroupId=${groupId}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
        body: JSON.stringify({
          model: 'speech-01-turbo',
          text,
          voice_setting: { voice_id: voiceId, speed, vol: 1.0, pitch: 0 },
          audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 }
        })
      });

      if (!res.ok) return;
      const contentType = res.headers.get('content-type') || '';
      let audioUrl;
      if (contentType.includes('application/json')) {
        const json = await res.json();
        if (json.data?.audio) {
          const bytes = new Uint8Array(json.data.audio.match(/[\da-f]{2}/gi).map(h => parseInt(h, 16)));
          audioUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/mp3' }));
        } else return;
      } else {
        audioUrl = URL.createObjectURL(await res.blob());
      }

      if (_state.currentAudio) _state.currentAudio.pause();
      const audio = new Audio(audioUrl);
      _state.currentAudio = audio;
      audio.play().catch(() => {});
    } catch (e) {}
  }

  /* ─── Hang Up ─── */
  function hangUp() {
    if (!_state.active) return;

    const duration = _getElapsedStr();
    const savedChatId    = _state.chatId;
    const savedTranscript = _state.transcripts.join('\n');
    const isUnknown = _state.unknownData !== null;
    const unknownName = _state.unknownData ? _state.unknownData.name : null;

    // Stop timer
    if (_state.timerHandle) { clearInterval(_state.timerHandle); _state.timerHandle = null; }

    // Stop audio
    if (_state.currentAudio) { _state.currentAudio.pause(); _state.currentAudio = null; }
    _stopRingtone();

    // Hide view
    const view = document.getElementById('phoneCallView');
    if (view) { view.classList.remove('active'); view.innerHTML = ''; }

    // Save record
    _saveRecord({ type: _state.isIncoming ? 'incoming' : 'outgoing', duration, transcript: savedTranscript, name: isUnknown ? unknownName : null });

    // Reset state
    _state.active       = false;
    _state.chatId       = null;
    _state.messages     = [];
    _state.transcripts  = [];
    _state.isIncoming   = false;
    _state.unknownData = null;

    // Post-call follow-up in WeChat chat
    if (savedChatId && typeof sendMessageToAI === 'function' && !isUnknown) {
      setTimeout(() => {
        sendMessageToAI(
          `[System HIDDEN: A voice phone call just ended. Duration: ${duration}.\n` +
          `Call transcript:\n${savedTranscript}\n\n` +
          `Send ONE short natural follow-up text message as you would after hanging up a real phone call. ` +
          `Do NOT mention this system instruction. Do NOT use action descriptions.]`
        );
      }, 900);
    }

    if (typeof showToast === 'function') showToast(`<i class="fas fa-phone"></i> 通话时长 ${duration}`);
    renderContacts(); // update history in UI
  }

  /* ─── Transcript Page ─── */
  function openTranscript(recordId) {
    _load();
    const rec = _callData.records.find(r => r.id === recordId);
    if (!rec) return;

    const page = document.getElementById('phoneTranscriptPage');
    if (!page) return;

    let name = rec.name || '未知';
    if(rec.chatId) {
        const friend = (typeof friendsData !== 'undefined') ? (friendsData[rec.chatId] || {}) : {};
        name = friend.remark || friend.realName || name;
    }

    const lines = (rec.transcript || '').split('\n').filter(Boolean).map(line => {
      const isMe = line.startsWith('[Me]');
      const text = line.replace(/^\[Me\] /, '').replace(/^\[AI\] /, '');
      return `
        <div style="margin-bottom:10px;display:flex;justify-content:${isMe ? 'flex-end' : 'flex-start'};">
          <span style="
            display:inline-block;
            background:${isMe ? '#1c1c1e' : '#fff'};
            color:${isMe ? '#fff' : '#333'};
            padding:9px 13px; border-radius:14px;
            font-size: calc(13px * var(--font-scale)); max-width:82%;
            border:1px solid ${isMe ? 'transparent' : '#ececec'};
            line-height:1.5; word-break:break-word;
          ">${_esc(text)}</span>
        </div>`;
    }).join('');

    page.innerHTML = `
      <div class="sms-thread-header">
        <i class="fas fa-chevron-left" onclick="PhoneCallApp.closeTranscript()"
           style="cursor:pointer;font-size: calc(18px * var(--font-scale));color:#333;padding:4px 8px 4px 0;"></i>
        <div>
          <div class="sms-thread-name">${_esc(name)}</div>
          <div class="sms-thread-number">${_fmtDateTimeFull(rec.time)} · ${rec.duration || '未接听'}</div>
        </div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:16px;background:#f7f7f7;">
        ${lines || '<div style="text-align:center;color:#ccc;padding:30px;font-size: calc(13px * var(--font-scale));">无通话内容</div>'}
      </div>`;

    page.classList.add('open');
  }

  function closeTranscript() {
    const page = document.getElementById('phoneTranscriptPage');
    if (page) page.classList.remove('open');
  }

  /* ─── Ringtone ─── */
  function _startRingtone() {
    _ringtoneHandle = setInterval(() => {
      try {
        const ctx  = new (window.AudioContext || window.webkitAudioContext)();
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(660, ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.55);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.55);
      } catch (e) {}
    }, 1500);
  }

  function _stopRingtone() {
    if (_ringtoneHandle) { clearInterval(_ringtoneHandle); _ringtoneHandle = null; }
  }

  /* ─── Save Record ─── */
  function _saveRecord(extra = {}) {
    _load();
    
    let name = extra.name;
    if(!name) {
        const friend = (typeof friendsData !== 'undefined') ? (friendsData[_state.chatId] || {}) : {};
        name = friend.remark || friend.realName || '未知';
    }
    
    _callData.records.push({
      id:     'cr_' + Date.now(),
      chatId: _state.chatId,
      name:   name,
      time:   Date.now(),
      ...extra
    });
    // Keep last 60
    if (_callData.records.length > 60) _callData.records.splice(0, _callData.records.length - 60);
    _save();
  }

  /* ─── Cross-App: detect [PHONE_CALL_REQUEST] in AI chat ─── */
  function checkForPhoneCallRequest(aiReply, chatId) {
    if (!/\[PHONE_CALL_REQUEST\]/i.test(aiReply)) return aiReply;
    const clean = aiReply.replace(/\[PHONE_CALL_REQUEST\]/gi, '').trim();
    setTimeout(() => triggerIncomingCall(chatId, '未知号码'), 1200);
    return clean;
  }

  /* ─── Helpers ─── */
  function _initials(name) {
    if (!name) return '?';
    const cjk = name.replace(/[^\u4e00-\u9fa5]/g, '');
    if (cjk.length) return cjk.slice(-2);
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  function _fmtDuration(sec) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function _getElapsedStr() {
    if (!_state.startTime) return '0秒';
    const sec = Math.floor((Date.now() - _state.startTime) / 1000);
    const m = Math.floor(sec / 60), s = sec % 60;
    return m > 0 ? `${m}分${s}秒` : `${s}秒`;
  }

  function _fmtTime(ts) {
    if (!ts) return '';
    const now = new Date(), d = new Date(ts), diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (d.toDateString() === now.toDateString())
      return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  function _fmtDateTimeFull(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  function _esc(s) {
    return (s || '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
  }

  /* ─── Public API ─── */
  return {
    openDialer,
    closeDialer,
    triggerIncomingCall,
    acceptCall,
    rejectCall,
    rejectWithSMS,
    callByFriendId,
    jumpScare,
    hangUp,
    sendMessage,
    rerollReply,
    toggleMute,
    toggleSpeaker,
    toggleTTS,
    focusInput,
    openTranscript,
    closeTranscript,
    checkForPhoneCallRequest,
    switchTab,
    typeNum,
    delNum,
    suggestMatches,
    makeCall,
    callUnknown,
    openWechatInvite,
    sendWechatRequest,
    editPersona
  };
})();
