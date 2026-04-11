/* ==========================================================================
   全新社区 APP (Forum/Community) - 前端核心逻辑
   ========================================================================== */

let forumData = {
    posts: [],
    inbox: []
};

// 预设的占位图片库
const FORUM_IMG_PLACEHOLDERS = [
    'https://images.unsplash.com/photo-1544928147-79a2dbc1f389?q=80&w=600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1505682614136-0a12f9f7beea?q=80&w=600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1490730141103-6cac27aaab94?q=80&w=600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?q=80&w=600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=600&auto=format&fit=crop'
];

let currentForumCategory = 'all';
let currentForumPostId = null;

// ==========================================
// 1. 初始化与基础生命周期
// ==========================================
function initForumApp() {
    loadForumData();
    if (forumData.posts.length === 0) {
        generateInitialForumPosts();
    } else {
        renderForumFeed();
    }
    updateForumStats();
    updateForumInboxBadge();
    
    // 初始化个人信息 (同步自 My Beeper 主设)
    const myName = localStorage.getItem('my_realname') || localStorage.getItem('my_nickname') || 'Me';
    const myAvatar = localStorage.getItem('my_avatar_url') || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop';
    
    const elName = document.getElementById('forum-my-name');
    const elAvatar = document.getElementById('forum-my-avatar');
    if (elName) elName.innerText = myName;
    if (elAvatar) elAvatar.src = myAvatar;
}

window.openForumApp = function() {
    const el = document.getElementById('forumApp');
    if (el) {
        el.style.display = 'flex';
        // 关键：必须添加 .open 类才能触发 app-fullscreen-view 的显示和动画
        setTimeout(() => {
            el.classList.add('open');
        }, 10);
        initForumApp();
    }
}

window.closeForumApp = function() {
    const el = document.getElementById('forumApp');
    if (el) {
        el.classList.remove('open');
        // 等待动画结束后再隐藏
        setTimeout(() => {
            el.style.display = 'none';
        }, 300);
    }
}

function loadForumData() {
    try {
        const saved = localStorage.getItem('forumData_v1');
        if (saved) {
            forumData = JSON.parse(saved);
            // 数据迁移兼容
            if (!forumData.inbox) forumData.inbox = [];
        }
    } catch (e) {
        console.error("Failed to load forum data", e);
    }
}

function saveForumData() {
    localStorage.setItem('forumData_v1', JSON.stringify(forumData));
    updateForumStats();
    updateForumInboxBadge();
}

// ==========================================
// 2. 界面切换逻辑 (底栏 + 首页分类)
// ==========================================
window.forumSwitchMainTab = function(tabId, el) {
    // 底部高亮切换
    document.querySelectorAll('.fb-nav-item').forEach(nav => nav.classList.remove('active'));
    el.classList.add('active');

    // 页面显示隐藏
    document.querySelectorAll('.forum-tab-content').forEach(page => page.style.display = 'none');
    document.getElementById(`forum-tab-${tabId}`).style.display = 'block';

    // 动态标题
    const titleEl = document.getElementById('forum-header-title');
    if (tabId === 'home') titleEl.innerText = 'COMMUNITY';
    if (tabId === 'inbox') {
        titleEl.innerText = 'INBOX';
        renderForumInbox();
        clearForumInboxBadge(); // 点击后清空红点
    }
    if (tabId === 'my') {
        titleEl.innerText = 'MY PROFILE';
        renderForumMyPosts();
    }
}

window.forumSwitchCategory = function(catId, el) {
    currentForumCategory = catId;
    document.querySelectorAll('.forum-cat-item').forEach(cat => cat.classList.remove('active'));
    el.classList.add('active');
    
    // 平滑滚动居中当前点击项
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    
    if (catId === 'hot') {
        renderForumHotSearch();
    } else {
        renderForumFeed();
    }
}

// ==========================================
// 3. 渲染页面内容
// ==========================================
function renderForumFeed() {
    const listEl = document.getElementById('forum-feed-list');
    if (!listEl) return;

    let posts = forumData.posts;
    if (currentForumCategory !== 'all' && currentForumCategory !== 'hot') {
        posts = posts.filter(p => p.category === currentForumCategory);
    }

    // 按时间倒序
    posts.sort((a, b) => b.timestamp - a.timestamp);

    if (posts.length === 0) {
        listEl.innerHTML = `<div style="text-align:center; padding:60px 20px; color:#aaa; font-size:12px;">这里空空如也，来发第一篇帖子吧 ☁️</div>`;
        return;
    }

    let html = '';
    posts.forEach(p => {
        html += createForumPostCardHTML(p);
    });
    listEl.innerHTML = html;
}

function renderForumMyPosts() {
    const listEl = document.getElementById('forum-my-posts-list');
    if (!listEl) return;

    // 只展示自己发的内容 (假定作者名叫 Me)
    const myName = localStorage.getItem('my_realname') || localStorage.getItem('my_nickname') || 'Me';
    
    let posts = forumData.posts.filter(p => p.authorName === myName || p.authorName === 'Me');
    posts.sort((a, b) => b.timestamp - a.timestamp);

    if (posts.length === 0) {
        listEl.innerHTML = `<div style="text-align:center; padding:40px; color:#aaa; font-size:12px;">暂无发布内容</div>`;
        return;
    }

    let html = '';
    posts.forEach(p => {
        html += createForumPostCardHTML(p);
    });
    listEl.innerHTML = html;
}

function createForumPostCardHTML(post) {
    const dateStr = new Date(post.timestamp).toLocaleString('zh-CN', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
    const catName = getCategoryName(post.category);
    
    let imgHtml = '';
    if (post.imageUrl) {
        imgHtml = `<div class="fp-image-placeholder" style="background-image: url('${post.imageUrl}')"></div>`;
    }

    // 截取摘要
    let summary = post.content;
    if (summary.length > 80) summary = summary.substring(0, 80) + '...';

    return `
    <div class="forum-post-card" onclick="openForumPostDetail('${post.id}')">
        <div class="fp-cat-tag">${catName}</div>
        ${post.title ? `<div class="fp-title">${post.title}</div>` : ''}
        ${imgHtml}
        <div class="fp-summary">${summary}</div>
        <div class="fp-footer">
            <div class="fp-author-info" onclick="event.stopPropagation(); openForumUserProfile('${post.authorName}', '${post.authorAvatar}')">
                <img src="${post.authorAvatar}" class="fp-author-avatar">
                <div class="fp-author-name">${post.authorName}</div>
            </div>
            <div class="fp-meta">
                <div class="fp-meta-item"><i class="far fa-heart"></i> ${post.likes || 0}</div>
                <div class="fp-meta-item"><i class="far fa-comment"></i> ${post.comments ? post.comments.length : 0}</div>
            </div>
        </div>
    </div>
    `;
}

// ==========================================
// 热搜版块 (Hot Search)
// ==========================================
async function renderForumHotSearch() {
    const listEl = document.getElementById('forum-feed-list');
    if (!listEl) return;

    listEl.innerHTML = `<div style="text-align:center; padding:40px; color:#aaa; font-size:12px;"><i class="fas fa-spinner fa-spin"></i> 正在生成实时热搜榜...</div>`;

    const prompt = `
请生成5条虚拟社区的实时热搜词条，内容可以是搞笑的、悬疑的或者日常引发共鸣的。
要求输出严格的JSON数组格式，每条包含：
"title": 词条标题，简短吸引人
"heat": 热度值，例如 "984.2w" 或 "爆"、"新"

请只输出 JSON，不要有其他解释。格式如：
[{"title":"...", "heat":"..."}]
`;

    try {
        const aiResponse = await window.callAIRaw ? await window.callAIRaw(prompt, 500) : null;
        if (!aiResponse) throw new Error("AI没有返回内容");
        const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const rawHots = JSON.parse(jsonMatch[0]);
            let html = '<div class="forum-hot-container">';
            rawHots.forEach((h, idx) => {
                html += `
                <div class="forum-hot-item" onclick="forumGeneratePostsByHot('${h.title}')">
                    <div class="forum-hot-rank">${idx + 1}</div>
                    <div class="forum-hot-title">${h.title}</div>
                    <div class="forum-hot-heat">${h.heat}</div>
                </div>
                `;
            });
            html += '</div>';
            listEl.innerHTML = html;
        } else {
            throw new Error("无法解析JSON");
        }
    } catch (e) {
        console.error("生成热搜失败", e);
        listEl.innerHTML = `<div style="text-align:center; padding:40px; color:#aaa; font-size:12px;">生成热搜榜失败了，再试一次吧</div>`;
    }
}

window.forumGeneratePostsByHot = async function(keyword) {
    const listEl = document.getElementById('forum-feed-list');
    if (!listEl) return;
    listEl.innerHTML = `<div style="text-align:center; padding:40px; color:#aaa; font-size:12px;"><i class="fas fa-spinner fa-spin"></i> 正在加载关于「${keyword}」的讨论...</div>`;
    
    // 直接复用批量生成帖子的逻辑，只是加了特定关键词上下文
    const prompt = `
请围绕话题“${keyword}”生成3条虚拟社区帖子数据。
社区分区有：daily(日常), creative(同人创作), secret(树洞), market(闲置), urban(都市怪谈)。
要求输出严格的JSON数组格式，每条包含：
"category": 分区ID (上述英文之一)
"title": 帖子标题
"content": 帖子正文，字数在30-100字之间，包含对该话题的不同看法或经历。
"authorName": 发帖人昵称 (中文网名)

请只输出 JSON，不要有其他解释。格式如：
[{"category":"daily", "title":"...", "content":"...", "authorName":"..."}]
`;

    try {
        const aiResponse = await window.callAIRaw ? await window.callAIRaw(prompt, 1000) : null;
        if (!aiResponse) throw new Error("AI没有返回内容");
        const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const rawPosts = JSON.parse(jsonMatch[0]);
            let newPostsHtml = `<div style="padding:0 24px 10px; font-weight:800; font-size:16px;">🔍 关于「${keyword}」</div>`;
            rawPosts.forEach((rp, idx) => {
                const newPost = {
                    id: 'post_hot_' + Date.now() + '_' + idx,
                    category: rp.category,
                    title: rp.title,
                    content: rp.content,
                    authorName: rp.authorName,
                    authorAvatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${rp.authorName}`,
                    imageUrl: Math.random() > 0.5 ? FORUM_IMG_PLACEHOLDERS[Math.floor(Math.random() * FORUM_IMG_PLACEHOLDERS.length)] : '',
                    timestamp: Date.now() - Math.floor(Math.random() * 3600000), // 最近1小时内
                    likes: Math.floor(Math.random() * 200),
                    comments: []
                };
                forumData.posts.unshift(newPost);
                newPostsHtml += createForumPostCardHTML(newPost);
            });
            saveForumData();
            
            // 为了直接展示搜索结果，临时包在一个列表容器里
            listEl.innerHTML = `<div class="forum-feed-list" style="margin-top:0; padding-top:0;">${newPostsHtml}</div>`;
        } else {
            throw new Error("无法解析JSON");
        }
    } catch(e) {
        console.error("根据热搜生成帖子失败", e);
        listEl.innerHTML = `<div style="text-align:center; padding:40px; color:#aaa; font-size:12px;">加载失败，请重试</div>`;
    }
}

function getCategoryName(cat) {
    const map = {
        'daily': '日常分享',
        'creative': '同人创作',
        'secret': '匿名树洞',
        'market': '闲置黑市',
        'urban': '都市怪谈'
    };
    return map[cat] || '综合';
}

function updateForumStats() {
    const myName = localStorage.getItem('my_realname') || localStorage.getItem('my_nickname') || 'Me';
    const myPosts = forumData.posts.filter(p => p.authorName === myName || p.authorName === 'Me');
    
    const postCount = myPosts.length;
    let likeCount = 0;
    myPosts.forEach(p => likeCount += (p.likes || 0));

    const elPosts = document.getElementById('forum-stat-posts');
    const elLikes = document.getElementById('forum-stat-likes');
    
    if(elPosts) elPosts.innerText = postCount;
    if(elLikes) elLikes.innerText = likeCount;
}

// ==========================================
// 4. 帖子详情页
// ==========================================
window.openForumPostDetail = function(postId) {
    const post = forumData.posts.find(p => p.id === postId);
    if (!post) return;
    
    currentForumPostId = postId;
    const detailEl = document.getElementById('forumPostDetail');
    const contentEl = document.getElementById('forum-detail-content');
    const commentsEl = document.getElementById('forum-detail-comments');
    
    if (!detailEl || !contentEl || !commentsEl) return;

    const dateStr = new Date(post.timestamp).toLocaleString('zh-CN', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
    
    let imgHtml = '';
    if (post.imageUrl) {
        imgHtml = `<img src="${post.imageUrl}" class="fd-image">`;
    }

    contentEl.innerHTML = `
        <div class="fd-header-area">
            <div class="fd-cat">${getCategoryName(post.category)}</div>
            ${post.title ? `<div class="fd-title">${post.title}</div>` : ''}
            <div class="fd-author-row">
                <img src="${post.authorAvatar}" class="fd-avatar">
                <div>
                    <div class="fd-author-name">${post.authorName}</div>
                    <div class="fd-author-time">${dateStr}</div>
                </div>
            </div>
        </div>
        ${imgHtml}
        <div class="fd-content">${post.content}</div>
        <div style="display:flex; justify-content:center; margin-bottom:20px;">
            <button onclick="forumLikePost('${postId}')" style="background:#fff; border:1px solid #111; color:#111; padding:8px 24px; border-radius:20px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:8px;">
                <i class="fas fa-heart" style="${post.likedByMe ? 'color:#ff4d4f;' : ''}"></i> 
                <span id="fd-like-count">${post.likes || 0}</span>
            </button>
        </div>
    `;

    renderForumComments(postId);
    detailEl.style.display = 'flex';
}

window.closeForumPostDetail = function() {
    const detailEl = document.getElementById('forumPostDetail');
    if (detailEl) detailEl.style.display = 'none';
    currentForumPostId = null;
}

function renderForumComments(postId) {
    const post = forumData.posts.find(p => p.id === postId);
    const commentsEl = document.getElementById('forum-detail-comments');
    if (!commentsEl || !post) return;

    if (!post.comments || post.comments.length === 0) {
        commentsEl.innerHTML = `<div style="text-align:center; padding:20px; color:#aaa; font-size:12px;">暂无评论，来抢沙发吧</div>`;
        return;
    }

    let html = '';
    post.comments.forEach((c, idx) => {
        html += `
        <div class="fc-item">
            <img src="${c.avatar}" class="fc-avatar">
            <div class="fc-main">
                <div class="fc-header">
                    <span class="fc-name">${c.name}</span>
                    <span class="fc-floor">${idx + 1}F</span>
                </div>
                <div class="fc-content">${c.content}</div>
            </div>
        </div>
        `;
    });
    commentsEl.innerHTML = html;
}

window.forumLikePost = function(postId) {
    const post = forumData.posts.find(p => p.id === postId);
    if (!post) return;
    
    if (!post.likedByMe) {
        post.likes = (post.likes || 0) + 1;
        post.likedByMe = true;
    } else {
        post.likes = Math.max(0, (post.likes || 0) - 1);
        post.likedByMe = false;
    }
    saveForumData();
    
    const countEl = document.getElementById('fd-like-count');
    if (countEl) countEl.innerText = post.likes;
    
    // 渲染首页也能看到点赞数变化
    if (document.getElementById('forum-tab-home').style.display !== 'none') {
        renderForumFeed();
    }
}

// ==========================================
// 5. 评论与 AI 神回复 (重点核心 API 2)
// ==========================================
window.forumSubmitComment = async function() {
    if (!currentForumPostId) return;
    const inputEl = document.getElementById('forum-comment-input');
    const text = inputEl.value.trim();
    if (!text) return;

    const post = forumData.posts.find(p => p.id === currentForumPostId);
    if (!post) return;

    const myName = localStorage.getItem('my_realname') || localStorage.getItem('my_nickname') || 'Me';
    const myAvatar = localStorage.getItem('my_avatar_url') || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop';

    if (!post.comments) post.comments = [];
    
    // 添加自己发送的评论
    post.comments.push({
        name: myName,
        avatar: myAvatar,
        content: text,
        timestamp: Date.now()
    });
    
    inputEl.value = '';
    saveForumData();
    renderForumComments(currentForumPostId);

    // 触发 AI 神回复判定
    triggerAiForumReaction(post, text);
}

// 模拟 AI 神回复与消息通知
async function triggerAiForumReaction(post, userComment) {
    // 这里我们直接请求 AI 接口生成一个符合楼主/网友身份的回复
    const prompt = `
你是一个虚拟社区的网友。
当前帖子背景：
标题: ${post.title || '无'}
分类: ${getCategoryName(post.category)}
原帖内容: ${post.content}
发帖人: ${post.authorName}

刚才用户评论了: "${userComment}"

要求：
1. 扮演该发帖人，或者一个路过的其他网友，对用户的评论进行回复。
2. 语气要像真实的国内贴吧/豆瓣/小红书网友，可以嘴臭、可以友善、可以神回复。
3. 请直接输出回复的纯文本内容，不要包含任何其他说明。字数控制在50字以内。
`;

    try {
        const replyText = await window.callAIRaw ? await window.callAIRaw(prompt, 500) : null;
        if (replyText) {
            // 随机分配一个头像和名字给路人网友，如果 AI 扮演发帖人，就用发帖人的信息
            const isOp = Math.random() > 0.5; // 50% 概率是楼主回复
            const replyName = isOp ? post.authorName : `匿名网友${Math.floor(Math.random()*10000)}`;
            const replyAvatar = isOp ? post.authorAvatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`;

            // 写入评论
            post.comments.push({
                name: replyName,
                avatar: replyAvatar,
                content: replyText.trim(),
                timestamp: Date.now()
            });

            // 写入 Inbox 消息
            forumData.inbox.unshift({
                id: 'inbox_' + Date.now(),
                type: 'reply',
                fromName: replyName,
                fromAvatar: replyAvatar,
                content: `回复了你: ${replyText.trim()}`,
                postRef: post.content.substring(0, 20) + '...',
                postId: post.id,
                timestamp: Date.now(),
                isRead: false
            });

            saveForumData();
            
            // 如果用户还停留在当前帖子页，刷新评论区
            if (currentForumPostId === post.id) {
                renderForumComments(post.id);
            }
            // 更新红点
            updateForumInboxBadge();
        }
    } catch (e) {
        console.error("AI 社区回复失败", e);
    }
}


// ==========================================
// 6. Inbox 消息中心
// ==========================================
function renderForumInbox() {
    const listEl = document.getElementById('forum-inbox-list');
    if (!listEl) return;

    if (!forumData.inbox || forumData.inbox.length === 0) {
        listEl.innerHTML = `<div style="text-align:center; padding:40px; color:#ccc; font-size:12px;">暂无新消息</div>`;
        return;
    }

    let html = '';
    forumData.inbox.forEach(msg => {
        const dateStr = new Date(msg.timestamp).toLocaleString('zh-CN', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
        html += `
        <div class="inbox-item" onclick="openForumPostDetail('${msg.postId}')">
            <img src="${msg.fromAvatar}" class="inbox-avatar">
            <div class="inbox-content">
                <div class="inbox-header">
                    <span class="inbox-name">${msg.fromName}</span>
                    <span class="inbox-time">${dateStr}</span>
                </div>
                <div class="inbox-text">${msg.content}</div>
                <div class="inbox-post-ref">原帖: ${msg.postRef}</div>
            </div>
        </div>
        `;
    });
    listEl.innerHTML = html;
}

function updateForumInboxBadge() {
    const badge = document.getElementById('forum-inbox-badge');
    if (!badge) return;
    
    const unreadCount = (forumData.inbox || []).filter(m => !m.isRead).length;
    if (unreadCount > 0) {
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

function clearForumInboxBadge() {
    if (!forumData.inbox) return;
    forumData.inbox.forEach(m => m.isRead = true);
    saveForumData();
    updateForumInboxBadge();
}

// ==========================================
// 7. 发帖功能 (Create Post)
// ==========================================
window.forumCreatePost = function() {
    const modal = document.getElementById('forum-create-modal');
    if (modal) modal.classList.add('active');
}

window.closeForumCreateModal = function() {
    const modal = document.getElementById('forum-create-modal');
    if (modal) modal.classList.remove('active');
}

window.confirmForumCreatePost = async function() {
    const cat = document.getElementById('forum-create-cat').value;
    const title = document.getElementById('forum-create-title').value.trim();
    const content = document.getElementById('forum-create-content').value.trim();
    const imgDesc = document.getElementById('forum-create-img-desc').value.trim();
    
    if (!content) {
        alert("正文不能为空哦");
        return;
    }

    const myName = localStorage.getItem('my_realname') || localStorage.getItem('my_nickname') || 'Me';
    const myAvatar = localStorage.getItem('my_avatar_url') || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop';

    // 这里可以接入 AI 绘画生成配图 (预留功能)
    let finalImageUrl = '';
    if (imgDesc) {
        // 简单处理：随机拿一张占位图，真实情况应调用 window.generateImage()
        finalImageUrl = FORUM_IMG_PLACEHOLDERS[Math.floor(Math.random() * FORUM_IMG_PLACEHOLDERS.length)];
    }

    const newPost = {
        id: 'post_' + Date.now(),
        category: cat,
        title: title,
        content: content,
        imageUrl: finalImageUrl,
        authorName: myName,
        authorAvatar: myAvatar,
        timestamp: Date.now(),
        likes: 0,
        likedByMe: false,
        comments: []
    };

    forumData.posts.unshift(newPost);
    saveForumData();
    
    closeForumCreateModal();
    
    // 清空输入框
    document.getElementById('forum-create-title').value = '';
    document.getElementById('forum-create-content').value = '';
    document.getElementById('forum-create-img-desc').value = '';

    // 切回首页并渲染
    document.querySelector('.fb-nav-item:nth-child(1)').click();
}


// ==========================================
// 8. 虚拟用户主页与私信 (User Profile & DM)
// ==========================================
let currentForumChatUser = null;

window.openForumUserProfile = function(name, avatar) {
    // 阻止冒泡
    const profileEl = document.getElementById('forumUserProfile');
    if (!profileEl) return;
    
    document.getElementById('fup-name').innerText = name;
    document.getElementById('fup-avatar').src = avatar;
    currentForumChatUser = { name, avatar };
    
    // 渲染该用户发布的帖子（简单筛选或随机展示几条假的）
    const userPosts = forumData.posts.filter(p => p.authorName === name);
    const listEl = document.getElementById('fup-posts-list');
    
    if (userPosts.length > 0) {
        let html = '';
        userPosts.forEach(p => html += createForumPostCardHTML(p));
        listEl.innerHTML = html;
    } else {
        listEl.innerHTML = `<div style="text-align:center; padding:20px; color:#aaa; font-size:12px;">这个人很懒，什么都没发。</div>`;
    }
    
    profileEl.style.display = 'flex';
}

window.closeForumUserProfile = function() {
    const el = document.getElementById('forumUserProfile');
    if(el) el.style.display = 'none';
}

window.forumToggleFollow = function() {
    const btn = document.getElementById('fup-follow-btn');
    if(btn.innerText === '关注') {
        btn.innerText = '已关注';
        btn.style.background = '#f0f0f0';
        btn.style.color = '#111';
    } else {
        btn.innerText = '关注';
        btn.style.background = '#111';
        btn.style.color = '#fff';
    }
}

window.forumOpenChatFromProfile = function() {
    if (!currentForumChatUser) return;
    document.getElementById('forum-chat-title').innerText = currentForumChatUser.name;
    document.getElementById('forum-chat-messages').innerHTML = ''; // 清空之前的聊天
    document.getElementById('forumChatView').style.display = 'flex';
}

window.closeForumChat = function() {
    document.getElementById('forumChatView').style.display = 'none';
}

window.forumSendChatMessage = async function() {
    const inputEl = document.getElementById('forum-chat-input');
    const text = inputEl.value.trim();
    if (!text || !currentForumChatUser) return;
    
    const messagesEl = document.getElementById('forum-chat-messages');
    
    const myAvatar = localStorage.getItem('my_avatar_url') || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop';
    
    // 渲染我发的消息
    messagesEl.innerHTML += `
        <div class="chat-row sent">
            <div class="message-bubble sent">${text}</div>
            <img class="chat-avatar-img" src="${myAvatar}">
        </div>
    `;
    inputEl.value = '';
    messagesEl.scrollTop = messagesEl.scrollHeight;
    
    // 触发 AI 回复 (包括可能的随机事件)
    const isAd = Math.random() < 0.2; // 20%概率触发特殊事件，比如接广告
    
    let prompt = `
你是一个虚拟社区的用户，网名是"${currentForumChatUser.name}"。
正在私信聊天，刚才对方发来："${text}"

请直接给出回复的纯文本内容。
`;
    if (isAd) {
        prompt += `\n额外要求：这是一个绝佳的机会，请在回复中自然地带入一条离谱但搞笑的“恰饭广告”（比如推销某个奇葩产品、或者求对方扫码砍一刀等），让对话变得有趣。`;
    } else {
        prompt += `\n要求语气符合网友私信的真实感，可以闲聊、吐槽或热情回复。`;
    }

    try {
        const replyText = await window.callAIRaw ? await window.callAIRaw(prompt, 500) : null;
        if (replyText) {
            messagesEl.innerHTML += `
                <div class="chat-row received">
                    <img class="chat-avatar-img" src="${currentForumChatUser.avatar}">
                    <div class="message-bubble received">${replyText.trim()}</div>
                </div>
            `;
            messagesEl.scrollTop = messagesEl.scrollHeight;
            
            // 顺便把这对话写入 Inbox 留作记录
            forumData.inbox.unshift({
                id: 'dm_' + Date.now(),
                type: 'dm',
                fromName: currentForumChatUser.name,
                fromAvatar: currentForumChatUser.avatar,
                content: replyText.trim(),
                postRef: '私信对话',
                postId: '',
                timestamp: Date.now(),
                isRead: true // 当前正在看
            });
            saveForumData();
        }
    } catch(e) {
        console.error("私信回复失败", e);
    }
}

// ==========================================
// 9. 粉丝群聊系统 (Fan Group)
// ==========================================
window.forumOpenFanGroup = function() {
    currentForumChatUser = { name: "我的死忠粉交流群", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=group" };
    document.getElementById('forum-chat-title').innerText = "我的死忠粉群 (99+)";
    
    const messagesEl = document.getElementById('forum-chat-messages');
    messagesEl.innerHTML = `<div style="text-align:center; color:#aaa; font-size:12px; margin-bottom:15px;">你在群里发了条新消息，看看粉丝们什么反应吧</div>`;
    
    document.getElementById('forumChatView').style.display = 'flex';
}

// 改写原来的私信发送逻辑，如果是在群里发，就生成群聊式回复
const originalForumSendChatMessage = window.forumSendChatMessage;
window.forumSendChatMessage = async function() {
    if (currentForumChatUser && currentForumChatUser.name === "我的死忠粉交流群") {
        const inputEl = document.getElementById('forum-chat-input');
        const text = inputEl.value.trim();
        if (!text) return;
        
        const messagesEl = document.getElementById('forum-chat-messages');
        const myAvatar = localStorage.getItem('my_avatar_url') || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop';
        
        messagesEl.innerHTML += `
            <div class="chat-row sent">
                <div class="message-bubble sent">${text}</div>
                <img class="chat-avatar-img" src="${myAvatar}">
            </div>
        `;
        inputEl.value = '';
        messagesEl.scrollTop = messagesEl.scrollHeight;

        // 让 AI 生成多条群友的反应
        const prompt = `
我现在在一个以我为偶像/大V的粉丝群里发了一句话："${text}"。
请生成 3-5 条群友的接连回复。
群友可以是脑残粉、理智粉、或者爱调侃的黑粉。
要求输出严格的JSON数组格式，每条包含：
"name": 群友网名
"content": 回复内容，简短真实

请只输出 JSON，不要有其他解释。格式如：
[{"name":"...", "content":"..."}]
`;
        try {
            const aiResponse = await window.callAIRaw ? await window.callAIRaw(prompt, 800) : null;
            if (aiResponse) {
                const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    const replies = JSON.parse(jsonMatch[0]);
                    
                    // 逐条延迟显示，增加真实感
                    replies.forEach((reply, idx) => {
                        setTimeout(() => {
                            messagesEl.innerHTML += `
                                <div class="chat-row received" style="flex-direction:column; align-items:flex-start; margin-bottom:15px;">
                                    <div style="font-size:10px; color:#888; margin-left:46px; margin-bottom:4px;">${reply.name}</div>
                                    <div style="display:flex; align-items:flex-end;">
                                        <img class="chat-avatar-img" src="https://api.dicebear.com/7.x/avataaars/svg?seed=${reply.name}">
                                        <div class="message-bubble received">${reply.content}</div>
                                    </div>
                                </div>
                            `;
                            messagesEl.scrollTop = messagesEl.scrollHeight;
                        }, (idx + 1) * 1200); // 间隔1.2秒出现一条
                    });
                }
            }
        } catch(e) {
            console.error("粉丝群回复生成失败", e);
        }
        return;
    }
    
    // 不是群聊走原本的私信逻辑
    originalForumSendChatMessage();
}

// ==========================================
// 10. 手动触发 AI 批量刷新帖子
// ==========================================
window.forumGenerateRandomPosts = async function() {
    const listEl = document.getElementById('forum-feed-list');
    if(listEl) listEl.innerHTML = `<div style="text-align:center; padding:40px; color:#aaa; font-size:12px;"><i class="fas fa-spinner fa-spin"></i> 正在召唤平行宇宙的网友发帖...</div>`;
    
    // 直接复用初始化的生成逻辑
    await generateInitialForumPosts();
}

// ==========================================
// 11. 初始化生成虚拟社区数据 (核心 API 1)
// ==========================================
async function generateInitialForumPosts() {
    // 如果没有数据，使用 AI 批量生成一些帖子
    const listEl = document.getElementById('forum-feed-list');
    if(listEl) listEl.innerHTML = `<div style="text-align:center; padding:40px; color:#aaa; font-size:12px;"><i class="fas fa-spinner fa-spin"></i> 正在连接虚拟社区...</div>`;

    const prompt = `
你是一个虚拟世界数据生成器。请为虚拟社区生成5条帖子数据。
社区分区有：daily(日常), creative(同人创作), secret(树洞), market(闲置), urban(都市怪谈)。
要求输出严格的JSON数组格式，每条包含：
"category": 分区ID (上述英文之一)
"title": 帖子标题
"content": 帖子正文，字数在30-100字之间，语气符合分区特点。
"authorName": 发帖人昵称 (中文网名)

请只输出 JSON，不要有其他解释。格式如：
[{"category":"daily", "title":"...", "content":"...", "authorName":"..."}]
`;

    try {
        const aiResponse = await window.callAIRaw ? await window.callAIRaw(prompt, 1000) : null; 
        // 简易正则提取 JSON
        const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const rawPosts = JSON.parse(jsonMatch[0]);
            rawPosts.forEach((rp, idx) => {
                forumData.posts.push({
                    id: 'post_init_' + idx,
                    category: rp.category,
                    title: rp.title,
                    content: rp.content,
                    authorName: rp.authorName,
                    authorAvatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${rp.authorName}`,
                    imageUrl: Math.random() > 0.5 ? FORUM_IMG_PLACEHOLDERS[Math.floor(Math.random() * FORUM_IMG_PLACEHOLDERS.length)] : '',
                    timestamp: Date.now() - Math.floor(Math.random() * 100000000),
                    likes: Math.floor(Math.random() * 50),
                    comments: []
                });
            });
            saveForumData();
            renderForumFeed();
        }
    } catch (e) {
        console.error("生成初始社区数据失败", e);
        // 如果失败，塞两条硬编码假数据兜底
        forumData.posts = [{
            id: 'post_fallback_1', category: 'daily', title: '今天的天气好好', content: '忍不住出来喝杯咖啡，这世界还是很美好的~', authorName: '冰美式', authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=A', timestamp: Date.now(), likes: 12, comments: []
        }];
        saveForumData();
        renderForumFeed();
    }
}
