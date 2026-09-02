/* ============================================
   视频通话核心逻辑 v2.0
   韩系极简 · 讲话/动作分离 · 长按语音 · 世界书/人设/记忆接入
   ============================================ */

/* ─────────────────────────────────────────────
   § 0  全局状态
───────────────────────────────────────────── */
const VideoCallState = {
    active:      false,
    chatId:      null,
    isGroup:     false,
    mode:        'visual',   // 'visual' | 'text'
    startTime:   null,
    timerHandle: null,
    messages:    [],         // { role, content, imgData? }
    transcripts: [],         // 通话纯文字记录

    isCameraOn:    false,
    isFacingUser:  true,     // 前置摄像头
    localStream:   null,

    ttsEnabled:  false,      // 语音播报开关
    currentAudio: null,

    minimized: false,

    // 长按语音录制
    vcRecording:     false,
    vcRecognition:   null,
    vcMediaRecorder: null,
    vcMediaStream:   null,
    vcRecText:       '',
};

// 铃声音频
let _ringAudio = null;

/* ─────────────────────────────────────────────
   § 1  工具函数
───────────────────────────────────────────── */

/** 秒数 → mm:ss */
function _formatDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

/** 截取摄像头当前帧，返回 base64 (512px) */
function _captureFrame() {
    const video = document.getElementById('vc-local-video');
    if (!video || video.readyState < 2) return null;
    try {
        const canvas = document.createElement('canvas');
        const scale  = 512 / Math.max(video.videoWidth, 1);
        canvas.width  = Math.round(video.videoWidth  * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.7);
    } catch (e) { return null; }
}

/** 解析 AI 回复中的 *动作* 和讲话文字，返回数组 */
function _parseSegments(text) {
    const parts = [];
    const re = /\*([^*\n]+)\*/g;
    let last = 0, m;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) {
            const sp = text.slice(last, m.index).trim();
            if (sp) parts.push({ type: 'speech', text: sp });
        }
        parts.push({ type: 'action', text: m[1].trim() });
        last = re.lastIndex;
    }
    if (last < text.length) {
        const sp = text.slice(last).trim();
        if (sp) parts.push({ type: 'speech', text: sp });
    }
    // 如果没有任何 * 标记，整段都是讲话
    if (parts.length === 0 && text.trim()) {
        parts.push({ type: 'speech', text: text.trim() });
    }
    return parts;
}

/** 向消息区追加一条消息（讲话+动作分离渲染） */
function _appendCallMsg(text, role, avatarSrc) {
    const box = document.getElementById('vc-messages');
    if (!box) return;

    const segs = _parseSegments(text);
    if (!segs.length) return;

    const friend = (typeof friendsData !== 'undefined') ? (friendsData[VideoCallState.chatId] || {}) : {};
    const mePersona = (typeof personasMeta !== 'undefined') ? (personasMeta[typeof currentPersonaId !== 'undefined' ? currentPersonaId : ''] || {}) : {};

    const finalAvatar = avatarSrc ||
        (role === 'ai' ? (friend.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=ai`) :
                         (mePersona.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=me`));

    const row = document.createElement('div');
    row.className = `vc-msg ${role}`;

    const img = document.createElement('img');
    img.className = 'vc-msg-avatar';
    img.src = finalAvatar;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'vc-msg-content';

    segs.forEach(seg => {
        const el = document.createElement('div');
        if (seg.type === 'action') {
            el.className = 'vc-msg-action';
            el.innerHTML = `<i class="fas fa-asterisk" style="font-size: calc(8px * var(--font-scale));opacity:0.5;"></i> ${seg.text}`;
        } else {
            el.className = 'vc-msg-bubble';
            el.textContent = seg.text;
        }
        contentDiv.appendChild(el);
    });

    if (role === 'user') {
        row.appendChild(contentDiv);
        row.appendChild(img);
    } else {
        row.appendChild(img);
        row.appendChild(contentDiv);
    }

    box.appendChild(row);
    box.scrollTop = box.scrollHeight;

    // 存入转录
    VideoCallState.transcripts.push(`[${role === 'ai' ? (friend.remark || friend.realName || 'AI') : 'Me'}] ${text}`);
}

/** 显示 loading 三点动画 */
function _showLoadingDots() {
    const box = document.getElementById('vc-messages');
    if (!box) return null;
    const row = document.createElement('div');
    row.className = 'vc-msg ai';
    row.id = 'vc-loading-row';

    const friend = (typeof friendsData !== 'undefined') ? (friendsData[VideoCallState.chatId] || {}) : {};
    const img = document.createElement('img');
    img.className = 'vc-msg-avatar';
    img.src = friend.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=ai`;

    const bub = document.createElement('div');
    bub.className = 'vc-msg-content';
    bub.innerHTML = `<div class="vc-msg-bubble"><div class="vc-loading-dots"><span></span><span></span><span></span></div></div>`;

    row.appendChild(img);
    row.appendChild(bub);
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
    return row;
}

/** 移除 loading 行 */
function _removeLoadingDots() {
    const el = document.getElementById('vc-loading-row');
    if (el) el.remove();
}

/* ─────────────────────────────────────────────
   § 2  系统提示词构建（含世界书 / 人设 / 记忆）
───────────────────────────────────────────── */
async function _buildCallSystemPrompt(userMessage) {
    const chatId  = VideoCallState.chatId;
    const friend  = (typeof friendsData !== 'undefined') ? (friendsData[chatId] || {}) : {};
    const chatSettings = friend.chatSettings || {};

    // ── 用户人设 ──
    const myPersona = (() => {
        if (typeof personasMeta === 'undefined' || typeof currentPersonaId === 'undefined') return '';
        return (personasMeta[currentPersonaId] || {}).persona || '';
    })();

    // ── AI 人设 ──
    const aiPersona  = friend.persona  || '你是一个温柔的 AI。';
    const aiName     = friend.remark   || friend.realName || 'AI';

    // ── 历史记忆总结 ──
    const memorySummaries = (friend.summaries || []).map((s, i) => `- [第${i+1}段] ${s.text}`).join('\n');
    const memoryLimit     = parseInt(chatSettings.memoryLimit) || 20;

    // ── 世界书注入 ──
    const wbData = (typeof constructWorldInfoPrompt === 'function')
        ? constructWorldInfoPrompt(userMessage || '[视频通话中]', chatId)
        : { before_char: '', after_char: '', depth_items: [] };

    // ── 近期聊天记录 ──
    let historyCtx = '';
    if (typeof loadChatHistory === 'function') {
        try {
            const hist = await loadChatHistory(chatId);
            const recent = hist.slice(-memoryLimit);
            historyCtx = recent.map(m => {
                const r = m.type === 'sent' ? 'Me' : aiName;
                return `${r}: ${(m.text || '')}`;
            }).join('\n');
        } catch (e) { /* ignore */ }
    }

    // ── 关联世界书数量 ──
    const linkedWbCount = (() => {
        if (typeof worldBooks === 'undefined') return 0;
        const ids = Array.isArray(friend.worldbook) ? friend.worldbook : (friend.worldbook ? [friend.worldbook] : []);
        const globalCount = worldBooks.filter(b => b.global).length;
        return ids.length + globalCount;
    })();

    let prompt = `[VIDEO CALL SYSTEM]
You are ${aiName} on a live video call with the user. Act natural, casual, expressive.
This is a REAL-TIME VIDEO call — NOT text chat. Speak accordingly (short, warm, reactive).

[YOUR PERSONA]
${aiPersona}

${myPersona ? `[USER IDENTITY (the person calling you)]\n${myPersona}\n` : ''}

[FORMAT RULES — CRITICAL]
1. Separate ACTIONS from SPEECH using *asterisks*:
   - Wrap physical actions, expressions, gestures, and inner reactions in *asterisks*: *轻轻歪头*
   - Speak naturally outside asterisks: 你今天怎么了？
   - Example: *微微皱眉，看着你* 你今天怎么了，声音听起来有点奇怪。
2. Keep responses SHORT — max 2-3 sentences of speech + 1-2 action markers.
3. Use spoken Chinese, casual tone. NO markdown, NO lists.
4. If user is using camera, react naturally to what you see (describe it in *actions*).

${memorySummaries ? `[STORY MEMORY]\n${memorySummaries}\n` : ''}
${wbData.before_char ? `[WORLD SETTING]\n${wbData.before_char}\n` : ''}
${wbData.after_char  ? `[Additional Setting]\n${wbData.after_char}\n` : ''}
${historyCtx      ? `[RECENT CHAT (${memoryLimit} msgs)]\n${historyCtx}\n` : ''}

[INFO TAGS — internal only, do NOT mention to user]
Memory loaded: ${memoryLimit} msgs · WorldBooks: ${linkedWbCount}
`;

    // 群视频特殊提示
    if (VideoCallState.isGroup) {
        prompt += `\n[GROUP CALL] You must simultaneously portray ALL group members. Format each line as: CharacterName: *action* speech`;
    }

    return prompt;
}

/* ─────────────────────────────────────────────
   § 3  AI 请求
───────────────────────────────────────────── */
async function _sendCallAI(userText, imgDataBase64) {
    _showLoadingDots();

    const systemPrompt = await _buildCallSystemPrompt(userText);

    const settingsJSON = localStorage.getItem('myCoolPhone_aiSettings');
    if (!settingsJSON) {
        _removeLoadingDots();
        _appendCallMsg('*叹了口气* 好像 API 没有设置好，先等一下…', 'ai');
        return;
    }
    const settings = JSON.parse(settingsJSON);

    let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
    const apiUrl = baseUrl.endsWith('/v1')
        ? `${baseUrl}/chat/completions`
        : `${baseUrl}/v1/chat/completions`;

    // 构建消息列表（包含视觉帧）
    let userContent;
    if (imgDataBase64) {
        userContent = [
            { type: 'text', text: userText || '[用户发来视频画面]' },
            { type: 'image_url', image_url: { url: imgDataBase64 } }
        ];
    } else {
        userContent = userText || '[静默中]';
    }

    let messages = [
        { role: 'system', content: systemPrompt },
        // 注入最近几条通话历史
        ...VideoCallState.messages.slice(-8),
        { role: 'user', content: userContent }
    ];

    // 处理 depth (世界书深度插入)
    const wbData = (typeof constructWorldInfoPrompt === 'function')
        ? constructWorldInfoPrompt(userText || '[视频通话中]', VideoCallState.chatId)
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
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify({
                model:       settings.model,
                messages:    messages,
                temperature: parseFloat(settings.temperature || 0.8),
                max_tokens:  260
            })
        });

        _removeLoadingDots();

        if (!res.ok) {
            _appendCallMsg('*皱眉* 连接好像有点问题，稍等一下。', 'ai');
            return;
        }

        const data = await res.json();
        let reply = (data?.choices?.[0]?.message?.content || '').trim();

        // 清除状态块（如果AI附带了）
        reply = reply.replace(/\[STATUS_START\][\s\S]*?\[STATUS_END\]/gi, '').trim();

        if (!reply) {
            _appendCallMsg('*沉默地看着你*', 'ai');
            return;
        }

        // 更新通话历史
        VideoCallState.messages.push({ role: 'user',      content: userContent });
        VideoCallState.messages.push({ role: 'assistant', content: reply });

        // 渲染（分段，每段加短暂延迟）
        const segs = _parseSegments(reply);
        let delay = 0;
        segs.forEach(seg => {
            setTimeout(() => {
                const el = document.createElement('div');
                if (seg.type === 'action') {
                    el.className = 'vc-msg-action';
                    el.innerHTML = `<i class="fas fa-asterisk" style="font-size: calc(8px * var(--font-scale));opacity:0.5;"></i> ${seg.text}`;
                } else {
                    el.className = 'vc-msg-bubble';
                    el.textContent = seg.text;
                }
                _ensureAiMsgRow(el);
            }, delay);
            delay += seg.type === 'action' ? 200 : 400 + seg.text.length * 30;
        });

        // TTS 播报整段讲话
        if (VideoCallState.ttsEnabled) {
            const speechOnly = segs.filter(s => s.type === 'speech').map(s => s.text).join('，');
            if (speechOnly) _playTTS(speechOnly);
        }

        // 保存到通话记录
        VideoCallState.transcripts.push(`[AI] ${reply}`);

    } catch (e) {
        _removeLoadingDots();
        _appendCallMsg('*皱眉* 信号好像不太好…', 'ai');
        console.error('[VideoCall] AI error:', e);
    }
}

/** 保证新 AI 消息行存在（逐段追加） */
let _lastAiRow = null;
function _ensureAiMsgRow(segEl) {
    const box = document.getElementById('vc-messages');
    if (!box) return;

    const friend = (typeof friendsData !== 'undefined') ? (friendsData[VideoCallState.chatId] || {}) : {};
    const avatarSrc = friend.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=ai`;

    // 如果还没有当前这条 AI 行，新建一个
    if (!_lastAiRow || !box.contains(_lastAiRow)) {
        const row = document.createElement('div');
        row.className = 'vc-msg ai';

        const img = document.createElement('img');
        img.className = 'vc-msg-avatar';
        img.src = avatarSrc;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'vc-msg-content';

        row.appendChild(img);
        row.appendChild(contentDiv);
        box.appendChild(row);
        _lastAiRow = row;
    }

    const content = _lastAiRow.querySelector('.vc-msg-content');
    if (content) {
        content.appendChild(segEl);
        box.scrollTop = box.scrollHeight;
    }
}

/* ─────────────────────────────────────────────
   § 4  TTS (Minimax)
───────────────────────────────────────────── */
async function _playTTS(text) {
    try {
        const settingsJSON = localStorage.getItem('myCoolPhone_aiSettings');
        if (!settingsJSON) return;
        const settings = JSON.parse(settingsJSON);
        if (!settings.provider?.startsWith('minimax') || !settings.apiKey) return;

        const friend = (typeof friendsData !== 'undefined') ? (friendsData[VideoCallState.chatId] || {}) : {};
        const cs = friend.chatSettings || {};
        const voiceId = cs.voiceId || 'female-shaonv';
        const speed   = cs.voiceSpeed || 1.0;
        const groupId = settings.voiceGroupId || settings.groupId || '';

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
                const bytes = new Uint8Array(json.data.audio.match(/[\da-f]{2}/gi).map(h => parseInt(h,16)));
                audioUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/mp3' }));
            } else return;
        } else {
            audioUrl = URL.createObjectURL(await res.blob());
        }

        if (VideoCallState.currentAudio) VideoCallState.currentAudio.pause();
        const audio = new Audio(audioUrl);
        VideoCallState.currentAudio = audio;
        audio.play().catch(() => {});
    } catch (e) { /* silent */ }
}

/* ─────────────────────────────────────────────
   § 5  计时器
───────────────────────────────────────────── */
function _startTimer() {
    VideoCallState.startTime = Date.now();
    VideoCallState.timerHandle = setInterval(() => {
        const el = document.getElementById('vc-timer-display');
        if (el) {
            const sec = Math.floor((Date.now() - VideoCallState.startTime) / 1000);
            el.textContent = _formatDuration(sec);
        }
    }, 1000);
}
function _stopTimer() {
    if (VideoCallState.timerHandle) {
        clearInterval(VideoCallState.timerHandle);
        VideoCallState.timerHandle = null;
    }
}
function _getElapsedStr() {
    if (!VideoCallState.startTime) return '0秒';
    const sec = Math.floor((Date.now() - VideoCallState.startTime) / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

/* ─────────────────────────────────────────────
   § 6  摄像头
───────────────────────────────────────────── */
async function _startCamera(facing) {
    try {
        if (VideoCallState.localStream) {
            VideoCallState.localStream.getTracks().forEach(t => t.stop());
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: facing ? 'user' : 'environment' },
            audio: false
        });
        VideoCallState.localStream = stream;
        const vid = document.getElementById('vc-local-video');
        if (vid) { vid.srcObject = stream; vid.play().catch(() => {}); }
        // 隐藏静态头像，显示视频
        const pip = document.getElementById('vc-pip-img');
        if (pip) pip.style.display = 'none';
        if (vid) vid.style.display = 'block';
        VideoCallState.isCameraOn = true;
    } catch (e) {
        console.warn('[VideoCall] Camera failed:', e);
    }
}
function _stopCamera() {
    if (VideoCallState.localStream) {
        VideoCallState.localStream.getTracks().forEach(t => t.stop());
        VideoCallState.localStream = null;
    }
    VideoCallState.isCameraOn = false;
    const vid = document.getElementById('vc-local-video');
    const pip = document.getElementById('vc-pip-img');
    if (vid) { vid.srcObject = null; vid.style.display = 'none'; }
    if (pip) pip.style.display = 'block';
}

/* ─────────────────────────────────────────────
   § 7  UI 构建
───────────────────────────────────────────── */

/** 构建通话信息栏（记忆/世界书/人设标签） */
function _buildInfoStrip(chatId) {
    const friend = (typeof friendsData !== 'undefined') ? (friendsData[chatId] || {}) : {};
    const cs      = friend.chatSettings || {};
    const memLimit = cs.memoryLimit || 20;
    const summaryCount = (friend.summaries || []).length;

    const wbCount = (() => {
        if (typeof worldBooks === 'undefined') return 0;
        const ids = Array.isArray(friend.worldbook) ? friend.worldbook : (friend.worldbook ? [friend.worldbook] : []);
        return ids.length + worldBooks.filter(b => b.global).length;
    })();

    const hasUserPersona = (() => {
        if (typeof personasMeta === 'undefined' || typeof currentPersonaId === 'undefined') return false;
        return !!(personasMeta[currentPersonaId] || {}).persona;
    })();

    const tags = [];
    tags.push(`<span class="vc-info-tag"><i class="fas fa-brain"></i> MEM·${memLimit}</span>`);
    if (summaryCount > 0)
        tags.push(`<span class="vc-info-tag"><i class="fas fa-scroll"></i> ${summaryCount}段记忆</span>`);
    if (wbCount > 0)
        tags.push(`<span class="vc-info-tag"><i class="fas fa-book"></i> WB·${wbCount}</span>`);
    if (hasUserPersona)
        tags.push(`<span class="vc-info-tag"><i class="fas fa-user"></i> 人设已读</span>`);

    return tags.join('');
}

/** 构建可视化通话 UI */
function _buildVisualUI(chatId) {
    const friend     = (typeof friendsData !== 'undefined') ? (friendsData[chatId] || {}) : {};
    const aiAvatar   = friend.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${chatId}`;
    const bgSrc      = friend.chatSettings?.callBg || aiAvatar;
    const aiName     = friend.remark || friend.realName || chatId;
    const mePersona  = (typeof personasMeta !== 'undefined' && typeof currentPersonaId !== 'undefined')
        ? (personasMeta[currentPersonaId] || {}) : {};
    const meAvatar   = mePersona.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=me`;
    const infoStrip  = _buildInfoStrip(chatId);

    return `
<div class="vc-visual-interface">
  <!-- AI 背景 -->
  <div class="vc-main-view">
    <img class="vc-main-img" id="vc-main-img" src="${bgSrc}" alt="">
  </div>

  <!-- PiP 用户画面 -->
  <div class="vc-pip" id="vc-pip" title="翻转摄像头" onclick="flipCallCamera()">
    <img id="vc-pip-img" src="${meAvatar}" alt="">
    <video id="vc-local-video" autoplay muted playsinline
           style="display:none;position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"></video>
  </div>

  <!-- 顶部信息栏 (名字在这里，不会和气泡重叠) -->
  <div class="vc-top-bar">
    <div class="vc-top-left">
      <div class="vc-top-name">${aiName}</div>
      <div class="vc-top-status">
        <div class="vc-status-dot"></div>
        <span id="vc-timer-display">00:00</span>
      </div>
    </div>
    <div class="vc-minimize-btn" onclick="minimizeVideoCall()" title="最小化">
      <i class="fas fa-compress-arrows-alt"></i>
    </div>
  </div>

  <!-- 侧边功能栏 -->
  <div class="vc-side-tools">
    <div class="vc-side-btn" onclick="changeCallBg()" title="更换背景">
      <i class="fas fa-image"></i>
    </div>
    <div class="vc-side-btn" onclick="rerollCallReply()" title="重新生成">
      <i class="fas fa-redo"></i>
    </div>
    <div class="vc-side-btn" onclick="flipCallCamera()" title="翻转">
      <i class="fas fa-sync-alt"></i>
    </div>
  </div>

  <!-- 记忆/世界书信息条 -->
  <div class="vc-info-strip">${infoStrip}</div>

  <!-- 消息区 (动作+讲话分离显示) -->
  <div class="vc-messages" id="vc-messages"></div>

  <!-- 控制按钮行 -->
  <div class="vc-controls">
    <div class="vc-ctrl-label">
      <div class="vc-ctrl-btn ${VideoCallState.isCameraOn ? 'active' : ''}"
           id="vc-cam-btn" onclick="toggleCallCamera()" title="摄像头">
        <i class="fas fa-video"></i>
      </div>
      <span>镜头</span>
    </div>
    <div class="vc-ctrl-label" style="margin: 0 20px;">
      <div class="vc-ctrl-btn end" onclick="hangUpCall()" title="挂断">
        <i class="fas fa-phone-slash"></i>
      </div>
    </div>
    <div class="vc-ctrl-label">
      <div class="vc-ctrl-btn ${VideoCallState.ttsEnabled ? 'active' : ''}"
           id="vc-tts-btn" onclick="toggleCallTTS()" title="语音播报">
        <i class="fas fa-volume-up"></i>
      </div>
      <span>语音</span>
    </div>
  </div>

  <!-- 输入栏 -->
  <div class="vc-input-row">
    <input type="text" id="vc-input" placeholder="说点什么…"
           onkeydown="if(event.key==='Enter'){event.preventDefault();sendCallMessage();}">
    <!-- 长按语音 -->
    <div class="vc-mic-btn" id="vc-mic-btn"
         onmousedown="startCallVoice(event)"  onmouseup="stopCallVoice(event)"
         ontouchstart="startCallVoice(event)" ontouchend="stopCallVoice(event)"
         ontouchcancel="stopCallVoice(event)"
         title="长按说话">
      <i class="fas fa-microphone"></i>
    </div>
    <!-- 发送 -->
    <div class="vc-input-btn vc-send-btn" onclick="sendCallMessage()" title="发送">
      <i class="fas fa-paper-plane"></i>
    </div>
  </div>
</div>
`;
}

/** 构建纯文字通话 UI */
function _buildTextUI(chatId, isGroup) {
    const friend   = (typeof friendsData !== 'undefined') ? (friendsData[chatId] || {}) : {};
    const aiName   = friend.remark || friend.realName || chatId;
    const aiAvatar = friend.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${chatId}`;
    const mePersona = (typeof personasMeta !== 'undefined' && typeof currentPersonaId !== 'undefined')
        ? (personasMeta[currentPersonaId] || {}) : {};
    const meAvatar  = mePersona.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=me`;
    const infoStrip = _buildInfoStrip(chatId);

    let avatarsHtml = '';
    if (isGroup && typeof groupsData !== 'undefined' && groupsData[chatId]) {
        groupsData[chatId].members.forEach(mid => {
            const mf = (typeof friendsData !== 'undefined') ? (friendsData[mid] || {}) : {};
            const av = mf.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${mid}`;
            const nm = mf.remark || mf.realName || mid;
            avatarsHtml += `<div class="vc-text-avatar"><img src="${av}"><span>${nm}</span></div>`;
        });
    } else {
        avatarsHtml = `<div class="vc-text-avatar main"><img src="${aiAvatar}"><span>${aiName}</span></div>`;
    }

    return `
<div class="vc-text-interface">
  <div class="vc-text-header">
    <div class="vc-avatars-grid">${avatarsHtml}</div>
    <div style="margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
      <div style="font-size: calc(10px * var(--font-scale));color:rgba(255,255,255,0.35);letter-spacing:1px;text-transform:uppercase;">
        <span id="vc-timer-display">00:00</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">${infoStrip}</div>
    </div>
    <div class="vc-end-btn-text" onclick="hangUpCall()" title="挂断">
      <i class="fas fa-phone-slash"></i>
    </div>
  </div>
  <div class="vc-messages" id="vc-messages" style="flex:1;overflow-y:auto;padding:14px;background:#0d0d0d;"></div>
  <div class="vc-input-row" style="position:static;background:#111;border-top:1px solid rgba(255,255,255,0.06);">
    <input type="text" id="vc-input" placeholder="说点什么…"
           onkeydown="if(event.key==='Enter'){event.preventDefault();sendCallMessage();}">
    <div class="vc-mic-btn" id="vc-mic-btn"
         onmousedown="startCallVoice(event)"  onmouseup="stopCallVoice(event)"
         ontouchstart="startCallVoice(event)" ontouchend="stopCallVoice(event)"
         ontouchcancel="stopCallVoice(event)" title="长按说话">
      <i class="fas fa-microphone"></i>
    </div>
    <div class="vc-input-btn vc-regen-btn" onclick="rerollCallReply()" title="重新生成">
      <i class="fas fa-redo"></i>
    </div>
    <div class="vc-input-btn vc-send-btn" onclick="sendCallMessage()" title="发送">
      <i class="fas fa-paper-plane"></i>
    </div>
    <div class="vc-input-btn" onclick="hangUpCall()" style="background:rgba(255,59,48,0.15);border-color:rgba(255,59,48,0.3);color:#ff3b30;" title="挂断">
      <i class="fas fa-phone-slash"></i>
    </div>
  </div>
</div>
`;
}

/* ─────────────────────────────────────────────
   § 8  通话启动 / 关闭
───────────────────────────────────────────── */

/** 启动通话界面（已接通） */
function _launchCallView(chatId, isGroup) {
    const view = document.getElementById('video-call-view');
    if (!view) return;

    // 读取聊天设置决定模式
    const friend = (typeof friendsData !== 'undefined') ? (friendsData[chatId] || {}) : {};
    const cs = friend.chatSettings || {};
    const mode = cs.videoCallMode || 'visual';

    VideoCallState.active   = true;
    VideoCallState.chatId   = chatId;
    VideoCallState.isGroup  = isGroup;
    VideoCallState.mode     = mode;
    VideoCallState.messages = [];
    VideoCallState.transcripts = [];
    _lastAiRow = null;

    // 建立 UI
    view.innerHTML = mode === 'visual'
        ? _buildVisualUI(chatId)
        : _buildTextUI(chatId, isGroup);

    view.classList.add('active');

    // 开启摄像头（可视模式且有设置）
    if (mode === 'visual' && cs.videoCallCamera) {
        VideoCallState.isFacingUser = true;
        _startCamera(true).then(() => {
            const btn = document.getElementById('vc-cam-btn');
            if (btn) btn.classList.add('active');
        });
    }

    // 开始计时
    _startTimer();

    // 发送 AI 开场白
    _sendCallAI('*刚刚接通视频，看着你的第一眼*', null);
}

/** 外部入口：用户主动发起视频 */
window.startVideoCall = async function(chatId, isGroup) {
    if (VideoCallState.active) return;

    // 隐藏悬浮球
    const bubble = document.getElementById('vc-floating-bubble');
    if (bubble) bubble.style.display = 'none';

    // 显示呼叫中提示
    const view = document.getElementById('video-call-view');
    if (!view) return;

    const friend = (typeof friendsData !== 'undefined') ? (friendsData[chatId] || {}) : {};
    const aiName   = friend.remark || friend.realName || chatId;
    const aiAvatar = friend.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${chatId}`;

    view.innerHTML = `
<div class="vc-calling-overlay">
  <img class="vc-calling-avatar" src="${aiAvatar}" alt="">
  <div class="vc-calling-name">${aiName}</div>
  <div class="vc-calling-status">呼叫中 · · ·</div>
  <div style="margin-top:40px;">
    <div class="vc-ctrl-btn end" onclick="hangUpCall()" title="取消" style="margin:auto;">
      <i class="fas fa-phone-slash"></i>
    </div>
  </div>
</div>`;
    view.classList.add('active');

    // 后台问 AI 是否接听
    const settingsJSON = localStorage.getItem('myCoolPhone_aiSettings');
    if (!settingsJSON) {
        setTimeout(() => { view.classList.remove('active'); }, 1500);
        return;
    }
    const settings = JSON.parse(settingsJSON);

    // 构建接听判断 prompt
    const acceptPrompt = `[HIDDEN SYSTEM COMMAND]
The user is calling you via video call. Based on your current mood and persona, decide whether to answer.
Your persona: ${friend.persona || ''}

Reply with EXACTLY one word (no punctuation): ACCEPT or REJECT`;

    let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
    const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

    try {
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
            body: JSON.stringify({
                model:    settings.model,
                messages: [{ role: 'user', content: acceptPrompt }],
                temperature: 0.7, max_tokens: 10
            })
        });
        const data  = await res.json();
        const reply = (data?.choices?.[0]?.message?.content || '').trim().toUpperCase();

        if (reply.includes('REJECT')) {
            // AI 拒绝
            view.innerHTML = `
<div class="vc-calling-overlay">
  <img class="vc-calling-avatar" src="${aiAvatar}" alt="" style="filter:grayscale(0.5);">
  <div class="vc-calling-name">${aiName}</div>
  <div class="vc-calling-status" style="color:rgba(255,80,80,0.7);">未接听</div>
  <div style="margin-top:30px;font-size: calc(11px * var(--font-scale));color:rgba(255,255,255,0.3);">对方现在无法接听</div>
</div>`;
            setTimeout(() => { view.classList.remove('active'); }, 2200);
            // 发一条文字消息
            setTimeout(() => {
                if (typeof sendMessageToAI === 'function' && typeof currentChatId !== 'undefined' && currentChatId === chatId) {
                    sendMessageToAI('[System: You just missed the user\'s video call. Send a short message explaining why you couldn\'t answer.]');
                }
            }, 2500);
        } else {
            // 接听
            _launchCallView(chatId, isGroup || false);
        }
    } catch (e) {
        // 网络失败就直接接
        _launchCallView(chatId, isGroup || false);
    }
};

/** AI 主动来电 */
window.checkForVideoCallRequest = function(aiReply, chatId) {
    const tagRe = /\[VIDEO_CALL_REQUEST\]/i;
    if (!tagRe.test(aiReply)) return aiReply;

    const clean = aiReply.replace(tagRe, '').trim();

    const friend = (typeof friendsData !== 'undefined') ? (friendsData[chatId] || {}) : {};
    const aiName   = friend.remark || friend.realName || chatId;
    const aiAvatar = friend.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${chatId}`;

    // 显示来电弹窗
    const overlay = document.getElementById('incoming-call-overlay');
    if (overlay) {
        overlay.innerHTML = `
<div class="ic-avatar-ring"><img src="${aiAvatar}" alt=""></div>
<div class="ic-name">${aiName}</div>
<div class="ic-subtitle">视频通话邀请</div>
<div class="ic-actions">
  <div class="ic-btn reject" onclick="rejectIncomingCall()"><i class="fas fa-phone-slash"></i></div>
  <div class="ic-btn accept" onclick="acceptIncomingCall('${chatId}')"><i class="fas fa-video"></i></div>
</div>`;
        overlay.classList.add('active');
        // 铃声
        _startRinging();
    }

    return clean;
};

window.acceptIncomingCall = function(chatId) {
    _stopRinging();
    const overlay = document.getElementById('incoming-call-overlay');
    if (overlay) overlay.classList.remove('active');
    _launchCallView(chatId || VideoCallState.chatId, false);
};

window.rejectIncomingCall = function() {
    _stopRinging();
    const overlay = document.getElementById('incoming-call-overlay');
    if (overlay) overlay.classList.remove('active');
};

function _startRinging() {
    try {
        if (_ringAudio) return;
        _ringAudio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAA' +
            'EAAQARAAIAAgADABAAAAACAAAAAAAAAAAAAAAAAA');
        _ringAudio.loop = true;
        _ringAudio.play().catch(() => {});
    } catch (e) {}
}
function _stopRinging() {
    if (_ringAudio) { _ringAudio.pause(); _ringAudio = null; }
}

/* ─────────────────────────────────────────────
   § 9  挂断
───────────────────────────────────────────── */
window.hangUpCall = async function() {
    if (!VideoCallState.active && !document.getElementById('video-call-view')?.classList.contains('active')) {
        // 取消来电状态
        _stopRinging();
        const overlay = document.getElementById('incoming-call-overlay');
        if (overlay) overlay.classList.remove('active');
        const view = document.getElementById('video-call-view');
        if (view) view.classList.remove('active');
        return;
    }

    const duration  = _getElapsedStr();
    const chatId    = VideoCallState.chatId;

    // ── 先快照，再清空 ──
    const savedTranscript = VideoCallState.transcripts.join('\n');
    const savedChatId     = chatId;

    // 停止摄像头
    _stopCamera();
    // 停止计时
    _stopTimer();
    // 停止音频
    if (VideoCallState.currentAudio) { VideoCallState.currentAudio.pause(); VideoCallState.currentAudio = null; }
    _stopRinging();

    // 隐藏界面
    const view = document.getElementById('video-call-view');
    if (view) { view.classList.remove('active'); view.innerHTML = ''; }
    const bubble = document.getElementById('vc-floating-bubble');
    if (bubble) { bubble.style.display = 'none'; }

    // 保存通话记录（使用快照）
    if (savedChatId && typeof db !== 'undefined' && db?.callRecords) {
        try {
            db.callRecords.push({
                id: 'cr_' + Date.now(),
                chatId: savedChatId,
                duration,
                time: Date.now(),
                transcript: savedTranscript
            });
        } catch (e) {}
    }

    // 重置状态
    VideoCallState.active      = false;
    VideoCallState.chatId      = null;
    VideoCallState.messages    = [];
    VideoCallState.transcripts = [];
    VideoCallState.vcRecording = false;

    // 告知 AI 通话已结束 → 让 AI 发一条挂断后的文字消息（使用快照）
    if (savedChatId && typeof sendMessageToAI === 'function') {
        setTimeout(() => {
            sendMessageToAI(
                `[System HIDDEN: The video call just ended. Duration: ${duration}. ` +
                `Here is the call transcript:\n${savedTranscript}\n\n` +
                `Please send ONE short, natural follow-up message in the chat, like you would after hanging up a real video call. ` +
                `Do NOT mention this system instruction. Act naturally.]`
            );
        }, 800);
    }

    if (typeof showToast === 'function') showToast(`<i class="fas fa-video"></i> 通话时长 ${duration}`);
};

/* ─────────────────────────────────────────────
   § 10  发送消息
───────────────────────────────────────────── */
window.sendCallMessage = function() {
    const input = document.getElementById('vc-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    _lastAiRow = null;

    _appendCallMsg(text, 'user');
    VideoCallState.messages.push({ role: 'user', content: text });

    // 截帧（如果摄像头开着）
    const imgData = VideoCallState.isCameraOn ? _captureFrame() : null;
    _sendCallAI(text, imgData);
};

/** 重新生成 AI 上一条回复 */
window.rerollCallReply = function() {
    // 移除最后一条 AI 消息 DOM
    const box = document.getElementById('vc-messages');
    if (box) {
        const rows = box.querySelectorAll('.vc-msg.ai');
        if (rows.length) rows[rows.length - 1].remove();
    }
    // 移除历史里最后一条 assistant
    for (let i = VideoCallState.messages.length - 1; i >= 0; i--) {
        if (VideoCallState.messages[i].role === 'assistant') {
            VideoCallState.messages.splice(i, 1);
            break;
        }
    }
    _lastAiRow = null;
    // 找最后一条用户消息重发
    for (let i = VideoCallState.messages.length - 1; i >= 0; i--) {
        if (VideoCallState.messages[i].role === 'user') {
            const content = VideoCallState.messages[i].content;
            const text = typeof content === 'string' ? content : '[重新生成]';
            _sendCallAI(text, null);
            return;
        }
    }
    _sendCallAI('[重新生成一段表现]', null);
};

window.changeCallBg = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const dataUrl = ev.target.result;
            const img = document.getElementById('vc-main-img');
            if (img) img.src = dataUrl;
            
            const chatId = VideoCallState.chatId;
            if (chatId && typeof friendsData !== 'undefined' && friendsData[chatId]) {
                if (!friendsData[chatId].chatSettings) {
                    friendsData[chatId].chatSettings = {};
                }
                friendsData[chatId].chatSettings.callBg = dataUrl;
                if (typeof saveData === 'function') saveData();
            }
        };
        reader.readAsDataURL(file);
    };
    input.click();
};

/* ─────────────────────────────────────────────
   § 11  摄像头控制
───────────────────────────────────────────── */
window.toggleCallCamera = function() {
    if (VideoCallState.isCameraOn) {
        _stopCamera();
        const btn = document.getElementById('vc-cam-btn');
        if (btn) btn.classList.remove('active');
    } else {
        _startCamera(VideoCallState.isFacingUser).then(() => {
            const btn = document.getElementById('vc-cam-btn');
            if (btn) btn.classList.add('active');
        });
    }
};

window.flipCallCamera = function() {
    VideoCallState.isFacingUser = !VideoCallState.isFacingUser;
    if (VideoCallState.isCameraOn) {
        _startCamera(VideoCallState.isFacingUser);
    }
};

/* ─────────────────────────────────────────────
   § 12  TTS 开关
───────────────────────────────────────────── */
window.toggleCallTTS = function() {
    VideoCallState.ttsEnabled = !VideoCallState.ttsEnabled;
    const btn = document.getElementById('vc-tts-btn');
    if (btn) {
        btn.classList.toggle('active', VideoCallState.ttsEnabled);
    }
    if (typeof showToast === 'function') {
        showToast(VideoCallState.ttsEnabled ? '语音播报已开启' : '语音播报已关闭');
    }
};

/* ─────────────────────────────────────────────
   § 13  最小化 / 悬浮球
───────────────────────────────────────────── */
window.minimizeVideoCall = function() {
    const view   = document.getElementById('video-call-view');
    const bubble = document.getElementById('vc-floating-bubble');
    if (!view || !bubble) return;

    VideoCallState.minimized = true;
    view.style.display = 'none';

    bubble.style.display = 'flex';
    bubble.innerHTML = `<i class="fas fa-video"></i>`;

    // 拖拽
    _makeDraggable(bubble);
};

window.restoreVideoCall = function() {
    const view   = document.getElementById('video-call-view');
    const bubble = document.getElementById('vc-floating-bubble');
    if (!view || !bubble) return;
    VideoCallState.minimized = false;
    view.style.display = '';
    bubble.style.display = 'none';
};

function _makeDraggable(el) {
    let startX, startY, origLeft, origBottom;
    const onStart = (e) => {
        const point = e.touches ? e.touches[0] : e;
        startX = point.clientX;
        startY = point.clientY;
        const rect = el.getBoundingClientRect();
        origLeft   = rect.left;
        origBottom = window.innerHeight - rect.bottom;
        el.style.transition = 'none';
    };
    const onMove = (e) => {
        const point = e.touches ? e.touches[0] : e;
        const dx = point.clientX - startX;
        const dy = point.clientY - startY;
        const newLeft   = Math.max(4, Math.min(window.innerWidth  - el.offsetWidth  - 4, origLeft   + dx));
        const newBottom = Math.max(4, Math.min(window.innerHeight - el.offsetHeight - 4, origBottom - dy));
        el.style.left   = newLeft   + 'px';
        el.style.bottom = newBottom + 'px';
        el.style.right  = 'auto';
    };
    const onEnd = () => { el.style.transition = ''; };

    el.removeEventListener('mousedown',  onStart);
    el.removeEventListener('touchstart', onStart);
    el.addEventListener('mousedown',  onStart, { passive: true });
    el.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('mouseup',  onEnd);
    document.addEventListener('touchend', onEnd);
}

/* ─────────────────────────────────────────────
   § 14  长按语音输入
───────────────────────────────────────────── */
window.startCallVoice = async function(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (VideoCallState.vcRecording) return;
    VideoCallState.vcRecording = true;
    VideoCallState.vcRecText   = '';

    const btn   = document.getElementById('vc-mic-btn');
    const input = document.getElementById('vc-input');
    if (btn)   btn.classList.add('recording');
    if (input) { input.placeholder = '录音中…'; input.classList.add('vc-recording-active'); }

    try {
        // 麦克风流（用于实际录音 blob）
        VideoCallState.vcMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        VideoCallState.vcMediaRecorder = new MediaRecorder(VideoCallState.vcMediaStream);
        VideoCallState.vcMediaRecorder.start();

        // 浏览器原生语音识别（免费）
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SR) {
            VideoCallState.vcRecognition = new SR();
            VideoCallState.vcRecognition.lang = 'zh-CN';
            VideoCallState.vcRecognition.continuous = true;
            VideoCallState.vcRecognition.interimResults = true;
            VideoCallState.vcRecognition.onresult = (ev) => {
                let fin = '', interim = '';
                for (let i = ev.resultIndex; i < ev.results.length; i++) {
                    if (ev.results[i].isFinal) fin += ev.results[i][0].transcript;
                    else interim += ev.results[i][0].transcript;
                }
                VideoCallState.vcRecText = fin + interim;
                if (input && VideoCallState.vcRecText) {
                    input.placeholder = VideoCallState.vcRecText.length > 14
                        ? VideoCallState.vcRecText.slice(0, 14) + '…'
                        : VideoCallState.vcRecText;
                }
            };
            VideoCallState.vcRecognition.start();
        }
    } catch (err) {
        VideoCallState.vcRecording = false;
        if (btn)   btn.classList.remove('recording');
        if (input) { input.placeholder = '说点什么…'; input.classList.remove('vc-recording-active'); }
        console.warn('[VideoCall] Mic error:', err);
    }
};

window.stopCallVoice = async function(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!VideoCallState.vcRecording) return;
    VideoCallState.vcRecording = false;

    const btn   = document.getElementById('vc-mic-btn');
    const input = document.getElementById('vc-input');
    if (btn)   btn.classList.remove('recording');
    if (input) { input.placeholder = '说点什么…'; input.classList.remove('vc-recording-active'); }

    // 停止识别
    if (VideoCallState.vcRecognition) {
        try { VideoCallState.vcRecognition.stop(); } catch (_) {}
        VideoCallState.vcRecognition = null;
    }
    // 停止录音器
    if (VideoCallState.vcMediaRecorder && VideoCallState.vcMediaRecorder.state !== 'inactive') {
        VideoCallState.vcMediaRecorder.stop();
    }

    // 等识别回调最终化
    await new Promise(r => setTimeout(r, 550));

    const text = VideoCallState.vcRecText.trim();

    // 清理媒体流
    if (VideoCallState.vcMediaStream) {
        VideoCallState.vcMediaStream.getTracks().forEach(t => t.stop());
        VideoCallState.vcMediaStream = null;
    }
    VideoCallState.vcMediaRecorder = null;
    VideoCallState.vcRecText       = '';

    if (!text) return;

    // 发送识别出的内容
    _lastAiRow = null;
    _appendCallMsg(text, 'user');
    VideoCallState.messages.push({ role: 'user', content: text });

    const imgData = VideoCallState.isCameraOn ? _captureFrame() : null;
    _sendCallAI(text, imgData);
};

/* ─────────────────────────────────────────────
   § 15  工具栏入口 (聊天界面视频按钮)
───────────────────────────────────────────── */
window.openVideoCallFromChat = function() {
    const chatId  = (typeof currentChatId   !== 'undefined') ? currentChatId   : null;
    const isGroup = (typeof currentChatType !== 'undefined') ? (currentChatType === 'group') : false;
    if (!chatId) return;

    startVideoCall(chatId, isGroup);
};
