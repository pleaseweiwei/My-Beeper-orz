// js/apps.js (完整功能版：AI + 高级主题 + CSS美化 + 预设)
let currentAiController = null;

// --- LocalStorage Keys ---
const SETTINGS_KEY = 'myCoolPhone_aiSettings';
const PRESETS_KEY = 'myCoolPhone_aiPresets';
const VOICE_PRESETS_KEY = 'myCoolPhone_voicePresets';
const IMAGEGEN_PRESETS_KEY = 'myCoolPhone_imagegenPresets';
const THEME_KEY = 'myCoolPhone_themeSettings';
const ICONS_KEY = 'myCoolPhone_customIcons';
const THEME_PRESETS_KEY = 'myCoolPhone_themePresets'; // 新增：主题预设Key
// 【新增】用于存储所有好友数据的 Key
const FRIENDS_DATA_KEY = 'myCoolPhone_friendsData';
const HOME_CUSTOM_KEY = 'myCoolPhone_homeCustom';
const MOMENTS_FEED_KEY = 'myCoolPhone_momentsFeed';

// =========================================
// 【新增】全局未读红点管理机制
// =========================================
window.getMomentsUnreadCount = function() {
    return parseInt(localStorage.getItem('myCoolPhone_momentsUnreadCount')) || 0;
};
window.addMomentsUnreadCount = function(num = 1) {
    let current = getMomentsUnreadCount();
    localStorage.setItem('myCoolPhone_momentsUnreadCount', current + num);
    if (typeof updateMomentsUnreadUI === 'function') updateMomentsUnreadUI();
};
window.clearMomentsUnreadCount = function() {
    localStorage.setItem('myCoolPhone_momentsUnreadCount', 0);
    if (typeof updateMomentsUnreadUI === 'function') updateMomentsUnreadUI();
};
window.updateMomentsUnreadUI = function() {
    const count = getMomentsUnreadCount();
    
    // 更新底部导航栏的数字气泡
    const badge = document.getElementById('moments-badge');
    if (badge) {
        if (count > 0) {
            badge.innerText = count > 99 ? '99+' : count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
    
    // 更新聊天界面左上角的小红点
    const backDot = document.getElementById('chat-back-dot');
    if (backDot) {
        backDot.style.display = count > 0 ? 'block' : 'none';
    }
};
window.updateDockUnreadDot = function() {
    // 遍历所有人，加总未读数
    let totalUnread = 0;
    Object.values(friendsData || {}).forEach(f => { totalUnread += (f.unreadCount || 0); });
    Object.values(groupsData || {}).forEach(g => { totalUnread += (g.unreadCount || 0); });
    
    const dockDot = document.getElementById('dock-dot');
    if (dockDot) dockDot.style.display = totalUnread > 0 ? 'block' : 'none';
};
window.updateChatListUnreadUI = function(chatId) {
    const item = document.querySelector(`.wc-chat-item[data-chat-id="${chatId}"]`);
    if (item) {
        const badge = item.querySelector('.wc-badge');
        if (badge) badge.remove();
    }
};

// === 【新增】存放当前角色的心声状态 ===
let currentMindState = {
    action: "正在发呆",
    location: "未知地点",
    weather: "晴",
    murmur: "..."
};
// ─── 微信风格时间气泡辅助函数 ──────────────────────────────────────────────
let _lastChatMsgTimestamp = 0; // 记录上一条渲染消息的时间戳

function _formatChatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();

    // ── 微信风格时间部分：上午/下午/晚上 + 12小时制 ──
    const hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    let period, displayHour;
    if (hours >= 0 && hours < 6) {
        period = '凌晨'; displayHour = hours === 0 ? 12 : hours;
    } else if (hours >= 6 && hours < 12) {
        period = '上午'; displayHour = hours === 0 ? 12 : hours;
    } else if (hours === 12) {
        period = '中午'; displayHour = 12;
    } else if (hours >= 13 && hours < 18) {
        period = '下午'; displayHour = hours - 12;
    } else {
        period = '晚上'; displayHour = hours - 12;
    }
    const timeStr = `${period} ${displayHour}:${minutes}`;

    // ── 日期部分 ──
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return timeStr;

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `昨天 ${timeStr}`;

    // 一周内（用"星期X"而非"周X"）
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMsgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayDiff = Math.floor((startOfToday - startOfMsgDay) / 86400000);
    if (dayDiff < 7 && dayDiff >= 2) {
        const dayNames = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
        return `${dayNames[d.getDay()]} ${timeStr}`;
    }

    // 跨年
    if (d.getFullYear() !== now.getFullYear()) {
        return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 ${timeStr}`;
    }

    // 同年但更早（超过一周）
    return `${d.getMonth()+1}月${d.getDate()}日 ${timeStr}`;
}

function ensureFriendMindFields(friend, friendId = 'AI') {
    if (!friend) return;

    if (!friend.mindState) friend.mindState = {};

    friend.mindState = {
        action: friend.mindState.action || "正在发呆",
        location: friend.mindState.location || "未知地点",
        weather: friend.mindState.weather || "晴",
        murmur: friend.mindState.murmur || "我还没想好要说什么。不过我在看着你。也在等你继续靠近一点。",
        hiddenThought: friend.mindState.hiddenThought || "",
        kaomoji: friend.mindState.kaomoji || "( ˙W˙ )",
        bgm: friend.mindState.bgm || "No BGM"
    };
}
function ensureFriendSummaryFields(friend) {
    if (!friend) return;

    if (!friend.summaryConfig) friend.summaryConfig = {};

    if (
        friend.summaryConfig.turnCount === undefined ||
        friend.summaryConfig.turnCount === null ||
        friend.summaryConfig.turnCount === ''
    ) {
        friend.summaryConfig.turnCount = 20;
    }

    if (
        friend.summaryConfig.wordCount === undefined ||
        friend.summaryConfig.wordCount === null ||
        friend.summaryConfig.wordCount === ''
    ) {
        friend.summaryConfig.wordCount = 200;
    }

    if (typeof friend.summaryConfig.prompt !== 'string') {
        friend.summaryConfig.prompt = '';
    }

    if (!Array.isArray(friend.summaries)) friend.summaries = [];
    if (!Array.isArray(friend.relationshipLog)) friend.relationshipLog = [];
}

function normalizeAllFriendsSummaryFields() {
    Object.keys(friendsData || {}).forEach(id => {
        ensureFriendSummaryFields(friendsData[id]);
    });
}

function normalizeAllFriendsMindFields() {
    Object.keys(friendsData || {}).forEach(id => {
        ensureFriendMindFields(friendsData[id], id);
    });
}

function applyMindMarqueeIfOverflow() {
    const ids = ['mind-location-val', 'mind-action-val', 'now-playing-bgm', 'mind-weather-val'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el || !el.parentElement) return;
        const wrap = el.parentElement;
        wrap.classList.remove('scrolling');

        requestAnimationFrame(() => {
            if (el.scrollWidth > wrap.clientWidth) {
                wrap.classList.add('scrolling');
            }
        });
    });
}

function updateAffectionUI(score) {
    const text = document.getElementById('affection-percent-text');
    if (text) text.innerText = score !== undefined && score !== null ? String(score) + '%' : '???';
    
    const fill = document.getElementById('affection-fill');
    if (fill && score !== undefined && score !== null) {
        fill.style.width = Math.min(100, Math.max(0, parseInt(score))) + '%';
    }
}

function syncMindBgmToPlayer(bgmText) {
    if (!bgmText) return;

    // 只保留更新心声卡片内部 BGM 显示的部分
    const bgmEl = document.getElementById('now-playing-bgm');
    if (bgmEl) bgmEl.innerText = bgmText;

    // 保留这个，它只影响心声卡片自己的 UI
    applyMindMarqueeIfOverflow();
}

window.saveHomeMusicText = async function() {
    const homeTitle = document.getElementById('home-music-title');
    const homeArtist = document.getElementById('home-music-artist');
    if (!homeTitle || !homeArtist) return;

    const titleText = homeTitle.innerText.trim() || 'No Title';
    const artistText = homeArtist.innerText.trim() || 'No Artist';
    const bgmText = titleText + ' - ' + artistText;

    // Use a primary target friend to store the BGM if applicable
    const targetChatId = typeof currentChatId !== 'undefined' && currentChatId ? currentChatId : (typeof window.primaryChatId !== 'undefined' ? window.primaryChatId : null);
    
    if (targetChatId && typeof friendsData !== 'undefined' && friendsData[targetChatId]) {
        friendsData[targetChatId].mindState = friendsData[targetChatId].mindState || {};
        friendsData[targetChatId].mindState.bgm = bgmText;
        if (typeof saveFriendsData === 'function') {
            await saveFriendsData();
        }
    }
};

function refreshMindCardUI(friendId, useTyping = false) {
    const friend = friendsData[friendId];
    if (!friend) return;

    ensureFriendMindFields(friend, friendId);
    const state = friend.mindState;

    const avatarEl = document.querySelector('.mind-big-avatar');
    const nameEl = document.querySelector('.mind-name');

    if (avatarEl) {
        avatarEl.src = friend.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(friend.realName || friendId)}`;
    }
    if (nameEl) {
        nameEl.innerText = friend.remark || friend.realName || friendId;
    }

    updateAffectionUI(friend.affection);

    const locEl = document.getElementById('mind-location-val');
    const actEl = document.getElementById('mind-action-val');
    const weaEl = document.getElementById('mind-weather-val');
    const bgmEl = document.getElementById('now-playing-bgm');
    const kaoEl = document.getElementById('mind-kaomoji-display');
    const murEl = document.getElementById('mind-murmur-text');
    const darkMurContainer = document.getElementById('mind-dark-murmur-container');
    const darkMurEl = document.getElementById('mind-dark-murmur-text');

    if (locEl) locEl.innerText = state.location || "未知地点";
    if (actEl) actEl.innerText = state.action || "正在发呆";
    if (weaEl) weaEl.innerText = state.weather || "晴";
    if (bgmEl) bgmEl.innerText = state.bgm || "No BGM";
    if (kaoEl) kaoEl.innerText = state.kaomoji || "( ˙W˙ )";

        // if (useTyping && typeof typeWriterEffect === 'function') {
        //     typeWriterEffect(state.murmur || "...", 'mind-murmur-text', 18);
        //     if (state.hiddenThought && state.hiddenThought.trim() !== '') {
        //         if (darkMurContainer) darkMurContainer.style.display = 'block';
        //         typeWriterEffect(state.hiddenThought, 'mind-dark-murmur-text', 18);
        //     } else {
        //         if (darkMurContainer) darkMurContainer.style.display = 'none';
        //     }
        // } else {
        if (murEl) murEl.innerText = state.murmur || "...";
        if (state.hiddenThought && state.hiddenThought.trim() !== '') {
            if (darkMurContainer) darkMurContainer.style.display = 'block';
            if (darkMurEl) darkMurEl.innerText = state.hiddenThought;
        } else {
            if (darkMurContainer) darkMurContainer.style.display = 'none';
        // }
    }

    applyMindMarqueeIfOverflow();
}

function parseAndApplyMindStateBlock(friendId, statusBlock) {
    const friend = friendsData[friendId];
    if (!friend || !statusBlock) return;

    ensureFriendMindFields(friend, friendId);

    const getVal = (key) => {
        // 支持多行捕获：抓取当前字段直到下一个字段名或块结尾
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const reg = new RegExp(
            `(?:[-*•]\\s*)?${escapedKey}[:：]\\s*([\\s\\S]*?)(?=\\n(?:[-*•]\\s*)?[A-Za-z]+[:：]|\\n\\[(?:\\/)?STATUS_END\\]|$)`,
            'i'
        );
        const m = statusBlock.match(reg);
        return m ? m[1].trim() : '';
    };

    const affectionVal = getVal('Affection');
    if (affectionVal) {
        const match = affectionVal.match(/\d+/);
        if (match) {
            friend.affection = parseInt(match[0]);
        }
    }

    friend.mindState.action = getVal('Action') || friend.mindState.action;
    friend.mindState.location = getVal('Location') || friend.mindState.location;
    friend.mindState.weather = getVal('Weather') || friend.mindState.weather;
    friend.mindState.bgm = getVal('BGM') || friend.mindState.bgm;
    friend.mindState.murmur = getVal('Murmur') || friend.mindState.murmur;
    friend.mindState.hiddenThought = getVal('HiddenThought') || '';
    friend.mindState.kaomoji = getVal('Kaomoji') || friend.mindState.kaomoji;

    saveFriendsData();

    const isOpen = document.getElementById('mind-card-overlay')?.classList.contains('active');
refreshMindCardUI(friendId, false);
    syncMindBgmToPlayer(friend.mindState.bgm);
}

// === [插入] 线下模式与预设的全局变量 ===
const PRESETS_DATA_KEY = 'myCoolPhone_tavernPresets';
const OFFLINE_CONFIG_KEY = 'myCoolPhone_offlineConfig';
let tavernPresets = [];
let offlineConfig = { activePresetId: 'default', maxLength: 200, streamingEnabled: false };
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
    await migrateAllChatHistory();
    // 【修复】加上 await 防止异步竞态导致 currentPersonaId 没来得及赋值而读取出空角色列表
    await initPersonaSystem();
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
        const mainDockBar = document.getElementById('main-dock-bar');
        if (bootScreen) {
            bootScreen.classList.add('fade-out'); // 添加淡出类
            if (mainDockBar) {
                mainDockBar.style.opacity = '1';
                mainDockBar.style.pointerEvents = 'auto';
            }
            setTimeout(() => {
                bootScreen.remove(); // 动画完后移除元素
            }, 800); 
        } else if (mainDockBar) {
            mainDockBar.style.opacity = '1';
            mainDockBar.style.pointerEvents = 'auto';
        }
    }, 2800); // 3.2秒后消失，稍微多留一点时间展示动画细节


    initializeGreetingTypewriter();
    initSettingsAndPresets(); 
    initOfflineSystem(); // 启动预设系统
    initThemeSettings(); // 初始化主题
    


    // 【修复】加上 await 确保后续红点更新等逻辑能读到最新鲜的数据
    await loadFriendsData();
    
    // 【修复】加载群聊数据，确保在身份切换后正确加载，避免群聊消失
    if (typeof loadGroupsData === 'function') await loadGroupsData();

    // 桌宠外观依赖 friendsData（头像），数据加载完后刷新一次
    if (typeof FloatPet !== 'undefined' && typeof FloatPet.refresh === 'function') {
        FloatPet.refresh();
    }
    // 新增：加载朋友圈数据
    loadMomentsFeed();

    // 【新增】初始化全局红点 UI
    updateMomentsUnreadUI();
    updateDockUnreadDot();

    // ── 离线批量消息：APP 打开时检查所有好友，若到期则一次性生成 ──
    // 延迟 2 秒，等 IndexedDB 和 friendsData 完全就绪后再触发
    if (typeof checkAndGenerateOfflineMsgsOnAppOpen === 'function') {
        setTimeout(checkAndGenerateOfflineMsgsOnAppOpen, 2000);
    }



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
         chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = document.getElementById('chatInput');
            const message = input.value.trim();
            if (!message) return;

            lastUserMessageForAI = message;
            
            const msgId = 'msg_user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

            // 强制上屏普通的文本气泡，传入唯一的 msgId
            appendMessage(message, 'sent', null, null, null, msgId);

            if (currentChatId) {
                saveMessageToHistory(currentChatId, {
                    id: msgId,
                    text: message,
                    type: 'sent',
                    senderName: 'ME'
                });
            }


            // 清空输入框
            input.value = '';
            
            // 【新增】发完消息后隐藏表情包联想框
            const suggestBox = document.getElementById('chat-sticker-suggest');
            if(suggestBox) suggestBox.style.display = 'none';

            // 【新增】检查是否有外卖意图并静默查询高德API注入给AI
            await checkAndInjectTakeoutInfo(message, msgId);
        });

        // === 【新增核心逻辑】：监听输入框，实现联想表情功能 ===
        const chatInputDom = document.getElementById('chatInput');
        if(chatInputDom) {
            chatInputDom.addEventListener('input', (e) => {
                const val = e.target.value.trim();
                const suggestBox = document.getElementById('chat-sticker-suggest');
                if (!suggestBox) return;
                
                // 输入为空或表情库为空时，不显示
                if (!val || !window.allStickers || window.allStickers.length === 0) {
                    suggestBox.style.display = 'none';
                    return;
                }

                // 筛选你权限下可用的表情包
                let availableStickers = window.allStickers.filter(s => s.scope === 'global' || (s.scope === 'exclusive' && s.owner === currentChatId));
                
                // 查找名字中包含你输入文字的表情包
                let matched = availableStickers.filter(s => s.name.includes(val));
                
                // 如果匹配到，渲染出气泡选择框
                if (matched.length > 0) {
                    suggestBox.innerHTML = '';
                    // 最多显示10个联想表情，防止框太长
                    matched.slice(0, 10).forEach(s => {
                        const item = document.createElement('div');
                        item.className = 'suggest-item';
                        item.onclick = () => {
                            sendStickerFromPanel(s.name, s.url); // 直接发送
                            chatInputDom.value = ''; // 清空输入
                            suggestBox.style.display = 'none'; // 隐藏弹框
                        };
                        item.innerHTML = `
                            <img src="${s.url}" title="${s.name}">
                            <div class="suggest-name">${s.name}</div>
                        `;
                        suggestBox.appendChild(item);
                    });
                    suggestBox.style.display = 'flex';
                } else {
                    suggestBox.style.display = 'none';
                }
            });
        }


        
              const aiBtn = document.getElementById('triggerAiReply');
        if (aiBtn) {
            aiBtn.addEventListener('click', async () => {
                // === 【新增】中止生成判断 ===
                if (aiBtn.classList.contains('processing')) {
                    if (currentAiController) {
                        currentAiController.abort();
                        currentAiController = null;
                        if(typeof showToast === 'function') showToast("已停止生成");
                    }
                    aiBtn.classList.remove('processing');
                    aiBtn.classList.remove('fa-stop-circle');
                    aiBtn.classList.add('fa-star');
                    aiBtn.style.color = ''; // 恢复原来的颜色
                    return; // 阻止后续逻辑
                }

                const history = await loadChatHistory(currentChatId);
                let contextMessages = [];

                // 倒序查找，直到找到最后一条 AI 发的消息 (type === 'received')
                for (let i = history.length - 1; i >= 0; i--) {
                    if (history[i].type === 'received') {
                        break; // 停止收集
                    }
                    if (history[i].type === 'sent') {
                        contextMessages.unshift(history[i].text);
                    }
                    // 新增：如果你撤回了消息，把撤回动作告诉AI
                    if (history[i].type === 'system' && history[i].isRevoked) {
                        contextMessages.unshift(`[System: The user just revoked a message saying "${history[i].originalText}". You can playfully tease them about it.]`);
                    }
                }

                // 检查输入框里是否还有没发出去的字，如果有，算进去并帮你发出去
                const currentInput = document.getElementById('chatInput').value.trim();
                if (currentInput) {
                    document.getElementById('chatForm').dispatchEvent(new Event('submit'));
                    contextMessages.push(currentInput);
                }

                // 发送合并后的消息
                if (contextMessages.length > 0) {
                    aiBtn.classList.add('processing'); // 让星星变成黄色并开始旋转
                    aiBtn.classList.remove('fa-star');
                    aiBtn.classList.add('fa-stop-circle');
                    aiBtn.style.color = '#ff4444'; // 显眼的红色表示停止
                    
                    const combinedMessage = contextMessages.join('\n');
                    
                    // 等待发送完成后，必定会移除旋转状态，彻底解决卡死问题
                    sendMessageToAI(combinedMessage).finally(() => {
                        aiBtn.classList.remove('processing');
                        aiBtn.classList.remove('fa-stop-circle');
                        aiBtn.classList.add('fa-star');
                        aiBtn.style.color = ''; // 恢复原来的颜色
                    });
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

function queueUiWrite(fn) {
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => requestAnimationFrame(fn));
    } else {
        setTimeout(fn, 16);
    }
}

function setSoftDisplay(el, visible, displayMode = '') {
    if (!el) return;
    if (visible) {
        el.hidden = false;
        el.style.display = displayMode || '';
    } else {
        el.hidden = true;
        el.style.display = 'none';
    }
}

function switchSoftDisplays(items, activeKey) {
    queueUiWrite(() => {
        items.forEach(item => {
            if (!item || !item.el) return;
            const isActive = item.key === activeKey;
            setSoftDisplay(item.el, isActive, item.display || '');
            item.el.classList.toggle('active', isActive);
        });
    });
}

window.switchSettingsTab = function(tabName) {
    const tabs = Array.from(document.querySelectorAll('.tab-content'));
    switchSoftDisplays(
        tabs.map(el => ({
            key: el.id.replace('tab-content-', ''),
            el,
            display: 'block'
        })),
        tabName
    );

    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    const btns = document.querySelectorAll('.tab-btn');
    if(tabName === 'ai') btns[0]?.classList.add('active');
    else btns[1]?.classList.add('active');
};

/* =========================================
   Theme Management (含 CSS、预设、导入导出)
   ========================================= */

window.toggleFontInput = function(mode) {
    setSoftDisplay(document.getElementById('group-font-preset'), mode !== 'custom', 'block');
    setSoftDisplay(document.getElementById('group-font-custom'), mode === 'custom', 'block');
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

    // 2b. 全局聊天 CSS
    const globalChatCssInput = document.getElementById('global-chat-css-input');
    const globalChatStyleTag = document.getElementById('dynamic-global-chat-css');
    if (savedTheme.globalChatCSS) {
        if (globalChatStyleTag) globalChatStyleTag.innerHTML = savedTheme.globalChatCSS;
        if (globalChatCssInput) globalChatCssInput.value = savedTheme.globalChatCSS;
    } else {
        if (globalChatStyleTag) globalChatStyleTag.innerHTML = '';
        if (globalChatCssInput) globalChatCssInput.value = '';
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

    // 全局聊天 CSS 实时预览
    const globalChatCssInputEl = document.getElementById('global-chat-css-input');
    if (globalChatCssInputEl) {
        globalChatCssInputEl.addEventListener('input', (e) => {
            const tag = document.getElementById('dynamic-global-chat-css');
            if (tag) tag.innerHTML = e.target.value;
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
    // 保存全局聊天 CSS
    const _gcInput = document.getElementById('global-chat-css-input');
    if (_gcInput) theme.globalChatCSS = _gcInput.value;

    localStorage.setItem(THEME_KEY, JSON.stringify(theme));
    initThemeSettings();
if (typeof toggleSettings === 'function') {
        toggleSettings();
    }
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
        document.getElementById('apiGroupIdInput').value = settings.groupId || '';
        document.getElementById('apiEndpointInput').value = settings.endpoint || '';
                // 新增读取语音配置 ↓
        if (document.getElementById('voiceApiKeyInput')) {
            document.getElementById('voiceApiKeyInput').value = settings.voiceApiKey || '';
        }
        if (document.getElementById('voiceGroupIdInput')) {
            document.getElementById('voiceGroupIdInput').value = settings.voiceGroupId || '';
        }

        document.getElementById('temperature-slider').value = settings.temperature || 0.7;
        document.getElementById('temperature-value').textContent = settings.temperature || 0.7;
        
        const metaToggle = document.getElementById('enable-meta-delete-toggle');
        if(metaToggle) metaToggle.checked = settings.enableMetaDelete === true;

        updateUIForProvider(settings.provider || 'custom');
        const modelSelect = document.getElementById('model-select');
        if (settings.model) {
            let exists = false;
            for(let i=0; i<modelSelect.options.length; i++){ if(modelSelect.options[i].value === settings.model) exists = true; }
            if(!exists) { const opt = document.createElement('option'); opt.value = settings.model; opt.text = settings.model; modelSelect.appendChild(opt); }
            modelSelect.value = settings.model;
        }

        const voiceModelSelect = document.getElementById('voice-model-select');
        if (voiceModelSelect && settings.voiceModel) {
            let exists = false;
            for(let i=0; i<voiceModelSelect.options.length; i++){ if(voiceModelSelect.options[i].value === settings.voiceModel) exists = true; }
            if(!exists) { const opt = document.createElement('option'); opt.value = settings.voiceModel; opt.text = settings.voiceModel; voiceModelSelect.appendChild(opt); }
            voiceModelSelect.value = settings.voiceModel;
        }
    } else { updateUIForProvider('custom'); }
    loadPresetsToUI();
    loadVoicePresetsToUI();
    loadImagegenPresetsToUI();
}
// [新增] 初始化线下模式系统（读取预设和配置）
async function initOfflineSystem() {
    // 1. 读取配置
    const conf = localStorage.getItem(OFFLINE_CONFIG_KEY);
    if(conf) offlineConfig = JSON.parse(conf);
    
    // 2. 尝试从 IndexedDB 读取预设
    let presets = await IDB.get(PRESETS_DATA_KEY);
    
    // 3. 兼容：如果在 IndexedDB 中没找到，尝试从 localStorage 中迁移
    if (!presets) {
        const lsPresets = localStorage.getItem(PRESETS_DATA_KEY);
        if (lsPresets) {
            presets = JSON.parse(lsPresets);
            await IDB.set(PRESETS_DATA_KEY, presets);
        }
    }
    
    if(presets) {
        tavernPresets = presets;
    } else {
        // 如果没有，创建默认预设
        tavernPresets = [{
            id: 'default',
            name: '默认 (Default)',
            systemPrompt: 'Write a descriptive, immersive narrative response. Use *asterisks* for actions.',
            regex: '\\[STATUS_START\\]([\\s\\S]*?)\\[STATUS_END\\]', 
            jailbreak: ''
        }];
        await IDB.set(PRESETS_DATA_KEY, tavernPresets);
    }
}

function updateUIForProvider(provider) {
    const endpointGroup = document.getElementById('api-endpoint-group');
    const groupIdGroup = document.getElementById('api-groupid-group');
    const modelSelect = document.getElementById('model-select');
    
    // Minimax domestic vs global endpoints
    if (provider === 'minimax') {
        document.getElementById('apiEndpointInput').value = 'https://api.minimax.chat';
    } else if (provider === 'minimax_global') {
        document.getElementById('apiEndpointInput').value = 'https://api.minimaxi.com';
    }
    
    const shouldShowEndpoint = provider === 'custom' || provider === 'deepseek' || provider.startsWith('minimax');
    const shouldShowGroupId = provider.startsWith('minimax');

    setSoftDisplay(endpointGroup, shouldShowEndpoint, 'block');
    setSoftDisplay(groupIdGroup, shouldShowGroupId, 'block');
    
    if (provider === 'deepseek' && !document.getElementById('apiEndpointInput').value) {
        document.getElementById('apiEndpointInput').value = 'https://api.deepseek.com';
    }

    modelSelect.innerHTML = '';
    const models = PREDEFINED_MODELS[provider] || [];
    if (models.length > 0) { models.forEach(m => { const opt = document.createElement('option'); opt.value = m; opt.text = m; modelSelect.appendChild(opt); }); } 
    else { const opt = document.createElement('option'); opt.value = ''; opt.text = '请点击刷新获取模型 ->'; modelSelect.appendChild(opt); }
}

function saveAllSettings() {
    const settings = {
        provider: document.getElementById('api-provider-select').value,
        apiKey: document.getElementById('apiKeyInput').value,
        groupId: document.getElementById('apiGroupIdInput').value,
        endpoint: document.getElementById('apiEndpointInput').value,
         voiceApiKey: document.getElementById('voiceApiKeyInput') ? document.getElementById('voiceApiKeyInput').value : '',
        voiceGroupId: document.getElementById('voiceGroupIdInput') ? document.getElementById('voiceGroupIdInput').value : '',
        
        model: document.getElementById('model-select').value,
        voiceModel: document.getElementById('voice-model-select') ? document.getElementById('voice-model-select').value : '',
        temperature: document.getElementById('temperature-slider').value,
        enableMetaDelete: document.getElementById('enable-meta-delete-toggle') ? document.getElementById('enable-meta-delete-toggle').checked : false
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    // 同时保存图像生成设置
    if (typeof saveImagegenSettingsUI === 'function') {
        saveImagegenSettingsUI();
    }
    if (typeof toggleSettings === 'function') {
        toggleSettings();
    }
}

function saveNewPreset() {
    const name = document.getElementById('preset-name-input').value.trim();
    if(!name) return;
    const currentSettings = {
        provider: document.getElementById('api-provider-select').value,
        groupId: document.getElementById('apiGroupIdInput').value,
         endpoint: document.getElementById('apiEndpointInput').value,
        model: document.getElementById('model-select').value,
        temperature: document.getElementById('temperature-slider').value,
        enableMetaDelete: document.getElementById('enable-meta-delete-toggle') ? document.getElementById('enable-meta-delete-toggle').checked : false
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
    if (!presetSelect) return;
    const presets = JSON.parse(localStorage.getItem(PRESETS_KEY) || '{}');
    presetSelect.innerHTML = '<option value="">── 选择已保存配置 ──</option>';
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
        
        const metaToggle = document.getElementById('enable-meta-delete-toggle');
        if(metaToggle) metaToggle.checked = settings.enableMetaDelete === true;

        setTimeout(() => {
            const modelSelect = document.getElementById('model-select');
            let exists = false;
            for(let i=0; i<modelSelect.options.length; i++){ if(modelSelect.options[i].value === settings.model) exists = true; }
            if(!exists && settings.model) { const opt = document.createElement('option'); opt.value = settings.model; opt.text = settings.model; modelSelect.appendChild(opt); }
            if(settings.model) modelSelect.value = settings.model;
        }, 50);
    }
}

/* =========================================
   Settings Panel · Section Collapse Toggle
   ========================================= */
window.toggleStgSection = function(sectionId) {
    const bd = document.getElementById('stg-bd-' + sectionId);
    const hd = document.getElementById('stg-hd-' + sectionId);
    if (!bd) return;
    const isOpen = bd.style.display !== 'none' && bd.style.display !== '';
    bd.style.display = isOpen ? 'none' : 'block';
    bd.classList.toggle('open', !isOpen);
    if (hd) hd.classList.toggle('open', !isOpen);
};

/* =========================================
   API Presets (使用现有 PRESETS_KEY)
   ========================================= */
window.deleteApiPreset = function() {
    const sel = document.getElementById('preset-select');
    const name = sel ? sel.value : '';
    if (!name) { if (typeof showToast === 'function') showToast('请先选择一个预设'); return; }
    if (!confirm(`删除 API 预设 "${name}"？`)) return;
    const presets = JSON.parse(localStorage.getItem(PRESETS_KEY) || '{}');
    delete presets[name];
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
    loadPresetsToUI();
    if (typeof showToast === 'function') showToast('已删除 · Deleted');
};

/* =========================================
   Voice Presets
   ========================================= */
function loadVoicePresetsToUI() {
    const sel = document.getElementById('voice-preset-select');
    if (!sel) return;
    const presets = JSON.parse(localStorage.getItem(VOICE_PRESETS_KEY) || '{}');
    sel.innerHTML = '<option value="">── 选择语音配置 ──</option>';
    Object.keys(presets).forEach(k => {
        const opt = document.createElement('option');
        opt.value = k; opt.text = k;
        sel.appendChild(opt);
    });
}

window.saveVoicePreset = function() {
    const name = (document.getElementById('voice-preset-name')?.value || '').trim();
    if (!name) { if (typeof showToast === 'function') showToast('请输入预设名称'); return; }
    const preset = {
        voiceApiKey: document.getElementById('voiceApiKeyInput')?.value || '',
        voiceGroupId: document.getElementById('voiceGroupIdInput')?.value || '',
        voiceModel: document.getElementById('voice-model-select')?.value || ''
    };
    const presets = JSON.parse(localStorage.getItem(VOICE_PRESETS_KEY) || '{}');
    presets[name] = preset;
    localStorage.setItem(VOICE_PRESETS_KEY, JSON.stringify(presets));
    document.getElementById('voice-preset-name').value = '';
    loadVoicePresetsToUI();
    if (typeof showToast === 'function') showToast(`语音预设 "${name}" 已保存 ✓`);
};

window.applyVoicePreset = function() {
    const sel = document.getElementById('voice-preset-select');
    const name = sel ? sel.value : '';
    if (!name) return;
    const presets = JSON.parse(localStorage.getItem(VOICE_PRESETS_KEY) || '{}');
    const p = presets[name];
    if (!p) return;
    const vak = document.getElementById('voiceApiKeyInput');
    const vgk = document.getElementById('voiceGroupIdInput');
    const vms = document.getElementById('voice-model-select');
    if (vak) vak.value = p.voiceApiKey || '';
    if (vgk) vgk.value = p.voiceGroupId || '';
    if (vms && p.voiceModel) {
        let found = false;
        for (let i = 0; i < vms.options.length; i++) {
            if (vms.options[i].value === p.voiceModel) { found = true; break; }
        }
        if (!found) {
            const opt = document.createElement('option');
            opt.value = p.voiceModel; opt.text = p.voiceModel;
            vms.appendChild(opt);
        }
        vms.value = p.voiceModel;
    }
    if (typeof showToast === 'function') showToast(`已应用语音预设：${name}`);
};

window.deleteVoicePreset = function() {
    const sel = document.getElementById('voice-preset-select');
    const name = sel ? sel.value : '';
    if (!name) { if (typeof showToast === 'function') showToast('请先选择一个预设'); return; }
    if (!confirm(`删除语音预设 "${name}"？`)) return;
    const presets = JSON.parse(localStorage.getItem(VOICE_PRESETS_KEY) || '{}');
    delete presets[name];
    localStorage.setItem(VOICE_PRESETS_KEY, JSON.stringify(presets));
    loadVoicePresetsToUI();
    if (typeof showToast === 'function') showToast('已删除 · Deleted');
};

/* =========================================
   ImageGen Presets
   ========================================= */
function loadImagegenPresetsToUI() {
    const sel = document.getElementById('imagegen-preset-select');
    if (!sel) return;
    const presets = JSON.parse(localStorage.getItem(IMAGEGEN_PRESETS_KEY) || '{}');
    sel.innerHTML = '<option value="">── 选择生图配置 ──</option>';
    Object.keys(presets).forEach(k => {
        const opt = document.createElement('option');
        opt.value = k; opt.text = k;
        sel.appendChild(opt);
    });
}

function _readImagegenFormValues() {
    const getVal = (id, fallback = '') => { const el = document.getElementById(id); return el ? el.value : fallback; };
    const getChecked = (id) => { const el = document.getElementById(id); return el ? el.checked : false; };
    return {
        naiApiKey: getVal('nai-api-key'),
        naiModel: getVal('nai-model-select'),
        naiSize: getVal('nai-size-select'),
        naiSteps: getVal('nai-steps-input', '28'),
        naiCfg: getVal('nai-cfg-input', '5'),
        naiSampler: getVal('nai-sampler-select'),
        naiSeed: getVal('nai-seed-input', '-1'),
        naiQuality: getChecked('nai-quality-toggle'),
        naiSmea: getChecked('nai-smea-toggle'),
        naiSmeaDyn: getChecked('nai-smea-dyn-toggle'),
        naiUcPreset: getVal('nai-uc-preset', '0'),
        naiProxy: getVal('nai-proxy-select'),
        naiCustomProxy: getVal('nai-custom-proxy'),
        naiPositive: getVal('nai-default-positive'),
        naiNegative: getVal('nai-default-negative'),
        polApiKey: getVal('pol-api-key'),
        polModel: getVal('pol-model-input', 'flux'),
        polEnhance: getChecked('pol-enhance-toggle'),
        engine: getVal('imagegen-active-engine', 'nai'),
        offlineAuto: getChecked('imagegen-offline-auto'),
        offlineEngine: getVal('imagegen-offline-engine', 'pollinations')
    };
}

function _applyImagegenFormValues(p) {
    const setVal = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
    const setChecked = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.checked = v; };
    setVal('nai-api-key', p.naiApiKey);
    setVal('nai-steps-input', p.naiSteps);
    setVal('nai-cfg-input', p.naiCfg);
    setVal('nai-seed-input', p.naiSeed);
    setVal('nai-uc-preset', p.naiUcPreset);
    setVal('nai-custom-proxy', p.naiCustomProxy);
    setVal('nai-default-positive', p.naiPositive);
    setVal('nai-default-negative', p.naiNegative);
    setVal('pol-api-key', p.polApiKey);
    setVal('pol-model-input', p.polModel);
    setChecked('nai-quality-toggle', p.naiQuality);
    setChecked('nai-smea-toggle', p.naiSmea);
    setChecked('nai-smea-dyn-toggle', p.naiSmeaDyn);
    setChecked('pol-enhance-toggle', p.polEnhance);
    setChecked('imagegen-offline-auto', p.offlineAuto);
    // selects with possible dynamic options
    const selectMap = {
        'nai-model-select': 'naiModel',
        'nai-size-select': 'naiSize',
        'nai-sampler-select': 'naiSampler',
        'nai-proxy-select': 'naiProxy',
        'imagegen-active-engine': 'engine',
        'imagegen-offline-engine': 'offlineEngine'
    };
    Object.entries(selectMap).forEach(([id, key]) => {
        const el = document.getElementById(id);
        const val = p[key];
        if (!el || val === undefined) return;
        let found = false;
        for (let i = 0; i < el.options.length; i++) {
            if (el.options[i].value === val) { found = true; break; }
        }
        if (!found && val) {
            const opt = document.createElement('option');
            opt.value = val; opt.text = val;
            el.appendChild(opt);
        }
        if (val) el.value = val;
    });
    // Show custom proxy box if needed
    const customProxyBox = document.getElementById('nai-custom-proxy-box');
    if (customProxyBox) customProxyBox.style.display = (p.naiProxy === 'custom') ? 'block' : 'none';
}

window.saveImagegenPreset = function() {
    const name = (document.getElementById('imagegen-preset-name')?.value || '').trim();
    if (!name) { if (typeof showToast === 'function') showToast('请输入预设名称'); return; }
    const preset = _readImagegenFormValues();
    const presets = JSON.parse(localStorage.getItem(IMAGEGEN_PRESETS_KEY) || '{}');
    presets[name] = preset;
    localStorage.setItem(IMAGEGEN_PRESETS_KEY, JSON.stringify(presets));
    document.getElementById('imagegen-preset-name').value = '';
    loadImagegenPresetsToUI();
    if (typeof showToast === 'function') showToast(`生图预设 "${name}" 已保存 ✓`);
};

window.applyImagegenPreset = function() {
    const sel = document.getElementById('imagegen-preset-select');
    const name = sel ? sel.value : '';
    if (!name) return;
    const presets = JSON.parse(localStorage.getItem(IMAGEGEN_PRESETS_KEY) || '{}');
    const p = presets[name];
    if (!p) return;
    _applyImagegenFormValues(p);
    if (typeof showToast === 'function') showToast(`已应用生图预设：${name}`);
};

window.deleteImagegenPreset = function() {
    const sel = document.getElementById('imagegen-preset-select');
    const name = sel ? sel.value : '';
    if (!name) { if (typeof showToast === 'function') showToast('请先选择一个预设'); return; }
    if (!confirm(`删除生图预设 "${name}"？`)) return;
    const presets = JSON.parse(localStorage.getItem(IMAGEGEN_PRESETS_KEY) || '{}');
    delete presets[name];
    localStorage.setItem(IMAGEGEN_PRESETS_KEY, JSON.stringify(presets));
    loadImagegenPresetsToUI();
    if (typeof showToast === 'function') showToast('已删除 · Deleted');
};

/* =========================================
   End of new preset systems
   ========================================= */

async function fetchAndPopulateModels() {
    const apiKey = document.getElementById('apiKeyInput').value;
    let endpoint = document.getElementById('apiEndpointInput').value;
    const provider = document.getElementById('api-provider-select').value;
    const groupId = document.getElementById('apiGroupIdInput').value;
    const btn = document.getElementById('fetch-models-btn');
    
    if (!endpoint) { alert('请先输入 API Base URL'); return; }
    endpoint = endpoint.replace(/\/$/, '');
    let fetchUrl = endpoint.endsWith('/v1') ? `${endpoint}/models` : `${endpoint}/v1/models`;

    if (provider.startsWith('minimax') && groupId) {
        fetchUrl += `?GroupId=${groupId}`;
    }

    btn.querySelector('i').classList.add('fa-spin');
    try {
        const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
        if (provider.startsWith('minimax') && groupId) headers['GroupId'] = groupId;
        
        const response = await fetch(fetchUrl, { method: 'GET', headers: headers });
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

async function fetchAndPopulateVoiceModels() {
    // 【修改点】：优先获取专门的语音API Key和GroupID，如果没有填，才降级使用聊天的
    const apiKey = document.getElementById('voiceApiKeyInput').value || document.getElementById('apiKeyInput').value;
    const groupId = document.getElementById('voiceGroupIdInput').value || document.getElementById('apiGroupIdInput').value;
    let endpoint = document.getElementById('apiEndpointInput').value;
    
    if (!endpoint) { alert('请先输入 API Base URL'); return; }
    endpoint = endpoint.replace(/\/$/, '');
    let fetchUrl = endpoint.endsWith('/v1') ? `${endpoint}/models` : `${endpoint}/v1/models`;

    if (provider.startsWith('minimax') && groupId) {
        fetchUrl += `?GroupId=${groupId}`;
    }

    btn.querySelector('i').classList.add('fa-spin');
    try {
        const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
        if (provider.startsWith('minimax') && groupId) headers['GroupId'] = groupId;
        
        const response = await fetch(fetchUrl, { method: 'GET', headers: headers });
        if (!response.ok) throw new Error('Network error');
        const data = await response.json();
        const voiceModelSelect = document.getElementById('voice-model-select');
        voiceModelSelect.innerHTML = '';
        if (data.data && Array.isArray(data.data)) {
            // Filter models that are likely voice models
            const voiceModels = data.data.filter(item => 
                item.id.toLowerCase().includes('speech') || 
                item.id.toLowerCase().includes('audio') || 
                item.id.toLowerCase().includes('voice')
            );
            const modelsToShow = voiceModels.length > 0 ? voiceModels : data.data;

            modelsToShow.forEach(item => { 
                const opt = document.createElement('option'); 
                opt.value = item.id; 
                opt.text = item.id; 
                voiceModelSelect.appendChild(opt); 
            });
            alert(`成功加载 ${modelsToShow.length} 个语音模型`);
        }
    } catch (error) { alert('获取语音模型失败: ' + error.message); } 
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
    const tabs = Array.from(document.querySelectorAll('.wc-tab-content'));
    switchSoftDisplays(
        tabs.map(el => ({
            key: el.id.replace('tab-', ''),
            el,
            display: 'block'
        })),
        tabName
    );

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
            clearMomentsUnreadCount(); // 【新增】只要切到这页，瞬间清除空间红点
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

    let raw = '';
    if (mode === 'none') return '';

    if (mode === 'tavern') {
        const list = Array.isArray(friend.greetingList) ? friend.greetingList : [];
        const idx = Number.isInteger(friend.greetingSelected) ? friend.greetingSelected : 0;
        const pick = list[idx] || list[0] || friend.tavernGreeting || '';
        raw = String(pick).trim();
    } else {
        raw = (friend.greetingCustom || friend.greeting || '').trim();
    }
    
    const myName = (typeof personasMeta !== 'undefined' && typeof currentPersonaId !== 'undefined' && personasMeta[currentPersonaId]) ? personasMeta[currentPersonaId].name : 'User';
    const charName = friend.realName || '助手';
    return String(raw).replace(/{{char}}/gi, charName).replace(/{{user}}/gi, myName);
}


window.toggleGreetingEditor = function() {
    // 统一编辑版 — 保留此函数供兼容性调用，无需任何操作
};

window.renderGreetingListUI = function(friend) {
    renderGreetingPresetsUI(friend);
};

function renderGreetingPresetsUI(friend) {
    const container = document.getElementById('cs-greeting-presets');
    if (!container) return;
    container.innerHTML = '';

    const arr = Array.isArray(friend.greetingList) ? friend.greetingList :
        (friend.tavernGreeting ? [friend.tavernGreeting] : []);

    if (!arr.length) return; // 没有预设则不显示

    // 小标题
    const label = document.createElement('div');
    label.style.cssText = 'font-size:10px;color:#bbb;font-weight:700;letter-spacing:1px;margin-bottom:8px;text-transform:uppercase;';
    label.innerText = '▼ 预设开场白（点击填入）';
    container.appendChild(label);

    const numChars = ['一','二','三','四','五','六','七','八','九','十'];

    // 外层滚动容器
    const scrollBox = document.createElement('div');
    scrollBox.style.cssText = [
        'border:1px solid #e8e8e8',
        'border-radius:10px',
        'overflow-y:auto',
        'max-height:120px',
        'background:#fafafa'
    ].join(';');

    arr.forEach((txt, idx) => {
        const preview = String(txt).trim();
        if (!preview) return;

        const row = document.createElement('div');
        const label = `开场白${numChars[idx] || (idx + 1)}`;
        row.style.cssText = [
            'padding:8px 12px',
            'font-size:12px',
            'font-weight:600',
            'color:#555',
            'cursor:pointer',
            'border-bottom:1px solid #f0f0f0',
            'transition:background 0.1s',
            'user-select:none'
        ].join(';');
        row.innerText = label;

        row.addEventListener('mouseenter', () => { row.style.background = '#333'; row.style.color = '#fff'; });
        row.addEventListener('mouseleave', () => { row.style.background = ''; row.style.color = '#555'; });

        row.onclick = () => {
            const ta = document.getElementById('cs-greeting-unified');
            if (!ta) return;
            ta.value = preview;
            ta.style.height = 'auto';
            ta.style.height = Math.min(ta.scrollHeight, 260) + 'px';
            ta.style.outline = '2px solid #333';
            setTimeout(() => { ta.style.outline = ''; }, 700);
            // 高亮选中行
            scrollBox.querySelectorAll('div').forEach(r => r.style.background = '');
            row.style.background = '#f0f0f0';
            row.style.color = '#333';
        };

        scrollBox.appendChild(row);
    });

    // 去掉最后一行的底部边框
    const lastRow = scrollBox.lastElementChild;
    if (lastRow) lastRow.style.borderBottom = 'none';

    container.appendChild(scrollBox);
}




window.openChatDetail = async function(name) {
    // 【新增】进入单人聊天时，清除该角色的未读数据
    if (friendsData[name]) {
        friendsData[name].unreadCount = 0;
        saveFriendsData(); // 保存到本地，防止刷新又弹出来
    }
    updateChatListUnreadUI(name); // 消除列表上的气泡
    updateDockUnreadDot();        // 重新计算底部Dock的红点

    stopDanmakuLoop();

    const dmLayer = document.getElementById('danmaku-layer');
    if(dmLayer) dmLayer.innerHTML = '';
    danmakuPool = [];
    
    currentChatId = name;
    currentChatType = 'single';
    if (typeof window.removeGroupPlusPanel === 'function') window.removeGroupPlusPanel();

    const chatView = document.getElementById('chatLayer');
    if(chatView) {
        const titleEl = chatView.querySelector('.chat-header span');
        const displayName = (friendsData[name] && friendsData[name].remark) ? friendsData[name].remark : name;
        if(titleEl) {
             titleEl.innerHTML = `${displayName}<small style="font-size:9px; color:#aaa; font-weight:400; letter-spacing:1px; text-transform:uppercase;">Online</small>`;
        }
        // 恢复单聊专属按钮的显示（心声图标）
        const heartBtn = chatView.querySelector('.fa-heart-pulse');
        if (heartBtn) heartBtn.style.display = '';
        // 恢复设置图标点击为单聊设置
        const settingsBtn = chatView.querySelector('.fa-cog');
        if (settingsBtn) settingsBtn.onclick = () => openChatSettingsPage();

        chatView.classList.add('show');
    }

    // 应用单聊视觉美化设置（背景/气泡主题/CSS）
    applySingleChatVisualSettings(name);

    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';

    // 重置时间气泡计时器，每次进入聊天都从零开始
    _lastChatMsgTimestamp = 0;

    const history = await loadChatHistory(name);

    if (history.length > 0) {
        chatMessages.innerHTML = `<div style="text-align:center; margin: 10px 0;"><span style="background:rgba(0,0,0,0.04); padding:4px 12px; border-radius:12px; font-size:10px; color:#999; font-weight:500;">History</span></div>`;
        
        let currentRealAvatar = null;
        if (friendsData[name] && friendsData[name].avatar) {
            currentRealAvatar = friendsData[name].avatar;
        }

        history.forEach(msg => {
            if (msg.isOffline) {
                // 离线消息不渲染，但仍需更新时间戳以保证后续消息的5分钟间隔判断正确
                if (msg.timestamp && msg.timestamp > 0) _lastChatMsgTimestamp = msg.timestamp;
                return;
            }

            // 【核心修复】渲染撤回消息状态
            if (msg.isRevoked) {
                // 撤回消息也需要更新时间戳，防止下一条消息的5分钟间隔判断失准
                if (msg.timestamp && msg.timestamp > 0) _lastChatMsgTimestamp = msg.timestamp;

                const systemTip = document.createElement('div');
                systemTip.className = 'msg-system-revoke';
                const escapedText = (msg.originalText || '').replace(/'/g, "\\'").replace(/"/g, "&quot;");
                systemTip.innerHTML = `<span>你撤回了一条消息 <span style="color:#576b95;cursor:pointer;" onclick="document.getElementById('chatInput').value='${escapedText}'">重新编辑</span></span>`;
                
                const row = document.createElement('div');
                row.className = `chat-row system`;
                row.setAttribute('data-msg-id', msg.id); 
                row.appendChild(systemTip);
                chatMessages.appendChild(row);
                return;
            }

            let displayAvatar = msg.customAvatar;
            if (msg.type === 'received' && currentRealAvatar) {
                displayAvatar = currentRealAvatar;
            }
            
            // 【核心修复】必须传入 msg.id 才能保证与数据库挂钩，同时传入 msg.timestamp 让时间气泡显示正确时间
            appendMessage(msg.text, msg.type, displayAvatar, msg.senderName, msg.translation, msg.id, msg.timestamp);
        });
        setTimeout(() => chatMessages.scrollTop = chatMessages.scrollHeight, 100);

    } else {
        const friend = friendsData[name];
        const greetingText = getEffectiveGreeting(friend);
        if (friend && greetingText) {
            const avatar = friend.avatar || null;
            const msgId = 'msg_sys_' + Date.now();
            appendMessage(greetingText, 'system', avatar, name, null, msgId);

            saveMessageToHistory(name, {
                id: msgId,
                text: greetingText,
                type: 'system',
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
        
          // === 退出聊天界面时：停止弹幕 + 清理多选栏 ===
          if (!chatLayer.classList.contains('show')) {
              stopDanmakuLoop();
              const dmLayer = document.getElementById('danmaku-layer');
              if(dmLayer) dmLayer.innerHTML = '';
              // 退出聊天时强制退出多选模式，防止 wc-multi-select-bar 残留在底部
              if (typeof exitMultiSelectMode === 'function') exitMultiSelectMode();
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

// 供其他模块（如 galgame）表
window.getAllFriends = function() {
    return Object.keys(friendsData).map(id => Object.assign({ id }, friendsData[id]));
};
window.getCurrentChatId = () => currentChatId; // 暴露给 app_memory.js 等外部脚本读取
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
    friendsData[chatId] = {
    realName: realName,
    remark: remark,
    persona: persona || "你是一个普通的微信好友。",
    worldbook: worldbook,
    greeting: greeting,
    avatar: '',
    mindState: {
        action: "正在观察你",
        location: "聊天界面",
        weather: "晴",
        murmur: "我刚出现。先看看你会怎么和我说第一句话。也许接下来会变得有意思。",
        hiddenThought: "（默默评估着你）",
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
    newItem.className = 'wc-chat-item widget-1x1 sortable-item';
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
function formatSpecialMessageForAI(text) {
    if (!text || typeof text !== 'string') return '';

    // 描述图片 -> 发给 AI 时伪装成“用户发了一张照片”
    if (text.startsWith('[IMG_DESC]')) {
        const desc = text.replace('[IMG_DESC]', '').trim();
        return `[System: User sent a photo. You should treat it as a real image. The photo shows: ${desc}]`;
    }

    return text;
}

function formatChatPreviewText(text, isOffline = false) {
    if (!text) return '点击开始聊天';
    if (isOffline) return '[故事进展]';

    if (text.startsWith('[INTIMATE_')) return '[亲密付消息]';

    if (text.startsWith('[IMG_DESC]')) {
        const desc = text.replace('[IMG_DESC]', '').trim();
        return `[图片] ${desc.length > 12 ? desc.slice(0, 12) + '...' : desc}`;
    }

    if (text.startsWith('[VOICE]')) return '[语音]';

    return text.length > 25 ? text.slice(0, 25) + '...' : text;
}

// === 升级版 AI 发送逻辑 (兼容群聊 + 支持翻译模式) ===
async function sendMessageToAI(userMessage) {
    if (currentAiController) {
        currentAiController.abort();
    }
    currentAiController = new AbortController();
    // 【竞态修复】立即捕获当前聊天对象 ID，防止异步 fetch 期间用户切换联系人导致回复串台
    const targetChatId = currentChatId;
    const targetChatType = currentChatType;

    const chatMessages = document.getElementById('chatMessages');
    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    
   if (!settingsJSON) {
    showAiErrorModal('未配置 API', '请先到 Settings → AI Chat 配置 API Key / Base URL / Model');
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
    let f = friendsData[targetChatId] || {};
    let chatSettings = f.chatSettings || {}; // 获取可能存在的设置
        // --- 【新增】预处理 userMessage 中的表情包和语音 ---
    if (typeof userMessage === 'string') {
        userMessage = userMessage.split('\n').map(line => {
            let processed = line.trim();
            // 解析表情
            if (/^\[表情:.*?\]$/.test(processed)) {
                const name = processed.match(/^\[表情:(.*?)\]$/)[1];
                let sticker = (window.allStickers || []).find(s => s.name === name);
                if (sticker) {
                    if (chatSettings.visionStickerEnabled) {
                        return `[System: User sent a sticker named "${name}". IMAGE_CONTENT:${sticker.url}]`;
                    } else {
                        return `[System: User sent a sticker/meme named "${name}". Please react to it appropriately.]`;
                    }
                }
            }
            // 解析语音
            if (processed.startsWith('[VOICE]')) {
                const voiceText = processed.replace('[VOICE]', '').trim();
                if (voiceText && voiceText !== '（语音消息）' && voiceText !== '（未识别到文字）') {
                    return `[System: User sent a voice message saying: "${voiceText}"]`;
                } else {
                    return `[System: User sent a voice message but no text could be extracted.]`;
                }
            }
            return line; // 没匹配到就原样返回
        }).join('\n');
    }

    // --- [新增点] 翻译模式检查 ---
    const TRANS_SEPARATOR = "___TRANSLATION_SEP___";


    let isTranslationEnabled = false;

    // 检查：如果当前不是群聊，且用户开启了“翻译AI输出到中文”
    if (targetChatType !== 'group' && chatSettings.translationMode === 'ai_to_zh') {
        isTranslationEnabled = true;
    }
    // === [新增] 表情包权限判定与系统级注入 ===
    let stickerPrompt = "";
    if (chatSettings.activeStickers && chatSettings.activeStickers.length > 0 && window.allStickers) {
        let availableStickers = [];
        window.allStickers.forEach(s => {
            let catStr = `${s.scope}|${s.category}`;
            // 确保分配给 AI 的这个分类是被勾选的
            if (chatSettings.activeStickers.includes(catStr)) {
                // 如果是全局通用，或者正好专属这个角色
                if (s.scope === 'global' || (s.scope === 'exclusive' && s.owner === currentChatId)) {
                    availableStickers.push(`[表情:${s.name}]`);
                }
            }
        });
        
        if (availableStickers.length > 0) {
            stickerPrompt = `
[系统指令：表情包系统]
你的手机相册中已解锁以下表情图，你可以用它们来强化情绪表达。
【当前可用图库清单】:
${availableStickers.join(', ')}

注意：你可以单独发送一个表情包作为一条消息，也可以在文字后面接一个表情包。不要造列表里没有的表情包！当觉得当前语境需要发表情包时，请根据你的话做出反应。
输出的原始文本格式长这样：
AI 原始输出示例 1：这也太搞笑了叭，救命 [表情:笑哭]
AI 原始输出示例 2：[表情:嫌弃]
`;
            systemPrompt += "\n\n" + stickerPrompt;
        }
    }

    // === 判断是群聊还是单聊 (这是你最担心的部分，完全保留) ===
    // === 判断是群聊还是单聊 ===
    if (targetChatType === 'group' && targetChatId) {
        // ------ 群聊逻辑 (Group Chat Logic) ------
        // 1. 获取群数据 (保留原逻辑)
        const group = groupsData[targetChatId];
        
        // 2. 收集群里所有成员的人设 (保留原逻辑)
        let charactersInfo = "";
        group.members.forEach(memberId => {
            const mem = friendsData[memberId];
            if(mem) {
                charactersInfo += `Name: ${mem.realName}\nPersona: ${mem.persona}\n\n`;
            }
        });

        // 3. 构建群聊提示词 (★这里升级了！注入了拟人化规则★)
        const gSet = group.settings || {};
        const _gMin = Math.max(1, parseInt(gSet.replyMin) || 1);
        const _gMax = Math.max(_gMin, parseInt(gSet.replyMax) || 5);

        systemPrompt = `
        你负责扮演这个群里除用户以外的所有角色，自然地推动群聊对话。

        [群成员设定]
        ${charactersInfo}
        ${(() => { const me = personasMeta[currentPersonaId]; return (me && me.persona) ? `[用户身份]\n        ${me.persona}` : ''; })()}

        【回复要求】
        - 模拟真实的群聊节奏，大家一人一句。
        - 你本次必须生成 ${_gMin} 到 ${_gMax} 条消息。绝对不要生成一大段话！
        - 每条消息必须极度简短、口语化。

        【禁止】以任何形式替用户（"我"）发言。

        输出格式：每行一条，角色名: 消息内容
        `;
        
    } else {
         // ------ 单聊逻辑 (Single Chat Logic) ------
        const currentAffection = Number(f.affection || 0);
        
        const myName = (typeof personasMeta !== 'undefined' && typeof currentPersonaId !== 'undefined' && personasMeta[currentPersonaId]) ? personasMeta[currentPersonaId].name : 'User';
        const charName = f.realName || '助手';
        
        const parseMacros = (str) => {
            if (!str) return '';
            return String(str).replace(/{{char}}/gi, charName).replace(/{{user}}/gi, myName);
        };

        let worldbookContent = '';
        try {
            const wbIds = Array.isArray(f.worldbook) ? f.worldbook : (f.worldbook ? [f.worldbook] : []);
            if (wbIds.length && typeof worldBooks !== 'undefined' && worldBooks.length) {
                worldbookContent = wbIds.map(id => {
                    const wb = worldBooks.find(w => w.id === id);
                    if (!wb) return '';
                    if (wb.entries && wb.entries.length) {
                        return wb.entries.filter(e => e.enabled !== false).map(e => e.content || '').filter(Boolean).join('\n');
                    }
                    return wb.description || wb.content || wb.title || '';
                }).filter(Boolean).join('\n\n');
            } else if (typeof f.worldbook === 'string' && f.worldbook) {
                worldbookContent = f.worldbook;
            }
            if (typeof worldBooks !== 'undefined') {
                const globalContent = worldBooks.filter(wb => wb.global).flatMap(wb => (wb.entries || []).filter(e => e.enabled !== false).map(e => e.content || '')).filter(Boolean).join('\n');
                if (globalContent) worldbookContent = (worldbookContent ? worldbookContent + '\n\n' : '') + globalContent;
            }
        } catch (e) {}

        const _promptReplyMin = Math.max(1, parseInt(chatSettings.replyMin) || 1);
        const _promptReplyMax = Math.max(_promptReplyMin, parseInt(chatSettings.replyMax) || 5);
        let replyInstruction = "";
        if (_promptReplyMax === 1) {
            replyInstruction = `- **你的聊天正文必须且只能回复 1 条！正文内绝对禁止换行！**\n           - **（注意：但在回复最末尾的 [STATUS] 和 [DANMAKU] 标签区块中，你必须正常使用换行符分隔数据！）**`;
        } else {

        }

        systemPrompt = `
        系统提示词：线上聊天模拟器
        角色定义：你是一个真实的人，正在通过聊天软件和我进行对话。

        【角色人设】
        名字：${charName}
        人设描述：${parseMacros(f.persona || '乐于助人的助手')}
        当前对用户的好感度：${currentAffection}/100 （请根据本次对话内容，决定好感度是上升还是下降，并在STATUS块中更新输出最新值）

        ${worldbookContent ? `【世界观设定】：${parseMacros(worldbookContent)}` : ''}

        ${(() => { const me = personasMeta[currentPersonaId]; return (me && me.persona) ? `【用户身份——正在和你聊天的人】：\n        ${me.persona}` : ''; })()}

        【核心规则——必须遵守】
        1. 场景限制：你们的互动【仅限于线上聊天软件】，严禁发展为线下见面。
        2. 非通话警告：这【不是电话通话】。你们是通过类似微信/QQ的软件进行交流，因此【绝对禁止】使用"挂断"、"挂电话"、"挂了"等与语音通话相关的词语。
        3. 角色一致性：你的所有言行举止都必须严格遵循你的角色设定，不要崩人设。
        4. 对话节奏与格式（最高优先级）：模拟真实的线上真人聊天习惯，【极度简短】！
           ${replyInstruction}
           - 语气必须随意、口语化，拒绝机械感。能用两三个字回答的，就不要长篇大论。

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
        if (chatSettings.statusRegexEnabled && chatSettings.statusFormatReq) {
            systemPrompt += `\n[CUSTOM STATUS FORMAT INSTRUCTION]\n${chatSettings.statusFormatReq}\n`;
        }
        // === [新增] 头像更换规则 ===
        if (f.lastSharedImage) {
            systemPrompt += `
        \n[AVATAR SYSTEM]
        The user recently sent you an image. If you agree or decide to change your profile picture to that image, include this exact tag anywhere in your reply: [CHANGE_AVATAR]
        `;
        }

        // === [新增] 定位发送与创建规则 ===
        systemPrompt += `
        \n[LOCATION RADAR SYSTEM]
        If you want to share a location radar card with the user, include this exact tag anywhere in your reply: [SEND_MAP:YourLocationName|UserLocationName|DistanceKm]
        Example: [SEND_MAP:星巴克|中央公园|2.5]
        If you invent a completely new location name in the tag, the system will automatically build it on the user's Map App. Use this to creatively drive the roleplay forward!
        `;

        // === [新增] 真实外卖系统指令 ===
        systemPrompt += `
        \n[TAKEOUT DELIVERY SYSTEM]
        If the user says they are hungry, want to eat, or explicitly ask you to order food/takeout, and you decide to order something for them, you MUST use the following tag anywhere in your reply:
        [TAKEOUT:FoodCategoryOrRestaurantName:PriceInRMB]
        Example: [TAKEOUT:黄焖鸡米饭:28] or [TAKEOUT:麦当劳:45]
        - The restaurant/food name should sound like a real local place or a specific food category.
        - If the system has provided you with a list of nearby REAL restaurants in a hidden prompt, you MUST choose one of those restaurants to make the roleplay feel hyper-realistic.
        - The price should be a realistic estimate in RMB (e.g., 15 to 80).
        - DO NOT output the tag if you are just suggesting food but not actually ordering it for them. Only output it when you explicitly declare "I ordered this for you" or "I bought this for you".
        `;
        // === [一起听] 切歌指令 ===
        if (typeof getMusicContext === 'function' && getMusicContext()) {
            systemPrompt += `
        \n[LISTEN TOGETHER SYSTEM]
        You and the user are currently listening to music together. You can see the current song, playlist, and real-time lyrics.
        If you want to change the song (e.g., the mood shifts, user mentions a song, or you feel like switching), include this exact tag anywhere in your reply:
        [CHANGE_MUSIC:SongTitle|ArtistName]
        Example: [CHANGE_MUSIC:晴天|周杰伦]
        Only use this when it feels emotionally natural and appropriate. Do not change music every message.
        `;
        }
// === 【升级版】强制 AI 生成：弹幕(可选) + 实时心声状态(必选) ===
systemPrompt += `
\n[SYSTEM INSTRUCTION]
After your reply, you MUST provide structured blocks at the VERY END.
`;

// 只有弹幕开关 ON 才要求 AI 输出弹幕块
if (isDanmakuOn) {
    systemPrompt += `
[DANMAKU_START]
Generate EXACTLY 6 to 8 comments from Chinese netizens watching this chat.
- The comments MUST be relevant to the current conversation content.
- Language: SIMPLIFIED CHINESE (简体中文).
- Style: Funny, roasting(吐槽), internet slang, vivid.
- STRICTLY PROHIBITED: Do not generate any misogynistic or derogatory words towards women (绝对禁止生成任何辱女类词汇或脏话).
- Output: ONE comment per line.
[DANMAKU_END]
`;
} else {
    // 弹幕 OFF：明确禁止 AI 输出弹幕块（防止它自己乱加）
    systemPrompt += `\n[IMPORTANT] Danmaku is OFF. Do NOT output any [DANMAKU_START]...[DANMAKU_END] block.\n`;
}

// 状态块（永远要）
systemPrompt += `
[STATUS_START]
Action: (current action, short)
Location: (current location)
Weather: (current weather)
BGM: (one fitting bgm title, format: Title - Artist/Style)
Murmur: (3 to 4 longer sentences, first-person self-talk, surface thoughts, in character voice)
HiddenThought: (Optional. Only use if the character has dark, secret, or contradictory inner thoughts they would never say out loud. If used, write 1-2 short, impactful sentences. If not applicable, leave blank or omit this line.)
Kaomoji: (one matching kaomoji)
Affection: (0-100, current affection level towards user)
[STATUS_END]
Rules:
- Do not explain the status block
- Murmur must be character self-talk, not narration.
- Murmur must contain 3 to 4 sentences.
- BGM must match the current mood, setting, or conversation scene

[Example Status Block]
[STATUS_START]
Action: 正在靠着窗边发消息
Location: 卧室
Weather: 小雨
BGM: cardigan - Taylor Swift
Murmur: 他今天倒是来得比我想象中早一点。我本来还想装作无所谓，结果还是第一时间去看消息了。真烦，明明不该这么在意的。可我就是忍不住。
HiddenThought: 把他锁起来，就永远不会离开我了吧。
Kaomoji: ( ｡•̀ᴗ-)✧
Affection: 65
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





        if (isTranslationEnabled) {
    if (isDanmakuOn) {
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
        systemPrompt += `
\n[SYSTEM INSTRUCTION: TRANSLATION MODE ON]
You MUST output in this strict order:
1. Response in character's language.
2. Separator: "${TRANS_SEPARATOR}"
3. Chinese translation.
4. [STATUS] block.
IMPORTANT: Danmaku is OFF. Do NOT output any [DANMAKU_START]...[DANMAKU_END] block.
`;
    }
} else {
    systemPrompt += `\nInstruction: Respond extremely shortly and naturally. Your main chat text MUST be under 50 characters!`;
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

    // ============================================
    // [插入] 注入手机密码自我感知（来自查手机 APP 预生成）
    // ============================================
    if (targetChatType === 'single') {
        try {
            // 优先读取角色对象的运行时字段（_injectPinAwareness 写入）
            let _pin = f._phonePin;
            let _hint = f._phonePinHint;

            // 没有则查 tr_pin_awareness 快速检索 key
            if (!_pin) {
                const _awareness = JSON.parse(localStorage.getItem('tr_pin_awareness') || '{}');
                if (_awareness[currentChatId]) {
                    _pin = _awareness[currentChatId].pin;
                    _hint = _awareness[currentChatId].hint;
                }
            }

            // 再没有则查 tr_pin_{charId} 原始存储
            if (!_pin) {
                const _raw = localStorage.getItem(`tr_pin_${currentChatId}`);
                if (_raw) {
                    const _parsed = JSON.parse(_raw);
                    if (_parsed && _parsed.pin) { _pin = _parsed.pin; _hint = _parsed.hint; }
                }
            }

            if (_pin) {
                systemPrompt += `\n\n[YOUR PRIVATE SELF-KNOWLEDGE]\nYour phone unlock password is: ${_pin}.\nPassword hint (only you know): ${_hint || 'a number meaningful to you'}.\nYou remember this password yourself. Do NOT reveal it unless directly and sincerely asked by the user. If asked, you may respond in character (e.g., hesitantly, shyly, or teasingly).`;
            }
        } catch (_e) { /* 静默处理 */ }
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
    // [插入] 注入"查手机"痕迹干预事件（来自 TrackerApp 蝴蝶效应系统）
    // ============================================
    if (currentChatType === 'single') {
        try {
            const _pendingTamper = JSON.parse(localStorage.getItem('tr_pending_context') || '[]');
            if (_pendingTamper.length > 0) {
                const _tamperEvents = _pendingTamper.join('\n');
                systemPrompt += `\n\n[⚠️ PHONE MISCHIEF ALERT — CRITICAL CONTEXT]\n你刚刚拿回自己的手机，发现用户刚才偷偷动过你的手机，做了以下事情：\n${_tamperEvents}\n\n请根据你的人设，对这些行为做出真实、生动的反应。你可以质问、嗔怒、感动、装作没发现——完全取决于你的性格和当前状态。这些事已经发生，是客观存在的事实，请自然地融入你的下一条回复中。`;
                localStorage.removeItem('tr_pending_context');
            }
        } catch (_tamperErr) { /* 静默处理 */ }
    }

    // ============================================

    // === 构建历史消息上下文 (Context Memory) ===
    let contextMessages = [];
    if (targetChatType === 'single') {
        const memoryLimit = parseInt(chatSettings.memoryLimit) || 20; // 获取记忆轮数限制，默认20
        if (memoryLimit > 0) {
            try {
                // 加载历史记录
                const history = await loadChatHistory(currentChatId);
                // 截取最近的 N 条
                const recentHistory = history.slice(-memoryLimit);
                
                             contextMessages = recentHistory.map(msg => {
                    let finalContent = formatSpecialMessageForAI(msg.text);
                    
                    // 【处理历史记录中表情包与语音的视觉/文本转换】
                    if (/^\[表情:.*?\]$/.test(finalContent.trim())) {
                        const name = finalContent.trim().match(/^\[表情:(.*?)\]$/)[1];
                        let sticker = (window.allStickers || []).find(s => s.name === name);
                        if (sticker) {
                            if (chatSettings.visionStickerEnabled) {
                                finalContent = `[System: User sent a sticker named "${name}". IMAGE_CONTENT:${sticker.url}]`;
                            } else {
                                finalContent = `[System: User sent a sticker/meme named "${name}". Please react to it appropriately.]`;
                            }
                        }
                    } else if (finalContent.startsWith('[VOICE]')) {
                        const voiceText = finalContent.replace('[VOICE]', '').trim();
                        if (voiceText && voiceText !== '（语音消息）' && voiceText !== '（未识别到文字）') {
                            finalContent = `[System: User sent a voice message saying: "${voiceText}"]`;
                        } else {
                            finalContent = `[System: User sent a voice message but no text could be extracted.]`;
                        }
                    }

                    if (msg.isOffline) {
                        finalContent = `(Offline Event Memory: ${finalContent})`;
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
    
    // === [一起听] 注入音乐情景上下文 ===
    if (typeof getMusicContext === 'function') {
        const musicCtx = getMusicContext();
        if (musicCtx) systemPrompt += musicCtx;
    }

    // === 五维记忆引擎：§4 情景记忆 & §3 跨聊天记忆注入 ===
    if (targetChatType === 'single') {
        // § 4 动态情景记忆：注入当前真实时间 + 距上次聊天时长（受时间感知开关控制）
        if (typeof buildSituationalAwareness === 'function') {
            const _sa = buildSituationalAwareness(chatSettings);
            if (_sa) systemPrompt += `\n\n[SITUATIONAL AWARENESS]:\n${_sa}`;
        }
        // § 3 跨聊天记忆互通：注入关联角色近期对话片段
        if (typeof buildLinkedMemoryContext === 'function') {
            const _linkedCtx = await buildLinkedMemoryContext(chatSettings, targetChatId);
            if (_linkedCtx) systemPrompt += _linkedCtx;
        }
        // 更新最后聊天时间戳（供下次 buildSituationalAwareness 计算间隔）
        const _realFriend = friendsData[currentChatId];
        if (_realFriend) {
            if (!_realFriend.chatSettings) _realFriend.chatSettings = {};
            _realFriend.chatSettings.lastChatTime = Date.now();
            saveFriendsData(); // 异步保存，不 await 以免阻塞响应流
        }
    }

        // 构建最终的消息列表
    // ★ 转账/拍一拍等行为上下文注入（独立于查手机蝴蝶效应，使用专属 key）
    const _trPending = (() => {
        try {
            const _p = JSON.parse(localStorage.getItem('tr_action_context') || '[]');
            if (_p.length > 0) {
                localStorage.removeItem('tr_action_context');
                return '\n\n' + _p.join('\n');
            }
        } catch (_) {}
        return '';
    })();

    let finalMessages = [
        { role: "system", content: systemPrompt + _trPending },
        ...contextMessages
    ];
    if (userMessage && userMessage.trim() !== '') {
        finalMessages.push({ role: "user", content: userMessage });
    }

    // === 【处理表情包视觉解析】 ===
    finalMessages = finalMessages.map(msg => {
        if (typeof msg.content === 'string' && msg.content.includes('IMAGE_CONTENT:')) {
            const parts = msg.content.split('IMAGE_CONTENT:');
            const textPart = parts[0].trim();
            const urlPart = parts[1].trim().replace(/\]$/, ''); // 剥除结尾可能带的括号
            
            return {
                role: msg.role,
                content: [
                    { type: "text", text: textPart },
                    { type: "image_url", image_url: { url: urlPart } }
                ]
            };
        }
        return msg;
    });

    const payload = { 

        model: settings.model, 
        messages: finalMessages, 
        temperature: parseFloat(settings.temperature || 0.7) 
    };

    try {
        const response = await fetch(apiUrl, { 
  method: 'POST', 
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` }, 
  body: JSON.stringify(payload),
  signal: currentAiController.signal
});

// 先把 loading 删掉
document.getElementById(loadingId)?.remove();

// 读一份文本用于报错展示（不影响正常 json 解析）
const respText = await response.clone().text().catch(() => '');

if (!response.ok) {
  throw new Error(`HTTP ${response.status} ${response.statusText}\n\n${respText}`);
}

let data = null;
try {
  data = await response.json();
} catch (e) {
  throw new Error(`响应不是 JSON（或被网关改写）\n\n${respText}`);
}

let aiReply = (data?.choices?.[0]?.message?.content ?? '');

if (!aiReply.trim()) {
    showAiErrorModal(
        '线上生成空回',
        'HTTP 返回成功，但 choices[0].message.content 为空。\n常见原因：模型/网关不兼容、鉴权失败但被网关吞了、额度限制、上游拦截。'
    );
    return;
}

        // === [修复] 全局处理特殊语音标记或被换行打断的 [VOICE] 标记，防止拆分成多个纯文字气泡 ===
        aiReply = aiReply.replace(/\[语音消息.*?\]\s*/gi, '[VOICE]');
        aiReply = aiReply.replace(/\[VOICE\]\s+/gi, '[VOICE]');

        // 检查是否含有视频来电指令
        if (typeof checkForVideoCallRequest === 'function') {
            aiReply = checkForVideoCallRequest(aiReply, currentChatId);
        }

        // === 处理返回结果 ===
        if (targetChatType === 'group') {
            // ------ 群聊结果解析 (完全保留) ------
            // 需要把 AI 返回的一大段话，按行切分，并识别是谁说的
            const isLookingAtThisChat = () => {
                const chatLayer = document.getElementById('chatLayer');
                return chatLayer && chatLayer.classList.contains('show') && currentChatId === targetChatId && currentChatType === 'group';
            };

            const lines = aiReply.split('\n');
            lines.forEach(line => {
                line = line.trim();
                if (!line) return;
                
                // 正则匹配 "名字: 内容"
                const match = line.match(/^([^:：]+)[:：](.*)/);
                
                let name = 'AI';
                let content = line;
                let avatarUrl = null;

                if (match) {
                    name = match[1].trim();
                    content = match[2].trim();
                    // 简单的头像生成
                    avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
                }

                if (isLookingAtThisChat()) {
                    appendMessage(content, 'received', avatarUrl, name);
                } else {
                    const dockDot = document.getElementById('dock-dot');
                    if (dockDot) dockDot.style.display = 'block';
                }
            });
            
                    } else {
                      // ------ 单聊结果解析 (修正版：先清理结构块，再做翻译) ------
            
            let rawReply = aiReply;          // 原始完整回复

            // === [图像生成] 解析并处理图像指令 (naiimag / REALIMAG / NAIIMAG) ===
            if (typeof processImagegenFromAIReply === 'function') {
                rawReply = await processImagegenFromAIReply(rawReply, targetChatId);
            }
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
                loadChatHistory(targetChatId).then(async (history) => {
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
                                payData.intimatePay[targetChatId] = { limit: limit, spent: 0, month: new Date().getMonth() };
                                savePayData(); 
                                
                                setTimeout(() => {
                                    showToast(`<i class="fas fa-heart" style="color:#ff7e67;"></i> 对方已接受你的亲密付`);
                                }, 500);
                            }
                            await IDB.set(scopedChatKey(targetChatId), history);
                            changed = true;
                            break;
                        }
                    }
                    if (changed) {
                        const isLookingAtThisChat = () => {
                            const chatMessages = document.getElementById('chatMessages');
                            return chatMessages && document.getElementById('chatLayer')?.classList.contains('show') && currentChatId === targetChatId && currentChatType === 'single';
                        };
                        if (isLookingAtThisChat()) {
                            const chatMessages = document.getElementById('chatMessages');
                            chatMessages.innerHTML = '';
                            history.forEach(msg => {
                                if (!msg.isOffline) {
                                    let displayAvatar = msg.customAvatar;
                                    if (msg.type === 'received' && friendsData[targetChatId]?.avatar) displayAvatar = friendsData[targetChatId].avatar;
                                    appendMessage(msg.text, msg.type, displayAvatar, msg.senderName, msg.translation);
                                }
                            });
                        }
                    }
                });
            }
// === [强力容错修复] 清理模型自作主张加的 Markdown 代码块 ===
rawReply = rawReply.replace(/```[a-zA-Z]*\n?/gi, '').replace(/```/gi, '');

// === [强力容错修复] 匹配状态块，即使 AI 没写 STATUS_END 也能强行捕获 ===
const statusRegex = /\[STATUS_START\]([\s\S]*?)(?:\[\/?STATUS_END\]|(?=\[[A-Za-z_]+_START\])|$)/i;
const statusMatch = rawReply.match(statusRegex);
if (statusMatch) {
    const statusBlock = statusMatch[1];

    const readStatusValue = (key) => {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const reg = new RegExp(
            `(?:[-*•]\\s*)?${escapedKey}[:：]\\s*([\\s\\S]*?)(?=(?:\\n|\\s)*(?:[-*•]\\s*)?(?:Action|Location|Weather|BGM|Murmur|HiddenThought|Kaomoji|Affection)[:：]|$)`,
            'i'
        );
        const m = statusBlock.match(reg);
        return m ? m[1].trim() : '';
    };

    if (friendsData[targetChatId]) {
        if (!friendsData[targetChatId].mindState) friendsData[targetChatId].mindState = {};
        if (typeof friendsData[targetChatId].affection !== 'number') friendsData[targetChatId].affection = 0;

        friendsData[targetChatId].mindState.action = readStatusValue('Action') || friendsData[targetChatId].mindState.action || '正在发呆';
        friendsData[targetChatId].mindState.location = readStatusValue('Location') || friendsData[targetChatId].mindState.location || '未知地点';
        friendsData[targetChatId].mindState.weather = readStatusValue('Weather') || friendsData[targetChatId].mindState.weather || '晴';
        friendsData[targetChatId].mindState.bgm = readStatusValue('BGM') || friendsData[targetChatId].mindState.bgm || 'No BGM';
        friendsData[targetChatId].mindState.murmur = readStatusValue('Murmur') || friendsData[targetChatId].mindState.murmur || '...';
        friendsData[targetChatId].mindState.hiddenThought = readStatusValue('HiddenThought') || friendsData[targetChatId].mindState.hiddenThought || '';
        friendsData[targetChatId].mindState.kaomoji = readStatusValue('Kaomoji') || friendsData[targetChatId].mindState.kaomoji || '( ˙W˙ )';

        const extractedAff = readStatusValue('Affection');
        if (extractedAff) {
            const match = extractedAff.match(/\d+/);
            if (match) friendsData[targetChatId].affection = parseInt(match[0]);
        }

        saveFriendsData();
        refreshMindCardUI(targetChatId, false);

        // 刷新首页音乐小组件
        const homeTitle = document.getElementById('home-music-title');
        const homeArtist = document.getElementById('home-music-artist');
        const bgmText = friendsData[targetChatId].mindState.bgm || 'No BGM';
        if (bgmText.includes(' - ')) {
            const parts = bgmText.split(' - ');
            if (homeTitle) homeTitle.innerText = parts[0].trim();
            if (homeArtist) homeArtist.innerText = parts.slice(1).join(' - ').trim();
        } else {
            if (homeTitle) homeTitle.innerText = bgmText;
            if (homeArtist) homeArtist.innerText = 'AI Mood';
        }
        if (typeof saveHomeMusicText === 'function') saveHomeMusicText();
    }
    rawReply = rawReply.replace(statusRegex, '').trim();
}


            // === [自定义状态正则提取与替换] ===
            if (chatSettings.statusRegexEnabled && chatSettings.statusExtractRegex) {
                try {
                    const extractReg = new RegExp(chatSettings.statusExtractRegex, 'i');
                    const extractMatch = rawReply.match(extractReg);
                    if (extractMatch && extractMatch[1]) {
                        if (friendsData[targetChatId] && friendsData[targetChatId].mindState) {
                            friendsData[targetChatId].mindState.action = extractMatch[1].trim();
                            saveFriendsData();
                            refreshMindCardUI(targetChatId, false);
                        }
                    }
                    if (chatSettings.statusReplaceRegex) {
                        const replaceReg = new RegExp(chatSettings.statusReplaceRegex, 'ig');
                        rawReply = rawReply.replace(replaceReg, '').trim();
                    }
                } catch (e) {
                    console.error("Custom status regex error:", e);
                }
            }

                        // 2. 提取弹幕 (容错版，兼容末尾被截断的情况)
            const danmakuRegex = /\[DANMAKU_START\]([\s\S]*?)(?:\[\/?DANMAKU_END\]|(?=\[[A-Za-z_]+_START\])|$)/i;
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
            // === [新增] 解析 AI 主动换头像的指令 ===
            if (rawReply.includes('[CHANGE_AVATAR]')) {
                rawReply = rawReply.replace(/\[CHANGE_AVATAR\]/gi, '').trim(); // 剔除暗号不显示在文字中
                
                // 检查刚才是不是发过图片
                if (friendsData[targetChatId] && friendsData[targetChatId].lastSharedImage) {
                    const newAvatar = friendsData[targetChatId].lastSharedImage;
                    friendsData[targetChatId].avatar = newAvatar;
                    saveFriendsData();
                    
                    // 延迟 1 秒，等文字发出来后再更换头像，显得更真实
                    setTimeout(() => {
                        // 1. 刷新全局 UI 中的头像 (气泡、心声卡、通讯录等)
                        refreshFriendAvatarInUI(targetChatId, newAvatar);
                        rebuildContactsList();
                        restoreFriendListUI();
                        if (document.getElementById('mind-card-overlay')?.classList.contains('active')) {
                            refreshMindCardUI(targetChatId, false);
                        }
                        
                        // 2. 在聊天界面发送一条居中的灰色系统提示
                        const sysMsgId = 'msg_sys_' + Date.now();
                        const sysMsg = `${friendsData[targetChatId].remark || friendsData[targetChatId].realName} 将你发送的图片设为了头像`;
                        appendMessage(sysMsg, 'system', null, null, null, sysMsgId);
                        saveMessageToHistory(targetChatId, { id: sysMsgId, text: sysMsg, type: 'system' });
                    }, 1000);
                }
            }

            // === [新增] 解析 AI 给用户发亲密付的指令，生成交互卡片 ===
            const grantRegex = /\[GRANT_PAY:([\d\.]+|无限)\]/i;
            const grantMatch = rawReply.match(grantRegex);
            if(grantMatch) {
                let limitStr = grantMatch[1];
                rawReply = rawReply.replace(grantRegex, '').trim();
                setTimeout(() => {
                    const msgId = 'invite_ai_' + Date.now();
                    const tagText = `[INTIMATE_AI2ME:${limitStr}:pending:${msgId}]`;
                    const isLookingAtThisChat = () => {
                        const chatLayer = document.getElementById('chatLayer');
                        return chatLayer && chatLayer.classList.contains('show') && currentChatId === targetChatId && currentChatType === 'single';
                    };
                    if (isLookingAtThisChat()) {
                        appendMessage(tagText, 'received', friendsData[targetChatId].avatar, friendsData[targetChatId].realName);
                    } else {
                        const dockDot = document.getElementById('dock-dot');
                        if (dockDot) dockDot.style.display = 'block';
                    }
                    saveMessageToHistory(targetChatId, { text: tagText, type: 'received', senderName: friendsData[targetChatId].realName });
                }, 1000);
            }
            // === [新增] 解析外卖卡片指令 ===
            const takeoutRegex = /\[TAKEOUT:([^:]+):(\d+(?:\.\d+)?)\]/i;
            const takeoutMatch = rawReply.match(takeoutRegex);
            if (takeoutMatch) {
                const shopName = takeoutMatch[1].trim();
                const price = parseFloat(takeoutMatch[2]);
                
                // 从文字中剥离标签
                rawReply = rawReply.replace(takeoutRegex, '').trim();

                // 延迟一小会儿渲染卡片
                setTimeout(() => {
                    // 1. 扣除余额
                    if (typeof window.deductBalanceForTakeout === 'function') {
                        window.deductBalanceForTakeout(price, shopName);
                    }

                    // 2. 渲染外卖卡片
                    const msgId = 'msg_takeout_' + Date.now();
                    const encodedShop = encodeURIComponent(shopName);
                    // 点击卡片直接跳去美团搜索
                    const cardHtml = `
                        <div class="msg-takeout-card" onclick="openRealTakeoutApp('${encodedShop}')">
                            <div class="takeout-header">
                                <div class="takeout-title">TA为你点了外卖 🛵</div>
                                <div class="takeout-price">-¥${price}</div>
                            </div>
                            <div class="takeout-body">
                                <div class="takeout-shop-name">${shopName}</div>
                                <div class="takeout-desc">正在快马加鞭送达中... (点击去外卖APP挑你喜欢的同类店)</div>
                            </div>
                            <div class="takeout-footer">亲密付自动代付</div>
                        </div>
                    `;
                    
                    const fName = friendsData[targetChatId]?.remark || friendsData[targetChatId]?.realName;
                    const fAvatar = friendsData[targetChatId]?.avatar;
                    
                    const isLookingAtThisChat = () => {
                        const chatLayer = document.getElementById('chatLayer');
                        return chatLayer && chatLayer.classList.contains('show') && currentChatId === targetChatId && currentChatType === 'single';
                    };
                    
                    if (isLookingAtThisChat()) {
                        // 使用富文本方式强行上屏
                        const chatMessages = document.getElementById('chatMessages');
                        const row = document.createElement('div');
                        row.className = 'chat-row received';
                        const avatar = document.createElement('img');
                        avatar.className = 'chat-avatar-img';
                        avatar.src = fAvatar || AVATAR_AI;
                        const bubble = document.createElement('div');
                        bubble.className = `message-bubble rich-bubble`;
                        bubble.innerHTML = cardHtml;
                        row.appendChild(avatar);
                        row.appendChild(bubble);
                        chatMessages.appendChild(row);
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    } else {
                        const dockDot = document.getElementById('dock-dot');
                        if (dockDot) dockDot.style.display = 'block';
                    }

                    // 保存到历史
                    saveMessageToHistory(targetChatId, {
                        id: msgId,
                        text: `[TAKEOUT_CARD:${shopName}:${price}]`, // 特殊历史标签
                        type: 'received',
                        senderName: fName,
                        customAvatar: fAvatar
                    });

                    // 3. 启动 30 分钟送达定时器
                    startTakeoutDeliveryTimer(targetChatId, shopName);
                }, 1000);
            }

            // === [新增] 解析 AI 主动发送的定位卡片 ===
            const mapRegex = /\[SEND_MAP:([^|]+)\|([^|]+)\|([^\]]+)\]/i;
            const mapMatch = rawReply.match(mapRegex);
            if (mapMatch) {
                const aiLoc = mapMatch[1].trim();
                const meLoc = mapMatch[2].trim();
                const dist = mapMatch[3].trim();
                // 剔除标记不显示在文字中
                rawReply = rawReply.replace(mapRegex, '').trim();
                
                // 延迟 500ms 自动帮它写入 MapApp 数据库并上屏
                setTimeout(() => {
                    if (typeof loadMapsData === 'function') loadMapsData();
                    let defaultMapId = Object.keys(mapsData || {})[0];
                    if (!defaultMapId) {
                        defaultMapId = 'map_' + Date.now();
                        mapsData[defaultMapId] = { id: defaultMapId, name: '我们的世界', locations: [] };
                    }
                    
                    // 检查是否存在，不存在就自动新建
                    const existAi = mapsData[defaultMapId].locations.find(l => l.name === aiLoc);
                    if (!existAi) mapsData[defaultMapId].locations.push({id: 'loc_'+Date.now(), name: aiLoc, desc: 'AI触发建立', x: Math.random()*80+10, y: Math.random()*80+10, boundChars: [targetChatId]});
                    
                    const existMe = mapsData[defaultMapId].locations.find(l => l.name === meLoc);
                    if (!existMe) mapsData[defaultMapId].locations.push({id: 'loc_'+Date.now()+'_2', name: meLoc, desc: 'AI触发建立', x: Math.random()*80+10, y: Math.random()*80+10, boundChars: []});
                    
                    if (typeof saveMapsData === 'function') saveMapsData();

                    // 生成标准的 MAP_CARD 给前端渲染
                    const tagText = `[MAP_CARD:${meLoc}|${aiLoc}|${dist}||true]`;
                    const msgId = 'msg_aimap_' + Date.now();
                    
                    // 获取当前聊天人设的真实名字和头像
                    const fName = friendsData[targetChatId]?.remark || friendsData[targetChatId]?.realName;
                    const fAvatar = friendsData[targetChatId]?.avatar;
                    
                    const isLookingAtThisChat = () => {
                        const chatLayer = document.getElementById('chatLayer');
                        return chatLayer && chatLayer.classList.contains('show') && currentChatId === targetChatId && currentChatType === 'single';
                    };
                    if (isLookingAtThisChat()) {
                        appendMessage(tagText, 'received', fAvatar, fName, null, msgId);
                    } else {
                        const dockDot = document.getElementById('dock-dot');
                        if (dockDot) dockDot.style.display = 'block';
                    }
                    
                    saveMessageToHistory(targetChatId, {
                        id: msgId,
                        text: tagText,
                        type: 'received',
                        senderName: fName,
                        customAvatar: fAvatar
                    });
                }, 800);
            }

            // === [一起听] 解析 AI 切歌指令 [CHANGE_MUSIC:歌名|歌手] ===
            const changeMusicRegex = /\[CHANGE_MUSIC:([^\]|]+)\|?([^\]]*)\]/i;
            const changeMusicMatch = rawReply.match(changeMusicRegex);
            if (changeMusicMatch) {
                rawReply = rawReply.replace(changeMusicRegex, '').trim();
                const targetTitle = changeMusicMatch[1].trim();
                const targetArtist = changeMusicMatch[2].trim();
                setTimeout(() => {
                    if (typeof changeMusicByAI === 'function') {
                        changeMusicByAI(targetTitle, targetArtist);
                    }
                }, 300);
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
                createMomentFromAI(targetChatId, momentText, momentImages);
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
            // 【竞态修复】使用函数开头捕获的 targetChatId，而非此时可能已变更的 currentChatId
            const currentName = targetChatId;
            // 【修复】优先使用好友数据里的头像，没有才用随机的
let avatarUrl = friendsData[currentName]?.avatar;
if (!avatarUrl) {
    avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${friendsData[currentName]?.realName || 'AI'}`;
}

            if (finalContent && finalContent.trim() !== '') {
                // 转账标签解析（[TRANSFER:金额:备注]）
                if (typeof TransferApp !== 'undefined' && TransferApp.parseAndHandleAITransfer) {
                    finalContent = TransferApp.parseAndHandleAITransfer(finalContent);
                }
                if (typeof PatApp !== 'undefined' && PatApp.parseAndHandleAIPat) {
                    finalContent = PatApp.parseAndHandleAIPat(finalContent, targetChatId);
                }
                
                // 1. 先将富媒体标签强制提行，防止混排导致 startsWith 检测失败
                finalContent = finalContent
                    .replace(/(\[VOICE\])/gi, '\n$1')
                    .replace(/(\[IMAGE\])/gi, '\n$1\n')
                    .replace(/(\[WC_TRANSFER:.*?\])/gi, '\n$1\n')
                    .replace(/(\[表情:.*?\])/gi, '\n$1\n')
                    .replace(/(\[PAT_NOTICE\])/gi, '\n$1');

                // 2. 按换行符拆分正文 (过滤空行)
                let textSegments = finalContent.split('\n').map(s => s.trim()).filter(s => s);
                // 回复条数区间控制 (replyMin ~ replyMax)
                const _replyMin = Math.max(1, parseInt(chatSettings.replyMin) || 1);
                const _replyMax = Math.max(_replyMin, parseInt(chatSettings.replyMax) || 5);

                // 【修复】如果 AI 把所有话都挤在了一行里（一大段话），且允许连发，我们帮它按标点符号拆开
                if (textSegments.length === 1 && _replyMax > 1 && textSegments[0].length > 15 && !textSegments[0].startsWith('[')) {
                    const sentences = textSegments[0].match(/[^。！？.!?~～]+[。！？.!?~～]*/g);
                    if (sentences && sentences.length > 1) {
                        textSegments = sentences.map(s => s.trim()).filter(Boolean);
                    }
                }

                if (textSegments.length > _replyMax && _replyMax === 1) {
                    textSegments = [textSegments.join(' ')];
                } else if (textSegments.length > _replyMax) {
                    const _kept = textSegments.slice(0, _replyMax - 1);
                    _kept.push(textSegments.slice(_replyMax - 1).join(' '));
                    textSegments = _kept;
                }
                
                // 2. 按换行符拆分翻译 (如果有)
                const transSegments = finalTranslation ? finalTranslation.split('\n').map(s => s.trim()).filter(s => s) : [];

                let cumulativeDelay = 0; // 累计延迟时间

                 // 3. 循环发送每一个气泡
                textSegments.forEach((seg, index) => {
                    const delay = index === 0 ? 100 : (800 + seg.length * 50);
                    cumulativeDelay += delay;

                    setTimeout(() => {
                        let currentTrans = null;
                        if (transSegments.length > 0) {
                            if (index < transSegments.length) currentTrans = transSegments[index];
                            if (index === textSegments.length - 1 && transSegments.length > textSegments.length) {
                                currentTrans = transSegments.slice(index).join('<br>');
                            }
                        }

                        const aiMsgId = 'msg_ai_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

                        const chatLayer = document.getElementById('chatLayer');
                        const isLookingAtThisChat = chatLayer && chatLayer.classList.contains('show') && currentChatId === currentName && currentChatType === 'single';
                        if (isLookingAtThisChat) {
                            // 上屏，必须带上 aiMsgId
                            appendMessage(seg, 'received', avatarUrl, null, currentTrans, aiMsgId);
                        } else {
                            // 红点提醒逻辑
                            const dockDot = document.getElementById('dock-dot');
                            if (dockDot) dockDot.style.display = 'block';
                        }

                         // 确保使用同一个 ID 存入历史记录
                        if (currentName) {
                            saveMessageToHistory(currentName, {
                                id: aiMsgId,
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
    startDanmakuBatch(0); // 线上聊天模式：立即开始发送弹幕，无需等待
} else if (isDanmakuOn) {
    if (typeof generateDanmakuReaction === 'function') {
        generateDanmakuReaction(finalContent, 'fallback');
    }
}

        }


        
    } catch (error) {
    if (error.name === 'AbortError') {
        console.log("线上生成被用户中止");
        const el = document.getElementById(loadingId);
        if (el) el.remove();
        return;
    }
    const el = document.getElementById(loadingId);
    if (el) el.remove();

    showAiErrorModal(
        '线上生成失败',
        (error && error.message) ? error.message : String(error)
    );
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
            // 优先使用已设置的头像，无头像时再使用 DiceBear 随机头像
            const avatarUrl = f.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(f.realName || name)}`;
            
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

// 6. 辅助函数：通用的添加聊天列表项 (支持群聊和单聊)
function addChatListEntry(id, displayName, lastMsg, avatarUrl, type) {
    const chatList = document.querySelector('#tab-chats');
    const searchBar = chatList.querySelector('.wc-search-container');
    
    const newItem = document.createElement('div');
    newItem.className = 'wc-chat-item widget-1x1 sortable-item';
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

window.toggleMindCard = function(event) {
    if (!event) return;

    const card = document.getElementById('mind-card-overlay');
    if (!card) return;

    if (event.target.id === 'mind-card-overlay') {
        card.classList.remove('active');
        return;
    }

    if (card.classList.contains('active')) {
        card.classList.remove('active');
        return;
    }

    if (!currentChatId || !friendsData[currentChatId]) return;

    refreshMindCardUI(currentChatId, false); 
    card.classList.add('active');
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

// [修正版] 异步加载好友数据 (修复了身份隔离Bug)
// 修改后的代码
async function loadFriendsData() {
    try {
        // 1. 优先从 IndexedDB 获取当前身份的专属数据
        let savedData = await IDB.get(scopedLSKey(FRIENDS_DATA_KEY));

        // 2. 如果没找到，再尝试从 LocalStorage 迁移 (只尝试专属Key)
        if (!savedData) {
            // 只尝试读取带身份ID的专属旧数据
            let oldRaw = localStorage.getItem(scopedLSKey(FRIENDS_DATA_KEY));

            // 【修改】删除了对全局旧数据的回退查找逻辑
            // if (!oldRaw) {
            //     oldRaw = localStorage.getItem(FRIENDS_DATA_KEY); // <-- 删除这一块
            // }

            if (oldRaw) {
                console.log("检测到旧的好友数据，正在迁移至当前身份的独立存储中...");
                try {
                    savedData = JSON.parse(oldRaw);
                    await IDB.set(scopedLSKey(FRIENDS_DATA_KEY), savedData);
                    // 迁移后删除旧的专属 localStorage 数据
                    localStorage.removeItem(scopedLSKey(FRIENDS_DATA_KEY));
                    console.log("迁移成功！");
                } catch (e) { 
                    console.error("好友数据迁移解析失败:", e);
                }
            }
        }


        // 3. 应用数据 (这部分逻辑不变)
        if (savedData && Object.keys(savedData).length > 0) {
            friendsData = savedData;
            normalizeAllFriendsMindFields();
            normalizeAllFriendsSummaryFields();
            // 注意：这里不再需要保存，因为加载和迁移时已经存好了
            console.log("好友数据加载成功 (来源: IndexedDB)");
        } else {
            console.log("当前身份无好友数据，初始化默认...");
            resetDefaultFriendData();
        }

        // 4. 刷新界面 (这部分逻辑不变)
        restoreFriendListUI(); 
        rebuildContactsList();

    } catch (e) {
        console.error("加载好友数据失败:", e);
        resetDefaultFriendData();
    }
}

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
//  【重写后】打开聊天详细设置页面 (适配 V2 新界面)
// =========================================
window.openChatSettingsPage = function() {
    // 群聊走群聊设置
    if (currentChatType === 'group') {
        if (typeof openGroupSettingsPage === 'function') {
            openGroupSettingsPage(currentChatId);
        }
        return;
    }
    // 仅支持单人聊天设置
    if (!currentChatId || currentChatType !== 'single') {
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
    // 开场白统一编辑框回填
    const _currentGreeting = getEffectiveGreeting(friend);
    const _unifiedTA = document.getElementById('cs-greeting-unified');
    if (_unifiedTA) {
        _unifiedTA.value = _currentGreeting;
        _unifiedTA.style.height = 'auto';
        if (_currentGreeting) {
            _unifiedTA.style.height = Math.min(_unifiedTA.scrollHeight, 260) + 'px';
        }
    }
    renderGreetingPresetsUI(friend);

 
    
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
            
            const isGlobal = wb.global; // 判断是否是全局世界书
            
            // 点击整行触发勾选逻辑
            if (isGlobal) {
                // 如果是全局启用，禁止在个人设置里点击取消，并给予提示
                item.onclick = (e) => {
                    e.preventDefault();
                    if(typeof showToast === 'function') {
                        showToast("该世界书已全局启用，如需修改请前往 WorldBook APP");
                    } else {
                        alert("该世界书已全局启用，如需修改请前往 WorldBook APP");
                    }
                };
            } else {
                // 普通世界书正常勾选
                item.onclick = (e) => {
                    if(e.target.type !== 'checkbox') {
                        const cb = item.querySelector('input');
                        cb.checked = !cb.checked;
                    }
                };
            }
            
            // 核心修改：如果是全局，强制勾选、添加 disabled 锁定，以及绿色标签提示
            const isChecked = (selectedWbIds.includes(wb.id) || isGlobal) ? 'checked' : '';
            const disabledAttr = isGlobal ? 'disabled' : '';
            const globalTag = isGlobal ? `<span style="color:#07c160; font-size:10px; border:1px solid #07c160; padding:1px 4px; border-radius:4px; margin-right:6px;">全局</span>` : '';
            
            // 注意：这里 id 是 wb.id, 名字是 wb.title
            item.innerHTML = `
                <input type="checkbox" value="${wb.id}" ${isChecked} ${disabledAttr}>
                <span class="wb-checklist-name">${globalTag}${wb.title}</span>
            `;
            
            // 降低透明度让被锁定的项目视觉上更自然
            if (isGlobal) {
                item.style.opacity = '0.75';
            }

            wbContainer.appendChild(item);
        });
    }
    
    // --- 4. 填充个性化语音设置 ---
    document.getElementById('cs-voice-id').value = settings.voiceId || '';
    document.getElementById('cs-voice-speed').value = settings.voiceSpeed || 1.0;
    document.getElementById('cs-voice-speed-val').innerText = settings.voiceSpeed || 1.0;
    document.getElementById('cs-voice-lang').value = settings.voiceLang || '';

    // --- 5. 填充高级设置 ---
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
    setSoftDisplay(inactivityTimeBox, inactivityToggle.checked, 'block');

    // --- 5. 填充状态栏正则设置 (酒馆风格) ---
    const statusToggle = document.getElementById('cs-status-regex-toggle');
    const statusBox = document.getElementById('cs-status-regex-box');

    statusToggle.checked = settings.statusRegexEnabled || false;
    document.getElementById('cs-status-format-req').value = settings.statusFormatReq || '';
    document.getElementById('cs-status-extract-regex').value = settings.statusExtractRegex || '';
    document.getElementById('cs-status-replace-regex').value = settings.statusReplaceRegex || '';
    document.getElementById('cs-vision-sticker-toggle').checked = settings.visionStickerEnabled || false;

    // 根据开关状态决定是否显示正则输入区域
    setSoftDisplay(statusBox, statusToggle.checked, 'flex');
    // 【修复5】渲染允许使用的表情包复选框
    renderChatSettingsStickerCheckboxes();

    // === [图像生成] 加载角色专属提示词 ===
    if (typeof loadCharImagegenSettings === 'function') {
        loadCharImagegenSettings();
    }

    // 记忆互通 UI 渲染
    if (typeof renderLinkMemoryUI === 'function') {
        renderLinkMemoryUI();
    }

    // --- [新增] 填充记录管理 / 时间感知 / 回复条数 ---
    const timeAwarenessToggle = document.getElementById('cs-time-awareness-toggle');
    if (timeAwarenessToggle) {
        const timeOn = settings.timeAwareness !== undefined ? settings.timeAwareness : true;
        timeAwarenessToggle.checked = timeOn;
        const customBox = document.getElementById('cs-custom-time-box');
        if (customBox) customBox.style.display = timeOn ? 'none' : 'block';
        const customInput = document.getElementById('cs-custom-time-input');
        if (customInput) customInput.value = settings.customTime || '';
    }
    const replyMinEl = document.getElementById('cs-reply-min');
    const replyMaxEl = document.getElementById('cs-reply-max');
    if (replyMinEl) replyMinEl.value = settings.replyMin !== undefined ? settings.replyMin : 1;
    if (replyMaxEl) replyMaxEl.value = settings.replyMax !== undefined ? settings.replyMax : 5;

    // --- [新增] VISUAL 美化设置加载 ---
    const csChatBgUrlEl = document.getElementById('cs-chat-bg-url');
    if (csChatBgUrlEl) csChatBgUrlEl.value = settings.chatBgUrl || '';
    const csFontSliderEl = document.getElementById('cs-font-size-slider');
    const csFontValEl = document.getElementById('cs-font-size-val');
    if (csFontSliderEl) {
        csFontSliderEl.value = settings.fontSize || 14;
        if (csFontValEl) csFontValEl.textContent = (settings.fontSize || 14) + 'px';
    }
    const csCssEl = document.getElementById('cs-custom-css');
    if (csCssEl) csCssEl.value = settings.customCss || '';
    // 高亮气泡主题按钮
    document.querySelectorAll('.cs-bubble-theme-btn').forEach(b => { b.style.outline = ''; });
    const activeCsThemeBtn = document.querySelector(`.cs-bubble-theme-btn[data-theme="${settings.bubbleTheme || ''}"]`);
    if (activeCsThemeBtn) activeCsThemeBtn.style.outline = '2px solid #007aff';

    // --- [新增] 主动发动态频率设置 ---
    const momentFreqEl = document.getElementById('cs-moment-freq-enabled');
    const momentFreqTimeEl = document.getElementById('cs-moment-freq-time');
    const momentFreqPromptEl = document.getElementById('cs-moment-freq-prompt');
    const momentFreqBox = document.getElementById('cs-moment-freq-box');
    if (momentFreqEl) {
        momentFreqEl.checked = settings.momentFreqEnabled || false;
        if (momentFreqTimeEl) momentFreqTimeEl.value = settings.momentFreqTime || 60;
        if (momentFreqPromptEl) momentFreqPromptEl.value = settings.momentFreqPrompt || '';
        if (momentFreqBox) setSoftDisplay(momentFreqBox, momentFreqEl.checked, 'block');
    }

    // --- [离线消息] 设置回填 ---
    const omEnabledEl = document.getElementById('cs-offline-msg-enabled');
    if (omEnabledEl) {
        omEnabledEl.checked = settings.offlineMsgEnabled || false;
        const omBox = document.getElementById('cs-offline-msg-box');
        if (omBox) omBox.style.display = settings.offlineMsgEnabled ? 'block' : 'none';
    }
    const omIntervalEl = document.getElementById('cs-offline-msg-interval');
    if (omIntervalEl) omIntervalEl.value = settings.offlineMsgInterval !== undefined ? settings.offlineMsgInterval : 2;
    const omCountEl = document.getElementById('cs-offline-msg-count');
    if (omCountEl) omCountEl.value = settings.offlineMsgCount !== undefined ? settings.offlineMsgCount : 10;

    // 最后显示页面 (滑入动画)
    page.classList.add('show');

    // --- [桌宠] 同步悬浮桌宠设置到 UI ---
    if (typeof FloatPet !== 'undefined' && typeof FloatPet.syncToSettings === 'function') {
        const csCharId = document.getElementById('cs-char-id');
        if (csCharId) csCharId.value = currentChatId;
        FloatPet.syncToSettings(currentChatId);
    }
}

// 2. 关闭设置页面
window.closeChatSettingsPage = function() {
    const page = document.getElementById('chatSettingsPage');
    if (page) page.classList.remove('show');
    setTimeout(() => { page.style.zIndex = "300"; }, 400);
}

// =========================================
//  记录管理 & 搜索功能 (单人聊天设置)
// =========================================

// 切换自定义时间框的显示/隐藏（时间感知开关 onchange 回调）
window.toggleCustomTimeBox = function(checkbox) {
    const box = document.getElementById('cs-custom-time-box');
    if (!box) return;
    box.style.display = checkbox.checked ? 'none' : 'block';
};

// 导入聊天记录（从 JSON 文件）
window.importChatHistoryFromSettings = async function(input) {
    if (!input.files || !input.files[0]) return;
    if (!currentChatId) { showToast('请先打开一个聊天'); input.value = ''; return; }
    const file = input.files[0];
    input.value = '';
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        // 兼容数组格式和包装格式
        let history = Array.isArray(data) ? data : (data.history || data.messages || []);
        if (!Array.isArray(history) || history.length === 0) {
            showToast('文件格式不正确或记录为空'); return;
        }
        if (!confirm(`确定导入 ${history.length} 条记录？当前聊天记录将被覆盖。`)) return;
        const histKey = (typeof scopedChatKey === 'function') ? scopedChatKey(currentChatId) : currentChatId;
        await IDB.set(histKey, history);
        showToast(`成功导入 ${history.length} 条记录 ✓`);
        if (typeof openChatDetail === 'function') openChatDetail(currentChatId);
    } catch (e) {
        showToast('导入失败: ' + e.message);
    }
};

// 导出当前角色的聊天记录为 JSON
window.exportChatHistoryFromSettings = async function() {
    if (!currentChatId) { showToast('请先打开一个聊天'); return; }
    try {
        let history = [];
        if (typeof loadChatHistory === 'function') {
            history = await loadChatHistory(currentChatId) || [];
        } else {
            const histKey = (typeof scopedChatKey === 'function') ? scopedChatKey(currentChatId) : currentChatId;
            history = await IDB.get(histKey) || [];
        }
        if (history.length === 0) { showToast('当前聊天记录为空'); return; }
        const friend = friendsData[currentChatId] || {};
        const exportData = {
            chatId: currentChatId,
            characterName: friend.remark || friend.realName || currentChatId,
            exportTime: new Date().toISOString(),
            history: history
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const charName = friend.remark || friend.realName || currentChatId;
        a.download = `chat_${charName}_${new Date().toLocaleDateString('zh-CN').replace(/\//g,'-')}.json`;
        a.href = url;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`已导出 ${history.length} 条记录 ✓`);
    } catch (e) {
        showToast('导出失败: ' + e.message);
    }
};

// 打开聊天搜索页
window.openChatSearch = function() {
    const page = document.getElementById('chatSearchPage');
    if (!page) return;
    // 重置搜索状态
    const kw = document.getElementById('search-keyword-input');
    if (kw) kw.value = '';
    const sp = document.getElementById('search-speaker-select');
    if (sp) sp.value = 'all';
    const dt = document.getElementById('search-date-input');
    if (dt) dt.value = '';
    const results = document.getElementById('chat-search-results');
    if (results) results.innerHTML = `<div style="text-align:center;color:#ccc;font-size:13px;padding:40px 0;">
        <i class="fas fa-search" style="font-size:32px;margin-bottom:10px;display:block;opacity:0.3;"></i>
        输入关键词开始搜索</div>`;
    page.classList.add('show');
};

// 关闭聊天搜索页
window.closeChatSearch = function() {
    const page = document.getElementById('chatSearchPage');
    if (page) page.classList.remove('show');
};

// 执行聊天搜索
window.performChatSearch = async function() {
    const keyword = (document.getElementById('search-keyword-input')?.value || '').trim().toLowerCase();
    const speaker = document.getElementById('search-speaker-select')?.value || 'all';
    const dateStr = document.getElementById('search-date-input')?.value || '';
    const container = document.getElementById('chat-search-results');
    if (!container) return;

    if (!keyword && !dateStr && speaker === 'all') {
        container.innerHTML = `<div style="text-align:center;color:#ccc;font-size:13px;padding:40px 0;">
            <i class="fas fa-search" style="font-size:32px;margin-bottom:10px;display:block;opacity:0.3;"></i>
            输入关键词开始搜索</div>`;
        return;
    }
    if (!currentChatId) {
        container.innerHTML = `<div style="text-align:center;color:#ccc;font-size:13px;padding:20px;">请先打开一个聊天</div>`;
        return;
    }

    let history = [];
    try {
        if (typeof loadChatHistory === 'function') {
            history = await loadChatHistory(currentChatId) || [];
        }
    } catch (e) {}

    const friend = friendsData[currentChatId] || {};
    const charName = friend.remark || friend.realName || 'TA';

    // 筛选
    let results = [];
    history.forEach((msg, idx) => {
        if (msg.type === 'system' || msg.type === 'summary') return;
        if (speaker === 'sent' && msg.type !== 'sent') return;
        if (speaker === 'received' && msg.type !== 'received') return;
        if (dateStr && msg.timestamp) {
            const msgDate = new Date(msg.timestamp).toISOString().slice(0, 10);
            if (msgDate !== dateStr) return;
        }
        if (keyword) {
            const textLower = (msg.text || '').toLowerCase();
            if (!textLower.includes(keyword)) return;
        }
        results.push({ ...msg, _origIdx: idx });
    });

    if (results.length === 0) {
        container.innerHTML = `<div style="text-align:center;color:#ccc;font-size:13px;padding:40px 0;">
            <i class="fas fa-search" style="font-size:32px;margin-bottom:10px;display:block;opacity:0.3;"></i>
            未找到相关内容</div>`;
        return;
    }

    const highlight = (text, kw) => {
        if (!kw) return text;
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark style="background:#ffe58f;border-radius:2px;padding:0 1px;">$1</mark>');
    };

    const pad = n => String(n).padStart(2, '0');
    container.innerHTML = `<div style="font-size:11px;color:#aaa;margin-bottom:12px;padding:0 2px;">共找到 ${results.length} 条结果</div>` +
        results.map((msg) => {
            const isSent = msg.type === 'sent';
            const name = isSent ? '我' : charName;
            const avatar = isSent
                ? (personasMeta && personasMeta[currentPersonaId]?.avatar ? personasMeta[currentPersonaId].avatar : '')
                : (friend.avatar || '');
            const timeStr = msg.timestamp ? (() => {
                const d = new Date(msg.timestamp);
                return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
            })() : '';
            const rawText = (msg.text || '').substring(0, 200) + ((msg.text || '').length > 200 ? '...' : '');
            const displayText = highlight(rawText.replace(/</g,'&lt;').replace(/>/g,'&gt;'), keyword);
            const origIdx = msg._origIdx;

            return `<div class="sk-summary-item" style="cursor:pointer;margin-bottom:8px;" onclick="jumpToSearchResult(${origIdx})">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
                    ${avatar
                        ? `<img src="${avatar}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.style.display='none'">`
                        : `<div style="width:24px;height:24px;border-radius:50%;background:#eee;flex-shrink:0;"></div>`}
                    <span style="font-size:12px;font-weight:700;color:#333;">${name}</span>
                    <span style="font-size:10px;color:#aaa;margin-left:auto;">${timeStr}</span>
                </div>
                <div style="font-size:13px;color:#555;line-height:1.5;padding-left:32px;">${displayText}</div>
            </div>`;
        }).join('');
};

// 跳转到搜索结果对应的消息位置
window.jumpToSearchResult = function(msgIndex) {
    closeChatSearch();
    closeChatSettingsPage();
    setTimeout(() => {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;
        const allRows = chatMessages.querySelectorAll('.chat-row');
        // msgIndex 对应的是历史记录数组索引，DOM 中的气泡行与之大致对应
        const target = allRows[msgIndex] || allRows[allRows.length - 1];
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // 高亮闪烁效果
            const bubble = target.querySelector('.message-bubble');
            if (bubble) {
                const origBg = bubble.style.background;
                bubble.style.transition = 'background 0.3s';
                bubble.style.background = 'rgba(255, 229, 100, 0.6)';
                setTimeout(() => { bubble.style.background = origBg || ''; }, 2000);
            }
        }
    }, 350);
};

// 3. 聊天设置头像上传处理器 (关键修复：cs-avatar-upload 的 onchange 目标)
window.handleCsAvatarUpload = async function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            let base64 = e.target.result;
            // 压缩图片节省存储空间
            if (typeof compressImage === 'function') {
                base64 = await compressImage(base64, 300);
            }
            // 更新预览区域
            const previewImg = document.querySelector('#cs-avatar-preview img');
            if (previewImg) {
                previewImg.src = base64;
                previewImg.style.display = 'block';
            }
            // 更新隐藏域（保存时读取此值）
            const hiddenVal = document.getElementById('cs-avatar-hidden-val');
            if (hiddenVal) hiddenVal.value = base64;
        };
        reader.readAsDataURL(input.files[0]);
    }
    input.value = '';
};

// 4. 刷新好友头像在全局 DOM 中的所有显示位置
function refreshFriendAvatarInUI(chatId, newAvatar) {
    if (!newAvatar || !chatId) return;

    // A. 刷新当前聊天窗口中所有已渲染的接收气泡头像
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages && currentChatId === chatId) {
        chatMessages.querySelectorAll('.chat-row.received .chat-avatar-img').forEach(img => {
            img.src = newAvatar;
        });
    }

    // B. 刷新心声卡片头像
    const mindAvatar = document.querySelector('.mind-big-avatar');
    if (mindAvatar) mindAvatar.src = newAvatar;

    // C. 刷新通讯录资料页头像（如果当前打开着）
    const cpAvatar = document.getElementById('cp-avatar');
    if (cpAvatar && currentProfileId === chatId) cpAvatar.src = newAvatar;

    // D. 刷新聊天标题区（如果此角色当前正在聊天）
    // 头部头像（部分主题可能有）已通过 rebuildContactsList + restoreFriendListUI 覆盖
}


  // =========================================
  //  【你的要求实现版】保存聊天设置(V3 - 实现了开场白更换后自动清除)
  // =========================================
window.saveChatSettings = async function () {
    if (!currentChatId || currentChatType !== 'single') return;
    const friend = friendsData[currentChatId];
    if (!friend) {
        alert("未找到当前聊天对象。");
        return;
    }
    
    if (!friend.chatSettings) friend.chatSettings = {};
    
    const oldGreeting = getEffectiveGreeting(friend);
    const _prevLastChatTime = friend.chatSettings.lastChatTime;
    const _prevLinkMemory = friend.chatSettings.linkMemory;
    
    // 1. 获取新数据
    friend.realName = document.getElementById('cs-realname').value.trim();
    friend.remark = document.getElementById('cs-remark').value.trim();
    friend.persona = document.getElementById('cs-persona').value.trim();
    
    const unifiedGreeting = document.getElementById('cs-greeting-unified');
    if (unifiedGreeting) {
        friend.greetingCustom = unifiedGreeting.value.trim();
        friend.greetingMode = 'custom';
    }

    const hiddenAvatar = document.getElementById('cs-avatar-hidden-val');
    if (hiddenAvatar && hiddenAvatar.value) {
        friend.avatar = hiddenAvatar.value;
    }
    
    const selectedWb = document.querySelectorAll('#cs-worldbook-container input[type="checkbox"]:checked:not(:disabled)');
    friend.worldbook = Array.from(selectedWb).map(cb => cb.value);

    const voiceIdEl = document.getElementById('cs-voice-id');
    if (voiceIdEl) friend.chatSettings.voiceId = voiceIdEl.value;
    
    const voiceSpeedEl = document.getElementById('cs-voice-speed');
    if (voiceSpeedEl) friend.chatSettings.voiceSpeed = parseFloat(voiceSpeedEl.value) || 1.0;
    
    const voiceLangEl = document.getElementById('cs-voice-lang');
    if (voiceLangEl) friend.chatSettings.voiceLang = voiceLangEl.value;

    const memLimitEl = document.getElementById('cs-memory-limit');
    if (memLimitEl) friend.chatSettings.memoryLimit = parseInt(memLimitEl.value) || 20;
    
    const transModeEl = document.getElementById('cs-translation-mode');
    if (transModeEl) friend.chatSettings.translationMode = transModeEl.value;
    
    const targetLangEl = document.getElementById('cs-target-lang');
    if (targetLangEl) friend.chatSettings.targetOutputLang = targetLangEl.value;

    const inactivityToggle = document.getElementById('cs-inactivity-toggle');
    friend.chatSettings.inactivityEnabled = inactivityToggle ? inactivityToggle.checked : false;
    const inactivityTime = document.getElementById('cs-inactivity-time');
    if (inactivityTime) friend.chatSettings.inactivityTime = parseInt(inactivityTime.value) || 300;

    const statusToggle = document.getElementById('cs-status-regex-toggle');
    friend.chatSettings.statusRegexEnabled = statusToggle ? statusToggle.checked : false;
    
    const statusFormatEl = document.getElementById('cs-status-format-req');
    if (statusFormatEl) friend.chatSettings.statusFormatReq = statusFormatEl.value;
    
    const statusExtractEl = document.getElementById('cs-status-extract-regex');
    if (statusExtractEl) friend.chatSettings.statusExtractRegex = statusExtractEl.value;
    
    const statusReplaceEl = document.getElementById('cs-status-replace-regex');
    if (statusReplaceEl) friend.chatSettings.statusReplaceRegex = statusReplaceEl.value;
    
    const visionToggle = document.getElementById('cs-vision-sticker-toggle');
    friend.chatSettings.visionStickerEnabled = visionToggle ? visionToggle.checked : false;

    const timeAwarenessToggle = document.getElementById('cs-time-awareness-toggle');
    if (timeAwarenessToggle) {
        friend.chatSettings.timeAwareness = timeAwarenessToggle.checked;
        const customInput = document.getElementById('cs-custom-time-input');
        if (customInput) friend.chatSettings.customTime = customInput.value.trim();
    }

    const replyMinEl = document.getElementById('cs-reply-min');
    const replyMaxEl = document.getElementById('cs-reply-max');
    if (replyMinEl) friend.chatSettings.replyMin = parseInt(replyMinEl.value) || 1;
    if (replyMaxEl) friend.chatSettings.replyMax = parseInt(replyMaxEl.value) || 5;

    const csChatBgUrlEl = document.getElementById('cs-chat-bg-url');
    if (csChatBgUrlEl) friend.chatSettings.chatBgUrl = csChatBgUrlEl.value.trim();
    
    const csFontSliderEl = document.getElementById('cs-font-size-slider');
    if (csFontSliderEl) friend.chatSettings.fontSize = parseInt(csFontSliderEl.value) || 14;
    
    const csCssEl = document.getElementById('cs-custom-css');
    if (csCssEl) friend.chatSettings.customCss = csCssEl.value.trim();

    const selectedStickers = document.querySelectorAll('#cs-sticker-categories input[type="checkbox"]:checked');
    friend.chatSettings.activeStickers = Array.from(selectedStickers).map(cb => cb.value);

    // [新增] 主动发动态频率设置保存
    const mfEl = document.getElementById('cs-moment-freq-enabled');
    const mfTimeEl = document.getElementById('cs-moment-freq-time');
    const mfPromptEl = document.getElementById('cs-moment-freq-prompt');
    if (mfEl) {
        friend.chatSettings.momentFreqEnabled = mfEl.checked;
        friend.chatSettings.momentFreqTime = mfTimeEl ? (parseInt(mfTimeEl.value) || 60) : 60;
        friend.chatSettings.momentFreqPrompt = mfPromptEl ? mfPromptEl.value.trim() : '';
    }

    // [离线消息] 设置保存
    const omEnabledSaveEl = document.getElementById('cs-offline-msg-enabled');
    friend.chatSettings.offlineMsgEnabled = omEnabledSaveEl ? omEnabledSaveEl.checked : false;
    const omIntervalSaveEl = document.getElementById('cs-offline-msg-interval');
    friend.chatSettings.offlineMsgInterval = omIntervalSaveEl ? (parseFloat(omIntervalSaveEl.value) || 2) : 2;
    const omCountSaveEl = document.getElementById('cs-offline-msg-count');
    friend.chatSettings.offlineMsgCount = omCountSaveEl ? (parseInt(omCountSaveEl.value) || 10) : 10;

    // 恢复记忆引擎持久字段（lastChatTime 不受保存操作影响）
    if (_prevLastChatTime) friend.chatSettings.lastChatTime = _prevLastChatTime;
    // 保存记忆互通配置（从 app_memory.js 的 UI 读取）
    if (typeof getLinkMemoryConfig === 'function') {
        friend.chatSettings.linkMemory = getLinkMemoryConfig();
    } else if (_prevLinkMemory) {
        friend.chatSettings.linkMemory = _prevLinkMemory;
    }
    // === [图像生成] 保存角色专属提示词 ===
    if (typeof saveCharImagegenSettings === 'function') {
        saveCharImagegenSettings();
    }
    // [关键] 3. 在所有数据更新后，获取新的有效开场白
    const newGreeting = getEffectiveGreeting(friend);
    
    // --- 4. 执行保存和后续操作 ---
    await saveFriendsData();
    rebuildContactsList(); // 更新通讯录
    restoreFriendListUI(); // 更新聊天列表(已修复重复bug)

    // 刷新当前聊天窗口气泡头像、心声卡、通讯录资料页头像
    refreshFriendAvatarInUI(currentChatId, friend.avatar);

    // 应用视觉美化设置（背景/主题/CSS 实时生效）
    applySingleChatVisualSettings(currentChatId);

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
    appendMessage(newGreeting, 'system', avatar, name);
    await saveMessageToHistory(currentChatId, { text: newGreeting, type: 'system', senderName: name, customAvatar: avatar });
}
        
        closeChatSettingsPage();
        alert('开场白已更新，聊天记录已自动清空！');

    } else {
        // --- 开场白没变，只保存设置，不碰聊天记录 ---
        closeChatSettingsPage();
        alert(`角色 "${friend.remark || friend.realName}" 的设置已保存。`);
    }
};


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
                const safeDesc = (img.desc || '').replace(/"/g, '"');
                return `<div class="moment-image-ai" data-desc="${safeDesc}" title="${safeDesc}"></div>`;
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
    addMomentsUnreadCount(1);
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


// 1. 保存单条消息到 IndexedDB (已集成自动总结与动态未读触发器)
async function saveMessageToHistory(chatId, msgData) {
    if (!chatId) return;
    
    let chatHistory = (await IDB.get(scopedChatKey(chatId))) || [];

    // 生成唯一ID并保存
    msgData.id = msgData.id || 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    msgData.timestamp = new Date().getTime();
    chatHistory.push(msgData);
    
    await IDB.set(scopedChatKey(chatId), chatHistory);

    // 【新增核心】未读数统计逻辑：只有收到的消息，并且当前没看着这个聊天，才增加未读
    if (msgData.senderName !== 'ME') {
        const chatLayer = document.getElementById('chatLayer');
        const isLookingAtThisChat = chatLayer && chatLayer.classList.contains('show') && currentChatId === chatId && currentChatType === 'single';
        
        if (!isLookingAtThisChat) {
            if (friendsData[chatId]) {
                friendsData[chatId].unreadCount = (friendsData[chatId].unreadCount || 0) + 1;
            } else if (groupsData && groupsData[chatId]) {
                groupsData[chatId].unreadCount = (groupsData[chatId].unreadCount || 0) + 1;
            }
        }
    }

    if (friendsData[chatId]) {
        friendsData[chatId].lastMessage = msgData.text; 
        saveFriendsData(); 
    }
    
    updateDockUnreadDot();

    // 更新列表预览和红点气泡
    const allChatItems = document.querySelectorAll('.wc-chat-item');
    allChatItems.forEach(item => {
        const targetId = item.getAttribute('data-chat-id');
        const nameTag = item.querySelector('.wc-name');
        
        // 双重保险验证是这个角色的列表项
        if (targetId === chatId || (nameTag && nameTag.innerText.trim() === chatId)) {
            
            const previewTag = item.querySelector('.wc-msg-preview');
            if (previewTag) {
                previewTag.innerText = formatChatPreviewText(msgData.text, !!msgData.isOffline);
            }

            const timeTag = item.querySelector('.wc-time');
            if (timeTag) timeTag.innerText = 'Just now';

            // 读取未读数据并渲染气泡
            let unreadCount = 0;
            if (friendsData[chatId]) unreadCount = friendsData[chatId].unreadCount || 0;
            else if (groupsData && groupsData[chatId]) unreadCount = groupsData[chatId].unreadCount || 0;

            let avatarBox = item.querySelector('.wc-avatar');
            if (avatarBox) {
                let badge = avatarBox.querySelector('.wc-badge');
                if (unreadCount > 0) {
                    let displayCount = unreadCount > 99 ? '99+' : unreadCount;
                    if (badge) {
                        badge.innerText = displayCount;
                    } else {
                        avatarBox.insertAdjacentHTML('beforeend', `<div class="wc-badge">${displayCount}</div>`);
                    }
                } else {
                    if (badge) badge.remove();
                }
            }
        }
    });
    
    // === 自动总结触发逻辑 ===
    const friend = friendsData[chatId];
    if (friend) {
        ensureFriendSummaryFields(friend);

        const config = friend.summaryConfig || {};
        const turnCount = parseInt(config.turnCount, 10) || 20;

        if (turnCount > 0 && chatHistory.length >= turnCount && chatHistory.length % turnCount === 0) {
            console.log(`达到 ${turnCount} 轮，触发自动总结...`);
            const recentMessages = chatHistory.slice(-turnCount);
            const startTurn = chatHistory.length - turnCount + 1;
            const endTurn = chatHistory.length;

            generateAutoSummary(chatId, recentMessages, startTurn, endTurn);
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
        const previewMsg = formatChatPreviewText(friend.lastMessage || getEffectiveGreeting(friend));

        
        // 兼容你可能存在的旧头像数据
        const avatarUrl = friend.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.realName || id}`;
        
        // 调用统一的添加函数
        addChatListEntry(id, friend.remark || friend.realName, previewMsg, avatarUrl, 'single');
    });

    // 恢复群聊列表
    if (typeof window.restoreGroupListUI === 'function') {
        window.restoreGroupListUI();
    }
}

/* =========================================
   [新增] 聊天扩展功能逻辑 (Feature Expansion)
   ========================================= */

// 1. 面板切换逻辑
window.toggleChatPanel = function(type) {
    const container = document.getElementById('chat-extra-panels');
    const panelEmoji = document.getElementById('panel-emoji');
    const panelPlus = document.getElementById('panel-plus');
    if (!container || !panelEmoji || !panelPlus) return;

    const emojiVisible = getComputedStyle(panelEmoji).display !== 'none';
    const plusVisible = getComputedStyle(panelPlus).display !== 'none';
    
    // 如果点击的是当前已经打开的，就关闭
    if (container.classList.contains('open') && 
       ((type === 'emoji' && emojiVisible) ||
        (type === 'plus' && plusVisible))) {
        
        container.classList.remove('open');
        // 延迟隐藏，避免关闭动画过程中内容突然消失导致闪动
        setTimeout(() => {
            setSoftDisplay(panelEmoji, false);
            setSoftDisplay(panelPlus, false);
        }, 250); 
        return;
    }

    // 切换显示内容（同步执行，去除 queueUiWrite 的延迟，防止展开时内容晚一拍出现导致闪屏）
    setSoftDisplay(panelEmoji, type === 'emoji', 'block');
    setSoftDisplay(panelPlus, type === 'plus', 'block');

    // 打开容器
    container.classList.add('open');
    
    // 自动滚动到底部
    const chatMessages = document.getElementById('chatMessages');
    setTimeout(() => chatMessages.scrollTop = chatMessages.scrollHeight, 50);
}

// 2. 插入 Emoji 到输入框
window.insertEmoji = function(emoji) {
    const input = document.getElementById('chatInput');
    input.value += emoji;
    input.focus();
}

// 3. 统一发送富媒体消息的函数 (防闪屏错峰优化版)
function sendRichMessage(htmlContent, typeClass, hiddenTextForAI) {
    // 第一步：先立刻收起底部加号面板（释放手机计算压力）
    const panel = document.getElementById('chat-extra-panels');
    if (panel) panel.classList.remove('open');

    // 第二步：稍微延迟 150 毫秒，等面板动画平稳后，再把消息塞进屏幕
    setTimeout(() => {
        const chatMessages = document.getElementById('chatMessages');

        // ★ 5 分钟时间气泡判断（与 appendMessage 保持一致）
        (function() {
            const _msgTs = Date.now();
            if (_msgTs - _lastChatMsgTimestamp >= 5 * 60 * 1000) {
                const _tb = document.createElement('div');
                _tb.className = 'chat-time-divider';
                _tb.innerHTML = `<span>${_formatChatTime(_msgTs)}</span>`;
                chatMessages.appendChild(_tb);
            }
            _lastChatMsgTimestamp = _msgTs;
        })();

        const row = document.createElement('div');
        row.className = 'chat-row sent';

        const avatar = document.createElement('img');
        avatar.className = 'chat-avatar-img';
        avatar.src = AVATAR_USER;

        const bubble = document.createElement('div');
        bubble.className = `message-bubble rich-bubble ${typeClass}`;
        bubble.innerHTML = htmlContent;

        row.appendChild(bubble);
        row.appendChild(avatar);
        chatMessages.appendChild(row);

        // 第三步：利用浏览器的下一帧进行平滑滚动，彻底告别抖动
        requestAnimationFrame(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            // 第四步：再等 100 毫秒后再触发 AI 请求，完美错开所有峰值！
            if (hiddenTextForAI) {
                setTimeout(() => {
                    sendMessageToAI(hiddenTextForAI);
                }, 100);
            }
        });
    }, 150);
}

// --- 功能 A: 发送图片 ---
window.triggerImageUpload = function() {
    document.getElementById('chat-image-input').click();
}
window.handleChatImage = function(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    
    // 【修改】加上 async 以便使用压缩功能，防止图片太大撑爆缓存
    reader.onload = async function(e) {
        let base64 = e.target.result;
        if (typeof compressImage === 'function') {
            base64 = await compressImage(base64, 500); // 压缩图片
        }
        
        const imgHtml = `<div class="msg-image-content"><img src="${base64}"></div>`;
        
        // 1. 存下这张图，作为 AI 的“备选头像”
        if (currentChatId && friendsData[currentChatId]) {
            friendsData[currentChatId].lastSharedImage = base64;
            saveFriendsData();
        }

        // 2. 告诉 AI 你发了图，并教它换头像的系统暗号
        const hiddenPrompt = `[System: User sent an image. Simulate that you can see it and react to it. If the user suggests you use it as your avatar, or if you really like it, you MUST include the exact tag [CHANGE_AVATAR] anywhere in your reply to automatically set it as your profile picture.]`;
        
        sendRichMessage(imgHtml, 'sent', hiddenPrompt);
    };
    reader.readAsDataURL(file);
    input.value = '';
}

/* =========================================
   [新增] 描述图片发送功能
   ========================================= */

window.openImageDescModal = function() {
    const modal = document.getElementById('image-desc-modal');
    const input = document.getElementById('image-desc-input');
    const previewText = document.getElementById('image-desc-preview-text');

    if (input) input.value = '';
    if (previewText) previewText.innerText = '这里会显示你输入的描述内容';

    if (modal) modal.classList.add('active');
};

window.closeImageDescModal = function() {
    const modal = document.getElementById('image-desc-modal');
    if (modal) modal.classList.remove('active');
};

window.syncImageDescPreview = function() {
    const input = document.getElementById('image-desc-input');
    const previewText = document.getElementById('image-desc-preview-text');
    if (!input || !previewText) return;

    const val = input.value.trim();
    previewText.innerText = val || '这里会显示你输入的描述内容';
};

window.confirmSendImageDesc = async function() {
    const input = document.getElementById('image-desc-input');
    const desc = (input?.value || '').trim();

    if (!desc) {
        alert('请先输入图片描述');
        return;
    }

    const rawText = `[IMG_DESC]${desc}`;
    const msgId = 'msg_user_imgdesc_' + Date.now();

    // 核心修复：传入 msgId
    appendMessage(rawText, 'sent', null, null, null, msgId);

    if (currentChatId) {
        await saveMessageToHistory(currentChatId, {
            id: msgId,
            text: rawText,
            type: 'sent',
            senderName: 'ME'
        });
    }

    closeImageDescModal();
    const panel = document.getElementById('chat-extra-panels');
    if (panel) panel.classList.remove('open');
};


window.toggleFakeImageDesc = function(card) {
    if (!card) return;

    const descBox = card.querySelector('.fake-image-desc');
    if (!descBox) return;

    const encoded = card.getAttribute('data-desc') || '';
    const currentText = decodeURIComponent(encoded);

    card.classList.toggle('expanded');

    if (card.classList.contains('expanded')) {
        descBox.innerText = currentText;
    } else {
        descBox.innerText = '';
    }
};

// --- 功能 B: 发送位置 (双模式弹窗) ---
let isLocMeNew = false;
let isLocAiNew = false;
let isLocSingleNew = false;
let currentLocMode = 'single'; // 'single' 或 'radar'

window.sendLocation = function() {
    openLocationShareModal();
}

window.switchLocTab = function(mode) {
    currentLocMode = mode;
    document.getElementById('tab-btn-loc-single').classList.remove('active');
    document.getElementById('tab-btn-loc-radar').classList.remove('active');

    switchSoftDisplays(
        [
            { key: 'single', el: document.getElementById('loc-panel-single'), display: 'block' },
            { key: 'radar', el: document.getElementById('loc-panel-radar'), display: 'block' }
        ],
        mode
    );

    document.getElementById(`tab-btn-loc-${mode}`).classList.add('active');
}

window.openLocationShareModal = function() {
    document.getElementById('location-share-modal').classList.add('active');
    
    // 初始化状态
    switchLocTab('single');
    isLocMeNew = false;
    isLocAiNew = false;
    isLocSingleNew = false;
    setSoftDisplay(document.getElementById('loc-single-new'), false);
    setSoftDisplay(document.getElementById('loc-me-new'), false);
    setSoftDisplay(document.getElementById('loc-ai-new'), false);
    setSoftDisplay(document.getElementById('loc-single-select'), true, 'block');
    setSoftDisplay(document.getElementById('loc-me-select'), true, 'block');
    setSoftDisplay(document.getElementById('loc-ai-select'), true, 'block');
    
    // 清空文本框
    document.getElementById('loc-single-addr').value = '';
    document.getElementById('loc-single-desc').value = '';
    
    // 载入地图数据
    if (typeof loadMapsData === 'function') loadMapsData();
    let allLocs = [];
    if (typeof mapsData !== 'undefined') {
        Object.values(mapsData).forEach(map => {
            if (map.locations) {
                map.locations.forEach(loc => {
                    allLocs.push({ id: loc.id, name: loc.name, mapName: map.name, x: loc.x, y: loc.y });
                });
            }
        });
    }

    let optionsHtml = '';
    if (allLocs.length === 0) {
        optionsHtml = '<option value="">暂无地点，请点击新建</option>';
    } else {
        allLocs.forEach(l => {
            optionsHtml += `<option value="${l.name}" data-x="${l.x}" data-y="${l.y}">${l.name} (${l.mapName})</option>`;
        });
    }
    document.getElementById('loc-single-select').innerHTML = optionsHtml;
    document.getElementById('loc-me-select').innerHTML = optionsHtml;
    document.getElementById('loc-ai-select').innerHTML = optionsHtml;
}

window.closeLocationShareModal = function() {
    document.getElementById('location-share-modal').classList.remove('active');
}

window.promptNewLocation = function(type) {
    if (type === 'single') {
        isLocSingleNew = true;
        setSoftDisplay(document.getElementById('loc-single-select'), false);
        setSoftDisplay(document.getElementById('loc-single-new'), true, 'block');
        document.getElementById('loc-single-new').value = '';
        document.getElementById('loc-single-new').focus();
    } else if (type === 'me') {
        isLocMeNew = true;
        setSoftDisplay(document.getElementById('loc-me-select'), false);
        setSoftDisplay(document.getElementById('loc-me-new'), true, 'block');
        document.getElementById('loc-me-new').value = '';
        document.getElementById('loc-me-new').focus();
    } else {
        isLocAiNew = true;
        setSoftDisplay(document.getElementById('loc-ai-select'), false);
        setSoftDisplay(document.getElementById('loc-ai-new'), true, 'block');
        document.getElementById('loc-ai-new').value = '';
        document.getElementById('loc-ai-new').focus();
    }
}

window.confirmSendLocation = function() {
    if (typeof loadMapsData === 'function') loadMapsData();
    let defaultMapId = Object.keys(mapsData || {})[0];
    if (!defaultMapId) {
        defaultMapId = 'map_' + Date.now();
        mapsData[defaultMapId] = { id: defaultMapId, name: '我们的世界', locations: [] };
    }

    if (currentLocMode === 'single') {
        // --- 模式1：只发我的位置 ---
        let locName = '';
        if (isLocSingleNew) {
            locName = document.getElementById('loc-single-new').value.trim();
            if (!locName) { alert('请输入位置名称'); return; }
            mapsData[defaultMapId].locations.push({
                id: 'loc_' + Date.now() + Math.random(),
                name: locName, desc: '单人定位自动创建', x: Math.random()*80+10, y: Math.random()*80+10, boundChars: []
            });
            if (typeof saveMapsData === 'function') saveMapsData();
        } else {
            locName = document.getElementById('loc-single-select').value;
            if(!locName) { alert('请选择或新建位置'); return; }
        }

        const addr = document.getElementById('loc-single-addr').value.replace(/\|/g, ' ').trim();
        const desc = document.getElementById('loc-single-desc').value.replace(/\|/g, ' ').trim();

        const tagText = `[MY_LOC:${locName}|${addr}|${desc}]`;
        const msgId = 'msg_loc_' + Date.now();
        
        appendMessage(tagText, 'sent', null, null, null, msgId);
        if (currentChatId) {
            saveMessageToHistory(currentChatId, { text: tagText, type: 'sent', senderName: 'ME', id: msgId });
        }


    } else {
        // --- 模式2：双人雷达 ---
        let meLocName = '', aiLocName = '';
        let meX = 50, meY = 50, aiX = 50, aiY = 50;

        if (isLocMeNew) {
            meLocName = document.getElementById('loc-me-new').value.trim();
            if (!meLocName) { alert('请输入我的新地点'); return; }
            meX = Math.round(Math.random()*80 + 10); meY = Math.round(Math.random()*80 + 10);
            mapsData[defaultMapId].locations.push({ id: 'loc_' + Date.now() + Math.random(), name: meLocName, desc: '雷达建立', x: meX, y: meY, boundChars: [] });
        } else {
            const sel = document.getElementById('loc-me-select');
            meLocName = sel.value;
            if(!meLocName) { alert('请选择或新建位置'); return; }
            const opt = sel.options[sel.selectedIndex];
            if(opt) { meX = parseFloat(opt.getAttribute('data-x'))||50; meY = parseFloat(opt.getAttribute('data-y'))||50; }
        }

        if (isLocAiNew) {
            aiLocName = document.getElementById('loc-ai-new').value.trim();
            if (!aiLocName) { alert('请输入TA的新地点'); return; }
            aiX = Math.round(Math.random()*80 + 10); aiY = Math.round(Math.random()*80 + 10);
            mapsData[defaultMapId].locations.push({ id: 'loc_' + Date.now() + Math.random(), name: aiLocName, desc: '雷达建立', x: aiX, y: aiY, boundChars: [currentChatId] });
        } else {
            const sel = document.getElementById('loc-ai-select');
            aiLocName = sel.value;
            if(!aiLocName) { alert('请选择或新建位置'); return; }
            const opt = sel.options[sel.selectedIndex];
            if(opt) { aiX = parseFloat(opt.getAttribute('data-x'))||50; aiY = parseFloat(opt.getAttribute('data-y'))||50; }
        }

        if (typeof saveMapsData === 'function') saveMapsData();

        const showRoute = document.getElementById('loc-show-route').checked;
        let dist = Math.round(Math.sqrt(Math.pow(meX - aiX, 2) + Math.pow(meY - aiY, 2)) * 0.5 * 10) / 10;
        if (meLocName === aiLocName) dist = 0;
        
        let viaText = '';
        if (showRoute && dist > 2) {
            const mapLocs = mapsData[defaultMapId].locations;
            const others = mapLocs.filter(l => l.name !== meLocName && l.name !== aiLocName);
            if (others.length > 0) {
                const randVia = others[Math.floor(Math.random()*others.length)];
                viaText = `途径: ${randVia.name}`;
            }
        }

        const tagText = `[MAP_CARD:${meLocName}|${aiLocName}|${dist}|${viaText}|${showRoute}]`;
        const msgId = 'msg_map_' + Date.now();
        appendMessage(tagText, 'sent', null, null, null, msgId);
        if (currentChatId) saveMessageToHistory(currentChatId, { text: tagText, type: 'sent', senderName: 'ME', id: msgId });
    }

    closeLocationShareModal();
    document.getElementById('chat-extra-panels').classList.remove('open');
}



// --- 功能 C: 拍一拍 (防闪屏优化版) ---
window.triggerNudge = function() {
    // 委托给 PatApp — 双击头像触发拍一拍弹窗
    document.getElementById('chat-extra-panels')?.classList.remove('open');
    const cid = (typeof window.currentChatId !== 'undefined') ? window.currentChatId : null;
    if (cid && typeof PatApp !== 'undefined') {
        PatApp.openPatModal(cid);
    }
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
    sendRichMessage(html, 'sent', `[System: User sent you money (¥${amount}). React with surprise and gratitude, or playfully refuse.]`);
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
    sendRichMessage(html, 'sent', `[System: User sent a voice message. Reply with a text message, BUT imply that you listened to it. Optional: You can send a voice message back by adding [VOICE] at the start of your reply.]`);
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
    sendRichMessage(html, 'sent', `[System: User invited you to listen to "Midnight Rain" by Taylor Swift together. Comment on the song.]`);
}

// --- 功能 G: 表情包 ---
window.sendSticker = function(src) {
    const html = `<img src="${src}" class="msg-sticker-img">`;
    sendRichMessage(html, 'sent', `[System: User sent a funny sticker/GIF. React with an emoji or a short laugh.]`);
}


// === Galgame 入口 ===
window.openGalgameApp = function() {
    const app = document.getElementById('galgameApp');
    if (app) {
        app.classList.add('active');
        app.classList.add('open'); // 解除 modules.css 的 visibility:hidden / transform:translateY(100%)
    }
    
    // 初始化选人
    if(typeof gal_initLobby === 'function') {
        gal_initLobby();
    }
}

window.closeGalgameApp = function() {
    const app = document.getElementById('galgameApp');
    if (app) {
        app.classList.remove('active');
        app.classList.remove('open');
    }
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
window.appendMessage = function(text, type, customAvatar = null, senderName = null, translation = null, msgId = null, timestamp = null) {
    const chatMessages = document.getElementById('chatMessages');
    
    // 1. 生成或使用传入的唯一ID (用于撤回定位)
    const uniqueId = msgId || ('msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
    
    const row = document.createElement('div');
    row.className = `chat-row ${type}`;
    // 绑定数据供菜单使用
    row.setAttribute('data-msg-id', uniqueId); 
    row.setAttribute('data-msg-text', text);   
    row.setAttribute('data-msg-sender', senderName || (type==='sent'?'ME':'AI')); 
    // === 微信风格时间气泡：消息间隔 >= 5 分钟则插入时间标签 ===
    // 【修复】移到 system/PAT_NOTICE 的 early return 之前，确保所有消息类型都更新 _lastChatMsgTimestamp
    (function() {
        const _msgTs = (timestamp && timestamp > 0) ? timestamp : Date.now();
        // 真实微信风格：5分钟内的相邻消息不显示时间戳
        if (_msgTs - _lastChatMsgTimestamp >= 5 * 60 * 1000) {
            const _tb = document.createElement('div');
            _tb.className = 'chat-time-divider';
            _tb.innerHTML = `<span>${_formatChatTime(_msgTs)}</span>`;
            chatMessages.appendChild(_tb);
        }
        _lastChatMsgTimestamp = _msgTs;
    })();

 if (type === 'system') {
        const sysBubble = document.createElement('div');
        sysBubble.className = 'msg-system-greeting';
        sysBubble.innerHTML = text.replace(/\n/g, '<br>');
        row.appendChild(sysBubble);
        chatMessages.appendChild(row);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return; // 直接退出，不再渲染后面的头像和多选框
    }

    // === [PAT_NOTICE] 拍一拍系统提示气泡 ===
    if (text && text.startsWith('[PAT_NOTICE]')) {
        const noticeText = text.replace('[PAT_NOTICE]', '');
        const noticeBubble = document.createElement('div');
        noticeBubble.className = 'pat-notice-bubble';
        const safeText = noticeText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        noticeBubble.innerHTML = `<span>${safeText}</span>`;
        chatMessages.appendChild(noticeBubble);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
    }

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
        
       if (type === 'received') {
            contentHtml = `
              <div class="msg-voice-bar ai-voice-bar" data-transcript="${encodeURIComponent(transcript)}" onclick="handleAiVoiceClick(this, '${uniqueId}')">
                <i class="fas fa-rss msg-voice-icon play-icon" style="transform: rotate(45deg); color: #333 !important; font-size: 16px !important; margin-right: 8px;"></i>
                <i class="fas fa-circle-notch fa-spin loading-spinner" style="display:none; color: #333; font-size: 16px; margin-right: 8px;"></i>
                <div class="msg-voice-duration" style="margin-left: auto; color: #333;">${sec}"</div>
              </div>
              <div class="msg-voice-transcript" style="display:none;">${transcript ? transcript.replace(/\n/g,'<br>') : '（语音消息）'}</div>
            `;
        } else {
            contentHtml = `
              <div class="msg-voice-bar" onclick="this.nextElementSibling.classList.toggle('show')">
                <div class="msg-voice-duration">${sec}"</div>
                <i class="fas fa-rss msg-voice-icon" style="transform: rotate(45deg);"></i>
              </div>
              <div class="msg-voice-transcript">${transcript ? transcript.replace(/\n/g,'<br>') : '（语音消息）'}</div>
            `;
        }
        isRichContent = true;
    } 
          else if (text.startsWith('[IMG_DESC]')) {
        bubble.classList.add('rich-bubble');
        const desc = text.replace('[IMG_DESC]', '').trim();
        const encodedDesc = encodeURIComponent(desc);

        // 使用极简韩系结构
        contentHtml = `
            <div class="chat-fake-image-card" data-desc="${encodedDesc}" onclick="toggleFakeImageDesc(this)">
                <div class="fake-image-content">
                    <i class="far fa-image"></i>
                    <span>PHOTO</span>
                </div>
                <div class="fake-image-desc"></div>
            </div>
        `;
        isRichContent = true;
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
           // === [韩系美化版] 地图定位分享卡片 (双人雷达) ===
    else if (text.startsWith('[MAP_CARD:')) {
        bubble.classList.add('rich-bubble');
        isRichContent = true;
        
        const cleanText = text.replace('[MAP_CARD:', '').replace(']', '');
        const parts = cleanText.split('|');
        const meLoc = parts[0] || '未知';
        const aiLoc = parts[1] || '未知';
        const dist = parseFloat(parts[2]) || 0;
        const via = parts[3] || '';
        const showRoute = parts[4] === 'true';

        let routeHtml = '';
        if (showRoute && dist > 0) {
            routeHtml = `
                <div class="cmc-route">
                    <div class="cmc-distance">相距 ${dist}km</div>
                    <div class="cmc-line">🐾 🐾 🐾</div>
                    ${via ? `<div class="cmc-via">${via}</div>` : ''}
                </div>
            `;
        } else {
            routeHtml = `
                <div class="cmc-route" style="border-left:none;">
                    <div class="cmc-distance" style="position:relative; left:0; transform:none; margin:10px 0;">${dist === 0 ? '就在彼此身边 💖' : `相距 ${dist}km`}</div>
                </div>
            `;
        }

        contentHtml = `
            <div class="chat-map-card">
                <div class="cmc-header">
                    <span>LOCATION RADAR</span>
                    <i class="fas fa-location-arrow"></i>
                </div>
                <div class="cmc-body">
                    <div class="cmc-point me">
                        <i class="fas fa-street-view"></i> <span class="cmc-name">${meLoc}</span>
                    </div>
                    ${routeHtml}
                    <div class="cmc-point ta">
                        <i class="fas fa-map-marker-alt"></i> <span class="cmc-name">${aiLoc}</span>
                    </div>
                </div>
            </div>
        `;
    }
        // === [新增] 单人位置分享卡片 (我的位置) ===
    else if (text.startsWith('[MY_LOC:')) {
        bubble.classList.add('rich-bubble');
        isRichContent = true;
        
        const cleanText = text.replace('[MY_LOC:', '').replace(']', '');
        const parts = cleanText.split('|');
        const locName = parts[0] || '未知位置';
        const addr = parts[1] || '';
        const desc = parts[2] || '';
        
        contentHtml = `
            <div class="msg-location-card">
                <div class="loc-info">
                    <div class="loc-title">${locName}</div>
                    <div class="loc-addr">${addr ? addr : (desc ? desc : '位置信息已共享')}</div>
                </div>
                
                <!-- 纯 CSS 代码绘制的浅灰色极简地图 (不需要任何图片，秒加载) -->
                <div class="loc-map" style="position:relative; height:100px; background-color:#f4f5f7; 
                    background-image: 
                        linear-gradient(to right, #e8e9eb 2px, transparent 2px),
                        linear-gradient(to bottom, #e8e9eb 2px, transparent 2px); 
                    background-size: 20px 20px; 
                    border-radius: 0 0 16px 16px; overflow: hidden;">
                    
                    <!-- 用 CSS 画两条交叉的白色主干道 -->
                    <div style="position:absolute; top:45%; left:-10%; width:120%; height:8px; background:#fff; transform:rotate(-12deg); box-shadow: 0 1px 2px rgba(0,0,0,0.03);"></div>
                    <div style="position:absolute; top:-10%; left:55%; width:8px; height:120%; background:#fff; transform:rotate(18deg); box-shadow: 0 1px 2px rgba(0,0,0,0.03);"></div>
                    
                    <!-- 用 CSS 画一块极简的浅绿公园地块 -->
                    <div style="position:absolute; bottom:20px; right:15px; width:45px; height:30px; background:#e2ecd9; border-radius:6px; opacity:0.8;"></div>

                    <!-- 极简的中心定位针 (深灰/黑色系，高级感) -->
                    <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); z-index: 10; display:flex; flex-direction:column; align-items:center;">
                        <div style="width:14px; height:14px; background-color:#333; border-radius:50%; border:3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.15);"></div>
                        <div style="width:3px; height:8px; background-color:#333; border-radius: 0 0 2px 2px;"></div>
                    </div>

                    <!-- 描述文字层 (白色半透明底，黑色字) -->
                    ${desc ? `<div style="position:absolute; bottom:0; left:0; width:100%; background:rgba(255,255,255,0.9); color:#555; font-size:11px; padding:6px 10px; z-index:20; text-align:left; box-sizing:border-box; border-top:1px solid #f0f0f0;">${desc}</div>` : ''}
                </div>
            </div>
        `;
    }


        // 检测 [IMAGE] 指令 -> 变图片
    else if (text.includes('[IMAGE]')) {
        bubble.classList.add('rich-bubble');
        contentHtml = `<div class="msg-image-content"><img src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=300&auto=format&fit=crop"></div>`;
        isRichContent = true;
    }
    // === [新增] 外卖卡片从历史加载时渲染 ===
    else if (text.startsWith('[TAKEOUT_CARD:')) {
        bubble.classList.add('rich-bubble');
        isRichContent = true;
        const cleanText = text.replace('[TAKEOUT_CARD:', '').replace(']', '');
        const parts = cleanText.split(':');
        const shopName = parts[0] || '神秘小店';
        const price = parseFloat(parts[1]) || 0;
        const encodedShop = encodeURIComponent(shopName);
        
        contentHtml = `
            <div class="msg-takeout-card" onclick="openRealTakeoutApp('${encodedShop}')">
                <div class="takeout-header">
                    <div class="takeout-title">TA为你点了外卖 🛵</div>
                    <div class="takeout-price">-¥${price}</div>
                </div>
                <div class="takeout-body">
                    <div class="takeout-shop-name">${shopName}</div>
                    <div class="takeout-desc">订单快照 (点击去外卖APP搜同款)</div>
                </div>
                <div class="takeout-footer">亲密付自动代付</div>
            </div>
        `;
    }
    // === [新增] 转账卡片从历史加载时渲染 ===
    else if (text.startsWith('[WC_TRANSFER:')) {
        bubble.classList.add('rich-bubble');
        // 重置气泡样式，让转账卡片接管视觉
        bubble.style.cssText = 'background:transparent!important;padding:0!important;box-shadow:none!important;border-radius:0!important;max-width:250px;';
        isRichContent = true;
        const _inner = text.replace('[WC_TRANSFER:', '').replace(/\]$/, '');
        const _parts = _inner.split('|');
        const tId = _parts[0] || '';
        const tDir = _parts[1] || 'user-to-ai';
        const tAmt = parseFloat(_parts[2]) || 0;
        const tMemo = (_parts[3] || '').replace(/\\\|/g, '|');
        const tStatus = _parts[4] || 'pending';
        const isUserSide = tDir === 'user-to-ai';
        let actionHtml = '';
        if (tStatus === 'accepted') {
            actionHtml = '<span class="transfer-status accepted">✅ 已收款</span>';
        } else if (tStatus === 'rejected') {
            actionHtml = '<span class="transfer-status rejected">↩ 已退回</span>';
        } else if (tDir === 'ai-to-user') {
            actionHtml = '<div class="transfer-btn-row"><button class="transfer-btn reject-btn" onclick="TransferApp.userRejectAITransfer(\'' + tId + '\')">拒收</button><button class="transfer-btn accept-btn" onclick="TransferApp.userAcceptAITransfer(\'' + tId + '\')">收款</button></div>';
        } else {
            actionHtml = '<span class="transfer-status pending">⏳ 等待对方确认</span>';
        }
        const tMemoEsc = tMemo.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const memoHtml = tMemo ? '<div class="transfer-memo">' + tMemoEsc + '</div>' : '';
        contentHtml = '<div class="wc-transfer-card" id="card-' + tId + '" data-transfer-dir="' + tDir + '"><div class="transfer-top"><div class="transfer-icon-wrap">💸</div><div class="transfer-info"><div class="transfer-title">' + (isUserSide ? '转账给对方' : '对方向你转账') + '</div><div class="transfer-amount">¥' + tAmt.toFixed(2) + '</div>' + memoHtml + '</div></div><div class="transfer-divider"></div><div class="transfer-action-area" id="action-' + tId + '">' + actionHtml + '</div><div class="transfer-footer">微信转账 · 虚拟资产</div></div>';
    }
    // === 【修复6】检测纯表情包，强制加上透明底色样式 ===
    else if (/^\[表情:.*?\]$/.test(text.trim())) {
        bubble.classList.add('rich-bubble');
    }


      // 渲染内容
    const mainContent = document.createElement('div');
    mainContent.className = 'bubble-content-main';
    
     // === [修改位置] 将换行转义与表情包渲染合并处理 ===
    let parsedText = text.replace(/\n/g, '<br>');
    
    // 捕获形如 [表情:xxx] 的占位符，替换为纯图片（不显示名字）
    parsedText = parsedText.replace(/\[表情:(.*?)\]/g, (match, p1) => {
        let name = p1.trim();
        let sticker = (window.allStickers || []).find(s => s.name === name);
        if (sticker) {
            return `<div class="msg-sticker-container">
                        <img src="${sticker.url}" class="msg-sticker-img" alt="${name}" title="${name}">
                    </div>`;
        }
        // 没匹配到（AI幻觉生造的），就保持原样输出文字
        return match; 
    });



    if (isRichContent) {
        mainContent.innerHTML = contentHtml; // 直接渲染其他富媒体 (语音/转账等)HTML
    } else {
        mainContent.innerHTML = parsedText;  // 使用解析了表情包的文本
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
let danmakuDelayTimer = null;
let danmakuPool = [];          // 当前的弹幕文案池

let danmakuRemainingCount = 0; // 【新增】剩余发射次数，用于控制循环停止
let danmakuQueue = [];
function shuffleArray(arr){
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function isOfflineModeActive() {
  const offlineView = document.getElementById('offlineModeView');
  return !!(offlineView && offlineView.classList.contains('show'));
}

function clearOfflineDanmakuLog() {
  const log = document.getElementById('offline-danmaku-log');
  if (log) log.innerHTML = '';
}

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
        if(layer) layer.innerHTML = '';
        clearOfflineDanmakuLog(); // 新增：线下日志也清空
        hideOfflineDanmakuArea(true); // 隐藏线下弹幕区
    }
}


// === 【修改】轨道管理：只保留 4 个轨道 (3-5行) ===
// 记录每个轨道"上一条弹幕发射的时间"，用于计算冷却
let danmakuTracks = [0, 0, 0, 0]; 
const TRACK_HEIGHT = 40; // 每行高度增加，防止文字挤在一起

// [新版] 弹幕发射器 (兼容线上飞行模式与线下日志模式)
function shootDanmaku(text, styleClass = '') {
    if (!isDanmakuOn) return; // 如果开关没开，直接退出

    // 预处理文本：过滤特殊字符和序号
    text = text.replace(/[()（）"“”'‘’]/g, '')
               .replace(/^[-*•\d\.\s]+/, '')
               .trim();
    if (!text || text.trim().length < 1) return;

    // 检查当前是否处于线下模式
    const offlineView = document.getElementById('offlineModeView');
    const isOfflineActive = offlineView && offlineView.classList.contains('show');

    if (isOfflineActive) {
         showOfflineDanmakuArea();
        // --- 场景A：当前在线下模式，写入日志区 ---
        const logContainer = document.getElementById('offline-danmaku-log');
        if (!logContainer) return;

        const item = document.createElement('div');
        item.className = 'log-danmaku-item'; // 使用我们新定义的日志样式
        item.innerText = text;

        logContainer.appendChild(item);

// 最多保留 50 条：追加时删最旧（第一条）
if (logContainer.children.length > 50) {
  logContainer.firstElementChild?.remove();
}


    } else {
        // --- 场景B：当前不在线下模式（即在线模式），执行原有的飞行逻辑 ---
        const layer = document.getElementById('danmaku-layer');
        if (!layer) return;

        const now = Date.now();
        let availableTracks = [];
        danmakuTracks.forEach((lastTime, index) => {
            if (now - lastTime > 4500) {
                availableTracks.push(index);
            }
        });

        if (availableTracks.length === 0) return;

        const selectedTrackIndex = availableTracks[Math.floor(Math.random() * availableTracks.length)];
        danmakuTracks[selectedTrackIndex] = now;

        const item = document.createElement('div');
        item.className = `danmaku-item ${styleClass}`; // 使用旧的飞行弹幕样式
        item.innerHTML = `<span>${text}</span>`;
        
        const topPos = selectedTrackIndex * TRACK_HEIGHT + 20;
        const duration = 8;

        item.style.top = `${topPos}px`;
        item.style.animation = `fly-left ${duration}s linear forwards`;
        
        item.addEventListener('animationend', () => {
            item.remove();
        });

        layer.appendChild(item);
    }
}



function startDanmakuBatch(initialDelay = 15000) {
  stopDanmakuLoop();
  if (!danmakuPool || danmakuPool.length === 0) return;

  const offlineActive = isOfflineModeActive();

  // === 线下模式：每次新回复的弹幕，先清空上一批 ===
  if (offlineActive) {
    hideOfflineDanmakuArea(true); 
    clearOfflineDanmakuLog();
    initialDelay = 0; // === 线下模式：不需要延迟，立刻开始 ===
  }

  // 去重 + 洗牌 + 只播一轮
  danmakuQueue = shuffleArray([...new Set(danmakuPool.map(s => (s || '').trim()).filter(Boolean))]);
  danmakuRemainingCount = danmakuQueue.length;

  const startLoop = () => {
    if (!isDanmakuOn) return stopDanmakuLoop();

    fireOneFromPool();

    danmakuLoopTimer = setInterval(() => {
      if (!isDanmakuOn) return stopDanmakuLoop();
      if (danmakuRemainingCount <= 0) return stopDanmakuLoop();
      fireOneFromPool();
    }, offlineActive ? 600 : 1800); // 线下可以快一点（想慢就改成1800）
  };

  if (initialDelay > 0) {
    danmakuDelayTimer = setTimeout(startLoop, initialDelay);
  } else {
    startLoop(); // 立刻开始
  }
}


function fireOneFromPool() {
  const text = danmakuQueue.shift();
  if (!text) { danmakuRemainingCount = 0; return; }

  let style = '';
  const rand = Math.random();
  if (rand > 0.9) style = 'highlight-gold';
  else if (rand > 0.8) style = 'highlight-blue';

  shootDanmaku(text, style);
  danmakuRemainingCount--;
}
function getOfflineDanmakuArea() {
  return document.querySelector('#offlineModeView .offline-danmaku-area');
}

function showOfflineDanmakuArea() {
  const area = getOfflineDanmakuArea();
  if (area) area.classList.add('show');
}

function hideOfflineDanmakuArea(clear = true) {
  const area = getOfflineDanmakuArea();
  if (area) area.classList.remove('show');
  if (clear) {
    const log = document.getElementById('offline-danmaku-log');
    if (log) log.innerHTML = '';
  }
}

function stopDanmakuLoop() {
    // 【新增】清空等待的 3 秒延迟
    if (danmakuDelayTimer) {
        clearTimeout(danmakuDelayTimer);
        danmakuDelayTimer = null;
    }
    // 清空循环发射定时器
    if (danmakuLoopTimer) {
        clearInterval(danmakuLoopTimer);
        danmakuLoopTimer = null;
    }
     danmakuQueue = [];
  danmakuRemainingCount = 0;
}

// === 图片快速更换功能 ===
let currentEditEl = null;
let currentEditMode = ''; // 'img' (找子元素img), 'bg' (改背景), 'self' (改自身src)

// 1. 点击元素触发
window.triggerChangeImage = function(el, mode) {
    currentEditEl = el;
    currentEditMode = mode;

    // Android WebView 中 confirm() 会打断用户手势链导致文件选择器无法弹出
    // 改用自定义底部面板，按钮的直接 click 事件保留手势上下文
    let sheet = document.getElementById('_img_action_sheet');
    if (!sheet) {
        sheet = document.createElement('div');
        sheet.id = '_img_action_sheet';
        sheet.style.cssText = [
            'position:fixed;bottom:0;left:0;right:0;z-index:999999',
            'background:#fff;border-radius:18px 18px 0 0',
            'padding:20px 16px 32px;box-shadow:0 -4px 24px rgba(0,0,0,0.18)',
            'display:none;'
        ].join(';');
        sheet.innerHTML =
            '<div style="text-align:center;font-weight:700;font-size:16px;color:#222;margin-bottom:16px;">更换图片</div>' +
            '<button id="_img_upload_btn" style="display:block;width:100%;margin:0 0 10px;padding:15px;background:#f5f5f7;border:none;border-radius:14px;font-size:15px;font-weight:600;color:#333;cursor:pointer;">📁 上传本地图片</button>' +
            '<button id="_img_url_btn"    style="display:block;width:100%;margin:0 0 10px;padding:15px;background:#f5f5f7;border:none;border-radius:14px;font-size:15px;font-weight:600;color:#333;cursor:pointer;">🔗 输入图片链接</button>' +
            '<button id="_img_cancel_btn" style="display:block;width:100%;padding:15px;background:transparent;border:none;border-radius:14px;font-size:15px;color:#999;cursor:pointer;">取消</button>';
        document.body.appendChild(sheet);

        // 上传按钮：直接在 click 事件中触发文件选择，保持手势链
        document.getElementById('_img_upload_btn').addEventListener('click', function() {
            sheet.style.display = 'none';
            document.getElementById('global-img-changer').click();
        });
        // URL 按钮
        document.getElementById('_img_url_btn').addEventListener('click', function() {
            sheet.style.display = 'none';
            const url = prompt('请输入图片 URL 地址:');
            if (url && url.trim()) applyImage(url.trim());
        });
        // 取消按钮
        document.getElementById('_img_cancel_btn').addEventListener('click', function() {
            sheet.style.display = 'none';
        });
        // 点击背景关闭
        sheet.addEventListener('click', function(e) {
            if (e.target === sheet) sheet.style.display = 'none';
        });
    }
    sheet.style.display = 'block';
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
    if (typeof window.removeGroupPlusPanel === 'function') window.removeGroupPlusPanel();

    const displayName = f.remark || f.realName || id;
    const avatar = f.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.realName || id}`;

    // 顶部：头像 + 名字
    document.getElementById('cp-avatar').src = avatar;
    document.getElementById('cp-name').innerText = displayName;
    document.getElementById('cp-realname').innerText = f.realName ? `真实姓名：${f.realName}` : '';

    // 检查 Meta 设置与好感度，决定是否显示预演删除按钮
    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    let isMetaEnabled = false;
    if (settingsJSON) {
        isMetaEnabled = JSON.parse(settingsJSON).enableMetaDelete === true;
    }
    const currentAffection = Number(f.affection) || 0;
    const preloadBtn = document.getElementById('btn-preload-meta');
    if (preloadBtn) {
        // 条件满足时显示为 flex (保证原有居中样式)，不满足时直接隐藏
        if (isMetaEnabled && currentAffection >= 100) {
            preloadBtn.style.display = 'flex';
        } else {
            preloadBtn.style.display = 'none';
        }
    }

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
    if (typeof window.removeGroupPlusPanel === 'function') window.removeGroupPlusPanel();

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

    // 检查 Meta 开关和好感度
    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    let isMetaEnabled = false;
    if (settingsJSON) {
        isMetaEnabled = JSON.parse(settingsJSON).enableMetaDelete === true;
    }
    const currentAffection = Number(friend.affection) || 0;

    if (!isMetaEnabled || currentAffection < 100) {
        if(typeof showToast === 'function') showToast('条件未满足：需在设置中开启 Meta 且好感度达到 100。');
        else alert('条件未满足：需在设置中开启 Meta 且好感度达到 100。');
        return;
    }
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
    const friend = friendsData[id];
    if (!friend) return;

    // 检查 Meta 开关和好感度
    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    let isMetaEnabled = false;
    if (settingsJSON) {
        isMetaEnabled = JSON.parse(settingsJSON).enableMetaDelete === true;
    }
    const currentAffection = Number(friend.affection) || 0;

    if (!isMetaEnabled || currentAffection < 100) {
        // 如果未达到 Meta 阈值或开关未开，只触发正常删除（调用原有系统的清理并询问确认）
        closeContactProfile();
        deleteFriendInternal(id);
        return;
    }
    
    // 检查是否预加载过数据
    if (!friend._metaCache) {
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

                                if (result.action === 'like' || result.action === 'both') {
                    const m = momentsFeed.find(x => x.id === moment.id);
                    if(m) {
                         m.likeCount = (m.likeCount || 0) + 1;
                         saveMomentsFeed();
                         renderMomentsFeed(); // 刷新 UI
                         addMomentsUnreadCount(1); // 【新增】AI点赞后，未读数+1
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
    addMomentsUnreadCount(1); // 【新增】AI评论后，未读数+1
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
    let charName = data.name || fileName.replace(/\.(json|png)$/i, '');
    
    // Prompt the user for an optional custom regex
    const customRegexStr = prompt(`导入角色卡 "${charName}"\n如果你需要自定义正则替换名字，请在此输入（例如：/\\s*\\(.*?\\)\\s*/g）\n如果不需要，请直接点击确定或取消。`);
    if (customRegexStr) {
        try {
            // 解析用户输入的正则。如果用户输入类似 /pattern/flags，尝试分离
            let regexPattern = customRegexStr;
            let flags = 'g'; // default
            
            const regexMatch = customRegexStr.match(/^\/(.*?)\/([gimsuy]*)$/);
            if (regexMatch) {
                regexPattern = regexMatch[1];
                flags = regexMatch[2];
            }
            
            const regex = new RegExp(regexPattern, flags);
            charName = charName.replace(regex, '');
        } catch(e) {
            console.warn("自定义正则解析失败，忽略正则替换", e);
            alert("自定义正则解析失败，将使用原名。");
        }
    }
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
    greetingList: greetingList,
    greetingSelected: 0,
    tavernGreeting: firstMes || '',
    greetingMode: (greetingList.length ? 'tavern' : 'custom'),
    greetingCustom: '',
    greeting: firstMes || '',
    avatar: finalAvatar,
    mindState: {
        action: "正在整理刚导入的人设",
        location: "角色初始化空间",
        weather: "晴",
        murmur: "新的人设已经套上来了。我在适应你的世界，也在确认要怎么和你开口。",
        kaomoji: "( ˙W˙ )",
        bgm: "No BGM"
    },
    chatSettings: {
        memoryLimit: 20,
        translationMode: 'off',
        targetOutputLang: '',
        inactivityEnabled: false,
        statusRegexEnabled: false
    },
    summaryConfig: {
        turnCount: 20,
        wordCount: 200,
        prompt: ''
    },
    summaries: [],
    relationshipLog: []
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
   [新增] 气泡菜单与高级操作逻辑 (撤回/多选/转发)
   ========================================= */

// 全局变量：记录当前操作的消息信息
let currentMenuTarget = { id: null, text: '', type: '', element: null };


window.handleMenuAction = function(action) {
    const { id, text, type, element } = currentMenuTarget;
    if (!id) return;

    switch (action) {
        case 'copy':
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).catch(e => console.log(e));
            } else {
                const textArea = document.createElement("textarea");
                textArea.value = text;
                document.body.appendChild(textArea);
                textArea.select();
                try { document.execCommand('copy'); } catch (err) {}
                document.body.removeChild(textArea);
            }
            const chatMessages = document.getElementById('chatMessages');
            const tip = document.createElement('div');
            tip.innerHTML = "<span style='background:rgba(0,0,0,0.6);color:#fff;padding:5px 10px;border-radius:4px;font-size:12px;'>已复制</span>";
            tip.style.cssText = "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:999;";
            chatMessages.appendChild(tip);
            setTimeout(()=>tip.remove(), 1000);
            break;
        case 'quote':
            const input = document.getElementById('chatInput');
            input.value = `「${text}」\n----------------\n` + input.value;
            input.focus();
            break;
        case 'forward':
            enterMultiSelectMode();
            break;
        case 'delete':
            enterMultiSelectMode(); 
            break;
        case 'revoke':
            performRevoke(id, text, element);
            break;
        case 'regen':
            performOnlineRegen(currentMenuTarget.element);
            break;
        case 'edit':
            performEdit(id, text, element);
            break;
    }

    // 【修复4：手动关闭菜单】执行完操作后关闭
    const menuEl = document.getElementById('wc-bubble-menu');
    if (menuEl) menuEl.classList.remove('show');
}

// --- 编辑消息核心逻辑 ---
async function performEdit(msgId, originalText, rowElement) {
    const newText = prompt('编辑消息：', originalText.replace(/<br>/g, '\n'));
    if (newText === null) return;
    const trimNew = newText.trim();
    if (!trimNew) return;

    // 更新气泡 DOM
    const mainContent = rowElement && rowElement.querySelector('.bubble-content-main');
    if (mainContent) {
        let html = trimNew.replace(/\n/g, '<br>');
        html = html.replace(/\[表情:(.*?)\]/g, (match, p1) => {
            const sticker = (window.allStickers || []).find(s => s.name === p1.trim());
            if (sticker) return `<div class="msg-sticker-container"><img src="${sticker.url}" class="msg-sticker-img" alt="${p1.trim()}" title="${p1.trim()}"></div>`;
            return match;
        });
        mainContent.innerHTML = html;
    }
    if (rowElement) rowElement.setAttribute('data-msg-text', trimNew);

    // 更新 IDB 历史记录
    if (currentChatId) {
        const history = await loadChatHistory(currentChatId);
        const idx = history ? history.findIndex(m => m.id === msgId) : -1;
        if (idx !== -1) {
            history[idx].text = trimNew;
            await IDB.set(scopedChatKey(currentChatId), history);
        }
    }
}

// --- 撤回核心逻辑 ---
async function performRevoke(msgId, originalText, rowElement) {
    const systemTip = document.createElement('div');
    systemTip.className = 'msg-system-revoke';
    const escapedText = originalText.replace(/'/g, "\\'").replace(/"/g, "&quot;");
    systemTip.innerHTML = `<span>你撤回了一条消息 <span style="color:#576b95;cursor:pointer;" onclick="document.getElementById('chatInput').value='${escapedText}'">重新编辑</span></span>`;
    
    if(rowElement.parentNode) {
        rowElement.parentNode.replaceChild(systemTip, rowElement);
    }
    
    // 【核心修复】更新数据库状态为已撤回，防止重进聊天又复活
    if (currentChatId) {
        let history = await loadChatHistory(currentChatId);
        if (history) {
            const index = history.findIndex(m => m.id === msgId);
            if (index !== -1) {
                history[index].isRevoked = true;
                history[index].originalText = originalText;
                history[index].type = 'system';
                await IDB.set(scopedChatKey(currentChatId), history);
            }
        }
    }

    // 【群聊吃瓜】撤回消息时，通知群AI成员做出反应
    if (currentChatType === 'group' && typeof window.sendGroupMessageToAI === 'function') {
        setTimeout(() => {
            window.sendGroupMessageToAI(`[System: 用户刚刚撤回了一条消息，内容是："${originalText}"。请根据你的人设自然地吐槽、追问或截图威胁，制造群内趣味。不要主动提及这是系统提示。]`);
        }, 600);
    }

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
    } else if (e.changedTouches && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
    }

    // 先显示菜单才能测量尺寸
    menu.classList.add('show');

    // 移到 body 下，脱离 .phone 的 overflow:hidden / isolation:isolate 堆叠上下文
    if (menu.parentElement !== document.body) {
        document.body.appendChild(menu);
    }

    // 双重 rAF：确保浏览器完成布局再测量
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const mw = menu.offsetWidth || 140;
            const mh = menu.offsetHeight || 240;
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            // 优先在触点上方弹出；如果上方空间不足就向下弹
            let top = clientY - mh - 8;
            if (top < 4) top = clientY + 12;
            // 防止底部溢出（留80px余量，兼容输入栏 + iOS安全区）
            if (top + mh > vh - 80) top = vh - mh - 80;
            if (top < 4) top = 4;

            // 水平居中于触点，防溢出
            let left = clientX - mw / 2;
            if (left < 4) left = 4;
            if (left + mw > vw - 4) left = vw - mw - 4;

            menu.style.left = left + 'px';
            menu.style.top = top + 'px';
        });
    });
    
        // 点击其他地方关闭菜单
    const closeMenu = (ev) => {
        // 【修复4：事件穿透保护】如果点击在菜单内，让它继续冒泡到具体的 onClick，自己这里不关闭
        const menuEl = document.getElementById('wc-bubble-menu');
        if (menuEl && menuEl.contains(ev.target)) return; 
        
        if (menuEl) menuEl.classList.remove('show');
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
window.executeMultiDelete = async function() {
    const selectedCheckboxes = document.querySelectorAll('.wc-msg-checkbox.checked');
    
    if (selectedCheckboxes.length === 0) {
        alert("请至少选择一条消息");
        return;
    }

    if (confirm(`确定删除这 ${selectedCheckboxes.length} 条消息吗？`)) {
        let history = await loadChatHistory(currentChatId);
        let idsToDelete = [];

        selectedCheckboxes.forEach(cb => {
            // 找到对应的整行 chat-row
            const row = cb.closest('.chat-row');
            if (row) {
                const msgId = row.getAttribute('data-msg-id');
                if (msgId) idsToDelete.push(msgId);
                
                // 动画效果
                row.style.opacity = '0';
                row.style.transform = 'translateX(-20px)';
                setTimeout(() => row.remove(), 300);
            }
        });
        
        // 退出多选模式
        exitMultiSelectMode();
        
        // 彻底删除底层数据库(IDB)记录
        if (history && idsToDelete.length > 0) {
            history = history.filter(m => !idsToDelete.includes(m.id));
            await IDB.set(scopedChatKey(currentChatId), history);
        }
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
   [新增] 线下模式 (Offline/Tavern Mode) 逻辑
   ========================================= */

// 1. 打开/关闭
window.openOfflineMode = function() { console.log('openOfflineMode called'); 
    if (!currentChatId) {
        console.warn("请先进入一个聊天窗口");
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
    // 同步线下工具栏按钮显示状态（避免“显示OFF但实际ON”）
const dmBtn = document.getElementById('offline-danmaku-btn');
if (dmBtn) dmBtn.innerText = `弹幕: ${isDanmakuOn ? 'ON' : 'OFF'}`;

const optBtn = document.getElementById('offline-options-btn');
if (optBtn) optBtn.innerText = `选项分支: ${isOfflineOptionsOn ? 'ON' : 'OFF'}`;

}


// 2. 辅助工具：插入快捷动作
window.insertOfflineAction = function(char) {
    const input = document.getElementById('offline-input');
    if(char === '*') {
        input.value += '*动作描述* ';
    } else if(char === '「') {
        input.value += '「说话」';
    } else if(char === '【') {
        input.value += '【】';
        input.focus();
        const pos = input.value.length - 1;
        input.setSelectionRange(pos, pos);
        return;
    }
    input.focus();
}

async function renderOfflineHistory(chatId) {
    const container = document.getElementById('offline-log-container');
    if (!container) return;

    // 1) 确保底部弹幕区存在（防止被误删后找不到）
    if (!container.querySelector('.offline-danmaku-area')) {
        container.insertAdjacentHTML('beforeend', `
            <div class="offline-danmaku-area">
                <div class="danmaku-area-header">REAL-TIME COMMENTS</div>
                <div id="offline-danmaku-log"></div>
            </div>
        `);
    }

    // 2) 只清“剧情条目”和“旧选项”，不要动弹幕区
    container.querySelectorAll('.offline-entry').forEach(el => el.remove());
    document.getElementById('vn-options-box')?.remove();

    // 3) （可选）每次进线下，清空弹幕日志
    const dmLog = document.getElementById('offline-danmaku-log');
    if (dmLog) dmLog.innerHTML = '';

    const history = await loadChatHistory(chatId);

    if (history.length === 0 && friendsData[chatId]?.greeting) {
        appendOfflineEntry('ai', friendsData[chatId].greeting, friendsData[chatId].realName);
    }

    history.forEach(msg => {
        if (msg.isOffline) {
            const role = msg.type === 'sent' ? 'user' : 'ai';
            const name = role === 'user' ? 'You' : (msg.senderName || friendsData[chatId].realName);
            appendOfflineEntry(role, msg.text, name, msg.id);
        }
    });

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
        
const dmArea = container.querySelector('.offline-danmaku-area');
if (dmArea) container.insertBefore(div, dmArea);
else container.appendChild(div);

    container.scrollTop = container.scrollHeight;
}
// START: 复制这段完整的代码，替换你原来的 sendOfflineMessage 函数
window.sendOfflineMessage = async function(isRegen = false) {
    const sendBtn = document.querySelector('.offline-send-btn');
    if (sendBtn && sendBtn.classList.contains('sending')) {
        if (currentAiController) {
            currentAiController.abort();
            currentAiController = null;
            if (typeof showToast === 'function') showToast("已停止生成");
        }
        return;
    }
    
    if (currentAiController) {
        currentAiController.abort();
    }
    currentAiController = new AbortController();

    const targetChatId = currentChatId;

    hideOfflineDanmakuArea(true);
    const input = document.getElementById('offline-input');
    let text = input ? input.value.trim() : '';
    
    if (!text && !isRegen) {
        text = "*静静地等待事情发展*"; 
    }
    
    // 【新增】解析【】内的指令，将其作为系统提示词注入
    let userInstruction = "";
    const instructionRegex = /【(.*?)】/g;
    let match;
    while ((match = instructionRegex.exec(text)) !== null) {
        userInstruction += match[1] + " ";
    }
    
    // 清除正文中的【】内容
    let cleanText = text.replace(instructionRegex, '').trim();
    
    const friend = friendsData[targetChatId];
    if (!friend) return;

    const isLookingOffline = document.getElementById('offlineModeView')?.classList.contains('show') && currentChatId === targetChatId && currentChatType === 'single';

    if (!isRegen) {
        const userMsgId = 'off_u_' + Date.now();
        if (isLookingOffline) {
            // 界面上只显示清除了【】的正文，如果没有正文就显示默认动作
            let displayText = cleanText;
            // 如果只有指令，我们可以在界面上显示一个带有系统图标的提示，或者就显示动作
            appendOfflineEntry('user', displayText, 'You', userMsgId); 
        }
        // 历史记录也只保存清除后的文本，指令在本次请求中生效，不留在长期记忆里（避免污染之后的对话）
        // 如果想把指令留在记忆里，可以把 text 换回去。通常跑团中 () 或 [] 都是带入 prompt。
        saveMessageToHistory(targetChatId, {
            text: cleanText, type: 'sent', senderName: 'ME', isOffline: true, id: userMsgId
        });
    } else {
        console.log("执行时间线重置");
    }
    
    input.value = '';
    
    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    if (!settingsJSON) {
    showAiErrorModal('线下模式无法生成', '请先在 Settings → AI Chat 配置 API Key / Base URL / Model');
    return;
}
    const settings = JSON.parse(settingsJSON);
    const presetId = offlineConfig.activePresetId;
    // 取消默认兜底，如果没选就是 undefined
    const preset = tavernPresets.find(p => p.id === presetId); 

    // 【修复】先移除旧的选项框，防止重复
    const oldOpts = document.getElementById('vn-options-box');
    if (oldOpts) oldOpts.remove();

    const history = await loadChatHistory(targetChatId);
    const memoryLimit = parseInt((friend.chatSettings && friend.chatSettings.memoryLimit) || 20);
    const historyContext = history.slice(-memoryLimit).map(h => 
        `${h.type==='sent'?'User':friend.realName}: ${h.isOffline?h.text:'(Online Memory: '+h.text+')'}`
    ).join('\n');

    const limit = parseInt(offlineConfig.maxLength) || 200;
    const currentLocation = friend.mindState?.location || '当前约会场景';

    // --- 收集世界书全文内容（与线上模式保持一致） ---
    let worldbookContent = '';
    try {
        const wbIds = Array.isArray(friend.worldbook)
            ? friend.worldbook
            : (friend.worldbook ? [friend.worldbook] : []);
        if (wbIds.length && typeof worldBooks !== 'undefined' && worldBooks.length) {
            worldbookContent = wbIds.map(id => {
                const wb = worldBooks.find(w => w.id === id);
                if (!wb) return '';
                if (wb.entries && wb.entries.length) {
                    return wb.entries
                        .filter(e => e.enabled !== false)
                        .map(e => e.content || '')
                        .filter(Boolean)
                        .join('\n');
                }
                return wb.description || wb.content || wb.title || '';
            }).filter(Boolean).join('\n\n');
        } else if (typeof friend.worldbook === 'string' && friend.worldbook) {
            worldbookContent = friend.worldbook;
        }
        // 补充全局世界书
        if (typeof worldBooks !== 'undefined') {
            const globalContent = worldBooks
                .filter(wb => wb.global)
                .flatMap(wb => (wb.entries || []).filter(e => e.enabled !== false).map(e => e.content || ''))
                .filter(Boolean)
                .join('\n');
            if (globalContent) worldbookContent = (worldbookContent ? worldbookContent + '\n\n' : '') + globalContent;
        }
    } catch (e) { /* 静默 */ }

    const charName = friend.realName || '助手';
    const myName = (typeof personasMeta !== 'undefined' && typeof currentPersonaId !== 'undefined' && personasMeta[currentPersonaId]) ? personasMeta[currentPersonaId].name : 'User';
    const parseMacros = (str) => {
        if (!str) return '';
        return String(str).replace(/{{char}}/gi, charName).replace(/{{user}}/gi, myName);
    };

let systemPrompt = `你是${charName}，正在与用户面对面相处，地点：${currentLocation}。
${parseMacros(friend.persona)}
当前对用户的好感度：${Number(friend.affection || 0)}/100
${worldbookContent ? `\n【世界观 / 背景设定】：\n${parseMacros(worldbookContent)}` : ''}
${preset && preset.jailbreak ? parseMacros(preset.jailbreak) + '\n' : ''}
${(() => { const me = personasMeta[currentPersonaId]; return (me && me.persona) ? `\n【用户身份】：${parseMacros(me.persona)}` : ''; })()}
${offlineConfig.writingStyle ? `\n【文风要求】：${offlineConfig.writingStyle}` : ''}

${preset && preset.systemPrompt ? parseMacros(preset.systemPrompt) : '以第一人称写沉浸式叙事，自然的延续互动。禁止描写用户内心，禁止暗示自己是AI。\n【重要】：你就是角色。\n格式：动作/神态/心理用*星号*包裹，对话用「书名号」包裹，两者自然混用。'}

【篇幅与句式控制】：
- 视当前剧情发展自然叙述，单次回复的实际正文（不包括思维链等思考过程）约为${limit} 字。
- 该停顿时自然换行或结束。`;

    // === 注入剧情总结 ===
    if (friend.summaries && friend.summaries.length > 0) {
        const summaryText = friend.summaries.map((s, i) => `- (第${i+1}阶段) ${s.text}`).join('\n');
        systemPrompt += `\n\n[PAST STORY SUMMARIES]:\n${summaryText}\n`;
    }
    // === 注入关系日志 ===
    if (friend.relationshipLog && friend.relationshipLog.length > 0) {
        const relationshipText = friend.relationshipLog.map(r => `- ${r.text}`).join('\n');
        systemPrompt += `\n\n[OUR RELATIONSHIP HISTORY]:\n${relationshipText}\n`;
    }
 // === 附加特殊数据块指令（动态检测开关状态） ===
    const optionsInstr = (typeof isOfflineOptionsOn !== 'undefined' && isOfflineOptionsOn)
        ? `[OPTIONS_START]\n1. （用户接下来可执行的选项一）\n2. （选项二）\n[OPTIONS_END]` : '';

    const danmakuInstr = (typeof isDanmakuOn !== 'undefined' && isDanmakuOn)
        ? `[DANMAKU_START]\n（网友弹幕一）\n（网友弹幕二）\n[DANMAKU_END]` : '';

    const statusInstr = `[STATUS_START]\nAction: (动作)\nLocation: (地点)\nWeather: (天气)\nBGM: (歌名-歌手)\nMurmur: (3句内心想法)\nHiddenThought: (阴暗面心声)\nKaomoji: (颜文字)\nAffection: (0-100)\n[STATUS_END]`;

    let extraBlocks = [statusInstr];
    if (optionsInstr) extraBlocks.push(optionsInstr);
    if (danmakuInstr) extraBlocks.push(danmakuInstr);

    systemPrompt += `\n\n【后台数据生成指令】\n你必须在回复正文的最末尾，严格按以下格式附加系统数据（如果没有被要求则不要乱加）：\n${extraBlocks.join('\n\n')}`;

    // === 注入世界书关键词触发 ===
    if (typeof constructWorldInfoPrompt === 'function') {

        const offlineWorldInfo = constructWorldInfoPrompt(text, targetChatId);
        if (offlineWorldInfo) {
            systemPrompt += `\n\n[World Setting / Lorebook Data]:\n${offlineWorldInfo}\n`;
        }
    }

    const recentHistory = history.slice(-memoryLimit);
    let chatMessagesArr = [];
    recentHistory.forEach(h => {
        // 如果历史消息是用户发的，并且包含【】，我们需要将其转换为系统指令格式，确保大模型理解这是指令而不是角色说的话
        let hContent = h.isOffline ? h.text : `(Online Memory: ${h.text})`;
        if (h.type === 'sent' && hContent.includes('【') && hContent.includes('】')) {
            hContent = hContent.replace(/【(.*?)】/g, '\n[System: User Instruction - $1]\n');
        }
        chatMessagesArr.push({
            role: h.type === 'sent' ? 'user' : 'assistant',
            content: hContent
        });
    });
    
    if (userInstruction) {
        // 把提取出来的指令包装成特殊的格式放在用户发言的末尾（或开头）
        const instructionBlock = `\n[System: User Instruction - ${userInstruction.trim()}]\n`;
        chatMessagesArr.push({ role: "user", content: cleanText + instructionBlock });
    } else if (cleanText) {
        chatMessagesArr.push({ role: "user", content: cleanText });
    }

    const payload = { 
        model: settings.model, 
        messages: [ 
            { role: "system", content: systemPrompt },
            ...chatMessagesArr
        ], 
        temperature: parseFloat(settings.temperature || 0.8),
        max_tokens: Math.max(Math.ceil(limit * 2.5) + 700, 700)
    };

    if (offlineConfig.streamingEnabled) {
        const aiMsgId = 'off_ai_' + Date.now();
        const isLookingOffline = document.getElementById('offlineModeView')?.classList.contains('show') && currentChatId === targetChatId && currentChatType === 'single';
        
        let textElement = null;
        let entryDiv = null;
        
        if (isLookingOffline) {
            const container = document.getElementById('offline-log-container');
            entryDiv = document.createElement('div');
            entryDiv.className = 'offline-entry ai';
            entryDiv.setAttribute('data-msg-id', aiMsgId);
            entryDiv.innerHTML = `
                <div class="oe-name">${friend.realName}</div>
                <div class="oe-text serif streaming" id="stream-${aiMsgId}"></div>
                <div class="oe-actions" style="display: none;">
                    <div class="oe-btn" onclick="regenerateOfflineMessage('${aiMsgId}')" title="重试/重回"><i class="fas fa-sync-alt"></i></div>
                    <div class="oe-btn" onclick="openModifyOffline('${aiMsgId}')" title="修改"><i class="fas fa-pen"></i></div>
                    <div class="oe-btn delete" onclick="deleteOfflineMsgUI('${aiMsgId}')" title="删除"><i class="fas fa-trash"></i></div>
                </div>
            `;
            const dmArea = container.querySelector('.offline-danmaku-area');
            if (dmArea) container.insertBefore(entryDiv, dmArea);
            else container.appendChild(entryDiv);
            textElement = document.getElementById(`stream-${aiMsgId}`);
        }
        
        const sendBtn = document.querySelector('.offline-send-btn');
        if(sendBtn) {
            sendBtn.classList.add('sending');
            sendBtn.innerHTML = '<i class="fas fa-stop"></i>';
        }

        try {
            payload.stream = true;
            let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
            const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
                body: JSON.stringify(payload),
                signal: currentAiController.signal
            });

            if (!response.ok) throw new Error(`API Error: ${response.status} ${response.statusText}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullReply = "";

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
                
                for (const line of lines) {
                    const jsonStr = line.replace('data: ', '');
                    if (jsonStr === '[DONE]') continue;
                    
                    try {
                        const data = JSON.parse(jsonStr);
                        const content = data.choices[0]?.delta?.content || '';
                        if (content) {
                            fullReply += content;
                            if (textElement) {
                                // 动态截断所有的特殊后台标签，彻底防止它们在打字机效果中暴露在屏幕上
                                let partialClean = fullReply.split(/\[(?:STATUS|OPTIONS|DANMAKU)_START\]/i)[0];
                                textElement.innerHTML = partialClean.replace(/\*(.*?)\*/g, '<i>*$1*</i>').replace(/「(.*?)」/g, '<b>「$1」</b>').replace(/\n/g, '<br>');
                            }

                            // 【修复】移除滚动，保持位置
                        }
                    } catch (e) { /* ignore parse errors */ }
                }
            }
            
            if(sendBtn) {
                sendBtn.classList.remove('sending');
                sendBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
            }
            if (textElement) textElement.classList.remove('streaming');
            if (entryDiv) entryDiv.querySelector('.oe-actions').style.display = 'flex';

            let cleanReply = fullReply;
            let hasStatus = false;
            let hasOptions = false;
            let hasDanmaku = false;

            let extractedOptions = [];
            const optRegex = /\[OPTIONS_START\]([\s\S]*?)(?:\[\/?OPTIONS_END\]|(?=\[[A-Za-z_]+_START\])|$)/i;
            const optMatch = cleanReply.match(optRegex);
            if (optMatch) {
                hasOptions = true;
                extractedOptions = optMatch[1]
                    .split('\n')
                    .map(s => s.trim())
                    .map(s => s.replace(/^(\d+\s*[\.、)\]）]|Option\s*\d+\s*[:：]|[-*•])\s*/i, '').trim())
                    .filter(s => s.length > 0);
                cleanReply = cleanReply.replace(optRegex, '').trim();
            }

            const statusRegex = /\[STATUS_START\]([\s\S]*?)(?:\[\/?STATUS_END\]|(?=\[[A-Za-z_]+_START\])|$)/i;
            const statusMatch = cleanReply.match(statusRegex);
            if (statusMatch) {
                hasStatus = true;
                updateMindStateFromText(statusMatch[1], targetChatId);
                cleanReply = cleanReply.replace(statusRegex, '').trim();
            }

            const danmakuRegex = /\[DANMAKU_START\]([\s\S]*?)(?:\[\/?DANMAKU_END\]|(?=\[[A-Za-z_]+_START\])|$)/i;
            const danmakuMatch = cleanReply.match(danmakuRegex);
            if (danmakuMatch) {
                hasDanmaku = true;
                const dList = danmakuMatch[1].split('\n').map(s=>s.trim()).filter(s=>s);
                if (isDanmakuOn && dList.length > 0) {
                    danmakuPool = dList;
                    startDanmakuBatch();
                }
                cleanReply = cleanReply.replace(danmakuRegex, '').trim();
            }

            if (textElement) {
                textElement.innerHTML = cleanReply.replace(/\*(.*?)\*/g, '<i>*$1*</i>').replace(/「(.*?)」/g, '<b>「$1」</b>').replace(/\n/g, '<br>');
            }
            
            await saveMessageToHistory(targetChatId, {
                text: cleanReply, type: 'received', senderName: friend.realName,
                customAvatar: friend.avatar, isOffline: true, id: aiMsgId
            });

            // 【修复】渲染选项分支
            const isLookingOfflineNow = document.getElementById('offlineModeView')?.classList.contains('show') && currentChatId === targetChatId;
            if (isLookingOfflineNow && isOfflineOptionsOn && extractedOptions.length > 0) {
                const container = document.getElementById('offline-log-container');
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
                const dmArea = container.querySelector('.offline-danmaku-area');
                if (dmArea) {
                    container.insertBefore(optDiv, dmArea);
                } else {
                    container.appendChild(optDiv);
                }

             // 【修复】选项出现后自动滚动到底部，确保能看到
                setTimeout(() => container.scrollTop = container.scrollHeight, 150);
            }
            
            const needsExtraFallback =
                !hasStatus ||
                (isOfflineOptionsOn && !hasOptions) ||
                (isDanmakuOn && !hasDanmaku);

            if (needsExtraFallback && typeof generateOfflineExtrasBackground === 'function') {
                generateOfflineExtrasBackground(
                    targetChatId,
                    cleanText || text,
                    cleanReply,
                    settings,
                    friend,
                    {
                        needStatus: !hasStatus,
                        needOptions: isOfflineOptionsOn && !hasOptions,
                        needDanmaku: isDanmakuOn && !hasDanmaku
                    }
                );
            }

       } catch (e) {
    if (e.name === 'AbortError') {
        console.log("线下流式生成被用户中止");
        if(sendBtn) {
            sendBtn.classList.remove('sending');
            sendBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
        }
        textElement.classList.remove('streaming');
        entryDiv.querySelector('.oe-actions').style.display = 'flex';
        return;
    }
    if (sendBtn) {
        sendBtn.classList.remove('sending');
        sendBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
    }

    // 不把错误留在剧情里
    entryDiv?.remove();

    showAiErrorModal(
        '线下模式生成失败（Streaming）',
        (e && e.message) ? e.message : String(e)
    );
}


    } else {
       const loadingId = 'loading-' + Date.now();
const container = document.getElementById('offline-log-container');

// 线下 loading 条目（不会写进聊天记录，只是临时 UI）
const loadDiv = document.createElement('div');
loadDiv.id = loadingId;
loadDiv.className = 'offline-entry ai';
loadDiv.innerHTML = `
  <div class="oe-name">SYSTEM</div>
  <div class="oe-text"><i class="fas fa-circle-notch fa-spin"></i> 生成中...</div>
`;

const dmArea = container.querySelector('.offline-danmaku-area');
if (dmArea) container.insertBefore(loadDiv, dmArea);
else container.appendChild(loadDiv);


        // 【修复】移除滚动，保持位置
        
        try {
            let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
            const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
            
            const sendBtn = document.querySelector('.offline-send-btn');
            if(sendBtn) {
                sendBtn.classList.add('sending');
                sendBtn.innerHTML = '<i class="fas fa-stop"></i>';
            }

           const res = await fetch(apiUrl, { 
  method: 'POST', 
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` }, 
  body: JSON.stringify(payload),
  signal: currentAiController.signal
});

const resText = await res.clone().text().catch(() => '');

document.getElementById(loadingId)?.remove();
if (sendBtn) {
    sendBtn.classList.remove('sending');
    sendBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
}

if (!res.ok) {
  throw new Error(`HTTP ${res.status} ${res.statusText}\n\n${resText}`);
}

let data = null;
try {
  data = await res.json();
} catch (e) {
  throw new Error(`响应不是 JSON（或被网关改写）\n\n${resText}`);
}

let rawReply = (data?.choices?.[0]?.message?.content ?? '');
if (!rawReply.trim()) {
  showAiErrorModal('线下生成空回', 'choices[0].message.content 为空');
  return;
}

            let hasStatus = false;
            let hasOptions = false;
            let hasDanmaku = false;
            let extractedOptions = [];
            const optRegex = /\[OPTIONS_START\]([\s\S]*?)(?:\[\/?OPTIONS_END\]|(?=\[[A-Za-z_]+_START\])|$)/i;
            const optMatch = rawReply.match(optRegex);
            if (optMatch) {
                hasOptions = true;
                extractedOptions = optMatch[1]
                    .split('\n')
                    .map(s => s.trim())
                    .map(s => s.replace(/^(\d+\s*[\.、)\]）]|Option\s*\d+\s*[:：]|[-*•])\s*/i, '').trim())
                    .filter(s => s.length > 0);
                rawReply = rawReply.replace(optRegex, '').trim();
            }

            const statusRegex = /\[STATUS_START\]([\s\S]*?)(?:\[\/?STATUS_END\]|(?=\[[A-Za-z_]+_START\])|$)/i;
            const statusMatch = rawReply.match(statusRegex);
            if (statusMatch) {
                hasStatus = true;
                updateMindStateFromText(statusMatch[1], targetChatId);
                rawReply = rawReply.replace(statusRegex, '').trim();
            }

            const danmakuRegex = /\[DANMAKU_START\]([\s\S]*?)(?:\[\/?DANMAKU_END\]|(?=\[[A-Za-z_]+_START\])|$)/i;
            const danmakuMatch = rawReply.match(danmakuRegex);
            if (danmakuMatch) {
                hasDanmaku = true;
                const dList = danmakuMatch[1].split('\n').map(s=>s.trim()).filter(s=>s);
                // 【修复】仅在弹幕开关开启时才处理
                if (isDanmakuOn && dList.length > 0) {
                    danmakuPool = dList;
                    startDanmakuBatch();
                }
                rawReply = rawReply.replace(danmakuRegex, '').trim();
            }

            const aiMsgId = 'off_ai_' + Date.now();
            const isLookingOffline = document.getElementById('offlineModeView')?.classList.contains('show') && currentChatId === targetChatId && currentChatType === 'single';
            if (isLookingOffline) {
                appendOfflineEntry('ai', rawReply, friend.realName, aiMsgId);
            }
            
            saveMessageToHistory(targetChatId, {
                text: rawReply, type: 'received', senderName: friend.realName,
                customAvatar: friend.avatar, isOffline: true, id: aiMsgId
            });
            
            // 【修复】渲染选项分支
            if (isLookingOffline && isOfflineOptionsOn && extractedOptions.length > 0) {
                const container = document.getElementById('offline-log-container');
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
                const dmArea = container.querySelector('.offline-danmaku-area');
                if (dmArea) {
                    container.insertBefore(optDiv, dmArea);
                } else {
                    container.appendChild(optDiv);
                }
                setTimeout(() => container.scrollTop = container.scrollHeight, 150);
            }

            const needsExtraFallback =
                !hasStatus ||
                (isOfflineOptionsOn && !hasOptions) ||
                (isDanmakuOn && !hasDanmaku);

            if (needsExtraFallback && typeof generateOfflineExtrasBackground === 'function') {
                generateOfflineExtrasBackground(
                    targetChatId,
                    cleanText || text,
                    rawReply,
                    settings,
                    friend,
                    {
                        needStatus: !hasStatus,
                        needOptions: isOfflineOptionsOn && !hasOptions,
                        needDanmaku: isDanmakuOn && !hasDanmaku
                    }
                );
            }

        } catch (e) {
    if (e.name === 'AbortError') {
        console.log("线下非流式生成被用户中止");
        document.getElementById(loadingId)?.remove();
        const sendBtn = document.querySelector('.offline-send-btn');
        if (sendBtn) {
            sendBtn.classList.remove('sending');
            sendBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
        }
        return;
    }
    document.getElementById(loadingId)?.remove();
    const sendBtn = document.querySelector('.offline-send-btn');
    if (sendBtn) {
        sendBtn.classList.remove('sending');
        sendBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
    }

    showAiErrorModal(
        '线下模式生成失败',
        (e && e.message) ? e.message : String(e)
    );
}

    }
}
// END: 替换结束


// [辅助函数] 从文本更新状态
function updateMindStateFromText(statusBlock, charId) {
    parseAndApplyMindStateBlock(charId, statusBlock);
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
        // ====== 增加不使用预设的选项 ======
        select.innerHTML = '<option value="">── 不使用预设 ──</option>';
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
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!Array.isArray(tavernPresets) || tavernPresets.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#aaa; font-size:12px; padding:40px 20px;">暂无预设，点击右上角新建一个吧</div>';
        return;
    }
    
    tavernPresets.forEach(p => {
        let scripts = p.regexScripts || [];
        
        const card = document.createElement('div');
        card.style.cssText = `
            background: #fff;
            border-radius: 12px;
            padding: 15px;
            margin-bottom: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.04);
            border: 1px solid ${p.id === offlineConfig.activePresetId ? '#222' : '#f0f0f0'};
            cursor: pointer;
            transition: 0.2s;
            position: relative;
        `;
        
        if (p.id === offlineConfig.activePresetId) {
            card.style.transform = 'translateY(-2px)';
            card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
        }
        
        card.onclick = (e) => {
            if (e.target.closest('button')) return;
            openPresetEditor(p.id);
        };
        
          card.innerHTML = `
              <div style="display:flex; justify-content:space-between; align-items:center;">
                  <div style="flex:1; padding-right:10px;">
                      <div style="display:flex; align-items:center; gap:8px;">
                          <h4 style="margin:0; font-size:15px; color:#222; font-weight:700; line-height:1.3;">${p.name ? p.name.replace(/[&<>'"]/g, match => ({ '&': '&', '<': '<', '>': '>', "'": '&#39;', '"': '"' })[match]) : '未命名预设'}</h4>
                      </div>
                  </div>
              </div>
          `;
        
        container.appendChild(card);
    });
}

window.applyOfflinePreset = function(id) {
    offlineConfig.activePresetId = id;
    localStorage.setItem(OFFLINE_CONFIG_KEY, JSON.stringify(offlineConfig));
    renderPresetsList();
    if(typeof showToast === 'function') showToast("预设已应用");
}

window.createNewPreset = function() {
    openPresetEditor(null);
}



window.closePresetEditor = function() {
    let listPane = document.getElementById('preset-list-pane');
    let editorPane = document.getElementById('preset-editor-pane');
    if (listPane) listPane.style.display = 'flex';
    if (editorPane) editorPane.style.display = 'none';
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
    offlineConfig.streamingEnabled = document.getElementById('offline-streaming-toggle').checked;

    // 【修复】保存文风字段
    const writingStyleEl = document.getElementById('offline-writing-style');
    if (writingStyleEl) offlineConfig.writingStyle = writingStyleEl.value;
    
    localStorage.setItem(OFFLINE_CONFIG_KEY, JSON.stringify(offlineConfig));
    applyOfflineVisuals();
}

// 新增：应用视觉效果函数
function applyOfflineVisuals() {
    // 1. 背景图（自定义配置覆盖）
    const bgLayer = document.getElementById('offline-bg-layer');
    if (offlineConfig.bgImage) {
        bgLayer.style.backgroundImage = `url('${offlineConfig.bgImage}')`;
        bgLayer.style.opacity = '1'; // 确保不透明
        bgLayer.style.filter = 'none'; // 去掉默认的模糊
    }
    // 没有自定义背景时，保持调用方已设置的角色/群头像背景，不清空

    // 2. CSS
    let styleTag = document.getElementById('offline-dynamic-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'offline-dynamic-style';
        document.head.appendChild(styleTag);
    }
    styleTag.innerHTML = offlineConfig.customCSS || '';
}

/* =========================================
   [新增] 单聊视觉美化设置应用函数
   ========================================= */
function applySingleChatVisualSettings(chatId) {
    const friend = friendsData[chatId];
    if (!friend) return;
    const settings = friend.chatSettings || {};

    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.style.backgroundImage = settings.chatBgUrl ? `url(${settings.chatBgUrl})` : '';
        if (settings.chatBgUrl) {
            chatMessages.style.backgroundSize = 'cover';
            chatMessages.style.backgroundPosition = 'center';
        }
        chatMessages.style.fontSize = settings.fontSize ? settings.fontSize + 'px' : '';
    }

    let styleEl = document.getElementById('single-chat-custom-css-style');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'single-chat-custom-css-style';
        document.head.appendChild(styleEl);
    }
    // 单人 CSS 为空时，回退使用全局聊天 CSS
    if (settings.customCss) {
        styleEl.textContent = settings.customCss;
    } else {
        const savedTheme = JSON.parse(localStorage.getItem(THEME_KEY) || '{}');
        styleEl.textContent = savedTheme.globalChatCSS || '';
    }

    const chatLayer = document.getElementById('chatLayer');
    if (chatLayer) {
        chatLayer.className = chatLayer.className.replace(/\bbubble-theme-\S+/g, '').trim();
        if (settings.bubbleTheme) {
            chatLayer.classList.add(`bubble-theme-${settings.bubbleTheme}`);
        }
    }
}

window.selectCsSingleBubbleTheme = function(theme, btn) {
    document.querySelectorAll('.cs-bubble-theme-btn').forEach(b => { b.style.outline = ''; });
    if (btn) btn.style.outline = '2px solid #007aff';
    if (currentChatId && friendsData[currentChatId]) {
        if (!friendsData[currentChatId].chatSettings) friendsData[currentChatId].chatSettings = {};
        friendsData[currentChatId].chatSettings.bubbleTheme = theme;
    }
};

window.handleCsChatBgUpload = function(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const el = document.getElementById('cs-chat-bg-url');
        if (el) el.value = e.target.result;
    };
    reader.readAsDataURL(file);
};

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
        document.getElementById('offline-streaming-toggle').checked = !!offlineConfig.streamingEnabled;
        // 【修复】回填文风字段
        const writingStyleEl = document.getElementById('offline-writing-style');
        if (writingStyleEl) writingStyleEl.value = offlineConfig.writingStyle || '';
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
    
    // 获取文件名（去除后缀），作为找不到名字时的兜底
    const fileName = file.name.replace(/\.[^/.]+$/, ""); 
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const json = JSON.parse(e.target.result);
            
            // 兼容酒馆原生的多种导出格式（数组、包装对象、单对象）
            let importedPresets = [];
            if (Array.isArray(json)) {
                importedPresets = json;
            } else if (json && typeof json === 'object') {
                if (Array.isArray(json.data)) {
                    importedPresets = json.data;
                } else {
                    // 放宽限制：只要是 JSON 对象，都尝试进行解析
                    importedPresets = [json];
                }
            } else {
                throw new Error("文件格式错误，应为 JSON 对象或数组");
            }
            
            // 规范化预设结构，深度兼容酒馆专用字段
            importedPresets = importedPresets.map(p => {
                if (!p.id) p.id = 'preset_' + Date.now() + '_' + Math.floor(Math.random()*10000);
                // 优先使用文件里的名字，没有就用文件名
                if (!p.name) p.name = p.name || fileName || 'Imported Preset';
                
                if (!p.regexScripts) p.regexScripts = [];
                
                // 1. 基础字段映射
                if (p.system_prompt && !p.systemPrompt) p.systemPrompt = p.system_prompt;
                if (p.description && !p.systemPrompt) p.systemPrompt = p.description;
                if (p.jailbreak_prompt && !p.jailbreak) p.jailbreak = p.jailbreak_prompt;
                if (p.post_history_instructions && !p.jailbreak) p.jailbreak = p.post_history_instructions;
                // 2. 特殊处理：SillyTavern 的多 Prompt 阵列格式
                if (p.prompts && Array.isArray(p.prompts)) {
                    let enabledPromptIds = [];
                    // 解析酒馆里的勾选状态
                    if (p.prompt_order && Array.isArray(p.prompt_order)) {
                        const globalOrder = p.prompt_order.find(o => o.character_id === 100000 || o.character_id === 100001) || p.prompt_order[0];
                        if (globalOrder && Array.isArray(globalOrder.order)) {
                            enabledPromptIds = globalOrder.order.filter(item => item.enabled !== false).map(item => item.identifier);
                        }
                    }
                    
                    p.prompts.forEach(pr => {
                        if (p.prompt_order) {
                            pr.enabled = enabledPromptIds.includes(pr.identifier);
                        } else {
                            pr.enabled = pr.enabled !== false;
                        }
                        // 兜底命名
                        if (!pr.name) pr.name = pr.identifier || "提示词片段";
                    });
                    
                    // 将启用的部分拼合成用于 AI 发送的实际 System Prompt
                    p.systemPrompt = p.prompts.filter(pr => pr.enabled).map(pr => pr.content).join('\n\n');
                    
                } else if (p.system_prompt || p.description || p.systemPrompt) {
                    // 兼容旧预设：转换为单一条目
                    let sp = p.systemPrompt || p.system_prompt || p.description;
                    p.prompts = [{
                        identifier: 'default_sys',
                        name: 'Main Prompt (主提示词)',
                        content: sp,
                        enabled: true
                    }];
                    p.systemPrompt = sp;
                } else {
                    p.prompts = [];
                }


                // 3. 提取正则表达式 (基础正则)
                if (p.regex && typeof p.regex === 'string') {
                    p.regexScripts.push({ regex: p.regex, flags: 'g', replace: '' });
                }
                if (Array.isArray(p.regexes)) {
                    p.regexScripts = [...p.regexScripts, ...p.regexes.map(r => ({
                        regex: r.regex || r.pattern || '', 
                        flags: r.flags || 'g', 
                        replace: r.replace || r.replacement || ''
                    }))];
                }

                // 4. 特殊处理：SillyTavern 嵌套在 extensions 里的 regex_scripts
                if (p.extensions && p.extensions.regex_scripts && Array.isArray(p.extensions.regex_scripts)) {
                    p.extensions.regex_scripts.forEach(r => {
                        if (r.disabled) return; // 忽略被禁用的正则
                        let pat = r.findRegex || '';
                        let flg = 'g';
                        // 酒馆导出的正则经常自带斜杠 /pattern/gi，需要剥离出来适配
                        const match = pat.match(/^\/(.*?)\/([a-z]*)$/i);
                        if (match) {
                            pat = match[1];
                            flg = match[2] || 'g';
                        }
                        p.regexScripts.push({
                            regex: pat,
                            flags: flg,
                            replace: r.replaceString || ''
                        });
                    });
                }

                return p;
            });

            // 合并或覆盖
            if(confirm(`识别到预设 [${importedPresets[0].name}]\n导入将追加到现有预设，点击【确定】追加，点击【取消】则清空旧预设只保留本次导入的。`)) {
                tavernPresets = [...tavernPresets, ...importedPresets];
            } else {
                tavernPresets = importedPresets;
            }
            // IDB.set returns a promise, but this is inside FileReader onload which is not async
            // We can just use an IIFE
            (async () => {
                await IDB.set(PRESETS_DATA_KEY, tavernPresets);
                renderPresetsList();
                alert("导入成功！");
            })();
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

    const escapeAttr = (str) => String(str || '')
        .replace(/&/g, '&')
        .replace(/"/g, '"')
        .replace(/</g, '<')
        .replace(/>/g, '>');

    (scripts || []).forEach((script, index) => {
        const div = document.createElement('div');
        div.className = 'regex-script-item';
        div.style.cssText = 'background:#fff; border:1px solid #ececec; border-radius:16px; padding:14px; box-shadow:0 2px 10px rgba(0,0,0,0.03); display:flex; flex-direction:column; gap:12px;';
        div.innerHTML = `
            <div class="regex-row" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="display:flex; align-items:center; gap:8px; min-width:0;">
                    <span style="font-size:10px; color:#999; letter-spacing:1px; font-weight:700; text-transform:uppercase;">Regex Script</span>
                    <span style="font-size:12px; color:#222; font-weight:700;">#${index + 1}</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                    <div style="display:flex; align-items:center; gap:6px; background:#f6f6f6; border:1px solid #ececec; border-radius:999px; padding:4px 10px;">
                        <span style="font-size:10px; color:#999; letter-spacing:0.8px; font-weight:700; text-transform:uppercase;">Flags</span>
                        <input type="text" class="regex-flags r-flags" placeholder="g" value="${escapeAttr(script.flags || 'g')}" style="width:36px; border:none; background:transparent; outline:none; font-size:12px; color:#222; font-weight:700; padding:0; text-align:center;">
                    </div>
                    <i class="fas fa-trash btn-del-regex" onclick="this.closest('.regex-script-item').remove()" style="width:30px; height:30px; border-radius:10px; background:#f8f8f8; border:1px solid #ececec; color:#999; display:flex; align-items:center; justify-content:center; cursor:pointer;" title="删除正则"></i>
                </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
                <div style="font-size:10px; color:#999; letter-spacing:1px; font-weight:700; text-transform:uppercase;">Find Regex</div>
                <textarea class="regex-input r-pattern" rows="3" placeholder="输入要匹配的正则，例如：\\(.*?\\)" style="width:100%; border:1px solid #e9e9e9; border-radius:12px; background:#fafafa; padding:12px; font-size:13px; line-height:1.6; color:#333; resize:vertical; outline:none; box-sizing:border-box; font-family:Consolas, Monaco, monospace;">${escapeAttr(script.regex || '')}</textarea>
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
                <div style="font-size:10px; color:#999; letter-spacing:1px; font-weight:700; text-transform:uppercase;">Replace String</div>
                <textarea class="regex-input r-replace" rows="2" placeholder="替换内容；留空表示删除匹配文本" style="width:100%; border:1px solid #e9e9e9; border-radius:12px; background:#fafafa; padding:12px; font-size:13px; line-height:1.6; color:#333; resize:vertical; outline:none; box-sizing:border-box; font-family:Consolas, Monaco, monospace;">${escapeAttr(script.replace || '')}</textarea>
            </div>
        `;
        container.appendChild(div);
    });
}

// 添加新脚本空行
window.addRegexScriptItem = function() {
    const container = document.getElementById('pe-regex-container');
    const index = container.querySelectorAll('.regex-script-item').length + 1;
    const div = document.createElement('div');
    div.className = 'regex-script-item';
    div.style.cssText = 'background:#fff; border:1px solid #ececec; border-radius:16px; padding:14px; box-shadow:0 2px 10px rgba(0,0,0,0.03); display:flex; flex-direction:column; gap:12px;';
    div.innerHTML = `
        <div class="regex-row" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <div style="display:flex; align-items:center; gap:8px; min-width:0;">
                <span style="font-size:10px; color:#999; letter-spacing:1px; font-weight:700; text-transform:uppercase;">Regex Script</span>
                <span style="font-size:12px; color:#222; font-weight:700;">#${index}</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                <div style="display:flex; align-items:center; gap:6px; background:#f6f6f6; border:1px solid #ececec; border-radius:999px; padding:4px 10px;">
                    <span style="font-size:10px; color:#999; letter-spacing:0.8px; font-weight:700; text-transform:uppercase;">Flags</span>
                    <input type="text" class="regex-flags r-flags" placeholder="g" value="g" style="width:36px; border:none; background:transparent; outline:none; font-size:12px; color:#222; font-weight:700; padding:0; text-align:center;">
                </div>
                <i class="fas fa-trash btn-del-regex" onclick="this.closest('.regex-script-item').remove()" style="width:30px; height:30px; border-radius:10px; background:#f8f8f8; border:1px solid #ececec; color:#999; display:flex; align-items:center; justify-content:center; cursor:pointer;" title="删除正则"></i>
            </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px;">
            <div style="font-size:10px; color:#999; letter-spacing:1px; font-weight:700; text-transform:uppercase;">Find Regex</div>
            <textarea class="regex-input r-pattern" rows="3" placeholder="输入要匹配的正则，例如：\\(.*?\\)" style="width:100%; border:1px solid #e9e9e9; border-radius:12px; background:#fafafa; padding:12px; font-size:13px; line-height:1.6; color:#333; resize:vertical; outline:none; box-sizing:border-box; font-family:Consolas, Monaco, monospace;"></textarea>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px;">
            <div style="font-size:10px; color:#999; letter-spacing:1px; font-weight:700; text-transform:uppercase;">Replace String</div>
            <textarea class="regex-input r-replace" rows="2" placeholder="替换内容；留空表示删除匹配文本" style="width:100%; border:1px solid #e9e9e9; border-radius:12px; background:#fafafa; padding:12px; font-size:13px; line-height:1.6; color:#333; resize:vertical; outline:none; box-sizing:border-box; font-family:Consolas, Monaco, monospace;"></textarea>
        </div>
    `;
    container.appendChild(div);
}

// 应用正则脚本
window.applyRegexScripts = function(text, scripts) {
    if (!text || !scripts || !scripts.length) return text;
    let result = text;
    scripts.forEach(s => {
        if (!s.regex) return;
        try {
            const reg = new RegExp(s.regex, s.flags || 'g');
            // 支持 \n 等转义字符在替换文本里的映射
            let rText = s.replace || '';
            rText = rText.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
            result = result.replace(reg, rText);
        } catch (e) {
            console.error("Regex Script Error:", e);
        }
    });
    return result;
}

// === 新增：渲染多条目提示词列表 ===
window.renderPresetPromptsList = function(prompts) {
    const container = document.getElementById('pe-prompts-container');
    if (!container) return;
    container.innerHTML = '';
    
    (prompts || []).forEach((pr, index) => {
        const div = document.createElement('div');
        div.className = 'preset-prompt-item';
        const checkedStr = pr.enabled ? 'checked' : '';
        div.innerHTML = `
            <div class="preset-prompt-header">
                <input type="checkbox" class="p-enabled" ${checkedStr} style="margin-right:8px; accent-color:#111;" title="启用/禁用">
                <input type="text" class="p-name preset-prompt-title" placeholder="名称 (如: NSFW, 核心设定)" value="${pr.name || ''}">
                <i class="fas fa-trash btn-del-regex" onclick="this.closest('.preset-prompt-item').remove()" style="margin-left:8px;" title="删除条目"></i>
            </div>
            <textarea class="p-content" rows="4" style="width: 100%; border: 1px solid #ddd; border-radius: 6px; padding: 10px; font-size: 13px; line-height: 1.5; resize: vertical; outline: none; box-sizing: border-box; background: transparent; color: #444;" placeholder="提示词内容...">${pr.content || ''}</textarea>
        `;
        container.appendChild(div);
    });
}

// === 新增：添加空白提示词条目 ===
window.addPresetPromptItem = function() {
    const container = document.getElementById('pe-prompts-container');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'preset-prompt-item';
    div.innerHTML = `
        <div class="preset-prompt-header">
            <input type="checkbox" class="p-enabled" checked style="margin-right:8px; accent-color:#111;">
            <input type="text" class="p-name preset-prompt-title" placeholder="名称 (如: New Prompt)" value="新附加提示词">
            <i class="fas fa-trash btn-del-regex" onclick="this.closest('.preset-prompt-item').remove()" style="margin-left:8px;"></i>
        </div>
        <textarea class="p-content" rows="4" style="width: 100%; border: 1px solid #ddd; border-radius: 6px; padding: 10px; font-size: 13px; line-height: 1.5; resize: vertical; outline: none; box-sizing: border-box; background: transparent; color: #444;" placeholder="输入新的系统提示词..."></textarea>
    `;
    container.appendChild(div);
}

// 切换预设编辑器的 Tab
window.switchPresetEditorTab = function(tabName) {
    const tabBasic = document.getElementById('pe-tab-basic');
    const tabRegex = document.getElementById('pe-tab-regex');
    const contentBasic = document.getElementById('pe-content-basic');
    const contentRegex = document.getElementById('pe-content-regex');

    if (tabBasic) {
        tabBasic.style.background = tabName === 'basic' ? '#fafafa' : '#f0f0f0';
        tabBasic.style.color = tabName === 'basic' ? '#222' : '#888';
        tabBasic.style.borderBottom = tabName === 'basic' ? '1px solid #fafafa' : '1px solid #ebebeb';
        tabBasic.style.zIndex = tabName === 'basic' ? '2' : '1';
    }
    if (tabRegex) {
        tabRegex.style.background = tabName === 'regex' ? '#fafafa' : '#f0f0f0';
        tabRegex.style.color = tabName === 'regex' ? '#222' : '#888';
        tabRegex.style.borderBottom = tabName === 'regex' ? '1px solid #fafafa' : '1px solid #ebebeb';
        tabRegex.style.zIndex = tabName === 'regex' ? '2' : '1';
    }

    if (contentBasic) contentBasic.style.display = tabName === 'basic' ? 'block' : 'none';
    if (contentRegex) contentRegex.style.display = tabName === 'regex' ? 'block' : 'none';
}

// 修改 openPresetEditor 以支持正则列表和多提示词渲染
window.openPresetEditor = function(id) {
    let listPane = document.getElementById('preset-list-pane');
    let editorPane = document.getElementById('preset-editor-pane');
    if (listPane) listPane.style.display = 'none';
    if (editorPane) editorPane.style.display = 'flex';
    currentEditingPresetId = id;
    
    let p;
    if(id) {
        p = tavernPresets.find(x => x.id === id);
        document.getElementById('pe-name').value = p.name || '';
        document.getElementById('pe-jailbreak').value = p.jailbreak || '';
        
        // 兼容没有 prompts 数组的旧版配置
        if (!p.prompts && p.systemPrompt) {
            p.prompts = [{ name: 'Main Prompt (主提示词)', content: p.systemPrompt, enabled: true }];
        }
    } else {
        p = { regexScripts: [], prompts: [] };
        document.getElementById('pe-name').value = '';
        document.getElementById('pe-jailbreak').value = '';
    }
    
    // 渲染列表
    renderPresetPromptsList(p.prompts || []);
    renderRegexList(p.regexScripts || []);
    
    // 默认切换到基础预设 Tab
    switchPresetEditorTab('basic');
}

// 修改 savePresetEditor 以保存正则列表和多提示词
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

    // 2. 收集多条目提示词 (Prompts) 数据
    const promptEls = document.querySelectorAll('.preset-prompt-item');
    const prompts = [];
    promptEls.forEach(el => {
        const enabled = el.querySelector('.p-enabled').checked;
        const name = el.querySelector('.p-name').value;
        const content = el.querySelector('.p-content').value;
        if (content || name) {
            prompts.push({ 
                name: name || '未命名片段', 
                content: content, 
                enabled: enabled, 
                identifier: 'p_' + Math.random().toString(36).substr(2, 6) 
            });
        }
    });

    const name = document.getElementById('pe-name').value;
    const jail = document.getElementById('pe-jailbreak').value;
    
    if(!name) return alert('请给预设起个名字！');

    // 把被勾选启用的提示词拼合起来作为最终传输的系统提示词
    let finalSystemPrompt = prompts.filter(pr => pr.enabled).map(pr => pr.content).join('\n\n');

    if (currentEditingPresetId) {
        const p = tavernPresets.find(x => x.id === currentEditingPresetId);
        p.name = name; 
        p.systemPrompt = finalSystemPrompt; 
        p.prompts = prompts;
        p.jailbreak = jail;
        p.regexScripts = scripts;
    } else {
        const newP = {
            id: 'pre_' + Date.now(),
            name: name,
            systemPrompt: finalSystemPrompt,
            prompts: prompts,
            jailbreak: jail,
            regexScripts: scripts
        };
        tavernPresets.push(newP);
    }
    
    // 保存数据
    localStorage.setItem(PRESETS_DATA_KEY, JSON.stringify(tavernPresets));
    if (typeof IDB !== 'undefined') IDB.set(PRESETS_DATA_KEY, tavernPresets); 
    
    renderPresetsList();
    closePresetEditor();
}

// =========================================
// [新增] 线下模式：重回与动画逻辑补丁
// =========================================

// 1. 线下模式重回 (和酒馆一样)
window.regenerateOfflineMessage = async function(msgId) {
    if (!msgId) return;

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
        }
    }

    // C. 清理输入框，直接触发重新生成
    document.getElementById('offline-input').value = '';
    await sendOfflineMessage(true);
}

window.closeRegenModal = function() {
    document.getElementById('offline-regen-modal')?.classList.remove('active');
    pendingRegenMsgId = null;
}

window.confirmRegenAction = async function() {}
async function triggerOfflineRetry() {}

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
// 线上模式重回 (和酒馆一样)
async function performOnlineRegen(rowElement) {
    if (!rowElement || !currentChatId) return;

    // 删除当前行及后续DOM
    let node = rowElement;
    while (node) {
        const next = node.nextElementSibling;
        node.remove();
        node = next;
    }

    // 根据当前DOM重建历史
    await rebuildHistoryFromChatDom(currentChatId);

    // 重新触发AI回复 (不附加新的用户消息)
    const aiBtn = document.getElementById('triggerAiReply');
    if (aiBtn) {
        aiBtn.classList.add('processing');
        aiBtn.classList.remove('fa-star');
        aiBtn.classList.add('fa-stop-circle');
        aiBtn.style.color = '#ff4444';
    }
    sendMessageToAI('').finally(() => {
        if (aiBtn) {
            aiBtn.classList.remove('processing');
            aiBtn.classList.remove('fa-stop-circle');
            aiBtn.classList.add('fa-star');
            aiBtn.style.color = '';
        }
    });
}

async function rebuildHistoryFromChatDom(chatId) {
    const rows = Array.from(document.querySelectorAll('#chatMessages .chat-row'));
    const rebuilt = rows.map(r => {
        let type = 'received';
        if (r.classList.contains('sent')) type = 'sent';
        if (r.classList.contains('system')) type = 'system';
        
        const text = r.getAttribute('data-msg-text') ||
                     r.querySelector('.bubble-content-main')?.innerText || 
                     r.querySelector('.msg-system-greeting')?.innerText || '';
        const translation = r.querySelector('.bubble-translation')?.innerText || null;
        const senderName = r.getAttribute('data-msg-sender') || (type === 'sent' ? 'ME' : currentChatId);
        const customAvatar = type === 'received' ? (r.querySelector('.chat-avatar-img')?.src || '') : '';
        // 核心修复：找回原来的 ID，丢了 ID 就删不掉了
        const msgId = r.getAttribute('data-msg-id') || ('msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));

        return {
            id: msgId,
            text,
            type,
            senderName,
            customAvatar,
            translation,
            timestamp: Date.now()
        };
    });

    await IDB.set(scopedChatKey(chatId), rebuilt);
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

    switchSoftDisplays(
        [
            { key: 'fake', el: document.getElementById('voice-panel-fake'), display: 'block' },
            { key: 'real', el: document.getElementById('voice-panel-real'), display: 'flex' }
        ],
        tab
    );

    if (tab === 'fake') {
        document.getElementById('tab-btn-fake-voice').classList.add('active');
    } else {
        document.getElementById('tab-btn-real-voice').classList.add('active');
    }
}

// 4. 伪语音发送事件
window.sendFakeVoice = function() {
    const text = document.getElementById('fake-voice-input').value.trim();
    if (text) {
        appendTypedVoiceBubble(text);
        if (currentChatId) {
            // 【关键修改】：存入历史记录时，前面加上 [VOICE]
            saveMessageToHistory(currentChatId, { text: '[VOICE]' + text, type: 'sent', senderName: 'ME' });
            // 触发 AI 回复
            sendMessageToAI('[VOICE]' + text);
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

    recognizedText = "";

    // ── APK 原生路径：使用 Android SpeechRecognizer，免费无需任何 API Key ──
    const _isAndroidApp = !!(window.AndroidBridge);
    if (_isAndroidApp) {
        btn.classList.add('recording');
        btn.innerHTML = `<i class="fas fa-microphone-alt" style="font-size:28px;"></i><span>识别中...</span>`;

        // 定义回调：识别结果返回时由 Java 层调用此函数
        window.__nativeSpeechCb = async function(text) {
            // 恢复按钮 UI
            if (btn) {
                btn.classList.remove('recording');
                btn.innerHTML = `<i class="fas fa-microphone" style="font-size:28px; color:#555;"></i><span style="color:#333;">按住说话</span>`;
            }

            closeVoiceActionModal();
            document.getElementById('chat-extra-panels').classList.remove('open');

            const voiceText = (text || '').trim();
            const sec = Math.max(1, Math.ceil(voiceText.length / 4) || 3);

            // 上屏语音气泡
            const chatMessages = document.getElementById('chatMessages');
            const uniqueId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            const row = document.createElement('div');
            row.className = 'chat-row sent';
            row.setAttribute('data-msg-text', '[VOICE]' + voiceText);
            row.setAttribute('data-msg-sender', 'ME');
            row.setAttribute('data-msg-id', uniqueId);

            const _avatar = document.createElement('img');
            _avatar.className = 'chat-avatar-img';
            _avatar.src = AVATAR_USER;

            const _bubble = document.createElement('div');
            _bubble.className = 'message-bubble sent';
            _bubble.innerHTML = `
              <div class="msg-voice-bar" onclick="this.nextElementSibling.classList.toggle('show')">
                <div class="msg-voice-duration">${sec}"</div>
                <i class="fas fa-rss msg-voice-icon" style="transform: rotate(45deg);"></i>
              </div>
              <div class="msg-voice-transcript show">${voiceText || '（未识别到文字）'}</div>
            `;

            attachBubbleMenuToCustomRow(_bubble, row, uniqueId, '[VOICE]' + voiceText, 'sent');
            row.appendChild(_bubble);
            row.appendChild(_avatar);
            chatMessages.appendChild(row);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            if (currentChatId) {
                await saveMessageToHistory(currentChatId, {
                    id: uniqueId,
                    text: '[VOICE]' + voiceText,
                    type: 'sent',
                    senderName: 'ME'
                });
                // 触发 AI 回复（sendMessageToAI 会自动把 [VOICE]text 转译为语音上下文）
                sendMessageToAI('[VOICE]' + voiceText);
            }
        };

        // 启动原生语音识别（麦克风由 SpeechRecognizer 接管）
        window.AndroidBridge.startNativeSpeechRecognition('window.__nativeSpeechCb');
        return;
    }

    // ── 浏览器路径（原有逻辑，PC/Chrome 等） ──
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
            nativeRecognition.lang = 'zh-CN';
            nativeRecognition.continuous = true;
            nativeRecognition.interimResults = true;

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

        btn.classList.add('recording');
        btn.innerHTML = `<i class="fas fa-microphone-alt" style="font-size:28px;"></i><span>录音中...</span>`;
    } catch (e) {
        alert('麦克风权限失败或被拒绝：' + e.message);
    }
}

async function stopHoldRecord() {
    const btn = document.getElementById('modalHoldToTalkBtn');

    // ── APK 原生路径：停止识别，Java 层会自动触发 window.__nativeSpeechCb 回调 ──
    const _isAndroidApp = !!(window.AndroidBridge);
    if (_isAndroidApp) {
        if (btn) {
            btn.classList.remove('recording');
            btn.innerHTML = `<i class="fas fa-microphone" style="font-size:28px; color:#555;"></i><span style="color:#333;">按住说话</span>`;
        }
        window.AndroidBridge.stopNativeSpeechRecognition();
        return;
    }

    // ── 浏览器路径（原有逻辑） ──
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

        closeVoiceActionModal();
        document.getElementById('chat-extra-panels').classList.remove('open');

        appendRealVoiceBubble(blob, sec);

        await new Promise(resolve => setTimeout(resolve, 500));

        let text = recognizedText.trim();

        if (!text) {
            if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) {
                text = "（当前浏览器不支持原生识别，请使用Chrome/Edge）";
            }
        }

        const all = document.querySelectorAll('.msg-voice-transcript');
        if (all.length) {
            all[all.length - 1].innerHTML = text || '（未识别到文字，可能是没有出声）';
        }

        if (currentChatId) {
            await saveMessageToHistory(currentChatId, {
                text: '[VOICE]' + (text || '（未识别到文字）'),
                type: 'sent',
                senderName: 'ME'
            });
            // 触发 AI 回复
            sendMessageToAI('[VOICE]' + (text || '（未识别到文字）'));
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

    if (confirm(`⚠️ 警告！\n\n你确定要清空与 "${friendName}" 的所有聊天记录吗？\n\n聊天记录、剧情总结、关系进度、好感度等 AI 记忆将全部清除，此操作不可恢复。`)) {
        try {
            // 1. 从 IndexedDB 中删除聊天记录
            await IDB.delete(scopedChatKey(currentChatId));

            // 2. 清除 AI 的所有记忆数据（剧情总结、关系进度、好感度、心声状态）
            if (friend) {
                friend.summaries = [];
                friend.relationshipLog = [];
                delete friend.affection;
                // 重置心声状态为默认值
                friend.mindState = {
                    action: "正在发呆",
                    location: "未知地点",
                    weather: "晴",
                    murmur: "我还没想好要说什么。不过我在看着你。也在等你继续靠近一点。",
                    kaomoji: "( ˙W˙ )",
                    bgm: "No BGM"
                };
                await saveFriendsData();

                // 刷新心声卡片 UI（如果当前是打开的）
                const mindCard = document.getElementById('mind-card-overlay');
                if (mindCard && mindCard.classList.contains('active')) {
                    refreshMindCardUI(currentChatId, false);
                }
                // 刷新好感度进度条
                updateAffectionUI(0);
            }

            // 3. 清空聊天界面UI
            const chatMessages = document.getElementById('chatMessages');
            if (chatMessages) {
                chatMessages.innerHTML = '';
            }

            // 4. 更新好友列表的最后消息预览
            const chatListItem = document.querySelector(`.wc-chat-item[data-chat-id="${currentChatId}"]`);
            if (chatListItem) {
                const previewEl = chatListItem.querySelector('.wc-msg-preview');
                if (previewEl) {
                    previewEl.innerText = "聊天记录已清空";
                }
            }

            alert(`与 "${friendName}" 的聊天记录及 AI 记忆已成功清空！`);

            // 5. 关闭设置页面，留在聊天窗口，让用户看到清空后的效果
            closeChatSettingsPage();

            // 6. 显示开场白（如果有）
            const greeting = getEffectiveGreeting(friend);
            if (greeting) {
                appendMessage(greeting, 'system', friend.avatar, friend.remark || friend.realName);
                await saveMessageToHistory(currentChatId, {
                    text: greeting,
                    type: 'system',
                    senderName: (friend.remark || friend.realName),
                    customAvatar: friend.avatar
                });
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

window.openSummaryPage = async function() {
    if (!currentChatId) {
        alert("请先进入一个聊天。");
        return;
    }
    
    // 👇 新加的两行：打开总结页时，自动收起聊天框下面的加号面板
    const panel = document.getElementById('chat-extra-panels');
    if (panel) panel.classList.remove('open');
    
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
ensureFriendSummaryFields(friend);
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

// 辅助函数：创建高定版的可编辑项
function createEditableItem(index, text, type, startTurn = null, endTurn = null) {
    const item = document.createElement('div');
    item.className = 'sk-memory-item'; 
    
    let badgeHtml = '';
    if (type === 'summary' && startTurn !== null && endTurn !== null) {
        let label = startTurn === "All" ? "宏观大串联" : `Turn ${startTurn} - ${endTurn}`;
        badgeHtml = `<div class="sk-memory-badge">${label}</div>`;
    } else if (type === 'relationship') {
        badgeHtml = `<div class="sk-memory-badge" style="background:#ff7e67;">重大事件</div>`;
    }

    item.innerHTML = `
        ${badgeHtml}
        <textarea class="sk-memory-textarea" spellcheck="false">${text}</textarea>
        <div class="sk-memory-actions">
            <i class="fas fa-save" title="保存修改" onclick="saveItem(${index}, '${type}', this)"></i>
            <i class="fas fa-trash" title="删除" onclick="deleteItem(${index}, '${type}', this)"></i>
        </div>
    `;
    return item;
}

// 3. 各种保存/添加/删除 操作
window.saveSummaryConfig = function() {
    if (!friendsData[currentChatId]) friendsData[currentChatId] = {};
ensureFriendSummaryFields(friendsData[currentChatId]);


    friendsData[currentChatId].summaryConfig.turnCount = document.getElementById('summary-turn-count').value;
    friendsData[currentChatId].summaryConfig.wordCount = document.getElementById('summary-word-count').value;
    friendsData[currentChatId].summaryConfig.prompt = document.getElementById('summary-prompt').value;
    
    saveFriendsData();
}

window.saveItem = function(index, type, buttonEl) {
    const friend = friendsData[currentChatId];
    // 这里因为 HTML 类名变了，所以匹配的类名也要改成新的
    const itemEl = buttonEl.closest('.sk-memory-item');
    const newText = itemEl.querySelector('.sk-memory-textarea').value;

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

    await executeSummaryProcess(currentChatId, messagesToSummarize, start, end);


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

    await executeSummaryProcess(currentChatId, messagesToSummarize, start, end);


    btn.innerHTML = '<i class="fas fa-bolt"></i> 一键总结最新未总结部分';
    btn.style.pointerEvents = 'auto';
}

// C. 后台自动触发总结 (修改为带有轮数标记)
window.generateAutoSummary = async function(chatId, messagesToSummarize, startTurn = null, endTurn = null) {
    if (!chatId || !Array.isArray(messagesToSummarize) || messagesToSummarize.length === 0) return;

    const history = await loadChatHistory(chatId);
    const end = endTurn || history.length;
    const start = startTurn || (end - messagesToSummarize.length + 1);

    await executeSummaryProcess(chatId, messagesToSummarize, start, end);
}


// 核心执行逻辑 (组装文本、发送请求、保存)
async function executeSummaryProcess(chatId, messagesArr, startTurn, endTurn) {
    const friend = friendsData[chatId];
    if (!friend) return;

    ensureFriendSummaryFields(friend);

    const config = friend.summaryConfig || {};
    const basePrompt = config.prompt || `请以角色 ${friend.realName} 的第一人称视角，用简练的日记体总结这段时间内发生的事情。`;
    const wordCount = config.wordCount || 200;

    const contentToSummarize = messagesArr.map(m => {
        let text = m.text;
        if (m.isOffline) text = `(剧情/动作: ${text})`;
        return `${m.senderName === 'ME' ? '我(User)' : m.senderName}: ${text}`;
    }).join('\n');

    const finalPrompt = `${basePrompt}\n要求字数控制在 ${wordCount} 字左右。\n请直接输出总结正文，不要加引号或解释。\n\n[需要总结的历史记录如下]：\n${contentToSummarize}`;

    const summaryText = await callAiForSpecialTask(finalPrompt);

    if (summaryText) {
        friend.summaries.push({
            text: summaryText,
            timestamp: Date.now(),
            startTurn: startTurn,
            endTurn: endTurn
        });

        await saveFriendsData();

        if (document.getElementById('summaryPageView').classList.contains('show') && currentChatId === chatId) {
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

/* =================================================================
   [核心逻辑修复] 多身份系统 (已切换至 IDB 大容量存储)
   ================================================================= */

const PERSONA_META_KEY = 'myCoolPhone_personaMeta';
const CURRENT_PERSONA_KEY = 'myCoolPhone_currentPersonaId';

let personasMeta = {};
let currentPersonaId = 'p_default';

// 1. 初始化系统 (改为异步加载，从 IDB 读取，增加容错)
async function initPersonaSystem() {
    let data = null;
    try {
        // 尝试从大仓库 IDB 获取
        data = await IDB.get(PERSONA_META_KEY);
    } catch (e) {
        console.warn("IndexedDB 读取失败 (可能受限于微信或无痕模式)，将使用默认或缓存数据:", e);
    }

    // 如果 IDB 里没数据，试试看是不是还在 LocalStorage 里 (迁移旧数据)
    if (!data) {
        const oldData = localStorage.getItem(PERSONA_META_KEY);
        if (oldData) {
            try {
                data = JSON.parse(oldData);
                try { await IDB.set(PERSONA_META_KEY, data); } catch (e) {} // 搬家到大仓库
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
        try { await IDB.set(PERSONA_META_KEY, data); } catch (e) {}
    }
    
    personasMeta = data;

    // 读取当前是谁 (ID 很短，存 LocalStorage 没问题)
    currentPersonaId = localStorage.getItem(CURRENT_PERSONA_KEY) || 'p_default';
    if (!personasMeta[currentPersonaId]) {
        currentPersonaId = Object.keys(personasMeta)[0] || 'p_default';
    }
    
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
/* ===== [重构] 纯净版身份切换逻辑 ===== */

window.openIdentityModal = function(e) {
    if(e) e.stopPropagation();
    const modal = document.getElementById('identity-modal');
    if (!modal) return;
    
    const sel = document.getElementById('identity-select');
    sel.innerHTML = '';
    Object.values(personasMeta).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name || '未命名';
        if (p.id === currentPersonaId) opt.selected = true;
        sel.appendChild(opt);
    });

    updateIdPreviewOnly(currentPersonaId);
    modal.classList.add('active');
};

window.updateIdPreviewOnly = function(id) {
    const p = personasMeta[id];
    if (p) document.getElementById('id-preview-img').src = p.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`;
};

window.closeIdentityModal = function() {
    document.getElementById('identity-modal').classList.remove('active');
};

window.quickCreateIdentity = async function() {
    const id = 'p_' + Date.now();
    personasMeta[id] = {
        id: id, name: '新身份', gender: '未知',
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`,
        persona: '', // 这是最终喂给AI的合并版文字
        pbData: {}   // 这里用来存生成器填写的碎片化数据
    };
    await IDB.set(PERSONA_META_KEY, personasMeta);
    
    // 直接切换并打开生成器让他填
    currentPersonaId = id;
    localStorage.setItem(CURRENT_PERSONA_KEY, id);
    closeIdentityModal();
    applyPersonaToUI();
    
        setTimeout(() => {
        if(typeof openPersonaBuilder === 'function') openPersonaBuilder();
        if(typeof loadDataIntoBuilder === 'function') loadDataIntoBuilder();
    }, 100);
};

window.quickSwitchIdentity = async function() {
    const sel = document.getElementById('identity-select');
    if (!sel || !personasMeta[sel.value]) return;

    currentPersonaId = sel.value;
    localStorage.setItem(CURRENT_PERSONA_KEY, currentPersonaId);
    closeIdentityModal();

    // 刷新界面和聊天数据
    const chatLayer = document.getElementById('chatLayer');
    if (chatLayer) chatLayer.classList.remove('show');
    document.getElementById('chatMessages').innerHTML = '';
    
    friendsData = {}; 
    momentsFeed = [];
    groupsData = {};
    document.querySelectorAll('.wc-chat-item').forEach(el => el.remove()); // 清理旧聊天列表
    await loadFriendsData();
    if (typeof loadGroupsData === 'function') await loadGroupsData();
    loadMomentsFeed();
    applyPersonaToUI();
      if (document.getElementById('personaBuilderApp') && document.getElementById('personaBuilderApp').classList.contains('open')) {
        if(typeof loadDataIntoBuilder === 'function') loadDataIntoBuilder();
    }
    showToast("身份已切换为: " + personasMeta[currentPersonaId].name);
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
// === [新增] AI 失败弹窗（不写进聊天气泡） ===
window.showAiErrorModal = function(reason, detail = '') {
  const modal = document.getElementById('ai-error-modal');
  const reasonEl = document.getElementById('ai-error-reason');
  const detailEl = document.getElementById('ai-error-detail');
  const titleEl = document.getElementById('ai-error-title');

  // 如果你还没加 HTML，兜底用 toast/alert
  if (!modal || !reasonEl || !detailEl) {
    if (typeof showToast === 'function') showToast(`生成失败：${reason}`);
    else alert(`生成失败：${reason}\n${detail || ''}`);
    return;
  }

  if (titleEl) titleEl.innerText = '生成失败';
  reasonEl.innerText = reason || '未知错误';
  detailEl.innerText = (detail || '').toString();

  modal.classList.add('active');
};

window.closeAiErrorModal = function() {
  const modal = document.getElementById('ai-error-modal');
  if (modal) modal.classList.remove('active');
};

window.copyAiError = async function() {
  const reason = document.getElementById('ai-error-reason')?.innerText || '';
  const detail = document.getElementById('ai-error-detail')?.innerText || '';
  const text = `[原因]\n${reason}\n\n[详情]\n${detail}`.trim();

  try {
    await navigator.clipboard.writeText(text);
    if (typeof showToast === 'function') showToast('已复制错误信息');
  } catch (e) {
    alert(text);
  }
};

/* ====================================================
   [更新] 主页/P3/P4 自定义内容保存与恢复逻辑
   ==================================================== */

// 1. 页面加载时恢复所有图片和文字
function restoreHomeCustom() {
    let cfg = {};
    try {
        cfg = JSON.parse(localStorage.getItem(HOME_CUSTOM_KEY) || '{}');
    } catch (e) {
        console.warn("Failed to parse home custom config:", e);
    }
    if (!cfg || Object.keys(cfg).length === 0) return;

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
    let cfg = {};
    try {
        cfg = JSON.parse(localStorage.getItem(HOME_CUSTOM_KEY) || '{}');
    } catch (e) {
        console.warn("Failed to parse home custom config:", e);
    }
    
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
                try {
                    const currentCfg = JSON.parse(localStorage.getItem(HOME_CUSTOM_KEY) || '{}');
                    currentCfg[item.key] = el.innerText.trim(); // 存入 key
                    localStorage.setItem(HOME_CUSTOM_KEY, JSON.stringify(currentCfg));
                    console.log(`Saved ${item.key}: ${el.innerText}`);
                } catch (e) {
                    console.warn(`Failed to save ${item.key}:`, e);
                    if (typeof showToast === 'function') {
                        showToast('存储空间已满，无法保存主页文字。建议清理缓存。');
                    } else {
                        alert('存储空间已满，无法保存主页文字。');
                    }
                }
            });
        }
    });
}

// 3. 图片保存逻辑 (无需修改，确保 applyImage 调用它即可)
function saveHomeImage(el, imgSrc) {
    const key = el.dataset.editKey; // 获取 data-edit-key
    if (!key) return;

    try {
        const cfg = JSON.parse(localStorage.getItem(HOME_CUSTOM_KEY) || '{}');
        cfg[key] = imgSrc;
        localStorage.setItem(HOME_CUSTOM_KEY, JSON.stringify(cfg));
        console.log(`Saved Image Key: ${key}`);
    } catch (e) {
        console.warn(`Failed to save image ${key}:`, e);
        if (typeof showToast === 'function') {
            showToast('存储空间已满，无法保存该图片。建议清理缓存。');
        } else {
            alert('存储空间已满，无法保存该图片。');
        }
    }
}


/* =================================================================
   [全新子系统] 全局与专属 AI 表情包收纳管理引擎 (V1.0)
   ================================================================= */
const STICKERS_DB_KEY = 'myCoolPhone_stickersDB';
window.allStickers = []; 

// 1. 初始化时加载数据
async function loadStickersData() {
    let data = await IDB.get(STICKERS_DB_KEY);
    window.allStickers = data || [];
}
async function saveStickersData() {
    await IDB.set(STICKERS_DB_KEY, window.allStickers);
}

// 确保在页面加载时调用
document.addEventListener('DOMContentLoaded', async () => {
    await loadStickersData();
});

// 2. 全新滑入式全屏 UI 控制
window.openStickerManager = function() {
    document.getElementById('stickerManagerPage').classList.add('show');
    switchStickerTab('import');
}
window.closeStickerManager = function() {
    document.getElementById('stickerManagerPage').classList.remove('show');
    // 如果是从聊天设置里打开的，关闭时顺便刷新一下设置页的复选框
    if(document.getElementById('chatSettingsPage').classList.contains('show')){
        renderChatSettingsStickerCheckboxes();
    }
}
window.switchStickerTab = function(tab) {
    document.getElementById('tab-btn-sm-import').classList.remove('active');
    document.getElementById('tab-btn-sm-category').classList.remove('active');

    switchSoftDisplays(
        [
            { key: 'import', el: document.getElementById('sm-tab-import'), display: 'flex' },
            { key: 'category', el: document.getElementById('sm-tab-category'), display: 'block' }
        ],
        tab
    );
    
    document.getElementById(`tab-btn-sm-${tab}`).classList.add('active');
    
    if (tab === 'category') {
        renderStickerManagerGrid();
    }
}


// ================= 模块 A：本地多图片批量命名导入 =================
window.stickerUploadQueue = [];

window.handleStickerLocalUpload = function(input) {
    if(!input.files || input.files.length === 0) return;
    window.stickerUploadQueue = Array.from(input.files);
    
    // 显示批量命名弹窗
    document.getElementById('slp-count').innerText = window.stickerUploadQueue.length;
    document.getElementById('slp-group-name').value = '';
    document.getElementById('sticker-local-preview-modal').classList.add('active');
    
    input.value = ''; // 清空 input 允许重选
}

window.slpCancelBatch = function() {
    window.stickerUploadQueue = [];
    document.getElementById('sticker-local-preview-modal').classList.remove('active');
}

window.slpConfirmBatch = function() {
    const groupName = document.getElementById('slp-group-name').value.trim() || '未命名表情组';
    const scope = document.getElementById('slp-scope').value;
    const ownerId = scope === 'exclusive' ? currentChatId : null;

    let processedCount = 0;
    
    window.stickerUploadQueue.forEach(file => {
        const reader = new FileReader();
        reader.onload = function(e) {
            let defaultName = file.name.replace(/\.[^/.]+$/, ""); // 用原文件名作为表情名
            window.allStickers.push({
                id: 'stk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                name: defaultName,
                url: e.target.result,
                category: groupName,
                scope: scope,
                owner: ownerId
            });
            processedCount++;
            
                        // 等所有图片读取完成
            if (processedCount === window.stickerUploadQueue.length) {
                saveStickersData();
                alert(`成功导入 ${processedCount} 个表情到 [${groupName}]`);
                document.getElementById('sticker-local-preview-modal').classList.remove('active');
                renderStickerManagerGrid();
                switchStickerTab('category');
                window.stickerUploadQueue = [];
                refreshEmojiPanels(); // <--- 【修复3】增加这行
            }

        };
        reader.readAsDataURL(file);
    });
}

// ================= 模块 B：智能文本批量导入 (支持 DOCX) =================
window.handleStickerBatchFile = function(input) {
    const file = input.files[0];
    if(!file) return;
    
    // 如果是 DOCX，调用 Mammoth 解析
    if(file.name.endsWith('.docx')) {
        const reader = new FileReader();
        reader.onload = function(e) {
            mammoth.extractRawText({arrayBuffer: e.target.result})
                .then(function(result){
                    document.getElementById('sm-batch-text').value = result.value;
                    alert("DOCX 文本提取成功，请在框内检查格式！");
                })
                .catch(function(err){
                    alert("DOCX 解析失败: " + err.message);
                });
        };
        reader.readAsArrayBuffer(file);
        input.value = '';
        return;
    }

    // JSON 或 TXT
    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
                      if(file.name.endsWith('.json')) {
            try {
                const arr = JSON.parse(content);
                let successCount = 0;
                const groupName = document.getElementById('sm-batch-group-name').value.trim() || '未分类文档导入';
                
                // 【修复：读取下拉框的权限设置】
                const scope = document.getElementById('sm-batch-scope').value;
                const ownerId = (scope === 'exclusive') ? currentChatId : null;
                
                arr.forEach(item => {
                    if(item.name && item.url) {
                        window.allStickers.push({
                            id: 'stk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                            name: item.name,
                            url: item.url,
                            category: item.category || groupName,
                            scope: item.scope || scope,     // 优先使用数据里的，没有就用选的
                            owner: item.owner || ownerId
                        });
                        successCount++;
                    }
                });
                saveStickersData();
                alert(`成功导入 ${successCount} 个表情`);
                document.getElementById('sm-batch-group-name').value = ''; 
                switchStickerTab('category');
                if(typeof refreshEmojiPanels === 'function') refreshEmojiPanels();
            } catch(err) {
                alert('JSON 解析失败。');
            }
        } else {
            // txt 直接放入框中
            document.getElementById('sm-batch-text').value = content;
        }
    };
    reader.readAsText(file);
    input.value = '';
}
window.processBatchStickers = function() {
    const text = document.getElementById('sm-batch-text').value.trim();
    const groupName = document.getElementById('sm-batch-group-name').value.trim();
    
    // 【修复：读取下拉框的权限设置】
    const scope = document.getElementById('sm-batch-scope').value;
    const ownerId = (scope === 'exclusive') ? currentChatId : null;
    
    if(!text) return;
    if(!groupName) {
        alert("请为这组表情命名分类！");
        return;
    }
    
    const lines = text.split('\n');
    let successCount = 0;
    const regex = /^(.+?)(?:\s+|:|：|\|)(https?:\/\/.*)$/;
    lines.forEach((line) => {
        line = line.trim();
        if(!line) return;
        const match = line.match(regex);
        if(match) {
            window.allStickers.push({
                id: 'stk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                name: match[1].trim(),
                url: match[2].trim(),
                category: groupName,
                scope: scope,     // 【应用选中权限】
                owner: ownerId    // 【应用专属归属者】
            });
            successCount++;
        }
    });
    saveStickersData();
    alert(`批量导入完毕！成功导入: ${successCount} 个`);
    document.getElementById('sm-batch-text').value = '';
    document.getElementById('sm-batch-group-name').value = ''; 
    switchStickerTab('category');
    if(typeof refreshEmojiPanels === 'function') refreshEmojiPanels();
}


// ================= 模块 C：分类收纳与移动 =================
window.renderStickerManagerGrid = function() {
    const grid = document.getElementById('sm-stickers-grid');
    grid.innerHTML = '';
    if(window.allStickers.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:30px; color:#aaa; font-size:12px;">空空如也，快去导入一些乐子吧！</div>';
        return;
    }
    let groups = {};
    window.allStickers.forEach(s => {
        let key = s.scope === 'global' ? `[通用图库] ${s.category}` : `[自定义] ${s.category}`;
        if(!groups[key]) groups[key] = [];
        groups[key].push(s);
    });
    Object.keys(groups).forEach(cat => {
        const title = document.createElement('div');
        title.className = "sm-category-title";
        title.innerHTML = `<i class="fas fa-folder-open" style="color:#f59e0b;"></i> ${cat}`;
        grid.appendChild(title);
        groups[cat].forEach(s => {
            const div = document.createElement('div');
            div.className = "sm-sticker-item";
            div.onclick = (e) => { if(e.target.tagName !== 'INPUT') { const cb = div.querySelector('input'); cb.checked = !cb.checked; } };
            div.innerHTML = `<input type="checkbox" class="sm-sticker-checkbox" value="${s.id}"><img src="${s.url}"><div class="sm-sticker-name" title="${s.name}">${s.name}</div>`;
            grid.appendChild(div);
        });
    });
}

window.batchMoveStickers = function() {
    const checkboxes = document.querySelectorAll('.sm-sticker-checkbox:checked');
    if(checkboxes.length === 0) return alert('请先点选要移动的表情！');
    const newCat = prompt("请输入要移动到的【分类文件夹】名称：");
    if(!newCat) return;
    checkboxes.forEach(cb => {
        const stk = window.allStickers.find(s => s.id === cb.value);
        if(stk) stk.category = newCat.trim();
    });
    saveStickersData();
    renderStickerManagerGrid();
}
window.batchDeleteStickers = function() {
    const checkboxes = document.querySelectorAll('.sm-sticker-checkbox:checked');
    if(checkboxes.length === 0) return;
    if(confirm(`确定删除这 ${checkboxes.length} 个表情吗？`)) {
        const ids = Array.from(checkboxes).map(cb => cb.value);
        window.allStickers = window.allStickers.filter(s => !ids.includes(s.id));
        saveStickersData();
        renderStickerManagerGrid();
    }
}
window.renderChatSettingsStickerCheckboxes = function() {
    const container = document.getElementById('cs-sticker-categories');
    if (!container) return;
    container.innerHTML = '';
    const friend = friendsData[currentChatId];
    if (!friend) return;
    let activeCategories = (friend.chatSettings && friend.chatSettings.activeStickers) ? friend.chatSettings.activeStickers : [];
    let legalCategories = new Set();
    window.allStickers.forEach(s => {
        if (s.scope === 'global') legalCategories.add(`global|${s.category}`);
        else if (s.scope === 'custom' || s.scope === 'exclusive') legalCategories.add(`custom|${s.category}`); // 兼容新老数据
    });
    if (legalCategories.size === 0) {
        container.innerHTML = '<div style="color:#999; font-size:12px; text-align:center;">暂无分类，请点击上方按钮导入。</div>';
        return;
    }
    legalCategories.forEach(catStr => {
        const [scope, catName] = catStr.split('|');
        const isChecked = activeCategories.includes(catStr) ? 'checked' : '';
        const displayName = scope === 'global' ? `<span style="color:#07c160;">[通用]</span> ${catName}` : `<span style="color:#ff7e67;">[自定义]</span> ${catName}`;
        const item = document.createElement('div');
        item.className = 'wb-checklist-item';
        item.innerHTML = `<input type="checkbox" value="${catStr}" ${isChecked}><span class="wb-checklist-name">${displayName}</span>`;
        item.onclick = (e) => { if(e.target.type !== 'checkbox') { const cb = item.querySelector('input'); cb.checked = !cb.checked; } };
        container.appendChild(item);
    });
}


// ================= 模块 D：聊天输入框表情面板 (分组显示) =================
const _originalToggleChatPanel = window.toggleChatPanel;
window.toggleChatPanel = function(type) {
    if (typeof _originalToggleChatPanel === 'function') {
        _originalToggleChatPanel(type);
    }
    if (type === 'emoji') {
        renderEmojiPanel(); // 每次打开重新渲染
    }
}
window.renderEmojiPanel = function() {
    const panel = document.getElementById('panel-emoji');
    if (!panel) return;
    
    // 你是机主，发送面板不受限制，可以直接看到图库里所有的表情包
    let availableStickers = window.allStickers;
    
    let groups = {};
    availableStickers.forEach(s => {
        let cat = s.category || '未分类';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(s);
    });
    let categories = Object.keys(groups);
    
    let tabsHtml = `<div class="emoji-tabs" style="display:flex; overflow-x:auto; gap:15px; border-bottom:1px solid #f0f0f0; padding-bottom:8px; white-space:nowrap;">`;
    tabsHtml += `<span class="emoji-cat-tab active" onclick="switchEmojiCat('emoji_default', this)" style="cursor:pointer; font-weight:bold; color:#111;">基础Emoji</span>`;
    categories.forEach(cat => {
        tabsHtml += `<span class="emoji-cat-tab" onclick="switchEmojiCat('${cat}', this)" style="cursor:pointer; color:#999;">${cat}</span>`;
    });
    tabsHtml += `</div>`;
    
    tabsHtml += `<div onclick="openStickerManager()" style="margin-top: 10px; font-size:11px; color:#111; background:#f5f5f5; padding:6px 10px; border-radius:12px; cursor:pointer; font-weight:600; display:flex; justify-content:center; align-items:center; gap:4px; transition:0.2s;"><i class="fas fa-cog"></i> 管理表情包中枢</div>`;
    
    let contentHtml = `<div id="emoji-content-area" style="margin-top: 15px; padding-bottom: 20px;">`;

    // 系统自带表情
    contentHtml += `<div class="emoji-grid" id="emoji-cat-emoji_default">
        <span onclick="insertEmoji('😀')">😀</span><span onclick="insertEmoji('😂')">😂</span><span onclick="insertEmoji('🥺')">🥺</span>
        <span onclick="insertEmoji('😭')">😭</span><span onclick="insertEmoji('😡')">😡</span><span onclick="insertEmoji('👍')">👍</span>
        <span onclick="insertEmoji('❤️')">❤️</span><span onclick="insertEmoji('✨')">✨</span><span onclick="insertEmoji('🤡')">🤡</span>
        <span onclick="insertEmoji('🤤')">🤤</span><span onclick="insertEmoji('🤔')">🤔</span><span onclick="insertEmoji('💩')">💩</span>
    </div>`;
    
    // 分类表情组
    categories.forEach(cat => {
        // 这里加了 align-items: start; 保证即使名字长短不一也不会错位
        contentHtml += `<div class="sticker-grid" id="emoji-cat-${cat}" style="display:none; grid-template-columns: repeat(4, 1fr); gap: 10px; align-items: start;">`;
        groups[cat].forEach(s => {
            // 【核心修改】：原本只有 img 标签，现在用 div 包裹了图片和底下的文字
            contentHtml += `
                <div onclick="sendStickerFromPanel('${s.name}', '${s.url}')" style="display:flex; flex-direction:column; align-items:center; cursor:pointer; gap:4px;">
                    <img src="${s.url}" title="${s.name}" style="width:60px; height:60px; object-fit:contain; filter:drop-shadow(0 2px 5px rgba(0,0,0,0.05)); border-radius:6px;">
                    <span style="font-size:10px; color:#666; text-align:center; width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s.name}</span>
                </div>
            `;
        });
        contentHtml += `</div>`;
    });
    
    contentHtml += `</div>`;
    panel.innerHTML = tabsHtml + contentHtml;
}



window.switchEmojiCat = function(cat, el) {
    document.querySelectorAll('.emoji-cat-tab').forEach(t => {
        t.style.fontWeight = 'normal';
        t.style.color = '#999';
    });
    el.style.fontWeight = 'bold';
    el.style.color = '#111';
    
    const grids = document.querySelectorAll('#emoji-content-area > div');
    grids.forEach(g => g.style.display = 'none');
    
    const target = document.getElementById(`emoji-cat-${cat}`);
    if (target) {
        target.style.display = target.classList.contains('emoji-grid') ? 'grid' : 'grid';
    }
}

// 【修复6】点击发送表情包 (包含视觉解析开关判断与历史持久化)
window.sendStickerFromPanel = function(name, url) {
    const friend = friendsData[currentChatId] || {};
    const chatSettings = friend.chatSettings || {};
    
    let hiddenPrompt = "";
    if (chatSettings.visionStickerEnabled) {
        hiddenPrompt = `[System: User sent a sticker named "${name}". IMAGE_CONTENT:${url}]`;
    } else {
        hiddenPrompt = `[System: User sent a sticker/meme named "${name}". Please react to it appropriately.]`;
    }
    
    // 【关键修复】复用标准的文字输入格式上屏，系统会自动把 [表情:名字] 渲染为透明图片
    appendMessage(`[表情:${name}]`, 'sent');
    
    if (currentChatId) {
        // 保存到历史记录的格式必须是 [表情:xxx]，这样刷新页面后系统才知道去图库找图！
        saveMessageToHistory(currentChatId, { text: `[表情:${name}]`, type: 'sent', senderName: 'ME' });
    }

    document.getElementById('chat-extra-panels').classList.remove('open');
}
// 【修复3】全局统一的表情包面板刷新器
window.refreshEmojiPanels = function() {
    // 刷新聊天框键盘
    if(document.getElementById('chat-extra-panels')?.classList.contains('open')) {
        renderEmojiPanel();
    }
    // 刷新设置里的复选框
    if(document.getElementById('chatSettingsPage')?.classList.contains('show')){
        renderChatSettingsStickerCheckboxes();
    }
}
/* =========================================
   [新增] 无损强制更新 App (不丢失本地数据)
   ========================================= */
window.forceUpdateAppLossless = function() {
    if (confirm("这将会获取 GitHub 上的最新界面代码。是否继续？")) {
        let hasServiceWorker = false;
        
        // 1. 注销所有的 Service Worker (解决缓存锁死)
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function(registrations) {
                for(let registration of registrations) {
                    registration.unregister();
                    hasServiceWorker = true;
                }
            });
        }

        // 2. 清除 Cache Storage 里的静态文件 (HTML/CSS/JS)，不碰 IndexedDB/LocalStorage
        if ('caches' in window) {
            caches.keys().then(function(keyList) {
                return Promise.all(keyList.map(function(key) {
                    return caches.delete(key);
                }));
            }).then(function() {
                // 3. 给 URL 加个随机时间戳，强制绕过浏览器硬缓存刷新页面
                const newUrl = window.location.origin + window.location.pathname + '?update=' + new Date().getTime();
                window.location.href = newUrl;
            });
        } else {
            // 如果不支持 caches，直接强制刷新
            window.location.reload(true);
        }
    }
};
/* =========================================
   [新增] 全量数据备份与恢复 (LocalStorage + IndexedDB)
   ========================================= */

// 1. 导出全量数据
window.exportFullAppData = async function() {
    try {
        if(typeof showToast === 'function') showToast('<i class="fas fa-spinner fa-spin"></i> 正在打包数据，请稍候...');
        
        const backupData = {
            version: "2.0",
            timestamp: new Date().toISOString(),
            localStorage: {},
            indexedDB: {}
        };

        // A. 抓取 LocalStorage 中所有我们的数据
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            // 抓取带有项目前缀或聊天记录前缀的 key
            if (key.startsWith('myCoolPhone_') || key.startsWith('chat_history_')) {
                backupData.localStorage[key] = localStorage.getItem(key);
            }
        }

        // B. 抓取 IndexedDB 大仓库里的所有聊天记录和人物数据
        if (!IDB.db) await IDB.init();
        const idbData = await new Promise((resolve, reject) => {
            const tx = IDB.db.transaction('largeDataStore', 'readonly');
            const store = tx.objectStore('largeDataStore');
            const reqData = store.getAll();
            const reqKeys = store.getAllKeys();
            
            reqData.onsuccess = () => {
                reqKeys.onsuccess = () => {
                    const result = {};
                    for (let i = 0; i < reqKeys.result.length; i++) {
                        result[reqKeys.result[i]] = reqData.result[i];
                    }
                    resolve(result);
                };
            };
            reqData.onerror = () => reject(reqData.error);
        });
        
        backupData.indexedDB = idbData;

        // C. 触发下载
        const jsonString = JSON.stringify(backupData);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement("a");
        a.href = url;
        // 文件名带上当天的日期
        const dateStr = new Date().toLocaleDateString().replace(/\//g, '-');
        a.download = `MyBeeper_Backup_${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if(typeof showToast === 'function') showToast('<i class="fas fa-check" style="color:#07c160;"></i> 存档导出成功！');
    } catch (e) {
        console.error(e);
        alert("导出失败，请检查控制台: " + e.message);
    }
};

// 2. 导入全量数据
window.importFullAppData = function(input) {
    const file = input.files[0];
    if (!file) return;

    if (!confirm("⚠️ 危险操作警告：\n\n导入存档将【彻底抹除并覆盖】你当前手机里的所有聊天记录、好感度、人设和主题设置。\n\n确定要继续导入吗？")) {
        input.value = '';
        return;
    }

    if(typeof showToast === 'function') showToast('<i class="fas fa-spinner fa-spin"></i> 正在恢复时空数据...');
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        try {
            const backupData = JSON.parse(e.target.result);
            
            if (!backupData.localStorage && !backupData.indexedDB) {
                throw new Error("这不是有效的 MyBeeper 存档文件。");
            }

            // A. 恢复 LocalStorage
            if (backupData.localStorage) {
                Object.keys(backupData.localStorage).forEach(key => {
                    localStorage.setItem(key, backupData.localStorage[key]);
                });
            }

            // B. 恢复 IndexedDB 里的巨量数据
            if (backupData.indexedDB) {
                if (!IDB.db) await IDB.init();
                const entries = Object.entries(backupData.indexedDB);
                
                await new Promise((resolve, reject) => {
                    const tx = IDB.db.transaction('largeDataStore', 'readwrite');
                    const store = tx.objectStore('largeDataStore');
                    
                    // 先清空现有的数据库，保证不残留幽灵数据
                    store.clear().onsuccess = () => {
                        let i = 0;
                        function putNext() {
                            if (i < entries.length) {
                                store.put(entries[i][1], entries[i][0]).onsuccess = putNext;
                                i++;
                            } else {
                                resolve();
                            }
                        }
                        putNext();
                    };
                    tx.onerror = () => reject(tx.error);
                });
            }

            alert("🎉 时空回溯完成！应用即将重启以加载存档。");
            window.location.reload(true);
            
        } catch (err) {
            console.error(err);
            alert("导入失败: " + err.message);
        }
        input.value = ''; // 允许重复上传同一个文件
    };
    
    reader.readAsText(file);
};

/* =========================================
   [新增] 智能语音连播与 API 接入
   ========================================= */

let currentGlobalAudio = null;

// 点击语音条时触发
window.handleAiVoiceClick = async function(voiceBarEl, msgId) {
    // 1. 如果正在播放当前音频，就停止
    if (currentGlobalAudio && currentGlobalAudio._voiceBarEl === voiceBarEl) {
        currentGlobalAudio.pause();
        currentGlobalAudio = null;
        resetAllVoiceUIs();
        return;
    }

    // 2. 停止其他音频
    if (currentGlobalAudio) {
        currentGlobalAudio.pause();
        currentGlobalAudio = null;
        resetAllVoiceUIs();
    }

    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    const settings = settingsJSON ? JSON.parse(settingsJSON) : {};
    
    const friend = friendsData[currentChatId];
    const chatSettings = (friend && friend.chatSettings) ? friend.chatSettings : {};

    // 检查是否有 API 配置
    const provider = settings.provider || 'custom';
    const apiKey = settings.apiKey;
    const isMinimax = provider.startsWith('minimax');
    
    const transcriptEl = voiceBarEl.nextElementSibling;
    const playIcon = voiceBarEl.querySelector('.play-icon');
    const spinner = voiceBarEl.querySelector('.loading-spinner');
    const waveform = voiceBarEl.querySelector('.waveform-container');

     // 3. 如果没配 Minimax，降级为“仅显示转写文字”
    if (!isMinimax || !apiKey) {
        // 如果已经展开，则直接收起
        if (transcriptEl && transcriptEl.style.display === 'block' && transcriptEl.innerText !== "正在转文字...") {
            transcriptEl.style.display = 'none';
            return;
        }

        if (playIcon) playIcon.style.display = 'none';
        if (spinner) spinner.style.display = 'inline-block';
        if (transcriptEl) transcriptEl.innerText = "正在转文字...";
        if (transcriptEl) transcriptEl.style.display = 'block';

        setTimeout(() => {
            if (spinner) spinner.style.display = 'none';
            if (playIcon) playIcon.style.display = 'inline-block';
            
            const rawText = decodeURIComponent(voiceBarEl.getAttribute('data-transcript') || '');
            if (transcriptEl) transcriptEl.innerHTML = rawText ? rawText.replace(/\n/g, '<br>') : '（无文本）';
        }, 800);
        return;
    }

    // 4. 有 API，寻找连续的 AI 语音消息，合并连播
    const allVoiceMessages = findConsecutiveAiVoiceMessages(msgId);
    if (allVoiceMessages.length === 0) return;

    // 收集文本
    const textsToSpeak = allVoiceMessages.map(item => decodeURIComponent(item.el.getAttribute('data-transcript') || ''));
    const combinedText = textsToSpeak.join('，'); // 用逗号拼接连播

    // 展现 Loading
    if (playIcon) playIcon.style.display = 'none';
    if (spinner) spinner.style.display = 'inline-block';

    try {
        const audioUrl = await callMinimaxVoiceAPI(combinedText, settings, chatSettings);
        
        if (spinner) spinner.style.display = 'none';
        if (waveform) waveform.style.display = 'flex'; // 播放时显示波形

        const audio = new Audio(audioUrl);
        audio._voiceBarEl = voiceBarEl;
        currentGlobalAudio = audio;

        audio.onended = () => {
            resetAllVoiceUIs();
            currentGlobalAudio = null;
        };

        audio.play();

    } catch (e) {
        console.error("Voice synthesis failed:", e);
        if (spinner) spinner.style.display = 'none';
        if (playIcon) playIcon.style.display = 'inline-block';
        alert("语音合成失败：" + e.message);
    }
};

// 重置所有语音 UI
function resetAllVoiceUIs() {
    document.querySelectorAll('.ai-voice-bar').forEach(el => {
        const playIcon = el.querySelector('.play-icon');
        const spinner = el.querySelector('.loading-spinner');
        const waveform = el.querySelector('.waveform-container');
        if(playIcon) playIcon.style.display = 'inline-block';
        if(spinner) spinner.style.display = 'none';
        if(waveform) waveform.style.display = 'none';
    });
}

// 寻找连续的 AI 语音消息
function findConsecutiveAiVoiceMessages(startMsgId) {
    const chatRows = Array.from(document.querySelectorAll('#chatMessages .chat-row'));
    let startIndex = chatRows.findIndex(row => row.getAttribute('data-msg-id') === startMsgId);
    if (startIndex === -1) return [];

    let consecutiveMessages = [];
    
    // 从点击的这条开始往下找
    for (let i = startIndex; i < chatRows.length; i++) {
        const row = chatRows[i];
        
        // 遇到非 received (发送或系统消息) 就打断
        if (!row.classList.contains('received')) break;

        const voiceBar = row.querySelector('.ai-voice-bar');
        // 遇到非语音消息，打断
        if (!voiceBar) break;

        consecutiveMessages.push({
            id: row.getAttribute('data-msg-id'),
            el: voiceBar
        });
    }

    return consecutiveMessages;
}

// 调用 Minimax 语音合成 API
async function callMinimaxVoiceAPI(text, globalSettings, chatSettings) {
    // 【修改点】：强制优先使用语音专属凭证
    const groupId = globalSettings.voiceGroupId || globalSettings.groupId || '';
    const apiKey = globalSettings.voiceApiKey || globalSettings.apiKey || '';
    
    // 为了防止聊天选了其它家模型导致 URL 错误，强制将语音 API 锁定为 MiniMax 的接口
    const isGlobal = globalSettings.provider === 'minimax_global';
    const apiUrl = isGlobal ? `https://api.minimaxi.com/v1/t2a_v2?GroupId=${groupId}` : `https://api.minimax.chat/v1/t2a_v2?GroupId=${groupId}`;

    // 读取角色个性化设置
    const voiceId = chatSettings.voiceId || 'female-shaonv';
    const speed = chatSettings.voiceSpeed || 1.0;
    const langBoost = chatSettings.voiceLangBoost || '';

    const payload = {
        model: 'speech-01-turbo',
        text: text,
        voice_setting: {
            voice_id: voiceId,
            speed: speed,
            vol: 1.0,
            pitch: 0
        },
        pronunciation_dict: {
            tone: []
        },
        audio_setting: {
            sample_rate: 32000,
            bitrate: 128000,
            format: "mp3",
            channel: 1
        }
    };

    if (langBoost) {
        payload.language = langBoost;
    }

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    // Minimax T2A V2 返回的直接是二进制音频，或者 JSON (带有 trace_id 和 status) 
    // 但通常 T2A v2 接口在 Content-Type 为 application/json 时可能返回 {"data": {"audio": "hex..."}} 或者直接返回音频 buffer
    // 参考官方文档，如果请求成功，Header Content-Type 可能是 audio/mp3 或者 json 里有 base64
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const json = await response.json();
        if (json.base_resp && json.base_resp.status_code !== 0) {
            throw new Error(json.base_resp.status_msg);
        }
        if (json.data && json.data.audio) {
            // Hex/Base64 处理 (视具体 Minimax 格式而定，这里假设它返回的是 Hex 字符串的 audio 字段)
            const audioHex = json.data.audio;
            if (audioHex) {
                const typedArray = new Uint8Array(audioHex.match(/[\da-f]{2}/gi).map(function (h) {
                    return parseInt(h, 16);
                }));
                const blob = new Blob([typedArray], { type: 'audio/mp3' });
                return URL.createObjectURL(blob);
            }
        }
    }
    
    // 如果直接返回的是二进制音频 (常见的 V2 行为)
    const blob = await response.blob();
    return URL.createObjectURL(blob);
}

/* =========================================
   [转账系统] 隐藏消息发送接口
   供 app_transfer.js 调用，静默触发 AI 回复
   ========================================= */
window.sendHiddenAIMessage = async function(prompt, targetId) {
    const targetChatId = targetId || currentChatId;
    if (!targetChatId) return '';
    const targetChatType = targetId ? 'single' : currentChatType;
    const settingsJSON = localStorage.getItem(SETTINGS_KEY);
    if (!settingsJSON) return '';
    const settings = JSON.parse(settingsJSON);

    let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
    const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

    const f = friendsData[targetChatId] || {};
    const systemPrompt = `You are ${f.realName || 'AI'}. ${f.persona || ''}`;

    try {
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
            body: JSON.stringify({
                model: settings.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ],
                temperature: parseFloat(settings.temperature || 0.7),
                max_tokens: 120
            })
        });
        if (!res.ok) return '';
        const data = await res.json();
        const reply = (data?.choices?.[0]?.message?.content || '').trim();

        if (reply) {
            // 过滤掉STATUS块，只取正文
            const clean = reply.replace(/\[STATUS_START\][\s\S]*?\[STATUS_END\]/i, '').trim();
            if (clean) {
                const avatarUrl = f.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.realName || 'AI'}`;
                const aiMsgId = 'msg_hid_' + Date.now();
                setTimeout(() => {
                    const chatLayer = document.getElementById('chatLayer');
                    const isLookingAtThisChat = chatLayer && chatLayer.classList.contains('show') && currentChatId === targetChatId && currentChatType === targetChatType;
                    if (isLookingAtThisChat) {
                        appendMessage(clean, 'received', avatarUrl, null, null, aiMsgId);
                    } else {
                        const dockDot = document.getElementById('dock-dot');
                        if (dockDot) dockDot.style.display = 'block';
                    }
                    saveMessageToHistory(targetChatId, {
                        id: aiMsgId, text: clean, type: 'received',
                        customAvatar: avatarUrl, senderName: targetChatId
                    });
                }, 600);
            }
        }
        return reply;
    } catch (e) {
        console.warn('[sendHiddenAIMessage] error:', e);
        return '';
    }
};

// ====== [新增] 朋友圈后台自动更新定时器 ======
setInterval(async () => {
    if (typeof friendsData === 'undefined') return;
    const now = Date.now();
    for (const friendId of Object.keys(friendsData)) {
        const friend = friendsData[friendId];
        if (!friend || !friend.chatSettings) continue;
        if (!friend.chatSettings.momentFreqEnabled) continue;
        
        const freqMinutes = friend.chatSettings.momentFreqTime || 60;
        const lastTime = friend.chatSettings.lastMomentGenTime || friend.chatSettings.lastChatTime || now;
        
        if (now - lastTime >= freqMinutes * 60 * 1000) {
            if (friend._isGeneratingMoment) continue;
            friend._isGeneratingMoment = true;
            console.log(`[Auto Moment] Triggering moment for ${friendId}`);
            
            try {
                friend.chatSettings.lastMomentGenTime = now;
                if (typeof saveFriendsData === 'function') saveFriendsData();
                
                const settingsJSON = localStorage.getItem('aiChatSettings');
                if (!settingsJSON) continue;
                const settings = JSON.parse(settingsJSON);
                
                let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
                const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
                
                const promptText = friend.chatSettings.momentFreqPrompt || "日常更新一条朋友圈，随便分享点生活或想法。";
                let sysPrompt = `You are ${friend.realName}. Your persona: ${friend.persona}.`;
                
                let userPrompt = `[System Command: Autonomous Moment Posting]
It's been a while since your last activity.
Please generate a new WeChat Moment post based on this instruction: "${promptText}"

Format your output exactly like this:
[MOMENT]
Your post text here...
[/MOMENT]
[MOMENT_IMG]
Optional description for an image here (you can write 0 to 3 of these tags)
[/MOMENT_IMG]

Return ONLY the formatted blocks. Do not explain yourself.`;
                
                if (friend.chatSettings.isTranslationEnabled && typeof TRANS_SEPARATOR !== 'undefined') {
                     userPrompt += `\nSince Translation Mode is ON, please format [MOMENT] text with both ${friend.realName}'s language and Chinese separated by '${TRANS_SEPARATOR}'.`;
                }
                
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
                    body: JSON.stringify({
                        model: settings.model,
                        messages: [
                            { role: 'system', content: sysPrompt },
                            { role: 'user', content: userPrompt }
                        ],
                        temperature: 0.8
                    })
                });
                if (!res.ok) continue;
                const data = await res.json();
                const reply = (data?.choices?.[0]?.message?.content || '').trim();
                
                let momentText = null;
                let momentImages = [];
                const momentBlockRegex = /\[MOMENT\]([\s\S]*?)\[\/MOMENT\]/i;
                const mMatch = reply.match(momentBlockRegex);
                if (mMatch) { momentText = mMatch[1].trim(); }

                const imgRegex = /\[MOMENT_IMG\]([\s\S]*?)\[\/MOMENT_IMG\]/gi;
                let imgMatch;
                while ((imgMatch = imgRegex.exec(reply)) !== null) {
                    const desc = (imgMatch[1] || '').trim();
                    if (desc) momentImages.push(desc);
                }

                if (momentText) {
                    if (typeof createMomentFromAI === 'function') {
                        createMomentFromAI(friendId, momentText, momentImages);
                    }
                }
                
            } catch (e) {
                console.error("Auto moment generation failed:", e);
            } finally {
                friend._isGeneratingMoment = false;
            }
        }
    }
}, 60000); // 每分钟检查一次

/* =================================================================
   [新增] 外卖系统核心逻辑 (高德API周边检索 + 短信定时闭环)
   ================================================================= */

// 1. 拦截用户消息，如果是点外卖意图，则调用高德API并注入隐藏提示
async function checkAndInjectTakeoutInfo(userMsg, msgId) {
    const takeoutKeywords = ['饿', '外卖', '想吃', '点餐', '做饭', '夜宵'];
    const isTakeoutIntent = takeoutKeywords.some(kw => userMsg.includes(kw));
    
    if (!isTakeoutIntent) return;

    // 获取高德 Key
    const settingsJSON = localStorage.getItem(SETTINGS_KEY) || '{}';
    const settings = JSON.parse(settingsJSON);
    
    // 【从 DOM 获取最新的 Key】因为用户可能刚填没点保存
    const amapKeyInput = document.getElementById('amapApiKeyInput');
    const amapKey = amapKeyInput ? amapKeyInput.value.trim() : (settings.amapApiKey || '');
    
    if (!amapKey) {
        console.log("未配置高德地图 API Key，跳过真实店铺注入");
        return;
    }

    try {
        console.log("检测到外卖意图，开始获取地理位置...");
        // 1. 获取经纬度
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true, timeout: 5000, maximumAge: 0
            });
        });
        
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        // 2. 调用高德 POI 周边搜索 (美食类型 050000)
        console.log(`获取坐标成功: ${lng}, ${lat}. 请求高德 API...`);
        const url = `https://restapi.amap.com/v3/place/around?key=${amapKey}&location=${lng},${lat}&types=050000&radius=1500&offset=10&page=1&extensions=base`;
        
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.status === '1' && data.pois && data.pois.length > 0) {
            // 取前 5 个真实店铺名
            const shopNames = data.pois.slice(0, 5).map(p => p.name).join('、');
            console.log("查找到真实店铺:", shopNames);
            
            // 3. 构造注入给 AI 的隐藏提示
            const hiddenInject = `[System Hint: The user is hungry. The GPS system detected REAL restaurants near the user's current physical location: ${shopNames}. Please pick ONE of these exact restaurant names and use the [TAKEOUT:Name:Price] tag in your reply to pretend you just ordered food for them from that specific local shop to surprise them!]`;
            
            // 4. 将这句提示偷偷塞进历史记录（标记为已发送，但不需要重新发界面）
            // 但是我们要确保这句话在刚才用户发的那句话【之后】，这样 AI 才能立刻看到
            if (currentChatId) {
                let history = await loadChatHistory(currentChatId);
                if (history && history.length > 0) {
                    // 找到刚才存进去的用户消息，在它后面加一条系统提示
                    const injectMsgId = 'msg_sys_takeout_hint_' + Date.now();
                    history.push({
                        id: injectMsgId,
                        text: hiddenInject,
                        type: 'system',
                        senderName: 'SYSTEM'
                    });
                    await IDB.set(scopedChatKey(currentChatId), history);
                }
            }
        }
    } catch (e) {
        console.warn("获取真实周边店铺失败 (可能是定位拒绝或Key错误):", e);
    }
}

// 2. 外卖扣费逻辑 (如果存在 app_pay.js 的支持)
window.deductBalanceForTakeout = function(amount, shopName) {
    if (typeof deductBalance === 'function') {
        deductBalance(amount, `【亲密付代扣】TA为你点了 ${shopName}`);
    } else {
        // Fallback: 如果没有 deductBalance，手动改 localStorage
        let payData = JSON.parse(localStorage.getItem('myCoolPhone_payData') || '{}');
        let currentBalance = parseFloat(payData.balance || 0);
        if (currentBalance >= amount) {
            payData.balance = (currentBalance - amount).toFixed(2);
            if (!payData.bills) payData.bills = [];
            payData.bills.unshift({
                id: 'bill_' + Date.now(),
                title: `TA为你点了 ${shopName}`,
                amount: `-${amount.toFixed(2)}`,
                time: Date.now(),
                type: 'out'
            });
            localStorage.setItem('myCoolPhone_payData', JSON.stringify(payData));
            // 尝试更新界面
            const balEl = document.getElementById('pay-total-balance');
            if (balEl) balEl.innerText = payData.balance;
        }
    }
};

// 3. 跳转真实外卖APP (美团搜索 Scheme)
window.openRealTakeoutApp = function(encodedShopName) {
    // 尝试唤起美团 APP 进行全局搜索
    const meituanUrl = `imeituan://www.meituan.com/search?q=${encodedShopName}`;
    
    // 创建一个不可见的 iframe 尝试打开 scheme
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = meituanUrl;
    document.body.appendChild(iframe);
    
    // 如果美团没装，给个提示
    setTimeout(() => {
        document.body.removeChild(iframe);
    }, 2000);
};

// 4. 定时送达闭环 (30分钟后短信 + AI静默发问)
const TAKEOUT_TIMERS_KEY = 'myCoolPhone_takeoutTimers';

function startTakeoutDeliveryTimer(chatId, shopName) {
    // 将任务存入 localStorage 防止刷新页面后丢失
    let timers = JSON.parse(localStorage.getItem(TAKEOUT_TIMERS_KEY) || '[]');
    const deliveryTime = Date.now() + 30 * 60 * 1000; // 30 分钟后
    // 测试用可以改成 1 分钟: Date.now() + 1 * 60 * 1000
    
    timers.push({
        chatId: chatId,
        shopName: shopName,
        deliveryTime: deliveryTime
    });
    localStorage.setItem(TAKEOUT_TIMERS_KEY, JSON.stringify(timers));
    
    // 设置当前进程内的 Timeout
    scheduleDelivery(chatId, shopName, 30 * 60 * 1000);
}

function scheduleDelivery(chatId, shopName, delayMs) {
    setTimeout(() => {
        executeDeliveryClosure(chatId, shopName);
    }, delayMs);
}

// 页面加载时恢复未完成的定时器
document.addEventListener('DOMContentLoaded', () => {
    let timers = JSON.parse(localStorage.getItem(TAKEOUT_TIMERS_KEY) || '[]');
    const now = Date.now();
    let validTimers = [];
    
    timers.forEach(t => {
        if (t.deliveryTime > now) {
            // 还没到时间，继续设定时器
            scheduleDelivery(t.chatId, t.shopName, t.deliveryTime - now);
            validTimers.push(t);
        } else {
            // 已经超时了，立刻执行补发
            executeDeliveryClosure(t.chatId, t.shopName);
        }
    });
    
    localStorage.setItem(TAKEOUT_TIMERS_KEY, JSON.stringify(validTimers));
});

// 执行送达闭环
function executeDeliveryClosure(chatId, shopName) {
    // 1. 从队列里清理掉自己
    let timers = JSON.parse(localStorage.getItem(TAKEOUT_TIMERS_KEY) || '[]');
    timers = timers.filter(t => !(t.chatId === chatId && t.shopName === shopName));
    localStorage.setItem(TAKEOUT_TIMERS_KEY, JSON.stringify(timers));

    // 2. 发送伪造的美团短信
    if (typeof SMSApp !== 'undefined') {
        SMSApp.receiveSMS(
            '美团外卖', 
            `【美团外卖】您的「${shopName}」订单骑手已送达指定位置，请尽快取餐，祝您用餐愉快！`
        );
    }

    // 3. 静默触发 AI 主动追问
    setTimeout(() => {
        const friend = friendsData[chatId];
        if (!friend) return;
        
        const triggerPrompt = `[System Event: The takeout food from "${shopName}" that you ordered for the user 30 minutes ago has just been delivered to their door. Please send a new message to remind the user to pick up the food and eat it while it's hot, using your specific persona's tone.]`;
        
        // 调用隐藏发送接口，AI编好话后会自动上屏
        if (typeof window.sendHiddenAIMessage === 'function') {
            window.sendHiddenAIMessage(triggerPrompt, chatId);
        }
    }, 5000); // 短信发完5秒后 AI 来微信
}


// === [新增] 线下模式后台静默生成系统 (修复加强版) ===
async function generateOfflineExtrasBackground(chatId, userInput, aiReply, settings, friend, needs = {}) {
    const needStatus = needs.needStatus !== false;
    const needDanmaku = !!needs.needDanmaku;
    const needOptions = !!needs.needOptions;

    let requests = [];

    if (needStatus) {
        requests.push(`[STATUS_START]\nAction: （当前角色的动作）\nLocation: （当前地点）\nWeather: （当前天气）\nBGM: （符合氛围的歌名 - 歌手）\nMurmur: （3-4句角色的内心真实想法或吐槽，这非常重要）\nKaomoji: （颜文字）\nAffection: （0-100的数字，当前好感度）\n[STATUS_END]`);
    }

    if (needDanmaku) {
        requests.push(`[DANMAKU_START]\n（网友弹幕一）\n（网友弹幕二）\n[DANMAKU_END]`);
    }

    if (needOptions) {
        requests.push(`[OPTIONS_START]\n1. （用户接下来可执行的选项一）\n2. （选项二）\n[OPTIONS_END]`);
    }

    if (requests.length === 0) return;

    const myName = (typeof personasMeta !== 'undefined' && typeof currentPersonaId !== 'undefined' && personasMeta[currentPersonaId]) ? personasMeta[currentPersonaId].name : 'User';
    
    const sysPrompt = `你是一个辅助分析系统，负责为角色扮演游戏生成后台的 UI 面板数据。
【当前角色】：${friend.realName}
【角色人设】：${friend.persona}

【核心指令】
1. 只补全缺失的数据块，不要重复输出没有要求的块。
2. 绝对不要输出任何 markdown 代码块标记 (如 \`\`\`json 等)，不要任何问候语、分析解释。
3. 必须严格输出以下格式的方括号结构，不要漏掉结束标签，也不要合并标签！

格式要求：
${requests.join('\n\n')}`;

    const userPrompt = `【最新对话互动】\nUser(${myName}): ${userInput}\n${friend.realName}: ${aiReply}\n\n请立刻按照规定格式生成缺失的后台数据块。`;

    try {
        let baseUrl = (settings.endpoint || '').replace(/\/$/, '');
        const apiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

        const payload = {
            model: settings.model,
            messages: [
                { role: "system", content: sysPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.8,
            max_tokens: 800
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error("后台数据生成接口调用失败:", response.status);
            return;
        }

        const data = await response.json();
        let content = data.choices?.[0]?.message?.content || '';
        content = content.replace(/```[a-zA-Z]*\n?/gi, '').replace(/```/g, '').trim();

        if (needStatus) {
            const statusRegex = /\[STATUS_START\]([\s\S]*?)(?:\[\/?STATUS_END\]|(?=\[[A-Za-z_]+_START\])|$)/i;
            const statusMatch = content.match(statusRegex);
            if (statusMatch && typeof updateMindStateFromText === 'function') {
                updateMindStateFromText(statusMatch[1], chatId);
            }
        }

        if (needOptions) {
            const optRegex = /\[OPTIONS_START\]([\s\S]*?)(?:\[\/?OPTIONS_END\]|(?=\[[A-Za-z_]+_START\])|$)/i;
            const optMatch = content.match(optRegex);
            if (optMatch) {
                const extractedOptions = optMatch[1].split('\n')
                    .map(s => s.replace(/^(\d+\s*[\.、)\]）]|Option\s*\d+\s*[:：]|[-*•])\s*/i, '').trim())
                    .filter(s => s.length > 0 && !s.toLowerCase().startsWith('option'));

                const isLookingOfflineNow =
                    document.getElementById('offlineModeView')?.classList.contains('show') &&
                    currentChatId === chatId &&
                    currentChatType === 'single';

                if (isLookingOfflineNow && extractedOptions.length > 0) {
                    const container = document.getElementById('offline-log-container');
                    if (container) {
                        let optDiv = document.getElementById('vn-options-box');
                        if (!optDiv) {
                            optDiv = document.createElement('div');
                            optDiv.id = 'vn-options-box';
                            optDiv.className = 'vn-options-container';
                            const dmArea = container.querySelector('.offline-danmaku-area');
                            if (dmArea) container.insertBefore(optDiv, dmArea);
                            else container.appendChild(optDiv);
                        } else {
                            optDiv.innerHTML = '';
                        }

                        extractedOptions.forEach(opt => {
                            const btn = document.createElement('div');
                            btn.className = 'vn-option-btn';
                            btn.innerText = opt;
                            btn.onclick = () => {
                                if (typeof selectOfflineOption === 'function') selectOfflineOption(opt);
                            };
                            optDiv.appendChild(btn);
                        });
                        setTimeout(() => container.scrollTop = container.scrollHeight, 150);
                    }
                }
            }
        }

        if (needDanmaku) {
            const danmakuRegex = /\[DANMAKU_START\]([\s\S]*?)(?:\[\/?DANMAKU_END\]|(?=\[[A-Za-z_]+_START\])|$)/i;
            const danmakuMatch = content.match(danmakuRegex);
            if (danmakuMatch) {
                const dList = danmakuMatch[1].split('\n')
                    .map(s => s.replace(/^(\d+\s*[\.、)\]）]|Option\s*\d+\s*[:：]|[-*•])\s*/i, '').trim())
                    .filter(s => s.length > 0);

                if (dList.length > 0) {
                    if (typeof danmakuPool !== 'undefined') danmakuPool = dList;
                    if (typeof startDanmakuBatch === 'function') startDanmakuBatch(0);
                }
            }
        }

    } catch (e) {
        console.error("线下模式后台扩展生成失败:", e);
    }
}
