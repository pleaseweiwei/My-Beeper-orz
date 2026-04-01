/* =========================================
   [2.0 升级版] 电子宠物 (养成/性格/朋友圈)
   ========================================= */
const SHOP_DB = {
    travel: [
        { id: 't_bag', name: '便当', icon: '🍱', price: 50, desc: '普通的午餐，能去附近的公园。' },
        { id: 't_ticket', name: '火车票', icon: '🎫', price: 150, desc: '可以去远一点的城市。' },
        { id: 't_passport', name: '护照', icon: '✈️', price: 500, desc: '出国旅行必备！' },
        { id: 't_camera', name: '胶片机', icon: '📷', price: 300, desc: '能带回更清晰的照片。' }
    ],
    furniture: [
        { id: 'f_plant', name: '盆栽', icon: '🪴', price: 120, desc: '装饰房间，净化空气。' },
        { id: 'f_rug', name: '地毯', icon: '🧶', price: 200, desc: '看起来很暖和。' },
        { id: 'f_tv', name: '电视', icon: '📺', price: 800, desc: '复古小电视。' }
    ],
    toy: [
        { id: 'y_ball', name: '网球', icon: '🎾', price: 100, desc: '自己玩的滚来滚去。' },
        { id: 'y_bone', name: '骨头', icon: '🦴', price: 150, desc: '磨牙专用玩具。' },
        { id: 'y_box', name: '纸箱', icon: '📦', price: 50, desc: '最喜欢的藏身处。' },
        { id: 'y_yarn', name: '毛线团', icon: '🧶', price: 80, desc: '缠在一起的毛线。' }
    ]
};
// 全局气泡提示
window.showPetBubble = function(text, duration = 2500) {
    const bubble = document.getElementById('pet-bubble');
    if (!bubble) return;
    bubble.innerText = text;
    bubble.classList.add('show');
    if (window.petBubbleTimer) clearTimeout(window.petBubbleTimer);
    window.petBubbleTimer = setTimeout(() => {
        bubble.classList.remove('show');
    }, duration);
}

// 渲染大便
function renderPoops() {
    let layer = document.getElementById('poop-layer');
    if (!layer) {
        layer = document.createElement('div');
        layer.id = 'poop-layer';
        layer.style.position = 'absolute';
        layer.style.inset = '0';
        layer.style.pointerEvents = 'none'; // 防止阻挡点击
        document.getElementById('pet-room-stage').appendChild(layer);
    }
    layer.innerHTML = '';
    (petData.poops || []).forEach(p => {
        const el = document.createElement('div');
        el.style.position = 'absolute';
        el.style.left = p.x + 'px';
        el.style.top = p.y + 'px';
        el.style.fontSize = '20px';
        el.style.zIndex = Math.floor(p.y);
        el.innerText = '💩';
        el.style.userSelect = 'none';
        layer.appendChild(el);
    });
}


const PET_DATA_KEY = 'myCoolPhone_petData_v2'; // 使用新 Key 防止数据冲突

let petData = {
    // 基础属性
    name: '未命名',
    type: '小狗',
    personality: '憨憨',
    
    // 养成属性
    stage: 1,       // 当前阶段 1, 2, 3
    growth: 0,      // 成长值
    hunger: 80,
    mood: 80,
    stardust: 200,  // 货币
    
    // 社交属性
    ownerName: '主人', // 我的称呼
    targetAiId: '',   // 关联的 AI 好友 ID
    moments: [],      // 发过的朋友圈
    
    // 外观配置
    images: {
        1: 'https://api.dicebear.com/7.x/bottts/svg?seed=baby',
        2: 'https://api.dicebear.com/7.x/bottts/svg?seed=teen',
        3: 'https://api.dicebear.com/7.x/bottts/svg?seed=adult'
    },
    style: {
        wallColor: '#f0f4f8', wallImg: '',
        floorColor: '#fdfbf7', floorImg: '',
        windowFrame: '#333', windowBg: '#87ceeb', windowImg: ''
    },
    
    // 状态
    isTraveling: false,
    travelReturnTime: 0,
    inventory: [],
    placedFurniture: [],
    lastCheckInDate: '',
    travelInventory: [],
    polaroids: []
};

let petLoopTimer = null;
let currentUploadStage = 1; // 记录当前正在上传哪个阶段的图
let isDraggingPet = false;
let isDraggingFurniture = false;

// ==================== 1. 初始化与领养 ====================

window.openPetApp = function() {
    document.getElementById('petApp').classList.add('open');
    loadPetData();
    
    // 如果没有名字，说明还没领养，显示领养弹窗
    if (!petData.name || petData.name === '未命名') {
        openAdoptionModal();
    } else {
        initPetRoom();
        startPetLoop();
        checkTravelStatus();
    }
}

window.closePetApp = function() {
    document.getElementById('petApp').classList.remove('open');
    clearInterval(petLoopTimer);
}

function loadPetData() {
    const raw = localStorage.getItem(PET_DATA_KEY);
    if (raw) {
        // 合并数据，防止新字段丢失
        const saved = JSON.parse(raw);
        petData = { ...petData, ...saved };
        // 深度合并 style 和 images，防止覆盖默认值
        if (saved.style) petData.style = { ...petData.style, ...saved.style };
        if (saved.images) petData.images = { ...petData.images, ...saved.images };
    }
    updatePetStatsUI();
}

function savePetData() {
    localStorage.setItem(PET_DATA_KEY, JSON.stringify(petData));
    updatePetStatsUI();
}
function updatePetStatsUI() {
    // 根据成长值判断阶段
    // 阶段1: 0-100, 阶段2: 101-300, 阶段3: 300+
    let oldStage = petData.stage;
    if (petData.growth > 300) petData.stage = 3;
    else if (petData.growth > 100) petData.stage = 2;
    else petData.stage = 1;
    
    // 如果阶段升级了，弹窗庆祝
    if (petData.stage > oldStage) {
        showCustomDialog('🎉', `恭喜！${petData.name} 长大了！<br>进入第 ${petData.stage} 阶段！`);
        refreshPetImage();
    }

    const stageNames = ['幼年期', '成长期', '完全体'];
    const stageEl = document.getElementById('pet-stat-stage');
    if(stageEl) stageEl.innerText = stageNames[petData.stage - 1];
    
    const expEl = document.getElementById('pet-stat-exp');
    if(expEl) expEl.innerText = petData.growth;
    
    const hungerEl = document.getElementById('pet-stat-hunger');
    if(hungerEl) hungerEl.innerText = petData.hunger + '%';
    
    const moodEl = document.getElementById('pet-stat-mood');
    if(moodEl) moodEl.innerText = petData.mood + '%';
    
    const moneyEl = document.getElementById('pet-stat-money');
    if(moneyEl) moneyEl.innerText = petData.stardust;
}


// 刷新宠物显示的图片
function refreshPetImage() {
    const imgEl = document.getElementById('pet-img');
    const url = petData.images[petData.stage];
    if(url) imgEl.src = url;
}

// ==================== 2. 领养流程 ====================

function openAdoptionModal() {
    const modal = document.getElementById('pet-adoption-modal');
    modal.classList.add('active');
    switchAdoptStep(1);
    
    // 填充主人名 (从全局身份获取)
    const me = personasMeta[currentPersonaId];
    document.getElementById('adopt-owner-name').value = me.name || '我';
    
    // 填充 AI 列表
    const select = document.getElementById('adopt-target-ai');
    select.innerHTML = '<option value="">-- 选择一位 AI 好友 --</option>';
    Object.keys(friendsData).forEach(id => {
        const f = friendsData[id];
        const opt = document.createElement('option');
        opt.value = id;
        opt.text = f.remark || f.realName;
        select.appendChild(opt);
    });
}

// 退出领养流程并关闭宠物APP
window.cancelAdoption = function() {
    document.getElementById('pet-adoption-modal').classList.remove('active');
    closePetApp();
}

window.switchAdoptStep = function(step) {
    document.querySelectorAll('.pet-setup-step').forEach(el => el.classList.remove('active'));
    document.getElementById(`adopt-step-${step}`).classList.add('active');
}

// 切换显示自定义输入框
window.toggleCustomInput = function(field) {
    const select = document.getElementById(`adopt-pet-${field}`);
    const input = document.getElementById(`adopt-pet-${field}-custom`);
    if (select.value === 'custom') {
        input.style.display = 'block';
        input.focus();
    } else {
        input.style.display = 'none';
        input.value = '';
    }
}

window.confirmAdoption = function() {
    const ownerName = document.getElementById('adopt-owner-name').value;
    const aiId = document.getElementById('adopt-target-ai').value;
    const petName = document.getElementById('adopt-pet-name').value.trim();
    
    // 获取物种 (如果是自定义，取输入框的值)
    let type = document.getElementById('adopt-pet-type').value;
    if (type === 'custom') type = document.getElementById('adopt-pet-type-custom').value.trim();
    
    // 获取性格 (如果是自定义，取输入框的值)
    let personality = document.getElementById('adopt-pet-personality').value;
    if (personality === 'custom') personality = document.getElementById('adopt-pet-personality-custom').value.trim();
    
    if (!aiId) { alert("请选择一位 AI，这只宠物将连接你们的关系！"); return; }
    if (!petName) { alert("给宠物起个名字吧！"); return; }
    if (!type) { alert("请选择或输入物种！"); return; }
    if (!personality) { alert("请选择或输入性格！"); return; }
    
    // 保存数据
    petData.ownerName = ownerName;
    petData.targetAiId = aiId;
    petData.name = petName;
    petData.type = type;
    petData.personality = personality;
    
    // 给予初始奖励
    petData.growth = 0;
    petData.stage = 1;
    
    savePetData();
    document.getElementById('pet-adoption-modal').classList.remove('active');
    
    initPetRoom();
    startPetLoop();
    
    showCustomDialog('🥚', `领养成功！<br>${petName} 破壳而出啦！<br>快去和它互动吧~`);
}


// ==================== 3. 房间渲染与互动 ====================



function applyRoomStyles() {
    const s = petData.style;
    const stage = document.getElementById('pet-room-stage');
    const floor = document.getElementById('pet-floor-layer');
    const win = document.querySelector('.pet-window');
    
    // 墙壁
    stage.style.backgroundColor = s.wallColor;
    stage.style.backgroundImage = s.wallImg ? `url('${s.wallImg}')` : 'none';
    // 地板
    floor.style.backgroundColor = s.floorColor;
    floor.style.backgroundImage = s.floorImg ? `url('${s.floorImg}')` : 'none';
    // 窗户
    win.style.borderColor = s.windowFrame;
    win.style.backgroundColor = s.windowBg;
    win.style.backgroundImage = s.windowImg ? `url('${s.windowImg}')` : 'none';
}

// 宠物随机走动 + 翻转
function startPetLoop() {
    if (petLoopTimer) clearInterval(petLoopTimer);
    petLoopTimer = setInterval(() => {
        if (!petData.isTraveling && !isDraggingPet && Math.random() > 0.6) {
            petWander();
        }
    }, 4000);
}

// 点击互动：冒表情 + 气泡
window.petInteract = function(e) {
    if (e) e.stopPropagation();
    if (petData.isTraveling) return;
    
    // 随机表情
    const emojis = ['❤️', '✨', '🎵', '💢', '🦴', '💤'];
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    
    // 创建浮动元素
    const floatEl = document.createElement('div');
    floatEl.className = 'pet-reaction-float';
    floatEl.innerText = emoji;
    
    // 定位在鼠标点击处或宠物头顶
    const rect = document.getElementById('pet-entity').getBoundingClientRect();
    const x = e ? e.clientX : (rect.left + 40);
    const y = e ? e.clientY : (rect.top);
    
    floatEl.style.left = x + 'px';
    floatEl.style.top = y + 'px';
    document.body.appendChild(floatEl);
    
    setTimeout(() => floatEl.remove(), 1000);
    
    // 增加一点心情和成长
    petData.mood = Math.min(100, petData.mood + 2);
    petData.growth += 1;
    savePetData();
}

// ==================== 4. 宠物朋友圈 (Pet Moments) ====================

// 打开朋友圈视图
window.openPetMoments = function() {
    const view = document.getElementById('pet-moments-view');
    view.classList.add('show');
    
    // 【新增】打开朋友圈时，强制隐藏宠物实体，防止穿模
    const pet = document.getElementById('pet-entity');
    if (pet) pet.style.display = 'none';

    renderPetMomentsList();
}

// 关闭朋友圈视图
window.closePetMoments = function() {
    document.getElementById('pet-moments-view').classList.remove('show');
    
    // 【新增】关闭时，只有当宠物“没在旅行”时才显示出来
    if (!petData.isTraveling) {
        const pet = document.getElementById('pet-entity');
        if (pet) pet.style.display = 'flex';
    }
}

// 生成新动态 (调用 AI)
window.generatePetMoment = async function() {
    if (!petData.targetAiId) { alert("宠物还没有绑定 AI 好友，无法生成动态！"); return; }
    
    const aiFriend = friendsData[petData.targetAiId];
    if (!aiFriend) { alert("绑定的 AI 好友已不存在。"); return; }
    
    showToast("宠物正在观察生活... (生成中)");
    
    // 获取最近聊天记录作为素材
    const history = await loadChatHistory(petData.targetAiId);
    const recentChats = history.slice(-10).map(m => 
        `${m.senderName === 'ME' ? 'Owner' : aiFriend.realName}: ${m.text}`
    ).join('\n');
    
    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    if (!settingsJSON) { alert("请先配置 API Key"); return; }
    const settings = JSON.parse(settingsJSON);
    
    const systemPrompt = `
    You are roleplaying as a PET.
    
    [Pet Profile]
    Name: ${petData.name}
    Type: ${petData.type}
    Personality: ${petData.personality}
    Owner (You serve them): ${petData.ownerName} (Refer to as 主人/妈妈/爸爸 depending on context)
    Target AI (Owner's friend): ${aiFriend.realName} (Refer to as 那个男的/漂亮姐姐/坏人 depending on personality)
    
    [Task]
    Read the recent chat history between Owner and Target AI.
    Write a short, cute Social Media Post (Moment) from the PET's perspective.
    
    [Rules]
    1. STRICTLY SUPPORT THE OWNER. If they argued, bark at the AI. If they flirted, tease them or be jealous.
    2. Be cute and funny. Use emojis.
    3. Length: 30-60 words.
    4. NO "Female Competition" (雌竞). You just want snacks and Owner's love.
    5. Output ONLY the post content.
    
    [Recent Chat Context]
    ${recentChats || "(No recent chats, just talk about daily life)"}
    `;
    
    try {
        let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
        const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
        
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
            body: JSON.stringify({
                model: settings.model,
                messages: [{ role: "system", content: systemPrompt }],
                temperature: 0.8
            })
        });
        
        const data = await res.json();
        const content = data.choices[0].message.content.trim();
        
        // 保存动态
        const newMoment = {
            id: Date.now(),
            text: content,
            time: new Date().toLocaleString()
        };
        petData.moments.unshift(newMoment);
        
        // 消耗能量，增加成长
        petData.hunger -= 10;
        petData.growth += 20;
        savePetData();
        
        renderPetMomentsList();
        showToast("动态发布成功！");
        
    } catch (e) {
        alert("生成失败：" + e.message);
    }
}

function renderPetMomentsList() {
    const list = document.getElementById('pet-moments-list');
    list.innerHTML = '';
    
    if (petData.moments.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:40px; color:#999; font-size:12px;">空空如也... 点击右上角魔法棒生成第一条动态！</div>';
        return;
    }
    
    petData.moments.forEach(m => {
        const div = document.createElement('div');
        div.className = 'pet-moment-card';
        // 使用当前阶段的图片作为头像
        const avatar = petData.images[petData.stage];
        div.innerHTML = `
            <div class="pet-moment-header">
                <div class="pet-moment-avatar"><img src="${avatar}"></div>
                <div class="pet-moment-info">
                    <div class="pet-moment-name">${petData.name} 🐾</div>
                    <div class="pet-moment-time">${m.time}</div>
                </div>
            </div>
            <div class="pet-moment-text">${m.text}</div>
            <div class="pet-moment-action">
                <i class="fas fa-heart"></i> ${Math.floor(Math.random()*50)} Likes
            </div>
        `;
        list.appendChild(div);
    });
}

// ==================== 5. 设置与装扮 (Settings) ====================

window.openPetSettings = function() {
    document.getElementById('pet-settings-modal').classList.add('active');
    
    // 预览三个阶段的图片
    document.getElementById('prev-stage-1').src = petData.images[1];
    document.getElementById('prev-stage-2').src = petData.images[2];
    document.getElementById('prev-stage-3').src = petData.images[3];
    
    // 填充窗户颜色
    const winPicker = document.getElementById('win-bg-color');
    if(winPicker) winPicker.value = petData.style.windowBg;
}

window.switchPetSettingTab = function(tabName) {
    document.querySelectorAll('.pet-setting-tab').forEach(el => el.classList.remove('active'));
    // 这里简单处理，实际上你需要给tab按钮加id或者传this
    // 为了简化，直接切换 visibility
    if (tabName === 'appearance') {
        document.getElementById('pset-tab-appearance').style.display = 'block';
        document.getElementById('pset-tab-room').style.display = 'none';
    } else {
        document.getElementById('pset-tab-appearance').style.display = 'none';
        document.getElementById('pset-tab-room').style.display = 'block';
    }
}

// 图片上传处理
window.triggerPetImgUpload = function(stageNum) {
    currentUploadStage = stageNum;
    document.getElementById('pet-stage-file').click();
}

window.handlePetStageUpload = function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64 = e.target.result;
            // 存入对应阶段
            petData.images[currentUploadStage] = base64;
            // 更新预览
            document.getElementById(`prev-stage-${currentUploadStage}`).src = base64;
            
            // 如果当前正好是这个阶段，实时刷新宠物
            if (petData.stage === currentUploadStage) {
                refreshPetImage();
            }
            savePetData();
        };
        reader.readAsDataURL(input.files[0]);
    }
    input.value = '';
}

// 窗户装扮
window.setWindowFrame = function(color) {
    petData.style.windowFrame = color;
    applyRoomStyles();
    savePetData();
}
window.setWindowBg = function(color) {
    petData.style.windowBg = color;
    applyRoomStyles();
    savePetData();
}

// 统一图片上传 (墙壁/地板/窗景)
window.handlePetSettingImage = function(input, type) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64 = e.target.result;
            if (type === 'wall') petData.style.wallImg = base64;
            if (type === 'floor') petData.style.floorImg = base64;
            if (type === 'window') petData.style.windowImg = base64;
            applyRoomStyles();
            savePetData();
        };
        reader.readAsDataURL(input.files[0]);
    }
    input.value = '';
}

// ==================== 6. 基础养成功能 (喂食/玩耍/打扫) ====================

// 每日签到
window.petDailyCheckIn = function() {
    const today = new Date().toLocaleDateString();
    if (petData.lastCheckInDate === today) {
        showToast("今天已经领过啦！");
        return;
    }
    petData.lastCheckInDate = today;
    petData.stardust += 50;
    petData.growth += 10;
    savePetData();
    updatePetStatsUI();
    showCustomDialog('🎁', '签到成功！<br>星尘 +50, 成长 +10');
}

// ==================== 8. 商店、旅行、相册 (保持原逻辑，变量名适配) ====================

window.petOpenShop = function() {
    switchShopTab('goods');
    document.getElementById('pet-shop-modal').classList.add('active');
}
window.closePetShop = function() { document.getElementById('pet-shop-modal').classList.remove('active'); }

// 旅行
window.petTravel = function() {
    if (petData.isTraveling) {
        const remain = Math.ceil((petData.travelReturnTime - Date.now()) / 60000);
        showCustomDialog('🎒', `宠物正在旅行中...<br>预计 ${remain} 分钟后回来。`);
        return;
    }
    if (petData.travelInventory.length === 0) {
        showCustomDialog('❌', '背包空空的，不敢出门。<br>请去商店买点旅行用品吧！');
        return;
    }
    
    // 消耗
    const item = petData.travelInventory.pop();
    petData.isTraveling = true;
    petData.travelReturnTime = Date.now() + (Math.random() * 5 + 1) * 60 * 1000;
    
    const pet = document.getElementById('pet-entity');
    pet.style.transition = "left 3s ease-in";
    pet.style.left = "120%";
    
    setTimeout(() => {
        pet.style.display = 'none';
        savePetData();
        showCustomDialog('✈️', `它带着【${item.name}】出发了！`);
    }, 3000);
}

// 检查归来
async function checkTravelStatus() {
    if (!petData.isTraveling) return;
    if (Date.now() >= petData.travelReturnTime) {
        petData.isTraveling = false;
        petData.stardust += 100;
        
        // 生成明信片
        const keywords = ['forest', 'city', 'mountain', 'beach', 'cafe'];
        const keyword = keywords[Math.floor(Math.random() * keywords.length)];
        const imgUrl = `https://source.unsplash.com/400x300/?${keyword},black-and-white`;
        
        petData.polaroids.unshift({
            id: Date.now(),
            img: imgUrl,
            text: "外面的世界好大呀！",
            date: new Date().toLocaleDateString()
        });
        
        savePetData();
        showCustomDialog('📸', `旅行归来！<br>带回了一张拍立得和 100 星尘。`);
        
        const pet = document.getElementById('pet-entity');
        pet.style.display = 'flex';
        pet.style.left = '50%';
    }
}

// 相册
window.openPetAlbum = function() {
    const grid = document.getElementById('album-grid');
    grid.innerHTML = '';
    
    if (petData.polaroids.length === 0) {
        grid.innerHTML = '<div style="grid-column:span 2; text-align:center; padding:20px; color:#999; font-size:12px;">暂无回忆...快去旅行吧！</div>';
    } else {
        petData.polaroids.forEach(p => {
            const card = document.createElement('div');
            card.className = 'polaroid-card';
            card.onclick = function() { this.classList.toggle('flipped'); };
            card.innerHTML = `
                <div class="polaroid-inner">
                    <div class="polaroid-front"><div class="p-photo"><img src="${p.img}"></div></div>
                    <div class="polaroid-back"><div class="p-text">${p.text}</div></div>
                </div>
            `;
            grid.appendChild(card);
        });
    }
    document.getElementById('pet-album-modal').classList.add('active');
}

// 通用弹窗
function showCustomDialog(icon, htmlContent) {
    const overlay = document.getElementById('pet-custom-dialog');
    document.getElementById('pet-dialog-icon').innerText = icon;
    document.getElementById('pet-dialog-content').innerHTML = htmlContent;
    overlay.classList.add('active');
}
window.closePetDialog = function() { document.getElementById('pet-custom-dialog').classList.remove('active'); }
function initPetRoom() {
    refreshPetImage();
    applyRoomStyles();
    
    const layer = document.getElementById('furniture-layer');
    layer.innerHTML = '';
    petData.placedFurniture.forEach(item => spawnFurnitureElement(item));
    
    renderPoops(); // 初始化加载时渲染便便
    
    const pet = document.getElementById('pet-entity');
    pet.style.display = petData.isTraveling ? 'none' : 'flex';
    setupPetDrag();
}

function setupPetDrag() {
    const pet = document.getElementById('pet-entity');
    const room = document.getElementById('pet-room-stage');
    let offset = { x: 0, y: 0 };
    let isClick = true;

    pet.onpointerdown = function(e) {
        if (petData.isTraveling) return;
        isDraggingPet = true;
        isClick = true; 
        pet.classList.add('dragging');
        pet.setPointerCapture(e.pointerId); // 捕获指针，防止滑动丢失
        
        offset.x = e.clientX - pet.offsetLeft;
        offset.y = e.clientY - pet.offsetTop;

        showPetBubble("∑(っ°Д°;)っ 放开我！");

        function move(ev) {
            isClick = false; // 有移动就判定为拖拽
            let x = ev.clientX - offset.x;
            let y = ev.clientY - offset.y;
            if(y < 100) y = 100;
            if(y > room.clientHeight - 40) y = room.clientHeight - 40;
            if(x < 20) x = 20;
            if(x > room.clientWidth - 20) x = room.clientWidth - 20;
            pet.style.left = x + 'px';
            pet.style.top = y + 'px';
            pet.style.zIndex = Math.floor(y);
        }
        function stop(ev) {
            pet.releasePointerCapture(ev.pointerId);
            pet.removeEventListener('pointermove', move);
            pet.removeEventListener('pointerup', stop);
            isDraggingPet = false;
            pet.classList.remove('dragging');
            showPetBubble("(￣.￣) 平稳落地");
            
            if (isClick) { petInteract(ev); } // 原地点击触发互动
        }
        pet.addEventListener('pointermove', move);
        pet.addEventListener('pointerup', stop);
    };
}

function petWander() {
    const pet = document.getElementById('pet-entity');
    const room = document.getElementById('pet-room-stage');
    const currentLeft = pet.offsetLeft;
    const newX = Math.max(40, Math.min(room.clientWidth - 40, Math.random() * room.clientWidth));
    const newY = Math.random() * (room.clientHeight * 0.3) + room.clientHeight * 0.55;
    
    if (newX < currentLeft) pet.classList.add('flipped'); 
    else pet.classList.remove('flipped');
    
    pet.style.left = newX + 'px';
    pet.style.top = newY + 'px';
    pet.style.zIndex = Math.floor(newY);

    // 碰撞与接近检测
    const furnitures = document.querySelectorAll('.pet-furniture');
    let nearest = null;
    let minDistance = 60; // 判定半径
    
    furnitures.forEach(f => {
        const fx = parseFloat(f.style.left) || 0;
        const fy = parseFloat(f.style.top) || 0;
        const dist = Math.hypot(fx - newX, fy - newY);
        if (dist < minDistance) {
            minDistance = dist;
            nearest = f;
        }
    });

    if (nearest) {
        const type = nearest.dataset.type;
        const name = nearest.dataset.name;
        // 等它走到附近(约2.8秒)再冒出气泡
        setTimeout(() => {
            if (!isDraggingPet && !petData.isTraveling) {
                if (type === 'toy') {
                    const toyReactions = [`(≧∇≦)ﾉ 玩${name}!`, `ヾ(≧▽≦*)o 开心!`, `(p≧w≦q) 喜欢${name}`];
                    showPetBubble(toyReactions[Math.floor(Math.random() * toyReactions.length)]);
                    petData.mood = Math.min(100, petData.mood + 1);
                    updatePetStatsUI();
                } else if (type === 'furniture') {
                    const furnReactions = [`(。-ω-) 靠着${name}休息`, `( ˘ ³˘)♥ 舒服`, `(～﹃～)~zZ`];
                    showPetBubble(furnReactions[Math.floor(Math.random() * furnReactions.length)]);
                }
            }
        }, 2800);
    }
}
window.petFeed = function() {
    if (petData.isTraveling) { showToast("它不在家..."); return; }
    
    const today = new Date().toLocaleDateString();
    if(petData.lastInteractDate !== today) {
        petData.todayFeedCount = 0;
        petData.todayPlayCount = 0;
        petData.lastInteractDate = today;
    }
    
    if ((petData.todayFeedCount || 0) < 3) {
        petData.todayFeedCount = (petData.todayFeedCount || 0) + 1;
        executeFeed();
        showCustomDialog('🍖', `啊呜啊呜！吃饱啦！<br>成长值 +5<br><span style="font-size:10px;color:#999;">今日免费喂食剩余: ${3 - petData.todayFeedCount}次</span>`);
    } else {
        if (petData.stardust >= 10) {
            petData.stardust -= 10;
            executeFeed();
            showCustomDialog('🍖', `花费 10 星尘购买了高级口粮！<br>成长值 +5`);
        } else {
            showCustomDialog('💸', `星尘不足 10，无法购买食物！<br>请去打工或签到赚取星尘。`);
        }
    }
}

function executeFeed() {
    petData.hunger = Math.min(100, petData.hunger + 20);
    petData.growth += 5;
    if(!petData.poops) petData.poops = [];
    // 喂食后有40%几率拉便便
    if(Math.random() > 0.6) {
        petData.poops.push({ id: Date.now(), x: 30 + Math.random()*240, y: 300 });
        renderPoops();
    }
    savePetData();
    updatePetStatsUI();
}

window.petPlay = function() {
    if (petData.isTraveling) { showToast("它不在家..."); return; }
    
    const today = new Date().toLocaleDateString();
    if(petData.lastInteractDate !== today) {
        petData.todayFeedCount = 0;
        petData.todayPlayCount = 0;
        petData.lastInteractDate = today;
    }
    
    if ((petData.todayPlayCount || 0) < 3) {
        petData.todayPlayCount = (petData.todayPlayCount || 0) + 1;
        petData.mood = Math.min(100, petData.mood + 15);
        petData.growth += 5;
        savePetData();
        updatePetStatsUI();
        showCustomDialog('🎾', `追着跑了好久！开心！<br>成长值 +5<br><span style="font-size:10px;color:#999;">今日免费玩耍剩余: ${3 - petData.todayPlayCount}次</span>`);
    } else {
        if (petData.stardust >= 5) {
            petData.stardust -= 5;
            petData.mood = Math.min(100, petData.mood + 15);
            petData.growth += 5;
            savePetData();
            updatePetStatsUI();
            showCustomDialog('🎾', `花费 5 星尘买了新玩具陪它玩！<br>成长值 +5`);
        } else {
            showCustomDialog('💸', `星尘不足 5，没钱买新玩具啦！`);
        }
    }
}

window.petClean = function() {
    if (petData.isTraveling) return;
    
    if (!petData.poops || petData.poops.length === 0) {
        showCustomDialog('✨', '房间已经很干净啦，没有便便需要清理。');
        return;
    }
    const count = petData.poops.length;
    petData.poops = [];
    renderPoops();
    const reward = count * 5;
    petData.stardust += reward;
    savePetData();
    updatePetStatsUI();
    showCustomDialog('🧹', `清理了 ${count} 坨便便！<br>环境变好了，奖励 ${reward} 星尘。`);
}
window.switchShopTab = function(type) {
    document.querySelectorAll('.shop-tab').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-btn-${type}`).classList.add('active');
    renderShopList(type);
}

function renderShopList(type) {
    const list = document.getElementById('pet-shop-list');
    list.innerHTML = '';
    let items = [];
    if (type === 'goods') items = SHOP_DB.travel;
    else if (type === 'furniture') items = SHOP_DB.furniture;
    else if (type === 'toy') items = SHOP_DB.toy;
    
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'shop-item-card';
        div.style.cssText = 'display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee; align-items:center;';
        div.innerHTML = `
            <div style="display:flex; gap:10px; align-items:center;">
                <div style="font-size:24px;">${item.icon}</div>
                <div>
                    <div style="font-weight:700; font-size:13px;">${item.name}</div>
                    <div style="font-size:10px; color:#999;">${item.desc}</div>
                </div>
            </div>
            <button class="shop-buy-btn" onclick="buyItem('${type}', '${item.id}')" style="background:#333; color:#fff; border:none; padding:5px 12px; border-radius:15px; font-size:11px;">
                ${item.price} ✨
            </button>
        `;
        list.appendChild(div);
    });
}

window.buyItem = function(type, id) {
    let item;
    if (type === 'goods') item = SHOP_DB.travel.find(x => x.id === id);
    else if (type === 'furniture') item = SHOP_DB.furniture.find(x => x.id === id);
    else if (type === 'toy') item = SHOP_DB.toy.find(x => x.id === id);
    
    if (petData.stardust < item.price) {
        showCustomDialog('💸', '星尘不足！'); return;
    }
    petData.stardust -= item.price;
    
    if (type === 'goods') {
        if (!petData.travelInventory) petData.travelInventory = [];
        petData.travelInventory.push(item);
        showCustomDialog('🎒', `已购买 ${item.name}！<br>可以去旅行了。`);
    } else {
        if (!petData.inventory) petData.inventory = [];
        if (petData.inventory.includes(id)) { showCustomDialog('📦', '你已经有这个物品啦！'); return; }
        petData.inventory.push(id);
        if (!petData.placedFurniture) petData.placedFurniture = [];
        petData.placedFurniture.push({ id: id, x: 50 + Math.random()*100, y: 300 });
        initPetRoom();
        showCustomDialog('🛋️', `已购买 ${item.name}！`);
    }
    savePetData();
}

function spawnFurnitureElement(itemData) {
    let dbItem = SHOP_DB.furniture.find(x => x.id === itemData.id);
    let type = 'furniture';
    if (!dbItem) {
        dbItem = SHOP_DB.toy.find(x => x.id === itemData.id);
        type = 'toy';
    }
    if (!dbItem) return;

    const el = document.createElement('div');
    el.className = 'pet-furniture';
    el.innerHTML = dbItem.icon;
    el.style.left = itemData.x + 'px';
    el.style.top = itemData.y + 'px';
    el.dataset.type = type;
    el.dataset.name = dbItem.name;
    
    let startX, startY;
    el.onpointerdown = function(e) {
        isDraggingFurniture = true;
        el.setPointerCapture(e.pointerId);
        startX = e.clientX - el.offsetLeft;
        startY = e.clientY - el.offsetTop;
        el.classList.add('dragging');
        
        function onMove(ev) {
            el.style.left = (ev.clientX - startX) + 'px';
            el.style.top = (ev.clientY - startY) + 'px';
        }
        function onUp(ev) {
            el.releasePointerCapture(ev.pointerId);
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerup', onUp);
            el.classList.remove('dragging');
            isDraggingFurniture = false;
            itemData.x = parseFloat(el.style.left);
            itemData.y = parseFloat(el.style.top);
            savePetData();
        }
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
    };
    
    document.getElementById('furniture-layer').appendChild(el);
}