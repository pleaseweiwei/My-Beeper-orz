/**
 * DesktopSort v2 — iOS 风格桌面自由拖拽、跨页移动、网格重排
 * 依赖: SortableJS (全局 Sortable)
 *
 * 核心改造：
 * 1. 运行时将 .grid-apps 内的 .app-cell 提升为 .page 的直接子元素（"拉平"）
 * 2. .page 使用 CSS Grid 4列 混合布局：小组件占满行、app-cell 各占 1 格
 * 3. 每个 .page 一个 Sortable 实例，共享 group 实现跨页拖拽
 * 4. 拖拽到屏幕左右边缘自动翻页
 * 5. 长按 500ms 进入编辑模式（iOS 抖动）
 * 6. localStorage 持久化排列顺序与归属页面
 */
;(function () {
    'use strict';

    const STORAGE_KEY = 'desktop_sort_order_v2';
    let editMode = false;
    let sortableInstances = [];
    let doneBtn = null;
    let edgeScrollTimer = null;
    let leftIndicator = null;
    let rightIndicator = null;
    let flattenDone = false;

    /* ============================
       工具函数
       ============================ */

    function simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(36).substring(0, 6);
    }

    /** 为元素生成/获取唯一 sortId */
    function getSortId(el) {
        if (el.dataset.sortId) return el.dataset.sortId;

        // app-cell 用 data-app-id
        if (el.classList.contains('app-cell') && el.dataset.appId) {
            el.dataset.sortId = 'app-' + el.dataset.appId;
            return el.dataset.sortId;
        }

        // 各类小组件
        if (el.classList.contains('unified-header-widget'))    { el.dataset.sortId = 'header-widget'; return el.dataset.sortId; }
        if (el.classList.contains('music-widget'))              { el.dataset.sortId = 'music-widget'; return el.dataset.sortId; }
        if (el.classList.contains('photo-stack'))               { el.dataset.sortId = 'photo-stack'; return el.dataset.sortId; }
        if (el.classList.contains('k-mood-board'))              { el.dataset.sortId = 'k-mood-board'; return el.dataset.sortId; }
        if (el.classList.contains('collection-ticker-widget'))  { el.dataset.sortId = 'ticker-widget'; return el.dataset.sortId; }
        if (el.classList.contains('receipt-widget'))             { el.dataset.sortId = 'receipt-widget'; return el.dataset.sortId; }
        if (el.classList.contains('dynamic-widget') && el.dataset.widgetType) {
            if (!el.dataset.sortId) {
                el.dataset.sortId = 'widget-' + el.dataset.widgetType + '-' + Date.now() + Math.random().toString(36).substr(2, 5);
            }
            return el.dataset.sortId;
        }
        if (el.id)                                              { el.dataset.sortId = 'id-' + el.id; return el.dataset.sortId; }

        // fallback
        const text = (el.textContent || '').trim().substring(0, 30);
        el.dataset.sortId = 'el-' + el.tagName + '-' + simpleHash(text);
        return el.dataset.sortId;
    }

    /* ============================
       DOM 拉平：把 .grid-apps 内的 .app-cell 提升到 .page 直接子级
       ============================ */

    function flattenPage(page) {
        const grids = Array.from(page.querySelectorAll(':scope > .grid-apps'));
        grids.forEach(function (grid) {
            const cells = Array.from(grid.querySelectorAll(':scope > .app-cell'));
            // 在 grid 位置之前逐个插入 app-cell
            cells.forEach(function (cell) {
                page.insertBefore(cell, grid);
            });
            // 移除空的 grid-apps 容器
            grid.remove();
        });
        page.classList.add('ds-flat');
    }

    function flattenAllPages() {
        if (flattenDone) return;
        document.querySelectorAll('.page').forEach(flattenPage);
        flattenDone = true;
    }

    /** 为所有 .page 的直接子元素标记 sortable-item 并生成 sortId */
    function markSortableItems() {
        document.querySelectorAll('.page').forEach(function (page) {
            Array.from(page.children).forEach(function (el) {
                if (!el.classList.contains('sortable-item')) {
                    el.classList.add('sortable-item');
                }
                getSortId(el);
            });
        });
    }

    /* ============================
       保存 & 恢复排序
       ============================ */

    function saveOrder() {
        const data = {};
        // 增加保存动态组件内容的逻辑
        const dynamicWidgets = {};

        document.querySelectorAll('.page').forEach(function (page) {
            if (!page.id) return;
            data[page.id] = Array.from(page.children)
                .filter(function (el) { return el.classList.contains('sortable-item'); })
                .map(function (el) {
                    const sortId = getSortId(el);
                    // 保存动态组件的类型和内容
                    if (el.classList.contains('dynamic-widget')) {
                        dynamicWidgets[sortId] = {
                            type: el.dataset.widgetType,
                            sizeClass: Array.from(el.classList).find(c => c.startsWith('widget-')),
                            html: el.innerHTML
                        };
                    }
                    return sortId;
                });
        });
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            localStorage.setItem(STORAGE_KEY + '_widgets', JSON.stringify(dynamicWidgets));
        } catch (e) {
            console.warn('[DesktopSort] 保存失败', e);
        }
    }

    function restoreOrder() {
        var raw;
        try {
            raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
        } catch (e) {
            return;
        }

        var data;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            return;
        }

        // 收集所有 sortable-item 的全局 map（sortId → element）
        var globalMap = {};
        document.querySelectorAll('.page').forEach(function (page) {
            Array.from(page.children).forEach(function (el) {
                if (el.classList.contains('sortable-item') && el.dataset.sortId) {
                    globalMap[el.dataset.sortId] = el;
                }
            });
        });

        var dynamicWidgets = {};
        try {
            var widgetsRaw = localStorage.getItem(STORAGE_KEY + '_widgets');
            if (widgetsRaw) dynamicWidgets = JSON.parse(widgetsRaw);
        } catch(e) {}

        // 遍历每个保存的页面，按顺序将元素移动到对应页面
        var pages = document.querySelectorAll('.page');
        var pageMap = {};
        pages.forEach(function (p) { if (p.id) pageMap[p.id] = p; });

        Object.keys(data).forEach(function (pageId) {
            var page = pageMap[pageId];
            if (!page) return;
            var savedIds = data[pageId];
            if (!savedIds || !savedIds.length) return;

            savedIds.forEach(function (sortId) {
                var el = globalMap[sortId];
                // 如果页面中找不到该元素，且它是已保存的动态组件，则重新创建它
                if (!el && dynamicWidgets && dynamicWidgets[sortId]) {
                    const widgetData = dynamicWidgets[sortId];
                    el = document.createElement('div');
                    el.className = 'sortable-item dynamic-widget ' + (widgetData.sizeClass || '');
                    el.dataset.widgetType = widgetData.type || 'unknown';
                    el.dataset.sortId = sortId;
                    el.innerHTML = widgetData.html || '';
                    // 需要给还原出的组件绑定删除按钮等事件，放在 init 时处理或这里直接处理
                    if (editMode) {
                        var delBtn = document.createElement('div');
                        delBtn.className = 'ds-delete-btn';
                        delBtn.innerHTML = '<i class="fas fa-minus"></i>';
                        delBtn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            el.remove();
                            saveOrder();
                        });
                        el.appendChild(delBtn);
                    }
                }
                if (el) {
                    page.appendChild(el);
                }
            });
        });
    }

    /* ============================
       获取 #screen 及翻页工具
       ============================ */

    function getScreen() {
        return document.getElementById('screen');
    }

    function getPages() {
        return Array.from(document.querySelectorAll('.page'));
    }

    function getCurrentPageIndex() {
        var screen = getScreen();
        if (!screen) return 0;
        var sl = screen.scrollLeft;
        var pw = screen.clientWidth;
        return Math.round(sl / pw);
    }

    function scrollToPage(index) {
        var screen = getScreen();
        if (!screen) return;
        var pages = getPages();
        if (index < 0 || index >= pages.length) return;
        var target = index * screen.clientWidth;
        screen.scrollTo({ left: target, behavior: 'smooth' });
    }

    /* ============================
       编辑模式 开/关
       ============================ */

    function enterEditMode() {
        if (editMode) return;
        editMode = true;

        var phone = document.querySelector('.phone');
        if (phone) phone.classList.add('desktop-edit-mode');

        // 完成按钮
        doneBtn = document.createElement('button');
        doneBtn.className = 'desktop-done-btn';
        doneBtn.textContent = '完成';
        doneBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            exitEditMode();
        });
        
        var phoneEl = document.querySelector('.phone') || document.body;
        phoneEl.appendChild(doneBtn);

        // 创建边缘指示器
        createEdgeIndicators();

        // 初始化 Sortable
        initSortables();

        // 禁止页面的 scroll-snap（否则拖拽时 snap 会干扰）
        var screen = getScreen();
        if (screen) {
            screen.dataset.origSnapType = screen.style.scrollSnapType || '';
            screen.style.scrollSnapType = 'none';
            screen.dataset.origOverflow = screen.style.overflowX || '';
            screen.style.overflowX = 'hidden';
        }

        // 添加小组件按钮
        var addBtn = document.createElement('button');
        addBtn.className = 'desktop-add-btn';
        addBtn.innerHTML = '<i class="fas fa-plus"></i>';
        addBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            openWidgetLibrary();
        });
        var phoneEl = document.querySelector('.phone') || document.body;
        phoneEl.appendChild(addBtn);

        // 为每个小组件添加删除按钮
        document.querySelectorAll('.page.ds-flat > .sortable-item').forEach(function(item) {
            // App 图标不允许删除
            if (item.classList.contains('app-cell')) return;
            
            if (item.querySelector('.ds-delete-btn')) return;
            var delBtn = document.createElement('div');
            delBtn.className = 'ds-delete-btn';
            delBtn.innerHTML = '<i class="fas fa-minus"></i>';
            delBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                item.remove();
                saveOrder();
            });
            item.appendChild(delBtn);
        });
    }

    function exitEditMode() {
        if (!editMode) return;
        editMode = false;

        var phone = document.querySelector('.phone');
        if (phone) phone.classList.remove('desktop-edit-mode');

        // 移除完成按钮
        if (doneBtn) { doneBtn.remove(); doneBtn = null; }
        
        // 移除添加按钮和删除按钮
        var addBtn = document.querySelector('.desktop-add-btn');
        if (addBtn) addBtn.remove();
        document.querySelectorAll('.ds-delete-btn').forEach(function(btn) {
            btn.remove();
        });

        // 移除边缘指示器
        removeEdgeIndicators();

        // 停止边缘滚动
        stopEdgeScroll();

        // 销毁 Sortable
        sortableInstances.forEach(function (s) {
            try { s.destroy(); } catch (e) {}
        });
        sortableInstances = [];

        // 恢复 scroll-snap
        var screen = getScreen();
        if (screen) {
            screen.style.scrollSnapType = screen.dataset.origSnapType || 'x mandatory';
            screen.style.overflowX = screen.dataset.origOverflow || '';
        }

        // 保存排序
        saveOrder();
    }

    /* ============================
       边缘翻页指示器
       ============================ */

    function createEdgeIndicators() {
        leftIndicator = document.createElement('div');
        leftIndicator.className = 'ds-edge-indicator left';
        document.body.appendChild(leftIndicator);

        rightIndicator = document.createElement('div');
        rightIndicator.className = 'ds-edge-indicator right';
        document.body.appendChild(rightIndicator);
    }

    function removeEdgeIndicators() {
        if (leftIndicator) { leftIndicator.remove(); leftIndicator = null; }
        if (rightIndicator) { rightIndicator.remove(); rightIndicator = null; }
    }

    /* ============================
       拖拽过程中的边缘翻页检测
       ============================ */

    var EDGE_THRESHOLD = 40;   // 距离屏幕边缘多少 px 触发翻页
    var EDGE_SCROLL_DELAY = 600; // 在边缘停留多久后触发翻页(ms)

    function onDragMove(evt) {
        if (!editMode) return;
        var e = evt.originalEvent || evt;
        var touch = e.touches ? e.touches[0] : e;
        if (!touch) return;

        var screenEl = getScreen();
        if (!screenEl) return;
        var rect = screenEl.getBoundingClientRect();
        var x = touch.clientX;

        var nearLeft = (x - rect.left) < EDGE_THRESHOLD;
        var nearRight = (rect.right - x) < EDGE_THRESHOLD;

        // 更新指示器
        if (leftIndicator) leftIndicator.classList.toggle('active', nearLeft);
        if (rightIndicator) rightIndicator.classList.toggle('active', nearRight);

        if (nearLeft || nearRight) {
            if (!edgeScrollTimer) {
                edgeScrollTimer = setTimeout(function () {
                    var curIdx = getCurrentPageIndex();
                    if (nearLeft && curIdx > 0) {
                        scrollToPage(curIdx - 1);
                    } else if (nearRight) {
                        var pages = getPages();
                        if (curIdx < pages.length - 1) {
                            scrollToPage(curIdx + 1);
                        }
                    }
                    edgeScrollTimer = null;
                }, EDGE_SCROLL_DELAY);
            }
        } else {
            stopEdgeScroll();
        }
    }

    function stopEdgeScroll() {
        if (edgeScrollTimer) {
            clearTimeout(edgeScrollTimer);
            edgeScrollTimer = null;
        }
        if (leftIndicator) leftIndicator.classList.remove('active');
        if (rightIndicator) rightIndicator.classList.remove('active');
    }

    /* ============================
       Sortable 初始化
       ============================ */

    function initSortables() {
        document.querySelectorAll('.page').forEach(function (page) {
            var s = new Sortable(page, {
                group: 'desktop',          // 所有页面共享同一 group → 跨页拖拽
                animation: 350,            // 更长的动画时间，带来顺滑的过渡
                easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', // iOS 风格的阻尼贝塞尔曲线
                delay: 0,                  // 编辑模式下无需再长按
                draggable: '.sortable-item',
                ghostClass: 'sortable-ghost',
                dragClass: 'sortable-drag',
                fallbackOnBody: true,
                swapThreshold: 0.55,       // 稍微降低触发阈值，让图标“挤开”更积极、更顺滑
                direction: function () {
                    // 混合方向：让 SortableJS 自动判断
                    return 'vertical';
                },
                onStart: function(e) {
                    if ('vibrate' in navigator) {
                        navigator.vibrate(50);
                    }
                    const draggedItem = e.item;
                    draggedItem.style.transform = 'scale(0.85)';
                    draggedItem.style.opacity = '0.8';
                },
                onMove: function (evt) {
                    // 拖拽中实时检测边缘
                    onDragMove(evt);
                },
                onEnd: function (e) {
                    e.item.style.transform = '';
                    e.item.style.opacity = '';
                    stopEdgeScroll();
                    saveOrder();
                }
            });
            sortableInstances.push(s);
        });

        // 全局 touchmove/mousemove 也检测边缘（SortableJS 的 onMove 可能不够频繁）
        document.addEventListener('touchmove', onDragMoveGlobal, { passive: true });
        document.addEventListener('mousemove', onDragMoveGlobal);
    }

    function onDragMoveGlobal(e) {
        // 只在拖拽中触发（SortableJS 会给 body 加 sortable-dragging class 或有 .sortable-drag 元素）
        if (!editMode) return;
        if (!document.querySelector('.sortable-drag')) return;
        onDragMove(e);
    }

    /* ============================
       长按检测
       ============================ */

    var longPressTimer = null;
    var touchStartPos = null;
    var LONG_PRESS_DURATION = 500;
    var MOVE_THRESHOLD = 10;
    var isLongPressTriggered = false;

    function onPointerDown(e) {
        var page = e.target.closest('.page');
        if (!page) return;
        if (editMode) return;
        if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;

        var touch = e.touches ? e.touches[0] : e;
        touchStartPos = { x: touch.clientX, y: touch.clientY };

        longPressTimer = setTimeout(function () {
            isLongPressTriggered = true;
            enterEditMode();
            if (navigator.vibrate) navigator.vibrate(30);
        }, LONG_PRESS_DURATION);
    }

    function onPointerMove(e) {
        if (!longPressTimer || !touchStartPos) return;
        var touch = e.touches ? e.touches[0] : e;
        var dx = Math.abs(touch.clientX - touchStartPos.x);
        var dy = Math.abs(touch.clientY - touchStartPos.y);
        if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }

    function onPointerUp(e) {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        if (isLongPressTriggered) {
            // 如果刚刚触发了长按，则拦截紧接着的 up 事件
            isLongPressTriggered = false;
            e.preventDefault();
            e.stopPropagation();
        }
    }

    // 全局点击拦截：在编辑模式下，拦截对小组件和应用图标主体的点击，
    // 但是不要拦截删除按钮、添加按钮等。
    function onGlobalClick(e) {
        if (isLongPressTriggered) {
            isLongPressTriggered = false;
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if (editMode) {
            // 如果点击的是删除按钮或添加按钮，不拦截
            if (e.target.closest('.ds-delete-btn') || e.target.closest('.desktop-add-btn') || e.target.closest('.desktop-done-btn')) {
                return;
            }
            // 如果点击的是应用图标或小组件主体，拦截
            if (e.target.closest('.app-cell') || e.target.closest('.sortable-item')) {
                e.preventDefault();
                e.stopPropagation();
            }
        }
    }

    // 点击空白退出编辑模式
    function onTapBlank(e) {
        if (!editMode) return;
        if (e.target.closest('.sortable-item, .app-cell, .desktop-done-btn, .sortable-drag, .sortable-ghost')) return;
        var page = e.target.closest('.page');
        if (page && e.target === page) {
            exitEditMode();
        }
    }

    /* ============================
       初始化
       ============================ */

    function init() {
        // 1. 拉平 DOM：把 .grid-apps 内的 .app-cell 提升到 .page
        flattenAllPages();

        // 2. 标记所有直接子元素为 sortable-item
        markSortableItems();

        // 3. 恢复保存的排序（跨页移动）
        restoreOrder();

        // 4. 绑定长按事件
        var phone = document.querySelector('.phone');
        if (!phone) return;

        phone.addEventListener('touchstart', onPointerDown, { passive: true });
        phone.addEventListener('touchmove', onPointerMove, { passive: true });
        phone.addEventListener('touchend', onPointerUp, { passive: true });
        phone.addEventListener('touchcancel', onPointerUp, { passive: true });

        phone.addEventListener('mousedown', onPointerDown);
        phone.addEventListener('mousemove', onPointerMove);
        phone.addEventListener('mouseup', onPointerUp);

        phone.addEventListener('click', onTapBlank);

        // 使用捕获阶段的事件监听，以便在其他 click 事件处理之前拦截
        phone.addEventListener('click', onGlobalClick, true);

        console.log('[DesktopSort v2] 初始化完成，已拉平 DOM');
    }

    // 等 DOM 就绪后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        requestAnimationFrame(init);
    }

    // 暴露 API
    window.DesktopSort = {
        enterEditMode: enterEditMode,
        exitEditMode: exitEditMode,
        saveOrder: saveOrder,
        restoreOrder: restoreOrder,
        isEditMode: function () { return editMode; },
        flatten: flattenAllPages
    };

})();

// === 小组件库逻辑 ===
window.openWidgetLibrary = function() {
    var modal = document.getElementById('widget-library');
    var overlay = document.getElementById('widget-library-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'widget-library-overlay';
        overlay.className = 'widget-library-overlay';
        overlay.addEventListener('click', window.closeWidgetLibrary);
        var phone = document.querySelector('.phone') || document.body;
        phone.appendChild(overlay);
    }
    if(modal) {
        modal.style.display = 'flex';
        // Trigger reflow
        void modal.offsetWidth;
        modal.classList.add('active');
        if (overlay) overlay.classList.add('active');
    }
};

window.closeWidgetLibrary = function() {
    var modal = document.getElementById('widget-library');
    var overlay = document.getElementById('widget-library-overlay');
    if(modal) {
        modal.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        setTimeout(function() {
            modal.style.display = 'none';
        }, 300);
    }
};

window.switchWidgetCategory = function(cat, btn) {
    document.querySelectorAll('.wl-tab').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    
    var categories = ['system', 'aesthetic', 'media', 'tool'];
    categories.forEach(function(c) {
        var el = document.getElementById('wl-content-' + c);
        if (el) el.style.display = 'none';
    });
    
    var target = document.getElementById('wl-content-' + cat);
    if(target) target.style.display = 'block';
};

window.addWidget = function(type, sizeClass) {
    // 简单实现：找到当前页，把组件加进去
    var screen = document.getElementById('screen');
    if (!screen) return;
    var pw = screen.clientWidth;
    var sl = screen.scrollLeft;
    var curIdx = Math.round(sl / pw);
    var pages = document.querySelectorAll('.page');
    var page = pages[curIdx];
    if (!page) page = pages[0]; // fallback
    
    var el = document.createElement('div');
    el.className = 'sortable-item dynamic-widget ' + sizeClass;
    
    el.dataset.widgetType = type;
    el.dataset.sortId = 'widget-' + type + '-' + Date.now() + Math.random().toString(36).substr(2, 5);

    // 根据类型填充简单内容，实际项目中可更丰富
    if (type === 'k-dday') {
        el.innerHTML = '<div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; background:#ffffff; border:1px solid #f5f5f5; border-radius:20px; box-shadow:0 4px 15px rgba(0,0,0,0.02); cursor:pointer;" onclick="window.TrackerApp && window.TrackerApp.open()">' +
            '<div style="font-size:12px; color:#666666; letter-spacing:1px; margin-bottom:8px; font-weight:300;">OUR DAYS</div>' +
            '<div style="font-size:36px; color:#222222; font-family:\'Times New Roman\', serif; font-style:italic; line-height:1;">100</div>' +
            '<div style="font-size:10px; color:#999999; margin-top:8px;">Since 2023.01.01</div>' +
            '</div>';
    } else if (type === 'k-quote') {
        el.innerHTML = '<div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; background:#fdfdfd; border:1px solid #f5f5f5; border-radius:20px; box-shadow:0 4px 15px rgba(0,0,0,0.02); padding:20px; text-align:center; cursor:pointer;" onclick="window.openNovelApp && window.openNovelApp()">' +
            '<div style="font-size:15px; color:#222222; font-family:\'Times New Roman\', serif; font-style:italic; line-height:1.6; letter-spacing:0.5px;">"Love yourself first and everything else falls into line."</div>' +
            '<div style="width:24px; height:1px; background:#e0e0e0; margin:12px auto;"></div>' +
            '<div style="font-size:9px; color:#999999; letter-spacing:2px; text-transform:uppercase;">Daily Inspiration</div>' +
            '</div>';
    } else if (type === 'k-calendar') {
        var d = new Date();
        var months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        el.innerHTML = '<div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; background:#ffffff; border:1px solid #f5f5f5; border-radius:20px; box-shadow:0 4px 15px rgba(0,0,0,0.02); cursor:pointer;" onclick="alert(\'打开日历\')">' +
            '<div style="font-size:12px; color:#222222; font-weight:600; letter-spacing:2px;">' + months[d.getMonth()] + '</div>' +
            '<div style="font-size:42px; color:#222222; font-weight:300; margin:4px 0; line-height:1;">' + d.getDate() + '</div>' +
            '<div style="font-size:10px; color:#999999; letter-spacing:1px; text-transform:uppercase;">' + days[d.getDay()] + '</div>' +
            '</div>';
    } else if (type === 'k-shortcuts') {
        el.innerHTML = '<div style="height:100%; display:flex; justify-content:space-around; align-items:center; background:#ffffff; border:1px solid #f5f5f5; border-radius:20px; box-shadow:0 4px 15px rgba(0,0,0,0.02); padding:0 20px;">' +
            '<div onclick="window.SMSApp && window.SMSApp.open()" style="width:44px; height:44px; border-radius:50%; background:#fcfcfc; border:1px solid #f5f5f5; display:flex; justify-content:center; align-items:center; color:#333333; cursor:pointer; font-size:16px; transition:0.2s;"><i class="fas fa-comment-dots"></i></div>' +
            '<div onclick="window.openMusicPlayer && window.openMusicPlayer()" style="width:44px; height:44px; border-radius:50%; background:#fcfcfc; border:1px solid #f5f5f5; display:flex; justify-content:center; align-items:center; color:#333333; cursor:pointer; font-size:16px; transition:0.2s;"><i class="fas fa-music"></i></div>' +
            '<div onclick="alert(\'打开相机\')" style="width:44px; height:44px; border-radius:50%; background:#fcfcfc; border:1px solid #f5f5f5; display:flex; justify-content:center; align-items:center; color:#333333; cursor:pointer; font-size:16px; transition:0.2s;"><i class="fas fa-camera"></i></div>' +
            '<div onclick="window.TrackerApp && window.TrackerApp.open()" style="width:44px; height:44px; border-radius:50%; background:#fcfcfc; border:1px solid #f5f5f5; display:flex; justify-content:center; align-items:center; color:#333333; cursor:pointer; font-size:16px; transition:0.2s;"><i class="fas fa-user-secret"></i></div>' +
            '</div>';
    } else if (type === 'k-mood') {
        el.innerHTML = '<div style="height:100%; background:url(\'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?q=80&w=300&auto=format&fit=crop\'); background-size:cover; background-position:center; border-radius:20px; border:1px solid #f5f5f5; box-shadow:0 4px 15px rgba(0,0,0,0.02); position:relative; cursor:pointer;" onclick="window.openGalgameApp && window.openGalgameApp()">' +
            '<div style="position:absolute; bottom:12px; left:14px; font-size:10px; color:#ffffff; letter-spacing:2px; font-weight:400; text-shadow:0 2px 4px rgba(0,0,0,0.3);">MOOD</div>' +
            '</div>';
    } else if (type === 'weather') {
        el.innerHTML = '<div style="height:100%; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg, #74ebd5, #9face6); color:#fff; font-size:24px; font-weight:700;"><i class="fas fa-cloud-sun"></i> 24°C</div>';
    } else if (type === 'clock') {
        el.innerHTML = '<div style="height:100%; display:flex; align-items:center; justify-content:center; border: 4px solid #111; border-radius:50%; box-sizing:border-box;"><i class="far fa-clock" style="font-size:32px; color:#111;"></i></div>';
    } else if (type === 'music') {
        el.innerHTML = '<div style="height:100%; display:flex; align-items:center; background:#1c1c1e; color:#fff; padding: 0 20px;"><div style="width:80px; height:80px; border-radius:12px; background:#333; margin-right:20px;"></div><div><div style="font-weight:600; font-size:18px;">Now Playing</div><div style="font-size:14px; color:#aeaeb2; margin-top:4px;">Artist</div></div></div>';
    } else if (type === 'photo') {
        el.innerHTML = '<div style="height:100%; background:url(\'https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=200&auto=format&fit=crop\'); background-size:cover; background-position:center;"></div>';
    } else if (type === 'search') {
        el.innerHTML = '<div style="height:100%; display:flex; align-items:center; background:#e5e5ea; color:#8e8e93; font-size:16px; padding:0 20px;"><i class="fas fa-search" style="margin-right:12px;"></i> Search...</div>';
    } else if (type === 'shortcut') {
        el.innerHTML = '<div style="height:100%; display:flex; align-items:center; justify-content:center; background:#ffebee; color:#ff6b6b; font-size:24px;"><i class="fas fa-bolt"></i></div>';
    } else {
        el.innerHTML = '<div style="padding:10px;">Widget</div>';
    }
    
    // 如果在编辑模式下，加上删除按钮
    if (window.DesktopSort && window.DesktopSort.isEditMode()) {
        var delBtn = document.createElement('div');
        delBtn.className = 'ds-delete-btn';
        delBtn.innerHTML = '<i class="fas fa-minus"></i>';
        delBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            el.remove();
            if (window.DesktopSort.saveOrder) window.DesktopSort.saveOrder();
        });
        el.appendChild(delBtn);
    }
    
    page.appendChild(el);
    closeWidgetLibrary();
    
    if (window.DesktopSort && window.DesktopSort.saveOrder) {
        window.DesktopSort.saveOrder();
    }
};
