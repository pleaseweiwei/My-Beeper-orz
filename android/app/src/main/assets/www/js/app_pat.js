/**
 * app_pat.js — 拍一拍互动系统 v1.0
 * 依赖: apps.js (friendsData, currentChatId, saveMessageToHistory)
 */

window.PatApp = (() => {
    'use strict';

    /* ══════════════════════════════════════════
       1. 打开后缀输入弹窗
    ══════════════════════════════════════════ */
    function openPatModal(chatId) {
        if (!chatId) chatId = (typeof window.currentChatId !== 'undefined') ? window.currentChatId : null;
        if (!chatId) return;

        document.getElementById('pat-suffix-modal')?.remove();

        const f = (typeof friendsData !== 'undefined') ? friendsData[chatId] : null;
        const displayName = f ? (f.remark || f.realName || chatId) : chatId;
        const avatarSrc = (f && f.avatar)
            ? f.avatar
            : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayName)}`;

        const modal = document.createElement('div');
        modal.id = 'pat-suffix-modal';
        modal.className = 'modal-overlay active';
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        // Escape for inline event attributes
        const safeId   = chatId.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const safeName = displayName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        modal.innerHTML = `
          <div class="pat-modal-box" onclick="event.stopPropagation()">
            <img src="${_escAttr(avatarSrc)}" class="pat-modal-avatar">
            <div class="pat-modal-title">拍一拍 ${_escHtml(displayName)}</div>
            <input id="pat-suffix-input" type="text" maxlength="15"
              class="pat-suffix-input"
              placeholder="的肩膀（可自定义后缀）"
              onkeydown="if(event.key==='Enter'){PatApp.confirmPat('${safeId}','${safeName}');}">
            <div class="pat-modal-btns">
              <button class="pat-btn cancel" onclick="document.getElementById('pat-suffix-modal').remove()">取消</button>
              <button class="pat-btn confirm" onclick="PatApp.confirmPat('${safeId}','${safeName}')">拍！</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        setTimeout(() => document.getElementById('pat-suffix-input')?.focus(), 120);
    }

    /* ══════════════════════════════════════════
       2. 确认拍一拍
    ══════════════════════════════════════════ */
    function confirmPat(chatId, characterName) {
        const input  = document.getElementById('pat-suffix-input');
        const suffix = (input ? input.value.trim() : '') || '的肩膀';
        document.getElementById('pat-suffix-modal')?.remove();
        doUserPat(chatId, characterName, suffix);
    }

    /* ══════════════════════════════════════════
       3. 执行：用户拍AI
    ══════════════════════════════════════════ */
    function doUserPat(chatId, characterName, suffix) {
        // 1. 震动屏幕
        shakeScreen();

        // 2. 系统提示气泡
        const noticeText = `我 拍了拍 ${characterName}${suffix}`;
        appendPatNotice(noticeText);

        // 3. 保存到聊天历史
        if (chatId && typeof saveMessageToHistory === 'function') {
            saveMessageToHistory(chatId, {
                id: 'pat_' + Date.now(),
                text: `[PAT_NOTICE]${noticeText}`,
                type: 'pat_notice'
            });
        }

        // 4. 将隐藏指令入队 → 等用户点击星星回复按钮时随下条消息发给AI
        // 注意：使用独立的 tr_action_context key，避免被查手机蝴蝶效应的
        // MISCHIEF 处理器错误消费并包裹进"偷看手机"的错误框架中。
        try {
            const pending = JSON.parse(localStorage.getItem('tr_action_context') || '[]');
            pending.push(`[系统提示：用户（我）刚刚拍了拍你（${characterName}）${suffix}。请你对此作出回应。]`);
            localStorage.setItem('tr_action_context', JSON.stringify(pending));
        } catch (e) {}
    }

    /* ══════════════════════════════════════════
       4. 震动屏幕（0.5秒）
    ══════════════════════════════════════════ */
    function shakeScreen() {
        const target = document.getElementById('phone-screen')
                     || document.querySelector('.chat-view')
                     || document.querySelector('.phone');
        if (!target) return;
        target.classList.remove('pat-shake-anim');
        void target.offsetWidth; // force reflow
        target.classList.add('pat-shake-anim');
        setTimeout(() => target.classList.remove('pat-shake-anim'), 500);
    }

    /* ══════════════════════════════════════════
       5. 居中系统提示气泡
    ══════════════════════════════════════════ */
    function appendPatNotice(text, container) {
        const chatMessages = container || document.getElementById('chatMessages');
        if (!chatMessages) return;
        const div = document.createElement('div');
        div.className = 'pat-notice-bubble';
        div.innerHTML = `<span>${_escHtml(text)}</span>`;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    /* ══════════════════════════════════════════
       6. 解析AI回复中的拍一拍指令
       AI拍用户:  {"type":"pat_user","name":"角色名","suffix":"后缀"}
       AI拍群友:  {"type":"pat_user","name":"角色A","suffix":"后缀","targetName":"角色B"}
    ══════════════════════════════════════════ */
    function parseAndHandleAIPat(text, chatId) {
        if (!text || !text.includes('"pat_user"')) return text;

        const patRegex = /\{"type"\s*:\s*"pat_user"[^}]*\}/g;
        const matches  = text.match(patRegex);
        if (!matches) return text;

        let cleanText = text;
        for (const rawMatch of matches) {
            try {
                const cmd = JSON.parse(rawMatch);
                if (cmd.type !== 'pat_user') continue;

                cleanText = cleanText.replace(rawMatch, '').trim();

                const f = (typeof friendsData !== 'undefined' && chatId) ? friendsData[chatId] : null;
                const fromName = cmd.name || (f ? (f.remark || f.realName) : 'TA');
                const suffix   = cmd.suffix ? String(cmd.suffix) : '了一下';

                let noticeText;
                if (cmd.targetName) {
                    // 群聊：AI拍另一个成员
                    noticeText = `${fromName} 拍了拍 ${cmd.targetName}${suffix}`;
                } else {
                    // AI拍用户
                    noticeText = `${fromName} 拍了拍 我${suffix}`;
                }

                // 延迟300ms，让正文先渲染
                setTimeout(() => {
                    shakeScreen();
                    appendPatNotice(noticeText);
                    if (chatId && typeof saveMessageToHistory === 'function') {
                        saveMessageToHistory(chatId, {
                            id: 'pat_' + Date.now(),
                            text: `[PAT_NOTICE]${noticeText}`,
                            type: 'pat_notice'
                        });
                    }
                }, 300);
            } catch (e) { /* 静默忽略 */ }
        }

        return cleanText.trim();
    }

    /* ── 工具函数 ─────────────────────────────────── */
    function _escHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function _escAttr(s) {
        return String(s).replace(/"/g, '&quot;');
    }

    /* ── Public API ──────────────────────────────── */
    return {
        openPatModal,
        confirmPat,
        doUserPat,
        shakeScreen,
        appendPatNotice,
        parseAndHandleAIPat
    };
})();

/* ── 全局快捷入口 ─────────────────────────────────── */
window.openPatModal = (chatId) => PatApp.openPatModal(chatId);
window.confirmPat   = (chatId, charName) => PatApp.confirmPat(chatId, charName);

/* ══════════════════════════════════════════════════════
   事件委托：双击头像触发拍一拍
   - ① 聊天消息区（接收到的消息头像双击）
   - ② 聊天列表（好友头像双击）
══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

    // ① 聊天消息区 — received 气泡头像双击
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.addEventListener('dblclick', (e) => {
            const img = e.target.closest('img.chat-avatar-img');
            const row = e.target.closest('.chat-row');
            if (img && row && row.classList.contains('received')) {
                e.preventDefault();
                e.stopPropagation();
                const cid = (typeof window.currentChatId !== 'undefined') ? window.currentChatId : null;
                if (cid) PatApp.openPatModal(cid);
            }
        });
    }

    // ② 聊天列表 — .wc-avatar 头像双击
    const tabChats = document.querySelector('#tab-chats');
    if (tabChats) {
        tabChats.addEventListener('dblclick', (e) => {
            const avatarDiv = e.target.closest('.wc-avatar');
            const chatItem  = e.target.closest('.wc-chat-item');
            if (avatarDiv && chatItem) {
                e.preventDefault();
                e.stopPropagation();
                const cid = chatItem.getAttribute('data-chat-id');
                if (cid && typeof friendsData !== 'undefined' && friendsData[cid]) {
                    PatApp.openPatModal(cid);
                }
            }
        });
    }
});
