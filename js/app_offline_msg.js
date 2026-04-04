/**
 * app_offline_msg.js
 * =====================================================================
 * 双模式消息生成模块
 *
 * 模式一：离线批量消息（Open-on-App-Launch 模式）
 *  - APP 启动时调用 checkAndGenerateOfflineMsgsOnAppOpen()
 *  - 遍历所有开启了离线消息的好友
 *  - 若距上次生成时间超过设定间隔，调用一次 AI API 批量生成 N 条消息
 *  - 消息以"历史时间戳"写入 IndexedDB，触发未读红点
 *  - 无需后台挂起，完全依赖打开 APP 触发
 *
 * 模式二（已移除）：原"后台定时消息"与"无操作主动发言"功能重复，已统一删除。
 * =====================================================================
 */

// ─────────────────────────────────────────────────────────────────────
// 通用底层 AI 调用函数
// （供离线消息 & 后台定时消息两种模式共用）
// ─────────────────────────────────────────────────────────────────────
/**
 * callAIAPI - 轻量级 AI 接口调用封装
 * @param {string}   systemPrompt     系统提示词
 * @param {string}   userMessage      用户消息
 * @param {Array}    contextMessages  追加到 messages 数组的上下文（可选）
 * @param {number}   maxTokens        最大 token 数（可选，默认 800）
 * @param {AbortSignal} signal        中止信号（可选）
 * @param {boolean}  noStream         忽略流式设置（始终非流式，此参数保留兼容性）
 * @returns {Promise<string>}
 */
window.callAIAPI = async function(systemPrompt, userMessage, contextMessages, maxTokens, signal, noStream) {
    const SETTINGS_KEY_LOCAL = 'myCoolPhone_aiSettings';
    const settingsJSON = localStorage.getItem(SETTINGS_KEY_LOCAL);
    if (!settingsJSON) throw new Error('callAIAPI: API 未配置，请先在设置中填写 API Key');

    const s = JSON.parse(settingsJSON);
    if (!s.apiKey || !s.endpoint || !s.model) {
        throw new Error('callAIAPI: API Key / Endpoint / Model 未填写完整');
    }

    let baseUrl = (s.endpoint || '').replace(/\/$/, '');
    const apiUrl = baseUrl.endsWith('/v1')
        ? `${baseUrl}/chat/completions`
        : `${baseUrl}/v1/chat/completions`;

    const messages = [{ role: 'system', content: systemPrompt }];
    if (Array.isArray(contextMessages) && contextMessages.length > 0) {
        messages.push(...contextMessages);
    }
    messages.push({ role: 'user', content: userMessage });

    const fetchOpts = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${s.apiKey}`
        },
        body: JSON.stringify({
            model: s.model,
            messages: messages,
            temperature: parseFloat(s.temperature || 0.8),
            max_tokens: maxTokens || 800
        })
    };
    if (signal) fetchOpts.signal = signal;

    const res = await fetch(apiUrl, fetchOpts);
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`callAIAPI: HTTP ${res.status}\n${errText}`);
    }
    const data = await res.json();
    return (data?.choices?.[0]?.message?.content || '').trim();
};

// ─────────────────────────────────────────────────────────────────────
// 内部工具：获取好友世界书文本（完整版：支持 entries、全局世界书）
// ─────────────────────────────────────────────────────────────────────
function _offmsg_getWorldbookText(friend) {
    var texts = [];

    // ── 1. 全局启用的世界书（global: true，所有角色共享） ──────────────
    if (typeof worldBooks !== 'undefined' && worldBooks.length > 0) {
        worldBooks.filter(function(wb) { return wb.global; }).forEach(function(wb) {
            if (wb.entries && wb.entries.length) {
                wb.entries
                    .filter(function(e) { return e.enabled !== false; })
                    .forEach(function(e) { if ((e.content || '').trim()) texts.push(e.content); });
            } else {
                var t = (wb.description || wb.content || '').trim();
                if (t) texts.push(t);
            }
        });
    }

    // ── 2. 角色绑定的世界书 ────────────────────────────────────────────
    if (!friend.worldbook) return texts.join('\n\n');

    var raw = friend.worldbook;
    if (typeof worldBooks !== 'undefined' && worldBooks.length > 0) {
        var ids = Array.isArray(raw) ? raw : [raw];
        ids.forEach(function(id) {
            // 已被全局收录的不重复添加
            var wb = worldBooks.find(function(w) { return w.id === id; });
            if (wb) {
                if (wb.global) return; // 全局世界书已在步骤1中收录
                if (wb.entries && wb.entries.length) {
                    wb.entries
                        .filter(function(e) { return e.enabled !== false; })
                        .forEach(function(e) { if ((e.content || '').trim()) texts.push(e.content); });
                } else {
                    var t = (wb.description || wb.content || wb.title || '').trim();
                    if (t) texts.push(t);
                }
            } else if (typeof id === 'string' && id.length > 36) {
                // 旧格式兼容：字段本身就是文本内容
                texts.push(id);
            }
        });
    } else if (typeof raw === 'string' && raw.trim()) {
        texts.push(raw);
    }

    return texts.filter(function(t) { return (t || '').trim(); }).join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────
// 内部工具：刷新联系人列表某好友的红点
// ─────────────────────────────────────────────────────────────────────
function _offmsg_refreshBadge(friendId) {
    const count = (friendsData[friendId] && friendsData[friendId].unreadCount) || 0;
    const avatarBox = document.querySelector(`.chat-list-item[data-id="${friendId}"] .wc-avatar-box`);
    if (!avatarBox) return;
    let badge = avatarBox.querySelector('.wc-badge');
    if (count > 0) {
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'wc-badge';
            avatarBox.appendChild(badge);
        }
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.style.display = 'flex';
    } else {
        if (badge) badge.style.display = 'none';
    }
}

// ─────────────────────────────────────────────────────────────────────
// 内部工具：刷新聊天列表某好友的预览文字 & 红点气泡
// ─────────────────────────────────────────────────────────────────────
function _offmsg_refreshChatListItem(friendId, lastText) {
    const items = document.querySelectorAll('.wc-chat-item');
    items.forEach(item => {
        if (item.getAttribute('data-chat-id') !== friendId) return;

        const preview = item.querySelector('.wc-msg-preview');
        if (preview) {
            preview.innerText = lastText && lastText.length > 25
                ? lastText.slice(0, 25) + '...'
                : (lastText || '');
        }

        const timeEl = item.querySelector('.wc-time');
        if (timeEl) timeEl.innerText = 'Just now';

        const unread = (friendsData[friendId] && friendsData[friendId].unreadCount) || 0;
        const avatarBox = item.querySelector('.wc-avatar');
        if (avatarBox && unread > 0) {
            let badge = avatarBox.querySelector('.wc-badge');
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'wc-badge';
                avatarBox.appendChild(badge);
            }
            badge.innerText = unread > 99 ? '99+' : unread;
        }
    });
}

// ─────────────────────────────────────────────────────────────────────
// 模式一核心：为单个好友生成离线消息（历史时间戳，打开APP时触发）
// ─────────────────────────────────────────────────────────────────────
/**
 * @param {string}  friendId
 * @param {boolean} forceGenerate  忽略时间间隔强制生成（手动触发按钮用）
 * @returns {Promise<boolean>}     是否成功生成
 */
window.generateOfflineMsgsForFriend = async function(friendId, forceGenerate) {
    forceGenerate = !!forceGenerate;

    if (!friendsData || !friendsData[friendId]) return false;
    const friend = friendsData[friendId];
    if (friend.type === 'group') return false;

    const settings = friend.chatSettings || {};

    // 如果未开启离线消息开关，直接跳过（手动强制触发除外）
    if (!forceGenerate && !settings.offlineMsgEnabled) return false;

    const intervalHours = parseFloat(settings.offlineMsgInterval) || 2;
    const nowTs         = Date.now();
    
    const lastOffTime   = settings.lastOfflineMsgTime || 0;
    const lastChatTime  = settings.lastChatTime || 0;
    const globalActive  = parseInt(localStorage.getItem('myCoolPhone_lastActive') || 0, 10);
    
    // 基本时间取：上次生成时间、上次聊天时间、上次离开APP时间中最近的一个
    let baseTime = Math.max(lastOffTime, lastChatTime, globalActive);

    // 首次开启：记录当前时间，不立即生成（避免一开启就刷屏）
    if (lastOffTime === 0 && !forceGenerate) {
        if (!friend.chatSettings) friend.chatSettings = {};
        friend.chatSettings.lastOfflineMsgTime = nowTs;
        await saveFriendsData();
        return false;
    }

    // 若无基准时间或强行生成，默认使用前1小时
    if (!baseTime || forceGenerate) {
        baseTime = nowTs - 3600000;
    }

    const elapsedMs    = nowTs - baseTime;
    const elapsedHours = elapsedMs / 3600000;

    if (!forceGenerate && elapsedHours < intervalHours) return false;

    // 防重入
    if (friend._offlineMsgGenerating) return false;
    friend._offlineMsgGenerating = true;

    try {
        // ── 1. Tavern Preset ────────────────────────────────────────
        let presetJailbreak = '';
        if (typeof tavernPresets !== 'undefined' && typeof offlineConfig !== 'undefined') {
            const pid = offlineConfig.activePresetId;
            const preset = tavernPresets.find(p => p.id === pid) || tavernPresets[0];
            if (preset && preset.jailbreak) presetJailbreak = preset.jailbreak;
        }

        // ── 3. 用户人设 ────────────────────────────────────────────
        let myPersonaText = '';
        if (typeof personasMeta !== 'undefined' && typeof currentPersonaId !== 'undefined') {
            const me = personasMeta[currentPersonaId];
            if (me && me.persona) myPersonaText = me.persona;
        }

        // ── 4. 世界书 ──────────────────────────────────────────────
        const worldbookText = _offmsg_getWorldbookText(friend);

        // ── 5. 文风 ────────────────────────────────────────────────
        let writingStyleText = '';
        if (typeof offlineConfig !== 'undefined' && offlineConfig.writingStyle) {
            writingStyleText = offlineConfig.writingStyle;
        }

        // ── 6. 记忆总结 ────────────────────────────────────────────
        let summaryBlock = '';
        if (friend.summaries && friend.summaries.length > 0) {
            const summaryLines = friend.summaries.map((s, i) => `- (第${i+1}阶段) ${s.text}`).join('\n');
            summaryBlock = `\n\n【过往故事记忆】：\n${summaryLines}`;
        }

        // ── 7. 最近聊天记录（上下文） ──────────────────────────────
        const memoryLimit = parseInt(settings.memoryLimit || 20);
        const limit = parseInt(offlineConfig.maxLength) || 200;
        let historyContext = '（暂无历史记录）';
        if (typeof loadChatHistory === 'function') {
            const allHistory = (await loadChatHistory(friendId)) || [];
            const recent = allHistory.slice(-memoryLimit);
            if (recent.length > 0) {
                const lines = recent.map(h => {
                    if (h.type === 'system') return null;
                    const sender = h.type === 'sent' ? '用户' : (friend.remark || friend.realName);
                    return `${sender}: ${(h.text || '').slice(0, 120)}`;
                }).filter(Boolean);
                if (lines.length > 0) historyContext = lines.join('\n');
            }
        }

        // ── 8. 经过时间描述 ────────────────────────────────────────
        const actualElapsed = (forceGenerate && elapsedHours < 0.1) ? 1 : elapsedHours;
        let hoursDesc;
        if (actualElapsed < 1)       hoursDesc = `${Math.round(actualElapsed * 60)}分钟`;
        else if (actualElapsed < 24) hoursDesc = `${Math.round(actualElapsed)}小时`;
        else                         hoursDesc = `${Math.round(actualElapsed / 24)}天`;

        // ── 系统提示词 ─────────────────────────────────────────────
        const friendName = friend.remark || friend.realName || friendId;

        let systemPrompt = `你是${friendName}。请严格按照以下设定扮演这个角色，通过微信给用户发消息。

【角色人设】：
${friend.persona || '（无特殊人设）'}`;

        if (worldbookText) systemPrompt += `\n\n【世界观/背景设定】：\n${worldbookText}`;
        if (presetJailbreak) systemPrompt += `\n\n${presetJailbreak}`;
        if (myPersonaText)    systemPrompt += `\n\n【用户身份】：${myPersonaText}`;
        if (writingStyleText) systemPrompt += `\n\n【文风要求】：${writingStyleText}`;
        systemPrompt += summaryBlock;

        // ── 用户指令 ───────────────────────────────────────────────
        const userMessage = `用户已经有${hoursDesc}没有打开这个应用了。
现在用户刚刚重新打开了手机，请作为${friendName}，生成你在这段时间内主动发给用户的微信消息，条数由你自由发挥。

【近期聊天记录（供参考）】：
${historyContext}

【生成要求】：
1. 直接输出消息内容，每条独立一行，条与条空一行。
2. 不加序号、引号、前缀，不生成用户回复。
3. 请控制每条消息的字数在 ${limit} 字以内。
4. 严格遵循人设。拒绝OOC，保持角色的独立生活感。
5. 必须符合微信聊天习惯：严禁长篇大论，把想说的话拆分成一小段一小段的短消息发送。
6. 发送的消息条数自由发挥，话题自然且避免重复。`;

        // ── 调用 AI ────────────────────────────────────────────────
        let rawText = '';
        try {
            rawText = await callAIAPI(systemPrompt, userMessage, null, null, null, true);
        } catch (e) {
            console.error('[OfflineMsg] API call failed:', e);
            delete friend._offlineMsgGenerating;
            return false;
        }

        if (!rawText || !rawText.trim()) {
            delete friend._offlineMsgGenerating;
            return false;
        }

        // ── 解析消息 ───────────────────────────────────────────────
        const parsedLines = rawText.split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0)
            .map(l => l.replace(/^[\(（【\[]?\d+[\)）】\]\.、。]\s*/, '').trim())
            .map(l => {
                const ci = l.indexOf('：') > -1 ? l.indexOf('：') : l.indexOf(':');
                if (ci > 0 && ci <= 8) {
                    const prefix = l.slice(0, ci).trim();
                    if (prefix === friendName || prefix === '我' || prefix === friend.realName) {
                        return l.slice(ci + 1).trim();
                    }
                }
                return l;
            })
            .filter(l => l.length > 0);

        if (parsedLines.length === 0) {
            delete friend._offlineMsgGenerating;
            return false;
        }

        // ── 写入历史记录（带历史时间戳）──────────────────────────
        // 时间戳均匀分布在 [lastTime, nowTs-1min] 区间内
        const baseTs  = lastTime || (nowTs - elapsedMs);
        const rangeMs = Math.max(elapsedMs - 60000, 60000);
        const step    = rangeMs / (parsedLines.length + 1);

        if (typeof IDB !== 'undefined' && typeof scopedChatKey === 'function') {
            let history = (await IDB.get(scopedChatKey(friendId))) || [];

            for (let i = 0; i < parsedLines.length; i++) {
                const msgTs = Math.round(baseTs + step * (i + 1));
                const msgId = 'offbatch_' + msgTs + '_' + i;
                history.push({
                    id:             msgId,
                    text:           parsedLines[i],
                    type:           'received',
                    senderName:     friend.realName || friendId,
                    customAvatar:   friend.avatar || '',
                    timestamp:      msgTs,
                    isOfflineBatch: true,
                });
            }

            history.sort(function(a, b) { return (a.timestamp || 0) - (b.timestamp || 0); });
            await IDB.set(scopedChatKey(friendId), history);
        } else {
            for (var li = 0; li < parsedLines.length; li++) {
                await saveMessageToHistory(friendId, {
                    text:           parsedLines[li],
                    type:           'received',
                    senderName:     friend.realName || friendId,
                    customAvatar:   friend.avatar || '',
                    isOfflineBatch: true,
                });
            }
        }

        // ── 更新未读数、最后消息、时间戳 ─────────────────────────
        if (!friend.chatSettings) friend.chatSettings = {};
        friend.unreadCount = (friend.unreadCount || 0) + parsedLines.length;
        friend.chatSettings.lastOfflineMsgTime = nowTs;
        friend.lastMessage = parsedLines[parsedLines.length - 1];

        await saveFriendsData();

        _offmsg_refreshBadge(friendId);
        _offmsg_refreshChatListItem(friendId, friend.lastMessage);
        if (typeof updateTotalUnreadBadge === 'function') updateTotalUnreadBadge();
        if (typeof updateDockUnreadDot === 'function') updateDockUnreadDot();

        // 如果当前正在这个聊天里，刷新聊天界面
        if (typeof currentChatId !== 'undefined' && currentChatId === friendId) {
            if (typeof openChatDetail === 'function') {
                setTimeout(function() { openChatDetail(friendId); }, 200);
            }
        }

        delete friend._offlineMsgGenerating;
        return true;

    } catch (err) {
        console.error('[OfflineMsg] Unexpected error:', err);
        delete friend._offlineMsgGenerating;
        return false;
    }
};

// ─────────────────────────────────────────────────────────────────────
// 记录APP全局活跃时间（用于离线消息的时间判断基准）
// ─────────────────────────────────────────────────────────────────────
function _updateAppGlobalActiveTime() {
    localStorage.setItem('myCoolPhone_lastActive', Date.now().toString());
}
window.addEventListener('beforeunload', _updateAppGlobalActiveTime);
window.addEventListener('visibilitychange', () => {
    if (document.hidden) _updateAppGlobalActiveTime();
});
setInterval(_updateAppGlobalActiveTime, 60000);

// ─────────────────────────────────────────────────────────────────────
// 模式一：APP 打开时检查所有好友，生成到期的离线消息
// ─────────────────────────────────────────────────────────────────────
window.checkAndGenerateOfflineMsgsOnAppOpen = async function() {
    if (!friendsData) return;
    const friendIds = Object.keys(friendsData);
    if (friendIds.length === 0) return;

    let generatedCount = 0;

    for (var i = 0; i < friendIds.length; i++) {
        var fid = friendIds[i];
        var f   = friendsData[fid];
        if (!f || f.type === 'group') continue;
        var cs = f.chatSettings || {};

        try {
            var ok = await window.generateOfflineMsgsForFriend(fid, false);
            if (ok) generatedCount++;
        } catch(e) {
            console.warn('[OfflineMsg] Failed for', fid, e);
        }
    }

    if (generatedCount > 0) {
        if (typeof showToast === 'function') {
            showToast('✉️ 收到 ' + generatedCount + ' 位好友的离线消息');
        }
    }
};


// ─────────────────────────────────────────────────────────────────────
// 手动触发函数（聊天设置页"立即生成"按钮使用）
// ─────────────────────────────────────────────────────────────────────

// 占位：模式二已删除，此处保留仅作注释
window.generateLiveMsgsForFriend = async function(friendId, forceGenerate) {
    // 模式二已删除，此函数保留为空存根，避免旧引用报错
    return false;
};

// 定时器存根（模式二已删除，保留空函数防止旧引用报错）
window.startLiveMsgTimers  = function() {};
window.stopLiveMsgTimers   = function() {};
window.restartLiveMsgTimers = function() {};

// ─────────────────────────────────────────────────────────────────────
// 手动触发函数（聊天设置页"立即生成"按钮使用）
// ─────────────────────────────────────────────────────────────────────

/**
 * manualTriggerOfflineMsg
 * 忽略时间间隔，立即为当前聊天的角色生成一批离线消息（历史时间戳写入）。
 * 在聊天设置页的"立即生成一次"按钮中调用。
 */
window.manualTriggerOfflineMsg = async function() {
    if (typeof currentChatId === 'undefined' || !currentChatId) {
        if (typeof showToast === 'function') showToast('请先进入一个聊天');
        return;
    }
    const btn = document.getElementById('offline-msg-manual-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...'; }

    if (typeof showToast === 'function') showToast('⚡ 正在调用 AI 生成离线消息...');

    try {
        const ok = await window.generateOfflineMsgsForFriend(currentChatId, true);
        if (typeof showToast === 'function') {
            showToast(ok
                ? '✅ 离线消息已生成！返回聊天即可看到'
                : '❌ 生成失败，请确认 API 配置正确且角色已启用离线消息');
        }
    } catch(e) {
        if (typeof showToast === 'function') showToast('❌ 出错：' + (e.message || e));
    }

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-bolt"></i> 立即生成一次（忽略间隔）'; }
};
