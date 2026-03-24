/* =========================================
   [NEW] 人设研究所 (Persona Builder) 完整逻辑
   ========================================= */

function pbQueueUiWrite(fn) {
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => requestAnimationFrame(fn));
    } else {
        setTimeout(fn, 16);
    }
}

function pbSetSoftDisplay(el, visible, displayMode = 'block') {
    if (!el) return;
    if (visible) {
        el.hidden = false;
        el.style.display = displayMode;
    } else {
        el.hidden = true;
        el.style.display = 'none';
    }
}

window.openPersonaBuilder = function() {
    const app = document.getElementById('personaBuilderApp');
    if (!app) return;
    
    // 加载当前身份数据
    loadDataIntoBuilder();
    // 渲染世界书下拉框
    renderPbWorldbooks();
    
    app.classList.add('open');
    switchPbTab('core');
};

window.closePersonaBuilder = function() {
    document.getElementById('personaBuilderApp').classList.remove('open');
};

// Tab 切换逻辑
window.switchPbTab = function(tabName) {
    document.querySelectorAll('.pb-tab').forEach(t => t.classList.remove('active'));

    if (typeof event !== 'undefined' && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    pbQueueUiWrite(() => {
        document.querySelectorAll('.pb-content').forEach(c => pbSetSoftDisplay(c, false));
        pbSetSoftDisplay(document.getElementById(`pb-tab-${tabName}`), true, 'block');
    });
};

// 下拉框联动自定义输入框
window.toggleCustomInput = function(selectId, customInputId) {
    const sel = document.getElementById(selectId);
    const inp = document.getElementById(customInputId);
    if(sel.value === 'custom') {
        pbQueueUiWrite(() => {
            pbSetSoftDisplay(inp, true, 'block');
            inp.focus();
        });
    } else {
        pbQueueUiWrite(() => {
            pbSetSoftDisplay(inp, false);
        });
    }
};

// 1. 读取数据填充表单
function loadDataIntoBuilder() {
    const p = personasMeta[currentPersonaId];
    if (!p) return;
    const d = p.pbData || {};

    // 模块一
    document.getElementById('pb-name').value = p.name || '';
    setSelectOrCustom('pb-gender', 'pb-gender-custom', d.gender);
    setSelectOrCustom('pb-bio-sex', 'pb-bio-sex-custom', d.bioSex);
    document.getElementById('pb-age-num').value = d.ageNum || '';
    if(d.ageStage) document.getElementById('pb-age-stage').value = d.ageStage;
    document.getElementById('pb-race').value = d.race || '';
    document.getElementById('pb-faction').value = d.faction || '';
    document.getElementById('pb-keywords').value = d.keywords || '';

    // 模块二
    document.getElementById('pb-aura').value = d.aura || '';
    document.getElementById('pb-height').value = d.height || '';
    document.getElementById('pb-weight').value = d.weight || '';
    setSelectOrCustom('pb-body-type', 'pb-body-type-custom', d.bodyType);
    document.getElementById('pb-body-ratio').value = d.bodyRatio || '';
    document.getElementById('pb-posture').value = d.posture || '';
    document.getElementById('pb-bone-spec').value = d.boneSpec || '';
    if(d.faceShape) document.getElementById('pb-face-shape').value = d.faceShape;
    document.getElementById('pb-eyes').value = d.eyes || '';
    document.getElementById('pb-skin-hair').value = d.skinHair || '';
    document.getElementById('pb-skin-spec').value = d.skinSpec || '';
    document.getElementById('pb-sensory').value = d.sensory || '';

    // 模块三
    document.getElementById('pb-persona-out').value = d.personaOut || '';
    document.getElementById('pb-persona-in').value = d.personaIn || '';
    document.getElementById('pb-mbti').value = d.mbti || '';
    document.getElementById('pb-enneagram').value = d.enneagram || '';
    document.getElementById('pb-goal').value = d.goal || '';
    document.getElementById('pb-fear').value = d.fear || '';
    document.getElementById('pb-conflict').value = d.conflict || '';
    document.getElementById('pb-weakness').value = d.weakness || '';
    document.getElementById('pb-backstory').value = d.backstory || '';

    // 模块四
    document.getElementById('pb-emo-joy').value = d.emoJoy || '';
    document.getElementById('pb-emo-anger').value = d.emoAnger || '';
    document.getElementById('pb-emo-sorrow').value = d.emoSorrow || '';
    document.getElementById('pb-emo-pleasure').value = d.emoPleasure || '';
    document.getElementById('pb-health').value = d.health || '';
    document.getElementById('pb-stimulus').value = d.stimulus || '';
    document.getElementById('pb-habit-action').value = d.habitAction || '';
    document.getElementById('pb-habit-life').value = d.habitLife || '';
    document.getElementById('pb-habit-diet').value = d.habitDiet || '';
}

function setSelectOrCustom(selectId, customId, val) {
    if(!val) return;
    const sel = document.getElementById(selectId);
    const inp = document.getElementById(customId);
    let found = false;
    for(let i=0; i<sel.options.length; i++) {
        if(sel.options[i].value === val) { found = true; break; }
    }
    if(found) {
        sel.value = val;
        pbSetSoftDisplay(inp, false);
    } else {
        sel.value = 'custom';
        pbSetSoftDisplay(inp, true, 'block');
        inp.value = val;
    }
}

function getSelectOrCustom(selectId, customId) {
    const sel = document.getElementById(selectId);
    const inp = document.getElementById(customId);
    if(sel.value === 'custom') return inp.value.trim();
    return sel.value;
}

// 2. 将表单组装为大段 Prompt 并保存
window.savePersonaBuilder = async function() {
    const p = personasMeta[currentPersonaId];
    if (!p) return;

    p.name = document.getElementById('pb-name').value.trim() || '未命名';

    // 收集大纲数据
    const d = {
        gender: getSelectOrCustom('pb-gender', 'pb-gender-custom'),
        bioSex: getSelectOrCustom('pb-bio-sex', 'pb-bio-sex-custom'),
        ageNum: document.getElementById('pb-age-num').value.trim(),
        ageStage: document.getElementById('pb-age-stage').value,
        race: document.getElementById('pb-race').value.trim(),
        faction: document.getElementById('pb-faction').value.trim(),
        keywords: document.getElementById('pb-keywords').value.trim(),

        aura: document.getElementById('pb-aura').value.trim(),
        height: document.getElementById('pb-height').value.trim(),
        weight: document.getElementById('pb-weight').value.trim(),
        bodyType: getSelectOrCustom('pb-body-type', 'pb-body-type-custom'),
        bodyRatio: document.getElementById('pb-body-ratio').value.trim(),
        posture: document.getElementById('pb-posture').value.trim(),
        boneSpec: document.getElementById('pb-bone-spec').value.trim(),
        faceShape: document.getElementById('pb-face-shape').value,
        eyes: document.getElementById('pb-eyes').value.trim(),
        skinHair: document.getElementById('pb-skin-hair').value.trim(),
        skinSpec: document.getElementById('pb-skin-spec').value.trim(),
        sensory: document.getElementById('pb-sensory').value.trim(),

        personaOut: document.getElementById('pb-persona-out').value.trim(),
        personaIn: document.getElementById('pb-persona-in').value.trim(),
        mbti: document.getElementById('pb-mbti').value.trim(),
        enneagram: document.getElementById('pb-enneagram').value.trim(),
        goal: document.getElementById('pb-goal').value.trim(),
        fear: document.getElementById('pb-fear').value.trim(),
        conflict: document.getElementById('pb-conflict').value.trim(),
        weakness: document.getElementById('pb-weakness').value.trim(),
        backstory: document.getElementById('pb-backstory').value.trim(),

        emoJoy: document.getElementById('pb-emo-joy').value.trim(),
        emoAnger: document.getElementById('pb-emo-anger').value.trim(),
        emoSorrow: document.getElementById('pb-emo-sorrow').value.trim(),
        emoPleasure: document.getElementById('pb-emo-pleasure').value.trim(),
        health: document.getElementById('pb-health').value.trim(),
        stimulus: document.getElementById('pb-stimulus').value.trim(),
        habitAction: document.getElementById('pb-habit-action').value.trim(),
        habitLife: document.getElementById('pb-habit-life').value.trim(),
        habitDiet: document.getElementById('pb-habit-diet').value.trim(),
    };
    p.pbData = d;

    // 编译终极结构化 Prompt
    let prompt = `[Character Identity]\nName: ${p.name}\n`;
    prompt += `Gender/Sex: ${d.gender} / ${d.bioSex}\n`;
    prompt += `Age: ${d.ageNum} (${d.ageStage})\n`;
    prompt += `Race & Faction: ${d.race} | ${d.faction}\n`;
    prompt += `Keywords: ${d.keywords}\n\n`;

    prompt += `[Physical Manifestation]\n`;
    prompt += `Aura: ${d.aura}\n`;
    prompt += `Physique: ${d.height} / ${d.weight}, ${d.bodyType}, ${d.bodyRatio}\n`;
    prompt += `Posture & Bones: ${d.posture}, ${d.boneSpec}\n`;
    prompt += `Facial Features: Shape: ${d.faceShape}, Eyes: ${d.eyes}\n`;
    prompt += `Hair & Skin: ${d.skinHair}, ${d.skinSpec}\n`;
    prompt += `Sensory (Voice/Scent): ${d.sensory}\n\n`;

    prompt += `[Internal Cosmos]\n`;
    prompt += `Apparent Personality: ${d.personaOut}\n`;
    prompt += `Implicit Personality: ${d.personaIn}\n`;
    prompt += `Scales: MBTI(${d.mbti}), Enneagram(${d.enneagram})\n`;
    prompt += `Drives: Goal(${d.goal}), Fear(${d.fear}), Conflict(${d.conflict}), Weakness(${d.weakness})\n`;
    prompt += `Backstory:\n${d.backstory}\n\n`;

    prompt += `[Dynamic Interaction]\n`;
    prompt += `Emotions: Joy(${d.emoJoy}), Anger(${d.emoAnger}), Sorrow(${d.emoSorrow}), Pleasure(${d.emoPleasure})\n`;
    prompt += `Physiology & Reactions: ${d.health} | ${d.stimulus}\n`;
    prompt += `Habits: Actions(${d.habitAction}), Lifestyle(${d.habitLife}), Diet(${d.habitDiet})\n`;

    p.persona = prompt.trim();
    await IDB.set(PERSONA_META_KEY, personasMeta);
    
    applyPersonaToUI();
    showToast("人设已成功组装并保存！");
};

// 3. 世界书联动功能
function renderPbWorldbooks() {
    const sel = document.getElementById('pb-worldbook-select');
    if(!sel) return;
    sel.innerHTML = '<option value="">-- 选择世界书注入世界观 --</option>';
    if (typeof worldBooks !== 'undefined') {
        worldBooks.forEach(wb => {
            const opt = document.createElement('option');
            opt.value = wb.title; opt.text = wb.title;
            sel.appendChild(opt);
        });
    }
}
window.syncPbWorldbook = function() {
    const val = document.getElementById('pb-worldbook-select').value;
    if(val) {
        document.getElementById('pb-race').value = "属于【" + val + "】世界观下的种族";
        document.getElementById('wb-sync-hint').innerText = "(已联动: " + val + ")";
    } else {
        document.getElementById('wb-sync-hint').innerText = "";
    }
};

// 4. 智能解析 (调用 AI 帮你填表)
window.executeSmartParse = async function() {
    const text = document.getElementById('pb-smart-parse-text').value.trim();
    if(!text) { alert("请先粘贴角色文案！"); return; }
    
    if(typeof callAiForSpecialTask !== 'function') { alert("无法调用API，检查 apps.js"); return; }

    const prompt = `
    请解析以下角色文案，并提取为标准的 JSON 格式，严格按照这些 key 返回，没有的值填 ""。
    keys: name, gender, bioSex, age, race, faction, keywords, aura, bodyType, eyes, sensory, personaOut, personaIn, goal, backstory, habits.
    
    文本：
    ${text}
    `;
    
    showToast("AI正在努力解析拆解人设，请稍候...");
    const result = await callAiForSpecialTask(prompt);
    
    if (result) {
        try {
            const jsonStr = result.replace(/```json/gi, '').replace(/```/gi, '').trim();
            const data = JSON.parse(jsonStr);
            
            if(data.name) document.getElementById('pb-name').value = data.name;
            if(data.gender) setSelectOrCustom('pb-gender', 'pb-gender-custom', data.gender);
            if(data.race) document.getElementById('pb-race').value = data.race;
            if(data.faction) document.getElementById('pb-faction').value = data.faction;
            if(data.keywords) document.getElementById('pb-keywords').value = data.keywords;
            if(data.aura) document.getElementById('pb-aura').value = data.aura;
            if(data.eyes) document.getElementById('pb-eyes').value = data.eyes;
            if(data.sensory) document.getElementById('pb-sensory').value = data.sensory;
            if(data.personaOut) document.getElementById('pb-persona-out').value = data.personaOut;
            if(data.personaIn) document.getElementById('pb-persona-in').value = data.personaIn;
            if(data.goal) document.getElementById('pb-goal').value = data.goal;
            if(data.backstory) document.getElementById('pb-backstory').value = data.backstory;
            if(data.habits) document.getElementById('pb-habit-action').value = data.habits;

            showToast("智能填表完成！你可以手动微调了。");
        } catch(e) {
            alert("解析失败，AI 返回格式不符合规范。");
        }
    }
};

// 5. 最终故事生成
window.generateFinalStory = async function() {
    const p = personasMeta[currentPersonaId];
    if(!p || !p.persona) {
        alert("请先点击右上角保存，确立人设基底！"); return; 
    }
    
    const scenario = document.getElementById('pb-scenario-prompt').value.trim();
    if(!scenario) { alert("请填写你要生成的情景指令！"); return; }
    
    const outputDiv = document.getElementById('pb-story-output');
    pbQueueUiWrite(() => {
        pbSetSoftDisplay(outputDiv, true, 'block');
        outputDiv.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> 正在根据人设进行沉浸式生成...';
    });

    const megaPrompt = `
    [Preamble: 核心人设设定]
    ${p.persona}
    
    [Instruction: 情景指令]
    你是一部精彩小说的作者，也是文中主角（即上述人设）。请严格遵循上述角色的性格、外貌、动机、表达方式，描写以下情景。
    要求文字细腻，展现角色的【外显性格】与【内隐性格】的冲突。
    
    情景描述：
    ${scenario}
    `;

    const res = await callAiForSpecialTask(megaPrompt);
    if(res) {
        outputDiv.innerHTML = res.replace(/\n/g, '<br>');
    } else {
        outputDiv.innerHTML = '生成失败，请重试。';
    }
};
