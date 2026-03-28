/* ============================================================
   app_moments.js - 朋友圈完整功能模块
   依赖: apps.js (friendsData, momentsFeed, IDB, etc.)
   ============================================================ */

// ============================================================
// 常量 & 状态
// ============================================================
const MOMENTS_FAVORITES_KEY = 'myCoolPhone_momentsFavorites';
const MOMENTS_NPC_KEY       = 'myCoolPhone_momentsNpcLib';

let momentsFavorites = [];      // 收藏的动态 ID 列表
let npcLibrary       = [];      // NPC 角色库
let _ivImages        = [];      // 图片查看器当前图片列表
let _ivIndex         = 0;       // 当前查看的图片索引
let _ivTouchStartX   = 0;       // 触摸起始 X

// 朋友圈自动发帖定时器
let _aiPostTimer = null;

// ============================================================
// 初始化
// ============================================================
function initMomentsModule() {
    loadMomentsFavorites();
    loadNpcLibrary();
    buildImageViewer();
    buildFavoritesPage();
    buildNpcSummonModal();
    bindMomentsTabEnter();
    scheduleAiProactivePost();
}

document.addEventListener('DOMContentLoaded', initMomentsModule);

// ============================================================
// 数据持久化
// ============================================================
function loadMomentsFavorites() {
    try {
        momentsFavorites = JSON.parse(localStorage.getItem(MOMENTS_FAVORITES_KEY) || '[]');
    } catch(e) { momentsFavorites = []; }
}
function saveMomentsFavorites() {
    localStorage.setItem(MOMENTS_FAVORITES_KEY, JSON.stringify(momentsFavorites));
}

function loadNpcLibrary() {
    try {
        npcLibrary = JSON.parse(localStorage.getItem(MOMENTS_NPC_KEY) || '[]');
    } catch(e) { npcLibrary = []; }
}
function saveNpcLibrary() {
    localStorage.setItem(MOMENTS_NPC_KEY, JSON.stringify(npcLibrary));
}

// ============================================================
// 增强版 renderMomentsFeed（完全覆盖 apps.js 中的旧版）
// ============================================================
window.renderMomentsFeed = function() {
    const list = document.getElementById('moments-feed-list');
    if (!list) return;
    list.innerHTML = '';

    if (!momentsFeed || !momentsFeed.length) {
        list.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#ccc;font-size:13px;"><i class="fas fa-images" style="font-size:40px;margin-bottom:12px;display:block;"></i>还没有动态，发一条吧~</div>';
        return;
    }

    const sorted = [...momentsFeed].sort((a, b) => (b.time || 0) - (a.time || 0));
    sorted.forEach(m => renderOneMomentCard(m, list));
};

function renderOneMomentCard(m, container) {
    const f = (typeof friendsData !== 'undefined' && friendsData[m.authorId]) || {};
    const displayName = m.authorId === 'ME'
        ? (getCurrentPersonaName())
        : (f.remark || f.realName || m.authorId);

    const avatar = m.authorId === 'ME'
        ? (getCurrentPersonaAvatar())
        : (f.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.realName || m.authorId}`);

    const likeCount  = m.likeCount  || 0;
    const likedClass = m.likedByMe  ? 'liked' : '';
    const isFaved    = momentsFavorites.includes(m.id);
    const timeText   = m.time ? formatMomentTime(m.time) : '';
    const isOwner    = m.authorId === 'ME';

    // ---- 图片区域 ----
    const imgs = (m.images || []).slice(0, 9);
    const count = imgs.length;
    let gridClass = '';
    if (count === 1) gridClass = 'grid-1';
    else if (count <= 4) gridClass = 'grid-2';
    else gridClass = 'grid-3';

    // 收集真实图片 URL 列表（用于全屏查看器）
    const realUrls = imgs.filter(i => i.url).map(i => i.url);

    const imagesHtml = imgs.map((img, idx) => {
        if (img.isAI) {
            const safe = (img.desc || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
            return `<div class="moment-image-ai" data-desc="${safe}" onclick="this.classList.toggle('revealed'); if(this.classList.contains('revealed')){this.innerHTML=this.getAttribute('data-desc').replace(/\\n/g,'<br>');} else {this.innerHTML='';}" ></div>`;
        }
        if (img.url) {
            const safeUrl = img.url.replace(/"/g, '&quot;');
            const dataIdx = realUrls.indexOf(img.url);
            if (count === 1) {
                return `<img src="${safeUrl}" class="single-img" onclick="openImageViewer(${JSON.stringify(realUrls)},${dataIdx})" loading="lazy">`;
            }
            return `<div class="moment-img-wrap"><img src="${safeUrl}" onclick="openImageViewer(${JSON.stringify(realUrls)},${dataIdx})" loading="lazy"></div>`;
        }
        // 文字图类型
        if (img.type === 'textimg') {
            const safeVisible = (img.visible || '').replace(/</g,'&lt;');
            const safeHidden  = (img.hidden  || '').replace(/</g,'&lt;');
            return `<div class="moment-text-img-card" onclick="toggleTextImg(this,'${encodeURIComponent(img.hidden||'')}')">
                        <span>${safeVisible}</span>
                    </div>
                    <div class="moment-text-img-hidden" id="tih_${m.id}_${idx}">${safeHidden}</div>`;
        }
        return '';
    }).join('');

    // ---- 文本区域（支持翻译分隔）----
    const TSEP = '___TRANSLATION_SEP___';
    let safeText = '';
    const rawText = (m.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (rawText.includes(TSEP)) {
        const parts = rawText.split(TSEP);
        safeText = `<div>${parts[0].trim().replace(/\n/g,'<br>')}</div>
                    <div style="margin-top:8px;padding-top:8px;border-top:1px dashed #eee;color:#999;font-size:12px;">${parts[1].trim().replace(/\n/g,'<br>')}</div>`;
    } else {
        safeText = rawText.replace(/\n/g, '<br>');
    }

    // ---- 评论区 ----
    const commentsHtml = (m.comments || []).map(c => {
        const safeAuthor = (c.authorName || c.authorId || '').replace(/</g,'&lt;');
        const safeBody   = (c.text || '').replace(/</g,'&lt;');
        const aiCls      = c.isAI ? 'moment-comment-ai' : '';
        const replyPrefix = c.replyToName
            ? `<span class="moment-comment-reply">↩ ${c.replyToName.replace(/</g,'&lt;')}：</span>`
            : '';
        return `<div class="moment-comment ${aiCls}" data-cid="${c.id}"
                    onclick="mc_handleCommentClick(event,'${m.id}','${c.id}','${safeAuthor}','${c.authorId}')"
                    oncontextmenu="handleCommentAdmin(event,'${m.id}','${c.id}');return false;"
                    ontouchstart="this._lp=setTimeout(()=>handleCommentAdmin(event,'${m.id}','${c.id}'),600)"
                    ontouchend="clearTimeout(this._lp)" ontouchmove="clearTimeout(this._lp)">
                    <span class="moment-comment-author">${safeAuthor}</span>${replyPrefix}：<span class="moment-comment-text">${safeBody}</span>
                </div>`;
    }).join('');

    // ---- 可见性标签 ----
    let visibilityHtml = '';
    if (m.visibility === 'private') {
        visibilityHtml = `<span class="moment-privacy-badge">🔒 仅自己</span>`;
    } else if (m.allowedViewers && m.allowedViewers.length < Object.keys(friendsData || {}).length) {
        visibilityHtml = `<span class="moment-privacy-badge">👥 部分可见</span>`;
    }

    // ---- 卡片 ----
    const card = document.createElement('div');
    card.className = 'moment-card';
    card.setAttribute('data-moment-id', m.id);

    card.innerHTML = `
        <div class="moment-avatar"><img src="${avatar}" loading="lazy"></div>
        <div class="moment-content">
            <div class="moment-name-row">
                <div class="moment-name">${displayName}</div>
                <div class="moment-card-actions">
                    <i class="fas fa-users moment-summon-btn" title="召唤NPC团建" style="color:#ff7e67;cursor:pointer;padding:4px;" onclick="openNpcSummonModal('${m.id}')"></i>
                    ${isOwner ? `<i class="fas fa-edit" onclick="editMoment('${m.id}')"></i>` : ''}
                    ${isOwner ? `<i class="fas fa-trash" onclick="deleteMoment('${m.id}')"></i>` : ''}
                </div>
            </div>
            <div class="moment-text">${safeText}</div>
            <div class="moment-images ${gridClass}">${imagesHtml}</div>
            <div class="moment-meta">
                <div class="moment-meta-left">
                    <span>${timeText}</span>
                    ${visibilityHtml}
                    ${m.allowCommentView === false ? '<span class="moment-privacy-badge">💬 评论不可见</span>' : ''}
                </div>
                <div style="display:flex;gap:6px;align-items:center;">
                    <div class="moment-fav-btn ${isFaved ? 'favorited' : ''}" onclick="toggleMomentFavorite('${m.id}')">
                        <i class="fa${isFaved ? 's' : 'r'} fa-star"></i>
                    </div>
                    <div class="moment-like-pill ${likedClass}" onclick="toggleMomentLike('${m.id}')">
                        <i class="fas fa-heart"></i><span>${likeCount}</span>
                    </div>
                </div>
            </div>
            <div class="moment-comments" id="mc_${m.id}">${commentsHtml}</div>
            <div id="reply-hint-${m.id}" style="display:none;" class="moment-reply-hint">
                <span></span>
                <i class="fas fa-times" style="cursor:pointer;" onclick="mc_cancelReply('${m.id}')"></i>
            </div>
            <div class="moment-comment-input-row" style="position:relative;">
                <div class="mention-dropdown" id="mention-${m.id}" style="display:none;"></div>
                <input type="text" class="moment-comment-input" id="ci_${m.id}"
                    placeholder="评论..."
                    oninput="mc_onInput(event,'${m.id}')"
                    onkeydown="if(event.key==='Enter'){event.preventDefault();addMomentComment('${m.id}');}">
                <button type="button" onclick="addMomentComment('${m.id}')">发送</button>
            </div>
        </div>
        <div class="moment-swipe-delete" onclick="deleteMoment('${m.id}')"><i class="fas fa-trash" style="margin-right:4px;"></i>删除</div>
    `;

    // 左滑手势绑定
    bindSwipeGesture(card, m.id);

    if (container) container.appendChild(card);
    return card;
}

// ============================================================
// 时间格式化
// ============================================================
function formatMomentTime(ts) {
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60000)   return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff/60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff/86400000)}天前`;
    return new Date(ts).toLocaleDateString('zh-CN');
}

// ============================================================
// 获取当前角色 名/头像
// ============================================================
function getCurrentPersonaName() {
    if (typeof personasMeta !== 'undefined' && typeof currentPersonaId !== 'undefined' && personasMeta[currentPersonaId]) {
        return personasMeta[currentPersonaId].name || 'Me';
    }
    return 'Me';
}
function getCurrentPersonaAvatar() {
    if (typeof personasMeta !== 'undefined' && typeof currentPersonaId !== 'undefined' && personasMeta[currentPersonaId]) {
        return personasMeta[currentPersonaId].avatar || '';
    }
    return '';
}

// ============================================================
// 左滑删除手势
// ============================================================
function bindSwipeGesture(card, momentId) {
    let startX = 0, startY = 0, swiped = false;

    card.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        swiped = false;
    }, { passive: true });

    card.addEventListener('touchmove', e => {
        const dx = e.touches[0].clientX - startX;
        const dy = Math.abs(e.touches[0].clientY - startY);
        if (dy > 20) return; // 竖向滚动优先
        if (dx < -40 && !swiped) {
            swiped = true;
            // 只对自己发的或允许管理的卡片才触发左滑
            const m = (typeof momentsFeed !== 'undefined') ? momentsFeed.find(x => x.id === momentId) : null;
            if (m) {
                card.classList.add('swiped-left');
            }
        } else if (dx > 20) {
            card.classList.remove('swiped-left');
        }
    }, { passive: true });

    card.addEventListener('touchend', () => {
        // 点击其他卡片时，关闭当前已滑开的
    });

    // 点击其他地方关闭
    document.addEventListener('touchstart', function closeSwiped(e) {
        if (!card.contains(e.target)) {
            card.classList.remove('swiped-left');
        }
    }, { passive: true });
}

// ============================================================
// 评论 @mention 支持
// ============================================================
window.mc_onInput = function(e, momentId) {
    const val = e.target.value;
    const dropdown = document.getElementById(`mention-${momentId}`);
    if (!dropdown) return;

    const atIdx = val.lastIndexOf('@');
    if (atIdx >= 0) {
        const query = val.slice(atIdx + 1).toLowerCase();
        const friends = Object.keys(typeof friendsData !== 'undefined' ? friendsData : {});
        const matched = friends.filter(id => {
            const f = friendsData[id];
            const name = (f.remark || f.realName || id).toLowerCase();
            return name.includes(query);
        });

        if (matched.length) {
            dropdown.innerHTML = matched.map(id => {
                const f = friendsData[id];
                const name = f.remark || f.realName || id;
                const av = f.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`;
                return `<div class="mention-item" onclick="mc_insertMention('${momentId}','${name}','${id}')">
                    <img src="${av}"><span>${name}</span>
                </div>`;
            }).join('');
            dropdown.style.display = 'block';
            return;
        }
    }
    dropdown.style.display = 'none';
};

window.mc_insertMention = function(momentId, name, id) {
    const input = document.getElementById(`ci_${momentId}`);
    const dropdown = document.getElementById(`mention-${momentId}`);
    if (!input) return;
    const val = input.value;
    const atIdx = val.lastIndexOf('@');
    input.value = val.slice(0, atIdx) + `@${name} `;
    if (dropdown) dropdown.style.display = 'none';
    input.focus();
};

// ============================================================
// 点击评论 → 设置回复目标
// ============================================================
window.mc_handleCommentClick = function(e, momentId, commentId, authorName, authorId) {
    e.stopPropagation();
    if (authorId === 'ME') return;

    const hint = document.getElementById(`reply-hint-${momentId}`);
    const input = document.getElementById(`ci_${momentId}`);
    if (!hint || !input) return;

    // 如果点的是已经正在回复的，就取消
    if (hint.style.display !== 'none' && hint.dataset.cid === commentId) {
        mc_cancelReply(momentId);
        return;
    }

    hint.style.display = 'flex';
    hint.querySelector('span').innerText = `回复 ${authorName}`;
    hint.dataset.cid = commentId;
    hint.dataset.aid = authorId;
    hint.dataset.aname = authorName;
    input.placeholder = `回复 ${authorName}...`;
    input.focus();
};

window.mc_cancelReply = function(momentId) {
    const hint = document.getElementById(`reply-hint-${momentId}`);
    const input = document.getElementById(`ci_${momentId}`);
    if (hint) { hint.style.display = 'none'; hint.dataset.cid = ''; hint.dataset.aid = ''; }
    if (input) input.placeholder = '评论...';
    // 清除全局 currentReplyTarget
    if (typeof currentReplyTarget !== 'undefined') window.currentReplyTarget = null;
};

// ============================================================
// 覆盖 addMomentComment（增强版，支持 @mentions 和楼中楼）
// ============================================================
window.addMomentComment = function(momentId) {
    const input = document.getElementById(`ci_${momentId}`);
    const hint  = document.getElementById(`reply-hint-${momentId}`);
    if (!input) return;

    let text = (input.value || '').trim();
    if (!text) return;

    const m = (typeof momentsFeed !== 'undefined') ? momentsFeed.find(x => x.id === momentId) : null;
    if (!m) return;
    if (!m.comments) m.comments = [];

    // 关闭 mention 下拉
    const dd = document.getElementById(`mention-${momentId}`);
    if (dd) dd.style.display = 'none';

    let replyToId   = null;
    let replyToName = null;
    let isReply     = false;

    if (hint && hint.style.display !== 'none' && hint.dataset.aid) {
        replyToId   = hint.dataset.aid;
        replyToName = hint.dataset.aname;
        isReply = true;
    }

    const comment = {
        id: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2,4),
        authorId: 'ME',
        authorName: getCurrentPersonaName(),
        text: text,
        isAI: false,
        time: Date.now(),
        replyToId:   replyToId   || undefined,
        replyToName: replyToName || undefined
    };

    m.comments.push(comment);
    input.value = '';
    mc_cancelReply(momentId);

    if (typeof saveMomentsFeed === 'function') saveMomentsFeed();
    renderMomentsFeed();

    // 触发 AI 回复
    if (isReply && replyToId && typeof friendsData !== 'undefined' && friendsData[replyToId]) {
        _triggerAiCommentReply(m, replyToId, text, `用户回复了你的评论`);
    } else {
        // 朋友圈作者回复
        if (m.authorId !== 'ME' && typeof friendsData !== 'undefined' && friendsData[m.authorId]) {
            _triggerAiCommentReply(m, m.authorId, text, '用户在你的帖子下评论了');
        }
        // 围观好友随机插话（20%概率）
        _triggerBystanderReaction(m, text);
    }

    // 新评论 → 增加未读数（如果朋友圈作者是AI）
    if (m.authorId !== 'ME' && typeof addMomentsUnreadCount === 'function') {
        // 不加，因为是自己评论，只有对方回复才加
    }
};

async function _triggerAiCommentReply(moment, aiId, userText, ctx) {
    const friend = (typeof friendsData !== 'undefined') ? friendsData[aiId] : null;
    if (!friend) return;
    const delay = Math.floor(Math.random() * 4000) + 2000;
    setTimeout(async () => {
        const settingsJSON = localStorage.getItem('myCoolPhone_aiSettings');
        if (!settingsJSON) return;
        const settings = JSON.parse(settingsJSON);
        let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
        const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
        const prompt = `You are ${friend.realName}. Persona: ${friend.persona}. Context: ${ctx}. Original post: "${moment.text}". User said: "${userText}". Reply briefly and casually (1-2 sentences). Output ONLY the reply text.`;
        try {
            const res = await fetch(apiUrl, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${settings.apiKey}`}, body: JSON.stringify({ model:settings.model, messages:[{role:'user',content:prompt}], temperature:0.85 }) });
            const data = await res.json();
            let reply = (data?.choices?.[0]?.message?.content || '').trim();
            if (reply) {
                if (typeof addAiCommentToMoment === 'function') {
                    addAiCommentToMoment(moment.id, aiId, reply);
                } else {
                    _addAiComment(moment.id, aiId, reply);
                }
                if (typeof addMomentsUnreadCount === 'function') addMomentsUnreadCount(1);
            }
        } catch(e) { console.warn('AI comment reply failed', e); }
    }, delay);
}

function _triggerBystanderReaction(moment, userText) {
    if (typeof friendsData === 'undefined') return;
    Object.keys(friendsData).forEach(aiId => {
        if (aiId === moment.authorId) return;
        if (Math.random() > 0.8) {
            _triggerAiCommentReply(moment, aiId, userText, `用户在帖子下发表了评论，你是围观的好友，可以插话或起哄`);
        }
    });
}

function _addAiComment(momentId, aiId, text) {
    const m = (typeof momentsFeed !== 'undefined') ? momentsFeed.find(x => x.id === momentId) : null;
    if (!m) return;
    if (!m.comments) m.comments = [];
    const friend = (typeof friendsData !== 'undefined') ? friendsData[aiId] : {};
    m.comments.push({
        id: 'c_' + Date.now() + Math.random(),
        authorId: aiId,
        authorName: (friend.remark || friend.realName || aiId),
        text: text,
        isAI: true,
        time: Date.now()
    });
    if (typeof saveMomentsFeed === 'function') saveMomentsFeed();
    renderMomentsFeed();
}

// ============================================================
// 收藏 / 我的收藏
// ============================================================
window.toggleMomentFavorite = function(momentId) {
    const idx = momentsFavorites.indexOf(momentId);
    if (idx >= 0) {
        momentsFavorites.splice(idx, 1);
        if (typeof showToast === 'function') showToast('已取消收藏');
    } else {
        momentsFavorites.push(momentId);
        if (typeof showToast === 'function') showToast('<i class="fas fa-star" style="color:#f59e0b"></i> 已收藏');
    }
    saveMomentsFavorites();
    renderMomentsFeed();
};

window.openMomentsFavoritesPage = function() {
    const page = document.getElementById('moments-favorites-page');
    if (!page) return;
    renderFavoritesPage();
    page.classList.add('show');
};

window.closeMomentsFavoritesPage = function() {
    const page = document.getElementById('moments-favorites-page');
    if (page) page.classList.remove('show');
};

function renderFavoritesPage() {
    const container = document.getElementById('fav-moments-list');
    if (!container) return;
    container.innerHTML = '';

    const favs = (typeof momentsFeed !== 'undefined') ? momentsFeed.filter(m => momentsFavorites.includes(m.id)) : [];
    if (!favs.length) {
        container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#ccc;font-size:13px;"><i class="fas fa-star" style="font-size:36px;margin-bottom:12px;display:block;color:#f5dca0;"></i>还没有收藏~</div>';
        return;
    }
    favs.sort((a,b)=>(b.time||0)-(a.time||0)).forEach(m => renderOneMomentCard(m, container));
}

function buildFavoritesPage() {
    if (document.getElementById('moments-favorites-page')) return;
    const page = document.createElement('div');
    page.id = 'moments-favorites-page';
    page.innerHTML = `
        <div class="fav-page-header">
            <i class="fas fa-chevron-left" style="cursor:pointer;" onclick="closeMomentsFavoritesPage()"></i>
            <span>我的收藏</span>
        </div>
        <div id="fav-moments-list" style="padding:8px 0;"></div>
    `;
    // 挂在 wechatApp 下
    const app = document.getElementById('wechatApp');
    if (app) app.appendChild(page);
}

// ============================================================
// 全屏图片查看器
// ============================================================
function buildImageViewer() {
    if (document.getElementById('moments-image-viewer')) return;
    const div = document.createElement('div');
    div.id = 'moments-image-viewer';
    div.innerHTML = `
        <div class="miv-close" onclick="closeImageViewer()"><i class="fas fa-times"></i></div>
        <div class="miv-nav left" id="miv-left" onclick="mivPrev()"><i class="fas fa-chevron-left"></i></div>
        <img class="miv-main-img" id="miv-img" src="" alt="">
        <div class="miv-nav right" id="miv-right" onclick="mivNext()"><i class="fas fa-chevron-right"></i></div>
        <div class="miv-dots" id="miv-dots"></div>
        <div class="miv-counter" id="miv-counter"></div>
    `;
    // 触摸滑动
    div.addEventListener('touchstart', e => { _ivTouchStartX = e.touches[0].clientX; }, { passive: true });
    div.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - _ivTouchStartX;
        if (dx < -50) mivNext();
        else if (dx > 50) mivPrev();
    });
    // 点击背景关闭
    div.addEventListener('click', e => { if (e.target === div) closeImageViewer(); });
    document.body.appendChild(div);
}

window.openImageViewer = function(urls, startIndex) {
    if (!urls || !urls.length) return;
    _ivImages = Array.isArray(urls) ? urls : [urls];
    _ivIndex  = startIndex || 0;
    mivRender();
    document.getElementById('moments-image-viewer').classList.add('active');
};

window.closeImageViewer = function() {
    const el = document.getElementById('moments-image-viewer');
    if (el) el.classList.remove('active');
};

function mivRender() {
    const img     = document.getElementById('miv-img');
    const counter = document.getElementById('miv-counter');
    const dots    = document.getElementById('miv-dots');
    const left    = document.getElementById('miv-left');
    const right   = document.getElementById('miv-right');

    if (img) img.src = _ivImages[_ivIndex] || '';
    if (counter) counter.innerText = _ivImages.length > 1 ? `${_ivIndex + 1} / ${_ivImages.length}` : '';
    if (left)  left.style.display  = _ivImages.length > 1 ? '' : 'none';
    if (right) right.style.display = _ivImages.length > 1 ? '' : 'none';

    if (dots) {
        dots.innerHTML = _ivImages.map((_, i) =>
            `<div class="miv-dot ${i === _ivIndex ? 'active' : ''}"></div>`
        ).join('');
    }
}

window.mivPrev = function() { if (_ivIndex > 0) { _ivIndex--; mivRender(); } };
window.mivNext = function() { if (_ivIndex < _ivImages.length - 1) { _ivIndex++; mivRender(); } };

// ============================================================
// 文字图切换
// ============================================================
window.toggleTextImg = function(cardEl, encodedHidden) {
    const hidden = decodeURIComponent(encodedHidden);
    // 找下一个兄弟节点（隐藏文字容器）
    const next = cardEl.nextElementSibling;
    if (!next || !next.classList.contains('moment-text-img-hidden')) return;
    if (next.style.display === 'block') {
        next.style.display = 'none';
    } else {
        next.innerHTML = hidden.replace(/\n/g, '<br>');
        next.style.display = 'block';
    }
};

// ============================================================
// 增强版发布弹窗（多图、文字图、可见性、评论区权限）
// ============================================================
let _pmImages = [];   // 发布时暂存的图片列表 {type:'real'|'ai'|'textimg', url?, desc?, visible?, hidden?}

window.openPostMomentModal = function() {
    const modal = document.getElementById('post-moment-modal');
    if (!modal) return;

    _pmImages = [];
    document.getElementById('pm-text').value = '';
    document.getElementById('pm-images-preview').innerHTML = '';
    // 重置为默认发布模式
    const visToggle = document.getElementById('pm-visibility-all');
    if (visToggle) visToggle.checked = true;
    const commentToggle = document.getElementById('pm-allow-comment-view');
    if (commentToggle) commentToggle.checked = true;

    _renderPmVisibilityList();
    _refreshPmPreview();
    modal.classList.add('active');
};

window.closePostMomentModal = function() {
    const modal = document.getElementById('post-moment-modal');
    if (modal) modal.classList.remove('active');
};

// 多图上传
window.handlePmMultiImage = function(input) {
    if (!input.files || !input.files.length) return;
    Array.from(input.files).slice(0, 9 - _pmImages.length).forEach(file => {
        const reader = new FileReader();
        reader.onload = e => {
            _pmImages.push({ type: 'real', url: e.target.result });
            _refreshPmPreview();
        };
        reader.readAsDataURL(file);
    });
    input.value = '';
};

// 添加 AI 图描述
window.addPmAiImage = function() {
    const desc = prompt('描述这张图片（AI 会根据描述展示意境图）:');
    if (!desc) return;
    _pmImages.push({ type: 'ai', desc: desc });
    _refreshPmPreview();
};

// 添加文字图
window.addPmTextImg = function() {
    const visible = prompt('「文字图」表面显示的文字（吸引人点开）:');
    if (!visible) return;
    const hidden = prompt('点开后显示的隐藏内容（剧情/悄悄话）:');
    if (hidden === null) return;
    _pmImages.push({ type: 'textimg', visible, hidden });
    _refreshPmPreview();
};

function _refreshPmPreview() {
    const container = document.getElementById('pm-images-preview');
    if (!container) return;
    container.innerHTML = _pmImages.map((img, i) => {
        if (img.type === 'real') {
            return `<div class="pm-img-thumb-wrap">
                <img class="pm-img-thumb" src="${img.url}">
                <div class="pm-img-remove" onclick="pmRemoveImage(${i})"><i class="fas fa-times"></i></div>
            </div>`;
        }
        if (img.type === 'ai') {
            return `<div class="pm-img-thumb-wrap">
                <div class="pm-img-thumb" style="background:#e0e0e0;display:flex;align-items:center;justify-content:center;font-size:10px;color:#999;text-align:center;padding:4px;">${(img.desc||'').slice(0,20)}</div>
                <div class="pm-img-remove" onclick="pmRemoveImage(${i})"><i class="fas fa-times"></i></div>
            </div>`;
        }
        if (img.type === 'textimg') {
            return `<div class="pm-img-thumb-wrap">
                <div class="pm-img-thumb" style="background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;text-align:center;padding:4px;">${(img.visible||'').slice(0,12)}</div>
                <div class="pm-img-remove" onclick="pmRemoveImage(${i})"><i class="fas fa-times"></i></div>
            </div>`;
        }
        return '';
    }).join('');

    if (_pmImages.length < 9) {
        container.innerHTML += `<div class="pm-add-more-btn" onclick="document.getElementById('pm-multi-file').click()"><i class="fas fa-plus"></i></div>`;
    }
}

window.pmRemoveImage = function(idx) {
    _pmImages.splice(idx, 1);
    _refreshPmPreview();
};

function _renderPmVisibilityList() {
    const list = document.getElementById('pm-visibility-list');
    if (!list) return;
    list.innerHTML = '';
    if (typeof friendsData === 'undefined') return;
    Object.keys(friendsData).forEach(id => {
        const f = friendsData[id];
        const av = f.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`;
        const item = document.createElement('div');
        item.className = 'visibility-item';
        item.innerHTML = `<img src="${av}"><span>${f.remark||f.realName}</span><input type="checkbox" value="${id}" checked>`;
        item.onclick = e => { if (e.target.type !== 'checkbox') { const cb = item.querySelector('input'); cb.checked = !cb.checked; } };
        list.appendChild(item);
    });
}

// 增强版确认发布
window.confirmPostMoment = function() {
    const text = document.getElementById('pm-text').value.trim();
    const visAll = document.getElementById('pm-visibility-all');
    const allowCommentView = document.getElementById('pm-allow-comment-view');

    let images = _pmImages.map(img => {
        if (img.type === 'real')    return { url: img.url, isAI: false };
        if (img.type === 'ai')      return { desc: img.desc, isAI: true };
        if (img.type === 'textimg') return { type: 'textimg', visible: img.visible, hidden: img.hidden };
        return null;
    }).filter(Boolean);

    if (!text && images.length === 0) { alert('写点什么或加张图吧！'); return; }

    // 可见性
    let allowedViewers = [];
    if (visAll && visAll.checked) {
        allowedViewers = Object.keys(typeof friendsData !== 'undefined' ? friendsData : {});
    } else {
        const cbs = document.querySelectorAll('#pm-visibility-list input[type="checkbox"]:checked');
        allowedViewers = Array.from(cbs).map(cb => cb.value);
    }

    const newMoment = {
        id: 'm_' + Date.now(),
        authorId: 'ME',
        text: text,
        time: Date.now(),
        likeCount: 0,
        likedByMe: false,
        comments: [],
        images: images,
        allowedViewers: allowedViewers,
        allowCommentView: allowCommentView ? allowCommentView.checked : true
    };

    if (typeof momentsFeed !== 'undefined') momentsFeed.unshift(newMoment);
    if (typeof saveMomentsFeed === 'function') saveMomentsFeed();
    renderMomentsFeed();
    closePostMomentModal();

    // 触发 AI 互动
    _triggerAiReactionForMoment(newMoment);
};

// ============================================================
// AI 对动态的点赞/评论（内部增强版）
// ============================================================
async function _triggerAiReactionForMoment(moment) {
    const settingsJSON = localStorage.getItem('myCoolPhone_aiSettings');
    if (!settingsJSON) return;
    const settings = JSON.parse(settingsJSON);

    const viewers = moment.allowedViewers || Object.keys(typeof friendsData !== 'undefined' ? friendsData : {});
    for (const friendId of viewers) {
        const friend = (typeof friendsData !== 'undefined') ? friendsData[friendId] : null;
        if (!friend) continue;

        const delay = Math.floor(Math.random() * 30000) + 5000;
        setTimeout(async () => {
            const imgDesc = moment.images && moment.images.length
                ? `[Image: ${moment.images[0].isAI ? moment.images[0].desc : 'photo attached'}]`
                : '';

            const prompt = `You are playing ${friend.realName} on WeChat Moments. Persona: ${friend.persona}.
Your friend posted: "${moment.text}" ${imgDesc}
Decide: "like", "comment", "both", or "ignore". Output strict JSON: {"action":"...","comment":"..."}
Keep comment casual, short, and in character.`;

            try {
                let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
                const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
                    body: JSON.stringify({ model: settings.model, messages: [{ role: 'system', content: prompt }], temperature: 0.85 })
                });
                const data = await res.json();
                let content = (data?.choices?.[0]?.message?.content || '').replace(/```json/g,'').replace(/```/g,'').trim();
                const result = JSON.parse(content);

                // 更新 momentsFeed 中的数据
                const m = (typeof momentsFeed !== 'undefined') ? momentsFeed.find(x => x.id === moment.id) : null;
                if (!m) return;

                if (result.action === 'like' || result.action === 'both') {
                    m.likeCount = (m.likeCount || 0) + 1;
                    if (typeof saveMomentsFeed === 'function') saveMomentsFeed();
                    renderMomentsFeed();
                    if (typeof addMomentsUnreadCount === 'function') addMomentsUnreadCount(1);
                }
                if ((result.action === 'comment' || result.action === 'both') && result.comment) {
                    _addAiComment(moment.id, friendId, result.comment);
                    if (typeof addMomentsUnreadCount === 'function') addMomentsUnreadCount(1);
                }
            } catch(e) { console.warn('AI reaction failed', e); }
        }, delay);
    }
}

// ============================================================
// AI 主动发帖（后台定时触发）
// ============================================================
function scheduleAiProactivePost() {
    // 每 15-45 分钟随机触发一次
    const randomInterval = () => (Math.floor(Math.random() * 30) + 15) * 60 * 1000;

    function scheduleNext() {
        _aiPostTimer = setTimeout(async () => {
            await tryAiProactivePost();
            scheduleNext();
        }, randomInterval());
    }
    scheduleNext();
}

async function tryAiProactivePost() {
    if (typeof friendsData === 'undefined') return;
    const ids = Object.keys(friendsData);
    if (!ids.length) return;

    const settingsJSON = localStorage.getItem('myCoolPhone_aiSettings');
    if (!settingsJSON) return;
    const settings = JSON.parse(settingsJSON);
    if (!settings.apiKey) return;

    // 随机选一个好友
    const randomId = ids[Math.floor(Math.random() * ids.length)];
    const friend = friendsData[randomId];
    if (!friend) return;

    // 最近聊天记忆
    let recentChat = '';
    try {
        if (typeof loadChatHistory === 'function') {
            const hist = await loadChatHistory(randomId);
            recentChat = hist.slice(-5).map(h => `${h.type==='sent'?'User':friend.realName}: ${h.text}`).join('\n');
        }
    } catch(e) {}

    const prompt = `You are ${friend.realName}. Persona: ${friend.persona}.
You feel like posting something on WeChat Moments (朋友圈) right now.
${recentChat ? `Recent chat context:\n${recentChat}` : ''}

Generate a natural, casual Moments post in your character's style.
Output strict JSON: {"text":"...","hasImage":true/false,"imageDesc":"..."}
Text should be 1-3 sentences. imageDesc only if hasImage is true.`;

    try {
        let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
        const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
            body: JSON.stringify({ model: settings.model, messages: [{ role: 'user', content: prompt }], temperature: 0.9 })
        });
        const data = await res.json();
        let content = (data?.choices?.[0]?.message?.content || '').replace(/```json/g,'').replace(/```/g,'').trim();
        const result = JSON.parse(content);

        if (result.text) {
            const images = result.hasImage && result.imageDesc
                ? [{ isAI: true, desc: result.imageDesc }]
                : [];
            if (typeof createMomentFromAI === 'function') {
                createMomentFromAI(randomId, result.text, images.map(i => i.desc));
            }
            // 通知红点
            if (typeof addMomentsUnreadCount === 'function') addMomentsUnreadCount(1);
        }
    } catch(e) { console.warn('AI proactive post failed', e); }
}

// ============================================================
// NPC 团建召唤系统
// ============================================================
function buildNpcSummonModal() {
    if (document.getElementById('npc-summon-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'npc-summon-modal';
    modal.className = 'modal-overlay';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-box" style="max-width:340px;border-radius:20px;padding:20px;">
            <div style="font-weight:700;font-size:16px;margin-bottom:4px;">✨ 召唤 NPC 团建</div>
            <div style="font-size:12px;color:#aaa;margin-bottom:14px;">选择或创建 NPC，让他们来疯狂留言！</div>
            <div id="npc-list-container" class="npc-list"></div>
            <div style="margin-top:12px;">
                <button class="btn-secondary" onclick="addNewNpc()" style="width:100%;margin-bottom:8px;"><i class="fas fa-plus"></i> 添加新 NPC</button>
                <button class="btn-primary" id="npc-summon-confirm-btn" onclick="confirmNpcSummon()" style="width:100%;background:#ff7e67;border:none;">召唤！</button>
            </div>
            <div style="text-align:center;margin-top:10px;">
                <span style="font-size:12px;color:#ccc;cursor:pointer;" onclick="closeNpcSummonModal()">取消</span>
            </div>
        </div>
    `;
    modal.addEventListener('click', e => { if (e.target === modal) closeNpcSummonModal(); });
    const app = document.getElementById('wechatApp') || document.body;
    app.appendChild(modal);
}

let _currentSummonMomentId = null;

window.openNpcSummonModal = function(momentId) {
    _currentSummonMomentId = momentId;
    const modal = document.getElementById('npc-summon-modal');
    if (!modal) return;
    renderNpcList();
    modal.style.display = 'flex';
};

window.closeNpcSummonModal = function() {
    const modal = document.getElementById('npc-summon-modal');
    if (modal) modal.style.display = 'none';
};

function renderNpcList() {
    const container = document.getElementById('npc-list-container');
    if (!container) return;
    container.innerHTML = '';
    if (!npcLibrary.length) {
        container.innerHTML = '<div style="color:#ccc;font-size:12px;text-align:center;padding:16px;">暂无NPC，点击下方添加</div>';
        return;
    }
    npcLibrary.forEach((npc, i) => {
        const item = document.createElement('div');
        item.className = 'npc-item';
        item.innerHTML = `
            <img src="${npc.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${npc.name}`}">
            <div class="npc-item-info">
                <div class="name">${npc.name}</div>
                <div class="desc">${(npc.persona||'').slice(0,30)}</div>
            </div>
            <input type="checkbox" value="${i}" checked>
        `;
        item.onclick = e => { if (e.target.type !== 'checkbox') { const cb = item.querySelector('input'); cb.checked = !cb.checked; } };
        container.appendChild(item);
    });
}

window.addNewNpc = function() {
    const name = prompt('NPC 名字:');
    if (!name) return;
    const persona = prompt('NPC 人设（简短描述，如：热心八卦的闺蜜）:') || '普通路人';
    npcLibrary.push({ name, persona, avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}${Date.now()}` });
    saveNpcLibrary();
    renderNpcList();
};

window.confirmNpcSummon = async function() {
    if (!_currentSummonMomentId) return;
    const checkboxes = document.querySelectorAll('#npc-list-container input[type="checkbox"]:checked');
    if (!checkboxes.length) { alert('请至少选择一个NPC'); return; }

    closeNpcSummonModal();
    if (typeof showToast === 'function') showToast('🎉 NPC正在赶来...');

    const m = (typeof momentsFeed !== 'undefined') ? momentsFeed.find(x => x.id === _currentSummonMomentId) : null;
    if (!m) return;

    const selectedNpcs = Array.from(checkboxes).map(cb => npcLibrary[parseInt(cb.value)]).filter(Boolean);

    const settingsJSON = localStorage.getItem('myCoolPhone_aiSettings');
    if (!settingsJSON) return;
    const settings = JSON.parse(settingsJSON);

    for (const npc of selectedNpcs) {
        const delay = Math.floor(Math.random() * 3000) + 500;
        setTimeout(async () => {
            const prompt = `You are "${npc.name}". Persona: ${npc.persona}.
You just saw this WeChat Moments post: "${m.text}"
Leave a short, funny, in-character comment (1-2 sentences). Output ONLY the comment text.`;
            try {
                let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
                const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
                const res = await fetch(apiUrl, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${settings.apiKey}`}, body: JSON.stringify({ model: settings.model, messages:[{role:'user',content:prompt}], temperature: 0.95 }) });
                const data = await res.json();
                const reply = (data?.choices?.[0]?.message?.content||'').trim();
                if (reply) {
                    if (!m.comments) m.comments = [];
                    m.comments.push({
                        id: 'c_npc_' + Date.now() + Math.random(),
                        authorId: 'npc_' + npc.name,
                        authorName: npc.name,
                        text: reply,
                        isAI: true,
                        time: Date.now()
                    });
                    if (typeof saveMomentsFeed === 'function') saveMomentsFeed();
                    renderMomentsFeed();
                    if (typeof addMomentsUnreadCount === 'function') addMomentsUnreadCount(1);
                }
            } catch(e) { console.warn('NPC summon failed', e); }
        }, delay);
    }
};

// ============================================================
// 切换到朋友圈 Tab 时的初始化
// ============================================================
function bindMomentsTabEnter() {
    // 在 switchWcTab 基础上追加逻辑
    const origSwitch = window.switchWcTab;
    window.switchWcTab = function(tabName, clickedBtn) {
        origSwitch(tabName, clickedBtn);
        if (tabName === 'moments') {
            restoreMomentsBg();
            // 刷新朋友圈头部用户信息
            const meAvatar = getCurrentPersonaAvatar();
            const meName   = getCurrentPersonaName();
            const mo = document.querySelector('.user-avatar-overlay img');
            const mn = document.querySelector('.user-name-overlay');
            if (mo && meAvatar) mo.src = meAvatar;
            if (mn) mn.innerText = meName;
        }
    };
}

// ============================================================
// 朋友圈背景图相关（兼容已有函数）
// ============================================================
window.triggerChangeMomentsBg = function() {
    const choice = confirm('更换朋友圈背景图？\n点击【确定】输入URL，点击【取消】上传本地图片');
    if (choice) {
        const url = prompt('请输入图片 URL:');
        if (url) updateMomentsBg(url);
    } else {
        const fi = document.getElementById('global-img-changer');
        if (fi) {
            fi._momentsMode = true;
            fi.click();
        }
    }
};

window.updateMomentsBg = function(url) {
    const bgEl = document.getElementById('moments-header-bg');
    if (bgEl) bgEl.style.backgroundImage = `url('${url}')`;
    localStorage.setItem('myCoolPhone_momentsBg', url);
};

window.restoreMomentsBg = function() {
    const url = localStorage.getItem('myCoolPhone_momentsBg');
    if (url) {
        const bgEl = document.getElementById('moments-header-bg');
        if (bgEl) bgEl.style.backgroundImage = `url('${url}')`;
    }
};

// ============================================================
// 朋友圈消息同步到私聊（记忆互通）
// ============================================================
// 当用户在朋友圈发图后，AI 可能在私聊里提起
window.notifyFriendsAboutMoment = function(momentId) {
    const m = (typeof momentsFeed !== 'undefined') ? momentsFeed.find(x => x.id === momentId) : null;
    if (!m || m.authorId !== 'ME') return;

    // 把动态内容注入到下次私聊的系统提示
    const momentMemory = `[朋友圈记忆: 用户刚发了一条朋友圈说: "${m.text}"]`;
    if (typeof friendsData !== 'undefined') {
        Object.keys(friendsData).forEach(id => {
            if (!friendsData[id].chatSettings) friendsData[id].chatSettings = {};
            friendsData[id].chatSettings._pendingMomentMemory = momentMemory;
        });
    }
};

// ============================================================
// 增强版 HTML 结构注入（在 DOMContentLoaded 后补全缺失的元素）
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    _ensureMomentsHtmlExtras();
});

function _ensureMomentsHtmlExtras() {
    // 1. 发布弹窗增强
    const postModal = document.getElementById('post-moment-modal');
    if (postModal) {
        // 确保有多图预览区
        if (!document.getElementById('pm-images-preview')) {
            const previewRow = document.createElement('div');
            previewRow.id = 'pm-images-preview';
            previewRow.className = 'pm-images-preview';
            const textArea = postModal.querySelector('#pm-text');
            if (textArea && textArea.parentNode) {
                textArea.parentNode.insertBefore(previewRow, textArea.nextSibling);
            }
        }
        // 多图文件输入
        if (!document.getElementById('pm-multi-file')) {
            const fi = document.createElement('input');
            fi.type = 'file'; fi.id = 'pm-multi-file'; fi.accept = 'image/*'; fi.multiple = true;
            fi.style.display = 'none';
            fi.onchange = function() { handlePmMultiImage(this); };
            postModal.appendChild(fi);
        }
        // 可见性切换
        if (!document.getElementById('pm-visibility-all')) {
            const visRow = postModal.querySelector('.pm-visibility-row') || postModal;
            const allCheck = document.createElement('label');
            allCheck.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;color:#666;margin:6px 0;cursor:pointer;';
            allCheck.innerHTML = `<input type="checkbox" id="pm-visibility-all" checked style="accent-color:#111;"> 所有好友可见`;
            visRow.insertBefore ? visRow.insertBefore(allCheck, visRow.firstChild) : visRow.appendChild(allCheck);
        }
        // 评论区权限
        if (!document.getElementById('pm-allow-comment-view')) {
            const cRow = postModal.querySelector('#pm-visibility-list');
            if (cRow) {
                const commentCheck = document.createElement('label');
                commentCheck.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;color:#666;margin:6px 0;cursor:pointer;';
                commentCheck.innerHTML = `<input type="checkbox" id="pm-allow-comment-view" checked style="accent-color:#111;"> 允许 AI 看到评论区`;
                cRow.parentNode.insertBefore(commentCheck, cRow.nextSibling);
            }
        }
    }

    // 2. 朋友圈 Tab 顶栏 增加收藏和更换背景按钮
    const momentsBg = document.getElementById('moments-header-bg');
    if (momentsBg && !document.getElementById('moments-header-fav-btn')) {
        const favBtn = document.createElement('div');
        favBtn.id = 'moments-header-fav-btn';
        favBtn.title = '我的收藏';
        favBtn.style.cssText = 'position:absolute;bottom:8px;left:16px;z-index:3;color:#fff;font-size:18px;cursor:pointer;text-shadow:0 1px 4px rgba(0,0,0,0.5);';
        favBtn.innerHTML = '<i class="fas fa-star"></i>';
        favBtn.onclick = () => openMomentsFavoritesPage();
        momentsBg.appendChild(favBtn);

        const bgBtn = document.createElement('div');
        bgBtn.title = '更换背景';
        bgBtn.style.cssText = 'position:absolute;bottom:8px;left:48px;z-index:3;color:#fff;font-size:16px;cursor:pointer;text-shadow:0 1px 4px rgba(0,0,0,0.5);';
        bgBtn.innerHTML = '<i class="fas fa-camera-retro"></i>';
        bgBtn.onclick = () => triggerChangeMomentsBg();
        momentsBg.appendChild(bgBtn);
    }
}
