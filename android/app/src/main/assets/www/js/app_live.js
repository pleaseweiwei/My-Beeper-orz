/* =========================================
   [复刻版] Live App (保留原样式 + 抖音全屏 + 全局世界观)
   ========================================= */

const LIVE_DATA_KEY = 'myCoolPhone_liveData';

let liveData = {
    bio: "记录闪耀的碎片 ✦",
    following: 0,
    followers: 0,
    likes: 0,
    posts: [],          
    discover: [],       
    friends: [],        
    notifications: [],  
    worldbook: ""       // 核心：全局 LIVE 世界书
};

let currentTikTokPostId = null;

// 1. 数据初始化
async function loadLiveData() {
    try {
        const raw = await IDB.get(LIVE_DATA_KEY);
        if (raw) {
            liveData = { ...liveData, ...raw };
            if(!liveData.worldbook) liveData.worldbook = "";
        }
    } catch(e) {}
}
async function saveLiveData() {
    try { await IDB.set(LIVE_DATA_KEY, liveData); } catch(e) {}
}

// 2. 渲染 UI (使用你原来的 CSS 类名)
function renderLiveUI() {
    document.getElementById('live-stat-following').innerText = liveData.following || 0;
    document.getElementById('live-stat-followers').innerText = liveData.followers || 0;
    document.getElementById('live-stat-likes').innerText = liveData.likes || 0;
    const bioEl = document.getElementById('live-me-bio');
    if(bioEl) bioEl.innerText = liveData.bio || '记录闪耀的碎片 ✦';

    // A. 个人主页作品 (原版样式 lp-work-item)
    const worksContainer = document.getElementById('live-me-works');
    if (worksContainer) {
        worksContainer.innerHTML = '';
        liveData.posts.forEach(p => {
            const div = document.createElement('div');
            div.className = 'lp-work-item';
            div.style.cursor = 'pointer';
            div.onclick = () => openTikTokView(p.id); 
            
            if (p.mediaType === 'video') {
                div.innerHTML = `<video src="${p.media}" style="width:100%;height:100%;object-fit:cover;"></video><i class="fas fa-video" style="position:absolute;top:5px;right:5px;color:#fff;font-size:10px;"></i>`;
                div.style.position = 'relative';
            } else if (p.media) {
                div.innerHTML = `<img src="${p.media}" style="width:100%;height:100%;object-fit:cover;">`;
            } else {
                div.innerHTML = `<div style="width:100%;height:100%;background:#eee;display:flex;align-items:center;justify-content:center;font-size:10px;color:#888;text-align:center;">${p.imgDesc || 'TEXT'}</div>`;
            }
            worksContainer.appendChild(div);
        });
    }

    // B. 发现页 (原版样式 live-feed-card, live-tag)
    const discContainer = document.getElementById('live-discover-list');
    if (discContainer) {
        discContainer.innerHTML = '';
        liveData.discover.forEach(p => {
            const div = document.createElement('div');
            div.className = 'live-feed-card';
            div.style.cursor = 'pointer';
            div.onclick = () => openTikTokView(p.id);

            let mediaHtml = '';
            if (p.mediaType === 'video') {
                mediaHtml = `<video src="${p.media}" style="width:100%;aspect-ratio:3/4;object-fit:cover;"></video><i class="fas fa-play-circle" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:rgba(255,255,255,0.8);font-size:36px;pointer-events:none;"></i>`;
            } else if (p.media) {
                mediaHtml = `<img src="${p.media}" style="width:100%;aspect-ratio:3/4;object-fit:cover;">`;
            } else {
                mediaHtml = `<div style="width:100%;aspect-ratio:3/4;background:#eee;display:flex;align-items:center;justify-content:center;padding:20px;font-size:12px;color:#555;text-align:center;">${p.imgDesc || 'TEXT POST'}</div>`;
            }

            // 完全套用你原来的 CSS 排版
            div.innerHTML = `
                <div style="position:relative;">
                    ${mediaHtml}
                    <span class="tag live-tag"><i class="fas fa-circle pulse-dot"></i> ${p.mediaType==='video'?'VLOG':'POST'}</span>
                </div>
                <div class="feed-card-info">
                    <div class="feed-title">${p.text}</div>
                </div>
            `;
            discContainer.appendChild(div);
        });
    }

    // C. 消息通知 (原版样式 live-msg-row)
    const msgContainer = document.getElementById('live-msg-list-container');
    if (msgContainer) {
        msgContainer.innerHTML = '';
        liveData.notifications.forEach(n => {
            const div = document.createElement('div');
            div.className = 'live-msg-row';
            if (n.postId) {
                div.style.cursor = 'pointer';
                div.onclick = () => openTikTokView(n.postId);
            }
            div.innerHTML = `
                <div class="lm-avatar"><img src="${n.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=sys'}"></div>
                <div class="lm-info">
                    <div class="lm-name">${n.name} <span>${n.action}</span></div>
                    <div class="lm-time">${n.time}</div>
                </div>
            `;
            msgContainer.appendChild(div);
        });
    }
}

// 3. Tab切换与打开应用
window.openLiveApp = async function() {
    const app = document.getElementById('liveApp');
    if (app) {
        app.classList.add('open');
        await loadLiveData();
        switchLiveTab('discover', 'D I S C O V E R', document.querySelector('.lb-nav-item'));
        syncLiveIdentity();
        renderLiveUI();
    }
}

window.closeLiveApp = function() {
    document.getElementById('liveApp').classList.remove('open');
    closeTikTokView();
}

window.switchLiveTab = function(tabId, titleText, clickedBtn) {
    document.querySelectorAll('.live-tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.lb-nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`live-tab-${tabId}`).classList.add('active');
    if (clickedBtn) clickedBtn.classList.add('active');

    const topBar = document.querySelector('.live-top-bar');
    const titleEl = document.getElementById('live-top-title');
    
    if (tabId === 'mylive') {
        topBar.style.display = 'none';
    } else {
        topBar.style.display = 'flex';
        titleEl.innerText = titleText;
    }
}

// 4. 【极简】身份切换系统 (只选不改)
function syncLiveIdentity() {
    const me = personasMeta[currentPersonaId];
    if (me) {
        const avaUrl = me.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=Me`;
        document.getElementById('live-me-avatar').src = avaUrl;
        document.getElementById('live-me-name').innerText = me.name || 'User';
    }
}

window.openLiveQuickIdentityModal = function() {
    const list = document.getElementById('live-quick-identity-list');
    list.innerHTML = '';
    Object.values(personasMeta).forEach(p => {
        const isActive = p.id === currentPersonaId;
        const div = document.createElement('div');
        div.style.cssText = `display:flex; align-items:center; gap:12px; padding:12px; border-radius:12px; margin-bottom:10px; cursor:pointer; background:${isActive ? '#111' : '#f5f5f5'}; color:${isActive ? '#fff' : '#333'}; transition:0.2s;`;
        div.onclick = () => {
            currentPersonaId = p.id;
            localStorage.setItem(CURRENT_PERSONA_KEY, p.id);
            syncLiveIdentity();
            document.getElementById('live-quick-identity-modal').classList.remove('active');
            if(typeof showToast === 'function') showToast("当前身份：" + p.name);
        };
        div.innerHTML = `
            <img src="${p.avatar}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;">
            <div style="font-weight:700; font-size:14px;">${p.name}</div>
            ${isActive ? '<i class="fas fa-check" style="margin-left:auto; color:#07c160;"></i>' : ''}
        `;
        list.appendChild(div);
    });
    document.getElementById('live-quick-identity-modal').classList.add('active');
}

// 5. 【全局】世界书设定
window.openGlobalLiveWbModal = function() {
    document.getElementById('live-global-wb-modal').classList.add('active');
    document.getElementById('live-global-wb-content').value = liveData.worldbook || '';
}

window.saveGlobalLiveWb = async function() {
    liveData.worldbook = document.getElementById('live-global-wb-content').value.trim();
    await saveLiveData();
    document.getElementById('live-global-wb-modal').classList.remove('active');
    if(typeof showToast === 'function') showToast("🌍 全局世界观已应用");
}

// 6. 发布模块 (支持短视频)
window.handleLiveMediaUpload = function(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const isVideo = file.type.startsWith('video');
        const reader = new FileReader();
        
        reader.onload = async function(e) {
            let resData = e.target.result;
            const preview = document.getElementById('live-post-media-preview');
            
            if (isVideo) {
                preview.innerHTML = `<i class="fas fa-play-circle" style="color:#fff; font-size:24px; position:absolute; z-index:2;"></i><video src="${resData}" style="width:100%;height:100%;object-fit:cover;"></video>`;
                preview.dataset.type = 'video';
            } else {
                if (typeof compressImage === 'function') resData = await compressImage(resData, 500);
                preview.innerHTML = `<img src="${resData}" style="width:100%;height:100%;object-fit:cover;">`;
                preview.dataset.type = 'image';
            }
            preview.dataset.src = resData;
            document.getElementById('live-post-img-desc').value = ''; 
        }
        reader.readAsDataURL(file);
    }
    input.value = '';
};

window.generateLivePostByAI = async function() {
    const promptInput = document.getElementById('live-ai-prompt').value.trim() || '随意的日常';
    if(typeof showToast === 'function') showToast('构思中...');
    
    const me = personasMeta[currentPersonaId] || { name: 'User', persona: '普通人' };
    const wbContext = liveData.worldbook ? `\n[APP Global World Setting]:\n${liveData.worldbook}` : "";

    const prompt = `
    [System] You are generating a short video/photo post for a trendy app.
    Author: ${me.name} - ${me.persona}
    ${wbContext}
    Topic: "${promptInput}"
    
    Return JSON ONLY:
    {
       "text": "Post caption (short, aesthetic)",
       "tags": "#tag1 #tag2",
       "imgDesc": "Visual description of the scene (Chinese)"
    }
    `;
    const res = await callAiForSpecialTask(prompt);
    if (res) {
        try {
            const data = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim());
            document.getElementById('live-post-text').value = data.text || '';
            document.getElementById('live-post-tags').value = data.tags || '';
            document.getElementById('live-post-img-desc').value = data.imgDesc || '';
        } catch (e) { if(typeof showToast === 'function') showToast('生成失败'); }
    }
}

window.publishLivePost = async function() {
    const text = document.getElementById('live-post-text').value.trim();
    const tags = document.getElementById('live-post-tags').value.trim();
    const preview = document.getElementById('live-post-media-preview');
    const media = preview.dataset.src || '';
    const mediaType = preview.dataset.type || 'image'; 
    const imgDesc = document.getElementById('live-post-img-desc').value.trim();
    
    if (!text && !media && !imgDesc) return;
    
    const post = {
        id: 'lp_' + Date.now(),
        text, tags, media, mediaType, imgDesc,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        likes: 0,
        likedByMe: false,
        comments: [] 
    };
    
    liveData.posts.unshift(post);
    liveData.discover.unshift(post);
    
    document.getElementById('live-post-text').value = '';
    document.getElementById('live-post-tags').value = '';
    document.getElementById('live-post-img-desc').value = '';
    preview.innerHTML = '<i class="fas fa-camera" style="color:#aaa; font-size:20px;"></i>';
    preview.dataset.src = '';
    preview.dataset.type = '';
    
    await saveLiveData();
    renderLiveUI();
    if(typeof showToast === 'function') showToast('发布成功！');
    
    switchLiveTab('me', 'P R O F I L E', document.querySelectorAll('.lb-nav-item')[4]);
    triggerLiveReactions(post);
}

// 7. 社交联动 (写入聊天记忆 + AI互动)
async function triggerLiveReactions(post) {
    const aiIds = Object.keys(friendsData);
    if (aiIds.length === 0) return;
    
    const memText = `[系统记录：我在短视频平台发布了新作品。内容：“${post.text}” 画面：“${post.imgDesc||(post.mediaType==='video'?'一段视频':'一张照片')}”]`;
    for (const id of aiIds) {
        await saveMessageToHistory(id, { text: memText, type: 'sent', senderName: 'ME', isOffline: true });
    }
    
    const mainAiId = aiIds[Math.floor(Math.random() * aiIds.length)];
    const ai = friendsData[mainAiId];
    const wbContext = liveData.worldbook ? `\n[APP Global World Setting]:\n${liveData.worldbook}` : "";
    
    const prompt = `
    [System] User posted on social media: "${post.text}". Visuals: ${post.imgDesc||'Video/Photo'}.
    ${wbContext}
    
    1. Gen followers/likes increment (10-100).
    2. One random netizen comment (funny Chinese).
    3. You are ${ai.realName} (Persona: ${ai.persona}). Write your comment.
    4. Write a WeChat DM to the User reacting to this post.
    
    JSON: { "followersInc": 20, "likesInc": 50, "netizenComment": "火钳刘明！", "aiComment": "好看", "aiWeChatMessage": "刷到你视频了~" }
    `;
    
    setTimeout(async () => {
        const res = await callAiForSpecialTask(prompt);
        if (res) {
            try {
                const data = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim());
                liveData.followers += (data.followersInc || 0);
                liveData.likes += (data.likesInc || 0);
                
                const timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                const thePost = liveData.posts.find(p => p.id === post.id);
                if (thePost) {
                    thePost.likes = (thePost.likes || 0) + (data.likesInc || 0);
                    if (data.netizenComment) {
                        thePost.comments.push({ id: Date.now()+1, name: '路人粉', text: data.netizenComment });
                        liveData.notifications.unshift({ name: '匿名粉丝', action: `评论了: "${data.netizenComment}"`, time: timeStr, postId: post.id });
                    }
                    if (data.aiComment) {
                        thePost.comments.push({ id: Date.now()+2, name: ai.remark || ai.realName, text: data.aiComment, isAI: true, avatar: ai.avatar });
                        liveData.notifications.unshift({ name: ai.realName || ai.remark, avatar: ai.avatar, action: `评论了: "${data.aiComment}"`, time: timeStr, postId: post.id });
                    }
                }
                await saveLiveData();
                if (document.getElementById('liveApp').classList.contains('open')) renderLiveUI();
                
                if (data.aiWeChatMessage) {
                    await saveMessageToHistory(mainAiId, { text: data.aiWeChatMessage, type: 'received', senderName: ai.realName, customAvatar: ai.avatar });
                    const dockDot = document.getElementById('dock-dot');
                    if (dockDot) dockDot.style.display = 'block';
                    if(typeof showToast === 'function') showToast(`<i class="fab fa-weixin" style="color:#07c160;"></i> 微信新消息：${ai.remark || ai.realName}`);
                }
            } catch (e) {}
        }
    }, 5000); 
}

// 8. 【全屏沉浸】抖音式播放器逻辑
window.openTikTokView = function(postId) {
    let targetPost = liveData.posts.find(p => p.id === postId) || liveData.discover.find(p => p.id === postId);
    if (!targetPost) return;
    currentTikTokPostId = postId;

    const modal = document.getElementById('live-tiktok-modal');
    const mediaContainer = document.getElementById('tk-media-container');
    
    // 渲染媒体
    if (targetPost.mediaType === 'video') {
        mediaContainer.innerHTML = `<video src="${targetPost.media}" autoplay loop playsinline style="width:100%; height:100%; object-fit:contain;"></video>`;
    } else if (targetPost.media) {
        mediaContainer.innerHTML = `<img src="${targetPost.media}" style="width:100%; height:100%; object-fit:contain;">`;
    } else {
        mediaContainer.innerHTML = `<div style="width:100%; height:100%; background:linear-gradient(135deg, #2b2b2b, #111); display:flex; align-items:center; justify-content:center; padding:40px; color:#fff; font-size:18px; font-family:'Songti SC', serif; text-align:center; line-height:1.6;">${targetPost.imgDesc || 'TEXT POST'}</div>`;
    }

    const me = personasMeta[currentPersonaId] || { name: 'User' };
    document.getElementById('tk-avatar').src = me.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=Me`;
    document.getElementById('tk-author').innerText = `@${me.name}`;
    document.getElementById('tk-desc').innerText = targetPost.text || '';
    document.getElementById('tk-tags').innerText = targetPost.tags || '';
    
    const heartIcon = document.getElementById('tk-heart-icon');
    if (targetPost.likedByMe) heartIcon.style.color = '#ff2c55';
    else heartIcon.style.color = '#fff';
    
    document.getElementById('tk-likes').innerText = targetPost.likes || 0;
    document.getElementById('tk-comments-count').innerText = targetPost.comments ? targetPost.comments.length : 0;

    modal.style.display = 'flex';
    setTimeout(() => { modal.style.transform = 'translateY(0)'; }, 10);
}

window.closeTikTokView = function() {
    const modal = document.getElementById('live-tiktok-modal');
    const mediaContainer = document.getElementById('tk-media-container');
    modal.style.transform = 'translateY(100%)';
    setTimeout(() => { 
        modal.style.display = 'none'; 
        mediaContainer.innerHTML = ''; 
    }, 300);
    closeTikTokComments(); 
}

window.toggleTikTokLike = function() {
    if(!currentTikTokPostId) return;
    let targetPost = liveData.posts.find(p => p.id === currentTikTokPostId) || liveData.discover.find(p => p.id === currentTikTokPostId);
    if(!targetPost) return;

    const heartIcon = document.getElementById('tk-heart-icon');
    if (targetPost.likedByMe) {
        targetPost.likedByMe = false;
        targetPost.likes = Math.max(0, (targetPost.likes || 0) - 1);
        heartIcon.style.color = '#fff';
    } else {
        targetPost.likedByMe = true;
        targetPost.likes = (targetPost.likes || 0) + 1;
        heartIcon.style.color = '#ff2c55';
    }
    document.getElementById('tk-likes').innerText = targetPost.likes;
    saveLiveData();
}

window.openTikTokComments = function() {
    if(!currentTikTokPostId) return;
    let targetPost = liveData.posts.find(p => p.id === currentTikTokPostId) || liveData.discover.find(p => p.id === currentTikTokPostId);
    if(!targetPost) return;

    const sheet = document.getElementById('tk-comments-sheet');
    const list = document.getElementById('tk-comments-list');
    document.getElementById('tk-sheet-title').innerText = `共 ${targetPost.comments ? targetPost.comments.length : 0} 条评论`;
    
    list.innerHTML = '';
    if (targetPost.comments && targetPost.comments.length > 0) {
        targetPost.comments.forEach(c => {
            list.innerHTML += `
                <div style="display:flex; gap:12px;">
                    <img src="${c.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed='+c.name}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;">
                    <div style="flex:1;">
                        <div style="font-size:12px; font-weight:700; color:${c.isAI ? '#ff2c55' : '#888'}; margin-bottom:4px;">${c.name}</div>
                        <div style="font-size:14px; color:#333; line-height:1.4;">${c.text}</div>
                    </div>
                </div>
            `;
        });
    } else {
        list.innerHTML = `<div style="text-align:center; color:#ccc; font-size:12px; margin-top:40px;">留下第一条评论吧</div>`;
    }
    sheet.style.transform = 'translateY(0)';
}

window.closeTikTokComments = function() {
    document.getElementById('tk-comments-sheet').style.transform = 'translateY(100%)';
}

window.submitTikTokComment = function() {
    const input = document.getElementById('tk-my-comment-input');
    const text = input.value.trim();
    if(!text || !currentTikTokPostId) return;

    let targetPost = liveData.posts.find(p => p.id === currentTikTokPostId) || liveData.discover.find(p => p.id === currentTikTokPostId);
    if(!targetPost) return;

    if(!targetPost.comments) targetPost.comments = [];
    const me = personasMeta[currentPersonaId] || { name: 'User' };
    
    targetPost.comments.push({ id: Date.now(), name: me.name, avatar: me.avatar, text: text, isAI: false });
    
    input.value = '';
    saveLiveData();
    openTikTokComments();
    document.getElementById('tk-comments-count').innerText = targetPost.comments.length;
}

window.editLiveBio = function() {
    const val = prompt('请输入你的个性签名：', liveData.bio);
    if (val !== null) {
        liveData.bio = val;
        saveLiveData();
        renderLiveUI();
    }
}
