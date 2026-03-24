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
    const app = document.getElementById('mapApp');
    if (app) {
        app.classList.add('open');
        loadMapsData();
        const mapIds = Object.keys(mapsData);
        if (mapIds.length > 0) {
            switchMapView(mapIds[0]);
        } else {
            openMapSetup(true); // 传入 true 表示是新建
        }
        renderMapList();
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
        container.innerHTML = '<div style="font-size:12px; color:#aaa; padding:10px;">无可用选项</div>';
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

    // 现在 populateChecklist 函数存在了，可以正常调用
    populateChecklist('map-setup-worldbooks', worldBooks.map(wb => ({ id: wb.id, name: wb.title })));
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

        const worldbookContents = Array.from(selectedWbCheckboxes).map(cb => {
            const wb = worldBooks.find(w => w.id === cb.value);
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
    canvas.innerHTML = '';

    // --- 原有的地点渲染逻辑 (保持不变) ---
    map.locations.forEach(loc => {
        const pin = document.createElement('div');
        pin.className = 'map-location-pin';
        pin.style.top = `${loc.y}%`;
        pin.style.left = `${loc.x}%`;
        pin.style.zIndex = Math.round(loc.y);
        pin.innerHTML = `
            <div class="pin-dot"></div>
            <div class="pin-label">${loc.name}</div>
        `;
        // [修改] 将点击事件统一到一个新函数
        pin.onclick = () => handleMapMarkerClick('location', loc.id);
        canvas.appendChild(pin);
    });

}

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
    choicesArea.innerHTML = ''; // 清空旧选项
    choicesArea.style.display = 'none'; // 默认隐藏选项区

    modal.classList.add('active');
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
