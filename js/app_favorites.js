/**
 * app_favorites.js  —  收藏夹功能模块
 * 修复：用安全辅助函数访问 apps.js 的 let 变量，渲染时实时回查好友信息
 */

const FavoritesApp = (() => {

    const FAV_KEY = 'myCoolPhone_favorites';
    let isEditMode  = false;
    let selectedIds = new Set();
    let currentSearch = '';

    // ─── 安全访问 apps.js 的 let 变量（let 不挂在 window 上）───

    function _getFeed() {
        try { return (typeof momentsFeed !== 'undefined' && Array.isArray(momentsFeed)) ? momentsFeed : []; }
        catch(e) { return []; }
    }
    function _getFD() {
        try { return (typeof friendsData !== 'undefined') ? friendsData : {}; }
        catch(e) { return {}; }
    }
    function _getChatId() {
        try { return (typeof currentChatId !== 'undefined') ? currentChatId : null; }
        catch(e) { return null; }
    }
    function _getPersona() {
        try {
            const id   = (typeof currentPersonaId !== 'undefined') ? currentPersonaId : null;
            const meta = (typeof personasMeta !== 'undefined') ? personasMeta : {};
            return (id && meta && meta[id]) ? meta[id] : null;
        } catch(e) { return null; }
    }

    // ─── 数据层 ───

    function _load() {
        try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); }
        catch(e) { return []; }
    }
    function _save(favs) {
        try { localStorage.setItem(FAV_KEY, JSON.stringify(favs || [])); }
        catch(e) { console.error('[FavoritesApp] save error', e); }
    }

    // ─── 解析作者信息（渲染时实时查询，保证名字/头像最新）───

    function _resolveAuthor(fav) {
        const fd = _getFD();
        if (fav.authorId === 'ME') {
            const p = _getPersona();
            return {
                name:   p ? (p.name || 'Me') : (fav.authorName || 'Me'),
                avatar: p ? (p.avatar || fav.authorAvatar || '') : (fav.authorAvatar || '')
            };
        }
        const f = fd[fav.authorId];
        if (f) {
            return {
                name:   f.remark || f.realName || fav.authorName || fav.authorId || '未知',
                avatar: f.avatar || fav.authorAvatar || ''
            };
        }
        return { name: fav.authorName || fav.authorId || '未知', avatar: fav.authorAvatar || '' };
    }

    // ─── App 开关 ───

    function open() {
        const app = document.getElementById('favoritesApp');
        if (!app) return;
        isEditMode = false;
        selectedIds.clear();
        currentSearch = '';
        const si = document.getElementById('fav-search-input');
        if (si) si.value = '';
        const cb = document.getElementById('fav-search-clear');
        if (cb) cb.style.display = 'none';
        const eb = document.getElementById('fav-edit-bar');
        if (eb) eb.style.display = 'none';
        const eBtn = document.getElementById('fav-edit-btn');
        if (eBtn) { eBtn.innerText = '编辑'; eBtn.classList.remove('active-edit'); }
        app.classList.add('open');
        render();
    }

    function close() {
        const app = document.getElementById('favoritesApp');
        if (app) app.classList.remove('open');
        // 退出时强制重置编辑模式，防止多选删除栏残留在底部
        isEditMode = false;
        selectedIds.clear();
        const bar = document.getElementById('fav-edit-bar');
        if (bar) bar.style.display = 'none';
        const eBtn = document.getElementById('fav-edit-btn');
        if (eBtn) { eBtn.innerText = '编辑'; eBtn.classList.remove('active-edit'); }
    }

    // ─── 渲染 ───

    function render(override) {
        const c = document.getElementById('fav-content');
        if (!c) return;
        let favs = override || _load();

        if (currentSearch.trim()) {
            const kw = currentSearch.trim().toLowerCase();
            favs = favs.filter(f =>
                (f.content || '').toLowerCase().includes(kw) ||
                (f.authorName || '').toLowerCase().includes(kw)
            );
        }
        favs = [...favs].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));

        if (!favs.length) {
            c.innerHTML = '<div class="fav-empty">'
                + '<div class="fav-empty-icon"><i class="fas fa-bookmark"></i></div>'
                + '<div class="fav-empty-title">' + (currentSearch ? '没有匹配的收藏' : '还没有任何收藏') + '</div>'
                + '<div class="fav-empty-sub">' + (currentSearch ? '换个关键词试试吧' : '在聊天中长按消息勾选后点击「收藏」<br>或在动态卡片下方点击星星图标') + '</div>'
                + '</div>';
            return;
        }
        c.innerHTML = '';
        favs.forEach(f => c.appendChild(_makeCard(f)));
    }

    // ─── 卡片生成 ───

    function _makeCard(fav) {
        const div = document.createElement('div');
        div.className = 'favorite-item-card' + (isEditMode ? ' edit-mode' : '');
        div.setAttribute('data-fav-id', fav.id);
        if (isEditMode && selectedIds.has(fav.id)) div.classList.add('fav-selected');
        if (isEditMode) div.onclick = () => _toggleSelect(fav.id, div);

        const au   = _resolveAuthor(fav);
        const name = au.name;
        const avt  = au.avatar || ('https://api.dicebear.com/7.x/avataaars/svg?seed=' + (fav.authorId || 'x'));

        const badge = fav.type === 'moment'
            ? '<span class="fav-source-badge moment">来自动态</span>'
            : '<span class="fav-source-badge chat">来自与 ' + _esc(fav.sourceName || '聊天') + ' 的聊天</span>';

        const ts = fav.savedAt
            ? new Date(fav.savedAt).toLocaleString('zh-CN',
                { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }
              ).replace(/\//g, '-')
            : '';

        let extra = '';
        if (fav.type === 'moment') {
            if (fav.likeCount > 0) {
                extra += '<div class="fav-meta-row"><i class="fas fa-heart" style="color:#ff5e5e;font-size:11px;"></i><span>' + fav.likeCount + '</span></div>';
            }
            if (fav.comments && fav.comments.length) {
                const rows = fav.comments.slice(0, 3).map(c =>
                    '<div class="fav-comment"><b>' + _esc(c.authorName || c.authorId || 'TA') + '：</b>' + _esc(c.text) + '</div>'
                ).join('');
                const more = fav.comments.length > 3 ? '<div class="fav-comment-more">查看全部 ' + fav.comments.length + ' 条评论</div>' : '';
                extra += '<div class="fav-comments-preview">' + rows + more + '</div>';
            }
        }

        const circleStyle = isEditMode ? '' : 'style="display:none"';
        const dotCls = (isEditMode && selectedIds.has(fav.id)) ? 'checked' : '';

        div.innerHTML =
            '<div class="fav-card-select-circle" ' + circleStyle + '>'
            + '<div class="fav-select-dot ' + dotCls + '">'
            + (dotCls ? '<i class="fas fa-check"></i>' : '') + '</div></div>'
            + '<div class="fav-card-body-wrap">'
            + '<div class="fav-card-header">'
            + '<img class="fav-author-avatar" src="' + _esc(avt) + '" onerror="this.src=\'https://api.dicebear.com/7.x/avataaars/svg?seed=x\'">'
            + '<div class="fav-card-author-info">'
            + '<div class="fav-author-name">' + _esc(name) + '</div>'
            + badge + '</div>'
            + '<div class="fav-card-time">' + ts + '</div></div>'
            + '<div class="fav-card-content">' + _renderContent(fav) + '</div>'
            + extra + '</div>';

        return div;
    }

    // ─── 内容区渲染 ───

    function _renderContent(fav) {
        const text = fav.content || '';

        // 表情包
        if (/^\[表情:(.*?)\]$/.test(text.trim())) {
            const name = text.trim().match(/^\[表情:(.*?)\]$/)[1];
            const st = (window.allStickers || []).find(s => s.name === name);
            if (st) return '<img src="' + _esc(st.url) + '" class="fav-sticker-img" alt="' + _esc(name) + '">';
            return '<div class="fav-text-content">' + _esc(text) + '</div>';
        }

        // 文字图 / AI 描述图
        if (text.startsWith('[IMG_DESC]') || fav.msgType === 'ai_image') {
            const desc    = text.startsWith('[IMG_DESC]') ? text.replace('[IMG_DESC]', '').trim() : text;
            const encoded = encodeURIComponent(desc);
            return '<div class="fav-fake-image" onclick="FavoritesApp.revealImageDesc(\'' + encoded + '\')">'
                + '<div class="fav-fake-img-icon"><i class="far fa-image"></i><span>PHOTO</span></div>'
                + '<div class="fav-fake-img-hint">点击查看图片描述</div></div>';
        }

        // 语音
        if (text.startsWith('[VOICE]')) {
            const vt = text.replace('[VOICE]', '').trim();
            const lb = (vt && vt !== '（语音消息）') ? vt : '语音消息';
            return '<div class="fav-voice-msg"><i class="fas fa-microphone"></i><span>' + _esc(lb) + '</span></div>';
        }

        // 转账
        if (text.startsWith('[WC_TRANSFER:')) {
            const parts  = text.replace('[WC_TRANSFER:', '').replace(/\]$/, '').split('|');
            const amount = parseFloat(parts[2]) || 0;
            return '<div class="fav-transfer-msg"><i class="fas fa-yen-sign"></i><span>转账 ¥' + amount.toFixed(2) + '</span></div>';
        }

        // 动态（含图片）
        if (fav.type === 'moment' && fav.images && fav.images.length) {
            const SEP = '___TRANSLATION_SEP___';
            let textHtml = '';
            if (text.trim()) {
                if (text.includes(SEP)) {
                    const ps = text.split(SEP);
                    textHtml = '<div class="fav-text-content">' + ps[0].trim().replace(/\n/g, '<br>') + '</div>'
                        + '<div class="fav-translation">' + ps[1].trim().replace(/\n/g, '<br>') + '</div>';
                } else {
                    textHtml = '<div class="fav-text-content">' + text.replace(/\n/g, '<br>') + '</div>';
                }
            }
            const imgHtml = fav.images.slice(0, 9).map(img => {
                if (img.isAI) {
                    const enc = encodeURIComponent(img.desc || '');
                    return '<div class="fav-fake-image small" onclick="FavoritesApp.revealImageDesc(\'' + enc + '\')">'
                        + '<div class="fav-fake-img-icon"><i class="far fa-image"></i></div></div>';
                }
                return '<img class="fav-moment-img" src="' + _esc(img.url || '') + '" '
                    + 'onerror="this.style.display=\'none\'" loading="lazy">';
            }).join('');
            return textHtml + (imgHtml ? '<div class="fav-moment-imgs">' + imgHtml + '</div>' : '');
        }

        // 真实图片
        if (fav.msgType === 'image' && (fav.imageUrl || fav.content)) {
            const url = fav.imageUrl || fav.content;
            return '<img class="fav-chat-img" src="' + _esc(url) + '" '
                + 'onerror="this.outerHTML=\'<div class=\\\"fav-text-content\\\">[图片加载失败]</div>\'" loading="lazy">';
        }

        // 普通文本
        if (text.trim()) {
            const SEP = '___TRANSLATION_SEP___';
            if (text.includes(SEP)) {
                const ps = text.split(SEP);
                return '<div class="fav-text-content">' + ps[0].trim().replace(/\n/g, '<br>') + '</div>'
                    + '<div class="fav-translation">' + ps[1].trim().replace(/\n/g, '<br>') + '</div>';
            }
            return '<div class="fav-text-content">' + text.replace(/\n/g, '<br>') + '</div>';
        }

        return '<div class="fav-text-content" style="color:#aaa;">[空消息]</div>';
    }

    // ─── 收藏入口 A：聊天多选 ───

    function addFromChat() {
        const rows  = document.querySelectorAll('.chat-row');
        const toAdd = [];

        rows.forEach(row => {
            const cb  = row.querySelector('.wc-msg-checkbox');
            if (!cb || !cb.classList.contains('checked')) return;
            const msgId    = row.getAttribute('data-msg-id') || ('msg_' + Date.now() + '_' + Math.random().toString(36).substr(2,4));
            const text     = row.getAttribute('data-msg-text') || row.querySelector('.message-bubble')?.innerText || '';
            const sender   = row.getAttribute('data-msg-sender') || 'AI';
            const avt      = row.querySelector('.chat-avatar-img')?.src || '';
            const msgType  = row.getAttribute('data-msg-type') || 'text';
            const imageUrl = row.getAttribute('data-image-url') || '';
            if (row.classList.contains('system')) return;
            if (!text && !imageUrl) return;
            toAdd.push({ msgId, text, sender, avatarSrc: avt, msgType, imageUrl });
        });

        if (!toAdd.length) {
            if (typeof showToast === 'function') showToast('请先勾选要收藏的消息');
            return;
        }

        const favs  = _load();
        const fd    = _getFD();
        let added   = 0;
        let dup     = 0;

        const chatId   = _getChatId();
        const friend   = chatId ? (fd[chatId] || null) : null;
        const chatName = friend ? (friend.remark || friend.realName || chatId) : (chatId || '聊天');

        toAdd.forEach(msg => {
            if (favs.some(f => f.originalId === msg.msgId && f.type === 'chat_msg')) {
                dup++;
                return;
            }

            let authorId, authorName, authorAvatar;
            if (msg.sender === 'ME') {
                const p    = _getPersona();
                authorId   = 'ME';
                authorName = p ? (p.name || 'Me') : 'Me';
                authorAvatar = p ? (p.avatar || '') : '';
            } else {
                authorId     = chatId || '';
                authorName   = chatName;
                authorAvatar = msg.avatarSrc || (friend ? (friend.avatar || '') : '');
            }

            favs.push({
                id:          'fav_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                originalId:  msg.msgId,
                type:        'chat_msg',
                msgType:     msg.msgType || 'text',
                authorId,
                authorName,
                authorAvatar,
                sourceId:    chatId || '',
                sourceName:  chatName,
                content:     msg.text,
                imageUrl:    msg.imageUrl || '',
                savedAt:     Date.now()
            });
            added++;
        });

        _save(favs);

        if (dup > 0 && added === 0) {
            if (typeof showToast === 'function') showToast('选中的消息均已收藏过');
        } else if (added > 0) {
            if (typeof showToast === 'function') showToast('已收藏 ' + added + ' 条消息 ⭐');
        }
    }

    // ─── 收藏入口 B：动态星星 ───

    function toggleMomentFavorite(momentId) {
        const favs    = _load();
        const existIdx = favs.findIndex(f => f.originalId === momentId && f.type === 'moment');

        if (existIdx !== -1) {
            favs.splice(existIdx, 1);
            _save(favs);
            _updateStarUI(momentId, false);
            if (typeof showToast === 'function') showToast('已取消收藏');
            return;
        }

        // 从全局 momentsFeed 查找（let 变量，直接引用，不用 window.）
        const feed   = _getFeed();
        const moment = feed.find(m => m.id === momentId);
        if (!moment) {
            if (typeof showToast === 'function') showToast('获取动态失败');
            return;
        }

        const fd = _getFD();
        let authorId, authorName, authorAvatar;
        if (moment.authorId === 'ME') {
            const p    = _getPersona();
            authorId   = 'ME';
            authorName = p ? (p.name || 'Me') : 'Me';
            authorAvatar = p ? (p.avatar || '') : '';
        } else {
            const f    = fd[moment.authorId] || null;
            authorId   = moment.authorId;
            authorName = f ? (f.remark || f.realName || moment.authorId) : moment.authorId;
            authorAvatar = f ? (f.avatar || '') : '';
        }

        // 收集评论
        const comments = (moment.comments || []).map(c => ({
            authorId:   c.authorId || '',
            authorName: c.authorName || c.authorId || '',
            text:       c.text || ''
        }));

        // 收集图片
        const images = [];
        if (moment.imageDesc) images.push({ isAI: true, desc: moment.imageDesc });
        if (moment.imageUrl)  images.push({ isAI: false, url: moment.imageUrl });
        if (Array.isArray(moment.images)) {
            moment.images.forEach(img => {
                if (typeof img === 'string') images.push({ isAI: false, url: img });
                else if (img.isAI) images.push({ isAI: true, desc: img.desc || '' });
                else images.push({ isAI: false, url: img.url || '' });
            });
        }

        favs.push({
            id:          'fav_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            originalId:  momentId,
            type:        'moment',
            msgType:     'moment',
            authorId,
            authorName,
            authorAvatar,
            sourceId:    momentId,
            sourceName:  '动态',
            content:     moment.text || '',
            images,
            likeCount:   moment.likes || 0,
            comments,
            savedAt:     Date.now()
        });

        _save(favs);
        _updateStarUI(momentId, true);
        if (typeof showToast === 'function') showToast('已收藏到收藏夹 ⭐');
    }

    function isMomentFavorited(momentId) {
        return _load().some(f => f.originalId === momentId && f.type === 'moment');
    }

    // ─── 动态星星 UI 注入 / 更新 ───

    function _updateStarUI(momentId, state) {
        document.querySelectorAll('.moment-fav-star[data-mid="' + momentId + '"]').forEach(el => {
            el.classList.toggle('fav-starred', state);
            el.innerHTML = state
                ? '<i class="fas fa-star"></i>'
                : '<i class="far fa-star"></i>';
        });
    }

    function _hookMomentsFeed() {
        const orig = window.renderMomentsFeed;
        if (typeof orig !== 'function') return;
        window.renderMomentsFeed = function(feed, opts) {
            orig.call(this, feed, opts);
            setTimeout(_injectStars, 80);
        };
    }

    function _injectStars() {
        const cards = document.querySelectorAll('.moment-card[data-moment-id]');
        cards.forEach(card => {
            const mid = card.getAttribute('data-moment-id');
            if (!mid) return;
            if (card.querySelector('.moment-fav-star')) return; // 已注入

            const actBar = card.querySelector('.moment-actions') || card.querySelector('.m-action-bar');
            if (!actBar) return;

            const starred = isMomentFavorited(mid);
            const btn = document.createElement('div');
            btn.className  = 'moment-fav-star' + (starred ? ' fav-starred' : '');
            btn.setAttribute('data-mid', mid);
            btn.innerHTML  = starred ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
            btn.onclick    = function(e) {
                e.stopPropagation();
                toggleMomentFavorite(mid);
            };
            actBar.appendChild(btn);
        });
    }

    // ─── 文字图解密弹窗 ───

    function revealImageDesc(encoded) {
        const modal   = document.getElementById('fav-imgtext-modal');
        const content = document.getElementById('fav-imgtext-content');
        if (!modal || !content) return;
        let text = '';
        try { text = decodeURIComponent(encoded); } catch(e) { text = encoded; }
        content.innerText = text;
        modal.classList.add('active');
    }

    // ─── 搜索 ───

    function search(val) {
        currentSearch = val || '';
        const clearBtn = document.getElementById('fav-search-clear');
        if (clearBtn) clearBtn.style.display = val ? 'block' : 'none';
        render();
    }

    function clearSearch() {
        currentSearch = '';
        const si = document.getElementById('fav-search-input');
        if (si) si.value = '';
        const cb = document.getElementById('fav-search-clear');
        if (cb) cb.style.display = 'none';
        render();
    }

    // ─── 编辑模式 ───

    function toggleEditMode() {
        isEditMode = !isEditMode;
        selectedIds.clear();

        const btn = document.getElementById('fav-edit-btn');
        if (btn) {
            btn.innerText = isEditMode ? '完成' : '编辑';
            btn.classList.toggle('active-edit', isEditMode);
        }

        const bar = document.getElementById('fav-edit-bar');
        if (bar) bar.style.display = isEditMode ? 'flex' : 'none';

        _updateDeleteBtn();
        render();
    }

    function _toggleSelect(favId, el) {
        if (selectedIds.has(favId)) {
            selectedIds.delete(favId);
            el.classList.remove('fav-selected');
            const dot = el.querySelector('.fav-select-dot');
            if (dot) { dot.className = 'fav-select-dot'; dot.innerHTML = ''; }
        } else {
            selectedIds.add(favId);
            el.classList.add('fav-selected');
            const dot = el.querySelector('.fav-select-dot');
            if (dot) { dot.className = 'fav-select-dot checked'; dot.innerHTML = '<i class="fas fa-check"></i>'; }
        }
        _updateDeleteBtn();
    }

    function _updateDeleteBtn() {
        const btn = document.getElementById('fav-delete-btn');
        if (!btn) return;
        btn.textContent = '删除 (' + selectedIds.size + ')';
        btn.disabled    = selectedIds.size === 0;
    }

    function confirmDelete() {
        if (!selectedIds.size) return;
        if (!confirm('确认删除选中的 ' + selectedIds.size + ' 条收藏？')) return;

        let favs = _load();
        favs = favs.filter(f => !selectedIds.has(f.id));
        _save(favs);
        selectedIds.clear();
        _updateDeleteBtn();
        render();
        if (typeof showToast === 'function') showToast('已删除');
    }

    // ─── 工具 ───

    function _esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ─── 初始化 ───

    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(_hookMomentsFeed, 500);
    });

    // 公开接口
    return {
        open,
        close,
        addFromChat,
        toggleMomentFavorite,
        isMomentFavorited,
        revealImageDesc,
        search,
        clearSearch,
        toggleEditMode,
        confirmDelete
    };

})();
