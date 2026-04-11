
/* =========================================
   [新增] WorldBook Manager (世界书核心逻辑)
   ========================================= */

const WORLDBOOK_KEY = 'myCoolPhone_worldBooks';
let worldBooks = []; // 内存中的世界书列表
let currentBookId = null; // 当前正在编辑的书ID
let tempEntries = []; // 当前正在编辑的条目缓存
let editingEntryIndex = -1; // 当前正在编辑的条目索引

function wbQueueUiWrite(fn) {
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => requestAnimationFrame(fn));
    } else {
        setTimeout(fn, 16);
    }
}

function wbSetSoftDisplay(el, visible, displayMode = 'block') {
    if (!el) return;
    if (visible) {
        el.hidden = false;
        el.style.display = displayMode;
    } else {
        el.hidden = true;
        el.style.display = 'none';
    }
}

function wbSwitchMainView(viewName) {
    const shelfView = document.getElementById('wb-shelf-view');
    const detailView = document.getElementById('wb-detail-view');

    wbQueueUiWrite(() => {
        wbSetSoftDisplay(shelfView, viewName === 'shelf', 'block');
        wbSetSoftDisplay(detailView, viewName === 'detail', 'block');
    });
}

// 1. 初始化与打开App
document.addEventListener('DOMContentLoaded', () => {
    loadWorldBooks();
    
    // 绑定主屏幕的世界书图标点击事件 (关键一步)
    const wbIcon = document.querySelector('.app-cell[data-app-id="worldbook"]');
    if(wbIcon) {
        wbIcon.onclick = openWorldBookApp;
    }
});

// [修改版] 异步加载世界书 (支持 LocalStorage -> IndexedDB 自动迁移)
async function loadWorldBooks() {
    try {
        // 1. 尝试从大容量数据库加载
        let data = await IDB.get(WORLDBOOK_KEY);
        
        // 2. 如果数据库为空，尝试从旧的 LocalStorage 迁移数据
        if (!data) {
            const oldData = localStorage.getItem(WORLDBOOK_KEY);
            if (oldData) {
                console.log("正在将世界书迁移至 IndexedDB...");
                try {
                    data = JSON.parse(oldData);
                    await IDB.set(WORLDBOOK_KEY, data); // 存入新库
                    // localStorage.removeItem(WORLDBOOK_KEY); // 可选：迁移后删除旧数据释放空间
                } catch(e) { 
                    console.error("旧数据解析失败", e); 
                    data = null; 
                }
            }
        }

        // 3. 赋值给全局变量
        if(data && Array.isArray(data)) {
            worldBooks = data;
        } else {
    // 初始化一个空的世界书列表
    worldBooks = [];
    saveWorldBooksData(); // 保存这个空状态
}

        console.log(`世界书加载完毕，共 ${worldBooks.length} 本`);
        
        // 4. 如果书架界面已打开，刷新一下UI
        const app = document.getElementById('worldBookApp');
        if(app && app.classList.contains('open')) {
            renderShelf();
        }

    } catch (e) {
        console.error("加载世界书出错:", e);
        worldBooks = [];
    }
}

// [修改版] 异步保存世界书 (不再受 5MB 限制)
async function saveWorldBooksData() {
    try {
        if (typeof worldBooks === 'undefined') window.worldBooks = [];
        // 使用 IDB.set 代替 localStorage.setItem
        await IDB.set(WORLDBOOK_KEY, worldBooks);
        // console.log("世界书已保存 (IndexedDB)");
    } catch (e) {
        console.error("保存世界书失败:", e);
        alert("保存失败，请检查浏览器空间或隐私设置。");
    }
}



// 打开 APP
window.openWorldBookApp = function() {
    const app = document.getElementById('worldBookApp');
    if(app) {
        app.classList.add('open');
        renderShelf();
        // 默认显示书架，隐藏详情
        wbSwitchMainView('shelf');
    }
}

window.closeWorldBookApp = function() {
    document.getElementById('worldBookApp').classList.remove('open');
}

// 2. 渲染书架
function renderShelf(filterText = '') {
    const container = document.getElementById('wb-list-container');
    container.innerHTML = '';
    
    worldBooks.forEach(book => {
        if(filterText && !book.title.toLowerCase().includes(filterText.toLowerCase())) return;
        
        const card = document.createElement('div');
        card.className = 'wb-book-card';
        // 随机侧边颜色
        const colors = ['#ff7e67', '#07c160', '#2b2b2b', '#1890ff', '#fadb14'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        
        card.innerHTML = `
            <style>.wb-book-card:hover::before{background:${color}!important}</style>
            <div class="wb-card-title">${book.title}</div>
            <div class="wb-card-meta">
                <span class="wb-tag-badge">${book.category || 'General'}</span>
                <span>${book.entries.length} 条目</span>
            </div>
            ${book.global ? '<i class="fas fa-globe" style="position:absolute; top:10px; right:10px; font-size:12px; color:#ddd;"></i>' : ''}
        `;
        card.style.borderLeft = `4px solid ${color}`;
        
        card.onclick = () => openBookDetail(book.id);
        container.appendChild(card);
    });
}

window.filterWorldBooks = function(val) {
    renderShelf(val);
}

// 3. 详情页逻辑
function openBookDetail(id) {
    currentBookId = id;
    const book = worldBooks.find(b => b.id === id);
    if(!book) return;

    // 填充元数据
    document.getElementById('wb-edit-title').value = book.title;
    document.getElementById('wb-edit-category').value = book.category || '';
    document.getElementById('wb-edit-global').checked = book.global || false;
    document.getElementById('wb-edit-strategy').value = book.strategy || 'depth';

    // 缓存条目并渲染
    tempEntries = JSON.parse(JSON.stringify(book.entries || []));
    renderEntriesList();

    // 切换视图
    wbSwitchMainView('detail');
}

function renderEntriesList() {
    const list = document.getElementById('wb-entries-list');
    list.innerHTML = '';
    
    tempEntries.forEach((entry, index) => {
        const item = document.createElement('div');
        item.className = 'wb-entry-item';
        item.innerHTML = `
            <div class="wb-entry-info">
                <div class="wb-entry-keys">${entry.comment || '(No Comment)'}</div>
                <div class="wb-entry-preview">${entry.content || '...'}</div>
            </div>
            <div style="font-size:12px; color:${entry.enabled ? '#07c160' : '#ccc'};">
                <i class="fas fa-circle"></i>
            </div>
        `;
        item.onclick = () => openEntryModal(index);
        list.appendChild(item);
    });
}

window.backToShelf = function() {
    wbSwitchMainView('shelf');
    currentBookId = null;
}

// 4. 新建与保存书籍
window.createNewWorldBook = function() {
    const newId = 'wb_' + Date.now();
    const newBook = {
        id: newId,
        title: "新世界书",
        category: "General",
        global: false,
        entries: []
    };
    worldBooks.push(newBook);
    saveWorldBooksData();
    openBookDetail(newId);
}

window.saveCurrentWorldBook = function() {
    if(!currentBookId) return;
    const book = worldBooks.find(b => b.id === currentBookId);
    
    book.title = document.getElementById('wb-edit-title').value;
    book.category = document.getElementById('wb-edit-category').value;
    book.global = document.getElementById('wb-edit-global').checked;
    book.strategy = document.getElementById('wb-edit-strategy').value;
    book.entries = tempEntries;

    saveWorldBooksData();
    alert('世界书已保存！');
}

window.deleteCurrentWorldBook = function() {
    if(confirm("确定要删除这本世界书吗？无法恢复。")) {
        worldBooks = worldBooks.filter(b => b.id !== currentBookId);
        saveWorldBooksData();
        backToShelf();
        renderShelf();
    }
}

// 5. 条目编辑逻辑 (Modal)
window.addNewEntry = function() {
    openEntryModal(-1); // -1 表示新建
}

window.openEntryModal = function(index) {
    editingEntryIndex = index;
    const modal = document.getElementById('wb-entry-modal');
    
    if(index === -1) {
        // 新建：清空
        document.getElementById('entry-keys').value = '';
        document.getElementById('entry-content').value = '';
        document.getElementById('entry-comment').value = '';
        document.getElementById('entry-enabled').checked = true;
        document.getElementById('entry-position').value = 'before_char';
        document.getElementById('entry-depth').value = '2';
        document.getElementById('entry-depth-container').style.display = 'none';
    } else {
        // 编辑：填充
        const entry = tempEntries[index];
        document.getElementById('entry-keys').value = entry.keys || '';
        document.getElementById('entry-content').value = entry.content || '';
        document.getElementById('entry-comment').value = entry.comment || '';
        document.getElementById('entry-enabled').checked = entry.enabled !== false;
        document.getElementById('entry-position').value = entry.position || 'before_char';
        document.getElementById('entry-depth').value = entry.depth || '2';
        document.getElementById('entry-depth-container').style.display = entry.position === 'depth' ? 'block' : 'none';
    }
    
    modal.classList.add('active');
}

window.closeEntryModal = function() {
    document.getElementById('wb-entry-modal').classList.remove('active');
}

window.saveEntryToMemory = function() {
    const keys = document.getElementById('entry-keys').value;
    const content = document.getElementById('entry-content').value;
    const comment = document.getElementById('entry-comment').value;
    const enabled = document.getElementById('entry-enabled').checked;
    const position = document.getElementById('entry-position').value;
    const depth = parseInt(document.getElementById('entry-depth').value) || 2;

    if(!content) { alert("内容不能为空"); return; }

    const entryData = { keys, content, comment, enabled, position, depth };

    if(editingEntryIndex === -1) {
        tempEntries.push(entryData);
    } else {
        tempEntries[editingEntryIndex] = entryData;
    }
    
    renderEntriesList();
    closeEntryModal();
}

window.deleteCurrentEntry = function() {
    if(editingEntryIndex !== -1) {
        tempEntries.splice(editingEntryIndex, 1);
        renderEntriesList();
    }
    closeEntryModal();
}

// 6. 导入导出逻辑 (JSON / TXT / DOCX Hook)
window.triggerWorldBookImport = function() {
    document.getElementById('wb-import-input').click();
}

window.handleWorldBookImport = function(input) {
    const file = input.files[0];
    if(!file) return;
    
    const fileName = file.name;
    const ext = fileName.split('.').pop().toLowerCase();
    
    if(ext === 'docx') {
        alert("DOCX 提示：请将 DOCX 文件另存为 .txt 后再导入，这样最稳定。");
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const result = e.target.result;
        
        try {
            if(ext === 'json') {
                // 尝试解析 JSON
                const json = JSON.parse(result);
                let newEntries = [];
                // 适配逻辑: Tavern 格式通常是 { entries: [...] }
                if(Array.isArray(json)) newEntries = json; 
                else if(json.entries) newEntries = json.entries;
                else newEntries = [json]; 
                
                // 简单的字段映射
                const mappedEntries = newEntries.map(it => ({
                    keys: it.keys || it.key || it.keywords || '',
                    content: it.content || it.value || '',
                    comment: it.comment || it.remark || '',
                    enabled: it.enabled !== false
                }));

                const newBook = {
                    id: 'wb_imp_' + Date.now(),
                    title: fileName.replace('.json', ''),
                    category: 'Imported',
                    global: false,
                    entries: mappedEntries
                };
                
                worldBooks.push(newBook);
                saveWorldBooksData();
                renderShelf();
                alert(`成功导入: ${newBook.title}`);

            } else {
                // TXT 导入：整个文件作为一个条目
                const newBook = {
                    id: 'wb_txt_' + Date.now(),
                    title: fileName,
                    category: 'Text Import',
                    global: false,
                    entries: [{
                        keys: fileName.replace('.txt', ''), // 默认用文件名做触发词
                        content: result,
                        comment: 'Imported from TXT',
                        enabled: true
                    }]
                };
                worldBooks.push(newBook);
                saveWorldBooksData();
                renderShelf();
                alert('TXT 文件已导入，请记得去编辑触发关键词。');
            }
        } catch(err) {
            alert("导入失败: " + err.message);
        }
    };
    reader.readAsText(file);
    input.value = '';
}

window.exportCurrentWorldBook = function() {
    if(!currentBookId) return;
    const book = worldBooks.find(b => b.id === currentBookId);
    
    // 导出标准 JSON
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(book, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `${book.title}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

// 7. [核心] 将世界书逻辑注入到 AI 对话中
// 返回格式: { before_char: "...", after_char: "...", depth_items: [{depth: 2, content: "..."}] }
function constructWorldInfoPrompt(userMessage, characterName) {
    let results = {
        before_char: [],
        after_char: [],
        depth_items: []
    };
    
    // 获取关联的世界书ID（支持私聊和群聊）
    let linkedBookIds = [];
    if (characterName) {
        if (friendsData && friendsData[characterName]) {
            // 私聊：直接获取该角色的世界书
            const charWb = friendsData[characterName].worldbook;
            if (Array.isArray(charWb)) linkedBookIds = [...charWb];
            else if (charWb) linkedBookIds = [charWb];
        } else if (typeof groupsData !== 'undefined' && groupsData[characterName]) {
            // 群聊：合并群内所有成员的世界书
            const group = groupsData[characterName];
            if (group && group.members) {
                group.members.forEach(memberId => {
                    if (friendsData && friendsData[memberId]) {
                        const charWb = friendsData[memberId].worldbook;
                        let memberWbs = [];
                        if (Array.isArray(charWb)) memberWbs = charWb;
                        else if (charWb) memberWbs = [charWb];
                        
                        memberWbs.forEach(wbId => {
                            if (!linkedBookIds.includes(wbId)) {
                                linkedBookIds.push(wbId);
                            }
                        });
                    }
                });
            }
        }
    }
    
    // 遍历所有世界书
    worldBooks.forEach(book => {
        // 条件：要么是全局开启，要么是当前角色关联的
        const isLinked = linkedBookIds.includes(book.id);
        if (book.global || isLinked) {
            book.entries.forEach(entry => {
                if(!entry.enabled) return;
                
                let shouldInject = false;
                const keysStr = (entry.keys || '').trim();
                
                // 1. 如果没有填写关键词，视为“常驻设定”，无条件读取
                if (!keysStr) {
                    shouldInject = true;
                } else {
                    // 2. 如果有关键词，进行动态匹配（支持中英文逗号分隔）
                    const keywords = keysStr.split(/[,，]/).map(k => k.trim()).filter(k => k);
                    const targetText = (userMessage || '');
                    
                    // 只要用户的消息中包含任意一个关键词，就触发该条目
                    shouldInject = keywords.some(k => targetText.includes(k));
                }

                if (shouldInject) {
                    const pos = entry.position || 'before_char';
                    const formattedContent = `[World Info: ${book.title}]\n${entry.content}`;
                    
                    if (pos === 'before_char') {
                        results.before_char.push(formattedContent);
                    } else if (pos === 'after_char') {
                        results.after_char.push(formattedContent);
                    } else if (pos === 'depth') {
                        results.depth_items.push({
                            depth: entry.depth || 2,
                            content: formattedContent
                        });
                    }
                }
            });
        }
    });

    return {
        before_char: results.before_char.length > 0 ? `<WorldInfo>\n${results.before_char.join('\n\n')}\n</WorldInfo>` : '',
        after_char: results.after_char.length > 0 ? `<WorldInfo>\n${results.after_char.join('\n\n')}\n</WorldInfo>` : '',
        depth_items: results.depth_items
    };
}
