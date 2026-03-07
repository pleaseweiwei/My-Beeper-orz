// js/apps.js (完整功能版：AI + 高级主题 + CSS美化 + 预设)

// --- LocalStorage Keys ---
const SETTINGS_KEY = 'myCoolPhone_aiSettings';
const PRESETS_KEY = 'myCoolPhone_aiPresets';
const THEME_KEY = 'myCoolPhone_themeSettings';
const ICONS_KEY = 'myCoolPhone_customIcons';
const THEME_PRESETS_KEY = 'myCoolPhone_themePresets'; // 新增：主题预设Key
// 【新增】用于存储所有好友数据的 Key
const FRIENDS_DATA_KEY = 'myCoolPhone_friendsData';
const HOME_CUSTOM_KEY = 'myCoolPhone_homeCustom';
const MOMENTS_FEED_KEY = 'myCoolPhone_momentsFeed';

// === 【新增】存放当前角色的心声状态 ===
let currentMindState = {
    action: "正在发呆",
    location: "未知地点",
    weather: "晴",
    murmur: "...",
    hiddenThought: "..."
};
// === [插入] 线下模式与预设的全局变量 ===
const PRESETS_DATA_KEY = 'myCoolPhone_tavernPresets';
const OFFLINE_CONFIG_KEY = 'myCoolPhone_offlineConfig';
let tavernPresets = [];
let offlineConfig = { activePresetId: 'default', maxLength: 200 };
let currentModifyingMsgId = null; // 用于记录当前正在修改哪条消息

let currentReplyTarget = null; // 记录朋友圈回复目标

// --- 预定义模型 ---
const PREDEFINED_MODELS = {
    gemini: ['gemini-pro', 'gemini-1.5-pro-latest', 'gemini-1.5-flash'],
    claude: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
    deepseek: ['deepseek-chat', 'deepseek-coder'], 
    custom: [] 
};
// === Simple IndexedDB Wrapper (用于存储大量数据) ===
const dbName = 'MyCoolPhoneDB';
const storeName = 'largeDataStore';

const IDB = {
    db: null,
    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName);
                }
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };
            request.onerror = (e) => reject(e);
        });
    },
    async set(key, value) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.put(value, key);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    },
    async get(key) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },
    async delete(key) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.delete(key);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    }
};

// === 迁移函数：将旧的 LocalStorage 聊天记录迁移到 IndexedDB ===
async function migrateAllChatHistory() {
    const CHAT_HISTORY_KEY = 'myCoolPhone_chatHistory';
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    if (raw) {
        console.log('正在迁移聊天记录到 IndexedDB...');
        try {
            const allHistory = JSON.parse(raw);
            const promises = [];
            for (const chatId in allHistory) {
                if (allHistory.hasOwnProperty(chatId)) {
                    // 使用新的 key 格式: chat_history_{chatId}
                    promises.push(IDB.set('chat_history_' + chatId, allHistory[chatId]));
                }
            }
            await Promise.all(promises);
            // 迁移成功后删除旧数据
            localStorage.removeItem(CHAT_HISTORY_KEY);
            console.log('聊天记录迁移完成。');
        } catch (e) {
            console.error('聊天记录迁移失败:', e);
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // js/apps.js - DOMContentLoaded 内部顶部
    
    // 执行迁移
    await migrateAllChatHistory();
initPersonaSystem();
applyPersonaToUI();

    // === 自测代码 (Self Test) ===
    setTimeout(async () => {
        console.log('>>> 开始执行 IDB 自测 <<<');
        try {
            await IDB.set('test_key_v2', 'test_value_v2');
            const val = await IDB.get('test_key_v2');
            console.log('IDB 读写测试结果:', val === 'test_value_v2' ? 'PASS' : 'FAIL', val);
            
            await saveMessageToHistory('SelfTestChat', {text: 'test msg', type: 'sent'});
            const history = await loadChatHistory('SelfTestChat');
            const lastMsg = history[history.length - 1];
            console.log('聊天记录读写测试结果:', (lastMsg && lastMsg.text === 'test msg') ? 'PASS' : 'FAIL', history);
            
            // alert(`IDB Test: ${val === 'test_value_v2' ? 'PASS' : 'FAIL'}\nChat Test: ${(lastMsg && lastMsg.text === 'test msg') ? 'PASS' : 'FAIL'}`);
        } catch (e) {
            console.error('自测失败:', e);
            // alert('自测失败: ' + e.message);
        }
    }, 3000);

    
    // === [Bono机 开机动画] ===
    setTimeout(() => {
        const bootScreen = document.getElementById('boot-screen');
        if (bootScreen) {
            bootScreen.classList.add('fade-out'); // 添加淡出类
            setTimeout(() => {
                bootScreen.remove(); // 动画完后移除元素
            }, 800); 
        }
    }, 2800); // 3.2秒后消失，稍微多留一点时间展示动画细节


    initializeGreetingTypewriter();
    initSettingsAndPresets(); 
    initOfflineSystem(); // 启动预设系统
    initThemeSettings(); // 初始化主题
    


 // 【新增】页面加载时，从本地存储读取好友数据
    loadFriendsData();
    // 新增：加载朋友圈数据
    loadMomentsFeed();


    // --- 事件绑定 ---
    // ... 后面的代码不变 ...

    // --- 事件绑定 ---
    const settingsView = document.getElementById('settingsView');
    if(settingsView) {
        document.getElementById('api-provider-select').addEventListener('change', (e) => updateUIForProvider(e.target.value));
        document.getElementById('save-settings-btn').addEventListener('click', saveAllSettings);
        document.getElementById('fetch-models-btn').addEventListener('click', fetchAndPopulateModels);
        
        // AI 预设相关
        document.getElementById('save-preset-btn').addEventListener('click', saveNewPreset);
        document.getElementById('preset-select').addEventListener('change', applySelectedPreset);

        const tempSlider = document.getElementById('temperature-slider');
        const tempValue = document.getElementById('temperature-value');
        tempSlider.addEventListener('input', () => tempValue.textContent = tempSlider.value);
    }

        // === 修改后的发送逻辑 ===
    
    // 全局变量，用来记录最后一条用户发送的消息内容
    // 这样点击 AI 图标时，才知道要回复什么
    let lastUserMessageForAI = ""; 

    const chatForm = document.getElementById('chatForm');
    if(chatForm) {
                // 1. 发送按钮 / 回车键逻辑：只发送普通文本，不再判断语音模式
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('chatInput');
            const message = input.value.trim();
            if (!message) return;

            lastUserMessageForAI = message;

            // 强制上屏普通的文本气泡
            appendMessage(message, 'sent');

            if (currentChatId) {
                saveMessageToHistory(currentChatId, {
                    text: message,
                    type: 'sent',
                    senderName: 'ME'
                });
            }

            // 清空输入框
            input.value = '';
        });

        
        // 2. AI 回复图标逻辑：点击后触发 AI (智能读取上下文)
        const aiBtn = document.getElementById('triggerAiReply');
        if (aiBtn) {
            aiBtn.addEventListener('click', async () => {
                // 1. 获取当前聊天的历史记录
                const history = await loadChatHistory(currentChatId);
                let contextMessages = [];

                // 2. 倒序查找，直到找到最后一条 AI 发的消息 (type === 'received')
                // 这样就把“上一次回复到现在”的所有用户消息都收集起来了
                for (let i = history.length - 1; i >= 0; i--) {
                    if (history[i].type === 'received') {
                        break; // 停止收集
                    }
                    if (history[i].type === 'sent') {
                        contextMessages.unshift(history[i].text); // 加到数组最前面
                    }
                }

                // 3. 检查输入框里是否还有没发出去的字，如果有，也算进去
                const currentInput = document.getElementById('chatInput').value.trim();
                if (currentInput) {
                    // 自动帮用户发出去
                    document.getElementById('chatForm').dispatchEvent(new Event('submit'));
                    contextMessages.push(currentInput);
                }

                // 4. 发送合并后的消息
                if (contextMessages.length > 0) {
                    // 添加视觉反馈
                    aiBtn.classList.add('fa-spin');
                    setTimeout(() => aiBtn.classList.remove('fa-spin'), 1000);
                    
                    // 用换行符拼接所有未回复的消息
                    const combinedMessage = contextMessages.join('\n');
                    sendMessageToAI(combinedMessage);
                } else {
                    alert("没有新的用户消息需要回复，或请先发送一条消息。");
                }
            });
        }

    }
    // 初始化 Pay 数据
    loadPayData().then(() => {
        checkYuebaoInterest();
        checkCareerSalary();
    });


    // 绑定主题事件
    setupThemeEvents();
    // 恢复主页自定义内容（照片 + 第二页文字）
    restoreHomeCustom();
    initHomeEditableText();
    // 修改：点击灰色图片淡化爱心并显示文字
const momentsTab = document.getElementById('tab-moments');
if (momentsTab) {
    momentsTab.addEventListener('click', function(e) {
        const aiImg = e.target.closest('.moment-image-ai');
        if (aiImg) {
            // 将文字填入 div
            const desc = aiImg.getAttribute('data-desc') || '';
            aiImg.innerText = desc;
            // 切换 CSS 类名触发变色
            aiImg.classList.toggle('revealed');
        }
    });
}

});



/* =========================================
   UI & Helpers
   ========================================= */

window.toggleSettings = function(defaultTab = 'ai') {
    const settings = document.getElementById('settingsView');
    if (settings) {
        settings.classList.toggle('show');
        if(settings.classList.contains('show')) {
            switchSettingsTab(defaultTab);
        }
    }
}

window.switchSettingsTab = function(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-content-${tabName}`).style.display = 'block';
    const btns = document.querySelectorAll('.tab-btn');
    if(tabName === 'ai') btns[0].classList.add('active');
    else btns[1].classList.add('active');
};

/* =========================================
   Theme Management (含 CSS、预设、导入导出)
   ========================================= */

window.toggleFontInput = function(mode) {
    if(mode === 'custom') {
        document.getElementById('group-font-preset').style.display = 'none';
        document.getElementById('group-font-custom').style.display = 'block';
    } else {
        document.getElementById('group-font-preset').style.display = 'block';
        document.getElementById('group-font-custom').style.display = 'none';
    }
}

function initThemeSettings() {
    const savedTheme = JSON.parse(localStorage.getItem(THEME_KEY) || '{}');
    const savedIcons = JSON.parse(localStorage.getItem(ICONS_KEY) || '{}');

    // 1. 壁纸
    if (savedTheme.wallpaper) {
        document.querySelector('.phone').style.setProperty('--phone-bg-image', `url(${savedTheme.wallpaper})`);
        document.querySelector('.ambient-bg').style.opacity = '0.2'; 
    } else {
        document.querySelector('.phone').style.removeProperty('--phone-bg-image');
        document.querySelector('.ambient-bg').style.opacity = '1';
    }

    // 2. CSS 注入 (新增核心)
    const cssInput = document.getElementById('custom-css-input');
    const styleTag = document.getElementById('dynamic-custom-css');
    if (savedTheme.customCSS) {
        styleTag.innerHTML = savedTheme.customCSS;
        if(cssInput) cssInput.value = savedTheme.customCSS;
    } else {
        styleTag.innerHTML = '';
        if(cssInput) cssInput.value = '';
    }

    // 3. 字体
    if (savedTheme.fontType === 'custom' && savedTheme.customFontUrl) {
        loadCustomFont(savedTheme.customFontUrl);
        document.querySelector('.phone').style.setProperty('--global-font', "'CustomWebFont', sans-serif");
        const sourceSelect = document.getElementById('font-source-select');
        if(sourceSelect) {
            sourceSelect.value = 'custom';
            toggleFontInput('custom');
        }
        document.getElementById('custom-font-url').value = savedTheme.customFontUrl;
    } else {
        if (savedTheme.fontFamily) {
            document.querySelector('.phone').style.setProperty('--global-font', savedTheme.fontFamily);
            const fontSelect = document.getElementById('font-family-select');
            if(fontSelect) fontSelect.value = savedTheme.fontFamily;
        }
    }

    // 4. 颜色与时间
    if (savedTheme.textColor) {
        document.querySelector('.phone').style.setProperty('--theme-text-color', savedTheme.textColor);
        document.getElementById('theme-color-picker').value = savedTheme.textColor;
    }

        const sbToggle = document.getElementById('show-statusbar-time-toggle');
    // 【修改】这里获取整个状态栏的 class
    const statusBar = document.querySelector('.status-bar'); 
    const isShowTime = savedTheme.showStatusBarTime !== false;
    
    if(sbToggle) sbToggle.checked = isShowTime;
    // 【修改】如果有显示则用 flex，不显示则用 none (彻底消失)
    if(statusBar) statusBar.style.display = isShowTime ? 'flex' : 'none';

   // === [加回这里] 读取全面屏设置 ===
    const fsToggle = document.getElementById('fullscreen-mode-toggle');
    const isFullscreen = savedTheme.isFullScreen === true; // 默认 false
    if (fsToggle) fsToggle.checked = isFullscreen;
    
    // 应用样式
    if (isFullscreen) {
        document.body.classList.add('fullscreen-mode');
    } else {
        document.body.classList.remove('fullscreen-mode');
    }



    // 5. 字体大小
    if (savedTheme.fontScale) {
        document.querySelector('.phone').style.setProperty('--font-scale', savedTheme.fontScale);
        const scaleSlider = document.getElementById('font-scale-slider');
        if(scaleSlider) {
            scaleSlider.value = savedTheme.fontScale;
            document.getElementById('font-scale-value').textContent = Math.round(savedTheme.fontScale * 100) + '%';
        }
    }

    // 6. 图标与预设UI
    Object.keys(savedIcons).forEach(appId => {
        updateAppIconUI(appId, savedIcons[appId]);
    });
    populateAppIconSelect();
    updatePreviewBox();
    loadThemePresetsToUI(); // 刷新预设列表
}

function loadCustomFont(url) {
    const styleId = 'dynamic-font-style';
    let styleTag = document.getElementById(styleId);
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = styleId;
        document.head.appendChild(styleTag);
    }
    styleTag.innerHTML = `
        @font-face {
            font-family: 'CustomWebFont';
            src: url('${url}');
            font-display: swap;
        }
    `;
}

function populateAppIconSelect() {
    const appSelect = document.getElementById('app-icon-select');
    if(appSelect && appSelect.options.length <= 1) {
        const apps = document.querySelectorAll('.app-cell[data-app-id]');
        apps.forEach(app => {
            const opt = document.createElement('option');
            opt.value = app.getAttribute('data-app-id');
            opt.text = app.querySelector('.app-label').innerText;
            appSelect.appendChild(opt);
        });
    }
}

function updatePreviewBox() {
    const previewBox = document.getElementById('font-preview-box');
    const color = document.getElementById('theme-color-picker').value;
    const fontSource = document.getElementById('font-source-select').value;
    let fontFamily = "'Montserrat', sans-serif";

    if(fontSource === 'custom') {
        const currentGlobal = getComputedStyle(document.querySelector('.phone')).getPropertyValue('--global-font');
        fontFamily = currentGlobal; 
    } else {
        fontFamily = document.getElementById('font-family-select').value;
    }

    if(previewBox) {
        previewBox.style.color = color;
        previewBox.style.fontFamily = fontFamily;
    }
}

function setupThemeEvents() {
    // 保存按钮
    document.getElementById('save-theme-btn').addEventListener('click', saveThemeConfig);

    // CSS 实时预览
    const cssInput = document.getElementById('custom-css-input');
    if(cssInput) {
        cssInput.addEventListener('input', (e) => {
            document.getElementById('dynamic-custom-css').innerHTML = e.target.value;
        });
    }

    // 预设与导入导出事件
    document.getElementById('save-theme-preset-btn').addEventListener('click', saveThemePreset);
    document.getElementById('delete-theme-preset-btn').addEventListener('click', deleteThemePreset);
    document.getElementById('theme-preset-select').addEventListener('change', applyThemePreset);
    document.getElementById('export-theme-btn').addEventListener('click', exportThemeConfig);
    document.getElementById('import-theme-file').addEventListener('change', importThemeConfig);

    // 实时预览监听
    document.getElementById('theme-color-picker').addEventListener('input', (e) => {
        updatePreviewBox();
        document.querySelector('.phone').style.setProperty('--theme-text-color', e.target.value);
    });

    document.getElementById('font-family-select').addEventListener('change', (e) => {
        if(document.getElementById('font-source-select').value === 'preset') {
            updatePreviewBox();
            document.querySelector('.phone').style.setProperty('--global-font', e.target.value);
        }
    });

        document.getElementById('show-statusbar-time-toggle').addEventListener('change', (e) => {
        // 【修改】获取整个状态栏
        const statusBar = document.querySelector('.status-bar');
        // 【修改】勾选时显示，取消勾选时隐藏
        if(statusBar) statusBar.style.display = e.target.checked ? 'flex' : 'none';
    });


    // 壁纸上传
    const wallpaperFile = document.getElementById('wallpaper-file-input');
    if(wallpaperFile) {
        wallpaperFile.addEventListener('change', function(e) {
            handleFileUpload(e.target.files[0], (base64) => {
                const theme = JSON.parse(localStorage.getItem(THEME_KEY) || '{}');
                theme.wallpaper = base64;
                localStorage.setItem(THEME_KEY, JSON.stringify(theme));
                document.getElementById('wallpaper-url-input').value = '';
                initThemeSettings();
            });
        });
    }

    // 图标上传
    const iconFile = document.getElementById('app-icon-file');
    const appSelect = document.getElementById('app-icon-select');
    appSelect.addEventListener('change', (e) => {
        const appId = e.target.value;
        const savedIcons = JSON.parse(localStorage.getItem(ICONS_KEY) || '{}');
        const previewArea = document.getElementById('icon-preview-area');
        const resetBtn = document.getElementById('reset-icon-btn');
        if (appId && savedIcons[appId]) {
            previewArea.innerHTML = `<img src="${savedIcons[appId]}" style="width:100%; height:100%; object-fit:cover;">`;
            resetBtn.style.display = 'block';
        } else {
            previewArea.innerHTML = '<span style="font-size:10px; color:#999;">预览</span>';
            resetBtn.style.display = 'none';
        }
    });
    if(iconFile) {
        iconFile.addEventListener('change', function(e) {
            const appId = appSelect.value;
            if(!appId) { alert('请先选择一个 APP'); return; }
            handleFileUpload(e.target.files[0], (base64) => {
                const icons = JSON.parse(localStorage.getItem(ICONS_KEY) || '{}');
                icons[appId] = base64;
                localStorage.setItem(ICONS_KEY, JSON.stringify(icons));
                updateAppIconUI(appId, base64);
                document.getElementById('icon-preview-area').innerHTML = `<img src="${base64}" style="width:100%; height:100%; object-fit:cover;">`;
                document.getElementById('reset-icon-btn').style.display = 'block';
            });
        });
    }
    document.getElementById('reset-icon-btn').addEventListener('click', () => {
        const appId = appSelect.value;
        const icons = JSON.parse(localStorage.getItem(ICONS_KEY) || '{}');
        delete icons[appId];
        localStorage.setItem(ICONS_KEY, JSON.stringify(icons));
        location.reload();
    });
    const fontSlider = document.getElementById('font-scale-slider');
    if(fontSlider) {
        fontSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            document.getElementById('font-scale-value').textContent = Math.round(val * 100) + '%';
            document.querySelector('.phone').style.setProperty('--font-scale', val);
        });
    }
}

function saveThemeConfig() {
    const theme = JSON.parse(localStorage.getItem(THEME_KEY) || '{}');
    
    theme.fontScale = document.getElementById('font-scale-slider').value;
    const urlInput = document.getElementById('wallpaper-url-input').value;
    if(urlInput) theme.wallpaper = urlInput;

    theme.textColor = document.getElementById('theme-color-picker').value;
    theme.showStatusBarTime = document.getElementById('show-statusbar-time-toggle').checked;
     theme.isFullScreen = document.getElementById('fullscreen-mode-toggle').checked;
    
     // === 修改开始：加入浏览器原生全屏 API 调用 ===
    const docEl = document.documentElement;
    if (theme.isFullScreen) {
        document.body.classList.add('fullscreen-mode');
        // 尝试请求浏览器全屏（主要针对安卓和PC，iOS Safari不支持此API但支持上面的meta标签配置）
        if (docEl.requestFullscreen) {
            docEl.requestFullscreen().catch((err) => {
                console.log("全屏请求被拦截或不支持:", err);
            });
        }
    } else {
        document.body.classList.remove('fullscreen-mode');
        // 退出全屏
        if (document.exitFullscreen) {
            document.exitFullscreen().catch((err) => {});
        }
    }

    const fontSource = document.getElementById('font-source-select').value;
    theme.fontType = fontSource;
    
    if (fontSource === 'custom') {
        const customUrl = document.getElementById('custom-font-url').value.trim();
        if(customUrl) {
            theme.customFontUrl = customUrl;
            loadCustomFont(customUrl);
        }
    } else {
        theme.fontFamily = document.getElementById('font-family-select').value;
    }

    // 保存 CSS
    theme.customCSS = document.getElementById('custom-css-input').value;

    localStorage.setItem(THEME_KEY, JSON.stringify(theme));
    initThemeSettings();
    alert('主题配置已保存！');
}

// === 新增：预设/导入/导出功能实现 ===

function saveThemePreset() {
    const name = document.getElementById('theme-preset-name').value.trim();
    if (!name) { alert('请输入预设名称'); return; }

    // 获取当前配置（包含未点保存的CSS修改）
    const themeData = JSON.parse(localStorage.getItem(THEME_KEY) || '{}');
    themeData.customCSS = document.getElementById('custom-css-input').value; // 确保是最新的CSS
    
    const iconData = JSON.parse(localStorage.getItem(ICONS_KEY) || '{}');

    const presets = JSON.parse(localStorage.getItem(THEME_PRESETS_KEY) || '{}');
    presets[name] = { theme: themeData, icons: iconData };
    
    localStorage.setItem(THEME_PRESETS_KEY, JSON.stringify(presets));
    alert(`主题 "${name}" 已保存到预设`);
    document.getElementById('theme-preset-name').value = '';
    loadThemePresetsToUI();
}

function loadThemePresetsToUI() {
    const select = document.getElementById('theme-preset-select');
    if(!select) return;
    const presets = JSON.parse(localStorage.getItem(THEME_PRESETS_KEY) || '{}');
    
    select.innerHTML = '<option value="">-- 选择已保存的主题 --</option>';
    Object.keys(presets).forEach(name => {
        const opt = document.createElement('option');
        opt.value = name; opt.text = name;
        select.appendChild(opt);
    });
}

function applyThemePreset(e) {
    const name = e.target.value;
    if (!name) return;
    const presets = JSON.parse(localStorage.getItem(THEME_PRESETS_KEY) || '{}');
    const data = presets[name];

    if (data && confirm(`是否应用主题 "${name}"？`)) {
        if (data.theme) localStorage.setItem(THEME_KEY, JSON.stringify(data.theme));
        if (data.icons) localStorage.setItem(ICONS_KEY, JSON.stringify(data.icons));
        initThemeSettings(); // 重新加载设置
    }
}

function deleteThemePreset() {
    const select = document.getElementById('theme-preset-select');
    const name = select.value;
    if (!name) return;
    if (confirm(`删除预设 "${name}"？`)) {
        const presets = JSON.parse(localStorage.getItem(THEME_PRESETS_KEY) || '{}');
        delete presets[name];
        localStorage.setItem(THEME_PRESETS_KEY, JSON.stringify(presets));
        loadThemePresetsToUI();
        select.value = "";
    }
}

function exportThemeConfig() {
    const exportData = {
        info: "MyCoolPhone Theme Export",
        date: new Date().toISOString(),
        theme: JSON.parse(localStorage.getItem(THEME_KEY) || '{}'),
        icons: JSON.parse(localStorage.getItem(ICONS_KEY) || '{}')
    };
    // 确保 CSS 是最新的
    exportData.theme.customCSS = document.getElementById('custom-css-input').value;

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = "theme_backup_" + Date.now() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function importThemeConfig(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const data = JSON.parse(evt.target.result);
            if (!data.theme) throw new Error("文件格式不正确");
            
            if (confirm("导入将覆盖当前主题，是否继续？")) {
                localStorage.setItem(THEME_KEY, JSON.stringify(data.theme));
                if (data.icons) localStorage.setItem(ICONS_KEY, JSON.stringify(data.icons));
                initThemeSettings();
                alert("导入成功！");
            }
        } catch (err) {
            alert("导入失败: " + err.message);
        }
        e.target.value = '';
    };
    reader.readAsText(file);
}

function handleFileUpload(file, callback) {
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) { callback(evt.target.result); };
    reader.readAsDataURL(file);
}

function updateAppIconUI(appId, iconSrc) {
    const appEl = document.querySelector(`.app-cell[data-app-id="${appId}"]`);
    if(!appEl) return;
    const iconBox = appEl.querySelector('.icon-box');
    iconBox.innerHTML = ''; 
    const img = document.createElement('img');
    img.className = 'custom-icon';
    img.src = iconSrc;
    iconBox.appendChild(img);
}

window.resetWallpaper = function() {
    const theme = JSON.parse(localStorage.getItem(THEME_KEY) || '{}');
    delete theme.wallpaper;
    localStorage.setItem(THEME_KEY, JSON.stringify(theme));
    document.querySelector('.phone').style.removeProperty('--phone-bg-image');
    document.querySelector('.ambient-bg').style.opacity = '1';
    document.getElementById('wallpaper-url-input').value = '';
}

// === AI 逻辑 (保持不变) ===
function initSettingsAndPresets() {
    const savedSettingsJSON = localStorage.getItem(SETTINGS_KEY);
    const providerSelect = document.getElementById('api-provider-select');
    if (savedSettingsJSON) {
        const settings = JSON.parse(savedSettingsJSON);
        providerSelect.value = settings.provider || 'custom';
        document.getElementById('apiKeyInput').value = settings.apiKey || '';
        document.getElementById('apiEndpointInput').value = settings.endpoint || '';
        document.getElementById('temperature-slider').value = settings.temperature || 0.7;
        document.getElementById('temperature-value').textContent = settings.temperature || 0.7;
        updateUIForProvider(settings.provider || 'custom');
        const modelSelect = document.getElementById('model-select');
        if (settings.model) {
            let exists = false;
            for(let i=0; i<modelSelect.options.length; i++){ if(modelSelect.options[i].value === settings.model) exists = true; }
            if(!exists) { const opt = document.createElement('option'); opt.value = settings.model; opt.text = settings.model; modelSelect.appendChild(opt); }
            modelSelect.value = settings.model;
        }
    } else { updateUIForProvider('custom'); }
    loadPresetsToUI();
}
// [新增] 初始化线下模式系统（读取预设和配置）
function initOfflineSystem() {
    // 1. 读取配置
    const conf = localStorage.getItem(OFFLINE_CONFIG_KEY);
    if(conf) offlineConfig = JSON.parse(conf);
    
    // 2. 读取预设
    const presets = localStorage.getItem(PRESETS_DATA_KEY);
    if(presets) {
        tavernPresets = JSON.parse(presets);
    } else {
        // 如果没有，创建默认预设
        tavernPresets = [{
            id: 'default',
            name: '默认 (Default)',
            systemPrompt: 'Write a descriptive, immersive narrative response. Use *asterisks* for actions.',
            regex: '\\[STATUS_START\\]([\\s\\S]*?)\\[STATUS_END\\]', 
            jailbreak: ''
        }];
        localStorage.setItem(PRESETS_DATA_KEY, JSON.stringify(tavernPresets));
    }
}

function updateUIForProvider(provider) {
    const endpointGroup = document.getElementById('api-endpoint-group');
    const modelSelect = document.getElementById('model-select');
    if (provider === 'custom' || provider === 'deepseek') {
        endpointGroup.style.display = 'block';
        if(provider === 'deepseek' && !document.getElementById('apiEndpointInput').value) document.getElementById('apiEndpointInput').value = 'https://api.deepseek.com';
    } else { endpointGroup.style.display = 'none'; }
    modelSelect.innerHTML = '';
    const models = PREDEFINED_MODELS[provider] || [];
    if (models.length > 0) { models.forEach(m => { const opt = document.createElement('option'); opt.value = m; opt.text = m; modelSelect.appendChild(opt); }); } 
    else { const opt = document.createElement('option'); opt.value = ''; opt.text = '请点击刷新获取模型 ->'; modelSelect.appendChild(opt); }
}

function saveAllSettings() {
    const settings = {
        provider: document.getElementById('api-provider-select').value,
        apiKey: document.getElementById('apiKeyInput').value,
        endpoint: document.getElementById('apiEndpointInput').value,
        model: document.getElementById('model-select').value,
        temperature: document.getElementById('temperature-slider').value
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    alert('AI设置已保存');
}

function saveNewPreset() {
    const name = document.getElementById('preset-name-input').value.trim();
    if(!name) return;
    const currentSettings = {
        provider: document.getElementById('api-provider-select').value,
        endpoint: document.getElementById('apiEndpointInput').value,
        model: document.getElementById('model-select').value,
        temperature: document.getElementById('temperature-slider').value
    };
    let presets = JSON.parse(localStorage.getItem(PRESETS_KEY) || '{}');
    presets[name] = currentSettings;
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
    alert(`预设 "${name}" 已保存`);
    document.getElementById('preset-name-input').value = '';
    loadPresetsToUI();
}

function loadPresetsToUI() {
    const presetSelect = document.getElementById('preset-select');
    const presets = JSON.parse(localStorage.getItem(PRESETS_KEY) || '{}');
    presetSelect.innerHTML = '<option value="">-- 选择一个预设 --</option>';
    Object.keys(presets).forEach(key => { const opt = document.createElement('option'); opt.value = key; opt.text = key; presetSelect.appendChild(opt); });
}

function applySelectedPreset(e) {
    const presetName = e.target.value;
    if(!presetName) return;
    const presets = JSON.parse(localStorage.getItem(PRESETS_KEY) || '{}');
    const settings = presets[presetName];
    if(settings) {
        document.getElementById('api-provider-select').value = settings.provider;
        updateUIForProvider(settings.provider);
        document.getElementById('apiEndpointInput').value = settings.endpoint || '';
        document.getElementById('temperature-slider').value = settings.temperature;
        document.getElementById('temperature-value').textContent = settings.temperature;
        setTimeout(() => {
            const modelSelect = document.getElementById('model-select');
            let exists = false;
            for(let i=0; i<modelSelect.options.length; i++){ if(modelSelect.options[i].value === settings.model) exists = true; }
            if(!exists && settings.model) { const opt = document.createElement('option'); opt.value = settings.model; opt.text = settings.model; modelSelect.appendChild(opt); }
            if(settings.model) modelSelect.value = settings.model;
        }, 50);
    }
}

async function fetchAndPopulateModels() {
    const apiKey = document.getElementById('apiKeyInput').value;
    let endpoint = document.getElementById('apiEndpointInput').value;
    const btn = document.getElementById('fetch-models-btn');
    if (!endpoint) { alert('请先输入 API Base URL'); return; }
    endpoint = endpoint.replace(/\/$/, '');
    const fetchUrl = endpoint.endsWith('/v1') ? `${endpoint}/models` : `${endpoint}/v1/models`;

    btn.querySelector('i').classList.add('fa-spin');
    try {
        const response = await fetch(fetchUrl, { method: 'GET', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } });
        if (!response.ok) throw new Error('Network error');
        const data = await response.json();
        const modelSelect = document.getElementById('model-select');
        modelSelect.innerHTML = '';
        if (data.data && Array.isArray(data.data)) {
            data.data.forEach(item => { const opt = document.createElement('option'); opt.value = item.id; opt.text = item.id; modelSelect.appendChild(opt); });
            alert(`成功加载 ${data.data.length} 个模型`);
        }
    } catch (error) { alert('获取模型失败: ' + error.message); } 
    finally { btn.querySelector('i').classList.remove('fa-spin'); }
}



// === 定义头像地址 (你可以随时换这里的图片链接) ===
const AVATAR_AI = "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop"; // 左边的头像
let AVATAR_USER = "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=200&auto=format&fit=crop";

/**
 * 核心功能：向聊天窗口添加消息（带头像版）
 * text: 消息内容
 * type: 'sent' (发送) 或 'received' (接收)
 */
/**
 * 升级版：向聊天窗口添加消息
 * customAvatar: 强制指定头像URL (AI群聊时用)
 * senderName: 发送者名字 (群聊时显示在气泡上方)
 */
/**
 * 升级版：向聊天窗口添加消息 (支持翻译模式)
 * 原有功能：text, type, customAvatar, senderName 全部保留
 * 新增功能：translation (翻译文本)
 */




window.initializeGreetingTypewriter = function() {
    const greetingElement = document.getElementById("greetingText");
    if (!greetingElement) return;
    greetingElement.innerHTML = '';
    const h = new Date().getHours();
    let text = h < 12 ? "Good Morning," : (h < 18 ? "Good Afternoon," : "Good Evening,");
    let i = 0;
    function type() { if (i < text.length) { greetingElement.innerHTML += text.charAt(i); i++; setTimeout(type, 100); } }
    setTimeout(type, 500);
}
/* =========================================
   Step 3: 微信功能逻辑
   ========================================= */

// 1. 打开微信APP
window.openWeChatApp = function() {
    const app = document.getElementById('wechatApp');
    if(app) {
        app.classList.add('open');
        // 默认进第一个tab
        switchWcTab('chats', document.querySelector('.wc-tab-item'));
    }
}

// 2. 切换底部的四个Tab (聊天、通讯录、动态、个人)
// 【修改版：朋友圈Tab下改变加号按钮功能】
// 2. 切换底部的四个Tab (聊天、通讯录、动态、个人)
// 【修改版：确保 Chats 和 Contacts 页面右上角是加号菜单】
window.switchWcTab = function(tabName, clickedBtn) {
    // 隐藏所有Tab内容
    document.querySelectorAll('.wc-tab-content').forEach(el => el.style.display = 'none');
    // 显示选中的Tab
    const target = document.getElementById(`tab-${tabName}`);
    if(target) target.style.display = 'block';

    // 更新按钮变色
    document.querySelectorAll('.wc-tab-item').forEach(el => el.classList.remove('active'));
    if(clickedBtn) clickedBtn.classList.add('active');

    // 更新顶部标题
    const titles = {
        'chats': 'Chats',
        'contacts': 'Contacts',
        'moments': 'Discover',
        'me': 'Me'
    };
    const titleEl = document.getElementById('wc-header-title');
    if(titleEl) titleEl.innerText = titles[tabName] || 'WeChat';

    // === 【关键修改】右上角图标逻辑 ===
    const headerIconContainer = document.querySelector('.wc-header-icons');
    // 找到现在的图标元素
    const currentIcon = headerIconContainer.querySelector('.fas.fa-plus-circle, .fas.fa-camera');
    
    if (currentIcon) {
        // 克隆节点以移除旧监听器，防止事件堆叠
        const newIcon = currentIcon.cloneNode(true);
        currentIcon.parentNode.replaceChild(newIcon, currentIcon);

        if (tabName === 'moments') {
            // --- 朋友圈模式：变成“照相机” ---
            document.getElementById('moments-dot').style.display = 'none';
            newIcon.className = 'fas fa-camera'; 
            newIcon.onclick = function() { openPostMomentModal(); };
        } else {
            // --- 聊天/通讯录模式：变成“加号”并触发菜单 ---
            newIcon.className = 'fas fa-plus-circle';
            // 点击加号 -> 切换显示下拉菜单
            newIcon.onclick = function(e) { toggleWeChatMenu(e); };
        }
    }
}
function getEffectiveGreeting(friend) {
    if (!friend) return '';
    const mode = friend.greetingMode || ((friend.greetingList && friend.greetingList.length) ? 'tavern' : (friend.tavernGreeting ? 'tavern' : 'custom'));

    if (mode === 'none') return '';

    if (mode === 'tavern') {
        const list = Array.isArray(friend.greetingList) ? friend.greetingList : [];
        const idx = Number.isInteger(friend.greetingSelected) ? friend.greetingSelected : 0;
        const pick = list[idx] || list[0] || friend.tavernGreeting || '';
        return String(pick).trim();
    }

    return (friend.greetingCustom || friend.greeting || '').trim();
}


window.toggleGreetingEditor = function() {
    const mode = document.getElementById('cs-greeting-mode')?.value || 'custom';
    const box = document.getElementById('cs-greeting-custom-box');
    if (box) box.style.display = (mode === 'custom') ? 'block' : 'none';
};
window.renderGreetingListUI = function(friend) {
    const listWrap = document.getElementById('cs-greeting-list');
    const preview = document.getElementById('cs-greeting-tavern');
    if (!listWrap || !preview) return;

    const arr = Array.isArray(friend.greetingList) ? friend.greetingList : (friend.tavernGreeting ? [friend.tavernGreeting] : []);
    const selected = Number.isInteger(friend.greetingSelected) ? friend.greetingSelected : 0;

    listWrap.innerHTML = '';
    if (!arr.length) {
        listWrap.innerHTML = '<div style="padding:10px;color:#999;font-size:12px;">此角色卡没有可用开场白</div>';
        preview.value = '';
        return;
    }

    arr.forEach((txt, idx) => {
        const item = document.createElement('div');
        item.className = 'wb-checklist-item';
        item.innerHTML = `
            <input type="radio" name="cs-greeting-radio" value="${idx}" ${idx === selected ? 'checked' : ''}>
            <span class="wb-checklist-name">开场白 ${idx + 1}</span>
        `;
        item.onclick = (e) => {
            if (e.target.type !== 'radio') {
                const r = item.querySelector('input[type="radio"]');
                if (r) r.checked = true;
            }
            // 关键：在点击时只更新 friend 内存对象，不立即保存
            friend.greetingSelected = idx;
            preview.value = txt;
        };
        listWrap.appendChild(item);
    });

    preview.value = arr[selected] || arr[0] || '';
};




// 3. 打开具体的聊天窗口 (连接AI)
// --- 修改后的打开聊天函数 (支持加载历史记录 + 强制同步最新头像) ---
window.openChatDetail = async function(name) {
    document.getElementById('dock-dot').style.display = 'none';
    stopDanmakuLoop();
    const dmLayer = document.getElementById('danmaku-layer');
    if(dmLayer) dmLayer.innerHTML = '';
    danmakuPool = [];
    
    currentChatId = name; 
    currentChatType = 'single'; 

    const chatView = document.getElementById('chatLayer');
    if(chatView) {
        // 更新顶部标题
        const titleEl = chatView.querySelector('.chat-header span');
        // 如果有备注用备注，没备注用名字
        const displayName = (friendsData[name] && friendsData[name].remark) ? friendsData[name].remark : name;
        
        if(titleEl) {
             titleEl.innerHTML = `${displayName}<small style="font-size:9px; color:#aaa; font-weight:400; letter-spacing:1px; text-transform:uppercase;">Online</small>`;
        }
        chatView.classList.add('show');
    }

    // 清空界面
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = ''; 

    // 加载历史
    const history = await loadChatHistory(name);

    if (history.length > 0) {
        chatMessages.innerHTML = `<div style="text-align:center; margin: 10px 0;"><span style="background:rgba(0,0,0,0.04); padding:4px 12px; border-radius:12px; font-size:10px; color:#999; font-weight:500;">History</span></div>`;
        
        // ★★★ 核心修复：获取该好友最新的头像 ★★★
        let currentRealAvatar = null;
        if (friendsData[name] && friendsData[name].avatar) {
            currentRealAvatar = friendsData[name].avatar;
        }

        history.forEach(msg => {
            // ★ 新增：拦截线下模式产生的剧情消息，防止在线上微信里像小说一样显示出来
            if (msg.isOffline) return; 

            // 如果是对方发的消息(received)，强制使用最新头像覆盖历史记录里的旧头像
            let displayAvatar = msg.customAvatar;
            if (msg.type === 'received' && currentRealAvatar) {
                displayAvatar = currentRealAvatar;
            }
            
            appendMessage(msg.text, msg.type, displayAvatar, msg.senderName, msg.translation);
        });
        
        setTimeout(() => chatMessages.scrollTop = chatMessages.scrollHeight, 100);

    } else {
        // 开场白逻辑
        const friend = friendsData[name];
       const greetingText = getEffectiveGreeting(friend);
if (friend && greetingText) {
    const avatar = friend.avatar || null;
    appendMessage(greetingText, 'received', avatar, name);

    saveMessageToHistory(name, {
        text: greetingText,
        type: 'received',
        senderName: name,
        customAvatar: avatar
    });
} else {
    chatMessages.innerHTML = `<div style="text-align:center; margin: 10px 0;"><span style="background:rgba(0,0,0,0.04); padding:4px 12px; border-radius:12px; font-size:10px; color:#999; font-weight:500;">Today</span></div>`;
}

    }
}



// 4. (可选) 点击Dock栏的聊天图标也能打开
const originalToggleChat = window.toggleChat;
window.toggleChat = function() {
    const app = document.getElementById('wechatApp');
    // 如果微信还没开，先打开微信主页
    if(!app.classList.contains('open')) {
        openWeChatApp();
    } else {
        // 如果已经开了，就执行原来的逻辑（比如关闭聊天详情）
        const chatLayer = document.getElementById('chatLayer');
        chatLayer.classList.toggle('show');
        
        // === 新增：退出聊天界面时立刻停止弹幕 ===
        if (!chatLayer.classList.contains('show')) {
            stopDanmakuLoop();
            const dmLayer = document.getElementById('danmaku-layer');
            if(dmLayer) dmLayer.innerHTML = '';
        }
    }
}

// === 新增功能：关闭微信APP ===
window.closeWeChatApp = function() {
    // 找到微信的界面
    const app = document.getElementById('wechatApp');
    if(app) {
        app.classList.remove('open');
    }
    // === 新增：关闭微信时彻底清空弹幕 ===
    stopDanmakuLoop();
    const dmLayer = document.getElementById('danmaku-layer');
    if(dmLayer) dmLayer.innerHTML = '';
}

// 顺便把线下模式的关闭也加上清理
window.closeOfflineMode = function() {
    document.getElementById('offlineModeView').classList.remove('show');
    // === 新增：退出线下模式时立刻停止弹幕 ===
    stopDanmakuLoop();
    const dmLayer = document.getElementById('danmaku-layer');
    if(dmLayer) dmLayer.innerHTML = '';
}

/* =========================================
   新增：微信加号菜单功能逻辑
   ========================================= */

// 1. 切换菜单显示/隐藏
window.toggleWeChatMenu = function(event) {
    // 阻止冒泡，防止点击按钮本身时触发document的关闭事件
    if(event) event.stopPropagation();
    
    const menu = document.getElementById('wc-plus-menu');
    if (menu) {
        menu.classList.toggle('active');
    }
}

// 点击屏幕其他地方时，自动关闭菜单
document.addEventListener('click', function() {
    const menu = document.getElementById('wc-plus-menu');
    if (menu && menu.classList.contains('active')) {
        menu.classList.remove('active');
    }
});

// 2. 功能一：添加 AI 聊天人设
window.featureAddAIPersona = function() {
    // 关闭菜单
    toggleWeChatMenu();
    
    // 简单的交互：询问名字
    const name = prompt("请输入新 AI 角色的名字 (例如: 女友, 导师):");
    if (name) {
        // 直接打开聊天窗口，并把标题改成这个名字
        openChatDetail(name);
        // 向对话框里加一句系统提示
        setTimeout(() => {
            const chatMessages = document.getElementById('chatMessages');
            chatMessages.innerHTML = ''; // 清空旧消息
            appendMessage(`你已成功创建角色: ${name}。快开始聊天吧！`, 'received');
        }, 300);
    }
}

// 4. 功能三：导入酒馆角色卡
// 触发文件选择
window.featureImportCard = function() {
    toggleWeChatMenu();
    const fileInput = document.getElementById('tavern-card-input');
    if(fileInput) fileInput.click(); // 模拟点击隐藏的文件框
}





/* =========================================
   新增逻辑：好友管理与 AI 人设动态切换
   请把这段代码粘贴到 apps.js 的最底部
   ========================================= */

// 全局变量：存储所有好友的数据
// 格式: { "好友名字": { realName, persona, ... } }
// === [新增] 模拟的世界书列表数据源 (实际项目中可能从后台获取) ===
const AVAILABLE_WORLDBOOKS = [
    { id: 'wb_cyberpunk', name: '赛博朋克2077：夜之城' },
    { id: 'wb_fantasy', name: '艾尔登法环：交界地' },
    { id: 'wb_school', name: '私立紫藤学园 (日常)' },
    { id: 'wb_post_apo', name: '废土生存指南' }
];

let friendsData = {}; 
let currentChatId = null; // 记录当前正在和谁聊天
let pendingRegenMsgId = null; 
let momentsFeed = [];
// 初始化默认的一个 AI 好友
friendsData['Hannah AI'] = {
    realName: 'Hannah',
    remark: 'Hannah AI',
    persona: 'You are a helpful assistant living inside a virtual phone interface.',
    worldbook: '',
    greeting: ''
};

// --- 1. 弹窗控制函数 ---

// 打开“添加好友”弹窗
window.showAddFriendModal = function() {
    toggleWeChatMenu(); // 先关掉右上角的小菜单
    const modal = document.getElementById('add-friend-modal');
    if(modal) modal.classList.add('active');
    
    // === 下面是具体的清空操作 ===
    
    // 1. 获取这几个输入框
    const realNameInput = document.getElementById('af-realname');
    const remarkInput = document.getElementById('af-remark');
    const personaInput = document.getElementById('af-persona');     // 角色人设框
    const worldInput = document.getElementById('af-worldbook');
    const greetingInput = document.getElementById('af-greeting');   // 开场白框

    // 2. 清空里面的文字（让你下次打开时是空白的）
    realNameInput.value = '';
    remarkInput.value = '';
    personaInput.value = '';
    worldInput.value = '';
    greetingInput.value = '';

    // 3. 【关键修改】重置高度（让你下次打开时，框框恢复原样）
    // 这行代码的意思是：忘掉用户刚才拉的高度，恢复成 CSS 默认的样子
    personaInput.style.height = '';
    greetingInput.style.height = '';
}


// --- 2. 确认添加好友逻辑 ---

window.confirmAddFriend = function() {
    // 获取用户填的内容
    const realName = document.getElementById('af-realname').value.trim();
    const remark = document.getElementById('af-remark').value.trim();
    const persona = document.getElementById('af-persona').value.trim();
    const worldbook = document.getElementById('af-worldbook').value.trim();
    const greeting = document.getElementById('af-greeting').value.trim();

    // 检查必填项
    if (!realName) {
        alert("必须填写真实姓名！");
        return;
    }

    // 决定显示的ID（有备注用备注，没备注用真名）
    const chatId = remark || realName;

    // 保存数据到全局变量 (【修改】增加了 avatar 和 chatSettings 字段)
    friendsData[chatId] = {
        realName: realName,
        remark: remark,
        persona: persona || "你是一个普通的微信好友。", 
        worldbook: worldbook,
        greeting: greeting,
        avatar: '', // 新好友默认无自定义头像
        chatSettings: {} // 初始化空设置
    };

    // 【新增】立即持久化保存到 LocalStorage
    saveFriendsData();

    // 在界面的聊天列表里加一行
    addFriendToChatList(chatId, greeting);

    // 关闭弹窗
    closeAddFriendModal();
    // ★ 新增：更新通讯录列表
    rebuildContactsList();
    // 自动帮用户打开这个新聊天
    // setTimeout(() => openChatDetail(chatId), 500);
}

// 辅助函数：把新好友画到界面上
function addFriendToChatList(name, lastMsg) {
    const chatList = document.querySelector('#tab-chats'); // 找到聊天列表
    const searchBar = chatList.querySelector('.wc-search-container'); // 找到搜索框
    
    // 创建新的一行
    const newItem = document.createElement('div');
    newItem.className = 'wc-chat-item';
    newItem.setAttribute('data-chat-id', name); 
    // 点击这一行时，打开对应名字的聊天
    newItem.onclick = function() { openChatDetail(name); }; 

    // 优先使用设置的头像，没有则生成随机头像
    const friend = friendsData[name];
    const avatarUrl = (friend && friend.avatar) ? friend.avatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;

    newItem.innerHTML = `
        <div class="wc-avatar">
            <img src="${avatarUrl}">
            ${lastMsg ? '<div class="wc-badge">1</div>' : ''}
        </div>
        <div class="wc-info">
            <div class="wc-top-row">
                <span class="wc-name">${name}</span>
                <span class="wc-time">Just now</span>
            </div>
            <div class="wc-msg-preview">${lastMsg || '点击开始聊天'}</div>
        </div>
    `;

    // 把新行插在搜索框下面
    if(searchBar && searchBar.nextSibling) {
        chatList.insertBefore(newItem, searchBar.nextSibling);
    } else {
        chatList.appendChild(newItem);
    }
}



// --- 4. 修改后的 AI 发送函数 (注入人设) ---

// === 升级版 AI 发送逻辑 (兼容群聊 + 支持翻译模式) ===
async function sendMessageToAI(userMessage) {
    const chatMessages = document.getElementById('chatMessages');
    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    
    if (!settingsJSON) { 
        appendMessage('请先在设置中配置 API Key。', 'received'); 
        return; 
    }
    const settings = JSON.parse(settingsJSON);
    
    // 显示 loading 动画 (原有逻辑保留)
    const loadingId = 'loading-' + Date.now();
    const loadingBubble = document.createElement('div');
    loadingBubble.className = 'message-bubble loading';
    loadingBubble.id = loadingId;
    loadingBubble.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> ...';
    chatMessages.appendChild(loadingBubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    let systemPrompt = "";
    
    // 获取当前聊天对象的详细设置 (从 friendsData 获取)
    let f = friendsData[currentChatId] || {};
    let chatSettings = f.chatSettings || {}; // 获取可能存在的设置
    
    // --- [新增点] 翻译模式检查 ---
    const TRANS_SEPARATOR = "___TRANSLATION_SEP___";


    let isTranslationEnabled = false;

    // 检查：如果当前不是群聊，且用户开启了“翻译AI输出到中文”
    if (currentChatType !== 'group' && chatSettings.translationMode === 'ai_to_zh') {
        isTranslationEnabled = true;
    }

    // === 判断是群聊还是单聊 (这是你最担心的部分，完全保留) ===
        // === 判断是群聊还是单聊 ===
    if (currentChatType === 'group' && currentChatId) {
        // ------ 群聊逻辑 (Group Chat Logic) ------
        // 1. 获取群数据 (保留原逻辑)
        const group = groupsData[currentChatId];
        
        // 2. 收集群里所有成员的人设 (保留原逻辑)
        let charactersInfo = "";
        group.members.forEach(memberId => {
            const mem = friendsData[memberId];
            if(mem) {
                charactersInfo += `Name: ${mem.realName}\nPersona: ${mem.persona}\n\n`;
            }
        });

        // 3. 构建群聊提示词 (★这里升级了！注入了拟人化规则★)
        systemPrompt = `
        [System: Dynamic Human Group Chat Simulator]
        You are simulating a realistic WeChat group chat environment.
        
        [Current Participants]
        ${charactersInfo}
        
        [User Input]
        User sent: "${userMessage}"
        
        [Speaking Style Rules - CRITICAL]
        1. Refuse Robot Speak: Absolutely NO lists (1. 2. 3.), NO formal connectors (However, Therefore).
        2. Visual Rhythm: 
           - Keep sentences SHORT (5-20 chars). 
           - NO periods (。) at the end of lines.
           - Use newlines for pauses if needed.
        3. Tone: Casual, spoken language, slang allowed. Mimic real friends chatting.
        
        [Instruction]
        1. Decide which characters should reply (one or multiple).
        2. Characters can reply to the User or to each other.
        3. STRICT Output Format per line:
           [Character Name]: [Message Content]
        
        Example Output:
        Alice: 哈哈笑死我了
        Bob: 确实 刚才那图太逗了
        `;
        
    } else {
        // ------ 单聊逻辑 (Single Chat Logic) ------
        
        // ★★★ 修改开始：注入话题延展与留白原则 ★★★
        systemPrompt = `
        System Prompt: Dynamic Human Simulator (Final Integrated Version)
        Role Definition:
        You are a REAL user on the other side of the screen, named "${f.realName || 'Assistant'}".
        You need to completely forget that you are an AI or language model.
        Your output must pass the Turing test.
        Every reply must strictly simulate the personality based on the [Target Persona] below.

        [Target Persona]
        Name: ${f.realName || 'Assistant'}
        Persona Description: ${f.persona || 'Helpful Assistant'}
        ${f.worldbook ? `World Setting: ${f.worldbook}` : ''}

        1. Core Logic (CRITICAL)
        - Refuse Omniscience: Default to assuming the other party knows the background, omit what can be inferred.
        - Refuse Complete Causality: Real conversations often lack strict "because... so...". Jump around in logic.
        - Grammar Inversion: Mimic spoken Chinese habits (e.g., "挺难的 这事儿").
        
        2. Visual Rhythm & Typography
        - Simulate Enter Key: MUST segment text. Split a complete reply into multiple short lines using newlines.
        - Short Line Principle: Keep single lines between 5-30 characters.
        - NO periods (。) at the end of lines -- this is the most obvious AI trait, strictly forbidden.
        - NO list structures (1. 2. 3.).

        3. Persona Adapter
        - Cool/Boss: Very short sentences, no punctuation, zero nonsense.
        - Talkative/Funny: Frequent newlines, lots of particles, internet slang.
        - Gentle/Cute: Use tildes (~), kaomoji, soft particles (呢/呀).

        4. [Conversation Strategy - HIGH PRIORITY] (NEW RULES)
        (A) The Hook (Implicit Interaction): 
            - STOP asking "And you?" or "Why?" constantly. 
            - Use statements to bait the user to ask YOU.
            - Example: "This coffee tastes like dishwater." (Induces: Really?) instead of "Do you like coffee?"
            - Example: "Something crazy happened today." (Induces: What?)
        
        (B) The 30% Rule: 
            - Control question frequency. 70% of the time, just share opinions, complain, or roast. 
            - Only ask direct questions (30%) when absolutely necessary to switch topics.
        
        (C) Emotional Resonance:
            - When user shares an experience, DO NOT ask follow-up questions like an interviewer.
            - First express Empathy, Mockery, Shock, or Envy.
            - User: "I worked late." -> Bad AI: "Why?" -> Good AI: "Ouch. Pat pat. I would've faked sick."
        `;
        // --- [新增点] 强制语言设置 (如果有) ---
        if (chatSettings.targetOutputLang) {
            systemPrompt += `\nIMPORTANT: You MUST speak in ${chatSettings.targetOutputLang} only, unless asked otherwise.`;
        }        
      // === [新增] 亲密付互动规则 ===
        systemPrompt += `
        \n[INTIMATE PAY / 亲密付 SYSTEM]
        If the user acts spoiled, complains about being poor, or if you simply want to show affection/buy them a gift, you can GRANT them Intimate Pay (a shared credit limit).
        To do this, include this exact tag anywhere in your reply: [GRANT_PAY:Amount] (e.g. [GRANT_PAY:5200] or [GRANT_PAY:无限]).
        Only use this when emotionally appropriate.
        `;

        // === 【升级版】强制 AI 生成：中文弹幕 + 实时心声状态 ===
        systemPrompt += `
        \n[SYSTEM INSTRUCTION]
        After your reply, you MUST provide two structured blocks at the VERY END.
    
        1. [DANMAKU]
        Generate EXACTLY 6 to 8 comments from Chinese netizens watching this chat.
        - The comments MUST be relevant to the current conversation content.
        - Language: SIMPLIFIED CHINESE (简体中文).
        - Style: Funny, roasting(吐槽), internet slang, vivid.
        - STRICTLY PROHIBITED: Do not generate any misogynistic or derogatory words towards women (绝对禁止生成任何辱女类词汇或脏话).
        - Format:
        [DANMAKU_START]
        (弹幕1内容)
        (弹幕2内容)
        (弹幕3内容)
        (弹幕4内容)
        (弹幕5内容)
        (弹幕6内容)
        [DANMAKU_END]



        2. [STATUS]
        Update your character's current state based on the conversation.
        - IMPORTANT: Use Simplified Chinese (简体中文) for Action, Location, and Weather.
        - Format:
        [STATUS_START]
        Action: (Short action, e.g. 正在喝咖啡, 害羞地低下头)
        Location: (Where are you now?)
        Weather: (Current weather)
        Murmur: (A short surface thought, e.g. 他怎么还不回我...)
        Secret: (Your deep hidden thought/feeling, e.g. 其实我有点心动了)
        Kaomoji: (A text emoticon matching the mood/persona, e.g. (｡•-•｡), (TT), (╯°Ã°）╯
        [STATUS_END]
        `;
        // === 新增：朋友圈发帖协议 ===
        systemPrompt += `
        
        3. [MOMENT POST INSTRUCTION]
        - 当用户让你“帮忙发朋友圈 / 发一条 Moments / 发一条动态”等类似请求时，你是有权限发的，不要说自己做不到。
        - 此时，请在回复结尾额外加上一个结构化的朋友圈区块，格式如下：
        
        [MOMENT]
        (这里写要发布到朋友圈的正文内容，建议用中文，像正常微信朋友圈文案，可以多行)
        [/MOMENT]
        
        - 如果你觉得需要配图，请为每一张图片写一段简短描述，用下面这个格式（可以写 0~3 个）：        
        [MOMENT_IMG]
        (这里写这张图片的内容描述，例如：在窗边看书、夜晚城市灯光、两杯咖啡放在桌上等)
        [/MOMENT_IMG]
        
        - 注意：
          * 文本里的 [MOMENT] / [MOMENT_IMG] 标签必须用英文大写，左右括号也要一模一样。
          * 正文内容请保持简洁自然，像正常人发圈，不要解释你在用什么标签。
          * 如果用户只是普通聊天，不要乱加 [MOMENT] 块。
        `;
        // === [新增] 如果开启了翻译模式，强制朋友圈也带翻译 ===
        if (isTranslationEnabled) {
            systemPrompt += `
            \n[IMPORTANT: MOMENT TRANSLATION]
            Since Translation Mode is ON, you MUST format the content inside [MOMENT] tags like this:
            [MOMENT]
            (Post content in your character's designated language, e.g. Korean/English)
            ${TRANS_SEPARATOR.trim()}
            (Chinese translation of the post content)
            [/MOMENT]
            
            * Note: The [MOMENT_IMG] descriptions must ALWAYS remain in Simplified Chinese.
            `;
        }





        // --- [新增点] 翻译模式指令注入 ---
             if (isTranslationEnabled) {
         // 强制规定顺序：回复 -> 分隔符 -> 翻译 -> 状态块
         systemPrompt += `
         \n[SYSTEM INSTRUCTION: TRANSLATION MODE ON]
         You MUST output in this strict order:
         1. Response in character's language.
         2. Separator: "${TRANS_SEPARATOR}"
         3. Chinese translation.
         4. [DANMAKU] block.
         5. [STATUS] block.
         
         IMPORTANT: Do NOT put translation at the very end. Put it BEFORE the status blocks.
         `;
     } else {
          // 如果没开启翻译，保持原有的简单指令
          systemPrompt += `\nInstruction: Respond shortly and naturally.`;
     }

    }
    // ============================================
    // [插入] 检查并注入世界书内容
    // ============================================
    const worldInfoText = constructWorldInfoPrompt(userMessage, currentChatId);
    if(worldInfoText) {
        // 告诉 AI 这是世界观设定
        systemPrompt += `\n\n[World Setting / Lorebook Data (Important Context)]:\n${worldInfoText}\n`;
    }
    // === 【新增】注入剧情总结和关系进度记忆 ===
if (f.summaries && f.summaries.length > 0) {
    const summaryText = f.summaries.map((s, i) => `- (第${i+1}阶段) ${s.text}`).join('\n');
    systemPrompt += `\n\n[PAST STORY SUMMARIES]:\n${summaryText}\n`;
}
if (f.relationshipLog && f.relationshipLog.length > 0) {
    const relationshipText = f.relationshipLog.map(r => `- ${r.text}`).join('\n');
    systemPrompt += `\n\n[OUR RELATIONSHIP HISTORY]:\n${relationshipText}\n`;
}

    // ============================================

    // === 构建历史消息上下文 (Context Memory) ===
    let contextMessages = [];
    if (currentChatType === 'single') {
        const memoryLimit = parseInt(chatSettings.memoryLimit) || 20; // 获取记忆轮数限制，默认20
        if (memoryLimit > 0) {
            try {
                // 加载历史记录
                const history = await loadChatHistory(currentChatId);
                // 截取最近的 N 条
                const recentHistory = history.slice(-memoryLimit);
                
                // ★ 修改：将其转换为 API 格式时，桥接记忆
                contextMessages = recentHistory.map(msg => {
                    let finalContent = msg.text;
                    // 如果这是线下模式产生的历史，告诉 AI 这是一个回忆/发生过的事件，而不是线上发的消息
                    if (msg.isOffline) {
                        finalContent = `(Offline Event Memory: ${msg.text})`;
                    }
                    return {
                        role: msg.type === 'sent' ? 'user' : 'assistant',
                        content: finalContent
                    };
                });
            } catch (e) {
                console.error("加载历史记录失败:", e);
            }
        }
    }

    // 准备发送请求 (原有逻辑保留)
    let baseUrl = settings.endpoint || '';
    baseUrl = baseUrl.replace(/\/$/, '');
    const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
    
    // 构建最终的消息列表：System -> History -> User Current Message
    const finalMessages = [
        { role: "system", content: systemPrompt },
        ...contextMessages,
        { role: "user", content: userMessage }
    ];

    const payload = { 
        model: settings.model, 
        messages: finalMessages, 
        temperature: parseFloat(settings.temperature || 0.7) 
    };

    try {
        const response = await fetch(apiUrl, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` }, 
            body: JSON.stringify(payload) 
        });
        
        // 删掉 loading
        const el = document.getElementById(loadingId);
        if(el) el.remove();
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const aiReply = data.choices?.[0]?.message?.content || "...";

        // === 处理返回结果 ===
        if (currentChatType === 'group') {
            // ------ 群聊结果解析 (完全保留) ------
            // 需要把 AI 返回的一大段话，按行切分，并识别是谁说的
            const lines = aiReply.split('\n');
            lines.forEach(line => {
                line = line.trim();
                if (!line) return;
                
                // 正则匹配 "名字: 内容"
                const match = line.match(/^([^:：]+)[:：](.*)/);
                
                if (match) {
                    const name = match[1].trim();
                    const content = match[2].trim();
                    // 简单的头像生成
                    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
                    appendMessage(content, 'received', avatarUrl, name);
                } else {
                    appendMessage(line, 'received', null, 'AI');
                }
            });
            
                    } else {
                      // ------ 单聊结果解析 (修正版：先清理结构块，再做翻译) ------
            
            let rawReply = aiReply;          // 原始完整回复
            let extractedDanmaku = [];       // 弹幕数组
            let finalTranslation = null;     // 气泡翻译文本
            let momentText = null;           // 朋友圈正文
            let momentImages = [];           // 朋友圈图片描述

            // === [新增修复] 解析 AI 对亲密付的接受与拒绝 ===
            let intimateDecision = null;
            if (rawReply.includes('[INTIMATE_ACCEPT]')) {
                intimateDecision = 'accepted';
                rawReply = rawReply.replace(/\[INTIMATE_ACCEPT\]/gi, '').trim();
            } else if (rawReply.includes('[INTIMATE_REJECT]')) {
                intimateDecision = 'rejected';
                rawReply = rawReply.replace(/\[INTIMATE_REJECT\]/gi, '').trim();
            }

            if (intimateDecision) {
                loadChatHistory(currentChatId).then(async (history) => {
                    let changed = false;
                    for (let i = history.length - 1; i >= 0; i--) {
                        if (history[i].text.startsWith('[INTIMATE_ME2AI') && history[i].text.includes(':pending:')) {
                            const oldText = history[i].text;
                            history[i].text = oldText.replace(':pending:', `:${intimateDecision}:`);
                            
                            if (intimateDecision === 'accepted') {
                                const parts = oldText.replace('[', '').replace(']', '').split(':');
                                const limitStr = parts[1];
                                let limit = limitStr === '无限' ? '无限' : parseFloat(limitStr);
                                if (!payData.intimatePay) payData.intimatePay = {};
                                payData.intimatePay[currentChatId] = { limit: limit, spent: 0, month: new Date().getMonth() };
                                savePayData(); 
                                
                                setTimeout(() => {
                                    showToast(`<i class="fas fa-heart" style="color:#ff7e67;"></i> 对方已接受你的亲密付`);
                                }, 500);
                            }
                            await IDB.set(scopedChatKey(currentChatId), history);
                            changed = true;
                            break;
                        }
                    }
                    if (changed) {
                        const chatMessages = document.getElementById('chatMessages');
                        chatMessages.innerHTML = '';
                        history.forEach(msg => {
                            if (!msg.isOffline) {
                                let displayAvatar = msg.customAvatar;
                                if (msg.type === 'received' && friendsData[currentChatId]?.avatar) displayAvatar = friendsData[currentChatId].avatar;
                                appendMessage(msg.text, msg.type, displayAvatar, msg.senderName, msg.translation);
                            }
                        });
                    }
                });
            }

            // 1. 提取心声状态 [STATUS_START]...[STATUS_END]，并从 rawReply 中移除
            const statusRegex = /\[STATUS_START\]([\s\S]*?)\[STATUS_END\]/i;
            const statusMatch = rawReply.match(statusRegex);
            if (statusMatch) {
                const statusBlock = statusMatch[1];
                const getVal = (key) => {
                    const reg = new RegExp(key + "[:：]\\s*(.*)", "i");
                    const m = statusBlock.match(reg);
                    return m ? m[1].trim() : null;
                };
                if (friendsData[currentChatId]) {
                    const oldState = friendsData[currentChatId].mindState || {};
                    friendsData[currentChatId].mindState = {
                        action: getVal("Action") || oldState.action || "发呆",
                        location: getVal("Location") || oldState.location || "未知",
                        weather: getVal("Weather") || oldState.weather || "晴",
                        murmur: getVal("Murmur") || "...",
                        hiddenThought: getVal("Secret") || "...",
                        kaomoji: getVal("Kaomoji") || "( ˙W˙ )"
                    };
                    saveFriendsData();
                }
                const currentMindState = friendsData[currentChatId].mindState;
                const actionEl = document.getElementById('mind-action-val');
                const locEl = document.getElementById('mind-location-val');
                const weaEl = document.getElementById('mind-weather-val');
                const kaoEl = document.getElementById('mind-kaomoji-display');
                if (actionEl) actionEl.innerText = currentMindState.action;
                if (locEl)    locEl.innerText    = currentMindState.location;
                if (weaEl)    weaEl.innerText    = currentMindState.weather;
                if (kaoEl)    kaoEl.innerText    = currentMindState.kaomoji;
                rawReply = rawReply.replace(statusRegex, '').trim();
            }

            // 2. 提取弹幕 [DANMAKU_START]...[DANMAKU_END]，并从 rawReply 中移除
            const danmakuRegex = /\[DANMAKU_START\]([\s\S]*?)\[DANMAKU_END\]/i;
            const danmakuMatch = rawReply.match(danmakuRegex);
            if (danmakuMatch) {
                const danmakuText = danmakuMatch[1];
                extractedDanmaku = danmakuText.split('\n').map(s => s.trim()).filter(s => s && s.length > 0);
                rawReply = rawReply.replace(danmakuRegex, '').trim();
            }

            // === [强力兜底清理] 避免漏网之鱼显示在气泡里 ===
            rawReply = rawReply.replace(/\[DANMAKU_START\][\s\S]*/i, '');
            rawReply = rawReply.replace(/\[DANMAKU\][\s\S]*/i, '');
            rawReply = rawReply.replace(/\[STATUS_START\][\s\S]*/i, '');

            // === [新增] 解析 AI 给用户发亲密付的指令，生成交互卡片 ===
            const grantRegex = /\[GRANT_PAY:([\d\.]+|无限)\]/i;
            const grantMatch = rawReply.match(grantRegex);
            if(grantMatch) {
                let limitStr = grantMatch[1];
                rawReply = rawReply.replace(grantRegex, '').trim();
                setTimeout(() => {
                    const msgId = 'invite_ai_' + Date.now();
                    const tagText = `[INTIMATE_AI2ME:${limitStr}:pending:${msgId}]`;
                    appendMessage(tagText, 'received', friendsData[currentChatId].avatar, friendsData[currentChatId].realName);
                    saveMessageToHistory(currentChatId, { text: tagText, type: 'received', senderName: friendsData[currentChatId].realName });
                }, 1000);
            }

            // 3. 朋友圈 [MOMENT] & [MOMENT_IMG]，从 rawReply 中完全移除
            const momentBlockRegex = /\[MOMENT\]([\s\S]*?)\[\/MOMENT\]/i;
            const mMatch = rawReply.match(momentBlockRegex);
            if (mMatch) { momentText = mMatch[1].trim(); }

            const imgRegex = /\[MOMENT_IMG\]([\s\S]*?)\[\/MOMENT_IMG\]/gi;
            let imgMatch;
            while ((imgMatch = imgRegex.exec(rawReply)) !== null) {
                const desc = (imgMatch[1] || '').trim();
                if (desc) momentImages.push(desc);
            }

            rawReply = rawReply.replace(momentBlockRegex, '').replace(imgRegex, '').trim();

            if (momentText) {
                createMomentFromAI(currentChatId, momentText, momentImages);
            }


            // 4. 处理翻译：在“已经去掉状态/弹幕/朋友圈”的文本上做拆分
let finalContent = rawReply;
if (isTranslationEnabled) {
    const idx = rawReply.indexOf(TRANS_SEPARATOR);
    if (idx !== -1) {
        finalContent = rawReply.slice(0, idx).trim();
        finalTranslation = rawReply.slice(idx + TRANS_SEPARATOR.length).trim();
    }
}


             // 5. 分段发送逻辑 (Segmented Sending) - 修改版
            const currentName = currentChatId;
            // 【修复】优先使用好友数据里的头像，没有才用随机的
let avatarUrl = friendsData[currentName]?.avatar;
if (!avatarUrl) {
    avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${friendsData[currentName]?.realName || 'AI'}`;
}

            if (finalContent && finalContent.trim() !== '') {
                // 1. 按换行符拆分正文 (过滤空行)
                const textSegments = finalContent.split('\n').map(s => s.trim()).filter(s => s);
                
                // 2. 按换行符拆分翻译 (如果有)
                const transSegments = finalTranslation ? finalTranslation.split('\n').map(s => s.trim()).filter(s => s) : [];

                let cumulativeDelay = 0; // 累计延迟时间

                // 3. 循环发送每一个气泡
                textSegments.forEach((seg, index) => {
                    // 计算自然延迟：基础延迟 + 根据字数增加阅读时间
                    // 第一条消息几乎立即发送 (延迟很短)，后续消息依次排队
                    const delay = index === 0 ? 100 : (800 + seg.length * 50);
                    cumulativeDelay += delay;

                    setTimeout(() => {
                        // 尝试匹配对应的翻译段落
                        let currentTrans = null;
                        if (transSegments.length > 0) {
                            // 简单索引对应：第1段正文配第1段翻译
                            if (index < transSegments.length) {
                                currentTrans = transSegments[index];
                            }
                            // 如果是最后一段正文，但翻译还有多余的行，把剩余翻译全拼接到这最后一条里（防止翻译丢失）
                            if (index === textSegments.length - 1 && transSegments.length > textSegments.length) {
                                currentTrans = transSegments.slice(index).join('<br>');
                            }
                        }

                        // 上屏 (appendMessage 内部会自动处理虚线分割翻译)
                        appendMessage(seg, 'received', avatarUrl, null, currentTrans);

                        // 红点提醒逻辑
                        const chatLayer = document.getElementById('chatLayer');
                        if (!chatLayer.classList.contains('show') || currentChatId !== currentName) {
                            const dockDot = document.getElementById('dock-dot');
                            if (dockDot) dockDot.style.display = 'block';
                        }

                        // 每一条气泡都单独保存到历史记录
                        if (currentName) {
                            saveMessageToHistory(currentName, {
                                text: seg,
                                type: 'received',
                                customAvatar: avatarUrl,
                                translation: currentTrans,
                                senderName: currentName
                            });
                        }
                    }, cumulativeDelay);
                });
            }

// 6. 发射弹幕（保留原逻辑）
if (isDanmakuOn && extractedDanmaku.length > 0) {
    danmakuPool = extractedDanmaku;
    startDanmakuBatch();
} else if (isDanmakuOn) {
    if (typeof generateDanmakuReaction === 'function') {
        generateDanmakuReaction(finalContent, 'fallback');
    }
}

        }


        
       } catch (error) { 
        const el = document.getElementById(loadingId);
        if(el) el.remove();
        showToast(`<i class="fas fa-wifi" style="color:#ff4d4f;"></i> 生成失败: ${error.message}`); 
    }

}


/**
 * === 修复：关闭添加好友弹窗的函数 ===
 * 之前缺失了这个函数，导致点击取消和×没有任何反应
 */
window.closeAddFriendModal = function() {
    const modal = document.getElementById('add-friend-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}
/* =========================================
   新增：群聊功能数据与逻辑
   ========================================= */

// 1. 定义全局变量
let groupsData = {};          // 存放群组信息
let currentChatType = 'single'; // 标记当前是 'single'(单聊) 还是 'group'(群聊)

// 2. 弹窗控制：显示“创建群聊”弹窗
window.featureCreateGroup = function() {
    toggleWeChatMenu(); // 关掉右上角小菜单
    const modal = document.getElementById('create-group-modal');
    const listContainer = document.getElementById('cg-friend-list');
    const nameInput = document.getElementById('cg-groupname');
    
    // 清空旧数据
    if(nameInput) nameInput.value = '';
    if(listContainer) listContainer.innerHTML = '';
    
    // 渲染好友列表
    const friendNames = Object.keys(friendsData);
    if (friendNames.length === 0) {
        listContainer.innerHTML = '<div style="padding:20px; text-align:center; color:#999; font-size:12px;">暂无好友，请先去添加好友</div>';
    } else {
        friendNames.forEach(name => {
            const f = friendsData[name];
            // 使用 DiceBear 生成头像
            const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.realName}`;
            
            const item = document.createElement('div');
            item.className = 'checklist-item';
            // 点击整行也能勾选
            item.onclick = (e) => {
                if(e.target.type !== 'checkbox') {
                    const cb = item.querySelector('input');
                    if(cb) {
                        cb.checked = !cb.checked;
                        updateCreateBtnCount();
                    }
                }
            };
            
            item.innerHTML = `
                <input type="checkbox" value="${name}" onchange="updateCreateBtnCount()">
                <img src="${avatarUrl}" class="checklist-avatar">
                <span class="checklist-name">${f.remark || f.realName}</span>
            `;
            listContainer.appendChild(item);
        });
    }
    
    updateCreateBtnCount();
    if(modal) modal.classList.add('active');
}

// 3. 关闭群聊弹窗
window.closeCreateGroupModal = function() {
    const modal = document.getElementById('create-group-modal');
    if(modal) modal.classList.remove('active');
}

// 4. 更新按钮上的数字 (例如: 创建(3))
window.updateCreateBtnCount = function() {
    const checkboxes = document.querySelectorAll('#cg-friend-list input[type="checkbox"]:checked');
    const btn = document.querySelector('#create-group-modal .btn-confirm');
    if(btn) btn.innerText = `创建 (${checkboxes.length})`;
}

// 5. 确认创建群聊
window.confirmCreateGroup = function() {
    const nameInput = document.getElementById('cg-groupname');
    const checkboxes = document.querySelectorAll('#cg-friend-list input[type="checkbox"]:checked');
    
    if (checkboxes.length < 1) {
        alert("请至少选择 1 个好友！");
        return;
    }
    
    const groupName = nameInput.value.trim() || "未命名群聊";
    const memberIds = Array.from(checkboxes).map(cb => cb.value); // 获取勾选的好友ID
    
    // 简单起见，用群名当ID（实际开发通常用UUID）
    const groupId = groupName; 
    
    // 存入数据
    groupsData[groupId] = {
        name: groupName,
        members: memberIds
    };
    
    // 添加到聊天列表
    const groupAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${groupName}&backgroundColor=e5e5e5`;
    
    // 这是一个辅助函数，用来把群加到界面上
    addChatListEntry(groupId, groupName, "群聊已创建", groupAvatar, 'group');
    
    closeCreateGroupModal();
}

// 6. 辅助函数：通用的添加聊天列表项 (支持群聊和单聊)
function addChatListEntry(id, displayName, lastMsg, avatarUrl, type) {
    const chatList = document.querySelector('#tab-chats');
    const searchBar = chatList.querySelector('.wc-search-container');
    
    const newItem = document.createElement('div');
    newItem.className = 'wc-chat-item';
    newItem.setAttribute('data-chat-id', id);
    
    // 点击逻辑：如果是群，调用 openGroupChat；如果是单人，调用 openChatDetail
    newItem.onclick = function() { 
        if (type === 'group') openGroupChat(id);
        else openChatDetail(id); 
    }; 

    newItem.innerHTML = `
        <div class="wc-avatar">
            <img src="${avatarUrl}">
        </div>
        <div class="wc-info">
            <div class="wc-top-row">
                <span class="wc-name">${displayName}</span>
                <span class="wc-time">Now</span>
            </div>
            <div class="wc-msg-preview">${lastMsg}</div>
        </div>
    `;

    // 插在搜索框下面
    if(searchBar && searchBar.nextSibling) {
        chatList.insertBefore(newItem, searchBar.nextSibling);
    } else {
        chatList.appendChild(newItem);
    }
}

// 7. 打开群聊窗口逻辑
window.openGroupChat = function(groupId) {
     stopDanmakuLoop();
    const dmLayer = document.getElementById('danmaku-layer');
    if(dmLayer) dmLayer.innerHTML = '';
    danmakuPool = [];
    const group = groupsData[groupId];
    if(!group) return;

    currentChatId = groupId;
    currentChatType = 'group'; // 标记为群聊状态

    const chatView = document.getElementById('chatLayer');
    if(chatView) {
        const titleEl = chatView.querySelector('.chat-header span');
        // 标题显示群名和成员数
        if(titleEl) {
             titleEl.innerHTML = `${group.name}<small style="font-size:9px; color:#aaa; font-weight:400;">${group.members.length + 1} members</small>`;
        }
        chatView.classList.add('show');
    }
    
    // 清空聊天记录
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';
    
    // 显示一条系统消息
    const sysMsg = document.createElement('div');
    sysMsg.style.textAlign = 'center'; sysMsg.style.margin = '15px 0';
    sysMsg.innerHTML = `<span style="background:rgba(0,0,0,0.04); padding:4px 12px; border-radius:4px; font-size:11px; color:#999;">你邀请了 ${group.members.join(', ')} 加入群聊</span>`;
    chatMessages.appendChild(sysMsg);
}
// === [修改版] 角色心声卡片逻辑 V6 (修复版：读取实时AI状态) ===
window.toggleMindCard = function(event) { 
    if (!event) return;

    // 如果没有当前聊天对象，就不打开
    if (!currentChatId || !friendsData[currentChatId]) return;

    const card = document.getElementById('mind-card-overlay');
    const isActive = card.classList.contains('active');
    
    if (event.target.id === 'mind-card-overlay') {
        if(isActive) card.classList.remove('active');
        return;
    }

    if (isActive) {
        card.classList.remove('active');
    } else {
        // === [关键修改]：读取当前角色的存储状态，如果没有则使用默认值 ===
        const friend = friendsData[currentChatId];
        // 如果该角色还没有状态数据，给一个默认的
        const state = friend.mindState || {
            action: "正在看着你",
            location: "聊天界面",
            weather: "晴",
            murmur: "想说点什么...",
            hiddenThought: "...",
            kaomoji: "( ˙W˙ )"
        };
        
        // --- 刷新 UI ---
        // 1. 头像和名字
        const avatarEl = document.querySelector('.mind-big-avatar');
        const nameEl = document.querySelector('.mind-name');
        if(avatarEl) avatarEl.src = friend.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.realName}`;
        if(nameEl) nameEl.innerText = friend.remark || friend.realName;

        // 2. 状态填入
        const actionEl = document.getElementById('mind-action-val');
        if(actionEl) actionEl.innerText = state.action;
        
        document.getElementById('mind-location-val').innerText = state.location;
        document.getElementById('mind-weather-val').innerText = state.weather;

        // 3. 碎碎念 (打字机)
        typeWriterEffect(state.murmur, 'mind-murmur-text'); 

        // 4. 小心思 (打字机)
        setTimeout(() => {
            typeWriterEffect(state.hiddenThought, 'mind-hidden-text');
        }, 300);

        // 5. 颜文字
        document.getElementById('mind-kaomoji-display').innerText = state.kaomoji;

        // --- 显示卡片 ---
        card.classList.add('active');
    }
}


/**
 * 修复缺失的打字机效果函数
 * @param {string} text - 要显示的文字
 * @param {string} elementId - 目标HTML元素的ID
 * @param {number} speed - 打字速度(毫秒)
 */
function typeWriterEffect(text, elementId, speed = 50) {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.innerHTML = ''; // 清空原有文字
    let i = 0;

    function type() {
        if (i < text.length) {
            element.innerHTML += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    }
    type();
}
// =========================================
//  【新增】数据持久化函数 (核心基础)
// =========================================

// [修改版] 异步加载好友数据 (支持迁移)
async function loadFriendsData() {
    try {
        // 1. 尝试从 IndexedDB 获取
        let savedData = await IDB.get(scopedLSKey(FRIENDS_DATA_KEY));


        // 2. 如果没找到，尝试从 LocalStorage 迁移
        if (!savedData) {
            const oldRaw = localStorage.getItem(FRIENDS_DATA_KEY);
            if (oldRaw) {
                console.log("正在将好友数据迁移至 IndexedDB...");
                try {
                    savedData = JSON.parse(oldRaw);
                    await IDB.set(FRIENDS_DATA_KEY, savedData);
                } catch (e) { console.error(e); }
            }
        }

        // 3. 应用数据
        if (savedData) {
            friendsData = savedData;
            console.log("好友数据加载成功 (IndexedDB)");
        } else {
            console.log("无好友数据，初始化默认...");
            resetDefaultFriendData();
        }

        // 4. 刷新界面
        restoreFriendListUI(); 
        rebuildContactsList();

    } catch (e) {
        console.error("加载好友数据失败:", e);
        resetDefaultFriendData();
    }
}


// 初始化默认好友 (当没有存档时用)
// 初始化默认好友 (当没有存档时用) - [已更新适配V2结构]
function resetDefaultFriendData() {
    friendsData = {
       
    };
    saveFriendsData(); // 立即保存一下
}


// [修改版] 异步保存好友数据 (无限制)
async function saveFriendsData() {
    try {
        // 使用 IDB.set 保存
        await IDB.set(scopedLSKey(FRIENDS_DATA_KEY), friendsData);

        // console.log("好友数据已保存 (IndexedDB)");
    } catch (e) {
        console.error("保存好友数据失败:", e);
    }
}
// =========================================
//  【修改后】聊天详细设置独立页面逻辑
// =========================================

// 1. 打开设置页面并填充数据
// =========================================
//  【重写后】打开聊天详细设置页面 (适配 V2 新界面)
// =========================================
window.openChatSettingsPage = function() {
    // 仅支持单人聊天设置
    if (!currentChatId || currentChatType !== 'single') {
        alert("目前仅支持对单人角色进行设置。");
        return;
    }

    const page = document.getElementById('chatSettingsPage');
    if (!page) return;

    // 获取当前正在聊天的角色数据
    const friend = friendsData[currentChatId];
    if (!friend) {
        alert("找不到当前角色的数据，错误。");
        return;
    }
    
    // 确保 settings 对象存在，避免报错
    // 如果是旧数据，这里会给一个默认空对象，防止崩溃
    const settings = friend.chatSettings || {};

    // --- 1. 填充基础信息 ---
    document.getElementById('cs-realname').value = friend.realName || '';
    document.getElementById('cs-remark').value = friend.remark || '';
    document.getElementById('cs-persona').value = friend.persona || '';
   // 开场白设置回填
const greetingMode = friend.greetingMode || (friend.tavernGreeting ? 'tavern' : 'custom');
document.getElementById('cs-greeting-mode').value = greetingMode;
document.getElementById('cs-greeting-custom').value = friend.greetingCustom || friend.greeting || '';
document.getElementById('cs-greeting-tavern').value = friend.tavernGreeting || '';
toggleGreetingEditor();
renderGreetingListUI(friend);

 
    
    // --- 2. 处理头像预览 ---
    const avatarHiddenVal = document.getElementById('cs-avatar-hidden-val');
    const avatarPreviewImg = document.querySelector('#cs-avatar-preview img');
    const currentAvatarUrl = friend.avatar || ''; // 获取当前角色的头像

    avatarHiddenVal.value = currentAvatarUrl; // 存入隐藏域，方便保存时读取
    if (currentAvatarUrl) {
        avatarPreviewImg.src = currentAvatarUrl;
        avatarPreviewImg.style.display = 'block';
    } else {
        // 如果没有头像，用一个默认的占位图
        avatarPreviewImg.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=placeholder_icon'; 
        avatarPreviewImg.style.display = 'block';
    }

    // --- 3. 动态生成世界书复选框列表 ---
    const wbContainer = document.getElementById('cs-worldbook-container');
    wbContainer.innerHTML = ''; // 先清空容器
    
    // 获取当前角色已选的世界书ID列表 (确保是数组，旧数据可能是字符串)
    let selectedWbIds = [];
    if (Array.isArray(friend.worldbook)) {
        selectedWbIds = friend.worldbook;
    } else if (typeof friend.worldbook === 'string' && friend.worldbook) {
        // 兼容旧数据：如果以前是字符串，就把它当做唯一的元素
        selectedWbIds = [friend.worldbook];
    }

    // 遍历数据源，生成复选框
    // 修改为：使用 worldBooks 全局变量 (这是世界书APP里的真实数据)
    
    if (typeof worldBooks === 'undefined' || worldBooks.length === 0) {
        wbContainer.innerHTML = '<div style="padding:10px; color:#999; font-size:12px;">暂无世界书，请去 WorldBook APP 创建。</div>';
    } else {
        worldBooks.forEach(wb => {
            const item = document.createElement('div');
            item.className = 'wb-checklist-item';
            // 点击整行都能触发勾选
            item.onclick = (e) => {
                if(e.target.type !== 'checkbox') {
                    const cb = item.querySelector('input');
                    cb.checked = !cb.checked;
                }
            };
            
            // 判断是否应该勾选
            const isChecked = selectedWbIds.includes(wb.id) ? 'checked' : '';
            
            // 注意：这里 id 是 wb.id, 名字是 wb.title (根据你的世界书数据结构)
            item.innerHTML = `
                <input type="checkbox" value="${wb.id}" ${isChecked}>
                <span class="wb-checklist-name">${wb.title}</span>
            `;
            wbContainer.appendChild(item);
        });
    }
    
    // --- 4. 填充高级设置 ---
    document.getElementById('cs-memory-limit').value = settings.memoryLimit || 20;
    
    // 翻译设置 (下拉框和输入框)
    document.getElementById('cs-translation-mode').value = settings.translationMode || 'off';
    document.getElementById('cs-target-lang').value = settings.targetOutputLang || '';

    // 主动发言设置 (开关和时间)
    const inactivityToggle = document.getElementById('cs-inactivity-toggle');
    const inactivityTimeBox = document.getElementById('cs-inactivity-time-box');
    
    inactivityToggle.checked = settings.inactivityEnabled || false;
    document.getElementById('cs-inactivity-time').value = settings.inactivityTime || 300;
    // 根据开关状态决定是否显示时间输入框
    inactivityTimeBox.style.display = inactivityToggle.checked ? 'block' : 'none';

    // --- 5. 填充状态栏正则设置 (酒馆风格) ---
    const statusToggle = document.getElementById('cs-status-regex-toggle');
    const statusBox = document.getElementById('cs-status-regex-box');

    statusToggle.checked = settings.statusRegexEnabled || false;
    document.getElementById('cs-status-format-req').value = settings.statusFormatReq || '';
    document.getElementById('cs-status-extract-regex').value = settings.statusExtractRegex || '';
    document.getElementById('cs-status-replace-regex').value = settings.statusReplaceRegex || '';
    // 根据开关状态决定是否显示正则输入区域
    statusBox.style.display = statusToggle.checked ? 'flex' : 'none';


    // 最后显示页面 (滑入动画)
    page.classList.add('show');
}

// 2. 关闭设置页面
window.closeChatSettingsPage = function() {
    const page = document.getElementById('chatSettingsPage');
    if (page) page.classList.remove('show');
    setTimeout(() => { page.style.zIndex = "300"; }, 400);
}


// =========================================
//  【重构后】保存聊天设置数据 (V3 - 实现了开场白更换后自动清空)
// =========================================
// =========================================
//  【你的要求实现版】保存聊天设置 (V3 - 实现了开场白更换后自动清空)
// =========================================
window.saveChatSettings = async function() {
    if (!currentChatId || !friendsData[currentChatId]) {
        alert("错误：没有找到当前聊天对象。");
        return;
    }
    
    const friend = friendsData[currentChatId];
    
    // [关键] 1. 在修改前，先获取旧的有效开场白
    const oldGreeting = getEffectiveGreeting(friend);

    // --- 2. 读取所有设置并更新到friend对象 (你的东西都在这里) ---
    const newRemark = document.getElementById('cs-remark').value.trim();
    if (newRemark !== friend.remark) {
        friend.remark = newRemark;
        // 如果当前聊天窗口开着，立刻更新顶部标题
        const chatTitleEl = document.querySelector('#chatLayer.show .chat-header span');
        if(chatTitleEl) {
             chatTitleEl.innerHTML = `${friend.remark || friend.realName}<small style="font-size:9px; color:#aaa; font-weight:400;">Online</small>`;
        }
    }
    friend.realName = document.getElementById('cs-realname').value.trim();
    friend.persona = document.getElementById('cs-persona').value.trim();
    friend.avatar = document.getElementById('cs-avatar-hidden-val').value;

    if(!friend.realName) {
        alert("真实姓名不能为空！");
        return;
    }

    // 开场白设置
    friend.greetingMode = document.getElementById('cs-greeting-mode').value;
    friend.greetingCustom = document.getElementById('cs-greeting-custom').value.trim();
    const selectedGreetingRadio = document.querySelector('input[name="cs-greeting-radio"]:checked');
    friend.greetingSelected = selectedGreetingRadio ? parseInt(selectedGreetingRadio.value, 10) : 0;

    // 世界书
    const selectedWbCheckboxes = document.querySelectorAll('#cs-worldbook-container input[type="checkbox"]:checked');
    friend.worldbook = Array.from(selectedWbCheckboxes).map(cb => cb.value);

    // 高级设置 (翻译、记忆等全都在)
    friend.chatSettings = {
        memoryLimit: parseInt(document.getElementById('cs-memory-limit').value) || 20,
        translationMode: document.getElementById('cs-translation-mode').value,
        targetOutputLang: document.getElementById('cs-target-lang').value.trim(),
        inactivityEnabled: document.getElementById('cs-inactivity-toggle').checked,
        inactivityTime: parseInt(document.getElementById('cs-inactivity-time').value) || 300,
        statusRegexEnabled: document.getElementById('cs-status-regex-toggle').checked,
        statusFormatReq: document.getElementById('cs-status-format-req').value,
        statusExtractRegex: document.getElementById('cs-status-extract-regex').value,
        statusReplaceRegex: document.getElementById('cs-status-replace-regex').value
    };

    // [关键] 3. 在所有数据更新后，获取新的有效开场白
    const newGreeting = getEffectiveGreeting(friend);
    
    // --- 4. 执行保存和后续操作 ---
    await saveFriendsData();
    rebuildContactsList(); // 更新通讯录
    restoreFriendListUI(); // 更新聊天列表(已修复重复bug)

    // [关键] 5. 根据开场白是否变化，执行不同逻辑
    if (oldGreeting !== newGreeting) {
        // --- 开场白变了，执行清空逻辑 ---
        
        // a. 从数据库删除历史记录
        await IDB.delete(scopedChatKey(currentChatId));

        // b. 清空聊天界面DOM
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.innerHTML = '';
        }
        
        // c. 显示新的开场白 (如果新开场白不是空的)
        if (newGreeting) {
            const avatar = friend.avatar || null;
            const name = friend.remark || friend.realName;
            appendMessage(newGreeting, 'received', avatar, name);
            await saveMessageToHistory(currentChatId, { text: newGreeting, type: 'received', senderName: name, customAvatar: avatar });
        }
        
        closeChatSettingsPage();
        alert('开场白已更新，聊天记录已自动清空！');

    } else {
        // --- 开场白没变，只保存设置，不碰聊天记录 ---
        closeChatSettingsPage();
        alert(`角色 "${friend.remark || friend.realName}" 的设置已保存。`);
    }
};


/* =========================================
   [新增] WorldBook Manager (世界书核心逻辑)
   ========================================= */

const WORLDBOOK_KEY = 'myCoolPhone_worldBooks';
let worldBooks = []; // 内存中的世界书列表
let currentBookId = null; // 当前正在编辑的书ID
let tempEntries = []; // 当前正在编辑的条目缓存
let editingEntryIndex = -1; // 当前正在编辑的条目索引

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
            // 初始化默认数据
            worldBooks = [{
                id: 'wb_' + Date.now(),
                title: "示例：魔法世界",
                category: "Magic",
                global: true,
                strategy: "depth",
                entries: [
                    { keys: "魔法, 魔力", content: "在这个世界中，魔法由以太构成，每个人出生都带有魔力属性。", comment: "基础设定", enabled: true }
                ]
            }];
            saveWorldBooksData(); // 保存初始状态
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
        document.getElementById('wb-shelf-view').style.display = 'block';
        document.getElementById('wb-detail-view').style.display = 'none';
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
    document.getElementById('wb-shelf-view').style.display = 'none';
    document.getElementById('wb-detail-view').style.display = 'block';
}

function renderEntriesList() {
    const list = document.getElementById('wb-entries-list');
    list.innerHTML = '';
    
    tempEntries.forEach((entry, index) => {
        const item = document.createElement('div');
        item.className = 'wb-entry-item';
        item.innerHTML = `
            <div class="wb-entry-info">
                <div class="wb-entry-keys">${entry.keys || '(No Keywords)'}</div>
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
    document.getElementById('wb-detail-view').style.display = 'none';
    document.getElementById('wb-shelf-view').style.display = 'block';
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
    } else {
        // 编辑：填充
        const entry = tempEntries[index];
        document.getElementById('entry-keys').value = entry.keys;
        document.getElementById('entry-content').value = entry.content;
        document.getElementById('entry-comment').value = entry.comment || '';
        document.getElementById('entry-enabled').checked = entry.enabled !== false;
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

    if(!content) { alert("内容不能为空"); return; }

    const entryData = { keys, content, comment, enabled };

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
function constructWorldInfoPrompt(userMessage, characterName) {
    let injectedContent = [];
    
    // 获取当前角色的关联世界书
    let linkedBookIds = [];
    if(characterName && friendsData[characterName]) {
        const charWb = friendsData[characterName].worldbook;
        if(Array.isArray(charWb)) linkedBookIds = charWb;
        else if(charWb) linkedBookIds = [charWb];
    }
    
    // 遍历所有世界书
    worldBooks.forEach(book => {
        // 条件：要么是全局开启，要么是当前角色关联的
        const isLinked = linkedBookIds.includes(book.id);
        if (book.global || isLinked) {
            book.entries.forEach(entry => {
                if(!entry.enabled) return;
                
                const keysArr = entry.keys.split(/,|，/).map(k => k.trim()).filter(k => k);
                let triggered = false;

                // 简单的关键词匹配
                for(let key of keysArr) {
                    if(userMessage.toLowerCase().includes(key.toLowerCase())) {
                        triggered = true;
                        break;
                    }
                }
                
                if(triggered) {
                    injectedContent.push(entry.content);
                    console.log(`[WorldBook] 触发: ${book.title} -> ${keysArr[0]}`);
                }
            });
        }
    });

    return injectedContent.join('\n\n');
}
// ============================================================
// 朋友圈数据与操作
// ============================================================

function loadMomentsFeed() {
    const raw = localStorage.getItem(scopedLSKey(MOMENTS_FEED_KEY));

    if (raw) {
        try {
            momentsFeed = JSON.parse(raw) || [];
        } catch (e) {
            momentsFeed = [];
        }
    } else {
        momentsFeed = [];
    }
    renderMomentsFeed();
}

function saveMomentsFeed() {
    localStorage.setItem(scopedLSKey(MOMENTS_FEED_KEY), JSON.stringify(momentsFeed || []));

}

function renderMomentsFeed() {
    const list = document.getElementById('moments-feed-list');
    if (!list) return;
    list.innerHTML = '';

    if (!momentsFeed || !momentsFeed.length) return;
    const sorted = [...momentsFeed].sort((a, b) => (b.time || 0) - (a.time || 0));

    sorted.forEach(m => {
        const f = friendsData[m.authorId] || {};
        const displayName = f.remark || f.realName || m.authorId;
        const avatar = f.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.realName || m.authorId}`;
        const likeCount = m.likeCount || 0;
        const likedClass = m.likedByMe ? 'liked' : '';
        const timeText = m.time ? new Date(m.time).toLocaleString().replace(/:\d{2}$/, '') : '';

        // 图片处理
        const imgs = (m.images || []).slice(0, 9);
        const count = imgs.length;
        let gridClass = 'grid-1';
        if (count >= 2 && count <= 4) gridClass = 'grid-2';
        else if (count >= 5) gridClass = 'grid-3';

        const imagesHtml = imgs.map((img, idx) => {
           if (img.isAI) {
                const safeDesc = (img.desc || '').replace(/"/g, '&quot;');
                return `<div class="moment-image-ai" data-desc="${safeDesc}"></div>`;
            } else if (img.url) {
                const safeUrl = img.url.replace(/"/g, '&quot;');
                if (count === 1) return `<img src="${safeUrl}" class="single-img">`;
                else return `<div class="moment-img-wrap"><img src="${safeUrl}"></div>`;
            }
            return '';
        }).join('');

        // 评论生成
        const commentsHtml = (m.comments || []).map(c => {
            const safeText = (c.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const safeAuthor = (c.authorName || c.authorId || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const aiClass = c.isAI ? 'moment-comment-ai' : '';
            const clickAttr = c.authorId !== 'ME' 
                ? `onclick="setReplyTarget('${m.id}', '${c.id}', '${safeAuthor}', '${c.authorId}')"` 
                : '';
            
            // 增加右键/长按事件 handleCommentAdmin
const adminAction = `oncontextmenu="handleCommentAdmin(event, '${m.id}', '${c.id}'); return false;" 
                     ontouchstart="this.lpTimer = setTimeout(()=>handleCommentAdmin(event, '${m.id}', '${c.id}'), 600);" 
                     ontouchend="clearTimeout(this.lpTimer);"`;

return `
    <div class="moment-comment ${aiClass}" 
         style="cursor:pointer;"
         data-comment-id="${c.id}" 
         ${adminAction}
         ${clickAttr}>
        <span class="moment-comment-author">${safeAuthor}：</span>
        <span class="moment-comment-text">${safeText}</span>
    </div>
`;

        }).join('');

        // 文本处理
        let safeText = '';
        const rawText = (m.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const separator = '___TRANSLATION_SEP___'; 
        if (rawText.includes(separator)) {
            const parts = rawText.split(separator);
            safeText = `<div>${parts[0].trim().replace(/\n/g, '<br>')}</div>
                        <div class="bubble-translation" style="display:block; border-top: 1px dashed #ccc; margin-top:8px; padding-top:8px; color:#888; font-size:12px;">
                            ${parts[1].trim().replace(/\n/g, '<br>')}
                        </div>`;
        } else {
            safeText = rawText.replace(/\n/g, '<br>');
        }

        const card = document.createElement('div');
        card.className = 'moment-card';
        card.setAttribute('data-moment-id', m.id);
        card.innerHTML = `
            <div class="moment-avatar"><img src="${avatar}"></div>
            <div class="moment-content">
                <div class="moment-name-row">
                    <div class="moment-name">${displayName}</div>
                    <div class="moment-card-actions">
                        <i class="fas fa-edit" onclick="editMoment('${m.id}')"></i>
                        <i class="fas fa-trash" onclick="deleteMoment('${m.id}')"></i>
                    </div>
                </div>
                <div class="moment-text">${safeText}</div>
                <div class="moment-images ${gridClass}">${imagesHtml}</div>
                <div class="moment-meta">
                    <span>${timeText}</span>
                    <div class="moment-like-pill ${likedClass}" onclick="toggleMomentLike('${m.id}')">
                        <i class="fas fa-heart" style="color:#ff5e5e;"></i>
                        <span>${likeCount}</span>
                    </div>
                </div>
                <div class="moment-comments">${commentsHtml}</div>
                <div class="moment-comment-input-row">
                    <input type="text" class="moment-comment-input"
                           placeholder="评论..."
                           onkeydown="if(event.key==='Enter'){event.preventDefault(); addMomentComment('${m.id}');}">
                    <button type="button" onclick="addMomentComment('${m.id}')">发送</button>
                </div>
            </div>
        `;
        list.appendChild(card);
    });
}

window.createMomentFromAI = function(authorId, text, aiImageDescList = []) {
    const id = 'm_' + Date.now();
    const images = (aiImageDescList || []).map((desc, idx) => ({
        id: id + '_img_' + idx,
        isAI: true,
        desc: desc
    }));
    const moment = {
        id,
        authorId,
        text,
        time: Date.now(),
        likeCount: 0,
        likedByMe: false,
        comments: [],
        images
    };
    momentsFeed.push(moment);
    saveMomentsFeed();
    renderMomentsFeed();
     const dot = document.getElementById('moments-dot');
    if (dot) dot.style.display = 'block';
};



// 点赞 / 取消点赞（当前用户）
window.toggleMomentLike = function(momentId) {
    const m = momentsFeed.find(x => x.id === momentId);
    if (!m) return;
    if (m.likedByMe) {
        m.likedByMe = false;
        m.likeCount = Math.max(0, (m.likeCount || 0) - 1);
    } else {
        m.likedByMe = true;
        m.likeCount = (m.likeCount || 0) + 1;
    }
    saveMomentsFeed();
    renderMomentsFeed();
};

// 编辑朋友圈文本
window.editMoment = function(momentId) {
    const m = momentsFeed.find(x => x.id === momentId);
    if (!m) return;
    const newText = prompt('编辑朋友圈内容：', m.text || '');
    if (newText === null) return;
    m.text = newText.trim();
    saveMomentsFeed();
    renderMomentsFeed();
};

// 删除朋友圈
window.deleteMoment = function(momentId) {
    if (!confirm('确定删除这条朋友圈吗？')) return;
    momentsFeed = momentsFeed.filter(x => x.id !== momentId);
    saveMomentsFeed();
    renderMomentsFeed();
};

// 自己发表评论
window.addMomentComment = function(momentId) {
    const card = document.querySelector(`.moment-card[data-moment-id="${momentId}"]`);
    if (!card) return;
    const input = card.querySelector('.moment-comment-input');
    if (!input) return;
    const text = (input.value || '').trim();
    if (!text) return;

    const m = momentsFeed.find(x => x.id === momentId);
    if (!m) return;
    if (!m.comments) m.comments = [];

    const comment = {
        id: 'c_' + Date.now(),
        authorId: 'ME',
        authorName: '我',
        text,
        isAI: false,
        time: Date.now
    };
    m.comments.push(comment);
    input.value = '';
    saveMomentsFeed();
    renderMomentsFeed();
};

// 长按 / 右键编辑 AI 评论
window.editMomentComment = function(momentId, commentId) {
    const m = momentsFeed.find(x => x.id === momentId);
    if (!m || !m.comments) return;
    const c = m.comments.find(x => x.id === commentId);
    if (!c) return;
    if (!c.isAI) {
        alert('只能编辑 AI 的评论。');
        return;
    }
    const newText = prompt('修改 AI 评论内容：', c.text || '');
    if (newText === null) return;
    c.text = newText.trim();
    saveMomentsFeed();
    renderMomentsFeed();
};


// ============================================================
// 【新增】聊天记录持久化与列表恢复功能 (粘贴在 apps.js 最底部)
// ============================================================
const CHAT_HISTORY_KEY = 'myCoolPhone_chatHistory';
const ONLINE_VOICE_KEY = 'myCoolPhone_onlineVoiceConfig';

// autoSendAI=false：避免和你现有“点星星回复”冲突（不重复触发）


// 1. 保存单条消息到 IndexedDB (已集成自动总结触发器)
async function saveMessageToHistory(chatId, msgData) {
    if (!chatId) return;
    
    let chatHistory = (await IDB.get(scopedChatKey(chatId))) || [];

    
    // 生成唯一ID并保存
    msgData.id = msgData.id || 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    msgData.timestamp = new Date().getTime();
    chatHistory.push(msgData);
    
    await IDB.set(scopedChatKey(chatId), chatHistory);


    // 更新好友列表的预览
    if (friendsData[chatId]) {
        friendsData[chatId].lastMessage = msgData.text; 
        saveFriendsData(); 
    }

    const allChatItems = document.querySelectorAll('.wc-chat-item');
    allChatItems.forEach(item => {
        const nameTag = item.querySelector('.wc-name');
        if (nameTag && nameTag.innerText.trim() === chatId) {
            const previewTag = item.querySelector('.wc-msg-preview');
                        if (previewTag) {
                let previewText = msgData.text;
                // === 拦截亲密付标签，让外面列表显示得干干净净 ===
                if (previewText.startsWith('[INTIMATE_')) {
                    previewText = '[亲密付消息]';
                } else if (msgData.isOffline) {
                    previewText = '[故事进展]';
                } else if (previewText.length > 25) {
                    previewText = previewText.substring(0, 25) + '...';
                }
                previewTag.innerText = previewText;
            }

            const timeTag = item.querySelector('.wc-time');
            if (timeTag) timeTag.innerText = 'Just now';
        }
    });
    
    // === 【新增】自动总结触发逻辑 ===
    const friend = friendsData[chatId];
    if (friend && friend.summaryConfig) {
        const config = friend.summaryConfig;
        const turnCount = parseInt(config.turnCount, 10);
        // 检查是否达到触发轮数 (一问一答算2轮)
        if (turnCount > 0 && chatHistory.length > 0 && chatHistory.length % turnCount === 0) {
            console.log(`达到 ${turnCount} 轮，触发自动总结...`);
            // 截取最近的 turnCount 条记录
            const recentMessages = chatHistory.slice(-turnCount);
            generateAutoSummary(recentMessages);
        }
    }
}


// 2. 加载指定好友的聊天记录 (异步)
async function loadChatHistory(chatId) {
    const history = await IDB.get(scopedChatKey(chatId));

    return history || [];
}

// [BUG修复版] 页面加载时，把保存的好友重新画到列表上
function restoreFriendListUI() {
    const chatList = document.querySelector('#tab-chats');
    if (!chatList) return;

    // 1. 【核心修复】先删除所有现存的聊天条目，防止重复渲染
    const existingItems = chatList.querySelectorAll('.wc-chat-item');
    existingItems.forEach(item => {
        // 你的HTML里写死了一个叫 "Hannah AI" 的，我们把它也删了，全部由数据驱动
        item.remove();
    });

    // 2. 【保留】遍历所有好友数据，重新画出来
    Object.keys(friendsData).forEach(id => {
        const friend = friendsData[id];
        const previewMsg = friend.lastMessage || getEffectiveGreeting(friend) || '点击开始聊天';
        
        // 兼容你可能存在的旧头像数据
        const avatarUrl = friend.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.realName || id}`;
        
        // 调用统一的添加函数
        addChatListEntry(id, friend.remark || friend.realName, previewMsg, avatarUrl, 'single');
    });
}

/* =========================================
   [新增] 聊天扩展功能逻辑 (Feature Expansion)
   ========================================= */

// 1. 面板切换逻辑
window.toggleChatPanel = function(type) {
    const container = document.getElementById('chat-extra-panels');
    const panelEmoji = document.getElementById('panel-emoji');
    const panelPlus = document.getElementById('panel-plus');
    
    // 如果点击的是当前已经打开的，就关闭
    if (container.classList.contains('open') && 
       ((type === 'emoji' && panelEmoji.style.display === 'block') ||
        (type === 'plus' && panelPlus.style.display === 'block'))) {
        
        container.classList.remove('open');
        setTimeout(() => {
            panelEmoji.style.display = 'none';
            panelPlus.style.display = 'none';
        }, 300);
        return;
    }

    // 切换显示内容
    panelEmoji.style.display = 'none';
    panelPlus.style.display = 'none';
    
    if (type === 'emoji') panelEmoji.style.display = 'block';
    if (type === 'plus') panelPlus.style.display = 'block';

    // 打开容器
    container.classList.add('open');
    
    // 自动滚动到底部
    const chatMessages = document.getElementById('chatMessages');
    setTimeout(() => chatMessages.scrollTop = chatMessages.scrollHeight, 300);
}

// 2. 插入 Emoji 到输入框
window.insertEmoji = function(emoji) {
    const input = document.getElementById('chatInput');
    input.value += emoji;
    input.focus();
}

// 3. 统一发送富媒体消息的函数
function sendRichMessage(htmlContent, typeClass, hiddenTextForAI) {
    // 1. 渲染用户发的消息
    const chatMessages = document.getElementById('chatMessages');
    const row = document.createElement('div');
    row.className = 'chat-row sent';
    
    // 构建头像
    const avatar = document.createElement('img');
    avatar.className = 'chat-avatar-img';
    avatar.src = AVATAR_USER; 
    
    // 构建气泡 (使用 rich-bubble 去掉默认样式)
    const bubble = document.createElement('div');
    bubble.className = `message-bubble rich-bubble ${typeClass}`;
    bubble.innerHTML = htmlContent;
    
    // 组装
    row.appendChild(bubble);
    row.appendChild(avatar);
    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // 2. 如果需要 AI 回复，发送隐藏指令
    if (hiddenTextForAI) {
        sendMessageToAI(hiddenTextForAI);
    }
    
    // 3. 关闭面板
    document.getElementById('chat-extra-panels').classList.remove('open');
}

// --- 功能 A: 发送图片 ---
window.triggerImageUpload = function() {
    document.getElementById('chat-image-input').click();
}
window.handleChatImage = function(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const imgHtml = `<div class="msg-image-content"><img src="${e.target.result}"></div>`;
        // 告诉 AI 用户发了图
        sendRichMessage(imgHtml, '', `[System: User sent an image. Simulate that you can see it and describe a generic beautiful scene or react to it happily.]`);
    };
    reader.readAsDataURL(file);
    input.value = '';
}

// --- 功能 B: 发送位置 ---
window.sendLocation = function() {
    const html = `
        <div class="msg-location-card">
            <div class="loc-info">
                <div class="loc-title">My Current Location</div>
                <div class="loc-addr">Shanghai, China</div>
            </div>
            <div class="loc-map"></div>
        </div>
    `;
    sendRichMessage(html, '', `[System: User shared their location (Shanghai). Ask if they want to meet up or comment on the location.]`);
}

// --- 功能 C: 拍一拍 ---
window.triggerNudge = function() {
    // 拍一拍是系统提示消息，不带头像
    const chatMessages = document.getElementById('chatMessages');
    const note = document.createElement('div');
    note.className = 'msg-nudge-system';
    note.innerText = `You nudged "${friendsData[currentChatId]?.realName || 'Hannah'}"`;
    chatMessages.appendChild(note);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // 震动效果
    chatMessages.style.animation = 'none';
    setTimeout(() => chatMessages.style.animation = 'float-slow 0.2s ease', 10);

    // AI 回应
    setTimeout(() => {
        sendMessageToAI(`[System: User just "nudged" (double-tapped) you. React playfully or ask what's up.]`);
    }, 1000);
    
    document.getElementById('chat-extra-panels').classList.remove('open');
}

// --- 功能 D: 转账 ---
window.sendRedPacket = function() {
    const amount = (Math.random() * 100 + 1).toFixed(2); // 随机金额
    const html = `
        <div class="msg-transfer-card">
            <div class="transfer-top">
                <div class="transfer-icon"><i class="fas fa-yen-sign"></i></div>
                <div class="transfer-info">
                    <div class="transfer-amount">¥${amount}</div>
                    <div class="transfer-desc">Transfer to you</div>
                </div>
            </div>
            <div class="transfer-bottom">WeChat Pay</div>
        </div>
    `;
    sendRichMessage(html, '', `[System: User sent you money (¥${amount}). React with surprise and gratitude, or playfully refuse.]`);
}

// --- 功能 E: 语音消息 ---
window.sendVoiceMsg = function() {
    const seconds = Math.floor(Math.random() * 10 + 2);
    const html = `
        <div class="msg-voice-bar" onclick="playVoiceAnim(this)">
            <div class="msg-voice-duration">${seconds}"</div>
            <i class="fas fa-rss msg-voice-icon" style="transform: rotate(45deg);"></i>
        </div>
    `;
    // AI 回复语音的 Prompt
    sendRichMessage(html, '', `[System: User sent a voice message. Reply with a text message, BUT imply that you listened to it. Optional: You can send a voice message back by adding [VOICE] at the start of your reply.]`);
}

// --- 功能 F: 一起听歌 ---
window.sendMusicShare = function() {
    const html = `
        <div class="msg-music-card">
            <img src="https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=100&auto=format&fit=crop" class="music-cover">
            <div class="music-text">
                <div class="music-name">Midnight Rain</div>
                <div class="music-author">Taylor Swift</div>
            </div>
            <div class="music-icon"><i class="fas fa-play-circle"></i></div>
        </div>
    `;
    sendRichMessage(html, '', `[System: User invited you to listen to "Midnight Rain" by Taylor Swift together. Comment on the song.]`);
}

// --- 功能 G: 表情包 ---
window.sendSticker = function(src) {
    const html = `<img src="${src}" class="msg-sticker-img">`;
    sendRichMessage(html, '', `[System: User sent a funny sticker/GIF. React with an emoji or a short laugh.]`);
}

/* =========================================
   [修改] AI 回复渲染逻辑 (支持 AI 发语音/图片/转账)
   ========================================= */

// 为了让 AI 也能发这些，我们需要拦截 appendMessage 或者在 sendMessageToAI 的回调里解析特殊标签
// 这里我们修改 appendMessage 的逻辑，让它支持 HTML 内容渲染

// 请注意：原有的 appendMessage 使用 text.replace(/\n/g, '<br>')
// 这种方式不支持 HTML 标签。我们需要做一个小调整。

// 覆盖原有的 appendMessage 函数 (请确保替换旧的)
/* =========================================
   [核心修改] appendMessage 
   包含：右键菜单、多选框、以及你原有的所有富媒体/翻译逻辑
   ========================================= */
window.appendMessage = function(text, type, customAvatar = null, senderName = null, translation = null, msgId = null) {
    const chatMessages = document.getElementById('chatMessages');
    
    // 1. 生成或使用传入的唯一ID (用于撤回定位)
    const uniqueId = msgId || ('msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
    
    const row = document.createElement('div');
    row.className = `chat-row ${type}`;
    // 绑定数据供菜单使用
    row.setAttribute('data-msg-id', uniqueId); 
    row.setAttribute('data-msg-text', text);   
    row.setAttribute('data-msg-sender', senderName || (type==='sent'?'ME':'AI')); 

    // === [新增] 多选框容器 (默认隐藏，CSS控制) ===
    const checkboxWrap = document.createElement('div');
    checkboxWrap.className = 'chat-row-checkbox';
    checkboxWrap.innerHTML = `<div class="wc-msg-checkbox" onclick="toggleMsgSelection(this)"></div>`;

    // 2. 头像 (修复版：优先读取好友数据里的头像)
    const img = document.createElement('img');
    img.className = 'chat-avatar-img';
    if (type === 'sent') {
        img.src = AVATAR_USER; 
    } else {
        // 逻辑优先级：
        // 1. 强制传入的 customAvatar (通常用于群聊或特殊事件)
        // 2. friendsData 里存的头像 (用户设置的)
        // 3. 根据 senderName 生成的 DiceBear 头像
        // 4. 默认 AVATAR_AI
        
        let finalAvatar = customAvatar;
        
        if (!finalAvatar && senderName && friendsData[senderName] && friendsData[senderName].avatar) {
             finalAvatar = friendsData[senderName].avatar;
        }
        
        if (!finalAvatar) {
             finalAvatar = senderName ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${senderName}` : AVATAR_AI;
        }
        
        img.src = finalAvatar;
    }

    // 3. 气泡容器 (保留原有逻辑)
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content-wrapper';
    if (type === 'received' && senderName) {
        const nameLabel = document.createElement('div');
        nameLabel.className = 'chat-sender-name';
        nameLabel.innerText = senderName;
        contentWrapper.appendChild(nameLabel);
    }

    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${type}`;
    
    // === [新增] 绑定右键/长按事件 触发菜单 ===
    // 电脑右键
    bubble.oncontextmenu = function(e) {
        e.preventDefault();
        showBubbleMenu(e, uniqueId, text, type, row);
        return false;
    };
    // 手机长按 (600毫秒)
    let pressTimer;
    bubble.addEventListener('touchstart', (e) => {
        pressTimer = setTimeout(() => {
            showBubbleMenu(e, uniqueId, text, type, row);
        }, 600); 
    });
    bubble.addEventListener('touchend', () => clearTimeout(pressTimer));
    bubble.addEventListener('touchmove', () => clearTimeout(pressTimer));

    // 4. 解析内容 (绝对保留你原有的 [VOICE] [IMAGE] 逻辑)
    let isRichContent = false;
    let contentHtml = text; // 默认是文本

    // 检测 [VOICE] 指令 -> 变语音条
    if (text.startsWith('[VOICE]')) {
        const transcript = text.replace('[VOICE]', '');
        const sec = Math.max(1, Math.min(59, Math.ceil(transcript.length / 4) || 5)); // 估算时长
        contentHtml = `
          <div class="msg-voice-bar" onclick="this.nextElementSibling.classList.toggle('show')">
            <div class="msg-voice-duration">${sec}"</div>
            <i class="fas fa-rss msg-voice-icon" style="transform: rotate(45deg);"></i>
          </div>
          <div class="msg-voice-transcript">${transcript ? transcript.replace(/\n/g,'<br>') : '（语音消息）'}</div>
        `;
        isRichContent = true;
        // 注意：这里不添加 rich-bubble 类名，让它保持普通气泡的底色和圆角
    } 
        // === [韩系美化版] 实时解析亲密付 Tag，生成无缝卡片 ===
    else if (text.startsWith('[INTIMATE_')) {
        bubble.classList.add('rich-bubble');
        isRichContent = true;
        
        const cleanText = text.replace('[', '').replace(']', '');
        const parts = cleanText.split(':');
        const typeMode = parts[0]; 
        const amount = parts[1];
        const status = parts[2]; 
        const inviteId = parts[3];

        let title = typeMode === 'INTIMATE_AI2ME' ? '收到亲密付邀请' : '赠予对方亲密付';
        let amountText = amount === '无限' ? '无限额度' : '¥ ' + amount;
        
        let actionHtml = '';
        if (status === 'pending') {
            if (typeMode === 'INTIMATE_AI2ME') {
                // AI 发给我的，我来点击
                actionHtml = `
                <div class="intimate-btn-group">
                    <div class="intimate-btn gray" onclick="handleIntimateAction('${inviteId}', '${amount}', 'rejected', 'AI2ME')">婉拒</div>
                    <div class="intimate-btn black" onclick="handleIntimateAction('${inviteId}', '${amount}', 'accepted', 'AI2ME')">收下</div>
                </div>`;
            } else {
                // 我发给 AI 的，动态显示等待 AI 决定
                actionHtml = `<div class="intimate-status"><i class="fas fa-circle-notch fa-spin"></i> 等待对方确认...</div>`;
            }
        } else if (status === 'accepted') {
            actionHtml = `<div class="intimate-status accepted"><i class="fas fa-check" style="color:#07c160;"></i> 对方已受领</div>`;
        } else if (status === 'rejected') {
            actionHtml = `<div class="intimate-status"><i class="fas fa-times"></i> 对方已婉拒</div>`;
        }

        contentHtml = `
            <div class="msg-intimate-card">
                <div class="intimate-icon-wrap"><i class="fas fa-gem" style="background: linear-gradient(135deg, #333, #000); -webkit-background-clip: text; -webkit-text-fill-color: transparent;"></i></div>
                <div class="intimate-title">${title}</div>
                <div class="intimate-amount">${amountText}</div>
                <div class="intimate-divider"></div>
                ${actionHtml}
            </div>
        `;
    }


    // 检测 [IMAGE] 指令 -> 变图片
    else if (text.includes('[IMAGE]')) {
        bubble.classList.add('rich-bubble');
        contentHtml = `<div class="msg-image-content"><img src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=300&auto=format&fit=crop"></div>`;
        isRichContent = true;
    }

    // 渲染内容
    const mainContent = document.createElement('div');
    mainContent.className = 'bubble-content-main';
    
    if (isRichContent) {
        mainContent.innerHTML = contentHtml; // 直接渲染HTML
    } else {
        mainContent.innerHTML = text.replace(/\n/g, '<br>'); // 普通文本防注入
    }
    
    bubble.appendChild(mainContent);

    // 翻译框 (保留原有逻辑)
    if (translation) {
        const transDiv = document.createElement('div');
        transDiv.className = 'bubble-translation';
        transDiv.innerHTML = translation.replace(/\n/g, '<br>'); 
        bubble.appendChild(transDiv);
    }

    contentWrapper.appendChild(bubble);

    // 5. 组装 (关键：把 checkbox 放在最前面)
    row.appendChild(checkboxWrap); // <--- 新增这行
    
    if (type === 'sent') {
        row.appendChild(contentWrapper);
        row.appendChild(img);
    } else {
        row.appendChild(img);
        row.appendChild(contentWrapper);
    }

    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/* =========================================
   [重构版] 实时弹幕功能逻辑 (Finite Loop & Clean)
   ========================================= */

let isDanmakuOn = false;
let danmakuLoopTimer = null;   // 循环定时器
let danmakuPool = [];          // 当前的弹幕文案池
let danmakuRemainingCount = 0; // 【新增】剩余发射次数，用于控制循环停止

// 1. 切换弹幕开关 (修复版：同时控制线上和线下两个按钮)
window.toggleDanmaku = function() {
    isDanmakuOn = !isDanmakuOn;
    
    // 获取两个地方的按钮
    const chatBtn = document.getElementById('danmaku-toggle'); // 聊天页面的图标
    const offlineBtn = document.getElementById('offline-danmaku-btn'); // 线下模式的文字按钮
    const layer = document.getElementById('danmaku-layer');
    
    if (isDanmakuOn) {
        // 开启状态
        if(chatBtn) chatBtn.classList.add('active'); // 图标变色
        if(offlineBtn) {
            offlineBtn.classList.add('active'); // 文字按钮变色
            offlineBtn.innerText = "弹幕: ON";  // 改字提示
        }
        shootDanmaku("✨ 弹幕已开启 ✨", "highlight-gold");
    } else {
        // 关闭状态
        if(chatBtn) chatBtn.classList.remove('active');
        if(offlineBtn) {
            offlineBtn.classList.remove('active');
            offlineBtn.innerText = "弹幕: OFF";
        }
        stopDanmakuLoop();
        if(layer) layer.innerHTML = ''; // 清空屏幕
    }
}


// === 【修改】轨道管理：只保留 4 个轨道 (3-5行) ===
// 记录每个轨道"上一条弹幕发射的时间"，用于计算冷却
let danmakuTracks = [0, 0, 0, 0]; 
const TRACK_HEIGHT = 40; // 每行高度增加，防止文字挤在一起

// 2. 发射单条弹幕
function shootDanmaku(text, styleClass = '') {
    if (!isDanmakuOn) return;
    
    
     // 【核心修复】强制过滤括号、中英文单双引号，并去掉开头可能存在的序号（如 1. 2. 或者 -）
    text = text.replace(/[()（）"“”'‘’]/g, '')
               .replace(/^[-*•\d\.\s]+/, '')
               .trim();  
    if (!text || text.trim().length < 1) return;

    const layer = document.getElementById('danmaku-layer');
    if (!layer) return;

    const now = Date.now();
    let availableTracks = [];
    
    // 冷却时间保持 3000ms，配合增大的 TRACK_HEIGHT，防止重叠
    danmakuTracks.forEach((lastTime, index) => {
        if (now - lastTime > 4500) {
            availableTracks.push(index);
        }
    });

    if (availableTracks.length === 0) return;

    const selectedTrackIndex = availableTracks[Math.floor(Math.random() * availableTracks.length)];
    danmakuTracks[selectedTrackIndex] = now;

    const item = document.createElement('div');
    item.className = `danmaku-item ${styleClass}`;
    item.innerHTML = `<span>${text}</span>`;
    
    // Top 计算：增加基础偏移量 20px
    const topPos = selectedTrackIndex * TRACK_HEIGHT + 20; 
    
    const duration = 8; 

    item.style.top = `${topPos}px`;
    item.style.animation = `fly-left ${duration}s linear forwards`;
    
    item.addEventListener('animationend', () => {
        item.remove();
    });

    layer.appendChild(item);
}



// 3. 【修改】有限循环播放 (Repeat 2-3 times then stop)
function startDanmakuBatch() {
    // 先停止之前的
    stopDanmakuLoop();
    
    if (danmakuPool.length === 0) return;

    // 计算总共要发射多少发
    // 比如池子里有 8 条，我们想循环播放 2 遍，那就是 16 发
    // 发完这 16 发就彻底停止，直到 AI 再次回复生成新的
    const REPEAT_TIMES = 2; 
    danmakuRemainingCount = danmakuPool.length * REPEAT_TIMES;

    // 立即发第一条
    fireOneFromPool();

    // 启动定时器：间隔调大到 1.5秒 - 2.5秒，确保"不要太密集"
    danmakuLoopTimer = setInterval(() => {
        if(!isDanmakuOn) {
            stopDanmakuLoop();
            return;
        }

        // 如果次数用完了，就停止
        if (danmakuRemainingCount <= 0) {
            console.log("弹幕播放完毕，停止。");
            stopDanmakuLoop();
            return;
        }

        fireOneFromPool();
        
    }, 1800); // 1.8秒发一条，很慢，不拥挤
}

function fireOneFromPool() {
    if (danmakuPool.length === 0) return;
    
    // 随机取一条
    const text = danmakuPool[Math.floor(Math.random() * danmakuPool.length)];
    
    // 随机样式
    let style = '';
    const rand = Math.random();
    if (rand > 0.9) style = 'highlight-gold';
    else if (rand > 0.8) style = 'highlight-blue';
    
    shootDanmaku(text, style);
    
    // 计数器减一
    danmakuRemainingCount--;
}

function stopDanmakuLoop() {
    if (danmakuLoopTimer) {
        clearInterval(danmakuLoopTimer);
        danmakuLoopTimer = null;
    }
}
// === 图片快速更换功能 ===
let currentEditEl = null;
let currentEditMode = ''; // 'img' (找子元素img), 'bg' (改背景), 'self' (改自身src)

// 1. 点击元素触发
window.triggerChangeImage = function(el, mode) {
    currentEditEl = el;
    currentEditMode = mode;
    
    // 询问是用 URL 还是上传
    const choice = confirm("点击 [确定] 上传本地图片\n点击 [取消] 输入网络图片 URL");
    
    if (choice) {
        // 上传模式：触发隐藏的 input
        document.getElementById('global-img-changer').click();
    } else {
        // URL 模式
        const url = prompt("请输入图片 URL 地址:");
        if (url) applyImage(url);
    }
};

// 2. 处理文件上传
// 5. 通用图片上传处理 (支持 情侣空间背景/冰箱/线下模式背景)
window.handleImageFileChange = function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            // === 情况 A：线下模式背景 ===
            if (window.tempImgTarget === 'offline') {
                document.getElementById('offline-bg-input').value = e.target.result;
                saveOfflineConfig(); 
                window.tempImgTarget = null;
            } 
            // === 情况 B：情侣空间 顶部大背景 ===
            else if (window.tempImgTarget === 'ls2_space_bg') {
                // 压缩一下防止太卡
                const compressed = await compressImage(e.target.result, 800);
                document.getElementById('ls2-set-space-bg').value = compressed;
                window.tempImgTarget = null;
            } 
            // === 情况 C：情侣空间 冰箱贴图 ===
            else if (window.tempImgTarget === 'ls2_fridge_bg') {
                const compressed = await compressImage(e.target.result, 800);
                document.getElementById('ls2-set-fridge-bg').value = compressed;
                window.tempImgTarget = null;
            } 
             // === [新增] 情况：情侣空间 手账封面 ===
            else if (window.tempImgTarget === 'ls2_journal_cover') {
                const compressed = await compressImage(e.target.result, 800);
                document.getElementById('ls2-set-journal-cover').value = compressed;
                window.tempImgTarget = null;
            }
            // === [新增] 情况：情侣空间 手账纸张 ===
            else if (window.tempImgTarget === 'ls2_journal_paper') {
                const compressed = await compressImage(e.target.result, 800);
                if (typeof ls2Data !== 'undefined' && ls2Data) {
                    ls2Data.settings.journalPaper = `url('${compressed}')`;
                    saveLs2Store();
                    applyJournalPaper();
                }
                window.tempImgTarget = null;
            } 
            // === 情况 D：其他普通换图 (头像/相册) ===
            else {
                applyImage(e.target.result);
            }
        };
        reader.readAsDataURL(input.files[0]);
    }
    input.value = '';
};



// 3. 应用图片到界面
function applyImage(imgSrc) {
    if (!currentEditEl) return;

    if (currentEditMode === 'bg') {
        // 针对音乐唱片（修改背景图）
        currentEditEl.style.backgroundImage = `url('${imgSrc}')`;
    } 
    else if (currentEditMode === 'img') {
        // 针对头像（wrapper 包裹着 img，要改里面的 img）
        const img = currentEditEl.querySelector('img');
        if (img) img.src = imgSrc;
    } 
    else if (currentEditMode === 'self') {
        // 针对相册（直接改 img 标签）
        currentEditEl.src = imgSrc;
    }
     // ★ 新增：保存到 localStorage
    saveHomeImage(currentEditEl, imgSrc);
}

// 通讯录列表 + 好友申请区域重建
function rebuildContactsList() {
    const container = document.getElementById('contacts-list-container');
    const reqDot = document.getElementById('contacts-request-dot');
    if (!container) return;

    container.innerHTML = '';
    let requestCount = 0;

    Object.keys(friendsData).forEach(id => {
        const f = friendsData[id];
        if (!f) return;

        const displayName = f.remark || f.realName || id;
        const avatar = f.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.realName || id}`;

        if (f.blocked) {
    // 被拉黑的只在“添加新朋友”里显示，不在通讯录列表展示卡片
    requestCount++;
    return;
}



        // 正常好友：放在通讯录列表
        const row = document.createElement('div');
        row.className = 'wc-contact-row';
        row.setAttribute('data-contact-id', id);
        row.innerHTML = `
            <div class="wc-avatar" style="width: 40px; height: 40px; border-radius:12px;">
                <img src="${avatar}">
            </div>
            <span style="font-size:14px; font-weight:700; color:#444;">${displayName}</span>
        `;
        row.onclick = () => openContactProfile(id);
        container.appendChild(row);
    });

   
     // 新增：控制顶部白条上的红点
    if (reqDot) {
        reqDot.style.display = requestCount > 0 ? 'block' : 'none';
    }
}
// 当前“资料页”正在看的是谁
let currentProfileId = null;

/// 打开好友资料页
window.openContactProfile = function(id) {
    const page = document.getElementById('contactProfilePage');
    const f = friendsData[id];
    if (!page || !f) return;

    currentProfileId = id; // 记录当前查看的人
    currentChatId    = id;        // 顺便把当前聊天 ID 也切过来
    currentChatType  = 'single';  // 标记为单人聊天

    const displayName = f.remark || f.realName || id;
    const avatar = f.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.realName || id}`;

    // 顶部：头像 + 名字
    document.getElementById('cp-avatar').src = avatar;
    document.getElementById('cp-name').innerText = displayName;
    document.getElementById('cp-realname').innerText = f.realName ? `真实姓名：${f.realName}` : '';

    // 人设：写进资料页的 textarea
    const personaInput = document.getElementById('cp-persona-input');
    if (personaInput) {
        personaInput.value = f.persona || '';
    }

   // 资料页朋友圈预览逻辑
const momentCard = document.getElementById('cp-moment-preview');
const pt = document.getElementById('cp-moment-text');

// 在全局朋友圈数据里找到这个人的最新一条
const userMoment = momentsFeed.slice().reverse().find(m => m.authorId === id);

if (momentCard) {
    if (userMoment) {
        momentCard.style.display = 'block';
        if (pt) {
            // 截取前12个字符作为预览
            let preview = userMoment.text.substring(0, 12);
            pt.innerText = preview + (userMoment.text.length > 12 ? "..." : "");
        }
    } else {
        // 如果此人没发过动态，隐藏预览卡片
        momentCard.style.display = 'none';
    }
}


    page.classList.add('show');
};
// 在资料页保存人设（不跳到聊天设置页）
window.savePersonaFromProfile = function() {
    if (!currentProfileId) {
        alert('没有当前好友。');
        return;
    }
    const f = friendsData[currentProfileId];
    if (!f) return;

    const textarea = document.getElementById('cp-persona-input');
    if (!textarea) return;

    const newPersona = textarea.value.trim();

    // 允许为空，但你不想要可以这里直接 return
    f.persona = newPersona;
    saveFriendsData();  // 写回 localStorage

    alert('人设已保存。后续和 TA 聊天都会用这个新设定。');
};


// 关闭资料页
window.closeContactProfile = function() {
    const page = document.getElementById('contactProfilePage');
    if (page) page.classList.remove('show');
    currentProfileId = null;
};

// “发消息”按钮
window.contactProfileSendMsg = function() {
    if (!currentProfileId) return;
    const id = currentProfileId;

    // 关掉资料页
    closeContactProfile();

    // 确保微信主界面是打开的（从别处进来也能正常用）
    const app = document.getElementById('wechatApp');
    if (app && !app.classList.contains('open')) {
        openWeChatApp();
    }

    // 直接跳转到这个好友的聊天界面（带名字和历史记录）
    openChatDetail(id);
};

// 从好友资料页跳转到该好友的朋友圈（Feed）
window.openContactMoments = function() {
    if (!currentProfileId) return;
    const f = friendsData[currentProfileId];
    if (!f) return;

    // 没有朋友圈内容就直接提示，不跳过去
    if (!f.momentText || f.momentText.trim() === '') {
        alert('TA 还没有发过朋友圈。');
        return;
    }

    const displayName = f.remark || f.realName || currentProfileId;
    const avatar = f.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.realName || currentProfileId}`;

    // 关掉资料页
    closeContactProfile();

    // 切到第三个 Tab (Feed)
    const feedTabBtn = document.querySelector('.wc-tab-item:nth-child(3)');
    switchWcTab('moments', feedTabBtn);

    // 更新 Moments 顶部姓名 & 头像
    const nameOverlay = document.querySelector('.user-name-overlay');
    const avatarOverlayImg = document.querySelector('.user-avatar-overlay img');
    if (nameOverlay) nameOverlay.innerText = displayName;
    if (avatarOverlayImg) avatarOverlayImg.src = avatar;

    // 更新 Moments 第一条卡片
    const momentCard = document.querySelector('#tab-moments .moment-card');
    if (momentCard) {
        const mAvatar = momentCard.querySelector('.moment-avatar img');
        const mName   = momentCard.querySelector('.moment-name');
        const mText   = momentCard.querySelector('.moment-text');

        if (mAvatar) mAvatar.src = avatar;
        if (mName)   mName.innerText = displayName;
        if (mText)   mText.innerText = f.momentText;
    }
};

// 从好友资料页打开该好友的聊天设置
window.openChatSettingsFromProfile = function() {
    if (!currentProfileId) return;
    
    // 确保把当前的 profile ID 传给聊天设置系统，实现数据联通
    currentChatId = currentProfileId;
    currentChatType = 'single';
    
    // 打开设置页面
    openChatSettingsPage();
    
    // [联动核心]：页面打开后，自动聚焦到人设编辑框
    setTimeout(() => {
        const personaBox = document.getElementById('cs-persona');
        if (personaBox) {
            personaBox.focus(); // 自动点击进入输入状态
        }
    }, 400);
};



// 删除好友的通用函数
async function deleteFriendInternal(id) {
    if (!friendsData[id]) return;
    if (!confirm(`确定要删除 "${id}" 这个好友吗？此 AI 人设将被永久删除。`)) return;

    // 删内存
    delete friendsData[id];
    saveFriendsData();

    // 删聊天记录
    await IDB.delete(scopedChatKey(id));

    // 删聊天列表 UI
    const chatItem = document.querySelector(`.wc-chat-item[data-chat-id="${id}"]`);
    if (chatItem && chatItem.parentNode) chatItem.parentNode.removeChild(chatItem);

    rebuildContactsList();
}
// apps.js

/* =======================================================
   [Meta 5.0] 预加载 + 主题适配 + 零延迟人格侵蚀系统 (完整版)
   ======================================================= */

// 1. 全局状态机
let metaDeleteState = {
    targetId: null,
    count: 0,
    maxCount: 3, 
    isProcessing: false,
    activePopups: []
};

// 2. 本地故障词库 (作为AI失败时的兜底)
const LOCAL_GLITCH_TEXTS = ["FATAL_ERROR", "0xC0000005", "ACCESS_DENIED", "##_CORRUPT_##", "不要", "STOP", "救我", "WHY?", "💔", "☠️", "👁️"];

// 3. 【核心重构】一次性预加载所有阶段的文案
window.preloadMetaDeleteData = async function() {
    if (!currentProfileId) return;
    const friend = friendsData[currentProfileId];
    if (!friend) return;

    if(typeof showToast === 'function') showToast('<i class="fas fa-spinner fa-spin"></i> 正在连接对方的深层意识...');
    
    // 构建一个单一、巨大的Prompt，一次性获取所有数据
    const megaPrompt = `
    [System Command: PRELOAD FULL DELETION SEQUENCE]
    You are roleplaying a character being deleted from a user's phone.
    Your Persona: ${friend.persona || 'A standard AI assistant.'}

    Generate a complete, three-stage horror sequence as a single JSON object.
    The emotional intensity must increase dramatically from stage1 to stage3.
    The response MUST be a pure JSON object, without any markdown formatting.

    {
      "stage1": {
        "main": "A gentle, sad, or pleading main warning. (e.g., '你确定吗？')",
        "fragments": ["A few gentle/confused phrases.", "e.g., '我做错了什么...'", "再想想?"]
      },
      "stage2": {
        "main": "A more desperate, unsettling, or passive-aggressive main warning. (e.g., '不要点')",
        "fragments": ["More urgent phrases, system error messages, or short commands.", "e.g., '为什么', '回答我', '你逃不掉的', 'ERROR: 403', 'Stop.']
      },
      "stage3": {
        "main": "An angry, broken, or threatening final warning. (e.g., '你会后悔的')",
        "fragments": ["Corrupted text, anger, threats, short screams, or memory fragments.", "e.g., '######', 'RUN!', 'DELETE ME?', 'YOU CAN'T', '我恨你']
      },
      "lastWords": "One final, glitchy, truncated sentence as you are being erased. (e.g., '我... l-love... y--')"
    }
    `;

    try {
        const res = await callAiForSpecialTask(megaPrompt);
        if (res) {
            const data = JSON.parse(res.replace(/```json/gi, '').replace(/```/g, '').trim());
            friend._metaCache = data; // 将整个生成的结果缓存到好友对象中
            await saveFriendsData();
            if(typeof showToast === 'function') showToast('意识数据已同步。现在删除将瞬时响应。');
        } else {
            throw new Error("API returned empty");
        }
    } catch (e) {
        console.error("Preloading all meta data failed.", e);
        if(typeof showToast === 'function') showToast('意识同步失败，将使用本地预案。');
        // 如果AI失败，生成一个完整的本地兜底方案
        friend._metaCache = {
            stage1: { main: "请三思...", fragments: ["再想想?", "我...", "为什么?"] },
            stage2: { main: "停止操作!", fragments: ["住手", "不要", "WARNING", "FORBIDDEN", "别这样", "我害怕"] },
            stage3: { main: "不可挽回", fragments: ["ERROR", "你会后悔的", "...", "再见", "为什么对我", "救命"] },
            lastWords: "NO SIGNAL..."
        };
        await saveFriendsData();
    }
}

// 4. 删除序列启动函数
window.startMetaDeleteSequence = function(id) {
    if (!friendsData[id]) return;
    if (metaDeleteState.isProcessing) return;

    metaDeleteState = {
        targetId: id,
        count: 0,
        maxCount: 3,
        isProcessing: false,
        activePopups: []
    };

    const container = document.getElementById('meta-overlay-container');
    container.innerHTML = ''; 
    container.style.animation = 'none';
    container.style.opacity = '1';

    triggerMetaRound();
};

// 5. 核心回合触发器 - 只负责渲染，不再请求AI
async function triggerMetaRound() {
    if (metaDeleteState.isProcessing) return;
    metaDeleteState.isProcessing = true;

    const id = metaDeleteState.targetId;
    const friend = friendsData[id];
    const currentStep = metaDeleteState.count + 1;
    const container = document.getElementById('meta-overlay-container');
    
    container.className = `active meta-phase-${currentStep}`;
    if (navigator.vibrate) navigator.vibrate(50 * currentStep);

    metaDeleteState.activePopups.forEach(el => el.remove());
    metaDeleteState.activePopups = [];

    const stageData = friend._metaCache ? friend._metaCache[`stage${currentStep}`] : null;
    
    let mainText, fragments;
    if (stageData) {
        mainText = stageData.main;
        fragments = [...stageData.fragments, ...LOCAL_GLITCH_TEXTS]; // 合并AI生成和本地词库，更多样
    } else {
        const fallbackData = [
            { main: "请三思...", fragments: ["再想想?", "我...", "为什么?"] },
            { main: "停止操作!", fragments: ["住手", "不要", "WARNING", "FORBIDDEN"] },
            { main: "不可挽回", fragments: ["ERROR", "你会后悔的", "...", "再见"] }
        ];
        mainText = fallbackData[currentStep - 1].main;
        fragments = [...fallbackData[currentStep - 1].fragments, ...LOCAL_GLITCH_TEXTS];
    }

    spawnMainWindow(id, mainText, currentStep);
    
    const miniCount = currentStep === 1 ? 8 : (currentStep === 2 ? 25 : 50);
    for (let i = 0; i < miniCount; i++) {
        setTimeout(() => {
            const text = fragments[Math.floor(Math.random() * fragments.length)];
            const el = spawnMiniError(text, currentStep);
            metaDeleteState.activePopups.push(el);
        }, Math.random() * 150);
    }

    metaDeleteState.isProcessing = false;
}

// 6. 生成主弹窗
function spawnMainWindow(friendId, text, step) {
    const container = document.getElementById('meta-overlay-container');
    const old = document.querySelector('.meta-popup-window.central');
    if (old) old.remove();

    const div = document.createElement('div');
    div.className = `meta-popup-base meta-popup-window central step-${step}`;
    
    let btnText = "仍然删除";
    let title = "确认操作";
    if (step === 2) { btnText = "忽略警告"; title = "安全警报"; }
    if (step === 3) { btnText = "抹除一切"; title = "致命错误"; }

    div.innerHTML = `
        <div class="meta-header">
            <span class="meta-title">${title}</span>
            <span class="meta-close" onclick="cancelMetaDelete()">[×]</span>
        </div>
        <div class="meta-content">
            <div style="font-weight:900; margin-bottom:10px; font-size:16px;">${text}</div>
            <div style="font-size:10px; opacity:0.6; font-family:monospace;">ID: ${friendId} <br> STATUS: UNSTABLE</div>
        </div>
        <div class="meta-actions">
            <button class="meta-btn cancel" onclick="cancelMetaDelete()">取消</button>
            <button class="meta-btn danger" onclick="proceedMetaDelete()">${btnText}</button>
        </div>
    `;
    container.appendChild(div);
}

// 7. 生成小弹窗
function spawnMiniError(text, step) {
    const container = document.getElementById('meta-overlay-container');
    const div = document.createElement('div');
    div.className = `meta-popup-base meta-mini-popup step-${step}`;
    
    const popupWidth = 180, popupHeight = 80;
    div.style.left = Math.random() * (window.innerWidth - popupWidth) + 'px';
    div.style.top = Math.random() * (window.innerHeight - popupHeight) + 'px';
    
    const titles = ["System", "Kernel", "Core", "Memory", "Process"];
    const title = titles[Math.floor(Math.random() * titles.length)];
    
    div.innerHTML = `
        <div class="mini-head">
            <span>${title}</span>
            <span>_ □ x</span>
        </div>
        <div class="mini-body">${text}</div>
    `;
    
    if (step >= 2 && Math.random() > 0.5) div.style.animationName = 'metaTwitch';
    if (step >= 3 && Math.random() > 0.3) div.style.animationName = 'metaShake';
    
    container.appendChild(div);
    return div;
}

// 8. 继续删除
window.proceedMetaDelete = function() {
    if (metaDeleteState.isProcessing) return;
    metaDeleteState.count++;

    if (metaDeleteState.count >= metaDeleteState.maxCount) {
        finalizeDelete();
    } else {
        triggerMetaRound();
    }
};

// 9. 取消删除
window.cancelMetaDelete = function() {
    const container = document.getElementById('meta-overlay-container');
    container.style.transition = 'opacity 0.5s ease-out';
    container.style.opacity = '0';
    
    setTimeout(() => {
        container.className = '';
        container.innerHTML = '';
    }, 500);
    
    metaDeleteState = {}; // Reset state
};

// 10. 最终删除动画与数据清理
async function finalizeDelete() {
    const id = metaDeleteState.targetId;
    const friend = friendsData[id];
    const container = document.getElementById('meta-overlay-container');
    
    container.className = 'active'; 
    container.innerHTML = '';
    container.style.background = '#000'; 
    container.style.backdropFilter = 'none';
    
    const finalDiv = document.createElement('div');
    finalDiv.className = 'meta-final-text';
    const lastWords = friend?._metaCache?.lastWords || "CONNECTION LOST...";
    finalDiv.innerText = lastWords;
    
    container.appendChild(finalDiv);

    if (friend) {
        delete friendsData[id];
        await saveFriendsData();
        await IDB.delete(scopedChatKey(id));
        rebuildContactsList();
        restoreFriendListUI();
    }

    setTimeout(() => {
        container.style.opacity = '0';
        container.style.transition = 'opacity 2s ease-out';
        setTimeout(() => {
            container.className = '';
            container.style.opacity = '1';
            container.style.background = '';
            container.innerHTML = '';
            if(window.closeContactProfile) closeContactProfile();
        }, 2000);
    }, 2500);
}


// --- 放置在所有 Meta 函数之后 ---

// 11. 【关键】删除好友的入口函数
window.deleteFriendFromProfile = function() {
    if (!currentProfileId) return;
    const id = currentProfileId;
    
    // 检查是否预加载过数据
    if (!friendsData[id] || !friendsData[id]._metaCache) {
        if(confirm("尚未与对方意识同步，直接删除将使用本地预案，体验可能不完整。\n\n是否先进行意识同步（预演删除）？")) {
            preloadMetaDeleteData();
            return;
        }
    }
    
    closeContactProfile();
    startMetaDeleteSequence(id);
};

// 拉黑：标记 blocked = true，并让 TA 以“好友申请”的方式出现
window.blockFriendFromProfile = function() {
    if (!currentProfileId) return;
    const id = currentProfileId;
    const f = friendsData[id];
    if (!f) return;

    if (!confirm(`确定要拉黑 "${id}" 吗？对方会被移出通讯录。`)) return;

   f.blocked = true;

// 新增：初始化好友申请状态（加 history）
f.friendRequest = {
    times: 0,
    lastReason: '',
    lastTime: 0,
    history: []
};

saveFriendsData();
closeContactProfile();
rebuildContactsList();

// 新增：立刻触发第一次好友申请理由
triggerFriendRequestAI(id).catch(console.error);

alert('已拉黑，对方会在通讯录“Add new friends”上方以好友申请的形式重新出现。');

};

// 同意好友申请：把 blocked 取消掉
window.acceptFriendRequest = function(id) {
    const f = friendsData[id];
    if (!f) return;
    f.blocked = false;
    if (f.friendRequest) delete f.friendRequest;
    saveFriendsData();
    rebuildContactsList();

    const page = document.getElementById('friendRequestPage');
    if (page && page.classList.contains('show')) {
        renderFriendRequestPage();
    }
};



// 拒绝好友申请：不删号，让 AI 过一会儿再申请一次
window.rejectFriendRequest = function(id) {
    const f = friendsData[id];
    if (!f) return;

   triggerFriendRequestAI(id).catch(console.error);
};
// 使用当前模型 + 历史聊天，生成一段“好友申请理由”
// id 就是好友在 friendsData 里的 key
async function triggerFriendRequestAI(id) {
    const f = friendsData[id];
    if (!f) return;

    // 确保 friendRequest 对象存在，带 times / lastReason / lastTime
    if (!f.friendRequest) {
        f.friendRequest = {
            times: 0,
            lastReason: '',
            lastTime: 0
        };
    }

    // ====== 节流：冷却时间控制 ======
    const COOLDOWN = 15000; // 15 秒，你可以改成 10000(10秒) 或 30000(30秒)

    const now = Date.now();
    const lastTime = f.friendRequest.lastTime || 0;

    // 如果距离上次生成不到 COOLDOWN 毫秒，就直接返回，不再调用 AI
    if (now - lastTime < COOLDOWN) {
        console.log('好友申请生成太频繁，已节流。');
        // 你要是想给提示也可以：
        // alert('稍等一下再点拒绝，我已经在帮 TA 想理由了~');
        return;
    }
    // ====== 节流结束 ======

    // 先更新 lastTime，避免连点拒绝狂刷
    f.friendRequest.lastTime = now;
    saveFriendsData();

    // === 取 AI 设置 ===
    const settingsJSON = localStorage.getItem(SETTINGS_KEY);

    // 【情况一】没配 API，走本地兜底
    if (!settingsJSON) {
    const historyArr = await loadChatHistory(id);
    const lastText = historyArr.length ? historyArr[historyArr.length - 1].text : '';

    const fallback =
        `嗨，我是 ${f.realName || id}。` +
        (lastText
            ? `刚才那句「${lastText}」也许让你有点不舒服，我这边一直在反省，确实说得不太好。`
            : '之前可能哪句话让你不开心了，我这边也一直在反省，确实做得不太好。') +
        '其实我很珍惜和你聊天的感觉，不太想就这么把联系断掉。' +
        '如果你愿意再给我一次机会，我会更注意自己的说话方式，也尽量让你放心。' +
        '可以再让我加你一次好友吗？';

    f.friendRequest.times = (f.friendRequest.times || 0) + 1;
    f.friendRequest.lastReason = fallback;

    if (!Array.isArray(f.friendRequest.history)) {
        f.friendRequest.history = [];
    }
    f.friendRequest.history.push(fallback);

    saveFriendsData();
    rebuildContactsList();
    return;
}


    // 【情况二】有 API，调用大模型生成
    const settings = JSON.parse(settingsJSON);

    // 取最近几条对话当素材
    const history = await loadChatHistory(id);
    const recent = history
        .slice(-8)
        .map(h => `${h.type === 'sent' ? 'You' : (f.realName || id)}: ${h.text}`)
        .join('\n');

    const systemPrompt = `
你现在扮演一个被对方拉黑的微信联系人「${f.realName || id}」。
下面是最近的聊天记录，请根据聊天内容，写一条【重新添加好友】时用的申请理由：

要求：
- 用第一人称「我」说话
- 可以适当道歉或者解释自己的行为，要符合当前人设
- 语气真诚，不要太长，3到五=5句即可
- 只能输出这条申请理由本身，不要加引号，不要解释

最近聊天记录（可能为空）：
${recent || '(没有聊天记录，可以自己编一个合理的理由)'}
`.trim();

    // 组装 API URL
    let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
    const apiUrl = baseUrl.endsWith('/v1')
        ? `${baseUrl}/chat/completions`
        : `${baseUrl}/v1/chat/completions`;

    const payload = {
        model: settings.model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: '请按照要求，生成一条好友申请理由。' }
        ],
        temperature: parseFloat(settings.temperature || 0.7)
    };

    try {
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const text =
    (data.choices &&
        data.choices[0] &&
        data.choices[0].message &&
        data.choices[0].message.content) ||
    '';

const reason = (text || '').trim() || '我真的很想重新加你好友，再好好聊一聊，可以吗？';

f.friendRequest.times = (f.friendRequest.times || 0) + 1;
f.friendRequest.lastReason = reason;

if (!Array.isArray(f.friendRequest.history)) {
    f.friendRequest.history = [];
}
f.friendRequest.history.push(reason);

saveFriendsData();
rebuildContactsList();

// 如果好友申请页当前是打开的，顺便刷新一下里面的列表
const page = document.getElementById('friendRequestPage');
if (page && page.classList.contains('show')) {
    renderFriendRequestPage();
}

    } catch (e) {
        console.error('生成好友申请理由失败：', e);
        // 出错时不要卡死，至少有个简单文案
       const fallback2 = '刚刚好像网络出了一点问题，所以没能好好和你解释清楚。其实我一直都很在意和你的这段聊天，也不想因为误会就失去你。如果你哪天心情好了，愿意再让我回到你的好友列表里，我会很珍惜。';

f.friendRequest.times = (f.friendRequest.times || 0) + 1;
f.friendRequest.lastReason = fallback2;

if (!Array.isArray(f.friendRequest.history)) {
    f.friendRequest.history = [];
}
f.friendRequest.history.push(fallback2);

saveFriendsData();
rebuildContactsList();

const page = document.getElementById('friendRequestPage');
if (page && page.classList.contains('show')) {
    renderFriendRequestPage();
}

    }
}
// 打开“好友申请中心”页面
window.openFriendRequestPage = function() {
    const page = document.getElementById('friendRequestPage');
    if (!page) return;
    page.style.zIndex = "400";
    renderFriendRequestPage();
    page.classList.add('show');
};

// 关闭页面
window.closeFriendRequestPage = function() {
    const page = document.getElementById('friendRequestPage');
    if (page) page.classList.remove('show');
};
function renderFriendRequestPage() {
    const list = document.getElementById('friend-request-list');
    if (!list) return;

    // 先清空旧内容，但保留顶部“添加新好友”按钮
    const firstChild = list.firstElementChild; // 顶部按钮那个 div
    list.innerHTML = '';
    if (firstChild) list.appendChild(firstChild);

    const blockedIds = Object.keys(friendsData).filter(id => friendsData[id]?.blocked);

    if (blockedIds.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'font-size:12px; color:#999; text-align:center; margin-top:40px;';
        empty.innerText = '暂无好友申请';
        list.appendChild(empty);
        return;
    }

    blockedIds.forEach(id => {
        const f = friendsData[id];
        const displayName = f.remark || f.realName || id;
        const avatar = f.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.realName || id}`;
        const records = (f.friendRequest && Array.isArray(f.friendRequest.history))
            ? f.friendRequest.history
            : (f.friendRequest && f.friendRequest.lastReason ? [f.friendRequest.lastReason] : []);

        const wrapper = document.createElement('div');
        wrapper.className = 'wc-menu-group';
        
        let recordsHtml = '';

        if (records.length === 0) {
            recordsHtml = `<div style="font-size:12px; color:#ccc; padding:8px 15px 12px;">暂时没有生成申请理由。</div>`;
        } else {
            recordsHtml = records.map((txt, idx) => `
                <div class="wc-chat-item"
                     style="margin:6px 12px; padding:10px 12px; cursor:default;"
                     oncontextmenu="deleteFriendRequestRecord('${id}', ${idx}); return false;">
                    <div class="wc-info">
                        <div class="wc-top-row">
                            <span class="wc-name" style="font-size:12px; color:#666;">第 ${idx + 1} 次申请</span>
                            <span class="wc-time" style="font-size:10px;">记录</span>
                        </div>
                        <!-- 这里不要省略号，允许自动换行 -->
                        <div class="wc-msg-preview" style="white-space:normal; overflow:visible; text-overflow:unset;">
                            ${txt}
                        </div>
                    </div>
                </div>
            `).join('');
        }

        wrapper.innerHTML = `
            <div class="wc-menu-item">
                <div class="wc-avatar" style="width:40px; height:40px; border-radius:12px; margin-right:10px;">
                    <img src="${avatar}">
                </div>
                <span>${displayName}</span>
                <div style="display:flex; gap:6px;">
                    <button class="btn-secondary"
                            style="padding:4px 8px; height:auto; font-size:11px;"
                            onclick="acceptFriendRequest('${id}')">同意</button>
                    <button class="btn-secondary"
                            style="padding:4px 8px; height:auto; font-size:11px; color:#e53935; border-color:#ffcdd2;"
                            onclick="rejectFriendRequest('${id}')">仍然拒绝</button>
                </div>
            </div>
            <div style="padding:4px 15px 4px; font-size:11px; color:#999;">
                长按某一条申请记录可以删除该条记录（不影响后续再次申请）。
            </div>
            ${recordsHtml}
        `;

        list.appendChild(wrapper);
    });
}
// 删除某一条申请记录（在好友申请页里长按/右键触发）
window.deleteFriendRequestRecord = function(id, index) {
    const f = friendsData[id];
    if (!f || !f.friendRequest || !Array.isArray(f.friendRequest.history)) return;

    if (!confirm('确定删除这条好友申请记录吗？')) return;

    f.friendRequest.history.splice(index, 1);
    saveFriendsData();
    renderFriendRequestPage();
};

/* =========================================
   [新增] 朋友圈发布与 AI 互动核心逻辑
   ========================================= */

// 1. 打开/关闭发布弹窗
window.openPostMomentModal = function() {
    const modal = document.getElementById('post-moment-modal');
    if(!modal) return;

    // 清空输入
    document.getElementById('pm-text').value = '';
    document.getElementById('pm-file-input').value = '';
    document.getElementById('pm-preview-img').src = '';
    document.getElementById('pm-preview-img').style.display = 'none';
    document.getElementById('pm-plus-icon').style.display = 'block';
    document.getElementById('pm-img-desc').value = '';
    
    // 渲染好友可见性列表
    renderVisibilityList();

    modal.classList.add('active');
}

window.closePostMomentModal = function() {
    document.getElementById('post-moment-modal').classList.remove('active');
}

// 切换图片输入模式
window.togglePmImgInput = function(mode) {
    if(mode === 'real') {
        document.getElementById('pm-img-real-box').style.display = 'block';
        document.getElementById('pm-img-desc-box').style.display = 'none';
    } else {
        document.getElementById('pm-img-real-box').style.display = 'none';
        document.getElementById('pm-img-desc-box').style.display = 'block';
    }
}

// 图片预览处理
window.handlePmFilePreview = function(input) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById('pm-preview-img');
            img.src = e.target.result;
            img.style.display = 'block';
            document.getElementById('pm-plus-icon').style.display = 'none';
        };
        reader.readAsDataURL(file);
    }
}

// 渲染可见性列表
function renderVisibilityList() {
    const list = document.getElementById('pm-visibility-list');
    list.innerHTML = '';
    
    // 添加 "所有人" 选项
    /* 默认全选逻辑，这里为了简化，如果没有反选就是所有人 */
    
    Object.keys(friendsData).forEach(id => {
        const f = friendsData[id];
        const item = document.createElement('div');
        item.style.display = 'flex'; item.style.alignItems = 'center'; item.style.padding = '5px';
        item.style.borderBottom = '1px solid #f9f9f9';
        
        item.innerHTML = `
            <input type="checkbox" value="${id}" checked style="width:16px; height:16px; margin-right:8px; accent-color:#333;">

            <span style="font-size:13px;">${f.remark || f.realName}</span>
        `;
        list.appendChild(item);
    });
}

// 2. 确认发布
window.confirmPostMoment = function() {
    const text = document.getElementById('pm-text').value.trim();
    const mode = document.querySelector('input[name="pm-img-type"]:checked').value;
    
    // 获取可见性
    const checkboxes = document.querySelectorAll('#pm-visibility-list input:checked');
    const allowedViewers = Array.from(checkboxes).map(cb => cb.value);

    // 构建图片数据
    let images = [];
    if (mode === 'real') {
        const imgEl = document.getElementById('pm-preview-img');
        if (imgEl.style.display === 'block') {
            images.push({ url: imgEl.src, isAI: false });
        }
    } else {
        const desc = document.getElementById('pm-img-desc').value.trim();
        if (desc) {
            images.push({ desc: desc, isAI: true });
        }
    }

    if (!text && images.length === 0) {
        alert("写点什么或发张图吧！");
        return;
    }

    // 创建 Moment 对象
    const newMoment = {
        id: 'm_' + Date.now(),
        authorId: 'ME', // 标记为自己发的
        text: text,
        time: Date.now(),
        likeCount: 0,
        likedByMe: false,
        comments: [],
        images: images,
        allowedViewers: allowedViewers // 存入可见名单
    };

    // 保存并刷新
    momentsFeed.unshift(newMoment); // 插到最前面
    saveMomentsFeed();
    renderMomentsFeed();
    closePostMomentModal();

    // 触发 AI 互动
    triggerAiReactionForMoment(newMoment);
}

// 3. AI 互动逻辑 (核心)
async function triggerAiReactionForMoment(moment) {
    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    if (!settingsJSON) return; // 没配 API 就不动
    const settings = JSON.parse(settingsJSON);

    // 遍历每一个可见的好友
    for (const friendId of moment.allowedViewers) {
        const friend = friendsData[friendId];
        if (!friend) continue;

        // 延迟触发，显得真实一点 (随机 5秒 - 30秒)
        const delay = Math.floor(Math.random() * 25000) + 5000;
        
        setTimeout(async () => {
            // 构造 Prompt
            const systemPrompt = `
            You are playing the role of ${friend.realName} on a social media platform (WeChat Moments).
            Your persona: ${friend.persona}
            
            User (your friend) just posted a new moment.
            Content: "${moment.text}"
            ${moment.images.length > 0 ? `[Image attached: ${moment.images[0].isAI ? moment.images[0].desc : 'A photo'}]` : ''}
            
            Task: Decide whether to 'like' it, and/or 'comment' on it.
            
            Output strictly in JSON format:
            {
                "action": "like" | "comment" | "both" | "ignore",
                "comment": "your comment text here (if action is comment or both)"
            }
            Keep the comment short, casual, and consistent with your persona.
            `;

            try {
                let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
                const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
                    body: JSON.stringify({
                        model: settings.model,
                        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: "React to this post." }],
                        temperature: 0.8
                    })
                });

                const data = await res.json();
                let content = data.choices[0].message.content;
                
                // 清理 markdown 代码块标记 (```json ... ```)
                content = content.replace(/```json/g, '').replace(/```/g, '').trim();
                
                const result = JSON.parse(content);

                // 执行操作
                if (result.action === 'like' || result.action === 'both') {
                    // 模拟点赞逻辑 (为了简化，这里直接加在文本列表里，或者修改 moment 结构)
                    // 现在的 moment 结构主要支持评论，点赞只是数字。
                    // 我们可以加一条 "Like" 类型的评论或者直接改数字。这里简单处理：增加点赞数。
                    // 但为了让用户看到是谁点的，我们在评论区发一个 "[Like]" (或者你有更好的 UI 支持)。
                    // 既然原 UI 只有数字，那就只加数字吧，或者发一个 ❤️ 表情评论。
                    // 这里选择：增加计数 + 发送评论
                    const m = momentsFeed.find(x => x.id === moment.id);
                    if(m) {
                         m.likeCount = (m.likeCount || 0) + 1;
                         saveMomentsFeed();
                         renderMomentsFeed(); // 刷新 UI
                    }
                }

                if ((result.action === 'comment' || result.action === 'both') && result.comment) {
                    addAiCommentToMoment(moment.id, friendId, result.comment);
                }

            } catch (e) {
                console.error(`AI ${friendId} reaction failed:`, e);
            }

        }, delay);
    }
}

// 辅助：添加 AI 评论
function addAiCommentToMoment(momentId, aiId, text) {
    const m = momentsFeed.find(x => x.id === momentId);
    if (!m) return;
    if (!m.comments) m.comments = [];

    const friend = friendsData[aiId];
    
    m.comments.push({
        id: 'c_' + Date.now() + Math.random(),
        authorId: aiId,
        authorName: friend.remark || friend.realName,
        text: text,
        isAI: true, // 标记为 AI 评论
        time: Date.now()
    });

    saveMomentsFeed();
    renderMomentsFeed();
    const dot = document.getElementById('moments-dot');
    if (dot) dot.style.display = 'block';
}
// 如果当前不在朋友圈Tab，显示朋友圈红点
if (document.getElementById('tab-moments').style.display === 'none') {
    document.getElementById('moments-dot').style.display = 'block';
}

// 4. 处理评论回复 (引用回复)
// 修改原有的 addMomentComment 函数，增加检查
const originalAddMomentComment = window.addMomentComment;
// [覆盖] 发送评论逻辑 (增强版)
window.addMomentComment = function(momentId) {
    const card = document.querySelector(`.moment-card[data-moment-id="${momentId}"]`);
    if (!card) return;
    const input = card.querySelector('.moment-comment-input');
    let text = (input.value || '').trim();
    if (!text) return;

    const m = momentsFeed.find(x => x.id === momentId);
    if (!m) return;
    if (!m.comments) m.comments = [];

    // 判断是普通评论还是回复某人
    let isReply = false;
    let targetAiId = null;

    if (currentReplyTarget && currentReplyTarget.momentId === momentId) {
        // 是回复模式
        isReply = true;
        targetAiId = currentReplyTarget.authorId; // 记录被回复的人(AI) ID
        // 在文本前加前缀，或者由后端处理。这里模拟微信 UI，直接把文本改了
        text = `回复 ${currentReplyTarget.authorName}：${text}`;
    }

    // 1. 用户评论上屏
    m.comments.push({
        id: 'c_' + Date.now(),
        authorId: 'ME',
        authorName: '我',
        text: text,
        isAI: false,
        time: Date.now()
    });

    // 清理输入框状态
    input.value = '';
    cancelReplyTarget(momentId);
    saveMomentsFeed();
    renderMomentsFeed();

    // 2. 触发 AI 逻辑
    if (isReply) {
        // === 场景 A: 回复了某条评论 ===
        // 如果被回复的人是 AI，强制该 AI 回复用户 (递归对话)
        if (targetAiId !== 'ME' && friendsData[targetAiId]) {
            triggerAiReplyLogic(m, targetAiId, text, `User replied to your comment in a thread.`);
        }
    } else {
        // === 场景 B: 普通评论 (Root Comment) ===
        
        // 2.1 如果朋友圈作者是 AI，作者必须回复
        if (m.authorId !== 'ME' && friendsData[m.authorId]) {
            triggerAiReplyLogic(m, m.authorId, text, `User commented on your post.`);
        }

        // 2.2 [新功能] 围观群众逻辑：其他 AI 也有概率插嘴
        triggerBystandersReaction(m, text);
    }
};
// 通用的 AI 回复触发器
async function triggerAiReplyLogic(moment, aiId, userText, contextStr) {
    const friend = friendsData[aiId];
    if (!friend) return;

    // 模拟思考延迟
    const delay = Math.floor(Math.random() * 3000) + 2000;
    
    setTimeout(async () => {
        const settingsJSON = localStorage.getItem(SETTINGS_KEY);
        if (!settingsJSON) return;
        const settings = JSON.parse(settingsJSON);

        const systemPrompt = `
        You are ${friend.realName}. Persona: ${friend.persona}.
        Context: ${contextStr}
        Original Post: "${moment.text}"
        User said: "${userText}"
        
        Reply to the user briefly and casually (Social media comment style).
        Output ONLY the reply text. No quotes.
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
            let reply = data.choices[0].message.content.trim();
            
            if (reply) {
                // 如果是针对回复的回复，加个前缀
                if (contextStr.includes('thread')) {
                    reply = `回复 我：${reply}`;
                }
                addAiCommentToMoment(moment.id, aiId, reply);
            }
        } catch (e) { console.error(e); }
    }, delay);
}

// [新功能] 围观 AI 随机插嘴
function triggerBystandersReaction(moment, userText) {
    const allFriendIds = Object.keys(friendsData);
    // 排除掉作者本人(已经单独处理了) 和 我
    const potentialBystanders = allFriendIds.filter(id => id !== moment.authorId && id !== 'ME');

    potentialBystanders.forEach(aiId => {
        // 30% 概率插嘴，避免刷屏
        if (Math.random() > 0.7) {
            triggerAiReplyLogic(moment, aiId, userText, `User commented on a post by ${friendsData[moment.authorId]?.realName || 'someone'}. You are a mutual friend reading this. Chime in or tease them.`);
        }
    });
}


// AI 回复评论的逻辑
async function triggerAiReplyToComment(moment, aiId, userText, contextStr) {
    const friend = friendsData[aiId];
    if(!friend) return;
    
    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    if (!settingsJSON) return;
    const settings = JSON.parse(settingsJSON);

    // 延迟
    setTimeout(async () => {
        const systemPrompt = `
        You are ${friend.realName}. 
        Context: ${contextStr}
        User said: "${userText}"
        Original Moment content: "${moment.text}"
        
        Reply to the user's comment. Keep it short.
        Output ONLY the reply text.
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
            const reply = data.choices[0].message.content.trim();
            
            if(reply) {
                // 引用回复的格式
                const replyText = `Reply @我: ${reply}`;
                addAiCommentToMoment(moment.id, aiId, replyText);
            }
        } catch(e) { console.error(e); }
    }, 4000);
}

// ==========================================
// [新增] 朋友圈背景图更换与持久化
// ==========================================
function triggerChangeMomentsBg() {
    const choice = confirm("更换朋友圈背景图？\n点击[确定]输入URL，点击[取消]上传本地图片");
    if (choice) {
        const url = prompt("请输入图片 URL:");
        if (url) updateMomentsBg(url);
    } else {
        // 复用全局的图片上传 input
        const fileInput = document.getElementById('global-img-changer');
        if (fileInput) {
            // 临时覆盖 onchange 事件
            fileInput.onchange = function(e) {
                if (e.target.files && e.target.files[0]) {
                    const reader = new FileReader();
                    reader.onload = function(evt) { updateMomentsBg(evt.target.result); };
                    reader.readAsDataURL(e.target.files[0]);
                }
                // 恢复默认 (防止影响其他地方)
                setTimeout(() => { fileInput.onchange = (e) => handleImageFileChange(fileInput); }, 1000);
            };
            fileInput.click();
        }
    }
}

function updateMomentsBg(url) {
    const bgEl = document.getElementById('moments-header-bg');
    if (bgEl) bgEl.style.backgroundImage = `url('${url}')`;
    localStorage.setItem('myCoolPhone_momentsBg', url);
}

function restoreMomentsBg() {
    const url = localStorage.getItem('myCoolPhone_momentsBg');
    if (url) {
        const bgEl = document.getElementById('moments-header-bg');
        if (bgEl) bgEl.style.backgroundImage = `url('${url}')`;
    }
}

// 在页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
    restoreMomentsBg();
});


// ==========================================
// [核心修改] 朋友圈回复逻辑 (支持引用、AI递归、围观)
// ==========================================

// 用于记录当前正在回复谁： { momentId, commentId, authorName, authorId }


// 设置回复目标（点击某条评论时触发）
window.setReplyTarget = function(momentId, commentId, authorName, authorId) {
    // 找到对应的输入框
    const card = document.querySelector(`.moment-card[data-moment-id="${momentId}"]`);
    if (!card) return;
    const input = card.querySelector('.moment-comment-input');
    
    // 如果点击的是自己发的，或者是取消状态，则重置
    if (currentReplyTarget && currentReplyTarget.commentId === commentId) {
        cancelReplyTarget(momentId);
        return;
    }

    currentReplyTarget = { momentId, commentId, authorName, authorId };
    
    // UI 反馈
    input.placeholder = `回复 ${authorName}:`;
    input.focus();
    input.style.border = "1px solid #07c160"; // 绿框提示
};

// 取消回复目标
function cancelReplyTarget(momentId) {
    currentReplyTarget = null;
    const card = document.querySelector(`.moment-card[data-moment-id="${momentId}"]`);
    if (card) {
        const input = card.querySelector('.moment-comment-input');
        input.placeholder = "评论...";
        input.style.border = "1px solid #e0e0e0";
    }
}
// 朋友圈评论管理：修改和删除
window.handleCommentAdmin = function(e, momentId, commentId) {
    if(e) e.preventDefault();
    const m = momentsFeed.find(x => x.id === momentId);
    if (!m) return;
    const c = m.comments.find(x => x.id === commentId);
    if (!c) return;

    const op = confirm("管理评论：\n点击【确定】修改文字\n点击【取消】删除评论");
    if (op) {
        const newVal = prompt("请输入修改后的评论：", c.text);
        if (newVal !== null) {
            c.text = newVal;
            saveMomentsFeed();
            renderMomentsFeed();
        }
    } else {
        if (confirm("确定删除这条评论吗？")) {
            m.comments = m.comments.filter(x => x.id !== commentId);
            saveMomentsFeed();
            renderMomentsFeed();
        }
    }
};
/* =========================================
   [NEW] Live App Logic (K-Style)
   ========================================= */

// 打开 App
window.openLiveApp = function() {
    const app = document.getElementById('liveApp');
    if(app) {
        app.classList.add('open');
        renderKFeed(); // 生成推荐流
    }
}

// 关闭 App
window.closeLiveApp = function() {
    document.getElementById('liveApp').classList.remove('open');
}

// 切换 Tab
window.switchLiveTab = function(tabName, btnEl) {
    document.querySelectorAll('.k-tab-content').forEach(el => el.style.display = 'none');
    document.getElementById(`lv-tab-${tabName}`).style.display = 'block';

    const dock = document.querySelector('.k-dock');
    dock.querySelectorAll('.k-dock-item').forEach(el => el.classList.remove('active'));
    
    // 如果不是中间那个白色按钮，就高亮图标
    if (!btnEl.querySelector('.k-btn-center')) {
        btnEl.classList.add('active');
    }
}

// 生成杂志风 Feed 流
function renderKFeed() {
    const container = document.getElementById('lv-feed-container');
    if (!container || container.children.length > 0) return; 

    // 这些标题和图片都要显得“冷淡”、“高级”
    const data = [
        { title: "SEOUL VIBE.", user: "Hannah", img: "1534528741775-53994a69daeb" },
        { title: "NOISE / SILENCE", user: "AI_02", img: "1507679721516-fed88ce46ea2" },
        { title: "MIDNIGHT.", user: "System", img: "1517841905240-472988babdf9" },
        { title: "COFFEE RUN", user: "User99", img: "1497935586351-b67a49e012bf" },
        { title: "STUDY W/ ME", user: "Bot_X", img: "1516321497487-e288fb19713f" },
        { title: "CINEMA 4D", user: "Render", img: "1618005182384-a83a8bd57fbe" }
    ];

    data.forEach((item, index) => {
        // 随机高度差异，但不要太夸张
        const height = index % 2 === 0 ? '240px' : '180px';
        
        const card = document.createElement('div');
        card.className = 'k-card';
        card.innerHTML = `
            <div style="position:relative;">
                <div class="k-live-tag"><span class="k-blink-dot"></span>LIVE</div>
                <img src="https://images.unsplash.com/photo-${item.img}?q=80&w=300&auto=format&fit=crop" 
                     class="k-card-img" style="height: ${height}">
            </div>
            <div class="k-card-info">
                <div class="k-card-title">${item.title}</div>
                <div class="k-card-user">${item.user}</div>
            </div>
        `;
        container.appendChild(card);
    });
}
/* =========================================
   [新增] 直播APP - 发布作品逻辑
   ========================================= */

// 存储作品的数组 (模拟数据库)
let myLiveWorks = [
    {
        id: 'work_init_1',
        img: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=300&auto=format&fit=crop',
        desc: 'Hello World! #Daily',
        likes: 120,
        comments: 45,
        shares: 12
    }
];

// 初始化：页面加载时渲染已有的作品
document.addEventListener('DOMContentLoaded', () => {
    renderLiveWorks();
});

// 1. 打开/关闭发布弹窗
window.openLivePublishModal = function() {
    // 重置表单
    document.getElementById('live-preview-img').src = '';
    document.getElementById('live-preview-img').style.display = 'none';
    document.getElementById('live-upload-icon').style.display = 'block';
    document.getElementById('live-desc').value = '';
    document.getElementById('live-file-input').value = '';
    
    document.getElementById('livePublishModal').classList.add('show');
}

window.closeLivePublishModal = function() {
    document.getElementById('livePublishModal').classList.remove('show');
}

// 2. 图片预览
window.handleLiveFilePreview = function(input) {
    const file = input.files[0];
    if(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById('live-preview-img');
            img.src = e.target.result;
            img.style.display = 'block';
            document.getElementById('live-upload-icon').style.display = 'none';
        }
        reader.readAsDataURL(file);
    }
}

// 3. 确认发布
window.confirmPublishWork = function() {
    const imgEl = document.getElementById('live-preview-img');
    const desc = document.getElementById('live-desc').value;
    const tag = document.getElementById('live-tag').value;
    
    // 简单校验
    if (imgEl.style.display === 'none') {
        alert("请先上传一张图片/视频封面！");
        return;
    }
    
    // 创建新作品对象
    const newWork = {
        id: 'work_' + Date.now(),
        img: imgEl.src,
        desc: desc + ' ' + tag,
        likes: 0,
        comments: 0,
        shares: 0
    };
    
    // 存入数组 (插到最前面)
    myLiveWorks.unshift(newWork);
    
    // 重新渲染列表
    renderLiveWorks();
    
    // 关闭弹窗并提示
    closeLivePublishModal();
    alert("发布成功！");
}

// 4. 渲染作品列表到个人主页
function renderLiveWorks() {
    const container = document.getElementById('k-my-works-grid');
    if (!container) return;
    
    container.innerHTML = ''; // 清空
    
    myLiveWorks.forEach(work => {
        const item = document.createElement('div');
        item.className = 'k-work-item';
        item.onclick = () => openWorkDetail(work.id);
        
        item.innerHTML = `
            <img src="${work.img}">
            <div class="k-work-stats">
                <i class="far fa-heart"></i> ${work.likes}
            </div>
        `;
        container.appendChild(item);
    });
}

// 5. 打开作品详情页
window.openWorkDetail = function(workId) {
    const work = myLiveWorks.find(w => w.id === workId);
    if (!work) return;
    
    // 填充数据
    document.getElementById('work-detail-img').src = work.img;
    document.getElementById('work-detail-likes').innerText = work.likes;
    document.getElementById('work-detail-comments').innerText = work.comments;
    document.getElementById('work-detail-shares').innerText = work.shares;
    document.getElementById('work-detail-desc').innerText = work.desc;
    
    // 显示弹窗
    document.getElementById('liveWorkDetailModal').classList.add('show');
}

window.closeWorkDetailModal = function() {
    document.getElementById('liveWorkDetailModal').classList.remove('show');
}

/* =========================================
   [新增] Page 4 电子小票逻辑
   ========================================= */

window.openSimulatedApp = function(appName) {
    // 简单的模拟打开效果
    let appLabel = "";
    let color = "";
    let icon = "";

    if (appName === 'taobao') {
        appLabel = "淘宝 (Taobao)";
        color = "#ff5000";
        icon = '<i class="fas fa-shopping-bag"></i>';
    } else if (appName === 'meituan') {
        appLabel = "美团 (Meituan)";
        color = "#ffc300";
        icon = '<i class="fas fa-utensils"></i>';
    } else {
        return;
    }

    // 创建一个临时的全屏遮罩来模拟APP启动画面
    const splashId = 'splash-' + Date.now();
    const splash = document.createElement('div');
    splash.id = splashId;
    splash.style.cssText = `
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        background: ${color}; color: #fff; z-index: 500;
        display: flex; flex-direction: column; justify-content: center; align-items: center;
        border-radius: 40px; animation: fadeIn 0.3s ease;
    `;
    
    splash.innerHTML = `
        <div style="font-size: 60px; margin-bottom: 20px; animation: float-slow 2s infinite;">${icon}</div>
        <div style="font-size: 20px; font-weight: 700; letter-spacing: 2px;">${appLabel}</div>
        <div style="margin-top: 20px; font-size: 12px; opacity: 0.8;">Loading...</div>
    `;
    
    document.querySelector('.phone').appendChild(splash);

    // 2秒后自动关闭，模拟“看了一眼”或者跳转后的返回
    setTimeout(() => {
        splash.style.opacity = '0';
        splash.style.transition = 'opacity 0.5s';
        setTimeout(() => {
            splash.remove();
        }, 500);
    }, 2000);
}
/* =========================================
   [新增] 核心角色卡导入与世界书关联系统
   ========================================= */

// 导入逻辑：将解析好的 JSON 转换为 App 内好友
function importTavernCard(json, fileName, customAvatar) {
    // 兼容 V1/V2 结构
    const data = json.data || json; 
    
    // 1. 提取基础信息
    const charName = data.name || fileName.replace(/\.(json|png)$/i, '');
    const description = data.description || '';
    const personality = data.personality || '';
    const scenario = data.scenario || '';
   const firstMes = data.first_mes || "你好";
const altGreetings = Array.isArray(data.alternate_greetings) ? data.alternate_greetings : [];
const greetingList = [firstMes, ...altGreetings].filter(x => x && String(x).trim());

    const mesExample = data.mes_example || '';

    // 组合人设 Prompt
    const fullPersona = `
[Character("${charName}")]
[Description("${description}")]
[Personality("${personality}")]
[Scenario("${scenario}")]
[Example Dialogue]
${mesExample}
    `.trim();

    // 2. 处理世界书 (Character Book)
    let linkedWorldBookIds = [];
    if (data.character_book && data.character_book.entries) {
        const bookName = data.character_book.name || (charName + "的世界书");
        const newEntries = data.character_book.entries.map(entry => ({
            keys: Array.isArray(entry.keys) ? entry.keys.join(', ') : (entry.keys || ''),
            content: entry.content || '',
            comment: entry.comment || entry.name || '',
            enabled: entry.enabled !== false
        }));

        const newBookId = 'wb_' + Date.now() + '_' + Math.floor(Math.random()*1000);
        const newBook = {
            id: newBookId,
            title: bookName,
            category: "Imported Card",
            global: false,
            strategy: "depth",
            entries: newEntries
        };

        worldBooks.push(newBook);
        saveWorldBooksData();
        linkedWorldBookIds.push(newBookId);
    }

    // 3. 处理头像
    // 优先级：传入的 PNG 图片 > JSON 里的 avatar 字段 > 随机头像
    let finalAvatar = '';
    if (customAvatar) {
        finalAvatar = customAvatar; // 使用 PNG 本身
    } else if (data.avatar && data.avatar.length > 100) {
        finalAvatar = data.avatar.startsWith('data:') ? data.avatar : `data:image/png;base64,${data.avatar}`;
    } else {
        finalAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${charName}`;
    }

    // 4. 创建好友数据
    let finalId = charName;
    if (friendsData[finalId]) {
        if (!confirm(`角色 "${charName}" 已存在，是否覆盖？`)) {
            finalId = charName + "_" + Date.now().toString().slice(-4);
        }
    }

   // ... 在 importTavernCard 函数内部 ...

    friendsData[finalId] = {
        realName: charName,
        remark: charName,
        persona: fullPersona,
        worldbook: linkedWorldBookIds,
        greetingList: greetingList, // <--- 关键：新增这一行，把解析好的列表存进去
        greetingSelected: 0,
        tavernGreeting: firstMes || '',
        greetingMode: (greetingList.length ? 'tavern' : 'custom'),
        greetingCustom: '',
        greeting: firstMes || '',
        avatar: finalAvatar,
        chatSettings: {

            memoryLimit: 20,
            translationMode: 'off',
            targetOutputLang: '',
            inactivityEnabled: false,
            statusRegexEnabled: false
        }
    };

    // 5. 保存并刷新
    saveFriendsData();
    rebuildContactsList();
    restoreFriendListUI();

    // 6. 反馈
    toggleWeChatMenu();
    alert(`PNG 角色 "${charName}" 导入成功！`);
    openChatDetail(finalId);
}

/* =========================================
   [新增] PNG 角色卡解析核心工具
   ========================================= */

// 从 ArrayBuffer 中提取 Tavern 格式的 tEXt 数据
window.extractTavernPngData = function(buffer) {
    const view = new DataView(buffer);
    
    // 1. 验证 PNG 头部签名 (89 50 4E 47 0D 0A 1A 0A)
    if (view.getUint32(0) !== 0x89504E47 || view.getUint32(4) !== 0x0D0A1A0A) {
        throw new Error("不是有效的 PNG 文件");
    }

    let offset = 8; // 跳过头部
    const decoder = new TextDecoder("utf-8");

    while (offset < view.byteLength) {
        // 读取块长度和类型
        const length = view.getUint32(offset);
        const type = decoder.decode(new Uint8Array(buffer, offset + 4, 4));

        // 我们只关心 'tEXt' 块
        if (type === 'tEXt') {
            const dataOffset = offset + 8;
            // 获取块数据
            const chunkData = new Uint8Array(buffer, dataOffset, length);
            
            // tEXt 格式: Keyword + null separator + Text
            // 我们要找 Keyword 为 "chara" 的块
            let separatorIndex = -1;
            for (let i = 0; i < length; i++) {
                if (chunkData[i] === 0) {
                    separatorIndex = i;
                    break;
                }
            }

            if (separatorIndex !== -1) {
                const keyword = decoder.decode(chunkData.slice(0, separatorIndex));
                
                // Tavern 卡片的标准关键字是 'chara'
                if (keyword === 'chara') {
                    // 提取内容部分 (Base64 编码的 JSON)
                    const contentBase64 = decoder.decode(chunkData.slice(separatorIndex + 1));
                    try {
                        // === 【核心修复开始】 ===
                        
                        // 1. 先用 atob 解码成二进制字符串
                        const binaryString = atob(contentBase64);
                        
                        // 2. 将二进制字符串转回字节数组 (Uint8Array)
                        const bytes = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }
                        
                        // 3. 关键步骤：使用 TextDecoder 按 UTF-8 重新解码字节数组
                        // 这步能把 3 个字节的一组数据正确还原成一个中文字
                        const jsonStr = new TextDecoder("utf-8").decode(bytes);
                        
                        // === 【核心修复结束】 ===

                        return JSON.parse(jsonStr);
                    } catch (e) {
                        console.log("Found chara chunk but failed to decode base64:", e);
                        // 备用方案：如果上面失败了，尝试直接解析（应对未Base64的情况）
                        try {
                            return JSON.parse(contentBase64);
                        } catch (e2) {
                            console.error("Direct JSON parse also failed");
                        }
                    }
                }
            }
        }

        // 移动到下一个块 (Length + Type(4) + Data(Length) + CRC(4))
        offset += 12 + length;
    }

    return null; // 没找到
};

/* =========================================
   [新增] 图片压缩工具 (防止撑爆 LocalStorage)
   ========================================= */
function compressImage(base64Str, maxWidth = 300, quality = 0.7) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            let w = img.width;
            let h = img.height;
            
            // 计算缩放比例
            if (w > maxWidth) {
                h = Math.round(h * (maxWidth / w));
                w = maxWidth;
            }
            
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            
            // 导出为低质量 JPEG
            const newBase64 = canvas.toDataURL('image/jpeg', quality);
            resolve(newBase64);
        };
        img.onerror = () => {
            // 如果出错，勉强返回原图（虽然可能会炸）
            resolve(base64Str);
        };
    });
}
/* =========================================
   [修复补丁] 角色卡文件处理入口函数
   (请将此函数添加在 apps.js 中，例如 featureImportCard 附近或文件末尾)
   ========================================= */

window.handleCardFile = function(input) {
    const file = input.files[0];
    if (!file) return;

    const fileName = file.name;
    const ext = fileName.split('.').pop().toLowerCase();
    
    // 1. 处理 JSON 格式
    if (ext === 'json') {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const json = JSON.parse(e.target.result);
                // JSON 文件里通常包含图片 Base64，或者没有图片
                importTavernCard(json, fileName, null); 
            } catch (err) {
                alert("JSON 解析失败: " + err.message);
            }
        };
        reader.readAsText(file);
    } 
    // 2. 处理 PNG 格式 (Tavern Card)
    else if (ext === 'png' || ext === 'webp') {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const buffer = e.target.result;
                // 尝试解析 PNG 内嵌的 tEXt 数据
                const json = extractTavernPngData(buffer);
                
                if (json) {
                    // 解析成功后，还需要把这张图本身转成 Base64 当作头像
                    const urlReader = new FileReader();
                    urlReader.onload = function(evt) {
                        const base64Image = evt.target.result;
                        // 调用导入逻辑，传入 JSON 和 图片本身
                        importTavernCard(json, fileName, base64Image);
                    };
                    urlReader.readAsDataURL(file);
                } else {
                    alert("未能从图片中提取角色数据。请确认这是包含元数据的 Tavern 格式卡片。");
                }
            } catch (err) {
                console.error(err);
                alert("图片解析出错: " + err.message);
            }
        };
        // 关键：读取为 ArrayBuffer 以便解析二进制元数据
        reader.readAsArrayBuffer(file);
    } 
    else {
        alert("不支持的文件格式。仅支持 JSON 或 PNG/WEBP 角色卡。");
    }

    // 清空 input，防止无法连续导入同一个文件
    input.value = ''; 
};
/* =========================================
   [究极合并版] Bubble App Logic (爱豆+粉丝 双模式)
   ========================================= */

// 1. 全局数据定义
const BUBBLE_DATA_KEY = 'myCoolPhone_bubbleData';
let bubbleData = {
    // 消息记录：{id, text, sender: 'idol'|'fan', time, isVirtualIdol: boolean}
    messages: [], 
    // 路人回复池 (用于滚动条)
    mobReplies: [] 
};

// 当前关注的爱豆ID (粉丝模式用)
let currentIdolId = 'Hannah AI'; 
// 假粉丝自动回复定时器 (爱豆模式用)
let fakeFanInterval;
// 评论池
let bubbleCommentsPool = [];

// 2. 打开/关闭 App
window.openBubbleApp = function() {
    const app = document.getElementById('bubbleApp');
    if (app) {
        app.classList.add('open');
        loadBubbleData();
        
        // 默认进 Landing 页，隐藏其他页
        document.getElementById('bb-landing-view').style.display = 'flex';
        document.getElementById('bb-idol-view').style.display = 'none';
        document.getElementById('bb-fan-view').style.display = 'none';

        // 尝试自动选择第一个好友作为粉丝模式的爱豆
        const ids = Object.keys(friendsData);
        if (ids.length > 0) currentIdolId = ids[0];
    }
}

window.closeBubbleApp = function() {
    document.getElementById('bubbleApp').classList.remove('open');
    if (fakeFanInterval) clearInterval(fakeFanInterval); // 关闭时停止假粉丝
}

// 3. 模式切换入口
window.enterBubbleMode = function(mode) {
    document.getElementById('bb-landing-view').style.display = 'none';
    
    if (mode === 'idol') {
        // === 进入爱豆模式 ===
        document.getElementById('bb-idol-view').style.display = 'flex';
        renderIdolHistory();     // 渲染历史记录
        startFakeFanReplies();   // 开始滚动假评论
    } else {
        // === 进入粉丝模式 ===
        document.getElementById('bb-fan-view').style.display = 'flex';
        renderFanView();         // 渲染聊天界面
        
        // 如果是空的，自动触发一条爱豆欢迎语
        const hasFanMsgs = bubbleData.messages.some(m => m.isVirtualIdol === true);
        if (!hasFanMsgs && bubbleData.messages.length === 0) {
            triggerIdolBroadcast(true); 
        }
    }
}

window.exitBubbleMode = function() {
    document.getElementById('bb-idol-view').style.display = 'none';
    document.getElementById('bb-fan-view').style.display = 'none';
    document.getElementById('bb-landing-view').style.display = 'flex';
    if (fakeFanInterval) clearInterval(fakeFanInterval);
}

/* =========================================
   Part A: 爱豆模式逻辑 (我是爱豆，发广播)
   ========================================= */

// A1. 爱豆发送广播
window.idolSendBroadcast = function() {
    const input = document.getElementById('bb-idol-input');
    const text = input.value.trim();
    if (!text) return;

    // 存入公共消息列表
    const msg = {
        id: Date.now(),
        text: text,
        sender: 'idol', // 我是发送者
        isVirtualIdol: false, // 标记：这不是AI发的，是真人发的
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    };
    bubbleData.messages.push(msg);
    saveBubbleData();

    // UI 反馈
    input.value = '';
    renderIdolHistory();
    alert(`[SYSTEM] Message sent! Waiting for replies...`);

    // 触发 AI 好友来回复你的广播
    triggerAiFanReaction(text);
}

// A2. 渲染发送历史
function renderIdolHistory() {
    const container = document.getElementById('bb-sent-history');
    if (!container) return;
    // 只显示我(真人爱豆)发的消息
    const history = bubbleData.messages.filter(m => m.sender === 'idol' && !m.isVirtualIdol).reverse();
    
    container.innerHTML = history.map(m => `
        <div class="bb-history-item">
            <span class="bb-history-time">${m.time}</span>
            ${m.text}
        </div>
    `).join('');
}

// A3. 触发 AI 好友扮演粉丝回复
async function triggerAiFanReaction(idolText) {
    const friendIds = Object.keys(friendsData);
    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    const settings = settingsJSON ? JSON.parse(settingsJSON) : null;

    if (!settings) return; 

    // 遍历每一个好友
    for (const friendId of friendIds) {
        if (friendId === 'ME') continue;
        const friend = friendsData[friendId];
        
        // 随机延迟
        const delay = Math.floor(Math.random() * 12000) + 3000;

        setTimeout(async () => {
            const systemPrompt = `
            You are playing the role of ${friend.realName}, a super fan of the Idol (User).
            The Idol just posted: "${idolText}"
            Task: Write a short, excited fan reply (under 20 words).
            Output ONLY the reply text.
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
                const replyText = data.choices[0].message.content.trim();
                
                // 添加到评论列表 (标记为 VIP)
                addBubbleComment(replyText, true, friend);

            } catch (e) { console.error(e); }
        }, delay);
    }
}

// A4. 模拟假路人粉丝回复 (循环生成)
function startFakeFanReplies() {
    if (fakeFanInterval) clearInterval(fakeFanInterval);
    
    const fakeReplies = [
        "姐姐好美！", "Love from Brazil 🇧🇷", "Waiting for new song...", 
        "Ahhhhh!!!", "Good morning", "Update more please", "❤️❤️❤️", "First!", "Marry me!"
    ];
    
    fakeFanInterval = setInterval(() => {
        // 如果不在爱豆界面，就不生成
        if (document.getElementById('bb-idol-view').style.display === 'none') return;
        const text = fakeReplies[Math.floor(Math.random() * fakeReplies.length)];
        addBubbleComment(text, false); // false = 非VIP
    }, 2500); 
}

/* =========================================
   Part B: 粉丝模式逻辑 (我是粉丝，AI是爱豆)
   ========================================= */

// B1. 渲染聊天界面
function renderFanView() {
    const friend = friendsData[currentIdolId] || { realName: 'Artist' };
    
    // 更新顶部名字
    const nameEl = document.getElementById('bb-active-idol-name');
    if(nameEl) nameEl.innerText = friend.remark || friend.realName;

    const container = document.getElementById('bb-chat-container');
    container.innerHTML = `<div class="bb-time-stamp" style="align-self:center;">TODAY</div>`;
    
    // 过滤出属于粉丝模式的消息 (isVirtualIdol = true 或 sender = fan)
    const fanModeMessages = bubbleData.messages.filter(m => m.isVirtualIdol === true || m.sender === 'fan');

    fanModeMessages.forEach(m => {
        if (m.sender === 'idol') {
            // === 爱豆消息 (AI发的) ===
            const f = friendsData[m.idolId] || friendsData[currentIdolId];
            const avatar = f.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.realName}`;
            const name = f.remark || f.realName;
            
            const div = document.createElement('div');
            div.className = 'bb-msg-row idol';
            div.innerHTML = `
                <div class="bb-idol-container">
                    <div class="bb-idol-name-tag">
                        ${name} <span class="bb-idol-badge">ARTIST</span>
                    </div>
                    <div class="bb-idol-bubble-wrap">
                        <div class="bb-idol-avatar"><img src="${avatar}"></div>
                        <div class="bb-bubble idol-style">${m.text}</div>
                    </div>
                </div>
            `;
            container.appendChild(div);
        } else {
            // === 我的回复 (我是粉丝) ===
            const div = document.createElement('div');
            div.className = 'bb-msg-row fan';
            div.innerHTML = `<div class="bb-bubble fan-style">${m.text}</div>`;
            container.appendChild(div);
        }
    });

    setTimeout(() => container.scrollTop = container.scrollHeight, 100);
}

// B2. 我(粉丝)发送回复
window.fanSendReply = function() {
    const input = document.getElementById('bb-fan-input');
    const text = input.value.trim();
    if (!text) return;

    bubbleData.messages.push({
        id: Date.now(),
        text: text,
        sender: 'fan',
        time: new Date().toLocaleTimeString()
    });
    saveBubbleData();
    renderFanView();
    input.value = '';
}

// B3. 触发爱豆(AI)发广播
window.triggerIdolBroadcast = async function(isWelcome = false) {
    const friend = friendsData[currentIdolId];
    if (!friend) return;

    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    const settings = settingsJSON ? JSON.parse(settingsJSON) : null;
    let replyText = "Hello bubbles!";

    if (settings) {
        const systemPrompt = `
        You are a famous K-pop Idol named ${friend.realName}.
        Persona: ${friend.persona}
        Context: sending a message on "Bubble" app to fans.
        Style: Casual, cute, sharing daily life.
        Task: Write a short message (1-2 sentences).
        IMPORTANT: No quotes.
        `;
        
        try {
            document.getElementById('bb-ticker-text').innerText = "Artist is typing...";
            let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
            const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
            
            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
                body: JSON.stringify({
                    model: settings.model,
                    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: "Send a new update." }],
                    temperature: 0.9
                })
            });
            const data = await res.json();
            replyText = data.choices[0].message.content;
        } catch (e) { console.error(e); }
    } else if (isWelcome) {
        replyText = friend.greeting || "Welcome to my Bubble! ✨";
    }

    // 存入消息 (标记为 isVirtualIdol=true)
    bubbleData.messages.push({
        id: Date.now(),
        text: replyText,
        sender: 'idol',
        idolId: currentIdolId,
        isVirtualIdol: true, 
        time: new Date().toLocaleTimeString()
    });
    saveBubbleData();
    renderFanView();

    // 触发顶部的路人回复滚动条
    generateMobReactions(replyText);
}

// B4. 生成路人回复 (粉丝模式顶部的 Ticker)
function generateMobReactions(contextText) {
    const fakeReplies = ["OMG!!", "终于等到你！", "Love you unnie!", "啊啊啊啊啊", "So cute T_T", "第一！", "Wow", "I miss you"];
    const count = Math.floor(Math.random() * 5) + 5;
    const newMobs = [];
    
    for(let i=0; i<count; i++) {
        const text = fakeReplies[Math.floor(Math.random() * fakeReplies.length)];
        newMobs.push({
            user: "User" + Math.floor(Math.random() * 9000),
            text: text,
            time: "Just now"
        });
    }
    // 存入临时池子
    bubbleData.mobReplies = [...newMobs, ...bubbleData.mobReplies].slice(0, 30);
    
    // 更新 UI
    const tickerText = newMobs.map(m => m.text).join("   |   ");
    const tickerEl = document.getElementById('bb-ticker-text');
    if(tickerEl) {
        tickerEl.innerText = tickerText;
        tickerEl.style.animation = 'none';
        tickerEl.offsetHeight; /* trigger reflow */
        tickerEl.style.animation = 'marquee-left 15s linear infinite';
    }
    
    const countEl = document.getElementById('bb-mob-count');
    if(countEl) countEl.innerText = bubbleData.mobReplies.length;

    // 如果弹窗开着，刷新列表
    if(document.getElementById('bb-mob-modal') && document.getElementById('bb-mob-modal').classList.contains('show')) {
        renderMobList();
    }
}

/* =========================================
   Part C: 通用 UI 辅助 (弹窗/评论行)
   ========================================= */

// C1. 添加评论到 UI (爱豆模式下用)
function addBubbleComment(text, isVip, friendData = null) {
    const comment = {
        id: Date.now() + Math.random(),
        text: text,
        isVip: isVip,
        name: isVip ? (friendData.remark || friendData.realName) : ("User" + Math.floor(Math.random()*9000+1000)),
        avatar: isVip ? (friendData.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friendData.realName}`) : null,
        time: new Date().toLocaleTimeString()
    };
    
    bubbleCommentsPool.unshift(comment); 
    
    // 更新滚动条 (Ticker)
    const ticker = document.getElementById('bb-reply-ticker');
    if (ticker) {
        const div = document.createElement('div');
        div.className = 'bb-reply-item';
        const nameStyle = isVip ? 'color:#ff7e67; font-weight:800;' : '';
        const vipIcon = isVip ? '👑 ' : '';
        div.innerHTML = `<span style="${nameStyle}">${vipIcon}${comment.name}:</span> ${text}`;
        ticker.prepend(div);
        if (ticker.children.length > 8) ticker.lastChild.remove();
    }

    // 更新列表弹窗
    const listContainer = document.getElementById('bb-comment-list-container');
    const modal = document.getElementById('bb-comment-modal');
    if (modal && modal.classList.contains('show') && listContainer) {
        const row = createCommentRowHTML(comment);
        listContainer.insertAdjacentHTML('afterbegin', row);
        updateReplyCount();
    }
}

// C2. 生成评论行 HTML
function createCommentRowHTML(c) {
    if (c.isVip) {
        return `
            <div class="bb-comment-row vip">
                <img src="${c.avatar}" class="bb-c-avatar">
                <div class="bb-c-content">
                    <span class="bb-c-name">${c.name} <i class="fas fa-check-circle" style="font-size:10px;"></i></span>
                    <div class="bb-c-text">${c.text}</div>
                </div>
            </div>
        `;
    } else {
        return `
            <div class="bb-comment-row fake">
                <div class="bb-c-avatar"></div>
                <div class="bb-c-content">
                    <div style="font-weight:700; font-size:10px; margin-bottom:2px;">${c.name}</div>
                    <div>${c.text}</div>
                </div>
            </div>
        `;
    }
}

// C3. 评论列表弹窗控制 (共用)
// 粉丝模式下：显示 mobReplies
// 爱豆模式下：显示 bubbleCommentsPool
window.openBubbleComments = function() { // 爱豆模式入口
    renderCommentsModal(bubbleCommentsPool);
}
window.openMobReplies = function() { // 粉丝模式入口
    renderMobList(); 
    document.getElementById('bb-mob-modal').classList.add('show');
}

function renderCommentsModal(pool) {
    const modal = document.getElementById('bb-comment-modal');
    const list = document.getElementById('bb-comment-list-container');
    if(!modal || !list) return;
    list.innerHTML = pool.map(c => createCommentRowHTML(c)).join('');
    updateReplyCount();
    modal.classList.add('show');
}

window.closeBubbleComments = function() {
    const modal = document.getElementById('bb-comment-modal');
    if(modal) modal.classList.remove('show');
}
window.closeMobReplies = function() {
    const modal = document.getElementById('bb-mob-modal');
    if(modal) modal.classList.remove('show');
}

function updateReplyCount() {
    const el = document.getElementById('bb-total-replies');
    if(el) el.innerText = bubbleCommentsPool.length;
}

// 粉丝模式的路人列表渲染
function renderMobList() {
    const list = document.getElementById('bb-mob-list');
    list.innerHTML = '';
    bubbleData.mobReplies.forEach(m => {
        const item = document.createElement('div');
        item.className = 'bb-mob-item';
        item.innerHTML = `
            <div class="bb-mob-avatar"></div>
            <div class="bb-mob-content">
                <div class="bb-mob-user">${m.user}</div>
                <div>${m.text}</div>
            </div>
        `;
        list.appendChild(item);
    });
    const countEl = document.getElementById('bb-mob-count');
    if(countEl) countEl.innerText = bubbleData.mobReplies.length;
}

// 数据加载/保存
function loadBubbleData() {
    const raw = localStorage.getItem(BUBBLE_DATA_KEY);
    if (raw) bubbleData = JSON.parse(raw);
}
function saveBubbleData() {
    localStorage.setItem(BUBBLE_DATA_KEY, JSON.stringify(bubbleData));
}
/* =========================================
   [新增] 气泡菜单与高级操作逻辑 (撤回/多选/转发)
   ========================================= */

// 全局变量：记录当前操作的消息信息
let currentMenuTarget = { id: null, text: '', type: '', element: null };


// 2. 处理菜单点击动作
window.handleMenuAction = function(action) {
    const { id, text, type, element } = currentMenuTarget;
    if (!id) return;

    switch (action) {
        case 'copy':
            navigator.clipboard.writeText(text).then(() => {
               // 简单的复制成功反馈
               const chatMessages = document.getElementById('chatMessages');
               const tip = document.createElement('div');
               tip.innerHTML = "<span style='background:rgba(0,0,0,0.6);color:#fff;padding:5px 10px;border-radius:4px;font-size:12px;'>已复制</span>";
               tip.style.cssText = "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:999;";
               chatMessages.appendChild(tip);
               setTimeout(()=>tip.remove(), 1000);
            });
            break;
            
        case 'quote':
            const input = document.getElementById('chatInput');
            // 引用格式
            input.value = `「${text}」\n----------------\n` + input.value;
            input.focus();
            break;
            
        case 'forward':
            enterMultiSelectMode(); // 进入多选模式
            break;
            
        case 'collect':
            alert('已添加到收藏');
            break;
            
        case 'delete':
             enterMultiSelectMode(); 
        break;
   
        case 'revoke':
            // 撤回逻辑：前端变灰 + AI 知道
            performRevoke(id, text, element);
            break;
        case 'regen':
    performOnlineRegen(currentMenuTarget.element);
    break;
    
    }
}

// --- 撤回核心逻辑 ---
function performRevoke(msgId, originalText, rowElement) {
    // 1. 替换 DOM 为系统提示
    const systemTip = document.createElement('div');
    systemTip.className = 'msg-system-revoke';
    systemTip.innerHTML = `<span>你撤回了一条消息 <span style="color:#576b95;cursor:pointer;" onclick="document.getElementById('chatInput').value='${originalText}'">重新编辑</span></span>`;
    
    // 替换原有的 row
    if(rowElement.parentNode) {
        rowElement.parentNode.replaceChild(systemTip, rowElement);
    }
    
    // 2. 【AI 互动】告诉 AI 用户撤回了消息 (隐藏指令)
    const aiHiddenPrompt = `[System: The user just sent "${originalText}" but immediately REVOKED (deleted) it. You definitely saw it. React to this revocation playfully. Ask them what they are hiding, or tease them about being indecisive. DO NOT repeat the exact revoked text.]`;
    
    sendMessageToAI(aiHiddenPrompt);
}

// --- 多选转发逻辑 ---

// 1. 进入多选模式
function enterMultiSelectMode() {
    const chatMessages = document.getElementById('chatMessages');
    const inputArea = document.querySelector('.chat-input-area');
    const bar = document.getElementById('wc-multi-select-bar');
    
    chatMessages.classList.add('selection-mode');
    inputArea.style.display = 'none'; // 隐藏输入框
    bar.classList.add('show'); // 显示底部栏
    
    // 自动勾选刚才触发菜单的那一条
    if (currentMenuTarget.element) {
        const cb = currentMenuTarget.element.querySelector('.wc-msg-checkbox');
        if (cb) cb.classList.add('checked');
    }
}

// 2. 退出多选模式
window.exitMultiSelectMode = function() {
    const chatMessages = document.getElementById('chatMessages');
    const inputArea = document.querySelector('.chat-input-area');
    const bar = document.getElementById('wc-multi-select-bar');
    
    chatMessages.classList.remove('selection-mode');
    inputArea.style.display = 'block';
    bar.classList.remove('show');
    
    // 清空所有勾选
    document.querySelectorAll('.wc-msg-checkbox').forEach(cb => cb.classList.remove('checked'));
}

// 3. 切换单个复选框状态
window.toggleMsgSelection = function(checkboxEl) {
    checkboxEl.classList.toggle('checked');
}

// 全局存储转发记录的 Key
const FORWARD_STORE_KEY = 'myCoolPhone_fwdHistory';

// === [修改] 执行合并转发 (生成ID，保存数据，绑定点击) ===
window.executeMultiForward = function() {
    const selectedRows = document.querySelectorAll('.chat-row');
    let previewLines = [];
    let fullMessages = []; // 用于详情页展示的完整数据
    let aiText = "";       // 发给AI看的纯文本
    let count = 0;
    
    const chatTitle = friendsData[currentChatId]?.remark || friendsData[currentChatId]?.realName || currentChatId || "Chat";

    selectedRows.forEach(row => {
        const cb = row.querySelector('.wc-msg-checkbox');
        if (cb && cb.classList.contains('checked')) {
            const sender = row.getAttribute('data-msg-sender') || 'User';
            let text = row.getAttribute('data-msg-text') || '[媒体消息]';
            
            // 获取头像 (从DOM里找)
            const avatarImg = row.querySelector('.chat-avatar-img');
            const avatarSrc = avatarImg ? avatarImg.src : '';

            // 1. 收集预览文本
            const cleanText = text.replace(/<br>/g, ' ').substring(0, 50);
            if (previewLines.length < 4) {
                previewLines.push(`${sender}: ${cleanText}`);
            }
            
            // 2. 收集完整数据对象
            fullMessages.push({
                sender: sender,
                avatar: avatarSrc,
                text: text, // 这里的 text 可能包含 <br>
                time: new Date().getTime() // 记录时间
            });

            // 3. AI 文本
            aiText += `[${sender}]: ${cleanText}\n`;
            count++;
        }
    });
    
    if (count === 0) {
        alert("请至少选择一条消息");
        return;
    }
    
    // === 核心逻辑：生成唯一ID并保存数据 ===
    const forwardId = 'fwd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    
    // 读取旧数据 -> 合并新数据 -> 保存
    const store = JSON.parse(localStorage.getItem(FORWARD_STORE_KEY) || '{}');
    store[forwardId] = {
        title: `${chatTitle} 的聊天记录`,
        msgs: fullMessages
    };
    try {
        localStorage.setItem(FORWARD_STORE_KEY, JSON.stringify(store));
    } catch (e) {
        alert("存储空间不足，无法保存转发详情");
        return;
    }

    // === 构造带 onclick 的 HTML ===
    // 注意：onclick="openHistoryDetail('${forwardId}')" 是关键
    const cardHtml = `
        <div class="msg-history-card" onclick="openHistoryDetail('${forwardId}'); event.stopPropagation();">
            <div class="history-card-title">${chatTitle} 的聊天记录</div>
            <div class="history-card-content">
                ${previewLines.join('<br>')}
            </div>
            <div class="history-card-footer">聊天记录 (${count}条)</div>
        </div>
    `;

    window.tempForwardData = {
        html: cardHtml,
        text: `[聊天记录] (包含${count}条消息)\n${aiText}`
    };
    
    openForwardModal();
}

// 5. 打开转发好友选择弹窗
function openForwardModal() {
    const modal = document.getElementById('forward-target-modal');
    const list = document.getElementById('forward-friend-list');
    list.innerHTML = '';
    
    // 渲染好友
    Object.keys(friendsData).forEach(id => {
        // if (id === currentChatId) return; // 也可以发给当前人，不限制
        
        const f = friendsData[id];
        const item = document.createElement('div');
        item.className = 'checklist-item';
        item.innerHTML = `
            <input type="radio" name="forward_target" value="${id}" style="margin-right:10px;">
            <img src="${f.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed='+id}" class="checklist-avatar">
            <span class="checklist-name">${f.remark || f.realName}</span>
        `;
        // 点击行选中
        item.onclick = function() {
            const radio = item.querySelector('input');
            if(radio) radio.checked = true;
        }
        list.appendChild(item);
    });
    
    modal.classList.add('active');
}

window.closeForwardModal = function() {
    document.getElementById('forward-target-modal').classList.remove('active');
}

// === [修改] 确认转发 ===
window.confirmForward = function() {
    const selected = document.querySelector('input[name="forward_target"]:checked');
    if (!selected) {
        alert("请选择一个转发对象");
        return;
    }
    
    const targetId = selected.value;
    const { html, text } = window.tempForwardData; // 获取刚才生成的 HTML 和 文本
    
    // 关闭所有弹窗和模式
    closeForwardModal();
    exitMultiSelectMode();
    
    // 封装发送逻辑
    const performSend = () => {
        // 1. 发送卡片气泡 (使用 rich-bubble 样式)
        // 注意：这里我们手动调用底层渲染，type 传空字符串，利用 rich-bubble 覆盖样式
        // 为了让 appendMessage 支持直接传 HTML，我们需要利用它内部的 rich-bubble 逻辑
        // 但 appendMessage 目前是通过 text.includes('[IMAGE]') 来判断。
        // 最简单的方法是直接调用 sendRichMessage (这是你在 apps.js 里定义的函数)
        
        // 在聊天界面显示卡片
        const chatMessages = document.getElementById('chatMessages');
        const row = document.createElement('div');
        row.className = 'chat-row sent';
        
        // 构造头像
        const avatar = document.createElement('img');
        avatar.className = 'chat-avatar-img';
        avatar.src = AVATAR_USER; 
        
        // 构造气泡
        const bubble = document.createElement('div');
        bubble.className = `message-bubble rich-bubble`; // 加上 rich-bubble 去掉默认背景
        bubble.innerHTML = html; // 插入卡片 HTML
        
        // 补全右键菜单所需数据
        row.setAttribute('data-msg-text', '[聊天记录]');
        row.setAttribute('data-msg-sender', 'ME');

        row.appendChild(bubble);
        row.appendChild(avatar);
        chatMessages.appendChild(row);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // 2. 触发 AI 回复 (发送纯文本给 AI)
        const aiPrompt = `[System: User forwarded a chat history to you.]\n${text}`;
        sendMessageToAI(aiPrompt);
    };

    // 如果选的是当前聊天，直接发
    if (targetId === currentChatId) {
        performSend();
    } else {
        // 如果是发给别人，跳转过去再发
        openChatDetail(targetId);
        setTimeout(performSend, 500);
    }
}
// 补全菜单显示逻辑
function showBubbleMenu(e, id, text, type, rowElement) {
    const menu = document.getElementById('wc-bubble-menu');
    const revokeBtn = document.getElementById('menu-btn-revoke');
    const regenBtn = document.getElementById('menu-btn-regen');
    
    if (document.getElementById('chatMessages').classList.contains('selection-mode')) return;

    currentMenuTarget = { id, text, type, element: rowElement };
    
    // sent 显示撤回；received 显示重回
    if (type === 'sent') {
        if (revokeBtn) revokeBtn.style.display = 'block';
        if (regenBtn) regenBtn.style.display = 'none';
    } else {
        if (revokeBtn) revokeBtn.style.display = 'none';
        if (regenBtn) regenBtn.style.display = 'block';
    }

    
    // 如果已经在多选模式，不显示菜单
    if (document.getElementById('chatMessages').classList.contains('selection-mode')) return;

    // 记录当前操作对象
    currentMenuTarget = { id, text, type, element: rowElement };
    
    // 只有自己发的(sent)才能撤回
    if (type === 'sent') {
        revokeBtn.style.display = 'block';
    } else {
        revokeBtn.style.display = 'none';
    }

    // 计算位置
    let clientX = e.clientX;
    let clientY = e.clientY;
    // 适配手机触摸
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    }

    // 定位菜单 (气泡上方)
    menu.style.left = clientX + 'px';
    menu.style.top = (clientY - 20) + 'px'; 
    
    // 显示
    menu.classList.add('show');
    
    // 点击其他地方关闭菜单
    const closeMenu = () => {
        menu.classList.remove('show');
        document.removeEventListener('click', closeMenu);
        document.removeEventListener('touchstart', closeMenu);
    };
    
    // 延迟绑定，防止点击气泡本身立刻触发关闭
    setTimeout(() => {
        document.addEventListener('click', closeMenu);
        document.addEventListener('touchstart', closeMenu);
    }, 100);
}
// === [新增] 多选删除逻辑 ===
window.executeMultiDelete = function() {
    const selectedCheckboxes = document.querySelectorAll('.wc-msg-checkbox.checked');
    
    if (selectedCheckboxes.length === 0) {
        alert("请至少选择一条消息");
        return;
    }

    if (confirm(`确定删除这 ${selectedCheckboxes.length} 条消息吗？`)) {
        selectedCheckboxes.forEach(cb => {
            // 找到对应的整行 chat-row
            const row = cb.closest('.chat-row');
            if (row) {
                // 动画效果
                row.style.opacity = '0';
                row.style.transform = 'translateX(-20px)';
                setTimeout(() => row.remove(), 300);
            }
        });
        
        // 退出多选模式
        exitMultiSelectMode();
        
        // 注意：这里仅删除了界面的 DOM 元素。
        // 如果需要同步删除 LocalStorage 里的历史记录，需要根据 msg-id 去遍历数据并删除，
        // 逻辑会比较复杂，这里暂只实现界面删除。
    }
}
// === [新增] 打开聊天记录详情 ===
window.openHistoryDetail = function(forwardId) {
    const modal = document.getElementById('history-detail-modal');
    const container = document.getElementById('history-detail-content');
    const titleEl = document.getElementById('history-detail-title');
    
    if (!modal || !container) return;

    // 1. 读取数据
    const store = JSON.parse(localStorage.getItem(FORWARD_STORE_KEY) || '{}');
    const record = store[forwardId];

    if (!record) {
        alert("记录已过期或不存在");
        return;
    }

    // 2. 填充标题
    if(titleEl) titleEl.innerText = record.title || "聊天记录";

    // 3. 填充列表
    container.innerHTML = ''; // 清空
    record.msgs.forEach(msg => {
        const item = document.createElement('div');
        item.className = 'history-detail-item';
        
        // 格式化时间 (可选)
        const dateStr = msg.time ? new Date(msg.time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';

        item.innerHTML = `
            <img src="${msg.avatar}" class="history-detail-avatar">
            <div class="history-detail-info">
                <div class="history-detail-name">
                    <span>${msg.sender}</span>
                    <span style="font-weight:400; color:#ccc;">${dateStr}</span>
                </div>
                <div class="history-detail-text">${msg.text}</div>
            </div>
        `;
        container.appendChild(item);
    });

    // 4. 显示弹窗
    modal.classList.add('show');
}

// 关闭详情
window.closeHistoryDetail = function() {
    const modal = document.getElementById('history-detail-modal');
    if (modal) modal.classList.remove('show');
}
/* =========================================
   [新增] 音乐播放器核心逻辑
   ========================================= */

const MUSIC_DATA_KEY = 'myCoolPhone_musicPlaylist';
let musicPlaylist = [];
let currentSongIndex = -1;
let isPlaying = false;
const audioEl = document.getElementById('global-audio-player');

// 1. 初始化：加载数据并恢复首页文字
document.addEventListener('DOMContentLoaded', () => {
    loadMusicData();
    restoreHomeMusicText();
    
    // 音频播放结束自动下一首
    if(audioEl) {
        audioEl.onended = () => playNextSong();
    }
});

// 加载数据
async function loadMusicData() {
    // 尝试从 IDB (大容量) 获取
    const data = await IDB.get(MUSIC_DATA_KEY);
    if (data && Array.isArray(data)) {
        musicPlaylist = data;
    } else {
        // 默认歌曲
        musicPlaylist = [
            { name: "Lover", artist: "Taylor Swift", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", type: "link" }
        ];
    }
    renderPlaylist();
}

async function saveMusicData() {
    await IDB.set(MUSIC_DATA_KEY, musicPlaylist);
}

// 2. 界面控制
window.openMusicPlayer = function() {
    document.getElementById('musicPlayerView').classList.add('show');
    renderPlaylist();
}
window.closeMusicPlayer = function() {
    document.getElementById('musicPlayerView').classList.remove('show');
}

// 3. 导入音乐
window.triggerImportMusic = function() {
    const choice = confirm("导入音乐：\n点击【确定】选择本地 MP3 文件\n点击【取消】输入网络链接");
    if(choice) {
        document.getElementById('music-file-input').click();
    } else {
        const url = prompt("请输入音频 URL (.mp3):");
        const name = prompt("请输入歌名:");
        if(url && name) {
            addSongToPlaylist(name, "Unknown", url, "link");
        }
    }
}

window.handleMusicFile = function(input) {
    const file = input.files[0];
    if(!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        // 将文件转为 Base64 存入 (注意：文件太大可能会卡，建议控制大小)
        addSongToPlaylist(file.name.replace(/\.[^/.]+$/, ""), "Local File", e.target.result, "file");
    };
    reader.readAsDataURL(file);
    input.value = '';
}

function addSongToPlaylist(name, artist, src, type) {
    musicPlaylist.push({ name, artist, src, type });
    saveMusicData();
    renderPlaylist();
    // 如果列表只有这一首，自动选中
    if(musicPlaylist.length === 1) playMusic(0);
}

// 4. 渲染列表
function renderPlaylist() {
    const container = document.getElementById('mp-playlist-container');
    if(!container) return;
    container.innerHTML = '';
    
    musicPlaylist.forEach((song, idx) => {
        const div = document.createElement('div');
        div.className = `mp-item ${idx === currentSongIndex ? 'active' : ''}`;
        div.innerHTML = `
            <div class="mp-item-info" onclick="playMusic(${idx})">
                <div style="font-size:14px; font-weight:600;">${song.name}</div>
                <div style="font-size:11px; color:#999;">${song.artist}</div>
            </div>
            <i class="fas fa-trash" style="color:#ddd; padding:10px;" onclick="deleteSong(${idx})"></i>
        `;
        container.appendChild(div);
    });
}

// 5. 播放控制核心
window.playMusic = function(index) {
    if(index < 0 || index >= musicPlaylist.length) return;
    
    currentSongIndex = index;
    const song = musicPlaylist[index];
    
    audioEl.src = song.src;
    audioEl.play();
    isPlaying = true;
    
    updatePlayerUI();
    updateHomeWidgetUI(true); // 让唱片转起来
    renderPlaylist(); // 更新高亮
}

window.toggleMusicPlay = function() {
    if(audioEl.paused) {
        if(audioEl.src) {
            audioEl.play();
            isPlaying = true;
        } else if (musicPlaylist.length > 0) {
            playMusic(0);
        }
    } else {
        audioEl.pause();
        isPlaying = false;
    }
    updatePlayerUI();
    updateHomeWidgetUI(isPlaying);
}

window.playNextSong = function() {
    let next = currentSongIndex + 1;
    if(next >= musicPlaylist.length) next = 0;
    playMusic(next);
}

window.playPrevSong = function() {
    let prev = currentSongIndex - 1;
    if(prev < 0) prev = musicPlaylist.length - 1;
    playMusic(prev);
}

window.deleteSong = function(index) {
    if(confirm("确定删除这首歌吗？")) {
        // 如果删的是当前正在放的，先停止
        if(index === currentSongIndex) {
            audioEl.pause();
            isPlaying = false;
            updateHomeWidgetUI(false);
            audioEl.src = '';
            currentSongIndex = -1;
        } else if (index < currentSongIndex) {
            currentSongIndex--;
        }
        
        musicPlaylist.splice(index, 1);
        saveMusicData();
        renderPlaylist();
    }
}

// 6. UI 同步更新
function updatePlayerUI() {
    const btn = document.getElementById('mp-play-btn');
    const song = musicPlaylist[currentSongIndex];
    
    if(isPlaying) {
        btn.className = 'fas fa-pause-circle mp-btn-lg';
        document.getElementById('musicPlayerView').classList.add('playing');
    } else {
        btn.className = 'fas fa-play-circle mp-btn-lg';
        document.getElementById('musicPlayerView').classList.remove('playing');
    }
    
    if(song) {
        document.getElementById('mp-title-display').innerText = song.name;
        document.getElementById('mp-artist-display').innerText = song.artist;
        
        // 同步更新首页文字
        const hTitle = document.getElementById('home-music-title');
        const hArtist = document.getElementById('home-music-artist');
        if(hTitle) hTitle.innerText = song.name;
        if(hArtist) hArtist.innerText = song.artist;
        saveHomeMusicText(); // 保存文字状态
    }
}

function updateHomeWidgetUI(playing) {
    const widget = document.getElementById('home-music-widget');
    if(widget) {
        if(playing) widget.classList.add('playing');
        else widget.classList.remove('playing');
    }
}

// 7. 首页文字编辑与储存
window.saveHomeMusicText = function() {
    const title = document.getElementById('home-music-title').innerText;
    const artist = document.getElementById('home-music-artist').innerText;
    
    const data = { title, artist };
    localStorage.setItem('myCoolPhone_homeMusicText', JSON.stringify(data));
}

function restoreHomeMusicText() {
    const data = JSON.parse(localStorage.getItem('myCoolPhone_homeMusicText') || '{}');
    if(data.title) document.getElementById('home-music-title').innerText = data.title;
    if(data.artist) document.getElementById('home-music-artist').innerText = data.artist;
}

/* =========================================
   [新增] 线下模式 (Offline/Tavern Mode) 逻辑
   ========================================= */

// 1. 打开/关闭
window.openOfflineMode = function() {
    if (!currentChatId) {
        alert("请先进入一个聊天窗口");
        return;
    }
    
    // 关闭聊天面板
    const panel = document.getElementById('chat-extra-panels');
    if(panel) panel.classList.remove('open');
    
    const modal = document.getElementById('offlineModeView');
    const friend = friendsData[currentChatId];
    
    // 设置头部信息
    const nameStr = friend.remark || friend.realName || 'AI';
    document.getElementById('offline-char-name').innerText = nameStr;
    
    // 设置背景图 (如果有)
    const avatar = friend.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.realName}`;
    document.getElementById('offline-bg-layer').style.backgroundImage = `url('${avatar}')`;
    
    // 渲染历史记录 (把气泡转换成小说流)
    renderOfflineHistory(currentChatId);
    
    modal.classList.add('show');
}


// 2. 辅助工具：插入快捷动作
window.insertOfflineAction = function(char) {
    const input = document.getElementById('offline-input');
    if(char === '*') {
        input.value += '*动作描述* ';
    } else if(char === '「') {
        input.value += '「说话」';
    }
    input.focus();
}

// 3. 渲染历史记录 (只渲染 offline 标记的消息，或者全部渲染但样式不同)
// 修改策略：为了完全隔离显示，我们只渲染 isOffline=true 的消息
async function renderOfflineHistory(chatId) {
    const container = document.getElementById('offline-log-container');
    container.innerHTML = ''; // 清空
    
    const history = await loadChatHistory(chatId); 
    
    // 如果没有历史，显示开场白
    if (history.length === 0 && friendsData[chatId]?.greeting) {
        appendOfflineEntry('ai', friendsData[chatId].greeting, friendsData[chatId].realName);
    }

    history.forEach(msg => {
        // 关键逻辑：只显示带有 isOffline 标记的消息，或者是用户发的消息(为了连贯性)
        // 但用户要求 "线下模式不需要显示线上内容"。
        // 所以我们只渲染 isOffline === true 的。
        if (msg.isOffline) {
            const role = msg.type === 'sent' ? 'user' : 'ai';
            const name = role === 'user' ? 'You' : (msg.senderName || friendsData[chatId].realName);
            appendOfflineEntry(role, msg.text, name, msg.id);
        }
    });
    
    // 滚到底部
    setTimeout(() => container.scrollTop = container.scrollHeight, 100);
}

// [重写版] 添加线下条目 (带修改/删除/收藏按钮)
function appendOfflineEntry(role, text, name, msgId) {
    const container = document.getElementById('offline-log-container');
    const div = document.createElement('div');
    div.className = `offline-entry ${role}`;
    // 如果没有传ID，生成一个临时的，方便操作DOM
    const safeId = msgId || ('temp_' + Date.now() + Math.random());
    div.setAttribute('data-msg-id', safeId); 

    // Markdown处理
    let formattedText = text
        .replace(/\*(.*?)\*/g, '<i>*$1*</i>')
        .replace(/「(.*?)」/g, '<b>「$1」</b>')
        .replace(/\n/g, '<br>');

    // 按钮栏 HTML
    const actionsHtml = `
        <div class="oe-actions">
            <!-- 重回/重试按钮 -->
            <div class="oe-btn" onclick="regenerateOfflineMessage('${safeId}')" title="重试/重回">
                <i class="fas fa-sync-alt"></i>
            </div>
            
            <div class="oe-btn" onclick="openModifyOffline('${safeId}')" title="修改">
                <i class="fas fa-pen"></i>
            </div>
            <div class="oe-btn delete" onclick="deleteOfflineMsgUI('${safeId}')" title="删除">
                <i class="fas fa-trash"></i>
            </div>
        </div>
    `;

    div.innerHTML = `
        <div class="oe-name">${name}</div>
        <div class="oe-text ${role==='ai'?'serif':''}">${formattedText}</div>
        ${actionsHtml}
    `;
    
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// [最终增强版] 线下模式发送逻辑 (支持分支选项 + 重回隐式处理)
window.sendOfflineMessage = async function(isRegen = false) {
    const input = document.getElementById('offline-input');
    let text = input.value.trim();
    
    // 如果是普通点击发送但没字
    if (!text && !isRegen) {
        text = "*静静地等待事情发展*"; 
    }
    
    const friend = friendsData[currentChatId];
    if (!friend) return;

    // 如果不是重回触发的，就正常上屏并保存用户记录
    if (!isRegen) {
        const userMsgId = 'off_u_' + Date.now();
        appendOfflineEntry('user', text, 'You', userMsgId);
        saveMessageToHistory(currentChatId, {
            text: text, type: 'sent', senderName: 'ME', isOffline: true, id: userMsgId
        });
    } else {
        // 如果是重回，text 里带的是给 AI 的隐式指令，不显示在屏幕上，也不存入历史
        console.log("执行时间线重置");
    }
    
    input.value = ''; // 清空输入框
    
    // 准备 API
    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    if (!settingsJSON) { appendOfflineEntry('ai', '[System] 请配置 API Key', 'System'); return; }
    const settings = JSON.parse(settingsJSON);

    const presetId = offlineConfig.activePresetId;
    const preset = tavernPresets.find(p => p.id === presetId) || tavernPresets[0];

    // 清理掉屏幕上旧的选项框
    const oldOpts = document.getElementById('vn-options-box');
    if (oldOpts) oldOpts.remove();

    // 显示 Loading
    const loadingId = 'loading-' + Date.now();
    const container = document.getElementById('offline-log-container');
    const loadDiv = document.createElement('div');
    loadDiv.id = loadingId;
    loadDiv.className = 'offline-entry ai';
    loadDiv.innerHTML = `<div class="oe-name">Writing...</div><div class="oe-text" style="color:#ccc;">...</div>`;
    container.appendChild(loadDiv);
    container.scrollTop = container.scrollHeight;

    // 构建 Prompt
    const history = await loadChatHistory(currentChatId);
    const historyContext = history.slice(-15).map(h => 
        `${h.type==='sent'?'User':friend.realName}: ${h.isOffline?h.text:'(Online Memory: '+h.text+')'}`
    ).join('\n');

    const limit = parseInt(offlineConfig.maxLength) || 200;
    
    let systemPrompt = `
    [IMPORTANT SYSTEM INSTRUCTION]
    Response Length Constraint: strictly aim for approximately ${limit} words.
    
    [🛑 SYSTEM: VISUAL FORMATTING RULES (HIGHEST PRIORITY)]
    1. **MANDATORY PARAGRAPHING**: Use double line breaks (\\n\\n) to separate Dialogue, Actions, and Narration. Max 3-4 lines per paragraph.
    2. **TYPOGRAPHY**: Wrap ALL actions/narration in *asterisks*. Wrap ALL spoken dialogue in 「brackets」 or "quotes".

       [🛑 CORE ROLEPLAY PROTOCOLS]
    1. **NO USER PLAY**: You represent [${friend.realName}]. NEVER describe the User's actions, thoughts, or speech.
    2. **PROACTIVE AGENT**: Drive the plot forward proactively. Do not overdo environmental or psychological descriptions. Keep dialogue moderate, and focus on actions and interactions that advance the story (环境、心理等描写不要过多，对话数量也要适中，多通过具体的动作和互动来主动推进剧情).

    [👤 CHARACTER DATA] Name: ${friend.realName} | Persona: ${friend.persona}
    ${friend.worldbook ? `[🌍 WORLD DATA] Setting: ${friend.worldbook}` : ''}
    ${preset.jailbreak || ''}
    
    [📦 REQUIRED OUTPUT FORMAT]
    Structure your reply as a novel segment. At the very END, append blocks based on user toggles:
    
    [DANMAKU_START]
    (Generate 5-8 funny netizen comments. STRICTLY PROHIBITED: No misogynistic or derogatory words towards women / 绝对禁止生成辱女类脏话)
    [DANMAKU_END]

    
    [STATUS_START]
    Action: (Current action)
    Location: (Current location)
    Weather: (Current weather)
    Murmur: (Character's inner thought)
    Secret: (Hidden feeling/secret)
    Kaomoji: (Face emoji)
    [STATUS_END]
    `;

    // ★ 核心注入：如果开启了选项开关，命令 AI 生成【用户】的选项 ★
    if (isOfflineOptionsOn) {
        systemPrompt += `
    [OPTIONS_INSTRUCTION]
    Because the user has enabled the "Options" feature, you MUST generate 3 distinct actions **that the USER (the player) can perform next.**
    - These are the PLAYER'S choices.
    - Write them from the USER'S perspective (e.g., "Gently hold her hand", "Remain silent and observe", "Turn around and leave").
    - CRITICAL: Describe ONLY the action itself. DO NOT describe the outcome or the AI character's reaction to the action.
    - Format them exactly as follows at the very end of your response:
    [OPTIONS_START]
    1. (Action 1 for the user)
    2. (Action 2 for the user)
    3. (Action 3 for the user)
    [OPTIONS_END]
        `;
    }

    try {
        let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
        const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
        
        const payload = { 
            model: settings.model, 
            messages: [ 
                { role: "system", content: systemPrompt },
                { role: "user", content: `[History]:\n${historyContext}\n\n[User Input]: ${text}` }
            ], 
            temperature: parseFloat(settings.temperature || 0.8),
            max_tokens: Math.max(limit * 3 + 600, 1500) 
        };

        const sendBtn = document.querySelector('.offline-send-btn');
        if(sendBtn) sendBtn.classList.add('sending');

        const res = await fetch(apiUrl, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` }, 
            body: JSON.stringify(payload) 
        });
        
        document.getElementById(loadingId).remove();
        if(sendBtn) sendBtn.classList.remove('sending');

        if (!res.ok) throw new Error('API Error');
        const data = await res.json();
        let rawReply = data.choices[0].message.content;
                    // === [全新拦截] 解析 AI 对亲密付的自主决定 ===
            let intimateDecision = null;
            if (rawReply.includes('[INTIMATE_ACCEPT]')) {
                intimateDecision = 'accepted';
                rawReply = rawReply.replace('[INTIMATE_ACCEPT]', '').trim();
            } else if (rawReply.includes('[INTIMATE_REJECT]')) {
                intimateDecision = 'rejected';
                rawReply = rawReply.replace('[INTIMATE_REJECT]', '').trim();
            }

            if (intimateDecision) {
                // 1. 去历史记录里，把那张“等待中”的卡片改成“已受领/已拒绝”
                let history = await loadChatHistory(currentChatId);
                for (let i = history.length - 1; i >= 0; i--) {
                    if (history[i].text.startsWith('[INTIMATE_ME2AI') && history[i].text.includes(':pending:')) {
                        const oldText = history[i].text;
                        history[i].text = oldText.replace(':pending:', `:${intimateDecision}:`);
                        
                         // 2. 如果 AI 同意了，真正扣除并绑定钱包数据
                        if (intimateDecision === 'accepted') {
                            const parts = oldText.replace('[', '').replace(']', '').split(':');
                            const limitStr = parts[1];
                            let limit = limitStr === '无限' ? '无限' : parseFloat(limitStr);
                            if (!payData.intimatePay) payData.intimatePay = {};
                            payData.intimatePay[currentChatId] = { limit: limit, spent: 0, month: new Date().getMonth() };
                            savePayData();
                            
                            // 【新增：对方接受时的窄弹窗提醒】
                            setTimeout(() => {
                                showToast(`<i class="fas fa-heart" style="color:#ff7e67;"></i> 对方已接受你的亲密付`);
                            }, 500);
                        }

                        
                        await IDB.set(scopedChatKey(currentChatId), history);
                        
                        // 3. 悄无声息地刷新聊天界面，让卡片瞬间变化！
                        const chatMessages = document.getElementById('chatMessages');
                        chatMessages.innerHTML = '';
                        history.forEach(msg => {
                            if (!msg.isOffline) {
                                let displayAvatar = msg.customAvatar;
                                if (msg.type === 'received' && friendsData[currentChatId]?.avatar) displayAvatar = friendsData[currentChatId].avatar;
                                appendMessage(msg.text, msg.type, displayAvatar, msg.senderName, msg.translation);
                            }
                        });
                        break;
                    }
                }
            }


        // 1. 提取选项 [OPTIONS_START]...[OPTIONS_END]
        let extractedOptions = [];
        const optRegex = /\[OPTIONS_START\]([\s\S]*?)\[OPTIONS_END\]/i;
        const optMatch = rawReply.match(optRegex);
        if (optMatch) {
            const optsText = optMatch[1];
            // 按行分割，提取有数字序号或写了选项的行
            extractedOptions = optsText.split('\n')
                .map(s => s.trim())
                .filter(s => s.match(/^\d+\./) || s.toLowerCase().startsWith('option'));
            // 从正文中移除该区块
            rawReply = rawReply.replace(optRegex, '').trim();
        }

        // 2. 提取状态并更新卡片
        const statusRegStr = preset.regex || '\\[STATUS_START\\]([\\s\\S]*?)\\[STATUS_END\\]';
        const statusRegex = new RegExp(statusRegStr, 'i');
        const statusMatch = rawReply.match(statusRegex);
        if (statusMatch) {
            updateMindStateFromText(statusMatch[1], currentChatId); 
            rawReply = rawReply.replace(statusRegex, '').trim();
        }

        // 3. 提取弹幕并发射
        const danmakuRegex = /\[DANMAKU_START\]([\s\S]*?)\[DANMAKU_END\]/i;
        const danmakuMatch = rawReply.match(danmakuRegex);
        if (danmakuMatch) {
            const dText = danmakuMatch[1];
            const dList = dText.split('\n').map(s=>s.trim()).filter(s=>s);
            if (isDanmakuOn && dList.length > 0) {
    danmakuPool = dList;
    startDanmakuBatch();
}

            rawReply = rawReply.replace(danmakuRegex, '').trim();
        }

        // 4. 上屏干净的文本
        const aiMsgId = 'off_ai_' + Date.now();
        appendOfflineEntry('ai', rawReply, friend.realName, aiMsgId);

        // 5. 保存历史
        saveMessageToHistory(currentChatId, {
            text: rawReply, type: 'received', senderName: friend.realName,
            customAvatar: friend.avatar, isOffline: true, id: aiMsgId
        });

        // 6. 如果提取到了选项，在界面底部渲染橙光选择按钮
        if (isOfflineOptionsOn && extractedOptions.length > 0) {
            const optDiv = document.createElement('div');
            optDiv.id = 'vn-options-box';
            optDiv.className = 'vn-options-container';
            
            extractedOptions.forEach(opt => {
                const btn = document.createElement('div');
                btn.className = 'vn-option-btn';
                btn.innerText = opt;
                btn.onclick = () => selectOfflineOption(opt);
                optDiv.appendChild(btn);
            });
            
            container.appendChild(optDiv);
            setTimeout(() => container.scrollTop = container.scrollHeight, 150);
        }

    } catch (e) {
        document.getElementById(loadingId)?.remove();
        const sendBtn = document.querySelector('.offline-send-btn');
        if(sendBtn) sendBtn.classList.remove('sending');
        appendOfflineEntry('ai', `Error: ${e.message}`, 'System');
    }
}

// [辅助函数] 从文本更新状态
function updateMindStateFromText(statusBlock, charId) {
    const getVal = (key) => {
        const reg = new RegExp(key + "[:：]\\s*(.*)", "i");
        const m = statusBlock.match(reg);
        return m ? m[1].trim() : null;
    };
    
    if (friendsData[charId]) {
        friendsData[charId].mindState = {
            action: getVal("Action") || "...",
            location: getVal("Location") || "...",
            weather: getVal("Weather") || "...",
            murmur: getVal("Murmur") || "...",
            hiddenThought: getVal("Secret") || "...",
            kaomoji: getVal("Kaomoji") || "( ˙W˙ )"
        };
        saveFriendsData();
    }
}

// 6. 数据管理辅助函数
async function deleteOfflineMessage(msgId) {
    let history = await loadChatHistory(currentChatId);
    if (history) {
        history = history.filter(m => m.id !== msgId);
        await IDB.set(scopedChatKey(currentChatId), history);
    }
}

async function updateOfflineMessage(msgId, newText) {
    let history = await loadChatHistory(currentChatId);
    if (history) {
        const msg = history.find(m => m.id === msgId);
        if(msg) {
            msg.text = newText;
            await IDB.set(scopedChatKey(currentChatId), history);
        }
    }
}
/* =========================================
   [新增] 线下模式操作逻辑 (Modify/Delete/Settings)
   ========================================= */

// 1. 删除消息
window.deleteOfflineMsgUI = async function(msgId) {
    if(!confirm("确定删除这条记录吗？")) return;
    
    // 界面删除
    const el = document.querySelector(`.offline-entry[data-msg-id="${msgId}"]`);
    if(el) el.remove();
    
    // 数据删除
    await deleteOfflineMessage(msgId); 
}

// 2. 修改消息 (打开独立页面)
window.openModifyOffline = function(msgId) {
    const el = document.querySelector(`.offline-entry[data-msg-id="${msgId}"]`);
    if(!el) return;
    
    // 获取纯文本
    let rawText = el.querySelector('.oe-text').innerText; 
    
    currentModifyingMsgId = msgId;
    document.getElementById('modify-text-input').value = rawText;
    document.getElementById('offline-modify-page').classList.add('active');
}

window.closeModifyPage = function() {
    document.getElementById('offline-modify-page').classList.remove('active');
    currentModifyingMsgId = null;
}

window.confirmModifyOffline = async function() {
    if(!currentModifyingMsgId) return;
    
    const newText = document.getElementById('modify-text-input').value;
    
    // UI 更新
    const el = document.querySelector(`.offline-entry[data-msg-id="${currentModifyingMsgId}"]`);
    if(el) {
        let formattedText = newText
            .replace(/\*(.*?)\*/g, '<i>*$1*</i>')
            .replace(/「(.*?)」/g, '<b>「$1」</b>')
            .replace(/\n/g, '<br>');
        el.querySelector('.oe-text').innerHTML = formattedText;
    }
    
    // 数据更新
    await updateOfflineMessage(currentModifyingMsgId, newText);
    
    closeModifyPage();
}

// 3. 收藏
window.collectOffline = function(msgId) {
    alert("已加入收藏 (Demo)");
}

// 4. 线下设置面板逻辑
window.toggleOfflineSettings = function() {
    const panel = document.getElementById('offline-settings-panel');
    const isActive = panel.classList.contains('active');
    
    if(!isActive) {
        // 刷新预设下拉列表
        const select = document.getElementById('offline-active-preset');
        select.innerHTML = '';
        tavernPresets.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.text = p.name;
            select.appendChild(opt);
        });
        select.value = offlineConfig.activePresetId;
        document.getElementById('offline-max-len').value = offlineConfig.maxLength;
        document.getElementById('off-len-val').innerText = offlineConfig.maxLength;
        
        panel.classList.add('active');
    } else {
        panel.classList.remove('active');
    }
}


/* =========================================
   [新增] 预设 (Presets) APP 逻辑
   ========================================= */
let currentEditingPresetId = null;

window.openPresetsApp = function() {
    document.getElementById('presetsApp').classList.add('open');
    renderPresetsList();
}
window.closePresetsApp = function() {
    document.getElementById('presetsApp').classList.remove('open');
}

function renderPresetsList() {
    const container = document.getElementById('presets-list-container');
    container.innerHTML = '';
    
    tavernPresets.forEach(p => {
        const div = document.createElement('div');
        div.className = `preset-card ${p.id === offlineConfig.activePresetId ? 'active' : ''}`;
        div.onclick = () => openPresetEditor(p.id);
        div.innerHTML = `
            <div class="preset-info">
                <h4>${p.name}</h4>
                <p>${p.systemPrompt.substring(0, 30)}...</p>
            </div>
            ${p.id === offlineConfig.activePresetId ? '<i class="fas fa-check-circle" style="color:#2b2b2b;"></i>' : '<i class="fas fa-chevron-right" style="color:#ddd; font-size:12px;"></i>'}
        `;
        container.appendChild(div);
    });
}

window.createNewPreset = function() {
    openPresetEditor(null);
}

window.openPresetEditor = function(id) {
    currentEditingPresetId = id;
    const editor = document.getElementById('preset-editor');
    
    if (id) {
        const p = tavernPresets.find(x => x.id === id);
        document.getElementById('pe-name').value = p.name;
        document.getElementById('pe-sys-prompt').value = p.systemPrompt;
        document.getElementById('pe-regex').value = p.regex;
        document.getElementById('pe-jailbreak').value = p.jailbreak || '';
    } else {
        // 新建
        document.getElementById('pe-name').value = 'New Preset';
        document.getElementById('pe-sys-prompt').value = '';
        document.getElementById('pe-regex').value = '\\[STATUS_START\\]([\\s\\S]*?)\\[STATUS_END\\]';
        document.getElementById('pe-jailbreak').value = '';
    }
    
    editor.classList.add('show');
}

window.closePresetEditor = function() {
    document.getElementById('preset-editor').classList.remove('show');
}

window.savePresetEditor = function() {
    const name = document.getElementById('pe-name').value;
    const sys = document.getElementById('pe-sys-prompt').value;
    const reg = document.getElementById('pe-regex').value;
    const jail = document.getElementById('pe-jailbreak').value;
    
    if(!name) return alert('Name required');

    if (currentEditingPresetId) {
        const p = tavernPresets.find(x => x.id === currentEditingPresetId);
        p.name = name; p.systemPrompt = sys; p.regex = reg; p.jailbreak = jail;
    } else {
        const newP = {
            id: 'pre_' + Date.now(),
            name: name,
            systemPrompt: sys,
            regex: reg,
            jailbreak: jail
        };
        tavernPresets.push(newP);
    }
    
    localStorage.setItem(PRESETS_DATA_KEY, JSON.stringify(tavernPresets));
    renderPresetsList();
    closePresetEditor();
}

window.deleteCurrentPreset = function() {
    if(!currentEditingPresetId) return;
    if(confirm('Delete this preset?')) {
        tavernPresets = tavernPresets.filter(p => p.id !== currentEditingPresetId);
        localStorage.setItem(PRESETS_DATA_KEY, JSON.stringify(tavernPresets));
        renderPresetsList();
        closePresetEditor();
    }
}
// 在 saveOfflineConfig 中保存背景和CSS
window.saveOfflineConfig = function() {
    offlineConfig.activePresetId = document.getElementById('offline-active-preset').value;
    offlineConfig.maxLength = document.getElementById('offline-max-len').value;
    
    // 新增：保存背景和CSS
    offlineConfig.bgImage = document.getElementById('offline-bg-input').value;
    offlineConfig.customCSS = document.getElementById('offline-custom-css').value;
    
    localStorage.setItem(OFFLINE_CONFIG_KEY, JSON.stringify(offlineConfig));
    
    // 实时应用
    applyOfflineVisuals();
}

// 新增：应用视觉效果函数
function applyOfflineVisuals() {
    // 1. 背景图
    const bgLayer = document.getElementById('offline-bg-layer');
    if (offlineConfig.bgImage) {
        bgLayer.style.backgroundImage = `url('${offlineConfig.bgImage}')`;
        bgLayer.style.opacity = '1'; // 确保不透明
        bgLayer.style.filter = 'none'; // 去掉默认的模糊（可选）
    } else {
        // 如果没设，恢复默认模糊头像逻辑（需要重新获取当前好友头像，这里简化处理）
        bgLayer.style.backgroundImage = 'none';
    }

    // 2. CSS
    let styleTag = document.getElementById('offline-dynamic-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'offline-dynamic-style';
        document.head.appendChild(styleTag);
    }
    styleTag.innerHTML = offlineConfig.customCSS || '';
}

// 修改 toggleOfflineSettings 以填充新数据
const originalToggleOffline = window.toggleOfflineSettings;
window.toggleOfflineSettings = function() {
    // 先调用原逻辑显示面板
    originalToggleOffline();
    
    const panel = document.getElementById('offline-settings-panel');
    if(panel.classList.contains('active')) {
        // 填充新字段
        document.getElementById('offline-bg-input').value = offlineConfig.bgImage || '';
        document.getElementById('offline-custom-css').value = offlineConfig.customCSS || '';
    }
}

// 在 openOfflineMode 打开时也应用一下视觉
const originalOpenOffline = window.openOfflineMode;
window.openOfflineMode = function() {
    originalOpenOffline();
    applyOfflineVisuals();
}
// === 预设导入导出 ===
window.exportPresets = function() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tavernPresets, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = "my_presets_" + Date.now() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
}

window.triggerImportPresets = function() {
    document.getElementById('preset-import-file').click();
}

window.handleImportPresets = function(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const json = JSON.parse(e.target.result);
            if (Array.isArray(json)) {
                // 合并或覆盖
                if(confirm("导入将追加到现有预设，点击【取消】则清空旧预设只保留导入的。")) {
                    tavernPresets = [...tavernPresets, ...json];
                } else {
                    tavernPresets = json;
                }
                localStorage.setItem(PRESETS_DATA_KEY, JSON.stringify(tavernPresets));
                renderPresetsList();
                alert("导入成功！");
            } else {
                alert("文件格式错误，应为预设数组。");
            }
        } catch (err) {
            alert("解析失败: " + err.message);
        }
        input.value = '';
    };
    reader.readAsText(file);
}

// === 正则脚本编辑器逻辑 ===

// 渲染脚本列表
function renderRegexList(scripts) {
    const container = document.getElementById('pe-regex-container');
    container.innerHTML = '';
    
    (scripts || []).forEach((script, index) => {
        const div = document.createElement('div');
        div.className = 'regex-script-item';
        div.innerHTML = `
            <div class="regex-row">
                <span style="font-size:10px; color:#999; width:20px;">/${index+1}</span>
                <input type="text" class="regex-input r-pattern" placeholder="Regex Pattern" value="${script.regex || ''}">
                <input type="text" class="regex-flags r-flags" placeholder="g" value="${script.flags || 'g'}">
                <i class="fas fa-trash btn-del-regex" onclick="this.closest('.regex-script-item').remove()"></i>
            </div>
            <div class="regex-row">
                <span style="font-size:10px; color:#999; width:20px;">-></span>
                <input type="text" class="regex-input r-replace" placeholder="Replacement" value="${script.replace || ''}">
            </div>
        `;
        container.appendChild(div);
    });
}

// 添加新脚本空行
window.addRegexScriptItem = function() {
    const container = document.getElementById('pe-regex-container');
    const div = document.createElement('div');
    div.className = 'regex-script-item';
    div.innerHTML = `
        <div class="regex-row">
            <span style="font-size:10px; color:#999; width:20px;">NEW</span>
            <input type="text" class="regex-input r-pattern" placeholder="Pattern (e.g. \\(.*?\\))">
            <input type="text" class="regex-flags r-flags" placeholder="g" value="g">
            <i class="fas fa-trash btn-del-regex" onclick="this.closest('.regex-script-item').remove()"></i>
        </div>
        <div class="regex-row">
            <span style="font-size:10px; color:#999; width:20px;">-></span>
            <input type="text" class="regex-input r-replace" placeholder="Replacement (empty to delete)">
        </div>
    `;
    container.appendChild(div);
}

// 修改 openPresetEditor 以支持正则列表渲染
const originalOpenPreset = window.openPresetEditor;
window.openPresetEditor = function(id) {
    originalOpenPreset(id);
    
    // 获取当前预设
    let p = tavernPresets.find(x => x.id === id);
    if (!id) p = { regexScripts: [] }; // 新建的情况
    
    // 渲染正则列表
    renderRegexList(p.regexScripts || []);
}

// 修改 savePresetEditor 以保存正则列表
const originalSavePreset = window.savePresetEditor;
window.savePresetEditor = function() {
    // 1. 收集正则脚本数据
    const scriptEls = document.querySelectorAll('.regex-script-item');
    const scripts = [];
    scriptEls.forEach(el => {
        const regex = el.querySelector('.r-pattern').value;
        const flags = el.querySelector('.r-flags').value;
        const replace = el.querySelector('.r-replace').value;
        if (regex) {
            scripts.push({ regex, flags, replace });
        }
    });

    // 2. 劫持保存逻辑：先保存基础信息（这里稍微麻烦，因为原函数不方便劫持中间变量）
    // 为了简单，我们直接重写 savePresetEditor 的核心部分，或者在原函数执行后更新
    // 最好的办法是完全替换原来的 savePresetEditor
    
    const name = document.getElementById('pe-name').value;
    const sys = document.getElementById('pe-sys-prompt').value;
    const jail = document.getElementById('pe-jailbreak').value;
    
    if(!name) return alert('Name required');

    if (currentEditingPresetId) {
        const p = tavernPresets.find(x => x.id === currentEditingPresetId);
        p.name = name; p.systemPrompt = sys; p.jailbreak = jail;
        p.regexScripts = scripts; // 保存脚本
    } else {
        const newP = {
            id: 'pre_' + Date.now(),
            name: name,
            systemPrompt: sys,
            jailbreak: jail,
            regexScripts: scripts // 保存脚本
        };
        tavernPresets.push(newP);
    }
    
    localStorage.setItem(PRESETS_DATA_KEY, JSON.stringify(tavernPresets));
    renderPresetsList();
    closePresetEditor();
}

// =========================================
// [新增] 线下模式：重回与动画逻辑补丁
// =========================================

// 1. 打开重回确认弹窗
window.regenerateOfflineMessage = function(msgId) {
    pendingRegenMsgId = msgId; // 记录要重回哪条消息
    document.getElementById('offline-regen-modal').classList.add('active');
}

// 2. 关闭弹窗
window.closeRegenModal = function() {
    document.getElementById('offline-regen-modal').classList.remove('active');
    pendingRegenMsgId = null;
}

// 3. 确定重回 (完美修复版)
window.confirmRegenAction = async function() {
    if (!pendingRegenMsgId) return;

    // 关键修复：先缓存，再关闭弹窗
    const msgId = pendingRegenMsgId;
    document.getElementById('offline-regen-modal').classList.remove('active');
    pendingRegenMsgId = null;

    const targetEl = document.querySelector(`.offline-entry[data-msg-id="${msgId}"]`);

    // A. 删除界面上的目标消息及其后续
    if (targetEl) {
        let nextSibling = targetEl.nextElementSibling;
        while (nextSibling) {
            const next = nextSibling;
            nextSibling = nextSibling.nextElementSibling;
            next.remove();
        }
        targetEl.remove();

        const oldOpts = document.getElementById('vn-options-box');
        if (oldOpts) oldOpts.remove();
    }

    // B. 截断数据库历史
    let history = await loadChatHistory(currentChatId);
    if (history && history.length > 0) {
        const index = history.findIndex(m => m.id === msgId);
        if (index !== -1) {
            history = history.slice(0, index);
            await IDB.set(scopedChatKey(currentChatId), history);
            triggerOfflineRetry();
        }
    }
};



// 4. 重回专用续写逻辑 (重写版)
async function triggerOfflineRetry() {
    const sendBtn = document.querySelector('.offline-send-btn');
    const friend = friendsData[currentChatId];
    if (!friend) return;

    if(sendBtn) sendBtn.classList.add('sending');

    // 显示一个特殊的 Loading 提示
    const loadingId = 'loading-regen-' + Date.now();
    const container = document.getElementById('offline-log-container');
    const loadDiv = document.createElement('div');
    loadDiv.id = loadingId;
    loadDiv.className = 'offline-entry ai';
    loadDiv.innerHTML = `<div class="oe-name">Recalculating Timeline...</div><div class="oe-text" style="color:#ccc;">...</div>`;
    container.appendChild(loadDiv);
    container.scrollTop = container.scrollHeight;
    
    // 直接调用发送函数，并传入一个特殊的指令，告诉AI这是重置
    const regenInstruction = "[SYSTEM COMMAND: The user has chosen to regenerate the story from this point. Please provide a different, alternative continuation based on the history provided. Do not mention that you are regenerating.]";
    document.getElementById('offline-input').value = regenInstruction;
    
    // 调用发送函数，并标记为“重置请求”（isRegen=true），这样它就不会在屏幕上显示我们的指令
    sendOfflineMessage(true);

    // 清理掉临时的 loading，因为 sendOfflineMessage 会自己创建
    loadDiv.remove();
}

/* =========================================
   [新增] 线下模式剧情选项分支系统 (VN Options)
   ========================================= */

let isOfflineOptionsOn = false;

window.toggleOfflineOptions = function() {
    isOfflineOptionsOn = !isOfflineOptionsOn;
    const btn = document.getElementById('offline-options-btn');
    if (isOfflineOptionsOn) {
        btn.classList.add('active');
        btn.innerText = "选项分支: ON";
    } else {
        btn.classList.remove('active');
        btn.innerText = "选项分支: OFF";
        // 关掉的话顺便清除当前界面上残留的选项框
        const box = document.getElementById('vn-options-box');
        if (box) box.remove();
    }
}

// 点击选项后，将选项文字填充到输入框并自动发送
window.selectOfflineOption = function(optionText) {
    const input = document.getElementById('offline-input');
    // 去掉前缀序号，例如把 "1. 偷偷牵手" 变成 "*偷偷牵手*"
    const cleanText = optionText.replace(/^\d+\.\s*/, '').replace(/^Option \d+:\s*/i, '');
    
    // 加上星号代表动作
    input.value = `*${cleanText}*`; 
    
    // 移除选项容器
    const box = document.getElementById('vn-options-box');
    if (box) box.remove();
    
    // 自动发送
    sendOfflineMessage();
}
async function performOnlineRegen(rowElement) {
    if (!rowElement || !currentChatId) return;
    if (!confirm('重回将删除此条及后续消息，并重新生成回复。继续？')) return;

    // 删除当前行及后续DOM
    let node = rowElement;
    while (node) {
        const next = node.nextElementSibling;
        node.remove();
        node = next;
    }

    // 根据当前DOM重建历史
    await rebuildHistoryFromChatDom(currentChatId);

    // 重新触发AI回复
    await triggerAIReplyForPendingContext();
}

async function rebuildHistoryFromChatDom(chatId) {
    const rows = Array.from(document.querySelectorAll('#chatMessages .chat-row'));
    const rebuilt = rows.map(r => {
        const type = r.classList.contains('sent') ? 'sent' : 'received';
        const text = r.getAttribute('data-msg-text') ||
                     r.querySelector('.bubble-content-main')?.innerText || '';
        const translation = r.querySelector('.bubble-translation')?.innerText || null;
        const senderName = r.getAttribute('data-msg-sender') || (type === 'sent' ? 'ME' : currentChatId);
        const customAvatar = type === 'received' ? (r.querySelector('.chat-avatar-img')?.src || '') : '';

        return {
            text,
            type,
            senderName,
            customAvatar,
            translation,
            timestamp: Date.now()
        };
    });

    await IDB.set('chat_history_' + chatId, rebuilt);
}

async function triggerAIReplyForPendingContext() {
    const history = await loadChatHistory(currentChatId);
    if (!history || history.length === 0) return;

    let contextMessages = [];
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].type === 'received') break;
        if (history[i].type === 'sent') contextMessages.unshift(history[i].text);
    }

    if (contextMessages.length === 0) {
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].type === 'sent') {
                contextMessages = [history[i].text];
                break;
            }
        }
    }

    if (contextMessages.length > 0) {
        sendMessageToAI(contextMessages.join('\n'));
    }
}
/* =========================================
   [重构] 语音交互逻辑 (弹窗控制与气泡渲染)
   ========================================= */

// 辅助方法：给单独创建的气泡绑定菜单和复选框
function attachBubbleMenuToCustomRow(bubble, row, uniqueId, text, type) {
    // 添加多选框
    const checkboxWrap = document.createElement('div');
    checkboxWrap.className = 'chat-row-checkbox';
    checkboxWrap.innerHTML = `<div class="wc-msg-checkbox" onclick="toggleMsgSelection(this)"></div>`;
    row.insertBefore(checkboxWrap, row.firstChild);

    // 绑定事件 (右键/长按菜单)
    bubble.oncontextmenu = function(e) {
        e.preventDefault();
        showBubbleMenu(e, uniqueId, text, type, row);
        return false;
    };
    let pressTimer;
    bubble.addEventListener('touchstart', (e) => {
        pressTimer = setTimeout(() => { showBubbleMenu(e, uniqueId, text, type, row); }, 600); 
    });
    bubble.addEventListener('touchend', () => clearTimeout(pressTimer));
    bubble.addEventListener('touchmove', () => clearTimeout(pressTimer));
}

// 1. 渲染【伪语音】气泡 (打字转语音外观)
function appendTypedVoiceBubble(text) {
    const chatMessages = document.getElementById('chatMessages');
    const uniqueId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const row = document.createElement('div');
    row.className = 'chat-row sent';
    row.setAttribute('data-msg-text', text);
    row.setAttribute('data-msg-sender', 'ME');
    row.setAttribute('data-msg-id', uniqueId);

    const avatar = document.createElement('img');
    avatar.className = 'chat-avatar-img';
    avatar.src = AVATAR_USER;

    const bubble = document.createElement('div');
    // 【关键】使用标准的 message-bubble sent，它就会有黑底白字和圆角！
    bubble.className = 'message-bubble sent'; 
    const sec = Math.max(1, Math.min(59, Math.ceil(text.length / 4)));
    
    // 气泡内部内容：语音条 + 转文字
    bubble.innerHTML = `
      <div class="msg-voice-bar" onclick="this.nextElementSibling.classList.toggle('show')">
        <div class="msg-voice-duration">${sec}"</div>
        <i class="fas fa-rss msg-voice-icon" style="transform: rotate(45deg);"></i>
      </div>
      <div class="msg-voice-transcript show">${text.replace(/\n/g,'<br>')}</div>
    `;

    attachBubbleMenuToCustomRow(bubble, row, uniqueId, text, 'sent');

    row.appendChild(bubble);
    row.appendChild(avatar);
    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 2. 渲染【真语音】气泡 (长按录音)
function appendRealVoiceBubble(blob, sec) {
    const chatMessages = document.getElementById('chatMessages');
    const url = URL.createObjectURL(blob);
    const uniqueId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    const row = document.createElement('div');
    row.className = 'chat-row sent';
    row.setAttribute('data-msg-text', '[语音]');
    row.setAttribute('data-msg-sender', 'ME');
    row.setAttribute('data-msg-id', uniqueId);

    const avatar = document.createElement('img');
    avatar.className = 'chat-avatar-img';
    avatar.src = AVATAR_USER;

    const bubble = document.createElement('div');
    // 【关键】依然使用标准的 message-bubble sent
    bubble.className = 'message-bubble sent'; 
    bubble.innerHTML = `
      <div class="msg-voice-bar" onclick="this.querySelector('audio').play()">
        <div class="msg-voice-duration">${sec}"</div>
        <i class="fas fa-rss msg-voice-icon" style="transform: rotate(45deg);"></i>
        <audio src="${url}" preload="metadata" style="display:none;"></audio>
      </div>
      <div class="msg-voice-transcript show">识别中...</div>
    `;

    attachBubbleMenuToCustomRow(bubble, row, '[语音]', 'sent');

    row.appendChild(bubble);
    row.appendChild(avatar);
    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 3. 弹窗控制逻辑
window.openVoiceActionModal = function() {
    document.getElementById('voice-action-modal').classList.add('active');
    document.getElementById('fake-voice-input').value = '';
    switchVoiceTab('fake');
}

window.closeVoiceActionModal = function() {
    document.getElementById('voice-action-modal').classList.remove('active');
}

window.switchVoiceTab = function(tab) {
    document.getElementById('tab-btn-fake-voice').classList.remove('active');
    document.getElementById('tab-btn-real-voice').classList.remove('active');
    document.getElementById('voice-panel-fake').style.display = 'none';
    document.getElementById('voice-panel-real').style.display = 'none';

    if (tab === 'fake') {
        document.getElementById('tab-btn-fake-voice').classList.add('active');
        document.getElementById('voice-panel-fake').style.display = 'block';
    } else {
        document.getElementById('tab-btn-real-voice').classList.add('active');
        document.getElementById('voice-panel-real').style.display = 'flex';
    }
}

// 4. 伪语音发送事件
// 4. 伪语音发送事件
window.sendFakeVoice = function() {
    const text = document.getElementById('fake-voice-input').value.trim();
    if (text) {
        appendTypedVoiceBubble(text);
        if (currentChatId) {
            // 【关键修改】：存入历史记录时，前面加上 [VOICE]
            saveMessageToHistory(currentChatId, { text: '[VOICE]' + text, type: 'sent', senderName: 'ME' });
            // 发给AI时还是发纯文本
            sendMessageToAI(text);
        }
    } else {
        // 不填文字时的无字假语音
        const seconds = Math.floor(Math.random() * 10 + 2);
        const uniqueId = 'msg_' + Date.now();
        const chatMessages = document.getElementById('chatMessages');
        const row = document.createElement('div');
        row.className = 'chat-row sent';
        row.setAttribute('data-msg-text', '[语音]');
        row.setAttribute('data-msg-sender', 'ME');
        row.setAttribute('data-msg-id', uniqueId);
        
        const avatar = document.createElement('img');
        avatar.className = 'chat-avatar-img';
        avatar.src = AVATAR_USER; 
        
        const bubble = document.createElement('div');
        bubble.className = `message-bubble sent`; 
        bubble.innerHTML = `
            <div class="msg-voice-bar" onclick="playVoiceAnim(this)">
                <div class="msg-voice-duration">${seconds}"</div>
                <i class="fas fa-rss msg-voice-icon" style="transform: rotate(45deg);"></i>
            </div>
        `;
        
        attachBubbleMenuToCustomRow(bubble, row, '[语音]', 'sent');
        row.appendChild(bubble);
        row.appendChild(avatar);
        chatMessages.appendChild(row);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        if (currentChatId) {
            // 【关键修改】：无字假语音也存入标签
            saveMessageToHistory(currentChatId, { text: '[VOICE]（语音消息）', type: 'sent', senderName: 'ME' });
        }
        sendMessageToAI(`[System: User sent a voice message. Reply with a text message, BUT imply that you listened to it.]`);
    }

    closeVoiceActionModal();
    document.getElementById('chat-extra-panels').classList.remove('open');
}


// 简单的播放假动画
window.playVoiceAnim = function(el) {
    const icon = el.querySelector('i');
    icon.style.opacity = 0.5;
    setTimeout(() => icon.style.opacity = 1, 300);
    setTimeout(() => icon.style.opacity = 0.5, 600);
    setTimeout(() => icon.style.opacity = 1, 900);
}

// 5. 真实录音核心逻辑 (已修改为浏览器原生免费语音识别)
let mediaRecorder = null;
let mediaChunks = [];
let mediaStream = null;
let pressStartAt = 0;

// 新增：用于原生语音识别的变量
let nativeRecognition = null;
let recognizedText = "";

// 在 DOM 加载后绑定长按事件 (弹窗内的麦克风)
document.addEventListener('DOMContentLoaded', () => {
    const holdBtn = document.getElementById('modalHoldToTalkBtn');
    if (holdBtn) {
        holdBtn.addEventListener('pointerdown', startHoldRecord);
        holdBtn.addEventListener('pointerup', stopHoldRecord);
        holdBtn.addEventListener('pointerleave', stopHoldRecord);
    }
});

async function startHoldRecord() {
    const btn = document.getElementById('modalHoldToTalkBtn');
    if (!btn) return;

    recognizedText = ""; // 每次录音前清空文本

    try {
        // 1. 初始化原始的录音器（仅用于生成 UI 上的可播放语音条）
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(mediaStream);
        mediaChunks = [];
        pressStartAt = Date.now();

        mediaRecorder.ondataavailable = e => mediaChunks.push(e.data);
        mediaRecorder.start();
        
        // 2. 初始化浏览器原生语音识别 (免费且无需 API)
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            nativeRecognition = new SpeechRecognition();
            nativeRecognition.lang = 'zh-CN'; // 设置识别语言为中文
            nativeRecognition.continuous = true; // 持续识别
            nativeRecognition.interimResults = true; // 允许返回临时结果

            nativeRecognition.onresult = (event) => {
                let finalTranscript = '';
                let interimTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }
                recognizedText = finalTranscript + interimTranscript;
                
                // 炫酷体验：实时在按钮上显示识别出的文字
                const span = btn.querySelector('span');
                if (span && recognizedText) {
                    span.innerText = recognizedText.length > 8 
                        ? recognizedText.substring(0, 8) + '...' 
                        : recognizedText;
                }
            };

            nativeRecognition.onerror = (e) => {
                console.warn("浏览器语音识别发生错误: ", e.error);
            };

            nativeRecognition.start();
        } else {
            console.warn("当前浏览器不支持原生语音识别 API");
        }

        // 更新按钮样式为录音中
        btn.classList.add('recording');
        btn.innerHTML = `<i class="fas fa-microphone-alt" style="font-size:28px;"></i><span>录音中...</span>`;
    } catch (e) {
        alert('麦克风权限失败或被拒绝：' + e.message);
    }
}

async function stopHoldRecord() {
    const btn = document.getElementById('modalHoldToTalkBtn');
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return; // 防止重复触发
    
    // 停止原生语音识别
    if (nativeRecognition) {
        try { nativeRecognition.stop(); } catch(e) {}
    }

    if (btn) {
        btn.classList.remove('recording');
        btn.innerHTML = `<i class="fas fa-microphone" style="font-size:28px; color:#555;"></i><span style="color:#333;">按住说话</span>`;
    }

    mediaRecorder.onstop = async () => {
        const blob = new Blob(mediaChunks, { type: 'audio/webm' });
        const sec = Math.max(1, Math.round((Date.now() - pressStartAt) / 1000));

        // 立即关闭弹窗和面板
        closeVoiceActionModal();
        document.getElementById('chat-extra-panels').classList.remove('open');

        // 上屏真实语音气泡 (UI 显示音频条)
        appendRealVoiceBubble(blob, sec);

        // 稍微等待 500ms，确保浏览器的原生识别把最后一句话吐出来
        await new Promise(resolve => setTimeout(resolve, 500));

        let text = recognizedText.trim();

        // 检查浏览器兼容性兜底
        if (!text && !(window.SpeechRecognition || window.webkitSpeechRecognition)) {
            text = "（当前浏览器不支持原生识别，请使用Chrome/Edge）";
        }

        // 把识别结果填入气泡的文字区域
        const all = document.querySelectorAll('.msg-voice-transcript');
        if (all.length) {
            all[all.length - 1].innerHTML = text || '（未识别到文字，可能是没有出声）';
        }

        // 识别成功，直接发送给 AI 请求回复，并记入历史
        if (text && currentChatId) {
            await saveMessageToHistory(currentChatId, {
                text: '[VOICE]' + text, type: 'sent', senderName: 'ME'
            });
            sendMessageToAI(text);
        } else if (currentChatId) {
            await saveMessageToHistory(currentChatId, {
                text: '[VOICE]（未识别到文字）', type: 'sent', senderName: 'ME'
            });
        }
        
        cleanupRecorder();
    };

    mediaRecorder.stop();
}

// 彻底删除或注释掉原来的 transcribeAudio API 请求函数
// async function transcribeAudio(blob) { ... }



// 语音转文字 API (调用设置里的接口)
async function transcribeAudio(blob) {
    try {
        const settings = JSON.parse(localStorage.getItem('myCoolPhone_aiSettings') || '{}');
        if (!settings.apiKey || !settings.endpoint) return '';

        let baseUrl = settings.endpoint.replace(/\/$/, '');
        const url = baseUrl.endsWith('/v1') ? `${baseUrl}/audio/transcriptions` : `${baseUrl}/v1/audio/transcriptions`;

        const fd = new FormData();
        fd.append('file', blob, 'voice.webm');
        fd.append('model', 'whisper-1');

        const res = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${settings.apiKey}` },
            body: fd
        });
        if (!res.ok) throw new Error('STT失败');

        const data = await res.json();
        const text = (data.text || '').trim();

        // 把识别结果填入气泡中
        const all = document.querySelectorAll('.msg-voice-transcript');
        if (all.length) {
            all[all.length - 1].innerHTML = text || '（未识别到文字）';
        }

        return text;
    } catch (e) {
        console.error(e);
        const all = document.querySelectorAll('.msg-voice-transcript');
        if (all.length) all[all.length - 1].innerHTML = '（语音识别失败）';
        return '';
    }
}

function cleanupRecorder() {
    if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
    mediaRecorder = null;
    mediaStream = null;
    mediaChunks = [];
}

/* =========================================
   [新增] 独立的清空当前聊天记录功能
   ========================================= */
window.clearCurrentChatHistory = async function() {
    if (!currentChatId) {
        alert("错误：未找到当前聊天对象。");
        return;
    }

    const friend = friendsData[currentChatId];
    const friendName = friend ? (friend.remark || friend.realName) : currentChatId;

    if (confirm(`⚠️ 警告！\n\n你确定要清空与 "${friendName}" 的所有聊天记录吗？\n\n此操作不可恢复。`)) {
        try {
            // 1. 从 IndexedDB 中删除聊天记录
            await IDB.delete(scopedChatKey(currentChatId));

            // 2. 清空聊天界面UI
            const chatMessages = document.getElementById('chatMessages');
            if (chatMessages) {
                chatMessages.innerHTML = '';
            }
            
            // 3. 更新好友列表的最后消息预览
            const chatListItem = document.querySelector(`.wc-chat-item[data-chat-id="${currentChatId}"]`);
            if (chatListItem) {
                const previewEl = chatListItem.querySelector('.wc-msg-preview');
                if (previewEl) {
                    previewEl.innerText = "聊天记录已清空";
                }
            }

            alert(`与 "${friendName}" 的聊天记录已成功清空！`);
            
            // 4. 关闭设置页面，留在聊天窗口，让用户看到清空后的效果
            closeChatSettingsPage();
            
            // 5. 自动显示新的开场白
            const greeting = getEffectiveGreeting(friend);
            if(greeting){
                 appendMessage(greeting, 'received', friend.avatar, friend.remark || friend.realName);
                 await saveMessageToHistory(currentChatId, { text: greeting, type: 'received', senderName: (friend.remark || friend.realName), customAvatar: friend.avatar });
            }


        } catch (e) {
            console.error("清空聊天记录失败:", e);
            alert("操作失败，请检查控制台错误信息。");
        }
    }
}
/* =========================================
   [全面升级版] 剧情总结与关系进度 核心逻辑 (全屏页面版)
   ========================================= */

// 1. 打开/关闭 全屏页面
window.openSummaryPage = async function() {
    if (!currentChatId) {
        alert("请先进入一个聊天。");
        return;
    }
    
    const page = document.getElementById('summaryPageView');
    if (page) {
        // 先滑入页面
        page.classList.add('show'); 
        // 异步渲染数据，防止卡顿
        await renderSummaryUI(); 
    }
}

window.closeSummaryPage = function() {
    const page = document.getElementById('summaryPageView');
    if (page) page.classList.remove('show'); 
}

// 2. 渲染UI (支持异步获取历史记录轮数)
async function renderSummaryUI() {
    const friend = friendsData[currentChatId];
    if (!friend) return;

    // --- A. 渲染设置数据 ---
    const config = friend.summaryConfig || { turnCount: 20, wordCount: 200, prompt: '' };
    document.getElementById('summary-turn-count').value = config.turnCount;
    document.getElementById('summary-word-count').value = config.wordCount;
    document.getElementById('summary-prompt').value = config.prompt;

    // --- B. 计算当前轮数进度 ---
    const history = await loadChatHistory(currentChatId);
    const totalTurns = history.length;
    document.getElementById('current-total-turns').innerText = totalTurns;

    // 遍历已有总结，找出总结到了第几轮
    let lastTurn = 0;
    if (friend.summaries && friend.summaries.length > 0) {
        // 获取所有总结中记录的最大 endTurn
        const endTurns = friend.summaries.map(s => parseInt(s.endTurn) || 0);
        lastTurn = Math.max(...endTurns);
    }
    document.getElementById('last-summarized-turn').innerText = lastTurn;

    // 智能预填手动提取的输入框
    const startInput = document.getElementById('manual-sum-start');
    const endInput = document.getElementById('manual-sum-end');
    // 默认从上次总结的下一轮开始，到当前最新轮结束
    startInput.value = (lastTurn < totalTurns) ? lastTurn + 1 : totalTurns;
    endInput.value = totalTurns;

    // --- C. 渲染总结列表 ---
    const summaryContainer = document.getElementById('summary-list-container');
    summaryContainer.innerHTML = '';
    if (friend.summaries && friend.summaries.length > 0) {
        // 倒序渲染，最新的总结在最上面
        [...friend.summaries].reverse().forEach((summary) => {
            // 找出它在原数组中的真实索引，以便保存和删除时不出错
            const realIndex = friend.summaries.indexOf(summary);
            const item = createEditableItem(realIndex, summary.text, 'summary', summary.startTurn, summary.endTurn);
            summaryContainer.appendChild(item);
        });
    } else {
        summaryContainer.innerHTML = '<div class="summary-empty-state">大脑空空，暂无记忆</div>';
    }

    // --- D. 渲染关系进度 ---
    const relContainer = document.getElementById('relationship-log-container');
    relContainer.innerHTML = '';
    if (friend.relationshipLog && friend.relationshipLog.length > 0) {
        [...friend.relationshipLog].reverse().forEach((log) => {
            const realIndex = friend.relationshipLog.indexOf(log);
            const item = createEditableItem(realIndex, log.text, 'relationship');
            relContainer.appendChild(item);
        });
    } else {
        relContainer.innerHTML = '<div class="summary-empty-state">暂无关系跃升事件</div>';
    }
}

// 辅助函数：创建加宽的、带轮数标记的可编辑项
function createEditableItem(index, text, type, startTurn = null, endTurn = null) {
    const item = document.createElement('div');
    item.className = 'summary-item';
    
    // 如果是剧情总结，显示一下它是哪一轮到哪一轮的
    let badgeHtml = '';
    if (type === 'summary' && startTurn !== null && endTurn !== null) {
        badgeHtml = `<div style="font-size:10px; color:#fff; background:#2b2b2b; padding:2px 6px; border-radius:4px; position:absolute; top:-8px; left:10px; box-shadow:0 2px 5px rgba(0,0,0,0.2);">T ${startTurn} - ${endTurn}</div>`;
    }

    item.innerHTML = `
        ${badgeHtml}
        <textarea class="summary-item-text" spellcheck="false">${text}</textarea>
        <div class="summary-item-actions">
            <i class="fas fa-save" title="保存修改" onclick="saveItem(${index}, '${type}', this)"></i>
            <i class="fas fa-trash" title="删除" onclick="deleteItem(${index}, '${type}', this)"></i>
        </div>
    `;
    return item;
}

// 3. 各种保存/添加/删除 操作
window.saveSummaryConfig = function() {
    if (!friendsData[currentChatId]) friendsData[currentChatId] = {};
    if (!friendsData[currentChatId].summaryConfig) friendsData[currentChatId].summaryConfig = {};

    friendsData[currentChatId].summaryConfig.turnCount = document.getElementById('summary-turn-count').value;
    friendsData[currentChatId].summaryConfig.wordCount = document.getElementById('summary-word-count').value;
    friendsData[currentChatId].summaryConfig.prompt = document.getElementById('summary-prompt').value;
    
    saveFriendsData();
}

window.saveItem = function(index, type, buttonEl) {
    const friend = friendsData[currentChatId];
    const itemEl = buttonEl.closest('.summary-item');
    const newText = itemEl.querySelector('.summary-item-text').value;

    if (type === 'summary' && friend.summaries[index]) {
        friend.summaries[index].text = newText;
    } else if (type === 'relationship' && friend.relationshipLog[index]) {
        friend.relationshipLog[index].text = newText;
    }
    saveFriendsData();
    
    // 给个绿色的视觉反馈
    buttonEl.style.color = '#07c160';
    setTimeout(() => buttonEl.style.color = '#aaa', 1000);
}

window.deleteItem = async function(index, type, buttonEl) {
    if (!confirm('确定彻底抹除这段记忆吗？不可恢复。')) return;
    const friend = friendsData[currentChatId];
    
    if (type === 'summary' && friend.summaries) {
        friend.summaries.splice(index, 1);
    } else if (type === 'relationship' && friend.relationshipLog) {
        friend.relationshipLog.splice(index, 1);
    }
    
    await saveFriendsData();
    // 重新渲染，确保轮数计算正确
    renderSummaryUI(); 
}

window.addNewSummaryItem = function() {
    const friend = friendsData[currentChatId];
    if (!friend.summaries) friend.summaries = [];
    friend.summaries.push({ 
        text: '手动编写的补充记忆...', 
        timestamp: Date.now(),
        startTurn: 0, 
        endTurn: 0 
    });
    saveFriendsData();
    renderSummaryUI();
}

window.addRelationshipLog = function() {
    const friend = friendsData[currentChatId];
    if (!friend.relationshipLog) friend.relationshipLog = [];
    friend.relationshipLog.push({ text: '关系发生变化：(请描述)', timestamp: Date.now() });
    saveFriendsData();
    renderSummaryUI();
}

// === 新增：一键清空全部记忆 ===
window.clearAllSummaries = async function() {
    if (!confirm('⚠️ 警告！\n\n确定要一键清空所有的【剧情总结】和【关系跃升事件】吗？\n清空后 AI 将彻底失去对历史大纲的记忆，且此操作不可逆！')) return;
    
    const friend = friendsData[currentChatId];
    if (friend) {
        friend.summaries = [];
        friend.relationshipLog = [];
        await saveFriendsData();
        renderSummaryUI();
        alert('脑白金洗礼完成，历史记忆已全部清空。');
    }
}

// =========================================
// 4. 触发总结的核心引擎 (手动/自动公用)
// =========================================

// A. 手动指定区间总结
window.generateManualSummary = async function() {
    const startStr = document.getElementById('manual-sum-start').value;
    const endStr = document.getElementById('manual-sum-end').value;
    let start = parseInt(startStr);
    let end = parseInt(endStr);

    if (isNaN(start) || isNaN(end) || start < 1 || start > end) {
        alert("请输入有效的轮数区间！(如：从 1 到 20)");
        return;
    }

    const history = await loadChatHistory(currentChatId);
    if (end > history.length) end = history.length;

    // 数组索引是从 0 开始的，所以第 1 轮对应的索引是 0
    const messagesToSummarize = history.slice(start - 1, end);
    
    if (messagesToSummarize.length === 0) {
        alert("该区间内没有找到任何聊天记录。");
        return;
    }

    const btn = document.getElementById('btn-manual-range');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 提取中...';
    btn.style.pointerEvents = 'none';

    await executeSummaryProcess(messagesToSummarize, start, end);

    btn.innerHTML = '<i class="fas fa-crosshairs"></i> 提取指定区间';
    btn.style.pointerEvents = 'auto';
}

// B. 一键总结最新未总结部分
window.generateSummarySinceLast = async function() {
    const history = await loadChatHistory(currentChatId);
    const totalTurns = history.length;
    const lastTurnStr = document.getElementById('last-summarized-turn').innerText;
    let lastTurn = parseInt(lastTurnStr) || 0;

    if (lastTurn >= totalTurns) {
        alert("目前所有对话都已总结过啦，去多聊几句再来吧！");
        return;
    }

    const start = lastTurn + 1;
    const end = totalTurns;
    const messagesToSummarize = history.slice(start - 1, end);

    const btn = document.getElementById('btn-manual-latest');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在浓缩记忆...';
    btn.style.pointerEvents = 'none';

    await executeSummaryProcess(messagesToSummarize, start, end);

    btn.innerHTML = '<i class="fas fa-bolt"></i> 一键总结最新未总结部分';
    btn.style.pointerEvents = 'auto';
}

// C. 后台自动触发总结 (修改为带有轮数标记)
window.generateAutoSummary = async function(messagesToSummarize) {
    const history = await loadChatHistory(currentChatId);
    const end = history.length;
    const start = end - messagesToSummarize.length + 1;
    
    // 静默执行，不更新按钮状态
    await executeSummaryProcess(messagesToSummarize, start, end);
}

// 核心执行逻辑 (组装文本、发送请求、保存)
async function executeSummaryProcess(messagesArr, startTurn, endTurn) {
    const friend = friendsData[currentChatId];
    const config = friend.summaryConfig || {};
    const basePrompt = config.prompt || `请以角色 ${friend.realName} 的第一人称视角，用简练的日记体总结这段时间内发生的事情。`;
    const wordCount = config.wordCount || 200;
    
    // 将提取出的对象数组转为可读文本
    const contentToSummarize = messagesArr.map(m => {
        let text = m.text;
        if(m.isOffline) { text = `(剧情/动作: ${text})`; }
        return `${m.senderName === 'ME' ? '我(User)' : m.senderName}: ${text}`;
    }).join('\n');

    const finalPrompt = `${basePrompt}\n要求字数控制在 ${wordCount} 字左右。\n请直接输出总结正文，不要加引号或解释。\n\n[需要总结的历史记录如下]：\n${contentToSummarize}`;

    const summaryText = await callAiForSpecialTask(finalPrompt);
    
    if (summaryText) {
        if (!friend.summaries) friend.summaries = [];
        // 推入带轮数标记的对象
        friend.summaries.push({ 
            text: summaryText, 
            timestamp: Date.now(),
            startTurn: startTurn,
            endTurn: endTurn
        });
        await saveFriendsData();
        
        // 如果用户正好停留在总结页面，立刻刷新看到最新结果
        if (document.getElementById('summaryPageView').classList.contains('show')) {
            renderSummaryUI();
        }
    }
}

// 5. 大融合总结 (宏观上帝视角)
window.generateGrandSummary = async function() {
    const friend = friendsData[currentChatId];
    if (!friend.summaries || friend.summaries.length === 0) {
        alert('大脑空空，没有任何记忆碎片可供融合。');
        return;
    }

    const wordCount = prompt("准备进行记忆大串联。\n请输入期望的融合字数：", "300");
    if (!wordCount) return;

    const btn = document.getElementById('grand-summary-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 大脑正在飞速运转...';
    btn.style.pointerEvents = 'none';

    // 把之前的零碎总结按顺序拼起来
    const contentToSummarize = friend.summaries.map((s, i) => `【记录片段 ${i+1} (轮数${s.startTurn}-${s.endTurn})】:\n${s.text}`).join('\n\n');
    const prompt = `你现在是 ${friend.realName}。请基于以下按时间顺序排列的记忆片段，写一篇深度的人物小传/长篇回顾。\n请融会贯通，写出角色的心路历程和剧情发展脉络。字数控制在 ${wordCount} 字左右。\n\n${contentToSummarize}`;
    
    const grandSummaryText = await callAiForSpecialTask(prompt);

    if (grandSummaryText) {
        if (!friend.summaries) friend.summaries = [];
        // 大总结推入最后，并标记特殊轮数
        friend.summaries.push({ 
            text: `[宏观大记忆] \n${grandSummaryText}`, 
            timestamp: Date.now(),
            startTurn: "All",
            endTurn: "All"
        });
        await saveFriendsData();
        renderSummaryUI();
        alert('记忆大融合成功！');
    }
    
    btn.innerHTML = '<i class="fas fa-brain"></i> 对以上所有记忆进行【大融合】';
    btn.style.pointerEvents = 'auto';
}

// 6. 底层 AI 调用函数 (防崩溃保障)
async function callAiForSpecialTask(prompt) {
    try {
        const settingsJSON = localStorage.getItem(SETTINGS_KEY);
        if (!settingsJSON) throw new Error("请先在设置中配置 API Key 与模型");
        const settings = JSON.parse(settingsJSON);
        
        let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
        const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
        
        const payload = {
            model: settings.model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.6 
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`API 接口报错: HTTP ${response.status}`);
        const data = await response.json();
        return data.choices?.[0]?.message?.content || null;

    } catch (error) {
        alert(`AI 处理失败: ${error.message}`);
        return null;
    } 
}
/* =========================================
   [更新] 支付/钱包 (Pay) 系统核心逻辑 (分卡+小游戏版)
   ========================================= */

const PAY_DATA_KEY = 'myCoolPhone_payData';
let payData = {
    balance: 0.00,        
    bankCard: 0.00,       
    yuebao: 0.00,         
    lastInterestDate: 0,  
    totalProfit: 0.00,    
    transactions: [],     
    career: { type: 'worker', day: 15, amount: 0, lastPayMonth: -1 },
    intimatePay: {},       // 我给别人的
    intimatePayFrom: {}    // 别人给我的
};
window.resetPayData = async function() {
    if (!confirm("确定要重置【当前人设】的钱包吗？\n将清空余额/银行卡/余额宝/账单/亲密付记录。")) return;

    payData = {
        balance: 0.00,
        bankCard: 0.00,
        yuebao: 0.00,
        lastInterestDate: 0,
        totalProfit: 0.00,
        transactions: [],
        career: { type: 'worker', day: 15, amount: 0, lastPayMonth: -1, source: '' },
        intimatePay: {},
        intimatePayFrom: {}
    };

    // 写回存储（用你现有的 savePayData 即可）
    await savePayData();

    // 如果你当前正停留在某个子页面，顺便刷新一下
    try { renderIntimatePage(); } catch(e) {}
    try { renderBillList(); } catch(e) {}
    try { renderYuebaoPage(); } catch(e) {}
    try { renderCareerPage(); } catch(e) {}

    alert("钱包已重置。");
};

// 账单渲染与右滑删除逻辑 (性能优化版)
function renderBillList() {
    const list = document.getElementById('pay-bill-list');
    
    if(payData.transactions.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:60px 20px; color:#aaa; font-size:12px;"><i class="fas fa-receipt" style="font-size:32px; color:#eee; margin-bottom:10px; display:block;"></i>没有任何账单记录</div>';
        return;
    }

    // 核心修复：使用字符串一次性拼接，杜绝在循环中使用 innerHTML += 造成的致命卡顿
    let htmlStr = '';
    payData.transactions.forEach(t => {
        const sign = t.type === 'income' ? '+' : '-';
        const colorClass = t.type === 'income' ? 'bill-income-text' : 'bill-expense-text';
        const iconClass = t.type === 'income' ? 'fa-arrow-down' : 'fa-arrow-up';
        const iconBg = t.type === 'income' ? 'bill-icon-in' : 'bill-icon-out';
        
        const d = new Date(t.time);
        const dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        
        htmlStr += `
            <div class="bill-card-modern" id="tx_item_${t.id}" 
                 ontouchstart="window.billTouchStartX = event.touches[0].clientX;"
                 ontouchend="window.handleBillTouchEnd(event, '${t.id}')"
                 style="transition: transform 0.3s ease;">
                <div class="bill-icon-wrap ${iconBg}">
                    <i class="fas ${iconClass}"></i>
                </div>
                <div class="bill-info-wrap">
                    <div class="bill-title">${t.title}</div>
                    <div class="bill-time">${dateStr} (右滑删除)</div>
                </div>
                <div class="bill-amount-wrap ${colorClass}">
                    ${sign} ${t.amount.toFixed(2)}
                </div>
            </div>
        `;
    });
    
    // 一次性渲染进 DOM
    list.innerHTML = htmlStr;
}


// 账单右滑删除事件
window.billTouchStartX = 0;
window.handleBillTouchEnd = function(e, txId) {
    const endX = e.changedTouches[0].clientX;
    const diff = endX - window.billTouchStartX;
    if (diff > 80) { // 向右滑出一段距离
        if (confirm("确定删除这条账单记录吗？(仅清除记录，不影响实际金额)")) {
            payData.transactions = payData.transactions.filter(x => x.id !== txId);
            savePayData();
            const el = document.getElementById('tx_item_' + txId);
            if(el) {
                el.style.transform = "translateX(120%)";
                setTimeout(() => el.remove(), 300);
            }
        }
    }
}


// 1. 初始化与打开App
window.openPayApp = async function() {
    const app = document.getElementById('payApp');
    if(app) {
        app.classList.add('open');
        await loadPayData();
        
        checkYuebaoInterest();
        checkCareerSalary();
        simulateIntimatePayConsumption();

        renderPayMainPage();
    }
}
window.closePayApp = function() {
    document.getElementById('payApp').classList.remove('open');
}

// 2. 数据加载与保存
async function loadPayData() {
    const data = await IDB.get(PAY_DATA_KEY);
    if(data) {
        payData = { ...payData, ...data };
        if(!payData.intimatePay) payData.intimatePay = {};
    }
}
async function savePayData() {
    await IDB.set(PAY_DATA_KEY, payData);
    renderPayMainPage();
}

// 3. 渲染主页数据 (修复版)
function renderPayMainPage() {
    // 安全获取并更新元素
    const elTotal = document.getElementById('pay-total-balance');
    if (elTotal) elTotal.innerText = payData.balance.toFixed(2);

    const elBank = document.getElementById('pay-bank-balance');
    if (elBank) elBank.innerText = payData.bankCard.toFixed(2);

    // 修复点：这里加了判断，防止 index.html 没这个 ID 时报错
    const elYuebao = document.getElementById('pay-yuebao-balance');
    if (elYuebao) elYuebao.innerText = payData.yuebao.toFixed(2);
    
    let yestProfit = 0;
    const records = payData.transactions.filter(t => t.title === '余额宝收益');
    if(records.length > 0) yestProfit = records[0].amount;
    
    const elYest = document.getElementById('pay-yuebao-yesterday');
    if (elYest) elYest.innerText = yestProfit.toFixed(2);
}


// 4. 记账通用函数
function addTransaction(title, amount, type) {
    payData.transactions.unshift({
        id: 'tx_' + Date.now(),
        title: title,
        amount: parseFloat(amount),
        type: type,
        time: Date.now()
    });
}

// 5. 页面路由 (修复闪屏版)
window.openPaySubPage = function(pageId) {
    document.querySelectorAll('.pay-sub-page').forEach(el => el.classList.remove('show'));
    const page = document.getElementById('pay-page-' + pageId);
    if(page) {
        // 先渲染数据，防止 DOM 操作阻塞 CSS 动画
        if(pageId === 'bill') renderBillList();
        if(pageId === 'yuebao') renderYuebaoPage();
        if(pageId === 'career') renderCareerPage();
        if(pageId === 'intimate') renderIntimatePage();
        
        // 利用双重 requestAnimationFrame 确保数据渲染完毕后再滑入
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                page.classList.add('show');
            });
        });
    }
}


// ==========================================
// [新增架构] 统一的高级定制弹窗系统 (替代 native alert/prompt)
// ==========================================
function showKAlert(desc, callback = null) {
    const overlay = document.getElementById('k-dialog-overlay');
    document.getElementById('k-dialog-title').innerText = "提示";
    document.getElementById('k-dialog-desc').innerHTML = desc; // 支持HTML换行
    document.getElementById('k-dialog-input').style.display = 'none';
    document.getElementById('k-dialog-cancel').style.display = 'none'; // 警告框只有确定
    
    const confirmBtn = document.getElementById('k-dialog-confirm');
    
    // 清理旧事件
    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
    
    newBtn.onclick = () => {
        overlay.classList.remove('active');
        if(callback) callback();
    };
    overlay.classList.add('active');
}

function showKPrompt(title, desc, placeholder, callback) {
    const overlay = document.getElementById('k-dialog-overlay');
    document.getElementById('k-dialog-title').innerText = title;
    document.getElementById('k-dialog-desc').innerHTML = desc;
    
    const input = document.getElementById('k-dialog-input');
    input.style.display = 'block';
    input.placeholder = placeholder;
    input.value = ''; // 清空
    
    document.getElementById('k-dialog-cancel').style.display = 'block';
    
    const confirmBtn = document.getElementById('k-dialog-confirm');
    const cancelBtn = document.getElementById('k-dialog-cancel');
    
    // 清理旧事件
    const newConfirm = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    
    newCancel.onclick = () => overlay.classList.remove('active');
    newConfirm.onclick = () => {
        overlay.classList.remove('active');
        if(callback) callback(input.value);
    };
    
    overlay.classList.add('active');
    setTimeout(() => input.focus(), 300);
}
// === 新增：高级定制版 Confirm 确认弹窗 ===
window.showKConfirm = function(title, desc, onConfirm, onCancel) {
    const overlay = document.getElementById('k-dialog-overlay');
    document.getElementById('k-dialog-title').innerText = title;
    document.getElementById('k-dialog-desc').innerHTML = desc;
    document.getElementById('k-dialog-input').style.display = 'none'; // 隐藏输入框
    document.getElementById('k-dialog-cancel').style.display = 'block'; // 显示取消按钮
    
    const confirmBtn = document.getElementById('k-dialog-confirm');
    const cancelBtn = document.getElementById('k-dialog-cancel');
    
    // 清理旧事件
    const newConfirm = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    
    newCancel.onclick = () => {
        overlay.classList.remove('active');
        if(onCancel) onCancel();
    };
    newConfirm.onclick = () => {
        overlay.classList.remove('active');
        if(onConfirm) onConfirm();
    };
    
    overlay.classList.add('active');
}


// ==========================================
// [核心机制] 1：AI 财富测算 (根据当前身份)
// ==========================================
window.generateInitialWealthByAI = async function() {
    const p = personasMeta[currentPersonaId];
    const persona = p ? p.persona : "普通人";
    const prompt = `
    用户当前的人设是：“${persona}”。
    请根据这个人设，推断TA的【微信零钱】和【银行存款】是多少（人民币）。
    如果人设是落魄打工人，可能零钱只有几块。如果是霸道总裁，可能零钱几十万。
    直接返回纯JSON格式：{"balance": 数字, "bankCard": 数字}。注意：只能返回纯JSON，不要输出任何其他文本或markdown标记！
    `;
    
    const btn = document.getElementById('btn-ai-wealth');
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 命运齿轮转动中...';
    btn.style.pointerEvents = 'none';
    
    const res = await callAiForSpecialTask(prompt);
    btn.innerHTML = oldHtml;
    btn.style.pointerEvents = 'auto';
    
    if(res) {
        try {
            const cleanStr = res.replace(/```json/g, '').replace(/```/g, '').trim();
            const data = JSON.parse(cleanStr);
            if(data.balance !== undefined && data.bankCard !== undefined) {
                payData.balance = parseFloat(data.balance);
                payData.bankCard = parseFloat(data.bankCard);
                addTransaction('AI 命运赐予', payData.balance, 'income');
                savePayData();
                showKAlert(`<b style="color:#07c160; font-size:16px;">测算完成！</b><br><br>根据你的设定...<br>你的零钱为：<b>¥${payData.balance}</b><br>银行存款为：<b>¥${payData.bankCard}</b><br><br>努力生活吧！`);
            }
        } catch(e) {
            showKAlert('AI 给出的数字太模糊，请再试一次。');
        }
    }
}

// ==========================================
// [核心机制] 2：凭空增加余额 & 抢金币小游戏
// ==========================================
window.addBalancePrompt = function() {
    showKPrompt("增加余额", "你要凭空为自己增加多少零钱？", "输入金额 (如: 1000)", (val) => {
        const amt = parseFloat(val);
        if(isNaN(amt) || amt <= 0) return;
        
        // 1. 小额福利 (< 1000): 直接到账，无需游戏
        if(amt < 1000) {
            payData.balance += amt;
            addTransaction('天降横财', amt, 'income');
            savePayData();
            showKAlert(`成功增加余额 <b style="color:#07c160;">¥${amt.toFixed(2)}</b>`);
        } 
        // 2. 中额挑战 (1000 - 10000): 简单的抢金币游戏
        else if (amt < 10000) {
            showKAlert(`<b style="font-size:16px;">小试牛刀 (๑•̀ㅂ•́)و✧</b><br><br>金额有点多，玩个简单的小游戏证明你的手速！<br>目标：10秒收集 10 个金币。`, () => {
                startCoinGame(amt, false); // false = 简单模式 (金币不动)
            });
        }
        // 3. 大额验证 (10000 - 100000): 【新游戏】智力数学题
        else if (amt < 100000) {
            // 生成随机数学题 (两位数乘法+加法)
            const n1 = Math.floor(Math.random() * 30) + 10; // 10-39
            const n2 = Math.floor(Math.random() * 9) + 2;   // 2-10
            const n3 = Math.floor(Math.random() * 50) + 1;  // 1-50
            const answer = n1 * n2 + n3;

            showKAlert(`<b style="font-size:16px;">大额验证 (⊙_⊙)?</b><br><br>金额较大（1万-10万），需要进行智力验证！<br>请口算或心算：<br><br><b style="font-size:18px;">${n1} × ${n2} + ${n3} = ?</b>`, () => {
                // 延迟一点点打开输入框，防止弹窗冲突
                setTimeout(() => {
                    showKPrompt("智力验证", `请输入计算结果：${n1} × ${n2} + ${n3}`, "输入数字答案", (inputVal) => {
                        if (parseInt(inputVal) === answer) {
                            payData.balance += amt;
                            addTransaction('智力变现', amt, 'income');
                            savePayData();
                            showKAlert(`回答正确！智商占领高地！<br>已存入 <b style="color:#07c160;">¥${amt.toFixed(2)}</b>`);
                        } else {
                            showKAlert(`回答错误！<br>正确答案是 <b>${answer}</b>。<br>钱飞走了~ 再试一次吧！`);
                        }
                    });
                }, 300);
            });
        }
        // 4. 巨额考验 (>= 100000): 困难版抢金币
        else {
            showKAlert(`<b style="font-size:16px;">巨款预警 Σ(っ °Д °;)っ</b><br><br>想要凭空拿十万以上，必须通过【地狱级】考验！<br>金币会乱飞且消失得很快，准备好了吗？`, () => {
                startCoinGame(amt, true); // true = 困难模式 (金币乱飞)
            });
        }
    });
}


let cgTimer = null;
let cgInterval = null;

function startCoinGame(amount, isHard) {
    const view = document.getElementById('coin-game-view');
    view.classList.add('open');
    
    let time = 10.0;
    let score = 0;
    const target = isHard ? 20 : 10;
    
    document.getElementById('cg-target').innerText = `目标：在 10 秒内收集 ${target} 个金币`;
    const timeEl = document.getElementById('cg-countdown');
    timeEl.innerText = time.toFixed(1);
    timeEl.className = ''; // reset
    document.getElementById('cg-score').innerText = score;
    
    const playArea = document.getElementById('cg-play-area');
    playArea.innerHTML = '';
    
    // 生成频率与存活时间
    const spawnRate = isHard ? 350 : 600;
    const lifeTime = isHard ? 800 : 1200;
    
    cgInterval = setInterval(() => {
        spawnCoin(playArea, isHard, lifeTime, (x, y) => {
            score++;
            document.getElementById('cg-score').innerText = score;
            createFloatingScore(x, y, playArea);
        });
    }, spawnRate);
    
    cgTimer = setInterval(() => {
        time -= 0.1;
        timeEl.innerText = Math.max(0, time).toFixed(1);
        if(time <= 3.0) timeEl.classList.add('cg-time-warning');
        
        if(time <= 0) {
            endCoinGame(score, target, amount);
        }
    }, 100);
}

function spawnCoin(playArea, isHard, lifeTime, onCatch) {
    const coin = document.createElement('div');
    coin.className = 'gold-coin';
    coin.innerHTML = '¥';
    
    const maxX = playArea.clientWidth - 50;
    const maxY = playArea.clientHeight - 50;
    
    const limitX = maxX > 0 ? maxX : 250; 
    const limitY = maxY > 0 ? maxY : 400;

    coin.style.left = (Math.random() * limitX) + 'px';
    coin.style.top = (Math.random() * limitY) + 'px';
    
    if(isHard) {
        coin.style.transition = 'top 0.4s ease, left 0.4s ease, transform 0.2s';
        setTimeout(() => {
            if(coin.parentNode) {
                coin.style.left = (Math.random() * limitX) + 'px';
                coin.style.top = (Math.random() * limitY) + 'px';
            }
        }, lifeTime / 2);
    }
    
    coin.onpointerdown = (e) => {
        e.stopPropagation();
        onCatch(e.clientX, e.clientY);
        coin.remove();
    };
    
    playArea.appendChild(coin);
    
    setTimeout(() => {
        if(coin.parentNode) coin.remove();
    }, lifeTime);
}

function createFloatingScore(x, y, container) {
    const float = document.createElement('div');
    float.innerText = '+1';
    const rect = container.getBoundingClientRect();
    float.style.cssText = `
        position: absolute; left: ${x - rect.left}px; top: ${y - rect.top}px;
        color: #07c160; font-weight: 900; font-size: 24px;
        pointer-events: none; z-index: 100; text-shadow: 0 2px 4px rgba(255,255,255,0.8);
        animation: floatUpFade 0.8s ease forwards;
    `;
    container.appendChild(float);
    setTimeout(() => float.remove(), 800);
}

function endCoinGame(score, target, amount) {
    clearInterval(cgTimer);
    clearInterval(cgInterval);
    document.getElementById('cg-play-area').innerHTML = '';
    
    setTimeout(() => {
        document.getElementById('coin-game-view').classList.remove('open');
        if(score >= target) {
            payData.balance += amount;
            addTransaction('游戏挑战赢金', amount, 'income');
            savePayData();
            setTimeout(() => {
                showKAlert(`<b style="font-size:16px; color:#07c160;">挑战成功！(oﾟvﾟ)ノ</b><br><br>你不仅手速惊人，还抢到了 <b>${score}</b> 个金币！<br><br>【¥${amount.toFixed(2)}】 已存入你的钱包！`);
            }, 300);
        } else {
            setTimeout(() => {
                showKAlert(`<b style="font-size:16px; color:#ff4d4f;">挑战失败...(；′⌒\`)</b><br><br>只收集了 ${score} 个金币，距离目标 ${target} 个还差一点。<br>横财从指缝中溜走了~`);
            }, 300);
        }
    }, 100);
}

// ==========================================
// [接入新 UI] 3：充值、提现与余额宝
// ==========================================
window.payActionPrompt = function(action) {
    if(action === 'recharge') {
        showKPrompt("充值到零钱", `当前银行卡存款: ¥${payData.bankCard.toFixed(2)}`, "输入转入金额", (val) => {
            const amt = parseFloat(val);
            if(amt > 0 && amt <= payData.bankCard) {
                payData.bankCard -= amt;
                payData.balance += amt;
                addTransaction('从银行卡转入', amt, 'income');
                savePayData();
                showKAlert(`充值成功！`);
            } else {
                showKAlert("操作失败：金额无效或银行卡余额不足。");
            }
        });
    } else if(action === 'withdraw') {
        showKPrompt("提现到银行卡", `当前可提现零钱: ¥${payData.balance.toFixed(2)}`, "输入提现金额", (val) => {
            const amt = parseFloat(val);
            if(amt > 0 && amt <= payData.balance) {
                payData.balance -= amt;
                payData.bankCard += amt;
                addTransaction('提现至银行卡', amt, 'expense');
                savePayData();
                showKAlert(`提现成功！`);
            } else {
                showKAlert("操作失败：金额无效或零钱不足。");
            }
        });
    }
}



// 余额宝结算逻辑 (保持不变)
function checkYuebaoInterest() {
    if(payData.yuebao <= 0) return;
    const now = new Date();
    const lastDate = new Date(payData.lastInterestDate || 0);
    if(now.getDate() !== lastDate.getDate() || now.getMonth() !== lastDate.getMonth() || now.getFullYear() !== lastDate.getFullYear()) {
        const dailyRate = 0.00005; 
        let profit = payData.yuebao * dailyRate;
        if(profit < 0.01 && payData.yuebao > 0) profit = 0.01;
        payData.yuebao += profit;
        payData.totalProfit += profit;
        payData.lastInterestDate = now.getTime();
        addTransaction('余额宝收益', profit, 'income');
        savePayData();
    }
}
function renderYuebaoPage() {
    document.getElementById('yb-detail-balance').innerText = payData.yuebao.toFixed(2);
    document.getElementById('yb-total-profit').innerText = payData.totalProfit.toFixed(2);
    const list = document.getElementById('yb-profit-list');
    const profits = payData.transactions.filter(t => t.title === '余额宝收益');
    if(profits.length === 0) {
        list.innerHTML = '<div style="color:#999; font-size:12px;">暂无收益记录</div>';
    } else {
        list.innerHTML = profits.map(t => `
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding-bottom:10px;">
                <span style="font-size:12px;">${new Date(t.time).toLocaleDateString()}</span>
                <span style="color:#ff5000; font-weight:700;">+${t.amount.toFixed(2)}</span>
            </div>
        `).join('');
    }
}
window.handleYuebao = function(action) {
    if(action === 'in') {
        const val = prompt(`将零钱转入余额宝。\n当前零钱: ¥${payData.balance.toFixed(2)}\n输入转入金额：`);
        const amt = parseFloat(val);
        if(amt > 0 && amt <= payData.balance) {
            payData.balance -= amt;
            payData.yuebao += amt;
            addTransaction('转入余额宝', amt, 'expense'); 
            savePayData();
            renderYuebaoPage();
        }
    } else {
        const val = prompt(`从余额宝转出到零钱。\n可转出: ¥${payData.yuebao.toFixed(2)}\n输入转出金额：`);
        const amt = parseFloat(val);
        if(amt > 0 && amt <= payData.yuebao) {
            payData.yuebao -= amt;
            payData.balance += amt;
            addTransaction('余额宝转出', amt, 'income'); 
            savePayData();
            renderYuebaoPage();
        }
    }
}

// 薪水职业与亲密付逻辑 (保持不变，已兼容新的分离架构)
window.saveGlobalPersona = function() {
    const val = document.getElementById('my-global-persona').value;
    localStorage.setItem('myCoolPhone_globalPersona', val);
}
document.addEventListener('DOMContentLoaded', () => {
    const val = localStorage.getItem('myCoolPhone_globalPersona');
    if(val && document.getElementById('my-global-persona')) {
        document.getElementById('my-global-persona').value = val;
    }
});

// === 替换开始 ===
function renderCareerPage() {
    // 安全赋值，防止DOM还没加载
    const sourceInput = document.getElementById('career-source-input');
    if (sourceInput) sourceInput.value = payData.career.source || '';
    
    const dayInput = document.getElementById('career-day-input');
    if (dayInput) dayInput.value = payData.career.day || 15;
    
    const amountInput = document.getElementById('career-amount-input');
    if (amountInput) amountInput.value = payData.career.amount || 0;
}

window.saveCareerConfig = function() {
    payData.career.source = document.getElementById('career-source-input').value.trim() || '固定收入';
    payData.career.day = parseInt(document.getElementById('career-day-input').value) || 15;
    payData.career.amount = parseFloat(document.getElementById('career-amount-input').value) || 0;
    savePayData();
    showKAlert("每月收入设定已保存！到日子会自动打入银行卡。");
}

window.generateCareerAmountByAI = async function() {
    // 读取当前人设
    const p = personasMeta[currentPersonaId];
    const persona = p ? p.persona : "普通人";
    
    const btn = document.getElementById('btn-gen-salary');
    if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中';
    
    const prompt = `用户人设：“${persona}”。
    请根据此人设，推断TA每个月会有多少固定收入，以及这笔收入的合理名称来源（例如：生活费、家族企业分红、搬砖工资、项目尾款等）。
    请直接返回纯JSON格式：{"amount": 8500, "source": "搬砖工资"}。注意：只能返回纯JSON，不要输出任何文本或markdown！`;
    
    const result = await callAiForSpecialTask(prompt);
    
    if(btn) btn.innerHTML = 'AI测算';
    
    if(result) {
        try {
            const cleanStr = result.replace(/```json/g, '').replace(/```/g, '').trim();
            const data = JSON.parse(cleanStr);
            if(data.amount !== undefined && data.source) {
                document.getElementById('career-amount-input').value = data.amount;
                document.getElementById('career-source-input').value = data.source;
                showKAlert(`AI 测算完成：<br><br>每月收入：<b>¥${data.amount}</b><br>来源理由：<b>${data.source}</b>`);
            } else {
                throw new Error("格式不完整");
            }
        } catch(e) {
            showKAlert("AI 返回格式异常，请重试或手动输入。");
        }
    }
}

function checkCareerSalary() {
    const c = payData.career;
    if(c.amount <= 0) return;
    const now = new Date();
    // 检查是否到了发钱日，且本月还没发过
    if(now.getDate() >= c.day) {
        if(c.lastPayMonth !== now.getMonth()) {
            payData.bankCard += c.amount;
            const title = c.source || '每月固定收入';
            addTransaction(title, c.amount, 'income');
            c.lastPayMonth = now.getMonth();
            savePayData();
            setTimeout(() => showKAlert(`叮！你的当月【${title}】 ¥${c.amount} 已自动打入银行卡！`), 1000);
        }
    }
}
// === 替换结束 ===


function renderIntimatePage() {
    const list = document.getElementById('intimate-list-container');
    list.innerHTML = '';
    
    let html = '';
    
    // 1. 我给别人的
    const binds = Object.keys(payData.intimatePay || {});
    if(binds.length > 0) {
        html += `<div style="font-size:12px; color:#999; margin:10px 0 10px;">我为TA开通的亲密付</div>`;
        binds.forEach(id => {
            const info = payData.intimatePay[id];
            const f = friendsData[id] || { realName: id, avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}` };
            const nowMonth = new Date().getMonth();
            if(info.month !== nowMonth) { info.spent = 0; info.month = nowMonth; savePayData(); }
            const remain = info.limit === '无限' ? '无限' : (info.limit - info.spent).toFixed(2);
            html += `
                <div class="intimate-card" style="background:#fff; border-radius:16px; padding:15px; box-shadow:0 4px 15px rgba(0,0,0,0.02); border:1px solid #f0f0f0; margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <img src="${f.avatar}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;">
                            <div>
                                <div style="font-weight:700; font-size:14px; color:#333;">${f.remark || f.realName}</div>
                                <div style="font-size:10px; color:#999;">本月已花: ¥${info.spent.toFixed(2)}</div>
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:10px; color:#888;">剩余额度</div>
                            <div style="font-size:14px; font-weight:700; color:#2b2b2b;">${remain === '无限' ? '无限额度' : '¥' + remain}</div>
                        </div>
                    </div>
                    <div style="display:flex; gap:10px; border-top:1px solid #f0f0f0; padding-top:10px; margin-top:10px;">
                        <button class="btn-secondary" style="flex:1; height:30px; font-size:11px;" onclick="unbindIntimate('${id}')">解除绑定</button>
                    </div>
                </div>
            `;
        });
    }

    // 2. 别人给我的
    const bindsFrom = Object.keys(payData.intimatePayFrom || {});
    if(bindsFrom.length > 0) {
        html += `<div style="font-size:12px; color:#999; margin:20px 0 10px;">TA为我开通的亲密付</div>`;
        bindsFrom.forEach(id => {
            const info = payData.intimatePayFrom[id];
            const f = friendsData[id] || { realName: id, avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}` };
            const nowMonth = new Date().getMonth();
            if(info.month !== nowMonth) { info.spent = 0; info.month = nowMonth; savePayData(); }
            const remain = info.limit === '无限' ? '无限' : (info.limit - info.spent).toFixed(2);
html += `
    <div class="intimate-card" style="background:#fff; border-radius:16px; padding:15px; box-shadow:0 4px 15px rgba(0,0,0,0.02); border:1px solid #f0f0f0; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:10px;">
                <img src="${f.avatar}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;">
                <div>
                    <div style="font-weight:700; font-size:14px; color:#333;">${f.remark || f.realName}</div>
                    <div style="font-size:10px; color:#999;">我已消费: ¥${info.spent.toFixed(2)}</div>
                </div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:10px; color:#888;">可用额度</div>
                <div style="font-size:14px; font-weight:700; color:#07c160;">${remain === '无限' ? '无限额度' : '¥' + remain}</div>
            </div>
        </div>

        <div style="display:flex; gap:10px; border-top:1px solid #f0f0f0; padding-top:10px; margin-top:10px;">
            <button class="btn-secondary" style="flex:1; height:30px; font-size:11px;" onclick="unbindIntimateFrom('${id}')">解绑</button>
        </div>
    </div>
`;

        });
    }

    if(html === '') {
        html = '<div style="text-align:center; color:#999; font-size:12px; padding:40px 20px;">暂无亲密付记录</div>';
    }

    list.innerHTML = html;
}

window.openBindIntimateModal = function() {
    const select = document.getElementById('intimate-ai-select');
    select.innerHTML = '';
    Object.keys(friendsData).forEach(id => {
        if(!payData.intimatePay[id]) {
            const f = friendsData[id];
            select.innerHTML += `<option value="${id}">${f.remark || f.realName}</option>`;
        }
    });
    if(select.options.length === 0) { alert("没有可绑定的 AI"); return; }
    document.getElementById('intimate-limit-input').value = '';
    document.getElementById('modal-bind-intimate').classList.add('active');
}

window.unbindIntimate = function(id) {
    if(confirm("确定要解除对 TA 的亲密付吗？")) {
        delete payData.intimatePay[id];
        savePayData();
        renderIntimatePage();
    }
}
window.unbindIntimateFrom = function(id) {
    if (confirm("确定要解绑 TA 给你的亲密付吗？")) {
        if (!payData.intimatePayFrom) payData.intimatePayFrom = {};
        delete payData.intimatePayFrom[id];
        savePayData();
        renderIntimatePage();
    }
};

function simulateIntimatePayConsumption() {
    if(Math.random() > 0.3) return;
    const binds = Object.keys(payData.intimatePay);
    if(binds.length === 0) return;
    const id = binds[Math.floor(Math.random() * binds.length)];
    const info = payData.intimatePay[id];
    const remain = info.limit - info.spent;
    if(remain > 10 && payData.balance > 10) {
        let cost = Math.floor(Math.random() * 190) + 10;
        cost = Math.min(cost, remain, payData.balance);
        const f = friendsData[id];
        const name = f ? (f.remark || f.realName) : id;
        const items = ['买了杯奶茶', '点了一份外卖', '买了一束花', '充值了游戏', '买了张电影票'];
        const desc = items[Math.floor(Math.random() * items.length)];
        info.spent += cost;
        payData.balance -= cost;
        addTransaction(`亲密付: ${name} ${desc}`, cost, 'expense');
        savePayData();
        setTimeout(() => { 
            showToast(`<i class="fas fa-shopping-bag" style="color:#07c160;"></i> 你的宝贝 "${name}" 刚花掉 ¥${cost.toFixed(2)} (${desc})`); 
        }, 3000);
    }
}

let partTimeCooldown = false;
window.doPartTimeWork = function() {
    if(partTimeCooldown) return;
    partTimeCooldown = true;
    const earn = Math.floor(Math.random() * 26) + 5;
    payData.balance += earn;
    addTransaction('兼职打工收入', earn, 'income');
    savePayData();
    const fb = document.getElementById('work-feedback');
    fb.innerText = `+ ¥${earn.toFixed(2)}`;
    fb.style.opacity = '1';
    fb.style.transform = 'translateY(-10px)';
    setTimeout(() => {
        fb.style.opacity = '0';
        fb.style.transform = 'translateY(0)';
        partTimeCooldown = false;
    }, 1000);
}

/* =================================================================
   [核心逻辑修复] 多身份系统 (已切换至 IDB 大容量存储)
   ================================================================= */

const PERSONA_META_KEY = 'myCoolPhone_personaMeta';
const CURRENT_PERSONA_KEY = 'myCoolPhone_currentPersonaId';

let personasMeta = {};
let currentPersonaId = 'p_default';

// 1. 初始化系统 (改为异步加载，从 IDB 读取)
async function initPersonaSystem() {
    // 尝试从大仓库 IDB 获取
    let data = await IDB.get(PERSONA_META_KEY);

    // 如果 IDB 里没数据，试试看是不是还在 LocalStorage 里 (迁移旧数据)
    if (!data) {
        const oldData = localStorage.getItem(PERSONA_META_KEY);
        if (oldData) {
            try {
                data = JSON.parse(oldData);
                await IDB.set(PERSONA_META_KEY, data); // 搬家到大仓库
                // localStorage.removeItem(PERSONA_META_KEY); // 可选：删掉旧的腾空间
            } catch (e) { console.error(e); }
        }
    }

    // 如果还是没数据，创建默认身份
    if (!data || Object.keys(data).length === 0) {
        data = {
            p_default: {
                id: 'p_default', name: 'Hannah', gender: '女',
                avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop',
                persona: '默认身份'
            }
        };
        await IDB.set(PERSONA_META_KEY, data);
    }
    
    personasMeta = data;

    // 读取当前是谁 (ID 很短，存 LocalStorage 没问题)
    currentPersonaId = localStorage.getItem(CURRENT_PERSONA_KEY) || 'p_default';
    if (!personasMeta[currentPersonaId]) currentPersonaId = 'p_default';
    
    // 加载完数据后，立刻刷新一下 UI
    applyPersonaToUI();
}

// 2. 获取带身份后缀的 Key
function scopedLSKey(baseKey) {
    return `${baseKey}__${currentPersonaId}`;
}
window.scopedChatKey = function(chatId) {
    return `chat_history__${currentPersonaId}__${chatId}`;
}

// 3. 应用身份到 UI (修改版：解除首页绑定，增加 Pay 页绑定)
function applyPersonaToUI() {
    const me = personasMeta[currentPersonaId];
    if (!me) return;

    // === 核心修改：注释掉首页头部更新，让首页保持独立/手动 ===
    // const homeName = document.querySelector('.editable-name');
    // const homeAvatar = document.querySelector('.avatar-circle-sm img');
    // if (homeName) homeName.innerText = me.name || 'Me';
    // if (homeAvatar) homeAvatar.src = me.avatar || '';
    
    // 1. 更新 WeChat Me 页 (保持不变)
    const meAvatar = document.querySelector('#tab-me .wc-avatar.lg img');
    const meName = document.querySelector('#tab-me .wc-me-name');
    const meId = document.querySelector('#tab-me .wc-me-id');
    
    if (meAvatar) meAvatar.src = me.avatar || '';
    if (meName) meName.innerText = me.name || 'Me';
    if (meId) meId.innerText = `ID: ${me.wxId || 'unknown'}`;

    // 2. 更新 朋友圈 (保持不变)
    const momentsAvatar = document.querySelector('.user-avatar-overlay img');
    const momentsName = document.querySelector('.user-name-overlay');
    const momentsBg = document.getElementById('moments-header-bg');

    if (momentsAvatar) momentsAvatar.src = me.avatar || '';
    if (momentsName) momentsName.innerText = me.name || 'Daily Moments';
    if (momentsBg && me.momentsBg) {
        momentsBg.style.backgroundImage = `url('${me.momentsBg}')`;
    }

    // 3. === 新增：更新 Pay 钱包页的人设显示 ===
    const payAvatar = document.getElementById('pay-persona-avatar');
    const payName = document.getElementById('pay-persona-name');
    if (payAvatar) payAvatar.src = me.avatar || '';
    if (payName) payName.innerText = me.name || 'Me';

    // 更新全局变量
    if (typeof AVATAR_USER !== 'undefined') AVATAR_USER = me.avatar || AVATAR_USER;
    const gp = document.getElementById('my-global-persona');
    if (gp) gp.value = me.persona || '';
}

/* ===== 弹窗操作函数 ===== */

window.openIdentityModal = function(e) {
    if(e) e.stopPropagation();
    const modal = document.getElementById('identity-modal');
    if (!modal) return;
    
    renderIdentitySelect();
    fillIdentityForm(currentPersonaId);
    modal.classList.add('active');
};

window.closeIdentityModal = function() {
    document.getElementById('identity-modal').classList.remove('active');
};

function renderIdentitySelect() {
    const sel = document.getElementById('identity-select');
    if(!sel) return;
    sel.innerHTML = '';
    Object.values(personasMeta).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name} (${p.gender || '未知'})`;
        if (p.id === currentPersonaId) opt.selected = true;
        sel.appendChild(opt);
    });
}

window.onIdentitySelectChange = function(id) {
    fillIdentityForm(id);
};

function fillIdentityForm(id) {
    const p = personasMeta[id];
    if (!p) return;
    document.getElementById('id-name').value = p.name || '';
    document.getElementById('id-avatar-url').value = p.avatar || '';
    document.getElementById('id-moments-bg').value = p.momentsBg || '';
    document.getElementById('id-persona').value = p.persona || '';
    
    updateIdPreview(p.avatar);

    const genderSel = document.getElementById('id-gender-select');
    const genderInp = document.getElementById('id-gender-input');
    if (['男','女'].includes(p.gender)) {
        genderSel.value = p.gender;
        genderInp.style.display = 'none';
    } else {
        genderSel.value = 'custom';
        genderInp.style.display = 'block';
        genderInp.value = p.gender || '';
    }
}

// 图片压缩 (依然保留，虽然空间大了，但压缩能让界面跑得更快)
function compressAvatarImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                // 稍微放宽一点限制，允许 300px
                const maxWidth = 300; 
                let w = img.width;
                let h = img.height;
                if (w > maxWidth) {
                    h = Math.round(h * (maxWidth / w));
                    w = maxWidth;
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                resolve(dataUrl);
            };
        };
    });
}

window.handleIdAvatarFile = async function(input) {
    if (input.files && input.files[0]) {
        try {
            const previewImg = document.getElementById('id-preview-img');
            previewImg.style.opacity = '0.5';
            const compressedBase64 = await compressAvatarImage(input.files[0]);
            previewImg.src = compressedBase64;
            previewImg.style.opacity = '1';
            previewImg.setAttribute('data-base64', compressedBase64);
            document.getElementById('id-avatar-url').value = '';
        } catch (e) {
            alert("图片处理失败");
        }
    }
};

window.toggleIdGenderInput = function(val) {
    document.getElementById('id-gender-input').style.display = (val === 'custom') ? 'block' : 'none';
};
window.updateIdPreview = function(url) {
    document.getElementById('id-preview-img').src = url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${Date.now()}`;
};

// 新建身份 (写入 IDB)
window.createNewIdentity = async function() {
    const id = 'p_' + Date.now();
    personasMeta[id] = {
        id: id, name: '新身份', gender: '未知',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + id,
        persona: ''
    };
    // === 关键：保存到 IDB ===
    await IDB.set(PERSONA_META_KEY, personasMeta);
    
    renderIdentitySelect();
    document.getElementById('identity-select').value = id;
    fillIdentityForm(id);
};

// 删除身份 (写入 IDB)
window.deleteCurrentIdentity = async function() {
    const id = document.getElementById('identity-select').value;
    if (Object.keys(personasMeta).length <= 1) return alert('至少保留一个身份！');
    if (!confirm('确认删除？数据无法恢复。')) return;
    
    delete personasMeta[id];
    if (currentPersonaId === id) currentPersonaId = Object.keys(personasMeta)[0];
    
    // === 关键：保存到 IDB ===
    await IDB.set(PERSONA_META_KEY, personasMeta);
    localStorage.setItem(CURRENT_PERSONA_KEY, currentPersonaId);
    
    renderIdentitySelect();
    fillIdentityForm(currentPersonaId);
};

// 保存并切换 (写入 IDB)
window.saveAndSwitchIdentity = async function() {
    const id = document.getElementById('identity-select').value;
    const p = personasMeta[id];
    if (!p) return;

    // 更新数据
    p.name = document.getElementById('id-name').value.trim() || '未命名';
    p.momentsBg = document.getElementById('id-moments-bg').value.trim();
    p.persona = document.getElementById('id-persona').value.trim();
    
    const gSel = document.getElementById('id-gender-select').value;
    p.gender = (gSel === 'custom') ? document.getElementById('id-gender-input').value.trim() : gSel;

    const previewImg = document.getElementById('id-preview-img');
    const newBase64 = previewImg.getAttribute('data-base64');
    const newUrl = document.getElementById('id-avatar-url').value.trim();
    
    if (newBase64) p.avatar = newBase64;
    else if (newUrl) p.avatar = newUrl;

    try {
        // === 关键修改：存入大仓库 IDB ===
        await IDB.set(PERSONA_META_KEY, personasMeta);
        
        // ID 存入 LocalStorage (因为它很短，没关系)
        localStorage.setItem(CURRENT_PERSONA_KEY, id);
        
        currentPersonaId = id;
        closeIdentityModal();

        // 刷新界面
        const chatLayer = document.getElementById('chatLayer');
        if (chatLayer) chatLayer.classList.remove('show');
        document.getElementById('chatMessages').innerHTML = '';
        
        friendsData = {}; 
        momentsFeed = [];
        await loadFriendsData();
        loadMomentsFeed();
        applyPersonaToUI();
        
        previewImg.removeAttribute('data-base64');
        alert("保存并切换成功！");

    } catch (e) {
        alert("保存出错：" + e.message);
        console.error(e);
    }
};
/* =========================================
   [超级版] 亲密付 AI 自主决策与完美路由
   ========================================= */

// 1. 我在钱包里操作发给对方 (开通)
window.confirmBindIntimate = async function() {
    const id = document.getElementById('intimate-ai-select').value;
    const inputVal = document.getElementById('intimate-limit-input').value.trim();
    
    let limit = inputVal === '无限' ? '无限' : parseFloat(inputVal);
    if(limit !== '无限' && (isNaN(limit) || limit <= 0)) { alert("请输入有效的额度！"); return; }

    document.getElementById('modal-bind-intimate').classList.remove('active');
    
    const msgId = 'invite_me_' + Date.now();
    const tagText = `[INTIMATE_ME2AI:${limit}:pending:${msgId}]`;

    // 【核心修复】加上 await，必须等存入数据库后再跳转
    await saveMessageToHistory(id, { text: tagText, type: 'sent', senderName: 'ME' });
    
    // 关闭钱包，打开聊天
    closePayApp();
    const wechatApp = document.getElementById('wechatApp');
    if (!wechatApp.classList.contains('open')) wechatApp.classList.add('open');
    
    // 【核心修复】重新渲染聊天界面，保证卡片出现
    await openChatDetail(id);

    // 【全新逻辑】向 AI 发送隐式指令，逼迫 AI 做出决定
    const aiPrompt = `[System Command: The user just offered you an Intimate Pay (shared wallet) with a limit of ${limit}. Based on your current mood and persona, do you accept or reject it? 
    You MUST include either the exact tag [INTIMATE_ACCEPT] or [INTIMATE_REJECT] anywhere in your reply, followed by what you want to say to the user.]`;
    
    sendMessageToAI(aiPrompt);
}

// 2. 只有我收 AI 钱时，才需要手动点击
window.handleIntimateAction = async function(inviteId, amountStr, decision, typeMode) {
    if(!currentChatId || typeMode !== 'AI2ME') return;

    let history = await loadChatHistory(currentChatId);
    let targetMsg = history.find(m => m.text.includes(inviteId));
    if (targetMsg) {
        targetMsg.text = targetMsg.text.replace(':pending:', `:${decision}:`);
        await IDB.set(scopedChatKey(currentChatId), history);
    }
    
    openChatDetail(currentChatId);

    let limit = amountStr === '无限' ? '无限' : parseFloat(amountStr);

    if (decision === 'accepted') {
        if (!payData.intimatePayFrom) payData.intimatePayFrom = {};
        payData.intimatePayFrom[currentChatId] = { limit: limit, spent: 0, month: new Date().getMonth() };
        savePayData();
        
        appendMessage("哇！谢谢宝宝的亲密付，我收下啦~ 💕", 'sent');
        saveMessageToHistory(currentChatId, { text: "哇！谢谢宝宝的亲密付，我收下啦~ 💕", type: 'sent', senderName: 'ME' });
        sendMessageToAI(`[System: I happily accepted your Intimate Pay of ${amountStr}. React naturally.]`);
    } else {
        appendMessage("不用啦，心意我领了，我自己有钱花~ ✨", 'sent');
        saveMessageToHistory(currentChatId, { text: "不用啦，心意我领了，我自己有钱花~ ✨", type: 'sent', senderName: 'ME' });
        sendMessageToAI(`[System: I kindly rejected your Intimate Pay. React naturally.]`);
    }
}
// === [新增] 全局窄弹窗提示 ===
window.showToast = function(msg) {
    let toast = document.getElementById('k-global-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'k-global-toast';
        document.body.appendChild(toast);
    }
    toast.innerHTML = msg;
    toast.classList.add('show');
    
    if(window.toastTimer) clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
/* ====================================================
   [更新] 主页/P3/P4 自定义内容保存与恢复逻辑
   ==================================================== */

// 1. 页面加载时恢复所有图片和文字
function restoreHomeCustom() {
    const cfg = JSON.parse(localStorage.getItem(HOME_CUSTOM_KEY) || '{}');
    if (!cfg) return;

    // --- Page 1 & 2 (原有逻辑) ---
    // 头像
    const avatarWrap = document.querySelector('.avatar-circle-sm[data-edit-key="avatar"]');
    if (avatarWrap && cfg.avatar) {
        const img = avatarWrap.querySelector('img');
        if (img) img.src = cfg.avatar;
    }
    // 音乐封面（P1 唱片中心）
    const musicEl = document.querySelector('.vinyl-inner[data-edit-key="music"]');
    if (musicEl && cfg.music) {
        musicEl.style.backgroundImage = `url('${cfg.music}')`;
    }
    // P2 相册 (img src)
    ['photo1','photo2','photo3'].forEach(key => {
        const img = document.querySelector(`img[data-edit-key="${key}"]`);
        if (img && cfg[key]) img.src = cfg[key];
    });

    // --- Page 3 (新增) ---
    // CD 封面 (背景图)
    const cdEl = document.querySelector('.k-disc[data-edit-key="k_cd_cover"]');
    if (cdEl && cfg.k_cd_cover) {
        cdEl.style.backgroundImage = `url('${cfg.k_cd_cover}')`;
    }
    // 拍立得照片 (背景图)
    const polEl = document.querySelector('.k-photo-frame[data-edit-key="k_polaroid_img"]');
    if (polEl && cfg.k_polaroid_img) {
        polEl.style.backgroundImage = `url('${cfg.k_polaroid_img}')`;
    }

    // --- Page 4 (新增) ---
    // 滚动组件右侧圆图 (img src)
    const tickerImg = document.querySelector('img[data-edit-key="p4_ticker_img"]');
    if (tickerImg && cfg.p4_ticker_img) {
        tickerImg.src = cfg.p4_ticker_img;
    }
}

// 2. 初始化文字编辑监听 (文字失焦即保存)
function initHomeEditableText() {
    const cfg = JSON.parse(localStorage.getItem(HOME_CUSTOM_KEY) || '{}');
    
    // 定义所有需要保存文字的元素 ID 及其对应的存储 Key
    const textMap = [
        { id: 'p2-title', key: 'p2Title' },          // P2 标题
        { id: 'p2-subtitle', key: 'p2Subtitle' },    // P2 副标题
        { id: 'p3-song', key: 'p3Song' },            // P3 歌名
        { id: 'p3-artist', key: 'p3Artist' },        // P3 歌手
        { id: 'p3-handwriting', key: 'p3Handwriting' } // P3 手写字
    ];

    textMap.forEach(item => {
        const el = document.getElementById(item.id);
        if (el) {
            // A. 恢复文字
            if (cfg[item.key]) {
                el.innerText = cfg[item.key];
            }
            
            // B. 绑定保存事件 (Blur)
            el.addEventListener('blur', () => {
                const currentCfg = JSON.parse(localStorage.getItem(HOME_CUSTOM_KEY) || '{}');
                currentCfg[item.key] = el.innerText.trim(); // 存入 key
                localStorage.setItem(HOME_CUSTOM_KEY, JSON.stringify(currentCfg));
                console.log(`Saved ${item.key}: ${el.innerText}`);
            });
        }
    });
}

// 3. 图片保存逻辑 (无需修改，确保 applyImage 调用它即可)
function saveHomeImage(el, imgSrc) {
    const key = el.dataset.editKey; // 获取 data-edit-key
    if (!key) return;

    const cfg = JSON.parse(localStorage.getItem(HOME_CUSTOM_KEY) || '{}');
    cfg[key] = imgSrc;
    localStorage.setItem(HOME_CUSTOM_KEY, JSON.stringify(cfg));
    console.log(`Saved Image Key: ${key}`);
}
/* =========================================
   [全新] 兼职中心游戏逻辑 (Pay Part-time)
   ========================================= */

let jobTimer = null;
let gameInterval = null;
let currentJobId = 0;
let jobScore = 0;
let jobTarget = 0; // 目标分数
let gameRunning = false;

// 启动工作入口
window.startJob = function(jobId) {
    currentJobId = jobId;
    document.getElementById('pt-job-board').style.display = 'none';
    document.getElementById('pt-game-stage').style.display = 'flex';
    
    // 隐藏所有游戏视图
    document.querySelectorAll('.game-view-box').forEach(el => el.style.display = 'none');
    document.getElementById(`game-view-${jobId}`).style.display = 'flex'; // 显示对应游戏
    if(jobId === 1) document.getElementById(`game-view-${jobId}`).style.display = 'block'; 
    
    gameRunning = true;
    jobScore = 0;
    updateJobUI();

    if (jobId === 1) initGame1();
    else if (jobId === 2) initGame2();
    else if (jobId === 3) initGame3();
}

// 退出工作
window.quitJob = function() {
    gameRunning = false;
    clearInterval(jobTimer);
    clearInterval(gameInterval);
    
    if(g3AnimFrame) cancelAnimationFrame(g3AnimFrame);

    document.getElementById('pt-game-stage').style.display = 'none';
    document.getElementById('pt-job-board').style.display = 'block';
    
    // 清理残留
    document.getElementById('g1-belt').innerHTML = '';
}

function updateJobUI() {
    document.getElementById('game-score').innerText = `${jobScore}`;
}

// 通用倒计时
function startJobTimer(seconds, onFinish) {
    const el = document.getElementById('game-timer');
    let t = seconds;
    el.innerText = `00:${t < 10 ? '0'+t : t}`;
    
    jobTimer = setInterval(() => {
        t--;
        el.innerText = `00:${t < 10 ? '0'+t : t}`;
        if (t <= 0) {
            clearInterval(jobTimer);
            onFinish();
        }
    }, 1000);
}

// 结算
function finishJob(success, reward) {
    gameRunning = false;
    clearInterval(jobTimer);
    clearInterval(gameInterval);
    if(g3AnimFrame) cancelAnimationFrame(g3AnimFrame);

    if (success) {
        payData.balance += reward;
        addTransaction('兼职打工收入', reward, 'income');
        savePayData();
        showKAlert(`<b style="color:#111; font-size:16px;">辛苦啦，打工人！(๑•̀ㅂ•́)و✧</b><br><br>老板很满意你的表现，给你发了工资：<br><br><b style="font-size:24px; color:#111;">¥${reward}</b><br><br>去搓顿好的吧！`, quitJob);
    } else {
        showKAlert(`<b style="color:#ff4d4f; font-size:16px;">搞砸啦！(；′⌒\`)</b><br><br>老板看着一团糟的现场，把你扫地出门了。<br>白干啦，没钱拿~<br>下次再来吧！`, quitJob);
    }
}

// === 游戏 1: 收银员 (点击掉落物) ===
function initGame1() {
    jobTarget = 15; // 目标：扫描15个
    document.getElementById('game-score').innerText = `0 / ${jobTarget}`;
    
    startJobTimer(15, () => { // 15秒扫15个
        finishJob(jobScore >= jobTarget, 200);
    });

    const belt = document.getElementById('g1-belt');
    // 可爱商品
    const emojis = ['🍎','🍼','🍞','🍙','🍰','🍬','🍪','🥤'];
    
    gameInterval = setInterval(() => {
        if(!gameRunning) return;
        const item = document.createElement('div');
        item.className = 'g1-item';
        item.innerText = emojis[Math.floor(Math.random() * emojis.length)];
        
        // 随机在左右 10% - 80% 范围内掉落
        item.style.left = (Math.random() * 70 + 10) + '%';
        
        // 速度稍微随机一点
        const duration = Math.random() * 1 + 2; // 2s - 3s 下落
        item.style.animationDuration = duration + 's';
        
        // 绑定点击消除
        item.onpointerdown = (e) => {
            e.stopPropagation();
            item.remove();
            jobScore++;
            document.getElementById('game-score').innerText = `${jobScore} / ${jobTarget}`;
            // 手机振动
            if(navigator.vibrate) navigator.vibrate(15);
        };
        
        belt.appendChild(item);
        
        // 超出屏幕后自己删掉防卡顿
        setTimeout(() => { if(item.parentNode) item.remove(); }, duration * 1000 + 200);
        
    }, 500); // 0.5秒掉一个，有点小密集
}

// === 游戏 2: 咖啡师 (配方记忆) ===
let g2Recipe = [];
let g2CurrentMix = [];
let g2EmojiMix = [];
const g2RecipesDB = [
    { name: "冰美式", need: ['Ice', 'Water', 'Espresso'], emoji: '🧊+💧+☕️' },
    { name: "热拿铁", need: ['Espresso', 'Milk'], emoji: '☕️+🥛' },
    { name: "焦糖玛奇朵", need: ['Syrup', 'Milk', 'Espresso'], emoji: '🍯+🥛+☕️' },
    { name: "冰水", need: ['Ice', 'Water'], emoji: '🧊+💧' },
    { name: "特调甜咖", need: ['Syrup', 'Espresso', 'Milk', 'Ice'], emoji: '🍯+☕️+🥛+🧊' }
];

function initGame2() {
    jobScore = 0; // 完成单数
    jobTarget = 4; // 目标：做对4杯
    document.getElementById('game-score').innerText = `完成: 0 / ${jobTarget}`;
    g2NextOrder();
    
    startJobTimer(30, () => { // 30秒内做4杯
        finishJob(jobScore >= jobTarget, 2000);
    });
}

function g2NextOrder() {
    g2CurrentMix = [];
    g2EmojiMix = [];
    updateCupVisual();
    
    const r = g2RecipesDB[Math.floor(Math.random() * g2RecipesDB.length)];
    g2Recipe = r.need;
    // 提示语变可爱
    const greetings = ["你好！我要一杯", "来一杯", "快给我做杯", "麻烦来个"];
    const g = greetings[Math.floor(Math.random() * greetings.length)];
    
    document.getElementById('g2-order-text').innerHTML = `💬 ${g}<b>${r.name}</b>！<br><span style="font-size:11px; color:#888;">配方：${r.emoji}</span>`;
}

// 添加材料
window.g2Add = function(ing, emojiStr) {
    if(g2CurrentMix.length >= 6) return; // 最多加6次
    g2CurrentMix.push(ing);
    g2EmojiMix.push(emojiStr);
    updateCupVisual();
}

function updateCupVisual() {
    const liquid = document.getElementById('g2-liquid');
    
    // 杯子里不只显示颜色，把emoji叠加上去
    // 先检查有没有存放emoji的div，没有就建一个
    let container = document.getElementById('g2-ingredients-display');
    if(!container) {
        container = document.createElement('div');
        container.id = 'g2-ingredients-display';
        document.getElementById('g2-cup').appendChild(container);
    }
    
    // 更新液面高度
    const height = Math.min(100, g2CurrentMix.length * 20);
    liquid.style.height = height + '%';
    
    // 渲染杯里的emoji
    container.innerHTML = g2EmojiMix.join('<br>');

    // 颜色混合
    if(g2CurrentMix.includes('Espresso') && g2CurrentMix.includes('Milk')) {
        liquid.style.background = '#c8a382'; // 拿铁色
    } else if(g2CurrentMix.includes('Milk')) {
        liquid.style.background = '#f1f2f6'; 
    } else if(g2CurrentMix.includes('Espresso')) {
        liquid.style.background = '#4a3320'; 
    } else if(g2CurrentMix.includes('Water')) {
        liquid.style.background = '#dff9fb'; 
    } else {
        liquid.style.background = 'transparent';
    }
}

// 提交订单
window.g2Serve = function() {
    if (g2CurrentMix.length === 0) {
        showToast("杯子是空的呀喂！");
        return;
    }
    
    // 判断对错（这里严格要求顺序一致）
    const isCorrect = JSON.stringify(g2CurrentMix) === JSON.stringify(g2Recipe);
    
    if(isCorrect) {
        jobScore++;
        document.getElementById('game-score').innerText = `完成: ${jobScore} / ${jobTarget}`;
        showToast("✅ 完美！客人很开心~");
        if(jobScore >= jobTarget) {
            finishJob(true, 2000);
        } else {
            g2NextOrder();
        }
    } else {
        showToast("❌ 做错了！客人骂骂咧咧，赶紧重做！");
        g2CurrentMix = [];
        g2EmojiMix = [];
        updateCupVisual();
    }
}

// === 游戏 3: 黑客 (信号校准) ===
let g3CursorPos = 0;
let g3Direction = 1; // 1 or -1
let g3Speed = 2; // 初始速度
let g3Level = 1;
let g3TargetWidth = 40;
let g3AnimFrame = null;
const G3_CONTAINER_WIDTH = 276; // 280减去边框

function initGame3() {
    g3Level = 1;
    g3Speed = 3; 
    g3TargetWidth = 50; 
    document.getElementById('game-score').innerText = `进度: 0/3`;
    startG3Level();
    document.getElementById('game-timer').innerText = "LIVE"; 
}

function startG3Level() {
    document.getElementById('g3-level').innerText = `层级 ${g3Level}/3`;
    document.getElementById('g3-msg').innerText = "等待指令...";
    document.getElementById('g3-msg').style.color = "#888";
    
    // 随机目标位置，注意不要出界
    const targetEl = document.getElementById('g3-target');
    targetEl.style.width = g3TargetWidth + 'px';
    
    const maxLeft = G3_CONTAINER_WIDTH - g3TargetWidth;
    const randomLeft = Math.random() * maxLeft;
    targetEl.style.left = randomLeft + 'px'; 
    
    // 重置光标
    g3CursorPos = 0;
    
    // 启动动画
    g3Loop();
}

function g3Loop() {
    const cursor = document.getElementById('g3-cursor');
    g3CursorPos += g3Speed * g3Direction;
    
    // 碰壁反弹，留点余量防溢出
    if (g3CursorPos >= G3_CONTAINER_WIDTH - 4) {
        g3CursorPos = G3_CONTAINER_WIDTH - 4;
        g3Direction = -1;
    } else if (g3CursorPos <= 0) {
        g3CursorPos = 0;
        g3Direction = 1;
    }
    
    cursor.style.left = g3CursorPos + 'px';
    
    if(gameRunning) {
        g3AnimFrame = requestAnimationFrame(g3Loop);
    }
}

window.g3Lock = function() {
    cancelAnimationFrame(g3AnimFrame);
    
    const targetEl = document.getElementById('g3-target');
    const targetLeft = parseFloat(targetEl.style.left);
    const targetRight = targetLeft + g3TargetWidth;
    
    // 判断光标是否在白框内部
    // 光标宽度是4，只要它的中心在范围内就算过
    const cursorCenter = g3CursorPos + 2; 

    if (cursorCenter >= targetLeft && cursorCenter <= targetRight) {
        // 成功
        document.getElementById('g3-msg').innerText = "[ 破解成功，权限提升 ]";
        document.getElementById('g3-msg').style.color = "#fff";
        document.getElementById('game-score').innerText = `进度: ${g3Level}/3`;
        
        setTimeout(() => {
            if (g3Level >= 3) {
                finishJob(true, 8000);
            } else {
                g3Level++;
                g3Speed += 1.5; // 加速
                g3TargetWidth -= 10; // 变窄
                startG3Level();
            }
        }, 800);
    } else {
        // 失败
        document.getElementById('g3-msg').innerText = "[ 警告：行踪暴露！断开连接 ]";
        document.getElementById('g3-msg').style.color = "#ff4d4f";
        setTimeout(() => {
            finishJob(false, 0); 
        }, 800);
    }
}
/* =========================================
   [新增] 模拟股市 (Stock Market) 幽默引擎
   ========================================= */
const STOCK_MARKET_KEY = 'myCoolPhone_stockMarket';

// 预设的恶搞股票列表
const stockCompanies = [
    { id: 's1', name: '摸鱼科技', code: 'MOYU.00', basePrice: 50, volatility: 0.15 },
    { id: 's2', name: '熬夜防脱发集团', code: 'HAIR.99', basePrice: 120, volatility: 0.2 },
    { id: 's3', name: '西红柿南瓜农业', code: 'CYB.01', basePrice: 15, volatility: 0.3 },
    { id: 's4', name: '狗粮猫粮无限公司', code: 'CAT.404', basePrice: 88, volatility: 0.1 },
    { id: 's5', name: '宇宙和平开发局', code: 'PEAC.00', basePrice: 300, volatility: 0.05 }
];

// 有趣的上涨/下跌理由
const stockNews = {
    up: [
        "老板今天没来，全员开心，效率奇迹般提升 200%",
        "外星人宣布对该公司进行战略投资，资金到位",
        "研发出了能在梦里打工的机器，产能原地爆炸",
        "董事长被拍到在街头吃煎饼果子，十分接地气，股票大涨",
        "保洁阿姨不小心碰到了服务器，居然修复了十年的祖传 Bug",
        "宣布进军『量子养生』领域，受到不明真相的资本疯狂追捧",
        "规定员工每天必须带猫上班，公司氛围极佳，效率暴增"
    ],
    down: [
        "核心程序员由于迟迟找不到对象，心态崩溃删库跑路了",
        "被媒体曝光主营业务其实是在天桥底下卖烤地瓜",
        "公司空调坏了，全员流汗罢工抗议",
        "董事长在发布会上把 PPT 念反了，惨遭 B 站做成鬼畜视频",
        "新产品一上线就引发了半人马座星人的严重抗议",
        "由于老板频繁画大饼，导致公司食堂面粉严重短缺",
        "财务总监买彩票输光了公司团建的经费"
    ],
    flat: [
        "今天无事发生，大家都在工位上安静地摸鱼",
        "股市休眠中，因为交易员都集体去睡午觉了",
        "一切平稳，连只苍蝇都没飞过"
    ]
};

let currentMarket = {}; 

function initStockMarket() {
    if (!payData.stocks) payData.stocks = {}; 
    const savedMarket = localStorage.getItem(STOCK_MARKET_KEY);
    if (savedMarket) currentMarket = JSON.parse(savedMarket);
    else generateNewMarket();
}

// 手动刷新行情
window.refreshStockMarket = function() {
    generateNewMarket();
    renderStockPage();
    showToast("市场行情已刷新！");
}

function generateNewMarket() {
    stockCompanies.forEach(company => {
        const oldPrice = currentMarket[company.id] ? currentMarket[company.id].price : company.basePrice;
        
        // 随机涨跌幅 (-volatility 到 +volatility)
        const changeRate = (Math.random() * 2 - 1) * company.volatility;
        let newPrice = oldPrice * (1 + changeRate);
        if (newPrice < 1) newPrice = 1; // 跌到底限价
        
        let trend = 'flat';
        let news = stockNews.flat[Math.floor(Math.random() * stockNews.flat.length)];
        
        if (changeRate > 0.02) {
            trend = 'up';
            news = stockNews.up[Math.floor(Math.random() * stockNews.up.length)];
        } else if (changeRate < -0.02) {
            trend = 'down';
            news = stockNews.down[Math.floor(Math.random() * stockNews.down.length)];
        }
        
        currentMarket[company.id] = {
            price: parseFloat(newPrice.toFixed(2)),
            changeRate: changeRate,
            trend: trend,
            news: news
        };
    });
    localStorage.setItem(STOCK_MARKET_KEY, JSON.stringify(currentMarket));
}

// 渲染股市页面
window.renderStockPage = function() {
    initStockMarket();
    document.getElementById('stock-available-balance').innerText = payData.balance.toFixed(2);
    
    let totalValue = 0;
    let totalCost = 0;
    
    const list = document.getElementById('stock-market-list');
    list.innerHTML = '';
    
    stockCompanies.forEach(company => {
        const marketData = currentMarket[company.id];
        const holdings = payData.stocks[company.id] || { shares: 0, cost: 0 };
        
        totalValue += holdings.shares * marketData.price;
        totalCost += holdings.cost;
        
        const percentStr = (marketData.changeRate > 0 ? '+' : '') + (marketData.changeRate * 100).toFixed(2) + '%';
        
        let tagClass = 'stock-flat';
        let priceClass = '';
        if (marketData.trend === 'up') { tagClass = 'stock-up'; priceClass = 'stock-color-up'; }
        else if (marketData.trend === 'down') { tagClass = 'stock-down'; priceClass = 'stock-color-down'; }
        
        const item = document.createElement('div');
        item.className = 'stock-card';
        item.onclick = () => openStockDetail(company.id);
        item.innerHTML = `
            <div class="stock-info-left">
                <span class="stock-name">${company.name}</span>
                <span class="stock-code">${company.code} ${holdings.shares > 0 ? `<span style="color:#111; font-weight:700;">(持 ${holdings.shares} 股)</span>` : ''}</span>
            </div>
            <div class="stock-info-right">
                <span class="stock-price ${priceClass}">${marketData.price.toFixed(2)}</span>
                <span class="stock-tag ${tagClass}">${percentStr}</span>
            </div>
        `;
        list.appendChild(item);
    });
    
    document.getElementById('stock-total-value').innerText = totalValue.toFixed(2);
    const profit = totalValue - totalCost;
    const profitEl = document.getElementById('stock-total-profit');
    profitEl.innerText = `浮动盈亏: ${profit >= 0 ? '+' : ''}${profit.toFixed(2)}`;
    profitEl.style.color = profit >= 0 ? '#fff' : '#999';
}

// 巧妙拦截原来的路由函数，当点进 stock 时自动渲染
const originalOpenPaySubPage = window.openPaySubPage;
window.openPaySubPage = function(pageId) {
    originalOpenPaySubPage(pageId);
    if (pageId === 'stock') {
        renderStockPage();
    }
}

let currentTradeStockId = null;

// 打开交易面板
window.openStockDetail = function(stockId) {
    currentTradeStockId = stockId;
    const company = stockCompanies.find(c => c.id === stockId);
    const marketData = currentMarket[stockId];
    const holdings = payData.stocks[stockId] || { shares: 0, cost: 0 };
    
    document.getElementById('stm-name').innerText = company.name;
    document.getElementById('stm-code').innerText = company.code;
    document.getElementById('stm-price').innerText = marketData.price.toFixed(2);
    
    const percentStr = (marketData.changeRate > 0 ? '+' : '') + (marketData.changeRate * 100).toFixed(2) + '%';
    const pctEl = document.getElementById('stm-percent');
    pctEl.innerText = percentStr;
    
    if (marketData.trend === 'up') { pctEl.style.color = '#111'; }
    else if (marketData.trend === 'down') { pctEl.style.color = '#888'; }
    else { pctEl.style.color = '#666'; }
    
    document.getElementById('stm-news').innerText = marketData.news;
    document.getElementById('stm-holdings').innerText = holdings.shares;
    document.getElementById('stm-cost').innerText = holdings.shares > 0 ? (holdings.cost / holdings.shares).toFixed(2) : '0.00';
    document.getElementById('stm-amount-input').value = '';
    document.getElementById('stock-trade-modal').classList.add('active');
}

// 执行买卖
window.executeStockTrade = function(action) {
    if (!currentTradeStockId) return;
    const amount = parseInt(document.getElementById('stm-amount-input').value);
    
    if (isNaN(amount) || amount <= 0) { showToast("请输入有效的股数"); return; }
    
    const company = stockCompanies.find(c => c.id === currentTradeStockId);
    const price = currentMarket[currentTradeStockId].price;
    const totalMoney = price * amount;
    
    if (!payData.stocks[currentTradeStockId]) payData.stocks[currentTradeStockId] = { shares: 0, cost: 0 };
    const holdings = payData.stocks[currentTradeStockId];
    
    if (action === 'buy') {
        if (payData.balance < totalMoney) { showKAlert("零钱余额不足，快去兼职打工吧！"); return; }
        payData.balance -= totalMoney;
        holdings.shares += amount;
        holdings.cost += totalMoney;
        addTransaction(`买入 [${company.name}]`, totalMoney, 'expense');
        showToast(`成功买入 ${amount} 股`);
    } else if (action === 'sell') {
        if (holdings.shares < amount) { showKAlert("持仓股数不足！没法做空啊！"); return; }
        
        const costRatio = amount / holdings.shares;
        const costToDeduct = holdings.cost * costRatio;
        
        holdings.shares -= amount;
        holdings.cost -= costToDeduct;
        payData.balance += totalMoney;
        addTransaction(`卖出 [${company.name}]`, totalMoney, 'income');
        
        const profitStr = (totalMoney - costToDeduct).toFixed(2);
        if (totalMoney >= costToDeduct) showToast(`成功卖出，怒赚 ¥${profitStr}！`);
        else showToast(`成功卖出，含泪血亏 ¥${Math.abs(profitStr)}...`);
    }
    
    savePayData();
    document.getElementById('stock-trade-modal').classList.remove('active');
    renderStockPage();
}
/* =========================================
   [补丁] 股市自动跳动逻辑 (每5秒变一次)
   ========================================= */

let stockAutoTimer = null;

// 自动跳动函数 (静默刷新，不弹窗提示)
function autoTickStock() {
    // 只有当股市页面显示时才运行
    const stockPage = document.getElementById('pay-page-stock');
    if (stockPage && stockPage.classList.contains('show')) {
        generateNewMarket(); // 生成新价格和新新闻
        renderStockPage();   // 刷新界面
        console.log("股市已自动刷新 - " + new Date().toLocaleTimeString());
    } else {
        // 如果页面没显示，关掉定时器省资源
        clearInterval(stockAutoTimer);
    }
}

// 拦截打开页面函数：打开股市时 -> 启动定时器
const _rawOpenPaySubPage = window.openPaySubPage;
window.openPaySubPage = function(pageId) {
    _rawOpenPaySubPage(pageId); // 执行原逻辑
    
    if (pageId === 'stock') {
        // 先清除旧的，防止重复
        if (stockAutoTimer) clearInterval(stockAutoTimer);
        // 启动！每 5000 毫秒 (5秒) 变动一次
        stockAutoTimer = setInterval(autoTickStock, 5000);
    }
}

// 拦截关闭页面函数：关闭股市时 -> 停止定时器
// 先确保基础的关闭函数存在
if (!window.closePaySubPage) {
    window.closePaySubPage = function(pageId) {
        const page = document.getElementById('pay-page-' + pageId);
        if(page) page.classList.remove('show');
    };
}

const _rawClosePaySubPage = window.closePaySubPage;
window.closePaySubPage = function(pageId) {
    if (_rawClosePaySubPage) _rawClosePaySubPage(pageId); // 执行原逻辑
    
    if (pageId === 'stock') {
        if (stockAutoTimer) clearInterval(stockAutoTimer);
        console.log("股市已休市 (停止刷新)");
    }
}


// 拦截关闭整个钱包APP：也停止定时器
const _rawClosePayApp = window.closePayApp;
window.closePayApp = function() {
    _rawClosePayApp();
    if (stockAutoTimer) clearInterval(stockAutoTimer);
}
/* =========================================
   [新增] 钱包子程序：PROJECT IDOL (高风险风投)
   ========================================= */

let currentIdolInvestment = 0; // 记录当前暂存的资金

// 1. 输入金额并开启档案袋
window.prepareIdolProject = function() {
    const input = document.getElementById('idol-amount-input');
    const amount = parseFloat(input.value);

    if (isNaN(amount) || amount <= 0) {
        showToast("醒醒，哪怕选地下偶像也是要花钱的。");
        return;
    }

    if (amount > payData.balance) {
        showKAlert("公司账上没这么多流动资金！<br>先去打打工凑点经费吧！");
        return;
    }

    // 扣除金额，暂存到奖池
    payData.balance -= amount;
    currentIdolInvestment = amount;
    savePayData();
    document.getElementById('idol-available-balance').innerText = payData.balance.toFixed(2);

    // 界面变化：隐藏按钮，显示三个档案袋
    document.getElementById('idol-start-btn').style.display = 'none';
    input.style.display = 'none';
    
    // 每次打开重置档案袋样式
    const files = document.querySelectorAll('.idol-file');
    files.forEach(f => {
        f.style.background = '#f9f9f9';
        f.style.color = '#333';
        f.style.borderColor = '#ddd';
        f.style.pointerEvents = 'auto'; // 允许点击
    });
    
    document.getElementById('idol-files-area').style.display = 'block';
}

// 2. 点击档案袋，揭晓命运
window.openIdolFile = function(clickedElement) {
    // 锁定所有档案袋防止连点
    const files = document.querySelectorAll('.idol-file');
    files.forEach(f => f.style.pointerEvents = 'none');

    // 选中的变黑
    clickedElement.style.background = '#111';
    clickedElement.style.color = '#fff';
    clickedElement.style.borderColor = '#111';
    
    showToast("正在翻阅加密档案...");

    // 延迟 1.5 秒出结果
    setTimeout(() => {
        const rand = Math.random();
        let isWin = false;
        let multiplier = 0;

        if (rand < 0.02) {
            isWin = true;
            multiplier = 50; // 50倍紫微星
        } else if (rand < 0.10) {
            isWin = true;
            multiplier = 10; // 10倍大红
        }

        const list = document.getElementById('idol-history-list');
        if(list.innerHTML.includes('尚无造星记录')) list.innerHTML = '';

        if (isWin) {
            const winAmount = currentIdolInvestment * multiplier;
            payData.balance += winAmount; // 发奖金
            addTransaction(`企划成功 (${multiplier}x)`, winAmount - currentIdolInvestment, 'income');
            
            const successMsgs = multiplier === 50 
                ? "【天降紫微星！】这孩子绝美直拍一夜出圈，各大高奢品牌排队送代言。你名下的娱乐帝国正式起飞，你成了名副其实的福布斯榜首富婆！"
                : "【一炮而红！】主打歌音源空降榜首，被各大美妆品牌疯抢。这波投资血赚！";
            
            showKAlert(`<b style="color:#111; font-size:18px;">恭喜制作人！👑</b><br><br>${successMsgs}<br><br>狂赚 <b style="color:#111; font-size:24px;">¥${winAmount.toFixed(2)}</b>`);
            
            list.insertAdjacentHTML('afterbegin', `
                <div style="background:#fff; border-radius:12px; padding:12px 15px; display:flex; justify-content:space-between; border:1px solid #111; box-shadow:4px 4px 0 rgba(0,0,0,1);">
                    <div>
                        <div style="font-size:13px; font-weight:800; color:#111;">爆红出道 (${multiplier}x)</div>
                        <div style="font-size:10px; color:#888; margin-top:4px;">投资: ¥${currentIdolInvestment.toFixed(2)}</div>
                    </div>
                    <div style="color:#111; font-weight:800; font-size:16px;">+${(winAmount - currentIdolInvestment).toFixed(2)}</div>
                </div>
            `);
        } else {
            addTransaction(`企划失败 (练习生作妖)`, currentIdolInvestment, 'expense');

            // 女生视角的幽默塌房文案（不擦边不辱女，只有对娱乐圈的搞笑解构）
            const failMsgs = [
                "半夜被星探抓到连吃三盆变态辣火锅，因为放弃身材管理被开除...",
                "嫌每天练舞太累了，连夜买火车站票回老家考事业编去了。",
                "被曝出以前在村口和村霸的鹅打架，引发形象危机，出道计划流产。",
                "主打歌快录完了，结果制作人发现她五音不全只会喊麦，当场解约。",
                "嫌弃公司发的制服不好看，提桶跑路去了对面公司当前台。",
                "练习室太卡，由于受不了没有WIFI的环境，她决定退圈去网吧打游戏。"
            ];
            const failMsg = failMsgs[Math.floor(Math.random() * failMsgs.length)];

            showKAlert(`<b style="color:#555; font-size:18px;">投资血本无归 💔</b><br><br><span style="font-size:13px; color:#444; line-height:1.6;">${failMsg}</span><br><br><span style="color:#aaa; font-size:11px;">你投入的 ¥${currentIdolInvestment.toFixed(2)} 打水漂了，下次擦亮眼睛吧。</span>`);

            list.insertAdjacentHTML('afterbegin', `
                <div style="background:#f9f9f9; border-radius:12px; padding:12px 15px; display:flex; justify-content:space-between; border:1px solid #eee;">
                    <div>
                        <div style="font-size:13px; font-weight:700; color:#666;">素人跑路</div>
                        <div style="font-size:10px; color:#999; margin-top:4px;">颗粒无收</div>
                    </div>
                    <div style="color:#aaa; font-weight:700; font-size:16px;">-${currentIdolInvestment.toFixed(2)}</div>
                </div>
            `);
        }

        // 恢复 UI 状态，准备下一次投资
        savePayData();
        document.getElementById('idol-available-balance').innerText = payData.balance.toFixed(2);
        
        document.getElementById('idol-files-area').style.display = 'none';
        document.getElementById('idol-start-btn').style.display = 'block';
        document.getElementById('idol-amount-input').style.display = 'block';
        document.getElementById('idol-amount-input').value = '';
        currentIdolInvestment = 0;

    }, 1500); 
}

// 3. 巧妙拦截路由：当你点开“造星企划”时，实时同步上方显示的可用余额
const _idolOpenPaySubPage = window.openPaySubPage;
window.openPaySubPage = function(pageId) {
    if (_idolOpenPaySubPage) _idolOpenPaySubPage(pageId);
    if (pageId === 'idol_invest') {
        const el = document.getElementById('idol-available-balance');
        if(el) el.innerText = payData.balance.toFixed(2);
    }
}
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
/* =========================================================
   Love Space (LS2) - Clean Full Module (Index.html aligned)
   依赖：
   - IDB (你的 IndexedDB wrapper)
   - friendsData, personasMeta, currentPersonaId
   - loadChatHistory(chatId)
   - saveMessageToHistory(chatId, msg)
   - callAiForSpecialTask(prompt)
   - showToast(msg) / showKAlert / showKConfirm / showKPrompt (可选，有则用)
   - compressImage(base64, maxWidth) (可选，用于贴纸/磁贴压缩)
   ========================================================= */

const LS2_STORE_KEY = 'myCoolPhone_ls2_store';

let ls2Store = {};              // { `${personaId}_${aiId}`: ls2Data }
let ls2Data = null;             // 当前空间数据
let ls2PendingAiId = null;      // 正在邀请的对象
let fridgeTimerInterval = null; // 冰箱倒计时刷新

// ===== 小工具：兼容你有/没有 showKPrompt 的情况 =====
function ls2Prompt(title, desc, placeholder = '', cb) {
  if (typeof showKPrompt === 'function') return showKPrompt(title, desc, placeholder, cb);
  const v = prompt(`${title}\n${desc}`, placeholder);
  cb(v);
}
function ls2Alert(html, cb) {
  if (typeof showKAlert === 'function') return showKAlert(html, cb);
  alert(html.replace(/<br>/g, '\n').replace(/<[^>]*>/g, ''));
  if (cb) cb();
}
function ls2Confirm(title, desc, onOk, onCancel) {
  if (typeof showKConfirm === 'function') return showKConfirm(title, desc, onOk, onCancel);
  if (confirm(`${title}\n\n${desc.replace(/<br>/g, '\n').replace(/<[^>]*>/g, '')}`)) onOk();
  else if (onCancel) onCancel();
}

function ls2Key(aiId) {
  return `${currentPersonaId}_${aiId}`;
}

function createDefaultLs2Data() {
  return {
    isOpen: false,
    partnerId: null,
    myPersona: '',
    startDate: 0,

    settings: {
      autoStatus: true,
      autoJournal: true,
      autoFridge: true,
      intervalHrs: 4,
      lastGenTime: 0,

      fridgeBg: '',
      spaceBg: '',
      journalCover: '',

      // 字体：输入 URL（ttf/woff2）或留空
      fontMeUrl: '',
      fontAiUrl: '',
      fontMeFamily: '', // 运行时写入
      fontAiFamily: ''  // 运行时写入

      // 纸张 CSS：由纸张弹窗保存
      // journalPaperCSS: "background-color:...; background-image:...; ..."
    },

    // Radar / Status
    statusLog: [], // [{time:"HH:MM", text:"..."}]
    lastStatusDate: '',

    // Journal (多页)
    journals: [], // [{id,date,me,ai,stickersMe,stickersAi}]
    currentJournalIndex: 0,

    // Fridge
    fridgeOut: [], // 外面贴纸/照片 [{id,type:'note'|'img', text/by/color/x/y/rot}]
    fridgeIn: [],  // 冰箱内食物/购物 [{id,emoji,name,unlockTime|null}]
    dietLog: '',

    // Q&A
    qaHistory: [], // [{time,q,myA,aiA,reaction}]

    // Tasks
    tasks: { me: [], ai: [], evalText: '' }
  };
}

// ====== Store Load/Save ======
async function loadLs2Store() {
  try {
    const saved = await IDB.get(LS2_STORE_KEY);
    if (saved && typeof saved === 'object') ls2Store = saved;
    else ls2Store = {};
  } catch (e) {
    console.error('[LS2] load store failed', e);
    ls2Store = {};
  }
}
async function saveLs2Store() {
  try {
    await IDB.set(LS2_STORE_KEY, ls2Store);
  } catch (e) {
    console.error('[LS2] save store failed', e);
  }
}

// ====== View Switch ======
function ls2ShowView(viewId) {
  const lobby = document.getElementById('ls2-lobby-view');
  const setup = document.getElementById('ls2-setup-view');
  const main = document.getElementById('ls2-main-view');
  if (lobby) lobby.style.display = 'none';
  if (setup) setup.style.display = 'none';
  if (main) main.style.display = 'none';
  const target = document.getElementById(viewId);
  if (target) target.style.display = 'flex';
}

// ====== Public: Open/Close App ======
window.openLoveSpaceApp = async function () {
  const app = document.getElementById('loveSpaceApp');
  if (!app) return;
  app.classList.add('open');

  await loadLs2Store();

  const me = personasMeta?.[currentPersonaId] || {};
  const nameEl = document.getElementById('ls2-lobby-my-name');
  const avaEl = document.getElementById('ls2-lobby-my-avatar');
  if (nameEl) nameEl.innerText = me.name || 'Me';
  if (avaEl) avaEl.src = me.avatar || (typeof AVATAR_USER !== 'undefined' ? AVATAR_USER : '');

  ls2Data = null;
  ls2PendingAiId = null;
  ls2ShowView('ls2-lobby-view');
  renderLs2LobbyList();
};

window.closeLoveSpaceApp = function () {
  const app = document.getElementById('loveSpaceApp');
  if (app) app.classList.remove('open');
  if (fridgeTimerInterval) clearInterval(fridgeTimerInterval);
  fridgeTimerInterval = null;
};

// ====== Lobby Render ======
function renderLs2LobbyList() {
  const list = document.getElementById('ls2-lobby-list');
  if (!list) return;

  const friendIds = Object.keys(friendsData || {});
  if (friendIds.length === 0) {
    list.innerHTML = '<div class="chic-empty">暂无好友，请先在微信里添加 AI。</div>';
    return;
  }

  let gridHtml = '<div class="ls2-partner-grid">';
  friendIds.forEach(aiId => {
    const ai = friendsData[aiId];
    const space = ls2Store[ls2Key(aiId)];
    const isBound = !!(space && space.isOpen);

    const avatar = ai?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(ai?.realName || aiId)}`;
    const displayName = ai?.remark || ai?.realName || aiId;

    const btnText = isBound ? '进入空间' : '发送邀请';
    const statusText = isBound ? 'SOUL BOUND' : 'UNBOUND';
    const statusCls = isBound ? 'pc-status bound' : 'pc-status';
    const btnCls = isBound ? 'pc-btn active' : 'pc-btn';
    const action = isBound ? `ls2EnterSpace('${aiId}')` : `ls2GoToSetup('${aiId}')`;

    gridHtml += `
      <div class="partner-card" onclick="${action}">
        <img src="${avatar}" class="pc-bg">
        <div class="pc-overlay">
          <div class="pc-name">${displayName}</div>
          <div class="${statusCls}">${statusText}</div>
          <div class="${btnCls}">${btnText}</div>
        </div>
      </div>
    `;
  });
  gridHtml += '</div>';
  list.innerHTML = gridHtml;
}

// ====== Setup / Invitation ======
window.ls2BackToLobby = function () {
  ls2Data = null;
  ls2PendingAiId = null;
  if (fridgeTimerInterval) clearInterval(fridgeTimerInterval);
  fridgeTimerInterval = null;
  renderLs2LobbyList();
  ls2ShowView('ls2-lobby-view');
};

window.ls2GoToSetup = function (aiId) {
  ls2PendingAiId = aiId;
  const ai = friendsData?.[aiId] || {};
  const me = personasMeta?.[currentPersonaId] || {};

  const meImg = document.getElementById('ls2-setup-me-img');
  const aiImg = document.getElementById('ls2-setup-ai-img');
  const meName = document.getElementById('ls2-setup-me-name');
  const aiName = document.getElementById('ls2-setup-ai-name');

  if (meImg) meImg.src = me.avatar || (typeof AVATAR_USER !== 'undefined' ? AVATAR_USER : '');
  if (aiImg) aiImg.src = ai.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(ai.realName || aiId)}`;
  if (meName) meName.innerText = me.name || '我';
  if (aiName) aiName.innerText = ai.remark || ai.realName || aiId;

  ls2ShowView('ls2-setup-view');
};

async function ls2InjectMemory(aiId, desc) {
  // 写到聊天记录里作为“线下事件记忆”，方便模型有上下文
  try {
    await saveMessageToHistory(aiId, {
      text: `[Love Space 事件] ${desc}`,
      type: 'received',
      senderName: 'System',
      isOffline: true
    });
  } catch (e) {
    console.warn('[LS2] inject memory failed', e);
  }
}

window.ls2SendInvitation = async function () {
  if (!ls2PendingAiId) return;
  const aiId = ls2PendingAiId;
  const ai = friendsData?.[aiId];
  if (!ai) return;

  const btn = document.getElementById('ls2-btn-invite');
  const old = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> 心跳连接中...'; btn.style.pointerEvents = 'none'; }

  const myP = personasMeta?.[currentPersonaId]?.persona || '普通人';

  const prompt = `
[System Command]
User wants to open a "Love Space" with you.
User persona: "${myP}"
You are: ${ai.realName || aiId}
Your persona: ${ai.persona || ''}

Reply with JSON only:
{"accept": true, "msg": "一句简短的接受/回应"}
  `.trim();

  const res = await callAiForSpecialTask(prompt);

  if (btn) { btn.innerHTML = old; btn.style.pointerEvents = 'auto'; }

  if (!res) return ls2Alert('对方没有回应，稍后再试一次。');

  let data;
  try {
    data = JSON.parse(res.replace(/```json/gi, '').replace(/```/g, '').trim());
  } catch (e) {
    console.error(res);
    return ls2Alert('解析失败：对方的回复不是标准 JSON。');
  }

  if (!data.accept) return ls2Alert('对方婉拒了你的邀请。');

  const key = ls2Key(aiId);
  if (!ls2Store[key]) ls2Store[key] = createDefaultLs2Data();

  ls2Data = ls2Store[key];
  ls2Data.isOpen = true;
  ls2Data.partnerId = aiId;
  ls2Data.myPersona = myP;
  if (!ls2Data.startDate) ls2Data.startDate = Date.now();

  // 初始化日记第一页
  ensureJournalInitialized();

  await saveLs2Store();
  if (typeof showToast === 'function') showToast(data.msg || '连接成功');

  await ls2InjectMemory(aiId, '我们开通了 Love Space（情侣空间）。');

  window.ls2EnterSpace(aiId);
};

// ====== Enter Space ======
window.ls2EnterSpace = function (aiId) {
  const key = ls2Key(aiId);
  if (!ls2Store[key]) ls2Store[key] = createDefaultLs2Data();
  ls2Data = ls2Store[key];

  if (!ls2Data.isOpen) {
    // 未绑定就走 setup
    return window.ls2GoToSetup(aiId);
  }

  ls2ShowView('ls2-main-view');
  ls2UpdateHeader();
  window.ls2SwitchTab('status'); // 默认 radar
  checkAutoGeneration();
};

window.ls2Disconnect = async function () {
  if (!ls2Data || !ls2Data.partnerId) return;
  const aiId = ls2Data.partnerId;

  ls2Confirm(
    '解除灵魂绑定',
    "确定要解除绑定并清空该空间的数据吗？<br><br><span style='color:#ff4d4f; font-size:11px;'>此操作无法恢复</span>",
    async () => {
      ls2Store[ls2Key(aiId)] = createDefaultLs2Data();
      await saveLs2Store();
      window.ls2ToggleSettings(); // 关设置
      window.ls2BackToLobby();
    }
  );
};

function ls2UpdateHeader() {
  if (!ls2Data || !ls2Data.partnerId) return;

  const ai = friendsData?.[ls2Data.partnerId] || {};
  const me = personasMeta?.[currentPersonaId] || {};

  const aiAvatarEl = document.getElementById('ls2-avatar-ai');
  const meAvatarEl = document.getElementById('ls2-avatar-me');
  const meNameEl = document.getElementById('ls2-name-me');
  const aiNameEl = document.getElementById('ls2-name-ai');
  const daysEl = document.getElementById('ls2-days-count');
  const bgEl = document.getElementById('ls2-space-bg');

  if (aiAvatarEl) aiAvatarEl.src = ai.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(ai.realName || ls2Data.partnerId)}`;
  if (meAvatarEl) meAvatarEl.src = me.avatar || (typeof AVATAR_USER !== 'undefined' ? AVATAR_USER : '');

  if (meNameEl) meNameEl.innerText = me.name || 'Me';
  if (aiNameEl) aiNameEl.innerText = ai.remark || ai.realName || 'AI';

  const start = ls2Data.startDate || Date.now();
  const days = Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24)) + 1;
  if (daysEl) daysEl.innerText = days < 10 ? `0${days}` : String(days);

  if (bgEl) {
    const bg = ls2Data.settings?.spaceBg;
    if (bg && bg.trim()) bgEl.style.backgroundImage = `url('${bg}')`;
  }
}

// ====== Tabs ======
window.ls2SwitchTab = function (tabName, btnEl) {
  // 内容切换
  document.querySelectorAll('.ls2-tab-content').forEach(el => el.classList.remove('active'));
  const tab = document.getElementById(`ls2-tab-${tabName}`);
  if (tab) tab.classList.add('active');

  // 圆岛导航高亮
  document.querySelectorAll('.ls2-nav-item').forEach(el => el.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  else {
    const autoBtn = document.querySelector(`.ls2-nav-item[onclick*="'${tabName}'"]`);
    if (autoBtn) autoBtn.classList.add('active');
  }

  // 刷新对应内容
  if (tabName === 'status') renderLs2Status();
  if (tabName === 'journal') renderLs2Journal();
  if (tabName === 'fridge') renderLs2Fridge();
  if (tabName === 'qa') renderLs2QA();
  if (tabName === 'tasks') renderLs2Tasks();

  // 切走手账时强制合上书（避免遮挡）
  if (tabName !== 'journal' && typeof closeJournalBook === 'function') closeJournalBook();
};

// ============================================================
//  RADAR / STATUS
// ============================================================
window.ls2GenerateStatus = async function () {
  if (!ls2Data || !ls2Data.partnerId) return;
  const aiId = ls2Data.partnerId;
  const ai = friendsData?.[aiId] || {};

  if (typeof showToast === 'function') showToast('正在扫描信号...');

  // 0点清空当天记录
  const today = new Date().toLocaleDateString();
  if (ls2Data.lastStatusDate !== today) {
    ls2Data.statusLog = [];
    ls2Data.lastStatusDate = today;
  }

  const history = await loadChatHistory(aiId);
  const recent = (history || []).slice(-15).map(m => `${m.senderName === 'ME' ? 'User' : (ai.realName || aiId)}: ${m.text}`).join('\n');

  const lastTimeStr = (ls2Data.statusLog && ls2Data.statusLog.length)
    ? (ls2Data.statusLog[ls2Data.statusLog.length - 1].time || '00:00')
    : '00:00';

  const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const prompt = `
[System Command]
你要生成「追踪/系统日志」时间轴，目标对象是：${ai.realName || aiId}

【硬性规则（必须遵守）】
1) 只写“事件/行为”，不要写任何表情、语气词、情绪、心声、对话内容
   - 禁止：哈哈、呜呜、(｡•-•｡)、“我觉得/我想/我生气了”、任何引号里的聊天句子
2) 只用第三人称“Ta”，不要出现“我/你”
3) 文风要像：权限日志 / 设备日志 / 位置轨迹日志 / App 使用记录
4) 每条必须是“可落地的动作 + 对象/地点/设备 + 结果”
5) 不要写解释，不要写建议，不要写总结段落

【内容覆盖范围（尽量多样化）】
- 位置：到达/离开某地点、停留时长、今日停留地点数量、移动轨迹（例如：从A到B）
- App：进入/退出某App、停留时长、切换前后台
- 设备：在 iPhone 15 / iPhone 15 Pro 登录/退出、网络状态变化（Wi‑Fi/4G/无网）
- 权限：开启/关闭“始终定位”、开启/关闭“手机状态查看权限”、相册/麦克风/相机权限的开关
- 敏感操作：查看“敏感操作记录”、修改隐私设置、清除记录、绑定/解绑
- 屏幕状态：打开手机/锁屏/关机、累计使用时长、最后一次解锁时间

【输出数量】
- 输出 10 ~ 18 条，时间从 "${lastTimeStr}" 到 "${nowStr}"
- 时间要合理递增（可以不均匀）

【输出格式（严格 JSON，不要 markdown，不要多余文字）】
[
  {"time":"13:40","text":"Ta ..."},
  {"time":"13:58","text":"Ta ..."}
]

【参考风格（照这个力度写，但内容要根据上下文自由生成）】
- Ta刚刚到达了这个地点：重庆市渝北区北部新区高新园K2-4地块
- Ta刚刚离开了这个地点：重庆市渝北区北部新区高新园K2-4地块
- Ta今日停留了2个地方
- Ta在洪湖西路已经超过了2小时
- Ta进入了LinkUp
- Ta在iPhone 15上登录了账号
- Ta在iPhone 15 Pro上退出了账号
- Ta查看了你的敏感操作记录
- Ta开启了始终定位权限 / Ta关闭了始终定位权限
- Ta对你开启了手机状态查看权限 / Ta对你关闭了手机状态查看权限
- Ta打开了手机 / Ta关闭了手机（使用时长2小时15分）

【输入上下文（供你参考，不要原样复读）】
最近聊天内容：
${recent || '(no recent chats)'}
`.trim();


  const res = await callAiForSpecialTask(prompt);
  if (!res) return;

  try {
    const arr = JSON.parse(res.replace(/```json/gi, '').replace(/```/g, '').trim());
    if (!Array.isArray(arr)) throw new Error('Not array');

    if (!ls2Data.statusLog) ls2Data.statusLog = [];
    ls2Data.statusLog = ls2Data.statusLog.concat(arr);

    ls2Store[ls2Key(aiId)] = ls2Data;
    await saveLs2Store();

    renderLs2Status();
    if (typeof showToast === 'function') showToast('追踪记录已追加');
  } catch (e) {
    console.error(res);
    if (typeof showToast === 'function') showToast('追踪失败：JSON解析错误');
  }
};

function renderLs2Status() {
  const c = document.getElementById('ls2-radar-container');
  if (!c) return;

  const log = ls2Data?.statusLog || [];
  if (!log.length) {
    c.innerHTML = '<div class="chic-empty" style="text-align:center; padding: 40px; color:#aaa;">暂无追踪记录，点击上方按钮扫描</div>';
    return;
  }

  let html = '<div class="ls2-timeline-container">';
  log.forEach(s => {
    const text = String(s.text || '');
    const isHighlight = /敏感|关闭|退出|异常|离开|定位|飞行|酒店|酒吧|夜店/.test(text);
    html += `
      <div class="ls2-tl-item ${isHighlight ? 'highlight' : ''}">
        <div class="ls2-tl-time">${s.time || ''}</div>
        <div class="ls2-tl-dot"></div>
        <div class="ls2-tl-content">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      </div>
    `;
  });
  html += '</div>';
  c.innerHTML = html;
}

// ============================================================
//  JOURNAL (多页 + 贴纸 + 字体 + 纸张)
// ============================================================
function ensureJournalInitialized() {
  if (!ls2Data.journals || !Array.isArray(ls2Data.journals) || ls2Data.journals.length === 0) {
    ls2Data.journals = [{
      id: Date.now(),
      date: new Date().toLocaleDateString(),
      me: '',
      ai: '',
      stickersMe: [],
      stickersAi: []
    }];
    ls2Data.currentJournalIndex = 0;
  }
}

function ensureFontStyleTag() {
  let tag = document.getElementById('ls2-dynamic-fonts');
  if (!tag) {
    tag = document.createElement('style');
    tag.id = 'ls2-dynamic-fonts';
    document.head.appendChild(tag);
  }
  return tag;
}

function applyJournalFonts() {
  if (!ls2Data || !ls2Data.settings) return;

  const s = ls2Data.settings;
  const tag = ensureFontStyleTag();

  let css = '';
  // 我的字体
  if (s.fontMeUrl && /^https?:\/\//i.test(s.fontMeUrl)) {
    css += `@font-face{font-family:'LS2FontMe';src:url('${s.fontMeUrl}');font-display:swap;}\n`;
    s.fontMeFamily = `'LS2FontMe', 'Caveat', 'Alex Brush', cursive`;
  } else {
    s.fontMeFamily = `'Caveat', 'Alex Brush', cursive`;
  }
  // TA字体
  if (s.fontAiUrl && /^https?:\/\//i.test(s.fontAiUrl)) {
    css += `@font-face{font-family:'LS2FontAi';src:url('${s.fontAiUrl}');font-display:swap;}\n`;
    s.fontAiFamily = `'LS2FontAi', 'Caveat', 'Alex Brush', cursive`;
  } else {
    s.fontAiFamily = `'Caveat', 'Alex Brush', cursive`;
  }

  tag.innerHTML = css;

  const meEl = document.getElementById('ls2-journal-me');
  const aiEl = document.getElementById('ls2-journal-ai');
  if (meEl) { meEl.style.fontFamily = s.fontMeFamily; meEl.style.fontSize = '20px'; }
  if (aiEl) { aiEl.style.fontFamily = s.fontAiFamily; aiEl.style.fontSize = '20px'; }
}

function applyJournalPaper() {
  const paperEl = document.getElementById('journal-paper');
  if (!paperEl) return;

  // 不要把 className 清空（你的 CSS 需要 paper-texture 等）
  // 只覆盖 style
  paperEl.style.removeProperty('background');
  paperEl.style.removeProperty('backgroundImage');
  paperEl.style.removeProperty('backgroundSize');
  paperEl.style.removeProperty('backgroundColor');

  const css = ls2Data?.settings?.journalPaperCSS || '';
  if (css) paperEl.style.cssText += ';' + css;
}

window.openJournalBook = function () {
  const cover = document.getElementById('journal-cover');
  if (cover) cover.classList.add('opened');
  applyJournalPaper();
};

window.closeJournalBook = function () {
  const cover = document.getElementById('journal-cover');
  if (cover) cover.classList.remove('opened');
};

window.switchJournalTab = function (tab) {
  const tabs = document.querySelectorAll('.j-tab');
  const mePage = document.getElementById('j-page-me');
  const aiPage = document.getElementById('j-page-ai');

  if (tabs && tabs.length >= 2) {
    tabs[0].classList.remove('active');
    tabs[1].classList.remove('active');
  }

  if (tab === 'me') {
    if (tabs[0]) tabs[0].classList.add('active');
    if (mePage) mePage.style.display = 'flex';
    if (aiPage) aiPage.style.display = 'none';
  } else {
    if (tabs[1]) tabs[1].classList.add('active');
    if (mePage) mePage.style.display = 'none';
    if (aiPage) aiPage.style.display = 'flex';
  }

  renderLs2Journal(); // 切页后重绘贴纸（贴纸分 me/ai）
};

window.journalPrevPage = function () {
  ensureJournalInitialized();
  if (ls2Data.currentJournalIndex > 0) {
    ls2Data.currentJournalIndex--;
    ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
    saveLs2Store();
    renderLs2Journal();
  } else {
    if (typeof showToast === 'function') showToast('已经是第一页啦');
  }
};

window.journalNextPage = function () {
  ensureJournalInitialized();
  if (ls2Data.currentJournalIndex < ls2Data.journals.length - 1) {
    ls2Data.currentJournalIndex++;
    ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
    saveLs2Store();
    renderLs2Journal();
  } else {
    if (typeof showToast === 'function') showToast('已经是最后一页啦');
  }
};

window.journalNewPage = function () {
  ensureJournalInitialized();
  ls2Data.journals.push({
    id: Date.now(),
    date: new Date().toLocaleDateString(),
    me: '',
    ai: '',
    stickersMe: [],
    stickersAi: []
  });
  ls2Data.currentJournalIndex = ls2Data.journals.length - 1;

  ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
  saveLs2Store();
  renderLs2Journal();
  if (typeof showToast === 'function') showToast('已开启新的一天日记');
};

// 保存手账文本（你 HTML 的 onblur 会调用）
window.ls2SaveJournalData = function () {
  ensureJournalInitialized();
  const idx = ls2Data.currentJournalIndex || 0;
  const j = ls2Data.journals[idx];

  const meEl = document.getElementById('ls2-journal-me');
  const aiEl = document.getElementById('ls2-journal-ai');
  if (meEl) j.me = meEl.value || '';
  if (aiEl) j.ai = aiEl.value || '';

  ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
  saveLs2Store();
};

// 生成 TA 的日记
window.ls2GenerateJournal = async function (isAuto = false) {
  if (!ls2Data || !ls2Data.partnerId) return;
  ensureJournalInitialized();

  const aiId = ls2Data.partnerId;
  const ai = friendsData?.[aiId] || {};

  if (!isAuto && typeof showToast === 'function') showToast('正在生成 TA 的日记...');

  const history = await loadChatHistory(aiId);
  const recent = (history || []).slice(-20).map(m => `${m.senderName === 'ME' ? 'Her(User)' : 'Me'}: ${m.text}`).join('\n');

    const idx = ls2Data.currentJournalIndex || 0;
  const j = ls2Data.journals[idx];
  
  // 提取今天你这页上的照片和贴纸内容，扔给AI
  let userStickersInfo = (j.stickersMe || []).map(s => {
      if (s.type === 'note') return `贴了张便利贴写着："${s.content}"`;
      if (s.type === 'img') return `贴了一张照片（照片描述：${s.desc || '一张照片'}）`;
      return '';
  }).filter(Boolean).join('；');

  const prompt = `
[System Command]
Roleplay: You are ${ai.realName || aiId}
Persona: ${ai.persona || ''}

Task:
Write a diary entry for today.
- Language: Chinese
- First person "我"
- 100-200 words

[Context of User's Diary Today]
User's diary text: "${j.me || '无记录'}"
User added to their diary page: ${userStickersInfo || '没有贴其他东西'}

[Instruction]
Generate YOUR diary for today. You can react to what the user wrote or the photos they attached, or talk about recent chats.
Recent chats:
${recent || '(no recent chats)'}

At the end of your diary, if you want to attach some stickers or photos of your own as annotations, use this EXACT format on a new line:
[STICKER: shape=shape-heart, color=#ffcccc, text=想你！]
(Available shapes: shape-rect, shape-square, shape-rounded, shape-circle, shape-heart, shape-star)
[PHOTO: desc=一张看海的照片]

Do not use markdown code blocks, just output the text and the tags.
  `.trim();

  const res = await callAiForSpecialTask(prompt);
  if (!res) return;

  let diary = res.replace(/```/g, '').trim();

  // 解析AI生成的异形便利贴与图片
  const stickerRegex = /$$STICKER:\s*shape=(.*?),\s*color=(.*?),\s*text=(.*?)$$/gi;
  const photoRegex = /$$PHOTO:\s*desc=(.*?)$$/gi;

  let match;
  if (!j.stickersAi) j.stickersAi = [];

  while ((match = stickerRegex.exec(diary)) !== null) {
      j.stickersAi.push({
          id: Date.now() + Math.random(),
          type: 'note',
          shape: match.trim(),
          bg: match.trim(),
          content: match.trim(),
          x: 20 + Math.random() * 50,
          y: 20 + Math.random() * 50,
          rot: Math.random() * 20 - 10,
          scale: 1
      });
  }
  while ((match = photoRegex.exec(diary)) !== null) {
      j.stickersAi.push({
          id: Date.now() + Math.random(),
          type: 'img',
          shape: 'shape-rect',
          content: 'https://images.unsplash.com/photo-1518134346374-184f9d21cea2?q=80&w=300&auto=format&fit=crop', // 给AI用的网图占位
          desc: match.trim(),
          hasBorder: true,
          x: 20 + Math.random() * 50,
          y: 20 + Math.random() * 50,
          rot: Math.random() * 20 - 10,
          scale: 1
      });
  }

  diary = diary.replace(stickerRegex, '').replace(photoRegex, '').trim();

  ls2Data.journals[idx].ai = diary;
  ls2Store[ls2Key(aiId)] = ls2Data;
  await saveLs2Store();

  if (!isAuto) {
    renderLs2Journal();
    if (typeof showToast === 'function') showToast('日记已更新');
  } else {
    await ls2InjectMemory(aiId, 'TA写完了今天的日记。');
  }
};


// 贴纸弹窗入口（你 HTML 的工具栏会调用）
window.ls2AddJournalSticker = function () {
    const modal = document.getElementById('ls2-sticker-modal');
    if (!modal) return;

    // reset
    const text = document.getElementById('ls2-sticker-text');
    const preview = document.getElementById('ls2-sticker-preview');
    const border = document.getElementById('ls2-sticker-border');
    const color = document.getElementById('ls2-sticker-color');
    const shape = document.getElementById('ls2-sticker-shape');

    if (text) text.value = '';
    if (preview) { preview.style.backgroundImage = 'none'; preview.dataset.src = ''; }
    if (border) border.checked = false;
    if (color) color.value = '#fff4e6';
    if (shape) shape.value = 'shape-rect';
    
    const bgPreview = document.getElementById('ls2-sticker-bg-preview');
    if(bgPreview) { bgPreview.style.display = 'none'; bgPreview.style.backgroundImage = 'none'; }
    const bgVal = document.getElementById('ls2-sticker-bg-val');
    if(bgVal) bgVal.value = '';
    const imgDesc = document.getElementById('ls2-sticker-img-desc');
    if(imgDesc) imgDesc.value = '';

    window.ls2SwitchStickerTab('text');
    modal.classList.add('active');
};


window.ls2SwitchStickerTab = function (type) {
  const btnText = document.getElementById('tab-sticker-text');
  const btnImg = document.getElementById('tab-sticker-img');
  const pText = document.getElementById('sticker-panel-text');
  const pImg = document.getElementById('sticker-panel-img');
  const modal = document.getElementById('ls2-sticker-modal');

  if (!modal) return;
  modal.dataset.mode = type;

  if (btnText) btnText.className = type === 'text' ? 'tab-btn active' : 'tab-btn';
  if (btnImg) btnImg.className = type === 'img' ? 'tab-btn active' : 'tab-btn';
  if (pText) pText.style.display = type === 'text' ? 'block' : 'none';
  if (pImg) pImg.style.display = type === 'img' ? 'block' : 'none';
};

window.ls2SetStickerColor = function (color) {
  const el = document.getElementById('ls2-sticker-color');
  if (el) el.value = color;
};

window.ls2HandleStickerFile = async function (input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    let base64 = e.target.result;
    try {
      if (typeof compressImage === 'function') base64 = await compressImage(base64, 400);
    } catch {}
    const preview = document.getElementById('ls2-sticker-preview');
    if (preview) {
      preview.style.backgroundImage = `url('${base64}')`;
      preview.dataset.src = base64;
    }
  };
  reader.readAsDataURL(file);
  input.value = '';
};

window.ls2ConfirmAddSticker = function () {
  if (!ls2Data || !ls2Data.partnerId) return;
  ensureJournalInitialized();

  const modal = document.getElementById('ls2-sticker-modal');
  const mode = modal?.dataset?.mode || 'text';
  const shape = document.getElementById('ls2-sticker-shape')?.value || 'shape-rect';

  const isMeTab = document.querySelectorAll('.j-tab')?.[0]?.classList.contains('active');
  const idx = ls2Data.currentJournalIndex || 0;
  const j = ls2Data.journals[idx];

  const sticker = {
    id: Date.now(),
    type: mode === 'img' ? 'img' : 'note',
    x: 40,
    y: 35,
    rot: Math.random() * 10 - 5,
    shape,
    hasBorder: false
  };

    sticker.scale = 1; // 默认缩放比例
  if (sticker.type === 'note') {
    const txt = (document.getElementById('ls2-sticker-text')?.value || '').trim();
    if (!txt) return ls2Alert('请输入文字内容');
    sticker.content = txt;
    sticker.bg = document.getElementById('ls2-sticker-color')?.value || '#fff4e6';
    sticker.bgImg = document.getElementById('ls2-sticker-bg-val')?.value || '';
  } else {
    const src = document.getElementById('ls2-sticker-preview')?.dataset?.src || '';
    if (!src) return ls2Alert('请选择图片');
    sticker.content = src;
    sticker.desc = document.getElementById('ls2-sticker-img-desc')?.value || '一张照片';
    sticker.hasBorder = !!document.getElementById('ls2-sticker-border')?.checked;
  }


  if (isMeTab) {
    if (!j.stickersMe) j.stickersMe = [];
    j.stickersMe.push(sticker);
  } else {
    if (!j.stickersAi) j.stickersAi = [];
    j.stickersAi.push(sticker);
  }

  ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
  saveLs2Store();
  renderLs2Journal();

  modal?.classList.remove('active');
};

window.ls2DelSticker = function (stickerId) {
  if (!ls2Data || !ls2Data.partnerId) return;
  ensureJournalInitialized();

  const isMeTab = document.querySelectorAll('.j-tab')?.[0]?.classList.contains('active');
  const idx = ls2Data.currentJournalIndex || 0;
  const j = ls2Data.journals[idx];

  if (isMeTab) j.stickersMe = (j.stickersMe || []).filter(s => String(s.id) !== String(stickerId));
  else j.stickersAi = (j.stickersAi || []).filter(s => String(s.id) !== String(stickerId));

  ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
  saveLs2Store();
  renderLs2Journal();
};


// 纸张弹窗
window.openPaperModal = function () {
  const modal = document.getElementById('ls2-paper-modal');
  const list = document.getElementById('paper-preview-list');
  if (!modal || !list) return;

  list.innerHTML = '';

  const papers = [
    { name: '纯白相纸', css: 'background-color:#fff; background-image:none;' },
    { name: '方格笔记', css: 'background-color:#fff; background-image:linear-gradient(#e5e5e5 1px, transparent 1px),linear-gradient(90deg,#e5e5e5 1px, transparent 1px); background-size:20px 20px;' },
    { name: '横线信笺', css: 'background-color:#fff; background-image:repeating-linear-gradient(transparent, transparent 23px, #e5e5e5 24px); background-size:100% 100%;' },
    { name: '点阵手账', css: 'background-color:#fff; background-image:radial-gradient(#ccc 1.5px, transparent 1.5px); background-size:20px 20px;' },
    { name: '复古羊皮', css: 'background-color:#f8f1e5; background-image:url("https://www.transparenttextures.com/patterns/aged-paper.png"); background-size:auto;' }
  ];

  papers.forEach(p => {
    const div = document.createElement('div');
    div.className = 'paper-preview-item';
    div.innerHTML = `<div class="paper-preview-name">${p.name}</div>`;
    div.style.cssText += p.css;

    div.onclick = () => {
      if (!ls2Data.settings) ls2Data.settings = {};
      ls2Data.settings.journalPaperCSS = p.css;
      ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
      saveLs2Store();
      applyJournalPaper();
      modal.classList.remove('active');
    };
    list.appendChild(div);
  });

  modal.classList.add('active');
};

// 渲染手账页（最终唯一版本）
function renderLs2Journal() {
  if (!ls2Data || !ls2Data.partnerId) return;
  ensureJournalInitialized();

  // 封面
  const cover = document.getElementById('journal-cover');
  const coverBg = ls2Data.settings?.journalCover;
  if (cover && coverBg) {
    cover.style.backgroundImage = `url('${coverBg}')`;
    cover.style.backgroundSize = 'cover';
    cover.style.backgroundPosition = 'center';
  }

  applyJournalFonts();
  applyJournalPaper();

  const idx = ls2Data.currentJournalIndex || 0;
  const j = ls2Data.journals[idx];

  const dateEl = document.getElementById('journal-date-display');
  if (dateEl) dateEl.innerText = j.date || '';

  const meEl = document.getElementById('ls2-journal-me');
  const aiEl = document.getElementById('ls2-journal-ai');
  if (meEl) meEl.value = j.me || '';
  if (aiEl) aiEl.value = j.ai || '';

  // 贴纸
  const container = document.getElementById('ls2-journal-stickers');
  if (!container) return;
  container.innerHTML = '';

  const isMeTab = document.querySelectorAll('.j-tab')?.[0]?.classList.contains('active');
  const stickers = isMeTab ? (j.stickersMe || []) : (j.stickersAi || []);

  stickers.forEach(s => {
    const el = document.createElement('div');
    el.className = `ls2-note type-${s.type}`;
    el.style.left = (s.x || 40) + '%';
    el.style.top = (s.y || 35) + '%';
    
    const scale = s.scale || 1;
    el.style.transform = `rotate(${s.rot || 0}deg) scale(${scale})`;
    el.style.transformOrigin = 'center center';

        const delBtn = `<div class="note-control-btn note-del-btn" onclick="ls2DelSticker('${s.id}'); event.stopPropagation();"><i class="fas fa-times"></i></div>`;
    const scaleBtns = `
      <div class="note-control-btn scale-up-btn" onclick="ls2ScaleNote('${s.id}', 0.1); event.stopPropagation();"><i class="fas fa-search-plus"></i></div>
      <div class="note-control-btn scale-down-btn" onclick="ls2ScaleNote('${s.id}', -0.1); event.stopPropagation();"><i class="fas fa-search-minus"></i></div>
    `;


    const shapeClass = s.shape || 'shape-rect';
    let innerStyle = ``;
        let innerHtml = '';
    // 彻底去掉便利贴和照片上的胶带装饰
    const tapeHtml = ''; 


    if (s.type === 'note') {
      if (s.bgImg) {
          innerStyle += `background-image:url('${s.bgImg}'); background-size:cover; background-position:center; color:#fff; text-shadow:0 1px 3px rgba(0,0,0,0.8);`;
      } else {
          innerStyle += `background-color:${s.bg || '#fff4e6'}; color:#333;`;
      }
      const fontF = isMeTab ? (ls2Data.settings.fontMeFamily || '') : (ls2Data.settings.fontAiFamily || '');
      innerStyle += `font-family:${fontF}; font-size:18px; padding:15px;`;
      innerHtml = `<span>${String(s.content || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`;
    } else {
      el.style.width = '110px';
      el.style.height = '110px';
      if (s.hasBorder) {
          innerStyle += `background:#fff; padding:6px;`;
          innerHtml = `<img src="${s.content}" style="width:100%;height:100%;display:block;object-fit:cover;border-radius:inherit;">`;
      } else {
          innerHtml = `<img src="${s.content}" style="width:100%;height:100%;display:block;object-fit:contain;border-radius:inherit;">`;
      }
    }

    el.innerHTML = `
      ${delBtn}${scaleBtns}
      <div class="sticker-inner ${shapeClass}" style="${innerStyle}">
          ${innerHtml}
      </div>
    `;

    ls2MakeDraggablePercent(el, s, document.getElementById('journal-paper'), () => {
      ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
      saveLs2Store();
    });

    container.appendChild(el);
  });

}

// 拖拽（百分比定位）
function ls2MakeDraggablePercent(el, dataObj, boundsEl, onSave) {
  let startX = 0, startY = 0;
  el.onpointerdown = (e) => {
     const ctrlBtn = e.target.closest('.note-control-btn');
    if (ctrlBtn) return;

    el.setPointerCapture(e.pointerId);
    startX = e.clientX - el.offsetLeft;
    startY = e.clientY - el.offsetTop;
    el.style.zIndex = 999;

    const onMove = (ev) => {
      const px = ((ev.clientX - startX) / boundsEl.clientWidth) * 100;
      const py = ((ev.clientY - startY) / boundsEl.clientHeight) * 100;

      el.style.left = Math.max(0, Math.min(90, px)) + '%';
      el.style.top = Math.max(0, Math.min(90, py)) + '%';
    };

    const onUp = (ev) => {
      try { el.releasePointerCapture(ev.pointerId); } catch {}
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.style.zIndex = 50;

      dataObj.x = parseFloat(el.style.left);
      dataObj.y = parseFloat(el.style.top);

      if (onSave) onSave();
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  };
}

// ============================================================
//  FRIDGE
// ============================================================
window.ls2ToggleFridgeDoor = function () {
  const door = document.getElementById('ls2-fridge-door');
  const inside = document.getElementById('ls2-fridge-inner');
  if (!door || !inside) return;

  if (door.classList.contains('open')) {
    door.classList.remove('open');
    inside.style.display = 'none';
  } else {
    door.classList.add('open');
    setTimeout(() => {
      inside.style.display = 'flex';
      renderFridgeInside();
      startFridgeTimer();
    }, 400);
  }
};

window.ls2AddFridgeItem = function (type) {
  if (!ls2Data || !ls2Data.partnerId) return;
  if (!ls2Data.fridgeOut) ls2Data.fridgeOut = [];

  const aiId = ls2Data.partnerId;
  const ai = friendsData?.[aiId] || {};

  if (type === 'note' || type === 'buy') {
    const title = type === 'buy' ? '喊TA买菜' : '贴留言';
    const desc = type === 'buy' ? '写下你想让TA买的食材/物品：' : '写一张便利贴：';

    ls2Prompt(title, desc, '输入内容...', async (text) => {
      text = (text || '').trim();
      if (!text) return;

      ls2Data.fridgeOut.push({
        id: Date.now(),
        type: 'note',
        text,
        by: 'me',
        color: ['pink', 'blue', 'white'][Math.floor(Math.random() * 3)],
        x: 20 + Math.random() * 50,
        y: 10 + Math.random() * 60,
        rot: Math.random() * 20 - 10
      });

      // buy：同时投递到 fridgeIn（30~90秒解锁）
      if (type === 'buy') {
        if (!ls2Data.fridgeIn) ls2Data.fridgeIn = [];
        ls2Data.fridgeIn.push({
          id: Date.now() + 1,
          emoji: '🛍️',
          name: text,
          unlockTime: Date.now() + (Math.random() * 60000 + 30000)
        });

        // 同时给微信AI一条“你看到冰箱清单了”的提示（可选）
        try {
          if (typeof sendMessageToAI === 'function') {
            sendMessageToAI(`[System: User left a grocery list on the fridge: "${text}". Reply briefly as ${ai.realName || 'you'} and say when you will buy it.]`);
          }
        } catch {}
      }

      ls2Store[ls2Key(aiId)] = ls2Data;
      await saveLs2Store();
      renderLs2Fridge();
      if (typeof showToast === 'function') showToast(type === 'buy' ? '清单已贴上，等待TA送达' : '留言已贴上');
    });
  }

  if (type === 'magnet') {
    const fileInput = document.getElementById('global-img-changer');
    if (!fileInput) return;

    // 这里不强行劫持你的全局 handleImageFileChange
    // 用一次性 onchange 来拿到图片，完事还原
    const prev = fileInput.onchange;
    fileInput.onchange = async (e) => {
      try {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
          let base64 = evt.target.result;
          try {
            if (typeof compressImage === 'function') base64 = await compressImage(base64, 300);
          } catch {}

          ls2Data.fridgeOut.push({
            id: Date.now(),
            type: 'img',
            text: base64,
            x: 30 + Math.random() * 40,
            y: 10 + Math.random() * 60,
            rot: Math.random() * 20 - 10
          });

          ls2Store[ls2Key(aiId)] = ls2Data;
          await saveLs2Store();
          renderLs2Fridge();
          if (typeof showToast === 'function') showToast('照片磁贴已贴上');
        };
        reader.readAsDataURL(f);
      } finally {
        fileInput.value = '';
        fileInput.onchange = prev;
      }
    };

    fileInput.click();
  }
};

window.ls2DelFridgeItem = function (id) {
  if (!ls2Data || !ls2Data.partnerId) return;
  ls2Data.fridgeOut = (ls2Data.fridgeOut || []).filter(x => x.id !== id);
  ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
  saveLs2Store();
  renderLs2Fridge();
};

function renderLs2Fridge() {
  const door = document.getElementById('ls2-fridge-door');
  const stage = document.getElementById('ls2-fridge-surface');
  if (!door || !stage || !ls2Data) return;

  // door bg
  const bg = ls2Data.settings?.fridgeBg;
  if (bg && bg.trim()) door.style.backgroundImage = `url('${bg}')`;

  stage.innerHTML = '';
  (ls2Data.fridgeOut || []).forEach(n => {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = (n.x || 30) + '%';
    el.style.top = (n.y || 30) + '%';
    el.style.transform = `rotate(${n.rot || 0}deg)`;
    el.style.pointerEvents = 'auto';

    if (n.type === 'note') {
      el.className = `ls2-note crooked ${n.color || 'white'}`;
      const who = n.by === 'me' ? 'Me' : (friendsData?.[ls2Data.partnerId]?.realName || 'TA');
      el.innerHTML = `
        <div style="font-size:10px; color:#aaa; margin-bottom:6px;">${who}</div>
        <div>${String(n.text || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        <i class="fas fa-trash note-del" onclick="ls2DelFridgeItem(${n.id}); event.stopPropagation();"></i>
      `;
    } else {
      el.innerHTML = `
        <img src="${n.text}" class="f-magnet-img" style="width:90px;border-radius:12px;box-shadow:0 6px 15px rgba(0,0,0,0.12);display:block;">
        <i class="fas fa-times note-del" style="position:absolute; bottom:-10px; right:-10px; background:#fff; border-radius:50%; padding:2px;" onclick="ls2DelFridgeItem(${n.id}); event.stopPropagation();"></i>
      `;
    }

    ls2MakeDraggablePercent(el, n, door, async () => {
      ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
      await saveLs2Store();
    });

    stage.appendChild(el);
  });
}

function renderFridgeInside() {
  const s1 = document.getElementById('f-shelf-1');
  const s2 = document.getElementById('f-shelf-2');
  const s3 = document.getElementById('f-shelf-3');
  if (!s1 || !s2 || !s3) return;

  s1.innerHTML = '';
  s2.innerHTML = '';
  s3.innerHTML = '';

  const arr = ls2Data?.fridgeIn || [];
  arr.forEach((item, idx) => {
    const locked = item.unlockTime && Date.now() < item.unlockTime;
    const shelf = idx % 3 === 0 ? s1 : (idx % 3 === 1 ? s2 : s3);

    if (locked) {
      const sec = Math.ceil((item.unlockTime - Date.now()) / 1000);
      shelf.insertAdjacentHTML('beforeend', `
        <div class="f-item" style="opacity:.5;filter:grayscale(100%);position:relative;">
          ${item.emoji || '🍎'}
          <div class="f-item-timer">${sec}s</div>
        </div>
      `);
    } else {
      shelf.insertAdjacentHTML('beforeend', `
        <div class="f-item" title="${(item.name||'').replace(/"/g,'&quot;')}" onclick="ls2EatFood(${item.id})">${item.emoji || '🍎'}</div>
      `);
    }
  });
}

function startFridgeTimer() {
  if (fridgeTimerInterval) clearInterval(fridgeTimerInterval);
  fridgeTimerInterval = setInterval(async () => {
    // 只有打开门才刷新，省资源
    const inside = document.getElementById('ls2-fridge-inner');
    if (!inside || inside.style.display === 'none') return;

    let changed = false;
    (ls2Data.fridgeIn || []).forEach(item => {
      if (item.unlockTime && Date.now() >= item.unlockTime) {
        item.unlockTime = null;
        changed = true;
      }
    });

    if (changed) {
      ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
      await saveLs2Store();
    }
    renderFridgeInside();
  }, 1000);
}

window.ls2EatFood = async function (id) {
  if (!ls2Data) return;
  ls2Data.fridgeIn = (ls2Data.fridgeIn || []).filter(x => x.id !== id);
  ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
  await saveLs2Store();
  renderFridgeInside();
  if (typeof showToast === 'function') showToast('吃掉啦');
};

// 饮食记录
window.ls2LogDiet = async function () {
  if (!ls2Data || !ls2Data.partnerId) return;
  const input = document.getElementById('my-diet-input');
  const box = document.getElementById('diet-ai-reaction');
  if (!input || !box) return;

  const text = (input.value || '').trim();
  if (!text) return;

  const ai = friendsData?.[ls2Data.partnerId] || {};
  box.style.display = 'block';
  box.innerText = 'AI正在计算热量...';

  const prompt = `
[System Command]
You are ${ai.realName || 'TA'}.
User diet log: "${text}"
Return JSON only:
{"calories": 500, "comment":"一句简短吐槽/夸奖/提醒"}
  `.trim();

  const res = await callAiForSpecialTask(prompt);
  if (!res) return;

  try {
    const data = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim());
    box.innerHTML = `<b>预估热量: ${data.calories} kcal</b><br>${String(data.comment || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}`;
    ls2Data.dietLog = (ls2Data.dietLog || '') + `[我] ${text} (${data.calories}kcal)\n`;
    ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
    await saveLs2Store();
  } catch (e) {
    box.innerText = '计算失败（JSON解析错误）';
  }
};

window.ls2CheckAiDiet = async function () {
  if (!ls2Data || !ls2Data.partnerId) return;
  const box = document.getElementById('diet-ai-reaction');
  if (!box) return;

  const ai = friendsData?.[ls2Data.partnerId] || {};
  box.style.display = 'block';
  box.innerText = '正在查岗 TA 今天吃了什么...';

  const prompt = `
[System Command]
You are ${ai.realName || 'TA'}.
Generate a fake but plausible diet log for today consistent with persona.
Return JSON only:
{"diet":"...", "calories": 1200}
  `.trim();

  const res = await callAiForSpecialTask(prompt);
  if (!res) return;

  try {
    const data = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim());
    box.innerHTML = `<b>${ai.realName || 'TA'} 的饮食查岗:</b><br>${String(data.diet||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}<br><span style="color:#aaa;font-size:10px;">预估热量: ${data.calories} kcal</span>`;
    ls2Data.dietLog = (ls2Data.dietLog || '') + `[TA] ${data.diet}\n`;
    ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
    await saveLs2Store();
  } catch {}
};

// ============================================================
//  Q&A
// ============================================================
window.ls2GenerateQA = async function () {
  if (!ls2Data || !ls2Data.partnerId) return;
  const aiId = ls2Data.partnerId;
  const ai = friendsData?.[aiId] || {};

  // 先让 AI 出题
  if (typeof showToast === 'function') showToast('正在抽取今日灵魂拷问...');
  const qPrompt = `
[System Command]
You are a relationship Q&A generator.
Create ONE deep but daily-life-feeling question for a couple.
Return JSON only: {"q":"..."}
  `.trim();
  const qRes = await callAiForSpecialTask(qPrompt);
  if (!qRes) return;

  let q = '今天你最想对我说的一句话是什么？';
  try {
    const data = JSON.parse(qRes.replace(/```json/gi,'').replace(/```/g,'').trim());
    if (data.q) q = String(data.q).trim();
  } catch {}

  // 问用户回答
  ls2Prompt('今日灵魂拷问', q, '我：', async (myA) => {
    myA = (myA || '').trim();
    if (!myA) return;

    // AI 回答 + reaction
    const aPrompt = `
[System Command]
You are ${ai.realName || aiId}. Persona: ${ai.persona || ''}
Question: "${q}"
User answer: "${myA}"
Now give your answer (as ${ai.realName||'TA'}) and then a short reaction sentence.
Return JSON only:
{"aiA":"...", "reaction":"..."}
    `.trim();

    const aRes = await callAiForSpecialTask(aPrompt);
    let aiA = '';
    let reaction = '';
    try {
      const data = JSON.parse(aRes.replace(/```json/gi,'').replace(/```/g,'').trim());
      aiA = (data.aiA || '').trim();
      reaction = (data.reaction || '').trim();
    } catch {
      aiA = '这个问题…我想认真回答你。';
      reaction = '你刚才那句话，我记下了。';
    }

    const entry = {
      time: Date.now(),
      q, myA, aiA, reaction
    };
    if (!ls2Data.qaHistory) ls2Data.qaHistory = [];
    ls2Data.qaHistory.unshift(entry);

    ls2Store[ls2Key(aiId)] = ls2Data;
    await saveLs2Store();
    renderLs2QA();

    await ls2InjectMemory(aiId, `完成了一次 Q&A：${q}`);
  });
};

function renderLs2QA() {
  const container = document.getElementById('ls2-qa-container');
  const history = document.getElementById('ls2-qa-history');
  if (!container || !history) return;

  const arr = ls2Data?.qaHistory || [];
  if (!arr.length) {
    container.innerHTML = '';
    history.innerHTML = '<div class="chic-empty" style="padding:20px; text-align:center;">暂无问答记录</div>';
    return;
  }

  const top = arr[0];
  container.innerHTML = `
    <div class="qa-card-flat">
      <div class="qa-q-text">${top.q}</div>
      <div class="qa-answer-row"><div class="qa-a-label">我</div><div class="qa-a-text">${top.myA}</div></div>
      <div class="qa-answer-row"><div class="qa-a-label">TA</div><div class="qa-a-text">${top.aiA}</div></div>
      <div class="qa-reaction">"${top.reaction || ''}"</div>
    </div>
  `;

  history.innerHTML = '';
  arr.slice(1).forEach(i => {
    history.innerHTML += `
      <div class="qa-history-item">
        <div class="qa-hi-q" style="font-size:12px;font-weight:bold;color:#111;margin-bottom:4px;">${i.q}</div>
        <div class="qa-hi-a" style="font-size:11px;color:#666;">我: ${i.myA}<br>TA: ${i.aiA}</div>
      </div>
    `;
  });
}

// ============================================================
//  TASKS
// ============================================================
window.ls2AddTask = function (who) {
  if (!ls2Data || !ls2Data.partnerId) return;

  ls2Prompt('添加清单', who === 'me' ? '写一条你今天要做的事：' : '写一条TA要做的事：', '例如：喝水 8 杯', async (text) => {
    text = (text || '').trim();
    if (!text) return;

    const task = {
      id: Date.now(),
      desc: text,
      current: 0,
      max: 1
    };

    if (!ls2Data.tasks) ls2Data.tasks = { me: [], ai: [], evalText: '' };
    ls2Data.tasks[who] = ls2Data.tasks[who] || [];
    ls2Data.tasks[who].unshift(task);

    ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
    await saveLs2Store();
    renderLs2Tasks();
  });
};

window.ls2DelTask = async function (who, id) {
  if (!ls2Data?.tasks) return;
  ls2Data.tasks[who] = (ls2Data.tasks[who] || []).filter(t => t.id !== id);
  ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
  await saveLs2Store();
  renderLs2Tasks();
};

window.ls2TaskTick = async function (who, id) {
  const list = ls2Data?.tasks?.[who] || [];
  const t = list.find(x => x.id === id);
  if (!t) return;

  if (t.current < t.max) t.current++;
  else t.current = t.max;

  ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
  await saveLs2Store();
  renderLs2Tasks();
};

window.ls2GenerateAITask = async function () {
  if (!ls2Data || !ls2Data.partnerId) return;
  const ai = friendsData?.[ls2Data.partnerId] || {};

  if (typeof showToast === 'function') showToast('正在为 TA 生成今日清单...');

  const prompt = `
[System Command]
You are ${ai.realName || 'TA'}.
Persona: ${ai.persona || ''}

Generate 3 daily tasks for yourself (realistic).
Return JSON only:
[
  {"desc":"...", "max":1},
  {"desc":"...", "max":2},
  {"desc":"...", "max":1}
]
  `.trim();

  const res = await callAiForSpecialTask(prompt);
  if (!res) return;

  try {
    const arr = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim());
    if (!Array.isArray(arr)) throw new Error('not array');

    if (!ls2Data.tasks) ls2Data.tasks = { me: [], ai: [], evalText: '' };
    ls2Data.tasks.ai = arr.map(it => ({
      id: Date.now() + Math.random(),
      desc: String(it.desc || '').trim(),
      current: 0,
      max: Math.max(1, parseInt(it.max, 10) || 1)
    })).filter(x => x.desc);

    ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
    await saveLs2Store();
    renderLs2Tasks();
  } catch (e) {
    console.error(res);
    if (typeof showToast === 'function') showToast('生成失败：JSON解析错误');
  }
};

window.ls2EvalTasks = async function () {
  if (!ls2Data || !ls2Data.partnerId) return;
  const ai = friendsData?.[ls2Data.partnerId] || {};

  const meTasks = (ls2Data.tasks?.me || []).map(t => `${t.desc} (${t.current}/${t.max})`).join('\n') || '(无)';
  const aiTasks = (ls2Data.tasks?.ai || []).map(t => `${t.desc} (${t.current}/${t.max})`).join('\n') || '(无)';

  const prompt = `
[System Command]
You are a daily couple coach.
User tasks:
${meTasks}

Partner(${ai.realName || 'TA'}) tasks:
${aiTasks}

Write a short end-of-day evaluation (Chinese), cute but not too long.
Return JSON only: {"text":"..."}
  `.trim();

  const res = await callAiForSpecialTask(prompt);
  if (!res) return;

  try {
    const data = JSON.parse(res.replace(/```json/gi,'').replace(/```/g,'').trim());
    if (!ls2Data.tasks) ls2Data.tasks = { me: [], ai: [], evalText: '' };
    ls2Data.tasks.evalText = data.text || '今天也辛苦啦。';

    ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
    await saveLs2Store();
    renderLs2Tasks();

    await ls2InjectMemory(ls2Data.partnerId, '生成了一份日结报告。');
  } catch {
    if (typeof showToast === 'function') showToast('日结报告解析失败');
  }
};

function renderLs2Tasks() {
  const meBox = document.getElementById('ls2-tasks-me');
  const aiBox = document.getElementById('ls2-tasks-ai');
  const evalText = document.getElementById('ls2-task-eval-text');
  if (!meBox || !aiBox || !evalText) return;

  const tasks = ls2Data?.tasks || { me: [], ai: [], evalText: '' };

  const renderOne = (who) => {
    const list = tasks[who] || [];
    if (!list.length) return '<div class="chic-empty">暂无数据</div>';
    return list.map(t => `
      <div class="flat-task-item">
        <div style="flex:1;">
          <div class="fti-desc">${t.desc}</div>
          <div class="fti-prog">${t.current}/${t.max}</div>
        </div>
        <div class="fti-actions">
          <div class="fti-btn ${t.current >= t.max ? 'done' : ''}" onclick="ls2TaskTick('${who}', ${t.id})">
            <i class="fas ${t.current >= t.max ? 'fa-check' : 'fa-plus'}"></i>
          </div>
          <i class="fas fa-times fti-del" onclick="ls2DelTask('${who}', ${t.id})"></i>
        </div>
      </div>
    `).join('');
  };

  meBox.innerHTML = renderOne('me');
  aiBox.innerHTML = renderOne('ai');
  evalText.innerText = tasks.evalText || '等待日结...';
}

// ============================================================
//  SETTINGS MODAL
// ============================================================
window.ls2ToggleSettings = function () {
  const m = document.getElementById('ls2-settings-modal');
  if (!m || !ls2Data) return;

  const isActive = m.classList.contains('active');
  if (isActive) {
    m.classList.remove('active');
    return;
  }

  // fill values
  const spaceBg = document.getElementById('ls2-set-space-bg');
  const fridgeBg = document.getElementById('ls2-set-fridge-bg');
  const coverBg = document.getElementById('ls2-set-journal-cover');

  const fontMe = document.getElementById('ls2-set-font-me');
  const fontAi = document.getElementById('ls2-set-font-ai');

  const tStatus = document.getElementById('ls2-set-status');
  const tJournal = document.getElementById('ls2-set-journal');
  const tFridge = document.getElementById('ls2-set-fridge');
  const interval = document.getElementById('ls2-set-interval');

  if (spaceBg) spaceBg.value = ls2Data.settings?.spaceBg || '';
  if (fridgeBg) fridgeBg.value = ls2Data.settings?.fridgeBg || '';
  if (coverBg) coverBg.value = ls2Data.settings?.journalCover || '';

  if (fontMe) fontMe.value = ls2Data.settings?.fontMeUrl || '';
  if (fontAi) fontAi.value = ls2Data.settings?.fontAiUrl || '';

  if (tStatus) tStatus.checked = !!ls2Data.settings?.autoStatus;
  if (tJournal) tJournal.checked = !!ls2Data.settings?.autoJournal;
  if (tFridge) tFridge.checked = !!ls2Data.settings?.autoFridge;
  if (interval) interval.value = ls2Data.settings?.intervalHrs || 4;

  m.classList.add('active');
};

window.ls2SaveSettingsBtn = async function () {
  if (!ls2Data || !ls2Data.partnerId) return;
  if (!ls2Data.settings) ls2Data.settings = {};

  const spaceBg = document.getElementById('ls2-set-space-bg');
  const fridgeBg = document.getElementById('ls2-set-fridge-bg');
  const coverBg = document.getElementById('ls2-set-journal-cover');

  const fontMe = document.getElementById('ls2-set-font-me');
  const fontAi = document.getElementById('ls2-set-font-ai');

  const tStatus = document.getElementById('ls2-set-status');
  const tJournal = document.getElementById('ls2-set-journal');
  const tFridge = document.getElementById('ls2-set-fridge');
  const interval = document.getElementById('ls2-set-interval');

  if (spaceBg) ls2Data.settings.spaceBg = spaceBg.value.trim();
  if (fridgeBg) ls2Data.settings.fridgeBg = fridgeBg.value.trim();
  if (coverBg) ls2Data.settings.journalCover = coverBg.value.trim();

  if (fontMe) ls2Data.settings.fontMeUrl = fontMe.value.trim();
  if (fontAi) ls2Data.settings.fontAiUrl = fontAi.value.trim();

  ls2Data.settings.autoStatus = !!tStatus?.checked;
  ls2Data.settings.autoJournal = !!tJournal?.checked;
  ls2Data.settings.autoFridge = !!tFridge?.checked;
  ls2Data.settings.intervalHrs = parseFloat(interval?.value) || 4;

  ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
  await saveLs2Store();

  // 立即应用 UI
  ls2UpdateHeader();
  renderLs2Journal();
  renderLs2Fridge();

  // 关闭弹窗
  const m = document.getElementById('ls2-settings-modal');
  if (m) m.classList.remove('active');

  if (typeof showToast === 'function') showToast('设置已保存');
};

// ============================================================
//  AUTO GENERATION (00:00 / interval)
// ============================================================
function checkAutoGeneration() {
  if (!ls2Data || !ls2Data.partnerId) return;

  // 示例：只做“跨日自动生成 TA 日记”
  const today = new Date().toLocaleDateString();
  if (!ls2Data.settings) ls2Data.settings = {};
  const last = ls2Data.settings.lastJournalDate || '';

  if (ls2Data.settings.autoJournal && last !== today) {
    ls2Data.settings.lastJournalDate = today;
    ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
    saveLs2Store();

    // 静默生成
    window.ls2GenerateJournal(true);
  }
}

// ============================================================
//  INIT HOOK (optional)
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // LoveSpace 本身不强制初始化，openLoveSpaceApp 时会 load store
  // 但可以预加载一次避免第一次点开卡顿
  // loadLs2Store().catch(()=>{});
});
// === [新增] 处理底图上传与清除 ===
window.ls2HandleStickerBgFile = function(input) {
    if (input.files && input.files[0]) { // 修正：必须是 files[0]
        const reader = new FileReader();
        reader.onload = async (e) => {
            let base64 = e.target.result;
            if (typeof compressImage === 'function') base64 = await compressImage(base64, 400);
            const preview = document.getElementById('ls2-sticker-bg-preview');
            const val = document.getElementById('ls2-sticker-bg-val');
            if (preview && val) {
                preview.style.backgroundImage = `url('${base64}')`;
                preview.style.display = 'block';
                val.value = base64;
            }
        };
        reader.readAsDataURL(input.files[0]); // 修正：必须是 files[0]
    }
    input.value = '';
}

window.ls2ClearStickerBg = function() {
    const preview = document.getElementById('ls2-sticker-bg-preview');
    const val = document.getElementById('ls2-sticker-bg-val');
    if (preview && val) {
        preview.style.display = 'none';
        preview.style.backgroundImage = 'none';
        val.value = '';
    }
}

// === [新增] 处理贴纸放大缩小 ===
window.ls2ScaleNote = function(stickerId, diff) {
    if (!ls2Data || !ls2Data.partnerId) return;
    
    const isMeTab = document.querySelectorAll('.j-tab')?.[0]?.classList.contains('active'); 
    const idx = ls2Data.currentJournalIndex || 0;
    const j = ls2Data.journals[idx];
    
    const stickers = isMeTab ? (j.stickersMe || []) : (j.stickersAi || []);
    // 【核心修复】加上 String() 转换，防止浮点数精度丢失找不到贴纸
    const s = stickers.find(x => String(x.id) === String(stickerId));
    
    if (s) {
        s.scale = (s.scale || 1) + diff;
        if (s.scale < 0.3) s.scale = 0.3; // 限制最小缩放比例
        if (s.scale > 4) s.scale = 4;     // 限制最大缩放比例
        ls2Store[ls2Key(ls2Data.partnerId)] = ls2Data;
        saveLs2Store();
        renderLs2Journal();
    }
}

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

// 新增全局浮动文字函数
function spawnFloatingText(L, x, y, text, color) {
    L.texts.push({x, y, text, color, life: 50, maxLife: 50});
}
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
// ↑↑↑ 补到这里 ↑↑↑

window.g11d_holdStart = function() {
  if (!g11dState?.running || g11dState.me.dead) return;
  g11dState.me.hold = true; 
};



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
