/**
 * Files App (Storage Visualization)
 * 韩系极简黑白灰风格
 */

// 打开 Files App
function openFilesApp() {
    const app = document.getElementById('filesApp');
    if (app) {
        app.style.display = 'flex';
        // 每次打开时，重新渲染环形图动画
        renderDonutChart();
    }
}

// 关闭 Files App
function closeFilesApp() {
    const app = document.getElementById('filesApp');
    if (app) {
        app.style.display = 'none';
        
        // 重置所有的工具卡片状态
        document.querySelectorAll('.files-tool-card').forEach(card => {
            card.classList.remove('loading', 'done');
            const iconWrap = card.querySelector('.files-tool-icon');
            if (iconWrap) {
                // 恢复原来的图标
                const isCache = card.querySelector('.files-tool-title').innerText.includes('Cache');
                const isCompress = card.querySelector('.files-tool-title').innerText.includes('Compress');
                const isRepair = card.querySelector('.files-tool-title').innerText.includes('Repair');
                
                let iconClass = 'fas fa-broom';
                if (isCompress) iconClass = 'fas fa-compress-arrows-alt';
                if (isRepair) iconClass = 'fas fa-wrench';
                
                iconWrap.innerHTML = `<i class="${iconClass}"></i>`;
            }
            const progressBar = card.querySelector('.files-tool-progress-bar');
            if (progressBar) progressBar.style.width = '0%';
        });
    }
}

// 渲染环形图
function renderDonutChart() {
    const chart = document.getElementById('files-donut-chart');
    if (!chart) return;

    // 先重置为 0
    chart.style.background = `conic-gradient(
        #111 0% 0%, 
        #888 0% 0%, 
        #ccc 0% 0%, 
        #eee 0% 100%
    )`;

    // 延迟一点时间加上动画目标值
    setTimeout(() => {
        // 设定分布比例: Apps 45%, Photos 30% (到75%), System 15% (到90%), Other 10% (到100%)
        chart.style.background = `conic-gradient(
            #111 0% 45%, 
            #888 45% 75%, 
            #ccc 75% 90%, 
            #eee 90% 100%
        )`;
    }, 100);
}

// 模拟高级工具的运行
function simulateFilesTool(type, element) {
    // 防止重复点击
    if (element.classList.contains('loading') || element.classList.contains('done')) return;

    const iconWrap = element.querySelector('.files-tool-icon');
    const progressBar = element.querySelector('.files-tool-progress-bar');
    const originalIcon = iconWrap.innerHTML;

    // 变为 loading 状态
    element.classList.add('loading');
    iconWrap.innerHTML = '<i class="fas fa-spinner"></i>';
    
    // 进度条模拟
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 15 + 5; // 每次加 5~20
        if (progress > 100) progress = 100;
        if (progressBar) progressBar.style.width = `${progress}%`;

        if (progress === 100) {
            clearInterval(interval);
            setTimeout(() => {
                // 完成状态
                element.classList.remove('loading');
                element.classList.add('done');
                iconWrap.innerHTML = '<i class="fas fa-check"></i>';
                
                // 可选：在这里调用 toast 提示
                if (window.showToast) {
                    let msg = '操作完成';
                    if (type === 'cache') msg = '已清理 1.2 GB 缓存';
                    if (type === 'compress') msg = '照片库已优化';
                    if (type === 'repair') msg = '数据修复完成';
                    showToast(msg);
                }
            }, 300); // 进度条满后稍微停顿一下
        }
    }, 200);
}
