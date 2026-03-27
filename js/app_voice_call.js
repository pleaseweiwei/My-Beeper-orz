// ============================================
// js/app_voice_call.js — 语音 & 视频通话模块
// ============================================

// --- 全局状态 ---
const VideoCallState = {
    active: false,
    chatId: null,
    startTime: null,
    timer: null,
    isMinimized: false,
    cameraStream: null,
    isCameraOn: false,
    isFrontCam: true,
    isVoiceEnabled: false, // TTS朗读开关
    callType: 'single',    // 'single' | 'group'
    groupMembers: [],
    messages: [],          // 通话中的消息记录
    mode: 'visual',        // 'visual' | 'text'
};

// 铃声 & 通知音播放器
let ringtonePlayer = null;
let notifPlayer = null;
let keepAliveAudio = null;

// ─── 初始化音效 ─────────────────────────────
function initAudioPlayers() {
    // 来电铃声（用 Web Audio API 合成简单铃声，无需外部文件）
    ringtonePlayer = { play: () => playBeep(880, 0.3, 0.8, 3), stop: () => stopBeep() };
    notifPlayer    = { play: () => playBeep(1047, 0.15, 0.1, 1) };

    // 后台保活静音音轨
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
            const ctx = new AudioCtx();
            const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.loop = true;
            src.connect(ctx.destination);
            // 只在用户交互后解锁
            document.addEventListener('click', () => { if (ctx.state === 'suspended') ctx.resume(); }, { once: true });
        }
    } catch(e) {}
}

let beepInterval = null;
function playBeep(freq = 880, vol = 0.3, dur = 0.5, times = 3) {
    stopBeep();
    let count = 0;
    const doBeep = () => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(vol, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
            osc.start(); osc.stop(ctx.currentTime + dur);
            setTimeout(() => ctx.close(), (dur + 0.1) * 1000);
        } catch(e) {}
        count++;
        if (count >= times) stopBeep();
    };
    doBeep();
    beepInterval = setInterval(doBeep, (dur + 0.3) * 1000);
}
function stopBeep() {
    if (beepInterval) { clearInterval(beepInterval); beepInterval = null; }
}

document.addEventListener('DOMContentLoaded', initAudioPlayers);

// ─── 发起通话 ────────────────────────────────
window.startVideoCall = function(chatId, type = 'single', members = []) {
    if (VideoCallState.active) return;
    if (!chatId && !currentChatId) { alert('请先进入聊天再发起通话'); return; }

    const id = chatId || currentChatId;
    const friend = friendsData[id];
    if (!friend && type === 'single') { alert('找不到该好友'); return; }

    // 决定使用哪种通话模式
    const mode = (friend && friend.chatSettings && friend.chatSettings.callMode === 'text') ? 'text' : 'visual';

    VideoCallState.active   = true;
    VideoCallState.chatId   = id;
    VideoCallState.callType = type;
    VideoCallState.groupMembers = members;
    VideoCallState.mode     = mode;
    VideoCallState.messages = [];
    VideoCallState.isMinimized = false;

    _showVideoCallUI(id, type, members, mode);
}

// ─── AI 主动发起来电 ─────────────────────────
window.triggerIncomingCall = function(chatId) {
    if (VideoCallState.active) return;
    const friend = friendsData[chatId];
    if (!friend) return;

    const overlay = document.getElementById('incoming-call-overlay');
    if (!overlay) return;

    document.getElementById('ic-avatar').src = friend.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.realName}`;
    document.getElementById('ic-name').innerText = friend.remark || friend.realName;
    overlay.classList.add('active');
    overlay.setAttribute('data-caller-id', chatId);

    ringtonePlayer.play();

    // 15秒无人接听自动挂断
    overlay._autoReject = setTimeout(() => rejectIncomingCall(), 15000);
}

window.acceptIncomingCall = function() {
    const overlay = document.getElementById('incoming-call-overlay');
    if (!overlay) return;
    const callerId = overlay.getAttribute('data-caller-id');
    clearTimeout(overlay._autoReject);
    overlay.classList.remove('active');
    stopBeep();
    startVideoCall(callerId);
}

window.rejectIncomingCall = function() {
    const overlay = document.getElementById('incoming-call-overlay');
    if (!overlay) return;
    clearTimeout(overlay._autoReject);
    overlay.classList.remove('active');
    stopBeep();

    const callerId = overlay.getAttribute('data-caller-id');
    if (callerId && friendsData[callerId]) {
        const name = friendsData[callerId].remark || friendsData[callerId].realName;
        if (typeof showToast === 'function') showToast(`已拒绝 ${name} 的来电`);
    }
}

// ─── 构建通话界面 ─────────────────────────────
function _showVideoCallUI(id, type, members, mode) {
    const container = document.getElementById('video-call-view');
    if (!container) return;

    const friend = friendsData[id] || {};
    const myPersona = typeof personasMeta !== 'undefined' ? (personasMeta[currentPersonaId] || {}) : {};
    const friendAvatar = friend.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.realName || id}`;
    const myAvatar = myPersona.avatar || 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=200&auto=format&fit=crop';
    const friendName = friend.remark || friend.realName || id;

    if (mode === 'visual') {
        container.innerHTML = `
        <div class="vc-visual-interface" id="vc-visual">
            <!-- 大图：对方 -->
            <div class="vc-main-view" id="vc-main-view">
                <img src="${friendAvatar}" id="vc-main-img" class="vc-main-img">
                <video id="vc-main-video" class="vc-main-video" autoplay muted style="display:none;"></video>
                <div class="vc-main-overlay">
                    <span id="vc-main-name">${friendName}</span>
                </div>
            </div>
            <!-- 画中画：自己 -->
            <div class="vc-pip" id="vc-pip" onclick="switchVideoViews()">
                <img src="${myAvatar}" id="vc-pip-img">
                <video id="vc-pip-video" class="vc-pip-video" autoplay muted style="display:none;"></video>
            </div>
            <!-- 顶部状态 -->
            <div class="vc-top-bar">
                <div class="vc-status-dot"></div>
                <span id="vc-timer-display">00:00</span>
                <i class="fas fa-compress-alt" onclick="minimizeVideoCall()"></i>
            </div>
            <!-- 消息区域 -->
            <div class="vc-messages" id="vc-messages"></div>
            <!-- 底部控制 -->
            <div class="vc-controls">
                <div class="vc-ctrl-btn ${VideoCallState.isCameraOn ? 'active' : ''}" onclick="toggleCallCamera()" id="vc-btn-cam">
                    <i class="fas fa-video"></i>
                </div>
                <div class="vc-ctrl-btn" onclick="handleCameraFlip()" id="vc-btn-flip">
                    <i class="fas fa-sync-alt"></i>
                </div>
                <div class="vc-ctrl-btn ${VideoCallState.isVoiceEnabled ? 'active' : ''}" onclick="toggleCallVoice()" id="vc-btn-voice">
                    <i class="fas fa-volume-up"></i>
                </div>
                <div class="vc-ctrl-btn end" onclick="endVideoCall()">
                    <i class="fas fa-phone-slash"></i>
                </div>
            </div>
            <!-- 输入区 -->
            <div class="vc-input-row">
                <button class="vc-regen-btn" onclick="regenLastCallMsg()" title="重回上一条">
                    <i class="fas fa-undo"></i>
                </button>
                <input type="text" id="vc-input" placeholder="说点什么…" onkeydown="if(event.key==='Enter'){event.preventDefault();sendCallMessage();}">
                <button onclick="sendCallMessage()"><i class="fas fa-paper-plane"></i></button>
            </div>
        </div>`;
    } else {
        // 纯文字/头像模式
        let membersHtml = '';
        if (type === 'group') {
            members.forEach(mid => {
                const mf = friendsData[mid] || {};
                const ma = mf.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${mf.realName || mid}`;
                membersHtml += `<div class="vc-text-avatar"><img src="${ma}"><span>${mf.remark || mf.realName || mid}</span></div>`;
            });
        } else {
            membersHtml = `<div class="vc-text-avatar main"><img src="${friendAvatar}"><span>${friendName}</span></div>`;
        }
        container.innerHTML = `
        <div class="vc-text-interface">
            <div class="vc-text-header">
                <i class="fas fa-compress-alt" onclick="minimizeVideoCall()" style="cursor:pointer;padding:10px;"></i>
                <div class="vc-avatars-grid">${membersHtml}</div>
                <span id="vc-timer-display">00:00</span>
                <i class="fas fa-phone-slash vc-end-btn" onclick="endVideoCall()"></i>
            </div>
            <div class="vc-messages" id="vc-messages"></div>
            <div class="vc-input-row">
                <button class="vc-regen-btn" onclick="regenLastCallMsg()"><i class="fas fa-undo"></i></button>
                <input type="text" id="vc-input" placeholder="说点什么…" onkeydown="if(event.key==='Enter'){event.preventDefault();sendCallMessage();}">
                <button onclick="sendCallMessage()"><i class="fas fa-paper-plane"></i></button>
            </div>
        </div>`;
    }

    container.classList.add('active');
    _startCallTimer();

    // AI 接听反应
    setTimeout(() => {
        _sendCallAI('[通话开始]用户接通了视频通话，请给出符合人设的第一句话（带动作描写）。');
    }, 800);
}

// ─── 计时器 ──────────────────────────────────
function _startCallTimer() {
    VideoCallState.startTime = Date.now();
    VideoCallState.timer = setInterval(() => {
        const el = document.getElementById('vc-timer-display');
        if (!el) return;
        const secs = Math.floor((Date.now() - VideoCallState.startTime) / 1000);
        const m = String(Math.floor(secs / 60)).padStart(2, '0');
        const s = String(secs % 60).padStart(2, '0');
        el.innerText = `${m}:${s}`;
    }, 1000);
}

// ─── 发送消息（通话中）───────────────────────
window.sendCallMessage = function() {
    const input = document.getElementById('vc-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    _appendCallMsg(text, 'user');
    VideoCallState.messages.push({ role: 'user', content: text });

    // 如果是可视化模式且摄像头开着，截帧加入
    let imgData = null;
    if (VideoCallState.mode === 'visual' && VideoCallState.isCameraOn) {
        imgData = captureVideoFrame();
    }
    _sendCallAI(text, imgData);
}

function _appendCallMsg(text, role, avatar) {
    const container = document.getElementById('vc-messages');
    if (!container) return;
    const div = document.createElement('div');
    div.className = `vc-msg ${role}`;
    const friend = friendsData[VideoCallState.chatId] || {};
    const senderAvatar = role === 'ai'
        ? (avatar || friend.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.realName}`)
        : (typeof AVATAR_USER !== 'undefined' ? AVATAR_USER : '');
    div.innerHTML = `
        ${role === 'ai' ? `<img src="${senderAvatar}" class="vc-msg-avatar">` : ''}
        <div class="vc-msg-bubble">${text.replace(/\*(.*?)\*/g, '<i>*$1*</i>').replace(/\n/g, '<br>')}</div>
        ${role === 'user' ? `<img src="${senderAvatar}" class="vc-msg-avatar">` : ''}
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ─── AI 通话回复 ─────────────────────────────
async function _sendCallAI(userText, imageBase64 = null) {
    const friend = friendsData[VideoCallState.chatId] || {};
    const settingsJSON = localStorage.getItem('myCoolPhone_aiSettings');
    if (!settingsJSON) return;
    const settings = JSON.parse(settingsJSON);

    const systemPrompt = `你正在和用户进行【视频通话】。
角色名：${friend.realName || '助手'}
人设：${friend.persona || '友好的AI'}
规则：
1. 每次回复必须包含【动作/神态描写】用星号包裹，如：*轻轻笑了笑*
2. 回复必须短而自然，最多50字，模拟真实视频通话的口语风格
3. 你"能看到"用户的画面，如果有图像信息就基于图像做出反应
4. 不要用分点列表，用自然口语
5. 只回复通话中的内容，不要输出状态块
`;
    let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
    const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

    // 构建消息
    const historyMsgs = VideoCallState.messages.slice(-8).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
    }));

    let userContent = userText;
    if (imageBase64) {
        userContent = [
            { type: 'text', text: userText },
            { type: 'image_url', image_url: { url: imageBase64 } }
        ];
    }

    const payload = {
        model: settings.model,
        messages: [
            { role: 'system', content: systemPrompt },
            ...historyMsgs,
            { role: 'user', content: userContent }
        ],
        temperature: 0.85
    };

    // Loading
    const loadId = 'vc-load-' + Date.now();
    const container = document.getElementById('vc-messages');
    if (container) {
        const loadDiv = document.createElement('div');
        loadDiv.className = 'vc-msg ai'; loadDiv.id = loadId;
        const friend2 = friendsData[VideoCallState.chatId] || {};
        const av = friend2.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend2.realName}`;
        loadDiv.innerHTML = `<img src="${av}" class="vc-msg-avatar"><div class="vc-msg-bubble"><i class="fas fa-circle-notch fa-spin"></i></div>`;
        container.appendChild(loadDiv);
        container.scrollTop = container.scrollHeight;
    }

    try {
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
            body: JSON.stringify(payload)
        });
        document.getElementById(loadId)?.remove();
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const reply = data?.choices?.[0]?.message?.content || '';
        if (!reply) return;

        VideoCallState.messages.push({ role: 'assistant', content: reply });
        _appendCallMsg(reply, 'ai');
        notifPlayer.play();

        // TTS 朗读
        if (VideoCallState.isVoiceEnabled) {
            const pureText = reply.replace(/\*.*?\*/g, '').trim();
            if (pureText) _callTTS(pureText, settings, friend.chatSettings || {});
        }
    } catch (e) {
        document.getElementById(loadId)?.remove();
        console.error('通话AI失败:', e);
    }
}

// ─── 通话TTS ─────────────────────────────────
async function _callTTS(text, settings, chatSettings) {
    try {
        const groupId = settings.voiceGroupId || settings.groupId || '';
        const apiKey = settings.voiceApiKey || settings.apiKey || '';
        if (!apiKey || !groupId) return;

        const isGlobal = settings.provider === 'minimax_global';
        const url = isGlobal
            ? `https://api.minimaxi.com/v1/t2a_v2?GroupId=${groupId}`
            : `https://api.minimax.chat/v1/t2a_v2?GroupId=${groupId}`;

        const voiceId = chatSettings.voiceId || 'female-shaonv';
        const payload = {
            model: 'speech-01-turbo', text,
            voice_setting: { voice_id: voiceId, speed: chatSettings.voiceSpeed || 1.0, vol: 1.0, pitch: 0 },
            audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 }
        };
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify(payload)
        });
        if (!res.ok) return;
        const blob = await res.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audio.play();
    } catch(e) { console.warn('通话TTS失败:', e); }
}

// ─── 截取摄像头帧 ────────────────────────────
function captureVideoFrame() {
    const video = document.getElementById('vc-pip-video') || document.getElementById('vc-main-video');
    if (!video || video.readyState < 2) return null;
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 320; canvas.height = 240;
        canvas.getContext('2d').drawImage(video, 0, 0, 320, 240);
        return canvas.toDataURL('image/jpeg', 0.7);
    } catch(e) { return null; }
}

// ─── 摄像头控制 ──────────────────────────────
window.toggleCallCamera = async function() {
    if (VideoCallState.isCameraOn) {
        // 关闭摄像头
        if (VideoCallState.cameraStream) {
            VideoCallState.cameraStream.getTracks().forEach(t => t.stop());
            VideoCallState.cameraStream = null;
        }
        VideoCallState.isCameraOn = false;
        const pipVideo = document.getElementById('vc-pip-video');
        const pipImg   = document.getElementById('vc-pip-img');
        if (pipVideo) { pipVideo.style.display = 'none'; pipVideo.srcObject = null; }
        if (pipImg) pipImg.style.display = 'block';
        document.getElementById('vc-btn-cam')?.classList.remove('active');
    } else {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: VideoCallState.isFrontCam ? 'user' : 'environment' }, audio: false });
            VideoCallState.cameraStream = stream;
            VideoCallState.isCameraOn = true;
            const pipVideo = document.getElementById('vc-pip-video');
            const pipImg   = document.getElementById('vc-pip-img');
            if (pipVideo) { pipVideo.srcObject = stream; pipVideo.style.display = 'block'; }
            if (pipImg) pipImg.style.display = 'none';
            document.getElementById('vc-btn-cam')?.classList.add('active');
        } catch(e) { alert('无法访问摄像头：' + e.message); }
    }
}

window.handleCameraFlip = async function() {
    VideoCallState.isFrontCam = !VideoCallState.isFrontCam;
    if (VideoCallState.isCameraOn) {
        VideoCallState.isCameraOn = false;
        await toggleCallCamera();
    }
}

// ─── 切换大小屏 ──────────────────────────────
window.switchVideoViews = function() {
    const mainImg   = document.getElementById('vc-main-img');
    const mainVideo = document.getElementById('vc-main-video');
    const pipImg    = document.getElementById('vc-pip-img');
    const pipVideo  = document.getElementById('vc-pip-video');
    if (!mainImg || !pipImg) return;
    const tmpSrc = mainImg.src;
    mainImg.src = pipImg.src;
    pipImg.src = tmpSrc;
}

// ─── TTS 开关 ────────────────────────────────
window.toggleCallVoice = function() {
    VideoCallState.isVoiceEnabled = !VideoCallState.isVoiceEnabled;
    const btn = document.getElementById('vc-btn-voice');
    if (btn) btn.classList.toggle('active', VideoCallState.isVoiceEnabled);
    if (typeof showToast === 'function') showToast(`语音接入：${VideoCallState.isVoiceEnabled ? 'ON' : 'OFF'}`);
}

// ─── 最小化 / 悬浮球 ─────────────────────────
window.minimizeVideoCall = function() {
    VideoCallState.isMinimized = true;
    document.getElementById('video-call-view')?.classList.remove('active');
    const bubble = document.getElementById('vc-floating-bubble');
    if (bubble) bubble.style.display = 'flex';
    _makeDraggable(bubble);
}

window.restoreVideoCall = function() {
    VideoCallState.isMinimized = false;
    document.getElementById('vc-floating-bubble').style.display = 'none';
    document.getElementById('video-call-view')?.classList.add('active');
}

function _makeDraggable(el) {
    if (!el) return;
    let startX, startY, initL, initT;
    const onDown = (e) => {
        const touch = e.touches ? e.touches[0] : e;
        startX = touch.clientX; startY = touch.clientY;
        initL  = el.offsetLeft; initT  = el.offsetTop;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchend', onUp);
    };
    const onMove = (e) => {
        e.preventDefault();
        const touch = e.touches ? e.touches[0] : e;
        el.style.left = (initL + touch.clientX - startX) + 'px';
        el.style.top  = (initT + touch.clientY - startY) + 'px';
    };
    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchend', onUp);
    };
    el.addEventListener('mousedown', onDown);
    el.addEventListener('touchstart', onDown, { passive: false });
}

// ─── 重Roll ──────────────────────────────────
window.regenLastCallMsg = function() {
    // 删除最后一条 AI 回复
    const msgs = document.querySelectorAll('#vc-messages .vc-msg.ai');
    if (msgs.length === 0) return;
    msgs[msgs.length - 1].remove();
    VideoCallState.messages = VideoCallState.messages.filter((m, i) =>
        !(m.role === 'assistant' && i === VideoCallState.messages.length - 1)
    );
    // 重新触发
    const lastUser = [...VideoCallState.messages].reverse().find(m => m.role === 'user');
    if (lastUser) _sendCallAI(lastUser.content);
}

// ─── 挂断通话 ────────────────────────────────
window.endVideoCall = async function() {
    if (!VideoCallState.active) return;

    // 停止摄像头
    if (VideoCallState.cameraStream) {
        VideoCallState.cameraStream.getTracks().forEach(t => t.stop());
        VideoCallState.cameraStream = null;
    }
    VideoCallState.isCameraOn = false;

    // 停计时器
    if (VideoCallState.timer) { clearInterval(VideoCallState.timer); VideoCallState.timer = null; }

    const duration = VideoCallState.startTime ? Math.floor((Date.now() - VideoCallState.startTime) / 1000) : 0;
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    const durationStr = `${mins}分${secs}秒`;

    // 隐藏通话界面
    document.getElementById('video-call-view')?.classList.remove('active');
    document.getElementById('vc-floating-bubble').style.display = 'none';
    document.getElementById('video-call-view').innerHTML = '';

    // 记录通话日志到聊天历史
    const chatId = VideoCallState.chatId;
    const callRecord = VideoCallState.messages.map(m =>
        `${m.role === 'user' ? '【我】' : '【TA】'}: ${m.content}`
    ).join('\n');

    // 通话结束消息
    if (chatId) {
        const endMsgId = 'call_end_' + Date.now();
        const endText = `📞 通话已结束，时长 ${durationStr}`;
        if (typeof appendMessage === 'function') {
            appendMessage(endText, 'system', null, null, null, endMsgId);
        }
        if (typeof saveMessageToHistory === 'function') {
            await saveMessageToHistory(chatId, { id: endMsgId, text: endText, type: 'system', senderName: 'SYSTEM' });
        }

        // 发隐藏指令让AI做通话后感想
        if (typeof sendMessageToAI === 'function' && callRecord) {
            setTimeout(() => {
                sendMessageToAI(`[SYSTEM: 视频通话刚刚结束，通话时长${durationStr}。以下是通话内容摘要：\n${callRecord}\n请以自然的方式用文字表达一下通话后的心情或感想，就当成普通聊天发一条消息。]`);
            }, 1500);
        }
    }

    // 重置状态
    VideoCallState.active = false;
    VideoCallState.chatId = null;
    VideoCallState.messages = [];
    VideoCallState.startTime = null;
}

// ─── 解析 AI 主动发起通话指令 ────────────────
// 在 sendMessageToAI 处理结果前调用
window.checkForVideoCallRequest = function(replyText, chatId) {
    if (!replyText.includes('video_call_request') && !replyText.includes('[VIDEO_CALL]')) return replyText;
    // 延迟触发来电
    setTimeout(() => triggerIncomingCall(chatId), 1000);
    return replyText.replace(/\[VIDEO_CALL\]/gi, '').replace(/video_call_request/gi, '').trim();
}

// ─── 对外接口：从聊天页面工具栏发起 ──────────
window.openVideoCallFromChat = function() {
    if (!currentChatId) return;
    const panel = document.getElementById('chat-extra-panels');
    if (panel) panel.classList.remove('open');

    if (currentChatType === 'group' && typeof groupsData !== 'undefined' && groupsData[currentChatId]) {
        const g = groupsData[currentChatId];
        startVideoCall(currentChatId, 'group', g.members);
    } else {
        startVideoCall(currentChatId, 'single');
    }
}
