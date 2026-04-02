/**
 * app_bubble.js — Bubble App v6.0
 * 修复版：解决读取不到人设和好友的问题
 */

// =====================================================================
// callAIAPI — 泡泡专用 AI 调用函数（静默返回文本，不渲染气泡）
// 参数：systemPrompt, userMessage, history[], _, _, silent
// 返回：Promise<string>
// =====================================================================
async function callAIAPI(systemPrompt, userMessage, history, _p4, _p5, _silent) {
    const SETTINGS_KEY = 'myCoolPhone_aiSettings';
    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    if (!settingsJSON) throw new Error('未配置 API，请先在设置中填写 API Key 和 Base URL');

    const settings = JSON.parse(settingsJSON);
    if (!settings.apiKey || !settings.endpoint || !settings.model) {
        throw new Error('API Key、Base URL 或 Model 未填写完整');
    }

    let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
    const apiUrl = baseUrl.endsWith('/v1')
        ? `${baseUrl}/chat/completions`
        : `${baseUrl}/v1/chat/completions`;

    // 构建消息列表
    const messages = [{ role: 'system', content: systemPrompt }];
    if (Array.isArray(history) && history.length > 0) {
        history.forEach(h => {
            if (h && h.role && h.content) messages.push({ role: h.role, content: h.content });
        });
    }
    messages.push({ role: 'user', content: userMessage || '' });

    const payload = {
        model: settings.model,
        messages: messages,
        temperature: parseFloat(settings.temperature || 0.7)
    };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status} ${response.statusText}\n${errText}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    if (!content.trim()) throw new Error('API 返回内容为空');
    return content;
}

// =====================================================================
// 安全获取全局变量辅助函数
// =====================================================================
function getGlobalPersonas() {
    return typeof personasMeta !== 'undefined' ? personasMeta : {};
}
function getGlobalCurrentPersonaId() {
    return typeof currentPersonaId !== 'undefined' ? currentPersonaId : '';
}
function getGlobalFriends() {
    return typeof friendsData !== 'undefined' ? friendsData : {};
}

// =====================================================================
// 数据存储辅助
// =====================================================================
function bbGet(key, def) {
    try { const v = localStorage.getItem('bb_' + key); return v !== null ? JSON.parse(v) : def; }
    catch(e) { return def; }
}
function bbSet(key, val) {
    try { localStorage.setItem('bb_' + key, JSON.stringify(val)); } catch(e) {}
}

// 获取当前存储的 AI id
function bbCurrentAiId() {
    return bbGet('current_ai_id', '') || '';
}

// 获取某个AI的设置（独立于每个AI）
function bbGetSettings(aiId) {
    const all = bbGet('settings_all', {});
    return all[aiId] || {
        aiPersona: '', myPersona: '', worldbook: '',
        idolInfo: { team: '', skills: '', company: '', teammates: '' },
        myIdolInfo: { team: '', skills: '', company: '', teammates: '' },
        memoryToggle: false, myMemoryToggle: false,
        subscriptionDays: 0, subscribedAt: null,
        autoPostInterval: 300, crisisInterval: 3600
    };
}
function bbSaveSettingsObj(aiId, obj) {
    const all = bbGet('settings_all', {});
    all[aiId] = obj;
    bbSet('settings_all', all);
}

// 获取某AI的运行数据
function bbGetData(aiId) {
    const all = bbGet('data_all', {});
    return all[aiId] || {
        beanCoins: 0, transactions: [],
        idolRevenue: 0, idolFanCount: Math.floor(Math.random()*5000+1000),
        merch: [], publicPosts: [], secretMessages: [],
        secretUnlocked: false, secretProgress: 0,
        fanReplies: [], crises: [], backpackItems: [],
        lastPostTime: 0, lastCrisisTime: 0
    };
}
function bbSaveData(aiId, data) {
    const all = bbGet('data_all', {});
    all[aiId] = data;
    bbSet('data_all', all);
}

// =====================================================================
// 数据访问 — 联通微信数据
// =====================================================================

// 获取AI好友人设
function bbGetAiFriendPersona(aiId) {
    try {
        const fData = getGlobalFriends();
        const f = fData[aiId];
        if (f) return f.persona || '';
    } catch(e) {}
    return '';
}

// 获取AI好友关联的世界书内容
function bbGetAiWorldbook(aiId) {
    try {
        const fData = getGlobalFriends();
        const f = fData[aiId];
        if (!f) return '';
        const wbIds = Array.isArray(f.worldbook) ? f.worldbook : (f.worldbook ? [f.worldbook] : []);
        if (wbIds.length && typeof worldBooks !== 'undefined') {
            return wbIds.map(id => {
                const wb = worldBooks.find(w => w.id === id);
                return wb ? (wb.description || wb.content || wb.title || '') : '';
            }).filter(Boolean).join('\n');
        }
        return typeof f.worldbook === 'string' ? f.worldbook : '';
    } catch(e) {}
    return '';
}

// 获取我的当前人设内容
function bbGetMyWcPersona() {
    try {
        const pMeta = getGlobalPersonas();
        const active = pMeta[getGlobalCurrentPersonaId()];
        if (active) return active.persona || '';
    } catch(e) {}
    return '';
}

// 获取我的当前世界书
function bbGetMyWcWorldbook() {
    try {
        const pMeta = getGlobalPersonas();
        const active = pMeta[getGlobalCurrentPersonaId()];
        if (!active) return '';
        const wbIds = Array.isArray(active.worldbook) ? active.worldbook : (active.worldbook ? [active.worldbook] : []);
        if (wbIds.length && typeof worldBooks !== 'undefined') {
            return wbIds.map(id => {
                const wb = worldBooks.find(w => w.id === id);
                return wb ? (wb.description || wb.content || wb.title || '') : '';
            }).filter(Boolean).join('\n');
        }
        return '';
    } catch(e) {}
    return '';
}

// 获取AI头像
function bbGetAiAvatar(aiId) {
    try {
        const fData = getGlobalFriends();
        const f = fData[aiId];
        if (f && f.avatar) return f.avatar;
    } catch(e) {}
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(aiId)}`;
}

// 获取AI名称
function bbGetAiName(aiId) {
    try {
        const fData = getGlobalFriends();
        const f = fData[aiId];
        if (f) return f.remark || f.realName || aiId;
    } catch(e) {}
    return aiId;
}

// 获取当前人设名称
function bbGetMyPersonaName() {
    try {
        const pMeta = getGlobalPersonas();
        const active = pMeta[getGlobalCurrentPersonaId()];
        if (active) return active.name || 'Me';
    } catch(e) {}
    return 'Me';
}

// 获取当前人设头像
function bbGetMyPersonaAvatar() {
    try {
        const pMeta = getGlobalPersonas();
        const active = pMeta[getGlobalCurrentPersonaId()];
        if (active && active.avatar) return active.avatar;
    } catch(e) {}
    return 'https://api.dicebear.com/7.x/avataaars/svg?seed=me';
}

// =====================================================================
// 豆币系统
// =====================================================================
function bbGetBeanCoins(aiId) { return bbGetData(aiId).beanCoins || 0; }

function bbAddBeans(aiId, amount, reason) {
    const d = bbGetData(aiId);
    d.beanCoins = (d.beanCoins || 0) + amount;
    d.transactions = d.transactions || [];
    d.transactions.unshift({ type: 'earn', amount, reason, time: Date.now() });
    bbSaveData(aiId, d);
    bbToast(`+${amount} 豆币 · ${reason}`);
}
function bbSpendBeans(aiId, amount, reason) {
    const d = bbGetData(aiId);
    if ((d.beanCoins || 0) < amount) { bbToast('豆币不足，请先充值'); return false; }
    d.beanCoins -= amount;
    d.transactions = d.transactions || [];
    d.transactions.unshift({ type: 'spend', amount, reason, time: Date.now() });
    bbSaveData(aiId, d);
    return true;
}

// 打开豆币钱包
function bbOpenBeansWallet() {
    const aiId = bbCurrentAiId();
    const d = bbGetData(aiId);
    const isIdol = (bbGet('current_mode', '') === 'idol');

    let txHtml = (d.transactions || []).slice(0, 50).map(t => {
        const dt = new Date(t.time).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
        const color = t.type === 'earn' ? '#07c160' : '#111';
        const sign = t.type === 'earn' ? '+' : '-';
        return `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f5f5f5;">
            <div><div style="font-size:13px;font-weight:600;color:#333;">${t.reason}</div><div style="font-size:10px;color:#bbb;margin-top:2px;">${dt}</div></div>
            <div style="font-size:16px;font-weight:800;color:${color};">${sign}${t.amount}</div>
        </div>`;
    }).join('') || '<div style="text-align:center;color:#bbb;padding:30px;font-size:12px;">暂无记录</div>';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.style.cssText = 'z-index:6500;';
        modal.innerHTML = `
        <div class="modal-box" style="width: 90%; max-width: 320px; max-height: 80vh; display:flex; flex-direction:column; border-radius:24px; background:#fff; box-sizing: border-box;">
            <div class="modal-header" style="border-bottom:none; padding: 20px 20px 5px; box-sizing: border-box;">
                <span style="font-size:15px; font-weight:800;">豆币钱包</span>
                <i class="fas fa-times" onclick="this.closest('.modal-overlay').remove()"></i>
            </div>
            <div style="padding:25px 15px; background:linear-gradient(135deg,#f9f9f9,#f0f0f0); margin:0 20px 15px; border-radius:20px; color:#555; text-align:center; border:1px solid #eee; box-shadow:inset 0 2px 10px rgba(255,255,255,1);">
                <div style="font-size:10px; color:#999; font-weight:700; font-family:'Montserrat'; letter-spacing:1px;">BALANCE (BEANS)</div>
                <div style="font-size:36px; font-weight:300; font-family:'Montserrat',sans-serif; margin:8px 0; color:#333;">${d.beanCoins || 0}</div>
                ${isIdol ? `<div style="font-size:11px; color:#ff7e67; font-weight:600;">收益账户: ${d.idolRevenue || 0} 豆币</div>` : ''}
            </div>
            <div style="display:flex; gap:10px; padding:0 20px 15px; box-sizing: border-box;">
                ${!isIdol ? `<button onclick="bbRechargeBeansPrompt('${aiId}',this)" style="flex:1; padding:12px 0; border-radius:12px; background:#fff; color:#555; border:1px solid #eee; font-size:12px; font-weight:600; cursor:pointer;">充值豆币</button>` : ''}
                ${isIdol ? `<button onclick="bbWithdrawRevenue('${aiId}',this)" style="flex:1; padding:12px 0; border-radius:12px; background:#f5f5f5; color:#555; border:1px solid #eee; font-size:12px; font-weight:600; cursor:pointer;">提现到钱包</button>` : ''}
            </div>
            <div style="flex:1; overflow-y:auto; padding:0 20px 20px; box-sizing: border-box;">
                <div style="font-size:10px; font-weight:700; color:#aaa; letter-spacing:1px; margin-bottom:8px;">TRANSACTIONS</div>
                ${txHtml}
            </div>
        </div>`;

    document.body.appendChild(modal);
}

function bbRechargeBeansPrompt(aiId, btn) {
    // 兼容可能没有钱包系统的情况
    if (typeof kDialog === 'function') {
        kDialog('充值豆币', '请输入充值金额（¥1 = 100豆币）', true, (val) => {
            if (!val || isNaN(val) || val <= 0) return;
            const rmb = parseFloat(val);
            const balance = parseFloat(localStorage.getItem('pay_total_balance') || '0');
            if (balance < rmb) { bbToast('钱包余额不足'); return; }
            localStorage.setItem('pay_total_balance', (balance - rmb).toFixed(2));
            bbAddBeans(aiId, Math.floor(rmb * 100), `充值 ¥${rmb}`);
            document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
            bbOpenBeansWallet();
        });
    } else {
        const val = prompt('请输入充值金额（¥1 = 100豆币）');
        if (!val || isNaN(val) || val <= 0) return;
        bbAddBeans(aiId, Math.floor(val * 100), `直接充值`);
        document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
        bbOpenBeansWallet();
    }
}

function bbWithdrawRevenue(aiId, btn) {
    const d = bbGetData(aiId);
    const rev = d.idolRevenue || 0;
    if (rev <= 0) { bbToast('暂无可提现收益'); return; }
    const rmb = (rev / 100).toFixed(2);
    
    if (typeof kDialog === 'function') {
        kDialog('确认提现', `将 ${rev} 豆币折算为 ¥${rmb} 到你的钱包？`, false, () => {
            const balance = parseFloat(localStorage.getItem('pay_total_balance') || '0');
            localStorage.setItem('pay_total_balance', (balance + parseFloat(rmb)).toFixed(2));
            d.idolRevenue = 0;
            d.beanCoins = (d.beanCoins || 0) - rev;
            d.transactions = d.transactions || [];
            d.transactions.unshift({ type: 'spend', amount: rev, reason: `提现 ¥${rmb} 到钱包`, time: Date.now() });
            bbSaveData(aiId, d);
            bbPlayCoinSound();
            bbToast(`提现成功！¥${rmb} 已到账`);
            document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
        });
    } else {
        d.idolRevenue = 0;
        d.beanCoins = (d.beanCoins || 0) - rev;
        bbSaveData(aiId, d);
        bbToast(`提现成功！¥${rmb} 已到账`);
        document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
    }
}

function bbPlayCoinSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [523, 659, 784, 1047].forEach((freq, i) => {
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.frequency.value = freq; o.type = 'sine';
            g.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.1);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.3);
            o.start(ctx.currentTime + i * 0.1); o.stop(ctx.currentTime + i * 0.1 + 0.3);
        });
    } catch(e) {}
}

// =====================================================================
// Toast
// =====================================================================
function bbToast(msg, duration) {
    const t = document.getElementById('bb-toast');
    if (!t) return;
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), duration || 2500);
}

// =====================================================================
// 打开/关闭 Bubble App 与 历史记录渲染
// =====================================================================
window.openBubbleApp = function() {
    const app = document.getElementById('bubbleApp');
    if (!app) return;
    app.classList.add('open');
    bbRenderLanding();
    bbShowView('bb-landing-view');
}

function bbRenderLanding() {
    const lastFanAi = bbGet('last_fan_ai', '');
    const lastFanMe = bbGet('last_fan_my_persona', '');
    const lastIdolMe = bbGet('last_idol_my_persona', '');
    
    let html = '';
    
    if (lastFanAi && lastFanMe) {
        const aiName = bbGetAiName(lastFanAi);
        const aiAvatar = bbGetAiAvatar(lastFanAi);
        html += `
        <div style="display:flex; align-items:center; gap:12px; background:rgba(255,255,255,0.9); padding:16px; border-radius:20px; border:1px solid #f0f0f0; margin-bottom:12px; cursor:pointer; box-shadow:0 8px 25px rgba(0,0,0,0.02); transition:0.2s;" onclick="bbResumeFanMode('${lastFanAi}', '${lastFanMe}')">
            <img src="${aiAvatar}" style="width:44px; height:44px; border-radius:50%; object-fit:cover; border:1px solid #eee;">
            <div style="flex:1; text-align:left;">
                <div style="font-size:9px; color:#aaa; font-weight:700; font-family:'Montserrat'; letter-spacing:1px; margin-bottom:4px;">FAN MODE</div>
                <div style="font-size:14px; font-weight:800; color:#444;">${aiName}</div>
            </div>
            <i class="fas fa-chevron-right" style="color:#ddd; font-size:14px;"></i>
        </div>
        `;
    }
    
    if (lastIdolMe) {
        const pMeta = getGlobalPersonas();
        const p = pMeta[lastIdolMe] || {};
        const pName = p.name || 'Me';
        const pAv = p.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=me';
        
        html += `
        <div style="display:flex; align-items:center; gap:12px; background:#f5f5f5; color:#555; padding:16px; border-radius:20px; margin-bottom:20px; border:1px solid #eaeaea; cursor:pointer; box-shadow:inset 0 2px 5px rgba(255,255,255,1); transition:0.2s;" onclick="bbResumeIdolMode('${lastIdolMe}')">
            <img src="${pAv}" style="width:44px; height:44px; border-radius:50%; object-fit:cover; border:2px solid #fff; box-shadow:0 2px 8px rgba(0,0,0,0.05);">
            <div style="flex:1; text-align:left;">
                <div style="font-size:9px; color:#888; font-weight:700; font-family:'Montserrat'; letter-spacing:1px; margin-bottom:4px;">CREATOR STUDIO</div>
                <div style="font-size:14px; font-weight:800; color:#333;">${pName}</div>
            </div>
            <i class="fas fa-chevron-right" style="color:#ccc; font-size:14px;"></i>
        </div>
        `;
    }
    
    const container = document.getElementById('bb-history-entries');
    if (container) {
        container.innerHTML = html ? `<div style="font-size:10px; color:#aaa; margin-bottom:10px; font-weight:800; letter-spacing:1px;">RECENT CONNECTION</div>${html}` : '';
    }
}


window.bbResumeFanMode = async function(aiId, myPersonaId) {
    if (myPersonaId && myPersonaId !== getGlobalCurrentPersonaId()) {
        if (typeof currentPersonaId !== 'undefined') currentPersonaId = myPersonaId;
        else window.currentPersonaId = myPersonaId;
        localStorage.setItem('myCoolPhone_currentPersonaId', myPersonaId);
        if (typeof applyPersonaToUI === 'function') applyPersonaToUI();
        if (typeof loadFriendsData === 'function') await loadFriendsData();
    }
    bbSet('current_mode', 'fan');
    bbSet('current_ai_id', aiId);
    bbShowView('bb-fan-mode-view');
    bbInitFanMode(aiId);
}

window.bbResumeIdolMode = async function(myPersonaId) {
    if (myPersonaId && myPersonaId !== getGlobalCurrentPersonaId()) {
        if (typeof currentPersonaId !== 'undefined') currentPersonaId = myPersonaId;
        else window.currentPersonaId = myPersonaId;
        localStorage.setItem('myCoolPhone_currentPersonaId', myPersonaId);
        if (typeof applyPersonaToUI === 'function') applyPersonaToUI();
        if (typeof loadFriendsData === 'function') await loadFriendsData();
    }
    const idolId = 'idol__' + myPersonaId;
    bbSet('current_mode', 'idol');
    bbSet('current_ai_id', idolId);
    bbShowView('bb-idol-mode-view');
    bbInitIdolMode(idolId);
}

window.closeBubbleApp = function() {
    const app = document.getElementById('bubbleApp');
    if (app) app.classList.remove('open');
    bbSet('current_mode', '');
    bbStopAllTimers();
}

function bbShowView(viewId) {
    ['bb-landing-view','bb-fan-mode-view','bb-idol-mode-view'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const target = document.getElementById(viewId);
    if (target) target.style.display = 'flex';
}

// =====================================================================
// ★ 新入口流程：AI是爱豆（粉丝模式）
// =====================================================================
window.bbEnterFanModeFlow = async function() {
    const pMeta = getGlobalPersonas();
    const personaIds = Object.keys(pMeta);

    const personaOptions = personaIds.length
        ? personaIds.map(id => {
            const p = pMeta[id];
            const isCurrent = id === getGlobalCurrentPersonaId();
            return `<option value="${id}" ${isCurrent ? 'selected' : ''}>${p.name || '未命名'}</option>`;
        }).join('')
        : '<option value="">（暂无人设）</option>';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.style.cssText = 'z-index:6500;';
       modal.innerHTML = `
    <div class="modal-box" style="width:340px;border-radius:24px;padding:0;overflow:hidden;background:#fff;border:1px solid #f0f0f0;">
        <div class="modal-header" style="padding:24px 24px 10px;border-bottom:none;background:#fff;">
            <span style="font-size:18px;font-weight:800;color:#111;font-family:'Montserrat', sans-serif;">FAN MODE.</span>
            <i class="fas fa-times" onclick="this.closest('.modal-overlay').remove()" style="cursor:pointer;color:#bbb;font-size:18px;"></i>
        </div>
        <div style="padding:0 24px 24px;display:flex;flex-direction:column;gap:20px;background:#fff;">
            <div style="font-size:11px;color:#888;line-height:1.6;background:#fafafa;padding:12px;border-radius:12px;border:1px solid #eee;">
                选择你的人设和想追的AI爱豆。进入主界面后，可在右上角 ⚙️ 补充专属设定。
            </div>
            <div>
                <div style="font-size:11px;font-weight:700;color:#666;margin-bottom:8px;">我的人设 <span style="color:#aaa;font-weight:400;">Persona</span></div>
                <select id="bb-flow-my-persona" style="width:100%;border:1px solid #eee;border-radius:12px;padding:12px;font-size:13px;outline:none;background:#fafafa;color:#555;" onchange="bbUpdateAiFriendsList(this.value)">
                    ${personaOptions}
                </select>
            </div>
            <div>
                <div style="font-size:11px;font-weight:700;color:#666;margin-bottom:8px;">AI 爱豆 <span style="color:#aaa;font-weight:400;">Idol</span></div>
                <select id="bb-flow-ai-friend" style="width:100%;border:1px solid #eee;border-radius:12px;padding:12px;font-size:13px;outline:none;background:#fafafa;color:#555;">
                    <!-- 动态加载好友列表 -->
                </select>
            </div>
            <button onclick="bbConfirmFanModeEntry(this)" style="width:100%;padding:16px;background:#f5f5f5;color:#666;border:1px solid #eee;border-radius:16px;font-weight:800;font-size:13px;cursor:pointer;margin-top:10px;letter-spacing:1px; transition:0.2s;">JOIN ✦</button>
        </div>
    </div>`;

    document.body.appendChild(modal);

    // 初始化下拉框的AI好友
    const currentP = document.getElementById('bb-flow-my-persona').value;
    await bbUpdateAiFriendsList(currentP);
}

// 动态刷新AI好友列表 (自动匹配人设隔离层)
window.bbUpdateAiFriendsList = async function(personaId) {
    const aiSelect = document.getElementById('bb-flow-ai-friend');
    if (!aiSelect) return;

    const scopedKey = `myCoolPhone_friendsData__${personaId}`;
    let friends = {};
    try {
        if (typeof IDB !== 'undefined') {
            friends = await IDB.get(scopedKey) || {};
        }
    } catch(e) {}
    
    if (Object.keys(friends).length === 0) {
        let old = localStorage.getItem(scopedKey);
        if(old) friends = JSON.parse(old);
    }

    // fallback 到全局如果当前是你选的人设
    if (Object.keys(friends).length === 0 && personaId === getGlobalCurrentPersonaId()) {
        friends = getGlobalFriends();
    }

    const friendIds = Object.keys(friends);
    if (friendIds.length === 0) {
        aiSelect.innerHTML = '<option value="">（该人设下暂无好友，请先在微信添加）</option>';
    } else {
        aiSelect.innerHTML = friendIds.map(id => {
            const f = friends[id];
            return `<option value="${id}">${f.remark || f.realName || id}</option>`;
        }).join('');
    }
}

window.bbConfirmFanModeEntry = async function(btn) {
    const modal = btn.closest('.modal-overlay');
    const personaSel = document.getElementById('bb-flow-my-persona');
    const friendSel = document.getElementById('bb-flow-ai-friend');

    if (!friendSel || !friendSel.value) {
        if(typeof showToast === 'function') showToast('请选择一个AI爱豆');
        else alert('请选择一个AI爱豆');
        return;
    }

    const selectedPersonaId = personaSel ? personaSel.value : getGlobalCurrentPersonaId();
    const selectedFriendId = friendSel.value;

    if (selectedPersonaId && selectedPersonaId !== getGlobalCurrentPersonaId()) {
        if (typeof currentPersonaId !== 'undefined') {
            currentPersonaId = selectedPersonaId; // Update global variable directly
        } else {
            window.currentPersonaId = selectedPersonaId;
        }
        localStorage.setItem('myCoolPhone_currentPersonaId', selectedPersonaId);
        if (typeof applyPersonaToUI === 'function') applyPersonaToUI();
        if (typeof loadFriendsData === 'function') await loadFriendsData();
    }

    if (modal) modal.remove();
        bbSet('last_fan_ai', selectedFriendId);
    bbSet('last_fan_my_persona', selectedPersonaId);


    bbSet('current_mode', 'fan');
    bbSet('current_ai_id', selectedFriendId);
    bbShowView('bb-fan-mode-view');
    bbInitFanMode(selectedFriendId);
}

// =====================================================================
// ★ 新入口流程：我是爱豆（爱豆模式）
// =====================================================================
window.bbEnterIdolModeFlow = function() {
    const pMeta = getGlobalPersonas();
    const personaIds = Object.keys(pMeta);

    const personaOptions = personaIds.length
        ? personaIds.map(id => {
            const p = pMeta[id];
            const isCurrent = id === getGlobalCurrentPersonaId();
            return `<option value="${id}" ${isCurrent ? 'selected' : ''}>${p.name || '未命名'}</option>`;
        }).join('')
        : '<option value="">（暂无人设，请先创建）</option>';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.style.cssText = 'z-index:6500;';
       modal.innerHTML = `
    <div class="modal-box" style="width:340px;border-radius:24px;padding:0;overflow:hidden;background:#fff;border:1px solid #f0f0f0;">
        <div class="modal-header" style="padding:24px 24px 10px;border-bottom:none;background:#fff;">
            <span style="font-size:18px;font-weight:800;color:#111;font-family:'Montserrat', sans-serif;">IDOL MODE.</span>
            <i class="fas fa-times" onclick="this.closest('.modal-overlay').remove()" style="cursor:pointer;color:#bbb;font-size:18px;"></i>
        </div>
        <div style="padding:0 24px 24px;display:flex;flex-direction:column;gap:20px;background:#fff;">
            <div style="font-size:11px;color:#888;line-height:1.6;background:#fafafa;padding:12px;border-radius:12px;border:1px solid #eee;">
                以你的人设成为爱豆，经营账号并与粉丝互动。进入后可在右上角 ⚙️ 编辑专属设定。
            </div>
            <div>
                <div style="font-size:11px;font-weight:700;color:#666;margin-bottom:8px;">我的人设 <span style="color:#aaa;font-weight:400;">Persona</span></div>
                <select id="bb-flow-idol-persona" style="width:100%;border:1px solid #eee;border-radius:12px;padding:12px;font-size:13px;outline:none;background:#fafafa;color:#555;">
                    ${personaOptions}
                </select>
            </div>
            <button onclick="bbConfirmIdolModeEntry(this)" style="width:100%;padding:16px;background:#f5f5f5;color:#666;border:1px solid #eee;border-radius:16px;font-weight:800;font-size:13px;cursor:pointer;margin-top:10px;letter-spacing:1px; transition:0.2s;">START ✦</button>
        </div>
    </div>`;

    document.body.appendChild(modal);
}

window.bbConfirmIdolModeEntry = async function(btn) {
    const modal = btn.closest('.modal-overlay');
    const personaSel = document.getElementById('bb-flow-idol-persona');
    const selectedPersonaId = personaSel ? personaSel.value : getGlobalCurrentPersonaId();

    if (selectedPersonaId && selectedPersonaId !== getGlobalCurrentPersonaId()) {
        if (typeof currentPersonaId !== 'undefined') {
            currentPersonaId = selectedPersonaId;
        } else {
            window.currentPersonaId = selectedPersonaId;
        }
        localStorage.setItem('myCoolPhone_currentPersonaId', selectedPersonaId);
        if (typeof applyPersonaToUI === 'function') applyPersonaToUI();
        if (typeof loadFriendsData === 'function') await loadFriendsData();
    }

    if (modal) modal.remove();
    bbSet('last_idol_my_persona', selectedPersonaId);

    const idolId = 'idol__' + getGlobalCurrentPersonaId();
    bbSet('current_mode', 'idol');
    bbSet('current_ai_id', idolId);
    bbShowView('bb-idol-mode-view');
    bbInitIdolMode(idolId);
}

// =====================================================================
// ★ 模式内右上角设置（⚙️） 
// =====================================================================
window.bbOpenFanModeSettings = function(aiId) {
    if (!aiId) aiId = bbCurrentAiId();
    const s = bbGetSettings(aiId);
    const wcPersona = bbGetAiFriendPersona(aiId);
    const wcWorldbook = bbGetAiWorldbook(aiId);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.style.cssText = 'z-index:6500;';
    modal.innerHTML = `
    <div class="modal-box" style="width:340px;max-height:90vh;overflow-y:auto;border-radius:24px;padding:0;background:#fff;">
        <div class="modal-header" style="padding:24px 24px 10px;border-bottom:none;">
            <span style="font-size:16px;font-weight:800;color:#111;font-family:'Montserrat', sans-serif;">SETTING.</span>
            <i class="fas fa-times" onclick="this.closest('.modal-overlay').remove()" style="cursor:pointer;color:#aaa;font-size:18px;"></i>
        </div>
        <div style="padding:0 24px 24px;display:flex;flex-direction:column;gap:16px;">
            <div style="background:#f9f9f9;border-radius:12px;padding:16px;border:1px solid #eee;">
                <div style="font-size:11px;font-weight:700;color:#111;letter-spacing:1px;margin-bottom:8px;"><i class="fas fa-link"></i> 基础人设（只读）</div>
                <div style="font-size:12px;color:#666;line-height:1.5;max-height:60px;overflow-y:auto;padding-right:4px;">${wcPersona || '（未设置人设）'}</div>
                ${wcWorldbook ? `<div style="font-size:10px;color:#aaa;margin-top:8px;border-top:1px dashed #ddd;padding-top:8px;">${wcWorldbook.slice(0,50)}${wcWorldbook.length>50?'...':''}</div>` : ''}
            </div>
            
            <div>
                <div style="font-size:11px;font-weight:700;color:#333;margin-bottom:6px;letter-spacing:1px;">Bubble 专属宇宙背景</div>
                <textarea id="fms-worldbook" rows="2" style="width:100%;border:1px solid #eee;border-radius:12px;padding:12px;font-size:12px;resize:none;outline:none;background:#fafafa;" placeholder="叠加在基础人设之上的背景设定...">${s.worldbook||''}</textarea>
            </div>
            
            <div style="display:flex;gap:12px;">
                <div style="flex:1;">
                    <div style="font-size:11px;font-weight:700;color:#333;margin-bottom:6px;letter-spacing:1px;">团队担当</div>
                    <input type="text" id="fms-team" value="${(s.idolInfo&&s.idolInfo.team)||''}" style="width:100%;border:1px solid #eee;border-radius:12px;padding:10px;font-size:12px;outline:none;background:#fafafa;" placeholder="如：队长/主唱">
                </div>
                <div style="flex:1;">
                    <div style="font-size:11px;font-weight:700;color:#333;margin-bottom:6px;letter-spacing:1px;">特长</div>
                    <input type="text" id="fms-skills" value="${(s.idolInfo&&s.idolInfo.skills)||''}" style="width:100%;border:1px solid #eee;border-radius:12px;padding:10px;font-size:12px;outline:none;background:#fafafa;" placeholder="如：舞蹈/作曲">
                </div>
            </div>
            
            <div style="display:flex;gap:12px;">
                <div style="flex:1;">
                    <div style="font-size:11px;font-weight:700;color:#333;margin-bottom:6px;letter-spacing:1px;">经纪公司</div>
                    <input type="text" id="fms-company" value="${(s.idolInfo&&s.idolInfo.company)||''}" style="width:100%;border:1px solid #eee;border-radius:12px;padding:10px;font-size:12px;outline:none;background:#fafafa;" placeholder="如：SM">
                </div>
                <div style="flex:1;">
                    <div style="font-size:11px;font-weight:700;color:#333;margin-bottom:6px;letter-spacing:1px;">队友</div>
                    <input type="text" id="fms-teammates" value="${(s.idolInfo&&s.idolInfo.teammates)||''}" style="width:100%;border:1px solid #eee;border-radius:12px;padding:10px;font-size:12px;outline:none;background:#fafafa;" placeholder="逗号分隔">
                </div>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;padding:16px;background:#fafafa;border-radius:12px;border:1px solid #eee;">
                <div>
                    <div style="font-size:12px;font-weight:700;color:#111;">连通主控记忆</div>
                    <div style="font-size:10px;color:#888;margin-top:2px;">互动将写入微信主聊天</div>
                </div>
                <label class="switch" style="transform:scale(0.85);margin:0;">
                    <input type="checkbox" id="fms-memory" ${s.memoryToggle?'checked':''}>
                    <span class="slider round"></span>
                </label>
            </div>
            
            <div>
                <div style="font-size:11px;font-weight:700;color:#333;margin-bottom:6px;letter-spacing:1px;">自动发帖间隔 (秒)</div>
                <input type="number" id="fms-auto-post" value="${s.autoPostInterval||300}" style="width:100%;border:1px solid #eee;border-radius:12px;padding:10px;font-size:13px;outline:none;background:#fafafa;">
            </div>
            
            <button onclick="bbSaveFanModeSettings('${aiId}')" style="width:100%;padding:16px;background:#111;color:#fff;border:none;border-radius:16px;font-weight:800;font-size:13px;cursor:pointer;letter-spacing:1px;margin-top:8px;">SAVE SETTING</button>
        </div>
    </div>`;
    document.body.appendChild(modal);
}

window.bbSaveFanModeSettings = function(aiId) {
    const s = bbGetSettings(aiId);
    const wb = document.getElementById('fms-worldbook');
    if (wb) s.worldbook = wb.value;
    s.idolInfo = {
        team: document.getElementById('fms-team')?.value || '',
        skills: document.getElementById('fms-skills')?.value || '',
        company: document.getElementById('fms-company')?.value || '',
        teammates: document.getElementById('fms-teammates')?.value || '',
    };
    const mem = document.getElementById('fms-memory');
    if (mem) s.memoryToggle = mem.checked;
    const ap = document.getElementById('fms-auto-post');
    if (ap) s.autoPostInterval = parseInt(ap.value) || 300;
    bbSaveSettingsObj(aiId, s);
    document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
    bbToast('AI爱豆信息已保存');
}

window.bbOpenIdolModeSettings = function(aiId) {
    if (!aiId) aiId = bbCurrentAiId();
    const s = bbGetSettings(aiId);
    const myName = bbGetMyPersonaName();
    const myWcPersona = bbGetMyWcPersona();
    const myWcWorldbook = bbGetMyWcWorldbook();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.style.cssText = 'z-index:6500;';
    modal.innerHTML = `
    <div class="modal-box" style="width:340px;max-height:90vh;overflow-y:auto;border-radius:24px;padding:0;background:#fff;">
        <div class="modal-header" style="padding:24px 24px 10px;border-bottom:none;background:#fff;">
            <span style="font-size:16px;font-weight:800;color:#111;font-family:'Montserrat', sans-serif;">MY IDOL PROFILE.</span>
            <i class="fas fa-times" onclick="this.closest('.modal-overlay').remove()" style="cursor:pointer;color:#aaa;font-size:18px;"></i>
        </div>
        <div style="padding:0 24px 24px;display:flex;flex-direction:column;gap:16px;">
            <div style="background:#f9f9f9;border-radius:12px;padding:16px;border:1px solid #eee;">
                <div style="font-size:11px;font-weight:700;color:#111;letter-spacing:1px;margin-bottom:8px;"><i class="fas fa-link"></i> ${myName} 主线设定（只读）</div>
                <div style="font-size:12px;color:#666;line-height:1.5;max-height:60px;overflow-y:auto;padding-right:4px;">${myWcPersona || '（未设置人设）'}</div>
                ${myWcWorldbook ? `<div style="font-size:10px;color:#aaa;margin-top:8px;border-top:1px dashed #ddd;padding-top:8px;">${myWcWorldbook.slice(0,50)}${myWcWorldbook.length>50?'...':''}</div>` : ''}
            </div>
            
            <div>
                <div style="font-size:11px;font-weight:700;color:#333;margin-bottom:6px;letter-spacing:1px;">Bubble 专属宇宙背景</div>
                <textarea id="ims-worldbook" rows="2" style="width:100%;border:1px solid #eee;border-radius:12px;padding:12px;font-size:12px;resize:none;outline:none;background:#fafafa;" placeholder="叠加在基础人设之上的背景设定...">${s.worldbook||''}</textarea>
            </div>
            
            <div style="display:flex;gap:12px;">
                <div style="flex:1;">
                    <div style="font-size:11px;font-weight:700;color:#333;margin-bottom:6px;letter-spacing:1px;">团队担当</div>
                    <input type="text" id="ims-team" value="${(s.myIdolInfo&&s.myIdolInfo.team)||''}" style="width:100%;border:1px solid #eee;border-radius:12px;padding:10px;font-size:12px;outline:none;background:#fafafa;" placeholder="如：队长/主唱">
                </div>
                <div style="flex:1;">
                    <div style="font-size:11px;font-weight:700;color:#333;margin-bottom:6px;letter-spacing:1px;">特长</div>
                    <input type="text" id="ims-skills" value="${(s.myIdolInfo&&s.myIdolInfo.skills)||''}" style="width:100%;border:1px solid #eee;border-radius:12px;padding:10px;font-size:12px;outline:none;background:#fafafa;" placeholder="如：舞蹈/作曲">
                </div>
            </div>
            
            <div style="display:flex;gap:12px;">
                <div style="flex:1;">
                    <div style="font-size:11px;font-weight:700;color:#333;margin-bottom:6px;letter-spacing:1px;">经纪公司</div>
                    <input type="text" id="ims-company" value="${(s.myIdolInfo&&s.myIdolInfo.company)||''}" style="width:100%;border:1px solid #eee;border-radius:12px;padding:10px;font-size:12px;outline:none;background:#fafafa;" placeholder="如：SM">
                </div>
                <div style="flex:1;">
                    <div style="font-size:11px;font-weight:700;color:#333;margin-bottom:6px;letter-spacing:1px;">队友</div>
                    <input type="text" id="ims-teammates" value="${(s.myIdolInfo&&s.myIdolInfo.teammates)||''}" style="width:100%;border:1px solid #eee;border-radius:12px;padding:10px;font-size:12px;outline:none;background:#fafafa;" placeholder="逗号分隔">
                </div>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;padding:16px;background:#fafafa;border-radius:12px;border:1px solid #eee;">
                <div>
                    <div style="font-size:12px;font-weight:700;color:#111;">连通主控记忆</div>
                    <div style="font-size:10px;color:#888;margin-top:2px;">互动将写入微信主聊天</div>
                </div>
                <label class="switch" style="transform:scale(0.85);margin:0;">
                    <input type="checkbox" id="ims-memory" ${s.myMemoryToggle?'checked':''}>
                    <span class="slider round"></span>
                </label>
            </div>
            
            <div>
                <div style="font-size:11px;font-weight:700;color:#333;margin-bottom:6px;letter-spacing:1px;">危机触发间隔 (秒)</div>
                <input type="number" id="ims-crisis" value="${s.crisisInterval||3600}" style="width:100%;border:1px solid #eee;border-radius:12px;padding:10px;font-size:13px;outline:none;background:#fafafa;">
            </div>
            
            <button onclick="bbSaveIdolModeSettings('${aiId}')" style="width:100%;padding:16px;background:#111;color:#fff;border:none;border-radius:16px;font-weight:800;font-size:13px;cursor:pointer;letter-spacing:1px;margin-top:8px;">SAVE SETTING</button>
        </div>
    </div>`;
    document.body.appendChild(modal);
}

window.bbSaveIdolModeSettings = function(aiId) {
    const s = bbGetSettings(aiId);
    const wb = document.getElementById('ims-worldbook');
    if (wb) s.worldbook = wb.value;
    s.myIdolInfo = {
        team: document.getElementById('ims-team')?.value || '',
        skills: document.getElementById('ims-skills')?.value || '',
        company: document.getElementById('ims-company')?.value || '',
        teammates: document.getElementById('ims-teammates')?.value || '',
    };
    const mem = document.getElementById('ims-memory');
    if (mem) s.myMemoryToggle = mem.checked;
    const ci = document.getElementById('ims-crisis');
    if (ci) s.crisisInterval = parseInt(ci.value) || 3600;
    bbSaveSettingsObj(aiId, s);
    document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
    bbToast('我的爱豆信息已保存');
}

// 旧版兼容
window.bbEnterMode = function(mode) {
    if (mode === 'fan') window.bbEnterFanModeFlow();
    else if (mode === 'idol') window.bbEnterIdolModeFlow();
}

window.bbExitMode = function() {
    bbStopAllTimers();
    bbSet('current_mode', '');
    bbShowView('bb-landing-view');
}

// =====================================================================
// 定时器管理
// =====================================================================
let bbTimers = {};
function bbStopAllTimers() {
    Object.values(bbTimers).forEach(t => clearInterval(t));
    bbTimers = {};
}
function bbStartTimer(key, fn, interval) {
    if (bbTimers[key]) clearInterval(bbTimers[key]);
    bbTimers[key] = setInterval(fn, interval * 1000);
}

window.bbSubscribeAction = function(aiId) {
    const s = bbGetSettings(aiId);
    // 简单的确认订阅逻辑
    if (confirm("是否订阅 TA 的专属泡泡服务？\n订阅后可解锁评论和私信功能。")) {
        s.subscriptionDays = 1;
        s.subscribedAt = Date.now();
        bbSaveSettingsObj(aiId, s);
        bbInitFanMode(aiId); // 重新刷新界面
        bbToast("订阅成功！已解锁全部互动权限。");
    }
}

function bbInitFanMode(aiId) {
    const s = bbGetSettings(aiId);
    const d = bbGetData(aiId);

    const nameEl = document.getElementById('bb-fan-idol-name');
    if (nameEl) nameEl.textContent = bbGetAiName(aiId);
    const avatarEl = document.getElementById('bb-fan-idol-avatar');
    if (avatarEl) avatarEl.src = bbGetAiAvatar(aiId);
    
    // 核心修改：明确的订阅提示和按钮
    const daysEl = document.getElementById('bb-fan-days');
    if (daysEl) {
        if (s.subscriptionDays > 0) {
            daysEl.innerHTML = `已陪伴 ${s.subscriptionDays} 天 <span style="color:#ff7e67; margin-left:4px;"><i class="fas fa-heart"></i></span>`;
        } else {
            daysEl.innerHTML = `<button onclick="bbSubscribeAction('${aiId}')" style="background:#ff7e67; color:#fff; border:none; border-radius:10px; padding:3px 10px; font-size:10px; cursor:pointer; box-shadow:0 2px 8px rgba(255,126,103,0.3);">点击订阅</button>`;
        }
    }

    const tickerEl = document.getElementById('bb-fan-ticker');
    if (tickerEl) tickerEl.textContent = s.subscriptionDays > 0 ? '最新动态加载中...' : '尚未订阅，功能受限 ↑';

    bbRenderPublicPosts(aiId);
    bbRenderSecretMessages(aiId);
    bbRenderFanShop(aiId);
    bbSwitchFanTab('public');

    if (s.autoPostInterval > 0) {
        bbStartTimer('auto_post', () => bbAutoGeneratePost(aiId), s.autoPostInterval);
    }
}



window.bbSwitchFanTab = function(tab) {
    ['public','secret','shop'].forEach(t => {
        const btn = document.getElementById(`bb-fan-tab-${t}`);
        const content = document.getElementById(`bb-fan-content-${t}`);
        if (btn) btn.classList.toggle('active', t === tab);
        if (content) content.style.display = t === tab ? 'flex' : 'none';
    });
}

// =====================================================================
// 公开泡泡
// =====================================================================
function bbRenderPublicPosts(aiId) {
    const d = bbGetData(aiId);
    const container = document.getElementById('bb-public-messages');
    if (!container) return;
    container.innerHTML = '';

    if (!d.publicPosts || !d.publicPosts.length) {
        container.innerHTML = `<div class="bb-empty-hint"><div style="font-size:28px;margin-bottom:8px;">💭</div><div>等待爱豆发帖中...</div><div style="font-size:11px;color:#ddd;margin-top:4px;">点击右上角铃铛催更</div></div>`;
        return;
    }
    d.publicPosts.forEach(post => {
        container.insertAdjacentHTML('afterbegin', bbRenderPostCard(aiId, post));
    });
}

function bbRenderPostCard(aiId, post) {
    const avatar = bbGetAiAvatar(aiId);
    const name = bbGetAiName(aiId);
    // 使用消息的实际发送时间而不是当前时间
    const timeStr = new Date(post.time).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
    const flipTag = post.flipped ? `<span class="bb-flip-tag">🎉 TA 翻牌了！</span>` : '';
    const flipReply = post.flipReply ? `<div class="bb-flip-reply">↩ "${post.flipReply}"</div>` : '';
    const fanComments = (post.fanComments || []).map(fc =>
        `<div class="bb-ticker-fan-comment"><b>${fc.name}：</b>${fc.text}</div>`
    ).join('');
    const tickerSection = fanComments ? `<div class="bb-ticker-fans">${fanComments}</div>` : '';
    const myReply = post.myReply ? `<div class="bb-my-reply-preview">我的回复：${post.myReply}${flipReply}</div>` : '';
    const unreadDot = (post.unread && !post.unreadSeen) ? `<span class="bb-unread-badge" id="unread-${post.id}">1</span>` : '';
    const charLimit = bbGetCharLimit(aiId);
    const limitHint = charLimit < 999 ? `<div style="font-size:10px;color:#f59e0b;margin-bottom:4px;">⚠️ 当前字数限制 ${charLimit} 字</div>` : '';

    return `
    <div class="bb-public-post" id="post-${post.id}" data-post-id="${post.id}">
        <div class="bb-post-header">
            <img class="bb-post-avatar" src="${avatar}">
            <div class="bb-post-meta">
                <div class="bb-post-name">${name}<span class="bb-artist-badge">ARTIST</span></div>
                <span class="bb-post-time">${timeStr}</span>
            </div>
            ${unreadDot}
            <button onclick="bbCallApiForView('public')" style="background:none;border:none;cursor:pointer;color:#bbb;font-size:14px;padding:4px 6px;" title="催更"><i class="fas fa-sync-alt"></i></button>
        </div>
        <div class="bb-post-body">${post.content}</div>
        ${tickerSection}
        <div class="bb-post-footer">
            <span class="bb-post-stat"><i class="far fa-heart"></i> ${post.likes || 0}</span>
            <span class="bb-post-stat"><i class="far fa-comment"></i> ${post.comments || 0}</span>
            ${flipTag}
        </div>
        ${myReply}
        ${limitHint}
        <div id="reply-area-${post.id}">
            <div class="bb-reply-input-row">
                <input type="text" id="reply-input-${post.id}" class="bb-reply-input" placeholder="回复（最多${charLimit}字）" maxlength="${charLimit}">
                <button class="bb-reply-btn" onclick="bbFanReplyPost('${aiId}','${post.id}')"><i class="fas fa-paper-plane"></i></button>
            </div>
        </div>
    </div>`;
}

function bbGetCharLimit(aiId) {
    const s = bbGetSettings(aiId);
    const days = s.subscriptionDays || 0;
    if (days === 0) return 20;
    if (days < 7) return 30;
    if (days < 30) return 50;
    if (days < 90) return 100;
    if (days < 365) return 200;
    return 999;
}

window.bbFanTriggerPost = async function() {
    const aiId = bbCurrentAiId();
    bbToast('正在催更...');
    await bbAutoGeneratePost(aiId);
}

async function bbAutoGeneratePost(aiId) {
    const s = bbGetSettings(aiId);
    const d = bbGetData(aiId);
    const name = bbGetAiName(aiId);

    const persona = bbGetAiFriendPersona(aiId) + (s.aiPersona ? '\n' + s.aiPersona : '');
    const worldbook = (bbGetAiWorldbook(aiId) ? bbGetAiWorldbook(aiId) + '\n' : '') + (s.worldbook || '');
    const idolInfo = s.idolInfo || {};
    const idolInfoText = Object.values(idolInfo).filter(Boolean).join(' / ');

    const systemPrompt = `你是${name}，一位娱乐圈爱豆/艺人。${persona}\n${idolInfoText ? '你的信息：'+idolInfoText : ''}\n${worldbook ? '世界背景：'+worldbook : ''}\n\n你正在给粉丝群发一条Bubble动态。请生成：
1. 一条自然真实的日常动态（50-100字），语气根据人设
2. 生成8-12条不同类型粉丝的评论（格式：【昵称】：内容）
类型包括：妈粉、梦女粉、显微镜粉、事业粉、打投粉、普通粉、路人粉
最后输出格式：
【正文】动态内容
【粉丝评论】
昵称1：评论1
昵称2：评论2
...`;

    let fullText = '';
    try {
        fullText = await callAIAPI(systemPrompt, '请生成一条泡泡动态和粉丝评论。', null, null, null, true);
    } catch(e) { bbToast('API调用失败'); return; }

    if (!fullText) return;

    const bodyMatch = fullText.match(/【正文】([\s\S]*?)(?=【粉丝评论】|$)/);
    const commentsMatch = fullText.match(/【粉丝评论】([\s\S]*)/);
    const bodyText = bodyMatch ? bodyMatch[1].trim() : fullText.split('\n')[0];
    const fanComments = [];
    if (commentsMatch) {
        commentsMatch[1].trim().split('\n').forEach(line => {
            const m = line.match(/^(.+?)[:：](.+)$/);
            if (m) fanComments.push({ name: m[1].trim(), text: m[2].trim() });
        });
    }

    const post = {
        id: Date.now().toString(),
        content: bodyText,
        fanComments: fanComments.slice(0, 12),
        time: Date.now(),
        likes: Math.floor(Math.random() * 50000 + 10000),
        comments: Math.floor(Math.random() * 5000 + 500),
        unread: true, unreadSeen: false,
        myReply: null, flipped: false, flipReply: null
    };

    d.publicPosts = d.publicPosts || [];
    d.publicPosts.unshift(post);
    if (d.publicPosts.length > 30) d.publicPosts.pop();
    bbSaveData(aiId, d);
    bbRenderPublicPosts(aiId);

    if (fanComments.length) {
        const tickerEl = document.getElementById('bb-fan-ticker');
        if (tickerEl) {
            const preview = fanComments.slice(0, 3).map(c => `${c.name}：${c.text}`).join(' · ');
            tickerEl.textContent = preview;
        }
    }

    const delay = (Math.random() * 180 + 30) * 1000;
    setTimeout(() => { bbMarkPostRead(aiId, post.id); }, delay);
    bbToast(`${name} 更新了新动态！`);
}

function bbMarkPostRead(aiId, postId) {
    const d = bbGetData(aiId);
    const post = (d.publicPosts || []).find(p => p.id === postId);
    if (!post) return;
    post.unreadSeen = true;
    if (!post.myReply && Math.random() < 0.15) { post.flipped = true; }
    bbSaveData(aiId, d);
    const badge = document.getElementById(`unread-${postId}`);
    if (badge) badge.remove();
}

window.bbFanReplyPost = async function(aiId, postId) {
    // === 新增：拦截判断 ===
    const s = bbGetSettings(aiId);
    if (!s.subscriptionDays || s.subscriptionDays <= 0) {
        bbToast('请先点击上方按钮订阅 TA，才能发表评论哦！');
        return;
    }
    
    const input = document.getElementById(`reply-input-${postId}`);
    if (!input || !input.value.trim()) return;
    const text = input.value.trim();
    const charLimit = bbGetCharLimit(aiId);
    if (text.length > charLimit) { bbToast(`字数超过限制（${charLimit}字）`); return; }

    const d = bbGetData(aiId);
    const post = (d.publicPosts || []).find(p => p.id === postId);
    if (!post) return;
    post.myReply = text;
    post.comments = (post.comments || 0) + 1;
    bbSaveData(aiId, d);
    input.value = '';

    if (s.memoryToggle) {
        if (typeof saveMessageToHistory === 'function') {
            await saveMessageToHistory(aiId, { text: `[Bubble互动] 粉丝(我)回复了动态: ${text}`, type: 'system', senderName: 'ME' });
        }
    }

    const flipChance = Math.random();
    if (flipChance < 0.2) {
        setTimeout(async () => {
            const name = bbGetAiName(aiId);
            const persona = s.aiPersona || bbGetAiFriendPersona(aiId);
            let reply = '';
            try {
                reply = await callAIAPI(
                    `你是${name}爱豆。${persona}\n粉丝评论：${text}\n请用爱豆的口吻简短回应这条粉丝评论（15字以内）。`,
                    text, null, null, null, true
                );
            } catch(e) { reply = '谢谢宝贝~'; }
            post.flipped = true;
            post.flipReply = reply.trim().slice(0,30);
            bbSaveData(aiId, d);
            bbRenderPublicPosts(aiId);
            bbToast(`🎉 ${name} 翻牌了你！`);
        }, (Math.random() * 10 + 3) * 1000);
    } else {
        bbRenderPublicPosts(aiId);
    }
}

// =====================================================================
// 秘密私信
// =====================================================================
let bbLongPressTimer = null;
window.bbStartLongPress = function() {
    bbLongPressTimer = setTimeout(() => {
        const aiId = bbCurrentAiId();
        bbTryEnterSecretChat(aiId);
    }, 800);
}
window.bbEndLongPress = function() {
    if (bbLongPressTimer) { clearTimeout(bbLongPressTimer); bbLongPressTimer = null; }
}

function bbTryEnterSecretChat(aiId) {
    const d = bbGetData(aiId);
    if (!d.secretUnlocked) {
        bbShowSecretRejectDialog(aiId, d, bbGetSettings(aiId), bbGetAiName(aiId));
        return;
    }
    bbSwitchFanTab('secret');
}

function bbShowSecretRejectDialog(aiId, d, s, name) {
    const progress = d.secretProgress || 0;
    const msgs = [
        '私信功能尚未开放，请先订阅并与TA互动...',
        '还需要更多的互动才能解锁哦～目前好感度不够',
        `${name} 很忙，暂时没有精力回复私信，等等看？`,
        '经纪人说了，私信需要至少30天的亲密度才能开放',
        `${name}：（看了一眼消息又关掉了）`,
    ];
    const msg = msgs[Math.min(Math.floor(progress / 20), msgs.length - 1)];
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.style.cssText = 'z-index:6500;';
    modal.innerHTML = `
    <div style="background:#fff;border-radius:24px;padding:24px;max-width:280px;width:90%;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,0.12);animation:bbPopIn 0.3s ease;">
        <div style="font-size:32px;margin-bottom:12px;">🔒</div>
        <div style="font-size:14px;font-weight:700;color:#333;margin-bottom:8px;">私信未解锁</div>
        <div style="font-size:13px;color:#777;line-height:1.6;margin-bottom:16px;">${msg}</div>
        <div style="background:#f5f5f5;border-radius:12px;padding:10px;margin-bottom:16px;">
            <div style="font-size:11px;color:#aaa;margin-bottom:4px;">亲密度进度</div>
            <div style="background:#eee;border-radius:8px;height:6px;overflow:hidden;">
                <div style="background:#111;width:${progress}%;height:100%;border-radius:8px;transition:0.3s;"></div>
            </div>
            <div style="font-size:10px;color:#aaa;margin-top:4px;">${progress} / 100</div>
        </div>
        <button onclick="this.closest('.modal-overlay').remove()" style="width:100%;padding:12px;background:#111;color:#fff;border:none;border-radius:14px;font-weight:700;cursor:pointer;">知道了</button>
    </div>
    <style>@keyframes bbPopIn{from{opacity:0;transform:scale(0.9);}to{opacity:1;transform:scale(1);}}</style>`;
    document.body.appendChild(modal);
}

function bbRenderSecretMessages(aiId) {
    const d = bbGetData(aiId);
    const container = document.getElementById('bb-secret-messages');
    if (!container) return;
    container.innerHTML = '';
    if (!d.secretUnlocked) {
        container.innerHTML = `<div class="bb-secret-locked"><div style="font-size:40px;margin-bottom:16px;">💌</div><div style="font-size:14px;font-weight:700;color:#333;margin-bottom:8px;">专属私信通道</div><div style="font-size:12px;color:#999;text-align:center;line-height:1.6;">长按爱豆头像可尝试进入</div></div>`;
        return;
    }
    const msgs = d.secretMessages || [];
    if (!msgs.length) {
        container.innerHTML = `<div class="bb-empty-hint"><div style="font-size:24px;margin-bottom:8px;">💬</div><div style="font-size:12px;">暂无私信</div></div>`;
        return;
    }
    msgs.forEach(msg => {
        const isMe = msg.role === 'user';
        const avatar = isMe ? bbGetMyPersonaAvatar() : bbGetAiAvatar(aiId);
        container.insertAdjacentHTML('beforeend', `
        <div class="bb-secret-row ${isMe ? 'me' : ''}">
            <img class="bb-secret-avatar" src="${avatar}">
            <div class="${isMe ? 'bb-bubble-me' : 'bb-bubble-idol'}">${msg.content}</div>
        </div>`);
    });
    setTimeout(() => container.scrollTop = container.scrollHeight, 100);
}

window.bbFanSendSecret = async function() {
    const aiId = bbCurrentAiId();
    
    // === 新增：拦截判断 ===
    const s = bbGetSettings(aiId);
    if (!s.subscriptionDays || s.subscriptionDays <= 0) {
        bbToast('请先点击上方按钮订阅 TA，才能使用私信功能！');
        return;
    }
    
    const d = bbGetData(aiId);
    if (!d.secretUnlocked) { bbToast('私信尚未解锁'); return; }
    const input = document.getElementById('bb-secret-input');
    if (!input || !input.value.trim()) return;
    const text = input.value.trim();
    input.value = '';

    d.secretMessages = d.secretMessages || [];
    d.secretMessages.push({ role: 'user', content: text, time: Date.now() });
    bbSaveData(aiId, d);
    bbRenderSecretMessages(aiId);

    const name = bbGetAiName(aiId);
    const persona = s.aiPersona || bbGetAiFriendPersona(aiId);
    const worldbook = s.worldbook || '';
    const systemPrompt = `你是${name}，在公开场合你阳光开朗，但私信时会露出真实且亲密的一面。${persona}\n${worldbook ? '世界：'+worldbook : ''}\n\n这是和粉丝的秘密私信对话。你可以吐槽工作、表达真实情感、分享只有两人知道的秘密。回复要自然、亲密，区别于公开发言。`;
    const history = d.secretMessages.slice(-10).map(m => ({role: m.role, content: m.content}));

    let reply = '';
    try {
        reply = await callAIAPI(systemPrompt, text, history.slice(0,-1), null, null, true);
    } catch(e) { reply = '（好忙啊，等等...）'; }

    d.secretMessages.push({ role: 'assistant', content: reply.trim(), time: Date.now() });
    d.secretProgress = Math.min(100, (d.secretProgress || 0) + 3);
    bbSaveData(aiId, d);
    bbRenderSecretMessages(aiId);

    if (s.memoryToggle) {
        if (typeof saveMessageToHistory === 'function') {
            await saveMessageToHistory(aiId, { text: `[Bubble私信] 爱豆说：${reply.trim().slice(0,50)}`, type: 'system', senderName: 'AI' });
        }
    }
}


// =====================================================================
// 周边商城（粉丝视角）
// =====================================================================
function bbRenderFanShop(aiId) {
    const d = bbGetData(aiId);
    const container = document.getElementById('bb-fan-shop-list');
    if (!container) return;
    container.innerHTML = '';
    const name = bbGetAiName(aiId);
    const avatar = bbGetAiAvatar(aiId);

    container.insertAdjacentHTML('beforeend', `
    <div class="bb-shop-idol-header">
        <img class="bb-shop-idol-av" src="${avatar}">
        <div style="flex:1;">
            <div style="font-size:14px;font-weight:800;color:#111;">${name} 的官方周边</div>
            <div style="font-size:11px;color:#aaa;">OFFICIAL MERCHANDISE</div>
        </div>
        <button onclick="bbCallApiForView('shop')" style="background:#f5f5f5;border:none;border-radius:12px;padding:6px 12px;font-size:11px;cursor:pointer;color:#111;"><i class="fas fa-sync-alt"></i> 刷新</button>
    </div>`);

    const merch = d.merch || [];
    if (!merch.length) {
        container.insertAdjacentHTML('beforeend', `<div class="bb-empty-hint"><div style="font-size:28px;margin-bottom:8px;">🛍️</div><div>暂无周边上架</div><div style="font-size:11px;color:#ddd;margin-top:4px;">点击刷新获取最新周边</div></div>`);
        return;
    }
    merch.forEach(item => {
        const beanBalance = bbGetBeanCoins(aiId);
        const canBuy = beanBalance >= item.price;
        container.insertAdjacentHTML('beforeend', `
        <div class="bb-shop-item">
            <div class="bb-shop-info">
                <div class="bb-shop-name">${item.name}</div>
                <div style="font-size:11px;color:#aaa;margin-top:2px;">${item.desc || '限量发售'}</div>
                <div class="bb-shop-price">${item.price} 豆币</div>
            </div>
            <button class="bb-shop-buy-btn" onclick="bbFanBuyItem('${aiId}','${item.id}')" ${canBuy ? '' : 'disabled'}>
                ${canBuy ? '购买' : '豆币不足'}
            </button>
        </div>`);
    });
}

window.bbFanBuyItem = async function(aiId, itemId) {
    const d = bbGetData(aiId);
    const item = (d.merch || []).find(m => m.id === itemId);
    if (!item) return;
    if (bbGetBeanCoins(aiId) < item.price) { bbToast('豆币不足，点击头像旁余额充值'); return; }
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.style.cssText = 'z-index:7000;';
      modal.innerHTML = `
    <div style="background:#fff; border-radius:20px; width:85%; max-width:280px; padding:0; text-align:center; overflow:hidden; box-sizing: border-box; border: 1px solid #eee;">
        <div style="padding:25px 20px 20px;">
            <div style="font-size:15px; font-weight:800; color:#111; margin-bottom:8px;">确认购买</div>
            <div style="font-size:12px; color:#666;">将消耗 <b style="color:#111;">${item.price}</b> 豆币购买<br>「${item.name}」</div>
        </div>
        <div style="display:flex; border-top:1px solid #eee; box-sizing: border-box;">
            <div onclick="this.closest('.modal-overlay').remove()" style="flex:1; padding:12px; cursor:pointer; color:#999; font-size:13px; font-weight:600;">取消</div>
            <div id="bb-confirm-buy-btn" style="flex:1; padding:12px; cursor:pointer; color:#111; font-weight:800; font-size:13px; border-left:1px solid #eee;">确定</div>
        </div>
    </div>`;

    document.body.appendChild(modal);

    document.getElementById('bb-confirm-buy-btn').onclick = () => {
        modal.remove();
        bbSpendBeans(aiId, item.price, `购买周边：${item.name}`);
        const backpackItems = JSON.parse(localStorage.getItem('bb_backpack_items') || '[]');
        backpackItems.push({ id: Date.now().toString(), name: item.name, desc: item.desc || '', price: item.price, from: bbGetAiName(aiId), time: Date.now(), type: 'merch' });
        localStorage.setItem('bb_backpack_items', JSON.stringify(backpackItems));
        d.secretProgress = Math.min(100, (d.secretProgress || 0) + 10);
        if (d.secretProgress >= 100 && !d.secretUnlocked) { 
            d.secretUnlocked = true; 
            bbToast('🎉 亲密度达标！私信通道已解锁！'); 
        }
        bbSaveData(aiId, d);
        bbShowPurchaseReceipt(item, aiId);
        bbRenderFanShop(aiId);
        
        const s = bbGetSettings(aiId);
        if (s.memoryToggle) {
            if (typeof saveMessageToHistory === 'function') {
                saveMessageToHistory(aiId, { text: `[Bubble互动] 粉丝(我)购买了周边: ${item.name}`, type: 'system', senderName: 'ME' });
            }
        }
    };
}

function bbShowPurchaseReceipt(item, aiId) {
    const name = bbGetAiName(aiId);
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.style.cssText = 'z-index:6500;';
    modal.innerHTML = `
    <div style="background:#fff;border-radius:24px;padding:30px 24px;max-width:300px;width:90%;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,0.12);">
        <div style="font-size:36px;margin-bottom:12px;">🎁</div>
        <div style="font-weight:900;font-size:16px;color:#111;margin-bottom:4px;">购买成功！</div>
        <div style="background:#f9f9f9;border-radius:16px;padding:16px;text-align:left;margin-bottom:20px;">
            <div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px dashed #eee;"><span style="color:#888;">商品</span><span style="font-weight:700;color:#111;">${item.name}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px dashed #eee;"><span style="color:#888;">来自</span><span style="font-weight:700;color:#111;">${name}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0;"><span style="color:#888;">花费</span><span style="font-weight:800;color:#111;">${item.price} 豆币</span></div>
        </div>
        <div style="font-size:11px;color:#aaa;margin-bottom:16px;">📦 已存入我的背包</div>
        <button onclick="this.closest('.modal-overlay').remove()" style="width:100%;padding:14px;background:#111;color:#fff;border:none;border-radius:14px;font-weight:800;cursor:pointer;">收好啦</button>
    </div>`;
    document.body.appendChild(modal);
}

async function bbGenerateMerch(aiId) {
    const s = bbGetSettings(aiId);
    const name = bbGetAiName(aiId);
    const persona = s.aiPersona || bbGetAiFriendPersona(aiId);
    const systemPrompt = `你是${name}的经纪公司。${persona}\n请生成3款限量周边商品，每款包括：名称、简介、价格（100-9999豆币）。\n格式：\n名称：xxx\n简介：xxx（10-20字）\n价格：xxx`;
    let text = '';
    try { text = await callAIAPI(systemPrompt, '生成三款周边', null, null, null, true); } catch(e) { bbToast('生成失败'); return []; }
    const items = [];
    const blocks = text.split(/\n(?=名称：)/);
    blocks.forEach(block => {
        const nameM = block.match(/名称：(.+)/);
        const descM = block.match(/简介：(.+)/);
        const priceM = block.match(/价格：(\d+)/);
        if (nameM && priceM) {
            items.push({ id: Date.now().toString() + Math.random().toString(36).slice(2), name: nameM[1].trim(), desc: descM ? descM[1].trim() : '', price: parseInt(priceM[1]), time: Date.now() });
        }
    });
    return items;
}

// =====================================================================
// API调用按钮
// =====================================================================
window.bbCallApiForView = function(viewType) {
    const aiId = bbCurrentAiId();
    switch(viewType) {
        case 'public': bbAutoGeneratePost(aiId); break;
        case 'shop': bbCallRefreshShop(aiId); break;
        case 'fans': bbIdolRefreshFans(aiId); break;
        case 'merch': bbIdolCallSalesReport(aiId); break;
        case 'pr': bbIdolCheckNewCrisis(aiId); break;
        case 'creator': bbIdolPost(); break;
    }
}

async function bbCallRefreshShop(aiId) {
    bbToast('正在生成新周边...');
    const newMerch = await bbGenerateMerch(aiId);
    if (newMerch.length) {
        const d = bbGetData(aiId);
        d.merch = newMerch;
        bbSaveData(aiId, d);
        bbRenderFanShop(aiId);
        bbToast(`上架了 ${newMerch.length} 款新周边！`);
    }
}

// =====================================================================
// ███████╗ 爱豆模式 ███████╗
// =====================================================================
function bbInitIdolMode(aiId) {
    const d = bbGetData(aiId);
    const s = bbGetSettings(aiId);
    const fanCount = document.getElementById('bb-idol-fan-count');
    if (fanCount) fanCount.textContent = bbFormatNum(d.idolFanCount || 0);
    const revEl = document.getElementById('bb-idol-revenue');
    if (revEl) revEl.textContent = d.idolRevenue || 0;
    const revMerch = document.getElementById('bb-merch-revenue');
    if (revMerch) revMerch.textContent = d.idolRevenue || 0;
    const wdBtn = document.getElementById('bb-withdraw-btn');
    if (wdBtn) wdBtn.style.display = (d.idolRevenue || 0) > 0 ? 'block' : 'none';
    bbRenderCreatorHistory(aiId);
    bbRenderIdolMerch(aiId);
    bbRenderIdolPR(aiId);
    bbSwitchIdolTab('creator');
    if (s.crisisInterval > 0) {
        bbStartTimer('crisis', () => bbIdolCheckNewCrisis(aiId), s.crisisInterval);
    }
}

window.bbSwitchIdolTab = function(tab) {
    ['creator','fans','merch','pr'].forEach(t => {
        const btn = document.getElementById(`bb-idol-tab-${t}`);
        const content = document.getElementById(`bb-idol-content-${t}`);
        if (btn) btn.classList.toggle('active', t === tab);
        if (content) content.style.display = t === tab ? 'flex' : 'none';
    });
    if (tab === 'fans') { bbIdolRefreshFans(bbCurrentAiId()); }
}

window.bbIdolPost = async function() {
    const aiId = bbCurrentAiId();
    const input = document.getElementById('bb-idol-post-input');
    if (!input || !input.value.trim()) { bbToast('请先输入动态内容'); return; }
    const text = input.value.trim();
    input.value = '';
    const d = bbGetData(aiId);
    d.publicPosts = d.publicPosts || [];
    d.publicPosts.unshift({ id: Date.now().toString(), content: text, time: Date.now(), likes: 0, comments: 0, revenue: 0 });
    bbSaveData(aiId, d);
    bbRenderCreatorHistory(aiId);
    bbToast('正在生成粉丝反应...');
    await bbIdolRefreshFans(aiId, text);
}

function bbRenderCreatorHistory(aiId) {
    const d = bbGetData(aiId);
    const container = document.getElementById('bb-creator-history');
    if (!container) return;
    container.innerHTML = '';
    const posts = d.publicPosts || [];
    if (!posts.length) { container.innerHTML = '<div class="bb-empty-hint"><div style="font-size:12px;">尚未发布任何动态</div></div>'; return; }
    posts.slice(0, 10).forEach(post => {
        // 使用真实发信息时间
        const timeStr = new Date(post.time).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'});
        container.insertAdjacentHTML('beforeend', `
        <div class="bb-history-post" onclick="bbIdolViewHistoryFans('${aiId}', '${post.id}')" style="cursor:pointer; border:1px solid #f0f0f0; padding:12px; border-radius:12px; margin-bottom:10px; background:#fff; transition:0.2s; box-shadow:0 2px 8px rgba(0,0,0,0.02);">
            <div style="font-size:13px;color:#333;margin-bottom:8px;">${post.content}</div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#aaa;"><span>${timeStr}</span><span>❤️ ${post.likes} · 💬 ${post.comments} <i class="fas fa-chevron-right" style="margin-left:4px; font-size:9px;"></i></span></div>
        </div>`);
    });
}

window.bbIdolViewHistoryFans = async function(aiId, postId) {
    const d = bbGetData(aiId);
    const post = (d.publicPosts || []).find(p => p.id === postId);
    if (!post) return;
    
    // 如果这条动态已经有绑定的粉丝回复，直接展示
    if (post.fanReplies && post.fanReplies.length > 0) {
        d.fanReplies = post.fanReplies;
        bbSaveData(aiId, d);
        bbSwitchIdolTab('fans');
    } else {
        // 如果没有，就帮它生成一次
        bbSwitchIdolTab('fans');
        bbToast('正在回顾当时粉丝的反应...');
        await bbIdolRefreshFans(aiId, post.content, postId);
    }
}

window.bbIdolRefreshFans = async function(aiId, triggerContent, postId) {
    const d = bbGetData(aiId);
    const s = bbGetSettings(aiId);
    const myName = bbGetMyPersonaName();
    
    let aiFriendName = "粉丝";
    let aiFriendAvatar = "https://api.dicebear.com/7.x/avataaars/svg?seed=fans";
    const friendKeys = Object.keys(getGlobalFriends());
    if (friendKeys.length > 0) {
        const rk = friendKeys[Math.floor(Math.random() * friendKeys.length)];
        const gf = getGlobalFriends()[rk];
        aiFriendName = gf.remark || gf.realName;
        aiFriendAvatar = gf.avatar || aiFriendAvatar;
    }

    const postText = triggerContent || (d.publicPosts && d.publicPosts[0] ? d.publicPosts[0].content : '今天工作好充实，爱大家~');
    const systemPrompt = `你是一位娱乐圈爱豆${myName}的Bubble平台。\n爱豆刚刚发布了：「${postText}」\n请生成15-20条来自不同类型粉丝的真实评论，类型包括：\n- 妈粉（关心健康）\n- 梦女粉（幻想恋爱关系）\n- 显微镜粉（找细节）\n- 打投粉（事业脑）\n- 氪金大粉\n- 路人粉\n- 黑粉\n- 普通粉丝\n每条格式：【粉丝名】|【类型】|【评论内容】\n粉丝名要求：使用有创意的中文网络ID，例如：清晨的橘子酱、不会游泳的鱼、深夜失眠中、宇宙第一迷妹、路过的人间烟火、待机中勿扰、已读乱回、半糖去冰、星期八快乐、困了睡不着等风格，不要用"粉丝甲乙丙"这种无聊的名字。\n另外，把"${aiFriendName}"也作为一个特别粉丝加入，TA会说一些暧昧或特别的话。`;
    let text = '';
    try { text = await callAIAPI(systemPrompt, '生成粉丝评论', null, null, null, true); }
    catch(e) { text = `【粉丝甲】|普通粉|哇哇哇太好了！！\n【妈妈粉】|妈粉|宝宝记得吃饭！\n【${aiFriendName}】|特别粉丝|（悄悄点了个赞）`; }
    const fans = [];
    text.split('\n').forEach(line => {
        const m = line.match(/【(.+?)】\|(.+?)\|(.+)/);
        if (m) { fans.push({ id: Date.now().toString() + Math.random().toString(36).slice(2), name: m[1].trim(), type: m[2].trim(), comment: m[3].trim(), isAiFriend: m[1].trim() === aiFriendName || m[1].trim().includes(aiFriendName), avatar: m[1].trim().includes(aiFriendName) ? aiFriendAvatar : null, time: Date.now() }); }
    });
    d.fanReplies = fans;
    bbSaveData(aiId, d);
    bbRenderFanWaterfall(aiId);
}

function bbRenderFanWaterfall(aiId) {
    const d = bbGetData(aiId);
    const container = document.getElementById('bb-fans-waterfall');
    if (!container) return;
    container.innerHTML = '';
    const fans = d.fanReplies || [];
    if (!fans.length) {
        container.innerHTML = `<div style="text-align:center;padding:30px;color:#bbb;"><div style="font-size:28px;margin-bottom:8px;">💬</div><div style="font-size:12px;">点击"发布动态"或刷新按钮生成粉丝反应</div></div>`;
        return;
    }
    fans.forEach(fan => {
        const typeColor = { '妈粉':'#ff9800','梦女粉':'#e91e63','显微镜粉':'#9c27b0','打投粉':'#2196f3','氪金大粉':'#f59e0b','黑粉':'#f44336','路人粉':'#999' };
        const color = typeColor[fan.type] || '#555';
        const isAi = fan.isAiFriend;
        const avatar = fan.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fan.name)}`;
        container.insertAdjacentHTML('beforeend', `
        <div class="bb-fan-reply-card ${isAi ? 'bb-ai-persona-reply' : ''}">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                <img class="bb-fan-reply-avatar" src="${avatar}" onclick="bbIdolOpenFanChat('${aiId}','${fan.id}','${fan.name}','${avatar}')" style="cursor:pointer;">
                <div style="flex:1;">
                    <div style="font-size:13px;font-weight:700;color:${isAi ? '#111' : '#333'};">${fan.name} ${isAi ? '<span style="font-size:9px;background:#111;color:#fff;padding:2px 6px;border-radius:6px;letter-spacing:1px;margin-left:4px;">SPECIAL</span>' : ''}</div>
                    <span style="font-size:10px;color:#888;font-weight:600;">${fan.type}</span>
                </div>
                <button class="bb-reply-fan-btn" onclick="bbIdolReplyFan('${aiId}','${fan.id}','${fan.type}')">回复</button>
            </div>
            <div style="font-size:13px;color:#444;line-height:1.5;">${fan.comment}</div>
            <div id="fan-reply-result-${fan.id}"></div>
        </div>`);
    });
}

window.bbIdolReplyFan = function(aiId, fanId, fanType) {
    const resultEl = document.getElementById(`fan-reply-result-${fanId}`);
    if (!resultEl) return;
    if (resultEl.querySelector('.bfr-input-row')) return; // 已经展开过了
    resultEl.innerHTML = `
    <div class="bfr-input-row" style="display:flex;gap:6px;align-items:center;margin-top:8px;">
        <input type="text" id="bfr-input-${fanId}" style="flex:1;border:1px solid #ddd;border-radius:14px;padding:7px 12px;font-size:12px;outline:none;background:#fff;min-width:0;" placeholder="输入回复内容...">
        <button onclick="bbIdolSubmitManualReply('${aiId}','${fanId}','${fanType}')" style="width:30px;height:30px;background:#111;color:#fff;border:none;border-radius:50%;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;"><i class="fas fa-paper-plane" style="font-size:10px;"></i></button>
    </div>`;
    const inp = document.getElementById(`bfr-input-${fanId}`);
    if (inp) inp.focus();
}

window.bbIdolSubmitManualReply = function(aiId, fanId, fanType) {
    const input = document.getElementById(`bfr-input-${fanId}`);
    if (!input || !input.value.trim()) return;
    const reply = input.value.trim();
    const d = bbGetData(aiId);
    const fan = (d.fanReplies || []).find(f => f.id === fanId);
    if (!fan) return;

    let effect = ''; let incomeChange = 0; let fanChange = 0;
    if (fanType === '氪金大粉' || fanType === '打投粉') {
        incomeChange = Math.floor(Math.random() * 500 + 200);
        effect = `💰 +${incomeChange} 豆币收益`;
        d.idolRevenue = (d.idolRevenue || 0) + incomeChange;
    } else if (fanType === '妈粉' || fanType === '梦女粉') {
        fanChange = Math.floor(Math.random() * 200 + 50);
        effect = `💗 活粉 +${fanChange}`;
        d.idolFanCount = (d.idolFanCount || 0) + fanChange;
    } else if (fanType === '黑粉') {
        incomeChange = -50;
        effect = `📉 收益 -50（回应黑粉风险）`;
        d.idolRevenue = Math.max(0, (d.idolRevenue || 0) - 50);
    } else {
        fanChange = Math.floor(Math.random() * 50 + 10);
        effect = `💗 好感 +${fanChange}`;
        d.idolFanCount = (d.idolFanCount || 0) + fanChange;
    }
    fan.myReply = reply;
    bbSaveData(aiId, d);

    const resultEl = document.getElementById(`fan-reply-result-${fanId}`);
    if (resultEl) {
        resultEl.innerHTML = `<div style="background:#f9f9f9;border-radius:10px;padding:8px 10px;margin-top:8px;font-size:12px;border:1px solid #eee;"><div style="color:#333;font-weight:600;">我的回复：${reply}</div>${effect ? `<div style="color:#111;font-weight:700;margin-top:4px;">${effect}</div>` : ''}</div>`;
    }
    const fanCount = document.getElementById('bb-idol-fan-count');
    if (fanCount) fanCount.textContent = bbFormatNum(d.idolFanCount || 0);
    const revEl = document.getElementById('bb-idol-revenue');
    if (revEl) revEl.textContent = d.idolRevenue || 0;
    const revMerch = document.getElementById('bb-merch-revenue');
    if (revMerch) revMerch.textContent = d.idolRevenue || 0;
    const wdBtn = document.getElementById('bb-withdraw-btn');
    if (wdBtn) wdBtn.style.display = (d.idolRevenue || 0) > 0 ? 'block' : 'none';
}

window.bbIdolOpenFanChat = function(aiId, fanId, fanName, fanAvatar) {
    const existing = document.getElementById('bb-fan-private-modal');
    if (existing) existing.remove();
    const existingBd = document.getElementById('bb-fan-private-backdrop');
    if (existingBd) existingBd.remove();

    // 挂载到 bubbleApp 容器，确保不超出手机屏幕
    const appContainer = document.getElementById('bubbleApp') || document.body;

    // 半透明遮罩（点击关闭）
    const backdrop = document.createElement('div');
    backdrop.id = 'bb-fan-private-backdrop';
    backdrop.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);z-index:6498;';
    backdrop.onclick = () => {
        backdrop.remove();
        const m = document.getElementById('bb-fan-private-modal');
        if (m) m.remove();
    };
    appContainer.appendChild(backdrop);

    // 底部面板（position:absolute，锚定在 bubbleApp 底部，不超出手机边界）
    const modal = document.createElement('div');
    modal.id = 'bb-fan-private-modal';
    modal.style.cssText = [
        'position:absolute',
        'bottom:0',
        'left:0',
        'right:0',
        'z-index:6499',
        'background:#fff',
        'border-radius:20px 20px 0 0',
        'display:flex',
        'flex-direction:column',
        'max-height:55%',
        'overflow:hidden',
        'box-shadow:0 -6px 24px rgba(0,0,0,0.12)',
        'box-sizing:border-box',
    ].join(';');
    modal.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:12px 16px 10px;border-bottom:1px solid #f5f5f5;flex-shrink:0;">
            <img src="${fanAvatar}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;">
            <span style="font-size:13px;font-weight:800;color:#111;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${fanName}</span>
            <i class="fas fa-times" onclick="document.getElementById('bb-fan-private-backdrop').remove();document.getElementById('bb-fan-private-modal').remove();" style="cursor:pointer;color:#aaa;font-size:15px;padding:4px;flex-shrink:0;"></i>
        </div>
        <div id="bfp-messages" style="flex:1;overflow-y:auto;padding:10px 14px;min-height:0;display:flex;flex-direction:column;gap:8px;background:#fafafa;">
            <div style="text-align:center;font-size:9px;color:#bbb;padding:6px;letter-spacing:1px;font-weight:600;">PRIVATE CHAT · ${fanName}</div>
        </div>
        <div style="display:flex;gap:8px;padding:8px 12px;padding-bottom:max(8px, env(safe-area-inset-bottom, 8px));border-top:1px solid #eee;flex-shrink:0;background:#fff;">
            <input type="text" id="bfp-input" style="flex:1;border:1px solid #eee;border-radius:18px;padding:8px 13px;font-size:12px;outline:none;background:#fff;color:#111;min-width:0;" placeholder="给 ${fanName} 发私信...">
            <button onclick="bbIdolSendFanPrivate('${aiId}','${fanId}','${fanName}','${fanAvatar}')" style="width:32px;height:32px;background:#111;color:#fff;border:none;border-radius:50%;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;"><i class="fas fa-paper-plane" style="font-size:10px;"></i></button>
        </div>`;
    appContainer.appendChild(modal);

    // 加载历史对话记录
    const d = bbGetData(aiId);
    const history = (d.fanPrivateChats || {})[fanName] || [];
    if (history.length > 0) {
        const myAvatar = bbGetMyPersonaAvatar();
        const container = document.getElementById('bfp-messages');
        history.forEach(msg => {
            if (msg.role === 'idol') {
                container.insertAdjacentHTML('beforeend', `<div style="display:flex;align-items:flex-end;gap:8px;flex-direction:row-reverse;"><img src="${myAvatar}" style="width:28px;height:28px;border-radius:50%;flex-shrink:0;object-fit:cover;"><div style="background:#111;color:#fff;padding:10px 14px;border-radius:16px 16px 4px 16px;font-size:13px;max-width:75%;">${msg.content}</div></div>`);
            } else {
                container.insertAdjacentHTML('beforeend', `<div style="display:flex;align-items:flex-end;gap:8px;"><img src="${fanAvatar}" style="width:28px;height:28px;border-radius:50%;flex-shrink:0;object-fit:cover;"><div style="background:#f5f5f5;color:#333;padding:10px 14px;border-radius:16px 16px 16px 4px;font-size:13px;max-width:75%;border:1px solid #eee;">${msg.content}</div></div>`);
            }
        });
        setTimeout(() => { const c = document.getElementById('bfp-messages'); if(c) c.scrollTop = c.scrollHeight; }, 100);
    }
}


window.bbIdolSendFanPrivate = async function(aiId, fanId, fanName, fanAvatar) {
    const input = document.getElementById('bfp-input');
    if (!input || !input.value.trim()) return;
    const text = input.value.trim();
    input.value = '';
    const container = document.getElementById('bfp-messages');
    const myAvatar = bbGetMyPersonaAvatar();
    const myName = bbGetMyPersonaName();

    // 立即显示爱豆发出的消息
    container.insertAdjacentHTML('beforeend', `<div style="display:flex;align-items:flex-end;gap:8px;flex-direction:row-reverse;"><img src="${myAvatar}" style="width:28px;height:28px;border-radius:50%;flex-shrink:0;object-fit:cover;"><div style="background:#111;color:#fff;padding:10px 14px;border-radius:16px 16px 4px 16px;font-size:13px;max-width:75%;">${text}</div></div>`);
    container.scrollTop = container.scrollHeight;

    // 保存到记忆
    const d = bbGetData(aiId);
    d.fanPrivateChats = d.fanPrivateChats || {};
    d.fanPrivateChats[fanName] = d.fanPrivateChats[fanName] || [];
    d.fanPrivateChats[fanName].push({ role: 'idol', content: text, time: Date.now() });

    // 构建历史上下文（最近10条）
    const fanTypeData = (d.fanReplies || []).find(f => f.id === fanId);
    const fanType = fanTypeData ? fanTypeData.type : '普通粉丝';
    const chatHistory = d.fanPrivateChats[fanName].slice(-10).map(m => ({
        role: m.role === 'idol' ? 'user' : 'assistant',
        content: m.content
    }));

    const systemPrompt = `你扮演${fanName}，一位${fanType}类型的粉丝，性格鲜明、说话风格固定。爱豆${myName}正在私信你。请保持角色连贯性，用粉丝的口吻回复爱豆（20-40字，要有粉丝的情感和该类型粉丝的特点）。记住之前的对话内容，保持上下文连贯。`;
    let reply = '';
    try {
        reply = await callAIAPI(systemPrompt, text, chatHistory.slice(0, -1), null, null, true);
    } catch(e) { reply = '啊啊啊！！爱豆！！！'; }

    // 保存粉丝回复到记忆
    d.fanPrivateChats[fanName].push({ role: 'fan', content: reply.trim(), time: Date.now() });
    if (d.fanPrivateChats[fanName].length > 50) {
        d.fanPrivateChats[fanName] = d.fanPrivateChats[fanName].slice(-50);
    }
    bbSaveData(aiId, d);

    container.insertAdjacentHTML('beforeend', `<div style="display:flex;align-items:flex-end;gap:8px;"><img src="${fanAvatar}" style="width:28px;height:28px;border-radius:50%;flex-shrink:0;object-fit:cover;"><div style="background:#f5f5f5;color:#333;padding:10px 14px;border-radius:16px 16px 16px 4px;font-size:13px;max-width:75%;border:1px solid #eee;">${reply.trim()}</div></div>`);
    container.scrollTop = container.scrollHeight;
}

// =====================================================================
// 周边小店（爱豆）
// =====================================================================
function bbRenderIdolMerch(aiId) {
    const d = bbGetData(aiId);
    const container = document.getElementById('bb-merch-list');
    if (!container) return;
    container.innerHTML = '';
    const merch = d.merch || [];
    if (!merch.length) { container.innerHTML = '<div class="bb-empty-hint"><div style="font-size:12px;color:#aaa;">尚未上架任何周边</div></div>'; return; }
    merch.forEach(item => {
        container.insertAdjacentHTML('beforeend', `
        <div class="bb-idol-merch-item">
            <div style="flex:1;">
                <div style="font-size:14px;font-weight:800;color:#111;">${item.name}</div>
                <div style="font-size:11px;color:#aaa;margin-top:2px;">${item.desc || '限量发售'}</div>
                <div style="font-size:12px;color:#111;font-weight:800;margin-top:6px;">${item.price} 豆币 <span style="color:#aaa;font-weight:500;margin-left:8px;">已售 ${item.sales || 0}</span></div>
            </div>
            <button class="bb-merch-promote-btn" onclick="bbIdolPromoteMerch('${aiId}','${item.id}')">营业催销</button>
        </div>`);
    });
}

window.bbAddMerch = function() {
    const aiId = bbCurrentAiId();
    const nameInput = document.getElementById('bb-merch-name-input');
    const priceInput = document.getElementById('bb-merch-price-input');
    if (!nameInput || !priceInput) return;
    const name = nameInput.value.trim();
    const price = parseInt(priceInput.value);
    if (!name || !price || price <= 0) { bbToast('请填写商品名称和价格'); return; }
    const d = bbGetData(aiId);
    d.merch = d.merch || [];
    d.merch.push({ id: Date.now().toString(), name, price, desc: '', sales: 0, time: Date.now() });
    bbSaveData(aiId, d);
    nameInput.value = ''; priceInput.value = '';
    bbRenderIdolMerch(aiId);
    bbToast(`「${name}」已上架！`);
}

window.bbIdolPromoteMerch = async function(aiId, itemId) {
    const d = bbGetData(aiId);
    const item = (d.merch || []).find(m => m.id === itemId);
    if (!item) return;
    const s = bbGetSettings(aiId);
    const myName = bbGetMyPersonaName();
    const myPersona = s.myPersona || '';
    const systemPrompt = `你是爱豆${myName}。${myPersona}\n你正在给粉丝语音营业推销周边「${item.name}」（售价${item.price}豆币）。请生成一段真诚+卖萌的营业语音稿（30-60字），要让粉丝愿意购买。`;
    bbToast('营业中...');
    let speech = '';
    try { speech = await callAIAPI(systemPrompt, '生成营业语音', null, null, null, true); }
    catch(e) { speech = `大家好！我的${item.name}真的超级用心！快来支持一下嘛！`; }
    const sales = Math.floor(Math.random() * 50 * (speech.length > 30 ? 1.5 : 1) + 10);
    const revenue = sales * item.price;
    item.sales = (item.sales || 0) + sales;
    d.idolRevenue = (d.idolRevenue || 0) + revenue;
    d.beanCoins = (d.beanCoins || 0) + revenue;
    d.transactions = d.transactions || [];
    d.transactions.unshift({ type: 'earn', amount: revenue, reason: `周边销售：${item.name} x${sales}`, time: Date.now() });
    bbSaveData(aiId, d);
    bbShowSaleFloater(`订单+${sales} ！💰 收益 +${revenue} 豆币`);
    bbRenderIdolMerch(aiId);
    const revEl = document.getElementById('bb-idol-revenue');
    if (revEl) revEl.textContent = d.idolRevenue;
    const revMerch = document.getElementById('bb-merch-revenue');
    if (revMerch) revMerch.textContent = d.idolRevenue;
    const wdBtn = document.getElementById('bb-withdraw-btn');
    if (wdBtn) wdBtn.style.display = 'block';
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.style.cssText = 'z-index:6500;';
    modal.innerHTML = `<div style="background:#fff;border-radius:24px;padding:30px 24px;max-width:300px;width:90%;text-align:center;"><div style="font-size:32px;margin-bottom:12px;">🎤</div><div style="font-size:13px;line-height:1.6;color:#555;margin-bottom:20px;font-style:italic;">「${speech.trim()}」</div><div style="font-size:16px;font-weight:900;color:#111;margin-bottom:16px;">+${revenue} 豆币收益！</div><button onclick="this.closest('.modal-overlay').remove()" style="width:100%;padding:14px;background:#111;color:#fff;border:none;border-radius:14px;font-weight:800;cursor:pointer;">太棒了</button></div>`;
    document.body.appendChild(modal);
}

function bbShowSaleFloater(msg) {
    const f = document.createElement('div');
    f.className = 'bb-sale-floater';
    f.textContent = msg;
    document.getElementById('bubbleApp')?.appendChild(f);
    setTimeout(() => f.remove(), 4000);
}

window.bbWithdraw = function() { const aiId = bbCurrentAiId(); bbWithdrawRevenue(aiId, null); }
window.bbIdolCallSalesReport = function(aiId) { bbIdolPromoteMerch(aiId, (bbGetData(aiId).merch || [])[0]?.id); }

// =====================================================================
// 公关热搜榜
// =====================================================================
function bbRenderIdolPR(aiId) {
    const d = bbGetData(aiId);
    const container = document.getElementById('bb-pr-content');
    if (!container) return;
    const crises = d.crises || [];
    if (!crises.length) {
        container.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;padding:60px 20px;text-align:center;"><div style="font-size:32px;margin-bottom:12px;">🔥</div><div style="font-size:16px;font-weight:800;color:#111;margin-bottom:8px;">公关热搜榜</div><div style="font-size:12px;color:#aaa;line-height:1.6;margin-bottom:24px;">危机事件由系统定时触发<br>处理好危机可稳固粉丝基础</div><button onclick="bbIdolCheckNewCrisis('${aiId}')" style="padding:14px 24px;background:#111;color:#fff;border:none;border-radius:14px;font-weight:800;cursor:pointer;"><i class="fas fa-sync-alt"></i> 立即触发危机</button></div>`;
        return;
    }
    container.innerHTML = `<button onclick="bbCallApiForView('pr')" style="position:sticky;top:0;left:0;z-index:10;background:rgba(255,255,255,0.95);backdrop-filter:blur(10px);border:1px solid #eee;border-radius:14px;padding:10px 16px;font-size:12px;font-weight:700;cursor:pointer;color:#111;margin-bottom:16px;display:block;"><i class="fas fa-sync-alt"></i> 触发新危机</button>`;
    crises.forEach(crisis => {
        const bgColor = crisis.resolved ? '#fff' : '#fff';
        const borderColor = crisis.resolved ? '#eee' : '#111';
        const statusTag = crisis.resolved ? `<span style="background:#f5f5f5;color:#555;font-size:10px;padding:4px 8px;border-radius:6px;font-weight:700;">已处理 ${crisis.outcome}</span>` : `<span class="bb-crisis-badge">🔥 上热搜了</span>`;
        const comments = (crisis.hotComments || []).map(c => {
            const bgMap = { support: '#fafafa', against: '#f5f5f5', neutral: '#fff' };
            return `<div class="bb-hot-comment ${c.stance}" style="background:${bgMap[c.stance]||'#fafafa'}; border:1px solid #eee;"><span style="font-size:11px;font-weight:700;color:#111;">${c.user}</span><span style="font-size:12px;color:#555;margin-left:8px;">${c.text}</span></div>`;
        }).join('');
        const prForm = !crisis.resolved ? `<div style="margin-top:16px;background:#fafafa;border-radius:16px;padding:16px;border:1px solid #eee;"><div style="font-size:11px;font-weight:800;color:#111;margin-bottom:8px;">⚡ 发布公关声明</div><textarea id="pr-stmt-${crisis.id}" rows="3" style="width:100%;border:1px solid #ddd;border-radius:12px;padding:10px;font-size:12px;resize:none;outline:none;" placeholder="诚恳回应，解释事情经过..."></textarea><button onclick="bbIdolSubmitPR('${aiId}','${crisis.id}')" style="margin-top:10px;width:100%;padding:12px;background:#111;color:#fff;border:none;border-radius:12px;font-size:12px;font-weight:800;cursor:pointer;">发布声明</button></div>` : `<div style="margin-top:12px;background:#f9f9f9;border-radius:12px;padding:12px;font-size:12px;color:#333;border:1px solid #eee;">声明内容：${crisis.statement || ''}</div>`;
        
        container.insertAdjacentHTML('beforeend', `<div class="bb-crisis-board" style="margin-bottom:20px;"><div class="bb-crisis-header" style="background:${bgColor};border-color:${borderColor};">${statusTag}<div class="bb-crisis-title">${crisis.title}</div><div style="font-size:12px;color:#666;line-height:1.5;">${crisis.desc}</div>${!crisis.resolved ? `<div style="font-size:11px;color:#ff4d4f;font-weight:800;margin-top:8px;">豆币每秒损失中 -${crisis.drainRate||1} 豆币/秒</div>` : ''}</div><div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">${comments}</div>${prForm}</div>`);
        
        if (!crisis.resolved && !crisis._drainTimer) {
            crisis._drainTimer = setInterval(() => {
                const dd = bbGetData(aiId);
                const cr = (dd.crises || []).find(c => c.id === crisis.id);
                if (!cr || cr.resolved) { clearInterval(crisis._drainTimer); return; }
                dd.idolRevenue = Math.max(0, (dd.idolRevenue || 0) - (cr.drainRate || 1));
                const revEl = document.getElementById('bb-idol-revenue');
                if (revEl) revEl.textContent = dd.idolRevenue;
                bbSaveData(aiId, dd);
            }, 1000);
        }
    });
}

window.bbIdolCheckNewCrisis = async function(aiId) {
    const s = bbGetSettings(aiId);
    const myName = bbGetMyPersonaName();
    const myPersona = s.myPersona || '';
    const d = bbGetData(aiId);
    const systemPrompt = `你是一个娱乐圈危机事件生成器。爱豆${myName}。${myPersona}\n请生成一个真实的娱乐圈事件（可以是好事也可以是坏事，坏事概率60%），包括：\n【标题】：简短热搜标题（10字以内）\n【描述】：事件详情（30-50字）\n【类型】：好事/坏事\n【扣币速率】：每秒扣除豆币数（好事填0，坏事填1-5）\n【热评1】|stance（support/against/neutral）：评论内容\n【热评2】|stance：评论内容\n【热评3】|stance：评论内容\n【热评4】|stance：评论内容\n【热评5】|stance：评论内容`;
    bbToast('正在生成新危机...');
    let text = '';
    try { text = await callAIAPI(systemPrompt, '生成娱乐圈事件', null, null, null, true); }
    catch(e) { bbToast('API调用失败'); return; }
    const titleM = text.match(/【标题】[：:](.+)/);
    const descM = text.match(/【描述】[：:]([\s\S]*?)(?=【|$)/);
    const drainM = text.match(/【扣币速率】[：:](\d+)/);
    const typeM = text.match(/【类型】[：:](.+)/);
    const comments = [];
    const commentMatches = text.matchAll(/【热评\d+】\|(\w+)[：:](.+)/g);
    for (const m of commentMatches) { comments.push({ stance: m[1], text: m[2].trim(), user: '路人' + Math.floor(Math.random()*9999) }); }
    const crisis = {
        id: Date.now().toString(),
        title: titleM ? titleM[1].trim() : '突发舆情事件',
        desc: descM ? descM[1].trim() : '事件详情生成中...',
        type: typeM ? typeM[1].trim() : '坏事',
        drainRate: parseInt(drainM?.[1] || '1'),
        hotComments: comments.length ? comments : [{ user: '路人甲', text: '这是真的吗？', stance: 'neutral' }, { user: '粉丝乙', text: '支持爱豆！', stance: 'support' }, { user: '黑粉丙', text: '早就说了吧', stance: 'against' }],
        resolved: typeM && typeM[1].includes('好事'),
        time: Date.now()
    };
    if (typeM && typeM[1].includes('好事')) {
        const bonus = Math.floor(Math.random() * 2000 + 500);
        d.idolRevenue = (d.idolRevenue || 0) + bonus;
        d.idolFanCount = (d.idolFanCount || 0) + Math.floor(Math.random() * 5000 + 1000);
        crisis.outcome = `好事！粉丝 +${bbFormatNum(d.idolFanCount)}, 收益 +${bonus}`;
        bbToast(`🎉 好事来了！收益 +${bonus} 豆币`);
    } else {
        bbToast(`🔥 危机来袭！「${crisis.title}」已上热搜！`);
        bbShowCrisisAlert(crisis);
    }
    d.crises = d.crises || [];
    d.crises.unshift(crisis);
    if (d.crises.length > 10) d.crises.pop();
    bbSaveData(aiId, d);
    bbRenderIdolPR(aiId);
}

function bbShowCrisisAlert(crisis) {
    const alert = document.createElement('div');
    alert.className = 'bb-crisis-alert';
    alert.innerHTML = `<div class="bb-crisis-alert-inner"><div class="bb-crisis-badge" style="background:#111; color:#fff;">🔥 紧急通知</div><div style="font-size:16px;font-weight:800;color:#111;margin-bottom:4px;">${crisis.title}</div><div style="font-size:12px;color:#666;">${crisis.desc.slice(0, 60)}...</div><div style="margin-top:16px;display:flex;gap:10px;"><button onclick="this.closest('.bb-crisis-alert').remove(); bbSwitchIdolTab('pr');" style="flex:1;padding:12px;background:#111;color:#fff;border:none;border-radius:14px;font-weight:800;cursor:pointer;">立即处理</button><button onclick="this.closest('.bb-crisis-alert').remove()" style="flex:1;padding:12px;background:#f5f5f5;border:none;border-radius:14px;cursor:pointer;font-weight:600;">稍后</button></div></div>`;
    document.getElementById('bubbleApp')?.appendChild(alert);
    setTimeout(() => alert.remove(), 10000);
}

window.bbIdolSubmitPR = async function(aiId, crisisId) {
    const d = bbGetData(aiId);
    const crisis = (d.crises || []).find(c => c.id === crisisId);
    if (!crisis || crisis.resolved) return;
    const stmtEl = document.getElementById(`pr-stmt-${crisisId}`);
    const statement = stmtEl?.value?.trim();
    if (!statement || statement.length < 10) { bbToast('声明内容太短，诚意不够！'); return; }
    const myName = bbGetMyPersonaName();
    const systemPrompt = `你是一位公关顾问，分析爱豆${myName}的声明处理效果。\n危机：${crisis.title} - ${crisis.desc}\n声明：${statement}\n\n请分析：\n【诚意度】：诚恳/一般/差劲\n【粉丝变化】：+1000 或 -2000\n【收益变化】：+500 或 -1000\n【结局】：一句话总结（30字以内）`;
    bbToast('公关结果评判中...');
    let text = '';
    try { text = await callAIAPI(systemPrompt, statement, null, null, null, true); }
    catch(e) { text = '【诚意度】：一般\n【粉丝变化】：+500\n【收益变化】：+200\n【结局】：危机暂时平息'; }
    const sincerityM = text.match(/【诚意度】[：:](.+)/);
    const fanChangeM = text.match(/【粉丝变化】[：:]([+-]?\d+)/);
    const incomeChangeM = text.match(/【收益变化】[：:]([+-]?\d+)/);
    const endingM = text.match(/【结局】[：:](.+)/);
    const sincerity = sincerityM ? sincerityM[1].trim() : '一般';
    const fanChange = fanChangeM ? parseInt(fanChangeM[1]) : 0;
    const incomeChange = incomeChangeM ? parseInt(incomeChangeM[1]) : 0;
    const ending = endingM ? endingM[1].trim() : '危机平息';
    d.idolFanCount = Math.max(0, (d.idolFanCount || 0) + fanChange);
    d.idolRevenue = Math.max(0, (d.idolRevenue || 0) + incomeChange);
    crisis.resolved = true;
    crisis.statement = statement;
    crisis.outcome = ending;
    bbSaveData(aiId, d);
    const outcomeColor = sincerity === '诚恳' ? '#111' : sincerity === '一般' ? '#555' : '#ff4d4f';
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.style.cssText = 'z-index:6500;';
    modal.innerHTML = `<div style="background:#fff;border-radius:24px;padding:30px 24px;max-width:300px;width:90%;text-align:center;"><div style="font-size:36px;margin-bottom:12px;">${sincerity === '诚恳' ? '🌟' : sincerity === '一般' ? '😐' : '💀'}</div><div style="font-size:16px;font-weight:900;color:#111;margin-bottom:8px;">公关结果</div><div style="font-size:12px;color:${outcomeColor};font-weight:800;background:#f9f9f9;padding:10px 16px;border-radius:12px;margin:16px 0;">${sincerity} · ${ending}</div><div style="font-size:12px;color:#666;margin:12px 0;">粉丝 ${fanChange >= 0 ? '+' : ''}${bbFormatNum(fanChange)} · 收益 ${incomeChange >= 0 ? '+' : ''}${incomeChange}</div><button onclick="this.closest('.modal-overlay').remove();bbRenderIdolPR('${aiId}');" style="width:100%;padding:14px;background:#111;color:#fff;border:none;border-radius:14px;font-weight:800;cursor:pointer;margin-top:10px;">确认结果</button></div>`;
    document.body.appendChild(modal);
    bbRenderIdolPR(aiId);
}

// 辅助数字格式化
function bbFormatNum(num) {
    if (num >= 10000) return (num / 10000).toFixed(1) + 'w';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
}

// =====================================================================
// 背包 APP
// =====================================================================
window.openBackpackApp = function() {
    const app = document.getElementById('backpackApp');
    if (!app) return;
    app.style.display = 'flex';
    app.classList.add('open');
    bbRenderBackpack();
}
window.closeBackpackApp = function() {
    const app = document.getElementById('backpackApp');
    if (!app) return;
    app.classList.remove('open');
    app.style.display = 'none';
}
function bbRenderBackpack() {
    const container = document.getElementById('bp-items-list');
    const countEl = document.getElementById('bp-total-count');
    if(!container) return;
    
    const items = JSON.parse(localStorage.getItem('bb_backpack_items') || '[]');
    if(countEl) countEl.innerText = items.length;
    
    container.innerHTML = '';
    if(!items.length) {
        container.innerHTML = `<div class="bb-empty-hint"><div style="font-size:32px;margin-bottom:8px;">🛍️</div><div>背包空空的</div><div style="font-size:11px;color:#ddd;margin-top:4px;">去 Bubble 周边商城购买商品吧</div></div>`;
        return;
    }
    
    items.reverse().forEach(item => {
        const timeStr = new Date(item.time).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'});
        container.insertAdjacentHTML('beforeend', `
            <div class="bb-backpack-item">
                <div style="width:40px;height:40px;background:#f5f5f5;border-radius:12px;display:flex;justify-content:center;align-items:center;font-size:20px;">🎁</div>
                <div style="flex:1;">
                    <div style="font-size:14px;font-weight:800;color:#111;">${item.name}</div>
                    <div style="font-size:11px;color:#888;margin-top:2px;">来自 ${item.from || '未知'} · 花费 ${item.price} 豆币</div>
                </div>
                <div style="font-size:10px;color:#ccc;">${timeStr}</div>
            </div>
        `);
    });
}
