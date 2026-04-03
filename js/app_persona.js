/* =========================================
   [NEW] USER 人设生成系统 (无 Tab 滚动填表 + 灵动魔法动画版)
   ========================================= */

// 定义所有的 input id 键值，用于保存和AI回填
const PB_KEYS = [
    'pb_name', 'pb_realName', 'pb_gender', 'pb_age', 'pb_location', 'pb_occupation', 'pb_education', 'pb_income', 'pb_routine', 'pb_tags',
    'pb_vibeTags', 'pb_physique', 'pb_face', 'pb_hair', 'pb_style', 'pb_colors', 'pb_accessories', 'pb_voice', 'pb_expression', 'pb_aura',
    'pb_family', 'pb_wealth', 'pb_childhood', 'pb_hometown', 'pb_prosCons', 'pb_pastExp', 'pb_turningPoint',
    'pb_coreTrait', 'pb_apparentTrait', 'pb_hiddenTrait', 'pb_thinking', 'pb_emotion', 'pb_weakness', 'pb_values', 'pb_desire','pb_fear', 'pb_secret',
    'pb_livingHabit', 'pb_socialHabit', 'pb_languageHabit', 'pb_hobbies', 'pb_likesDislikes', 'pb_diet', 'pb_soloTime', 'pb_quirks', 'pb_dailySchedule',
    'pb_romance', 'pb_friendType', 'pb_hateType', 'pb_strangerAttitude', 'pb_fearRelation', 'pb_socialCircle', 'pb_familyAttitude', 'pb_colleagueAttitude', 'pb_trust'
];
const PB_MANUAL_KEY = 'pb_manual_persona';

window.openPersonaBuilder = function() {
    const app = document.getElementById('personaBuilderApp');
    if (!app) return;
    
    // 1. 加载下拉框：世界书 和 已有AI角色
    renderPbWorldbooksAndChars();
    
    // 2. 加载当前用户的存档数据
    loadDataIntoBuilder();
    
    app.classList.add('open');
};

window.closePersonaBuilder = function() {
    document.getElementById('personaBuilderApp').classList.remove('open');
};

// 渲染顶部 AI 参考下拉框
function renderPbWorldbooksAndChars() {
    const wbSelect = document.getElementById('pb-ai-worldbook');
    const charSelect = document.getElementById('pb-ai-character');
    
    if (wbSelect) {
        wbSelect.innerHTML = '<option value="">🌍 融入世界观 (可选)</option>';
        if (typeof worldBooks !== 'undefined') {
            worldBooks.forEach(wb => {
                const opt = document.createElement('option');
                opt.value = wb.title; opt.text = wb.title;
                wbSelect.appendChild(opt);
            });
        }
    }
    
    if (charSelect) {
        charSelect.innerHTML = '<option value="">🎭 针对攻略角色(可选)</option>';
        Object.values(friendsData || {}).forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.persona; // 直接把对象的 persona 取出来准备喂给 AI
            opt.text = f.remark || f.realName;
            charSelect.appendChild(opt);
        });
    }
}

// === 覆盖并强化原来的填充函数 (新增自动高度适应) ===
function loadDataIntoBuilder() {
    const p = personasMeta[currentPersonaId];
    if (!p)return;
    const d = p.pbData || {};

    [...PB_KEYS, PB_MANUAL_KEY].forEach(key => {
    const el = document.getElementById(key);
    if (el) {
        el.value = d[key] || '';// 多行输入框自动高度（手写框也一起适配）
        if (el.tagName.toLowerCase() === 'textarea') {
            setTimeout(() => {
                el.style.height = 'auto';
                el.style.height = el.scrollHeight + 'px';}, 10);

            el.removeEventListener('input', autoResizeTextarea);
            el.addEventListener('input', autoResizeTextarea);
        }
    }
});

    
    // 渲染头像预览
    const avatarImg = document.getElementById('pb_avatar_preview');
    if (avatarImg) {
        avatarImg.src = p.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentPersonaId}`;
    }
    
    // 渲染标题处的动态名称指示器
    const titleName = document.getElementById('pb-current-persona-name');
    if (titleName) {
        titleName.innerHTML = `${p.name || 'MY UNIVERSE'} <i class="fas fa-caret-down" style="font-size:12px;"></i>`;
    }
}

// 辅助函数：高度自动伸缩
function autoResizeTextarea() {
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
}


// 提取数据组装成巨大的 Prompt 并保存
window.savePersonaBuilder = async function() {
    const p = personasMeta[currentPersonaId];
    if (!p) return;

    // 1. 收集所有输入框（包括手写框）
    const d = {};
    [...PB_KEYS, PB_MANUAL_KEY].forEach(key => {
        const el = document.getElementById(key);
        d[key] = el ? el.value.trim() : '';
    });
    
    // 更新外部显示的名称
    p.name = d.pb_realName ||d.pb_name || 'Me';
    p.pbData = d;

    // 2. 组装成给 AI 读取的终极纯文本
    let prompt = `[User Identity Profile]
Name/Nickname: ${d.pb_name} | Real Name: ${d.pb_realName}
Gender/Orientation: ${d.pb_gender} | Age: ${d.pb_age}
Location: ${d.pb_location} | Edu: ${d.pb_education} | Occ: ${d.pb_occupation} | Income: ${d.pb_income}
Routine: ${d.pb_routine} | Tags: ${d.pb_tags}

[Physical Appearance]
Physique: ${d.pb_physique} | Face: ${d.pb_face} | Hair: ${d.pb_hair}
Style: ${d.pb_style} | Colors: ${d.pb_colors} | Accessories: ${d.pb_accessories}
Aura: ${d.pb_aura} | Expression: ${d.pb_expression} | Voice: ${d.pb_voice} | Vibe Tags:${d.pb_vibeTags}

[Background & Past]
Family: ${d.pb_family} | Wealth: ${d.pb_wealth} | Hometown: ${d.pb_hometown}
Childhood: ${d.pb_childhood} | Pros/Cons from Past: ${d.pb_prosCons}
Past Exp: ${d.pb_pastExp}
Turning Point: ${d.pb_turningPoint}

[Internal Character]
Core: ${d.pb_coreTrait} | Apparent: ${d.pb_apparentTrait} | Hidden:${d.pb_hiddenTrait}
Thinking: ${d.pb_thinking} | Emotion: ${d.pb_emotion} | Weakness/Limits: ${d.pb_weakness}
Values: ${d.pb_values}
Desire: ${d.pb_desire}| Fear: ${d.pb_fear} | Secret/Knot: ${d.pb_secret}

[Habits & Routines]
Living: ${d.pb_livingHabit} | Social: ${d.pb_socialHabit} | Language: ${d.pb_languageHabit}
Hobbies: ${d.pb_hobbies} | Likes/Dislikes: ${d.pb_likesDislikes} | Diet: ${d.pb_diet}
Schedule: ${d.pb_dailySchedule}
Solo Time: ${d.pb_soloTime} | Quirks: ${d.pb_quirks}

[Relationships]
Circle: ${d.pb_socialCircle} | Romance: ${d.pb_romance}
Friends: ${d.pb_friendType} | Hate: ${d.pb_hateType}
Family Attitude: ${d.pb_familyAttitude} | Stranger: ${d.pb_strangerAttitude} | Colleague: ${d.pb_colleagueAttitude}
Trust: ${d.pb_trust} | Deepest Fear in Rel: ${d.pb_fearRelation}`;

    const manualPersona = d[PB_MANUAL_KEY];
    // 手写优先：只要手写框不为空，就直接用手写框作为最终 persona
    p.persona = (manualPersona && manualPersona.length > 0) ? manualPersona : prompt.trim();
    
    // 保存进数据库
    await IDB.set(PERSONA_META_KEY, personasMeta);
    
    // 应用到微信等界面的名字同步
    if(typeof applyPersonaToUI === 'function') applyPersonaToUI();
    showToast("<i class='fas fa-check'></i> User人设档案已保存成功！");
};

// 🌟 核心：AI 一键自动扩写生成逻辑 (附带阶梯发光特效)
window.generatePersonaByAI = async function() {
    const brief = document.getElementById('pb-ai-prompt').value.trim();
    const wb = document.getElementById('pb-ai-worldbook').value;
    const charPersona = document.getElementById('pb-ai-character').value;
    
    if (!brief) {
        alert("至少写一句你的人设想法吧！");
        return;}

    const btn = document.getElementById('pb-btn-ai');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在注入灵魂，请稍候...';
    btn.style.pointerEvents = 'none';

    // 构造严格的 JSON 请求结构
    const jsonFormat = `{
  "pb_name": "", "pb_realName": "", "pb_gender": "", "pb_age": "", "pb_location": "", "pb_occupation": "", "pb_education": "", "pb_income": "", "pb_routine": "", "pb_tags": "",
  "pb_vibeTags": "", "pb_physique": "", "pb_face": "", "pb_hair": "", "pb_style": "", "pb_colors": "", "pb_accessories": "", "pb_voice": "", "pb_expression": "", "pb_aura": "",
  "pb_family": "", "pb_wealth": "", "pb_childhood": "", "pb_hometown": "", "pb_prosCons": "", "pb_pastExp": "","pb_turningPoint": "",
  "pb_coreTrait": "", "pb_apparentTrait": "", "pb_hiddenTrait": "", "pb_thinking": "", "pb_emotion": "", "pb_weakness": "", "pb_values": "", "pb_desire": "", "pb_fear": "", "pb_secret": "",
  "pb_livingHabit": "", "pb_socialHabit": "", "pb_languageHabit": "", "pb_hobbies": "", "pb_likesDislikes": "", "pb_diet": "", "pb_soloTime": "","pb_quirks": "", "pb_dailySchedule": "",
  "pb_romance": "", "pb_friendType": "", "pb_hateType": "", "pb_strangerAttitude": "", "pb_fearRelation": "", "pb_socialCircle": "", "pb_familyAttitude": "", "pb_colleagueAttitude": "", "pb_trust": ""
}`;

    const megaPrompt = `
You are an expert character designer and writer. Based on the brief ideas provided by the user, please flesh out a COMPLETE, incredibly detailed and vivid character profile (User Identity).[User's Brief Idea]: 
"${brief}"

${wb ? `[World Setting Reference]:\n${wb}\nMake sure the occupation, style, and background fit this world.` : ''}
${charPersona ? `[Interaction Target Reference]:\n${charPersona}\nThis is the AIcharacter the user will interact with. Design the user's personality and secrets so they have interesting chemistry/conflict with this character.` : ''}

[Task]
Expand the brief idea into a fully detailed 55-point profile. Fill in creative, logically consistent, and charming details. 
- UseSimplified Chinese (简体中文).
- Be specific (e.g. instead of "Likes music", write "Always wears wired earphones listening to city pop").
- STRICT REQUIREMENT: Output NOTHING ELSE BUT a pure JSON object matching this exact structure:
${jsonFormat}
    `;

    try {const result = await callAiForSpecialTask(megaPrompt);
        if (result) {
            const jsonStr = result.replace(/```json/gi, '').replace(/```/gi, '').trim();
            const data = JSON.parse(jsonStr);
            
            let delay= 0;
            // 自动回填并加入阶梯发光特效，像魔法注入一样
            PB_KEYS.forEach(key => {
                const el = document.getElementById(key);
                if (el && data[key]) {
                    el.value = data[key];
                    
                    // 获取外层的包裹 div 加上动画
                    const wrapper = el.closest('.pb-input-wrapper');
                    if (wrapper) {
                        setTimeout(() => {
                            wrapper.classList.remove('ai-filled-flash');
                            void wrapper.offsetWidth;// 触发重绘
                            wrapper.classList.add('ai-filled-flash');
                        }, delay);
                        delay += 25; // 错开 25ms，形成多米诺骨牌一样的流光效果
                    }
                }
            });
            showToast("<i class='fas fa-sparkles' style='color:#ff7e67;'></i> 灵魂注入完毕！");
            
            // 自动往下滚动展示结果，然后再滚回顶部
            const scrollBox = document.querySelector('.pb-scroll-container');
            scrollBox.scrollTo({ top: scrollBox.scrollHeight, behavior: 'smooth' });
            setTimeout(() => {
                scrollBox.scrollTo({ top: 0, behavior: 'smooth' });
            }, 1200);

        } else {
            alert("生成失败，请检查网络或更换 API。");
        }
    } catch (e) {
        alert("解析失败，AI 返回格式异常: " + e.message);
    } finally {
        btn.innerHTML = originalText;
        btn.style.pointerEvents = 'auto';
    }
};window.handlePbAvatarUpload = function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            let base64 = e.target.result;
            //如果全局有压缩函数，顺便压缩一下节约空间
            if (typeof compressImage === 'function') {
                base64 = await compressImage(base64, 300);
            }
            
            document.getElementById('pb_avatar_preview').src = base64;
            
            // 实时保存到全局
            if (personasMeta[currentPersonaId]) {
                personasMeta[currentPersonaId].avatar = base64;
                await IDB.set(PERSONA_META_KEY, personasMeta);
                if(typeof applyPersonaToUI === 'function') applyPersonaToUI();
            }
        };
        reader.readAsDataURL(input.files[0]);
    }
    input.value = '';
}

// === 追加：一键导出 TXT 文本 ===
window.exportPersonaTxt= async function() {
    // 自动先替用户保存最新改动
    await window.savePersonaBuilder();
    
    const p = personasMeta[currentPersonaId];
    if (!p || !p.persona) {
        alert("当前没有可导出的数据！");return;
    }
    
    // 创建一个纯文本文件进行下载
    const blob = new Blob([p.persona], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${p.name || 'UserPersona'}_专属设定.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    if(typeof showToast === 'function') showToast("<i class='fas fa-check'></i> 设定 TXT 已保存到本地！");
}
// =========================================
// [新增] 一键清空 / 删除当前身份
// =========================================

window.clearPersonaBuilderInputs = async function() {
    const p = personasMeta[currentPersonaId];
    if (!p) return;

    const ok = confirm("确定一键清空人设生成器内容吗？\n（不会删除身份，但会清空表单与手写人设）");
    if (!ok) return;

    // 1) 清空表单字段
    PB_KEYS.forEach(key => {
        const el = document.getElementById(key);
        if (el) {
            el.value ='';
            if (el.tagName.toLowerCase() === 'textarea') el.style.height = '';
        }
    });

    // 2) 清空手写人设框
    const manual = document.getElementById(PB_MANUAL_KEY);
    if (manual) {manual.value = '';
        manual.style.height = '';
    }

    // 3) 清空存档（只清 pbData + persona 文本，不动头像）
    p.pbData = {};
    p.persona = '';

    await IDB.set(PERSONA_META_KEY, personasMeta);

    if (typeof applyPersonaToUI === 'function') applyPersonaToUI();
    if (typeof showToast === 'function') showToast("<i class='fas fa-broom'></i> 已清空");
    else alert("已清空");};


// 删除当前身份：同时删除该身份的所有 scoped 数据（聊天/好友/朋友圈等）
window.deleteCurrentPersonaIdentity = async function() {
    const ids = Object.keys(personasMeta || {});
    if (ids.length <= 1) {
        alert("只剩最后一个身份，不能删除。");
        return;
    }

    const p = personasMeta[currentPersonaId];
    const name = p?.name || currentPersonaId;

    const ok = confirm(
        `⚠️ 确定删除身份「${name}」吗？\n\n将同时删除该身份下的：好友数据、聊天记录、朋友圈等（不可恢复）。`
    );
    if (!ok) return;

    const deletingId = currentPersonaId;

    // 1) 删除该身份的 scoped 存储（LocalStorage + IndexedDB）await deletePersonaScopedStorage(deletingId);

    // 2) 从身份列表里移除
    delete personasMeta[deletingId];
    await IDB.set(PERSONA_META_KEY, personasMeta);

    // 3) 切到一个还存在的身份
    constnextId = Object.keys(personasMeta)[0];
    currentPersonaId = nextId;
    localStorage.setItem('myCoolPhone_currentPersonaId', nextId);

    // 4) 关闭生成器并刷新全局数据
    try { closePersonaBuilder(); } catch(e){}

    // 这些函数在 apps.js 里
    if (typeof loadFriendsData === 'function') await loadFriendsData();
    if (typeof loadMomentsFeed === 'function') loadMomentsFeed();
    if (typeof applyPersonaToUI === 'function') applyPersonaToUI();if (typeof showToast === 'function') showToast(`已删除身份：${name}`);
    else alert(`已删除身份：${name}`);
};


// 删除某个 personaId 对应的全部 scoped 数据
async function deletePersonaScopedStorage(personaId) {
    // A) LocalStorage：删掉包含 __personaId 或 __personaId__ 的 key
    try {
        const toDel = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;if (k.includes(`__${personaId}__`) || k.endsWith(`__${personaId}`)) {
                // 注意：不要误删当前身份指针本身
                if (k === 'myCoolPhone_currentPersonaId') continue;
                toDel.push(k);}
        }
        toDel.forEach(k => localStorage.removeItem(k));
    } catch (e) {
        console.warn("LocalStorage scoped delete failed:", e);
    }

    // B) IndexedDB：删掉 largeDataStore 里所有包含 personaId 的key（聊天记录、好友数据等）
    try {
        if (!IDB.db) await IDB.init();

        const keys = await new Promise((resolve, reject) => {
            const tx = IDB.db.transaction('largeDataStore', 'readonly');const store = tx.objectStore('largeDataStore');
            const req = store.getAllKeys();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });

        const delKeys = keys.filter(k =>
            typeof k === 'string' &&
            (k.includes(`__${personaId}__`) || k.endsWith(`__${personaId}`))
        );

        for (const k of delKeys) {
            // 保险：不要删 personaMeta 本体if (k === PERSONA_META_KEY) continue;
            await IDB.delete(k);
        }
    } catch (e) {
        console.warn("IndexedDB scoped delete failed:", e);
    }
}

// =========================================
// [新增] 右上角更多菜单的控制
// =========================================
window.togglePbMenu = function(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('pb-more-menu');
    if (!menu) return;
    
    if (menu.classList.contains('active')) {
        menu.classList.remove('active');
    } else {
        // 先关掉全局其他可能打开的下拉菜单
        document.querySelectorAll('.wc-plus-dropdown.active').forEach(m => {
            m.classList.remove('active');
        });
        menu.classList.add('active');
    }
};

// 点击页面其他空白区域自动关闭菜单
document.addEventListener('click', function(e) {
    const pbMenu = document.getElementById('pb-more-menu');
    // 如果菜单处于激活状态，且点击的元素不在菜单内部，则关闭
    if (pbMenu && pbMenu.classList.contains('active') && !e.target.closest('#pb-more-menu')) {
        pbMenu.classList.remove('active');
    }
});
