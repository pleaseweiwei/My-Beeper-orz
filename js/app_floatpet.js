/* =============================================
   FloatPet v4 · 悬浮桌宠 · 全功能版
   扫描线 · 权限弹窗 · 定时滑块 · GIF/WebView/Live2D
   ============================================= */
'use strict';

const FloatPet = (function () {

    /* ── DOM refs ── */
    let $wrap, $body, $spriteWrap, $spriteImgWrap, $spriteImg;
    let $bubble, $msgList, $observeIcon;
    let $ring, $ring2, $dot;
    let $scanLine;
    let _flash = null;

    /* ── IDB helpers (soft-depend on global IDB defined in apps.js) ── */
    function _idbSet(key, value) {
        if (typeof IDB !== 'undefined') {
            return IDB.set(key, value).catch(function () {});
        }
        return Promise.resolve();
    }
    function _idbGet(key) {
        if (typeof IDB !== 'undefined') {
            return IDB.get(key).catch(function () { return undefined; });
        }
        return Promise.resolve(undefined);
    }

    /* ── Config state ── */
    let _cfg = {
        enabled:      false,
        charId:       null,
        intervalMin:  10,
        style:        'avatar',   // avatar | emoji | custom | gif | webview | live2d
        emoji:        '🐱',
        customUrl:    '',
        gifUrl:       '',
        webviewHtml:  '',
        live2dUrl:    '',
        permGranted:  false       // 首次启用显示仿权限弹窗
    };
    let _timer       = null;
    let _bubbleTimer = null;
    let _isDragging  = false;
    let _tapCount    = 0;
    let _tapTimer    = null;
    let _scanning    = false;

    /* ── Message queue (WeChat-style sequential pop) ── */
    let _msgShowTimers = [];

    /* ── Snap-to-edge state ── */
    const SNAP_THRESHOLD = 52;   // px from phone edge to trigger snap
    const SNAP_HALF      = 36;   // px to hide (half of 72px body)
    let _snapState = { active: false, edge: null };

    function _clearMsgTimers() {
        _msgShowTimers.forEach(function (t) { clearTimeout(t); });
        _msgShowTimers = [];
    }

    /* ════════════════════════════════════════
       Walk Engine State
       ════════════════════════════════════════ */
    const _W = {
        active:     false,
        x:          0,
        y:          0,
        tx:         0,
        ty:         0,
        facingLeft: false,
        bobPhase:   0,
        state:      'pausing',
        pauseEnd:   0,
        rAF:        null,
        BASE_SPEED: 0.38,
        ACCEL:      0.010,
        MAX_SPEED:  1.0,
        BOB_AMP:    2.0,
        BOB_FREQ:   0.06,
        IDLE_MIN:   5000,
        IDLE_MAX:   12000,
        MARGIN:     14
    };

    /* ════════════════════════════════════════
       Real Phone Data Module
       ════════════════════════════════════════ */
    const _RealPhone = {
        battery:         null,
        sessionStart:    Date.now(),
        _sectionStart:   null,
        _currentSection: null,
        _todayStats:     null,
        _sectionTimer:   null,

        init: function () {
            this._loadTodayStats();
            this._initBattery();
            this._watchVisibility();
            this._startSectionTracker();
        },

        _initBattery: function () {
            if ('getBattery' in navigator) {
                navigator.getBattery().then(function (bat) {
                    _RealPhone.battery = bat;
                }).catch(function () {});
            }
        },

        _watchVisibility: function () {
            document.addEventListener('visibilitychange', function () {
                if (document.hidden) {
                    _RealPhone._pauseSection();
                } else {
                    _RealPhone._resumeSection();
                    if (_RealPhone._todayStats) {
                        _RealPhone._todayStats.returns = (_RealPhone._todayStats.returns || 0) + 1;
                        _RealPhone._saveTodayStats();
                    }
                }
            });
        },

        _startSectionTracker: function () {
            const INTERVAL = 6000;
            const appScan = [
                ['chatLayer',       '聊天'],
                ['offlineModeView', '剧情模式'],
                ['wechatApp',       '消息列表'],
                ['liveApp',         'LIVE动态'],
                ['petApp',          '电子宠物'],
                ['loveSpaceApp',    '情侣空间'],
                ['galgameApp',      'Galgame'],
                ['novelApp',        '看小说'],
                ['gameApp',         '游戏'],
                ['trackerApp',      '追踪模式'],
                ['payApp',          '钱包'],
                ['musicPlayerView', '音乐']
            ];
            this._sectionTimer = setInterval(function () {
                if (document.hidden) return;
                let found = '主屏幕';
                for (var i = 0; i < appScan.length; i++) {
                    var el = document.getElementById(appScan[i][0]);
                    if (el && (el.classList.contains('open') || el.classList.contains('active') ||
                               el.style.display === 'flex' || el.style.display === 'block')) {
                        found = appScan[i][1];
                        break;
                    }
                }
                _RealPhone.trackSection(found, INTERVAL / 1000);
            }, INTERVAL);
        },

        trackSection: function (sectionName, seconds) {
            if (!this._todayStats) return;
            var s = seconds || 6;
            var key = sectionName;
            this._todayStats.sections[key] = (this._todayStats.sections[key] || 0) + s;
            if (key !== this._currentSection) {
                this._todayStats.visits[key] = (this._todayStats.visits[key] || 0) + 1;
                this._currentSection = key;
            }
            this._saveCount = (this._saveCount || 0) + 1;
            if (this._saveCount % 5 === 0) this._saveTodayStats();
        },

        _pauseSection: function () { this._sectionPausedAt = Date.now(); },
        _resumeSection: function () { this._sectionPausedAt = null; },

        _loadTodayStats: function () {
            var today = new Date().toDateString();
            try {
                var raw = localStorage.getItem('fp_phone_stats');
                if (raw) {
                    var d = JSON.parse(raw);
                    if (d.date === today) {
                        this._todayStats = d;
                        this._todayStats.launches = (this._todayStats.launches || 0) + 1;
                        this._saveTodayStats();
                        return;
                    }
                }
            } catch (_) {}
            this._todayStats = { date: today, sections: {}, visits: {}, launches: 1, returns: 0 };
            this._saveTodayStats();
        },

        _saveTodayStats: function () {
            try { localStorage.setItem('fp_phone_stats', JSON.stringify(this._todayStats)); } catch (_) {}
        },

        getBatteryCtx: function () {
            var b = this.battery;
            if (!b) return '';
            var pct = Math.round(b.level * 100);
            if (b.charging) {
                if (pct >= 99) return '电量已满还在充电';
                return '充电中' + pct + '%';
            }
            if (pct <= 5)  return '电量危急只剩' + pct + '%';
            if (pct <= 15) return '电量低' + pct + '%快没电了';
            if (pct <= 30) return '电量' + pct + '%（偏低）';
            return '电量' + pct + '%';
        },

        getNetworkCtx: function () {
            var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            if (!conn) return '';
            var type = conn.type;
            var eff  = conn.effectiveType;
            if (type === 'wifi')     return '使用WiFi';
            if (type === 'cellular') {
                if (eff === '4g')                      return '使用4G';
                if (eff === '3g')                      return '3G网络';
                if (eff === '2g' || eff === 'slow-2g') return '网络很差(2G)';
                return '使用手机流量';
            }
            if (type === 'none') return '已断网';
            if (eff === '4g')    return '网络良好';
            if (eff === '2g' || eff === 'slow-2g') return '网络很慢';
            return '';
        },

        getSessionCtx: function () {
            var mins = Math.round((Date.now() - this.sessionStart) / 60000);
            if (mins < 2)  return '刚打开手机';
            if (mins < 10) return '已使用' + mins + '分钟';
            if (mins < 30) return '连续用了' + mins + '分钟';
            if (mins < 60) return '连续刷了' + mins + '分钟手机';
            var h = Math.floor(mins / 60);
            var m = mins % 60;
            return '连续用手机' + h + '小时' + (m > 0 ? m + '分钟' : '') + '了';
        },

        getOrientationCtx: function () {
            try {
                if (screen.orientation && screen.orientation.type) {
                    if (screen.orientation.type.indexOf('landscape') !== -1) return '横屏使用';
                }
                if (typeof window.orientation !== 'undefined') {
                    if (window.orientation === 90 || window.orientation === -90) return '横屏使用';
                }
            } catch (_) {}
            return '';
        },

        getUsageCtx: function () {
            if (!this._todayStats) return '';
            var s = this._todayStats.sections || {};
            var v = this._todayStats.visits || {};
            var sorted = Object.keys(s)
                .map(function (k) { return [k, s[k]]; })
                .filter(function (e) { return e[1] >= 20; })
                .sort(function (a, b) { return b[1] - a[1]; });
            if (!sorted.length) return '';
            var top = sorted[0];
            var mins = Math.round(top[1] / 60);
            if (mins < 1) return '';
            var cnt  = v[top[0]] || 1;
            var name = top[0];
            if (cnt >= 3) return '今天' + name + '已刷了' + cnt + '次';
            if (mins >= 10) return '今天' + name + '用了' + mins + '分钟';
            return '';
        },

        getLaunchCtx: function () {
            if (!this._todayStats) return '';
            var lc = this._todayStats.launches || 1;
            var rc = this._todayStats.returns  || 0;
            if (lc + rc >= 10) return '今天打开了' + (lc + rc) + '次手机';
            if (rc >= 3) return '今天切回来' + rc + '次了';
            return '';
        },

        getDeviceCtx: function () {
            var ua = navigator.userAgent || '';
            if (/iPhone|iPod/i.test(ua)) return 'iPhone';
            if (/iPad/i.test(ua)) return 'iPad';
            if (/Android/i.test(ua)) return 'Android手机';
            if (!/Mobile|Android|iPhone/i.test(ua)) return '电脑端';
            return '手机';
        },

        getAllCtx: function () {
            var parts = [];
            var batt   = this.getBatteryCtx();
            var net    = this.getNetworkCtx();
            var sess   = this.getSessionCtx();
            var ori    = this.getOrientationCtx();
            var usage  = this.getUsageCtx();
            var launch = this.getLaunchCtx();
            var dev    = this.getDeviceCtx();
            if (dev)    parts.push('设备:' + dev);
            if (batt)   parts.push(batt);
            if (net)    parts.push(net);
            if (sess)   parts.push(sess);
            if (ori)    parts.push(ori);
            if (usage)  parts.push(usage);
            if (launch) parts.push(launch);
            return parts.join('；');
        },

        vibrateSpeak: function () {
            try {
                if ('vibrate' in navigator) navigator.vibrate([15, 25, 15]);
            } catch (_) {}
        }
    };

    /* ── Scan icon pool ── */
    const SCAN_ICONS = ['🔍', '📸', '👀', '🔭'];

    /* ════════════════════════════════════════
       Android Native Bridge helpers
       当运行在 APK 的 WebView 中时，window.AndroidBridge 由
       MainActivity.java 注入，可直接调用原生接口。
       ════════════════════════════════════════ */
    function _isAndroid() {
        return !!(window.AndroidBridge && typeof window.AndroidBridge.getPlatform === 'function');
    }
    function _saveOverlayConfig() {
        /* 将桌宠所需的全部数据写入 beeper_prefs SharedPreferences，
           供 floatpet_overlay.html 通过 OverlayBridge.getSharedPref() 读取。
           两处使用同一个 "beeper_prefs" 存储，AndroidBridge ↔ OverlayBridge 完全共享。 */
        try {
            if (!_isAndroid()) return;
            var charId = _cfg.charId;
            var f      = (typeof friendsData !== 'undefined' && charId && friendsData[charId])
                         ? friendsData[charId] : {};
            var myInfo = _getMyPersonaInfo();

            /* ── 基础样式 ── */
            window.AndroidBridge.saveString('pet_style', _cfg.style || 'avatar');
            window.AndroidBridge.saveString('pet_emoji', _cfg.emoji || '🐱');

            /* ── 角色头像 URL（data URI 大图先压缩到 80×80 JPEG 再存） ── */
            var avatarUrl = _getCharAvatar(charId);
            function _saveAvatarToPrefs(url) {
                if (!url) { window.AndroidBridge.saveString('pet_avatar_url', ''); return; }
                if (!url.startsWith('data:') || url.length < 200000) {
                    window.AndroidBridge.saveString('pet_avatar_url', url);
                    return;
                }
                // 大图：用 canvas 压缩为 80×80 JPEG 0.82
                try {
                    var tmpImg = new Image();
                    tmpImg.onload = function () {
                        try {
                            var cv = document.createElement('canvas');
                            cv.width = 80; cv.height = 80;
                            cv.getContext('2d').drawImage(tmpImg, 0, 0, 80, 80);
                            var compressed = cv.toDataURL('image/jpeg', 0.82);
                            window.AndroidBridge.saveString('pet_avatar_url', compressed);
                        } catch (_) { window.AndroidBridge.saveString('pet_avatar_url', ''); }
                    };
                    tmpImg.onerror = function () { window.AndroidBridge.saveString('pet_avatar_url', ''); };
                    tmpImg.src = url;
                } catch (_) { window.AndroidBridge.saveString('pet_avatar_url', ''); }
            }
            _saveAvatarToPrefs(avatarUrl);

            /* ── GIF URL（plain URL 直存；data URI ≤400KB 直存，超限清空） ── */
            var gifSrc = _cfg.gifUrl || '';
            if (gifSrc && !gifSrc.startsWith('data:')) {
                window.AndroidBridge.saveString('pet_gif_url', gifSrc);
            } else if (gifSrc && gifSrc.length < 400000) {
                window.AndroidBridge.saveString('pet_gif_url', gifSrc);
            } else {
                window.AndroidBridge.saveString('pet_gif_url', '');
            }

            /* ── Custom URL（同上） ── */
            var customSrc = _cfg.customUrl || '';
            if (customSrc && !customSrc.startsWith('data:')) {
                window.AndroidBridge.saveString('pet_custom_url', customSrc);
            } else if (customSrc && customSrc.length < 400000) {
                window.AndroidBridge.saveString('pet_custom_url', customSrc);
            } else {
                // 超限：压缩后存
                if (customSrc && customSrc.startsWith('data:image')) {
                    try {
                        var tmpImg2 = new Image();
                        tmpImg2.onload = function () {
                            try {
                                var cv2 = document.createElement('canvas');
                                cv2.width = 100; cv2.height = 100;
                                cv2.getContext('2d').drawImage(tmpImg2, 0, 0, 100, 100);
                                var compressed2 = cv2.toDataURL('image/jpeg', 0.80);
                                window.AndroidBridge.saveString('pet_custom_url', compressed2);
                            } catch (_) { window.AndroidBridge.saveString('pet_custom_url', ''); }
                        };
                        tmpImg2.onerror = function () { window.AndroidBridge.saveString('pet_custom_url', ''); };
                        tmpImg2.src = customSrc;
                    } catch (_) { window.AndroidBridge.saveString('pet_custom_url', ''); }
                } else {
                    window.AndroidBridge.saveString('pet_custom_url', '');
                }
            }

            /* ── AI 设置（API Key / endpoint / model） ── */
            try {
                var aiSets = JSON.parse(localStorage.getItem('myCoolPhone_aiSettings') || '{}');
                window.AndroidBridge.saveString('pet_api_key',      aiSets.apiKey   || '');
                window.AndroidBridge.saveString('pet_api_endpoint', aiSets.endpoint || '');
                window.AndroidBridge.saveString('pet_api_model',    aiSets.model    || '');
            } catch (_) {}

            /* ── 角色基本信息 ── */
            window.AndroidBridge.saveString('pet_char_name',    _getCharName(charId));
            window.AndroidBridge.saveString('pet_char_persona', f.persona || '');

            /* ── 关系日志（最近3条，供 overlay 还原关系历史） ── */
            var relLog = '';
            if (f.relationshipLog && f.relationshipLog.length > 0) {
                relLog = f.relationshipLog.slice(-3).map(function (r) { return '- ' + r.text; }).join('\n').slice(0, 400);
            }
            window.AndroidBridge.saveString('pet_relation_log', relLog);

            /* ── 世界书（全量关键词匹配，截断到 1500 字） ── */
            var wbCtx = _getWorldbookContext(charId);
            window.AndroidBridge.saveString('pet_worldbook', wbCtx.slice(0, 1500)); // Android 悬浮窗目前只支持 before_char 部分

            /* ── 我的人设 ── */
            window.AndroidBridge.saveString('pet_my_name',    myInfo.name    || '主人');
            window.AndroidBridge.saveString('pet_my_persona', myInfo.persona || '');

            /* ── 剧情总结（最近3段） ── */
            var summaryText = '';
            if (f.summaries && f.summaries.length > 0) {
                summaryText = f.summaries.slice(-3).map(function (s) {
                    return '- ' + s.text;
                }).join('\n').slice(0, 800);
            }
            window.AndroidBridge.saveString('pet_summaries', summaryText);

            /* ── 近期聊天记录（异步从 IDB 读取，最多 12 条） ── */
            (function() {
                try {
                    var idbKey = (typeof scopedChatKey === 'function') ? scopedChatKey(charId) : ('chat_history__' + charId);
                    _idbGet(idbKey).then(function(hist) {
                        var recentText = '';
                        if (hist && hist.length > 0) {
                            var last12 = hist.filter(function(m) {
                                return m && m.text && m.type !== 'system' &&
                                       !/^\[System/.test(m.text) && !/^\[STATUS_/.test(m.text);
                            }).slice(-12);
                            var charNameStr = _getCharName(charId) || 'AI';
                            var myNameStr = (typeof _getMyPersonaInfo === 'function') ? (_getMyPersonaInfo().name || '我') : '我';
                            recentText = last12.map(function(m) {
                                var who = (m.type === 'received') ? charNameStr : myNameStr;
                                var txt = (m.text || '').replace(/\[STATUS_START\][\s\S]*?\[STATUS_END\]/gi, '').replace(/\[DANMAKU_START\][\s\S]*/gi, '').trim().slice(0, 120);
                                return who + ': ' + txt;
                            }).join('\n');
                        }
                        if (window.AndroidBridge && window.AndroidBridge.saveString) {
                            window.AndroidBridge.saveString('pet_recent_chat', recentText.slice(0, 1200));
                        }
                    }).catch(function() {
                        if (window.AndroidBridge && window.AndroidBridge.saveString) {
                            window.AndroidBridge.saveString('pet_recent_chat', '');
                        }
                    });
                } catch (e) {
                    try { window.AndroidBridge.saveString('pet_recent_chat', ''); } catch (_) {}
                }
            }());

            /* ── 发送间隔（分钟，0 = 随机） ── */
            window.AndroidBridge.saveString('pet_interval', String(_cfg.intervalMin || 10));

        } catch (e) { console.warn('[FloatPet] saveOverlayConfig error', e); }
    }

    function _androidStartOverlay() {
        try {
            if (_isAndroid()) {
                if (window.AndroidBridge.canDrawOverlays()) {
                    _saveOverlayConfig();
                    window.AndroidBridge.startFloatPet();
                } else {
                    // 跳转系统设置申请悬浮窗权限
                    window.AndroidBridge.requestOverlayPermission();
                    // 设置回调，权限授予后自动启动
                    window._onOverlayPermResult = function (granted) {
                        window._onOverlayPermResult = null;
                        if (granted) {
                            _saveOverlayConfig();
                            window.AndroidBridge.startFloatPet();
                        }
                    };
                }
            }
        } catch (e) { console.warn('[FloatPet] androidStartOverlay error', e); }
    }
    function _androidStopOverlay() {
        try {
            if (_isAndroid()) window.AndroidBridge.stopFloatPet();
        } catch (e) {}
    }

    /* ════════════════════════════════════════
       Init
       ════════════════════════════════════════ */
    function init() {
        _buildDOM();
        _bindEvents();
        _loadCfg();
        _RealPhone.init();
    }

    /* ════════════════════════════════════════
       Build DOM
       ════════════════════════════════════════ */
    function _buildDOM() {
        const phone = document.querySelector('.phone');
        if (!phone || document.getElementById('float-pet-wrap')) return;

        phone.insertAdjacentHTML('beforeend', `
        <div id="float-pet-wrap">
            <!-- Full-screen scan line -->
            <div id="fp-scan-line"></div>

            <div id="float-pet-body">
                <div class="fp-bubble" id="fp-bubble">
                    <div id="fp-msg-list" class="fp-msg-list"></div>
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
        </div>

        <!-- SYSTEM_ALERT_WINDOW 仿权限弹窗 -->
        <div id="fp-perm-overlay">
            <div class="fp-perm-card" id="fp-perm-card">
                <div class="fp-perm-sys-bar">ANDROID PERMISSIONS</div>
                <div class="fp-perm-app-row">
                    <div class="fp-perm-app-icon">🐾</div>
                    <div>
                        <div class="fp-perm-app-name">桌宠 · FloatPet</div>
                        <div class="fp-perm-app-pkg">com.beeper.floatpet</div>
                    </div>
                </div>
                <div class="fp-perm-title">允许「桌宠」显示在其他应用上层？</div>
                <div class="fp-perm-desc">
                    启用后，桌宠将悬浮在所有 App 之上，就像安卓的
                    <strong>SYSTEM_ALERT_WINDOW</strong> 权限一样。
                    它会偷瞄你的屏幕，然后完全以 TA 的人设性格和语气来回应你。
                </div>
                <div class="fp-perm-warn-row">
                    <i>⚠️</i>
                    该权限允许桌宠截取屏幕快照并通过视觉 AI 分析你的使用行为，以角色人设的口吻与你互动。
                </div>
                <div class="fp-perm-btns">
                    <button class="fp-perm-btn-deny" id="fp-perm-deny">拒绝</button>
                    <button class="fp-perm-btn-allow" id="fp-perm-allow">允许</button>
                </div>
            </div>
        </div>`);

        /* Camera flash overlay */
        _flash = document.createElement('div');
        _flash.className = 'fp-camera-flash';
        phone.appendChild(_flash);

        $wrap          = document.getElementById('float-pet-wrap');
        $body          = document.getElementById('float-pet-body');
        $spriteWrap    = document.getElementById('fp-sprite-wrap');
        $spriteImgWrap = document.getElementById('fp-sprite-img-wrap');
        $spriteImg     = document.getElementById('fp-sprite-img');
        $bubble        = document.getElementById('fp-bubble');
        $msgList       = document.getElementById('fp-msg-list');
        $observeIcon   = document.getElementById('fp-observe-icon');
        $ring          = document.getElementById('fp-scan-ring');
        $ring2         = document.getElementById('fp-scan-ring2');
        $dot           = document.getElementById('fp-live-dot');
        $scanLine      = document.getElementById('fp-scan-line');

        /* Bind permission overlay buttons */
        const btnDeny  = document.getElementById('fp-perm-deny');
        const btnAllow = document.getElementById('fp-perm-allow');
        if (btnDeny)  btnDeny.addEventListener('click',  _onPermDeny);
        if (btnAllow) btnAllow.addEventListener('click', _onPermAllow);
    }

    /* ════════════════════════════════════════
       Permission Overlay
       ════════════════════════════════════════ */
    function _showPermOverlay() {
        const ov = document.getElementById('fp-perm-overlay');
        if (!ov) return;
        /* Reset card to request state */
        const card = document.getElementById('fp-perm-card');
        if (card) {
            card.innerHTML = `
                <div class="fp-perm-sys-bar">ANDROID PERMISSIONS</div>
                <div class="fp-perm-app-row">
                    <div class="fp-perm-app-icon">🐾</div>
                    <div>
                        <div class="fp-perm-app-name">桌宠 · FloatPet</div>
                        <div class="fp-perm-app-pkg">com.beeper.floatpet</div>
                    </div>
                </div>
                <div class="fp-perm-title">允许「桌宠」显示在其他应用上层？</div>
                <div class="fp-perm-desc">
                    启用后，桌宠将悬浮在所有 App 之上，就像安卓的
                    <strong>SYSTEM_ALERT_WINDOW</strong> 权限一样。
                    它会偷瞄你的屏幕，然后完全以 TA 的人设性格和语气来回应你。
                </div>
                <div class="fp-perm-warn-row">
                    <i>⚠️</i>
                    该权限允许桌宠截取屏幕快照并通过视觉 AI 分析你的使用行为，以角色人设的口吻与你互动。
                </div>
                <div class="fp-perm-btns">
                    <button class="fp-perm-btn-deny"  id="fp-perm-deny">拒绝</button>
                    <button class="fp-perm-btn-allow" id="fp-perm-allow">允许</button>
                </div>`;
            const btnDeny  = card.querySelector('#fp-perm-deny');
            const btnAllow = card.querySelector('#fp-perm-allow');
            if (btnDeny)  btnDeny.addEventListener('click',  _onPermDeny);
            if (btnAllow) btnAllow.addEventListener('click', _onPermAllow);
        }
        ov.classList.add('fp-perm-show');
    }

    function _hidePermOverlay() {
        const ov = document.getElementById('fp-perm-overlay');
        if (ov) ov.classList.remove('fp-perm-show');
    }

    function _onPermDeny() {
        _hidePermOverlay();
        /* Turn off the toggle */
        _cfg.enabled = false;
        _saveCfg();
        const tog = document.getElementById('cs-fp-toggle');
        if (tog) tog.checked = false;
        _toggleBox(false);
        _hide();
    }

    function _onPermAllow() {
        /* Show granted card then close */
        const card = document.getElementById('fp-perm-card');
        if (card) {
            card.innerHTML = `
                <div class="fp-perm-granted-wrap">
                    <div class="fp-perm-check-circle">✓</div>
                    <div class="fp-perm-granted-title">权限已授予！</div>
                    <div class="fp-perm-granted-sub">
                        桌宠现在可以悬浮在所有应用上层了。<br>
                        双击桌宠可以手动触发一次偷瞄。
                    </div>
                </div>`;
        }
        _cfg.permGranted = true;
        _saveCfg();
        setTimeout(function () {
            _hidePermOverlay();
            if (_isAndroid()) {
                /* APK 模式：启动原生悬浮窗 Service，不另起 in-app 桌宠 */
                _androidStartOverlay();
            } else {
                /* Web/PWA 模式：在手机 DOM 内显示桌宠 */
                _start();
            }
        }, 2000);
    }

    /* ════════════════════════════════════════
       Walk Engine
       ════════════════════════════════════════ */
    function _walkStart() {
        if (_W.active) return;
        if (_snapState.active) return;
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
        if (_snapState.active) return;
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
        try {
            const p = JSON.parse(localStorage.getItem('fp_walk_pos') || 'null');
            if (p && typeof p.x === 'number') {
                _W.x = p.x; _W.y = p.y;
                if ($body) {
                    $body.style.left = Math.round(_W.x) + 'px';
                    $body.style.top  = Math.round(_W.y) + 'px';
                }
                return;
            }
        } catch (_) {}
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
        let nx, ny, attempts = 0;
        do {
            nx = m + Math.random() * (pw - bw - m * 2);
            ny = m + Math.random() * (ph - bh - m * 2);
            attempts++;
        } while (attempts < 8 && Math.hypot(nx - _W.x, ny - _W.y) < 60);
        _W.tx = nx; _W.ty = ny;
    }

    function _walkLoop() {
        if (!_W.active) { _W.rAF = null; return; }
        if (_isDragging) { _W.rAF = requestAnimationFrame(_walkLoop); return; }

        if (_W.state === 'pausing') {
            if (Date.now() >= _W.pauseEnd) {
                _pickTarget();
                _W.state    = 'walking';
                _W.bobPhase = 0;
                if ($body) $body.classList.remove('fp-walk-idle');
            }
        } else {
            const dx   = _W.tx - _W.x;
            const dy   = _W.ty - _W.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 2.0) {
                _W.x = _W.tx; _W.y = _W.ty;
                _W.state    = 'pausing';
                _W.pauseEnd = Date.now() + _W.IDLE_MIN + Math.random() * (_W.IDLE_MAX - _W.IDLE_MIN);
                if ($body) $body.classList.add('fp-walk-idle');
                _saveWalkPos();
            } else {
                const speed = Math.min(_W.BASE_SPEED + dist * _W.ACCEL, _W.MAX_SPEED);
                const step  = Math.min(speed, dist);
                const ux    = dx / dist;
                const uy    = dy / dist;
                _W.x += ux * step;
                _W.y += uy * step;
                if (Math.abs(dx) > 0.4) {
                    const shouldFaceLeft = dx < 0;
                    if (shouldFaceLeft !== _W.facingLeft) {
                        _W.facingLeft = shouldFaceLeft;
                        if ($spriteImg) $spriteImg.classList.toggle('fp-face-left', shouldFaceLeft);
                    }
                }
                _W.bobPhase += _W.BOB_FREQ * (speed / _W.BASE_SPEED);
            }
        }

        if ($body) {
            const bob = (_W.state === 'walking') ? Math.sin(_W.bobPhase) * _W.BOB_AMP : 0;
            $body.style.left = Math.round(_W.x) + 'px';
            $body.style.top  = Math.round(_W.y + bob) + 'px';
        }
        _W.rAF = requestAnimationFrame(_walkLoop);
    }

    function _saveWalkPos() {
        try { localStorage.setItem('fp_walk_pos', JSON.stringify({ x: _W.x, y: _W.y })); } catch (_) {}
    }

    /* ════════════════════════════════════════
       Sentence splitter (WeChat-style messages)
       多层策略，保证 AI 无论输出什么格式都能拆成 2~4 条
       ════════════════════════════════════════ */
    function _splitSentences(text) {
        if (!text) return [''];

        /* ① 优先按换行拆（AI 用 \n 分句时最准确） */
        var lines = text.split(/\n+/)
            .map(function (s) { return s.trim(); })
            .filter(function (s) { return s.length > 1; });
        if (lines.length >= 2 && lines.length <= 6) return lines;

        var t = text.replace(/\n+/g, ' ').trim();

        /* ② 太短就整句返回 */
        if (t.length <= 20) return [t];

        /* ③ 按句末标点拆（含波浪号、省略号） */
        var parts = [];
        var remaining = t;
        var reEnd = /^(.+?[。！？!?…～~]+)\s*/;
        while (remaining.length > 0) {
            var m = remaining.match(reEnd);
            if (m && m[0].length > 0) {
                parts.push(m[1].trim());
                remaining = remaining.slice(m[0].length);
            } else {
                if (remaining.trim()) parts.push(remaining.trim());
                break;
            }
        }
        parts = parts.filter(function (s) { return s.length > 0; });
        if (parts.length >= 2) return parts;

        /* ④ fallback：按逗号拆，合并过短片段 */
        var chunks = t.split(/[，,]+/)
            .map(function (s) { return s.trim(); })
            .filter(function (s) { return s.length > 0; });
        if (chunks.length >= 2) {
            var merged = [chunks[0]];
            for (var i = 1; i < chunks.length; i++) {
                var last = merged[merged.length - 1];
                if (chunks[i].length < 7 || last.length < 7) {
                    merged[merged.length - 1] = last + '，' + chunks[i];
                } else {
                    merged.push(chunks[i]);
                }
            }
            if (merged.length >= 2 && merged.length <= 5) return merged;
            if (merged.length > 5) {
                var r = merged.slice(0, 3);
                r.push(merged.slice(3).join('，'));
                return r;
            }
        }

        /* ⑤ 最终兜底：在文本中间附近的标点处强制切开 */
        if (t.length > 36) {
            var mid = Math.floor(t.length / 2);
            var cutAt = -1;
            var puncSet = '。！？!?…～~，,、';
            for (var d = 0; d <= 10; d++) {
                if (mid + d < t.length && puncSet.indexOf(t[mid + d]) !== -1) { cutAt = mid + d + 1; break; }
                if (mid - d >= 0   && puncSet.indexOf(t[mid - d]) !== -1) { cutAt = mid - d + 1; break; }
            }
            if (cutAt > 0) {
                return [t.slice(0, cutAt).trim(), t.slice(cutAt).trim()].filter(function (s) { return s.length > 0; });
            }
            return [t.slice(0, mid).trim(), t.slice(mid).trim()];
        }

        return [t];
    }

    /* ════════════════════════════════════════
       Snap-to-Edge helpers
       ════════════════════════════════════════ */
    function _checkSnap() {
        if (!$body) return false;
        var phone = document.querySelector('.phone');
        if (!phone) return false;
        var pw = phone.offsetWidth;
        var bw = $body.offsetWidth || 72;
        var x  = parseFloat($body.style.left) || 0;
        if (x < SNAP_THRESHOLD) { _snapToEdge('left'); return true; }
        if (x + bw > pw - SNAP_THRESHOLD) { _snapToEdge('right'); return true; }
        return false;
    }

    function _snapToEdge(edge) {
        if (!$body) return;
        var phone = document.querySelector('.phone');
        if (!phone) return;
        var pw = phone.offsetWidth;
        var bw = $body.offsetWidth || 72;
        _snapState.active = true;
        _snapState.edge   = edge;
        _walkStop();
        $body.classList.add('fp-snapping');
        setTimeout(function () { $body.classList.remove('fp-snapping'); }, 500);
        if (edge === 'left') {
            _W.x = -SNAP_HALF;
            $body.classList.add('fp-snapped-left');
            $body.classList.remove('fp-snapped-right');
        } else {
            _W.x = pw - bw + SNAP_HALF;
            $body.classList.add('fp-snapped-right');
            $body.classList.remove('fp-snapped-left');
        }
        $body.style.left = Math.round(_W.x) + 'px';
        $body.classList.add('fp-walk-idle');
    }

    function _unsnap() {
        if (!$body) return;
        var phone = document.querySelector('.phone');
        if (!phone) return;
        var pw = phone.offsetWidth;
        var bw = $body.offsetWidth || 72;
        _snapState.active = false;
        _snapState.edge   = null;
        $body.classList.remove('fp-snapped-left', 'fp-snapped-right', 'fp-walk-idle');
        var margin = _W.MARGIN;
        if (_W.x < margin) _W.x = margin;
        if (_W.x + bw > pw - margin) _W.x = pw - bw - margin;
        $body.style.left = Math.round(_W.x) + 'px';
        if (_cfg.enabled) _walkResume();
    }

    /* ════════════════════════════════════════
       Events: drag + tap
       ════════════════════════════════════════ */
    function _bindEvents() {
        if (!$body) return;

        let ox = 0, oy = 0, sx = 0, sy = 0, moved = false;

        function onDown(e) {
            if ($bubble && (e.target === $bubble || $bubble.contains(e.target))) return;
            const pt = e.touches ? e.touches[0] : e;
            ox = parseFloat($body.style.left) || 0;
            oy = parseFloat($body.style.top)  || 0;
            sx = pt.clientX; sy = pt.clientY;
            moved = false; _isDragging = false;
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
            _W.x = nx; _W.y = ny;
            // 靠近边框时显示蓝光吸附提示
            var nearLeft  = nx < SNAP_THRESHOLD;
            var nearRight = nx + bw > pr.width - SNAP_THRESHOLD;
            $body.classList.toggle('fp-near-edge', nearLeft || nearRight);
        }

        function onUp() {
            $body.classList.remove('fp-dragging', 'fp-near-edge');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend',  onUp);
            _W.x  = parseFloat($body.style.left) || _W.x;
            _W.y  = parseFloat($body.style.top)  || _W.y;
            _W.tx = _W.x; _W.ty = _W.y;
            setTimeout(function () {
                _isDragging = false;
                if (!_checkSnap()) {
                    if (_cfg.enabled) _walkResume();
                }
            }, 120);
        }

        $body.addEventListener('mousedown',  onDown);
        $body.addEventListener('touchstart', onDown, { passive: true });

        if ($spriteWrap) {
            $spriteWrap.addEventListener('click', function () {
                if (moved) return;
                // 单击吸附中的桌宠 → 解除吸附
                if (_snapState.active) { _unsnap(); return; }
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
        /* 1. Load global config (enabled, charId, permGranted…) */
        try {
            const raw = localStorage.getItem('fp_cfg');
            if (raw) Object.assign(_cfg, JSON.parse(raw));
        } catch (_) {}

        /* 2. Merge per-character appearance settings from localStorage */
        if (_cfg.charId) {
            try {
                const charRaw = localStorage.getItem('fp_cfg_' + _cfg.charId);
                if (charRaw) {
                    const c = JSON.parse(charRaw);
                    if (c.style       !== undefined) _cfg.style       = c.style;
                    if (c.emoji       !== undefined) _cfg.emoji       = c.emoji;
                    if (c.customUrl   !== undefined) _cfg.customUrl   = c.customUrl;
                    if (c.gifUrl      !== undefined) _cfg.gifUrl      = c.gifUrl;
                    if (c.live2dUrl   !== undefined) _cfg.live2dUrl   = c.live2dUrl;
                    if (c.webviewHtml !== undefined) _cfg.webviewHtml = c.webviewHtml;
                    if (typeof c.intervalMin === 'number') _cfg.intervalMin = c.intervalMin;
                }
            } catch (_) {}
        }

        /* 3. Recover large data-URI fields from IDB, then start
              IDB may not be ready at DOMContentLoaded on Android; retry once after 1.5s */
        var cid = _cfg.charId;
        function _applyImgDataAndStart(imgData) {
            if (imgData && cid) {
                if (imgData.customUrl)   _cfg.customUrl   = imgData.customUrl;
                if (imgData.gifUrl)      _cfg.gifUrl      = imgData.gifUrl;
                if (imgData.live2dUrl)   _cfg.live2dUrl   = imgData.live2dUrl;
                if (imgData.webviewHtml) _cfg.webviewHtml = imgData.webviewHtml;
            }
            if (_cfg.enabled && _cfg.charId) {
                if (_isAndroid()) {
                    /* APK模式：只启动原生悬浮窗服务，不在WebView内显示桌宠，
                       防止出现"应用内小人 + 原生悬浮窗"双重叠加的情况 */
                    _androidStartOverlay();
                } else {
                    _start();
                }
            } else {
                _hide();
            }
        }
        var p = cid ? _idbGet('fp_img_' + cid) : Promise.resolve(undefined);
        p.then(function (imgData) {
            if (imgData) {
                /* Got data immediately */
                _applyImgDataAndStart(imgData);
            } else if (_cfg.enabled && cid) {
                /* IDB might not be initialised yet on Android; retry after 1.5 s */
                setTimeout(function () {
                    _idbGet('fp_img_' + cid).then(function (retryData) {
                        _applyImgDataAndStart(retryData);
                    }).catch(function () { _applyImgDataAndStart(undefined); });
                }, 1500);
            } else {
                _applyImgDataAndStart(undefined);
            }
        }).catch(function () { _applyImgDataAndStart(undefined); });
    }

    function _saveCfg() {
        /* Exclude large data-URL fields from the global key to avoid quota errors.
           Appearance details are authoritative in fp_cfg_{charId}. */
        try {
            const slim = {
                enabled:     _cfg.enabled,
                charId:      _cfg.charId,
                intervalMin: _cfg.intervalMin,
                style:       _cfg.style,
                emoji:       _cfg.emoji,
                permGranted: _cfg.permGranted
            };
            /* Only include URL fields if they are plain URLs (not data URIs) */
            if (_cfg.customUrl  && !_cfg.customUrl.startsWith('data:'))  slim.customUrl  = _cfg.customUrl;
            if (_cfg.gifUrl     && !_cfg.gifUrl.startsWith('data:'))     slim.gifUrl     = _cfg.gifUrl;
            if (_cfg.live2dUrl  && !_cfg.live2dUrl.startsWith('data:'))  slim.live2dUrl  = _cfg.live2dUrl;
            if (_cfg.webviewHtml && _cfg.webviewHtml.length < 4096)      slim.webviewHtml = _cfg.webviewHtml;
            localStorage.setItem('fp_cfg', JSON.stringify(slim));
        } catch (_) {}
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
        _clearMsgTimers();
        clearTimeout(_bubbleTimer);
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
       Scan Line  (full-screen sweep)
       ════════════════════════════════════════ */
    function _triggerScanLine() {
        if (!$scanLine) return;
        $scanLine.classList.remove('fp-line-active');
        void $scanLine.offsetWidth; /* force reflow */
        $scanLine.classList.add('fp-line-active');
        $scanLine.addEventListener('animationend', function handler() {
            $scanLine.classList.remove('fp-line-active');
            $scanLine.removeEventListener('animationend', handler);
        });
    }

    /* ════════════════════════════════════════
       Observe / Scan trigger
       ════════════════════════════════════════ */
    function triggerObserve(manual) {
        if (_scanning) return;
        _scanning = true;

        /* Only show thinking bubble — no rings / scan line / flash */
        _showThinkingBubble();

        _captureAndCall(manual, function () {
            _scanning = false;
            if (!manual) _scheduleNext();
        });
    }

    function _triggerFlash() {
        if (!_flash) return;
        _flash.classList.remove('fp-flash-go');
        void _flash.offsetWidth;
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
        if (!$bubble || !$msgList) return;
        _clearMsgTimers();
        clearTimeout(_bubbleTimer);
        $msgList.innerHTML = '';
        var ti = document.createElement('div');
        ti.className = 'fp-msg-item';
        ti.innerHTML = '<span class="fp-thinking-dots"><span></span><span></span><span></span></span>';
        $msgList.appendChild(ti);
        _positionBubble();
        $bubble.classList.add('show');
    }

    function _positionBubble() {
        if (!$bubble) return;
        if (_snapState.active) {
            $bubble.classList.remove('fp-bubble-right', 'fp-bubble-below');
            return;
        }
        const phone = document.querySelector('.phone');
        if (!phone) return;
        const pw = phone.offsetWidth;
        const cx = _W.x + 36;
        $bubble.classList.toggle('fp-bubble-right', cx > pw * 0.55);
        $bubble.classList.toggle('fp-bubble-below', _W.y < 130);
    }

    /* ════════════════════════════════════════
       Capture + AI call（先异步获取近期聊天，再截图调用）
       ════════════════════════════════════════ */
    function _captureAndCall(manual, done) {
        var ctx    = _buildContext();
        var charId = _cfg.charId;

        // 先异步获取近期聊天记录，再截图+调用AI
        _getRecentChatAsync(charId).then(function (recentChat) {
            var phone = document.querySelector('.phone');
            if (typeof html2canvas === 'function' && phone) {
                html2canvas(phone, {
                    scale: 0.45, useCORS: true, allowTaint: true,
                    backgroundColor: null, logging: false
                }).then(function (canvas) {
                    try {
                        var b64 = canvas.toDataURL('image/jpeg', 0.65).split(',')[1];
                        _callAI(ctx, b64, done, recentChat);
                    } catch (e) { _callAI(ctx, null, done, recentChat); }
                }).catch(function () { _callAI(ctx, null, done, recentChat); });
            } else {
                _callAI(ctx, null, done, recentChat);
            }
        }).catch(function () {
            var phone = document.querySelector('.phone');
            if (typeof html2canvas === 'function' && phone) {
                html2canvas(phone, {
                    scale: 0.45, useCORS: true, allowTaint: true,
                    backgroundColor: null, logging: false
                }).then(function (canvas) {
                    try {
                        var b64 = canvas.toDataURL('image/jpeg', 0.65).split(',')[1];
                        _callAI(ctx, b64, done, '');
                    } catch (e) { _callAI(ctx, null, done, ''); }
                }).catch(function () { _callAI(ctx, null, done, ''); });
            } else {
                _callAI(ctx, null, done, '');
            }
        });
    }

    function _buildContext() {
        const parts = [];

        // 当前界面识别
        const appMap = [
            ['chatLayer',       '正在聊天界面'],
            ['offlineModeView', '正在线下模式（剧情模式）'],
            ['wechatApp',       '正在消息列表'],
            ['liveApp',         '正在刷LIVE动态'],
            ['petApp',          '正在看电子宠物'],
            ['loveSpaceApp',    '正在情侣空间'],
            ['galgameApp',      '正在玩Galgame'],
            ['novelApp',        '正在看小说'],
            ['gameApp',         '正在游乐场游戏'],
            ['trackerApp',      '正在追踪模式'],
            ['payApp',          '正在查看钱包'],
            ['settingsView',    '正在设置页面'],
            ['musicPlayerView', '正在听音乐']
        ];
        let appDesc = '在手机主屏';
        let activeEl = null;
        for (let i = 0; i < appMap.length; i++) {
            const el = document.getElementById(appMap[i][0]);
            if (el && (el.classList.contains('open') || el.classList.contains('active') ||
                       el.style.display === 'flex' || el.style.display === 'block')) {
                appDesc = appMap[i][1]; activeEl = el; break;
            }
        }
        parts.push('当前界面：' + appDesc);

        // 读取屏幕上的文字（无障碍模式模拟）
        const screenText = _extractScreenText(activeEl);
        if (screenText) parts.push('屏幕内容：' + screenText);

        // 真实设备状态
        const realCtx = _RealPhone.getAllCtx();
        if (realCtx) parts.push('手机状态：' + realCtx);

        // 正在听的歌
        try {
            const songTitle = document.querySelector('.music-title, .song-name, .track-title');
            if (songTitle && songTitle.innerText) parts.push('正在听：' + songTitle.innerText.trim());
        } catch (_) {}

        // 当前时间
        const now = new Date();
        const h   = now.getHours();
        const min = now.getMinutes();
        let timeLabel = '白天';
        if      (h >= 23 || h < 4) timeLabel = '深夜';
        else if (h >= 22)          timeLabel = '夜深了';
        else if (h >= 20)          timeLabel = '晚上';
        else if (h >= 18)          timeLabel = '傍晚';
        else if (h >= 12)          timeLabel = '下午';
        else if (h < 6)            timeLabel = '凌晨';
        else if (h < 8)            timeLabel = '清晨';
        parts.push('现在' + timeLabel + h + '点' + (min > 0 ? min + '分' : ''));

        return parts.join('；');
    }

    /* ── 从DOM读取当前屏幕上的文字 ── */
    function _extractScreenText(containerEl) {
        try {
            const root = containerEl || document.querySelector('.phone');
            if (!root) return '';
            // 跳过桌宠自身
            const skip = document.getElementById('float-pet-wrap');
            const texts = [];
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                acceptNode: function(node) {
                    if (skip && skip.contains(node)) return NodeFilter.FILTER_REJECT;
                    const p = node.parentElement;
                    if (!p) return NodeFilter.FILTER_REJECT;
                    const tag = p.tagName && p.tagName.toLowerCase();
                    if (['script','style','noscript'].includes(tag)) return NodeFilter.FILTER_REJECT;
                    const style = window.getComputedStyle(p);
                    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.05) return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                }
            });
            let node;
            while ((node = walker.nextNode()) && texts.length < 60) {
                const t = node.nodeValue && node.nodeValue.trim();
                if (t && t.length > 1) texts.push(t);
            }
            return texts.join(' ').slice(0, 400);
        } catch (_) { return ''; }
    }

    /* ── 使用全局变量读取世界书（角色关联 + 全局，完整版） ── */
    function _getWorldbookContext(charId) {
        try {
            if (typeof worldBooks === 'undefined' || !worldBooks.length) return '';
            const friend = (typeof friendsData !== 'undefined') ? friendsData[charId] : null;
            var wbIds = [];
            if (friend) {
                if (Array.isArray(friend.worldbook)) wbIds = friend.worldbook;
                else if (typeof friend.worldbook === 'string' && friend.worldbook) wbIds = [friend.worldbook];
            }
            var entries = [];
            worldBooks.forEach(function (wb) {
                if (!wb.global && !wbIds.includes(wb.id)) return;
                if (!Array.isArray(wb.entries)) return;
                wb.entries
                    .filter(function (e) { return e.enabled !== false && e.content; })
                    .forEach(function (e) { entries.push(e.content); });
            });
            return entries.slice(0, 20).join('\n').slice(0, 1500);
        } catch (_) { return ''; }
    }

    /* ── 读取我的人设完整信息（含名字和关联世界书） ── */
    function _getMyPersonaInfo() {
        try {
            if (typeof personasMeta !== 'undefined' && typeof currentPersonaId !== 'undefined') {
                var me = personasMeta[currentPersonaId];
                if (!me) return { name: '', persona: '', worldbook: '' };
                var name    = me.name    || '';
                var persona = me.persona || '';
                var myWbContent = '';
                if (me.worldbook && typeof worldBooks !== 'undefined' && worldBooks.length) {
                    var myWbIds = Array.isArray(me.worldbook) ? me.worldbook : (me.worldbook ? [me.worldbook] : []);
                    var myEntries = [];
                    worldBooks.forEach(function (wb) {
                        if (!myWbIds.includes(wb.id)) return;
                        if (!Array.isArray(wb.entries)) return;
                        wb.entries
                            .filter(function (e) { return e.enabled !== false && e.content; })
                            .forEach(function (e) { myEntries.push(e.content); });
                    });
                    myWbContent = myEntries.slice(0, 8).join('\n').slice(0, 600);
                }
                return { name: name, persona: persona, worldbook: myWbContent };
            }
        } catch (_) {}
        return { name: '', persona: '', worldbook: '' };
    }

    /* ── 异步读取与该角色的近期真实聊天记录 ── */
    function _getRecentChatAsync(charId) {
        return new Promise(function (resolve) {
            // 优先从 IDB 加载真实聊天历史
            try {
                if (typeof loadChatHistory === 'function' && charId) {
                    loadChatHistory(charId).then(function (history) {
                        if (history && history.length) {
                            var recent = history
                                .filter(function (m) { return m.type !== 'summary' && m.type !== 'system' && m.text; })
                                .slice(-6);
                            if (recent.length) {
                                var lines = recent.map(function (m) {
                                    var role = m.type === 'sent' ? '我' : 'TA';
                                    return role + '：' + (m.text || '').trim().replace(/\n/g, ' ').slice(0, 60);
                                });
                                return resolve(lines.join('\n'));
                            }
                        }
                        resolve(_getRecentChatFromDOM());
                    }).catch(function () { resolve(_getRecentChatFromDOM()); });
                    return;
                }
            } catch (_) {}
            resolve(_getRecentChatFromDOM());
        });
    }

    /* ── 从DOM读取聊天记录（兜底方案） ── */
    function _getRecentChatFromDOM() {
        try {
            var msgs = document.querySelectorAll('#chatMessages .message-bubble');
            if (msgs.length) {
                var recent = Array.from(msgs).slice(-6).map(function (m) {
                    var side = m.classList.contains('sent') ? '我' : 'TA';
                    return side + '：' + (m.innerText || '').trim().slice(0, 60);
                });
                return recent.join('\n');
            }
        } catch (_) {}
        return '';
    }

    /* ── 使用全局 friendsData 读取人设 ── */
    function _getPersona(charId) {
        try {
            if (typeof friendsData !== 'undefined' && friendsData[charId]) {
                return friendsData[charId].persona || '';
            }
        } catch (_) {}
        return '';
    }

    function _getCharName(charId) {
        try {
            if (typeof friendsData !== 'undefined' && friendsData[charId]) {
                return friendsData[charId].remark || friendsData[charId].realName || 'AI';
            }
        } catch (_) {}
        return 'AI';
    }

    /* ════════════════════════════════════════
       AI Call — 与主聊天完全对齐版
       完整复用 sendMessageToAI 的 prompt 构建体系：
       好感度阶段 / 全量世界书关键词匹配 / 全量总结 / 关系日志 /
       时间感知 / 记忆互通 / STATUS块同步心声
       ════════════════════════════════════════ */
    function _callAI(contextText, screenshotB64, done, recentChat) {
        var apiKey = '', endpoint = '', model = '';
        try {
            var savedSettings = JSON.parse(localStorage.getItem('myCoolPhone_aiSettings') || '{}');
            apiKey   = savedSettings.apiKey   || '';
            endpoint = savedSettings.endpoint || '';
            model    = savedSettings.model    || '';
        } catch (_) {}

        if (!apiKey) {
            _showBubble('没有配置 API Key，设置里填写一下吧 (◕ᴗ◕✿)', 7000);
            if (done) done();
            return;
        }

        var charId   = _cfg.charId;
        var charName = _getCharName(charId);
        var myInfo   = _getMyPersonaInfo();
        var myName   = myInfo.name || '主人';

        // 从 friendsData 取完整角色数据（与 sendMessageToAI 完全一致）
        var f = (typeof friendsData !== 'undefined' && friendsData[charId]) ? friendsData[charId] : {};
        var persona      = f.persona || '';
        var chatSettings = f.chatSettings || {};

        // 全量剧情总结（与 sendMessageToAI 一致，不截断）
        var summaryText = '';
        if (f.summaries && f.summaries.length > 0) {
            summaryText = f.summaries.map(function (s, i) {
                return '- (第' + (i + 1) + '阶段) ' + s.text;
            }).join('\n');
        }

        // 全量关系日志
        var relationshipText = '';
        if (f.relationshipLog && f.relationshipLog.length > 0) {
            relationshipText = f.relationshipLog.map(function (r) { return '- ' + r.text; }).join('\n');
        }

        // 世界书：优先用 constructWorldInfoPrompt 做关键词触发，兜底用全量读取
        var wbData = { before_char: '', after_char: '', depth_items: [] };
        try {
            if (typeof constructWorldInfoPrompt === 'function') {
                var trigger = contextText + ' ' + (recentChat || '');
                wbData = constructWorldInfoPrompt(trigger, charId) || { before_char: '', after_char: '', depth_items: [] };
            }
        } catch (_) {}
        
        var fallbackCtx = _getWorldbookContext(charId);
        var wbCtx = wbData.before_char || fallbackCtx;

        // 时间感知（与 sendMessageToAI § 4 一致）
        var situationalCtx = '';
        try {
            if (typeof buildSituationalAwareness === 'function') {
                situationalCtx = buildSituationalAwareness(chatSettings) || '';
            }
        } catch (_) {}

        var now_h       = new Date().getHours();
        var battCtx     = _RealPhone.getBatteryCtx();
        var isLateNight = (now_h >= 22 || now_h < 5);
        var isEarlyAM   = (now_h >= 0  && now_h < 5);

        // ── 内部异步函数：等记忆互通加载完后再发请求 ──
        function _buildAndSend(linkedCtx) {
            /* ── 与 sendMessageToAI 对齐的完整 system prompt ── */
            var sysArr = [
                // ① 角色身份（最高优先级，与主聊天一致）
                'System Prompt: Online Chat Simulator\n'
                + 'Role Definition: You are a REAL user chatting with ' + myName + ' on a messaging app.\n\n'
                + '[Target Persona]\n'
                + 'Name: ' + charName + '\n'
                + 'Persona Description: ' + (persona || 'Helpful Assistant'),

                // ③ 世界设定（关键词触发）
                wbCtx ? '[World Setting / Lorebook Data (Important Context)]:\n' + wbCtx : '',

                // 附加世界书 (after_char)
                wbData.after_char ? '[Additional Setting]:\n' + wbData.after_char : '',

                // ④ 用户身份（与主聊天 USER IDENTITY 一致）
                myInfo.persona
                    ? '[USER IDENTITY - The person you are chatting with]:\nName: ' + myName + '\n' + myInfo.persona.slice(0, 600)
                    : '[USER IDENTITY]:\nName: ' + myName,
                myInfo.worldbook ? '（用户背景设定：' + myInfo.worldbook + '）' : '',

                // ⑤ 剧情总结（全量，与主聊天一致）
                summaryText ? '[PAST STORY SUMMARIES]:\n' + summaryText : '',

                // ⑥ 关系进度日志（与主聊天一致）
                relationshipText ? '[OUR RELATIONSHIP HISTORY]:\n' + relationshipText : '',

                // ⑦ 近期聊天记录
                recentChat ? '[最近的聊天记录]:\n' + recentChat : '',

                // ⑧ 时间感知（与主聊天 SITUATIONAL AWARENESS 一致）
                situationalCtx ? '[SITUATIONAL AWARENESS]:\n' + situationalCtx : '',

                // ⑨ 记忆互通（与主聊天 § 3 一致）
                linkedCtx || '',

                // ⑩ 桌宠专属情景说明
                '[当前情景 - 桌宠模式]\n'
                    + '现在，你正以桌宠的形式悬浮在' + myName + '的手机屏幕角落，偷偷观察TA在做什么。\n'
                    + '根据下面的屏幕情报，完全以你自己的性格、语气和说话习惯自然地冒出来——\n'
                    + '就像突然拍拍' + myName + '肩膀开口说话，绝对不是在汇报，是在真实互动。\n'
                    + '你说的每一句话都必须符合你的人设，不要变成通用助手。',

                // ⑪ 特殊时机触发
                (battCtx.includes('危急') || battCtx.includes('快没电'))
                    ? '⚡ ' + myName + '的手机快没电了，可以顺带用你自己的方式催TA充电。' : '',
                isEarlyAM   ? '🌙 现在是凌晨，' + myName + '还没睡，可以带着担心或撒娇催睡的语气。' : '',
                (isLateNight && !isEarlyAM)
                    ? '🌙 夜深了，可以顺带催' + myName + '早点睡（用你自己的方式）。' : '',

                // ⑬ STATUS 块要求（桌宠简化版：去掉心声/暗心声，只保留状态字段）
                '[SYSTEM INSTRUCTION]\n'
                + 'After your reply, append this block at the VERY END (no心声/Murmur needed here):\n'
                + '[STATUS_START]\n'
                + 'Action: (current action, short)\n'
                + 'Location: (current location)\n'
                + 'Weather: (current weather)\n'
                + 'BGM: (one fitting song - Title - Artist/Style)\n'
                + 'Kaomoji: (one matching kaomoji)\n'
                + '[STATUS_END]',

                // ⑭ 格式要求（3~4条短消息，每条15~25字，更自然的微信聊天节奏）
                '【格式要求】在STATUS块之前：用你自己的说话风格和语气，像发微信那样分3~4条极短消息说出来，每条单独一行，每条控制在15~25字以内，禁止Markdown格式，不要开场白，直接说。'
            ].filter(Boolean).join('\n\n');

            var userContent = [{ type: 'text', text: '屏幕情报：' + contextText }];
            if (screenshotB64) {
                userContent.push({
                    type: 'image_url',
                    image_url: { url: 'data:image/jpeg;base64,' + screenshotB64, detail: 'low' }
                });
            }

            if ((endpoint || '').includes('generativelanguage.googleapis.com')) {
                _callGemini(apiKey, model, sysArr, contextText, screenshotB64, done);
                return;
            }

            var base = (endpoint || '').replace(/\/+$/, '');
            var url  = base.endsWith('/v1')
                ? base + '/chat/completions'
                : base + '/v1/chat/completions';

            let finalMessages = [
                { role: 'system', content: sysArr },
                { role: 'user',   content: userContent }
            ];

            if (wbData.depth_items && wbData.depth_items.length > 0) {
                wbData.depth_items.sort(function(a, b) { return b.depth - a.depth; });
                wbData.depth_items.forEach(function(item) {
                    var depth = parseInt(item.depth) || 2;
                    var insertIndex = Math.max(0, finalMessages.length - depth);
                    finalMessages.splice(insertIndex, 0, { role: "system", content: item.content });
                });
            }

            fetch(url, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
                body: JSON.stringify({
                    model:       model,
                    max_tokens:  500,
                    temperature: 0.80,
                    messages: finalMessages
                })
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var rawReply = '';
                try { rawReply = data.choices[0].message.content.trim(); }
                catch (_) { rawReply = ''; }

                // 解析 STATUS 块并同步心声（与 sendMessageToAI 一致）
                var statusRegex = /\[STATUS_START\]([\s\S]*?)\[STATUS_END\]/i;
                var statusMatch = rawReply.match(statusRegex);
                if (statusMatch) {
                    try {
                        if (typeof parseAndApplyMindStateBlock === 'function') {
                            parseAndApplyMindStateBlock(charId, statusMatch[1]);
                        }
                    } catch (_) {}
                    rawReply = rawReply.replace(statusRegex, '').trim();
                }

                // 移除残留结构块
                rawReply = rawReply.replace(/\[DANMAKU_START\][\s\S]*/i, '').trim();
                rawReply = rawReply.replace(/\[STATUS_START\][\s\S]*/i, '').trim();

                _showBubble(rawReply, 10000);
                if (done) done();
            })
            .catch(function () {
                _showBubble('没有生成', 6000);
                if (done) done();
            });
        }

        // 异步加载记忆互通后再构建 prompt
        var linkedCtxPromise = Promise.resolve('');
        try {
            if (typeof buildLinkedMemoryContext === 'function') {
                linkedCtxPromise = buildLinkedMemoryContext(chatSettings).catch(function () { return ''; });
            }
        } catch (_) {}
        linkedCtxPromise.then(function (linkedCtx) {
            _buildAndSend(linkedCtx || '');
        }).catch(function () {
            _buildAndSend('');
        });
    }

    function _callGemini(apiKey, model, sysArr, ctxText, b64, done) {
        var mdl  = (model || 'gemini-1.5-flash').replace('models/', '');
        var url  = 'https://generativelanguage.googleapis.com/v1beta/models/'
                   + mdl + ':generateContent?key=' + apiKey;
        var fullPrompt = (Array.isArray(sysArr) ? sysArr.join('\n\n') : sysArr) + '\n\n屏幕情报：' + ctxText;
        var parts = [{ text: fullPrompt }];
        if (b64) parts.push({ inline_data: { mime_type: 'image/jpeg', data: b64 } });
        fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ contents: [{ parts: parts }] })
        })
        .then(function (r) { return r.json(); })
        .then(function (d) {
            var rawReply = '';
            try { rawReply = d.candidates[0].content.parts[0].text.trim(); }
            catch (_) { rawReply = ''; }
            // 解析 STATUS 块
            var statusRegex = /\[STATUS_START\]([\s\S]*?)\[STATUS_END\]/i;
            var statusMatch = rawReply.match(statusRegex);
            if (statusMatch) {
                try {
                    if (typeof parseAndApplyMindStateBlock === 'function') {
                        var charId = _cfg.charId;
                        parseAndApplyMindStateBlock(charId, statusMatch[1]);
                    }
                } catch (_) {}
                rawReply = rawReply.replace(statusRegex, '').trim();
            }
            rawReply = rawReply.replace(/\[DANMAKU_START\][\s\S]*/i, '').trim();
            _showBubble(rawReply, 10000);
            if (done) done();
        })
        .catch(function () {
            _showBubble('没有生成', 6000);
            if (done) done();
        });
    }

    /* ════════════════════════════════════════
       Bubble show — 微信气泡串行模式
       每条分句独占一个气泡，弹出→停留→消失→下一条
       ════════════════════════════════════════ */
    function _showBubble(text, ms) {
        if (!$bubble || !$msgList) return;
        _clearMsgTimers();
        clearTimeout(_bubbleTimer);

        var segs = _splitSentences(text);
        console.log('[FloatPet] segs(' + segs.length + '):', JSON.stringify(segs));

        _positionBubble();

        /* 先收起思考气泡，等淡出后开始串行 */
        $bubble.classList.remove('show');
        $msgList.innerHTML = '';

        var INIT_DELAY    = 350;  /* 思考气泡淡出后的停顿 ms */
        var FADE_DURATION = 260;  /* CSS opacity 淡出所需时间（≥ transition: 0.20s） */
        var BETWEEN_DELAY = 220;  /* 淡出完成后到下一条弹出的额外间隔 ms */

        /* 递归串行展示每条分句 */
        function _showSegAt(idx) {
            if (idx >= segs.length) return;

            /* 替换气泡内容并弹出 */
            $msgList.innerHTML = '';
            var item = document.createElement('div');
            item.className = 'fp-msg-item';
            item.textContent = segs[idx];
            $msgList.appendChild(item);
            _positionBubble();
            $bubble.classList.add('show');

            /* 每次弹出都震动一下 */
            _RealPhone.vibrateSpeak();

            /* 停留时长：按字数比例，最短 3500ms，最长 8000ms */
            var stayMs = Math.max(3500, Math.min(8000, segs[idx].length * 150));

            var hideTimer = setTimeout(function () {
                /* 淡出当前气泡 */
                $bubble.classList.remove('show');

                if (idx < segs.length - 1) {
                    /* 等淡出动画结束后弹出下一条 */
                    var nextTimer = setTimeout(function () {
                        _showSegAt(idx + 1);
                    }, FADE_DURATION + BETWEEN_DELAY);
                    _msgShowTimers.push(nextTimer);
                } else {
                    /* 最后一条淡出后清空内容 */
                    var cleanTimer = setTimeout(function () {
                        if ($msgList) $msgList.innerHTML = '';
                    }, FADE_DURATION);
                    _msgShowTimers.push(cleanTimer);
                }
            }, stayMs);

            _msgShowTimers.push(hideTimer);
        }

        /* 等思考气泡淡出后开始第一条 */
        var initTimer = setTimeout(function () {
            _showSegAt(0);
        }, INIT_DELAY);
        _msgShowTimers.push(initTimer);
    }

    /* ════════════════════════════════════════
       Appearance update  (支持 gif / webview / live2d)
       ════════════════════════════════════════ */
    function _updateAppearance() {
        if (!$spriteWrap) return;

        const style    = _cfg.style;
        const emojiEl  = $spriteWrap.querySelector('.fp-sprite-emoji');
        const gifEl    = $spriteWrap.querySelector('.fp-sprite-gif');
        const iframeEl = $spriteWrap.querySelector('.fp-sprite-iframe');

        /* Helper: hide all sprites then show what we need */
        function _hideAll() {
            if ($spriteImg)  { $spriteImg.style.display = 'none'; }
            if (emojiEl)     { emojiEl.style.display    = 'none'; }
            if (gifEl)       { gifEl.style.display      = 'none'; }
            if (iframeEl)    { iframeEl.style.display   = 'none'; }
            if ($body) {
                $body.classList.remove('fp-mode-webview');
            }
        }

        _hideAll();

        if (style === 'emoji') {
            /* ── Emoji ── */
            if (!$spriteImgWrap.querySelector('.fp-sprite-emoji')) {
                const sp = document.createElement('span');
                sp.className = 'fp-sprite-emoji';
                $spriteImgWrap.insertBefore(sp, $spriteImg);
            }
            const ee = $spriteImgWrap.querySelector('.fp-sprite-emoji');
            if (ee) { ee.textContent = _cfg.emoji || '🐱'; ee.style.display = ''; }

        } else if (style === 'gif') {
            /* ── Animated GIF ── */
            let ge = $spriteImgWrap.querySelector('.fp-sprite-gif');
            if (!ge) {
                ge = document.createElement('img');
                ge.className = 'fp-sprite-gif';
                ge.draggable = false;
                $spriteImgWrap.insertBefore(ge, $spriteImg);
            }
            ge.src = _cfg.gifUrl || '';
            ge.style.display = '';
            ge.onerror = function () { ge.src = 'icon.png'; ge.onerror = null; };

        } else if (style === 'live2d' || style === 'webview') {
            /* ── WebView / Live2D ── */
            let ifr = $spriteImgWrap.querySelector('.fp-sprite-iframe');
            if (!ifr) {
                ifr = document.createElement('iframe');
                ifr.className = 'fp-sprite-iframe';
                ifr.setAttribute('sandbox', 'allow-scripts allow-same-origin');
                $spriteImgWrap.insertBefore(ifr, $spriteImg);
            }
            if (style === 'live2d') {
                const live2dSrc = _cfg.live2dUrl || '';
                if (live2dSrc) {
                    ifr.src = live2dSrc;
                } else {
                    ifr.srcdoc = '<html><body style="margin:0;background:transparent;display:flex;justify-content:center;align-items:center;height:100%;font-size:40px;">🐱</body></html>';
                }
            } else {
                const htmlContent = _cfg.webviewHtml || '';
                if (htmlContent) {
                    ifr.srcdoc = htmlContent;
                } else {
                    ifr.srcdoc = '<html><body style="margin:0;background:transparent;display:flex;justify-content:center;align-items:center;height:100%;font-size:40px;">🎀</body></html>';
                }
            }
            ifr.style.display = '';
            if ($body) $body.classList.add('fp-mode-webview');

        } else {
            /* ── Avatar / Custom PNG ── */
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
            if (typeof friendsData !== 'undefined' && friendsData[charId] && friendsData[charId].avatar) {
                return friendsData[charId].avatar;
            }
        } catch (_) {}
        const a = document.querySelector('.chat-avatar-img');
        return a ? a.src : 'icon.png';
    }

    function _syncPreview() {
        const prev = document.getElementById('fp-preview-avatar-inner');
        if (!prev) return;
        const style = _cfg.style;
        if (style === 'emoji') {
            prev.textContent = _cfg.emoji || '🐱';
            prev.style.backgroundImage = '';
        } else if (style === 'gif') {
            prev.textContent = '🎞️';
            prev.style.backgroundImage = _cfg.gifUrl ? 'url(' + _cfg.gifUrl + ')' : '';
            prev.style.backgroundSize   = 'cover';
            prev.style.backgroundPosition = 'center';
        } else if (style === 'live2d') {
            prev.textContent = '🎭';
            prev.style.backgroundImage = '';
        } else if (style === 'webview') {
            prev.textContent = '🌐';
            prev.style.backgroundImage = '';
        } else {
            prev.textContent = '';
            const src = (style === 'custom' && _cfg.customUrl)
                ? _cfg.customUrl
                : _getCharAvatar(_cfg.charId);
            prev.style.backgroundImage  = 'url(' + src + ')';
            prev.style.backgroundSize   = 'cover';
            prev.style.backgroundPosition = 'center';
        }
    }

    /* ════════════════════════════════════════
       Settings sync
       ════════════════════════════════════════ */
    function syncToSettings(charId) {
        try {
            const raw = localStorage.getItem('fp_cfg_' + charId);
            if (raw) {
                const c = JSON.parse(raw);
                _cfg.style        = c.style        || 'avatar';
                _cfg.emoji        = c.emoji        || '🐱';
                _cfg.customUrl    = c.customUrl    || '';
                _cfg.gifUrl       = c.gifUrl       || '';
                _cfg.live2dUrl    = c.live2dUrl    || '';
                _cfg.webviewHtml  = c.webviewHtml  || '';
                _cfg.intervalMin  = typeof c.intervalMin === 'number' ? c.intervalMin : 10;
            } else if (charId) {
                _saveCharCfg(charId);
            }
        } catch (_) {}

        const tog = document.getElementById('cs-fp-toggle');
        if (tog) tog.checked = (_cfg.enabled && _cfg.charId === charId);
        _toggleBox(_cfg.enabled && _cfg.charId === charId);

        /* ── Interval input ── */
        const inputEl = document.getElementById('fp-interval-input');
        if (inputEl) inputEl.value = _cfg.intervalMin === 0 ? '' : _cfg.intervalMin;

        /* ── Style chips ── */
        document.querySelectorAll('.fp-style-chip').forEach(function (btn) {
            btn.classList.toggle('fp-sel-warm', btn.dataset.v === _cfg.style);
            btn.classList.remove('fp-sel');
        });

        /* ── Extra style inputs ── */
        _toggleStyleInputs(_cfg.style);

        const ei  = document.getElementById('fp-emoji-input');
        const ui  = document.getElementById('fp-url-input');
        const gi  = document.getElementById('fp-gif-input');
        const li  = document.getElementById('fp-live2d-input');
        const wi  = document.getElementById('fp-webview-html-input');
        if (ei) ei.value = _cfg.emoji       || '🐱';
        if (ui) ui.value = _cfg.customUrl && _cfg.customUrl.startsWith('data:') ? '(本地图片已导入)' : (_cfg.customUrl || '');
        if (gi) gi.value = _cfg.gifUrl    && _cfg.gifUrl.startsWith('data:')    ? '(本地图片已导入)' : (_cfg.gifUrl    || '');
        if (li) li.value = _cfg.live2dUrl   || '';
        if (wi) wi.value = _cfg.webviewHtml || '';

        _syncPreview();

        if (charId) {
            _idbGet('fp_img_' + charId).then(function (imgData) {
                if (!imgData) return;
                var changed = false;
                if (imgData.customUrl   && imgData.customUrl   !== _cfg.customUrl)   { _cfg.customUrl   = imgData.customUrl;   changed = true; }
                if (imgData.gifUrl      && imgData.gifUrl      !== _cfg.gifUrl)      { _cfg.gifUrl      = imgData.gifUrl;      changed = true; }
                if (imgData.live2dUrl   && imgData.live2dUrl   !== _cfg.live2dUrl)   { _cfg.live2dUrl   = imgData.live2dUrl;   changed = true; }
                if (imgData.webviewHtml && imgData.webviewHtml !== _cfg.webviewHtml) { _cfg.webviewHtml = imgData.webviewHtml; changed = true; }
                if (!changed) return;
                const ui2 = document.getElementById('fp-url-input');
                const gi2 = document.getElementById('fp-gif-input');
                const wi2 = document.getElementById('fp-webview-html-input');
                if (ui2 && _cfg.customUrl.startsWith('data:'))   ui2.value = '(本地图片已导入)';
                if (gi2 && _cfg.gifUrl.startsWith('data:'))      gi2.value = '(本地图片已导入)';
                if (wi2 && _cfg.webviewHtml)                     wi2.value = _cfg.webviewHtml;
                if (_cfg.enabled) _updateAppearance();
                _syncPreview();
            });
        }
    }

    function _toggleStyleInputs(style) {
        const emojiWrap   = document.getElementById('fp-emoji-wrap');
        const customWrap  = document.getElementById('fp-custom-wrap');
        const gifWrap     = document.getElementById('fp-gif-wrap');
        const live2dWrap  = document.getElementById('fp-live2d-wrap');
        const webviewWrap = document.getElementById('fp-webview-html-wrap');
        if (emojiWrap)   emojiWrap.style.display   = style === 'emoji'   ? 'block' : 'none';
        if (customWrap)  customWrap.style.display   = style === 'custom'  ? 'block' : 'none';
        if (gifWrap)     gifWrap.style.display      = style === 'gif'     ? 'block' : 'none';
        if (live2dWrap)  live2dWrap.style.display   = style === 'live2d'  ? 'block' : 'none';
        if (webviewWrap) webviewWrap.style.display  = style === 'webview' ? 'block' : 'none';
    }

    function _toggleBox(on) {
        const box = document.getElementById('cs-fp-box');
        if (box) box.style.display = on ? 'block' : 'none';
    }

    /* ════════════════════════════════════════
       Public API
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

        if (_cfg.enabled) {
            if (!_cfg.permGranted) {
                _showPermOverlay();
            } else {
                if (_isAndroid()) {
                    _androidStartOverlay();
                } else {
                    _start();
                }
            }
        } else {
            if (_isAndroid()) {
                _androidStopOverlay();
            }
            _hide();
        }
    }

    function setIntervalInput(val) {
        const trimmed = String(val).trim();
        const min = (trimmed === '' || trimmed === '0') ? 0 : parseInt(trimmed, 10);
        if (isNaN(min) || min < 0) return;
        _cfg.intervalMin = min;
        _saveCharCfg(_getCurrentCharId());
        if (_cfg.enabled) { _stopTimer(); _scheduleNext(); }
    }

    function setIntervalRandom() {
        _cfg.intervalMin = 0;
        const inputEl = document.getElementById('fp-interval-input');
        if (inputEl) { inputEl.value = ''; inputEl.focus(); inputEl.blur(); }
        _saveCharCfg(_getCurrentCharId());
        if (_cfg.enabled) { _stopTimer(); _scheduleNext(); }
    }

    function setIntervalSlider(val) {
        setIntervalInput(val);
    }

    function setInterval_fp(min, btn) {
        _cfg.intervalMin = min;
        document.querySelectorAll('.fp-interval-chip').forEach(function (b) {
            b.classList.toggle('fp-sel', b === btn);
        });
        const inputEl = document.getElementById('fp-interval-input');
        if (inputEl) inputEl.value = min === 0 ? '' : min;
        _saveCharCfg(_getCurrentCharId());
        if (_cfg.enabled) { _stopTimer(); _scheduleNext(); }
    }

    function setStyle(val, btn) {
        _cfg.style = val;
        document.querySelectorAll('.fp-style-chip').forEach(function (b) {
            b.classList.remove('fp-sel', 'fp-sel-warm');
        });
        if (btn) btn.classList.add('fp-sel-warm');
        _toggleStyleInputs(val);
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

    function onPngImport(input) {
        const file = input && input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            const dataUrl = e.target.result;
            if (_cfg.style === 'gif') {
                _cfg.gifUrl = dataUrl;
                const gi = document.getElementById('fp-gif-input');
                if (gi) gi.value = '(本地图片已导入)';
            } else {
                _cfg.style     = 'custom';
                _cfg.customUrl = dataUrl;
                const ui = document.getElementById('fp-url-input');
                if (ui) ui.value = '(本地图片已导入)';
                document.querySelectorAll('.fp-style-chip').forEach(function (b) {
                    b.classList.toggle('fp-sel-warm', b.dataset.v === 'custom');
                    b.classList.remove('fp-sel');
                });
                _toggleStyleInputs('custom');
            }
            _updateAppearance();
            _saveCharCfg(_getCurrentCharId());
            if (input) input.value = '';
        };
        reader.onerror = function () {
            alert('图片读取失败，请重试');
        };
        reader.readAsDataURL(file);
    }

    function onGifChange(val) {
        _cfg.gifUrl = val;
        _updateAppearance();
        _saveCharCfg(_getCurrentCharId());
    }

    function onLive2dChange(val) {
        _cfg.live2dUrl = val;
        _updateAppearance();
        _saveCharCfg(_getCurrentCharId());
    }

    function onWebviewHtmlChange(val) {
        _cfg.webviewHtml = val;
        _updateAppearance();
        _saveCharCfg(_getCurrentCharId());
    }

    function _getCurrentCharId() {
        const h = document.getElementById('cs-char-id');
        if (h && h.value) return h.value;
        if (_cfg.charId) return _cfg.charId;
        try {
            if (typeof friendsData !== 'undefined') {
                const ids = Object.keys(friendsData);
                if (ids.length) return ids[0];
            }
        } catch (_) {}
        return null;
    }

    function _saveCharCfg(charId) {
        const id = charId || _cfg.charId;
        if (id) {
            const smallCfg = {
                style:       _cfg.style,
                emoji:       _cfg.emoji,
                intervalMin: _cfg.intervalMin
            };
            if (_cfg.customUrl   && !_cfg.customUrl.startsWith('data:'))   smallCfg.customUrl   = _cfg.customUrl;
            if (_cfg.gifUrl      && !_cfg.gifUrl.startsWith('data:'))      smallCfg.gifUrl      = _cfg.gifUrl;
            if (_cfg.live2dUrl   && !_cfg.live2dUrl.startsWith('data:'))   smallCfg.live2dUrl   = _cfg.live2dUrl;
            if (_cfg.webviewHtml && _cfg.webviewHtml.length < 4096)        smallCfg.webviewHtml = _cfg.webviewHtml;
            try { localStorage.setItem('fp_cfg_' + id, JSON.stringify(smallCfg)); } catch (_) {}

            _idbSet('fp_img_' + id, {
                customUrl:   _cfg.customUrl   || '',
                gifUrl:      _cfg.gifUrl      || '',
                live2dUrl:   _cfg.live2dUrl   || '',
                webviewHtml: _cfg.webviewHtml || ''
            });
        }
        _saveCfg();
        /* 每次设置变更时同步更新 Android overlay 的 SharedPreferences，
           确保 overlay 下次触发时使用最新的形象与人设数据 */
        if (_cfg.enabled) _saveOverlayConfig();
    }

    /* ════════════════════════════════════════
       Public exports
       ════════════════════════════════════════ */
    return {
        init:                init,
        refresh: function () {
            if (_cfg.enabled) _updateAppearance();
        },
        onToggle:            onToggle,
        setInterval:         setInterval_fp,
        setIntervalSlider:   setIntervalSlider,
        setIntervalInput:    setIntervalInput,
        setIntervalRandom:   setIntervalRandom,
        setStyle:            setStyle,
        onEmojiChange:       onEmojiChange,
        onUrlChange:         onUrlChange,
        onPngImport:         onPngImport,
        onGifChange:         onGifChange,
        onLive2dChange:      onLive2dChange,
        onWebviewHtmlChange: onWebviewHtmlChange,
        syncToSettings:      syncToSettings,
        triggerObserve:      triggerObserve,
        showBubble:          _showBubble
    };

})();

/* Auto-init after DOM ready */
document.addEventListener('DOMContentLoaded', function () {
    FloatPet.init();
});
