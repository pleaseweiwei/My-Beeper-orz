/* =========================================
   [NEW] USER 人设生成系统 (无 Tab 滚动填表 + 灵动魔法动画版)
   ========================================= */

// 定义所有的 input id 键值，用于保存和AI回填
const PB_KEYS = [
    'pb_name', 'pb_realName', 'pb_gender', 'pb_age', 'pb_location', 'pb_occupation', 'pb_education', 'pb_income', 'pb_routine', 'pb_tags',
    'pb_vibeTags', 'pb_physique', 'pb_face', 'pb_hair', 'pb_style', 'pb_colors', 'pb_accessories', 'pb_voice', 'pb_expression', 'pb_aura',
    'pb_family', 'pb_wealth', 'pb_childhood', 'pb_hometown', 'pb_prosCons', 'pb_pastExp', 'pb_turningPoint',
    'pb_coreTrait', 'pb_apparentTrait', 'pb_hiddenTrait', 'pb_thinking', 'pb_emotion', 'pb_weakness', 'pb_values', 'pb_desire', 'pb_fear', 'pb_secret',
    'pb_livingHabit', 'pb_socialHabit', 'pb_languageHabit', 'pb_hobbies', 'pb_likesDislikes', 'pb_diet', 'pb_soloTime', 'pb_quirks', 'pb_dailySchedule',
    'pb_romance', 'pb_friendType', 'pb_hateType', 'pb_strangerAttitude', 'pb_fearRelation', 'pb_socialCircle', 'pb_familyAttitude', 'pb_colleagueAttitude', 'pb_trust'
];

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
        charSelect.innerHTML = '<option value="">🎭 针对攻略角色 (可选)</option>';
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
    if (!p) return;
    const d = p.pbData || {};

    PB_KEYS.forEach(key => {
        const el = document.getElementById(key);
        if (el) {
            el.value = d[key] || '';
            
            // --- 新增：给多行输入框绑定高度自动伸缩魔法 ---
            if (el.tagName.toLowerCase() === 'textarea') {
                // 1. 初始化时根据已有文字调整高度
                setTimeout(() => {
                    el.style.height = 'auto';
                    el.style.height = el.scrollHeight + 'px';
                }, 10);
                
                // 2. 绑定输入事件，打字时自动撑开
                el.removeEventListener('input', autoResizeTextarea); // 防止重复绑定
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

    // 1. 收集所有输入框
    const d = {};
    PB_KEYS.forEach(key => {
        const el = document.getElementById(key);
        d[key] = el ? el.value.trim() : '';
    });
    
    // 更新外部显示的名称
    p.name = d.pb_realName || d.pb_name || 'Me';
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
Aura: ${d.pb_aura} | Expression: ${d.pb_expression} | Voice: ${d.pb_voice} | Vibe Tags: ${d.pb_vibeTags}

[Background & Past]
Family: ${d.pb_family} | Wealth: ${d.pb_wealth} | Hometown: ${d.pb_hometown}
Childhood: ${d.pb_childhood} | Pros/Cons from Past: ${d.pb_prosCons}
Past Exp: ${d.pb_pastExp}
Turning Point: ${d.pb_turningPoint}

[Internal Character]
Core: ${d.pb_coreTrait} | Apparent: ${d.pb_apparentTrait} | Hidden: ${d.pb_hiddenTrait}
Thinking: ${d.pb_thinking} | Emotion: ${d.pb_emotion} | Weakness/Limits: ${d.pb_weakness}
Values: ${d.pb_values}
Desire: ${d.pb_desire} | Fear: ${d.pb_fear} | Secret/Knot: ${d.pb_secret}

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

    p.persona = prompt.trim();
    
    // 保存进数据库
    await IDB.set(PERSONA_META_KEY, personasMeta);
    
    // 应用到微信等界面的名字同步
    if(typeof applyPersonaToUI === 'function') applyPersonaToUI();
    showToast("<i class='fas fa-check'></i> User 人设档案已保存成功！");
};

// 🌟 核心：AI 一键自动扩写生成逻辑 (附带阶梯发光特效)
window.generatePersonaByAI = async function() {
    const brief = document.getElementById('pb-ai-prompt').value.trim();
    const wb = document.getElementById('pb-ai-worldbook').value;
    const charPersona = document.getElementById('pb-ai-character').value;
    
    if (!brief) {
        alert("至少写一句你的人设想法吧！");
        return;
    }

    const btn = document.getElementById('pb-btn-ai');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在注入灵魂，请稍候...';
    btn.style.pointerEvents = 'none';

    // 构造严格的 JSON 请求结构
    const jsonFormat = `{
  "pb_name": "", "pb_realName": "", "pb_gender": "", "pb_age": "", "pb_location": "", "pb_occupation": "", "pb_education": "", "pb_income": "", "pb_routine": "", "pb_tags": "",
  "pb_vibeTags": "", "pb_physique": "", "pb_face": "", "pb_hair": "", "pb_style": "", "pb_colors": "", "pb_accessories": "", "pb_voice": "", "pb_expression": "", "pb_aura": "",
  "pb_family": "", "pb_wealth": "", "pb_childhood": "", "pb_hometown": "", "pb_prosCons": "", "pb_pastExp": "", "pb_turningPoint": "",
  "pb_coreTrait": "", "pb_apparentTrait": "", "pb_hiddenTrait": "", "pb_thinking": "", "pb_emotion": "", "pb_weakness": "", "pb_values": "", "pb_desire": "", "pb_fear": "", "pb_secret": "",
  "pb_livingHabit": "", "pb_socialHabit": "", "pb_languageHabit": "", "pb_hobbies": "", "pb_likesDislikes": "", "pb_diet": "", "pb_soloTime": "", "pb_quirks": "", "pb_dailySchedule": "",
  "pb_romance": "", "pb_friendType": "", "pb_hateType": "", "pb_strangerAttitude": "", "pb_fearRelation": "", "pb_socialCircle": "", "pb_familyAttitude": "", "pb_colleagueAttitude": "", "pb_trust": ""
}`;

    const megaPrompt = `
You are an expert character designer and writer. Based on the brief ideas provided by the user, please flesh out a COMPLETE, incredibly detailed and vivid character profile (User Identity).

[User's Brief Idea]: 
"${brief}"

${wb ? `[World Setting Reference]:\n${wb}\nMake sure the occupation, style, and background fit this world.` : ''}
${charPersona ? `[Interaction Target Reference]:\n${charPersona}\nThis is the AI character the user will interact with. Design the user's personality and secrets so they have interesting chemistry/conflict with this character.` : ''}

[Task]
Expand the brief idea into a fully detailed 55-point profile. Fill in creative, logically consistent, and charming details. 
- Use Simplified Chinese (简体中文).
- Be specific (e.g. instead of "Likes music", write "Always wears wired earphones listening to city pop").
- STRICT REQUIREMENT: Output NOTHING ELSE BUT a pure JSON object matching this exact structure:
${jsonFormat}
    `;

    try {
        const result = await callAiForSpecialTask(megaPrompt);
        if (result) {
            const jsonStr = result.replace(/```json/gi, '').replace(/```/gi, '').trim();
            const data = JSON.parse(jsonStr);
            
            let delay = 0;
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
                            void wrapper.offsetWidth; // 触发重绘
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
};
window.handlePbAvatarUpload = function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            let base64 = e.target.result;
            // 如果全局有压缩函数，顺便压缩一下节约空间
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
window.exportPersonaTxt = async function() {
    // 自动先替用户保存最新改动
    await window.savePersonaBuilder();
    
    const p = personasMeta[currentPersonaId];
    if (!p || !p.persona) {
        alert("当前没有可导出的数据！");
        return;
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