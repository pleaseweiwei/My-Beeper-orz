/**
 * iOS Safari 真实视口高度修复
 * 100vh / 100dvh 在 iOS Safari 上含浏览器工具栏，导致内容偏上、底部空白。
 * 用 window.innerHeight 设置 --vh，再用 calc(var(--vh) * 100) 替代 100vh。
 */
function setVh() {
    document.documentElement.style.setProperty('--vh', window.innerHeight + 'px');
}
// 页面加载时立即执行一次
setVh();
// 横竖屏切换 / 地址栏收起展开时重新计算
window.addEventListener('resize', setVh);
window.addEventListener('orientationchange', function () {
    // 延迟 100ms，等待浏览器完成布局再读取高度
    setTimeout(setVh, 100);
});

/**
 * 更新时钟和日期
 */
function updateClock() {
    const d = new Date();
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    
    // 确保元素存在再更新
    const hElement = document.getElementById('h');
    const mElement = document.getElementById('m');
    const fullDateElement = document.getElementById('fullDate');

    if (hElement) hElement.innerText = h;
    if (mElement) mElement.innerText = m;

    // === 新增：更新状态栏时间 ===
    const sbTimeElement = document.getElementById('sb-time-display');
    if (sbTimeElement) {
        sbTimeElement.innerText = `${h}:${m}`;
    }

    // === 新增：更新全局状态栏电池电量 ===
    const sbBatteryIcon = document.getElementById('sb-battery-icon');
    if (sbBatteryIcon && navigator.getBattery) {
        navigator.getBattery().then(function(battery) {
            function updateBattery() {
                const level = battery.level * 100;
                let iconClass = 'fa-battery-empty';
                if (level > 87.5) iconClass = 'fa-battery-full';
                else if (level > 62.5) iconClass = 'fa-battery-three-quarters';
                else if (level > 37.5) iconClass = 'fa-battery-half';
                else if (level > 12.5) iconClass = 'fa-battery-quarter';
                
                sbBatteryIcon.className = `fas ${iconClass}`;
                if (battery.charging) {
                    sbBatteryIcon.style.color = '#4cd964';
                } else if (level <= 20) {
                    sbBatteryIcon.style.color = '#ff3b30';
                } else {
                    sbBatteryIcon.style.color = '';
                }
            }
            updateBattery();
            battery.addEventListener('levelchange', updateBattery);
            battery.addEventListener('chargingchange', updateBattery);
        }).catch(function() {});
    }

    if (fullDateElement) {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        fullDateElement.innerText = `${months[d.getMonth()]} ${d.getDate()}`;
    }
}


/**
 * Toggle Status Bar Visibility
 */
function toggleStatusBar(visible) {
    const statusBar = document.getElementById('global-status-bar');
    if (statusBar) {
        statusBar.style.display = visible ? 'flex' : 'none';
    }
}

/**
 * 切换聊天界面的显示和隐藏
 */
function toggleChat() {
    const chat = document.getElementById('chatLayer');
    if (chat) {
        chat.classList.toggle('show');
    }
}



// --- 页面加载后立即执行的函数 ---
document.addEventListener('DOMContentLoaded', (event) => {
    updateClock();
    setInterval(updateClock, 60000);
});
