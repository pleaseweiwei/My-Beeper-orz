/* =========================================
   [全新] 地图 APP (韩系黑白灰艺术风格) - 修复版
   ========================================= */

// --- 1. 全局变量与数据结构 ---
const MAPS_DATA_KEY = 'myCoolPhone_mapsData';
let mapsData = {}; // 所有地图的数据 { mapId: { name, locations: [...] } }
let currentMapId = null; // 当前正在查看的地图 ID
let currentEditingLocationId = null; // 正在编辑的地点 ID

// --- 2. App 入口与主流程控制 ---
window.openMapApp = function() {
    try {
        console.log("正在打开地图...");
        const app = document.getElementById('mapApp');
        if (!app) {
            alert("找不到地图界面容器 #mapApp");
            return;
        }
        
        app.classList.add('open');
        console.log("界面已展开");
        
        loadMapsData();
        console.log("地图数据加载完成: ", mapsData);
        
        const mapIds = Object.keys(mapsData);
        if (mapIds.length > 0) {
            console.log("切换到现有地图: ", mapIds[0]);
            switchMapView(mapIds[0]);
        } else {
            console.log("没有地图，打开设置界面");
            openMapSetup(true); // 传入 true 表示是新建
        }
        
        renderMapList();
    } catch (e) {
        console.error("打开地图失败: ", e);
        alert("打开地图失败，错误信息:\n" + e.message + "\n\n如果您看到此提示，请截图反馈。");
    }
};

window.closeMapApp = function() {
    const app = document.getElementById('mapApp');
    if (app) {
        app.classList.remove('open');
    }
};

function loadMapsData() {
    const raw = localStorage.getItem(MAPS_DATA_KEY);
    mapsData = raw ? JSON.parse(raw) : {};
}

function saveMapsData() {
    localStorage.setItem(MAPS_DATA_KEY, JSON.stringify(mapsData));
}

function setMapActiveView(viewId) {
    ['map-main-view', 'map-setup-view'].forEach(id => {
        const view = document.getElementById(id);
        if (!view) return;
        view.classList.toggle('active', id === viewId);
    });
}

function switchMapView(mapId) {
    currentMapId = mapId;
    setMapActiveView('map-main-view');
    renderMapView();
    toggleMapSidebar(false);
}

// --- 3. 侧边栏与地图列表 ---
window.toggleMapSidebar = function(forceOpen) {
    const sidebar = document.getElementById('map-sidebar');
    if (forceOpen === true) {
        sidebar.classList.add('open');
    } else if (forceOpen === false) {
        sidebar.classList.remove('open');
    } else {
        sidebar.classList.toggle('open');
    }
};

function renderMapList() {
    const container = document.getElementById('map-list-container');
    container.innerHTML = '';
    Object.keys(mapsData).forEach(id => {
        const map = mapsData[id];
        const item = document.createElement('div');
        item.className = 'sidebar-btn map-list-item';
        if (id === currentMapId) {
            item.classList.add('active');
        }
        item.innerHTML = `<i class="fas fa-map"></i> ${map.name}`;
        item.onclick = () => switchMapView(id);
        container.appendChild(item);
    });
}

window.deleteCurrentMap = function() {
    if (!currentMapId || !mapsData[currentMapId]) {
        alert("没有可删除的地图。");
        return;
    }
    if (confirm(`确定要删除地图「${mapsData[currentMapId].name}」吗？`)) {
        delete mapsData[currentMapId];
        saveMapsData();
        currentMapId = null;
        closeMapApp();
    }
}

// --- 4. 地图生成设置 ---

// 【已补回】这个函数在上次修改中被意外删除了
function populateChecklist(containerId, items, selectedIds = []) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    if (!items || items.length === 0) {
        container.innerHTML = '<div style="font-size: calc(12px * var(--font-scale)); color:#aaa; padding:10px;">无可用选项</div>';
        return;
    }
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'checklist-item';
        div.innerHTML = `
            <input type="checkbox" value="${item.id}" ${selectedIds.includes(item.id) ? 'checked' : ''}>
            ${item.avatar ? `<img src="${item.avatar}" class="checklist-avatar">` : ''}
            <span class="checklist-name">${item.name}</span>
        `;
        container.appendChild(div);
    });
}

window.openMapSetup = function(isNew = false) {
    setMapActiveView('map-setup-view');

    document.getElementById('map-setup-name').value = isNew ? '' : (mapsData[currentMapId]?.name || '');
    document.getElementById('map-setup-loc-count').value = '5';

    // 【修复点 1】：安全获取 worldBooks 变量，防止用户未创建世界书时报错卡死白屏
    const wbList = (typeof worldBooks !== 'undefined' && Array.isArray(worldBooks)) ? worldBooks : [];
    populateChecklist('map-setup-worldbooks', wbList.map(wb => ({ id: wb.id, name: wb.title })));
    populateChecklist('map-setup-characters', Object.values(friendsData).map(f => ({ id: f.realName, name: f.remark || f.realName, avatar: f.avatar })));
};

window.closeMapSetup = function() {
    // 【核心修复】如果当前没有任何地图数据，用户又取消了生成地图，则直接退出地图App
    if (Object.keys(mapsData).length === 0) {
        setMapActiveView('map-main-view');
        closeMapApp();
        return;
    }

    setMapActiveView('map-main-view');
};


window.confirmGenerateMap = async function() {
    const mapName = document.getElementById('map-setup-name').value.trim() || "未命名地图";
    const locCount = parseInt(document.getElementById('map-setup-loc-count').value) || 5;

    const headerAction = document.querySelector('#map-setup-view .header-action');
    headerAction.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    headerAction.style.pointerEvents = 'none';

    try {
        // --- 1. 获取上下文信息 ---
        const selectedWbCheckboxes = document.querySelectorAll('#map-setup-worldbooks input:checked');
        const selectedCharCheckboxes = document.querySelectorAll('#map-setup-characters input:checked');

        // 【修复点 2】：同样的防止遍历世界书时因未定义而崩溃
        const wbList = (typeof worldBooks !== 'undefined' && Array.isArray(worldBooks)) ? worldBooks : [];
        const worldbookContents = Array.from(selectedWbCheckboxes).map(cb => {
            const wb = wbList.find(w => w.id === cb.value);
            if (!wb) return '';
            const entriesText = (wb.entries || [])
                .filter(entry => entry.enabled !== false)
                .map(entry => `关键词: ${entry.keys}\n设定: ${entry.content}`)
                .join('\n\n');
            return `【世界书: ${wb.title}】\n${entriesText}`;
        }).filter(Boolean).join('\n\n---\n\n');

        const characterPersonas = Array.from(selectedCharCheckboxes).map(cb => {
            const charRealName = cb.value;
            const characterId = Object.keys(friendsData).find(id => friendsData[id].realName === charRealName);
            const char = characterId ? friendsData[characterId] : null;
            if (!char) return '';
            return `【角色: ${char.remark || char.realName}】\n人设: ${char.persona}`;
        }).filter(Boolean).join('\n\n---\n\n');

        // --- 2. 构建 Prompt ---
        // (省略中间 Prompt 内容，保持与你的一致...)
        const systemPrompt = `You are an expert world-building assistant. You MUST respond in a valid JSON array format, and nothing else.`;
        const userPrompt = `
        Please generate ${locCount} significant locations for a map named "${mapName}".

        **Rules:**
        1.  Locations must be "macro" (e.g., districts, universities, landmarks), not "micro" (e.g., a specific bench).
        2.  The 'name' and 'desc' fields MUST be in Chinese.
        3.  The 'reason' field should explain the inspiration.
        4.  Use the provided context for inspiration. If no context, be creative.

        **Context:**
        [World-building Info]
        ${worldbookContents || "No specific world-building info provided."}

        [Character Info]
        ${characterPersonas || "No specific character info provided."}

        **Return ONLY a JSON array, like this example:**
        [
          {
            "name": "第七大道商业区",
            "desc": "城市最繁华的商业街，以其巨大的全息广告牌和奢侈品店而闻名。",
            "reason": "为角色'赛博黑客'提供一个执行任务或消费的典型场景。"
          }
        ]
        `.trim();


        // --- 3. 独立 API 调用 ---
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        if (!settings.apiKey || !settings.model) {
            throw new Error("请先在“API设置”中配置好 Key 和模型。");
        }

        let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
        const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

        const payload = {
            model: settings.model,
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
            temperature: 0.7
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API 请求失败: HTTP ${response.status}`);
        }

        const data = await response.json();
        const result = data.choices?.[0]?.message?.content;

        if (!result) {
            console.error("API 返回了空内容, 原始数据:", data);
            throw new Error("AI 未能返回任何内容。");
        }

        const cleanResult = result.replace(/```json/gi, '').replace(/```/g, '').trim();
        const locations = JSON.parse(cleanResult);

        if (!Array.isArray(locations)) {
            throw new Error("AI 返回的格式不是一个有效的数组。");
        }

        // --- 4. 成功后创建地图 ---
        const newMapId = 'map_' + Date.now();
        mapsData[newMapId] = {
            id: newMapId,
            name: mapName,
            locations: []
        };

        locations.forEach(loc => {
            if (loc.name) {
                mapsData[newMapId].locations.push({
                    id: 'loc_' + Date.now() + Math.random(),
                    name: loc.name,
                    desc: loc.desc || `(AI理由: ${loc.reason || '无'})`,
                    x: 10 + Math.random() * 80,
                    y: 15 + Math.random() * 70,
                    boundChars: []
                });
            }
        });

        saveMapsData();
        renderMapList();
        switchMapView(newMapId);
        closeMapSetup(); // 只有成功才关闭设置页

    } catch (error) {
        console.error("地图生成失败:", error);

        // 【核心修改】只弹窗提示，不创建空白地图，也不关闭设置页
        const errorMessage = `地图生成失败<br><br><b>错误:</b> ${error.message}<br><br>请检查您的 API 设置或网络连接后重试。`;
        if (typeof showKAlert === 'function') {
            showKAlert(errorMessage);
        } else {
            alert(errorMessage.replace(/<br\s*\/?>/g, '\n'));
        }

    } finally {
        // 无论成功失败，都恢复按钮状态
        headerAction.innerHTML = '生成';
        headerAction.style.pointerEvents = 'auto';
    }
};

function renderMapView() {
    const map = mapsData[currentMapId];
    if (!map) return;

    document.getElementById('map-header-title').innerText = map.name;
    const canvas = document.getElementById('map-canvas');
    
    // 清空现有的大头针（保留可能存在的其他背景层结构）
    const pinsContainer = document.getElementById('map-pins') || canvas;
    pinsContainer.innerHTML = '';

    // 渲染背景图
    const bgImg = document.getElementById('map-bg-img');
    if (bgImg) {
        if (map.bgImage) {
            bgImg.src = map.bgImage;
            bgImg.style.display = 'block';
        } else {
            bgImg.src = '';
            bgImg.style.display = 'none';
        }
    }

    // --- 新的地点渲染逻辑 (增加拖拽功能) ---
    map.locations.forEach(loc => {
        const pin = document.createElement('div');
        pin.className = 'map-location-pin';
        pin.style.top = `${loc.y}%`;
        pin.style.left = `${loc.x}%`;
        pin.style.zIndex = Math.round(loc.y);
        pin.style.cursor = 'grab'; // 提示可拖拽
        pin.innerHTML = `
            <div class="pin-dot"></div>
            <div class="pin-label">${loc.name}</div>
        `;
        
        let isDragging = false;
        let startX, startY;
        let initialPinX, initialPinY;

        pin.addEventListener('mousedown', startDrag);
        pin.addEventListener('touchstart', startDrag, {passive: false});

        function startDrag(e) {
            if (e.target.closest('.pin-label')) return; // 防止点击文字触发拖拽导致无法正常点击
            e.stopPropagation();
            if (e.type === 'touchstart') {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            } else {
                startX = e.clientX;
                startY = e.clientY;
            }
            initialPinX = loc.x;
            initialPinY = loc.y;
            
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('touchmove', onDrag, {passive: false});
            document.addEventListener('mouseup', endDrag);
            document.addEventListener('touchend', endDrag);
            pin.style.cursor = 'grabbing';
        }

        function onDrag(e) {
            isDragging = true;
            e.preventDefault();
            let currentX, currentY;
            if (e.type === 'touchmove') {
                currentX = e.touches[0].clientX;
                currentY = e.touches[0].clientY;
            } else {
                currentX = e.clientX;
                currentY = e.clientY;
            }
            
            const dx = currentX - startX;
            const dy = currentY - startY;
            
            // 使用 canvas 的尺寸计算百分比
            const rect = canvas.getBoundingClientRect();
            const percentDx = (dx / rect.width) * 100;
            const percentDy = (dy / rect.height) * 100;
            
            let newX = initialPinX + percentDx;
            let newY = initialPinY + percentDy;
            
            // 限制在 0-100 之间
            newX = Math.max(0, Math.min(100, newX));
            newY = Math.max(0, Math.min(100, newY));
            
            pin.style.left = `${newX}%`;
            pin.style.top = `${newY}%`;
            pin.style.zIndex = Math.round(newY);
            
            loc.tempX = newX;
            loc.tempY = newY;
        }

        function endDrag(e) {
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('touchmove', onDrag);
            document.removeEventListener('mouseup', endDrag);
            document.removeEventListener('touchend', endDrag);
            pin.style.cursor = 'grab';
            
            if (isDragging) {
                // 保存坐标
                loc.x = loc.tempX !== undefined ? loc.tempX : loc.x;
                loc.y = loc.tempY !== undefined ? loc.tempY : loc.y;
                saveMapsData();
                setTimeout(() => isDragging = false, 50); // 防止误触发 click
            }
        }

        // [修改] 将点击事件统一到一个新函数
        pin.onclick = (e) => {
            if (!isDragging) {
                handleMapMarkerClick('location', loc.id);
            }
        };
        
        pinsContainer.appendChild(pin);
    });

}

window.openMapBgSettings = function() {
    if (!currentMapId || !mapsData[currentMapId]) {
        alert("请先选择一个地图！");
        return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const map = mapsData[currentMapId];
                if (map) {
                    map.bgImage = evt.target.result;
                    saveMapsData();
                    renderMapView();
                    toggleMapSidebar(false);
                }
            };
            reader.readAsDataURL(file);
        }
    };
    input.click();
};

function handleMapMarkerClick(type, id) {
    if (type === 'location') {
        const map = mapsData[currentMapId];
        const loc = map.locations.find(l => l.id === id);
        if (loc) {
            openSceneModal(loc);
        }
    }
}



// --- 6. 地点编辑器弹窗 ---

window.openLocationEditor = function(locationId) {
    currentEditingLocationId = locationId;
    const modal = document.getElementById('map-location-editor-modal');
    const title = document.getElementById('location-editor-title');
    const deleteBtn = document.getElementById('location-delete-btn');

    if (locationId) { // 编辑
        const loc = mapsData[currentMapId].locations.find(l => l.id === locationId);
        title.innerText = "编辑地点";
        document.getElementById('location-editor-name').value = loc.name;
        document.getElementById('location-editor-desc').value = loc.desc;
        populateChecklist('location-editor-chars', Object.values(friendsData).map(f => ({ id: f.realName, name: f.remark || f.realName, avatar: f.avatar })), loc.boundChars);
        deleteBtn.style.display = 'block';
    } else { // 新增
        title.innerText = "添加新地点";
        document.getElementById('location-editor-name').value = '';
        document.getElementById('location-editor-desc').value = '';
        populateChecklist('location-editor-chars', Object.values(friendsData).map(f => ({ id: f.realName, name: f.remark || f.realName, avatar: f.avatar })), []);
        deleteBtn.style.display = 'none';
    }
    modal.classList.add('active');
};

window.closeLocationEditor = function() {
    document.getElementById('map-location-editor-modal').classList.remove('active');
    currentEditingLocationId = null;
};

window.confirmSaveLocation = function() {
    const name = document.getElementById('location-editor-name').value.trim();
    if (!name) {
        alert("地点名称不能为空！");
        return;
    }

    const desc = document.getElementById('location-editor-desc').value.trim();
    const charCheckboxes = document.querySelectorAll('#location-editor-chars input:checked');
    const boundChars = Array.from(charCheckboxes).map(cb => cb.value);

    if (currentEditingLocationId) { // 更新
        const loc = mapsData[currentMapId].locations.find(l => l.id === currentEditingLocationId);
        loc.name = name;
        loc.desc = desc;
        loc.boundChars = boundChars;
    } else { // 新增
        mapsData[currentMapId].locations.push({
            id: 'loc_' + Date.now(),
            name: name,
            desc: desc,
            x: 20 + Math.random() * 60,
            y: 20 + Math.random() * 60,
            boundChars: boundChars
        });
    }

    saveMapsData();
    renderMapView();
    closeLocationEditor();
};

window.deleteCurrentLocation = function() {
    if (!currentEditingLocationId) return;
    if (confirm("确定要删除这个地点吗？")) {
        const map = mapsData[currentMapId];
        map.locations = map.locations.filter(l => l.id !== currentEditingLocationId);
        saveMapsData();
        renderMapView();
        closeLocationEditor();
    }
}

// --- 7. 角色选择器弹窗 ---

function openCharSelector(location) {
    const modal = document.getElementById('map-char-selector-modal');
    document.getElementById('char-selector-title').innerText = `探索「${location.name}」`;
    const list = document.getElementById('char-selector-list');
    list.innerHTML = '';

    // 添加绑定的角色
    location.boundChars.forEach(charId => {
        const friend = Object.values(friendsData).find(f => f.realName === charId);
        if (friend) {
            const item = document.createElement('div');
            item.className = 'char-selector-item';
            item.innerHTML = `
                <div class="char-selector-avatar"><img src="${friend.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.realName}`}"></div>
                <div class="char-selector-name">${friend.remark || friend.realName}</div>
                <i class="fas fa-chevron-right" style="color:#ccc;"></i>
            `;
            item.onclick = () => {
                alert(`以 ${friend.remark || friend.realName} 的身份开始探索...`);
                closeCharSelector();
            };
            list.appendChild(item);
        }
    });

    // 查找包含这些角色的群聊
    Object.values(groupsData).forEach(group => {
        const hasAll = location.boundChars.every(charId => group.members.includes(charId));
        if (hasAll) {
            const item = document.createElement('div');
            item.className = 'char-selector-item is-group';
            item.innerHTML = `
                <div class="char-selector-avatar"><img src="https://api.dicebear.com/7.x/initials/svg?seed=${group.name}&backgroundColor=e5e5e5"></div>
                <div class="char-selector-name">${group.name} (群聊)</div>
                <i class="fas fa-chevron-right" style="color:#ccc;"></i>
            `;
            item.onclick = () => {
                alert(`以群聊「${group.name}」的模式开始探索...`);
                closeCharSelector();
            };
            list.appendChild(item);
        }
    });

    modal.classList.add('active');
}

window.closeCharSelector = function() {
    document.getElementById('map-char-selector-modal').classList.remove('active');
}

// --- 8. 【新功能】场景探索 (Situation Exploration) ---

let currentSceneLocation = null; // 记录当前探索的地点

// 打开场景简介/探索弹窗
function openSceneModal(location) {
    currentSceneLocation = location;
    const modal = document.getElementById('map-scene-modal');
    const title = document.getElementById('scene-modal-title');
    const desc = document.getElementById('scene-desc-text');
    const choicesArea = document.getElementById('scene-choices-area');

    title.innerText = location.name;
    desc.innerText = location.desc || "这里似乎没什么特别的...";
    
    // 显示选项区并提示正在生成事件
    choicesArea.style.display = 'block';
    choicesArea.innerHTML = '<div style="text-align:center; padding:15px; color:#888; font-size: calc(14px * var(--font-scale));"><i class="fas fa-spinner fa-spin"></i> 正在感知周围环境...</div>';

    modal.classList.add('active');

    // 触发 AI 生成场景随机事件
    generateSceneEvents(location).then(events => {
        choicesArea.innerHTML = '';
        events.forEach(evt => {
            const btn = document.createElement('button');
            btn.className = 'scene-choice-btn';
            btn.style.cssText = 'display:block; width:100%; padding:12px; margin-bottom:8px; background:rgba(0,0,0,0.05); border:1px solid rgba(0,0,0,0.1); border-radius:8px; text-align:left; cursor:pointer; transition:background 0.2s;';
            btn.onmouseover = () => btn.style.background = 'rgba(0,0,0,0.1)';
            btn.onmouseout = () => btn.style.background = 'rgba(0,0,0,0.05)';
            btn.innerHTML = `<i class="fas fa-random" style="color:#666; margin-right:8px;"></i> ${evt.text}`;
            btn.onclick = () => {
                startSceneEventChat(location, evt);
                closeSceneModal();
            };
            choicesArea.appendChild(btn);
        });
    }).catch(err => {
        choicesArea.innerHTML = `<div style="color:#d9534f; font-size: calc(13px * var(--font-scale)); text-align:center;">生成事件失败: ${err.message}</div>`;
    });
}

// 场景事件生成逻辑
async function generateSceneEvents(location) {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (!settings.apiKey || !settings.model) {
        throw new Error("请先在设置中配置 API Key");
    }

    const systemPrompt = `You are a text adventure game master. The player has arrived at a location. Generate 3 short event choices or actions they can take here. Return ONLY a JSON array of objects with a 'text' property in Chinese. Example: [{"text":"去周围的商店逛逛"}, {"text":"坐在长椅上观察路人"}, {"text":"寻找有没有可疑的线索"}]`;
    const userPrompt = `Location Name: ${location.name}\nDescription: ${location.desc}\nPlease generate 3 options.`;

    let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
    const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
        body: JSON.stringify({
            model: settings.model,
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
            temperature: 0.8
        })
    });

    if (!response.ok) throw new Error("API 请求异常");
    const data = await response.json();
    const result = data.choices?.[0]?.message?.content;
    if (!result) throw new Error("AI 未返回内容");
    
    const cleanResult = result.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleanResult);
}

// 事件点击后联动短信/聊天
function startSceneEventChat(location, eventChoice) {
    if (location.boundChars && location.boundChars.length > 0) {
        const charId = location.boundChars[0]; // 默认取第一个绑定的角色
        const friend = Object.values(friendsData).find(f => f.realName === charId);
        
        if (friend) {
            const msgText = `【场景探索】我来到了 ${location.name}。\n我决定：${eventChoice.text}`;
            const chatId = friend.id;
            
            if (typeof smsData === 'undefined') {
                alert("短信系统数据异常！");
                return;
            }
            
            if (!smsData[chatId]) smsData[chatId] = { unread: 0, messages: [] };
            
            smsData[chatId].messages.push({
                id: Date.now().toString(),
                sender: 'me',
                text: msgText,
                timestamp: new Date().toISOString()
            });
            if (typeof saveSMSData === 'function') saveSMSData();
            
            closeMapApp();
            
            if (typeof window.openSMSApp === 'function') {
                window.openSMSApp();
                setTimeout(() => {
                    if (typeof window.openChat === 'function') window.openChat(chatId);
                }, 300);
            } else {
                alert(`已记录行动：“${eventChoice.text}”\n请手动打开短信应用查看。`);
            }
        }
    } else {
        alert("该地点还没有绑定任何角色，无法触发专属剧情交流！\n(请在地点编辑器中绑定相关角色)");
    }
}

// 关闭场景弹窗
window.closeSceneModal = function() {
    document.getElementById('map-scene-modal').classList.remove('active');
    currentSceneLocation = null;
}

// 修正后的代码
window.openLocationEditorForCurrent = function() {
    if (!currentSceneLocation) return;

    // 【核心修正】在关闭弹窗之前，先把需要的信息存起来
    const locationToEdit = currentSceneLocation;

    closeSceneModal(); // 现在可以安全地关闭弹窗了，因为它会把全局的 currentSceneLocation 设为 null

    // 延迟打开，避免动画冲突
    setTimeout(() => {
        // 使用刚才保存的局部变量 locationToEdit，而不是已经被清空的全局变量
        openLocationEditor(locationToEdit.id);
    }, 100);
};
