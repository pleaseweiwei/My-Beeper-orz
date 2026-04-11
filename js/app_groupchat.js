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


/* =========================================
   恢复群聊列表 UI
   ========================================= */
window.restoreGroupListUI = function() {
    Object.keys(groupsData).forEach(groupId => {
        const group = groupsData[groupId];
        if (!group) return;
        // 检查是否已存在
        if (document.querySelector(`.wc-chat-item[data-chat-id="${groupId}"]`)) return;

        const members = group.members || [];
        const avatarUrl = group.avatar || group.customAvatar || generateGroupAvatar(groupId, group.name, members);
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
        if (heartBtn) heartBtn.style.display = 'block'; // 群聊启用群友心声

        chatView.classList.add('show');
    }

    // 加载历史记录
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';

    const history = await loadChatHistory(groupId);
    if (currentChatId !== groupId || currentChatType !== 'group') return;

    if (history && history.length > 0) {
        chatMessages.innerHTML = `<div style="text-align:center; margin: 10px 0;"><span style="background:rgba(0,0,0,0.04); padding:4px 12px; border-radius:12px; font-size:10px; color:#999; font-weight:500;">历史消息</span></div>`;
        history.forEach(msg => {
            if (msg.type === 'system') {
                const sysDiv = document.createElement('div');
                sysDiv.style.cssText = 'text-align:center; margin:10px 0;';
                sysDiv.innerHTML = `<span style="background:rgba(0,0,0,0.04); padding:4px 12px; border-radius:4px; font-size:11px; color:#999;">${msg.text}</span>`;
                chatMessages.appendChild(sysDiv);
            } else {
                // 获取发送者头像：优先使用当前 friendsData 中的最新头像，保证头像更新后能全局同步
                let avatar = null;
                if (msg.senderName) {
                    const liveMem = findMemberByName(msg.senderName, group.members);
                    if (liveMem && liveMem.avatar) {
                        avatar = liveMem.avatar; // 始终读取最新头像
                    }
                }
                if (!avatar) avatar = msg.customAvatar; // 兜底：使用历史存档头像
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
        { icon: 'fa-gift',        label: '发红包',  fn: 'openSendRedPacketModal()' },
        { icon: 'fa-poll',        label: '群投票',  fn: 'openGroupVoteModal()' },
        { icon: 'fa-video',       label: '群视频',  fn: 'openGroupVideoCall()' },
        { icon: 'fa-user-secret', label: '匿名',    fn: 'toggleAnonymousMode()' },
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
    
    // 【竞态修复】捕获目标群聊 ID
    const targetGroupId = currentChatId;
    const group = groupsData[targetGroupId];
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
        const history = await loadChatHistory(targetGroupId);
        const recentHistory = history.slice(-20);

        const allActiveMemberIds = (group.members || []).filter(id =>
            !((group.mutedMembers || []).includes(id))
        );

        // ★ 智能调度器
        const dispatchedMemberIds = smartDispatchMembers(allActiveMemberIds, recentHistory, userMessage);

        // 获取我的人设
        const me = personasMeta[currentPersonaId];
        const myName = group.myNickname || (me ? me.name : '我') || '用户';
        
        let presetPrompt = '';
        if (typeof currentSystemPresetId !== 'undefined' && currentSystemPresetId && typeof systemPresets !== 'undefined' && systemPresets[currentSystemPresetId]) {
            const preset = systemPresets[currentSystemPresetId];
            presetPrompt = `[系统预设 (遵循)]\n${preset.systemPrompt || ''}\n`;
            if (preset.jailbreakPrompt) {
                presetPrompt += `[强制指令]\n${preset.jailbreakPrompt}\n`;
            }
        }
        
        const myPersonaStr = `${presetPrompt}[你的身份 (群主/用户)]\n- 群昵称: ${myName}\n- 专属人设: ${(me && me.persona) ? me.persona : '普通用户'}\n[防出戏死命令]: 你绝对不能扮演用户（${myName}），严禁以用户的名字生成对话！`;

        const safeParseMacros = (str, charName) => {
            if (!str) return '';
            return String(str).replace(/{{char}}/gi, charName || '助手').replace(/{{user}}/gi, myName);
        };

        // 主要发言角色人设（包含禁言标签）
        let membersInfo = '';
        const allMemberIds = group.members || [];
        for (const memberId of allMemberIds) {
            const mem = friendsData[memberId];
            if (!mem) continue;
            
            const isMuted = (group.mutedMembers || []).includes(memberId);
            const isAdmin = (group.admins || []).includes(memberId);
            const customTitle = (group.memberTitles || {})[memberId];
            
            let tags = [];
            if (isAdmin) tags.push('管理员');
            if (customTitle) tags.push(`头衔:${customTitle}`);
            if (isMuted) tags.push('已被禁言，禁止让他发言');
            else if (!dispatchedMemberIds.includes(memberId)) tags.push('当前潜水中，尽量不发言');
            
        const tagStr = tags.length > 0 ? ` [${tags.join(' | ')}]` : '';
        
        const shard = dispatchedMemberIds.includes(memberId) ? await getShardedMemoryForMember(memberId, targetGroupId) : null;
        const shardNote = shard ? `\n  [私人记忆]: ${shard}` : '';
        
        membersInfo += `- 本名: ${mem.realName || memberId}，群昵称: ${mem.remark || mem.realName}${tagStr}\n  人设: ${safeParseMacros(mem.persona || '普通的群成员', mem.realName || '助手')}${shardNote}\n`;
    }

        // 长期记忆（对话总结）
        const longTermMemoryStr = group.longTermSummary ? `\n[长期记忆摘要]\n${group.longTermSummary}` : '';

        // 获取互通记忆情报
        let linkedMemoryCtx = '';
        if (typeof buildLinkedMemoryContext === 'function') {
            const rawLinked = await buildLinkedMemoryContext(group.settings, targetGroupId);
            if (rawLinked) {
                linkedMemoryCtx = `\n[仅 AI 可见的附加上下文（情报）]\n${rawLinked}`;
            }
        }

        // 历史记录文本（短期记忆）
        let historyText = '';
        recentHistory.forEach(msg => {
            if (msg.type === 'system') return;
            const sender = msg.type === 'sent' ? myName : (msg.senderName || 'AI');
            
            // 时间戳标注
            let timeStr = '';
            let msgTs = msg.timestamp || (msg.id ? parseInt(msg.id.split('_').pop(), 10) : 0);
            if (!msgTs || isNaN(msgTs) || msgTs < 1000000000000) msgTs = Date.now();
            const d = new Date(msgTs);
            timeStr = `[${d.getMonth()+1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}] `;
            
            // 特殊消息转化
            let content = msg.text || '';
            if (msg.isImage) content = '[图片]';
            else if (msg.isEmoji) content = `[发送了一个表情: ${msg.emojiName || '表情'}]`;
            else if (msg.isRevoked) content = '[用户撤回了一条消息，你不知道内容，但你可以对此做出反应]';
            else content = content.substring(0, 100);
            
            historyText += `${timeStr}${sender}: ${content}\n`;
        });

        // 世界书注入（核心世界观设定）
        const wbData = (typeof constructWorldInfoPrompt === 'function')
            ? constructWorldInfoPrompt(userMessage, targetGroupId)
            : { before_char: '', after_char: '', depth_items: [] };
        const worldStr = wbData.before_char ? `\n[核心世界观设定]\n${wbData.before_char}` : '';

        // 匿名模式处理
        const anonNote = groupAnonymousMode ? `\n[匿名模式已开启]: 用户此刻的身份是"${myAnonName}"，请以此称呼用户。` : '';

        // @艾特检测
        const atMatches = userMessage.match(/@(\S+)/g);
        const atNote = atMatches ? `\n[用户提及了]: ${atMatches.join(', ')}，被提及的角色必须优先回复。` : '';

        // 获取群公告
        const announcementStr = group.announcement ? `\n[最高优先级规则，必须严格遵守]\n以下是群公告，你扮演的所有角色在接下来的对话中受此规则约束：\n${group.announcement}` : '';

        let writingStyleText = '';
        if (typeof offlineConfig !== 'undefined' && offlineConfig.writingStyle) {
            writingStyleText = offlineConfig.writingStyle;
        } else {
            writingStyleText = "采用写实的群像文风。聚焦多角色场景下的自然交互，严格遵循各自人设与说话习惯，体现角色间的互动。通过简练的动作与神态穿插来推进群聊画面。对话要符合多人聊天的真实节奏与临场感。";
        }

        const groupDanmakuInstr = (typeof isDanmakuOn !== 'undefined' && isDanmakuOn)
            ? `\n8. 在 JSON 数组全部输出完后，额外追加一个弹幕块，格式严格如下：
[DANMAKU_START]
弹幕1
弹幕2
弹幕3
[DANMAKU_END]
- 生成 3-6 条简短中文吐槽，像群聊围观弹幕。
- 绝对不要把弹幕写进 JSON 数组里。`
            : '';

        const systemPrompt = `
[系统指令: 动态群聊模拟器]
你是一个同时扮演多个角色的群聊模拟引擎。你的任务是扮演且仅能扮演下述【群成员花名册】中未被禁言的NPC，每个角色的语气必须符合其人设。

[群成员花名册与详细人设]
${membersInfo || '暂无成员信息'}

${myPersonaStr}
${anonNote}${atNote}
${announcementStr}
${worldStr}${longTermMemoryStr}${linkedMemoryCtx}
\n[文风要求]\n${writingStyleText}

[近期群聊记录]
${historyText || '(暂无历史记录)'}

[最高优先级规则]
1. 输出格式: JSON 数组，每项 {"name":"角色群昵称","content":"消息内容"} 
   - 可选附加: {"name":"xxx","content":"...","cmd":{"type":"create_private_group","invitees":["user","角色名"],"reason":"..."}} 当某成员想私下聊时使用
2. 消息数量: 2~6 条，根据话题热度决定。只让合适的几个角色发言，不一定每个人都说话。
3. 真实感: 角色可相互回复、打断。
4. 每条消息 ≤ 30 字，像真实微信群一样碎片化。
5. 被@的角色必须优先且强制回复。
6. 你绝对不能扮演用户（${myName}），严禁生成用户的对话！
7. 只输出 JSON，不要任何多余文字。${groupDanmakuInstr}

现在，用户${groupAnonymousMode ? `（化名"${myAnonName}"）` : `（${myName}）`}发送了: "${userMessage}"
请生成群聊回复（纯 JSON 数组）:
`;

        let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
        const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

        let finalMessages = [{ role: 'system', content: systemPrompt }];
        if (wbData.after_char) {
            finalMessages.push({ role: 'system', content: wbData.after_char });
        }
        finalMessages.push({ role: 'user', content: userMessage });

        if (wbData.depth_items && wbData.depth_items.length > 0) {
            wbData.depth_items.sort((a, b) => b.depth - a.depth);
            wbData.depth_items.forEach(item => {
                const depth = parseInt(item.depth) || 2;
                const insertIndex = Math.max(0, finalMessages.length - depth);
                finalMessages.splice(insertIndex, 0, { role: "system", content: item.content });
            });
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
            body: JSON.stringify({
                model: settings.model,
                messages: finalMessages,
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
        await checkAndProcessGroupCommands(rawReply, targetGroupId);

        let hasDanmaku = false;
        const danmakuRegex = /\[DANMAKU_START\]([\s\S]*?)(?:\[(?:\/)?DANMAKU_END\]|$)/i;
        const danmakuMatch = rawReply.match(danmakuRegex);
        if (danmakuMatch) {
            hasDanmaku = true;
            const dList = danmakuMatch[1].split('\n').map(s => s.trim()).filter(Boolean);
            if (typeof isDanmakuOn !== 'undefined' && isDanmakuOn && dList.length > 0) {
                danmakuPool = dList;
                startDanmakuBatch(0);
            }
            rawReply = rawReply.replace(danmakuRegex, '').trim();
        }

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

        // 过滤掉非群成员的消息（防止 AI 幻觉凭空造人）
        messages = messages.filter(msg => {
            if (!msg.name || !msg.content) return false;
            const mem = findMemberByName(msg.name, group.members);
            if (!mem) {
                console.warn(`[GroupChat] 拦截非群成员的消息: ${msg.name}`);
                return false;
            }
            // 不要扮演用户本人
            if (msg.name === myName) {
                console.warn(`[GroupChat] 拦截 AI 扮演用户的消息: ${msg.name}`);
                return false;
            }
            return true;
        });

        if (messages.length > 0 && typeof generateGroupSceneExtrasBackground === 'function') {
            generateGroupSceneExtrasBackground(targetGroupId, userMessage, messages, settings, {
                needMind: true,
                needDanmaku: (typeof isDanmakuOn !== 'undefined' && isDanmakuOn && !hasDanmaku),
                needOptions: false,
                mode: 'chat'
            });
        }

        // 逐条延迟展示
        let cumulativeDelay = 0;
        messages.forEach((msg, index) => {
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

                const chatLayer = document.getElementById('chatLayer');
                const isLookingAtThisGroup = chatLayer && chatLayer.classList.contains('show') && 
                                             currentChatId === targetGroupId && currentChatType === 'group';

                if (isLookingAtThisGroup) {
                    appendMessage(content, 'received', avatarUrl, displayName, null, aiMsgId);
                } else {
                    if (typeof showToast === 'function') {
                        showToast(`[${group.name}] ${displayName}: 发来了一条新消息`);
                    }
                    if (groupsData[targetGroupId]) {
                        groupsData[targetGroupId].unreadCount = (groupsData[targetGroupId].unreadCount || 0) + 1;
                    }
                    if (typeof updateChatListUnreadUI === 'function') updateChatListUnreadUI(targetGroupId);
                    if (typeof updateDockUnreadDot === 'function') updateDockUnreadDot();
                }

                await saveMessageToHistory(targetGroupId, {
                    id: aiMsgId, text: content, type: 'received',
                    senderName: msg.name, customAvatar: avatarUrl
                });

                if (groupsData[targetGroupId]) {
                    groupsData[targetGroupId].lastMessage = `${msg.name}: ${content.substring(0, 20)}`;
                    saveGroupsData();
                }

                // 处理 Gossip 拉群指令
                if (msg.cmd && msg.cmd.type === 'create_private_group') {
                    setTimeout(() => handleGossipCommand(msg.cmd, targetGroupId), 1500);
                }

            }, cumulativeDelay);
        });

        // 触发群聊记忆总结（延迟执行以确保消息都保存完毕）
        setTimeout(() => {
            checkAndGenerateGroupSummary(targetGroupId);
        }, cumulativeDelay + 2000);

    } catch (e) {
        document.getElementById(loadingId)?.remove();
        if (e.name !== 'AbortError') {
            showAiErrorModal('群聊生成失败', e.message);
        }
    }
};

window.checkAndGenerateGroupSummary = async function(groupId) {
    const group = groupsData[groupId];
    if (!group) return;

    try {
        const history = await loadChatHistory(groupId);
        
        // 当聊天记录大于等于设置的条数（默认40）时触发总结
        const memoryLimit = (group.settings && group.settings.memoryLimit) ? parseInt(group.settings.memoryLimit) : 40;
        if (history.length < memoryLimit) return;
        
        // 提取需要总结的部分（前面的一大半）
        const keepCount = 10; // 总结后保留的短期记忆条数
        const toSummarize = history.slice(0, history.length - keepCount);
        if (toSummarize.length === 0) return;

        const settingsJSON = localStorage.getItem(SETTINGS_KEY);
        if (!settingsJSON) return;
        const settings = JSON.parse(settingsJSON);
        let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
        const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

        // 格式化历史
        let historyText = '';
        toSummarize.forEach(msg => {
            if (msg.type === 'system') return;
            const sender = msg.type === 'sent' ? (group.myNickname || '用户') : (msg.senderName || 'AI');
            let content = msg.text || '';
            if (msg.isImage) content = '[图片]';
            if (msg.isEmoji) content = '[表情]';
            historyText += `${sender}: ${content}\n`;
        });

        const prompt = `请将以下群聊记录总结为一段精简的【长期记忆摘要】。
要求：
1. 重点保留关键事件、角色关系变化和重要情报。
2. 尽可能简短，不要废话，用客观的第三方口吻。
3. 如果之前已有摘要，请将其与新对话内容结合，合并为一个完整的摘要。

【以前的记忆摘要】：
${group.longTermSummary || '无'}

【新对话记录】：
${historyText}`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
            body: JSON.stringify({
                model: settings.model,
                messages: [{ role: 'system', content: '你是一个专业的群聊记忆总结助手。只输出摘要内容，不要任何寒暄。' }, { role: 'user', content: prompt }],
                temperature: 0.3
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            const newSummary = data?.choices?.[0]?.message?.content;
            if (newSummary) {
                group.longTermSummary = newSummary.trim();
                saveGroupsData();
                
                // 截断历史记录，只保留最后 keepCount 条
                const newHistory = history.slice(-keepCount);
                localStorage.setItem(`chat_${groupId}`, JSON.stringify(newHistory));
                console.log(`[群聊 ${groupId}] 长期记忆已触发并更新，历史已清理。`);
            }
        }
    } catch (e) {
        console.error('总结群聊记忆失败:', e);
    }
};

// 通过名字在群成员中查找 friendsData 对象
function findMemberByName(name, memberIds) {
    if (!memberIds || !name) return null;
    const searchName = String(name).trim().toLowerCase();
    
    // 1. 完全匹配
    for (const id of memberIds) {
        const f = friendsData[id];
        if (!f) continue;
        if ((f.realName && f.realName.trim().toLowerCase() === searchName) || 
            (f.remark && f.remark.trim().toLowerCase() === searchName)) {
            return f;
        }
    }
    
    // 2. 包含匹配（应对AI擅自加上姓氏、头衔、空格或大小写不一致的情况）
    for (const id of memberIds) {
        const f = friendsData[id];
        if (!f) continue;
        const rName = (f.realName || '').trim().toLowerCase();
        const remName = (f.remark || '').trim().toLowerCase();
        if (rName && searchName.includes(rName)) return f;
        if (remName && searchName.includes(remName)) return f;
        if (rName && rName.includes(searchName)) return f;
        if (remName && remName.includes(searchName)) return f;
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
        const isViewingThisGroup = chatLayer && chatLayer.classList.contains('show') && currentChatId === groupId && currentChatType === 'group';
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

    const me = personasMeta[currentPersonaId];
    const myName = group.myNickname || (me ? me.name : '我') || '用户';
    const myPersonaStr = `[防出戏死命令]: 你绝对不能扮演用户（${myName}），严禁以用户的名字生成对话！`;

    const safeParseMacros = (str, charName) => {
        if (!str) return '';
        return String(str).replace(/{{char}}/gi, charName || '助手').replace(/{{user}}/gi, myName);
    };

    const allMemberIds = group.members || [];
    let membersInfo = '';
    for (const memberId of allMemberIds) {
        const mem = friendsData[memberId];
        if (!mem) continue;
        
        const isMuted = (group.mutedMembers || []).includes(memberId);
        const isAdmin = (group.admins || []).includes(memberId);
        const customTitle = (group.memberTitles || {})[memberId];
        
        let tags = [];
        if (isAdmin) tags.push('管理员');
        if (customTitle) tags.push(`头衔:${customTitle}`);
        if (isMuted) tags.push('已被禁言，禁止让他发言');
        
        const tagStr = tags.length > 0 ? ` [${tags.join(' | ')}]` : '';
        membersInfo += `- 本名: ${mem.realName || memberId}，群昵称: ${mem.remark || mem.realName}${tagStr}\n  人设: ${safeParseMacros(mem.persona || '', mem.realName || '助手')}\n`;
    }

    const history = await loadChatHistory(groupId);
    const recent = history.slice(-10).map(m => `${m.senderName || (m.type === 'sent' ? myName : 'AI')}: ${(m.text || '').substring(0, 60)}`).join('\n');

    let linkedMemoryCtx = '';
    if (typeof buildLinkedMemoryContext === 'function') {
        linkedMemoryCtx = await buildLinkedMemoryContext(group.settings, groupId);
    }

    const prompt = `
[系统: 群聊后台自动活跃模式]
现在时间是 ${timeStr}，用户（${myName}）不在线。你的任务是扮演且仅能扮演下述【群成员花名册】中未被禁言的NPC，自发地聊几句天。

[群成员花名册]
${membersInfo}
${myPersonaStr}
${linkedMemoryCtx}

[近期聊天]
${recent || '(暂无)'}

规则:
- 输出 JSON 数组，2-5 条消息
- 消息要符合当前时间和成员人设
- 角色可相互回复、打断。
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
            if (!mem || msg.name === myName) {
                console.warn(`[GroupBgChat] 拦截非群成员或用户的消息: ${msg.name}`);
                continue;
            }
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

        const isLookingAtThisGroup = document.getElementById('chatLayer')?.classList.contains('show') && 
                                     currentChatId === groupId && currentChatType === 'group';

        if (groupsData[groupId]) {
            groupsData[groupId].lastMessage = messages[messages.length - 1]?.content || '';
            if (!isLookingAtThisGroup) {
                groupsData[groupId].unreadCount = (groupsData[groupId].unreadCount || 0) + unreadAdded;
            }
            saveGroupsData();
        }
        
        if (!isLookingAtThisGroup) {
            if (typeof updateChatListUnreadUI === 'function') updateChatListUnreadUI(groupId);
            if (typeof updateDockUnreadDot === 'function') updateDockUnreadDot();
        } else {
            // 如果当前在看这个群，刷新显示
            const chatMessages = document.getElementById('chatMessages');
            messages.forEach(msg => {
                if (!msg.name || !msg.content) return;
                const mem = findMemberByName(msg.name, group.members);
                if (!mem || msg.name === myName) return;
                const avatarUrl = mem && mem.avatar ? mem.avatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(msg.name)}`;
                appendMessage(msg.content, 'received', avatarUrl, msg.name);
            });
            if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
        }

    } catch (e) {
        console.warn('群聊后台活跃失败:', e);
    }
}


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
    if (chatMessages && currentChatId === groupId && currentChatType === 'group') {
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
    if (currentChatId === groupId && currentChatType === 'group') {
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
            const isLookingAtThisGroup = document.getElementById('chatLayer')?.classList.contains('show') && 
                                         currentChatId === groupId && currentChatType === 'group';
            
            if (isLookingAtThisGroup) {
                appendMessage(comment, 'received', avatar, name, null, aiMsgId);
            } else {
                if (groupsData[groupId]) {
                    groupsData[groupId].unreadCount = (groupsData[groupId].unreadCount || 0) + 1;
                    saveGroupsData();
                }
                if (typeof updateChatListUnreadUI === 'function') updateChatListUnreadUI(groupId);
                if (typeof updateDockUnreadDot === 'function') updateDockUnreadDot();
            }
            
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
        
        const isLookingAtThisGroup = document.getElementById('chatLayer')?.classList.contains('show') && 
                                     currentChatId === groupId && currentChatType === 'group';
                                     
        if (isLookingAtThisGroup) {
            const chatMessages = document.getElementById('chatMessages');
            const div = document.createElement('div');
            div.style.cssText = 'text-align:center; margin:8px 0;';
            div.innerHTML = `<span style="background:rgba(0,0,0,0.04); padding:3px 10px; border-radius:4px; font-size:11px; color:#999;">${sysText}</span>`;
            if (chatMessages) {
                chatMessages.appendChild(div);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        }
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
window.appendMessage = function (text, type, customAvatar, senderName, translation, msgId, timestamp) {
    // 检查红包 TAG
    if (typeof text === 'string' && text.startsWith('[RED_PACKET:')) {
        const html = renderRedPacketBubble(text);
        if (html) {
            const chatMessages = document.getElementById('chatMessages');

            // ★ 5 分钟时间气泡判断（与 appendMessage 一致）
            (function() {
                const _msgTs = (timestamp && timestamp > 0) ? timestamp : Date.now();
                if (_msgTs - _lastChatMsgTimestamp >= 5 * 60 * 1000) {
                    const _tb = document.createElement('div');
                    _tb.className = 'chat-time-divider';
                    _tb.innerHTML = `<span>${_formatChatTime(_msgTs)}</span>`;
                    chatMessages.appendChild(_tb);
                }
                _lastChatMsgTimestamp = _msgTs;
            })();

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

            // ★ 5 分钟时间气泡判断（与 appendMessage 一致）
            (function() {
                const _msgTs = (timestamp && timestamp > 0) ? timestamp : Date.now();
                if (_msgTs - _lastChatMsgTimestamp >= 5 * 60 * 1000) {
                    const _tb = document.createElement('div');
                    _tb.className = 'chat-time-divider';
                    _tb.innerHTML = `<span>${_formatChatTime(_msgTs)}</span>`;
                    chatMessages.appendChild(_tb);
                }
                _lastChatMsgTimestamp = _msgTs;
            })();

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

    // 普通消息走原来的逻辑（传递 timestamp 参数）
    return _origAppendMessage(text, type, customAvatar, senderName, translation, msgId, timestamp);
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

/* =========================================
   群聊设置页面 (open / close / tabs / save)
   ========================================= */

/* ── 头像上传处理 ── */
window.handleGsGroupAvatarUpload = function (input) {
    if (!input.files || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target.result;
        const valEl = document.getElementById('gs-group-avatar-val');
        const urlEl = document.getElementById('gs-group-avatar-url');
        const img   = document.getElementById('gs-group-avatar-img');
        const ph    = document.getElementById('gs-group-avatar-placeholder');
        if (valEl) valEl.value = dataUrl;
        if (urlEl) urlEl.value = dataUrl;
        if (img)  { img.src = dataUrl; img.style.display = 'block'; }
        if (ph)   ph.style.display = 'none';
    };
    reader.readAsDataURL(input.files[0]);
};

window.handleGsMyAvatarUpload = function (input) {
    if (!input.files || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = document.getElementById('gs-my-avatar-img');
        const ph  = document.getElementById('gs-my-avatar-placeholder');
        if (img) { img.src = e.target.result; img.style.display = 'block'; }
        if (ph)  ph.style.display = 'none';
    };
    reader.readAsDataURL(input.files[0]);
};

window.handleGsChatBgUpload = function (input) {
    if (!input.files || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const el = document.getElementById('gs-chat-bg-url');
        if (el) el.value = e.target.result;
    };
    reader.readAsDataURL(input.files[0]);
};

/* ── 气泡主题 ── */
window.selectGsBubbleTheme = function (theme, btn) {
    document.querySelectorAll('.gs-bubble-theme-btn').forEach(b => b.style.outline = '');
    if (btn) btn.style.outline = '2px solid #111';
    if (_currentGroupSettingsId && groupsData[_currentGroupSettingsId]) {
        groupsData[_currentGroupSettingsId].bubbleTheme = theme;
    }
};

/* ── CSS 预设 ── */
function renderGsCssPresets () {
    const container = document.getElementById('gs-css-presets-list');
    if (!container) return;
    container.innerHTML = '';
    let presets = {};
    try { presets = JSON.parse(localStorage.getItem('gsCssPresets') || '{}'); } catch (e) {}
    Object.keys(presets).forEach(name => {
        const chip = document.createElement('div');
        chip.style.cssText = 'background:#f5f5f5;border-radius:8px;padding:4px 10px;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:6px;';
        chip.innerHTML = `<span>${name}</span><i class="fas fa-times" style="color:#ccc;font-size:10px;"></i>`;
        chip.querySelector('span').onclick = () => {
            const el = document.getElementById('gs-custom-css');
            if (el) el.value = presets[name];
        };
        chip.querySelector('i').onclick = () => {
            delete presets[name];
            localStorage.setItem('gsCssPresets', JSON.stringify(presets));
            renderGsCssPresets();
        };
        container.appendChild(chip);
    });
}

window.saveGsCssPreset = function () {
    const css = (document.getElementById('gs-custom-css').value || '').trim();
    if (!css) { if (typeof showToast === 'function') showToast('CSS 为空'); return; }
    const name = prompt('预设名称：');
    if (!name) return;
    let presets = {};
    try { presets = JSON.parse(localStorage.getItem('gsCssPresets') || '{}'); } catch (e) {}
    presets[name] = css;
    localStorage.setItem('gsCssPresets', JSON.stringify(presets));
    renderGsCssPresets();
    if (typeof showToast === 'function') showToast('预设已保存');
};

window.exportGsCss = function () {
    const css = document.getElementById('gs-custom-css').value || '';
    const blob = new Blob([css], { type: 'text/css' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'group-chat.css'; a.click();
    URL.revokeObjectURL(url);
};

/* ── 群成员面板 ── */
window.openGroupMemberPanel = function () {
    const groupId = _currentGroupSettingsId;
    let hiddenId = document.getElementById('gs-current-group-id');
    if (!hiddenId) {
        hiddenId = document.createElement('input');
        hiddenId.type = 'hidden';
        hiddenId.id = 'gs-current-group-id';
        document.body.appendChild(hiddenId);
    }
    hiddenId.value = groupId;
    renderGroupMemberList(groupId);
    const panel = document.getElementById('groupMemberPanel');
    if (panel) panel.classList.add('show');
};

window.closeGroupMemberPanel = function () {
    const panel = document.getElementById('groupMemberPanel');
    if (panel) panel.classList.remove('show');
};

/* ── 创建群内新成员 ── */
window.openCreateNewMemberModal = function () {
    ['cnm-name', 'cnm-avatar-url', 'cnm-persona'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const prev = document.getElementById('cnm-avatar-preview-img');
    if (prev) prev.style.display = 'none';
    document.getElementById('gs-create-member-modal').classList.add('active');
};

window.closeCreateNewMemberModal = function () {
    document.getElementById('gs-create-member-modal').classList.remove('active');
};

window.handleCnmAvatarUpload = function (input) {
    if (!input.files || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const urlEl = document.getElementById('cnm-avatar-url');
        const prev  = document.getElementById('cnm-avatar-preview-img');
        if (urlEl) urlEl.value = e.target.result;
        if (prev)  { prev.src = e.target.result; prev.style.display = 'block'; }
    };
    reader.readAsDataURL(input.files[0]);
};

window.confirmCreateNewMember = async function () {
    const nameEl = document.getElementById('cnm-name');
    const name   = (nameEl ? nameEl.value : '').trim();
    if (!name) { alert('请输入成员名字'); return; }

    const avatarUrlEl = document.getElementById('cnm-avatar-url');
    const personaEl   = document.getElementById('cnm-persona');
    const avatarUrl   = (avatarUrlEl ? avatarUrlEl.value.trim() : '') ||
                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;
    const persona     = personaEl ? personaEl.value.trim() : '';

    const memberId = 'npc_' + Date.now();
    friendsData[memberId] = { realName: name, remark: name, avatar: avatarUrl, persona, isNPC: true };

    const groupId = _currentGroupSettingsId;
    const group   = groupsData[groupId];
    if (group) {
        if (!group.members) group.members = [];
        group.members.push(memberId);
        await saveGroupsData();
        if (typeof saveFriendsData === 'function') await saveFriendsData();
    }

    closeCreateNewMemberModal();
    renderGroupMemberList(groupId);
    if (typeof showToast === 'function') showToast(`${name} 已加入群聊`);
};

/* ── AI 生成群成员 ── */
window.openAiGenerateMembersModal = function () {
    const countEl  = document.getElementById('agm-count');
    const promptEl = document.getElementById('agm-prompt');
    if (countEl)  countEl.value = 5;
    if (promptEl) promptEl.value = '';
    document.getElementById('gs-ai-generate-modal').classList.add('active');
};

window.closeAiGenerateMembersModal = function () {
    document.getElementById('gs-ai-generate-modal').classList.remove('active');
};

window.confirmAiGenerateMembers = async function () {
    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    if (!settingsJSON) { alert('请先配置 API'); return; }
    const settings = JSON.parse(settingsJSON);

    const count  = parseInt(document.getElementById('agm-count').value) || 5;
    const prompt = (document.getElementById('agm-prompt').value || '').trim();
    const btn    = document.getElementById('agm-confirm-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...'; }

    try {
        let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
        const apiUrl = baseUrl.endsWith('/v1')
            ? `${baseUrl}/chat/completions`
            : `${baseUrl}/v1/chat/completions`;

        const systemPrompt = `请生成 ${count} 位群聊成员的角色档案。场景背景：${prompt || '日常群聊'}。
输出 JSON 数组，每项格式：{"name":"姓名","persona":"100字以内性格人设"}。纯 JSON，无多余文字。`;

        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
            body: JSON.stringify({ model: settings.model, messages: [{ role: 'user', content: systemPrompt }], temperature: 0.9 })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        let raw = (data?.choices?.[0]?.message?.content || '[]')
            .replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        let members = [];
        try { members = JSON.parse(raw); } catch (e) { throw new Error('JSON 解析失败'); }

        const groupId = _currentGroupSettingsId;
        const group   = groupsData[groupId];
        if (!group) return;
        if (!group.members) group.members = [];

        for (const m of members) {
            if (!m.name) continue;
            const memberId  = 'npc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(m.name)}`;
            friendsData[memberId] = { realName: m.name, remark: m.name, avatar: avatarUrl, persona: m.persona || '', isNPC: true };
            group.members.push(memberId);
        }

        await saveGroupsData();
        if (typeof saveFriendsData === 'function') await saveFriendsData();
        closeAiGenerateMembersModal();
        renderGroupMemberList(groupId);
        if (typeof showToast === 'function') showToast(`已生成 ${members.length} 位群友`);
    } catch (e) {
        alert('生成失败：' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-magic"></i> 开始生成'; }
    }
};

/* ── 记忆联动列表 ── */
function loadGsLinkMemoryList (groupId) {
    const container = document.getElementById('gs-link-memory-container');
    if (!container) return;
    container.innerHTML = '';
    const group     = groupsData[groupId];
    const linkedIds = group ? (group.linkedMemories || []) : [];

    Object.keys(friendsData).forEach(id => {
        const f = friendsData[id];
        if (!f) return;
        const item      = document.createElement('div');
        item.className  = 'checklist-item';
        const avatarUrl = f.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.realName}`;
        item.innerHTML  = `<input type="checkbox" value="${id}" ${linkedIds.includes(id) ? 'checked' : ''}><img src="${avatarUrl}" class="checklist-avatar"><span class="checklist-name">${f.remark || f.realName}</span>`;
        item.onclick = (e) => { if (e.target.type !== 'checkbox') { const cb = item.querySelector('input'); if (cb) cb.checked = !cb.checked; } };
        container.appendChild(item);
    });

    Object.keys(groupsData).forEach(gId => {
        if (gId === groupId) return;
        const g    = groupsData[gId];
        const item = document.createElement('div');
        item.className = 'checklist-item';
        item.innerHTML = `<input type="checkbox" value="${gId}" ${linkedIds.includes(gId) ? 'checked' : ''}><div style="width:28px;height:28px;border-radius:50%;background:#eee;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;">👥</div><span class="checklist-name">${g.name}</span>`;
        item.onclick = (e) => { if (e.target.type !== 'checkbox') { const cb = item.querySelector('input'); if (cb) cb.checked = !cb.checked; } };
        container.appendChild(item);
    });
}

/* ── DATA tab ── */
window.importGroupChatHistory = function (input) {
    if (!input.files || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!Array.isArray(data)) throw new Error('格式错误');
            await IDB.set(scopedChatKey(_currentGroupSettingsId), data);
            if (typeof showToast === 'function') showToast('导入成功');
        } catch (err) { alert('导入失败：' + err.message); }
    };
    reader.readAsText(input.files[0]);
};

window.exportGroupChatHistory = async function () {
    const groupId = _currentGroupSettingsId;
    const history = await loadChatHistory(groupId);
    if (!history || history.length === 0) {
        if (typeof showToast === 'function') showToast('暂无聊天记录');
        return;
    }
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `group_${groupId}_history.json`;
    a.click();
    URL.revokeObjectURL(url);
};

window.openGroupChatSearch = function () {
    const kwEl = document.getElementById('gs-search-keyword');
    const resEl = document.getElementById('gs-search-results');
    if (kwEl)  kwEl.value = '';
    if (resEl) resEl.innerHTML = `
        <div style="text-align:center;color:#ccc;font-size:13px;padding:40px 0;">
            <i class="fas fa-search" style="font-size:32px;margin-bottom:10px;display:block;opacity:0.3;"></i>
            输入关键词开始搜索
        </div>`;
    const page = document.getElementById('groupChatSearchPage');
    if (page) page.classList.add('show');
};

window.closeGroupChatSearch = function () {
    const page = document.getElementById('groupChatSearchPage');
    if (page) page.classList.remove('show');
};

window.performGroupChatSearch = async function () {
    const keyword = (document.getElementById('gs-search-keyword').value || '').trim();
    const speaker = document.getElementById('gs-search-speaker').value;
    const resultsContainer = document.getElementById('gs-search-results');

    if (!keyword) {
        resultsContainer.innerHTML = `<div style="text-align:center;color:#ccc;font-size:13px;padding:40px 0;">输入关键词开始搜索</div>`;
        return;
    }

    const history = await loadChatHistory(_currentGroupSettingsId);
    if (!history || history.length === 0) {
        resultsContainer.innerHTML = `<div style="text-align:center;color:#ccc;padding:40px 0;">暂无聊天记录</div>`;
        return;
    }

    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let results   = history.filter(msg => {
        if (msg.type === 'system') return false;
        if (speaker === 'sent'     && msg.type !== 'sent')     return false;
        if (speaker === 'received' && msg.type !== 'received') return false;
        return (msg.text || '').includes(keyword);
    });

    if (results.length === 0) {
        resultsContainer.innerHTML = `<div style="text-align:center;color:#ccc;padding:40px 0;">未找到匹配内容</div>`;
        return;
    }

    resultsContainer.innerHTML = results.slice(-50).map(msg => {
        const text = (msg.text || '').replace(
            new RegExp(escaped, 'gi'),
            m => `<mark style="background:#fff3cd;">${m}</mark>`
        );
        const sender = msg.senderName || (msg.type === 'sent' ? '我' : 'AI');
        return `<div style="background:#fff;border-radius:12px;padding:12px 15px;margin-bottom:10px;border:1px solid #eee;">
            <div style="font-size:11px;color:#aaa;margin-bottom:5px;">${sender}</div>
            <div style="font-size:13px;color:#333;line-height:1.5;">${text}</div>
        </div>`;
    }).join('');
};

window.clearGroupChatHistory = async function () {
    if (!confirm('确定要清空群聊记录吗？此操作不可恢复。')) return;
    try { await IDB.delete(scopedChatKey(_currentGroupSettingsId)); } catch (e) {}
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages && currentChatId === _currentGroupSettingsId) chatMessages.innerHTML = '';
    if (typeof showToast === 'function') showToast('聊天记录已清空');
};

/* =========================================
   群聊设置页面入口
   ========================================= */
let currentGroupSettingsId = null;

window.openGroupSettingsPage = function (groupId) {
    const page = document.getElementById('groupSettingsPage');
    if (!page) return;
    const group = groupsData[groupId];
    if (!group) return;

    currentGroupSettingsId = groupId;
    switchGsTab('info');

    // INFO: 群头像
    const avatarUrl = group.avatar || '';
    const gsAvatarVal = document.getElementById('gs-group-avatar-val');
    const gsAvatarImg = document.getElementById('gs-group-avatar-img');
    const gsAvatarPlaceholder = document.getElementById('gs-group-avatar-placeholder');
    const gsAvatarUrlInput = document.getElementById('gs-group-avatar-url');
    if (gsAvatarVal) gsAvatarVal.value = avatarUrl;
    if (gsAvatarUrlInput) gsAvatarUrlInput.value = avatarUrl;
    if (gsAvatarImg && gsAvatarPlaceholder) {
        if (avatarUrl) {
            gsAvatarImg.src = avatarUrl;
            gsAvatarImg.style.display = 'block';
            gsAvatarPlaceholder.style.display = 'none';
        } else {
            gsAvatarImg.style.display = 'none';
            gsAvatarPlaceholder.style.display = 'block';
        }
    }

    // INFO: 群名
    const gsGroupName = document.getElementById('gs-group-name');
    if (gsGroupName) gsGroupName.value = group.name || '';

    // INFO: 我的昵称
    const gsMyNickname = document.getElementById('gs-my-nickname');
    if (gsMyNickname) gsMyNickname.value = group.myNickname || '';

    // INFO: 我的头像
    const myAvatarImg = document.getElementById('gs-my-avatar-img');
    const myAvatarPlaceholder = document.getElementById('gs-my-avatar-placeholder');
    const myAvatarUrl = group.myAvatar || '';
    if (myAvatarImg && myAvatarPlaceholder) {
        if (myAvatarUrl) {
            myAvatarImg.src = myAvatarUrl;
            myAvatarImg.style.display = 'block';
            myAvatarPlaceholder.style.display = 'none';
        } else {
            myAvatarImg.style.display = 'none';
            myAvatarPlaceholder.style.display = 'block';
        }
    }
    const gsMyAvatarFrame = document.getElementById('gs-my-avatar-frame');
    if (gsMyAvatarFrame) gsMyAvatarFrame.value = group.myAvatarFrame || '';

    // INFO: 成员数量
    const memberCountLabel = document.getElementById('gs-member-count-label');
    if (memberCountLabel) {
        const count = (group.members || []).length + 1;
        memberCountLabel.textContent = `${count} 位成员`;
    }

    // AI tab
    const settings = group.settings || {};
    const bgToggle = document.getElementById('gs-bg-activity-toggle');
    const bgIntervalBox = document.getElementById('gs-bg-interval-box');
    const bgInterval = document.getElementById('gs-bg-interval');
    const memoryLimit = document.getElementById('gs-memory-limit');
    const replyMin = document.getElementById('gs-reply-min');
    const replyMax = document.getElementById('gs-reply-max');
    const announcement = document.getElementById('gs-announcement');
    if (bgToggle) bgToggle.checked = !!settings.bgActivityEnabled;
    if (bgIntervalBox) bgIntervalBox.style.display = settings.bgActivityEnabled ? 'block' : 'none';
    if (bgInterval) bgInterval.value = settings.bgActivityInterval || 120;
    if (memoryLimit) memoryLimit.value = settings.memoryLimit || 20;
    if (replyMin) replyMin.value = settings.replyMin || 1;
    if (replyMax) replyMax.value = settings.replyMax || 5;
    if (announcement) announcement.value = group.announcement || '';

    // MEMORY LINK
    renderGsLinkMemoryList(group);

    // VISUAL tab
    const chatBgUrl = document.getElementById('gs-chat-bg-url');
    if (chatBgUrl) chatBgUrl.value = group.chatBgUrl || '';
    const fontSizeSlider = document.getElementById('gs-font-size-slider');
    const fontSizeVal = document.getElementById('gs-font-size-val');
    if (fontSizeSlider) fontSizeSlider.value = group.fontSize || 14;
    if (fontSizeVal) fontSizeVal.textContent = (group.fontSize || 14) + 'px';
    const customCss = document.getElementById('gs-custom-css');
    if (customCss) customCss.value = group.customCss || '';
    const naiPositive = document.getElementById('gs-nai-positive');
    if (naiPositive) naiPositive.value = group.naiPositive || '';
    const naiNegative = document.getElementById('gs-nai-negative');
    if (naiNegative) naiNegative.value = group.naiNegative || '';

    // 气泡主题高亮
    document.querySelectorAll('.gs-bubble-theme-btn').forEach(btn => {
        btn.style.outline = '';
    });
    const activeThemeBtn = document.querySelector(`.gs-bubble-theme-btn[data-theme="${group.bubbleTheme || ''}"]`);
    if (activeThemeBtn) activeThemeBtn.style.outline = '2px solid #007aff';

    renderGsCssPresets();
    page.classList.add('show');
};

window.closeGroupSettingsPage = function () {
    const page = document.getElementById('groupSettingsPage');
    if (page) page.classList.remove('show');
};

/* =========================================
   Tab 切换
   ========================================= */
window.switchGsTab = function (tabName) {
    ['info', 'ai', 'visual', 'data'].forEach(t => {
        const btn = document.getElementById(`gs-tab-btn-${t}`);
        const pane = document.getElementById(`gs-pane-${t}`);
        if (btn) btn.classList.toggle('active', t === tabName);
        if (pane) pane.classList.toggle('active', t === tabName);
    });
};

/* =========================================
   群成员面板
   ========================================= */
window.openGroupMemberPanel = function () {
    const panel = document.getElementById('groupMemberPanel');
    if (!panel) return;
    const groupId = currentGroupSettingsId || currentChatId;
    const hiddenId = document.getElementById('gs-current-group-id');
    if (hiddenId) hiddenId.value = groupId;
    renderGroupMemberList(groupId);
    panel.classList.add('show');
};

window.closeGroupMemberPanel = function () {
    const panel = document.getElementById('groupMemberPanel');
    if (panel) panel.classList.remove('show');
};

/* =========================================
   保存群聊设置
   ========================================= */
window.saveGroupSettings = async function () {
    const groupId = currentGroupSettingsId || currentChatId;
    const group = groupsData[groupId];
    if (!group) return;

    // INFO
    const avatarUrlInput = document.getElementById('gs-group-avatar-url')?.value.trim();
    const avatarVal = document.getElementById('gs-group-avatar-val')?.value || '';
    const groupAvatarUrl = gsGroupAvatarDataUrl || avatarUrlInput || avatarVal || '';
    if (groupAvatarUrl) group.avatar = groupAvatarUrl;
    gsGroupAvatarDataUrl = null;

    const groupName = document.getElementById('gs-group-name')?.value.trim();
    if (groupName) group.name = groupName;

    group.myNickname = document.getElementById('gs-my-nickname')?.value.trim() || '';
    group.myAvatarFrame = document.getElementById('gs-my-avatar-frame')?.value.trim() || '';

    if (gsMyAvatarDataUrl) {
        group.myAvatar = gsMyAvatarDataUrl;
        gsMyAvatarDataUrl = null;
    }

    // AI
    if (!group.settings) group.settings = {};
    group.settings.bgActivityEnabled = document.getElementById('gs-bg-activity-toggle')?.checked || false;
    group.settings.bgActivityInterval = parseInt(document.getElementById('gs-bg-interval')?.value || '120');
    group.settings.memoryLimit = parseInt(document.getElementById('gs-memory-limit')?.value || '20');
    group.settings.replyMin = parseInt(document.getElementById('gs-reply-min')?.value || '1');
    group.settings.replyMax = parseInt(document.getElementById('gs-reply-max')?.value || '5');
    group.announcement = document.getElementById('gs-announcement')?.value || '';

    // Link memory
    const linkChecks = document.querySelectorAll('#gs-link-memory-container input[type="checkbox"]:checked');
    const linkedChatIds = Array.from(linkChecks).map(cb => cb.value);
    const linkMemoryDepth = parseInt(document.getElementById('gs-link-depth')?.value || '5');
    group.settings.linkMemory = {
        linkedChatIds: linkedChatIds,
        linkMemoryDepth: linkMemoryDepth
    };

    // VISUAL
    group.chatBgUrl = document.getElementById('gs-chat-bg-url')?.value.trim() || '';
    group.fontSize = parseInt(document.getElementById('gs-font-size-slider')?.value || '14');
    group.customCss = document.getElementById('gs-custom-css')?.value || '';
    group.naiPositive = document.getElementById('gs-nai-positive')?.value || '';
    group.naiNegative = document.getElementById('gs-nai-negative')?.value || '';

    await saveGroupsData();

    // 如果当前正在看这个群，应用视觉设置并更新标题
    if (currentChatId === groupId && currentChatType === 'group') {
        applyGroupVisualSettings(groupId);
        const titleEl = document.querySelector('#chatLayer .chat-header span');
        if (titleEl) {
            const memberCount = (group.members || []).length + 1;
            titleEl.innerHTML = `${group.name}<small style="font-size:9px; color:#aaa; font-weight:400; margin-left:4px;">${memberCount}人</small>`;
        }
    }

    // 全局更新聊天列表中的群名称和头像（无论是否当前在看此群）
    const listItem = document.querySelector(`.wc-chat-item[data-chat-id="${groupId}"]`);
    if (listItem) {
        const nameEl = listItem.querySelector('.wc-name');
        if (nameEl) nameEl.textContent = group.name;
        const newAvatarUrl = group.avatar || group.customAvatar || '';
        if (newAvatarUrl) {
            const avatarImg = listItem.querySelector('.wc-avatar img');
            if (avatarImg) avatarImg.src = newAvatarUrl;
        }
    }

    // 重启/停止后台活跃
    if (group.settings.bgActivityEnabled) {
        startGroupBgActivity(groupId);
    } else {
        stopGroupBgActivity(groupId);
    }

    if (typeof showToast === 'function') showToast('群聊设置已保存');
    closeGroupSettingsPage();
};

/* =========================================
   应用群聊视觉设置
   ========================================= */
function applyGroupVisualSettings(groupId) {
    const group = groupsData[groupId];
    if (!group) return;

    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.style.backgroundImage = group.chatBgUrl ? `url(${group.chatBgUrl})` : '';
        chatMessages.style.backgroundSize = 'cover';
        chatMessages.style.backgroundPosition = 'center';
    }

    let styleEl = document.getElementById('group-custom-css-style');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'group-custom-css-style';
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = group.customCss || '';

    const chatLayer = document.getElementById('chatLayer');
    if (chatLayer) {
        chatLayer.className = chatLayer.className.replace(/\bbubble-theme-\S+/g, '').trim();
        if (group.bubbleTheme) {
            chatLayer.classList.add(`bubble-theme-${group.bubbleTheme}`);
        }
    }
}

/* =========================================
   气泡主题选择
   ========================================= */
window.selectGsBubbleTheme = function (theme, btn) {
    document.querySelectorAll('.gs-bubble-theme-btn').forEach(b => { b.style.outline = ''; });
    if (btn) btn.style.outline = '2px solid #007aff';
    const groupId = currentGroupSettingsId || currentChatId;
    if (groupsData[groupId]) groupsData[groupId].bubbleTheme = theme;
};

/* =========================================
   头像上传
   ========================================= */
let gsGroupAvatarDataUrl = null;
let gsMyAvatarDataUrl = null;

window.handleGsGroupAvatarUpload = function (input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target.result;
        gsGroupAvatarDataUrl = dataUrl;
        const img = document.getElementById('gs-group-avatar-img');
        const placeholder = document.getElementById('gs-group-avatar-placeholder');
        const val = document.getElementById('gs-group-avatar-val');
        if (img) { img.src = dataUrl; img.style.display = 'block'; }
        if (placeholder) placeholder.style.display = 'none';
        if (val) val.value = dataUrl;
        const urlInput = document.getElementById('gs-group-avatar-url');
        if (urlInput) urlInput.value = '';
    };
    reader.readAsDataURL(file);
};

window.handleGsMyAvatarUpload = function (input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target.result;
        gsMyAvatarDataUrl = dataUrl;
        const img = document.getElementById('gs-my-avatar-img');
        const placeholder = document.getElementById('gs-my-avatar-placeholder');
        if (img) { img.src = dataUrl; img.style.display = 'block'; }
        if (placeholder) placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
};

window.handleGsChatBgUpload = function (input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const urlInput = document.getElementById('gs-chat-bg-url');
        if (urlInput) urlInput.value = e.target.result;
    };
    reader.readAsDataURL(file);
};

/* =========================================
   CSS 预设
   ========================================= */
const GS_CSS_PRESETS_KEY = 'myCoolPhone_gsCssPresets';

function renderGsCssPresets() {
    const container = document.getElementById('gs-css-presets-list');
    if (!container) return;
    try {
        const presets = JSON.parse(localStorage.getItem(GS_CSS_PRESETS_KEY) || '[]');
        container.innerHTML = '';
        presets.forEach((preset) => {
            const btn = document.createElement('button');
            btn.style.cssText = 'background:#f5f5f7;border:none;border-radius:8px;padding:4px 10px;font-size:11px;cursor:pointer;';
            btn.textContent = preset.name;
            btn.onclick = () => {
                const textarea = document.getElementById('gs-custom-css');
                if (textarea) textarea.value = preset.css;
            };
            container.appendChild(btn);
        });
    } catch (e) {}
}

window.saveGsCssPreset = function () {
    const css = document.getElementById('gs-custom-css')?.value || '';
    if (!css.trim()) { if (typeof showToast === 'function') showToast('CSS 为空'); return; }
    const name = prompt('预设名称：');
    if (!name) return;
    try {
        const presets = JSON.parse(localStorage.getItem(GS_CSS_PRESETS_KEY) || '[]');
        presets.push({ name, css });
        localStorage.setItem(GS_CSS_PRESETS_KEY, JSON.stringify(presets));
        renderGsCssPresets();
        if (typeof showToast === 'function') showToast('预设已保存');
    } catch (e) {}
};

window.exportGsCss = function () {
    const css = document.getElementById('gs-custom-css')?.value || '';
    if (!css.trim()) { if (typeof showToast === 'function') showToast('CSS 为空'); return; }
    const blob = new Blob([css], { type: 'text/css' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'group_custom.css';
    a.click();
    URL.revokeObjectURL(url);
};

/* =========================================
   Link Memory 列表渲染
   ========================================= */
function renderGsLinkMemoryList(group) {
    const container = document.getElementById('gs-link-memory-container');
    if (!container) return;
    container.innerHTML = '';
    
    const linkMemory = (group.settings && group.settings.linkMemory) || {};
    // 兼容旧版 linkMemoryIds
    const linkedIds = linkMemory.linkedChatIds || (group.settings && group.settings.linkMemoryIds) || [];
    const depth = linkMemory.linkMemoryDepth || 5;

    // 获取除自己外的所有聊天（单聊+群聊）
    const allChats = [];
    Object.keys(friendsData).forEach(id => {
        const f = friendsData[id];
        if (!f || f.blocked) return;
        allChats.push({ id, name: f.remark || f.realName || id, avatar: f.avatar });
    });
    Object.keys(groupsData).forEach(gId => {
        if (gId === group.id) return;
        const g = groupsData[gId];
        if (!g) return;
        allChats.push({ id: gId, name: g.name, avatar: g.avatar || g.customAvatar, isGroup: true });
    });

    allChats.forEach(chat => {
        const item = document.createElement('label');
        item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;font-size:12px;background:#fafafa;border-radius:10px;margin-bottom:6px;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = chat.id;
        cb.checked = linkedIds.includes(chat.id);
        const avatar = document.createElement('img');
        avatar.src = chat.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(chat.name)}`;
        avatar.style.cssText = 'width:28px;height:28px;border-radius:50%;object-fit:cover;background:#eee;';
        const span = document.createElement('span');
        span.style.cssText = 'font-size:13px;font-weight:600;color:#333;';
        span.textContent = chat.name + (chat.isGroup ? ' (群聊)' : '');
        item.appendChild(cb);
        item.appendChild(avatar);
        item.appendChild(span);
        container.appendChild(item);
    });

    if (container.children.length === 0) {
        container.innerHTML = '<div style="color:#ccc;font-size:12px;text-align:center;padding:15px;">暂无可选聊天</div>';
    } else {
        const depthContainer = document.createElement('div');
        depthContainer.style.cssText = 'margin-top:10px;';
        depthContainer.innerHTML = `
            <label style="font-size:12px;font-weight:600;color:#555;">互通条数 (最近N条)</label>
            <input type="number" id="gs-link-depth" value="${depth}" min="1" max="20"
                   style="width:80px;margin-left:10px;text-align:center;border:1px solid #eee;border-radius:8px;padding:4px 8px;">
        `;
        container.appendChild(depthContainer);
    }
}

/* =========================================
   聊天记录操作
   ========================================= */
window.exportGroupChatHistory = async function () {
    const groupId = currentGroupSettingsId || currentChatId;
    const history = await loadChatHistory(groupId);
    if (!history || history.length === 0) {
        if (typeof showToast === 'function') showToast('没有聊天记录');
        return;
    }
    const group = groupsData[groupId];
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${group ? group.name : groupId}_chat_history.json`;
    a.click();
    URL.revokeObjectURL(url);
};

window.importGroupChatHistory = function (input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!Array.isArray(data)) { alert('格式错误：需要 JSON 数组'); return; }
            const groupId = currentGroupSettingsId || currentChatId;
            if (!confirm(`将导入 ${data.length} 条记录，会覆盖现有记录，确定吗？`)) return;
            await IDB.set(scopedChatKey(groupId), data);
            if (typeof showToast === 'function') showToast('导入成功');
            input.value = '';
        } catch (err) {
            alert('导入失败：' + err.message);
        }
    };
    reader.readAsText(file);
};

window.clearGroupChatHistory = async function () {
    const groupId = currentGroupSettingsId || currentChatId;
    const group = groupsData[groupId];
    if (!confirm(`确定清空 "${group ? group.name : ''}" 的所有聊天记录吗？此操作不可恢复！`)) return;
    await IDB.set(scopedChatKey(groupId), []);
    if (groupsData[groupId]) {
        groupsData[groupId].lastMessage = '';
        await saveGroupsData();
    }
    if (currentChatId === groupId && currentChatType === 'group') {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) chatMessages.innerHTML = '';
    }
    if (typeof showToast === 'function') showToast('聊天记录已清空');
};

/* =========================================
   群聊搜索
   ========================================= */
window.openGroupChatSearch = function () {
    const page = document.getElementById('groupChatSearchPage');
    if (!page) return;
    const keyword = document.getElementById('gs-search-keyword');
    if (keyword) keyword.value = '';
    const dateInput = document.getElementById('gs-search-date');
    if (dateInput) dateInput.value = '';
    const results = document.getElementById('gs-search-results');
    if (results) results.innerHTML = '<div style="text-align:center;color:#ccc;font-size:13px;padding:40px 0;"><i class="fas fa-search" style="font-size:32px;margin-bottom:10px;display:block;opacity:0.3;"></i>输入关键词开始搜索</div>';
    page.classList.add('show');
};

window.closeGroupChatSearch = function () {
    const page = document.getElementById('groupChatSearchPage');
    if (page) page.classList.remove('show');
};

window.performGroupChatSearch = async function () {
    const keyword = (document.getElementById('gs-search-keyword')?.value || '').trim().toLowerCase();
    const speaker = document.getElementById('gs-search-speaker')?.value || 'all';
    const date = document.getElementById('gs-search-date')?.value || '';
    const groupId = currentGroupSettingsId || currentChatId;
    const history = await loadChatHistory(groupId);
    const results = document.getElementById('gs-search-results');
    if (!results) return;

    let filtered = history || [];
    if (keyword) filtered = filtered.filter(m => (m.text || '').toLowerCase().includes(keyword));
    if (speaker === 'sent') filtered = filtered.filter(m => m.type === 'sent');
    else if (speaker === 'received') filtered = filtered.filter(m => m.type === 'received');
    if (date) {
        filtered = filtered.filter(m => {
            if (!m.id) return false;
            const parts = m.id.split('_');
            const ts = parts.map(p => parseInt(p)).find(n => n > 1000000000000);
            if (!ts) return false;
            return new Date(ts).toISOString().startsWith(date);
        });
    }

    if (filtered.length === 0) {
        results.innerHTML = '<div style="text-align:center;color:#bbb;padding:30px;font-size:13px;">没有找到相关消息</div>';
        return;
    }

    results.innerHTML = filtered.map(m => {
        const sender = m.type === 'sent' ? '我' : (m.senderName || 'AI');
        const text = (m.text || '').substring(0, 120).replace(/</g, '&lt;');
        return `<div style="padding:12px;background:#fff;border-radius:12px;margin-bottom:8px;box-shadow:0 1px 4px rgba(0,0,0,0.05);">
            <div style="font-size:11px;color:#999;margin-bottom:4px;">${sender}</div>
            <div style="font-size:13px;color:#333;">${text}</div>
        </div>`;
    }).join('');
};

/* =========================================
   创建新群成员 Modal
   ========================================= */
window.openCreateNewMemberModal = function () {
    const modal = document.getElementById('gs-create-member-modal');
    if (!modal) return;
    const nameInput = document.getElementById('cnm-name');
    const avatarUrl = document.getElementById('cnm-avatar-url');
    const persona = document.getElementById('cnm-persona');
    const preview = document.getElementById('cnm-avatar-preview-img');
    if (nameInput) nameInput.value = '';
    if (avatarUrl) avatarUrl.value = '';
    if (persona) persona.value = '';
    if (preview) { preview.src = ''; preview.style.display = 'none'; }
    modal.classList.add('active');
};

window.closeCreateNewMemberModal = function () {
    document.getElementById('gs-create-member-modal')?.classList.remove('active');
};

window.handleCnmAvatarUpload = function (input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target.result;
        const urlInput = document.getElementById('cnm-avatar-url');
        const preview = document.getElementById('cnm-avatar-preview-img');
        if (urlInput) urlInput.value = dataUrl;
        if (preview) { preview.src = dataUrl; preview.style.display = 'block'; }
    };
    reader.readAsDataURL(file);
};

window.confirmCreateNewMember = async function () {
    const groupId = currentGroupSettingsId || currentChatId;
    const group = groupsData[groupId];
    if (!group) return;

    const name = document.getElementById('cnm-name')?.value.trim();
    if (!name) { alert('请输入成员名字'); return; }
    const avatarUrl = document.getElementById('cnm-avatar-url')?.value.trim() ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;
    const persona = document.getElementById('cnm-persona')?.value.trim() || '';

    // 作为专属NPC写入friendsData（使用临时ID）
    const npcId = 'npc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    friendsData[npcId] = {
        realName: name,
        remark: name,
        avatar: avatarUrl,
        persona: persona,
        isNPC: true
    };
    await saveFriendsData();

    if (!group.members) group.members = [];
    group.members.push(npcId);
    await saveGroupsData();

    closeCreateNewMemberModal();
    renderGroupMemberList(groupId);

    const sysMsg = `${name} 加入了群聊`;
    if (currentChatId === groupId && currentChatType === 'group') {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            const div = document.createElement('div');
            div.style.cssText = 'text-align:center; margin:8px 0;';
            div.innerHTML = `<span style="background:rgba(0,0,0,0.04); padding:3px 10px; border-radius:4px; font-size:11px; color:#999;">${sysMsg}</span>`;
            chatMessages.appendChild(div);
        }
    }
    await saveMessageToHistory(groupId, { text: sysMsg, type: 'system' });
    if (typeof showToast === 'function') showToast(`${name} 已加入群聊`);
};

/* =========================================
   AI 生成成员 Modal
   ========================================= */
window.openAiGenerateMembersModal = function () {
    const modal = document.getElementById('gs-ai-generate-modal');
    if (!modal) return;
    const countInput = document.getElementById('agm-count');
    const promptInput = document.getElementById('agm-prompt');
    if (countInput) countInput.value = '5';
    if (promptInput) promptInput.value = '';
    modal.classList.add('active');
};

window.closeAiGenerateMembersModal = function () {
    document.getElementById('gs-ai-generate-modal')?.classList.remove('active');
};

window.confirmAiGenerateMembers = async function () {
    const groupId = currentGroupSettingsId || currentChatId;
    const group = groupsData[groupId];
    if (!group) return;

    const count = parseInt(document.getElementById('agm-count')?.value || '5');
    const promptText = document.getElementById('agm-prompt')?.value.trim() || '一群普通的年轻人';

    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    if (!settingsJSON) { alert('请先配置 API'); return; }
    const settings = JSON.parse(settingsJSON);

    const confirmBtn = document.getElementById('agm-confirm-btn');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...'; }

    try {
        let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
        const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

        let existingMembersInfo = '';
        if (group.members && group.members.length > 0) {
            existingMembersInfo = '\n[当前群聊已有成员人设]:\n';
            for (const memberId of group.members) {
                const mem = friendsData[memberId];
                if (mem) {
                    existingMembersInfo += `- ${mem.remark || mem.realName}: ${mem.persona || '无'}\n`;
                }
            }
        }
        const wbData = (typeof constructWorldInfoPrompt === 'function')
            ? constructWorldInfoPrompt('', groupId)
            : { before_char: '', after_char: '', depth_items: [] };
        const worldInfoText = [wbData.before_char, wbData.after_char, ...(wbData.depth_items||[]).map(i=>i.content)].filter(Boolean).join('\n\n');

        const systemPrompt = `请生成 ${count} 个群聊成员，场景：${promptText}。
${worldInfoText ? `\n[世界观设定]:\n${worldInfoText}\n` : ''}${existingMembersInfo}
请根据上述世界观和已有成员的人设，生成符合设定和群体氛围的新成员。
每个成员输出JSON格式：{"name":"名字","persona":"性格与背景（50字以内）","avatar":"（留空）"}
只输出JSON数组，无多余文字。`;

        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
            body: JSON.stringify({ model: settings.model, messages: [{ role: 'user', content: systemPrompt }], temperature: 0.9 })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        let rawReply = (data?.choices?.[0]?.message?.content || '[]').replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        let members = [];
        try { members = JSON.parse(rawReply); } catch (e) { throw new Error('JSON解析失败'); }

        if (!group.members) group.members = [];
        let addedCount = 0;
        for (const m of members) {
            if (!m.name) continue;
            const npcId = 'npc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(m.name)}`;
            friendsData[npcId] = {
                realName: m.name,
                remark: m.name,
                avatar: avatarUrl,
                persona: m.persona || '',
                isNPC: true
            };
            group.members.push(npcId);
            addedCount++;
        }
        await saveFriendsData();
        await saveGroupsData();

        closeAiGenerateMembersModal();
        renderGroupMemberList(groupId);
        if (typeof showToast === 'function') showToast(`已添加 ${addedCount} 位成员`);
    } catch (err) {
        alert('生成失败：' + err.message);
    } finally {
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerHTML = '<i class="fas fa-magic"></i> 开始生成'; }
    }
};

console.log('[app_groupchat.js] 群聊模块已加载');

/* =========================================
   群聊线下模式 (Group Offline Mode) V1.0
   仿照单聊线下模式，支持多角色叙事
   ========================================= */

// ── 拦截 openOfflineMode：群聊时走群聊专属版本 ──
(function () {
    const _origOpen = window.openOfflineMode;
    window.openOfflineMode = function () {
        if (currentChatType === 'group') {
            openGroupOfflineMode();
            return;
        }
        if (typeof _origOpen === 'function') _origOpen();
    };
})();

// ── 拦截 sendOfflineMessage：群聊时走群聊专属版本 ──
(function () {
    const _origSend = window.sendOfflineMessage;
    window.sendOfflineMessage = async function (isRegen = false) {
        if (currentChatType === 'group') {
            return await sendGroupOfflineMessage(isRegen);
        }
        if (typeof _origSend === 'function') return await _origSend(isRegen);
    };
})();

/* ─── 打开群聊线下模式 ─── */
window.openGroupOfflineMode = function () {
    if (!currentChatId || currentChatType !== 'group') return;
    const group = groupsData[currentChatId];
    if (!group) return;

    // 关闭加号面板
    const panel = document.getElementById('chat-extra-panels');
    if (panel) panel.classList.remove('open');

    const modal = document.getElementById('offlineModeView');
    if (!modal) return;

    // 设置头部标题
    const nameEl = document.getElementById('offline-char-name');
    if (nameEl) nameEl.innerText = group.name;

    // 设置背景：优先群头像，其次第一位成员头像，再次用文字头像
    const bgLayer = document.getElementById('offline-bg-layer');
    if (bgLayer) {
        const bgUrl = group.avatar || group.customAvatar || '';
        if (bgUrl) {
            bgLayer.style.backgroundImage = `url('${bgUrl}')`;
        } else {
            const firstId = (group.members || [])[0];
            const firstMem = firstId ? friendsData[firstId] : null;
            const fallback = (firstMem && firstMem.avatar)
                ? firstMem.avatar
                : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(group.name)}&backgroundColor=cccccc`;
            bgLayer.style.backgroundImage = `url('${fallback}')`;
        }
    }

    // 渲染历史
    renderGroupOfflineHistory(currentChatId);

    // 应用线下模式自定义背景（与单聊线下模式保持一致）
    if (typeof applyOfflineVisuals === 'function') applyOfflineVisuals();

    modal.classList.add('show');

    // 同步工具栏按钮状态（与单聊线下模式保持一致）
    const dmBtn = document.getElementById('offline-danmaku-btn');
    if (dmBtn) dmBtn.innerText = `弹幕: ${(typeof isDanmakuOn !== 'undefined' && isDanmakuOn) ? 'ON' : 'OFF'}`;

    const optBtn = document.getElementById('offline-options-btn');
    if (optBtn) optBtn.innerText = `选项分支: ${(typeof isOfflineOptionsOn !== 'undefined' && isOfflineOptionsOn) ? 'ON' : 'OFF'}`;
};

/* ─── 渲染群聊线下历史 ─── */
async function renderGroupOfflineHistory(groupId) {
    const container = document.getElementById('offline-log-container');
    if (!container) return;

    // 确保弹幕区存在（与单聊线下保持结构一致）
    if (!container.querySelector('.offline-danmaku-area')) {
        container.insertAdjacentHTML('beforeend', `
            <div class="offline-danmaku-area">
                <div class="danmaku-area-header">REAL-TIME COMMENTS</div>
                <div id="offline-danmaku-log"></div>
            </div>
        `);
    }

    // 清除旧的剧情条目，但保留弹幕区
    container.querySelectorAll('.offline-entry').forEach(el => el.remove());
    document.getElementById('vn-options-box')?.remove();

    const dmLog = document.getElementById('offline-danmaku-log');
    if (dmLog) dmLog.innerHTML = '';

    const group = groupsData[groupId];
    const history = await loadChatHistory(groupId);

    if (currentChatId !== groupId || currentChatType !== 'group') return;

    if (!history || history.length === 0) {
        // 显示聚会开场提示
        const memberNames = (group.members || []).slice(0, 4).map(id => {
            const f = friendsData[id];
            return f ? (f.remark || f.realName) : id;
        }).join('、');
        const extra = (group.members || []).length > 4 ? ` 等${(group.members || []).length}人` : '';
        _appendGroupOfflineSystemEntry(`✨ 大家相聚在一起：${memberNames}${extra}`);
    } else {
        history.forEach(msg => {
            if (!msg.isOffline) return;
            if (msg.type === 'system') {
                _appendGroupOfflineSystemEntry(msg.text);
                return;
            }
            const role = msg.type === 'sent' ? 'user' : 'ai';
            const name = role === 'user' ? '你' : (msg.senderName || 'AI');
            appendGroupOfflineEntry(role, msg.text, name, msg.id, msg.customAvatar);
        });
    }

    setTimeout(() => { container.scrollTop = container.scrollHeight; }, 100);
}

/* ─── 添加系统提示行 ─── */
function _appendGroupOfflineSystemEntry(text) {
    const container = document.getElementById('offline-log-container');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'offline-entry system';
    div.innerHTML = `<div class="oe-text" style="text-align:center;color:#aaa;font-size:12px;font-style:italic;padding:6px 0;">${
        (text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
    }</div>`;
    const dmArea = container.querySelector('.offline-danmaku-area');
    if (dmArea) container.insertBefore(div, dmArea);
    else container.appendChild(div);
}

/* ─── 添加一条群聊线下条目（带头像，可修改/删除/重试） ─── */
function appendGroupOfflineEntry(role, text, name, msgId, avatarUrl) {
    const container = document.getElementById('offline-log-container');
    if (!container) return;

    const safeId = msgId || ('grp_off_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));

    const div = document.createElement('div');
    div.className = `offline-entry ${role}`;
    div.setAttribute('data-msg-id', safeId);

    // 补全 AI 头像
    if (!avatarUrl && role === 'ai') {
        const group = groupsData[currentChatId];
        if (group) {
            const mem = findMemberByName(name, group.members);
            avatarUrl = (mem && mem.avatar)
                ? mem.avatar
                : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;
        } else {
            avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;
        }
    }

    // 格式化文本：*动作* → 斜体，「对话」→ 加粗
    const formattedText = (text || '')
        .replace(/\*(.*?)\*/g, '<i>*$1*</i>')
        .replace(/「(.*?)」/g, '<b>「$1」</b>')
        .replace(/\n/g, '<br>');

    // 操作按钮（与单聊线下模式保持一致）
    const actionsHtml = `
        <div class="oe-actions">
            <div class="oe-btn" onclick="regenerateOfflineMessage('${safeId}')" title="重试/重回">
                <i class="fas fa-sync-alt"></i>
            </div>
            <div class="oe-btn" onclick="openModifyOffline('${safeId}')" title="修改">
                <i class="fas fa-pen"></i>
            </div>
            <div class="oe-btn delete" onclick="deleteOfflineMsgUI('${safeId}')" title="删除">
                <i class="fas fa-trash"></i>
            </div>
        </div>`;

    if (role === 'ai') {
        // AI 条目：显示头像 + 角色名
        const avatarHtml = avatarUrl
            ? `<img src="${avatarUrl}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid rgba(255,255,255,0.5);" onerror="this.style.display='none'">`
            : '';
        div.innerHTML = `
            <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px;">
                ${avatarHtml}
                <div class="oe-name" style="font-size:11px;font-weight:700;letter-spacing:0.5px;">${name}</div>
            </div>
            <div class="oe-text serif">${formattedText}</div>
            ${actionsHtml}`;
    } else {
        // 用户条目：与单聊线下模式相同
        div.innerHTML = `
            <div class="oe-name">你</div>
            <div class="oe-text">${formattedText}</div>
            ${actionsHtml}`;
    }

    const dmArea = container.querySelector('.offline-danmaku-area');
    if (dmArea) container.insertBefore(div, dmArea);
    else container.appendChild(div);

    container.scrollTop = container.scrollHeight;
}

/* ─── 群聊线下模式 · 发送/生成 ─── */
async function sendGroupOfflineMessage(isRegen = false) {
    // ── 停止生成按钮逻辑 ──
    const sendBtn = document.querySelector('.offline-send-btn');
    if (sendBtn && sendBtn.classList.contains('sending')) {
        if (typeof currentAiController !== 'undefined' && currentAiController) {
            currentAiController.abort();
            currentAiController = null;
            if (typeof showToast === 'function') showToast('已停止生成');
        }
        return;
    }

    // 中止旧请求
    if (typeof currentAiController !== 'undefined' && currentAiController) {
        currentAiController.abort();
    }
    if (typeof AbortController !== 'undefined') {
        window.currentAiController = new AbortController();
    }

    // 【竞态修复】捕获目标群聊 ID
    const targetGroupId = currentChatId;
    const group = groupsData[targetGroupId];
    if (!group) return;

    // 清空弹幕区
    if (typeof hideOfflineDanmakuArea === 'function') hideOfflineDanmakuArea(true);

    const input = document.getElementById('offline-input');
    let userText = (input ? input.value.trim() : '') || (!isRegen ? '*静静地等待大家的反应*' : '');
    
    // 【新增】解析【】内的指令，将其作为系统提示词注入
    let userInstruction = "";
    const instructionRegex = /【(.*?)】/g;
    let match;
    while ((match = instructionRegex.exec(userText)) !== null) {
        userInstruction += match[1] + " ";
    }
    
    // 清除正文中的【】内容
    let cleanText = userText.replace(instructionRegex, '').trim();

    const isLookingAtThisGroupOffline = () => document.getElementById('offlineModeView')?.classList.contains('show') && currentChatId === targetGroupId && currentChatType === 'group';

    // 上屏用户输入
    if (!isRegen && userText) {
        const userMsgId = 'grp_off_u_' + Date.now();
        if (isLookingAtThisGroupOffline()) {
            appendGroupOfflineEntry('user', userText, '你', userMsgId, null);
        }
        await saveMessageToHistory(targetGroupId, {
            id: userMsgId, text: userText, type: 'sent',
            senderName: 'ME', isOffline: true
        });
    }
    if (input) input.value = '';

    // 检查 API 配置
    const settingsJSON = localStorage.getItem(typeof SETTINGS_KEY !== 'undefined' ? SETTINGS_KEY : 'myCoolPhone_aiSettings');
    if (!settingsJSON) {
        if (typeof showAiErrorModal === 'function')
            showAiErrorModal('群聊线下模式无法生成', '请先在 Settings → AI Chat 配置 API Key / Base URL / Model');
        return;
    }
    const settings = JSON.parse(settingsJSON);

    // ── 用户人设 ──
    const me = personasMeta[currentPersonaId];
    const myName = group.myNickname || (me ? me.name : '我') || '用户';
    
    let presetPrompt = '';
    if (typeof currentSystemPresetId !== 'undefined' && currentSystemPresetId && typeof systemPresets !== 'undefined' && systemPresets[currentSystemPresetId]) {
        const preset = systemPresets[currentSystemPresetId];
        presetPrompt = `[系统预设 (遵循)]\n${preset.systemPrompt || ''}\n`;
        if (preset.jailbreakPrompt) {
            presetPrompt += `[强制指令]\n${preset.jailbreakPrompt}\n`;
        }
    }
    
    const myPersonaStr = `${presetPrompt}[你的身份 (群主/用户)]\n- 群昵称: ${myName}\n- 专属人设: ${(me && me.persona) ? me.persona : '普通用户'}\n[防出戏死命令]: 你绝对不能扮演用户（${myName}），严禁以用户的名字生成对话！`;

    const safeParseMacros = (str, charName) => {
        if (!str) return '';
        return String(str).replace(/{{char}}/gi, charName || '助手').replace(/{{user}}/gi, myName);
    };

    // ── 构建成员人设 ──
    const allMemberIds = group.members || [];
    const activeMemberIds = allMemberIds.filter(id => !((group.mutedMembers || []).includes(id)));
    const dispatched = smartDispatchMembers(activeMemberIds, [], userText);

    let membersInfo = '';
    for (const memberId of allMemberIds) {
        const mem = friendsData[memberId];
        if (!mem) continue;
        
        const isMuted = (group.mutedMembers || []).includes(memberId);
        const isAdmin = (group.admins || []).includes(memberId);
        const customTitle = (group.memberTitles || {})[memberId];
        
        let tags = [];
        if (isAdmin) tags.push('管理员');
        if (customTitle) tags.push(`头衔:${customTitle}`);
        if (isMuted) tags.push('已被禁言，禁止让他发言');
        else if (!dispatched.includes(memberId)) tags.push('当前潜水中，尽量不发言');
        
        const tagStr = tags.length > 0 ? ` [${tags.join(' | ')}]` : '';
        
        const shard = dispatched.includes(memberId) ? await getShardedMemoryForMember(memberId, targetGroupId, []) : null;
        const shardNote = shard ? `\n  [私人记忆]: ${shard}` : '';
        
        membersInfo += `- 本名: ${mem.realName || memberId}，群昵称: ${mem.remark || mem.realName}${tagStr}\n  人设: ${safeParseMacros(mem.persona || '普通的聚会成员', mem.realName || '助手')}${shardNote}\n---\n`;
    }

    // ── 历史记录 ──
    const history = await loadChatHistory(targetGroupId);
    const recentOffline = history.slice(-20);
    let historyText = '';
    recentOffline.forEach(m => {
        if (m.type === 'system') return;
        const sender = m.type === 'sent' ? myName : (m.senderName || 'AI');
        
        let timeStr = '';
        let msgTs = m.timestamp || (m.id ? parseInt(m.id.split('_').pop(), 10) : 0);
        if (!msgTs || isNaN(msgTs) || msgTs < 1000000000000) msgTs = Date.now();
        const d = new Date(msgTs);
        timeStr = `[${d.getMonth()+1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}] `;
        
        let content = m.text || '';
        
        // 【新增】处理历史消息中的【】指令
        if (m.type === 'sent' && content.includes('【') && content.includes('】')) {
            content = content.replace(/【(.*?)】/g, '\n[System: User Instruction - $1]\n');
        }
        
        if (m.isImage) content = '[图片]';
        else if (m.isEmoji) content = `[发送了一个表情: ${m.emojiName || '表情'}]`;
        else if (m.isRevoked) content = '[用户撤回了一条消息，你不知道内容，但你可以对此做出反应]';
        else content = content.substring(0, 200); // 稍微放宽一点限制，以容纳较长的指令

        historyText += `${timeStr}${sender}: ${content}\n`;
    });

    // ── 获取当前场景地点 ──
    let currentLocation = '线下聚会中';
    for (const id of dispatched) {
        const mem = friendsData[id];
        if (mem && mem.mindState && mem.mindState.location && mem.mindState.location !== '未知地点') {
            currentLocation = mem.mindState.location;
            break;
        }
    }

    // ── 世界书 ──
    const wbData = (typeof constructWorldInfoPrompt === 'function')
        ? constructWorldInfoPrompt(userText, targetGroupId)
        : { before_char: '', after_char: '', depth_items: [] };
    const worldInfoText = wbData.before_char;

    // ── 字数限制 ──
    const maxLen = parseInt((typeof offlineConfig !== 'undefined' && offlineConfig.maxLength) || 200);
    const perCharLen = Math.max(60, Math.round(maxLen / Math.max(dispatched.length, 1)));

    // ── 群公告 ──
    const announcementStr = group.announcement ? `\n[群公告（最高优先级，所有人必须遵守）]: ${group.announcement}` : '';

    // ── 长期记忆 ──
    const longTermMemoryStr = group.longTermSummary ? `\n[长期记忆摘要]\n${group.longTermSummary}` : '';

    // ── 外部情报 ──
    let linkedMemoryCtx = '';
    if (typeof buildLinkedMemoryContext === 'function') {
        const rawLinked = await buildLinkedMemoryContext(group.settings, targetGroupId);
        if (rawLinked) {
            linkedMemoryCtx = `\n[仅 AI 可见的附加上下文（情报）]\n${rawLinked}`;
        }
    }

    let writingStyleText = '';
    if (typeof offlineConfig !== 'undefined' && offlineConfig.writingStyle) {
        writingStyleText = offlineConfig.writingStyle;
    } else {
        writingStyleText = "采用写实的群像文风。聚焦多角色场景下的自然交互，严格遵循各自人设与说话习惯，体现角色间的互动。通过简练的动作与神态穿插来推进群聊画面。对话要符合多人聊天的真实节奏与临场感。";
    }

    const systemPrompt = `[系统：群体线下聚会叙事引擎 V1.0]
你正在模拟一场多人共同参与的真实线下聚会。你的任务是扮演且仅能扮演下述【群成员花名册】中未被禁言的NPC，每个角色的语气必须符合其人设。
当前地点：【${currentLocation}】
在场总人数：${allMemberIds.length} 人

[群成员花名册]
${membersInfo || '（暂无成员信息）'}

${myPersonaStr}
${announcementStr}
${worldInfoText ? `\n[核心世界观设定]\n${worldInfoText}` : ''}
${longTermMemoryStr}${linkedMemoryCtx}
\n[文风要求]\n${writingStyleText}

[近期线下互动记录]
${historyText || '（刚刚开始聚会）'}

[核心叙事规则 — 严格遵守]
1. 【多角色参与】：必须让2-4个未潜水成员参与互动，允许相互呼应与打断，体现真实聚会感。
2. 【沉浸叙事】：用 *星号* 包裹动作/肢体语言，用 「」 包裹直接对话，不能只有台词。动作描写和台词要自然混用，但【禁止使用过长的复合句】。
3. 【场景融入】：叙事要自然融入当前场景（${currentLocation}），注意灯光/声音/空间感。
4. 【篇幅与句式控制】：
   - 每位角色视当前剧情自然叙事即可，总长度建议不超过${maxLen}字。
   - 【严禁堆砌逗号】，每个角色的回复中，动作描写或长句必须多用句号“。”进行断句，保持清爽的节奏感。
   - 该停顿时自然结束，无需凑字数。
5. 【输出格式】：必须输出纯 JSON 数组，每项格式：{"name":"角色名","content":"叙事正文"}
   - 不要在 JSON 数组外添加任何多余文字。
6. 【防出戏死命令】：你绝对不能扮演用户（${myName}），严禁生成用户的对话！

${userInstruction ? `\n[System: User Instruction - ${userInstruction.trim()}]\n` : ''}
用户（${myName}）刚才说/做了："${cleanText}"
请生成本次聚会的多角色沉浸叙事（纯 JSON 数组）：`;

    // ── Loading 条目 ──
    const container = document.getElementById('offline-log-container');
    const loadingId = 'grp_loading_' + Date.now();
    const loadingDiv = document.createElement('div');
    loadingDiv.id = loadingId;
    loadingDiv.className = 'offline-entry ai';
    loadingDiv.innerHTML = `<div class="oe-text"><i class="fas fa-circle-notch fa-spin" style="margin-right:6px;"></i>群友们正在行动中…</div>`;
    const dmAreaEl = container.querySelector('.offline-danmaku-area');
    if (dmAreaEl) container.insertBefore(loadingDiv, dmAreaEl);
    else container.appendChild(loadingDiv);

    if (sendBtn) {
        sendBtn.classList.add('sending');
        sendBtn.innerHTML = '<i class="fas fa-stop"></i>';
    }

    let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
    const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

    // 历史上下文（只传线下消息）
    const contextMsgs = recentOffline.slice(-10).map(m => ({
        role: m.type === 'sent' ? 'user' : 'assistant',
        content: (m.text || '').substring(0, 150)
    }));

    try {
        let finalMessages = [
            { role: 'system', content: systemPrompt },
            ...contextMsgs
        ];
        
        if (wbData.after_char) {
            finalMessages.push({ role: 'system', content: wbData.after_char });
        }
        
        finalMessages.push({ role: 'user', content: cleanText || '（继续）' });
        
        if (wbData.depth_items && wbData.depth_items.length > 0) {
            wbData.depth_items.sort((a, b) => b.depth - a.depth);
            wbData.depth_items.forEach(item => {
                const depth = parseInt(item.depth) || 2;
                const insertIndex = Math.max(0, finalMessages.length - depth);
                finalMessages.splice(insertIndex, 0, { role: "system", content: item.content });
            });
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify({
                model: settings.model,
                messages: finalMessages,
                temperature: parseFloat(settings.temperature || 0.9),
                max_tokens: Math.max(maxLen * 4, 1200)
            }),
            signal: (typeof currentAiController !== 'undefined' && currentAiController)
                ? currentAiController.signal : undefined
        });

        document.getElementById(loadingId)?.remove();
        if (sendBtn) {
            sendBtn.classList.remove('sending');
            sendBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
        }

        const resText = await response.clone().text().catch(() => '');
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}\n\n${resText}`);

        let data;
        try { data = await response.json(); }
        catch (e) { throw new Error(`响应不是 JSON\n\n${resText}`); }

        let rawReply = (data?.choices?.[0]?.message?.content || '').trim();
        if (!rawReply) {
            if (typeof showAiErrorModal === 'function')
                showAiErrorModal('群聊线下生成空回', 'choices[0].message.content 为空');
            return;
        }

        // ── 清理 Markdown ──
        rawReply = rawReply.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

        let messages = [];

        try {
            const aiData = JSON.parse(rawReply);
            
            if (aiData.messages && Array.isArray(aiData.messages)) {
                messages = aiData.messages;
            } else if (Array.isArray(aiData)) {
                messages = aiData;
            }

        } catch (e) {
            console.warn('群聊线下模式 JSON 解析失败，尝试备用解析逻辑:', rawReply);

            try {
                messages = JSON.parse(rawReply);
                if (!Array.isArray(messages)) messages = [];
            } catch (e2) {
                rawReply.split('\n').forEach(line => {
                    line = line.trim();
                    const m = line.match(/^([^:：\[{]+)[:：](.*)/);
                    if (m && m[2].trim() && !line.startsWith('{') && !line.startsWith('[')) {
                        messages.push({ name: m[1].trim(), content: m[2].trim() });
                    }
                });
            }
        }

        if (messages.length === 0) {
            if (typeof showAiErrorModal === 'function')
                showAiErrorModal('群聊线下解析失败', `无法从以下内容中解析出角色叙事：\n\n${rawReply.substring(0, 300)}`);
            return;
        }

        // ── 逐条延迟展示 ──
        document.getElementById('vn-options-box')?.remove();

        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (!msg.name || !msg.content) continue;
            
            const mem = findMemberByName(msg.name, group.members);
            if (!mem || msg.name === myName) {
                console.warn(`[GroupOffline] 拦截非群成员或用户的动作: ${msg.name}`);
                continue;
            }

            // 首条无延迟，后续条目模拟打字节奏
            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 500));
            }

            const avatarUrl = (mem && mem.avatar)
                ? mem.avatar
                : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(msg.name)}`;

            const aiMsgId = 'grp_off_ai_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            const isLookingOffline = () => document.getElementById('offlineModeView')?.classList.contains('show') &&
                                     currentChatId === targetGroupId && currentChatType === 'group';
            
            if (isLookingOffline()) {
                appendGroupOfflineEntry('ai', msg.content, msg.name, aiMsgId, avatarUrl);
            } else {
                if (typeof showToast === 'function') {
                    showToast(`[${group.name}] ${msg.name} (线下): 有新动作`);
                }
                if (groupsData[targetGroupId]) {
                    groupsData[targetGroupId].unreadCount = (groupsData[targetGroupId].unreadCount || 0) + 1;
                    saveGroupsData();
                }
                if (typeof updateChatListUnreadUI === 'function') updateChatListUnreadUI(targetGroupId);
                if (typeof updateDockUnreadDot === 'function') updateDockUnreadDot();
            }
            
            await saveMessageToHistory(targetGroupId, {
                id: aiMsgId, text: msg.content, type: 'received',
                senderName: msg.name, customAvatar: avatarUrl, isOffline: true
            });

            // 更新群列表预览
            if (groupsData[targetGroupId]) {
                groupsData[targetGroupId].lastMessage = `${msg.name}: ${msg.content.substring(0, 30)}`;
                saveGroupsData();
            }
        }

        // --- 后台生成状态等 ---
        if (typeof generateGroupSceneExtrasBackground === 'function') {
            generateGroupSceneExtrasBackground(targetGroupId, cleanText || userText, messages, settings, {
                needMind: true,
                needDanmaku: (typeof isDanmakuOn !== 'undefined' && isDanmakuOn),
                needOptions: (typeof isOfflineOptionsOn !== 'undefined' && isOfflineOptionsOn),
                mode: 'offline'
            });
        }

    } catch (e) {
        document.getElementById(loadingId)?.remove();
        if (sendBtn) {
            sendBtn.classList.remove('sending');
            sendBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
        }

        if (e.name === 'AbortError') {
            if (typeof showToast === 'function') showToast('已停止生成');
            return;
        }

        if (typeof showAiErrorModal === 'function') {
            showAiErrorModal('群聊线下模式生成失败', (e && e.message) ? e.message : String(e));
        }
    }
}

async function generateGroupSceneExtrasBackground(groupId, userInput, aiMessages, settings, options = {}) {
    const group = groupsData[groupId];
    if (!group || !Array.isArray(aiMessages) || aiMessages.length === 0 || !settings) return;

    const needMind = options.needMind !== false;
    const needDanmaku = !!options.needDanmaku;
    const needOptions = !!options.needOptions;

    if (!needMind && !needDanmaku && !needOptions) return;

    const me = personasMeta[currentPersonaId];
    const myName = group.myNickname || (me ? me.name : '我') || '用户';
    const speakerNames = [...new Set(
        aiMessages
            .map(msg => (msg && msg.name ? String(msg.name).trim() : ''))
            .filter(Boolean)
    )];

    let membersInfo = '';
    speakerNames.forEach(name => {
        const mem = findMemberByName(name, group.members);
        if (!mem) return;
        membersInfo += `- ${mem.remark || mem.realName}: ${mem.persona || '普通群成员'}\n`;
    });
    if (!membersInfo) return;

    const requests = [];
    if (needMind) {
        requests.push(`[GROUP_MIND_START]
Name: 角色名
Action: （当前动作）
Location: （当前地点）
Weather: （当前天气）
Murmur: （这个角色此刻最真实的内心吐槽，2-4句）
Kaomoji: （一个符合情绪的颜文字）
Affection: （0-100）
[GROUP_MIND_END]
- 请为本轮有发言的每个角色都生成一段，允许连续输出多个 GROUP_MIND 块。`);
    }
    if (needDanmaku) {
        requests.push(`[DANMAKU_START]
（网友弹幕一）
（网友弹幕二）
（网友弹幕三）
（网友弹幕四）
（网友弹幕五）
[DANMAKU_END]`);
    }
    if (needOptions) {
        requests.push(`[OPTIONS_START]
1. 选项一
2. 选项二
3. 选项三
[OPTIONS_END]`);
    }

    const aiText = aiMessages.map(msg => `${msg.name}: ${msg.content}`).join('\n');
    const modeNote = options.mode === 'offline' ? '多人线下聚会叙事' : '微信群聊对话';

    const sysPrompt = `你是一个群聊场景的专业后台状态生成引擎。
当前模式：${modeNote}
用户名：${myName}

[本轮涉及角色]
${membersInfo}

[最新互动]
用户: ${userInput || '（继续）'}
${aiText}

【核心指令 - 必须严格遵守】
1. 你的输出只能且必须包含指定的格式块，绝对禁止输出任何寒暄、解释、Markdown代码块（如 \`\`\` 等）。
2. 你必须严格按照以下指定的方括号结构输出数据，绝不能合并标签，绝不能漏掉开始或结束标签。
3. 不要生成未要求的数据块。
4. 心声必须符合各角色本轮发言后的心理状态。
5. 对于选项分支（[OPTIONS_START]），请务必结合当前剧情的悬念或冲突，以数字序号（如 1. 2. 3.）开头提供【恰好 3 个】供用户选择的行动选项，这三个选项必须引导用户走向截然不同的剧情方向。
6. 对于弹幕（[DANMAKU_START]），请提供 5-8 条极具网感、犀利吐槽风格的网友实时弹幕，每行一条，字数不要太长。

【需要生成的数据块格式】：
${requests.join('\n\n')}`;

    try {
        let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
        const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
            body: JSON.stringify({
                model: settings.model,
                messages: [
                    { role: 'system', content: sysPrompt },
                    { role: 'user', content: '请立即生成缺失的后台数据块。' }
                ],
                temperature: 0.7,
                max_tokens: 900
            })
        });

        if (!response.ok) return;
        const data = await response.json();
        let content = data?.choices?.[0]?.message?.content || '';
        content = content.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

        let updatedMind = false;

        if (needMind) {
            const mindRegex = /\[GROUP_MIND_START\]([\s\S]*?)\[GROUP_MIND_END\]/gi;
            let match;
            while ((match = mindRegex.exec(content)) !== null) {
                const block = match[1] || '';
                const getVal = (key) => {
                    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const reg = new RegExp(`${escapedKey}[:：]\\s*([\\s\\S]*?)(?=\\n(?:Name|Action|Location|Weather|Murmur|Kaomoji|Affection)[:：]|$)`, 'i');
                    const m = block.match(reg);
                    return m ? m[1].trim() : '';
                };

                const roleName = getVal('Name');
                if (!roleName) continue;

                const mem = findMemberByName(roleName, group.members);
                const memberId = (group.members || []).find(id => friendsData[id] === mem);
                if (!memberId || !friendsData[memberId]) continue;

                const target = friendsData[memberId];
                if (!target.mindState) target.mindState = {};

                target.mindState.action = getVal('Action') || target.mindState.action || '正在发呆';
                target.mindState.location = getVal('Location') || target.mindState.location || group.name || '群聊中';
                target.mindState.weather = getVal('Weather') || target.mindState.weather || '晴';
                target.mindState.murmur = getVal('Murmur') || target.mindState.murmur || '...';
                target.mindState.kaomoji = getVal('Kaomoji') || target.mindState.kaomoji || '( ˙W˙ )';

                const affStr = getVal('Affection');
                if (affStr) {
                    const num = affStr.match(/\d+/);
                    if (num) target.affection = parseInt(num[0], 10);
                }
                updatedMind = true;
            }
        }

        if (updatedMind) {
            if (typeof saveFriendsData === 'function') await saveFriendsData();
            const overlay = document.getElementById('group-mind-card-overlay');
            if (overlay && overlay.classList.contains('active') && currentChatId === groupId && currentChatType === 'group') {
                refreshGroupMindCardUI(groupId, false);
            }
        }

        if (needDanmaku) {
            const danmakuRegex = /\[DANMAKU_START\]([\s\S]*?)(?:\[(?:\/)?DANMAKU_END\]|$)/i;
            const danmakuMatch = content.match(danmakuRegex);
            if (danmakuMatch) {
                const dList = danmakuMatch[1].split('\n').map(s => s.trim()).filter(Boolean);
                if (dList.length > 0) {
                    danmakuPool = dList;
                    startDanmakuBatch(0);
                }
            }
        }

        if (needOptions) {
            const optRegex = /\[OPTIONS_START\]([\s\S]*?)(?:\[(?:\/)?OPTIONS_END\]|$)/i;
            const optMatch = content.match(optRegex);
            if (optMatch) {
                const extractedOptions = optMatch[1]
                    .split('\n')
                    .map(s => s.trim())
                    .filter(s => /^\d+\./.test(s));

                const isLookingOfflineNow =
                    document.getElementById('offlineModeView')?.classList.contains('show') &&
                    currentChatId === groupId &&
                    currentChatType === 'group';

                if (isLookingOfflineNow && extractedOptions.length > 0) {
                    const container = document.getElementById('offline-log-container');
                    if (container) {
                        let optDiv = document.getElementById('vn-options-box');
                        if (!optDiv) {
                            optDiv = document.createElement('div');
                            optDiv.id = 'vn-options-box';
                            optDiv.className = 'vn-options-container';
                            const dmArea = container.querySelector('.offline-danmaku-area');
                            if (dmArea) container.insertBefore(optDiv, dmArea);
                            else container.appendChild(optDiv);
                        } else {
                            optDiv.innerHTML = '';
                        }

                        extractedOptions.forEach(opt => {
                            const btn = document.createElement('div');
                            btn.className = 'vn-option-btn';
                            btn.innerText = opt;
                            btn.onclick = () => {
                                const input = document.getElementById('offline-input');
                                if (input) input.value = opt.replace(/^\d+\.\s*/, '').trim();
                                sendGroupOfflineMessage();
                            };
                            optDiv.appendChild(btn);
                        });

                        setTimeout(() => { container.scrollTop = container.scrollHeight; }, 100);
                    }
                }
            }
        }
    } catch (e) {
        console.warn('群聊后台扩展生成失败:', e);
    }
}

/* =========================================
   重写 toggleMindCard 以支持群聊心声
   ========================================= */
const _origToggleMindCard = window.toggleMindCard;
window.toggleMindCard = function(event) {
    if (!event) return;

    // 处理点击背景关闭
    if (event.target.id === 'mind-card-overlay' || event.target.id === 'group-mind-card-overlay') {
        const card = document.getElementById('mind-card-overlay');
        const groupCard = document.getElementById('group-mind-card-overlay');
        if (card) card.classList.remove('active');
        if (groupCard) groupCard.classList.remove('active');
        return;
    }

    if (currentChatType === 'group') {
        const groupCard = document.getElementById('group-mind-card-overlay');
        if (!groupCard) return;

        if (groupCard.classList.contains('active')) {
            groupCard.classList.remove('active');
            return;
        }

        if (!currentChatId || !groupsData[currentChatId]) return;

        refreshGroupMindCardUI(currentChatId, true);
        groupCard.classList.add('active');
        return;
    }

    // 单聊走原本逻辑
    if (typeof _origToggleMindCard === 'function') {
        _origToggleMindCard(event);
    } else {
        // Fallback to basic open
        const card = document.getElementById('mind-card-overlay');
        if (card) {
            if (card.classList.contains('active')) {
                card.classList.remove('active');
            } else {
                if (typeof refreshMindCardUI === 'function') refreshMindCardUI(currentChatId, false);
                card.classList.add('active');
            }
        }
    }
};

window.refreshGroupMindCardUI = function(groupId, useTyping = false) {
    const group = groupsData[groupId];
    if (!group) return;

    const listContainer = document.getElementById('group-mind-card-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    
    // 获取群内非潜水/非禁言的活跃成员，最多显示8个
    const members = (group.members || []).filter(id => {
        const isMuted = (group.mutedMembers || []).includes(id);
        return !isMuted && friendsData[id];
    }).slice(0, 8);

    if (members.length === 0) {
        listContainer.innerHTML = '<div style="text-align:center; color:#999; font-size:12px; padding:20px;">群里暂时没有人的心声...</div>';
        return;
    }

    members.forEach(memberId => {
        const friend = friendsData[memberId];
        if (!friend.mindState) {
            friend.mindState = { murmur: "...", hiddenThought: "..." };
        }
        const state = friend.mindState;
        
        const avatarUrl = friend.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(friend.realName || memberId)}`;
        const name = friend.remark || friend.realName || memberId;
        const murmur = state.murmur || "...";

        const itemHtml = `
            <div class="group-mind-item" style="padding: 16px; border-bottom: 1px dashed #f0f0f0; display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; align-items: center;">
                    <div style="position: relative;">
                        <img src="${avatarUrl}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 2px solid #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.08); flex-shrink: 0;">
                    </div>
                    <div style="margin-left: 12px; flex: 1;">
                        <div style="font-size: 14px; font-weight: 800; color: #111; letter-spacing: 0.5px; margin-bottom: 4px;">${name}</div>
                    </div>
                </div>
                <div style="background: #f9f9f9; border-radius: 12px; padding: 12px 14px; position: relative;">
                    <i class="fas fa-quote-left" style="color: #ddd; font-size: 12px; position: absolute; top: -6px; left: 12px; background: #fff; padding: 0 4px;"></i>
                    <div class="group-mind-text" id="gm-text-${memberId}" style="font-size: 13px; color: #444; line-height: 1.6; font-style: normal;">${murmur}</div>
                </div>
            </div>
        `;
        
        listContainer.insertAdjacentHTML('beforeend', itemHtml);

        // if (useTyping && typeof typeWriterEffect === 'function') {
        //     typeWriterEffect(murmur, `gm-text-${memberId}`, 18);
        // }
    });
};

console.log('[app_groupchat.js] 群聊线下模式模块已加载');
