/**
 * app_imagegen.js - 图像生成双引擎模块
 * 支持 NovelAI (NAI V3/V4/V4.5) 和 Pollinations (Flux) 双引擎
 */

// =========================================
// 全局配置键
// =========================================
const IMAGEGEN_SETTINGS_KEY = 'myCoolPhone_imagegenSettings';

// =========================================
// 默认设置
// =========================================
const DEFAULT_IMAGEGEN_SETTINGS = {
    // --- NovelAI ---
    naiEnabled: false,
    naiApiKey: '',
    naiModel: 'nai-diffusion-3',
    naiWidth: 1024,
    naiHeight: 1024,
    naiSteps: 28,
    naiCfgScale: 5,
    naiSampler: 'k_euler',
    naiSeed: -1,
    naiUcPreset: 0,
    naiQualityToggle: true,
    naiSmea: false,
    naiSmeaDyn: false,
    naiCorsProxy: 'https://corsproxy.io/?',
    naiCustomProxy: '',
    // 系统默认提示词
    naiDefaultPositive: 'masterpiece, best quality, very aesthetic, absurdres',
    naiDefaultNegative: 'lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract]',

    // --- Pollinations ---
    polEnabled: true,
    polApiKey: '',
    polModel: 'flux',
    polWidth: 1024,
    polHeight: 1024,
    polEnhance: false,

    // --- 通用 ---
    activeEngine: 'nai', // 'nai' | 'pollinations'
    offlineAutoImage: false,
    offlineAutoImageEngine: 'pollinations',
};

// =========================================
// 读取/写入设置
// =========================================
function loadImagegenSettings() {
    try {
        const raw = localStorage.getItem(IMAGEGEN_SETTINGS_KEY);
        return raw ? { ...DEFAULT_IMAGEGEN_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_IMAGEGEN_SETTINGS };
    } catch (e) {
        return { ...DEFAULT_IMAGEGEN_SETTINGS };
    }
}

function saveImagegenSettings(settings) {
    localStorage.setItem(IMAGEGEN_SETTINGS_KEY, JSON.stringify(settings));
}

// =========================================
// NovelAI 图像生成核心
// =========================================

/**
 * NAI 支持的模型列表
 */
const NAI_MODELS = [
    { value: 'nai-diffusion-3',          label: 'NAI V3 Anime' },
    { value: 'nai-diffusion-4-curated',  label: 'NAI V4 Curated (Preview)' },
    { value: 'nai-diffusion-4-5-curated',label: 'NAI V4.5 Curated' },
    { value: 'nai-diffusion-4-5',        label: 'NAI V4.5 Full' },
    { value: 'nai-diffusion-4',          label: 'NAI V4 Full' },
    { value: 'gemini',                   label: 'Gemini (via NAI key)' },
];

const NAI_SAMPLERS = [
    'k_euler', 'k_euler_ancestral', 'k_dpmpp_2s_ancestral',
    'k_dpmpp_2m', 'k_dpmpp_sde', 'ddim_v3'
];

const NAI_SIZES = [
    { label: '方图 1024×1024', w: 1024, h: 1024 },
    { label: '竖图 832×1216', w: 832, h: 1216 },
    { label: '竖图 896×1152', w: 896, h: 1152 },
    { label: '横图 1216×832', w: 1216, h: 832 },
    { label: '横图 1344×768', w: 1344, h: 768 },
    { label: '壁纸 1920×1088', w: 1920, h: 1088 },
    { label: '小图 512×768', w: 512, h: 768 },
];

/**
 * 构建 NAI 请求体
 */
function buildNaiPayload(prompt, negativePrompt, settings, seed) {
    const s = settings;
    const usedSeed = (seed !== undefined && seed !== null) ? seed : (s.naiSeed === -1 ? Math.floor(Math.random() * 2147483647) : s.naiSeed);

    const parameters = {
        width: s.naiWidth,
        height: s.naiHeight,
        scale: s.naiCfgScale,
        sampler: s.naiSampler,
        steps: s.naiSteps,
        n_samples: 1,
        seed: usedSeed,
        ucPreset: s.naiUcPreset,
        qualityToggle: s.naiQualityToggle,
        sm: s.naiSmea,
        sm_dyn: s.naiSmeaDyn,
        negative_prompt: negativePrompt,
    };

    return { input: prompt, model: s.naiModel, action: 'generate', parameters };
}

/**
 * 获取 NAI 请求 URL（带代理）
 */
function getNaiApiUrl(settings) {
    const base = 'https://image.novelai.net/ai/generate-image';
    const proxy = settings.naiCustomProxy || settings.naiCorsProxy || '';
    return proxy ? `${proxy}${encodeURIComponent(base)}` : base;
}

/**
 * 从 NAI SSE 流或普通响应中提取图片 base64
 */
async function extractNaiImage(response) {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream')) {
        // SSE 流式解析
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let imageBase64 = null;

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // 保留不完整行

            for (const line of lines) {
                if (line.startsWith('data:')) {
                    const jsonStr = line.slice(5).trim();
                    if (jsonStr === '[DONE]') continue;
                    try {
                        const evt = JSON.parse(jsonStr);
                        if (evt?.event === 'newImage' && evt?.data) {
                            imageBase64 = evt.data;
                        } else if (evt?.output?.[0]) {
                            imageBase64 = evt.output[0];
                        }
                    } catch (_) {}
                }
            }
        }
        return imageBase64;
    } else {
        // 普通二进制或 JSON 响应
        const blob = await response.blob();
        if (blob.size === 0) return null;
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const dataUrl = e.target.result;
                // 去掉 data:image/...;base64, 前缀，只取 base64 部分
                const b64 = dataUrl.split(',')[1] || dataUrl;
                resolve(b64);
            };
            reader.readAsDataURL(blob);
        });
    }
}

/**
 * 主函数：通过 NovelAI 生成图片，返回 base64 数据URL数组
 */
async function generateImageNai(prompt, negativePrompt, options = {}) {
    const settings = loadImagegenSettings();
    if (!settings.naiApiKey) throw new Error('未填写 NovelAI API Key，请前往 API 设置配置。');

    const seed = options.seed !== undefined ? options.seed : undefined;
    const payload = buildNaiPayload(prompt, negativePrompt, settings, seed);
    const url = getNaiApiUrl(settings);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.naiApiKey}`,
            'Accept': 'application/x-zip-compressed, */*',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`NAI API Error ${response.status}: ${errText.slice(0, 200)}`);
    }

    const b64 = await extractNaiImage(response);
    if (!b64) throw new Error('NAI 返回图片数据为空');

    const dataUrl = b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
    return [dataUrl];
}

// =========================================
// Pollinations 图像生成核心
// =========================================

const POL_RETRY_DELAY = 5000; // 5秒重试
const POL_MAX_RETRIES = 3;

/**
 * 主函数：通过 Pollinations 生成图片（支持失败重试）
 */
async function generateImagePollinations(prompt, options = {}) {
    const settings = loadImagegenSettings();
    const model = options.model || settings.polModel || 'flux';
    const width = options.width || settings.polWidth || 1024;
    const height = options.height || settings.polHeight || 1024;
    const enhance = options.enhance !== undefined ? options.enhance : settings.polEnhance;
    const nologo = true;
    const seed = options.seed || Math.floor(Math.random() * 2147483647);

    const encodedPrompt = encodeURIComponent(prompt);
    let baseUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=${model}&width=${width}&height=${height}&seed=${seed}&nologo=${nologo}&nofeed=true`;
    
    if (enhance) baseUrl += '&enhance=true';
    if (settings.polApiKey) {
        baseUrl += `&apiKey=${settings.polApiKey}`;
    }

    let lastError = null;
    for (let attempt = 0; attempt < POL_MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(baseUrl);
            if (!response.ok) {
                lastError = new Error(`Pollinations HTTP ${response.status}`);
                await new Promise(r => setTimeout(r, POL_RETRY_DELAY));
                continue;
            }
            const blob = await response.blob();
            const dataUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(blob);
            });
            return [dataUrl];
        } catch (e) {
            lastError = e;
            if (attempt < POL_MAX_RETRIES - 1) {
                await new Promise(r => setTimeout(r, POL_RETRY_DELAY));
            }
        }
    }
    throw lastError || new Error('Pollinations 生成失败');
}

// =========================================
// 统一生成入口（智能选择引擎）
// =========================================

/**
 * 构建最终提示词：AI场景词 + 角色专属词 + 系统默认词
 */
function buildFinalPrompt(aiScenePrompt, chatId) {
    const settings = loadImagegenSettings();
    const friend = (typeof friendsData !== 'undefined' && chatId) ? friendsData[chatId] : null;
    
    let parts = [];
    if (aiScenePrompt) parts.push(aiScenePrompt.trim());
    
    // 角色专属正面提示词
    const charPositive = friend?.imagegenSettings?.charPositivePrompt || '';
    if (charPositive) parts.push(charPositive.trim());
    
    // 系统默认正面提示词
    if (settings.naiDefaultPositive) parts.push(settings.naiDefaultPositive.trim());
    
    return parts.filter(Boolean).join(', ');
}

function buildFinalNegativePrompt(chatId) {
    const settings = loadImagegenSettings();
    const friend = (typeof friendsData !== 'undefined' && chatId) ? friendsData[chatId] : null;
    
    let parts = [];
    const charNegative = friend?.imagegenSettings?.charNegativePrompt || '';
    if (charNegative) parts.push(charNegative.trim());
    if (settings.naiDefaultNegative) parts.push(settings.naiDefaultNegative.trim());
    
    return parts.filter(Boolean).join(', ');
}

/**
 * 核心生成函数：返回 [dataUrl, ...] 数组
 */
async function generateImages(aiScenePrompt, chatId, options = {}) {
    const settings = loadImagegenSettings();
    const engine = options.engine || settings.activeEngine || 'pollinations';
    
    const finalPrompt = buildFinalPrompt(aiScenePrompt, chatId);
    const finalNegative = buildFinalNegativePrompt(chatId);
    
    if (engine === 'nai') {
        return await generateImageNai(finalPrompt, finalNegative, options);
    } else {
        return await generateImagePollinations(finalPrompt, options);
    }
}

// =========================================
// 聊天气泡：naiimag 指令解析与发送
// =========================================

/**
 * 解析 AI 回复中的图像生成指令并处理
 * 支持：{"type":"naiimag","prompt":"..."} 和 [REALIMAG:prompt] 两种格式
 */
async function parseAndHandleImageCommands(rawReply, chatId) {
    let processedReply = rawReply;
    const imageTasks = [];

    // 格式1：JSON 格式 {"type":"naiimag","prompt":"..."}
    const naiJsonRegex = /\{"type"\s*:\s*"naiimag"\s*,\s*"prompt"\s*:\s*"([^"]+)"\}/gi;
    let match;
    while ((match = naiJsonRegex.exec(rawReply)) !== null) {
        const prompt = match[1];
        imageTasks.push({ prompt, engine: 'nai', original: match[0] });
        processedReply = processedReply.replace(match[0], '').trim();
    }

    // 格式2：[REALIMAG:prompt] - Pollinations 引擎
    const polRegex = /\[REALIMAG:([^\]]+)\]/gi;
    while ((match = polRegex.exec(rawReply)) !== null) {
        const prompt = match[1];
        imageTasks.push({ prompt, engine: 'pollinations', original: match[0] });
        processedReply = processedReply.replace(match[0], '').trim();
    }

    // 格式3：[NAIIMAG:prompt] 
    const naiTagRegex = /\[NAIIMAG:([^\]]+)\]/gi;
    while ((match = naiTagRegex.exec(rawReply)) !== null) {
        const prompt = match[1];
        imageTasks.push({ prompt, engine: 'nai', original: match[0] });
        processedReply = processedReply.replace(match[0], '').trim();
    }

    // 异步发图（延迟执行，不阻塞文字显示）
    if (imageTasks.length > 0) {
        const settings = loadImagegenSettings();
        const friend = (typeof friendsData !== 'undefined' && chatId) ? friendsData[chatId] : null;
        const avatarUrl = friend?.avatar || null;
        const senderName = friend?.remark || friend?.realName || chatId;

        // NAI 最多2张，Pollinations 最多9张
        const naiTasks = imageTasks.filter(t => t.engine === 'nai').slice(0, 2);
        const polTasks = imageTasks.filter(t => t.engine !== 'nai').slice(0, 9);
        const finalTasks = [...naiTasks, ...polTasks];

        setTimeout(async () => {
            for (let i = 0; i < finalTasks.length; i++) {
                const task = finalTasks[i];
                try {
                    const imgs = await generateImages(task.prompt, chatId, { engine: task.engine });
                    for (const dataUrl of imgs) {
                        await appendGeneratedImageBubble(dataUrl, chatId, avatarUrl, senderName, task.prompt);
                    }
                } catch (e) {
                    console.warn('[ImageGen] 生图失败:', e.message);
                    if (typeof showToast === 'function') showToast(`生图失败: ${e.message.slice(0, 50)}`);
                }
                // 多图间隔200ms
                if (i < finalTasks.length - 1) await new Promise(r => setTimeout(r, 200));
            }
        }, 800);
    }

    return processedReply;
}

/**
 * 将生成的图片附加到聊天界面
 */
async function appendGeneratedImageBubble(dataUrl, chatId, avatarUrl, senderName, promptUsed) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    const msgId = 'msg_img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const row = document.createElement('div');
    row.className = 'chat-row received';
    row.setAttribute('data-msg-id', msgId);
    row.setAttribute('data-msg-text', '[生成图片]');
    row.setAttribute('data-msg-prompt', promptUsed || '');

    const checkboxWrap = document.createElement('div');
    checkboxWrap.className = 'chat-row-checkbox';
    checkboxWrap.innerHTML = `<div class="wc-msg-checkbox" onclick="toggleMsgSelection(this)"></div>`;

    const img = document.createElement('img');
    img.className = 'chat-avatar-img';
    img.src = avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=AI`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble received rich-bubble imagegen-bubble';

    bubble.innerHTML = `
        <div class="imagegen-img-wrap" style="position:relative;">
            <img src="${dataUrl}" class="imagegen-result-img" style="max-width:200px; max-height:280px; border-radius:12px; display:block; cursor:pointer;" 
                 onclick="openImageFullscreen('${msgId}')"
                 oncontextmenu="return false;">
            <div class="imagegen-actions" style="position:absolute; bottom:6px; right:6px; display:flex; gap:6px;">
                <div onclick="rerollImage('${msgId}')" title="重绘" style="background:rgba(0,0,0,0.5); color:#fff; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:12px;">
                    <i class="fas fa-dice"></i>
                </div>
                <div onclick="downloadGeneratedImage('${msgId}')" title="下载" style="background:rgba(0,0,0,0.5); color:#fff; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:12px;">
                    <i class="fas fa-download"></i>
                </div>
            </div>
        </div>
    `;

    // 长按菜单
    let pressTimer;
    bubble.addEventListener('touchstart', (e) => {
        pressTimer = setTimeout(() => {
            showImageBubbleMenu(e, msgId, dataUrl);
        }, 600);
    });
    bubble.addEventListener('touchend', () => clearTimeout(pressTimer));
    bubble.addEventListener('touchmove', () => clearTimeout(pressTimer));
    bubble.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showImageBubbleMenu(e, msgId, dataUrl);
    });

    row.appendChild(checkboxWrap);
    row.appendChild(img);
    row.appendChild(bubble);
    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // 保存到历史（存储 dataUrl）
    if (chatId && typeof saveMessageToHistory === 'function') {
        await saveMessageToHistory(chatId, {
            id: msgId,
            text: `[GENIMG_DATA:${dataUrl}|PROMPT:${promptUsed || ''}]`,
            type: 'received',
            senderName: senderName,
            customAvatar: avatarUrl,
            isGeneratedImage: true,
            imagePrompt: promptUsed || '',
        });
    }
}

// =========================================
// 重绘 (Reroll) 功能
// =========================================

window.rerollImage = async function(msgId) {
    const row = document.querySelector(`.chat-row[data-msg-id="${msgId}"]`);
    if (!row) return;

    const prompt = row.getAttribute('data-msg-prompt') || '';
    const imgEl = row.querySelector('.imagegen-result-img');
    if (!imgEl) return;

    const settings = loadImagegenSettings();
    const newSeed = Math.floor(Math.random() * 2147483647);

    // 显示加载状态
    const actionsDiv = row.querySelector('.imagegen-actions');
    const rerollBtn = actionsDiv?.querySelector('[title="重绘"]');
    if (rerollBtn) rerollBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const friend = (typeof friendsData !== 'undefined' && currentChatId) ? friendsData[currentChatId] : null;
        const finalPrompt = buildFinalPrompt(prompt, currentChatId);
        const finalNeg = buildFinalNegativePrompt(currentChatId);

        let imgs;
        if (settings.activeEngine === 'nai') {
            imgs = await generateImageNai(finalPrompt, finalNeg, { seed: newSeed });
        } else {
            imgs = await generateImagePollinations(finalPrompt, { seed: newSeed });
        }

        if (imgs && imgs[0]) {
            imgEl.src = imgs[0];
            // 更新历史中的图片
            if (currentChatId && typeof loadChatHistory === 'function') {
                const history = await loadChatHistory(currentChatId);
                const idx = history.findIndex(m => m.id === msgId);
                if (idx !== -1) {
                    history[idx].text = `[GENIMG_DATA:${imgs[0]}|PROMPT:${prompt}]`;
                    history[idx].imagePrompt = prompt;
                    await IDB.set(scopedChatKey(currentChatId), history);
                }
            }
            if (typeof showToast === 'function') showToast('✨ 重绘完成');
        }
    } catch (e) {
        if (typeof showToast === 'function') showToast(`重绘失败: ${e.message.slice(0, 40)}`);
        console.error('[Reroll]', e);
    } finally {
        if (rerollBtn) rerollBtn.innerHTML = '<i class="fas fa-dice"></i>';
    }
};

// =========================================
// 下载图片
// =========================================

window.downloadGeneratedImage = function(msgId) {
    const row = document.querySelector(`.chat-row[data-msg-id="${msgId}"]`);
    if (!row) return;
    const imgEl = row.querySelector('.imagegen-result-img');
    if (!imgEl || !imgEl.src) return;

    const a = document.createElement('a');
    a.href = imgEl.src;
    a.download = `generated_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (typeof showToast === 'function') showToast('✅ 图片已下载');
};

// =========================================
// 全屏查看图片
// =========================================

window.openImageFullscreen = function(msgId) {
    const row = document.querySelector(`.chat-row[data-msg-id="${msgId}"]`);
    if (!row) return;
    const imgEl = row.querySelector('.imagegen-result-img');
    if (!imgEl || !imgEl.src) return;

    let overlay = document.getElementById('imagegen-fullscreen-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'imagegen-fullscreen-overlay';
        overlay.style.cssText = `position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;`;
        overlay.innerHTML = `
            <img id="imagegen-fullscreen-img" style="max-width:95%;max-height:80vh;object-fit:contain;border-radius:8px;">
            <div style="display:flex;gap:20px;margin-top:20px;">
                <div onclick="downloadFullscreenImage()" style="background:#fff;color:#111;border-radius:30px;padding:10px 24px;font-size:14px;font-weight:700;cursor:pointer;"><i class="fas fa-download"></i> 下载</div>
                <div onclick="document.getElementById('imagegen-fullscreen-overlay').remove()" style="background:rgba(255,255,255,0.15);color:#fff;border-radius:30px;padding:10px 24px;font-size:14px;cursor:pointer;"><i class="fas fa-times"></i> 关闭</div>
            </div>
        `;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
        document.body.appendChild(overlay);
    }

    const fullImg = overlay.querySelector('#imagegen-fullscreen-img');
    if (fullImg) fullImg.src = imgEl.src;
    overlay.style.display = 'flex';
};

window.downloadFullscreenImage = function() {
    const img = document.getElementById('imagegen-fullscreen-img');
    if (!img || !img.src) return;
    const a = document.createElement('a');
    a.href = img.src;
    a.download = `image_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

// =========================================
// 图片气泡右键菜单
// =========================================

function showImageBubbleMenu(e, msgId, dataUrl) {
    let menu = document.getElementById('imagegen-context-menu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'imagegen-context-menu';
        menu.className = 'wc-bubble-menu';
        menu.style.zIndex = '99998';
        document.body.appendChild(menu);
    }

    menu.innerHTML = `
        <div class="wc-menu-item" onclick="rerollImage('${msgId}'); document.getElementById('imagegen-context-menu').classList.remove('show');">
            <i class="fas fa-dice"></i> 🎨 重绘图片
        </div>
        <div class="wc-menu-item" onclick="downloadGeneratedImage('${msgId}'); document.getElementById('imagegen-context-menu').classList.remove('show');">
            <i class="fas fa-download"></i> 下载图片
        </div>
        <div class="wc-menu-item" onclick="openImageFullscreen('${msgId}'); document.getElementById('imagegen-context-menu').classList.remove('show');">
            <i class="fas fa-expand"></i> 全屏查看
        </div>
    `;

    let clientX = e.clientX || (e.touches && e.touches[0]?.clientX) || 200;
    let clientY = e.clientY || (e.touches && e.touches[0]?.clientY) || 300;

    menu.classList.add('show');
    menu.style.left = Math.min(clientX, window.innerWidth - 160) + 'px';
    menu.style.top = Math.min(clientY - 120, window.innerHeight - 140) + 'px';

    const closeMenu = () => {
        menu.classList.remove('show');
        document.removeEventListener('click', closeMenu);
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 100);
}

// =========================================
// 历史记录中生成图片的渲染恢复
// =========================================

/**
 * 在 appendMessage 之前预处理历史记录中的图片消息
 */
window.tryRestoreGeneratedImageBubble = function(msgData, row) {
    if (!msgData || !msgData.isGeneratedImage) return false;
    if (!msgData.text || !msgData.text.startsWith('[GENIMG_DATA:')) return false;

    const inner = msgData.text.slice('[GENIMG_DATA:'.length);
    const sepIdx = inner.indexOf('|PROMPT:');
    const dataUrl = sepIdx !== -1 ? inner.slice(0, sepIdx) : inner.replace(/\]$/, '');
    const prompt = sepIdx !== -1 ? inner.slice(sepIdx + 8).replace(/\]$/, '') : '';

    row.setAttribute('data-msg-prompt', prompt);
    row.setAttribute('data-msg-text', '[生成图片]');

    const bubble = row.querySelector('.message-bubble') || document.createElement('div');
    bubble.className = 'message-bubble received rich-bubble imagegen-bubble';
    bubble.innerHTML = `
        <div class="imagegen-img-wrap" style="position:relative;">
            <img src="${dataUrl}" class="imagegen-result-img" style="max-width:200px; max-height:280px; border-radius:12px; display:block; cursor:pointer;"
                 onclick="openImageFullscreen('${msgData.id}')"
                 oncontextmenu="return false;">
            <div class="imagegen-actions" style="position:absolute; bottom:6px; right:6px; display:flex; gap:6px;">
                <div onclick="rerollImage('${msgData.id}')" title="重绘" style="background:rgba(0,0,0,0.5);color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;">
                    <i class="fas fa-dice"></i>
                </div>
                <div onclick="downloadGeneratedImage('${msgData.id}')" title="下载" style="background:rgba(0,0,0,0.5);color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;">
                    <i class="fas fa-download"></i>
                </div>
            </div>
        </div>`;

    return bubble;
};

// =========================================
// 线下模式自动生图
// =========================================

/**
 * 在线下模式的 AI 回复后，自动生成一张插图
 */
async function generateOfflineModeImage(sceneDescription, chatId) {
    const settings = loadImagegenSettings();
    if (!settings.offlineAutoImage) return;

    const engine = settings.offlineAutoImageEngine || 'pollinations';
    const container = document.getElementById('offline-log-container');
    if (!container) return;

    // 插入加载占位
    const placeholder = document.createElement('div');
    placeholder.className = 'offline-entry ai';
    placeholder.style.cssText = 'text-align:center; padding:15px;';
    placeholder.innerHTML = '<i class="fas fa-spinner fa-spin" style="color:#aaa; font-size:20px;"></i>';
    const dmArea = container.querySelector('.offline-danmaku-area');
    if (dmArea) container.insertBefore(placeholder, dmArea);
    else container.appendChild(placeholder);

    try {
        const imgs = await generateImages(sceneDescription, chatId, { engine });
        if (imgs && imgs[0]) {
            const imgEl = document.createElement('img');
            imgEl.src = imgs[0];
            imgEl.style.cssText = 'max-width:90%; max-height:300px; border-radius:16px; display:block; margin:0 auto; cursor:pointer;';
            imgEl.onclick = () => {
                const a = document.createElement('a');
                a.href = imgs[0];
                a.download = `offline_img_${Date.now()}.png`;
                a.click();
            };
            placeholder.innerHTML = '';
            placeholder.appendChild(imgEl);
            container.scrollTop = container.scrollHeight;
        } else {
            placeholder.remove();
        }
    } catch (e) {
        console.warn('[OfflineAutoImage]', e.message);
        placeholder.remove();
    }
}

// =========================================
// 测试生成弹窗
// =========================================

window.openImagegenTestModal = function() {
    let modal = document.getElementById('imagegen-test-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'imagegen-test-modal';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '9999';
        modal.innerHTML = `
            <div class="modal-box" style="width:340px; border-radius:24px; overflow:hidden;">
                <div class="modal-header">
                    <span>🎨 测试生成</span>
                    <i class="fas fa-times" onclick="document.getElementById('imagegen-test-modal').classList.remove('active')"></i>
                </div>
                <div class="modal-body" style="padding:20px; display:flex; flex-direction:column; gap:12px;">
                    <div class="form-group">
                        <label>引擎</label>
                        <select id="imgtest-engine">
                            <option value="nai">NovelAI</option>
                            <option value="pollinations">Pollinations</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>正面提示词 (Positive Prompt)</label>
                        <textarea id="imgtest-positive" rows="3" placeholder="masterpiece, 1girl, smile..."></textarea>
                    </div>
                    <div class="form-group">
                        <label>负面提示词 (Negative Prompt)</label>
                        <textarea id="imgtest-negative" rows="2" placeholder="lowres, bad anatomy..."></textarea>
                    </div>
                    <div id="imgtest-result" style="min-height:60px; text-align:center;">
                        <span style="color:#ccc; font-size:12px;">结果将显示在此</span>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-cancel" onclick="document.getElementById('imagegen-test-modal').classList.remove('active')">关闭</button>
                    <button class="btn-confirm" onclick="runImagegenTest()" id="imgtest-btn">生成</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.classList.add('active');
};

window.runImagegenTest = async function() {
    const btn = document.getElementById('imgtest-btn');
    const resultDiv = document.getElementById('imgtest-result');
    const engine = document.getElementById('imgtest-engine').value;
    const positive = document.getElementById('imgtest-positive').value.trim();
    const negative = document.getElementById('imgtest-negative').value.trim();

    if (!positive) { if (typeof showToast === 'function') showToast('请输入正面提示词'); return; }

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...';
    btn.disabled = true;
    resultDiv.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size:24px; color:#aaa;"></i>';

    try {
        let imgs;
        if (engine === 'nai') {
            imgs = await generateImageNai(positive, negative);
        } else {
            imgs = await generateImagePollinations(positive);
        }

        if (imgs && imgs[0]) {
            resultDiv.innerHTML = `
                <div style="position:relative; display:inline-block;">
                    <img src="${imgs[0]}" style="max-width:280px; max-height:280px; border-radius:12px; display:block;">
                    <a href="${imgs[0]}" download="test_${Date.now()}.png" style="position:absolute; bottom:8px; right:8px; background:rgba(0,0,0,0.5); color:#fff; border-radius:20px; padding:6px 12px; font-size:12px; text-decoration:none;">
                        <i class="fas fa-download"></i> 下载
                    </a>
                </div>
            `;
        } else {
            resultDiv.innerHTML = '<span style="color:#ff4d4f; font-size:12px;">生成失败：未收到图片</span>';
        }
    } catch (e) {
        resultDiv.innerHTML = `<span style="color:#ff4d4f; font-size:12px;">错误：${e.message.slice(0, 100)}</span>`;
    } finally {
        btn.innerHTML = '生成';
        btn.disabled = false;
    }
};

// =========================================
// 初始化 API 设置界面中的图像生成配置
// =========================================

window.initImagegenSettingsUI = function() {
    const settings = loadImagegenSettings();

    // NovelAI
    const naiKey = document.getElementById('nai-api-key');
    const naiModel = document.getElementById('nai-model-select');
    const naiSize = document.getElementById('nai-size-select');
    const naiSteps = document.getElementById('nai-steps-input');
    const naiCfg = document.getElementById('nai-cfg-input');
    const naiSampler = document.getElementById('nai-sampler-select');
    const naiSeed = document.getElementById('nai-seed-input');
    const naiUcPreset = document.getElementById('nai-uc-preset');
    const naiQuality = document.getElementById('nai-quality-toggle');
    const naiSmea = document.getElementById('nai-smea-toggle');
    const naiSmeaDyn = document.getElementById('nai-smea-dyn-toggle');
    const naiProxy = document.getElementById('nai-proxy-select');
    const naiCustomProxy = document.getElementById('nai-custom-proxy');
    const naiDefaultPos = document.getElementById('nai-default-positive');
    const naiDefaultNeg = document.getElementById('nai-default-negative');

    if (naiKey) naiKey.value = settings.naiApiKey || '';
    if (naiModel) {
        naiModel.innerHTML = NAI_MODELS.map(m => `<option value="${m.value}" ${settings.naiModel === m.value ? 'selected' : ''}>${m.label}</option>`).join('');
    }
    if (naiSize) {
        naiSize.innerHTML = NAI_SIZES.map((s, i) => `<option value="${i}" ${settings.naiWidth === s.w && settings.naiHeight === s.h ? 'selected' : ''}>${s.label}</option>`).join('');
    }
    if (naiSteps) naiSteps.value = settings.naiSteps;
    if (naiCfg) naiCfg.value = settings.naiCfgScale;
    if (naiSampler) {
        naiSampler.innerHTML = NAI_SAMPLERS.map(s => `<option value="${s}" ${settings.naiSampler === s ? 'selected' : ''}>${s}</option>`).join('');
    }
    if (naiSeed) naiSeed.value = settings.naiSeed;
    if (naiUcPreset) naiUcPreset.value = settings.naiUcPreset;
    if (naiQuality) naiQuality.checked = settings.naiQualityToggle;
    if (naiSmea) naiSmea.checked = settings.naiSmea;
    if (naiSmeaDyn) naiSmeaDyn.checked = settings.naiSmeaDyn;
    if (naiProxy) {
        naiProxy.value = settings.naiCorsProxy || 'https://corsproxy.io/?';
        toggleNaiCustomProxy(naiProxy.value);
    }
    if (naiCustomProxy) naiCustomProxy.value = settings.naiCustomProxy || '';
    if (naiDefaultPos) naiDefaultPos.value = settings.naiDefaultPositive || '';
    if (naiDefaultNeg) naiDefaultNeg.value = settings.naiDefaultNegative || '';

    // Pollinations
    const polKey = document.getElementById('pol-api-key');
    const polModel = document.getElementById('pol-model-input');
    const polEnhance = document.getElementById('pol-enhance-toggle');
    if (polKey) polKey.value = settings.polApiKey || '';
    if (polModel) polModel.value = settings.polModel || 'flux';
    if (polEnhance) polEnhance.checked = settings.polEnhance;

    // 通用
    const activeEngine = document.getElementById('imagegen-active-engine');
    if (activeEngine) activeEngine.value = settings.activeEngine || 'pollinations';

    const offlineAuto = document.getElementById('imagegen-offline-auto');
    if (offlineAuto) offlineAuto.checked = settings.offlineAutoImage;

    const offlineEngine = document.getElementById('imagegen-offline-engine');
    if (offlineEngine) offlineEngine.value = settings.offlineAutoImageEngine || 'pollinations';
};

window.saveImagegenSettingsUI = function() {
    const settings = loadImagegenSettings();

    // NAI
    const naiKey = document.getElementById('nai-api-key');
    const naiModel = document.getElementById('nai-model-select');
    const naiSize = document.getElementById('nai-size-select');
    const naiSteps = document.getElementById('nai-steps-input');
    const naiCfg = document.getElementById('nai-cfg-input');
    const naiSampler = document.getElementById('nai-sampler-select');
    const naiSeed = document.getElementById('nai-seed-input');
    const naiUcPreset = document.getElementById('nai-uc-preset');
    const naiQuality = document.getElementById('nai-quality-toggle');
    const naiSmea = document.getElementById('nai-smea-toggle');
    const naiSmeaDyn = document.getElementById('nai-smea-dyn-toggle');
    const naiProxy = document.getElementById('nai-proxy-select');
    const naiCustomProxy = document.getElementById('nai-custom-proxy');
    const naiDefaultPos = document.getElementById('nai-default-positive');
    const naiDefaultNeg = document.getElementById('nai-default-negative');

    if (naiKey) settings.naiApiKey = naiKey.value.trim();
    if (naiModel) settings.naiModel = naiModel.value;
    if (naiSize) {
        const sizeIdx = parseInt(naiSize.value);
        if (NAI_SIZES[sizeIdx]) {
            settings.naiWidth = NAI_SIZES[sizeIdx].w;
            settings.naiHeight = NAI_SIZES[sizeIdx].h;
        }
    }
    if (naiSteps) settings.naiSteps = parseInt(naiSteps.value) || 28;
    if (naiCfg) settings.naiCfgScale = parseFloat(naiCfg.value) || 5;
    if (naiSampler) settings.naiSampler = naiSampler.value;
    if (naiSeed) settings.naiSeed = parseInt(naiSeed.value) ?? -1;
    if (naiUcPreset) settings.naiUcPreset = parseInt(naiUcPreset.value) || 0;
    if (naiQuality) settings.naiQualityToggle = naiQuality.checked;
    if (naiSmea) settings.naiSmea = naiSmea.checked;
    if (naiSmeaDyn) settings.naiSmeaDyn = naiSmeaDyn.checked;
    if (naiProxy) settings.naiCorsProxy = naiProxy.value;
    if (naiCustomProxy) settings.naiCustomProxy = naiCustomProxy.value.trim();
    if (naiDefaultPos) settings.naiDefaultPositive = naiDefaultPos.value.trim();
    if (naiDefaultNeg) settings.naiDefaultNegative = naiDefaultNeg.value.trim();

    // Pollinations
    const polKey = document.getElementById('pol-api-key');
    const polModel = document.getElementById('pol-model-input');
    const polEnhance = document.getElementById('pol-enhance-toggle');
    if (polKey) settings.polApiKey = polKey.value.trim();
    if (polModel) settings.polModel = polModel.value.trim() || 'flux';
    if (polEnhance) settings.polEnhance = polEnhance.checked;

    // 通用
    const activeEngine = document.getElementById('imagegen-active-engine');
    if (activeEngine) settings.activeEngine = activeEngine.value;

    const offlineAuto = document.getElementById('imagegen-offline-auto');
    if (offlineAuto) settings.offlineAutoImage = offlineAuto.checked;

    const offlineEngine = document.getElementById('imagegen-offline-engine');
    if (offlineEngine) settings.offlineAutoImageEngine = offlineEngine.value;

    saveImagegenSettings(settings);
    if (typeof showToast === 'function') showToast('✅ 图像生成设置已保存');
};

window.toggleNaiCustomProxy = function(val) {
    const box = document.getElementById('nai-custom-proxy-box');
    if (box) box.style.display = val === 'custom' ? 'block' : 'none';
};

// =========================================
// 在聊天设置中读写角色专属提示词
// =========================================

window.loadCharImagegenSettings = function() {
    if (!currentChatId || !friendsData[currentChatId]) return;
    const friend = friendsData[currentChatId];
    if (!friend.imagegenSettings) friend.imagegenSettings = {};

    const posEl = document.getElementById('cs-char-img-positive');
    const negEl = document.getElementById('cs-char-img-negative');
    if (posEl) posEl.value = friend.imagegenSettings.charPositivePrompt || '';
    if (negEl) negEl.value = friend.imagegenSettings.charNegativePrompt || '';
};

window.saveCharImagegenSettings = function() {
    if (!currentChatId || !friendsData[currentChatId]) return;
    const friend = friendsData[currentChatId];
    if (!friend.imagegenSettings) friend.imagegenSettings = {};

    const posEl = document.getElementById('cs-char-img-positive');
    const negEl = document.getElementById('cs-char-img-negative');
    if (posEl) friend.imagegenSettings.charPositivePrompt = posEl.value.trim();
    if (negEl) friend.imagegenSettings.charNegativePrompt = negEl.value.trim();

    if (typeof saveFriendsData === 'function') saveFriendsData();
};

// =========================================
// 九宫格多图渲染（Pollinations 专属）
// =========================================

async function generateAndShowImageGrid(prompts, chatId) {
    const avatarUrl = (typeof friendsData !== 'undefined' && chatId && friendsData[chatId])
        ? friendsData[chatId].avatar : null;
    const senderName = (typeof friendsData !== 'undefined' && chatId && friendsData[chatId])
        ? (friendsData[chatId].remark || friendsData[chatId].realName) : chatId;

    // 限制最多9张
    const limited = prompts.slice(0, 9);
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    const msgId = 'msg_grid_' + Date.now();
    const row = document.createElement('div');
    row.className = 'chat-row received';
    row.setAttribute('data-msg-id', msgId);
    row.setAttribute('data-msg-text', '[图片组]');

    const img = document.createElement('img');
    img.className = 'chat-avatar-img';
    img.src = avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=AI`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble received rich-bubble';

    const cols = limited.length <= 1 ? 1 : (limited.length <= 4 ? 2 : 3);
    const gridDiv = document.createElement('div');
    gridDiv.style.cssText = `display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;border-radius:12px;overflow:hidden;max-width:220px;`;

    // 初始化占位符
    const imgEls = limited.map(() => {
        const el = document.createElement('div');
        el.style.cssText = `width:100%;aspect-ratio:1;background:#f0f0f0;display:flex;align-items:center;justify-content:center;`;
        el.innerHTML = '<i class="fas fa-spinner fa-spin" style="color:#ccc;"></i>';
        gridDiv.appendChild(el);
        return el;
    });

    bubble.appendChild(gridDiv);
    const checkboxWrap = document.createElement('div');
    checkboxWrap.className = 'chat-row-checkbox';
    checkboxWrap.innerHTML = `<div class="wc-msg-checkbox" onclick="toggleMsgSelection(this)"></div>`;
    row.appendChild(checkboxWrap);
    row.appendChild(img);
    row.appendChild(bubble);
    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // 并行生成所有图片
    await Promise.allSettled(limited.map(async (prompt, i) => {
        try {
            const imgs = await generateImagePollinations(prompt);
            if (imgs && imgs[0]) {
                const el = imgEls[i];
                el.style.cssText = 'width:100%;aspect-ratio:1;overflow:hidden;position:relative;';
                el.innerHTML = `
                    <img src="${imgs[0]}" style="width:100%;height:100%;object-fit:cover;cursor:pointer;" onclick="openImageFullscreenFromSrc('${imgs[0].slice(0, 50)}...')">
                    <div onclick="downloadFromDataUrl('${imgs[0]}')" style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.5);color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:9px;">
                        <i class="fas fa-download"></i>
                    </div>
                `;
                el.querySelector('img').addEventListener('click', function() {
                    openImageFullscreenFromDataUrl(imgs[0]);
                });
                el.querySelector('[onclick]').setAttribute('onclick', '');
                el.querySelector('.fa-download')?.parentElement?.addEventListener('click', function() {
                    downloadFromDataUrl(imgs[0]);
                });
            }
        } catch (e) {
            const el = imgEls[i];
            el.style.background = '#ffecec';
            el.innerHTML = '<i class="fas fa-exclamation" style="color:#ff4d4f; font-size:10px;"></i>';
        }
    }));
}

window.openImageFullscreenFromDataUrl = function(dataUrl) {
    let overlay = document.getElementById('imagegen-fullscreen-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'imagegen-fullscreen-overlay';
        overlay.style.cssText = `position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;`;
        overlay.innerHTML = `<img id="imagegen-fullscreen-img" style="max-width:95%;max-height:80vh;object-fit:contain;border-radius:8px;">
            <div style="display:flex;gap:20px;margin-top:20px;">
                <div onclick="downloadFullscreenImage()" style="background:#fff;color:#111;border-radius:30px;padding:10px 24px;font-size:14px;font-weight:700;cursor:pointer;"><i class="fas fa-download"></i> 下载</div>
                <div onclick="document.getElementById('imagegen-fullscreen-overlay').remove()" style="background:rgba(255,255,255,0.15);color:#fff;border-radius:30px;padding:10px 24px;font-size:14px;cursor:pointer;"><i class="fas fa-times"></i> 关闭</div>
            </div>`;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }
    const fullImg = overlay.querySelector('#imagegen-fullscreen-img');
    if (fullImg) fullImg.src = dataUrl;
    overlay.style.display = 'flex';
};

window.downloadFromDataUrl = function(dataUrl) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `image_${Date.now()}.png`;
    a.click();
};

// =========================================
// 在 apps.js sendMessageToAI 的输出流中挂钩
// =========================================

// 监听 AI 回复，解析图像生成指令
// 这个函数由 apps.js 的 sendMessageToAI 在处理 rawReply 之后调用
window.processImagegenFromAIReply = async function(rawReply, chatId) {
    return await parseAndHandleImageCommands(rawReply, chatId);
};

// =========================================
// 初始化
// =========================================

document.addEventListener('DOMContentLoaded', () => {
    // 初始化设置界面（如果在 settings 页面）
    const settingsView = document.getElementById('settingsView');
    if (settingsView) {
        // 当设置界面打开时初始化
        const observer = new MutationObserver(() => {
            if (settingsView.classList.contains('show')) {
                initImagegenSettingsUI();
            }
        });
        observer.observe(settingsView, { attributes: true, attributeFilter: ['class'] });
    }
});

console.log('[ImageGen] 双引擎图像生成模块已加载 (NAI + Pollinations)');
