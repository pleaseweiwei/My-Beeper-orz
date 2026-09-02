/**
 * 电量状态变化时的提示逻辑
 * 通过大模型 API 结合随机角色的系统提示词，生成专属的电量提示台词，并通过横幅展示
 */

// 横幅显示/隐藏时长配置
const BANNER_DISPLAY_TIME = 5000;
const BANNER_ANIMATION_TIME = 300;

// 防止频繁触发的锁
let isNotifying = false;

/**
 * 创建并显示横幅组件
 * @param {string} characterName - 角色名字
 * @param {string} avatarUrl - 角色头像 URL
 * @param {string} text - 提示文案
 */
function showBatteryBanner(characterName, avatarUrl, text) {
    let banner = document.getElementById('battery-notification-banner');
    
    // 如果没有，则创建
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'battery-notification-banner';
        
        // 内联样式，也可以抽到 css 中
        Object.assign(banner.style, {
            position: 'absolute',
            bottom: 'env(safe-area-inset-bottom, 20px)', // 贴近底部充电口位置
            left: '50%',
            transform: 'translateX(-50%) translateY(150%)', // 初始在屏幕外下方
            width: '90%',
            maxWidth: '340px',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            borderRadius: '16px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            zIndex: '9999',
            transition: `transform ${BANNER_ANIMATION_TIME}ms cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity ${BANNER_ANIMATION_TIME}ms ease`,
            opacity: '0',
            pointerEvents: 'none' // 不影响下方元素点击
        });
        
        // 横幅内部结构
        banner.innerHTML = `
            <img id="btn-banner-avatar" src="" alt="avatar" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <div style="flex: 1; display: flex; flex-direction: column; gap: 4px; overflow: hidden;">
                <span id="btn-banner-name" style="font-size: calc(13px * var(--font-scale)); font-weight: 600; color: #333; line-height: 1;"></span>
                <span id="btn-banner-text" style="font-size: calc(12px * var(--font-scale)); color: #666; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis;"></span>
            </div>
        `;
        
        // 挂载到 phone 容器内
        const phoneContainer = document.querySelector('.phone');
        if (phoneContainer) {
            phoneContainer.appendChild(banner);
        } else {
            document.body.appendChild(banner);
        }
    }
    
    // 更新内容
    document.getElementById('btn-banner-avatar').src = avatarUrl || 'icon.png';
    document.getElementById('btn-banner-name').innerText = characterName || 'System';
    document.getElementById('btn-banner-text').innerText = text || '...';
    
    // 显示动画
    // 强制重绘
    banner.offsetHeight;
    banner.style.transform = 'translateX(-50%) translateY(-20px)'; // 向上弹起
    banner.style.opacity = '1';
    
    // 隐藏动画定时器
    setTimeout(() => {
        banner.style.transform = 'translateX(-50%) translateY(150%)'; // 收回屏幕外
        banner.style.opacity = '0';
        
        // 释放锁
        setTimeout(() => {
            isNotifying = false;
        }, BANNER_ANIMATION_TIME);
        
    }, BANNER_DISPLAY_TIME);
}

/**
 * 全局函数，供 js/core.js 中调用
 * @param {string} type - 状态类型：'charging', 'discharging', 'low_20', 'low_10', 'full'
 * @param {number} level - 当前电量 (0-100)
 */
async function triggerBatteryNotification(type, level) {
    if (isNotifying) return; // 避免并发弹窗
    isNotifying = true;
    
    // 1. 获取一个随机角色 (利用已有逻辑)
    // 假设存在 currentCharacters 或从本地存储读取
    let characters = [];
    if (typeof currentCharacters !== 'undefined' && currentCharacters.length > 0) {
        characters = currentCharacters;
    } else {
        const saved = localStorage.getItem('characters');
        if (saved) {
            try {
                characters = JSON.parse(saved);
            } catch (e) {
                console.error("解析角色数据失败", e);
            }
        }
    }
    
    // 如果没有角色数据，则不展示 AI 提示，可以用默认提示代替
    if (!characters || characters.length === 0) {
        console.log("无角色数据，取消电量 AI 提示");
        isNotifying = false;
        return;
    }
    
    // 随机选择一个角色
    const randomChar = characters[Math.floor(Math.random() * characters.length)];
    const charName = randomChar.name || "System";
    const charAvatar = randomChar.avatar || "icon.png";
    const charSystemPrompt = randomChar.systemPrompt || "你是一个友好的助手。";
    
    // 2. 构造情境 Prompt
    let situationDesc = "";
    switch(type) {
        case 'charging': situationDesc = `手机刚才接上了充电器开始充电了，目前电量是 ${level}%。`; break;
        case 'discharging': situationDesc = `手机刚才拔下了充电器，现在是使用电池状态，目前电量是 ${level}%。`; break;
        case 'low_20': situationDesc = `手机电量低于 20% 了，有点危险，目前电量 ${level}%。`; break;
        case 'low_10': situationDesc = `手机电量极其危险，只剩下 ${level}% 了，快要关机了！`; break;
        case 'full': situationDesc = `手机终于充满电了，达到 ${level}%，可以拔掉充电器了。`; break;
        default: situationDesc = `手机电量有变化，当前电量 ${level}%。`;
    }
    
    const prompt = `
你现在扮演 ${charName}。请根据你的角色设定，用一两句话对“${situationDesc}”这个情况做出反应，像平时发微信消息一样自然。
要求：
1. 必须符合你的角色性格和说话口吻（高冷、傲娇、温柔、暴躁等）。
2. 字数控制在 20-40 字以内，简短精炼。
3. 直接输出你说的台词，不要包含任何动作描述、括号或额外说明。
    `.trim();

    // 3. 调用 AI 接口获取台词
    try {
        let aiResponse = "（电量提示获取中...）"; // 默认加载态
        
        // 尝试调用通用的 AI 请求逻辑 (假设已有 window.callAI / fetchAI 等，这里基于当前项目结构尝试)
        // 从设置中获取 API Key 和 URL
        const apiSettingsStr = localStorage.getItem('apiSettings');
        if (apiSettingsStr) {
             const apiSettings = JSON.parse(apiSettingsStr);
             if (apiSettings.apiKey && apiSettings.apiUrl) {
                 const response = await fetch(apiSettings.apiUrl, {
                     method: 'POST',
                     headers: {
                         'Content-Type': 'application/json',
                         'Authorization': `Bearer ${apiSettings.apiKey}`
                     },
                     body: JSON.stringify({
                         model: apiSettings.model || "gpt-3.5-turbo",
                         messages: [
                             { role: "system", content: charSystemPrompt },
                             { role: "user", content: prompt }
                         ],
                         temperature: 0.7,
                         max_tokens: 50
                     })
                 });
                 
                 if (response.ok) {
                     const data = await response.json();
                     if (data.choices && data.choices.length > 0) {
                         aiResponse = data.choices[0].message.content.trim();
                     }
                 } else {
                     console.error("电量提示 AI 请求失败:", response.status);
                     aiResponse = "哎呀，电量变化了，不过我这信号不太好没想好怎么吐槽呢。";
                 }
             } else {
                 aiResponse = `[系统] 未配置 API。当前电量：${level}%`;
             }
        } else {
             aiResponse = `[系统] 未配置 API。当前电量：${level}%`;
        }
        
        // 清理一下可能带有的引号
        aiResponse = aiResponse.replace(/^["']|["']$/g, '');
        
        // 4. 显示横幅
        showBatteryBanner(charName, charAvatar, aiResponse);
        
    } catch (error) {
        console.error("触发电量 AI 提示异常", error);
        isNotifying = false;
    }
}
