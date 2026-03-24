/* =========================================
   [究极合并版] Bubble App Logic (爱豆+粉丝 双模式)
   ========================================= */

// 1. 全局数据定义
const BUBBLE_DATA_KEY = 'myCoolPhone_bubbleData';
let bubbleData = {
    // 消息记录：{id, text, sender: 'idol'|'fan', time, isVirtualIdol: boolean}
    messages: [], 
    // 路人回复池 (用于滚动条)
    mobReplies: [] 
};

// 当前关注的爱豆ID (粉丝模式用)
let currentIdolId = 'Hannah AI'; 
// 假粉丝自动回复定时器 (爱豆模式用)
let fakeFanInterval;
// 评论池
let bubbleCommentsPool = [];

function setBubbleActiveView(viewId) {
    ['bb-landing-view', 'bb-idol-view', 'bb-fan-view'].forEach(id => {
        const view = document.getElementById(id);
        if (!view) return;

        const isActive = id === viewId;
        view.classList.toggle('active', isActive);
        view.style.display = isActive ? 'flex' : 'none';
    });
}

// 2. 打开/关闭 App
window.openBubbleApp = function() {
    const app = document.getElementById('bubbleApp');
    if (app) {
        app.classList.add('open');
        loadBubbleData();
        setBubbleActiveView('bb-landing-view');

        // 尝试自动选择第一个好友作为粉丝模式的爱豆
        const ids = Object.keys(friendsData);
        if (ids.length > 0) currentIdolId = ids[0];
    }
}

window.closeBubbleApp = function() {
    document.getElementById('bubbleApp').classList.remove('open');
    if (fakeFanInterval) {
        clearInterval(fakeFanInterval);
        fakeFanInterval = null;
    }
}

// 3. 模式切换入口
window.enterBubbleMode = function(mode) {
    if (fakeFanInterval) {
        clearInterval(fakeFanInterval);
        fakeFanInterval = null;
    }

    if (mode === 'idol') {
        // === 进入爱豆模式 ===
        setBubbleActiveView('bb-idol-view');
        renderIdolHistory();     // 渲染历史记录
        startFakeFanReplies();   // 开始滚动假评论
    } else {
        // === 进入粉丝模式 ===
        setBubbleActiveView('bb-fan-view');
        renderFanView();         // 渲染聊天界面
        
        // 如果是空的，自动触发一条爱豆欢迎语
        const hasFanMsgs = bubbleData.messages.some(m => m.isVirtualIdol === true);
        if (!hasFanMsgs && bubbleData.messages.length === 0) {
            triggerIdolBroadcast(true); 
        }
    }
}

window.exitBubbleMode = function() {
    setBubbleActiveView('bb-landing-view');
    if (fakeFanInterval) {
        clearInterval(fakeFanInterval);
        fakeFanInterval = null;
    }
}

/* =========================================
   Part A: 爱豆模式逻辑 (我是爱豆，发广播)
   ========================================= */

// A1. 爱豆发送广播
window.idolSendBroadcast = function() {
    const input = document.getElementById('bb-idol-input');
    const text = input.value.trim();
    if (!text) return;

    // 存入公共消息列表
    const msg = {
        id: Date.now(),
        text: text,
        sender: 'idol', // 我是发送者
        isVirtualIdol: false, // 标记：这不是AI发的，是真人发的
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    };
    bubbleData.messages.push(msg);
    saveBubbleData();

    // UI 反馈
    input.value = '';
    renderIdolHistory();
    alert(`[SYSTEM] Message sent! Waiting for replies...`);

    // 触发 AI 好友来回复你的广播
    triggerAiFanReaction(text);
}

// A2. 渲染发送历史
function renderIdolHistory() {
    const container = document.getElementById('bb-sent-history');
    if (!container) return;
    // 只显示我(真人爱豆)发的消息
    const history = bubbleData.messages.filter(m => m.sender === 'idol' && !m.isVirtualIdol).reverse();
    
    container.innerHTML = history.map(m => `
        <div class="bb-history-item">
            <span class="bb-history-time">${m.time}</span>
            ${m.text}
        </div>
    `).join('');
}

// A3. 触发 AI 好友扮演粉丝回复
async function triggerAiFanReaction(idolText) {
    const friendIds = Object.keys(friendsData);
    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    const settings = settingsJSON ? JSON.parse(settingsJSON) : null;

    if (!settings) return; 

    // 遍历每一个好友
    for (const friendId of friendIds) {
        if (friendId === 'ME') continue;
        const friend = friendsData[friendId];
        
        // 随机延迟
        const delay = Math.floor(Math.random() * 12000) + 3000;

        setTimeout(async () => {
            const systemPrompt = `
            You are playing the role of ${friend.realName}, a super fan of the Idol (User).
            The Idol just posted: "${idolText}"
            Task: Write a short, excited fan reply (under 20 words).
            Output ONLY the reply text.
            `;

            try {
                let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
                const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
                
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
                    body: JSON.stringify({
                        model: settings.model,
                        messages: [{ role: "system", content: systemPrompt }],
                        temperature: 0.8
                    })
                });

                const data = await res.json();
                const replyText = data.choices[0].message.content.trim();
                
                // 添加到评论列表 (标记为 VIP)
                addBubbleComment(replyText, true, friend);

            } catch (e) { console.error(e); }
        }, delay);
    }
}

// A4. 模拟假路人粉丝回复 (循环生成)
function startFakeFanReplies() {
    if (fakeFanInterval) clearInterval(fakeFanInterval);
    
    const fakeReplies = [
        "姐姐好美！", "Love from Brazil 🇧🇷", "Waiting for new song...", 
        "Ahhhhh!!!", "Good morning", "Update more please", "❤️❤️❤️", "First!", "Marry me!"
    ];
    
    fakeFanInterval = setInterval(() => {
        // 如果不在爱豆界面，就不生成
        const idolView = document.getElementById('bb-idol-view');
        if (!idolView || !idolView.classList.contains('active')) return;

        const text = fakeReplies[Math.floor(Math.random() * fakeReplies.length)];
        addBubbleComment(text, false); // false = 非VIP
    }, 2500); 
}

/* =========================================
   Part B: 粉丝模式逻辑 (我是粉丝，AI是爱豆)
   ========================================= */

// B1. 渲染聊天界面
function renderFanView() {
    const friend = friendsData[currentIdolId] || { realName: 'Artist' };
    
    // 更新顶部名字
    const nameEl = document.getElementById('bb-active-idol-name');
    if(nameEl) nameEl.innerText = friend.remark || friend.realName;

    const container = document.getElementById('bb-chat-container');
    container.innerHTML = `<div class="bb-time-stamp" style="align-self:center;">TODAY</div>`;
    
    // 过滤出属于粉丝模式的消息 (isVirtualIdol = true 或 sender = fan)
    const fanModeMessages = bubbleData.messages.filter(m => m.isVirtualIdol === true || m.sender === 'fan');

    fanModeMessages.forEach(m => {
        if (m.sender === 'idol') {
            // === 爱豆消息 (AI发的) ===
            const f = friendsData[m.idolId] || friendsData[currentIdolId];
            const avatar = f.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.realName}`;
            const name = f.remark || f.realName;
            
            const div = document.createElement('div');
            div.className = 'bb-msg-row idol';
            div.innerHTML = `
                <div class="bb-idol-container">
                    <div class="bb-idol-name-tag">
                        ${name} <span class="bb-idol-badge">ARTIST</span>
                    </div>
                    <div class="bb-idol-bubble-wrap">
                        <div class="bb-idol-avatar"><img src="${avatar}"></div>
                        <div class="bb-bubble idol-style">${m.text}</div>
                    </div>
                </div>
            `;
            container.appendChild(div);
        } else {
            // === 我的回复 (我是粉丝) ===
            const div = document.createElement('div');
            div.className = 'bb-msg-row fan';
            div.innerHTML = `<div class="bb-bubble fan-style">${m.text}</div>`;
            container.appendChild(div);
        }
    });

    setTimeout(() => container.scrollTop = container.scrollHeight, 100);
}

// B2. 我(粉丝)发送回复
window.fanSendReply = function() {
    const input = document.getElementById('bb-fan-input');
    const text = input.value.trim();
    if (!text) return;

    bubbleData.messages.push({
        id: Date.now(),
        text: text,
        sender: 'fan',
        time: new Date().toLocaleTimeString()
    });
    saveBubbleData();
    renderFanView();
    input.value = '';
}

// B3. 触发爱豆(AI)发广播
window.triggerIdolBroadcast = async function(isWelcome = false) {
    const friend = friendsData[currentIdolId];
    if (!friend) return;

    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    const settings = settingsJSON ? JSON.parse(settingsJSON) : null;
    let replyText = "Hello bubbles!";

    if (settings) {
        const systemPrompt = `
        You are a famous K-pop Idol named ${friend.realName}.
        Persona: ${friend.persona}
        Context: sending a message on "Bubble" app to fans.
        Style: Casual, cute, sharing daily life.
        Task: Write a short message (1-2 sentences).
        IMPORTANT: No quotes.
        `;
        
        try {
            document.getElementById('bb-ticker-text').innerText = "Artist is typing...";
            let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
            const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
            
            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
                body: JSON.stringify({
                    model: settings.model,
                    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: "Send a new update." }],
                    temperature: 0.9
                })
            });
            const data = await res.json();
            replyText = data.choices[0].message.content;
        } catch (e) { console.error(e); }
    } else if (isWelcome) {
        replyText = friend.greeting || "Welcome to my Bubble! ✨";
    }

    // 存入消息 (标记为 isVirtualIdol=true)
    bubbleData.messages.push({
        id: Date.now(),
        text: replyText,
        sender: 'idol',
        idolId: currentIdolId,
        isVirtualIdol: true, 
        time: new Date().toLocaleTimeString()
    });
    saveBubbleData();
    renderFanView();

    // 触发顶部的路人回复滚动条
    generateMobReactions(replyText);
}

// B4. 生成路人回复 (粉丝模式顶部的 Ticker)
function generateMobReactions(contextText) {
    const fakeReplies = ["OMG!!", "终于等到你！", "Love you unnie!", "啊啊啊啊啊", "So cute T_T", "第一！", "Wow", "I miss you"];
    const count = Math.floor(Math.random() * 5) + 5;
    const newMobs = [];
    
    for(let i=0; i<count; i++) {
        const text = fakeReplies[Math.floor(Math.random() * fakeReplies.length)];
        newMobs.push({
            user: "User" + Math.floor(Math.random() * 9000),
            text: text,
            time: "Just now"
        });
    }
    // 存入临时池子
    bubbleData.mobReplies = [...newMobs, ...bubbleData.mobReplies].slice(0, 30);
    
    // 更新 UI
    const tickerText = newMobs.map(m => m.text).join("   |   ");
    const tickerEl = document.getElementById('bb-ticker-text');
    if(tickerEl) {
        tickerEl.innerText = tickerText;
        tickerEl.style.animation = 'none';
        tickerEl.offsetHeight; /* trigger reflow */
        tickerEl.style.animation = 'marquee-left 15s linear infinite';
    }
    
    const countEl = document.getElementById('bb-mob-count');
    if(countEl) countEl.innerText = bubbleData.mobReplies.length;

    // 如果弹窗开着，刷新列表
    if(document.getElementById('bb-mob-modal') && document.getElementById('bb-mob-modal').classList.contains('show')) {
        renderMobList();
    }
}

/* =========================================
   Part C: 通用 UI 辅助 (弹窗/评论行)
   ========================================= */

// C1. 添加评论到 UI (爱豆模式下用)
function addBubbleComment(text, isVip, friendData = null) {
    const comment = {
        id: Date.now() + Math.random(),
        text: text,
        isVip: isVip,
        name: isVip ? (friendData.remark || friendData.realName) : ("User" + Math.floor(Math.random()*9000+1000)),
        avatar: isVip ? (friendData.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friendData.realName}`) : null,
        time: new Date().toLocaleTimeString()
    };
    
    bubbleCommentsPool.unshift(comment); 
    
    // 更新滚动条 (Ticker)
    const ticker = document.getElementById('bb-reply-ticker');
    if (ticker) {
        const div = document.createElement('div');
        div.className = 'bb-reply-item';
        const nameStyle = isVip ? 'color:#ff7e67; font-weight:800;' : '';
        const vipIcon = isVip ? '👑 ' : '';
        div.innerHTML = `<span style="${nameStyle}">${vipIcon}${comment.name}:</span> ${text}`;
        ticker.prepend(div);
        if (ticker.children.length > 8) ticker.lastChild.remove();
    }

    // 更新列表弹窗
    const listContainer = document.getElementById('bb-comment-list-container');
    const modal = document.getElementById('bb-comment-modal');
    if (modal && modal.classList.contains('show') && listContainer) {
        const row = createCommentRowHTML(comment);
        listContainer.insertAdjacentHTML('afterbegin', row);
        updateReplyCount();
    }
}

// C2. 生成评论行 HTML
function createCommentRowHTML(c) {
    if (c.isVip) {
        return `
            <div class="bb-comment-row vip">
                <img src="${c.avatar}" class="bb-c-avatar">
                <div class="bb-c-content">
                    <span class="bb-c-name">${c.name} <i class="fas fa-check-circle" style="font-size:10px;"></i></span>
                    <div class="bb-c-text">${c.text}</div>
                </div>
            </div>
        `;
    } else {
        return `
            <div class="bb-comment-row fake">
                <div class="bb-c-avatar"></div>
                <div class="bb-c-content">
                    <div style="font-weight:700; font-size:10px; margin-bottom:2px;">${c.name}</div>
                    <div>${c.text}</div>
                </div>
            </div>
        `;
    }
}

// C3. 评论列表弹窗控制 (共用)
// 粉丝模式下：显示 mobReplies
// 爱豆模式下：显示 bubbleCommentsPool
window.openBubbleComments = function() { // 爱豆模式入口
    renderCommentsModal(bubbleCommentsPool);
}
window.openMobReplies = function() { // 粉丝模式入口
    renderMobList(); 
    document.getElementById('bb-mob-modal').classList.add('show');
}

function renderCommentsModal(pool) {
    const modal = document.getElementById('bb-comment-modal');
    const list = document.getElementById('bb-comment-list-container');
    if(!modal || !list) return;
    list.innerHTML = pool.map(c => createCommentRowHTML(c)).join('');
    updateReplyCount();
    modal.classList.add('show');
}

window.closeBubbleComments = function() {
    const modal = document.getElementById('bb-comment-modal');
    if(modal) modal.classList.remove('show');
}
window.closeMobReplies = function() {
    const modal = document.getElementById('bb-mob-modal');
    if(modal) modal.classList.remove('show');
}

function updateReplyCount() {
    const el = document.getElementById('bb-total-replies');
    if(el) el.innerText = bubbleCommentsPool.length;
}

// 粉丝模式的路人列表渲染
function renderMobList() {
    const list = document.getElementById('bb-mob-list');
    list.innerHTML = '';
    bubbleData.mobReplies.forEach(m => {
        const item = document.createElement('div');
        item.className = 'bb-mob-item';
        item.innerHTML = `
            <div class="bb-mob-avatar"></div>
            <div class="bb-mob-content">
                <div class="bb-mob-user">${m.user}</div>
                <div>${m.text}</div>
            </div>
        `;
        list.appendChild(item);
    });
    const countEl = document.getElementById('bb-mob-count');
    if(countEl) countEl.innerText = bubbleData.mobReplies.length;
}

// 数据加载/保存
function loadBubbleData() {
    const raw = localStorage.getItem(BUBBLE_DATA_KEY);
    if (raw) bubbleData = JSON.parse(raw);
}
function saveBubbleData() {
    localStorage.setItem(BUBBLE_DATA_KEY, JSON.stringify(bubbleData));
}
