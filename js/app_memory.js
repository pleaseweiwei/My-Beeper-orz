/* =========================================
   app_memory.js — 五维记忆引擎 v2.0
   数据模型已对齐 apps.js:
   - 好友数据: friendsData[chatId]  (全局内存对象)
   - 聊天历史: loadChatHistory(chatId) / IDB.set(scopedChatKey(chatId), ...)
   - 存档数据: IDB 以 'mem_checkpoints_' + scopedChatKey(chatId) 为 key
   ========================================= */

/* ─── § 1  短期记忆：时间戳格式化 ─── */
function formatMsgTimestamp(ts) {
    const d = ts ? new Date(ts) : new Date();
    const pad = n => String(n).padStart(2, '0');
    return `[${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}]`;
}

/* 将消息数组（apps.js 格式: {type:'sent'/'received', text, timestamp}）
   转换为带时间戳的上下文字符串，多模态内容自动转义 */
window.buildTimestampedContext = function(history, memoryLimit) {
    const limit = parseInt(memoryLimit) || 20;
    const recent = limit > 0 ? history.slice(-limit) : history;
    return recent.map(m => {
        if (m.type === 'system' || m.type === 'summary') return null;
        const role = m.type === 'sent' ? '用户' : 'AI';
        const ts = formatMsgTimestamp(m.timestamp);
        let content = m.text || '';

        // 多模态内容转义
        if (/^\[表情:.*?\]$/.test(content.trim())) {
            const name = content.trim().match(/^\[表情:(.*?)\]$/)?.[1] || '';
            content = `[用户发送了一个表情: ${name}]`;
        } else if (content.startsWith('[VOICE]')) {
            const txt = content.replace('[VOICE]', '').trim();
            content = txt ? `[语音消息: "${txt}"]` : '[语音消息]';
        } else if (m.type === 'transfer' || /^\[转账\]/.test(content)) {
            content = `[转账] ${content}`;
        } else if (m.type === 'location' || /^\[位置\]/.test(content)) {
            content = content;
        }

        return `${ts} ${role}: ${content}`;
    }).filter(Boolean).join('\n');
};

/* ─── § 2  长期记忆：一键精简所有总结 ─── */
window.condenseSummaries = async function() {
    const chatId = typeof window.getCurrentChatId === 'function' ? window.getCurrentChatId() : window.currentChatId;
    if (!chatId) return;
    const friend = (typeof friendsData !== 'undefined') ? friendsData[chatId] : null;
    if (!friend || !friend.summaries || friend.summaries.length === 0) {
        window.showToast('大脑空空，没有任何记忆碎片可供融合。'); return;
    }
    if (friend.summaries.length === 1) {
        window.showToast('只有一段记忆，无需精简。'); return;
    }
    const combined = friend.summaries.map((s, i) => `【片段${i+1}】${s.text}`).join('\n---\n');
    const prompt = `请将以下多段剧情总结，压缩成一段不超过200字的核心纲要，保留最关键的事件与情感转折，去掉重复信息：\n\n${combined}`;
    window.showToast('AI 正在精简记忆...');
    try {
        const condensed = await callAIRaw(prompt);
        const startTurn = friend.summaries[0]?.startTurn || 0;
        const endTurn = friend.summaries[friend.summaries.length - 1]?.endTurn || 0;
        friend.summaries = [{
            text: condensed,
            startTurn,
            endTurn,
            isCondensed: true
        }];
        if (typeof saveFriendsData === 'function') await saveFriendsData();
        window.showToast('记忆精简完成！');
        if (typeof renderSummaryUI === 'function') renderSummaryUI();
    } catch (e) {
        window.showToast('精简失败: ' + e.message);
    }
};

/* ─── § 3  记忆互通：构建跨聊天上下文注入 ─── */
window.buildLinkedMemoryContext = async function(chatSettings) {
    const linked = chatSettings && chatSettings.linkMemory;
    if (!linked || !linked.linkedChatIds || linked.linkedChatIds.length === 0) return '';
    const depth = parseInt(linked.linkMemoryDepth) || 5;
    const fd = (typeof friendsData !== 'undefined') ? friendsData : {};
    let result = '';
    for (const linkedId of linked.linkedChatIds) {
        const friend = fd[linkedId];
        if (!friend) continue;
        let hist = [];
        try {
            if (typeof loadChatHistory === 'function') {
                hist = await loadChatHistory(linkedId) || [];
            } else if (typeof IDB !== 'undefined' && typeof scopedChatKey === 'function') {
                hist = await IDB.get(scopedChatKey(linkedId)) || [];
            }
        } catch (e) { continue; }
        const recentReal = hist
            .filter(m => m.type !== 'summary' && m.type !== 'system')
            .slice(-depth);
        if (recentReal.length === 0) continue;
        const name = friend.remark || friend.realName || linkedId;
        const lines = recentReal.map(m => {
            const role = m.type === 'sent' ? '用户' : name;
            const ts = formatMsgTimestamp(m.timestamp);
            let c = m.text || '[多媒体内容]';
            if (/^\[表情:.*?\]$/.test(c.trim())) {
                c = `[表情: ${c.match(/^\[表情:(.*?)\]$/)?.[1] || ''}]`;
            }
            return `${ts} ${role}: ${c}`;
        }).join('\n');
        result += `\n\n# 附加上下文：来自与"${name}"的最近对话内容 (仅你可见)\n${lines}`;
    }
    return result;
};

/* ─── § 4  动态情景记忆：时间感知 ─── */
window.buildSituationalAwareness = function(chatSettings) {
    const timeOn = chatSettings && chatSettings.timeAwareness !== undefined ? chatSettings.timeAwareness : true;

    if (!timeOn) {
        // 时间感知关闭：使用自定义时间（穿越剧情）或不注入任何时间信息
        const customTime = chatSettings && chatSettings.customTime;
        if (customTime && customTime.trim()) {
            return `当前时间: ${customTime.trim()}`;
        }
        return ''; // 完全不注入时间
    }

    // 时间感知开启：使用真实北京时间
    const now = Date.now();
    const lastTime = chatSettings && chatSettings.lastChatTime;
    let timeLine = '';
    if (lastTime) {
        const diffMs = now - lastTime;
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 2) {
            timeLine = '(你们刚刚在聊天)';
        } else if (diffMin < 60) {
            timeLine = `(距离上次对话约 ${diffMin} 分钟)`;
        } else if (diffMin < 1440) {
            timeLine = `(距离上次对话约 ${Math.floor(diffMin / 60)} 小时)`;
        } else {
            timeLine = `(你们已经有 ${Math.floor(diffMin / 1440)} 天没有聊天了)`;
        }
    }
    const now_d = new Date(now);
    const pad = n => String(n).padStart(2, '0');
    const realTimeStr = `${now_d.getFullYear()}-${pad(now_d.getMonth()+1)}-${pad(now_d.getDate())} ${pad(now_d.getHours())}:${pad(now_d.getMinutes())}`;
    return `当前真实时间: ${realTimeStr} ${timeLine}`;
};

/* ─── § 5  记忆分支与回溯：存档/读档系统 ─── */

/* 统一获取当前活跃 chatId（兼容 apps.js 的 let 局部变量） */
function _getActiveChatId() {
    return typeof window.getCurrentChatId === 'function'
        ? window.getCurrentChatId()
        : window.currentChatId;
}

/* 获取当前聊天的存档 IDB key */
function _cpKey(chatId) {
    const scoped = (typeof scopedChatKey === 'function') ? scopedChatKey(chatId) : chatId;
    return 'mem_checkpoints_' + scoped;
}

/* 列出当前聊天的所有存档 */
window.listCheckpoints = async function(chatId) {
    return await IDB.get(_cpKey(chatId)) || [];
};

/* 保存存档 */
window.saveCheckpoint = async function() {
    const chatId = _getActiveChatId();
    if (!chatId) { window.showToast('未找到当前聊天'); return; }
    const fd = (typeof friendsData !== 'undefined') ? friendsData : {};
    const friend = fd[chatId] || {};
    let history = [];
    try {
        if (typeof loadChatHistory === 'function') {
            history = await loadChatHistory(chatId) || [];
        }
    } catch (e) {}
    const points = await IDB.get(_cpKey(chatId)) || [];
    const now = Date.now();
    const label = friend.remark || friend.realName || chatId;
    const msgCount = history.filter(m => m.type !== 'summary' && m.type !== 'system').length;
    const cp = {
        id: 'cp_' + now,
        timestamp: now,
        label: `[${label}] ${formatMsgTimestamp(now)} — 共${msgCount}条消息`,
        history: JSON.parse(JSON.stringify(history)),
        // 快照好友记忆相关字段（不含 AI 人设配置，避免误覆盖）
        friendSnapshot: {
            affection: friend.affection || 0,
            mindState: JSON.parse(JSON.stringify(friend.mindState || {})),
            summaries: JSON.parse(JSON.stringify(friend.summaries || [])),
            relationshipLog: JSON.parse(JSON.stringify(friend.relationshipLog || []))
        }
    };
    points.unshift(cp);
    if (points.length > 20) points.splice(20);
    await IDB.set(_cpKey(chatId), points);
    window.showToast('存档成功 ✓');
    renderCheckpointList();
};

/* 读档：物理覆盖当前历史和记忆字段 */
window.loadCheckpoint = async function(cpId) {
    const chatId = _getActiveChatId();
    if (!chatId) return;
    const points = await IDB.get(_cpKey(chatId)) || [];
    const cp = points.find(p => p.id === cpId);
    if (!cp) { window.showToast('存档不存在'); return; }
    if (!confirm(`确定读取存档「${cp.label}」？\n当前所有聊天记录将被覆盖，此操作不可撤销。`)) return;

    // 恢复聊天历史到 IDB
    const histKey = (typeof scopedChatKey === 'function') ? scopedChatKey(chatId) : chatId;
    let restoreHistory = JSON.parse(JSON.stringify(cp.history));
    // 注入隐藏系统提示，告知 AI 记忆已回溯
    restoreHistory.push({
        id: 'hint_' + Date.now(),
        type: 'system',
        text: '[系统提示：一些之前的消息已被用户删除或回溯。你应该像它们从未存在过一样继续对话，完全遵循当前记忆中的剧情状态。]',
        timestamp: Date.now(),
        isRevoked: false
    });
    await IDB.set(histKey, restoreHistory);

    // 恢复好友记忆快照（只恢复记忆字段，不覆盖人设配置）
    const fd = (typeof friendsData !== 'undefined') ? friendsData : {};
    if (fd[chatId] && cp.friendSnapshot) {
        const snap = cp.friendSnapshot;
        fd[chatId].affection = typeof snap.affection === 'number' ? snap.affection : fd[chatId].affection;
        fd[chatId].mindState = snap.mindState || fd[chatId].mindState || {};
        fd[chatId].summaries = snap.summaries || [];
        fd[chatId].relationshipLog = snap.relationshipLog || [];
    }
    if (typeof saveFriendsData === 'function') await saveFriendsData();

    window.showToast('读档成功，记忆已回溯 ✓');

    // 重新打开聊天以刷新界面
    if (typeof openChatDetail === 'function') {
        openChatDetail(chatId);
    }
    renderCheckpointList();
};

/* 删除存档 */
window.deleteCheckpoint = async function(cpId) {
    const chatId = _getActiveChatId();
    if (!chatId) return;
    const points = await IDB.get(_cpKey(chatId)) || [];
    const idx = points.findIndex(p => p.id === cpId);
    if (idx === -1) return;
    points.splice(idx, 1);
    await IDB.set(_cpKey(chatId), points);
    renderCheckpointList();
};

/* 渲染存档列表 UI */
window.renderCheckpointList = async function() {
    const el = document.getElementById('checkpoint-list-container');
    if (!el) return;
    const chatId = _getActiveChatId();
    if (!chatId) {
        el.innerHTML = '<div style="color:#999;font-size:12px;text-align:center;padding:20px;">请先打开一个聊天</div>';
        return;
    }
    const points = await listCheckpoints(chatId);
    if (points.length === 0) {
        el.innerHTML = '<div style="color:#999;font-size:12px;text-align:center;padding:20px;">暂无存档，点击上方按钮创建</div>';
        return;
    }
    el.innerHTML = points.map(cp => `
        <div class="sk-summary-item" style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
            <div style="flex:1;min-width:0;">
                <div style="font-size:12px;font-weight:700;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${cp.label}</div>
                <div style="font-size:10px;color:#999;margin-top:2px;">好感度 ${Math.round((cp.friendSnapshot?.affection)||0)}%</div>
            </div>
            <div style="display:flex;gap:8px;flex-shrink:0;">
                <button class="sk-btn-secondary" style="padding:4px 10px;font-size:11px;" onclick="loadCheckpoint('${cp.id}')"><i class="fas fa-undo"></i> 读档</button>
                <button class="sk-icon-btn" style="background:#ffecec;color:#ff4d4f;width:28px;height:28px;" onclick="deleteCheckpoint('${cp.id}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
};

/* ─── § 6  互通记忆 UI 辅助 ─── */
window.renderLinkMemoryUI = async function() {
    const el = document.getElementById('cs-link-memory-container');
    if (!el) return;
    const chatId = _getActiveChatId();
    const fd = (typeof friendsData !== 'undefined') ? friendsData : {};
    const friend = chatId ? (fd[chatId] || {}) : {};
    const linked = (friend.chatSettings && friend.chatSettings.linkMemory) || {};
    const linkedIds = linked.linkedChatIds || [];
    const depth = linked.linkMemoryDepth || 5;

    // 直接从 friendsData 构建列表，排除当前聊天
    const allFriends = Object.entries(fd)
        .filter(([id]) => id !== chatId)
        .map(([id, f]) => ({ ...f, chatId: id }))
        .filter(f => !f.blocked && !f.isGroup); // 排除已拉黑和群聊（可选）

    el.innerHTML = `
        ${allFriends.length === 0
            ? '<div style="color:#ccc;font-size:12px;text-align:center;padding:10px;">暂无其他聊天</div>'
            : allFriends.map(f => `
                <label style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:10px;background:#fafafa;margin-bottom:6px;cursor:pointer;">
                    <input type="checkbox" data-linkid="${f.chatId}" ${linkedIds.includes(f.chatId) ? 'checked' : ''} onchange="updateLinkMemorySelection()">
                    <img src="${f.avatar || ''}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;background:#eee;"
                         onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=${f.chatId}'">
                    <span style="font-size:13px;font-weight:600;color:#333;">${f.remark || f.realName || f.chatId}</span>
                </label>
            `).join('')}
        <div style="margin-top:10px;">
            <label style="font-size:12px;font-weight:600;color:#555;">互通条数 (最近N条)</label>
            <input type="number" id="cs-link-depth" value="${depth}" min="1" max="20"
                   style="width:80px;margin-left:10px;text-align:center;border:1px solid #eee;border-radius:8px;padding:4px 8px;">
        </div>
    `;
};

/* 复选框变化时不做特殊处理，保存时统一读取 */
window.updateLinkMemorySelection = function() { /* 保存时由 getLinkMemoryConfig 统一读取 */ };

/* 获取记忆互通当前配置（在 saveChatSettings 中调用） */
window.getLinkMemoryConfig = function() {
    const checkboxes = document.querySelectorAll('#cs-link-memory-container input[type=checkbox]');
    const linkedChatIds = Array.from(checkboxes).filter(c => c.checked).map(c => c.dataset.linkid);
    const depth = parseInt(document.getElementById('cs-link-depth')?.value) || 5;
    return { linkedChatIds, linkMemoryDepth: depth };
};

/* ─── § 7  工具：轻量 AI 调用（不渲染气泡，用于自动总结/精简） ─── */
async function callAIRaw(promptText, maxTokens = 1000) {
    const SETTINGS_KEY = 'myCoolPhone_aiSettings';
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (e) {}
    const apiKey = cfg.apiKey || '';
    const endpoint = (cfg.endpoint || '').replace(/\/$/, '');
    const model = cfg.model || 'gpt-4o-mini';
    if (!apiKey || !endpoint) throw new Error('API 未配置，请先在设置中填写 API Key 和接入地址。');
    const apiUrl = endpoint.endsWith('/v1')
        ? `${endpoint}/chat/completions`
        : `${endpoint}/v1/chat/completions`;
    const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({
            model, stream: false,
            messages: [{ role: 'user', content: promptText }],
            max_tokens: maxTokens,
            temperature: 0.5
        })
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 100)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
}

/* 暴露给 apps.js 的自动总结也可以直接复用 callAIRaw */
window.callAIRaw = callAIRaw;
