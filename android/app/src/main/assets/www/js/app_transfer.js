/**
 * app_transfer.js — 双向虚拟转账与资产联动系统 v2.0
 * 新增：韩系黑白灰风格卡片 · 群聊转账对象选择 · AI角色钱包 · JSON指令格式
 * 依赖: app_pay.js (payData, savePayData), apps.js (friendsData, currentPersonaId, currentChatId, currentChatType)
 */

window.TransferApp = (() => {

  const LEDGER_KEY = 'wc_transfer_ledger';

  /* ══════════════════════════════════════════════
     账单读写
  ══════════════════════════════════════════════ */
  function getLedger() {
    try { return JSON.parse(localStorage.getItem(LEDGER_KEY) || '[]'); } catch { return []; }
  }
  function saveLedger(l) { localStorage.setItem(LEDGER_KEY, JSON.stringify(l)); }
  function addLedgerEntry(entry) {
    const l = getLedger();
    l.unshift({ ...entry, time: Date.now() });
    saveLedger(l);
  }
  function updateLedgerEntry(id, status) {
    const l = getLedger();
    const idx = l.findIndex(e => e.id === id);
    if (idx !== -1) { l[idx].status = status; l[idx].updatedAt = Date.now(); }
    saveLedger(l);
  }

  /* ══════════════════════════════════════════════
     用户余额（与 app_pay 共用 payData.balance）
  ══════════════════════════════════════════════ */
  function getBalance() {
    return (typeof payData !== 'undefined' && payData.balance != null) ? Number(payData.balance) : 0;
  }
  function setBalance(v) {
    if (typeof payData === 'undefined') return;
    payData.balance = Math.max(0, parseFloat(Number(v).toFixed(2)));
    if (typeof savePayData === 'function') savePayData();
  }

  /* ══════════════════════════════════════════════
     AI 角色钱包
  ══════════════════════════════════════════════ */
  function getAIBalance(chatId) {
    try {
      const f = (typeof friendsData !== 'undefined' && chatId) ? friendsData[chatId] : null;
      if (f && f.bankBalance != null) return Number(f.bankBalance);
      return 5000; // 默认虚拟余额
    } catch { return 5000; }
  }
  function setAIBalance(chatId, v) {
    try {
      if (!chatId || typeof friendsData === 'undefined') return;
      const f = friendsData[chatId];
      if (!f) return;
      f.bankBalance = Math.max(0, parseFloat(Number(v).toFixed(2)));
      if (typeof saveFriendsData === 'function') saveFriendsData();
    } catch {}
  }
  function addAITransaction(chatId, type, amount, memo) {
    try {
      if (!chatId || typeof friendsData === 'undefined') return;
      const f = friendsData[chatId];
      if (!f) return;
      if (!Array.isArray(f.bankTransactions)) f.bankTransactions = [];
      f.bankTransactions.unshift({ type, amount, memo: memo || '', time: Date.now() });
      if (typeof saveFriendsData === 'function') saveFriendsData();
    } catch {}
  }

  /* ══════════════════════════════════════════════
     目标对象解析
     - 单聊: currentChatId
     - 群聊: 通过选人弹窗设定的 _groupTargetId
  ══════════════════════════════════════════════ */
  let _groupTargetId = null;

  function _currentTargetId() {
    // apps.js 里 currentChatType / currentChatId / currentPersonaId 均以 let 声明，
    // let 不挂载到 window，必须直接按名称访问
    try {
      if (typeof currentChatType !== 'undefined' && currentChatType === 'group') {
        return _groupTargetId;
      }
    } catch (e) {}

    // 优先调用 apps.js 明确暴露的 getter
    if (typeof window.getCurrentChatId === 'function') {
      const id = window.getCurrentChatId();
      if (id) return id;
    }

    // 直接读 let 全局变量（与 apps.js 同一执行环境）
    try {
      if (typeof currentChatId !== 'undefined' && currentChatId) return currentChatId;
    } catch (e) {}

    try {
      if (typeof currentPersonaId !== 'undefined' && currentPersonaId) return currentPersonaId;
    } catch (e) {}

    // 最后兜底：从 DOM 上找当前激活的聊天 id
    try {
      const active = document.querySelector('.wc-chat-item.active, .chat-list-item.active, [data-chat-id].active');
      if (active) return active.dataset.chatId || active.dataset.id || null;
    } catch (e) {}
    return null;
  }

  function _getPersonaName(chatId) {
    const id = chatId || _currentTargetId()
             || (typeof currentPersonaId !== 'undefined' ? currentPersonaId : null);
    try {
      if (typeof friendsData !== 'undefined' && id && friendsData[id]) {
        const f = friendsData[id];
        return f.remark || f.realName || 'AI';
      }
      if (typeof personasMeta !== 'undefined' && id && personasMeta[id]) {
        return personasMeta[id].name || personasMeta[id].realName || 'AI';
      }
    } catch {}
    return 'AI';
  }

  function _getPersonaAvatar(chatId) {
    const id = chatId || _currentTargetId()
             || (typeof currentPersonaId !== 'undefined' ? currentPersonaId : null);
    try {
      if (typeof friendsData !== 'undefined' && id && friendsData[id] && friendsData[id].avatar) {
        return friendsData[id].avatar;
      }
    } catch {}
    return 'icon.png';
  }

  function _getIntimacy(chatId) {
    const id = chatId || _currentTargetId()
             || (typeof currentPersonaId !== 'undefined' ? currentPersonaId : null);
    try {
      if (typeof friendsData !== 'undefined' && id && friendsData[id]) {
        return Number(friendsData[id].intimacy || friendsData[id].affection || 0);
      }
    } catch {}
    return 0;
  }

  /* ── 生成唯一 ID ─────────────────────────────── */
  function uid() { return 'tr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }

  /* ══════════════════════════════════════════════
     持久化：写入 / 更新聊天历史
  ══════════════════════════════════════════════ */
  function _saveTransferToHistory(id, direction, amount, memo, status, targetId, currency = 'CNY') {
    if (typeof saveMessageToHistory !== 'function') return;
    const chatId = targetId
                || (typeof window.getCurrentChatId === 'function' ? window.getCurrentChatId() : null)
                || (typeof window.currentChatId !== 'undefined' ? window.currentChatId : null);
    if (!chatId) return;
    const safeMemo = (memo || '').replace(/\|/g, '\\|');
    const tagText  = `[WC_TRANSFER:${id}|${direction}|${Number(amount).toFixed(2)}|${safeMemo}|${status}|${currency}]`;
    const msgType  = direction === 'user-to-ai' ? 'sent' : 'received';
    saveMessageToHistory(chatId, {
      id: 'wc_tr_' + id,
      text: tagText,
      type: msgType,
      senderName: direction === 'user-to-ai' ? 'ME' : chatId
    });
  }

  function _updateTransferHistoryStatus(id, status) {
    if (typeof IDB === 'undefined') return;
    const chatId = (typeof window.getCurrentChatId === 'function' ? window.getCurrentChatId() : null)
                || (typeof window.currentChatId !== 'undefined' ? window.currentChatId : null);
    if (!chatId || typeof window.scopedChatKey !== 'function') return;
    IDB.get(window.scopedChatKey(chatId)).then(history => {
      if (!Array.isArray(history)) return;
      const msgId = 'wc_tr_' + id;
      const idx = history.findIndex(m => m.id === msgId);
      if (idx !== -1) {
        history[idx].text = history[idx].text.replace(/\|(pending|accepted|rejected)\]$/, `|${status}]`);
        IDB.set(window.scopedChatKey(chatId), history);
      }
    }).catch(() => {});
  }

  /* ══════════════════════════════════════════════
     1. 打开转账弹窗入口
  ══════════════════════════════════════════════ */
  function openTransferModal() {
    // 群聊：先选择成员（currentChatType 是 let，不在 window 上，直接按名访问）
    let _isGroup = false;
    try { _isGroup = (typeof currentChatType !== 'undefined' && currentChatType === 'group'); } catch (e) {}
    if (_isGroup) {
      _openGroupTargetModal();
      return;
    }
    _openAmountModal(_currentTargetId());
  }

  function closeTransferModal() {
    document.getElementById('transfer-modal')?.remove();
    document.getElementById('tr-group-target-modal')?.remove();
  }

  /* ── 群聊：选择转账对象弹窗 ─────────────────── */
  // 暂存当前转账目标 ID（避免通过 onclick 字符串插值传参导致 ID 丢失）
  let _pendingTargetId = null;

  function _openGroupTargetModal() {
    document.getElementById('tr-group-target-modal')?.remove();

    // currentChatId 是 let 变量，不挂载到 window，直接按名访问
    let groupId;
    try { groupId = (typeof currentChatId !== 'undefined') ? currentChatId : null; } catch (e) { groupId = null; }
    if (!groupId && typeof window.getCurrentChatId === 'function') groupId = window.getCurrentChatId();
    const group   = (typeof groupsData !== 'undefined') ? groupsData[groupId] : null;
    if (!group || !Array.isArray(group.members) || group.members.length === 0) {
      _showToast('群里没有可转账的成员'); return;
    }

    const members = group.members.filter(id =>
      typeof friendsData !== 'undefined' && friendsData[id]
    );
    if (members.length === 0) { _showToast('暂无可选成员'); return; }

    const rows = members.map(id => {
      const f    = friendsData[id];
      const name = f.remark || f.realName || id;
      const av   = f.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;
      const sid  = id.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `<div class="tr-gtt-row" onclick="TransferApp.selectGroupTarget('${sid}')">
        <img src="${_escAttr(av)}" class="tr-gtt-avatar">
        <span class="tr-gtt-name">${_escHtml(name)}</span>
        <i class="fas fa-chevron-right" style="color:#ccc;font-size: calc(11px * var(--font-scale));margin-left:auto;"></i>
      </div>`;
    }).join('');

    const modal = document.createElement('div');
    modal.id    = 'tr-group-target-modal';
    modal.className = 'modal-overlay active';
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    modal.innerHTML = `
      <div class="modal-box" style="width:300px;border-radius:20px;overflow:hidden;padding:0;" onclick="event.stopPropagation()">
        <div class="tr-modal-header">
          选择转账对象
          <i class="fas fa-times tr-modal-close" onclick="document.getElementById('tr-group-target-modal').remove()"></i>
        </div>
        <div style="max-height:320px;overflow-y:auto;padding:6px 0;">${rows}</div>
      </div>`;
    document.body.appendChild(modal);
  }

  // 公开：供 onclick 调用
  function selectGroupTarget(memberId) {
    _groupTargetId = memberId;
    document.getElementById('tr-group-target-modal')?.remove();
    _openAmountModal(memberId);
  }


  /* ── 金额 + 备注弹窗 ────────────────────────── */
  function _openAmountModal(targetId) {
    document.getElementById('transfer-modal')?.remove();

    // 解析目标 ID：优先使用传入的，其次从全局状态获取
    const resolvedId = targetId || _currentTargetId();
    if (!resolvedId) {
      _showToast('请先打开一个聊天再发起转账');
      return;
    }

    // 用模块级变量暂存，避免通过 onclick 字符串插值传参
    _pendingTargetId = resolvedId;

    const bal         = getBalance();
    const personaName = _getPersonaName(resolvedId);
    const avatarSrc   = _getPersonaAvatar(resolvedId);

    const modal = document.createElement('div');
    modal.id    = 'transfer-modal';
    modal.className = 'modal-overlay active';
    modal.addEventListener('click', e => { if (e.target === modal) closeTransferModal(); });

    modal.innerHTML = `
      <div class="tr-amount-box" onclick="event.stopPropagation()">
        <div class="tr-am-header">
          <img src="${_escAttr(avatarSrc)}" class="tr-am-avatar">
          <div class="tr-am-name">转账给 ${_escHtml(personaName)}</div>
          <div class="tr-am-balance">余额：<span>¥${bal.toFixed(2)}</span></div>
        </div>
        <div class="tr-am-row">
          <select id="transfer-currency-input" style="appearance:none; border:none; background:transparent; font-size: calc(24px * var(--font-scale)); font-weight:700; color:#333; outline:none; margin-right:5px; cursor:pointer;">
            <option value="CNY">¥</option>
            <option value="USD">$</option>
          </select>
          <input id="transfer-amount-input" type="number" min="0.01" max="${bal}"
            step="0.01" placeholder="0.00" inputmode="decimal" class="tr-am-input">
        </div>
        <input id="transfer-memo-input" type="text" maxlength="30"
          placeholder="备注（可选）" class="tr-am-memo">
        <div class="tr-am-btns">
          <button class="tr-am-btn cancel" onclick="TransferApp.closeTransferModal()">取消</button>
          <button class="tr-am-btn confirm" onclick="TransferApp.confirmUserTransfer()">确认转账</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    setTimeout(() => document.getElementById('transfer-amount-input')?.focus(), 100);
  }

  /* ══════════════════════════════════════════════
     2. 用户确认发起转账
  ══════════════════════════════════════════════ */
  function confirmUserTransfer(targetId) {
    const amtEl  = document.getElementById('transfer-amount-input');
    const memoEl = document.getElementById('transfer-memo-input');
    const currEl = document.getElementById('transfer-currency-input');
    const amt    = parseFloat(amtEl?.value || '0');
    const memo   = (memoEl?.value || '').trim();
    const currency = currEl?.value || 'CNY';

    if (!amt || amt < 0.01)  { _showToast('请输入有效金额'); return; }
    if (currency === 'CNY' && amt > getBalance())  { _showToast('余额不足'); return; }

    // 优先级：调用方传入 > 模块暂存 > 全局当前聊天 ID
    const resolvedId = targetId || _pendingTargetId || _currentTargetId();
    _pendingTargetId = null; // 使用后清空，防止残留
    if (!resolvedId)         { _showToast('转账对象不明，请重新打开聊天后再试'); return; }

    closeTransferModal();
    if (currency === 'CNY') setBalance(getBalance() - amt);

    const transferId = uid();
    appendTransferBubble({ id: transferId, direction: 'user-to-ai', amount: amt, memo, status: 'pending', targetId: resolvedId, currency });
    addLedgerEntry({ id: transferId, from: '用户', to: _getPersonaName(resolvedId), amount: amt, memo, status: 'pending', currency });
    _triggerAIDecision(transferId, amt, memo, resolvedId, currency);
  }

  /* ══════════════════════════════════════════════
     3. 渲染转账卡片气泡（韩系黑白灰风格）
        使用标准 chat-row 结构确保气泡完整显示
  ══════════════════════════════════════════════ */
  function appendTransferBubble(data) {
    const { id, direction, amount, memo, status, targetId, currency = 'CNY' } = data;
    const isUserSide  = direction === 'user-to-ai';
    const resolvedId  = targetId || _currentTargetId();
    const personaName = _getPersonaName(resolvedId);
    const avatarSrc   = _getPersonaAvatar(resolvedId);
    const currencySymbol = (currency === 'USD') ? '$' : '¥';

    // 标准 chat-row 结构
    const row = document.createElement('div');
    row.className = `chat-row ${isUserSide ? 'sent' : 'received'}`;
    row.dataset.transferId = id;

    const img = document.createElement('img');
    img.className = 'chat-avatar-img';
    img.src = isUserSide
      ? ((typeof AVATAR_USER !== 'undefined') ? AVATAR_USER : 'icon.png')
      : avatarSrc;

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content-wrapper';

    const bubble = document.createElement('div');
    bubble.className = `message-bubble rich-bubble ${isUserSide ? 'sent' : 'received'}`;
    bubble.style.cssText = 'background:transparent!important;padding:0!important;box-shadow:none!important;border-radius:0!important;max-width:260px!important;overflow:visible!important;';
    // 移除默认气泡背景，让卡片样式接管
    bubble.style.cssText = 'background:transparent!important;padding:0!important;box-shadow:none!important;border-radius:0!important;max-width:260px!important;overflow:visible!important;';
    contentWrapper.style.cssText = 'overflow:visible!important;';

    const titleText = isUserSide
      ? `转账给 ${personaName}`
      : `${personaName} 向你转账`;

    bubble.innerHTML = `
      <div class="wc-transfer-card" id="card-${id}" data-transfer-dir="${direction}">
        <div class="transfer-top">
          <div class="transfer-icon-wrap">
            <i class="fas fa-paper-plane"></i>
          </div>
          <div class="transfer-info">
            <div class="transfer-title">${_escHtml(titleText)}</div>
            <div class="transfer-amount">${currencySymbol}${Number(amount).toFixed(2)}</div>
            ${memo ? `<div class="transfer-memo">${_escHtml(memo)}</div>` : ''}
          </div>
        </div>
        <div class="transfer-divider"></div>
        <div class="transfer-action-area" id="action-${id}">
          ${renderActionArea(id, direction, status)}
        </div>
        <div class="transfer-footer">虚拟转账 · 仅供娱乐</div>
      </div>`;

    contentWrapper.appendChild(bubble);

    if (isUserSide) {
      row.appendChild(contentWrapper);
      row.appendChild(img);
    } else {
      row.appendChild(img);
      row.appendChild(contentWrapper);
    }

    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
      chatMessages.appendChild(row);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    _saveTransferToHistory(id, direction, amount, memo, status, resolvedId, currency);
    return row;
  }

  /* ── 渲染操作区域 ───────────────────────────── */
  function renderActionArea(id, direction, status) {
    if (status === 'accepted') {
      const label = direction === 'user-to-ai' ? '对方已收款' : '你已收款';
      return `<span class="transfer-status accepted"><i class="fas fa-check-circle"></i> ${label}</span>`;
    }
    if (status === 'rejected') {
      const label = direction === 'user-to-ai' ? '对方已拒收' : '你已拒收';
      return `<span class="transfer-status rejected"><i class="fas fa-undo-alt"></i> ${label}</span>`;
    }
    if (direction === 'ai-to-user') {
      return `<div class="transfer-btn-row">
        <button class="transfer-btn reject-btn" onclick="TransferApp.userRejectAITransfer('${id}')">残忍拒绝</button>
        <button class="transfer-btn accept-btn" onclick="TransferApp.userAcceptAITransfer('${id}')">开心收下</button>
      </div>`;
    }
    // user-to-ai pending
    return `<span class="transfer-status pending"><i class="fas fa-clock"></i> 等待对方确认</span>`;
  }

  /* ── 更新卡片状态（接受/拒绝后刷新 UI） ──────── */
  function updateCardStatus(id, status) {
    const actionEl = document.getElementById(`action-${id}`);
    const card     = document.getElementById(`card-${id}`);
    if (!actionEl) return;
    const wrap = document.querySelector(`[data-transfer-id="${id}"]`);
    const direction = (card && card.dataset.transferDir)
      || (wrap ? (wrap.classList.contains('sent') ? 'user-to-ai' : 'ai-to-user') : 'user-to-ai');
    actionEl.innerHTML = renderActionArea(id, direction, status);
    _updateTransferHistoryStatus(id, status);
  }

  /* ══════════════════════════════════════════════
     4. AI 判定：用户→AI 转账
  ══════════════════════════════════════════════ */
  async function _triggerAIDecision(transferId, amount, memo, targetId, currency = 'CNY') {
    await _delay(800);

    const personaName = _getPersonaName(targetId);
    const intimacy    = _getIntimacy(targetId);
    const currencySymbol = (currency === 'USD') ? '$' : '¥';
    const prompt = `[系统隐藏指令] 用户刚向你（${personaName}）发起了一笔 ${currencySymbol}${Number(amount).toFixed(2)} 的虚拟转账，备注："${memo || '无'}"。
当前亲密度：${intimacy}/100。
请根据你的人设和当前关系决定是否接收。
接受请只回复: {"decision":"accepted","reason":"<一句话>"}
拒绝请只回复: {"decision":"rejected","reason":"<一句话>"}
只回复 JSON，不要其他内容。`;

    let decision = 'accepted';
    try {
      const resp = await _callAISilent(prompt);
      decision   = _parseDecision(resp);
    } catch (e) { console.warn('[Transfer] AI decision error:', e); }

    _finalizeUserToAITransfer(transferId, amount, memo, decision, targetId);
  }

  async function _callAISilent(prompt) {
    const settingsJSON = localStorage.getItem('myCoolPhone_aiSettings');
    if (!settingsJSON) {
      await _delay(600);
      return Math.random() > 0.25
        ? '{"decision":"accepted","reason":"心意已收到"}'
        : '{"decision":"rejected","reason":"不需要这些"}';
    }
    const s = JSON.parse(settingsJSON);
    const base = (s.endpoint || '').replace(/\/$/, '');
    const url  = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
    const res  = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s.apiKey}` },
      body: JSON.stringify({ model: s.model, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 80 })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data?.choices?.[0]?.message?.content || '').trim();
  }

  function _parseDecision(text) {
    try {
      const m = text.match(/\{[\s\S]*?\}/);
      if (m) {
        const obj = JSON.parse(m[0]);
        if (obj.decision === 'accepted' || obj.decision === 'rejected') return obj.decision;
      }
    } catch {}
    if (/accept|接收|收下|好的|谢谢/i.test(text)) return 'accepted';
    if (/reject|拒绝|退回|不要|不用/i.test(text)) return 'rejected';
    return 'accepted';
  }

  function _finalizeUserToAITransfer(transferId, amount, memo, decision, targetId) {
    updateCardStatus(transferId, decision);
    updateLedgerEntry(transferId, decision);

    if (decision === 'accepted') {
      // AI 钱包入账
      const aiBalance = getAIBalance(targetId);
      setAIBalance(targetId, aiBalance + amount);
      addAITransaction(targetId, 'income', amount, memo);
      _showToast('对方已收款 ✅');
    } else {
      // 退款给用户
      setBalance(getBalance() + amount);
      _showToast('转账已被拒收，金额已退回');
    }

    // 直接触发 AI 正式回应（不预设文字，完全由 API 生成）
    const ctx = decision === 'accepted'
      ? `[System: You just accepted the user's transfer of ¥${Number(amount).toFixed(2)}, memo: "${memo || 'none'}". Respond naturally in character.]`
      : `[System: You just rejected the user's transfer of ¥${Number(amount).toFixed(2)} and returned it, memo: "${memo || 'none'}". Respond naturally in character.]`;
    setTimeout(() => {
      if (typeof window.sendHiddenAIMessage === 'function') window.sendHiddenAIMessage(ctx);
    }, 600);
  }

  /* ══════════════════════════════════════════════
     5. AI 主动发起转账
     AI 输出指令：[TRANSFER:88.00:备注]
              或  {"type":"transfer","amount":100,"note":"备注"}
  ══════════════════════════════════════════════ */
  function initiateAITransfer(amount, memo, targetId, currency = 'CNY') {
    const resolvedId = targetId || _currentTargetId();
    // AI 钱包扣款
    const aiBalance = getAIBalance(resolvedId);
    if (currency === 'CNY') {
      setAIBalance(resolvedId, Math.max(0, aiBalance - amount));
      addAITransaction(resolvedId, 'expense', amount, memo);
    }

    const transferId = uid();
    appendTransferBubble({ id: transferId, direction: 'ai-to-user', amount, memo: memo || '', status: 'pending', targetId: resolvedId, currency });
    addLedgerEntry({ id: transferId, from: _getPersonaName(resolvedId), to: '用户', amount, memo: memo || '', status: 'pending', currency });
    return transferId;
  }

  /* ── 用户接收 AI 转账 ──────────────────────── */
  function userAcceptAITransfer(transferId) {
    const card = document.getElementById(`card-${transferId}`);
    if (!card) return;
    const amtText = card.querySelector('.transfer-amount')?.textContent || '0';
    const amount  = parseFloat(amtText.replace('¥', '')) || 0;

    setBalance(getBalance() + amount);
    updateCardStatus(transferId, 'accepted');
    updateLedgerEntry(transferId, 'accepted');
    _showToast(`已收款 ¥${amount.toFixed(2)} ✅`);

    setTimeout(() => {
      if (typeof window.sendHiddenAIMessage === 'function') {
        window.sendHiddenAIMessage(`[System: The user just accepted your transfer of ¥${amount.toFixed(2)}. Respond naturally in character.]`);
      }
    }, 600);
  }

  /* ── 用户拒收 AI 转账 ──────────────────────── */
  function userRejectAITransfer(transferId) {
    const card    = document.getElementById(`card-${transferId}`);
    const amtText = card?.querySelector('.transfer-amount')?.textContent || '0';
    const amount  = parseFloat(amtText.replace('¥', '')) || 0;

    updateCardStatus(transferId, 'rejected');
    updateLedgerEntry(transferId, 'rejected');

    // 退款给 AI
    const resolvedId = _currentTargetId();
    if (resolvedId && amount > 0) {
      setAIBalance(resolvedId, getAIBalance(resolvedId) + amount);
      addAITransaction(resolvedId, 'refund', amount, '用户拒收退款');
    }
    _showToast('已拒收，金额退回给对方');

    setTimeout(() => {
      if (typeof window.sendHiddenAIMessage === 'function') {
        window.sendHiddenAIMessage(`[System: The user just rejected your transfer of ¥${amount.toFixed(2)} and returned it to you. Respond naturally in character.]`);
      }
    }, 600);
  }

  /* ══════════════════════════════════════════════
     6. 解析 AI 回复中的转账指令
     支持两种格式：
       旧格式: [TRANSFER:88.00:生日快乐]
       新格式: {"type":"transfer","amount":88,"note":"生日快乐"}
               {"type":"transfer","amount":88,"note":"...","targetName":"角色B"}（群聊）
  ══════════════════════════════════════════════ */
  function parseAndHandleAITransfer(text) {
    let cleanText = text;

    // ── 旧格式 ──
    const tagMatch = cleanText.match(/\[TRANSFER:([\d.]+)(?::([^\]]*))?\]/i);
    if (tagMatch) {
      const amount = parseFloat(tagMatch[1]);
      const memo   = tagMatch[2] || '';
      if (amount > 0) setTimeout(() => initiateAITransfer(amount, memo, null, 'CNY'), 400);
      cleanText = cleanText.replace(tagMatch[0], '').trim();
    }

    // ── 新标签格式 ──
    const tagMatch2 = cleanText.match(/\[WC_TRANSFER:([\d.]+):([^:]*):([^\]]*)\]/i);
    if (tagMatch2) {
      const amount = parseFloat(tagMatch2[1]);
      const memo   = tagMatch2[2] || '';
      const currency = tagMatch2[3] || 'CNY';
      if (amount > 0) setTimeout(() => initiateAITransfer(amount, memo, null, currency), 400);
      cleanText = cleanText.replace(tagMatch2[0], '').trim();
    }

    // ── 新格式 JSON ──
    const jsonMatches = cleanText.match(/\{"type"\s*:\s*"transfer"[^}]*\}/g);
    if (jsonMatches) {
      for (const raw of jsonMatches) {
        try {
          const cmd = JSON.parse(raw);
          if (cmd.type !== 'transfer') continue;
          cleanText = cleanText.replace(raw, '').trim();
          const amount = parseFloat(cmd.amount || 0);
          const note   = cmd.note || cmd.memo || '';
          const currency = cmd.currency || 'CNY';
          if (amount <= 0) continue;

          // 群聊可以指定 targetName → 转换为 chatId
          let tgtId = _currentTargetId();
          if (cmd.targetName && typeof friendsData !== 'undefined') {
            for (const [k, v] of Object.entries(friendsData)) {
              if (v.realName === cmd.targetName || v.remark === cmd.targetName) { tgtId = k; break; }
            }
          }
          setTimeout(() => initiateAITransfer(amount, note, tgtId, currency), 400);
        } catch {}
      }
    }

    return cleanText;
  }

  /* ══════════════════════════════════════════════
     7. 账单流水弹窗
  ══════════════════════════════════════════════ */
  function openLedger() {
    document.getElementById('transfer-ledger-modal')?.remove();
    const records     = getLedger().slice(0, 50);
    const personaName = _getPersonaName();

    const rows = records.length === 0
      ? '<div style="text-align:center;color:#bbb;padding:30px 0;font-size: calc(13px * var(--font-scale));">暂无转账记录</div>'
      : records.map(r => {
          const date = new Date(r.time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
          const isOut = r.from === '用户';
          const statusLabel = { pending: '待处理', accepted: '已完成', rejected: '已退回' }[r.status] || r.status;
          const amtColor = isOut ? '#e74c3c' : '#30d158';
          const sign = isOut ? '-' : '+';
          const curSym = (r.currency === 'USD') ? '$' : '¥';
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #f5f5f5;">
            <div>
              <div style="font-size: calc(12px * var(--font-scale));color:#999;">${date}</div>
              <div style="font-size: calc(13px * var(--font-scale));color:#333;margin-top:2px;">${isOut ? `转给 ${personaName}` : `${personaName} 转入`}${r.memo ? ` · ${r.memo}` : ''}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size: calc(15px * var(--font-scale));font-weight:700;color:${amtColor};">${sign}${curSym}${Number(r.amount).toFixed(2)}</div>
              <div style="font-size: calc(11px * var(--font-scale));color:#bbb;margin-top:2px;">${statusLabel}</div>
            </div>
          </div>`;
        }).join('');

    const modal = document.createElement('div');
    modal.id    = 'transfer-ledger-modal';
    modal.className = 'modal-overlay active';
    modal.addEventListener('click', e => { if (e.target === modal) closeLedger(); });
    modal.innerHTML = `
      <div class="modal-box" style="width:320px;max-height:70vh;border-radius:20px;overflow:hidden;display:flex;flex-direction:column;" onclick="event.stopPropagation()">
        <div style="padding:18px 18px 12px;font-size: calc(15px * var(--font-scale));font-weight:700;color:#1a1a1a;border-bottom:1px solid #f0f0f0;flex-shrink:0;">
          转账记录
          <button onclick="TransferApp.closeLedger()" style="float:right;background:none;border:none;font-size: calc(20px * var(--font-scale));color:#bbb;cursor:pointer;line-height:1;">×</button>
        </div>
        <div style="overflow-y:auto;flex:1;padding:0 18px;">${rows}</div>
      </div>`;
    document.body.appendChild(modal);
  }

  function closeLedger() {
    document.getElementById('transfer-ledger-modal')?.remove();
  }

  /* ── 隐藏上下文入队（等用户点回复按钮时附带给AI）
     注意：使用独立的 tr_action_context key，避免被查手机蝴蝶效应的
     MISCHIEF 处理器错误消费并包裹进"偷看手机"的错误框架中。 */
  function _enqueuePendingContext(ctx) {
    try {
      const pending = JSON.parse(localStorage.getItem('tr_action_context') || '[]');
      pending.push(ctx);
      localStorage.setItem('tr_action_context', JSON.stringify(pending));
    } catch {}
  }

  /* ── 工具函数 ────────────────────────────────── */
  function _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
  function _escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function _escAttr(s) { return String(s).replace(/"/g, '&quot;'); }
  function _showToast(msg) {
    if (typeof window.showToast === 'function') { window.showToast(msg); return; }
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#fff;padding:8px 18px;border-radius:20px;font-size: calc(13px * var(--font-scale));z-index:99999;pointer-events:none;';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }

  /* ── 公开 API ────────────────────────────────── */
  return {
    openTransferModal,
    closeTransferModal,
    selectGroupTarget,
    confirmUserTransfer,
    userAcceptAITransfer,
    userRejectAITransfer,
    initiateAITransfer,
    parseAndHandleAITransfer,
    openLedger,
    closeLedger,
    getLedger,
    appendTransferBubble,
    updateCardStatus,
    getAIBalance,
  };

})();

/* ── 全局快捷入口 ────────────────────────────────── */
window.openTransferModal = () => TransferApp.openTransferModal();
