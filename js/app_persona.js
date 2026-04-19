/* =========================================
   [NEW] USER 人设生成系统 (无 Tab 滚动填表 + 灵动魔法动画版)
   ========================================= */

// 定义所有的 input id 键值，用于保存和AI回填
const PB_KEYS = [
    'pb_name', 'pb_realName', 'pb_gender', 'pb_age', 'pb_occupation', 'pb_tags',
    'pb_physique', 'pb_face', 'pb_hair', 'pb_style', 'pb_voice', 'pb_aura',
    'pb_family', 'pb_pastExp', 'pb_turningPoint',
    'pb_coreTrait', 'pb_apparentTrait', 'pb_hiddenTrait', 'pb_weakness', 'pb_values', 'pb_desire','pb_fear', 'pb_secret',
    'pb_hobbies', 'pb_likesDislikes', 'pb_quirks', 'pb_romance'
];
const PB_MANUAL_KEY = 'pb_manual_persona';

window.openPersonaBuilder = function() {
    const app = document.getElementById('personaBuilderApp');
    if (!app) return;
    
    // 显示画廊，隐藏表单和顶栏
    document.getElementById('pb-gallery-view').style.display = 'flex';
    document.getElementById('pb-slider').style.display = 'none';
    const header = document.getElementById('pb-detail-header');
    if (header) header.style.display = 'none';
    
    renderPersonaGallery(); // 渲染扑克牌
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
        // 渲染第一页的杂志大封面
    const coverImg = document.getElementById('pb_cover_preview');
    if (coverImg) {
        coverImg.src = p.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentPersonaId}`;
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
Occ: ${d.pb_occupation} | Tags: ${d.pb_tags}

[Physical Appearance]
Physique: ${d.pb_physique} | Face: ${d.pb_face} | Hair: ${d.pb_hair}
Style: ${d.pb_style} | Voice: ${d.pb_voice}
Aura: ${d.pb_aura}

[Background & Past]
Family: ${d.pb_family}
Past Exp: ${d.pb_pastExp}
Turning Point: ${d.pb_turningPoint}

[Internal Character]
Core: ${d.pb_coreTrait} | Apparent: ${d.pb_apparentTrait} | Hidden:${d.pb_hiddenTrait}
Weakness/Limits: ${d.pb_weakness} | Values: ${d.pb_values}
Desire: ${d.pb_desire}| Fear: ${d.pb_fear} | Secret/Knot: ${d.pb_secret}

[Habits & Social]
Hobbies: ${d.pb_hobbies} | Likes/Dislikes: ${d.pb_likesDislikes} | Quirks: ${d.pb_quirks}
Romance: ${d.pb_romance}`;

    const manualPersona = d[PB_MANUAL_KEY];
    // 手写优先：只要手写框不为空，就直接用手写框作为最终 persona
    p.persona = (manualPersona && manualPersona.length > 0) ? manualPersona : prompt.trim();
    
    // 保存进数据库
    await IDB.set(PERSONA_META_KEY, personasMeta);
    
    // 应用到微信等界面的名字同步
    if(typeof applyPersonaToUI === 'function') applyPersonaToUI();
    showToast("<i class='fas fa-check'></i> User人设档案已保存成功！");
};
// ==========================================
// 🌟 辅助功能：快捷标签填入 & 随机地点
// ==========================================
window.addPbTag = function(inputId, text) {
    const el = document.getElementById(inputId);
    if (!el) return;
    // 如果已有文字，则加个逗号拼接；否则直接填入
    if (el.value.trim() !== '') {
        if (!el.value.includes(text)) el.value = el.value.trim() + '，' + text;
    } else {
        el.value = text;
    }
};

window.randomLocation = function() {
    const locations = ["赛博朋克地下街区", "顶层豪华复式公寓", "海边废弃灯塔", "常年下雨的江南小镇", "一辆改装过的末日房车", "被遗忘的欧式古堡", "繁华市中心的隐秘茶室"];
    const rnd = locations[Math.floor(Math.random() * locations.length)];
    document.getElementById('pb_location').value = rnd;
};

// ==========================================
// 🌟 滑动翻页指示器联动
// ==========================================
window.updatePbPagination = function() {
    const slider = document.getElementById('pb-slider');
    const dots = document.querySelectorAll('.pb-dot');
    if (!slider || !dots.length) return;
    
    const index = Math.round(slider.scrollLeft / slider.offsetWidth);
    dots.forEach((dot, i) => {
        if (i === index) dot.classList.add('active');
        else dot.classList.remove('active');
    });
};

window.scrollToPbPage = function(index) {
    const slider = document.getElementById('pb-slider');
    if (slider) slider.scrollTo({ left: index * slider.offsetWidth, behavior: 'smooth' });
};

// ==========================================
// 🌟 AI 一键自动生成海量设定
// ==========================================
window.generatePersonaByAI = async function() {
    const brief = document.getElementById('pb-ai-prompt').value.trim();
    if (!brief) {
        alert("至少写一句你的人设想法吧！");
        return;
    }

    const btn = document.getElementById('pb-btn-ai');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.style.pointerEvents = 'none';

    // 构建涵盖所有新字段的 JSON 结构
    const jsonFormat = `{
  "pb_name": "名字/昵称", "pb_gender": "性别", "pb_age": "年龄", "pb_occupation": "职业/身份",
  "pb_worldview": "世界观", "pb_location": "居住地",
  "pb_appearance": "外貌(含体型面容)", "pb_style": "穿衣打扮风格",
  "pb_personality": "内在性格与外在气场", "pb_values": "核心价值观", "pb_nsfw": "感情与NSFW亲密偏好",
  "pb_background": "成长经历背景", "pb_hobbies": "爱好",
  "pb_emo_happy": "开心时的表现", "pb_emo_angry": "生气时的表现", "pb_emo_sad": "悲伤吃醋时的表现",
  "pb_details": "生活小细节(饮食/作息/癖好)"
}`;

    const megaPrompt = `
你是顶级的小说角色架构师。请根据用户的简单设想，极其细致地丰满这个角色，创作一份高维度的档案。
[用户想法]: "${brief}"

要求：
1. 语言使用简体中文。描写要有质感、张力，细节拉满。
2. 必须严格输出纯 JSON 格式，包含以下全部键名，缺一不可：
${jsonFormat}
    `;

    try {
        const result = await callAiForSpecialTask(megaPrompt);
        if (result) {
            const jsonStr = result.replace(/```json/gi, '').replace(/```/gi, '').trim();
            const data = JSON.parse(jsonStr);
            
            // 自动回填所有数据
            const keys = ["pb_name", "pb_gender", "pb_age", "pb_occupation", "pb_worldview", "pb_location", 
                          "pb_appearance", "pb_style", "pb_personality", "pb_values", "pb_nsfw", 
                          "pb_background", "pb_hobbies", "pb_emo_happy", "pb_emo_angry", "pb_emo_sad", "pb_details"];
            
            keys.forEach(key => {
                const el = document.getElementById(key);
                if (el && data[key]) {
                    el.value = data[key];
                    if (el.tagName.toLowerCase() === 'textarea') {
                        el.style.height = 'auto';
                        el.style.height = el.scrollHeight + 'px';
                    }
                }
            });
            
            if(typeof showToast === 'function') {
                showToast("<i class='fas fa-check'></i> 灵魂注入完毕！");
            }

            // AI生成后，自动滚动回第一页
            scrollToPbPage(0);

        } else {
            alert("生成失败，请检查网络或更换 API。");
        }
    } catch (e) {
        alert("解析失败，AI 返回格式异常: " + e.message);
    } finally {
        btn.innerHTML = '<i class="fas fa-magic"></i>';
        btn.style.pointerEvents = 'auto';
    }
};

window.handlePbAvatarUpload = function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            let base64 = e.target.result;
            //如果全局有压缩函数，顺便压缩一下节约空间
            if (typeof compressImage === 'function') {
                base64 = await compressImage(base64, 300);
            }
            
            document.getElementById('pb_avatar_preview').src = base64;
            // 同步更新第三页的大封面
            const coverImg = document.getElementById('pb_cover_preview');
            if (coverImg) coverImg.src = base64;
            
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

// --- 5. 导入为微信好友 ---
window.importPersonaAsFriend = function() {
    const p = personasMeta[currentPersonaId];
    if (!p || !p.persona) {
        alert("请先填写并保存当前人设！");
        return;
    }

    const rName = p.pbData?.pb_realName || p.name || '新角色';
    const nickname = p.pbData?.pb_name || rName;
    
    // 直接复用 apps.js 里的好友添加逻辑
    const chatId = nickname || rName;
    
    if (friendsData[chatId]) {
        if (!confirm(`好友列表已存在 "${chatId}"，是否覆盖其人设？`)) {
            return;
        }
    }

    friendsData[chatId] = {
        realName: rName,
        remark: nickname,
        persona: p.persona,
        worldbook: '', // 可以后续在设置里绑
        greetingList: ["你好，我是" + rName],
        greetingSelected: 0,
        tavernGreeting: "你好，我是" + rName,
        greetingMode: 'tavern',
        greetingCustom: '',
        greeting: "你好，我是" + rName,
        avatar: p.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(rName)}`,
        mindState: {
            action: "刚刚被导入通讯录",
            location: "聊天界面",
            weather: "未知",
            murmur: "你好啊，未来的旅伴。",
            hiddenThought: "",
            kaomoji: "( ˙W˙ )",
            bgm: "No BGM"
        },
        chatSettings: {},
        summaryConfig: {
            turnCount: 20,
            wordCount: 200,
            prompt: ''
        },
        summaries: [],
        relationshipLog: []
    };

    if (typeof saveFriendsData === 'function') {
        saveFriendsData();
    }
    
    // UI 更新
    if (typeof rebuildContactsList === 'function') rebuildContactsList();
    
    // 在聊天列表插入
    const chatList = document.querySelector('#tab-chats');
    if (chatList) {
        const existingItem = chatList.querySelector(`.wc-chat-item[data-chat-id="${chatId}"]`);
        if (!existingItem) {
            // 复用 apps.js 的 addChatListEntry (如果是单聊)
            if (typeof addChatListEntry === 'function') {
                addChatListEntry(chatId, nickname, "你好，我是" + rName, friendsData[chatId].avatar, 'single');
            } else {
                 // Fallback 
                 const searchBar = chatList.querySelector('.wc-search-container');
                 const newItem = document.createElement('div');
                 newItem.className = 'wc-chat-item widget-1x1 sortable-item';
                 newItem.setAttribute('data-chat-id', chatId); 
                 newItem.onclick = function() { openChatDetail(chatId); }; 
                 newItem.innerHTML = `
                     <div class="wc-avatar"><img src="${friendsData[chatId].avatar}"></div>
                     <div class="wc-info">
                         <div class="wc-top-row"><span class="wc-name">${nickname}</span><span class="wc-time">Just now</span></div>
                         <div class="wc-msg-preview">你好，我是${rName}</div>
                     </div>
                 `;
                 if(searchBar && searchBar.nextSibling) chatList.insertBefore(newItem, searchBar.nextSibling);
                 else chatList.appendChild(newItem);
            }
        }
    }

    if (typeof showToast === 'function') {
        showToast(`<i class="fas fa-check"></i> 已成功将 "${nickname}" 导入为微信好友！`);
    } else {
        alert(`已成功将 "${nickname}" 导入为微信好友！`);
    }
};

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

// --- 进入具体身份设置页 ---
window.enterPersonaDetail = function(id) {
    currentPersonaId = id;
    localStorage.setItem('myCoolPhone_currentPersonaId', id);
    
    const galleryView = document.getElementById('pb-gallery-view');
    const slider = document.getElementById('pb-slider');
    const header = document.getElementById('pb-detail-header');
    const galleryBackBtn = document.getElementById('pb-gallery-back-btn'); // 找到外层的返回键
    
    if (galleryView) galleryView.style.display = 'none';
    if (galleryBackBtn) galleryBackBtn.style.display = 'none'; // 进详情页时隐藏它
    if (slider) slider.style.display = 'flex';
    if (header) header.style.display = 'flex'; 
    
    loadDataIntoBuilder();
    if (typeof renderPbWorldbooksAndChars === 'function') renderPbWorldbooksAndChars();
    if (typeof updatePbPagination === 'function') updatePbPagination();
};

// --- 从详情页退回扑克牌画廊 ---
window.backToPersonaGallery = function() {
    document.getElementById('pb-gallery-view').style.display = 'flex';
    document.getElementById('pb-slider').style.display = 'none';
    const header = document.getElementById('pb-detail-header');
    const galleryBackBtn = document.getElementById('pb-gallery-back-btn'); // 找到外层的返回键
    
    if (header) header.style.display = 'none';
    if (galleryBackBtn) galleryBackBtn.style.display = 'flex'; // 退回画廊时重新显示它
    renderPersonaGallery();
};


// --- 渲染扑克牌画廊 ---
function renderPersonaGallery() {
    const gallery = document.getElementById('pb-gallery-view');
    gallery.innerHTML = '';
    
    // 插入卡片
    Object.values(personasMeta || {}).forEach(p => {
        const card = document.createElement('div');
        card.className = 'pb-mag-card';
        card.onclick = () => enterPersonaDetail(p.id);
        
        card.innerHTML = `
            <img src="${p.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=400&auto=format&fit=crop'}">
            <div class="pb-mag-card-overlay">
                <div class="pb-mag-card-name">${p.name || 'Unknown'}</div>
                <div class="pb-mag-card-desc">PERSONALITY FILE.</div>
            </div>
        `;
        gallery.appendChild(card);
    });

    // 加号卡片
    const addCard = document.createElement('div');
    addCard.className = 'pb-mag-card-add';
    addCard.onclick = () => {
        const id = 'p_' + Date.now();
        personasMeta[id] = { id: id, name: '新身份', avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}` };
        IDB.set(PERSONA_META_KEY, personasMeta);
        enterPersonaDetail(id); 
    };
    addCard.innerHTML = `<i class="fas fa-plus"></i><span>CREATE NEW</span>`;
    gallery.appendChild(addCard);

      // === 🌟 核心：扑克牌 3D 扇形滑动效果 🌟 ===
    gallery.onscroll = () => {
        const cards = gallery.querySelectorAll('.pb-mag-card, .pb-mag-card-add');
        const center = gallery.scrollLeft + gallery.clientWidth / 2; 
        
        cards.forEach(card => {
            const cardCenter = card.offsetLeft + card.offsetWidth / 2; 
            const dist = Math.abs(center - cardCenter); 
            const maxDist = gallery.clientWidth;
            const progress = Math.min(dist / maxDist, 1);
            
            // 越靠近中心越大
            const scale = 1 - progress * 0.15;
            // 离中心越远，卡牌往下沉
            const translateY = progress * 60;
            // 像扇子一样向两侧倾斜
            const rotateZ = ((cardCenter - center) / maxDist) * 18;
            // 立体的侧边翻转
            const rotateY = ((cardCenter - center) / maxDist) * -35;

            // 综合应用 3D 变形
            card.style.transform = `scale(${scale}) translateY(${translateY}px) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`;
            
            // 越靠近中心的牌压在最上面
            card.style.zIndex = Math.round(1000 - dist);
            
            // 旁边的牌加上阴影变暗，凸显中间的牌
            card.style.filter = `brightness(${1 - progress * 0.4})`;
        });
    };
    
    // 初始化触发一次计算
    setTimeout(() => gallery.onscroll(), 50);

}
