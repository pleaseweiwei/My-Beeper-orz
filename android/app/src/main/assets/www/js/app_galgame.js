/* ============================================================
   Galgame 模块 v6.0  — 多槽存档版
   女性向网文风 · 角色弧度成长 · 橙光式6槽存档
   ============================================================ */

/* ── 全局状态 ── */
let galGameState = {
    isActive: false,
    currentWorld: null,
    characters: [],
    myPersona: '',
    mySprite: '',
    affection: {},
    characterArcs: {},
    dialogQueue: [],
    currentDialogIdx: 0,
    history: [],
    manualWorldText: '',
    saveData: null,
    customBg: '',
    bgPreset: 'romantic',
};

/* ── 存档相关常量 ── */
const GAL_SAVES_KEY  = 'gal_game_saves_v5'; // 多槽存档（新）
const GAL_SAVE_KEY   = 'gal_game_save_v4';  // 旧单槽（迁移用）
const GAL_BG_KEY     = 'gal_custom_bg_v1';
const GAL_SCALE_KEY  = 'gal_sprite_scale_v1';
const GAL_MAX_SLOTS  = 6;

/* 背景预设 */
const GAL_BG_PRESETS = {
    romantic: { label:'晨雾薰衣草', css:'linear-gradient(160deg,#e8e5f5 0%,#d8d0f0 40%,#cdc5e8 100%)', textColor: '#333' },
    dream:    { label:'月光蓝紫',   css:'linear-gradient(160deg,#e5eaf8 0%,#c8d0f0 50%,#bbc0ea 100%)', textColor: '#333' },
    celestial:{ label:'云端灰白',   css:'linear-gradient(160deg,#f5f5f8 0%,#e8e8f0 50%,#e0dcea 100%)', textColor: '#444' },
    garden:   { label:'莫兰迪绿',   css:'linear-gradient(160deg,#e8ede5 0%,#d0ddc8 50%,#c8dac0 100%)', textColor: '#444' },
    night:    { label:'深夜深蓝',   css:'linear-gradient(160deg,#0d0d1a 0%,#151230 50%,#1a1a35 100%)', textColor: '#eee' },
    warmth:   { label:'奶茶温柔',   css:'linear-gradient(160deg,#f5f0e8 0%,#ede5d8 50%,#e5d8c8 100%)', textColor: '#555' },
};

/* ── callAI 桥接 ── */
window.callAI = async function(messages, systemPrompt, temperature = 0.85) {
    const settingsJSON = localStorage.getItem('myCoolPhone_aiSettings');
    if (!settingsJSON) throw new Error('未配置 API，请先在 Settings → AI Chat 填写 Key / URL / Model');
    const settings = JSON.parse(settingsJSON);

    let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
    const apiUrl = baseUrl.endsWith('/v1')
        ? `${baseUrl}/chat/completions`
        : `${baseUrl}/v1/chat/completions`;

    const payload = {
        model: settings.model,
        messages: [
            { role: 'system', content: systemPrompt },
            ...messages
        ],
        temperature: parseFloat(temperature || 0.85)
    };

    const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${res.statusText}\n${errText}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    if (!content.trim()) throw new Error('AI 返回内容为空');
    return content;
};

/* ── 初始化 ── */
function openGalgameApp() {
    const el = document.getElementById('galgameApp');
    if (!el) return;
    el.classList.add('active');
    el.classList.add('open');
    galGameState.isActive = true;
    _loadGalBgPref();
    _loadGalSpritePref();
    _migrateOldSave(); // 迁移旧单槽存档
    initGalgameLobby();
}

function closeGalgameApp() {
    const el = document.getElementById('galgameApp');
    if (el) {
        el.classList.remove('active');
        el.classList.remove('open');
    }
    galGameState.isActive = false;
}

/* ── 换页控制 ── */
let _galCurrentPage = 0;

function galGoToPage(page) {
    _galCurrentPage = page;
    const wrapper = document.getElementById('gal-pages-wrapper');
    if (wrapper) {
        wrapper.style.transform = `translateX(-${page * 100}%)`;
    }
    document.querySelectorAll('.gal-page-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === page);
    });
}

function initGalgameLobby() {
    _galCurrentPage = 0;
    galGoToPage(0);
    _renderCharacterSelect();
    _renderBgPresets();
    _renderLobbySaves();   // ← 渲染大厅存档条
    _updateStartBtn();
}

/* ── 大厅存档条 ── */
function _renderLobbySaves() {
    const container = document.getElementById('gal-lobby-saves');
    if (!container) return;
    const saves = _getGalSaves();
    const filled = Object.entries(saves).filter(([, v]) => v);

    if (!filled.length) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    container.innerHTML = `
        <div class="gal-lobby-saves-header">
            <span class="gal-lobby-saves-title">✦ 存档记录 SAVES</span>
            <button class="gal-lobby-saves-load-btn" onclick="openGalSaveModal('load')">
                <i class="fas fa-folder-open"></i> 读取
            </button>
        </div>
        <div class="gal-lobby-saves-strip" id="gal-lobby-saves-strip"></div>
    `;

    const strip = document.getElementById('gal-lobby-saves-strip');
    filled.forEach(([key, save]) => {
        const slotNum = key.replace('slot', '');
        const card = document.createElement('div');
        card.className = 'gal-lobby-save-card';
        card.innerHTML = `
            <div class="glsc-slot">SLOT ${slotNum.padStart(2,'0')}</div>
            <div class="glsc-world">${save.worldName || '未知世界线'}</div>
            <div class="glsc-chars">${save.charNames || ''}</div>
            <div class="glsc-time">${save.savedAt || ''}</div>
        `;
        card.onclick = () => _doLoadFromSlot(parseInt(slotNum));
        strip.appendChild(card);
    });
}

/* ── 角色选择渲染 ── */
function _renderCharacterSelect() {
    const container = document.getElementById('gal-char-select');
    if (!container) return;
    container.innerHTML = '';

    const friends = window.getAllFriends ? window.getAllFriends() : [];
    if (!friends.length) {
        container.innerHTML = '<div style="color:#ccc;font-size: calc(12px * var(--font-scale));padding:16px;text-align:center;">请先在 WeChat 中添加好友</div>';
        return;
    }

    friends.forEach(f => {
        const div = document.createElement('div');
        div.className = 'gal-char-item';
        div.dataset.id = f.id;
        div.innerHTML = `
            <img class="gal-char-avatar" src="${f.avatar || ''}" onerror="this.src=''">
            <div class="gal-char-name">${f.remark || f.realname}</div>
            ${(f.persona || f.description) ? `<div class="gal-char-persona-preview">${(f.persona || f.description).slice(0, 40)}</div>` : ''}
            <button class="gal-char-sprite-btn" onclick="event.stopPropagation(); triggerGalSpriteUpload('${f.id}')">
                <i class="fas fa-image"></i> 立绘
            </button>
        `;
        div.onclick = () => _toggleCharSelect(div, f);
        container.appendChild(div);
    });
}

function _toggleCharSelect(el, friend) {
    if (el.classList.contains('selected')) {
        el.classList.remove('selected');
        galGameState.characters = galGameState.characters.filter(c => c.id !== friend.id);
    } else {
        el.classList.add('selected');
        if (!galGameState.characters.find(c => c.id === friend.id)) {
            galGameState.characters.push(friend);
        }
    }
    _updateStartBtn();
}

function _updateStartBtn() {
    const btn = document.getElementById('gal-start-btn');
    if (!btn) return;
    const hasChars = galGameState.characters.length > 0;
    const hasWorld = !!galGameState.currentWorld || !!galGameState.manualWorldText.trim();
    btn.disabled = !(hasChars && hasWorld);
}

/* ── 立绘上传 ── */
function triggerGalSpriteUpload(charId) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            if (!galGameState._sprites) galGameState._sprites = {};
            galGameState._sprites[charId] = ev.target.result;
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

function handleGalMySprite(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        galGameState.mySprite = ev.target.result;
        const img = document.getElementById('gal-lobby-my-sprite');
        const icon = document.getElementById('gal-lobby-my-sprite-icon');
        if (img) { img.src = ev.target.result; img.style.display = 'block'; }
        if (icon) icon.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

/* ── 背景设置 ── */
function _injectBgSetting() { _renderBgPresets(); }

function _renderBgPresets() {
    const row = document.getElementById('gal-bg-preset-row');
    if (!row) return;
    row.innerHTML = '';

    Object.entries(GAL_BG_PRESETS).forEach(([key, val]) => {
        const btn = document.createElement('button');
        btn.className = 'gal-bg-preset-btn' + (galGameState.bgPreset === key ? ' selected' : '');
        btn.style.background = val.css;
        btn.title = val.label;
        btn.onclick = () => _selectBgPreset(key);
        row.appendChild(btn);
    });

    const uploadBox = document.createElement('div');
    uploadBox.className = 'gal-bg-upload-box';
    uploadBox.title = '上传自定义背景图';
    if (galGameState.customBg) {
        uploadBox.innerHTML = `<img src="${galGameState.customBg}">`;
    } else {
        uploadBox.innerHTML = `<i class="fas fa-image"></i>`;
    }
    uploadBox.onclick = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = e => {
            const f = e.target.files[0]; if (!f) return;
            const r = new FileReader();
            r.onload = ev => {
                galGameState.customBg = ev.target.result;
                galGameState.bgPreset = '';
                _saveGalBgPref();
                _renderBgPresets();
            };
            r.readAsDataURL(f);
        };
        inp.click();
    };
    row.appendChild(uploadBox);
}

function _selectBgPreset(key) {
    galGameState.bgPreset = key;
    galGameState.customBg = '';
    _saveGalBgPref();
    _renderBgPresets();
}

function _saveGalBgPref() {
    try {
        localStorage.setItem(GAL_BG_KEY, JSON.stringify({
            preset: galGameState.bgPreset,
            custom: galGameState.customBg
        }));
    } catch(e) {}
}

function _loadGalBgPref() {
    try {
        const d = JSON.parse(localStorage.getItem(GAL_BG_KEY) || '{}');
        galGameState.bgPreset = d.preset || 'romantic';
        galGameState.customBg = d.custom || '';
    } catch(e) {
        galGameState.bgPreset = 'romantic';
    }
}

function _applyGameBg() {
    const bgEl = document.getElementById('gal-bg');
    if (!bgEl) return;
    if (galGameState.customBg) {
        bgEl.style.backgroundImage = `url('${galGameState.customBg}')`;
        bgEl.style.background = '';
    } else {
        const preset = GAL_BG_PRESETS[galGameState.bgPreset] || GAL_BG_PRESETS.romantic;
        bgEl.style.background = preset.css;
        bgEl.style.backgroundImage = '';
    }
}

/* ── 世界观生成 ── */
async function generateGalWorlds() {
    const btn = document.getElementById('gal-gen-world-btn');
    const cardsArea = document.getElementById('gal-world-cards');
    if (!btn || !cardsArea) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 占卜中...';
    cardsArea.innerHTML = `<div class="gal-world-hint"><i class="fas fa-spinner fa-spin"></i> 正在召唤命运女神...</div>`;

    const myPersona = (document.getElementById('gal-my-persona')?.value || '').trim();

    const systemPrompt = `你是专业的女性向 Galgame 世界观设计师，精通中文网络文学。
请生成3个不同风格的世界线，要求：
1. 风格要多样：如穿越古代宫廷、重生豪门、穿书反派、仙侠修炼、都市学院、末世废土、星际联盟等
2. 文案要有网文感——可以自嘲、有梗、有反差萌，让玩家看到就想进去
3. 每个世界要给玩家一个有趣的初始身份设定（比如：穿成炮灰女配、修仙门派最废柴弟子、豪门联姻代嫁新娘）
4. 语气活泼，可以稍微搞笑，但要让人有代入感
5. 每个世界名称要有记忆点

${myPersona ? `玩家角色参考：${myPersona}` : ''}

严格返回JSON（不要Markdown代码块）：
{"worlds":[
  {"name":"世界名（4-8字，有记忆点）","description":"50-70字，网文感强，交代世界背景和玩家初始处境，带点自嘲或搞笑","icon":"1个相关emoji","tag":"题材分类如：穿越/重生/仙侠/末世等"},
  {"name":"...","description":"...","icon":"...","tag":"..."},
  {"name":"...","description":"...","icon":"...","tag":"..."}
]}`;

    try {
        const raw = await window.callAI([{ role: 'user', content: '请生成三个女性向Galgame世界观' }], systemPrompt, 0.9);
        const cleaned = raw.replace(/```json|```/g, '').trim();
        const json = JSON.parse(cleaned);
        const worlds = json.worlds || [];
        if (!worlds.length) throw new Error('worlds为空');
        _renderWorldCards(worlds);
    } catch(e) {
        console.warn('[GalGame] 世界生成失败:', e);
        cardsArea.innerHTML = `<div class="gal-world-hint" style="color:#e88;">生成失败，请检查 API 设置后重试</div>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-dice"></i> 再次占卜';
    }
}

function _renderWorldCards(worlds) {
    const area = document.getElementById('gal-world-cards');
    if (!area) return;

    const container = document.createElement('div');
    container.className = 'gal-tarot-container';

    worlds.forEach((w, i) => {
        const card = document.createElement('div');
        card.className = 'gal-tarot-card';
        card.innerHTML = `
            <div class="gal-tarot-inner">
                <div class="gal-tarot-front"></div>
                <div class="gal-tarot-back">
                    <div style="font-size: calc(20px * var(--font-scale));">${w.icon || '✨'}</div>
                    <div class="gal-tarot-tag">${w.tag || '未知'}</div>
                    <div class="gal-tarot-name">${w.name}</div>
                    <div class="gal-tarot-desc">${w.description}</div>
                </div>
            </div>
        `;
        card.onclick = () => _selectWorldCard(card, w, worlds);
        setTimeout(() => card.classList.add('flipped'), 200 + i * 150);
        container.appendChild(card);
    });

    area.innerHTML = '';
    area.appendChild(container);
}

function _selectWorldCard(cardEl, world, allWorlds) {
    document.querySelectorAll('.gal-tarot-card').forEach(c => c.style.opacity = '0.4');
    cardEl.style.opacity = '1';
    cardEl.style.transform = 'scale(1.04)';
    galGameState.currentWorld = world;
    galGameState.manualWorldText = '';
    const manualInput = document.getElementById('gal-world-input');
    if (manualInput) manualInput.value = '';
    _updateStartBtn();
}

function onManualWorldInput() {
    const val = (document.getElementById('gal-world-input')?.value || '').trim();
    galGameState.manualWorldText = val;
    if (val) {
        galGameState.currentWorld = null;
        document.querySelectorAll('.gal-tarot-card').forEach(c => c.style.opacity = '0.4');
    }
    _updateStartBtn();
}

/* ── S/L 菜单 ── */
function toggleGalSlMenu(event) {
    event.stopPropagation();
    const menu = document.getElementById('gal-sl-menu');
    if (!menu) return;
    const isVisible = menu.style.display === 'flex';
    menu.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) {
        setTimeout(() => document.addEventListener('click', () => { menu.style.display = 'none'; }, { once: true }), 10);
    }
}

/* ── 开始游戏 ── */
async function startGalgame() {
    if (!galGameState.characters.length) return;
    const worldText = galGameState.manualWorldText.trim()
        || (galGameState.currentWorld ? `${galGameState.currentWorld.name}：${galGameState.currentWorld.description}` : '');
    if (!worldText) return;

    const myPersona = (document.getElementById('gal-my-persona')?.value || '').trim() || '一个普通但内心戏丰富的女孩';
    galGameState.myPersona = myPersona;

    document.getElementById('gal-lobby').style.display = 'none';
    const gameArea = document.getElementById('gal-game-area');
    gameArea.style.display = 'flex';
    _applyGameBg();

    galGameState.affection = {};
    galGameState.characterArcs = {};
    galGameState.history = [];
    galGameState.characters.forEach(c => {
        galGameState.affection[c.realname || c.remark] = 50;
        galGameState.characterArcs[c.realname || c.remark] = {
            newIdentity: '',
            currentMood: '平静',
            relationNote: '初次相识',
            notes: []
        };
    });

    _renderStatusBar();
    showGalLoading(true);

    const charDesc = galGameState.characters.map(c => {
        const name = c.realname || c.remark;
        const persona = c.persona || c.description || '神秘的存在';
        return `【${name}】原始人设：${persona}`;
    }).join('\n');

    const myName = _getMyIdentityName();

    const systemPrompt = `你是女性向 Galgame 的 AI 叙事引擎，专门运行沉浸式恋爱冒险小说。
请严格遵循 JSON 格式输出，不要加任何 Markdown 代码块。

【世界观】
${worldText}

【玩家身份】
姓名：${myName}
性格背景：${myPersona}

【登场角色（原始人设）】
${charDesc}

【核心叙事规则】
1. 每个角色在此世界中会有全新的身份（符合世界观），但性格底色来自原始人设。
2. 角色会有真实的情绪弧度：初始可能冷漠/警惕/傲娇，随剧情进展逐渐变化。
3. 对话要有层次感，不同角色要有鲜明的说话风格（傲娇的不会一开始就热情）。
4. 开场要有网文感：可以抛梗、制造悬念、有反转，但要自然。
5. 允许轻松幽默，但核心情感要真实。

【你的任务】
1. 为每个角色分配世界内的新身份，并描述初始心理状态和与玩家的关系定位。
2. 写一段精彩的开场白（切分为多条对话），要有画面感和代入感。
3. 给出3个有意思的开场选项（影响后续走向）。

【严格JSON格式】
{
  "allocations": [
    {"name":"角色名","newIdentity":"在此世界的新身份（20字内）","initialMood":"初始情绪/状态","relationNote":"与玩家的初始关系"}
  ],
  "dialogues": [
    {"speaker":"旁白","text":"场景描述或剧情推进..."},
    {"speaker":"角色名","text":"台词..."}
  ],
  "options": ["选项1","选项2","选项3"]
}`;

    try {
        const raw = await window.callAI([{ role: 'user', content: '请开始这段冒险。' }], systemPrompt, 0.85);
        const cleaned = raw.replace(/```json|```/g, '').trim();
        const json = JSON.parse(cleaned);

        if (json.allocations) {
            json.allocations.forEach(a => {
                if (galGameState.characterArcs[a.name]) {
                    galGameState.characterArcs[a.name].newIdentity = a.newIdentity || '';
                    galGameState.characterArcs[a.name].currentMood = a.initialMood || '平静';
                    galGameState.characterArcs[a.name].relationNote = a.relationNote || '初次相识';
                }
            });
        }

        galGameState.dialogQueue = json.dialogues || [];
        galGameState.currentDialogIdx = 0;
        galGameState._pendingOptions = json.options || [];

        galGameState.history.push({
            role: 'assistant',
            content: JSON.stringify({ dialogues: json.dialogues, options: json.options })
        });

        showGalLoading(false);
        _showSprites();
        playNextGalDialogue();

    } catch(e) {
        console.error('[GalGame] 开场生成失败:', e);
        showGalLoading(false);
        _showGalDialog('旁白', '命运女神暂时不在线，请稍后再试... (API 连接失败)', true);
    }
}

/* ── 对话推进 ── */
function playNextGalDialogue() {
    const continueIcon = document.getElementById('gal-continue-icon');
    if (continueIcon) continueIcon.style.display = 'none';

    if (galGameState.currentDialogIdx >= galGameState.dialogQueue.length) {
        _showOptions(galGameState._pendingOptions || []);
        return;
    }

    const item = galGameState.dialogQueue[galGameState.currentDialogIdx];
    galGameState.currentDialogIdx++;

    const isNarrator = !item.speaker || item.speaker === '旁白' || item.speaker === 'narration';
    _showGalDialog(item.speaker, item.text, isNarrator);

    if (galGameState.currentDialogIdx < galGameState.dialogQueue.length) {
        if (continueIcon) continueIcon.style.display = 'block';
    } else if (galGameState._pendingOptions?.length) {
        if (continueIcon) continueIcon.style.display = 'block';
    }
}

function _showGalDialog(speaker, text, isNarrator) {
    const nameEl = document.getElementById('gal-speaker-name');
    const textEl = document.getElementById('gal-dialog-text');
    if (!nameEl || !textEl) return;

    if (isNarrator) {
        nameEl.setAttribute('data-narrator', 'true');
        nameEl.innerHTML = '✦ &nbsp;NARRATION';
    } else {
        nameEl.removeAttribute('data-narrator');
        nameEl.innerHTML = `<span style="opacity:0.55;font-size: calc(10px * var(--font-scale));">✿</span>${speaker}`;
    }
    textEl.textContent = '';

    let i = 0;
    const chars = text.split('');
    const interval = setInterval(() => {
        if (i < chars.length) {
            textEl.textContent += chars[i];
            i++;
        } else {
            clearInterval(interval);
            const icon = document.getElementById('gal-continue-icon');
            if (icon) icon.style.display = 'block';
        }
    }, 30);

    _highlightSprite(speaker);
}

/* ── 选项显示 ── */
function _showOptions(options) {
    const area = document.getElementById('gal-options-area');
    const mask = document.getElementById('gal-click-mask');
    if (!area) return;

    if (!options || !options.length) {
        area.style.display = 'none';
        if (mask) mask.style.pointerEvents = 'auto';
        return;
    }

    area.innerHTML = `
        <button class="gal-save-quick-btn" onclick="saveGalgame()">
            <i class="fas fa-save"></i> 存档
        </button>
        <div class="gal-options-heading">· CHOOSE YOUR PATH ·</div>
    `;

    options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'gal-option-btn';
        btn.style.animationDelay = `${i * 0.07}s`;
        btn.textContent = opt;
        btn.onclick = () => handleOptionClick(opt);
        area.appendChild(btn);
    });

    area.style.display = 'flex';
    if (mask) mask.style.pointerEvents = 'none';
}

/* ── 选项点击 ── */
async function handleOptionClick(selectedOption) {
    const area = document.getElementById('gal-options-area');
    if (area) area.style.display = 'none';
    const mask = document.getElementById('gal-click-mask');
    if (mask) mask.style.pointerEvents = 'auto';

    galGameState.history.push({ role: 'user', content: `玩家选择：${selectedOption}` });
    _showGalDialog('旁白', `"${selectedOption}"`, true);

    showGalLoading(true);

    const charStatus = galGameState.characters.map(c => {
        const name = c.realname || c.remark;
        const aff = galGameState.affection[name] || 50;
        const arc = galGameState.characterArcs[name] || {};
        const notes = arc.notes?.slice(-3).join('；') || '无特殊变化';
        return `【${name}】好感度:${aff}/100 | 当前状态:${arc.currentMood || '平静'} | 关系进展:${arc.relationNote || '初识'} | 近期变化:${notes}`;
    }).join('\n');

    const recentHistory = galGameState.history.slice(-12);

    const worldText = galGameState.manualWorldText.trim()
        || (galGameState.currentWorld ? `${galGameState.currentWorld.name}：${galGameState.currentWorld.description}` : '');
    const myName = _getMyIdentityName();

    const systemPrompt = `你是女性向 Galgame 叙事引擎，严格返回JSON（不要Markdown代码块）。

【世界观】${worldText}
【玩家】${myName}（${galGameState.myPersona || ''}）

【当前角色状态】
${charStatus}

【角色成长规则（核心）】
- 角色不是设定机器，他们会随剧情和玩家行为真实变化。
- 好感度变化会影响角色的说话方式、态度和开放程度。
- 如角色经历了重要时刻（初次敞开心扉/发生争吵/共同危险等），要在台词中体现出内心波动。
- 傲娇角色不会立刻变温柔，但内心会有细微松动——请通过行为暗示而非直接宣告。

玩家选择了：「${selectedOption}」

【任务】
1. 根据选择推进剧情（3-5段对话）
2. 调整各角色好感度（-15~+15，要有理由）
3. 如角色有心理/状态变化，在 personality_notes 中记录（简短）
4. 提供3个新选项
5. 判断是否触发结局（正常游戏：false）

【严格JSON格式】
{
  "affection_changes": {"角色名": 变化量},
  "personality_notes": {"角色名": "本回合角色内心/状态的细微变化，10-20字"},
  "dialogues": [{"speaker":"角色名或旁白","text":"内容"}],
  "is_dead": false,
  "ending_name": "",
  "options": ["选项1","选项2","选项3"]
}`;

    try {
        const raw = await window.callAI(recentHistory, systemPrompt, 0.85);
        const cleaned = raw.replace(/```json|```/g, '').trim();
        const json = JSON.parse(cleaned);

        if (json.affection_changes) {
            Object.entries(json.affection_changes).forEach(([name, delta]) => {
                if (galGameState.affection[name] !== undefined) {
                    const old = galGameState.affection[name];
                    galGameState.affection[name] = Math.max(0, Math.min(100, old + delta));
                    if (delta !== 0) {
                        const sign = delta > 0 ? '+' : '';
                        _showAffectionFloat(name, `${sign}${delta}`);
                    }
                }
            });
        }

        if (json.personality_notes) {
            Object.entries(json.personality_notes).forEach(([name, note]) => {
                if (note && galGameState.characterArcs[name]) {
                    galGameState.characterArcs[name].notes.push(note);
                    if (galGameState.characterArcs[name].notes.length > 10) {
                        galGameState.characterArcs[name].notes.shift();
                    }
                    _showArcToast(`✦ ${name} · ${note}`);
                }
            });
        }

        _renderStatusBar();

        galGameState.dialogQueue = json.dialogues || [];
        galGameState.currentDialogIdx = 0;
        galGameState._pendingOptions = json.options || [];

        galGameState.history.push({ role: 'assistant', content: JSON.stringify({ dialogues: json.dialogues, options: json.options }) });

        showGalLoading(false);

        if (json.is_dead || json.ending_name) {
            _showBadEnd(json.ending_name || 'ENDING');
            return;
        }

        playNextGalDialogue();

    } catch(e) {
        console.error('[GalGame] 选项处理失败:', e);
        showGalLoading(false);
        _showGalDialog('旁白', '时间线出现了裂缝... (生成失败，请再试)', true);
        _showOptions(galGameState._pendingOptions || ['继续']);
    }
}

/* ── UI 辅助 ── */
function _renderStatusBar() {
    const bar = document.getElementById('gal-status-bar');
    if (!bar) return;
    bar.innerHTML = '';
    galGameState.characters.forEach(c => {
        const name = c.realname || c.remark;
        const aff = galGameState.affection[name] ?? 50;
        const item = document.createElement('div');
        item.className = 'gal-status-item';
        item.innerHTML = `
            <img class="gal-status-avatar" src="${c.avatar || ''}">
            <div class="gal-status-info">
                <div class="gal-status-name">${name}</div>
                <div class="gal-status-bar-wrap">
                    <div class="gal-status-bar-fill" style="width:${aff}%;"></div>
                </div>
            </div>
            <div class="gal-status-num">${aff}</div>
        `;
        bar.appendChild(item);
    });
}

function _showAffectionFloat(name, text) {
    const gameArea = document.getElementById('gal-game-area');
    if (!gameArea) return;
    const el = document.createElement('div');
    el.className = 'gal-affection-float';
    el.textContent = `${name} ${text}`;
    gameArea.appendChild(el);
    setTimeout(() => el.remove(), 2400);
}

function _showArcToast(text) {
    const gameArea = document.getElementById('gal-game-area');
    if (!gameArea) return;
    const existing = gameArea.querySelector('.gal-arc-toast');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'gal-arc-toast';
    el.textContent = text;
    gameArea.appendChild(el);
    setTimeout(() => el.remove(), 3800);
}

function _showSprites() {
    const leftEl = document.getElementById('gal-sprite-left');
    const rightEl = document.getElementById('gal-sprite-right');
    const container = document.querySelector('.gal-sprites-container');
    if (!leftEl || !rightEl) return;

    const chars = galGameState.characters;
    const isDual = chars.length >= 2;

    if (container) container.classList.toggle('dual', isDual);

    if (chars.length >= 1) {
        const c1 = chars[0];
        const sprite1 = galGameState._sprites?.[c1.id] || c1.avatar || '';
        if (sprite1) { leftEl.src = sprite1; leftEl.classList.add('active'); }
    }
    if (chars.length >= 2) {
        const c2 = chars[1];
        const sprite2 = galGameState._sprites?.[c2.id] || c2.avatar || '';
        if (sprite2) { rightEl.src = sprite2; rightEl.classList.add('active'); }
    }
}

function _highlightSprite(speakerName) {
    const leftEl = document.getElementById('gal-sprite-left');
    const rightEl = document.getElementById('gal-sprite-right');
    if (!leftEl || !rightEl) return;

    const chars = galGameState.characters;
    const c1Name = chars[0] ? (chars[0].realname || chars[0].remark) : '';
    const c2Name = chars[1] ? (chars[1].realname || chars[1].remark) : '';

    if (!speakerName || speakerName === '旁白') {
        leftEl.classList.remove('active', 'dimmed');
        rightEl.classList.remove('active', 'dimmed');
        if (leftEl.src && leftEl.src !== window.location.href) leftEl.classList.add('dimmed');
        if (rightEl.src && rightEl.src !== window.location.href) rightEl.classList.add('dimmed');
        return;
    }

    if (speakerName === c1Name) {
        leftEl.classList.add('active'); leftEl.classList.remove('dimmed');
        rightEl.classList.add('dimmed'); rightEl.classList.remove('active');
    } else if (speakerName === c2Name) {
        rightEl.classList.add('active'); rightEl.classList.remove('dimmed');
        leftEl.classList.add('dimmed'); leftEl.classList.remove('active');
    }
}

function _showBadEnd(endingName) {
    const overlay = document.getElementById('gal-bad-end');
    if (!overlay) return;
    overlay.style.display = 'flex';
    overlay.classList.add('gal-be-animate');
    const titleEl = document.getElementById('gal-be-title');
    const descEl  = document.getElementById('gal-be-desc');
    if (titleEl) titleEl.textContent = endingName.toUpperCase().includes('END') ? endingName : endingName + ' END';
    if (descEl)  descEl.textContent  = endingName;
}

function showGalLoading(show) {
    const el = document.getElementById('gal-loading');
    if (el) el.style.display = show ? 'flex' : 'none';
}

function _getMyIdentityName() {
    if (window.currentIdentity) return window.currentIdentity.name || 'Player';
    const stored = JSON.parse(localStorage.getItem('persona_builder_data') || '{}');
    return stored.pb_name || '你';
}

function _updateGalBg(sceneHint) {
    if (galGameState.customBg) return;
    if (sceneHint) {
        const keywords = sceneHint.toLowerCase();
        if (keywords.includes('夜') || keywords.includes('黑') || keywords.includes('暗')) {
            if (galGameState.bgPreset !== 'night') {
                const bgEl = document.getElementById('gal-bg');
                if (bgEl) bgEl.style.background = GAL_BG_PRESETS.night.css;
            }
        }
    }
}

/* ================================================================
   ★ 多槽存档系统  (橙光风格，6个槽位)
   ================================================================ */

/* -- 底层读写 -- */
function _getGalSaves() {
    try {
        return JSON.parse(localStorage.getItem(GAL_SAVES_KEY) || '{}');
    } catch(e) { return {}; }
}

function _setGalSaves(saves) {
    try {
        localStorage.setItem(GAL_SAVES_KEY, JSON.stringify(saves));
    } catch(e) { alert('存储失败，可能空间不足'); }
}

/* -- 旧存档迁移（只跑一次） -- */
function _migrateOldSave() {
    const saves = _getGalSaves();
    if (saves._migrated) return; // 已迁移过
    const oldRaw = localStorage.getItem(GAL_SAVE_KEY);
    if (oldRaw) {
        try {
            const old = JSON.parse(oldRaw);
            // 找第一个空槽
            for (let i = 1; i <= GAL_MAX_SLOTS; i++) {
                if (!saves[`slot${i}`]) {
                    old.worldName = old.world?.name || (old.manualWorld ? old.manualWorld.slice(0, 12) : '旧存档');
                    old.charNames = '（已迁移）';
                    saves[`slot${i}`] = old;
                    break;
                }
            }
        } catch(e) {}
    }
    saves._migrated = true;
    _setGalSaves(saves);
}

/* -- 存档模态框状态 -- */
let _galSaveModalMode = 'save'; // 'save' | 'load'

/* -- 打开存档/读档模态框 -- */
function openGalSaveModal(mode) {
    _galSaveModalMode = mode;
    const modal = document.getElementById('gal-save-modal');
    const title = document.getElementById('gal-save-modal-title');
    if (!modal) return;
    if (title) title.textContent = mode === 'save' ? '💾  选择存档位' : '📂  读取存档';
    _renderGalSaveSlots();
    modal.classList.add('active');
    // 关闭 S/L 下拉菜单
    const menu = document.getElementById('gal-sl-menu');
    if (menu) menu.style.display = 'none';
}

function closeGalSaveModal() {
    const modal = document.getElementById('gal-save-modal');
    if (modal) modal.classList.remove('active');
}

/* -- 渲染6个槽位卡片 -- */
function _renderGalSaveSlots() {
    const grid = document.getElementById('gal-save-slots-grid');
    if (!grid) return;
    const saves = _getGalSaves();
    grid.innerHTML = '';

    for (let i = 1; i <= GAL_MAX_SLOTS; i++) {
        const save = saves[`slot${i}`];
        const card = document.createElement('div');

        if (save) {
            card.className = 'gal-save-slot-card has-save';
            // 好感度摘要
            const affSummary = save.affection
                ? Object.entries(save.affection).map(([n, v]) => `${n} ${v}`).join(' / ')
                : '';
            card.innerHTML = `
                <div class="gss-header">
                    <span class="gss-num">SLOT ${String(i).padStart(2,'0')}</span>
                    <button class="gss-del-btn" onclick="event.stopPropagation(); deleteGalSlot(${i})" title="删除此存档">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="gss-world">${save.worldName || '未知世界线'}</div>
                <div class="gss-chars"><i class="fas fa-user-friends" style="opacity:.5;font-size: calc(9px * var(--font-scale));"></i> ${save.charNames || '—'}</div>
                ${affSummary ? `<div class="gss-aff">${affSummary}</div>` : ''}
                <div class="gss-time"><i class="fas fa-clock" style="opacity:.4;font-size: calc(9px * var(--font-scale));"></i> ${save.savedAt || ''}</div>
                <div class="gss-action-label">${_galSaveModalMode === 'save' ? '覆盖此槽' : '读取继续'}</div>
            `;
            card.onclick = () => _onSlotClick(i);
        } else {
            card.className = 'gal-save-slot-card empty';
            if (_galSaveModalMode === 'load') {
                card.style.opacity = '0.35';
                card.style.pointerEvents = 'none';
            }
            card.innerHTML = `
                <div class="gss-header">
                    <span class="gss-num">SLOT ${String(i).padStart(2,'0')}</span>
                </div>
                <div class="gss-empty-icon"><i class="fas fa-plus-circle"></i></div>
                <div class="gss-empty-text">${_galSaveModalMode === 'save' ? '新建存档' : '空档位'}</div>
            `;
            if (_galSaveModalMode === 'save') {
                card.onclick = () => _onSlotClick(i);
            }
        }

        grid.appendChild(card);
    }
}

/* -- 槽位点击处理 -- */
function _onSlotClick(slotIdx) {
    if (_galSaveModalMode === 'save') {
        const saves = _getGalSaves();
        if (saves[`slot${slotIdx}`]) {
            if (!confirm(`确定覆盖槽位 ${slotIdx} 的存档吗？`)) return;
        }
        _doSaveToSlot(slotIdx);
    } else {
        _doLoadFromSlot(slotIdx);
    }
}

/* -- 实际存档逻辑 -- */
function _doSaveToSlot(slotIdx) {
    const worldName = galGameState.currentWorld?.name
        || (galGameState.manualWorldText ? galGameState.manualWorldText.slice(0, 14) : '自定义世界');
    const charNames = galGameState.characters.map(c => c.realname || c.remark).join('、');

    // 对话预览（取最后一条旁白/对话内容）
    let dialogPreview = '';
    const lastHist = galGameState.history.slice(-1)[0];
    if (lastHist) {
        try {
            const j = JSON.parse(lastHist.content);
            const dlgs = j.dialogues || [];
            if (dlgs.length) dialogPreview = dlgs[dlgs.length - 1].text?.slice(0, 24) || '';
        } catch(e) {}
    }

    const data = {
        world:         galGameState.currentWorld,
        manualWorld:   galGameState.manualWorldText,
        characters:    galGameState.characters.map(c => c.id),
        affection:     galGameState.affection,
        characterArcs: galGameState.characterArcs,
        history:       galGameState.history.slice(-20),
        myPersona:     galGameState.myPersona,
        bgPreset:      galGameState.bgPreset,
        savedAt:       new Date().toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }),
        worldName,
        charNames,
        dialogPreview,
    };

    const saves = _getGalSaves();
    saves[`slot${slotIdx}`] = data;
    _setGalSaves(saves);

    closeGalSaveModal();
    _showArcToast(`✦ 已保存至槽位 ${slotIdx} ✦`);
}

/* -- 实际读档逻辑 -- */
function _doLoadFromSlot(slotIdx) {
    const saves = _getGalSaves();
    const data = saves[`slot${slotIdx}`];
    if (!data) { alert('该档位没有存档！'); return; }

    galGameState.currentWorld    = data.world || null;
    galGameState.manualWorldText = data.manualWorld || '';
    galGameState.affection       = data.affection || {};
    galGameState.characterArcs   = data.characterArcs || {};
    galGameState.history         = data.history || [];
    galGameState.myPersona       = data.myPersona || '';
    galGameState.bgPreset        = data.bgPreset || 'romantic';

    const friends = window.getAllFriends ? window.getAllFriends() : [];
    galGameState.characters = (data.characters || [])
        .map(id => friends.find(f => f.id === id))
        .filter(Boolean);

    // 切换到游戏区
    const lobby = document.getElementById('gal-lobby');
    const gameArea = document.getElementById('gal-game-area');
    if (lobby) lobby.style.display = 'none';
    if (gameArea) gameArea.style.display = 'flex';

    _applyGameBg();
    _renderStatusBar();
    _showSprites();

    // 恢复最后一段对话选项
    if (data.history && data.history.length > 0) {
        const last = data.history[data.history.length - 1];
        try {
            const lastJson = JSON.parse(last.content);
            galGameState.dialogQueue    = lastJson.dialogues || [];
            galGameState._pendingOptions = lastJson.options || [];
            galGameState.currentDialogIdx = 0;
            _showGalDialog('旁白', `✦ 读取槽位 ${slotIdx} · ${data.savedAt || ''} ✦`, true);
            setTimeout(() => _showOptions(galGameState._pendingOptions), 1200);
        } catch(e) {
            _showGalDialog('旁白', `✦ 存档已读取，命运线继续... ✦`, true);
        }
    } else {
        _showGalDialog('旁白', `✦ 存档已读取，命运线继续... ✦`, true);
    }

    closeGalSaveModal();
}

/* -- 删除槽位 -- */
function deleteGalSlot(slotIdx) {
    if (!confirm(`确定删除槽位 ${slotIdx} 的存档？此操作不可撤销。`)) return;
    const saves = _getGalSaves();
    delete saves[`slot${slotIdx}`];
    _setGalSaves(saves);
    _renderGalSaveSlots();  // 刷新模态框
    _renderLobbySaves();    // 刷新大厅
}

/* ── 对外保留的存档/读档入口（供 HTML onclick 调用） ── */
function saveGalgame() {
    openGalSaveModal('save');
}

function loadGalgame() {
    openGalSaveModal('load');
}

function restartGalgame() {
    const menu = document.getElementById('gal-sl-menu');
    if (menu) menu.style.display = 'none';
    if (!confirm('重新开始将丢失当前进度（不影响存档），确定？')) return;

    galGameState.affection = {};
    galGameState.characterArcs = {};
    galGameState.history = [];
    galGameState.dialogQueue = [];
    galGameState._pendingOptions = [];

    document.getElementById('gal-game-area').style.display = 'none';
    document.getElementById('gal-lobby').style.display = 'flex';
    document.getElementById('gal-bad-end').style.display = 'none';
    document.getElementById('gal-options-area').style.display = 'none';
    document.getElementById('gal-status-bar').innerHTML = '';

    const leftEl = document.getElementById('gal-sprite-left');
    const rightEl = document.getElementById('gal-sprite-right');
    const container = document.querySelector('.gal-sprites-container');
    if (leftEl)  { leftEl.src = '';  leftEl.className = 'gal-sprite-img'; }
    if (rightEl) { rightEl.src = ''; rightEl.className = 'gal-sprite-img'; }
    if (container) container.classList.remove('dual');

    _renderLobbySaves(); // 重新回到大厅后刷新存档条
}

/* ── 立绘缩放设置 ── */
function applyGalSpriteScale(val) {
    const v = parseInt(val) || 75;
    const container = document.getElementById('galgameApp');
    if (container) container.style.setProperty('--gal-sprite-scale', v);
    const label = document.getElementById('gal-sprite-scale-val');
    if (label) label.textContent = v + '%';
    try { localStorage.setItem(GAL_SCALE_KEY, v); } catch(e) {}
}

function _loadGalSpritePref() {
    const saved = parseInt(localStorage.getItem(GAL_SCALE_KEY)) || 75;
    const slider = document.getElementById('gal-sprite-scale-slider');
    const label  = document.getElementById('gal-sprite-scale-val');
    if (slider) slider.value = saved;
    if (label)  label.textContent = saved + '%';
    const container = document.getElementById('galgameApp');
    if (container) container.style.setProperty('--gal-sprite-scale', saved);
}
