
/* =========================================
   [ARCADE] 游戏大厅与全局控制 (微调版)
   ========================================= */
let gameAiId = null; 

window.openGameApp = function() {
    const app = document.getElementById('gameApp');
    if(!app) return;
    app.classList.add('open');
    
    const select = document.getElementById('gc-ai-selector');
    select.innerHTML = '';
    const ids = Object.keys(friendsData);
    if(ids.length === 0) {
        select.innerHTML = '<option value="">无好友</option>';
        alert("请先去微信添加一个 AI 好友！");
        return;
    }
    
    ids.forEach(id => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.text = friendsData[id].remark || friendsData[id].realName;
        if(id === currentChatId) opt.selected = true; 
        select.appendChild(opt);
    });
    
    gameAiId = select.value;
    backToGameLobby();
}

window.closeGameApp = function() {
    document.getElementById('gameApp').classList.remove('open');
}

window.switchGamePartner = function() {
    gameAiId = document.getElementById('gc-ai-selector').value;
    backToGameLobby();
}

window.openSubGame = function(gameId) {
    if(!gameAiId) return alert("请先选择对手！");
    document.querySelectorAll('.gc-view').forEach(el => el.classList.remove('active'));
    document.getElementById(`gc-view-${gameId}`).classList.add('active');
        // === 新增：为对战类游戏填充双方头像 ===
    if(gameId === 'truth' || gameId === 'emoji') {
        const ai = friendsData[gameAiId];
        const me = personasMeta[currentPersonaId] || {};
        const avaMe = me.avatar || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200';
        const avaAi = ai.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${ai.realName}`;
        
        if(gameId === 'truth') {
            document.getElementById('g1-me-avatar').src = avaMe;
            document.getElementById('g1-ai-avatar').src = avaAi;
            document.getElementById('g1-ai-name').innerText = ai.remark || ai.realName;
        }
        if(gameId === 'emoji') {
            document.getElementById('g2-me-avatar').src = avaMe;
            document.getElementById('g2-ai-avatar').src = avaAi;
            document.getElementById('g2-ai-name').innerText = ai.remark || ai.realName;
        }
    }

    // 隐藏全局的大厅头部和玩伴选择区
    const header = document.querySelector('#gameApp .gc-header');
    const selector = document.querySelector('#gameApp .gc-player-select');
    if (header) header.style.display = 'none';
    if (selector) selector.style.display = 'none';
    
    // 初始化复位
    if(gameId === 'truth') g1_reset();
    if(gameId === 'emoji') g2_reset();
    if(gameId === 'suitcase') g3_reset();
    if(gameId === 'roulette') g4_reset();
    if(gameId === 'turf') g5_reset();
    
    // 新增游戏复位
    if(gameId === 'dice') g6_reset();
    if(gameId === 'claw') g7_reset();
    if(gameId === 'chess') g8_reset();
    if(gameId === 'cards') g9_reset();
    if(gameId === 'memory') g10_reset();
    if(gameId === 'jump') g11_reset();
}


window.backToGameLobby = function() {
    document.querySelectorAll('.gc-view').forEach(el => el.classList.remove('active'));
    document.getElementById('gc-view-lobby').classList.add('active');
    
    // 回到大厅时恢复显示头部和选择区
    const header = document.querySelector('#gameApp .gc-header');
    const selector = document.querySelector('#gameApp .gc-player-select');
    if (header) header.style.display = 'flex';
    if (selector) selector.style.display = 'flex';
}



/* =========================================
   [GAME 1] 午夜真心话 (双回合版)
   ========================================= */
let g1_truthData = null;

function g1_reset() {
    document.getElementById('g1-round-tag').innerText = "Round 1: TA 的秘密";
    document.getElementById('g1-r1-area').style.display = 'block';
    document.getElementById('g1-r2-area').style.display = 'none';
    
    document.getElementById('g1-cards-area').style.display = 'none';
    document.getElementById('g1-r1-result').style.display = 'none';
    document.getElementById('g1-start-btn').style.display = 'block';
    document.getElementById('g1-start-btn').innerText = "让 TA 出题";
    
    document.getElementById('g1-r2-result').style.display = 'none';
    document.getElementById('g1-my-q0').value = '';
    document.getElementById('g1-my-q1').value = '';
    document.getElementById('g1-my-q2').value = '';
}

window.g1_generate = async function() {
    const ai = friendsData[gameAiId];
    const btn = document.getElementById('g1-start-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 构思小秘密中...';
    btn.disabled = true;

    const prompt = `
    [System Command: Two Truths and a Lie]
    You are ${ai.realName}. Persona: ${ai.persona}
    Task: Write 3 short statements about your little secrets, embarrassing moments, or romantic preferences.
    - 2 must be TRUE (consistent with your persona).
    - 1 must be a FAKE LIE (plausible but false).
    - Tone: Teasing, cute, or slightly arrogant. Language: Chinese.
    - Output strictly in JSON format. "lieIndex" is 0, 1, or 2.
    {"statements": ["fact 1", "fact 2", "fact 3"], "lieIndex": 1, "taunt": "猜错要受惩罚哦~"}
    `;

    const res = await callAiForSpecialTask(prompt);
    btn.innerHTML = "让 TA 出题";
    btn.disabled = false;

    if(!res) return;
    try {
        const jsonStr = res.replace(/```json/gi,'').replace(/```/g,'').trim();
        g1_truthData = JSON.parse(jsonStr);
        
        btn.style.display = 'none';
        
        const area = document.getElementById('g1-cards-area');
        area.innerHTML = `<div style="font-size:13px; font-weight:700; text-align:center; color:#ff7e67;">"${g1_truthData.taunt}"</div>`;
        
        g1_truthData.statements.forEach((stmt, idx) => {
            area.innerHTML += `<div class="g1-card" onclick="g1_guess(${idx}, this)">${stmt}</div>`;
        });
        area.style.display = 'flex';

    } catch(e) { showToast("AI 害羞了，请重试。"); }
}

window.g1_guess = function(idx, cardEl) {
    const cards = document.querySelectorAll('.g1-card');
    cards.forEach(c => c.style.pointerEvents = 'none');
    cardEl.classList.add('selected');

    const resultBox = document.getElementById('g1-r1-result');
    resultBox.style.display = 'block';

    if (idx === g1_truthData.lieIndex) {
        resultBox.innerHTML = `<span style="color:#07c160; font-size:16px; font-weight:bold;">🎉 猜对啦！</span><br><br>看来你很了解 TA 嘛！确实那句是骗人的。`;
    } else {
        resultBox.innerHTML = `<span style="color:#ff4d4f; font-size:16px; font-weight:bold;">💔 猜错咯！</span><br><br>你居然信了？真正的谎言其实是第 ${g1_truthData.lieIndex + 1} 句。`;
    }
    // 进入下一回合的按钮
    resultBox.innerHTML += `<br><br><button class="gc-btn-secondary" style="border-color:#111; color:#111;" onclick="g1_startRound2()">轮到我出题 <i class="fas fa-arrow-right"></i></button>`;
}

window.g1_startRound2 = function() {
    document.getElementById('g1-round-tag').innerText = "Round 2: 我的秘密";
    document.getElementById('g1-r1-area').style.display = 'none';
    document.getElementById('g1-r2-area').style.display = 'block';
}

window.g1_submitMyTurn = async function() {
    const q0 = document.getElementById('g1-my-q0').value.trim();
    const q1 = document.getElementById('g1-my-q1').value.trim();
    const q2 = document.getElementById('g1-my-q2').value.trim();
    
    const lieRadio = document.querySelector('input[name="g1_my_lie"]:checked');
    const lieIdx = lieRadio ? parseInt(lieRadio.value) : -1;
    
    if(!q0 || !q1 || !q2) { showToast("请填满 3 句话哦！"); return; }
    
    const btn = document.getElementById('g1-submit-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> TA 正在认真分析你...';
    btn.disabled = true;

    const ai = friendsData[gameAiId];
    const prompt = `
    [System Command: Two Truths and a Lie - AI Guessing]
    You are ${ai.realName}. User provided 3 statements about themselves:
    1. ${q0}
    2. ${q1}
    3. ${q2}
    One of them is a lie. Make a guess which one it is (0, 1, or 2). Explain your reasoning playfully or affectionately based on your persona.
    Return JSON ONLY: {"guessIndex": 0, "reason": "Your cute/funny reasoning"}
    `;

    const res = await callAiForSpecialTask(prompt);
    btn.style.display = 'none';

    try {
        const jsonStr = res.replace(/```json/gi,'').replace(/```/g,'').trim();
        const data = JSON.parse(jsonStr);
        const resultBox = document.getElementById('g1-r2-result');
        resultBox.style.display = 'block';
        
        const aiGuess = data.guessIndex;
        if(aiGuess === lieIdx) {
            resultBox.innerHTML = `<b style="color:#07c160; font-size:16px;">🔍 糟糕，TA 居然识破了你！</b><br><br>${ai.realName}: "${data.reason}"<br><br><span style="color:#999; font-size:11px;">(TA 正确指出了第 ${aiGuess+1} 句是假的)</span>`;
        } else {
            resultBox.innerHTML = `<b style="color:#ff4d4f; font-size:16px;">🤡 哈哈，成功骗过 TA！</b><br><br>${ai.realName}: "${data.reason}"<br><br><span style="color:#999; font-size:11px;">(TA 选择了第 ${aiGuess+1} 句，但其实第 ${lieIdx+1} 句才是谎言)</span>`;
        }
        resultBox.innerHTML += `<br><br><button class="gc-btn-secondary" onclick="g1_reset()">再来一局</button>`;
    } catch(e) { 
        showToast("TA 晕头转向了，重试一次吧"); 
        btn.style.display = 'block'; btn.innerHTML = '发送给 TA 验证'; btn.disabled = false;
    }
}

/* =========================================
   [GAME 2] 脑电波同频 Emoji (双回合版)
   ========================================= */
let g2_answer = "";

function g2_reset() {
    document.getElementById('g2-round-tag').innerText = "Round 1: 接收 TA 的电波";
    document.getElementById('g2-r1-area').style.display = 'block';
    document.getElementById('g2-r2-area').style.display = 'none';
    
    document.getElementById('g2-emoji-display').innerText = "❓❓❓";
    document.getElementById('g2-taunt').innerText = "";
    document.getElementById('g2-guess-input').value = "";
    
    document.getElementById('g2-guess-area').style.display = 'none';
    document.getElementById('g2-r1-result').style.display = 'none';
    document.getElementById('g2-start-btn').style.display = 'block';
    document.getElementById('g2-start-btn').innerText = '连接 TA 的脑电波';
    
    document.getElementById('g2-r2-result').style.display = 'none';
    document.getElementById('g2-my-emoji-input').value = '';
    
    const sendBtn = document.getElementById('g2-send-btn');
    if(sendBtn) { sendBtn.style.display = 'block'; sendBtn.innerHTML = '发射'; sendBtn.disabled = false; }
}

window.g2_generate = async function() {
    const ai = friendsData[gameAiId];
    const btn = document.getElementById('g2-start-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 发送信号中...';
    btn.disabled = true;

    const prompt = `
    [System Command: Emoji Charades]
    You are ${ai.realName}. 
    Task: Think of a word related to dating, food, romance, or a internet meme (e.g., 电影院, 珍珠奶茶, 吃火锅, 晚安).
    Describe it using EXACTLY 3 to 4 Emojis.
    Return strict JSON:
    {"emojis": "🍿🎬🥤", "word": "看电影", "taunt": "提示：是我们周末经常做的事哦。"}
    `;

    const res = await callAiForSpecialTask(prompt);
    btn.style.display = 'none'; 

    if(!res) { btn.style.display='block'; btn.innerHTML='重新接收'; btn.disabled=false; return; }
    try {
        const jsonStr = res.replace(/```json/gi,'').replace(/```/g,'').trim();
        const data = JSON.parse(jsonStr);
        g2_answer = data.word;
        
        document.getElementById('g2-emoji-display').innerText = data.emojis;
        document.getElementById('g2-taunt').innerText = `"${data.taunt}"`;
        
        document.getElementById('g2-guess-area').style.display = 'flex';
        document.getElementById('g2-r1-result').style.display = 'none';
        document.getElementById('g2-guess-input').value = "";

    } catch(e) { showToast("解析失败"); btn.style.display='block'; btn.innerHTML='重新接收'; btn.disabled=false; }
}

window.g2_guess = async function() {
    const guess = document.getElementById('g2-guess-input').value.trim();
    if(!guess || !g2_answer) return;

    const resultBox = document.getElementById('g2-r1-result');
    resultBox.style.display = 'block';
    resultBox.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> 正在让 TA 判定...';

    const ai = friendsData[gameAiId];
    const prompt = `
    [System: Judge the game]
    You are ${ai.realName}. The correct answer was: "${g2_answer}". User guessed: "${guess}".
    If meaning is close enough, they win. If wrong, they lose.
    Reply with strict JSON: {"isCorrect": true/false, "comment": "Your cute/teasing response."}
    `;

    const res = await callAiForSpecialTask(prompt);
    try {
        const jsonStr = res.replace(/```json/gi,'').replace(/```/g,'').trim();
        const data = JSON.parse(jsonStr);
        
        if (data.isCorrect) {
            resultBox.innerHTML = `<span style="color:#07c160; font-weight:bold;">✨ 脑电波连上了！</span><br>标准答案: ${g2_answer}<br><br>${ai.realName}: "${data.comment}"`;
        } else {
            resultBox.innerHTML = `<span style="color:#ff4d4f; font-weight:bold;">🥀 完全没有默契！</span><br>标准答案是: ${g2_answer}<br><br>${ai.realName}: "${data.comment}"`;
        }
        resultBox.innerHTML += `<br><br><button class="gc-btn-secondary" style="border-color:#111; color:#111;" onclick="g2_startRound2()">换我发信号 <i class="fas fa-arrow-right"></i></button>`;
    } catch(e) { resultBox.innerHTML = `答案是：${g2_answer}。`; }
}

window.g2_startRound2 = function() {
    document.getElementById('g2-round-tag').innerText = "Round 2: 发送我的电波";
    document.getElementById('g2-r1-area').style.display = 'none';
    document.getElementById('g2-r2-area').style.display = 'block';
}

window.g2_submitMyTurn = async function() {
    const input = document.getElementById('g2-my-emoji-input').value.trim();
    if(!input) { showToast("先输入 Emoji 哦！"); return; }
    
    const btn = document.getElementById('g2-send-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;

    const ai = friendsData[gameAiId];
    const prompt = `
    [System Command: Emoji Charades - AI Guessing]
    You are ${ai.realName}. User sent you these emojis to guess a word/activity: "${input}".
    Guess what they mean. Make it cute or funny. 
    Return JSON ONLY: {"guess": "Your guess (short)", "comment": "Your playful reaction to these emojis"}
    `;

    const res = await callAiForSpecialTask(prompt);
    btn.style.display = 'none';

    try {
        const jsonStr = res.replace(/```json/gi,'').replace(/```/g,'').trim();
        const data = JSON.parse(jsonStr);
        const resultBox = document.getElementById('g2-r2-result');
        resultBox.style.display = 'block';
        
        resultBox.innerHTML = `
            <div style="text-align:center; margin-bottom:15px; background:#fcfcfc; padding:15px; border-radius:12px; border:1px solid #eee;">
                <div style="font-size:11px; color:#888;">TA 的猜测是：</div>
                <div style="font-size:20px; font-weight:800; color:#111; margin:5px 0;">${data.guess}</div>
                <div style="font-size:13px; color:#ff7e67; margin-top:10px;">"${data.comment}"</div>
            </div>
            <div style="font-size:11px; color:#999; text-align:center; margin-bottom:10px;">你觉得 TA 猜得准吗？</div>
            <div style="display:flex; gap:10px;">
                <button class="gc-btn-secondary" onclick="g2_judgeAIGuess(true)" style="border-color:#07c160; color:#07c160; background:#f4fbf6;">算你对吧</button>
                <button class="gc-btn-secondary" onclick="g2_judgeAIGuess(false)" style="border-color:#ff4d4f; color:#ff4d4f; background:#fff5f5;">错得离谱</button>
            </div>
        `;
    } catch(e) { 
        showToast("TA 没看懂你的信号"); 
        btn.style.display='block'; btn.innerHTML='发射'; btn.disabled=false;
    }
}

window.g2_judgeAIGuess = function(isCorrect) {
    const resultBox = document.getElementById('g2-r2-result');
    if(isCorrect) {
        resultBox.innerHTML = `<span style="color:#07c160; font-weight:bold; font-size:16px;">🎉 默契满分！TA 猜对啦！</span><br><br><button class="gc-btn-secondary" onclick="g2_reset()" style="margin-top:10px;">再来一局</button>`;
    } else {
        resultBox.innerHTML = `<span style="color:#ff4d4f; font-weight:bold; font-size:16px;">🥀 TA 完全不懂你在发什么！</span><br><br><button class="gc-btn-secondary" onclick="g2_reset()" style="margin-top:10px;">再来一局</button>`;
    }
}

/* =========================================
   [GAME 3] 平行宇宙逃亡 (韩系高定互动版)
   ========================================= */
let g3_items = [];    
let g3_backpack = []; 
let g3_scenarioData = "";

function g3_reset() {
    g3_items = [];
    g3_backpack = [];
    g3_scenarioData = "";
    document.getElementById('g3-setup-area').style.display = 'block';
    document.getElementById('g3-game-area').style.display = 'none';
    
    document.getElementById('g3-ending-btn').style.display = 'none';
    document.getElementById('g3-ending-box').style.display = 'none';
    
    document.getElementById('g3-items-grid').innerHTML = '';
    document.getElementById('g3-ai-dialogue').style.display = 'none';
    document.getElementById('g3-bp-count').innerText = "0 / 4";
    
    for(let i=0; i<4; i++) {
        const slot = document.getElementById(`g3-slot-${i}`);
        if(slot) {
            slot.className = 'g3-k-slot';
            slot.innerHTML = '';
            slot.removeAttribute('data-owner');
        }
    }
}

// 1. 生成剧本
window.g3_generateScenario = async function() {
    const ai = friendsData[gameAiId];
    const btn = document.getElementById('g3-start-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SCANNING...';
    btn.disabled = true;

    const prompt = `
    [System Command]
    Generating a survival game scenario.
    Context: User and ${ai.realName} are trapped in a Parallel Universe crisis.
    1. Create a Crisis Name & Description (Short, tense, Chinese).
    2. Generate 6 survival items (Emoji + Name). 3 useful, 3 weird/useless.
    Return JSON:
    {
      "scenario": "例如：丧尸围城，我们被困在超市仓库...",
      "items": [
        {"id":0, "name": "平底锅", "emoji": "🍳"},
        ...
      ]
    }
    `;

    const res = await callAiForSpecialTask(prompt);
    btn.innerHTML = 'INITIALIZE';
    btn.disabled = false;

    if(!res) { showToast("信号连接失败"); return; }
    try {
        const data = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim());
        g3_scenarioData = data.scenario;
        g3_items = data.items.slice(0, 6);

        document.getElementById('g3-setup-area').style.display = 'none';
        document.getElementById('g3-game-area').style.display = 'flex';
        document.getElementById('g3-scenario').innerText = g3_scenarioData;
        
        // AI 开场白
        const dialogue = document.getElementById('g3-ai-dialogue');
        const ava = ai.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${ai.realName}`;
        dialogue.innerHTML = `
            <div class="g3-k-avatar"><img src="${ava}"></div>
            <div class="g3-k-bubble">看来我们要在这里活下去了... 地上有东西，你先挑！</div>
        `;
        dialogue.style.display = 'flex';
        
        const grid = document.getElementById('g3-items-grid');
        grid.innerHTML = '';
        g3_items.forEach((item) => {
            grid.innerHTML += `
                <div class="g3-k-card" id="g3-card-${item.id}" onclick="g3_userPick(${item.id})">
                    <div class="g3-emoji">${item.emoji}</div>
                    <div class="g3-name">${item.name}</div>
                </div>
            `;
        });
    } catch(e) { showToast("数据解析错误"); g3_reset(); }
}

// 2. 玩家挑选 -> AI 挑选 (带理由)
window.g3_userPick = async function(itemId) {
    const ai = friendsData[gameAiId];
    const card = document.getElementById(`g3-card-${itemId}`);
    
    if(!card || card.classList.contains('picked')) return; 
    if (g3_backpack.length >= 4) return; 

    // --- 玩家回合 ---
    const selectedItem = g3_items.find(i => i.id === itemId);
    g3_backpack.push({ owner: 'ME', item: selectedItem });
    card.classList.add('picked');
    updateG3Backpack();
    
    if (g3_backpack.length >= 4) {
        finishG3Picking();
        return;
    }

    // --- AI 回合 ---
    document.getElementById('g3-items-grid').style.pointerEvents = 'none';
    const dialogue = document.querySelector('#g3-ai-dialogue .g3-k-bubble');
    dialogue.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 正在思考...`;

    const remainingItems = g3_items.filter(i => !g3_backpack.some(b => b.item.id === i.id));
    const remainStr = remainingItems.map(i => `${i.id}:${i.name}`).join(', ');

    const prompt = `
    [System Command]
    Roleplay: ${ai.realName}. Crisis: ${g3_scenarioData}.
    User just picked: [${selectedItem.name}].
    Remaining items: ${remainStr}.
    
    Task:
    1. React to User's choice (Tsundere/Sweet/Funny based on persona).
    2. Pick ONE item for yourself.
    3. Give a REASON why you picked it.
    
    Return JSON: {"reaction": "...", "pickId": 123, "reason": "..."}
    `;

    const res = await callAiForSpecialTask(prompt);
    
    try {
        let aiPick;
        let replyText = "";
        
        if (!res) throw new Error("API Fail");
        const data = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim());
        aiPick = g3_items.find(i => i.id === data.pickId) || remainingItems[0];
        replyText = `${data.reaction} 那我就拿【${aiPick.name}】吧，${data.reason}`;
        
        // AI 拿取
        g3_backpack.push({ owner: 'AI', item: aiPick });
        const aiCard = document.getElementById(`g3-card-${aiPick.id}`);
        if(aiCard) aiCard.classList.add('picked');
        updateG3Backpack();

        dialogue.innerText = replyText;
        
    } catch(e) { 
        // 兜底：随机拿一个
        const aiPick = remainingItems[0];
        g3_backpack.push({ owner: 'AI', item: aiPick });
        document.getElementById(`g3-card-${aiPick.id}`).classList.add('picked');
        updateG3Backpack();
        dialogue.innerText = "我随便拿了这个，快走吧！";
    }

    if (g3_backpack.length >= 4) {
        finishG3Picking();
    } else {
        document.getElementById('g3-items-grid').style.pointerEvents = 'auto';
    }
}

function updateG3Backpack() {
    document.getElementById('g3-bp-count').innerText = `${Math.min(g3_backpack.length, 4)} / 4`;
    g3_backpack.forEach((slotData, index) => {
        if(index >= 4) return;
        const slotEl = document.getElementById(`g3-slot-${index}`);
        if(slotEl) {
            slotEl.className = 'g3-k-slot filled';
            slotEl.innerHTML = slotData.item.emoji;
            slotEl.setAttribute('data-owner', slotData.owner === 'ME' ? 'ME' : 'TA');
        }
    });
}

function finishG3Picking() {
    const ai = friendsData[gameAiId];
    document.querySelector('#g3-ai-dialogue .g3-k-bubble').innerText = "背包装满了！准备出发！";
    const endingBtn = document.getElementById('g3-ending-btn');
    if(endingBtn) endingBtn.style.display = 'block';
}

// 3. 生成结局
window.g3_generateEnding = async function() {
    const btn = document.getElementById('g3-ending-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> CALCULATING...';
    btn.disabled = true;

    const itemsStr = g3_backpack.map(b => `${b.owner==='ME'?'User':friendsData[gameAiId].realName}: ${b.item.name}`).join('; ');
    const prompt = `
    [System Command]
    Write a short Ending Story (100 words).
    Scenario: ${g3_scenarioData}
    Items Used: ${itemsStr}
    Describe how they used these items to survive (or fail funnily).
    Return JSON: {"text": "..."}
    `;

    const res = await callAiForSpecialTask(prompt);
    btn.style.display = 'none';
    
    const endingBox = document.getElementById('g3-ending-box');
    endingBox.style.display = 'block';
    
    try {
        const text = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim()).text;
        endingBox.innerHTML = `<b>【最终结局】</b><br>${text}<br><br><span style="font-size:10px;color:#aaa;">点击上方返回重新开始</span>`;
    } catch(e) {
        endingBox.innerHTML = "你们居然活下来了... (生成失败)";
    }
}


/* =========================================
   [GAME 4] 脸红心跳扭蛋机 (独立小剧场版)
   ========================================= */
let g4_isTwisting = false;
let g4_currentPersona = null; // 存储当前抽到的人设

// 1. 扭动逻辑
window.g4_twist = function() {
    if(g4_isTwisting) return;
    g4_isTwisting = true;

    // 视觉动画
    const knob = document.querySelector('.g4-k-knob');
    const glass = document.querySelector('.g4-k-glass');
    knob.style.transform = 'rotate(360deg)';
    glass.classList.add('shaking');
    
    if(navigator.vibrate) navigator.vibrate([20, 50, 20]);

    // 延迟出货
    setTimeout(() => {
        const dropBall = document.getElementById('g4-dropped-ball');
        dropBall.style.display = 'block';
        
        // 随机颜色
        const colors = ['#ff9a9e', '#a1c4fd', '#fbc2eb', '#84fab0'];
        dropBall.style.background = colors[Math.floor(Math.random()*colors.length)];
        
        // 弹窗
        setTimeout(async () => {
            await g4_openResult();
            // 重置动画状态
            knob.style.transform = 'rotate(0deg)';
            glass.classList.remove('shaking');
            dropBall.style.display = 'none';
            g4_isTwisting = false;
        }, 800);
        
    }, 1000);
}

// 2. 生成结果并打开弹窗
async function g4_openResult() {
    const ai = friendsData[gameAiId];
    
    // 弹窗先出来 loading
    const modal = document.getElementById('g4-interaction-modal');
    modal.classList.add('show');
    document.getElementById('g4-role-title').innerText = "Loading...";
    document.getElementById('g4-role-desc').innerText = "正在生成限定人设...";
    document.getElementById('g4-chat-area').innerHTML = '';

    const prompt = `
    [System Command]
    Generate a creative Roleplay Persona for ${ai.realName}.
    Themes: [Sweet/Clingy], [Bossy/Domineering], [Shy/Tsundere], [Fantasy/Vampire].
    Pick ONE.
    Return JSON:
    {
      "title": "Title (e.g. 粘人猫咪)",
      "desc": "Description (e.g. 变成了如果不抱抱就会死的体质)",
      "firstLine": "First sentence to say to user."
    }
    `;

    const res = await callAiForSpecialTask(prompt);
    if (!res) { g4_closeModal(); showToast("扭蛋空了？"); return; }

    try {
        const data = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim());
        
        g4_currentPersona = data; // 存下来
        
        document.getElementById('g4-role-title').innerText = data.title;
        document.getElementById('g4-role-desc').innerText = data.desc;
        
        // AI 发第一句
        g4_appendBubble('ai', data.firstLine);
        
    } catch(e) { g4_closeModal(); }
}

// 3. 弹窗内的小剧场聊天
window.g4_sendMiniMsg = async function() {
    const input = document.getElementById('g4-mini-input');
    const text = input.value.trim();
    if(!text) return;
    
    // 用户发言
    g4_appendBubble('me', text);
    input.value = '';

    // AI 回复 (带上特定人设)
    const ai = friendsData[gameAiId];
    const prompt = `
    [System Command]
    Roleplay Game.
    You are ${ai.realName}, BUT currently you have this BUFF:
    [${g4_currentPersona.title}]: ${g4_currentPersona.desc}
    
    User said: "${text}"
    Reply staying STRICTLY in this temporary persona. Short message.
    `;
    
    // 这里简单用 callAiForSpecialTask 模拟聊天
    // 如果要更连贯，需要把 mini-chat 历史也传进去，这里简化处理只传上一句
    const res = await callAiForSpecialTask(prompt);
    if(res) {
        // 清理一下可能的引号
        const reply = res.replace(/"/g, '').trim();
        g4_appendBubble('ai', reply);
    }
}

function g4_appendBubble(role, text) {
    const area = document.getElementById('g4-chat-area');
    const div = document.createElement('div');
    div.className = `g4-bubble ${role}`;
    div.innerText = text;
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
}

// 4. 关闭弹窗
window.g4_closeModal = function() {
    document.getElementById('g4-interaction-modal').classList.remove('show');
    g4_currentPersona = null;
}


/* =========================================
   [GAME 5] 同居领地战 (家规契约版)
   ========================================= */
let g5_board = [0,0,0, 0,0,0, 0,0,0]; 
const g5_tileNames = [
    {icon:"📺", name:"电视点播权"}, {icon:"🛏️", name:"大床左边"}, {icon:"🎮", name:"游戏机归属"},
    {icon:"🧹", name:"免做家务权"}, {icon:"🛋️", name:"懒人沙发"}, {icon:"🐱", name:"撸猫优先权"},
    {icon:"🍫", name:"零食掌控权"}, {icon:"💻", name:"书房使用权"}, {icon:"🎵", name:"切歌权"}
];
let g5_targetIndex = -1;

function g5_reset() {
    g5_board = [0,0,0, 0,0,0, 0,0,0];
    document.getElementById('g5-result').style.display = 'none';
    document.getElementById('g5-dialog-modal').classList.remove('show');
    document.getElementById('g5-contract-modal').classList.remove('show');
    
    // 重置契约界面状态
    document.getElementById('g5-rule-input').value = '';
    document.getElementById('g5-rule-input').readOnly = false;
    document.getElementById('g5-force-sign-btn').style.display = 'block';
    document.getElementById('g5-ai-signature-area').style.display = 'none';
    document.getElementById('g5-close-contract-btn').style.display = 'none';
    
    g5_renderBoard();
}

function g5_renderBoard() {
    const grid = document.getElementById('g5-grid');
    grid.innerHTML = '';
    
    g5_board.forEach((val, idx) => {
        const item = g5_tileNames[idx];
        const div = document.createElement('div');
        div.className = 'g5-tile';
        
        if(val === 1) { 
            div.classList.add('owner-me');
            div.innerHTML = `<div class="g5-tile-icon">ME</div><div class="g5-tile-name">Mine</div>`;
        } else if (val === 2) { 
            div.classList.add('owner-ai');
            div.innerHTML = `<div class="g5-tile-icon">TA</div><div class="g5-tile-name">Taken</div>`;
        } else {
            div.innerHTML = `<div class="g5-tile-icon">${item.icon}</div><div class="g5-tile-name">${item.name}</div>`;
            div.onclick = () => g5_openNegotiation(idx);
        }
        grid.appendChild(div);
    });
}

function g5_openNegotiation(idx) {
    g5_targetIndex = idx;
    const item = g5_tileNames[idx];
    document.getElementById('g5-target-name').innerText = item.name;
    document.getElementById('g5-argument').value = '';
    document.getElementById('g5-dialog-modal').classList.add('show');
    setTimeout(() => document.getElementById('g5-argument').focus(), 300);
}

window.g5_submitArgument = async function() {
    const arg = document.getElementById('g5-argument').value.trim();
    if(!arg) { showToast("给个理由嘛！"); return; }
    
    const tileName = g5_tileNames[g5_targetIndex].name;
    const ai = friendsData[gameAiId];
    
    const btn = document.getElementById('g5-submit-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> TA 正在斟酌...';
    btn.disabled = true;

    const prompt = `
    [System Command: Couple Turf War]
    You are ${ai.realName}. Persona: ${ai.persona}.
    User wants to claim [${tileName}] in your shared home. Reason: "${arg}"
    Judge if the reason is cute, valid, or funny.
    If agree: true, yield the territory.
    If agree: false, take it for yourself playfully or stubbornly.
    Return JSON ONLY: {"agree": true/false, "reply": "Short spoken response"}
    `;

    const res = await callAiForSpecialTask(prompt);
    btn.innerHTML = '尝试说服 TA';
    btn.disabled = false;
    document.getElementById('g5-dialog-modal').classList.remove('show');

    try {
        const data = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim());
        const resBox = document.getElementById('g5-result');
        resBox.style.display = 'block';
        
        if(data.agree) {
            g5_board[g5_targetIndex] = 1; 
            resBox.innerHTML = `<b style="color:#111;">成交！</b><br><span style="font-family:'Songti SC'; font-size:13px; color:#555;">“${data.reply}”</span>`;
        } else {
            g5_board[g5_targetIndex] = 2; 
            resBox.innerHTML = `<b style="color:#aaa;">谈判破裂...</b><br><span style="font-family:'Songti SC'; font-size:13px; color:#555;">“${data.reply}”</span>`;
        }
        
        g5_renderBoard();
        g5_checkWin();
    } catch(e) { showToast("AI 走神了，再试一次"); }
}

function g5_checkWin() {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    let winner = 0;
    for(let line of lines) {
        if(g5_board[line[0]] !== 0 && g5_board[line[0]] === g5_board[line[1]] && g5_board[line[0]] === g5_board[line[2]]) {
            winner = g5_board[line[0]]; break;
        }
    }
    
    if(winner !== 0) {
        setTimeout(() => g5_showContract(winner), 800);
    } else if (!g5_board.includes(0)) {
        showKAlert("平局！这个家看来是没法分了。", g5_reset);
    }
}

// 赢家签订契约逻辑
function g5_showContract(winner) {
    const modal = document.getElementById('g5-contract-modal');
    const winnerText = document.getElementById('g5-contract-winner');
    const ruleInput = document.getElementById('g5-rule-input');
    const ai = friendsData[gameAiId];
    
    modal.classList.add('show');
    
    if (winner === 1) {
        // 我赢了
        winnerText.innerHTML = `鉴于 <b>[ User ]</b> 赢得了本次领地战<br>特此颁布以下不可撤销之规矩：`;
        ruleInput.value = "";
        ruleInput.readOnly = false;
        ruleInput.placeholder = "作为赢家，写下你要定下的一条家规（如：以后你必须听我的）...";
        document.getElementById('g5-force-sign-btn').style.display = 'block';
        document.getElementById('g5-force-sign-btn').innerText = "勒令 TA 签字";
        
        // 绑定签字逻辑为“AI 被迫签字”
        document.getElementById('g5-force-sign-btn').onclick = () => g5_aiSignContract('user_won');

    } else {
        // AI 赢了，AI 强制定规矩
        winnerText.innerHTML = `鉴于 <b>[ ${ai.realName} ]</b> 赢得了本次领地战<br>特此对你颁布以下规矩：`;
        ruleInput.value = "正在生成霸王条款...";
        ruleInput.readOnly = true;
        document.getElementById('g5-force-sign-btn').style.display = 'none';
        
        // 生成 AI 的规矩
        setTimeout(async () => {
            const prompt = `You are ${ai.realName}. You just defeated User in a territory war in your shared home. Write ONE bossy, teasing, or overly clingy house rule that User MUST obey. Just the rule itself.`;
            const res = await callAiForSpecialTask(prompt);
            const rule = res ? res.replace(/["']/g, '') : "以后家里的事我说了算。";
            ruleInput.value = rule;
            
            document.getElementById('g5-force-sign-btn').style.display = 'block';
            document.getElementById('g5-force-sign-btn').innerText = "我认栽，我签字";
            document.getElementById('g5-force-sign-btn').onclick = () => {
                document.getElementById('g5-ai-signature-area').style.display = 'block';
                document.getElementById('g5-ai-reaction').innerText = "“乖乖听话就对了。”";
                document.getElementById('g5-ai-sign').innerText = "User"; // 假装用户签的
                document.getElementById('g5-force-sign-btn').style.display = 'none';
                document.getElementById('g5-close-contract-btn').style.display = 'block';
            };
        }, 1000);
    }
}

async function g5_aiSignContract(mode) {
    const rule = document.getElementById('g5-rule-input').value.trim();
    if(!rule) { showToast("规矩不能为空！"); return; }
    
    const btn = document.getElementById('g5-force-sign-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> TA 正在看合同...';
    btn.disabled = true;

    const ai = friendsData[gameAiId];
    const prompt = `
    [System Command] You are ${ai.realName}. Persona: ${ai.persona}.
    User defeated you and forced you to sign this house rule: "${rule}".
    React to it. You must sign it, but you can complain, act cute, or be secretly happy.
    Return JSON ONLY: {"reaction": "..."}
    `;

    const res = await callAiForSpecialTask(prompt);
    btn.style.display = 'none';
    btn.disabled = false;

    try {
        const text = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim()).reaction;
        document.getElementById('g5-ai-signature-area').style.display = 'block';
        document.getElementById('g5-ai-reaction').innerText = `“${text}”`;
        document.getElementById('g5-ai-sign').innerText = ai.realName; // AI 花体签名
        
        document.getElementById('g5-close-contract-btn').style.display = 'block';
        
        // 作为彩蛋，把这个条约存入记忆
        saveMessageToHistory(gameAiId, {
            text: `[ Love Space 协议达成 ] 我定下家规：${rule}。TA的反应：${text}`,
            type: 'sent', senderName: 'ME', isOffline: true
        });

    } catch(e) {
        showToast("TA 把合同撕了，请重试");
        btn.style.display = 'block'; btn.innerText = "勒令 TA 签字";
    }
}


/* =========================================
   [GAME 6] 午夜微醺局 (酒后吐真言)
   ========================================= */
let g6_myDice = [];
let g6_drunkMe = 0;
let g6_drunkAi = 0;

function g6_reset() {
    g6_drunkMe = 0;
    g6_drunkAi = 0;
    updateG6Cups();
    
    document.getElementById('g6-my-dice').innerText = "🎲 🎲 🎲 🎲 🎲";
    document.getElementById('g6-ai-dialogue').style.display = 'none';
    document.getElementById('g6-action-area').style.display = 'none';
    document.getElementById('g6-start-btn').style.display = 'block';
    document.getElementById('g6-confession-modal').classList.remove('show');
}

function updateG6Cups() {
    const meCups = document.getElementById('g6-cups-me').children;
    const aiCups = document.getElementById('g6-cups-ai').children;
    
    for(let i=0; i<3; i++) {
        meCups[i].className = i < g6_drunkMe ? "fas fa-glass-whiskey filled" : "fas fa-glass-whiskey empty";
        aiCups[i].className = i < g6_drunkAi ? "fas fa-glass-whiskey filled" : "fas fa-glass-whiskey empty";
    }
}

window.g6_start = function() {
    document.getElementById('g6-start-btn').style.display = 'none';
    const diceBox = document.getElementById('g6-my-dice');
    diceBox.classList.add('shake-anim');
    diceBox.innerText = "🎲 🎲 🎲 🎲 🎲";
    
    setTimeout(() => {
        diceBox.classList.remove('shake-anim');
        const faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];
        g6_myDice = Array.from({length: 5}, () => Math.floor(Math.random() * 6) + 1);
        diceBox.innerText = g6_myDice.map(d => faces[d-1]).join(' ');
        
        document.getElementById('g6-action-area').style.display = 'flex';
        const dlg = document.getElementById('g6-ai-dialogue');
        dlg.style.display = 'block';
        dlg.innerHTML = `午夜的酒已经倒好。你先喊点？`;
        document.getElementById('g6-bid-input').value = "";
    }, 800);
}

window.g6_makeBid = async function() {
    const input = document.getElementById('g6-bid-input').value.trim();
    if(!input) { showToast("请先喊数！"); return; }
    
    const dlg = document.getElementById('g6-ai-dialogue');
    dlg.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> TA 正在看牌...';
    
    const ai = friendsData[gameAiId];
    // 根据醉意改变 prompt
    let drunkPrompt = "";
    if (g6_drunkAi === 1) drunkPrompt = "You had 1 drink. You are slightly tipsy, more relaxed, maybe giggly.";
    else if (g6_drunkAi === 2) drunkPrompt = "You had 2 drinks. You are quite drunk, bold, clingy, or a bit aggressive.";

    const prompt = `
    [System Command: Liar's Dice Logic]
    You are ${ai.realName}. Persona: ${ai.persona}.
    ${drunkPrompt}
    User bid: "${input}".
    Decide whether to "bid" higher or "call" (open).
    Return JSON ONLY: {"action": "bid" or "call", "content": "Your spoken reply", "dice": "your 5 hidden dice numbers (e.g. 1,3,4,6,6)"}
    `;

    const res = await callAiForSpecialTask(prompt);
    try {
        const data = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim());
        if(data.action === 'call') {
            dlg.innerHTML = `<b style="color:#ff4d4f;">TA 喊了“开”！</b><br>“${data.content}”<br><br>TA 的骰子是：[ ${data.dice} ]<br>你的骰子是：[ ${g6_myDice.join(', ')} ]<br><br>谁输了？`;
            
            // 弹出选择谁喝酒的界面
            setTimeout(() => {
                showKConfirm("判定时刻", "谁在吹牛？", 
                    () => g6_drink('me'), // 确定=我输
                    () => g6_drink('ai')  // 取消=TA输
                );
            }, 1000);
        } else {
            dlg.innerHTML = `TA 接着喊：<b>${data.content}</b><br><br>到你了，继续喊还是开？`;
        }
    } catch(e) { dlg.innerText = "TA 好像醉得听不清你在喊什么..."; }
}

window.g6_callLiar = async function() {
    const dlg = document.getElementById('g6-ai-dialogue');
    dlg.innerHTML = '你大喊一声：<b>开！</b><br>正在揭晓底牌...';
    
    const aiDice = Array.from({length: 5}, () => Math.floor(Math.random() * 6) + 1).join(', ');
    
    setTimeout(() => {
        dlg.innerHTML += `<br><br>TA 的骰子：[ ${aiDice} ]<br>你的骰子：[ ${g6_myDice.join(', ')} ]<br><br>请判定谁输谁赢。`;
        setTimeout(() => {
            showKConfirm("判定时刻", "是谁在吹牛？", 
                () => g6_drink('me'), 
                () => g6_drink('ai')  
            );
        }, 1000);
    }, 1000);
}

// 核心：喝酒逻辑
async function g6_drink(loser) {
    if (loser === 'me') {
        g6_drunkMe++;
        updateG6Cups();
        if (g6_drunkMe >= 3) {
            showKAlert("你已经喝了三杯，彻底醉倒了...<br>游戏结束，早点休息吧。");
            setTimeout(g6_reset, 2000);
            return;
        } else {
            document.getElementById('g6-action-area').style.display = 'none';
            document.getElementById('g6-ai-dialogue').innerHTML = "你罚饮一杯。酒意微醺，再来一局。";
            document.getElementById('g6-start-btn').style.display = 'block';
            document.getElementById('g6-start-btn').innerText = "下一局 (Next Round)";
        }
    } else {
        // AI 喝酒
        g6_drunkAi++;
        updateG6Cups();
        
        if (g6_drunkAi >= 3) {
            // 触发终极事件：午夜留声机 (酒后吐真言)
            triggerMidnightConfession();
        } else {
            // 普通喝酒，AI 给出一句微醺反应
            const ai = friendsData[gameAiId];
            document.getElementById('g6-ai-dialogue').innerHTML = '<i class="fas fa-spinner fa-spin"></i> TA 喝下了一杯酒...';
            
            const prompt = `[System] You are ${ai.realName}. You lost the dice game and drank a glass of alcohol. You are at drunk level ${g6_drunkAi}/3. Output ONE short sentence reacting to the drink. Make it slightly ambiguous or teasing. JSON ONLY: {"text":"..."}`;
            const res = await callAiForSpecialTask(prompt);
            try {
                const text = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim()).text;
                document.getElementById('g6-ai-dialogue').innerHTML = `TA 饮下一杯，脸颊微红：<br>“${text}”`;
            } catch(e) {
                document.getElementById('g6-ai-dialogue').innerHTML = "TA 默默喝完了一杯，眼神开始迷离。";
            }
            
            document.getElementById('g6-action-area').style.display = 'none';
            document.getElementById('g6-start-btn').style.display = 'block';
            document.getElementById('g6-start-btn').innerText = "继续灌 TA (Next Round)";
        }
    }
}

// 终极大招：午夜独白
async function triggerMidnightConfession() {
    const modal = document.getElementById('g6-confession-modal');
    const textBox = document.getElementById('g6-confession-text');
    const ai = friendsData[gameAiId];
    
    modal.classList.add('show');
    textBox.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...';
    
    const prompt = `
    [System Command: Midnight Drunk Confession]
    You are ${ai.realName}. Persona: ${ai.persona}.
    You have lost the drinking game 3 times and are now completely drunk. 
    You drop all your defenses. Write a very emotional, deep, or intensely possessive "drunk confession" (about 50-80 words) to the User. 
    It should reveal a hidden feeling you normally wouldn't say.
    Return JSON: {"text": "..."}
    `;
    
    const res = await callAiForSpecialTask(prompt);
    try {
        const text = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim()).text;
        textBox.innerHTML = `“${text}”`;
        
        // 记入历史记录，作为美好回忆
        saveMessageToHistory(gameAiId, {
            text: `[ 午夜微醺局 ] TA 喝醉后的独白：${text}`,
            type: 'received', senderName: ai.realName, isOffline: true
        });

    } catch(e) {
        textBox.innerHTML = "“别摇了，我真的醉了... 我只是想说，有你在身边真好。”";
    }
}


/* =========================================
   [GAME 7] 心跳娃娃机 (白色拟物版 - 完整逻辑)
   ========================================= */

let g7_clawPos = 45; // 爪子位置 (百分比)
let g7_moveInterval = null; // 移动定时器
let g7_isDropping = false; // 是否正在下爪

// 复位游戏状态
function g7_reset() {
    const clawAssembly = document.getElementById('g7-claw-assembly');
    const cable = document.getElementById('g7-cable');
    const head = document.getElementById('g7-claw-head');
    const resultBox = document.getElementById('g7-result');
    const dropBtn = document.getElementById('g7-drop-btn');

    if (clawAssembly) clawAssembly.style.left = '45%';
    if (cable) cable.style.height = '20px';
    if (head) head.classList.remove('closed');
    if (resultBox) resultBox.style.display = 'none';
    if (dropBtn) dropBtn.disabled = false;
    
    g7_clawPos = 45;
    g7_isDropping = false;
    g7_stopMove(); // 确保定时器被清除
     const aiTurnBox = document.getElementById('g7-ai-turn');
    if (aiTurnBox) {
        aiTurnBox.style.display = 'none';
    }
}

// 开始移动 (direction: -1为左, 1为右)
window.g7_startMove = function(direction) {
    if (g7_isDropping || g7_moveInterval) return;
    
    g7_moveInterval = setInterval(() => {
        g7_clawPos += direction * 2; // 移动速度
        if (g7_clawPos < 5) g7_clawPos = 5;
        if (g7_clawPos > 85) g7_clawPos = 85;
        
        const clawAssembly = document.getElementById('g7-claw-assembly');
        if (clawAssembly) clawAssembly.style.left = g7_clawPos + '%';
    }, 50); // 每50ms移动一次
}

// 停止移动
window.g7_stopMove = function() {
    if(g7_moveInterval) {
        clearInterval(g7_moveInterval);
        g7_moveInterval = null;
    }
}

// 核心：下爪逻辑
window.g7_dropClaw = async function() {
    if (g7_isDropping) return;
    g7_isDropping = true;
    g7_stopMove(); // 停止左右移动
        document.querySelectorAll('.g7-prize').forEach(prizeEl => {
        prizeEl.style.transition = 'none';
        prizeEl.style.opacity = '1';
        prizeEl.style.transform = 'none';
    });


    const cable = document.getElementById('g7-cable');
    const head = document.getElementById('g7-claw-head');
    const resultBox = document.getElementById('g7-result');
    const dropBtn = document.getElementById('g7-drop-btn');

    if(dropBtn) dropBtn.disabled = true;

    // 1. 下爪
    if (cable) cable.style.height = '180px';
    if (resultBox) {
        resultBox.style.display = 'block';
        resultBox.innerHTML = '爪子下落中... <i class="fas fa-spinner fa-spin"></i>';
    }

    await new Promise(resolve => setTimeout(resolve, 800));

    // 2. 闭合
    if (head) head.classList.add('closed');
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 3. 上升
    if (cable) cable.style.height = '20px';
    
    await new Promise(resolve => setTimeout(resolve, 800));

    // 4. 判定结果
    const prizePositions = [15, 40, 65]; // 娃娃的中心位置
    let caughtPrize = false;
    for(const pos of prizePositions) {
        // 如果爪子位置和娃娃位置很接近，就算抓到了
        if (Math.abs(g7_clawPos - pos) < 10) {
            caughtPrize = true;
            break;
        }
    }
    
    // 为了增加趣味性，即使位置对准了，也有 30% 几率抓空
    if (caughtPrize && Math.random() < 0.7) {
        // 抓中了！
        const ai = friendsData[gameAiId];
        resultBox.innerHTML = '抓到了！正在让 TA 拆开... <i class="fas fa-spinner fa-spin"></i>';
         let prizeName = "一个神秘的盲盒";
    // 根据爪子位置找到最近的娃娃
    let closestDist = Infinity;
    let caughtPrizeEl = null;
    document.querySelectorAll('.g7-prize').forEach(prizeEl => {
        const prizePos = parseFloat(prizeEl.style.left);
        const dist = Math.abs(g7_clawPos - prizePos);
        if (dist < closestDist) {
            closestDist = dist;
            caughtPrizeEl = prizeEl;
        }
    });

    if (caughtPrizeEl) {
        prizeName = caughtPrizeEl.dataset.name || prizeName;
        // 抓中后让娃娃消失
        caughtPrizeEl.style.transition = 'opacity 0.5s, transform 0.5s';
        caughtPrizeEl.style.opacity = '0';
        caughtPrizeEl.style.transform = 'translateY(-50px) scale(1.5)';
    }

        const prompt = `
        [System Command: Claw Machine Prize]
        You are ${ai.realName}. User just won a prize from your personal claw machine.
        Invent a funny, cute, or weird prize you put in there for them (e.g. "A coupon for me to cook dinner", "My ugly selfie", "A half-eaten cookie").
        Return JSON: {"prize": "...", "message": "Your reaction to them winning it"}
        `;
        const res = await callAiForSpecialTask(prompt);
        try {
            const data = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim());
            resultBox.innerHTML = `<span style="color:#07c160; font-weight:bold;">🎉 抓中了！</span><br><br>你获得了：<b>【${data.prize}】</b><br><br>${ai.realName}: "${data.message}"<br><button class="gc-btn-secondary" onclick="g7_reset()" style="margin-top:10px;">再玩一次</button>`;
        } catch(e) {
            resultBox.innerHTML = "盲盒打不开，坏掉了。";
        }
    } else {
        // 抓空了！
        resultBox.innerHTML = `<span style="color:#ff4d4f; font-weight:bold;">🥀 抓空了！</span><br><br>就差一点点！爪子太松了。<br><button class="gc-btn-secondary" onclick="g7_reset()" style="margin-top:10px;">再投一次币</button>`;
    }
    const aiTurnBox = document.getElementById('g7-ai-turn');
    if (aiTurnBox) {
        document.getElementById('g7-ai-partner-name').innerText = friendsData[gameAiId]?.remark || friendsData[gameAiId]?.realName || 'TA';
        aiTurnBox.style.display = 'flex';
        document.getElementById('g7-ai-reaction').style.display = 'none'; // 先隐藏AI的吐槽框
    }
    g7_isDropping = false;
}

/* =========================================
   [GAME 8] 暧昧飞行棋
   ========================================= */
let g8_mePos = 0;
let g8_aiPos = 0;

function g8_reset() {
    g8_mePos = 0;
    g8_aiPos = 0;
    updateG8Tokens();
    document.getElementById('g8-result').style.display = 'none';
}

function updateG8Tokens() {
    const meToken = document.getElementById('g8-me-token');
    const aiToken = document.getElementById('g8-ai-token');
    // 格子高度大概是 30px + 5px gap = 35px
    meToken.style.top = (g8_mePos * 35 + 15) + 'px';
    aiToken.style.top = (g8_aiPos * 35 + 15) + 'px';
}

window.g8_rollDice = async function() {
    const roll = Math.floor(Math.random() * 3) + 1; // 为了游戏体验，只摇1-3步
    g8_mePos = Math.min(g8_mePos + roll, 9);
    updateG8Tokens();
    
    const resultBox = document.getElementById('g8-result');
    resultBox.style.display = 'block';
    resultBox.innerHTML = `你掷出了 <b>${roll}</b> 步！<br><i class="fas fa-spinner fa-spin"></i> 等待格子事件...`;

    // 检查格子类型 (简单写死：2,6是问号，4,8是恶魔)
    const ai = friendsData[gameAiId];
    let prompt = "";
    
    if (g8_mePos === 9) {
        resultBox.innerHTML = `<span style="color:#07c160; font-size:16px; font-weight:bold;">🏆 你赢了！</span><br><br>你可以向 TA 提出一个过分的要求！<br><button class="gc-btn-secondary" onclick="g8_reset()" style="margin-top:10px;">再来一局</button>`;
        return;
    } else if (g8_mePos === 2 || g8_mePos === 6) {
        prompt = `You are ${ai.realName}. User landed on a 'Truth' tile. Ask them a spicy/cute truth question. JSON: {"text": "..."}`;
    } else if (g8_mePos === 4 || g8_mePos === 8) {
        prompt = `You are ${ai.realName}. User landed on a 'Dare' tile. Give them a cute/embarrassing dare. JSON: {"text": "..."}`;
    } else {
        // 安全区，AI 自动走
        setTimeout(() => g8_aiTurn(), 1000);
        return;
    }

    const res = await callAiForSpecialTask(prompt);
    try {
        const text = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim()).text;
        resultBox.innerHTML = `<b style="color:#ff7e67;">命运降临！TA 对你说：</b><br><br>"${text}"<br><br><button class="gc-btn-secondary" onclick="g8_aiTurn()">完成惩罚，让 TA 走</button>`;
    } catch(e) { g8_aiTurn(); }
}

function g8_aiTurn() {
    const roll = Math.floor(Math.random() * 3) + 1;
    g8_aiPos = Math.min(g8_aiPos + roll, 9);
    updateG8Tokens();
    
    const resultBox = document.getElementById('g8-result');
    if (g8_aiPos === 9) {
        resultBox.innerHTML = `<span style="color:#ff4d4f; font-size:16px; font-weight:bold;">💀 TA 赢了！</span><br><br>准备好接受 TA 的惩罚吧！<br><button class="gc-btn-secondary" onclick="g8_reset()" style="margin-top:10px;">再来一局</button>`;
    } else {
        resultBox.innerHTML = `TA 掷出了 <b>${roll}</b> 步。目前安全。<br><br>又到你了！`;
    }
}

/* =========================================
   [GAME 9] 灵魂抽鬼牌
   ========================================= */
let g9_jokerIndex = 0;

function g9_reset() {
    document.getElementById('g9-game-area').style.display = 'none';
    document.getElementById('g9-result').style.display = 'none';
    document.getElementById('g9-start-btn').style.display = 'block';
    document.querySelectorAll('.g9-card').forEach(c => {
        c.classList.remove('revealed');
        c.innerText = c.dataset.num || "?";
    });
}

window.g9_start = function() {
    g9_jokerIndex = Math.floor(Math.random() * 5); // 0-4
    document.getElementById('g9-game-area').style.display = 'block';
    document.getElementById('g9-start-btn').style.display = 'none';
    
    document.querySelectorAll('.g9-card').forEach((c, i) => {
        c.dataset.num = i + 1;
        c.innerText = i + 1;
    });
}

window.g9_askAI = async function() {
    const input = document.getElementById('g9-ask-input').value.trim();
    if(!input) return;
    
    const replyBox = document.getElementById('g9-ai-reply');
    replyBox.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在揣摩心思...';

    const ai = friendsData[gameAiId];
    const prompt = `
    [System Command: Old Maid Mind Game]
    You are ${ai.realName}. You hold 5 cards, card #${g9_jokerIndex + 1} is the Joker (Bomb).
    User asks: "${input}".
    You can choose to lie to trick them into picking the Joker, or tell the truth.
    Return JSON: {"reply": "..."}
    `;

    const res = await callAiForSpecialTask(prompt);
    try {
        const text = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim()).reply;
        replyBox.innerText = `TA: "${text}"`;
    } catch(e) { replyBox.innerText = "TA 露出了诡异的微笑，一言不发。"; }
}

window.g9_pickCard = function(index, cardEl) {
    if(cardEl.classList.contains('revealed')) return;
    
    cardEl.classList.add('revealed');
    const resBox = document.getElementById('g9-result');
    resBox.style.display = 'block';
    
    if (index === g9_jokerIndex) {
        cardEl.innerText = '💣';
        resBox.innerHTML = `<span style="color:#ff4d4f; font-weight:bold; font-size:16px;">💥 嘭！你抽中鬼牌了！</span><br><br>你输了！接受惩罚吧！<br><button class="gc-btn-secondary" onclick="g9_reset()" style="margin-top:10px;">再来</button>`;
        // 揭示其他的
        document.querySelectorAll('.g9-card').forEach(c => c.classList.add('revealed'));
    } else {
        cardEl.innerText = '✨';
        resBox.innerHTML = `<span style="color:#07c160; font-weight:bold;">安全！</span><br>继续抽，或者让 TA 抽！`;
    }
}

/* =========================================
   [GAME 10] 默契翻翻乐
   ========================================= */
let g10_cards = [];
let g10_flipped = [];
let g10_matchedCount = 0;

function g10_reset() {
    document.getElementById('g10-grid').style.display = 'none';
    document.getElementById('g10-result').style.display = 'none';
    document.getElementById('g10-start-btn').style.display = 'block';
    document.getElementById('g10-start-btn').innerText = "让 TA 制作卡片";
}

window.g10_generate = async function() {
    const ai = friendsData[gameAiId];
    const btn = document.getElementById('g10-start-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 绘制记忆卡片中...';
    btn.disabled = true;

    // AI 生成 6 对梗
    const prompt = `
    [System Command: Memory Game]
    You are ${ai.realName}. Generate 6 pairs of short keywords related to couple daily life, internet memes, or your persona.
    Example pair: "我的口头禅" <-> "随便啦". 
    Return JSON ONLY: {"pairs": [{"a":"...", "b":"..."}, ... (6 total)]}
    `;

    const res = await callAiForSpecialTask(prompt);
    btn.style.display = 'none';
    btn.disabled = false;

    try {
        const jsonStr = res.replace(/```json/gi,'').replace(/```/g,'').trim();
        const pairs = JSON.parse(jsonStr).pairs.slice(0, 6); // 确保只要 6 对
        
        g10_cards = [];
        pairs.forEach((p, idx) => {
            g10_cards.push({ id: idx, text: p.a });
            g10_cards.push({ id: idx, text: p.b });
        });
        
        // 打乱数组
        g10_cards.sort(() => Math.random() - 0.5);
        
        g10_flipped = [];
        g10_matchedCount = 0;
        
        const grid = document.getElementById('g10-grid');
        grid.innerHTML = '';
        g10_cards.forEach((c, idx) => {
            grid.innerHTML += `<div class="g10-card" id="g10-c-${idx}" onclick="g10_flip(${idx})"></div>`;
        });
        grid.style.display = 'grid';

    } catch(e) { showToast("生成失败，重试一下"); g10_reset(); }
}

window.g10_flip = function(idx) {
    const el = document.getElementById(`g10-c-${idx}`);
    if (el.classList.contains('flipped') || el.classList.contains('matched') || g10_flipped.length >= 2) return;

    el.classList.add('flipped');
    el.innerText = g10_cards[idx].text;
    g10_flipped.push({ idx: idx, id: g10_cards[idx].id });

    if (g10_flipped.length === 2) {
        setTimeout(g10_checkMatch, 800);
    }
}

function g10_checkMatch() {
    const [c1, c2] = g10_flipped;
    const el1 = document.getElementById(`g10-c-${c1.idx}`);
    const el2 = document.getElementById(`g10-c-${c2.idx}`);

    if (c1.id === c2.id) {
        // 匹配成功
        el1.classList.add('matched');
        el2.classList.add('matched');
        g10_matchedCount++;
        showToast("✨ 懂我！");
        
        if (g10_matchedCount === 6) {
            const resBox = document.getElementById('g10-result');
            resBox.style.display = 'block';
            resBox.innerHTML = `<b style="color:#07c160; font-size:16px;">💯 默契满分！</b><br><br>全部翻出来了！我们真是天生一对。<br><button class="gc-btn-secondary" onclick="g10_reset()" style="margin-top:10px;">再玩一次</button>`;
        }
    } else {
        // 匹配失败
        el1.classList.remove('flipped');
        el2.classList.remove('flipped');
        el1.innerText = '';
        el2.innerText = '';
    }
    
    g10_flipped = [];
}
/* =========================================
   [GAME 11 终极修复版] 萌系双人跳一跳 (Jelly Jump Duel)
   ========================================= */
const G11D_KEY = 'myCoolPhone_jumpDuel_moe_v3';
let g11dData = {
  high: { distance: 0, aiName: 'AI' },
  unlockLevel: 0,
  skin: { me: '🐰', ai: '🐻' } 
};
let g11dState = null;
let g11dLastRace = null;
let g11dAnim = null;

const G11D_SKINS = ['🐰','🐻','🐥','🐸','🐙','👻','💖','🍓']; 
const G11D_UNLOCKS = [0, 0, 30, 80, 150, 250, 400, 600];

function g11dLoad() { try { const s = localStorage.getItem(G11D_KEY); if(s) g11dData = JSON.parse(s); } catch(e){} }
function g11dSave() { localStorage.setItem(G11D_KEY, JSON.stringify(g11dData)); }

function g11dRenderChips(role) {
  const box = document.getElementById(role === 'me' ? 'g11d-me-chips' : 'g11d-ai-chips');
  if(!box) return;
  box.innerHTML = '';
  G11D_SKINS.forEach((s, i) => {
    const limit = G11D_UNLOCKS[i];
    const isLocked = g11dData.high.distance < limit; 
    const div = document.createElement('div');
    div.className = 'g11d-chip' + (isLocked ? ' locked' : '') + ((g11dData.skin[role] === s) ? ' active' : '');
    div.innerText = s;
    if (isLocked) div.title = `达到 ${limit}m 解锁`;
    
    div.onclick = () => {
      if(isLocked) { showToast(`历史最高达到 ${limit}m 才能解锁哦！`); return; }
      g11dData.skin[role] = s;
      g11dSave();
      g11dRenderChips('me'); g11dRenderChips('ai');
    };
    box.appendChild(div);
  });
}

// 确保结果弹窗容器存在
function ensureResultOverlay() {
    let overlay = document.getElementById('g11-result-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'g11-result-overlay';
        overlay.innerHTML = `<div class="g11-result-modal" id="g11-result-modal-inner"></div>`;
        document.getElementById('gc-view-jump').appendChild(overlay);
    }
    overlay.style.display = 'none';
}

window.g11_reset = function() {
  if (g11dAnim) cancelAnimationFrame(g11dAnim);
  g11dState = null;
  g11dLoad();
  ensureResultOverlay();

  document.getElementById('g11d-prep').style.display = 'block';
  document.getElementById('g11d-arena').style.display = 'none';

  const aiName = (friendsData[gameAiId]?.remark || friendsData[gameAiId]?.realName || 'AI');
  document.getElementById('g11d-high-record').innerText = 
    `我和 ${g11dData.high.aiName||aiName} 最高跳到了 ${Math.floor(g11dData.high.distance||0)}m`;
  
  document.getElementById('g11d-ai-name').innerText = aiName;
  g11dRenderChips('me');
  g11dRenderChips('ai');
};

// --- 浮动文字特效工具 ---
function spawnFloatingText(L, x, y, text, color) {
    L.texts.push({x, y, text, color, life: 50, maxLife: 50});
}

function g11dMakeLane(canvasId, role) {
  const c = document.getElementById(canvasId);
  const dpr = window.devicePixelRatio || 2; 
  const rect = c.getBoundingClientRect();
  c.width = rect.width * dpr;
  c.height = rect.height * dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);

  return {
    role, canvas: c, ctx,
    w: rect.width, h: rect.height,
    groundY: rect.height - 35, 
    cameraX: 0, score: 0, dead: false, hold: false,
    particles: [], texts: [], 
    passedAi: false, combo: 0, // 连击数
    p: { 
      x: 60, y: rect.height - 35, vx: 0, vy: 0, 
      charge: 0, overchargeTimer: 0, // 腿麻计时器
      state: 'idle', scaleY: 1, scaleX: 1
    },
    segs: [
      { x: 0, w: 200, type: 'grass', landed: true },
      { x: 280, w: 120, type: 'cake', landed: false }
    ],
    nextX: 480, aiTimer: 0, targetCharge: 0, bgType: 0 
  };
}

window.g11_startWithAI = async function() {
  document.getElementById('g11d-prep').style.display = 'none';
  document.getElementById('g11d-arena').style.display = 'flex';
  ensureResultOverlay();

  const aiName = (friendsData[gameAiId]?.remark || friendsData[gameAiId]?.realName || 'AI');
  g11dState = {
    running: true, 
    gameOverTriggered: false, 
    aiDeathX: null, // 记录 AI 死亡的 X 坐标
    me: g11dMakeLane('g11d-canvas-me', 'me'),
    ai: g11dMakeLane('g11d-canvas-ai', 'ai'),
    aiName
  };
  g11dLoop();
};
// ↓↓↓ 把下面这段补回去 ↓↓↓
function g11dLoop() {
  if (!g11dState?.running) return;

  g11dUpdate(g11dState.me);
  g11dUpdate(g11dState.ai);
  
  g11dDraw(g11dState.me);
  g11dDraw(g11dState.ai);

  // 【核心规则】只要我死了，游戏就直接结束
  if (g11dState.me.dead && !g11dState.gameOverTriggered) {
    g11dState.gameOverTriggered = true;
    setTimeout(g11dGameOver, 600); 
  }

  if (g11dState.running) {
    g11dAnim = requestAnimationFrame(g11dLoop);
  }
}

window.g11d_holdStart = function() {
  if (!g11dState?.running || g11dState.me.dead) return;
  g11dState.me.hold = true; 
};
window.g11d_holdEnd = function() {
  if (!g11dState?.running || g11dState.me.dead) return;
  g11dState.me.hold = false;
};

function g11dJump(L) {
  const p = L.p;
  const power = Math.min(p.charge, 100);
  p.state = 'jump';
  
  // 【彩蛋：腿蹲麻了】如果满蓄力保持太久(超过 40 帧)，跳跃力大减！
  if (p.overchargeTimer > 40) {
      p.vx = (power / 25) + 1.0; 
      p.vy = -(power / 20 + 3.0);
      spawnFloatingText(L, p.x, p.y - 30, "💢腿麻了!", "#ff4d4f");
      if(navigator.vibrate && L.role === 'me') navigator.vibrate([50, 50, 50]);
  } else {
      p.vx = (power / 18) + 1.5; 
      p.vy = -(power / 15 + 4.5);
  }
  
  p.charge = 0;
  p.overchargeTimer = 0; // 重置
  p.scaleY = 1.2; p.scaleX = 0.8;
}

function g11dUpdate(L) {
  const p = L.p;
  if (L.dead) return; 

  // ==== 状态机 ====
  if (p.state === 'idle') {
    if (L.role === 'me' && L.hold) {
      p.state = 'charge';
    } else if (L.role === 'ai') {
      L.aiTimer++;
      // --- 修改：增加 AI 落地后的发呆时间 (大约 1.5秒 ~ 2.5秒) ---
      if (L.aiTimer > 80 + Math.random() * 60) { 
        p.state = 'charge';
        const nextPlat = L.segs.find(s => s.x > p.x + 20);
        if (nextPlat) {
            const targetX = nextPlat.x + nextPlat.w * 0.5;
            const dist = targetX - p.x;
            
            // 【修正：更精确的物理抛物线力度估算】
            let neededCharge = dist * 0.33 + (Math.random() * 6 - 3); 
            
            // 【修正：5% 的小概率 AI 会走神，故意蓄力过猛导致腿麻】
            if (Math.random() < 0.05) {
                neededCharge = 150; 
            }
            L.targetCharge = Math.max(10, neededCharge); 
        } else {
            L.targetCharge = 50;
        }
      }
    }
  }

  if (p.state === 'charge') {
    // 蓄力逻辑与腿麻计时
    if (p.charge >= 100) {
        p.overchargeTimer++;
        p.x += (Math.random() * 2 - 1); // 蓄力满时发抖
    }

    if (L.role === 'me') {
      if (L.hold) p.charge = Math.min(100, p.charge + 0.8); 
      else g11dJump(L); 
    } else if (L.role === 'ai') {
      // --- 修改：降低 AI 的蓄力速度 (从 0.6 降到 0.35)，让它按得舒缓一点 ---
      p.charge = Math.min(100, p.charge + 0.35); 
      // 达到目标力度，或者蓄力过头导致腿麻计时超过45帧，都会强制起跳
      if (p.charge >= Math.min(100, L.targetCharge) && (L.targetCharge <= 100 || p.overchargeTimer > 45)) { 
          g11dJump(L); 
          L.aiTimer = 0; 
      }
    }
    p.scaleY = 1 - (p.charge / 200); p.scaleX = 1 + (p.charge / 250);
  }

  // ==== 物理与彩蛋 ====
  if (p.state === 'jump' || p.state === 'fall') {
    p.vy += 0.5; p.x += p.vx; p.y += p.vy;
    p.scaleX += (1 - p.scaleX) * 0.1; p.scaleY += (1 - p.scaleY) * 0.1;

    // 【彩蛋：火焰尾迹】Combo >= 2 时，跳跃拖拽火焰
    if (L.combo >= 2 && p.state === 'jump' && Math.random() > 0.3) {
        g11dAddParticles(L, p.x, p.y + 10, 'fire');
    }

    if (p.vy > 0 && p.y >= L.groundY) {
      const targetPlatform = L.segs.find(s => p.x >= s.x && p.x <= s.x + s.w);
      if (targetPlatform) {
        if (targetPlatform.type === 'spring') {
            p.vy = -12; p.vx = 5; p.state = 'jump';
            spawnFloatingText(L, p.x, p.y - 20, "BOING!🚀", "#ff7e67");
            g11dAddParticles(L, p.x, p.y, 'star');
        } else if (targetPlatform.type === 'cloud') {
            p.vy = -15; p.vx = 4; p.state = 'jump';
            spawnFloatingText(L, p.x, p.y - 30, "☁️腾云驾雾", "#40a9ff");
            g11dAddParticles(L, p.x, p.y, 'dust');
        } else if (targetPlatform.type === 'portal') {
            p.x += 400; // 瞬间传送
            p.vy = -6; p.state = 'jump'; L.score += 100;
            spawnFloatingText(L, p.x - 400, p.y - 30, "🌀空间跃迁!", "#b37feb");
            g11dAddParticles(L, p.x - 400, p.y, 'portal');
        } else {
            p.y = L.groundY; p.vy = 0; p.vx = 0; p.state = 'idle';
            p.scaleY = 0.7; p.scaleX = 1.3;
            g11dAddParticles(L, p.x, p.y, 'dust');
            
            if (!targetPlatform.landed) {
                targetPlatform.landed = true;
                const center = targetPlatform.x + targetPlatform.w / 2;
                if (Math.abs(p.x - center) < 15) {
                    L.combo++; L.score += L.combo * 15;
                    spawnFloatingText(L, p.x, p.y - 40, `PERFECT x${L.combo}🔥`, "#f59e0b");
                    g11dAddParticles(L, p.x, p.y, 'star');
                    if(navigator.vibrate && L.role === 'me') navigator.vibrate(20);
                } else {
                    L.combo = 0; // 断连
                }
            }
        }
      } else { p.state = 'fall'; }
    }
  }
  
  if (p.y > L.h + 60) {
      L.dead = true;
      if (L.role === 'ai') {
          g11dState.aiDeathX = p.x; 
          spawnFloatingText(L, p.x, L.h - 20, "我先寄了👻", "#ff4d4f");
      }
  }

  if (p.state === 'idle') { p.scaleX += (1 - p.scaleX) * 0.2; p.scaleY += (1 - p.scaleY) * 0.2; }

  // ==== 环境更新 ====
  const targetCam = p.x - 70;
  if (targetCam > L.cameraX) L.cameraX += (targetCam - L.cameraX) * 0.1;

  if (L.role === 'me' && g11dState.aiDeathX && p.x > g11dState.aiDeathX && !L.passedAi) {
      L.passedAi = true; spawnFloatingText(L, p.x, p.y - 50, "超越 TA 啦!🔥", "#ff7e67");
  }

  // 生成新地图
  if (L.segs[L.segs.length-1].x - L.cameraX < L.w) {
    const gap = 40 + Math.random() * 60; const w = 50 + Math.random() * 60;   
    const rand = Math.random();
    let type = 'grass';
    if (rand > 0.98) type = 'portal';       // 2% 传送门
    else if (rand > 0.90) type = 'cloud';   // 8% 云朵
    else if (rand > 0.75) type = 'spring';  // 15% 弹簧
    else if (rand > 0.40) type = 'cake';    // 35% 蛋糕
    L.segs.push({ x: L.nextX, w, type, amber: Math.random() > 0.5, landed: false }); 
    L.nextX += w + gap;
  }
  
  L.segs.forEach(s => {
    if (s.amber && !s.eaten && p.x > s.x && p.x < s.x + s.w && Math.abs(p.y - (L.groundY - 30)) < 30) {
        s.eaten = true; L.score += 15; g11dAddParticles(L, p.x, p.y - 20, 'star');
    }
  });

  const distScore = Math.floor(p.x / 40); 
  const scoreEl = document.getElementById(L.role === 'me' ? 'g11d-me-score' : 'g11d-ai-score');
  if(scoreEl) scoreEl.innerText = (distScore + L.score) + 'm';
  if (distScore > 80) L.bgType = 1; if (distScore > 200) L.bgType = 2; 
}
function g11dDraw(L) {
  const ctx = L.ctx; const w = L.w; const h = L.h;
  
  // === 1. 高级清透风动态背景 (带视差滚动) ===
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  
  if (L.bgType === 0) { 
      // 【阶段1：初晨棉花糖】干净的婴儿蓝 -> 浅樱花粉
      grad.addColorStop(0, '#e0f2fe'); 
      grad.addColorStop(1, '#fff1f2'); 
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
      
      // 漂浮的厚涂白云
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      for(let i=0; i<3; i++) {
          let cx = (w + i * 150 - (L.cameraX * 0.2)) % (w * 2) - 50;
          let cy = 50 + i * 40;
          ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI*2);
          ctx.arc(cx+25, cy-10, 25, 0, Math.PI*2);
          ctx.arc(cx+50, cy, 15, 0, Math.PI*2); ctx.fill();
      }
  } 
  else if (L.bgType === 1) { 
      // 【阶段2：橘子海晚霞】柔和的香芋紫 -> 暖桃色
      grad.addColorStop(0, '#e9d5ff'); 
      grad.addColorStop(1, '#fde047'); 
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
      
      // 朦胧发光的落日
      let sunX = (w * 0.8) - ((L.cameraX * 0.1) % w);
      let sunGrad = ctx.createRadialGradient(sunX, h*0.4, 10, sunX, h*0.4, 80);
      sunGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
      sunGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = sunGrad; ctx.beginPath(); ctx.arc(sunX, h*0.4, 80, 0, Math.PI*2); ctx.fill();
      
      // 傍晚的微星
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      for(let i=0; i<8; i++) {
          let sx = (i * 80 + L.cameraX * 0.05) % w;
          ctx.beginPath(); ctx.arc(sx, 30 + (i*50)%100, 1.5, 0, Math.PI*2); ctx.fill();
      }
  } 
  else { 
      // 【阶段3：魔法星夜】深靛蓝 -> 浅紫藤色
      grad.addColorStop(0, '#1e1b4b'); 
      grad.addColorStop(1, '#a78bfa'); 
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
      
      // 鹅黄色的弯月
      let moonX = (w * 0.8) - ((L.cameraX * 0.05) % w);
      ctx.fillStyle = '#fef08a';
      ctx.beginPath(); ctx.arc(moonX, 80, 25, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#1e1b4b'; // 挖空成弯月
      ctx.beginPath(); ctx.arc(moonX-8, 75, 22, 0, Math.PI*2); ctx.fill();
      
      // 繁星闪烁 (带呼吸灯效果)
      for(let i=0; i<15; i++) {
          let sx = (i * 70 - L.cameraX * 0.1) % w;
          if (sx < 0) sx += w;
          let sy = (i * 37) % (h * 0.6);
          ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + (Math.sin(Date.now()*0.003 + i)*0.5)})`;
          ctx.beginPath(); ctx.arc(sx, sy, (i%2)+1, 0, Math.PI*2); ctx.fill();
      }
  } 

  ctx.save(); ctx.translate(-L.cameraX, 0);
  
  // === 2. 马卡龙厚涂风跳台 (2.5D 分层渲染) ===
  L.segs.forEach(s => {
    const py = L.groundY; 
    const ph = h - py;
    
    if (s.type === 'spring') {
        // 弹簧垫：蜜桃粉色果冻垫
        ctx.fillStyle = '#fca5a5'; ctx.fillRect(s.x+4, py+12, s.w-8, ph); // 阴影底座
        ctx.fillStyle = '#fecaca'; roundRect(ctx, s.x+2, py+6, s.w-4, 16, 8); ctx.fill(); // 过渡层
        ctx.fillStyle = '#fee2e2'; roundRect(ctx, s.x, py, s.w, 12, 6); ctx.fill(); // 亮面
        ctx.fillStyle = '#f87171'; ctx.font = '14px Arial'; ctx.fillText('⏫', s.x + s.w/2 - 7, py + 11);
    } 
    else if (s.type === 'cloud') {
        // 软绵绵云朵：自带高光的半透明质感
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath(); ctx.arc(s.x + 15, py + 10, 15, 0, Math.PI*2);
        ctx.arc(s.x + s.w - 15, py + 10, 15, 0, Math.PI*2);
        ctx.arc(s.x + s.w/2, py + 5, 20, 0, Math.PI*2); ctx.fill();
        ctx.fillRect(s.x + 15, py + 10, s.w - 30, 20);
        ctx.fillStyle = '#e0f2fe'; // 浅蓝色微高光
        ctx.beginPath(); ctx.arc(s.x + s.w/2, py + 15, 8, 0, Math.PI*2); ctx.fill();
    } 
    else if (s.type === 'portal') {
        // 魔法传送环：优雅星环
        ctx.fillStyle = 'rgba(196, 181, 253, 0.4)'; 
        ctx.beginPath(); ctx.ellipse(s.x + s.w/2, py + 10, s.w/2 + 5, 12, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#a78bfa'; 
        ctx.beginPath(); ctx.ellipse(s.x + s.w/2, py + 10, s.w/2, 8, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#2e1065'; 
        ctx.beginPath(); ctx.ellipse(s.x + s.w/2, py + 10, s.w/3, 4, 0, 0, Math.PI*2); ctx.fill();
    } 
    else if (s.type === 'cake') {
        // 草莓白巧小蛋糕：双层奶油风
        ctx.fillStyle = '#fbcfe8'; ctx.fillRect(s.x+4, py+12, s.w-8, ph); 
        ctx.fillStyle = '#fdf2f8'; roundRect(ctx, s.x+2, py+6, s.w-4, 16, 8); ctx.fill(); 
        ctx.fillStyle = '#ffffff'; roundRect(ctx, s.x, py, s.w, 14, 6); ctx.fill(); 
        // 糖碎点缀
        const colors = ['#f472b6', '#60a5fa', '#fbbf24'];
        for(let i=0; i<3; i++) {
            ctx.fillStyle = colors[i];
            ctx.beginPath(); ctx.arc(s.x + 15 + i*15, py+6, 2, 0, Math.PI*2); ctx.fill();
        }
    }
    else {
        // 默认草地：薄荷绿马卡龙方块
        ctx.fillStyle = '#99f6e4'; ctx.fillRect(s.x+4, py+12, s.w-8, ph); 
        ctx.fillStyle = '#bbf7d0'; roundRect(ctx, s.x+2, py+6, s.w-4, 16, 8); ctx.fill(); 
        ctx.fillStyle = '#ccfbf1'; roundRect(ctx, s.x, py, s.w, 14, 6); ctx.fill(); 
        // 极简小白花
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(s.x + s.w - 15, py+6, 3, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(s.x + 15, py+8, 2, 0, Math.PI*2); ctx.fill();
    }
    
    // 金币星星：变成嫩黄色
    if (s.amber && !s.eaten) {
        drawStar(ctx, s.x + s.w/2, py - 25, 5, 8, '#fef08a');
    }
  });

  // === 3. 角色阴影 (增加立体悬浮感) ===
  const p = L.p;
  if (p.state !== 'fall' && !L.dead) {
      ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.beginPath();
      const shadowW = Math.max(4, 18 - (L.groundY - p.y)*0.1);
      ctx.ellipse(p.x, L.groundY, shadowW, shadowW/3, 0, 0, Math.PI * 2); ctx.fill();
  }

  // === 4. 角色渲染 ===
  if (!L.dead) {
      ctx.save(); ctx.translate(p.x, p.y - 14); ctx.scale(p.scaleX, p.scaleY);
      if (p.state === 'charge' && p.overchargeTimer > 0) ctx.translate(Math.random() * 4 - 2, 0);
      ctx.font = '34px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; 
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000000';
      const skin = g11dData.skin[L.role] || (L.role === 'me' ? '🐰' : '🐻');
      // 给Emoji加上一点点阴影，看起来像实体贴纸
      ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
      ctx.fillText(skin, 0, 0); 
      ctx.restore(); 
  }
  
  // === 5. 粒子与优雅文字特效 ===
  L.particles.forEach((pt) => {
      pt.x += pt.vx; pt.y += pt.vy; pt.life--;
      if (pt.type === 'star') drawStar(ctx, pt.x, pt.y, 4, pt.size, `rgba(253, 224, 71, ${pt.life/30})`);
      else if (pt.type === 'fire') {
          ctx.fillStyle = `rgba(244, 114, 182, ${pt.life/15})`; // 粉色火焰
          ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI*2); ctx.fill();
      } else if (pt.type === 'portal') {
          ctx.fillStyle = `rgba(167, 139, 250, ${pt.life/20})`; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI*2); ctx.fill();
      } else { 
          ctx.fillStyle = `rgba(255,255,255,${pt.life/20})`; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI*2); ctx.fill();
      }
  });
  L.particles = L.particles.filter(pt => pt.life > 0);
  
  L.texts.forEach((t) => {
      t.y -= 0.6; t.life--;
      ctx.globalAlpha = t.life / t.maxLife; 
      ctx.fillStyle = t.color;
      ctx.font = 'bold 14px "Montserrat", sans-serif'; ctx.textAlign = 'center';
      ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 6;
      ctx.fillText(t.text, t.x, t.y); ctx.shadowBlur = 0; 
  });
  ctx.globalAlpha = 1.0; L.texts = L.texts.filter(t => t.life > 0);
  
  ctx.restore(); 
}




function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawStar(ctx, cx, cy, spikes, outerRadius, color) {
    let rot = Math.PI / 2 * 3; let x = cx; let y = cy;
    let step = Math.PI / spikes; let innerRadius = outerRadius / 2;
    ctx.beginPath(); ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius; y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y); rot += step;
        x = cx + Math.cos(rot) * innerRadius; y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y); rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}

window.g11dAddParticles = function(L, x, y, type) {
    if (type === 'fire') {
        L.particles.push({
            x: x + (Math.random()*10 - 5), y: y, 
            vx: (Math.random()-0.5), vy: Math.random()*2, // 往上飘
            life: 15, size: 4 + Math.random()*3, type: type
        });
        return;
    }
    if (type === 'portal') {
        for(let i=0; i<15; i++) {
            L.particles.push({
                x: x, y: y, 
                vx: (Math.random()-0.5) * 6, vy: (Math.random()-0.5) * 6, 
                life: 30, size: 2 + Math.random()*4, type: type
            });
        }
        return;
    }
    // 星星和灰尘
    const count = type === 'star' ? 8 : 5;
    for(let i=0; i<count; i++) {
        L.particles.push({
            x: x, y: y, vx: (Math.random()-0.5) * 3, vy: (Math.random()-0.5) * 3,
            life: 20 + Math.random()*15, size: 2 + Math.random()*4, type: type
        });
    }
};

async function g11dGameOver() {
  g11dState.running = false; 

  const meScore = Math.floor(g11dState.me.p.x/40 + g11dState.me.score);
  const aiScore = Math.floor(g11dState.ai.p.x/40 + g11dState.ai.score);
  
  // 判断文案
  let winnerText = '';
  if (!g11dState.ai.dead) {
      winnerText = '💀 惨败！你先掉下去了！';
  } else {
      if (meScore > aiScore) winnerText = '🏆 胜利！你跨过了 TA 的尸体！';
      else if (meScore < aiScore) winnerText = '🥀 惜败... TA 走得更远。';
      else winnerText = '🤝 竟然同归于尽了！(平局)';
  }

  const best = Math.max(meScore, aiScore);
  if (best > (g11dData.high.distance || 0)) {
      g11dData.high.distance = best;
      g11dData.high.aiName = g11dState.aiName;
  }
  g11dSave();

  g11dLastRace = { winner: (meScore>aiScore?'你':g11dState.aiName), meScore, aiScore, aiName: g11dState.aiName };

  const modalInner = document.getElementById('g11-result-modal-inner');
  modalInner.innerHTML = `
    <div style="font-size:20px; font-weight:900; color:#2b2b2b; margin-bottom:5px;">
        ${winnerText}
    </div>
    <div style="font-size:12px; color:#999; margin-bottom:15px;">
        （比赛已结束）
    </div>
    <div style="display:flex; justify-content: space-around; background:#fafafa; border:1px solid #f0f0f0; padding: 15px; border-radius: 16px; margin-bottom: 20px;">
       <div style="text-align:center;">
           <div style="font-size:10px; color:#888;">你的成绩</div>
           <div style="font-size:20px; color:#111; font-weight:bold;">${meScore}m</div>
       </div>
       <div style="width:1px; background:#e0e0e0;"></div>
       <div style="text-align:center;">
           <div style="font-size:10px; color:#888;">TA的成绩</div>
           <div style="font-size:20px; color:#555; font-weight:bold;">${aiScore}m</div>
       </div>
    </div>
    <div style="display:flex; flex-direction:column; gap:10px;">
        <button class="gc-btn-primary" onclick="g11_aiThought()" id="g11-thought-btn">听听TA怎么说</button>
        <div id="g11d-thought" style="font-size:12px; color:#555; background:#f9f9f9; padding:12px; border-radius:12px; border:1px solid #eee; display:none; text-align:left; line-height: 1.5;"></div>
        <button class="gc-btn-secondary" onclick="document.getElementById('g11-result-overlay').style.display='none'; g11_reset()">退出 / 再来一局</button>
    </div>
  `;
  
  document.getElementById('g11-result-overlay').style.display = 'flex';
}




window.g11_aiThought = async function() {
    const btn = document.getElementById('g11-thought-btn');
    const out = document.getElementById('g11d-thought');
    btn.style.display = 'none';
    out.style.display = 'block';
    out.innerHTML = '<i class="fas fa-spinner fa-spin"></i> TA 正在组织语言...';
    
    const p = `
    你是${g11dLastRace.aiName}，刚才和用户玩了“跳一跳”小游戏。
    比赛结果：
    ${g11dLastRace.winner}赢了。我跑了${g11dLastRace.meScore}m，你跑了${g11dLastRace.aiScore}m。
    先掉进悬崖的是：${g11dLastRace.firstDead === 'me' ? '用户' : '你'}。
    
    请根据你的性格（傲娇、温柔或者搞笑），写一句针对这场比赛的赛后感想（中文，30字左右）。不要带引号。
    `;
    const text = await callAiForSpecialTask(p);
    out.innerHTML = text ? `💬 ${text}` : 'TA 好像掉进悬崖爬不上来了...';
    
    if(text) {
        saveMessageToHistory(gameAiId, {
            text: `[跳一跳对抗赛结果: 我 ${g11dLastRace.meScore}m, TA ${g11dLastRace.aiScore}m] \nTA赛后感言：${text}`,
            type: 'received', senderName: g11dLastRace.aiName, isOffline: true
        });
    }
}

// === [新增] AI 伴侣抓娃娃回合 ===
async function g7_triggerAiTurn() {
    const ai = friendsData[gameAiId];
    const tryBtn = document.getElementById('g7-ai-try-btn');
    const reactionBox = document.getElementById('g7-ai-reaction');

    if (!tryBtn || !reactionBox) return;

    tryBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> TA 正在操作...';
    tryBtn.disabled = true;
    reactionBox.style.display = 'none';

    // 模拟AI思考和操作
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 随机决定AI的抓取结果（例如，40%成功率）
    const aiSuccess = Math.random() < 0.4;
    let prizeName = "什么都没抓到";
    if (aiSuccess) {
        const prizes = document.querySelectorAll('.g7-prize');
        if (prizes.length > 0) {
            const randomPrize = prizes[Math.floor(Math.random() * prizes.length)];
            prizeName = randomPrize.dataset.name || "一个好东西";
        }
    }

    // 构建Prompt，让AI描述自己的抓取过程和心情
    const prompt = `
    [System Command: AI Plays Claw Machine]
    You are ${ai.realName}. It's your turn to play the claw machine after the user.
    Your result: You ${aiSuccess ? 'SUCCESSFULLY caught' : 'FAILED to catch'} a prize.
    The prize you aimed for was: "${prizeName}".
    
    Describe what happened from your perspective. Be playful, cute, or tsundere based on your persona.
    Example (Fail): "哼，这破爪子根本没力气！不玩了啦！"
    Example (Win): "看到了吗？我就是天才！这个【${prizeName}】送你了。"
    
    Return JSON ONLY: {"reaction": "your message"}
    `;

    const res = await callAiForSpecialTask(prompt);
    
    reactionBox.style.display = 'block';
    try {
        const data = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim());
        reactionBox.innerHTML = `<b>${ai.remark || ai.realName}:</b><br>"${data.reaction}"`;
    } catch(e) {
        reactionBox.innerText = aiSuccess ? "TA 抓到了一个娃娃，开心地笑了起来。" : "TA 抓空了，气得跺了跺脚。";
    }

    // 恢复按钮
    tryBtn.innerHTML = `让 <span id="g7-ai-partner-name">${ai.remark || ai.realName}</span> 再试一次`;
    tryBtn.disabled = false;
}