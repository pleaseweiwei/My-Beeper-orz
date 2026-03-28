/**
 * app_transfer.js — 双向虚拟转账与资产联动系统
 * 依赖: app_pay.js (payData, savePayData), apps.js (friendsData, currentPersonaId)
 */

window.TransferApp = (() => {

  // ── 账单流水存储键 ──────────────────────────────
  const LEDGER_KEY = 'wc_transfer_ledger';

  // ── 读取 / 写入账单 ─────────────────────────────
  function getLedger() {
    try { return JSON.parse(localStorage.getItem(LEDGER_KEY) || '[]'); } catch { return []; }
  }
  function saveLedger(l) { localStorage.setItem(LEDGER_KEY, JSON.stringify(l)); }
  function addLedgerEntry(entry) {
    const l = getLedger();
    l.unshift({ ...entry, time: Date.now() });
    saveLedger(l);
  }

  // ── 用户余额操作（与 app_pay 共用 payData.balance） ──
  function getBalance() {
    return (typeof payData !== 'undefined' && payData.balance != null) ? Number(payData.balance) : 0;
  }
  function setBalance(v) {
    if (typeof payData === 'undefined') return;
    payData.balance = Math.max(0, parseFloat(Number(v).toFixed(2)));
    if (typeof savePayData === 'function') savePayData();
  }

  // ── 获取当前人设信息 ────────────────────────────
  function _getPersonaName() {
    try {
      if (typeof currentPersonaId !== 'undefined' && typeof friendsData !== 'undefined') {
        const f = friendsData[currentPersonaId];
        if (f) return f.remark || f.realName || 'AI';
      }
      if (typeof personasMeta !== 'undefined' && typeof currentPersonaId !== 'undefined') {
        const p = personasMeta[currentPersonaId];
        if (p) return p.name || p.realName || 'AI';
      }
    } catch (e) {}
    return 'AI';
  }

  function _getPersonaAvatar() {
    try {
      if (typeof currentPersonaId !== 'undefined' && typeof friendsData !== 'undefined') {
        const f = friendsData[currentPersonaId];
        if (f && f.avatar) return f.avatar;
      }
    } catch (e) {}
    return 'icon.png';
  }

  function _getIntimacy() {
    try {
      if (typeof currentPersonaId !== 'undefined' && typeof friendsData !== 'undefined') {
        const f = friendsData[currentPersonaId];
        if (f && f.intimacy != null) return Number(f.intimacy);
      }
    } catch (e) {}
    return 0;
  }

  // ── 生成唯一 ID ─────────────────────────────────
  function uid() { return 'tr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }

  // ── 持久化：写入聊天历史 ─────────────────────────
  function _saveTransferToHistory(id, direction, amount, memo, status) {
    if (typeof saveMessageToHistory !== 'function') return;
    const chatId = typeof window.getCurrentChatId === 'function' ? window.getCurrentChatId() : null;
    if (!chatId) return;
    const safeMemo = (memo || '').replace(/\|/g, '\\|');
    const tagText = `[WC_TRANSFER:${id}|${direction}|${Number(amount).toFixed(2)}|${safeMemo}|${status}]`;
    const msgId = 'wc_tr_' + id;
    const type = direction === 'user-to-ai' ? 'sent' : 'received';
    saveMessageToHistory(chatId, { id: msgId, text: tagText, type, senderName: direction === 'user-to-ai' ? 'ME' : chatId });
  }

  // ── 持久化：更新历史中转账状态 ───────────────────
  function _updateTransferHistoryStatus(id, status) {
    if (typeof IDB === 'undefined' || typeof window.getCurrentChatId !== 'function' || typeof window.scopedChatKey !== 'function') return;
    const chatId = window.getCurrentChatId();
    if (!chatId) return;
    const key = window.scopedChatKey(chatId);
    IDB.get(key).then(history => {
      if (!history) return;
      const msgId = 'wc_tr_' + id;
      const idx = history.findIndex(m => m.id === msgId);
      if (idx !== -1) {
        history[idx].text = history[idx].text.replace(/\|(pending|accepted|rejected)\]$/, `|${status}]`);
        IDB.set(key, history);
      }
    }).catch(() => {});
  }

  // ═══════════════════════════════════════════════
  //  1. 打开转账弹窗（用户→AI 发起方向）
  // ═══════════════════════════════════════════════
  function openTransferModal() {
    if (document.getElementById('transfer-modal')) return;
    const bal = getBalance();
    const personaName = _getPersonaName();

    const modal = document.createElement('div');
    modal.id = 'transfer-modal';
    modal.className = 'modal-overlay active';
    modal.addEventListener('click', (e) => { if (e.target === modal) TransferApp.closeTransferModal(); });
    modal.innerHTML = `
      <div class="modal-box" style="width:300px;padding:28px 24px 20px;border-radius:20px;position:relative;text-align:center;" onclick="event.stopPropagation()">
        <div style="font-size:15px;font-weight:700;color:#222;margin-bottom:6px;">转账给 ${personaName}</div>
        <div class="transfer-modal-balance">账户余额：<span>¥${bal.toFixed(2)}</span></div>
        <div style="margin:20px 0 6px;">
          <span style="font-size:28px;font-weight:300;color:#bbb;vertical-align:middle;">¥</span>
          <input id="transfer-amount-input" type="number" min="0.01" max="${bal}" step="0.01" placeholder="0.00" inputmode="decimal" style="width:160px;display:inline-block;vertical-align:middle;">
        </div>
        <div style="margin:12px 0;">
          <input id="transfer-memo-input" type="text" maxlength="30" placeholder="备注（可选）"
            style="width:100%;box-sizing:border-box;border:none;border-bottom:1px solid #eee;padding:6px 0;font-size:13px;color:#333;outline:none;text-align:center;background:transparent;">
        </div>
        <div style="display:flex;gap:10px;margin-top:20px;">
          <button onclick="TransferApp.closeTransferModal()" style="flex:1;padding:11px;border-radius:25px;border:1px solid #e0e0e0;background:#f5f5f5;font-size:13px;font-weight:600;color:#666;cursor:pointer;">取消</button>
          <button onclick="TransferApp.confirmUserTransfer()" style="flex:2;padding:11px;border-radius:25px;border:none;background:linear-gradient(135deg,#fa9d3b,#f76b1c);color:#fff;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 3px 10px rgba(247,107,28,0.35);">确认转账</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    setTimeout(() => document.getElementById('transfer-amount-input')?.focus(), 100);
  }

  function closeTransferModal() {
    document.getElementById('transfer-modal')?.remove();
  }

  // ── 用户确认发起转账 ────────────────────────────
  function confirmUserTransfer() {
    const amtEl = document.getElementById('transfer-amount-input');
    const memoEl = document.getElementById('transfer-memo-input');
    const amt = parseFloat(amtEl?.value || '0');
    const memo = (memoEl?.value || '').trim();

    if (!amt || amt < 0.01) { showToast('请输入有效金额'); return; }
    if (amt > getBalance()) { showToast('余额不足'); return; }

    closeTransferModal();

    // 扣款
    setBalance(getBalance() - amt);

    // 生成转账 ID
    const transferId = uid();

    // 渲染"待处理"消息卡片（用户侧）
    appendTransferBubble({
      id: transferId,
      direction: 'user-to-ai',
      amount: amt,
      memo,
      status: 'pending',
      sender: '我',
    });

    // 记录账单
    addLedgerEntry({ id: transferId, from: '用户', to: _getPersonaName(), amount: amt, memo, status: 'pending' });

    // 触发 AI 判定
    triggerAIDecision(transferId, amt, memo);
  }

  // ═══════════════════════════════════════════════
  //  2. 渲染转账气泡卡片
  // ═══════════════════════════════════════════════
  function appendTransferBubble(data) {
    const { id, direction, amount, memo, status } = data;
    const isUserSide = direction === 'user-to-ai'; // true=右侧, false=左侧

    const wrap = document.createElement('div');
    wrap.className = `message-wrapper ${isUserSide ? 'user' : 'ai'}`;
    wrap.dataset.transferId = id;
    wrap.style.cssText = 'display:flex;align-items:flex-end;margin:8px 12px;gap:8px;' + (isUserSide ? 'flex-direction:row-reverse;' : '');

    const avatarHtml = !isUserSide
      ? `<img src="${_getPersonaAvatar()}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0;">`
      : '';

    wrap.innerHTML = `
      ${avatarHtml}
      <div class="wc-transfer-card" id="card-${id}">
        <div class="transfer-top">
          <div class="transfer-icon-wrap">💸</div>
          <div class="transfer-info">
            <div class="transfer-title">${isUserSide ? '转账给 ' + _getPersonaName() : _getPersonaName() + ' 向你转账'}</div>
            <div class="transfer-amount">¥${Number(amount).toFixed(2)}</div>
            ${memo ? `<div class="transfer-memo">${escHtml(memo)}</div>` : ''}
          </div>
        </div>
        <div class="transfer-divider"></div>
        <div class="transfer-action-area" id="action-${id}">
          ${renderActionArea(id, direction, status)}
        </div>
        <div class="transfer-footer">微信转账 · 虚拟资产</div>
      </div>`;

    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
      chatMessages.appendChild(wrap);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // 写入聊天历史，退出后重进也能复现
    _saveTransferToHistory(id, direction, amount, memo, status);
    return wrap;
  }

  function renderActionArea(id, direction, status) {
    if (status === 'accepted') {
      return `<span class="transfer-status accepted">✅ 已收款</span>`;
    }
    if (status === 'rejected') {
      return `<span class="transfer-status rejected">↩ 已退回</span>`;
    }
    // pending
    if (direction === 'ai-to-user') {
      return `<div class="transfer-btn-row">
        <button class="transfer-btn reject-btn" onclick="TransferApp.userRejectAITransfer('${id}')">拒收</button>
        <button class="transfer-btn accept-btn" onclick="TransferApp.userAcceptAITransfer('${id}')">收款</button>
      </div>`;
    }
    // user-to-ai pending: 等待 AI
    return `<span class="transfer-status pending">⏳ 等待对方确认</span>`;
  }

  function updateCardStatus(id, status) {
    const actionEl = document.getElementById(`action-${id}`);
    const card = document.getElementById(`card-${id}`);
    if (!actionEl) return;
    // 先尝试从 card 的 data 属性获取 direction，兼容历史加载渲染的卡片
    const wrap = document.querySelector(`[data-transfer-id="${id}"]`);
    const direction = card?.dataset.transferDir
      || (wrap ? (wrap.classList.contains('user') ? 'user-to-ai' : 'ai-to-user') : 'user-to-ai');
    actionEl.innerHTML = renderActionArea(id, direction, status);
    if (card) {
      card.style.transition = 'box-shadow 0.3s';
      card.style.boxShadow = status === 'accepted' ? '0 2px 16px rgba(7,193,96,0.2)' : status === 'rejected' ? '0 2px 16px rgba(0,0,0,0.05)' : '';
    }
    // 同步更新聊天历史里的状态
    _updateTransferHistoryStatus(id, status);
  }

  // ═══════════════════════════════════════════════
  //  3. AI 判定逻辑（用户→AI 转账）
  // ═══════════════════════════════════════════════
  async function triggerAIDecision(transferId, amount, memo) {
    await delay(800);

    const sysPrompt = buildAIJudgePrompt(amount, memo);

    let decision = 'accepted';
    try {
      const response = await callAIForDecision(sysPrompt);
      decision = parseDecision(response);
    } catch (e) {
      console.warn('[Transfer] AI decision error:', e);
    }

    finalizeUserToAITransfer(transferId, amount, memo, decision);
  }

  function buildAIJudgePrompt(amount, memo) {
    const personaName = _getPersonaName();
    const intimacy = _getIntimacy();
    return `[系统隐藏指令] 用户刚刚向你（${personaName}）发起了一笔 ¥${amount.toFixed(2)} 的虚拟转账，备注："${memo || '无'}"。

当前亲密度：${intimacy}/100。

请根据你的人设、与用户当前的关系以及这笔转账的合理性，决定是否接收。

规则：
- 若你判断应该接收（例如：情感合理、亲密度较高、用户有明确心意），请只回复 JSON: {"decision":"accepted","reason":"<一句话理由>"}
- 若你判断应该拒绝（例如：人设不接受金钱、时机不对、金额异常），请只回复 JSON: {"decision":"rejected","reason":"<一句话理由>"}

只回复 JSON，不要任何其他内容。`;
  }

  // 静默调用 AI（纯返回文本，绝不渲染气泡）
  async function callAIForDecision(prompt) {
    const SETTINGS_KEY = 'myCoolPhone_aiSettings';
    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    if (!settingsJSON) {
      await delay(600);
      return Math.random() > 0.2
        ? '{"decision":"accepted","reason":"心意已收到"}'
        : '{"decision":"rejected","reason":"不需要这些"}';
    }
    const settings = JSON.parse(settingsJSON);
    let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
    const apiUrl = baseUrl.endsWith('/v1')
      ? `${baseUrl}/chat/completions`
      : `${baseUrl}/v1/chat/completions`;

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 80
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data?.choices?.[0]?.message?.content || '').trim();
  }

  function parseDecision(text) {
    try {
      const match = text.match(/\{[\s\S]*?\}/);
      if (match) {
        const obj = JSON.parse(match[0]);
        if (obj.decision === 'accepted' || obj.decision === 'rejected') return obj.decision;
      }
    } catch {}
    if (/accept|接收|收下|好的|谢谢/i.test(text)) return 'accepted';
    if (/reject|拒绝|退回|不要|不用/i.test(text)) return 'rejected';
    return 'accepted';
  }

  function finalizeUserToAITransfer(transferId, amount, memo, decision) {
    updateCardStatus(transferId, decision);
    updateLedgerEntry(transferId, decision);

    if (decision === 'rejected') {
      setBalance(getBalance() + amount);
      showToast('转账已被退回，金额已返还');
    } else {
      showToast('对方已接收转账 ✅');
    }

    const followUpCtx = decision === 'accepted'
      ? `[系统] 你刚刚接收了用户 ¥${amount.toFixed(2)} 的转账，备注："${memo || '无'}"。请用符合人设的方式表达感谢或回应，不超过40字。`
      : `[系统] 你刚刚拒绝了用户 ¥${amount.toFixed(2)} 的转账并退回了金额，备注："${memo || '无'}"。请用符合人设的方式说明原因，不超过40字。`;

    if (typeof window.sendHiddenAIMessage === 'function') {
      window.sendHiddenAIMessage(followUpCtx);
    } else if (typeof window.triggerAIFollowUp === 'function') {
      window.triggerAIFollowUp(followUpCtx);
    }
  }

  // ═══════════════════════════════════════════════
  //  4. AI 主动发起转账
  //  由 apps.js 解析 AI 回复中的 [TRANSFER:金额:备注] 标签触发
  // ═══════════════════════════════════════════════
  function initiateAITransfer(amount, memo) {
    const transferId = uid();
    appendTransferBubble({
      id: transferId,
      direction: 'ai-to-user',
      amount,
      memo: memo || '',
      status: 'pending',
      sender: _getPersonaName(),
    });
    addLedgerEntry({ id: transferId, from: _getPersonaName(), to: '用户', amount, memo: memo || '', status: 'pending' });
    return transferId;
  }

  // ── 用户接收 AI 转账 ────────────────────────────
  function userAcceptAITransfer(transferId) {
    const card = document.getElementById(`card-${transferId}`);
    if (!card) return;
    const amtText = card.querySelector('.transfer-amount')?.textContent || '0';
    const amount = parseFloat(amtText.replace('¥', '')) || 0;

    setBalance(getBalance() + amount);
    updateCardStatus(transferId, 'accepted');
    updateLedgerEntry(transferId, 'accepted');
    showToast(`已收款 ¥${amount.toFixed(2)} ✅`);

    if (typeof window.sendHiddenAIMessage === 'function') {
      window.sendHiddenAIMessage(`[系统] 用户接受了你转账的 ¥${amount.toFixed(2)}，请给出一句符合人设的简短回应（不超过20字）。`);
    }
  }

  // ── 用户拒绝 AI 转账 ────────────────────────────
  function userRejectAITransfer(transferId) {
    updateCardStatus(transferId, 'rejected');
    updateLedgerEntry(transferId, 'rejected');
    showToast('已拒收');

    const card = document.getElementById(`card-${transferId}`);
    const amtText = card?.querySelector('.transfer-amount')?.textContent || '0';
    const amount = parseFloat(amtText.replace('¥', '')) || 0;

    if (typeof window.sendHiddenAIMessage === 'function') {
      window.sendHiddenAIMessage(`[系统] 用户拒绝了你转账的 ¥${amount.toFixed(2)}，请给出一句符合人设的简短回应（不超过20字）。`);
    }
  }

  // ── 更新账单状态 ────────────────────────────────
  function updateLedgerEntry(id, status) {
    const l = getLedger();
    const idx = l.findIndex(e => e.id === id);
    if (idx !== -1) { l[idx].status = status; l[idx].updatedAt = Date.now(); }
    saveLedger(l);
  }

  // ═══════════════════════════════════════════════
  //  5. 解析 AI 回复中的转账标签
  //  格式: [TRANSFER:88.00:生日快乐]
  // ═══════════════════════════════════════════════
  function parseAndHandleAITransfer(text) {
    const match = text.match(/\[TRANSFER:([\d.]+)(?::([^\]]*))?\]/);
    if (!match) return text;
    const amount = parseFloat(match[1]);
    const memo = match[2] || '';
    if (amount > 0) {
      setTimeout(() => initiateAITransfer(amount, memo), 400);
    }
    return text.replace(match[0], '').trim();
  }

  // ═══════════════════════════════════════════════
  //  6. 账单流水弹窗
  // ═══════════════════════════════════════════════
  function openLedger() {
    if (document.getElementById('transfer-ledger-modal')) return;
    const records = getLedger().slice(0, 50);
    const personaName = _getPersonaName();

    const rows = records.length === 0
      ? '<div style="text-align:center;color:#bbb;padding:30px 0;font-size:13px;">暂无转账记录</div>'
      : records.map(r => {
        const date = new Date(r.time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        const isOut = r.from === '用户';
        const statusLabel = { pending: '待处理', accepted: '已完成', rejected: '已退回' }[r.status] || r.status;
        const amtColor = isOut ? '#e74c3c' : '#07c160';
        const sign = isOut ? '-' : '+';
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #f5f5f5;">
          <div>
            <div style="font-size:12px;color:#999;">${date}</div>
            <div style="font-size:13px;color:#333;margin-top:2px;">${isOut ? `转给 ${personaName}` : `${personaName} 转入`}${r.memo ? ` · ${r.memo}` : ''}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:15px;font-weight:700;color:${amtColor};">${sign}¥${Number(r.amount).toFixed(2)}</div>
            <div style="font-size:11px;color:#bbb;margin-top:2px;">${statusLabel}</div>
          </div>
        </div>`;
      }).join('');

    const modal = document.createElement('div');
    modal.id = 'transfer-ledger-modal';
    modal.className = 'modal-overlay active';
    modal.addEventListener('click', (e) => { if (e.target === modal) TransferApp.closeLedger(); });
    modal.innerHTML = `
      <div class="modal-box" style="width:320px;max-height:70vh;border-radius:20px;overflow:hidden;display:flex;flex-direction:column;" onclick="event.stopPropagation()">
        <div style="padding:18px 18px 12px;font-size:15px;font-weight:700;color:#222;border-bottom:1px solid #f0f0f0;flex-shrink:0;">
          转账记录
          <button onclick="TransferApp.closeLedger()" style="float:right;background:none;border:none;font-size:20px;color:#bbb;cursor:pointer;line-height:1;">×</button>
        </div>
        <div style="overflow-y:auto;flex:1;padding:0 18px;">${rows}</div>
      </div>`;
    document.body.appendChild(modal);
  }

  function closeLedger() {
    document.getElementById('transfer-ledger-modal')?.remove();
  }

  // ── 工具函数 ────────────────────────────────────
  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
  function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function showToast(msg) {
    if (typeof window.showToast === 'function') { window.showToast(msg); return; }
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#fff;padding:8px 18px;border-radius:20px;font-size:13px;z-index:99999;pointer-events:none;';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }

  // ── 公开 API ────────────────────────────────────
  return {
    openTransferModal,
    closeTransferModal,
    confirmUserTransfer,
    userAcceptAITransfer,
    userRejectAITransfer,
    initiateAITransfer,
    parseAndHandleAITransfer,
    openLedger,
    closeLedger,
    getLedger,
    appendTransferBubble,
  };

})();

// 全局快捷入口（供 plus 菜单按钮调用）
window.openTransferModal = () => TransferApp.openTransferModal();
