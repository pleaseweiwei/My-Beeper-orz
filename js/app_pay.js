/* =========================================
   [更新] 支付/钱包 (Pay) 系统核心逻辑 (分卡+小游戏版)
   ========================================= */

const PAY_DATA_KEY = 'myCoolPhone_payData';
let payData = {
    balance: 0.00,        
    bankCard: 0.00,       
    yuebao: 0.00,         
    lastInterestDate: 0,  
    totalProfit: 0.00,    
    transactions: [],     
    career: { type: 'worker', day: 15, amount: 0, lastPayMonth: -1 },
    intimatePay: {},       // 我给别人的
    intimatePayFrom: {}    // 别人给我的
};

function payQueueUiWrite(fn) {
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => requestAnimationFrame(fn));
    } else {
        setTimeout(fn, 16);
    }
}

function paySetSoftDisplay(el, visible, displayMode = 'block') {
    if (!el) return;
    if (visible) {
        el.hidden = false;
        el.style.display = displayMode;
    } else {
        el.hidden = true;
        el.style.display = 'none';
    }
}

window.resetPayData = async function() {
    if (!confirm("确定要重置【当前人设】的钱包吗？\n将清空余额/银行卡/余额宝/账单/亲密付记录。")) return;

    payData = {
        balance: 0.00,
        bankCard: 0.00,
        yuebao: 0.00,
        lastInterestDate: 0,
        totalProfit: 0.00,
        transactions: [],
        career: { type: 'worker', day: 15, amount: 0, lastPayMonth: -1, source: '' },
        intimatePay: {},
        intimatePayFrom: {}
    };

    // 写回存储（用你现有的 savePayData 即可）
    await savePayData();

    // 如果你当前正停留在某个子页面，顺便刷新一下
    try { renderIntimatePage(); } catch(e) {}
    try { renderBillList(); } catch(e) {}
    try { renderYuebaoPage(); } catch(e) {}
    try { renderCareerPage(); } catch(e) {}

    alert("钱包已重置。");
};

// 账单渲染与右滑删除逻辑 (性能优化版)
function renderBillList() {
    const list = document.getElementById('pay-bill-list');
    
    if(payData.transactions.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:60px 20px; color:#aaa; font-size:12px;"><i class="fas fa-receipt" style="font-size:32px; color:#eee; margin-bottom:10px; display:block;"></i>没有任何账单记录</div>';
        return;
    }

    // 核心修复：使用字符串一次性拼接，杜绝在循环中使用 innerHTML += 造成的致命卡顿
    let htmlStr = '';
    payData.transactions.forEach(t => {
        const sign = t.type === 'income' ? '+' : '-';
        const colorClass = t.type === 'income' ? 'bill-income-text' : 'bill-expense-text';
        const iconClass = t.type === 'income' ? 'fa-arrow-down' : 'fa-arrow-up';
        const iconBg = t.type === 'income' ? 'bill-icon-in' : 'bill-icon-out';
        
        const d = new Date(t.time);
        const dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        
        htmlStr += `
            <div class="bill-card-modern" id="tx_item_${t.id}" 
                 ontouchstart="window.billTouchStartX = event.touches[0].clientX;"
                 ontouchend="window.handleBillTouchEnd(event, '${t.id}')"
                 style="transition: transform 0.3s ease;">
                <div class="bill-icon-wrap ${iconBg}">
                    <i class="fas ${iconClass}"></i>
                </div>
                <div class="bill-info-wrap">
                    <div class="bill-title">${t.title}</div>
                    <div class="bill-time">${dateStr} (右滑删除)</div>
                </div>
                <div class="bill-amount-wrap ${colorClass}">
                    ${sign} ${t.amount.toFixed(2)}
                </div>
            </div>
        `;
    });
    
    // 一次性渲染进 DOM
    list.innerHTML = htmlStr;
}


// 账单右滑删除事件
window.billTouchStartX = 0;
window.handleBillTouchEnd = function(e, txId) {
    const endX = e.changedTouches[0].clientX;
    const diff = endX - window.billTouchStartX;
    if (diff > 80) { // 向右滑出一段距离
        if (confirm("确定删除这条账单记录吗？(仅清除记录，不影响实际金额)")) {
            payData.transactions = payData.transactions.filter(x => x.id !== txId);
            savePayData();
            const el = document.getElementById('tx_item_' + txId);
            if(el) {
                el.style.transform = "translateX(120%)";
                setTimeout(() => el.remove(), 300);
            }
        }
    }
}


// 1. 初始化与打开App
window.openPayApp = async function() {
    const app = document.getElementById('payApp');
    if(app) {
        app.classList.add('open');
        await loadPayData();
        
        checkYuebaoInterest();
        checkCareerSalary();
        simulateIntimatePayConsumption();

        renderPayMainPage();
    }
}
window.closePayApp = function() {
    document.getElementById('payApp').classList.remove('open');
}

// 2. 数据加载与保存
async function loadPayData() {
    const data = await IDB.get(PAY_DATA_KEY);
    if(data) {
        payData = { ...payData, ...data };
        if(!payData.intimatePay) payData.intimatePay = {};
    }
}
async function savePayData() {
    await IDB.set(PAY_DATA_KEY, payData);
    renderPayMainPage();
}

// 3. 渲染主页数据 (修复版)
function renderPayMainPage() {
    // 安全获取并更新元素
    const elTotal = document.getElementById('pay-total-balance');
    if (elTotal) elTotal.innerText = payData.balance.toFixed(2);

    const elBank = document.getElementById('pay-bank-balance');
    if (elBank) elBank.innerText = payData.bankCard.toFixed(2);

    // 修复点：这里加了判断，防止 index.html 没这个 ID 时报错
    const elYuebao = document.getElementById('pay-yuebao-balance');
    if (elYuebao) elYuebao.innerText = payData.yuebao.toFixed(2);
    
    let yestProfit = 0;
    const records = payData.transactions.filter(t => t.title === '余额宝收益');
    if(records.length > 0) yestProfit = records[0].amount;
    
    const elYest = document.getElementById('pay-yuebao-yesterday');
    if (elYest) elYest.innerText = yestProfit.toFixed(2);
}


// 4. 记账通用函数
function addTransaction(title, amount, type) {
    payData.transactions.unshift({
        id: 'tx_' + Date.now(),
        title: title,
        amount: parseFloat(amount),
        type: type,
        time: Date.now()
    });
}

// 5. 页面路由 (修复闪屏版)
window.openPaySubPage = function(pageId) {
    document.querySelectorAll('.pay-sub-page').forEach(el => el.classList.remove('show'));
    const page = document.getElementById('pay-page-' + pageId);
    if(page) {
        // 先渲染数据，防止 DOM 操作阻塞 CSS 动画
        if(pageId === 'bill') renderBillList();
        if(pageId === 'yuebao') renderYuebaoPage();
        if(pageId === 'career') renderCareerPage();
        if(pageId === 'intimate') renderIntimatePage();
        
        // 利用双重 requestAnimationFrame 确保数据渲染完毕后再滑入
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                page.classList.add('show');
            });
        });
    }
}


// ==========================================
// [新增架构] 统一的高级定制弹窗系统 (替代 native alert/prompt)
// ==========================================
function getKDialogElements() {
    return {
        overlay: document.getElementById('k-dialog-overlay'),
        title: document.getElementById('k-dialog-title'),
        desc: document.getElementById('k-dialog-desc'),
        input: document.getElementById('k-dialog-input'),
        confirmBtn: document.getElementById('k-dialog-confirm'),
        cancelBtn: document.getElementById('k-dialog-cancel')
    };
}

function resetKDialogButton(button) {
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);
    return newButton;
}

function openKDialog({
    title = "提示",
    desc = "",
    showInput = false,
    placeholder = "",
    showCancel = false,
    focusInput = false,
    onConfirm = null,
    onCancel = null
} = {}) {
    const { overlay, title: titleEl, desc: descEl, input, confirmBtn, cancelBtn } = getKDialogElements();

    titleEl.innerText = title;
    descEl.innerHTML = desc;
    paySetSoftDisplay(input, showInput, 'block');
    input.value = '';
    input.placeholder = placeholder;
    paySetSoftDisplay(cancelBtn, showCancel, 'block');

    const newConfirm = resetKDialogButton(confirmBtn);
    const newCancel = resetKDialogButton(cancelBtn);

    newCancel.onclick = () => {
        overlay.classList.remove('active');
        if(onCancel) onCancel();
    };

    newConfirm.onclick = () => {
        const value = input.value;
        overlay.classList.remove('active');
        if(onConfirm) onConfirm(value);
    };

    overlay.classList.add('active');

    if (showInput && focusInput) {
        setTimeout(() => input.focus(), 300);
    }
}

function showKAlert(desc, callback = null) {
    openKDialog({
        desc,
        onConfirm: () => {
            if(callback) callback();
        }
    });
}

function showKPrompt(title, desc, placeholder, callback) {
    openKDialog({
        title,
        desc,
        showInput: true,
        placeholder,
        showCancel: true,
        focusInput: true,
        onConfirm: (value) => {
            if(callback) callback(value);
        }
    });
}
// === 新增：高级定制版 Confirm 确认弹窗 ===
window.showKConfirm = function(title, desc, onConfirm, onCancel) {
    openKDialog({
        title,
        desc,
        showCancel: true,
        onConfirm,
        onCancel
    });
}


// ==========================================
// [核心机制] 1：AI 财富测算 (根据当前身份)
// ==========================================
window.generateInitialWealthByAI = async function() {
    const p = personasMeta[currentPersonaId];
    const persona = p ? p.persona : "普通人";
    const prompt = `
    用户当前的人设是：“${persona}”。
    请根据这个人设，推断TA的【微信零钱】和【银行存款】是多少（人民币）。
    如果人设是落魄打工人，可能零钱只有几块。如果是霸道总裁，可能零钱几十万。
    直接返回纯JSON格式：{"balance": 数字, "bankCard": 数字}。注意：只能返回纯JSON，不要输出任何其他文本或markdown标记！
    `;
    
    const btn = document.getElementById('btn-ai-wealth');
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 命运齿轮转动中...';
    btn.style.pointerEvents = 'none';
    
    const res = await callAiForSpecialTask(prompt);
    btn.innerHTML = oldHtml;
    btn.style.pointerEvents = 'auto';
    
    if(res) {
        try {
            const cleanStr = res.replace(/```json/g, '').replace(/```/g, '').trim();
            const data = JSON.parse(cleanStr);
            if(data.balance !== undefined && data.bankCard !== undefined) {
                payData.balance = parseFloat(data.balance);
                payData.bankCard = parseFloat(data.bankCard);
                addTransaction('AI 命运赐予', payData.balance, 'income');
                savePayData();
                showKAlert(`<b style="color:#07c160; font-size:16px;">测算完成！</b><br><br>根据你的设定...<br>你的零钱为：<b>¥${payData.balance}</b><br>银行存款为：<b>¥${payData.bankCard}</b><br><br>努力生活吧！`);
            }
        } catch(e) {
            showKAlert('AI 给出的数字太模糊，请再试一次。');
        }
    }
}

// ==========================================
// [核心机制] 2：凭空增加余额 & 抢金币小游戏
// ==========================================
window.addBalancePrompt = function() {
    showKPrompt("增加余额", "你要凭空为自己增加多少零钱？", "输入金额 (如: 1000)", (val) => {
        const amt = parseFloat(val);
        if(isNaN(amt) || amt <= 0) return;
        
        // 1. 小额福利 (< 1000): 直接到账，无需游戏
        if(amt < 1000) {
            payData.balance += amt;
            addTransaction('天降横财', amt, 'income');
            savePayData();
            showKAlert(`成功增加余额 <b style="color:#07c160;">¥${amt.toFixed(2)}</b>`);
        } 
        // 2. 中额挑战 (1000 - 10000): 简单的抢金币游戏
        else if (amt < 10000) {
            showKAlert(`<b style="font-size:16px;">小试牛刀 (๑•̀ㅂ•́)و✧</b><br><br>金额有点多，玩个简单的小游戏证明你的手速！<br>目标：10秒收集 10 个金币。`, () => {
                startCoinGame(amt, false); // false = 简单模式 (金币不动)
            });
        }
        // 3. 大额验证 (10000 - 100000): 【新游戏】智力数学题
        else if (amt < 100000) {
            // 生成随机数学题 (两位数乘法+加法)
            const n1 = Math.floor(Math.random() * 30) + 10; // 10-39
            const n2 = Math.floor(Math.random() * 9) + 2;   // 2-10
            const n3 = Math.floor(Math.random() * 50) + 1;  // 1-50
            const answer = n1 * n2 + n3;

            showKAlert(`<b style="font-size:16px;">大额验证 (⊙_⊙)?</b><br><br>金额较大（1万-10万），需要进行智力验证！<br>请口算或心算：<br><br><b style="font-size:18px;">${n1} × ${n2} + ${n3} = ?</b>`, () => {
                // 延迟一点点打开输入框，防止弹窗冲突
                setTimeout(() => {
                    showKPrompt("智力验证", `请输入计算结果：${n1} × ${n2} + ${n3}`, "输入数字答案", (inputVal) => {
                        if (parseInt(inputVal) === answer) {
                            payData.balance += amt;
                            addTransaction('智力变现', amt, 'income');
                            savePayData();
                            showKAlert(`回答正确！智商占领高地！<br>已存入 <b style="color:#07c160;">¥${amt.toFixed(2)}</b>`);
                        } else {
                            showKAlert(`回答错误！<br>正确答案是 <b>${answer}</b>。<br>钱飞走了~ 再试一次吧！`);
                        }
                    });
                }, 300);
            });
        }
        // 4. 巨额考验 (>= 100000): 困难版抢金币
        else {
            showKAlert(`<b style="font-size:16px;">巨款预警 Σ(っ °Д °;)っ</b><br><br>想要凭空拿十万以上，必须通过【地狱级】考验！<br>金币会乱飞且消失得很快，准备好了吗？`, () => {
                startCoinGame(amt, true); // true = 困难模式 (金币乱飞)
            });
        }
    });
}


let cgTimer = null;
let cgInterval = null;

function startCoinGame(amount, isHard) {
    const view = document.getElementById('coin-game-view');
    view.classList.add('open');
    
    let time = 10.0;
    let score = 0;
    const target = isHard ? 20 : 10;
    
    document.getElementById('cg-target').innerText = `目标：在 10 秒内收集 ${target} 个金币`;
    const timeEl = document.getElementById('cg-countdown');
    timeEl.innerText = time.toFixed(1);
    timeEl.className = ''; // reset
    document.getElementById('cg-score').innerText = score;
    
    const playArea = document.getElementById('cg-play-area');
    playArea.innerHTML = '';
    
    // 生成频率与存活时间
    const spawnRate = isHard ? 350 : 600;
    const lifeTime = isHard ? 800 : 1200;
    
    cgInterval = setInterval(() => {
        spawnCoin(playArea, isHard, lifeTime, (x, y) => {
            score++;
            document.getElementById('cg-score').innerText = score;
            createFloatingScore(x, y, playArea);
        });
    }, spawnRate);
    
    cgTimer = setInterval(() => {
        time -= 0.1;
        timeEl.innerText = Math.max(0, time).toFixed(1);
        if(time <= 3.0) timeEl.classList.add('cg-time-warning');
        
        if(time <= 0) {
            endCoinGame(score, target, amount);
        }
    }, 100);
}

function spawnCoin(playArea, isHard, lifeTime, onCatch) {
    const coin = document.createElement('div');
    coin.className = 'gold-coin';
    coin.innerHTML = '¥';
    
    const maxX = playArea.clientWidth - 50;
    const maxY = playArea.clientHeight - 50;
    
    const limitX = maxX > 0 ? maxX : 250; 
    const limitY = maxY > 0 ? maxY : 400;

    coin.style.left = (Math.random() * limitX) + 'px';
    coin.style.top = (Math.random() * limitY) + 'px';
    
    if(isHard) {
        coin.style.transition = 'top 0.4s ease, left 0.4s ease, transform 0.2s';
        setTimeout(() => {
            if(coin.parentNode) {
                coin.style.left = (Math.random() * limitX) + 'px';
                coin.style.top = (Math.random() * limitY) + 'px';
            }
        }, lifeTime / 2);
    }
    
    coin.onpointerdown = (e) => {
        e.stopPropagation();
        onCatch(e.clientX, e.clientY);
        coin.remove();
    };
    
    playArea.appendChild(coin);
    
    setTimeout(() => {
        if(coin.parentNode) coin.remove();
    }, lifeTime);
}

function createFloatingScore(x, y, container) {
    const float = document.createElement('div');
    float.innerText = '+1';
    const rect = container.getBoundingClientRect();
    float.style.cssText = `
        position: absolute; left: ${x - rect.left}px; top: ${y - rect.top}px;
        color: #07c160; font-weight: 900; font-size: 24px;
        pointer-events: none; z-index: 100; text-shadow: 0 2px 4px rgba(255,255,255,0.8);
        animation: floatUpFade 0.8s ease forwards;
    `;
    container.appendChild(float);
    setTimeout(() => float.remove(), 800);
}

function endCoinGame(score, target, amount) {
    clearInterval(cgTimer);
    clearInterval(cgInterval);
    document.getElementById('cg-play-area').innerHTML = '';
    
    setTimeout(() => {
        document.getElementById('coin-game-view').classList.remove('open');
        if(score >= target) {
            payData.balance += amount;
            addTransaction('游戏挑战赢金', amount, 'income');
            savePayData();
            setTimeout(() => {
                showKAlert(`<b style="font-size:16px; color:#07c160;">挑战成功！(oﾟvﾟ)ノ</b><br><br>你不仅手速惊人，还抢到了 <b>${score}</b> 个金币！<br><br>【¥${amount.toFixed(2)}】 已存入你的钱包！`);
            }, 300);
        } else {
            setTimeout(() => {
                showKAlert(`<b style="font-size:16px; color:#ff4d4f;">挑战失败...(；′⌒\`)</b><br><br>只收集了 ${score} 个金币，距离目标 ${target} 个还差一点。<br>横财从指缝中溜走了~`);
            }, 300);
        }
    }, 100);
}

// ==========================================
// [接入新 UI] 3：充值、提现与余额宝
// ==========================================
window.payActionPrompt = function(action) {
    if(action === 'recharge') {
        showKPrompt("充值到零钱", `当前银行卡存款: ¥${payData.bankCard.toFixed(2)}`, "输入转入金额", (val) => {
            const amt = parseFloat(val);
            if(amt > 0 && amt <= payData.bankCard) {
                payData.bankCard -= amt;
                payData.balance += amt;
                addTransaction('从银行卡转入', amt, 'income');
                savePayData();
                showKAlert(`充值成功！`);
            } else {
                showKAlert("操作失败：金额无效或银行卡余额不足。");
            }
        });
    } else if(action === 'withdraw') {
        showKPrompt("提现到银行卡", `当前可提现零钱: ¥${payData.balance.toFixed(2)}`, "输入提现金额", (val) => {
            const amt = parseFloat(val);
            if(amt > 0 && amt <= payData.balance) {
                payData.balance -= amt;
                payData.bankCard += amt;
                addTransaction('提现至银行卡', amt, 'expense');
                savePayData();
                showKAlert(`提现成功！`);
            } else {
                showKAlert("操作失败：金额无效或零钱不足。");
            }
        });
    }
}



// 余额宝结算逻辑 (保持不变)
function checkYuebaoInterest() {
    if(payData.yuebao <= 0) return;
    const now = new Date();
    const lastDate = new Date(payData.lastInterestDate || 0);
    if(now.getDate() !== lastDate.getDate() || now.getMonth() !== lastDate.getMonth() || now.getFullYear() !== lastDate.getFullYear()) {
        const dailyRate = 0.00005; 
        let profit = payData.yuebao * dailyRate;
        if(profit < 0.01 && payData.yuebao > 0) profit = 0.01;
        payData.yuebao += profit;
        payData.totalProfit += profit;
        payData.lastInterestDate = now.getTime();
        addTransaction('余额宝收益', profit, 'income');
        savePayData();
    }
}
function renderYuebaoPage() {
    document.getElementById('yb-detail-balance').innerText = payData.yuebao.toFixed(2);
    document.getElementById('yb-total-profit').innerText = payData.totalProfit.toFixed(2);
    const list = document.getElementById('yb-profit-list');
    const profits = payData.transactions.filter(t => t.title === '余额宝收益');
    if(profits.length === 0) {
        list.innerHTML = '<div style="color:#999; font-size:12px;">暂无收益记录</div>';
    } else {
        list.innerHTML = profits.map(t => `
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding-bottom:10px;">
                <span style="font-size:12px;">${new Date(t.time).toLocaleDateString()}</span>
                <span style="color:#ff5000; font-weight:700;">+${t.amount.toFixed(2)}</span>
            </div>
        `).join('');
    }
}
window.handleYuebao = function(action) {
    if(action === 'in') {
        const val = prompt(`将零钱转入余额宝。\n当前零钱: ¥${payData.balance.toFixed(2)}\n输入转入金额：`);
        const amt = parseFloat(val);
        if(amt > 0 && amt <= payData.balance) {
            payData.balance -= amt;
            payData.yuebao += amt;
            addTransaction('转入余额宝', amt, 'expense'); 
            savePayData();
            renderYuebaoPage();
        }
    } else {
        const val = prompt(`从余额宝转出到零钱。\n可转出: ¥${payData.yuebao.toFixed(2)}\n输入转出金额：`);
        const amt = parseFloat(val);
        if(amt > 0 && amt <= payData.yuebao) {
            payData.yuebao -= amt;
            payData.balance += amt;
            addTransaction('余额宝转出', amt, 'income'); 
            savePayData();
            renderYuebaoPage();
        }
    }
}

// 薪水职业与亲密付逻辑 (保持不变，已兼容新的分离架构)
window.saveGlobalPersona = function() {
    const val = document.getElementById('my-global-persona').value;
    localStorage.setItem('myCoolPhone_globalPersona', val);
}
document.addEventListener('DOMContentLoaded', () => {
    const val = localStorage.getItem('myCoolPhone_globalPersona');
    if(val && document.getElementById('my-global-persona')) {
        document.getElementById('my-global-persona').value = val;
    }
});

// === 替换开始 ===
function renderCareerPage() {
    // 安全赋值，防止DOM还没加载
    const sourceInput = document.getElementById('career-source-input');
    if (sourceInput) sourceInput.value = payData.career.source || '';
    
    const dayInput = document.getElementById('career-day-input');
    if (dayInput) dayInput.value = payData.career.day || 15;
    
    const amountInput = document.getElementById('career-amount-input');
    if (amountInput) amountInput.value = payData.career.amount || 0;
}

window.saveCareerConfig = function() {
    payData.career.source = document.getElementById('career-source-input').value.trim() || '固定收入';
    payData.career.day = parseInt(document.getElementById('career-day-input').value) || 15;
    payData.career.amount = parseFloat(document.getElementById('career-amount-input').value) || 0;
    savePayData();
    showKAlert("每月收入设定已保存！到日子会自动打入银行卡。");
}

window.generateCareerAmountByAI = async function() {
    // 读取当前人设
    const p = personasMeta[currentPersonaId];
    const persona = p ? p.persona : "普通人";
    
    const btn = document.getElementById('btn-gen-salary');
    if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中';
    
    const prompt = `用户人设：“${persona}”。
    请根据此人设，推断TA每个月会有多少固定收入，以及这笔收入的合理名称来源（例如：生活费、家族企业分红、搬砖工资、项目尾款等）。
    请直接返回纯JSON格式：{"amount": 8500, "source": "搬砖工资"}。注意：只能返回纯JSON，不要输出任何文本或markdown！`;
    
    const result = await callAiForSpecialTask(prompt);
    
    if(btn) btn.innerHTML = 'AI测算';
    
    if(result) {
        try {
            const cleanStr = result.replace(/```json/g, '').replace(/```/g, '').trim();
            const data = JSON.parse(cleanStr);
            if(data.amount !== undefined && data.source) {
                document.getElementById('career-amount-input').value = data.amount;
                document.getElementById('career-source-input').value = data.source;
                showKAlert(`AI 测算完成：<br><br>每月收入：<b>¥${data.amount}</b><br>来源理由：<b>${data.source}</b>`);
            } else {
                throw new Error("格式不完整");
            }
        } catch(e) {
            showKAlert("AI 返回格式异常，请重试或手动输入。");
        }
    }
}

function checkCareerSalary() {
    const c = payData.career;
    if(c.amount <= 0) return;
    const now = new Date();
    // 检查是否到了发钱日，且本月还没发过
    if(now.getDate() >= c.day) {
        if(c.lastPayMonth !== now.getMonth()) {
            payData.bankCard += c.amount;
            const title = c.source || '每月固定收入';
            addTransaction(title, c.amount, 'income');
            c.lastPayMonth = now.getMonth();
            savePayData();
            setTimeout(() => showKAlert(`叮！你的当月【${title}】 ¥${c.amount} 已自动打入银行卡！`), 1000);
        }
    }
}
// === 替换结束 ===


function renderIntimatePage() {
    const list = document.getElementById('intimate-list-container');
    list.innerHTML = '';
    
    let html = '';
    
    // 1. 我给别人的
    const binds = Object.keys(payData.intimatePay || {});
    if(binds.length > 0) {
        html += `<div style="font-size:12px; color:#999; margin:10px 0 10px;">我为TA开通的亲密付</div>`;
        binds.forEach(id => {
            const info = payData.intimatePay[id];
            const f = friendsData[id] || { realName: id, avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}` };
            const nowMonth = new Date().getMonth();
            if(info.month !== nowMonth) { info.spent = 0; info.month = nowMonth; savePayData(); }
            const remain = info.limit === '无限' ? '无限' : (info.limit - info.spent).toFixed(2);
            html += `
                <div class="intimate-card" style="background:#fff; border-radius:16px; padding:15px; box-shadow:0 4px 15px rgba(0,0,0,0.02); border:1px solid #f0f0f0; margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <img src="${f.avatar}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;">
                            <div>
                                <div style="font-weight:700; font-size:14px; color:#333;">${f.remark || f.realName}</div>
                                <div style="font-size:10px; color:#999;">本月已花: ¥${info.spent.toFixed(2)}</div>
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:10px; color:#888;">剩余额度</div>
                            <div style="font-size:14px; font-weight:700; color:#2b2b2b;">${remain === '无限' ? '无限额度' : '¥' + remain}</div>
                        </div>
                    </div>
                    <div style="display:flex; gap:10px; border-top:1px solid #f0f0f0; padding-top:10px; margin-top:10px;">
                        <button class="btn-secondary" style="flex:1; height:30px; font-size:11px;" onclick="unbindIntimate('${id}')">解除绑定</button>
                    </div>
                </div>
            `;
        });
    }

    // 2. 别人给我的
    const bindsFrom = Object.keys(payData.intimatePayFrom || {});
    if(bindsFrom.length > 0) {
        html += `<div style="font-size:12px; color:#999; margin:20px 0 10px;">TA为我开通的亲密付</div>`;
        bindsFrom.forEach(id => {
            const info = payData.intimatePayFrom[id];
            const f = friendsData[id] || { realName: id, avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}` };
            const nowMonth = new Date().getMonth();
            if(info.month !== nowMonth) { info.spent = 0; info.month = nowMonth; savePayData(); }
            const remain = info.limit === '无限' ? '无限' : (info.limit - info.spent).toFixed(2);
html += `
    <div class="intimate-card" style="background:#fff; border-radius:16px; padding:15px; box-shadow:0 4px 15px rgba(0,0,0,0.02); border:1px solid #f0f0f0; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:10px;">
                <img src="${f.avatar}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;">
                <div>
                    <div style="font-weight:700; font-size:14px; color:#333;">${f.remark || f.realName}</div>
                    <div style="font-size:10px; color:#999;">我已消费: ¥${info.spent.toFixed(2)}</div>
                </div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:10px; color:#888;">可用额度</div>
                <div style="font-size:14px; font-weight:700; color:#07c160;">${remain === '无限' ? '无限额度' : '¥' + remain}</div>
            </div>
        </div>

        <div style="display:flex; gap:10px; border-top:1px solid #f0f0f0; padding-top:10px; margin-top:10px;">
            <button class="btn-secondary" style="flex:1; height:30px; font-size:11px;" onclick="unbindIntimateFrom('${id}')">解绑</button>
        </div>
    </div>
`;

        });
    }

    if(html === '') {
        html = '<div style="text-align:center; color:#999; font-size:12px; padding:40px 20px;">暂无亲密付记录</div>';
    }

    list.innerHTML = html;
}

window.openBindIntimateModal = function() {
    const select = document.getElementById('intimate-ai-select');
    select.innerHTML = '';
    Object.keys(friendsData).forEach(id => {
        if(!payData.intimatePay[id]) {
            const f = friendsData[id];
            select.innerHTML += `<option value="${id}">${f.remark || f.realName}</option>`;
        }
    });
    if(select.options.length === 0) { alert("没有可绑定的 AI"); return; }
    document.getElementById('intimate-limit-input').value = '';
    document.getElementById('modal-bind-intimate').classList.add('active');
}

window.unbindIntimate = function(id) {
    if(confirm("确定要解除对 TA 的亲密付吗？")) {
        delete payData.intimatePay[id];
        savePayData();
        renderIntimatePage();
    }
}
window.unbindIntimateFrom = function(id) {
    if (confirm("确定要解绑 TA 给你的亲密付吗？")) {
        if (!payData.intimatePayFrom) payData.intimatePayFrom = {};
        delete payData.intimatePayFrom[id];
        savePayData();
        renderIntimatePage();
    }
};

function simulateIntimatePayConsumption() {
    if(Math.random() > 0.3) return;
    const binds = Object.keys(payData.intimatePay);
    if(binds.length === 0) return;
    const id = binds[Math.floor(Math.random() * binds.length)];
    const info = payData.intimatePay[id];
    const remain = info.limit - info.spent;
    if(remain > 10 && payData.balance > 10) {
        let cost = Math.floor(Math.random() * 190) + 10;
        cost = Math.min(cost, remain, payData.balance);
        const f = friendsData[id];
        const name = f ? (f.remark || f.realName) : id;
        const items = ['买了杯奶茶', '点了一份外卖', '买了一束花', '充值了游戏', '买了张电影票'];
        const desc = items[Math.floor(Math.random() * items.length)];
        info.spent += cost;
        payData.balance -= cost;
        addTransaction(`亲密付: ${name} ${desc}`, cost, 'expense');
        savePayData();
        setTimeout(() => { 
            showToast(`<i class="fas fa-shopping-bag" style="color:#07c160;"></i> 你的宝贝 "${name}" 刚花掉 ¥${cost.toFixed(2)} (${desc})`); 
        }, 3000);
    }
}

let partTimeCooldown = false;
window.doPartTimeWork = function() {
    if(partTimeCooldown) return;
    partTimeCooldown = true;
    const earn = Math.floor(Math.random() * 26) + 5;
    payData.balance += earn;
    addTransaction('兼职打工收入', earn, 'income');
    savePayData();
    const fb = document.getElementById('work-feedback');
    fb.innerText = `+ ¥${earn.toFixed(2)}`;
    fb.style.opacity = '1';
    fb.style.transform = 'translateY(-10px)';
    setTimeout(() => {
        fb.style.opacity = '0';
        fb.style.transform = 'translateY(0)';
        partTimeCooldown = false;
    }, 1000);
}
/* =========================================
   [全新] 兼职中心游戏逻辑 (Pay Part-time)
   ========================================= */

let jobTimer = null;
let gameInterval = null;
let currentJobId = 0;
let jobScore = 0;
let jobTarget = 0; // 目标分数
let gameRunning = false;

// 启动工作入口
window.startJob = function(jobId) {
    currentJobId = jobId;

    payQueueUiWrite(() => {
        paySetSoftDisplay(document.getElementById('pt-job-board'), false);
        paySetSoftDisplay(document.getElementById('pt-game-stage'), true, 'flex');

        // 隐藏所有游戏视图
        document.querySelectorAll('.game-view-box').forEach(el => paySetSoftDisplay(el, false));
        paySetSoftDisplay(
            document.getElementById(`game-view-${jobId}`),
            true,
            jobId === 1 ? 'block' : 'flex'
        );
    });
    
    gameRunning = true;
    jobScore = 0;
    updateJobUI();

    if (jobId === 1) initGame1();
    else if (jobId === 2) initGame2();
    else if (jobId === 3) initGame3();
}

// 退出工作
window.quitJob = function() {
    gameRunning = false;
    clearInterval(jobTimer);
    clearInterval(gameInterval);
    
    if(g3AnimFrame) cancelAnimationFrame(g3AnimFrame);

    payQueueUiWrite(() => {
        paySetSoftDisplay(document.getElementById('pt-game-stage'), false);
        paySetSoftDisplay(document.getElementById('pt-job-board'), true, 'block');
    });
    
    // 清理残留
    document.getElementById('g1-belt').innerHTML = '';
}

function updateJobUI() {
    document.getElementById('game-score').innerText = `${jobScore}`;
}

// 通用倒计时
function startJobTimer(seconds, onFinish) {
    const el = document.getElementById('game-timer');
    let t = seconds;
    el.innerText = `00:${t < 10 ? '0'+t : t}`;
    
    jobTimer = setInterval(() => {
        t--;
        el.innerText = `00:${t < 10 ? '0'+t : t}`;
        if (t <= 0) {
            clearInterval(jobTimer);
            onFinish();
        }
    }, 1000);
}

// 结算
function finishJob(success, reward) {
    gameRunning = false;
    clearInterval(jobTimer);
    clearInterval(gameInterval);
    if(g3AnimFrame) cancelAnimationFrame(g3AnimFrame);

    if (success) {
        payData.balance += reward;
        addTransaction('兼职打工收入', reward, 'income');
        savePayData();
        showKAlert(`<b style="color:#111; font-size:16px;">辛苦啦，打工人！(๑•̀ㅂ•́)و✧</b><br><br>老板很满意你的表现，给你发了工资：<br><br><b style="font-size:24px; color:#111;">¥${reward}</b><br><br>去搓顿好的吧！`, quitJob);
    } else {
        showKAlert(`<b style="color:#ff4d4f; font-size:16px;">搞砸啦！(；′⌒\`)</b><br><br>老板看着一团糟的现场，把你扫地出门了。<br>白干啦，没钱拿~<br>下次再来吧！`, quitJob);
    }
}

// === 游戏 1: 收银员 (点击掉落物) ===
function initGame1() {
    jobTarget = 15; // 目标：扫描15个
    document.getElementById('game-score').innerText = `0 / ${jobTarget}`;
    
    startJobTimer(15, () => { // 15秒扫15个
        finishJob(jobScore >= jobTarget, 200);
    });

    const belt = document.getElementById('g1-belt');
    // 可爱商品
    const emojis = ['🍎','🍼','🍞','🍙','🍰','🍬','🍪','🥤'];
    
    gameInterval = setInterval(() => {
        if(!gameRunning) return;
        const item = document.createElement('div');
        item.className = 'g1-item';
        item.innerText = emojis[Math.floor(Math.random() * emojis.length)];
        
        // 随机在左右 10% - 80% 范围内掉落
        item.style.left = (Math.random() * 70 + 10) + '%';
        
        // 速度稍微随机一点
        const duration = Math.random() * 1 + 2; // 2s - 3s 下落
        item.style.animationDuration = duration + 's';
        
        // 绑定点击消除
        item.onpointerdown = (e) => {
            e.stopPropagation();
            item.remove();
            jobScore++;
            document.getElementById('game-score').innerText = `${jobScore} / ${jobTarget}`;
            // 手机振动
            if(navigator.vibrate) navigator.vibrate(15);
        };
        
        belt.appendChild(item);
        
        // 超出屏幕后自己删掉防卡顿
        setTimeout(() => { if(item.parentNode) item.remove(); }, duration * 1000 + 200);
        
    }, 500); // 0.5秒掉一个，有点小密集
}

// === 游戏 2: 咖啡师 (配方记忆) ===
let g2Recipe = [];
let g2CurrentMix = [];
let g2EmojiMix = [];
const g2RecipesDB = [
    { name: "冰美式", need: ['Ice', 'Water', 'Espresso'], emoji: '🧊+💧+☕️' },
    { name: "热拿铁", need: ['Espresso', 'Milk'], emoji: '☕️+🥛' },
    { name: "焦糖玛奇朵", need: ['Syrup', 'Milk', 'Espresso'], emoji: '🍯+🥛+☕️' },
    { name: "冰水", need: ['Ice', 'Water'], emoji: '🧊+💧' },
    { name: "特调甜咖", need: ['Syrup', 'Espresso', 'Milk', 'Ice'], emoji: '🍯+☕️+🥛+🧊' }
];

function initGame2() {
    jobScore = 0; // 完成单数
    jobTarget = 4; // 目标：做对4杯
    document.getElementById('game-score').innerText = `完成: 0 / ${jobTarget}`;
    g2NextOrder();
    
    startJobTimer(30, () => { // 30秒内做4杯
        finishJob(jobScore >= jobTarget, 2000);
    });
}

function g2NextOrder() {
    g2CurrentMix = [];
    g2EmojiMix = [];
    updateCupVisual();
    
    const r = g2RecipesDB[Math.floor(Math.random() * g2RecipesDB.length)];
    g2Recipe = r.need;
    // 提示语变可爱
    const greetings = ["你好！我要一杯", "来一杯", "快给我做杯", "麻烦来个"];
    const g = greetings[Math.floor(Math.random() * greetings.length)];
    
    document.getElementById('g2-order-text').innerHTML = `💬 ${g}<b>${r.name}</b>！<br><span style="font-size:11px; color:#888;">配方：${r.emoji}</span>`;
}

// 添加材料
window.g2Add = function(ing, emojiStr) {
    if(g2CurrentMix.length >= 6) return; // 最多加6次
    g2CurrentMix.push(ing);
    g2EmojiMix.push(emojiStr);
    updateCupVisual();
}

function updateCupVisual() {
    const liquid = document.getElementById('g2-liquid');
    
    // 杯子里不只显示颜色，把emoji叠加上去
    // 先检查有没有存放emoji的div，没有就建一个
    let container = document.getElementById('g2-ingredients-display');
    if(!container) {
        container = document.createElement('div');
        container.id = 'g2-ingredients-display';
        document.getElementById('g2-cup').appendChild(container);
    }
    
    // 更新液面高度
    const height = Math.min(100, g2CurrentMix.length * 20);
    liquid.style.height = height + '%';
    
    // 渲染杯里的emoji
    container.innerHTML = g2EmojiMix.join('<br>');

    // 颜色混合
    if(g2CurrentMix.includes('Espresso') && g2CurrentMix.includes('Milk')) {
        liquid.style.background = '#c8a382'; // 拿铁色
    } else if(g2CurrentMix.includes('Milk')) {
        liquid.style.background = '#f1f2f6'; 
    } else if(g2CurrentMix.includes('Espresso')) {
        liquid.style.background = '#4a3320'; 
    } else if(g2CurrentMix.includes('Water')) {
        liquid.style.background = '#dff9fb'; 
    } else {
        liquid.style.background = 'transparent';
    }
}

// 提交订单
window.g2Serve = function() {
    if (g2CurrentMix.length === 0) {
        showToast("杯子是空的呀喂！");
        return;
    }
    
    // 判断对错（这里严格要求顺序一致）
    const isCorrect = JSON.stringify(g2CurrentMix) === JSON.stringify(g2Recipe);
    
    if(isCorrect) {
        jobScore++;
        document.getElementById('game-score').innerText = `完成: ${jobScore} / ${jobTarget}`;
        showToast("✅ 完美！客人很开心~");
        if(jobScore >= jobTarget) {
            finishJob(true, 2000);
        } else {
            g2NextOrder();
        }
    } else {
        showToast("❌ 做错了！客人骂骂咧咧，赶紧重做！");
        g2CurrentMix = [];
        g2EmojiMix = [];
        updateCupVisual();
    }
}

// === 游戏 3: 黑客 (信号校准) ===
let g3CursorPos = 0;
let g3Direction = 1; // 1 or -1
let g3Speed = 2; // 初始速度
let g3Level = 1;
let g3TargetWidth = 40;
let g3AnimFrame = null;
const G3_CONTAINER_WIDTH = 276; // 280减去边框

function initGame3() {
    g3Level = 1;
    g3Speed = 3; 
    g3TargetWidth = 50; 
    document.getElementById('game-score').innerText = `进度: 0/3`;
    startG3Level();
    document.getElementById('game-timer').innerText = "LIVE"; 
}

function startG3Level() {
    document.getElementById('g3-level').innerText = `层级 ${g3Level}/3`;
    document.getElementById('g3-msg').innerText = "等待指令...";
    document.getElementById('g3-msg').style.color = "#888";
    
    // 随机目标位置，注意不要出界
    const targetEl = document.getElementById('g3-target');
    targetEl.style.width = g3TargetWidth + 'px';
    
    const maxLeft = G3_CONTAINER_WIDTH - g3TargetWidth;
    const randomLeft = Math.random() * maxLeft;
    targetEl.style.left = randomLeft + 'px'; 
    
    // 重置光标
    g3CursorPos = 0;
    
    // 启动动画
    g3Loop();
}

function g3Loop() {
    const cursor = document.getElementById('g3-cursor');
    g3CursorPos += g3Speed * g3Direction;
    
    // 碰壁反弹，留点余量防溢出
    if (g3CursorPos >= G3_CONTAINER_WIDTH - 4) {
        g3CursorPos = G3_CONTAINER_WIDTH - 4;
        g3Direction = -1;
    } else if (g3CursorPos <= 0) {
        g3CursorPos = 0;
        g3Direction = 1;
    }
    
    cursor.style.left = g3CursorPos + 'px';
    
    if(gameRunning) {
        g3AnimFrame = requestAnimationFrame(g3Loop);
    }
}

window.g3Lock = function() {
    cancelAnimationFrame(g3AnimFrame);
    
    const targetEl = document.getElementById('g3-target');
    const targetLeft = parseFloat(targetEl.style.left);
    const targetRight = targetLeft + g3TargetWidth;
    
    // 判断光标是否在白框内部
    // 光标宽度是4，只要它的中心在范围内就算过
    const cursorCenter = g3CursorPos + 2; 

    if (cursorCenter >= targetLeft && cursorCenter <= targetRight) {
        // 成功
        document.getElementById('g3-msg').innerText = "[ 破解成功，权限提升 ]";
        document.getElementById('g3-msg').style.color = "#fff";
        document.getElementById('game-score').innerText = `进度: ${g3Level}/3`;
        
        setTimeout(() => {
            if (g3Level >= 3) {
                finishJob(true, 8000);
            } else {
                g3Level++;
                g3Speed += 1.5; // 加速
                g3TargetWidth -= 10; // 变窄
                startG3Level();
            }
        }, 800);
    } else {
        // 失败
        document.getElementById('g3-msg').innerText = "[ 警告：行踪暴露！断开连接 ]";
        document.getElementById('g3-msg').style.color = "#ff4d4f";
        setTimeout(() => {
            finishJob(false, 0); 
        }, 800);
    }
}
/* =========================================
   [新增] 模拟股市 (Stock Market) 幽默引擎
   ========================================= */
const STOCK_MARKET_KEY = 'myCoolPhone_stockMarket';

// 预设的恶搞股票列表
const stockCompanies = [
    { id: 's1', name: '摸鱼科技', code: 'MOYU.00', basePrice: 50, volatility: 0.15 },
    { id: 's2', name: '熬夜防脱发集团', code: 'HAIR.99', basePrice: 120, volatility: 0.2 },
    { id: 's3', name: '西红柿南瓜农业', code: 'CYB.01', basePrice: 15, volatility: 0.3 },
    { id: 's4', name: '狗粮猫粮无限公司', code: 'CAT.404', basePrice: 88, volatility: 0.1 },
    { id: 's5', name: '宇宙和平开发局', code: 'PEAC.00', basePrice: 300, volatility: 0.05 }
];

// 有趣的上涨/下跌理由
const stockNews = {
    up: [
        "老板今天没来，全员开心，效率奇迹般提升 200%",
        "外星人宣布对该公司进行战略投资，资金到位",
        "研发出了能在梦里打工的机器，产能原地爆炸",
        "董事长被拍到在街头吃煎饼果子，十分接地气，股票大涨",
        "保洁阿姨不小心碰到了服务器，居然修复了十年的祖传 Bug",
        "宣布进军『量子养生』领域，受到不明真相的资本疯狂追捧",
        "规定员工每天必须带猫上班，公司氛围极佳，效率暴增"
    ],
    down: [
        "核心程序员由于迟迟找不到对象，心态崩溃删库跑路了",
        "被媒体曝光主营业务其实是在天桥底下卖烤地瓜",
        "公司空调坏了，全员流汗罢工抗议",
        "董事长在发布会上把 PPT 念反了，惨遭 B 站做成鬼畜视频",
        "新产品一上线就引发了半人马座星人的严重抗议",
        "由于老板频繁画大饼，导致公司食堂面粉严重短缺",
        "财务总监买彩票输光了公司团建的经费"
    ],
    flat: [
        "今天无事发生，大家都在工位上安静地摸鱼",
        "股市休眠中，因为交易员都集体去睡午觉了",
        "一切平稳，连只苍蝇都没飞过"
    ]
};

let currentMarket = {}; 

function initStockMarket() {
    if (!payData.stocks) payData.stocks = {}; 
    const savedMarket = localStorage.getItem(STOCK_MARKET_KEY);
    if (savedMarket) currentMarket = JSON.parse(savedMarket);
    else generateNewMarket();
}

// 手动刷新行情
window.refreshStockMarket = function() {
    generateNewMarket();
    renderStockPage();
    showToast("市场行情已刷新！");
}

function generateNewMarket() {
    stockCompanies.forEach(company => {
        const oldPrice = currentMarket[company.id] ? currentMarket[company.id].price : company.basePrice;
        
        // 随机涨跌幅 (-volatility 到 +volatility)
        const changeRate = (Math.random() * 2 - 1) * company.volatility;
        let newPrice = oldPrice * (1 + changeRate);
        if (newPrice < 1) newPrice = 1; // 跌到底限价
        
        let trend = 'flat';
        let news = stockNews.flat[Math.floor(Math.random() * stockNews.flat.length)];
        
        if (changeRate > 0.02) {
            trend = 'up';
            news = stockNews.up[Math.floor(Math.random() * stockNews.up.length)];
        } else if (changeRate < -0.02) {
            trend = 'down';
            news = stockNews.down[Math.floor(Math.random() * stockNews.down.length)];
        }
        
        currentMarket[company.id] = {
            price: parseFloat(newPrice.toFixed(2)),
            changeRate: changeRate,
            trend: trend,
            news: news
        };
    });
    localStorage.setItem(STOCK_MARKET_KEY, JSON.stringify(currentMarket));
}

// 渲染股市页面
window.renderStockPage = function() {
    initStockMarket();
    document.getElementById('stock-available-balance').innerText = payData.balance.toFixed(2);
    
    let totalValue = 0;
    let totalCost = 0;
    
    const list = document.getElementById('stock-market-list');
    list.innerHTML = '';
    
    stockCompanies.forEach(company => {
        const marketData = currentMarket[company.id];
        const holdings = payData.stocks[company.id] || { shares: 0, cost: 0 };
        
        totalValue += holdings.shares * marketData.price;
        totalCost += holdings.cost;
        
        const percentStr = (marketData.changeRate > 0 ? '+' : '') + (marketData.changeRate * 100).toFixed(2) + '%';
        
        let tagClass = 'stock-flat';
        let priceClass = '';
        if (marketData.trend === 'up') { tagClass = 'stock-up'; priceClass = 'stock-color-up'; }
        else if (marketData.trend === 'down') { tagClass = 'stock-down'; priceClass = 'stock-color-down'; }
        
        const item = document.createElement('div');
        item.className = 'stock-card';
        item.onclick = () => openStockDetail(company.id);
        item.innerHTML = `
            <div class="stock-info-left">
                <span class="stock-name">${company.name}</span>
                <span class="stock-code">${company.code} ${holdings.shares > 0 ? `<span style="color:#111; font-weight:700;">(持 ${holdings.shares} 股)</span>` : ''}</span>
            </div>
            <div class="stock-info-right">
                <span class="stock-price ${priceClass}">${marketData.price.toFixed(2)}</span>
                <span class="stock-tag ${tagClass}">${percentStr}</span>
            </div>
        `;
        list.appendChild(item);
    });
    
    document.getElementById('stock-total-value').innerText = totalValue.toFixed(2);
    const profit = totalValue - totalCost;
    const profitEl = document.getElementById('stock-total-profit');
    profitEl.innerText = `浮动盈亏: ${profit >= 0 ? '+' : ''}${profit.toFixed(2)}`;
    profitEl.style.color = profit >= 0 ? '#fff' : '#999';
}

// 巧妙拦截原来的路由函数，当点进 stock 时自动渲染
const originalOpenPaySubPage = window.openPaySubPage;
window.openPaySubPage = function(pageId) {
    originalOpenPaySubPage(pageId);
    if (pageId === 'stock') {
        renderStockPage();
    }
}

let currentTradeStockId = null;

// 打开交易面板
window.openStockDetail = function(stockId) {
    currentTradeStockId = stockId;
    const company = stockCompanies.find(c => c.id === stockId);
    const marketData = currentMarket[stockId];
    const holdings = payData.stocks[stockId] || { shares: 0, cost: 0 };
    
    document.getElementById('stm-name').innerText = company.name;
    document.getElementById('stm-code').innerText = company.code;
    document.getElementById('stm-price').innerText = marketData.price.toFixed(2);
    
    const percentStr = (marketData.changeRate > 0 ? '+' : '') + (marketData.changeRate * 100).toFixed(2) + '%';
    const pctEl = document.getElementById('stm-percent');
    pctEl.innerText = percentStr;
    
    if (marketData.trend === 'up') { pctEl.style.color = '#111'; }
    else if (marketData.trend === 'down') { pctEl.style.color = '#888'; }
    else { pctEl.style.color = '#666'; }
    
    document.getElementById('stm-news').innerText = marketData.news;
    document.getElementById('stm-holdings').innerText = holdings.shares;
    document.getElementById('stm-cost').innerText = holdings.shares > 0 ? (holdings.cost / holdings.shares).toFixed(2) : '0.00';
    document.getElementById('stm-amount-input').value = '';
    document.getElementById('stock-trade-modal').classList.add('active');
}

// 执行买卖
window.executeStockTrade = function(action) {
    if (!currentTradeStockId) return;
    const amount = parseInt(document.getElementById('stm-amount-input').value);
    
    if (isNaN(amount) || amount <= 0) { showToast("请输入有效的股数"); return; }
    
    const company = stockCompanies.find(c => c.id === currentTradeStockId);
    const price = currentMarket[currentTradeStockId].price;
    const totalMoney = price * amount;
    
    if (!payData.stocks[currentTradeStockId]) payData.stocks[currentTradeStockId] = { shares: 0, cost: 0 };
    const holdings = payData.stocks[currentTradeStockId];
    
    if (action === 'buy') {
        if (payData.balance < totalMoney) { showKAlert("零钱余额不足，快去兼职打工吧！"); return; }
        payData.balance -= totalMoney;
        holdings.shares += amount;
        holdings.cost += totalMoney;
        addTransaction(`买入 [${company.name}]`, totalMoney, 'expense');
        showToast(`成功买入 ${amount} 股`);
    } else if (action === 'sell') {
        if (holdings.shares < amount) { showKAlert("持仓股数不足！没法做空啊！"); return; }
        
        const costRatio = amount / holdings.shares;
        const costToDeduct = holdings.cost * costRatio;
        
        holdings.shares -= amount;
        holdings.cost -= costToDeduct;
        payData.balance += totalMoney;
        addTransaction(`卖出 [${company.name}]`, totalMoney, 'income');
        
        const profitStr = (totalMoney - costToDeduct).toFixed(2);
        if (totalMoney >= costToDeduct) showToast(`成功卖出，怒赚 ¥${profitStr}！`);
        else showToast(`成功卖出，含泪血亏 ¥${Math.abs(profitStr)}...`);
    }
    
    savePayData();
    document.getElementById('stock-trade-modal').classList.remove('active');
    renderStockPage();
}
/* =========================================
   [补丁] 股市自动跳动逻辑 (每5秒变一次)
   ========================================= */

let stockAutoTimer = null;

// 自动跳动函数 (静默刷新，不弹窗提示)
function autoTickStock() {
    // 只有当股市页面显示时才运行
    const stockPage = document.getElementById('pay-page-stock');
    if (stockPage && stockPage.classList.contains('show')) {
        generateNewMarket(); // 生成新价格和新新闻
        renderStockPage();   // 刷新界面
        console.log("股市已自动刷新 - " + new Date().toLocaleTimeString());
    } else {
        // 如果页面没显示，关掉定时器省资源
        clearInterval(stockAutoTimer);
    }
}

// 拦截打开页面函数：打开股市时 -> 启动定时器
const _rawOpenPaySubPage = window.openPaySubPage;
window.openPaySubPage = function(pageId) {
    _rawOpenPaySubPage(pageId); // 执行原逻辑
    
    if (pageId === 'stock') {
        // 先清除旧的，防止重复
        if (stockAutoTimer) clearInterval(stockAutoTimer);
        // 启动！每 5000 毫秒 (5秒) 变动一次
        stockAutoTimer = setInterval(autoTickStock, 5000);
    }
}

// 拦截关闭页面函数：关闭股市时 -> 停止定时器
// 先确保基础的关闭函数存在
if (!window.closePaySubPage) {
    window.closePaySubPage = function(pageId) {
        const page = document.getElementById('pay-page-' + pageId);
        if(page) page.classList.remove('show');
    };
}

const _rawClosePaySubPage = window.closePaySubPage;
window.closePaySubPage = function(pageId) {
    if (_rawClosePaySubPage) _rawClosePaySubPage(pageId); // 执行原逻辑
    
    if (pageId === 'stock') {
        if (stockAutoTimer) clearInterval(stockAutoTimer);
        console.log("股市已休市 (停止刷新)");
    }
}


// 拦截关闭整个钱包APP：也停止定时器
const _rawClosePayApp = window.closePayApp;
window.closePayApp = function() {
    _rawClosePayApp();
    if (stockAutoTimer) clearInterval(stockAutoTimer);
}
/* =========================================
   [新增] 钱包子程序：PROJECT IDOL (高风险风投)
   ========================================= */

let currentIdolInvestment = 0; // 记录当前暂存的资金

// 1. 输入金额并开启档案袋
window.prepareIdolProject = function() {
    const input = document.getElementById('idol-amount-input');
    const amount = parseFloat(input.value);

    if (isNaN(amount) || amount <= 0) {
        showToast("醒醒，哪怕选地下偶像也是要花钱的。");
        return;
    }

    if (amount > payData.balance) {
        showKAlert("公司账上没这么多流动资金！<br>先去打打工凑点经费吧！");
        return;
    }

    // 扣除金额，暂存到奖池
    payData.balance -= amount;
    currentIdolInvestment = amount;
    savePayData();
    document.getElementById('idol-available-balance').innerText = payData.balance.toFixed(2);

    // 界面变化：隐藏按钮，显示三个档案袋
    payQueueUiWrite(() => {
        paySetSoftDisplay(document.getElementById('idol-start-btn'), false);
        paySetSoftDisplay(input, false);
    });
    
    // 每次打开重置档案袋样式
    const files = document.querySelectorAll('.idol-file');
    files.forEach(f => {
        f.style.background = '#f9f9f9';
        f.style.color = '#333';
        f.style.borderColor = '#ddd';
        f.style.pointerEvents = 'auto'; // 允许点击
    });
    
    payQueueUiWrite(() => {
        paySetSoftDisplay(document.getElementById('idol-files-area'), true, 'block');
    });
}

// 2. 点击档案袋，揭晓命运
window.openIdolFile = function(clickedElement) {
    // 锁定所有档案袋防止连点
    const files = document.querySelectorAll('.idol-file');
    files.forEach(f => f.style.pointerEvents = 'none');

    // 选中的变黑
    clickedElement.style.background = '#111';
    clickedElement.style.color = '#fff';
    clickedElement.style.borderColor = '#111';
    
    showToast("正在翻阅加密档案...");

    // 延迟 1.5 秒出结果
    setTimeout(() => {
        const rand = Math.random();
        let isWin = false;
        let multiplier = 0;

        if (rand < 0.02) {
            isWin = true;
            multiplier = 50; // 50倍紫微星
        } else if (rand < 0.10) {
            isWin = true;
            multiplier = 10; // 10倍大红
        }

        const list = document.getElementById('idol-history-list');
        if(list.innerHTML.includes('尚无造星记录')) list.innerHTML = '';

        if (isWin) {
            const winAmount = currentIdolInvestment * multiplier;
            payData.balance += winAmount; // 发奖金
            addTransaction(`企划成功 (${multiplier}x)`, winAmount - currentIdolInvestment, 'income');
            
            const successMsgs = multiplier === 50 
                ? "【天降紫微星！】这孩子绝美直拍一夜出圈，各大高奢品牌排队送代言。你名下的娱乐帝国正式起飞，你成了名副其实的福布斯榜首富婆！"
                : "【一炮而红！】主打歌音源空降榜首，被各大美妆品牌疯抢。这波投资血赚！";
            
            showKAlert(`<b style="color:#111; font-size:18px;">恭喜制作人！👑</b><br><br>${successMsgs}<br><br>狂赚 <b style="color:#111; font-size:24px;">¥${winAmount.toFixed(2)}</b>`);
            
            list.insertAdjacentHTML('afterbegin', `
                <div style="background:#fff; border-radius:12px; padding:12px 15px; display:flex; justify-content:space-between; border:1px solid #111; box-shadow:4px 4px 0 rgba(0,0,0,1);">
                    <div>
                        <div style="font-size:13px; font-weight:800; color:#111;">爆红出道 (${multiplier}x)</div>
                        <div style="font-size:10px; color:#888; margin-top:4px;">投资: ¥${currentIdolInvestment.toFixed(2)}</div>
                    </div>
                    <div style="color:#111; font-weight:800; font-size:16px;">+${(winAmount - currentIdolInvestment).toFixed(2)}</div>
                </div>
            `);
        } else {
            addTransaction(`企划失败 (练习生作妖)`, currentIdolInvestment, 'expense');

            // 女生视角的幽默塌房文案（不擦边不辱女，只有对娱乐圈的搞笑解构）
            const failMsgs = [
                "半夜被星探抓到连吃三盆变态辣火锅，因为放弃身材管理被开除...",
                "嫌每天练舞太累了，连夜买火车站票回老家考事业编去了。",
                "被曝出以前在村口和村霸的鹅打架，引发形象危机，出道计划流产。",
                "主打歌快录完了，结果制作人发现她五音不全只会喊麦，当场解约。",
                "嫌弃公司发的制服不好看，提桶跑路去了对面公司当前台。",
                "练习室太卡，由于受不了没有WIFI的环境，她决定退圈去网吧打游戏。"
            ];
            const failMsg = failMsgs[Math.floor(Math.random() * failMsgs.length)];

            showKAlert(`<b style="color:#555; font-size:18px;">投资血本无归 💔</b><br><br><span style="font-size:13px; color:#444; line-height:1.6;">${failMsg}</span><br><br><span style="color:#aaa; font-size:11px;">你投入的 ¥${currentIdolInvestment.toFixed(2)} 打水漂了，下次擦亮眼睛吧。</span>`);

            list.insertAdjacentHTML('afterbegin', `
                <div style="background:#f9f9f9; border-radius:12px; padding:12px 15px; display:flex; justify-content:space-between; border:1px solid #eee;">
                    <div>
                        <div style="font-size:13px; font-weight:700; color:#666;">素人跑路</div>
                        <div style="font-size:10px; color:#999; margin-top:4px;">颗粒无收</div>
                    </div>
                    <div style="color:#aaa; font-weight:700; font-size:16px;">-${currentIdolInvestment.toFixed(2)}</div>
                </div>
            `);
        }

        // 恢复 UI 状态，准备下一次投资
        savePayData();
        document.getElementById('idol-available-balance').innerText = payData.balance.toFixed(2);
        
        payQueueUiWrite(() => {
            paySetSoftDisplay(document.getElementById('idol-files-area'), false);
            paySetSoftDisplay(document.getElementById('idol-start-btn'), true, 'block');
            paySetSoftDisplay(document.getElementById('idol-amount-input'), true, 'block');
            document.getElementById('idol-amount-input').value = '';
        });
        currentIdolInvestment = 0;

    }, 1500); 
}

// 3. 巧妙拦截路由：当你点开“造星企划”时，实时同步上方显示的可用余额
const _idolOpenPaySubPage = window.openPaySubPage;
window.openPaySubPage = function(pageId) {
    if (_idolOpenPaySubPage) _idolOpenPaySubPage(pageId);
    if (pageId === 'idol_invest') {
        const el = document.getElementById('idol-available-balance');
        if(el) el.innerText = payData.balance.toFixed(2);
    }
}
