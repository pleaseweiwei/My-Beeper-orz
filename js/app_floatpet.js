/* =============================================
   FloatPet v3 · 悬浮桌宠 · 随机行走版
   PNG精灵 · 屏幕内自由巡逻 · 对话框跟随头顶
   ============================================= */
'use strict';

const FloatPet = (function () {

    /* ── DOM refs ── */
    let $wrap, $body, $spriteWrap, $spriteImgWrap, $spriteImg;
    let $bubble, $bubbleText, $observeIcon;
    let $ring, $ring2, $dot;
    let _flash = null;

    /* ── Config state ── */
    let _cfg = {
        enabled:     false,
        charId:      null,
        intervalMin: 10,
        style:       'avatar',
        emoji:       '🐱',
        customUrl:   '',
        mood:        'auto'
    };
    let _timer       = null;
    let _bubbleTimer = null;
    let _isDragging  = false;
    let _tapCount    = 0;
    let _tapTimer    = null;
    let _scanning    = false;

    /* ════════════════════════════════════════
       Walk Engine State
       ════════════════════════════════════════ */
    const _W = {
        active:     false,
        x:          0,        // current left of body (px)
        y:          0,        // current top of body (px) — base, without bob
        tx:         0,        // target x
        ty:         0,        // target y
        facingLeft: false,
        bobPhase:   0,
        state:      'pausing',// 'walking' | 'pausing'
        pauseEnd:   0,
        rAF:        null,
        /* Tuning */
        BASE_SPEED: 0.85,     // px/frame
        ACCEL:      0.025,    // speed boost per px of distance
        MAX_SPEED:  2.4,      // px/frame cap
        BOB_AMP:    3.2,      // vertical bob amplitude (px)
        BOB_FREQ:   0.11,     // bob phase increment per frame
        IDLE_MIN:   1400,     // ms pause min
        IDLE_MAX:   4200,     // ms pause max
        MARGIN:     14        // px from phone edge
    };

    /* ── Scan icon pool ── */
    const SCAN_ICONS = ['🔍', '📸', '👀', '🔭'];

    /* ════════════════════════════════════════
       Init
       ════════════════════════════════════════ */
    function init() {
        _buildDOM();
        _bindEvents();
        _loadCfg();
    }

    /* ════════════════════════════════════════
       Build DOM
       ════════════════════════════════════════ */
    function _buildDOM() {
        const phone = document.querySelector('.phone');
        if (!phone || document.getElementById('float-pet-wrap')) return;

        phone.insertAdjacentHTML('beforeend', `
        <div id="float-pet-wrap">
            <div id="float-pet-body">
                <div class="fp-bubble" id="fp-bubble">
                    <span id="fp-bubble-text"></span>
                </div>
                <div class="fp-sprite-wrap" id="fp-sprite-wrap">
                    <div class="fp-observe-icon" id="fp-observe-icon">🔍</div>
                    <div class="fp-scan-ring"    id="fp-scan-ring"></div>
                    <div class="fp-scan-ring-2"  id="fp-scan-ring2"></div>
                    <div class="fp-live-dot"     id="fp-live-dot"></div>
                    <div class="fp-sprite-img-wrap" id="fp-sprite-img-wrap">
                        <img id="fp-sprite-img" class="fp-sprite-img" src="icon.png" alt="" draggable="false" />
                    </div>
                </div>
            </div>
        </div>`);

        /* Camera flash overlay on phone */
        _flash = document.createElement('div');
        _flash.className = 'fp-camera-flash';
        phone.appendChild(_flash);

        $wrap          = document.getElementById('float-pet-wrap');
        $body          = document.getElementById('float-pet-body');
        $spriteWrap    = document.getElementById('fp-sprite-wrap');
        $spriteImgWrap = document.getElementById('fp-sprite-img-wrap');
        $spriteImg     = document.getElementById('fp-sprite-img');
        $bubble        = document.getElementById('fp-bubble');
        $bubbleText    = document.getElementById('fp-bubble-text');
        $observeIcon   = document.getElementById('fp-observe-icon');
        $ring          = document.getElementById('fp-scan-ring');
        $ring2         = document.getElementById('fp-scan-ring2');
        $dot           = document.getElementById('fp-live-dot');
    }

    /* ════════════════════════════════════════
       Walk Engine
       ════════════════════════════════════════ */
    function _walkStart() {
        if (_W.active) return;
        _initWalkPos();
        _W.active   = true;
        _W.bobPhase = 0;
        _pickTarget();
        _W.state    = 'walking';
        if ($body) $body.classList.remove('fp-walk-idle');
        _walkLoop();
    }

    function _walkStop() {
        _W.active = false;
        if (_W.rAF) { cancelAnimationFrame(_W.rAF); _W.rAF = null; }
        if ($body) $body.classList.remove('fp-walk-idle');
    }

    function _walkResume() {
        if (!_cfg.enabled) return;
        /* Sync position from body in case it was dragged */
        if ($body) {
            _W.x = parseFloat($body.style.left) || _W.x;
            _W.y = parseFloat($body.style.top)  || _W.y;
        }
        _W.active   = true;
        _W.bobPhase = 0;
        _pickTarget();
        _W.state    = 'walking';
        if ($body) $body.classList.remove('fp-walk-idle');
        if (!_W.rAF) _walkLoop();
    }

    function _initWalkPos() {
        /* Try saved walk position */
        try {
            const p = JSON.parse(localStorage.getItem('fp_walk_pos') || 'null');
            if (p && typeof p.x === 'number') {
                _W.x = p.x;
                _W.y = p.y;
                if ($body) {
                    $body.style.left = Math.round(_W.x) + 'px';
                    $body.style.top  = Math.round(_W.y) + 'px';
                }
                return;
            }
        } catch (_) {}
        /* Default center-ish position */
        const phone = document.querySelector('.phone');
        const pw = phone ? phone.offsetWidth  : 375;
        const ph = phone ? phone.offsetHeight : 667;
        _W.x = pw / 2 - 36;
        _W.y = ph * 0.45;
        if ($body) {
            $body.style.left = Math.round(_W.x) + 'px';
            $body.style.top  = Math.round(_W.y) + 'px';
        }
    }

    function _pickTarget() {
        const phone = document.querySelector('.phone');
        const pw = phone ? phone.offsetWidth  : 375;
        const ph = phone ? phone.offsetHeight : 667;
        const m  = _W.MARGIN;
        const bw = $body ? ($body.offsetWidth  || 72) : 72;
        const bh = $body ? ($body.offsetHeight || 72) : 72;

        /* Pick a target not too close to current pos */
        let nx, ny, attempts = 0;
        do {
            nx = m + Math.random() * (pw - bw - m * 2);
            ny = m + Math.random() * (ph - bh - m * 2);
            attempts++;
        } while (
            attempts < 8 &&
            Math.hypot(nx - _W.x, ny - _W.y) < 60
        );

        _W.tx = nx;
        _W.ty = ny;
    }

    function _walkLoop() {
        if (!_W.active) { _W.rAF = null; return; }

        /* Pause the movement while dragging, but keep loop alive */
        if (_isDragging) {
            _W.rAF = requestAnimationFrame(_walkLoop);
            return;
        }

        if (_W.state === 'pausing') {
            if (Date.now() >= _W.pauseEnd) {
                _pickTarget();
                _W.state    = 'walking';
                _W.bobPhase = 0;
                if ($body) $body.classList.remove('fp-walk-idle');
            }
        } else {
            /* Walking */
            const dx   = _W.tx - _W.x;
            const dy   = _W.ty - _W.y;
            const dist = Math.hypot(dx, dy);

            if (dist < 2.0) {
                /* Arrived */
                _W.x = _W.tx;
                _W.y = _W.ty;
                _W.state    = 'pausing';
                _W.pauseEnd = Date.now()
                    + _W.IDLE_MIN
                    + Math.random() * (_W.IDLE_MAX - _W.IDLE_MIN);
                if ($body) $body.classList.add('fp-walk-idle');
                _saveWalkPos();
            } else {
                /* Ease toward target */
                const speed = Math.min(_W.BASE_SPEED + dist * _W.ACCEL, _W.MAX_SPEED);
                const step  = Math.min(speed, dist);
                const ux    = dx / dist;
                const uy    = dy / dist;
                _W.x += ux * step;
                _W.y += uy * step;

                /* Update facing direction (flip) */
                if (Math.abs(dx) > 0.4) {
                    const shouldFaceLeft = dx < 0;
                    if (shouldFaceLeft !== _W.facingLeft) {
                        _W.facingLeft = shouldFaceLeft;
                        if ($spriteImg) {
                            $spriteImg.classList.toggle('fp-face-left', shouldFaceLeft);
                        }
                    }
                }

                /* Advance bob phase proportional to speed */
                _W.bobPhase += _W.BOB_FREQ * (speed / _W.BASE_SPEED);
            }
        }

        /* Apply position with vertical bob when walking */
        if ($body) {
            const bob = (_W.state === 'walking')
                ? Math.sin(_W.bobPhase) * _W.BOB_AMP
                : 0;
            $body.style.left = Math.round(_W.x) + 'px';
            $body.style.top  = Math.round(_W.y + bob) + 'px';
        }

        _W.rAF = requestAnimationFrame(_walkLoop);
    }

    function _saveWalkPos() {
        try {
            localStorage.setItem('fp_walk_pos', JSON.stringify({ x: _W.x, y: _W.y }));
        } catch (_) {}
    }

    /* ════════════════════════════════════════
       Events: drag + tap
       ════════════════════════════════════════ */
    function _bindEvents() {
        if (!$body) return;

        let ox = 0, oy = 0, sx = 0, sy = 0, moved = false;

        function onDown(e) {
            /* Ignore clicks on the bubble itself */
            if ($bubble && (e.target === $bubble || $bubble.contains(e.target))) return;
            const pt = e.touches ? e.touches[0] : e;
            ox = parseFloat($body.style.left) || 0;
            oy = parseFloat($body.style.top)  || 0;
            sx = pt.clientX;
            sy = pt.clientY;
            moved       = false;
            _isDragging = false;
            $body.classList.add('fp-dragging');
            $body.classList.remove('fp-walk-idle');
            document.addEventListener('mousemove', onMove, { passive: true });
            document.addEventListener('mouseup',   onUp);
            document.addEventListener('touchmove', onMove, { passive: true });
            document.addEventListener('touchend',  onUp);
        }

        function onMove(e) {
            const pt = e.touches ? e.touches[0] : e;
            const dx = pt.clientX - sx;
            const dy = pt.clientY - sy;
            if (Math.abs(dx) + Math.abs(dy) > 4) { moved = true; _isDragging = true; }
            if (!moved) return;
            const phone = document.querySelector('.phone');
            const pr    = phone.getBoundingClientRect();
            const bw    = $body.offsetWidth  || 72;
            const bh    = $body.offsetHeight || 72;
            const nx    = Math.max(0, Math.min(pr.width  - bw, ox + dx));
            const ny    = Math.max(0, Math.min(pr.height - bh, oy + dy));
            $body.style.left = nx + 'px';
            $body.style.top  = ny + 'px';
            _W.x = nx;
            _W.y = ny;
        }

        function onUp() {
            $body.classList.remove('fp-dragging');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend',  onUp);

            /* Sync walk engine to dropped position */
            _W.x  = parseFloat($body.style.left) || _W.x;
            _W.y  = parseFloat($body.style.top)  || _W.y;
            _W.tx = _W.x;
            _W.ty = _W.y;

            /* Resume walking after brief pause */
            setTimeout(function () {
                _isDragging = false;
                if (_cfg.enabled) _walkResume();
            }, 900);
        }

        $body.addEventListener('mousedown',  onDown);
        $body.addEventListener('touchstart', onDown, { passive: true });

        /* Tap / Double-tap on sprite to trigger observe */
        if ($spriteWrap) {
            $spriteWrap.addEventListener('click', function () {
                if (moved) return;
                _tapCount++;
                if (_tapCount === 1) {
                    _tapTimer = setTimeout(function () { _tapCount = 0; }, 350);
                } else if (_tapCount >= 2) {
                    clearTimeout(_tapTimer);
                    _tapCount = 0;
                    triggerObserve(true);
                }
            });
        }
    }

    /* ════════════════════════════════════════
       Config load / save
       ════════════════════════════════════════ */
    function _loadCfg() {
        try {
            const raw = localStorage.getItem('fp_cfg');
            if (raw) Object.assign(_cfg, JSON.parse(raw));
        } catch (_) {}
        if (_cfg.enabled && _cfg.charId) _start();
        else _hide();
    }

    function _saveCfg() {
        try { localStorage.setItem('fp_cfg', JSON.stringify(_cfg)); } catch (_) {}
    }

    /* ════════════════════════════════════════
       Show / Hide / Start
       ════════════════════════════════════════ */
    function _show() {
        if ($wrap) $wrap.style.display = 'block';
    }
    function _hide() {
        if ($wrap) $wrap.style.display = 'none';
        _stopTimer();
        _walkStop();
    }

    function _start() {
        _show();
        _updateAppearance();
        _walkStart();
        _scheduleNext();
    }

    /* ════════════════════════════════════════
       AI Timer scheduling
       ════════════════════════════════════════ */
    function _scheduleNext() {
        _stopTimer();
        if (!_cfg.enabled) return;
        const ms = (_cfg.intervalMin === 0)
            ? (3 + Math.random() * 12) * 60000
            : _cfg.intervalMin * 60000;
        _timer = setTimeout(function () { triggerObserve(false); }, ms);
    }

    function _stopTimer() {
        if (_timer) { clearTimeout(_timer); _timer = null; }
    }

    /* ════════════════════════════════════════
       Observe / Scan trigger
       ════════════════════════════════════════ */
    function triggerObserve(manual) {
        if (_scanning) return;
        _scanning = true;

        if ($observeIcon) {
            $observeIcon.textContent = SCAN_ICONS[Math.floor(Math.random() * SCAN_ICONS.length)];
        }
        _setScanAnim(true);
        _showThinkingBubble();

        setTimeout(function () {
            _triggerFlash();
            setTimeout(function () {
                _captureAndCall(manual, function () {
                    _setScanAnim(false);
                    _scanning = false;
                    if (!manual) _scheduleNext();
                });
            }, 220);
        }, 900);
    }

    function _triggerFlash() {
        if (!_flash) return;
        _flash.classList.remove('fp-flash-go');
        void _flash.offsetWidth; /* force reflow */
        _flash.classList.add('fp-flash-go');
        setTimeout(function () { _flash.classList.remove('fp-flash-go'); }, 520);
    }

    function _setScanAnim(on) {
        if ($ring)        $ring.classList.toggle('active', on);
        if ($ring2)       $ring2.classList.toggle('active', on);
        if ($observeIcon) $observeIcon.classList.toggle('active', on);
        if ($body)        $body.classList.toggle('fp-scanning', on);
        if (!on && $observeIcon) $observeIcon.classList.remove('active');
    }

    function _showThinkingBubble() {
        if (!$bubble || !$bubbleText) return;
        $bubbleText.innerHTML =
            '<span class="fp-thinking-dots"><span></span><span></span><span></span></span>';
        _positionBubble();
        $bubble.classList.add('show');
    }

    /* Adjust bubble position based on pet's location in the phone */
    function _positionBubble() {
        if (!$bubble) return;
        const phone = document.querySelector('.phone');
        if (!phone) return;
        const pw = phone.offsetWidth;
        const cx = _W.x + 36; /* center x of sprite */

        /* Near right side (>55%) → bubble tail on right */
        $bubble.classList.toggle('fp-bubble-right', cx > pw * 0.55);

        /* Near top (<130px) → bubble appears BELOW sprite to avoid overflow:hidden clip */
        $bubble.classList.toggle('fp-bubble-below', _W.y < 130);
    }

    /* ════════════════════════════════════════
       Capture + AI call
       ════════════════════════════════════════ */
    function _captureAndCall(manual, done) {
        const ctx   = _buildContext();
        const phone = document.querySelector('.phone');
        if (typeof html2canvas === 'function' && phone) {
            html2canvas(phone, {
                scale: 0.45, useCORS: true, allowTaint: true,
                backgroundColor: null, logging: false
            }).then(function (canvas) {
                try {
                    const b64 = canvas.toDataURL('image/jpeg', 0.65).split(',')[1];
                    _callAI(ctx, b64, done);
                } catch (e) { _callAI(ctx, null, done); }
            }).catch(function () { _callAI(ctx, null, done); });
        } else {
            _callAI(ctx, null, done);
        }
    }

    function _buildContext() {
        const parts = [];
        const appMap = [
            ['chatLayer',       '正在聊天界面'],
            ['offlineModeView', '正在线下模式（剧情模式）'],
            ['wechatApp',       '正在微信列表'],
            ['liveApp',         '正在LIVE（社交媒体）'],
            ['petApp',          '正在查看电子宠物'],
            ['loveSpaceApp',    '正在情侣空间'],
            ['galgameApp',      '正在玩Galgame'],
            ['novelApp',        '正在看小说'],
            ['gameApp',         '正在双人游乐场游戏'],
            ['trackerApp',      '正在查看TA的手机（Spy模式）'],
            ['payApp',          '正在查看钱包'],
            ['settingsView',    '正在设置页面'],
            ['musicPlayerView', '正在音乐播放器']
        ];
        let appDesc = '在手机主屏';
        for (const [id, desc] of appMap) {
            const el = document.getElementById(id);
            if (el && (el.classList.contains('open') || el.classList.contains('active') ||
                       el.style.display === 'flex' || el.style.display === 'block')) {
                appDesc = desc; break;
            }
        }
        parts.push('当前界面：' + appDesc);
        try {
            const msgs = document.querySelectorAll('#chatMessages .message-bubble');
            if (msgs.length) {
                const recent = Array.from(msgs).slice(-4).map(function (m) {
                    const side = m.classList.contains('sent') ? 'user' : 'ai';
                    return side + ': ' + (m.innerText || '').trim().slice(0, 60);
                });
                if (recent.length) parts.push('最近聊天：' + recent.join(' | '));
            }
        } catch (_) {}
        const now = new Date();
        const h   = now.getHours();
        let timeLabel = '白天';
        if      (h >= 22 || h < 5) timeLabel = '深夜';
        else if (h >= 18)          timeLabel = '晚上';
        else if (h >= 12)          timeLabel = '下午';
        else if (h <  8)           timeLabel = '清晨';
        parts.push('现在是' + timeLabel + h + '点');
        return parts.join('；');
    }

    function _getWorldbookContext(charId) {
        try {
            const raw = localStorage.getItem('worldbooks_v2');
            if (!raw) return '';
            const books = JSON.parse(raw);
            if (!Array.isArray(books)) return '';
            let linked = [];
            try {
                const fd = JSON.parse(localStorage.getItem('friendsData') || '[]');
                const fr = fd.find(function (f) { return f.id === charId; });
                if (fr && Array.isArray(fr.linkedWorldbooks)) linked = fr.linkedWorldbooks;
            } catch (_) {}
            const entries = [];
            for (const wb of books) {
                if (!wb.global && !linked.includes(wb.id)) continue;
                if (!Array.isArray(wb.entries)) continue;
                wb.entries
                    .filter(function (e) { return e.enabled !== false && e.content; })
                    .slice(0, 3)
                    .forEach(function (e) { entries.push(e.content); });
            }
            return entries.slice(0, 6).join('\n').slice(0, 700);
        } catch (_) { return ''; }
    }

    function _getPersona(charId) {
        try {
            const fd = JSON.parse(localStorage.getItem('friendsData') || '[]');
            const fr = fd.find(function (f) { return f.id === charId; });
            if (fr) return fr.persona || fr.systemPrompt || '';
        } catch (_) {}
        try {
            const cs = JSON.parse(localStorage.getItem('chat_settings_' + charId) || 'null');
            if (cs) return cs.persona || '';
        } catch (_) {}
        return '';
    }

    function _getCharName(charId) {
        try {
            const fd = JSON.parse(localStorage.getItem('friendsData') || '[]');
            const fr = fd.find(function (f) { return f.id === charId; });
            if (fr) return fr.remark || fr.realname || 'AI';
        } catch (_) {}
        return 'AI';
    }

    /* ════════════════════════════════════════
       AI Call (OpenAI / Gemini)
       ════════════════════════════════════════ */
    function _callAI(contextText, screenshotB64, done) {
        let apiKey = '', endpoint = '', model = '';
        try {
            const cfg = window.AppState
                ? window.AppState
                : JSON.parse(localStorage.getItem('app_settings') || '{}');
            apiKey   = cfg.apiKey    || cfg.api_key    || '';
            endpoint = cfg.apiEndpoint || cfg.endpoint || 'https://api.openai.com/v1';
            model    = cfg.model     || cfg.chatModel  || 'gpt-4o';
        } catch (_) {}
        if (!apiKey) {
            const ki = document.getElementById('apiKeyInput');
            const ei = document.getElementById('apiEndpointInput');
            const mi = document.getElementById('model-select');
            if (ki) apiKey   = ki.value;
            if (ei) endpoint = ei.value;
            if (mi) model    = mi.value;
        }
        if (!apiKey) {
            _showBubble('没有配置 API Key，设置里填写一下吧 (◕ᴗ◕✿)', 7000);
            if (done) done();
            return;
        }

        const charId   = _cfg.charId;
        const persona  = _getPersona(charId);
        const wbCtx    = _getWorldbookContext(charId);
        const charName = _getCharName(charId);
        const moodMap  = {
            tsundere: '你性格傲娇，表面嫌弃实则关心，说话带点tsundere腔调',
            caring:   '你是温柔体贴的闺蜜，会安慰和关心对方',
            snarky:   '你毒舌犀利，一针见血，但不失幽默',
            cute:     '你天真可爱，说话软萌，偶尔傻乎乎的',
            auto:     persona ? '按你的人设性格来' : '性格活泼，言简意赅'
        };
        const moodNote = moodMap[_cfg.mood] || moodMap.auto;

        const sysParts = [
            '你是一个悬浮在手机屏幕上的桌宠，名叫' + charName + '。',
            persona ? '你的人设：' + persona.slice(0, 400) : '',
            wbCtx   ? '世界观背景：' + wbCtx : '',
            moodNote + '。',
            '你刚刚"偷看"了主人的手机屏幕，根据你看到的内容，说一句符合你性格的简短吐槽或评论（15~40字，不加引号，直接说）。',
            '不要说"我看到了"这类开场白，直接切入评论。'
        ].filter(Boolean).join('\n');

        const userContent = [{ type: 'text', text: '屏幕情报：' + contextText }];
        if (screenshotB64) {
            userContent.push({
                type: 'image_url',
                image_url: { url: 'data:image/jpeg;base64,' + screenshotB64, detail: 'low' }
            });
        }

        if ((endpoint || '').includes('generativelanguage.googleapis.com')) {
            _callGemini(apiKey, model, sysParts, contextText, screenshotB64, done);
            return;
        }

        const base = (endpoint || '').replace(/\/+$/, '');
        const url  = base.endsWith('/chat/completions') ? base : base + '/chat/completions';

        fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
            body: JSON.stringify({
                model:       model,
                max_tokens:  120,
                temperature: 0.9,
                messages: [
                    { role: 'system', content: sysParts },
                    { role: 'user',   content: userContent }
                ]
            })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            let text = '';
            try { text = data.choices[0].message.content.trim(); }
            catch (_) { text = data.error ? ('Error: ' + data.error.message) : '（AI 回应异常）'; }
            _showBubble(text, 10000);
            if (done) done();
        })
        .catch(function () {
            _showBubble('网络出了点问题，稍后再试吧 ><', 7000);
            if (done) done();
        });
    }

    function _callGemini(apiKey, model, sysPrompt, ctxText, b64, done) {
        const mdl  = (model || 'gemini-1.5-flash').replace('models/', '');
        const url  = 'https://generativelanguage.googleapis.com/v1beta/models/'
                   + mdl + ':generateContent?key=' + apiKey;
        const parts = [{ text: sysPrompt + '\n\n屏幕情报：' + ctxText }];
        if (b64) parts.push({ inline_data: { mime_type: 'image/jpeg', data: b64 } });
        fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ contents: [{ parts: parts }] })
        })
        .then(function (r) { return r.json(); })
        .then(function (d) {
            let t = '';
            try { t = d.candidates[0].content.parts[0].text.trim(); }
            catch (_) { t = '（Gemini 回应异常）'; }
            _showBubble(t, 10000);
            if (done) done();
        })
        .catch(function () {
            _showBubble('Gemini 网络异常 ><', 6000);
            if (done) done();
        });
    }

    /* ════════════════════════════════════════
       Bubble show / hide
       ════════════════════════════════════════ */
    function _showBubble(text, ms) {
        if (!$bubble || !$bubbleText) return;
        clearTimeout(_bubbleTimer);
        $bubbleText.textContent = text;
        _positionBubble();
        $bubble.classList.add('show');
        _bubbleTimer = setTimeout(function () {
            $bubble.classList.remove('show');
        }, ms || 9000);
    }

    /* ════════════════════════════════════════
       Appearance update
       ════════════════════════════════════════ */
    function _updateAppearance() {
        if (!$spriteWrap) return;

        const style = _cfg.style;
        /* Remove emoji overlay if present */
        const emojiEl = $spriteWrap.querySelector('.fp-sprite-emoji');

        if (style === 'emoji') {
            if ($spriteImg) $spriteImg.style.display = 'none';
            if (!emojiEl) {
                const sp = document.createElement('span');
                sp.className = 'fp-sprite-emoji';
                if ($spriteImgWrap) $spriteImgWrap.insertBefore(sp, $spriteImg);
            }
            const ee = $spriteWrap.querySelector('.fp-sprite-emoji');
            if (ee) { ee.textContent = _cfg.emoji || '🐱'; ee.style.display = ''; }
        } else {
            if (emojiEl) emojiEl.style.display = 'none';
            if ($spriteImg) {
                $spriteImg.style.display = '';
                if (style === 'custom' && _cfg.customUrl) {
                    $spriteImg.src = _cfg.customUrl;
                } else {
                    const src = _getCharAvatar(_cfg.charId);
                    $spriteImg.src = src;
                    $spriteImg.onerror = function () { this.src = 'icon.png'; this.onerror = null; };
                }
            }
        }
        _syncPreview();
    }

    function _getCharAvatar(charId) {
        try {
            const fd = JSON.parse(localStorage.getItem('friendsData') || '[]');
            const fr = fd.find(function (f) { return f.id === charId; });
            if (fr && fr.avatar) return fr.avatar;
        } catch (_) {}
        const a = document.querySelector('.chat-avatar-img');
        return a ? a.src : 'icon.png';
    }

    function _syncPreview() {
        const prev = document.getElementById('fp-preview-avatar-inner');
        if (!prev) return;
        if (_cfg.style === 'emoji') {
            prev.textContent = _cfg.emoji || '🐱';
            prev.style.backgroundImage = '';
        } else {
            prev.textContent = '';
            const src = (_cfg.style === 'custom' && _cfg.customUrl)
                ? _cfg.customUrl
                : _getCharAvatar(_cfg.charId);
            prev.style.backgroundImage  = 'url(' + src + ')';
            prev.style.backgroundSize   = 'cover';
            prev.style.backgroundPosition = 'center';
        }
    }

    /* ════════════════════════════════════════
       Settings sync (from chat settings UI)
       ════════════════════════════════════════ */
    function syncToSettings(charId) {
        try {
            const raw = localStorage.getItem('fp_cfg_' + charId);
            if (raw) {
                const c = JSON.parse(raw);
                _cfg.style       = c.style       || 'avatar';
                _cfg.emoji       = c.emoji       || '🐱';
                _cfg.customUrl   = c.customUrl   || '';
                _cfg.mood        = c.mood        || 'auto';
                _cfg.intervalMin = typeof c.intervalMin === 'number' ? c.intervalMin : 10;
            }
        } catch (_) {}

        const tog = document.getElementById('cs-fp-toggle');
        if (tog) tog.checked = (_cfg.enabled && _cfg.charId === charId);
        _toggleBox(_cfg.enabled && _cfg.charId === charId);

        document.querySelectorAll('.fp-interval-chip').forEach(function (btn) {
            btn.classList.toggle('fp-sel', parseInt(btn.dataset.v) === _cfg.intervalMin);
        });
        document.querySelectorAll('.fp-style-chip').forEach(function (btn) {
            btn.classList.toggle('fp-sel-warm', btn.dataset.v === _cfg.style);
            btn.classList.remove('fp-sel');
        });

        const ei = document.getElementById('fp-emoji-input');
        const ui = document.getElementById('fp-url-input');
        if (ei) {
            ei.value = _cfg.emoji || '🐱';
            ei.parentElement.style.display = _cfg.style === 'emoji'  ? 'block' : 'none';
        }
        if (ui) {
            ui.value = _cfg.customUrl || '';
            ui.parentElement.style.display = _cfg.style === 'custom' ? 'block' : 'none';
        }

        const ms = document.getElementById('fp-mood-select');
        if (ms) ms.value = _cfg.mood || 'auto';
        _syncPreview();
    }

    function _toggleBox(on) {
        const box = document.getElementById('cs-fp-box');
        if (box) box.style.display = on ? 'block' : 'none';
    }

    /* ════════════════════════════════════════
       Public API (called from index.html)
       ════════════════════════════════════════ */
    function onToggle(checkbox) {
        const charId = _getCurrentCharId();
        if (!charId && checkbox.checked) {
            checkbox.checked = false;
            alert('请先保存角色设置后再启用桌宠');
            return;
        }
        _cfg.enabled = checkbox.checked;
        _cfg.charId  = charId;
        _toggleBox(checkbox.checked);
        _saveCfg();
        _saveCharCfg(charId);
        if (_cfg.enabled) _start();
        else _hide();
    }

    function setInterval_fp(min, btn) {
        _cfg.intervalMin = min;
        document.querySelectorAll('.fp-interval-chip').forEach(function (b) {
            b.classList.toggle('fp-sel', b === btn);
        });
        _saveCharCfg(_getCurrentCharId());
        if (_cfg.enabled) { _stopTimer(); _scheduleNext(); }
    }

    function setStyle(val, btn) {
        _cfg.style = val;
        document.querySelectorAll('.fp-style-chip').forEach(function (b) {
            b.classList.remove('fp-sel', 'fp-sel-warm');
        });
        if (btn) btn.classList.add('fp-sel-warm');
        const ei = document.getElementById('fp-emoji-input');
        const ui = document.getElementById('fp-url-input');
        if (ei) ei.parentElement.style.display = val === 'emoji'  ? 'block' : 'none';
        if (ui) ui.parentElement.style.display = val === 'custom' ? 'block' : 'none';
        _updateAppearance();
        _saveCharCfg(_getCurrentCharId());
    }

    function onEmojiChange(val) {
        _cfg.emoji = val;
        _updateAppearance();
        _saveCharCfg(_getCurrentCharId());
    }

    function onUrlChange(val) {
        _cfg.customUrl = val;
        _updateAppearance();
        _saveCharCfg(_getCurrentCharId());
    }

    function onMoodChange(val) {
        _cfg.mood = val;
        _saveCharCfg(_getCurrentCharId());
        const pb = document.getElementById('fp-preview-bubble-text');
        const moodPrev = {
            tsundere: '哼……大晚上刷视频，也不知道早点睡觉！（傲娇）',
            caring:   '看到你还在忙，摸摸头，注意休息哦 ♡',
            snarky:   '又在刷手机？怪不得眼睛越来越差……',
            cute:     '主人主人！那个看起来好好吃的说！(◕ᴗ◕✿)',
            auto:     '开启后，TA 会在这里吐槽你 👆'
        };
        if (pb) pb.textContent = moodPrev[val] || moodPrev.auto;
    }

    function _getCurrentCharId() {
        const h = document.getElementById('cs-char-id');
        if (h && h.value) return h.value;
        try {
            const fd = JSON.parse(localStorage.getItem('friendsData') || '[]');
            if (fd.length) return fd[0].id;
        } catch (_) {}
        return null;
    }

    function _saveCharCfg(charId) {
        if (!charId) return;
        try {
            localStorage.setItem('fp_cfg_' + charId, JSON.stringify({
                style:       _cfg.style,
                emoji:       _cfg.emoji,
                customUrl:   _cfg.customUrl,
                mood:        _cfg.mood,
                intervalMin: _cfg.intervalMin
            }));
        } catch (_) {}
        _saveCfg();
    }

    /* ════════════════════════════════════════
       Public exports
       ════════════════════════════════════════ */
    return {
        init:           init,
        onToggle:       onToggle,
        setInterval:    setInterval_fp,
        setStyle:       setStyle,
        onEmojiChange:  onEmojiChange,
        onUrlChange:    onUrlChange,
        onMoodChange:   onMoodChange,
        syncToSettings: syncToSettings,
        triggerObserve: triggerObserve,
        showBubble:     _showBubble
    };

})();

/* Auto-init after DOM ready */
document.addEventListener('DOMContentLoaded', function () {
    FloatPet.init();
});
