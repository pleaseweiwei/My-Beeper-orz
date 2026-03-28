// js/app_groupchat.js — 群聊完整功能模块 (V2.0)
// 依赖: apps.js 中的 IDB, friendsData, currentChatId, currentChatType, appendMessage, saveFriendsData 等

/* =========================================
   常量 & 数据结构
   ========================================= */
const GROUPS_DATA_KEY = 'myCoolPhone_groupsData';

// groupsData[groupId] = {
//   id, name, members[], ownerId, admins[],
//   announcement, settings{bgActivityEnabled, bgActivityInterval},
//   mutedMembers[], memberTitles{}, lastMessage, unreadCount
// }

// 确保 groupsData 在 apps.js 里已定义（它那边已有 let groupsData = {}）

/* =========================================
   群聊数据持久化
   ========================================= */
async function saveGroupsData() {
    try {
        await IDB.set(scopedLSKey(GROUPS_DATA_KEY), groupsData);
    } catch (e) {
        console.error('保存群聊数据失败:', e);
    }
}

async function loadGroupsData() {
    try {
        let data = await IDB.get(scopedLSKey(GROUPS_DATA_KEY));
        if (!data) {
            // 迁移旧的 localStorage
            const old = localStorage.getItem(scopedLSKey(GROUPS_DATA_KEY));
            if (old) {
                data = JSON.parse(old);
                await IDB.set(scopedLSKey(GROUPS_DATA_KEY), data);
                localStorage.removeItem(scopedLSKey(GROUPS_DATA_KEY));
            }
        }
        if (data && Object.keys(data).length > 0) {
            groupsData = data;
        }
        restoreGroupListUI();
    } catch (e) {
        console.error('加载群聊数据失败:', e);
    }
}

// 在 DOMContentLoaded 后加载群聊数据
document.addEventListener('DOMContentLoaded', async () => {
    // 等 apps.js 的 loadFriendsData 完成后再加载群聊
    setTimeout(async () => {
        await loadGroupsData();
    }, 500);
});

/* =========================================
   恢复群聊列表 UI
   ========================================= */
function restoreGroupListUI() {
    Object.keys(groupsData).forEach(groupId => {
        const group = groupsData[groupId];
        if (!group) return;
        // 检查是否已存在
        if (document.querySelector(`.wc-chat-item[data-chat-id="${groupId}"]`)) return;

        const members = group.members || [];
        const avatarUrl = generateGroupAvatar(groupId, group.name, members);
        const previewMsg = group.lastMessage || '群聊已创建';
        addChatListEntry(groupId, group.name, previewMsg, avatarUrl, 'group');
    });
}

/* =========================================
   群聊头像生成 (多头像拼接)
   ========================================= */
function generateGroupAvatar(groupId, groupName, members) {
    // 简单用 DiceBear 生成，实际可做拼图
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(groupName)}&backgroundColor=e5e5e5&fontFamily=Arial`;
}

/* =========================================
   重写 confirmCreateGroup — 保存到 IDB
   ========================================= */
window.confirmCreateGroup = function () {
    const nameInput = document.getElementById('cg-groupname');
    const checkboxes = document.querySelectorAll('#cg-friend-list input[type="checkbox"]:checked');

    if (checkboxes.length < 1) { alert('请至少选择 1 个好友！'); return; }

    const groupName = (nameInput.value || '').trim() || '未命名群聊';
    const memberIds = Array.from(checkboxes).map(cb => cb.value);
    const groupId = 'grp_' + Date.now();

    groupsData[groupId] = {
        id: groupId,
        name: groupName,
        members: memberIds,
        ownerId: 'ME',
        admins: [],
        announcement: '',
        settings: {
            bgActivityEnabled: false,
            bgActivityInterval: 120
        },
        mutedMembers: [],
        memberTitles: {},
        lastMessage: '群聊已创建',
        unreadCount: 0
    };

    saveGroupsData();

    const avatarUrl = generateGroupAvatar(groupId, groupName, memberIds);
    addChatListEntry(groupId, groupName, '群聊已创建', avatarUrl, 'group');

    closeCreateGroupModal();
    // 自动打开群聊
    setTimeout(() => openGroupChat(groupId), 300);
};

/* =========================================
   打开群聊 (完整版)
   ========================================= */
window.openGroupChat = async function (groupId) {
    if (groupsData[groupId]) {
        groupsData[groupId].unreadCount = 0;
        saveGroupsData();
    }
    updateChatListUnreadUI(groupId);
    updateDockUnreadDot();

    stopDanmakuLoop();
    const dmLayer = document.getElementById('danmaku-layer');
    if (dmLayer) dmLayer.innerHTML = '';
    danmakuPool = [];

    const group = groupsData[groupId];
    if (!group) return;

    currentChatId = groupId;
    currentChatType = 'group';

    // 更新 chat header
    const chatView = document.getElementById('chatLayer');
    if (chatView) {
        const titleEl = chatView.querySelector('.chat-header span');
        if (titleEl) {
            const memberCount = (group.members || []).length + 1; // +1 for ME
            titleEl.innerHTML = `${group.name}<small style="font-size:9px; color:#aaa; font-weight:400; margin-left:4px;">${memberCount}人</small>`;
        }
        // 修改设置图标的 onclick
        const settingsBtn = chatView.querySelector('.fa-cog');
        if (settingsBtn) {
            settingsBtn.onclick = () => openGroupSettingsPage(groupId);
        }
        // 隐藏心声图标（群聊没有单人心声）
        const heartBtn = chatView.querySelector('.fa-heart-pulse');
        if (heartBtn) heartBtn.style.display = 'none';

        chatView.classList.add('show');
    }

    // 加载历史记录
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';

    const history = await loadChatHistory(groupId);
    if (history && history.length > 0) {
        chatMessages.innerHTML = `<div style="text-align:center; margin: 10px 0;"><span style="background:rgba(0,0,0,0.04); padding:4px 12px; border-radius:12px; font-size:10px; color:#999; font-weight:500;">历史消息</span></div>`;
        history.forEach(msg => {
            if (msg.type === 'system') {
                const sysDiv = document.createElement('div');
                sysDiv.style.cssText = 'text-align:center; margin:10px 0;';
                sysDiv.innerHTML = `<span style="background:rgba(0,0,0,0.04); padding:4px 12px; border-radius:4px; font-size:11px; color:#999;">${msg.text}</span>`;
                chatMessages.appendChild(sysDiv);
            } else {
                // 获取发送者头像
                let avatar = msg.customAvatar;
                if (!avatar && msg.senderName && friendsData[msg.senderName]) {
                    avatar = friendsData[msg.senderName].avatar;
                }
                if (!avatar && msg.senderName) {
                    avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(msg.senderName)}`;
                }
                appendMessage(msg.text, msg.type, avatar, msg.senderName, msg.translation, msg.id);
            }
        });
        setTimeout(() => chatMessages.scrollTop = chatMessages.scrollHeight, 100);
    } else {
        // 显示群公告或欢迎消息
        const sysDiv = document.createElement('div');
        sysDiv.style.cssText = 'text-align:center; margin:15px 0;';
        const memberNames = (group.members || []).map(id => {
            const f = friendsData[id];
            return f ? (f.remark || f.realName) : id;
        }).join('、');
        sysDiv.innerHTML = `<span style="background:rgba(0,0,0,0.04); padding:4px 12px; border-radius:4px; font-size:11px; color:#999;">你邀请了 ${memberNames} 加入了群聊</span>`;
        chatMessages.appendChild(sysDiv);

        await saveMessageToHistory(groupId, {
            text: `你邀请了 ${memberNames} 加入了群聊`,
            type: 'system'
        });

        // 如果有群公告，展示
        if (group.announcement) {
            showGroupAnnouncement(group.announcement, false);
        }
    }

    // 群聊加号面板：注入群专属功能
    injectGroupPlusPanel();

    // 启动后台活跃（如果开启）
    startGroupBgActivity(groupId);
};

/* =========================================
   群聊 + 号面板注入群专属功能
   ========================================= */
function injectGroupPlusPanel() {
    const plusGrid = document.querySelector('#panel-plus .plus-grid');
    if (!plusGrid) return;

    // 移除旧的群功能按钮（防止重复）
    plusGrid.querySelectorAll('.group-exclusive-btn').forEach(el => el.remove());

    // 群专属按钮：白底黑图案，与其他按钮保持一致
    const groupBtns = [
        { icon: 'fa-gift',       label: '发红包',  fn: 'openSendRedPacketModal()' },
        { icon: 'fa-poll',       label: '群投票',  fn: 'openGroupVoteModal()' },
        { icon: 'fa-video',      label: '群视频',  fn: 'openGroupVideoCall()' },
        { icon: 'fa-user-secret',label: '匿名',    fn: 'toggleAnonymousMode()' },
    ];

    groupBtns.forEach(btn => {
        const div = document.createElement('div');
        div.className = 'plus-item group-exclusive-btn';
        div.onclick = () => { try { eval(btn.fn); } catch(e) { console.warn(e); } };
        div.innerHTML = `<div class="plus-icon"><i class="fas ${btn.icon}"></i></div><span>${btn.label}</span>`;
        plusGrid.appendChild(div);
    });
}

/* =========================================
   移除群专属面板（切回私聊时调用）
   ========================================= */
window.removeGroupPlusPanel = function () {
    document.querySelectorAll('#panel-plus .group-exclusive-btn').forEach(el => el.remove());
};

/* =========================================
   @ 艾特功能（输入 @ 自动弹出，删除 @ 自动消失）
   ========================================= */
let atMentionActive = false;

// 获取光标前的 @ 信息（返回 {atIndex, query} 或 null）
function getAtQueryBeforeCursor(input) {
    const pos = input.selectionStart;
    const textBefore = input.value.slice(0, pos);
    const atIndex = textBefore.lastIndexOf('@');
    if (atIndex < 0) return null;
    const query = textBefore.slice(atIndex + 1);
    // 如果 @ 后有空格，说明已经完成选择，不再弹出
    if (query.includes(' ')) return null;
    return { atIndex, query };
}

function showAtMentionDropdown(group, query) {
    removeAtMentionDropdown();
    query = (query || '').toLowerCase();

    let members = (group.members || []).map(id => {
        const f = friendsData[id];
        return f ? { id, name: f.remark || f.realName, avatar: f.avatar } : null;
    }).filter(Boolean);

    // 按 query 过滤
    if (query) {
        members = members.filter(m => m.name.toLowerCase().includes(query));
    }

    const showAll = !query || '所有人'.includes(query);
    if (!showAll && members.length === 0) return;

    const dropdown = document.createElement('div');
    dropdown.id = 'at-mention-dropdown';
    dropdown.style.cssText = `
        position:fixed; bottom:120px; left:15px; right:15px; background:#fff;
        border-radius:14px; box-shadow:0 8px 30px rgba(0,0,0,0.12);
        z-index:9000; overflow:hidden; border:1px solid rgba(0,0,0,0.05);
        max-height:200px; overflow-y:auto;
    `;

    if (showAll) {
        const allItem = document.createElement('div');
        allItem.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px 16px;cursor:pointer;border-bottom:1px solid #f5f5f5;';
        allItem.innerHTML = `
            <div style="width:32px;height:32px;border-radius:50%;background:#eee;display:flex;align-items:center;justify-content:center;font-size:14px;">👥</div>
            <span style="font-weight:600;font-size:13px;">所有人</span>
        `;
        allItem.onclick = () => insertAtMention('所有人');
        dropdown.appendChild(allItem);
    }

    members.forEach(m => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;border-bottom:1px solid #f5f5f5;';
        const avatarSrc = m.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.name}`;
        item.innerHTML = `
            <img src="${avatarSrc}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">
            <span style="font-size:13px;">${m.name}</span>
        `;
        item.onclick = () => insertAtMention(m.name);
        dropdown.appendChild(item);
    });

    document.querySelector('.chat-view') ? document.querySelector('.chat-view').appendChild(dropdown)
        : document.body.appendChild(dropdown);
    atMentionActive = true;
}

function insertAtMention(name) {
    const input = document.getElementById('chatInput');
    if (!input) return;
    const atInfo = getAtQueryBeforeCursor(input);
    if (atInfo !== null) {
        const { atIndex, query } = atInfo;
        // 替换 @query 为 @name（保留光标后的内容）
        const after = input.value.slice(atIndex + 1 + query.length);
        input.value = input.value.slice(0, atIndex) + `@${name} ` + after;
        const newPos = atIndex + name.length + 2;
        input.setSelectionRange(newPos, newPos);
    } else {
        input.value += `@${name} `;
    }
    removeAtMentionDropdown();
    input.focus();
}

function removeAtMentionDropdown() {
    document.getElementById('at-mention-dropdown')?.remove();
    atMentionActive = false;
}

// 监听输入框：输入 @ 弹出，删除 @ 消失，输入字符实时过滤
document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('input', () => {
            if (currentChatType !== 'group') return;
            const atInfo = getAtQueryBeforeCursor(chatInput);
            if (atInfo !== null) {
                const group = groupsData[currentChatId];
                if (group) showAtMentionDropdown(group, atInfo.query);
            } else {
                removeAtMentionDropdown();
            }
        });
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') removeAtMentionDropdown();
        });
        // 点击别处关闭下拉（延迟以允许 item.onclick 先执行）
        chatInput.addEventListener('blur', () => {
            setTimeout(() => removeAtMentionDropdown(), 200);
        });
    }
});

/* =========================================
   匿名聊天模式
   ========================================= */
let groupAnonymousMode = false;
const ANON_ANIMALS = ['🦊 匿名狐狸', '🐼 匿名熊猫', '🦁 匿名狮子', '🐸 匿名青蛙', '🐧 匿名企鹅', '🦄 匿名独角兽', '🐙 匿名章鱼', '🦋 匿名蝴蝶'];
let myAnonName = '';

window.toggleAnonymousMode = function () {
    groupAnonymousMode = !groupAnonymousMode;
    const panels = document.getElementById('chat-extra-panels');
    if (panels) panels.classList.remove('open');

    if (groupAnonymousMode) {
        myAnonName = ANON_ANIMALS[Math.floor(Math.random() * ANON_ANIMALS.length)];
        if (typeof showToast === 'function') showToast(`已开启匿名模式：${myAnonName}`);
        // 显示匿名标识
        const inputArea = document.querySelector('.chat-input-area');
        let badge = document.getElementById('anon-mode-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'anon-mode-badge';
            badge.style.cssText = 'text-align:center;font-size:11px;color:#ff7e67;padding:4px;background:#fff5f3;border-radius:0;cursor:pointer;';
            badge.innerHTML = `🎭 匿名模式 · 你是 ${myAnonName} · 点击关闭`;
            badge.onclick = () => toggleAnonymousMode();
            inputArea?.insertBefore(badge, inputArea.firstChild);
        }
    } else {
        document.getElementById('anon-mode-badge')?.remove();
        if (typeof showToast === 'function') showToast('已关闭匿名模式');
    }
};

/* =========================================
   智能调度器：筛选最可能发言的 3-4 个角色
   ========================================= */
function smartDispatchMembers(activeMemberIds, recentHistory, userMessage) {
    if (activeMemberIds.length <= 4) return activeMemberIds; // 人少不调度

    // 计算每个成员的"发言热度"
    const scores = {};
    activeMemberIds.forEach(id => { scores[id] = 0; });

    // 1. 近期聊天中出现的成员 +2分
    recentHistory.slice(-10).forEach(msg => {
        if (msg.senderName) {
            activeMemberIds.forEach(id => {
                const f = friendsData[id];
                if (f && (f.realName === msg.senderName || f.remark === msg.senderName)) {
                    scores[id] = (scores[id] || 0) + 2;
                }
            });
        }
    });

    // 2. 消息中被@提及的成员 +5分
    activeMemberIds.forEach(id => {
        const f = friendsData[id];
        if (!f) return;
        const name = f.remark || f.realName;
        if (userMessage.includes(`@${name}`) || userMessage.includes(name)) {
            scores[id] = (scores[id] || 0) + 5;
        }
    });

    // 3. 随机热度 (模拟真实群里有人不活跃)
    activeMemberIds.forEach(id => { scores[id] = (scores[id] || 0) + Math.random() * 3; });

    // 按分数排序，取前 4 名
    const sorted = [...activeMemberIds].sort((a, b) => (scores[b] || 0) - (scores[a] || 0));
    return sorted.slice(0, 4);
}

/* =========================================
   视角记忆切片 (Memory Sharding)
   ========================================= */
async function getShardedMemoryForMember(memberId, groupId, allHistory) {
    const key = `group_shard_${groupId}_${memberId}`;
    try {
        const existing = await IDB.get(scopedLSKey(key));
        return existing || null;
    } catch (e) { return null; }
}

async function saveShardedMemory(memberId, groupId, summary) {
    const key = `group_shard_${groupId}_${memberId}`;
    try { await IDB.set(scopedLSKey(key), summary); } catch (e) {}
}

// 生成各角色的视角记忆
window.generateMemoryShards = async function (groupId) {
    const group = groupsData[groupId || currentChatId];
    if (!group) return;
    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    if (!settingsJSON) return;
    const settings = JSON.parse(settingsJSON);

    const history = await loadChatHistory(groupId || currentChatId);
    const recentHistory = history.slice(-30);
    const historyText = recentHistory.map(m => `${m.senderName || (m.type === 'sent' ? '用户' : 'AI')}: ${(m.text || '').substring(0, 80)}`).join('\n');

    for (const memberId of (group.members || [])) {
        const mem = friendsData[memberId];
        if (!mem) continue;
        const name = mem.remark || mem.realName;

        const prompt = `以下是群聊记录。请以【${name}】的视角，写一段简短的记忆总结（50字以内），只包含【${name}】亲身经历或得知的信息，其他人私下的事情不要写：\n\n${historyText}\n\n以第一人称写【${name}】的记忆：`;

        try {
            let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
            const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
                body: JSON.stringify({ model: settings.model, messages: [{ role: 'user', content: prompt }], temperature: 0.7 })
            });
            if (!res.ok) continue;
            const data = await res.json();
            const summary = data?.choices?.[0]?.message?.content || '';
            if (summary) await saveShardedMemory(memberId, groupId || currentChatId, summary);
        } catch (e) { console.warn('视角记忆生成失败:', e); }
    }
    if (typeof showToast === 'function') showToast('视角记忆切片已生成');
};

/* =========================================
   悄悄话/"拉小群" Gossip System
   ========================================= */
async function handleGossipCommand(gossipData, triggerGroupId) {
    // gossipData = { invitees: ['user', 'memberName'], reason: '...' }
    if (!gossipData || !gossipData.invitees) return;

    const invitees = gossipData.invitees.filter(name => name !== 'user' && name !== 'ME');
    if (invitees.length === 0) return;

    // 找到对应的好友 ID
    const memberIds = [];
    invitees.forEach(name => {
        Object.keys(friendsData).forEach(id => {
            const f = friendsData[id];
            if (f && (f.realName === name || f.remark === name)) memberIds.push(id);
        });
    });
    if (memberIds.length === 0) return;

    // 生成小群名字
    const group = groupsData[triggerGroupId];
    const groupName = group ? group.name : '群聊';
    const initiatorName = invitees[0];
    const newGroupName = `${initiatorName}的悄悄话`;

    // 创建新群
    const newGroupId = 'grp_gossip_' + Date.now();
    groupsData[newGroupId] = {
        id: newGroupId,
        name: newGroupName,
        members: memberIds,
        ownerId: 'ME',
        admins: [],
        announcement: '',
        settings: { bgActivityEnabled: false, bgActivityInterval: 120 },
        mutedMembers: [],
        memberTitles: {},
        lastMessage: '来自大群的悄悄话',
        unreadCount: 1
    };
    await saveGroupsData();

    const avatarUrl = generateGroupAvatar(newGroupId, newGroupName, memberIds);
    addChatListEntry(newGroupId, newGroupName, '来自大群的悄悄话', avatarUrl, 'group');

    // 在新群里发一条 AI 的开场吐槽
    const reason = gossipData.reason || `关于刚刚在${groupName}里发生的事`;
    const openingMsg = `(偷偷拉你出来) 刚才那个事…${reason}，我们来说说？`;
    await saveMessageToHistory(newGroupId, {
        id: 'msg_gossip_open_' + Date.now(),
        text: openingMsg,
        type: 'received',
        senderName: initiatorName,
        customAvatar: memberIds[0] && friendsData[memberIds[0]] ? friendsData[memberIds[0]].avatar : ''
    });
    groupsData[newGroupId].lastMessage = openingMsg;
    await saveGroupsData();
    updateDockUnreadDot();
}

window.sendGroupMessageToAI = async function (userMessage) {
    if (!currentChatId || currentChatType !== 'group') return;
    const group = groupsData[currentChatId];
    if (!group) return;

    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    if (!settingsJSON) return;
    const settings = JSON.parse(settingsJSON);

    const chatMessages = document.getElementById('chatMessages');
    const loadingId = 'loading-' + Date.now();
    const loadingBubble = document.createElement('div');
    loadingBubble.className = 'message-bubble loading';
    loadingBubble.id = loadingId;
    loadingBubble.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> 群友正在输入...';
    chatMessages.appendChild(loadingBubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
        // 获取历史（用于智能调度）
        const history = await loadChatHistory(currentChatId);
        const recentHistory = history.slice(-20);

        const allActiveMemberIds = (group.members || []).filter(id =>
            !((group.mutedMembers || []).includes(id))
        );

        // ★ 智能调度器
        const dispatchedMemberIds = smartDispatchMembers(allActiveMemberIds, recentHistory, userMessage);
        const benchMemberIds = allActiveMemberIds.filter(id => !dispatchedMemberIds.includes(id));

        // 主要发言角色人设（详细 + 视角记忆）
        let membersInfo = '';
        for (const memberId of dispatchedMemberIds) {
            const mem = friendsData[memberId];
            if (!mem) continue;
            const title = (group.memberTitles || {})[memberId] ? `[${group.memberTitles[memberId]}]` : '';
            const shard = await getShardedMemoryForMember(memberId, currentChatId);
            const shardNote = shard ? `\n  [${mem.realName}的私人记忆]: ${shard}` : '';
            membersInfo += `角色名: ${mem.realName || memberId} ${title}\n性格人设: ${mem.persona || '普通的群成员'}${shardNote}\n---\n`;
        }

        // 潜水成员（仅提供名字，不参与回复）
        const benchNames = benchMemberIds.map(id => {
            const f = friendsData[id];
            return f ? (f.realName || id) : id;
        });
        const benchNote = benchNames.length > 0 ? `\n[当前潜水中的成员 (不发言)]: ${benchNames.join('、')}` : '';

        // 获取我的人设
        const me = personasMeta[currentPersonaId];
        const myPersonaStr = (me && me.persona) ? `[用户身份描述]: ${me.persona}` : '';

        // 获取群公告
        const announcementStr = group.announcement ? `\n[群公告 (最高优先级，所有人必须遵守)]: ${group.announcement}` : '';

        // 历史记录文本
        let historyText = '';
        recentHistory.forEach(msg => {
            if (msg.type === 'system') return;
            const sender = msg.type === 'sent' ? '用户' : (msg.senderName || 'AI');
            historyText += `${sender}: ${(msg.text || '').substring(0, 100)}\n`;
        });

        // 世界书注入
        const worldInfoText = (typeof constructWorldInfoPrompt === 'function')
            ? constructWorldInfoPrompt(userMessage, currentChatId)
            : '';

        // 匿名模式处理
        const anonNote = groupAnonymousMode ? `\n[匿名模式已开启]: 用户此刻的身份是"${myAnonName}"，请以此称呼用户。` : '';

        // @艾特检测
        const atMatches = userMessage.match(/@(\S+)/g);
        const atNote = atMatches ? `\n[用户提及了]: ${atMatches.join(', ')}，被提及的角色必须优先回复。` : '';

        const systemPrompt = `
[系统指令: 动态群聊模拟器 — 智能调度版]
你是一个同时扮演多个角色的群聊模拟引擎。只让下面【参与发言的成员】回复，潜水成员不得发言。

[参与发言的成员档案]
${membersInfo || '暂无成员信息'}
${benchNote}

${myPersonaStr}${anonNote}${atNote}
${announcementStr}
${worldInfoText ? `[世界观设定]\n${worldInfoText}` : ''}

[近期群聊记录]
${historyText || '(暂无历史记录)'}

[最高优先级规则]
1. 输出格式: JSON 数组，每项 {"name":"角色名","content":"消息内容"} 
   - 可选附加: {"name":"xxx","content":"...","cmd":{"type":"create_private_group","invitees":["user","角色名"],"reason":"..."}} 当某成员想私下聊时使用
2. 消息数量: 2~6 条，根据话题热度决定
3. 真实感: 角色可相互回复、打断、不一定每人都发言
4. 每条消息 ≤ 30 字，像真实微信群一样碎片化
5. 被@的角色必须优先且强制回复
6. 只输出 JSON，不要任何多余文字

现在，用户${groupAnonymousMode ? `（化名"${myAnonName}"）` : ''}发送了: "${userMessage}"
请生成群聊回复（纯 JSON 数组）:
`;

        let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
        const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
            body: JSON.stringify({
                model: settings.model,
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
                temperature: parseFloat(settings.temperature || 0.9)
            }),
            signal: currentAiController ? currentAiController.signal : undefined
        });

        document.getElementById(loadingId)?.remove();

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        let rawReply = data?.choices?.[0]?.message?.content || '[]';

        // 清理 markdown 代码块
        rawReply = rawReply.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

        // 检查是否有红包抢包指令 [open_red_packet:xxx]
        await checkAndProcessGroupCommands(rawReply, currentChatId);

        let messages = [];
        try {
            messages = JSON.parse(rawReply);
            if (!Array.isArray(messages)) messages = [];
        } catch (e) {
            console.warn('群聊JSON解析失败，尝试逐行解析:', rawReply);
            // 备用：逐行解析 "名字: 内容" 格式
            rawReply.split('\n').forEach(line => {
                line = line.trim();
                const match = line.match(/^([^:：]+)[:：](.*)/);
                if (match) messages.push({ name: match[1].trim(), content: match[2].trim() });
            });
        }

        // 逐条延迟展示
        let cumulativeDelay = 0;
        messages.forEach((msg, index) => {
            if (!msg.name || !msg.content) return;
            const delay = index === 0 ? 300 : (600 + Math.random() * 800);
            cumulativeDelay += delay;

            setTimeout(async () => {
                const mem = findMemberByName(msg.name, group.members);
                const avatarUrl = mem && mem.avatar ? mem.avatar :
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(msg.name)}`;

                const title = mem ? (group.memberTitles || {})[Object.keys(friendsData).find(k => friendsData[k] === mem)] : '';
                const displayName = title ? `${msg.name} [${title}]` : msg.name;
                const content = msg.content;

                const aiMsgId = 'msg_grp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
                appendMessage(content, 'received', avatarUrl, displayName, null, aiMsgId);

                await saveMessageToHistory(currentChatId, {
                    id: aiMsgId, text: content, type: 'received',
                    senderName: msg.name, customAvatar: avatarUrl
                });

                if (groupsData[currentChatId]) {
                    groupsData[currentChatId].lastMessage = `${msg.name}: ${content}`;
                    saveGroupsData();
                }

                // 处理 Gossip 拉群指令
                if (msg.cmd && msg.cmd.type === 'create_private_group') {
                    setTimeout(() => handleGossipCommand(msg.cmd, currentChatId), 1500);
                }

            }, cumulativeDelay);
        });

    } catch (e) {
        document.getElementById(loadingId)?.remove();
        if (e.name !== 'AbortError') {
            showAiErrorModal('群聊生成失败', e.message);
        }
    }
};

// 通过名字在群成员中查找 friendsData 对象
function findMemberByName(name, memberIds) {
    if (!memberIds) return null;
    for (const id of memberIds) {
        const f = friendsData[id];
        if (f && (f.realName === name || f.remark === name)) return f;
    }
    return null;
}

/* =========================================
   重写 sendMessageToAI 的群聊分支钩子
   ========================================= */
// 我们在 apps.js 里的 chatForm submit 事件发出后，
// 需要让星星按钮（triggerAiReply）触发群聊 AI
// 通过覆写方式劫持
const _origSendMessageToAI = window.sendMessageToAI;
window.sendMessageToAI = async function(userMessage) {
    if (currentChatType === 'group') {
        return await sendGroupMessageToAI(userMessage);
    }
    return await _origSendMessageToAI(userMessage);
};

/* =========================================
   群聊后台活跃系统
   ========================================= */
let groupBgActivityTimers = {}; // { groupId: timerId }

function startGroupBgActivity(groupId) {
    stopGroupBgActivity(groupId);
    const group = groupsData[groupId];
    if (!group || !group.settings || !group.settings.bgActivityEnabled) return;

    const interval = (group.settings.bgActivityInterval || 120) * 1000;
    groupBgActivityTimers[groupId] = setInterval(async () => {
        // 只有在不看这个群聊时才触发
        const chatLayer = document.getElementById('chatLayer');
        const isViewingThisGroup = chatLayer && chatLayer.classList.contains('show') && currentChatId === groupId;
        if (isViewingThisGroup) return;

        await triggerGroupBgChat(groupId);
    }, interval);
}

function stopGroupBgActivity(groupId) {
    if (groupBgActivityTimers[groupId]) {
        clearInterval(groupBgActivityTimers[groupId]);
        delete groupBgActivityTimers[groupId];
    }
}

async function triggerGroupBgChat(groupId) {
    const group = groupsData[groupId];
    if (!group || !group.members || group.members.length === 0) return;

    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    if (!settingsJSON) return;
    const settings = JSON.parse(settingsJSON);

    const now = new Date();
    const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

    const activeMemberIds = group.members.filter(id => !(group.mutedMembers || []).includes(id));
    let membersInfo = '';
    activeMemberIds.forEach(memberId => {
        const mem = friendsData[memberId];
        if (!mem) return;
        membersInfo += `角色名: ${mem.realName || memberId}, 人设: ${(mem.persona || '').substring(0, 50)}\n`;
    });

    const history = await loadChatHistory(groupId);
    const recent = history.slice(-10).map(m => `${m.senderName || (m.type === 'sent' ? '用户' : 'AI')}: ${(m.text || '').substring(0, 60)}`).join('\n');

    const prompt = `
[系统: 群聊后台自动活跃模式]
现在时间是 ${timeStr}，用户不在线。请以群聊成员的身份，自发地聊几句天。

[成员信息]
${membersInfo}

[近期聊天]
${recent || '(暂无)'}

规则:
- 输出 JSON 数组，2-5 条消息
- 消息要符合当前时间和成员人设
- 可以闲聊、吐槽、分享生活等
- 纯 JSON，无多余文字

输出:
`;

    try {
        let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
        const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
            body: JSON.stringify({
                model: settings.model,
                messages: [{ role: 'system', content: prompt }],
                temperature: 0.9
            })
        });
        if (!res.ok) return;
        const data = await res.json();
        let rawReply = (data?.choices?.[0]?.message?.content || '[]').replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

        let messages = [];
        try { messages = JSON.parse(rawReply); } catch (e) { return; }
        if (!Array.isArray(messages) || messages.length === 0) return;

        let unreadAdded = 0;
        for (const msg of messages) {
            if (!msg.name || !msg.content) continue;
            const mem = findMemberByName(msg.name, group.members);
            const avatarUrl = mem && mem.avatar ? mem.avatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(msg.name)}`;
            const msgId = 'msg_bg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

            await saveMessageToHistory(groupId, {
                id: msgId,
                text: msg.content,
                type: 'received',
                senderName: msg.name,
                customAvatar: avatarUrl
            });
            unreadAdded++;
        }

        // 更新未读数
        if (groupsData[groupId]) {
            groupsData[groupId].unreadCount = (groupsData[groupId].unreadCount || 0) + unreadAdded;
            groupsData[groupId].lastMessage = messages[messages.length - 1]?.content || '';
            saveGroupsData();
        }
        updateDockUnreadDot();

        // 如果当前在看这个群，刷新显示
        if (currentChatId === groupId && document.getElementById('chatLayer')?.classList.contains('show')) {
            const chatMessages = document.getElementById('chatMessages');
            messages.forEach(msg => {
                if (!msg.name || !msg.content) return;
                const mem = findMemberByName(msg.name, group.members);
                const avatarUrl = mem && mem.avatar ? mem.avatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(msg.name)}`;
                appendMessage(msg.content, 'received', avatarUrl, msg.name);
            });
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

    } catch (e) {
        console.warn('群聊后台活跃失败:', e);
    }
}

/* =========================================
   群聊设置页面
   ========================================= */
window.openGroupSettingsPage = function (groupId) {
    const group = groupsData[groupId || currentChatId];
    if (!group) return;

    const gid = groupId || currentChatId;
    const page = document.getElementById('groupSettingsPage');
    if (!page) return;

    // 基础信息
    document.getElementById('gs-group-name').value = group.name || '';
    document.getElementById('gs-announcement').value = group.announcement || '';

    // 后台活跃开关
    const bgToggle = document.getElementById('gs-bg-activity-toggle');
    if (bgToggle) bgToggle.checked = !!(group.settings && group.settings.bgActivityEnabled);
    const bgInterval = document.getElementById('gs-bg-interval');
    if (bgInterval) bgInterval.value = (group.settings && group.settings.bgActivityInterval) || 120;
    const bgBox = document.getElementById('gs-bg-interval-box');
    if (bgBox) bgBox.style.display = bgToggle && bgToggle.checked ? 'block' : 'none';

    // 渲染成员列表
    renderGroupMemberList(gid);

    page.classList.add('show');
    page.setAttribute('data-group-id', gid);
};

window.closeGroupSettingsPage = function () {
    const page = document.getElementById('groupSettingsPage');
    if (page) page.classList.remove('show');
};

window.saveGroupSettings = async function () {
    const page = document.getElementById('groupSettingsPage');
    const gid = page ? page.getAttribute('data-group-id') : currentChatId;
    const group = groupsData[gid];
    if (!group) return;

    const newName = document.getElementById('gs-group-name').value.trim();
    if (newName) group.name = newName;

    group.announcement = document.getElementById('gs-announcement').value.trim();

    if (!group.settings) group.settings = {};
    group.settings.bgActivityEnabled = document.getElementById('gs-bg-activity-toggle')?.checked || false;
    group.settings.bgActivityInterval = parseInt(document.getElementById('gs-bg-interval')?.value) || 120;

    await saveGroupsData();

    // 更新 chat header
    const titleEl = document.querySelector('#chatLayer .chat-header span');
    if (titleEl && currentChatId === gid) {
        const memberCount = (group.members || []).length + 1;
        titleEl.innerHTML = `${group.name}<small style="font-size:9px; color:#aaa; font-weight:400; margin-left:4px;">${memberCount}人</small>`;
    }

    // 重启后台活跃
    startGroupBgActivity(gid);

    closeGroupSettingsPage();
    if (typeof showToast === 'function') showToast('群聊设置已保存');

    // 如果有群公告，发布
    if (group.announcement) {
        showGroupAnnouncement(group.announcement, true);
    }
};

function showGroupAnnouncement(text, sendToChat) {
    if (!text) return;
    if (sendToChat) {
        const chatMessages = document.getElementById('chatMessages');
        const div = document.createElement('div');
        div.style.cssText = 'margin:10px 15px; padding:10px 15px; background:#fffbe6; border-left:3px solid #ffd700; border-radius:8px; font-size:12px; color:#555;';
        div.innerHTML = `<i class="fas fa-bullhorn" style="color:#ffd700; margin-right:5px;"></i><b>群公告：</b>${text.replace(/\n/g, '<br>')}`;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

/* =========================================
   群成员管理 UI
   ========================================= */
function renderGroupMemberList(groupId) {
    const group = groupsData[groupId];
    if (!group) return;
    const container = document.getElementById('gs-members-list');
    if (!container) return;

    container.innerHTML = '';

    // ME (群主标记)
    const meInfo = personasMeta[currentPersonaId] || {};
    const meDiv = createMemberRow('ME', meInfo.name || '我', meInfo.avatar || '', groupId, true);
    container.appendChild(meDiv);

    // 其他成员
    (group.members || []).forEach(memberId => {
        const f = friendsData[memberId];
        if (!f) return;
        const isMuted = (group.mutedMembers || []).includes(memberId);
        const isAdmin = (group.admins || []).includes(memberId);
        const title = (group.memberTitles || {})[memberId] || '';
        const displayName = (f.remark || f.realName) + (isMuted ? ' 🚫已禁言' : '') + (isAdmin ? ' [管理员]' : '') + (title ? ` [${title}]` : '');
        const div = createMemberRow(memberId, displayName, f.avatar || '', groupId, false, isMuted);
        container.appendChild(div);
    });

    // + 添加成员按钮
    const addBtn = document.createElement('div');
    addBtn.className = 'gs-member-add-btn';
    addBtn.innerHTML = '<i class="fas fa-plus"></i>';
    addBtn.onclick = () => openAddMemberModal(groupId);
    container.appendChild(addBtn);
}

function createMemberRow(memberId, displayName, avatar, groupId, isMe, isMuted) {
    const div = document.createElement('div');
    div.className = 'gs-member-row';
    div.setAttribute('data-member-id', memberId);

    const avatarUrl = avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(memberId)}`;

    div.innerHTML = `
        <img src="${avatarUrl}" class="gs-member-avatar">
        <div class="gs-member-info">
            <div class="gs-member-name">${displayName}</div>
            ${isMe ? '<div class="gs-member-role">群主</div>' : ''}
        </div>
        ${!isMe ? `
        <div class="gs-member-actions">
            <button class="gs-action-btn" onclick="toggleMuteMember('${memberId}', '${groupId}')" title="${isMuted ? '解禁' : '禁言'}">
                <i class="fas ${isMuted ? 'fa-volume-up' : 'fa-volume-mute'}"></i>
            </button>
            <button class="gs-action-btn" onclick="setMemberTitle('${memberId}', '${groupId}')" title="设置头衔">
                <i class="fas fa-tag"></i>
            </button>
            <button class="gs-action-btn" onclick="kickMember('${memberId}', '${groupId}')" title="踢出" style="color:#ff4d4f;">
                <i class="fas fa-user-times"></i>
            </button>
        </div>` : ''}
    `;
    return div;
}

window.toggleMuteMember = async function (memberId, groupId) {
    const group = groupsData[groupId];
    if (!group) return;
    if (!group.mutedMembers) group.mutedMembers = [];

    const idx = group.mutedMembers.indexOf(memberId);
    if (idx >= 0) {
        group.mutedMembers.splice(idx, 1);
        if (typeof showToast === 'function') showToast('已解除禁言');
    } else {
        group.mutedMembers.push(memberId);
        if (typeof showToast === 'function') showToast('已禁言');
    }
    await saveGroupsData();
    renderGroupMemberList(groupId);
};

window.setMemberTitle = async function (memberId, groupId) {
    const title = prompt('输入头衔（留空删除）：', (groupsData[groupId]?.memberTitles || {})[memberId] || '');
    if (title === null) return;
    if (!groupsData[groupId].memberTitles) groupsData[groupId].memberTitles = {};
    if (title.trim()) {
        groupsData[groupId].memberTitles[memberId] = title.trim();
    } else {
        delete groupsData[groupId].memberTitles[memberId];
    }
    await saveGroupsData();
    renderGroupMemberList(groupId);
};

window.kickMember = async function (memberId, groupId) {
    const group = groupsData[groupId];
    if (!group) return;
    const f = friendsData[memberId];
    const name = f ? (f.remark || f.realName) : memberId;
    if (!confirm(`确定将 "${name}" 踢出群聊吗？`)) return;

    group.members = (group.members || []).filter(id => id !== memberId);
    await saveGroupsData();
    renderGroupMemberList(groupId);

    // 系统消息
    const sysMsg = `${name} 被移出了群聊`;
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages && currentChatId === groupId) {
        const div = document.createElement('div');
        div.style.cssText = 'text-align:center; margin:8px 0;';
        div.innerHTML = `<span style="background:rgba(0,0,0,0.04); padding:3px 10px; border-radius:4px; font-size:11px; color:#999;">${sysMsg}</span>`;
        chatMessages.appendChild(div);
    }
    await saveMessageToHistory(groupId, { text: sysMsg, type: 'system' });
};

// 添加成员弹窗
window.openAddMemberModal = function (groupId) {
    const modal = document.getElementById('group-add-member-modal');
    if (!modal) return;

    const list = document.getElementById('gam-friend-list');
    if (!list) return;
    list.innerHTML = '';

    const group = groupsData[groupId];
    const currentMembers = group ? (group.members || []) : [];

    Object.keys(friendsData).forEach(id => {
        if (currentMembers.includes(id)) return; // 已在群里
        const f = friendsData[id];
        const item = document.createElement('div');
        item.className = 'checklist-item';
        item.onclick = (e) => {
            if (e.target.type !== 'checkbox') {
                const cb = item.querySelector('input');
                if (cb) cb.checked = !cb.checked;
            }
        };
        const avatarUrl = f.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.realName}`;
        item.innerHTML = `
            <input type="checkbox" value="${id}">
            <img src="${avatarUrl}" class="checklist-avatar">
            <span class="checklist-name">${f.remark || f.realName}</span>
        `;
        list.appendChild(item);
    });

    modal.setAttribute('data-group-id', groupId);
    modal.classList.add('active');
};

window.closeAddMemberModal = function () {
    document.getElementById('group-add-member-modal')?.classList.remove('active');
};

window.confirmAddMember = async function () {
    const modal = document.getElementById('group-add-member-modal');
    const groupId = modal?.getAttribute('data-group-id');
    const group = groupsData[groupId];
    if (!group) return;

    const checkboxes = document.querySelectorAll('#gam-friend-list input:checked');
    const newIds = Array.from(checkboxes).map(cb => cb.value);
    if (newIds.length === 0) { alert('请选择要添加的好友'); return; }

    if (!group.members) group.members = [];
    newIds.forEach(id => {
        if (!group.members.includes(id)) group.members.push(id);
    });

    await saveGroupsData();
    closeAddMemberModal();
    renderGroupMemberList(groupId);

    // 系统消息
    const names = newIds.map(id => friendsData[id] ? (friendsData[id].remark || friendsData[id].realName) : id).join('、');
    const sysMsg = `${names} 加入了群聊`;
    if (currentChatId === groupId) {
        const chatMessages = document.getElementById('chatMessages');
        const div = document.createElement('div');
        div.style.cssText = 'text-align:center; margin:8px 0;';
        div.innerHTML = `<span style="background:rgba(0,0,0,0.04); padding:3px 10px; border-radius:4px; font-size:11px; color:#999;">${sysMsg}</span>`;
        chatMessages.appendChild(div);

        // 更新群头部成员数
        const titleEl = document.querySelector('#chatLayer .chat-header span');
        if (titleEl) {
            const memberCount = group.members.length + 1;
            titleEl.innerHTML = `${group.name}<small style="font-size:9px; color:#aaa; font-weight:400; margin-left:4px;">${memberCount}人</small>`;
        }
    }
    await saveMessageToHistory(groupId, { text: sysMsg, type: 'system' });
};

/* =========================================
   红包系统
   ========================================= */
let currentRedPacket = null; // { id, type, total, count, perAmount, grabbedBy:{id:amount}, groupId }

window.openSendRedPacketModal = function () {
    const modal = document.getElementById('group-redpacket-modal');
    if (!modal) return;
    document.getElementById('rp-total-amount').value = '';
    document.getElementById('rp-count').value = '';
    document.getElementById('rp-note').value = '恭喜发财，大吉大利';
    document.getElementById('rp-type-lucky').checked = true;
    modal.classList.add('active');
};

window.closeRedPacketModal = function () {
    document.getElementById('group-redpacket-modal')?.classList.remove('active');
};

window.confirmSendRedPacket = async function () {
    const type = document.querySelector('input[name="rp-type"]:checked')?.value || 'lucky';
    const total = parseFloat(document.getElementById('rp-total-amount').value) || 0;
    const count = parseInt(document.getElementById('rp-count').value) || 1;
    const note = document.getElementById('rp-note').value.trim() || '恭喜发财';

    if (total <= 0) { alert('请输入有效金额'); return; }
    if (count <= 0) { alert('请输入有效数量'); return; }

    // 创建红包数据
    const rpId = 'rp_' + Date.now();
    currentRedPacket = {
        id: rpId,
        type: type,
        total: total,
        count: count,
        note: note,
        remaining: total,
        remainingCount: count,
        grabbedBy: {},
        groupId: currentChatId,
        senderId: 'ME',
        timestamp: Date.now()
    };

    // 保存红包到群数据
    if (!groupsData[currentChatId].redPackets) groupsData[currentChatId].redPackets = {};
    groupsData[currentChatId].redPackets[rpId] = currentRedPacket;

    closeRedPacketModal();
    document.getElementById('chat-extra-panels')?.classList.remove('open');

    // 发红包消息
    const tagText = `[RED_PACKET:${rpId}:${type}:${total}:${count}:${note}]`;
    const msgId = 'msg_rp_' + Date.now();
    appendMessage(tagText, 'sent', null, null, null, msgId);
    await saveMessageToHistory(currentChatId, { id: msgId, text: tagText, type: 'sent', senderName: 'ME' });
    await saveGroupsData();

    // 通知 AI 抢红包
    setTimeout(() => triggerAiGrabRedPacket(rpId, currentChatId), 1500);
};

// AI 自动抢红包
async function triggerAiGrabRedPacket(rpId, groupId) {
    const group = groupsData[groupId];
    if (!group) return;
    const rp = group.redPackets && group.redPackets[rpId];
    if (!rp || rp.remainingCount <= 0) return;

    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    if (!settingsJSON) return;
    const settings = JSON.parse(settingsJSON);

    const members = group.members || [];
    if (members.length === 0) return;

    // 随机决定哪些 AI 抢
    const shuffled = [...members].sort(() => Math.random() - 0.5);
    const grabbers = shuffled.slice(0, Math.min(members.length, rp.count));

    let totalGrabbed = 0;
    const grabResults = [];

    for (let i = 0; i < grabbers.length; i++) {
        const memberId = grabbers[i];
        if (rp.remainingCount <= 0) break;
        if (rp.grabbedBy[memberId]) continue;

        // 分配金额
        let amount;
        if (i === grabbers.length - 1 || rp.remainingCount === 1) {
            // 最后一个拿剩余全部
            amount = Math.round((rp.remaining) * 100) / 100;
        } else if (rp.type === 'lucky') {
            // 拼手气：随机
            const max = rp.remaining * 2 / rp.remainingCount;
            amount = Math.round((Math.random() * max + 0.01) * 100) / 100;
            amount = Math.min(amount, rp.remaining - 0.01 * (rp.remainingCount - 1));
        } else {
            // 普通：平均
            amount = Math.round((rp.total / rp.count) * 100) / 100;
        }
        amount = Math.max(0.01, amount);

        rp.grabbedBy[memberId] = amount;
        rp.remaining = Math.round((rp.remaining - amount) * 100) / 100;
        rp.remainingCount--;
        totalGrabbed += amount;
        grabResults.push({ memberId, amount });
    }

    await saveGroupsData();

    // 找到手气王
    let luckyKing = null;
    let maxAmount = 0;
    Object.keys(rp.grabbedBy).forEach(id => {
        if (rp.grabbedBy[id] > maxAmount) { maxAmount = rp.grabbedBy[id]; luckyKing = id; }
    });

    // 展示结果
    grabResults.forEach((result, idx) => {
        setTimeout(async () => {
            const mem = friendsData[result.memberId];
            if (!mem) return;
            const name = mem.remark || mem.realName;
            const avatar = mem.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${mem.realName}`;
            const isKing = result.memberId === luckyKing;

            // 让 AI 根据金额发表感言
            let comment = `抢到了 ¥${result.amount}${isKing ? ' 👑' : ''}`;

            const aiMsgId = 'msg_rp_grab_' + Date.now() + idx;
            appendMessage(comment, 'received', avatar, name, null, aiMsgId);
            await saveMessageToHistory(groupId, {
                id: aiMsgId, text: comment, type: 'received', senderName: name, customAvatar: avatar
            });
        }, idx * 800 + 500);
    });

    // 最终统计
    setTimeout(() => {
        const totalCount = Object.keys(rp.grabbedBy).length;
        const leftCount = rp.count - totalCount;
        const sysText = leftCount > 0 
            ? `红包已被抢 ${totalCount} 个，还剩 ${leftCount} 个未领取`
            : `红包已全部抢完！手气王：${friendsData[luckyKing] ? (friendsData[luckyKing].remark || friendsData[luckyKing].realName) : '未知'}`;
        
        const chatMessages = document.getElementById('chatMessages');
        const div = document.createElement('div');
        div.style.cssText = 'text-align:center; margin:8px 0;';
        div.innerHTML = `<span style="background:rgba(0,0,0,0.04); padding:3px 10px; border-radius:4px; font-size:11px; color:#999;">${sysText}</span>`;
        if (chatMessages) chatMessages.appendChild(div);
    }, grabResults.length * 800 + 1200);
}

// 用户点击红包
window.grabRedPacket = async function (rpId) {
    const group = groupsData[currentChatId];
    if (!group || !group.redPackets || !group.redPackets[rpId]) {
        if (typeof showToast === 'function') showToast('红包不存在或已过期');
        return;
    }
    const rp = group.redPackets[rpId];
    if (rp.grabbedBy['ME']) {
        if (typeof showToast === 'function') showToast(`你已经抢到了 ¥${rp.grabbedBy['ME']}`);
        return;
    }
    if (rp.remainingCount <= 0) {
        if (typeof showToast === 'function') showToast('手慢了，红包已被抢完');
        return;
    }

    // 计算金额
    let amount;
    if (rp.remainingCount === 1) {
        amount = rp.remaining;
    } else if (rp.type === 'lucky') {
        const max = rp.remaining * 2 / rp.remainingCount;
        amount = Math.round((Math.random() * max + 0.01) * 100) / 100;
        amount = Math.min(amount, rp.remaining - 0.01 * (rp.remainingCount - 1));
    } else {
        amount = Math.round((rp.total / rp.count) * 100) / 100;
    }
    amount = Math.max(0.01, amount);

    rp.grabbedBy['ME'] = amount;
    rp.remaining = Math.round((rp.remaining - amount) * 100) / 100;
    rp.remainingCount--;

    await saveGroupsData();

    // 显示抢到的金额弹窗
    const sender = rp.senderId === 'ME' ? '你' : (friendsData[rp.senderId] ? (friendsData[rp.senderId].remark || friendsData[rp.senderId].realName) : '群友');
    alert(`💰 恭喜！\n你抢到了 ${sender} 发的红包\n金额：¥${amount}`);

    // 在聊天里显示系统消息
    const sysMsg = `你抢到了红包 ¥${amount}`;
    const chatMessages = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.style.cssText = 'text-align:center; margin:8px 0;';
    div.innerHTML = `<span style="background:rgba(255,215,0,0.15); padding:3px 10px; border-radius:4px; font-size:11px; color:#b8860b;">${sysMsg}</span>`;
    if (chatMessages) chatMessages.appendChild(div);
};

// 解析红包 TAG 渲染气泡
function renderRedPacketBubble(text) {
    // [RED_PACKET:rpId:type:total:count:note]
    const match = text.match(/\[RED_PACKET:([^:]+):([^:]+):([\d.]+):(\d+):([^\]]+)\]/);
    if (!match) return null;
    const [, rpId, type, total, count, note] = match;
    const typeLabel = type === 'lucky' ? '拼手气红包' : '普通红包';

    return `
        <div class="group-red-packet-card" onclick="grabRedPacket('${rpId}')">
            <div class="rp-header">
                <i class="fas fa-envelope" style="color:#ffd700; font-size:24px;"></i>
                <div class="rp-info">
                    <div class="rp-note">${note}</div>
                    <div class="rp-type">${typeLabel}</div>
                </div>
            </div>
            <div class="rp-footer">
                <span>¥${total} · 共${count}个</span>
                <span>点击领取</span>
            </div>
        </div>
    `;
}

// 检查并处理群聊特殊指令
async function checkAndProcessGroupCommands(rawReply, groupId) {
    // 检查红包抢包指令 [open_red_packet:rpId]
    const rpMatch = rawReply.match(/\[open_red_packet:([^\]]+)\]/i);
    if (rpMatch) {
        // AI 指令抢包已在 triggerAiGrabRedPacket 中处理
    }
}

/* =========================================
   群投票系统
   ========================================= */
window.openGroupVoteModal = function () {
    const modal = document.getElementById('group-vote-modal');
    if (!modal) return;
    document.getElementById('gv-question').value = '';
    document.getElementById('gv-options-container').innerHTML = `
        <input type="text" class="gv-option-input" placeholder="选项 A">
        <input type="text" class="gv-option-input" placeholder="选项 B">
    `;
    modal.classList.add('active');
};

window.closeGroupVoteModal = function () {
    document.getElementById('group-vote-modal')?.classList.remove('active');
};

window.addVoteOption = function () {
    const container = document.getElementById('gv-options-container');
    const inputs = container.querySelectorAll('.gv-option-input');
    if (inputs.length >= 6) { if (typeof showToast === 'function') showToast('最多6个选项'); return; }
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'gv-option-input';
    input.placeholder = `选项 ${String.fromCharCode(65 + inputs.length)}`;
    container.appendChild(input);
};

window.confirmCreateVote = async function () {
    const question = document.getElementById('gv-question').value.trim();
    const optionInputs = document.querySelectorAll('.gv-option-input');
    const options = Array.from(optionInputs).map(i => i.value.trim()).filter(v => v);

    if (!question) { alert('请输入投票问题'); return; }
    if (options.length < 2) { alert('至少需要2个选项'); return; }

    const voteId = 'vote_' + Date.now();
    const voteData = {
        id: voteId,
        question,
        options,
        votes: {}, // { optionIndex: [voterId, ...] }
        closed: false,
        timestamp: Date.now()
    };
    options.forEach((_, idx) => { voteData.votes[idx] = []; });

    if (!groupsData[currentChatId].votes) groupsData[currentChatId].votes = {};
    groupsData[currentChatId].votes[voteId] = voteData;

    closeGroupVoteModal();
    document.getElementById('chat-extra-panels')?.classList.remove('open');

    const tagText = `[GROUP_VOTE:${voteId}]`;
    const msgId = 'msg_vote_' + Date.now();
    appendMessage(tagText, 'sent', null, null, null, msgId);
    await saveMessageToHistory(currentChatId, { id: msgId, text: tagText, type: 'sent', senderName: 'ME' });
    await saveGroupsData();

    // AI 投票
    setTimeout(() => triggerAiVote(voteId, currentChatId), 2000);
};

async function triggerAiVote(voteId, groupId) {
    const group = groupsData[groupId];
    const voteData = group && group.votes && group.votes[voteId];
    if (!voteData) return;

    const members = group.members || [];
    for (const memberId of members) {
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
        const mem = friendsData[memberId];
        if (!mem) continue;

        // 随机选择选项（实际可让 AI 根据人设选择）
        const optionIndex = Math.floor(Math.random() * voteData.options.length);
        if (!voteData.votes[optionIndex]) voteData.votes[optionIndex] = [];
        if (!voteData.votes[optionIndex].includes(memberId)) {
            voteData.votes[optionIndex].push(memberId);
        }

        await saveGroupsData();

        // 更新投票卡片 UI
        updateVoteCardUI(voteId, groupId);
    }
}

window.castVote = async function (voteId, optionIndex) {
    const group = groupsData[currentChatId];
    const voteData = group && group.votes && group.votes[voteId];
    if (!voteData || voteData.closed) { if (typeof showToast === 'function') showToast('投票已结束'); return; }

    // 检查是否已投票
    let alreadyVoted = false;
    Object.values(voteData.votes).forEach(voters => {
        if (voters.includes('ME')) alreadyVoted = true;
    });
    if (alreadyVoted) { if (typeof showToast === 'function') showToast('你已经投过票了'); return; }

    if (!voteData.votes[optionIndex]) voteData.votes[optionIndex] = [];
    voteData.votes[optionIndex].push('ME');
    await saveGroupsData();
    updateVoteCardUI(voteId, currentChatId);
    if (typeof showToast === 'function') showToast(`已投票：${voteData.options[optionIndex]}`);
};

function updateVoteCardUI(voteId, groupId) {
    const cards = document.querySelectorAll(`.group-vote-card[data-vote-id="${voteId}"]`);
    const group = groupsData[groupId];
    const voteData = group && group.votes && group.votes[voteId];
    if (!voteData) return;

    const totalVotes = Object.values(voteData.votes).reduce((sum, arr) => sum + arr.length, 0);

    cards.forEach(card => {
        const bars = card.querySelectorAll('.gv-option-row');
        bars.forEach((bar, idx) => {
            const count = (voteData.votes[idx] || []).length;
            const pct = totalVotes > 0 ? Math.round(count / totalVotes * 100) : 0;
            const fill = bar.querySelector('.gv-bar-fill');
            const label = bar.querySelector('.gv-bar-label');
            if (fill) fill.style.width = pct + '%';
            if (label) label.innerText = `${count}票 (${pct}%)`;
        });
        const totalEl = card.querySelector('.gv-total');
        if (totalEl) totalEl.innerText = `共 ${totalVotes} 票`;
    });
}

// 渲染投票卡片
function renderVoteBubble(tagText, voteId, groupId) {
    const group = groupsData[groupId];
    const voteData = group && group.votes && group.votes[voteId];
    if (!voteData) return `<div style="color:#999;font-size:12px;">投票加载中...</div>`;

    const totalVotes = Object.values(voteData.votes).reduce((sum, arr) => sum + arr.length, 0);
    let optionsHtml = '';
    voteData.options.forEach((opt, idx) => {
        const count = (voteData.votes[idx] || []).length;
        const pct = totalVotes > 0 ? Math.round(count / totalVotes * 100) : 0;
        optionsHtml += `
            <div class="gv-option-row" onclick="castVote('${voteId}', ${idx})">
                <div class="gv-option-label">${opt}</div>
                <div class="gv-bar-track">
                    <div class="gv-bar-fill" style="width:${pct}%;"></div>
                </div>
                <div class="gv-bar-label">${count}票 (${pct}%)</div>
            </div>
        `;
    });

    return `
        <div class="group-vote-card" data-vote-id="${voteId}">
            <div class="gv-header">
                <i class="fas fa-poll" style="color:#007aff;"></i>
                <span>${voteData.question}</span>
            </div>
            ${optionsHtml}
            <div class="gv-footer">
                <span class="gv-total">共 ${totalVotes} 票</span>
                <span style="color:#999; font-size:11px;">${voteData.closed ? '已结束' : '进行中'}</span>
            </div>
        </div>
    `;
}

/* =========================================
   群视频通话
   ========================================= */
window.openGroupVideoCall = function () {
    const group = groupsData[currentChatId];
    if (!group) return;

    // 显示发起界面
    const modal = document.getElementById('group-video-call-modal');
    if (!modal) return;

    // 渲染成员格子
    const grid = document.getElementById('gvc-participants-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // ME
    const meInfo = personasMeta[currentPersonaId] || {};
    grid.innerHTML += `
        <div class="gvc-participant" id="gvc-me">
            <img src="${meInfo.avatar || ''}">
            <div class="gvc-name">我 (ME)</div>
            <div class="gvc-status connected"><i class="fas fa-video"></i></div>
        </div>
    `;

    // AI 成员 (随机决定是否接受)
    (group.members || []).forEach(memberId => {
        const mem = friendsData[memberId];
        if (!mem) return;
        const avatar = mem.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${mem.realName}`;
        grid.innerHTML += `
            <div class="gvc-participant" id="gvc-${memberId}" data-member-id="${memberId}">
                <img src="${avatar}">
                <div class="gvc-name">${mem.remark || mem.realName}</div>
                <div class="gvc-status waiting"><i class="fas fa-phone"></i> 呼叫中...</div>
            </div>
        `;
    });

    modal.classList.add('active');

    // 延迟模拟 AI 接听
    (group.members || []).forEach((memberId, idx) => {
        setTimeout(() => {
            const participant = document.getElementById(`gvc-${memberId}`);
            if (!participant) return;
            const statusEl = participant.querySelector('.gvc-status');
            if (!statusEl) return;

            const willJoin = Math.random() > 0.3; // 70% 概率接听
            if (willJoin) {
                statusEl.className = 'gvc-status connected';
                statusEl.innerHTML = '<i class="fas fa-video"></i>';
                participant.classList.add('connected');
            } else {
                statusEl.className = 'gvc-status declined';
                statusEl.innerHTML = '<i class="fas fa-phone-slash"></i> 已拒绝';
            }
        }, 1500 + idx * 800);
    });
};

window.closeGroupVideoCall = async function () {
    const modal = document.getElementById('group-video-call-modal');
    if (modal) modal.classList.remove('active');

    // 发送视频通话结束系统消息
    const sysMsg = '群视频通话已结束';
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        const div = document.createElement('div');
        div.style.cssText = 'text-align:center; margin:8px 0;';
        div.innerHTML = `<span style="background:rgba(0,0,0,0.04); padding:3px 10px; border-radius:4px; font-size:11px; color:#999;">${sysMsg}</span>`;
        chatMessages.appendChild(div);
    }
    await saveMessageToHistory(currentChatId, { text: sysMsg, type: 'system' });
};

/* =========================================
   重写 appendMessage 以支持群聊特殊卡片
   ========================================= */
const _origAppendMessage = window.appendMessage;
window.appendMessage = function (text, type, customAvatar, senderName, translation, msgId) {
    // 检查红包 TAG
    if (typeof text === 'string' && text.startsWith('[RED_PACKET:')) {
        const html = renderRedPacketBubble(text);
        if (html) {
            // 临时方式：创建气泡
            const chatMessages = document.getElementById('chatMessages');
            const uniqueId = msgId || ('msg_' + Date.now());
            const row = document.createElement('div');
            row.className = `chat-row ${type}`;
            row.setAttribute('data-msg-id', uniqueId);
            row.setAttribute('data-msg-text', text);

            const img = document.createElement('img');
            img.className = 'chat-avatar-img';
            img.src = type === 'sent' ? (typeof AVATAR_USER !== 'undefined' ? AVATAR_USER : '') :
                (customAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${senderName || 'AI'}`);

            const bubble = document.createElement('div');
            bubble.className = `message-bubble rich-bubble ${type}`;
            bubble.innerHTML = html;

            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'message-content-wrapper';
            contentWrapper.appendChild(bubble);

            if (type === 'sent') {
                row.appendChild(contentWrapper);
                row.appendChild(img);
            } else {
                row.appendChild(img);
                row.appendChild(contentWrapper);
            }
            chatMessages.appendChild(row);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return;
        }
    }

    // 检查投票 TAG
    if (typeof text === 'string' && text.startsWith('[GROUP_VOTE:')) {
        const match = text.match(/\[GROUP_VOTE:([^\]]+)\]/);
        if (match) {
            const voteId = match[1];
            const chatMessages = document.getElementById('chatMessages');
            const uniqueId = msgId || ('msg_' + Date.now());
            const row = document.createElement('div');
            row.className = `chat-row ${type}`;
            row.setAttribute('data-msg-id', uniqueId);
            row.setAttribute('data-msg-text', text);

            const img = document.createElement('img');
            img.className = 'chat-avatar-img';
            img.src = type === 'sent' ? (typeof AVATAR_USER !== 'undefined' ? AVATAR_USER : '') :
                (customAvatar || '');

            const bubble = document.createElement('div');
            bubble.className = `message-bubble rich-bubble ${type}`;
            bubble.innerHTML = renderVoteBubble(text, voteId, currentChatId);

            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'message-content-wrapper';
            contentWrapper.appendChild(bubble);

            if (type === 'sent') {
                row.appendChild(contentWrapper);
                row.appendChild(img);
            } else {
                row.appendChild(img);
                row.appendChild(contentWrapper);
            }
            chatMessages.appendChild(row);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return;
        }
    }

    // 普通消息走原来的逻辑
    return _origAppendMessage(text, type, customAvatar, senderName, translation, msgId);
};

/* =========================================
   退出/删除群聊
   ========================================= */
window.exitOrDeleteGroup = async function () {
    const groupId = currentChatId;
    const group = groupsData[groupId];
    if (!group) return;

    const isOwner = group.ownerId === 'ME';
    const action = isOwner ? '解散' : '退出';
    if (!confirm(`确定要${action}群聊 "${group.name}" 吗？`)) return;

    // 停止后台活跃
    stopGroupBgActivity(groupId);

    // 删除数据
    delete groupsData[groupId];
    await saveGroupsData();
    await IDB.delete(scopedChatKey(groupId));

    // 从列表移除
    const item = document.querySelector(`.wc-chat-item[data-chat-id="${groupId}"]`);
    if (item) item.remove();

    // 关闭聊天界面
    const chatLayer = document.getElementById('chatLayer');
    if (chatLayer) chatLayer.classList.remove('show');
    currentChatId = null;
    currentChatType = 'single';

    closeGroupSettingsPage();
    if (typeof showToast === 'function') showToast(`已${action}群聊`);
};

/* =========================================
   转让群主
   ========================================= */
window.transferGroupOwner = async function () {
    const group = groupsData[currentChatId];
    if (!group || group.ownerId !== 'ME') { if (typeof showToast === 'function') showToast('你不是群主'); return; }

    const members = group.members || [];
    if (members.length === 0) { alert('群里没有其他成员'); return; }

    const names = members.map((id, idx) => {
        const f = friendsData[id];
        return `${idx + 1}. ${f ? (f.remark || f.realName) : id}`;
    }).join('\n');

    const input = prompt(`选择新群主（输入序号）：\n${names}`);
    const idx = parseInt(input) - 1;
    if (isNaN(idx) || idx < 0 || idx >= members.length) { alert('输入无效'); return; }

    const newOwnerId = members[idx];
    group.ownerId = newOwnerId;
    await saveGroupsData();
    renderGroupMemberList(currentChatId);
    const f = friendsData[newOwnerId];
    if (typeof showToast === 'function') showToast(`群主已转让给 ${f ? (f.remark || f.realName) : newOwnerId}`);
};

console.log('[app_groupchat.js] 群聊模块已加载');
