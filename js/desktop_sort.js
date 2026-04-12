/**
 * DesktopSort v3 — 真正自由布局的 4x8 网格拖拽
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
       工具函数与透明占位格子逻辑
       ============================ */

    function simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(36).substring(0, 6);
    }

    function getSortId(el) {
        if (el.dataset.sortId) return el.dataset.sortId;
        if (el.classList.contains('app-cell') && el.dataset.appId) {
            el.dataset.sortId = 'app-' + el.dataset.appId;
            return el.dataset.sortId;
        }
        if (el.classList.contains('unified-header-widget'))    { el.dataset.sortId = 'header-widget'; return el.dataset.sortId; }
        if (el.classList.contains('music-widget'))              { el.dataset.sortId = 'music-widget'; return el.dataset.sortId; }
        if (el.classList.contains('photo-stack'))               { el.dataset.sortId = 'photo-stack'; return el.dataset.sortId; }
        if (el.classList.contains('k-mood-board'))              { el.dataset.sortId = 'k-mood-board'; return el.dataset.sortId; }
        if (el.classList.contains('collection-ticker-widget'))  { el.dataset.sortId = 'ticker-widget'; return el.dataset.sortId; }
        if (el.classList.contains('receipt-widget'))            { el.dataset.sortId = 'receipt-widget'; return el.dataset.sortId; }
        if (el.classList.contains('dynamic-widget') && el.dataset.widgetType) {
            if (!el.dataset.sortId) {
                el.dataset.sortId = 'widget-' + el.dataset.widgetType + '-' + Date.now() + Math.random().toString(36).substr(2, 5);
            }
            return el.dataset.sortId;
        }
        if (el.id) { el.dataset.sortId = 'id-' + el.id; return el.dataset.sortId; }
        const text = (el.textContent || '').trim().substring(0, 30);
        el.dataset.sortId = 'el-' + el.tagName + '-' + simpleHash(text);
        return el.dataset.sortId;
    }

    function getWidgetArea(el) {
        var match = el.className.match(/widget-(\d+)x(\d+)/);
        if (match) {
            return parseInt(match[1]) * parseInt(match[2]);
        }
        return 1;
    }

      // 【核心】自动在屏幕空白处铺满透明占位格子，维持严格的 28 格(4x7)
    window.adjustEmptySlots = function() {
        document.querySelectorAll('.page.ds-flat').forEach(function(page) {
            var items = Array.from(page.children).filter(function(el) { return el.classList.contains('sortable-item'); });
            var totalArea = 0;
            items.forEach(function(el) { totalArea += getWidgetArea(el); });

            // 如果面积超出28，删掉多余的透明格子
            if (totalArea > 28) {
                var emptySlots = items.filter(function(el) { return el.classList.contains('ds-empty-slot'); }).reverse();
                for (var i = 0; i < emptySlots.length; i++) {
                    if (totalArea <= 28) break;
                    emptySlots[i].remove();
                    totalArea -= 1;
                }
            }

            // 如果面积不到28，补充透明格子
            var emptyCount = 0;
            while (totalArea < 28) {
                var emptySlot = document.createElement('div');
                emptySlot.className = 'ds-empty-slot widget-1x1 sortable-item';
                emptySlot.dataset.sortId = 'empty-' + page.id + '-' + Date.now() + '-' + emptyCount;
                page.appendChild(emptySlot);
                totalArea += 1;
                emptyCount++;
            }
        });
    };

    /* ============================
       DOM 拉平
       ============================ */
    function flattenPage(page) {
        const grids = Array.from(page.querySelectorAll(':scope > .grid-apps'));
        grids.forEach(function (grid) {
            const cells = Array.from(grid.querySelectorAll(':scope > .app-cell'));
            cells.forEach(function (cell) { page.insertBefore(cell, grid); });
            grid.remove();
        });
        page.classList.add('ds-flat');
    }

    function flattenAllPages() {
        if (flattenDone) return;
        document.querySelectorAll('.page').forEach(flattenPage);
        flattenDone = true;
    }

    function markSortableItems() {
        document.querySelectorAll('.page').forEach(function (page) {
            Array.from(page.children).forEach(function (el) {
                if (!el.classList.contains('sortable-item')) { el.classList.add('sortable-item'); }
                getSortId(el);
            });
        });
    }

    /* ============================
       保存 & 恢复排序
       ============================ */
    function saveOrder() {
        const data = {};
        const dynamicWidgets = {};
        document.querySelectorAll('.page').forEach(function (page) {
            if (!page.id) return;
            data[page.id] = Array.from(page.children)
                .filter(function (el) { return el.classList.contains('sortable-item'); })
                .map(function (el) {
                    const sortId = getSortId(el);
                    if (el.classList.contains('dynamic-widget')) {
                        const clone = el.cloneNode(true);
                        clone.querySelectorAll('.ds-delete-btn, .ds-color-btn, .ds-opacity-btn, .tw-controls').forEach(btn => btn.remove());
                        dynamicWidgets[sortId] = {
                            type: el.dataset.widgetType,
                            sizeClass: Array.from(el.classList).find(c => c.startsWith('widget-')),
                            className: el.className,
                            html: clone.innerHTML
                        };
                    }
                    return sortId;
                });
        });
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            localStorage.setItem(STORAGE_KEY + '_widgets', JSON.stringify(dynamicWidgets));
        } catch (e) { console.warn('[DesktopSort] 保存失败', e); }
    }

    function restoreOrder() {
        var raw;
        try {
            raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) { window.adjustEmptySlots(); return; }
        } catch (e) { window.adjustEmptySlots(); return; }

        var data;
        try { data = JSON.parse(raw); } catch (e) { window.adjustEmptySlots(); return; }

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
                // 如果是存下来的透明占位格子，还原它
                if (!el && sortId.startsWith('empty-')) {
                    el = document.createElement('div');
                    el.className = 'ds-empty-slot widget-1x1 sortable-item';
                    el.dataset.sortId = sortId;
                } else if (!el && dynamicWidgets && dynamicWidgets[sortId]) {
                    const widgetData = dynamicWidgets[sortId];
                    el = document.createElement('div');
                    el.className = widgetData.className || ('sortable-item dynamic-widget ' + (widgetData.sizeClass || ''));
                    el.dataset.widgetType = widgetData.type || 'unknown';
                    el.dataset.sortId = sortId;
                    el.innerHTML = widgetData.html || '';
                    
                    var match = el.className.match(/widget-(\d+)x(\d+)/);
                    if (match) {
                        el.style.setProperty('grid-column', 'span ' + match[1], 'important');
                        el.style.setProperty('grid-row', 'span ' + match[2], 'important');
                    }
                    el.style.maxWidth = '100%';
                    el.style.boxSizing = 'border-box';
                }
                if (el) { page.appendChild(el); }
            });
        });
        
        // 恢复透明小组件的颜色和透明度
        document.querySelectorAll('.transparent-widget').forEach(function(item) {
            var match = item.innerHTML.match(/<div class="tw-bg-layer" data-color="([^"]+)" data-opacity="([^"]+)"/);
            if (match) {
                var bgLayer = item.querySelector('.tw-bg-layer');
                if (bgLayer) {
                    bgLayer.style.backgroundColor = 'rgba(' + match[1] + ', ' + match[2] + ')';
                    if (match[1] === '0,0,0' && parseFloat(match[2]) > 0.3) {
                        item.classList.add('tw-dark-mode');
                    } else {
                        item.classList.remove('tw-dark-mode');
                    }
                }
            }
        });

        // 恢复完后兜底计算一次，确保刚好铺满
        window.adjustEmptySlots();
    }

    function getScreen() { return document.getElementById('screen'); }
    function getPages() { return Array.from(document.querySelectorAll('.page')); }
    function getCurrentPageIndex() {
        var screen = getScreen();
        if (!screen) return 0;
        return Math.round(screen.scrollLeft / screen.clientWidth);
    }
    function scrollToPage(index) {
        var screen = getScreen();
        var pages = getPages();
        if (!screen || index < 0 || index >= pages.length) return;
        screen.scrollTo({ left: index * screen.clientWidth, behavior: 'smooth' });
    }

    /* ============================
       编辑模式 开/关
       ============================ */
    function enterEditMode() {
        if (editMode) return;
        editMode = true;

        var phone = document.querySelector('.phone');
        if (phone) phone.classList.add('desktop-edit-mode');

        doneBtn = document.createElement('button');
        doneBtn.className = 'desktop-done-btn';
        doneBtn.textContent = '完成';
        doneBtn.addEventListener('click', function (e) { e.stopPropagation(); exitEditMode(); });
        (document.querySelector('.phone') || document.body).appendChild(doneBtn);

        createEdgeIndicators();
        initSortables();

        var screen = getScreen();
        if (screen) {
            screen.dataset.origSnapType = screen.style.scrollSnapType || '';
            screen.style.scrollSnapType = 'none';
            screen.dataset.origOverflow = screen.style.overflowX || '';
            screen.style.overflowX = 'hidden';
        }

        var addBtn = document.createElement('button');
        addBtn.className = 'desktop-add-btn';
        addBtn.innerHTML = '<i class="fas fa-plus"></i>';
        addBtn.addEventListener('click', function(e) { e.stopPropagation(); openWidgetLibrary(); });
        (document.querySelector('.phone') || document.body).appendChild(addBtn);

        document.querySelectorAll('.page.ds-flat > .sortable-item').forEach(function(item) {
            // APP图标和透明占位格子不加删除按钮
            if (item.classList.contains('app-cell') || item.classList.contains('ds-empty-slot')) return;
            
            // 只允许指定的固定组件（音乐播放器、滚动便签）调整透明度，其他固定组件不予干涉
            if (item.classList.contains('music-widget') || item.classList.contains('collection-ticker-widget')) {
                item.classList.add('transparent-widget');
            }
            // (移除了原先强制给所有组件添加 transparent-widget 的一刀切逻辑)

            if (item.querySelector('.ds-delete-btn')) return;
            var delBtn = document.createElement('div');
            delBtn.className = 'ds-delete-btn';
            delBtn.innerHTML = '<i class="fas fa-minus"></i>';
            delBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                var isWidget = !item.classList.contains('app-cell') && !item.classList.contains('ds-empty-slot');
                if (!isWidget) {
                    var area = getWidgetArea(item);
                    var frag = document.createDocumentFragment();
                    for(var i=0; i<area; i++) {
                        var emptySlot = document.createElement('div');
                        emptySlot.className = 'ds-empty-slot widget-1x1 sortable-item';
                        emptySlot.dataset.sortId = 'empty-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
                        frag.appendChild(emptySlot);
                    }
                    item.parentNode.insertBefore(frag, item);
                }
                item.remove();
                window.adjustEmptySlots(); // 删掉后补充透明格子
                saveOrder();
            });
            item.appendChild(delBtn);

            // Add color switch button for specific widgets
            if (item.classList.contains('k-scrapbook-widget') || 
                item.classList.contains('k-todo-widget') || 
                item.classList.contains('k-train-ticket-widget') || 
                item.classList.contains('k-envelope-widget') ||
                item.classList.contains('k-planner-widget')) {
                var colorBtn = document.createElement('div');
                colorBtn.className = 'ds-color-btn';
                colorBtn.innerHTML = '<i class="fas fa-palette"></i>';
                colorBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    if(window.DesktopSort.cycleWidgetColor) {
                        window.DesktopSort.cycleWidgetColor(item);
                    }
                });
                item.appendChild(colorBtn);
            }

            if (item.classList.contains('transparent-widget')) {
                var opacityBtn = document.createElement('div');
                opacityBtn.className = 'ds-opacity-btn';
                opacityBtn.innerHTML = '<i class="fas fa-sliders-h"></i>';
                opacityBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    if (window.DesktopSort && window.DesktopSort.toggleOpacityControls) {
                        window.DesktopSort.toggleOpacityControls(item);
                    }
                });
                item.appendChild(opacityBtn);
            }
        });
    }

       function exitEditMode() {
        if (!editMode) return;
        editMode = false;

        var phone = document.querySelector('.phone');
        if (phone) phone.classList.remove('desktop-edit-mode');

        if (doneBtn) { doneBtn.remove(); doneBtn = null; }
        var addBtn = document.querySelector('.desktop-add-btn');
        if (addBtn) addBtn.remove();
        document.querySelectorAll('.ds-delete-btn').forEach(function(btn) { btn.remove(); });
        document.querySelectorAll('.ds-color-btn').forEach(function(btn) { btn.remove(); });
        // 👇 退出时清理残留的透明按钮和滑块，并恢复小组件被提升的层级
        document.querySelectorAll('.ds-opacity-btn').forEach(function(btn) { btn.remove(); });
        document.querySelectorAll('.tw-controls').forEach(function(ctrl) { 
            if (ctrl.parentElement) ctrl.parentElement.style.zIndex = ''; // 压回原来的层级
            ctrl.remove(); 
        });
        // 保险起见，把所有小组件的层级全部重置一次，防止被一直盖在最上面
        document.querySelectorAll('.sortable-item').forEach(function(item) { item.style.zIndex = ''; });

        removeEdgeIndicators();

        stopEdgeScroll();

        sortableInstances.forEach(function (s) { try { s.destroy(); } catch (e) {} });
        sortableInstances = [];

        var screen = getScreen();
        if (screen) {
            screen.style.scrollSnapType = screen.dataset.origSnapType || 'x mandatory';
            screen.style.overflowX = screen.dataset.origOverflow || '';
        }
        
        // 【新增】退出编辑模式时，执行强制清理
        window.adjustEmptySlots();
        cleanupEmptyPages(true); 
        saveOrder();
    }

    function createEdgeIndicators() {
        leftIndicator = document.createElement('div'); leftIndicator.className = 'ds-edge-indicator left'; document.body.appendChild(leftIndicator);
        rightIndicator = document.createElement('div'); rightIndicator.className = 'ds-edge-indicator right'; document.body.appendChild(rightIndicator);
    }
    function removeEdgeIndicators() {
        if (leftIndicator) { leftIndicator.remove(); leftIndicator = null; }
        if (rightIndicator) { rightIndicator.remove(); rightIndicator = null; }
    }

    var EDGE_THRESHOLD = 80;
    var EDGE_SCROLL_DELAY = 300;
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
        if (leftIndicator) leftIndicator.classList.toggle('active', nearLeft);
        if (rightIndicator) rightIndicator.classList.toggle('active', nearRight);

        if (nearLeft || nearRight) {
            if (!edgeScrollTimer) {
                edgeScrollTimer = setTimeout(function () {
                    var curIdx = getCurrentPageIndex();
                    var pages = getPages();
                    if (nearLeft && curIdx > 0) { 
                        scrollToPage(curIdx - 1); 
                    } 
                    else if (nearRight) {
                        if (curIdx < pages.length - 1) { 
                            scrollToPage(curIdx + 1); 
                        } else {
                            // 【新增】如果拖到了最后一页的最右边，自动创建新页！
                            createNewPage();
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
    // 【新增】动态创建桌面新页
    function createNewPage() {
        var screen = getScreen();
        var newPageIdx = getPages().length + 1;
        var newPage = document.createElement('div');
        newPage.className = 'page ds-flat';
        newPage.id = 'p' + newPageIdx;
        screen.appendChild(newPage);
        
        // 铺满 28 个透明占位格
        for(var i=0; i<28; i++) {
            var emptySlot = document.createElement('div');
            emptySlot.className = 'ds-empty-slot widget-1x1 sortable-item';
            emptySlot.dataset.sortId = 'empty-' + newPage.id + '-' + Date.now() + '-' + i;
            newPage.appendChild(emptySlot);
        }
        
        // 给新页面赋予可拖拽灵魂
        var s = new Sortable(newPage, {
            group: 'desktop',
            animation: 350,
            easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
            draggable: '.sortable-item',
            ghostClass: 'sortable-ghost',
            dragClass: 'sortable-drag',
            fallbackOnBody: true,
            swap: true,
            swapClass: 'sortable-swap-highlight',
            swapThreshold: 0.55,
            onStart: function(e) {
                if ('vibrate' in navigator) navigator.vibrate(50);
                e.item.style.transform = 'scale(0.85)';
                e.item.style.opacity = '0.8';
            },
            onMove: function (evt) { onDragMove(evt); },
            onEnd: function (e) {
                e.item.style.transform = '';
                e.item.style.opacity = '';
                stopEdgeScroll();
                window.adjustEmptySlots(); 
                cleanupEmptyPages(); // 结束时清理空页
                saveOrder();
            }
        });
        sortableInstances.push(s);
        return newPage; // <--- 【新增这行】返回新创建的页面
    }


    // 【新增】智能清理多余的空页（像苹果一样）
    function cleanupEmptyPages(force) {
        var pages = getPages();
        var curIdx = getCurrentPageIndex();
        // 永远保留第一页，从后往前检查
        for (var i = pages.length - 1; i > 0; i--) {
            var page = pages[i];
            var hasRealItem = Array.from(page.children).some(function(el) {
                return !el.classList.contains('ds-empty-slot') && el.classList.contains('sortable-item');
            });
            // 如果是强制清理（如点击完成时），或者当前并没有看着这页，就销毁它
            if (!hasRealItem && (force || curIdx !== i)) {
                // 如果销毁的刚好是你当前看着的页面，自动帮你平滑滚动到上一页
                if (curIdx === i) {
                    scrollToPage(i - 1);
                }
                page.remove();
            }
        }
    }

    function stopEdgeScroll() {
        if (edgeScrollTimer) { clearTimeout(edgeScrollTimer); edgeScrollTimer = null; }
        if (leftIndicator) leftIndicator.classList.remove('active');
        if (rightIndicator) rightIndicator.classList.remove('active');
    }

    function initSortables() {
        document.querySelectorAll('.page').forEach(function (page) {
            var s = new Sortable(page, {
                group: 'desktop',
                animation: 350,
                easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
                delay: 0,
                draggable: '.sortable-item',
                ghostClass: 'sortable-ghost',
                dragClass: 'sortable-drag',
                fallbackOnBody: true,
                swap: true,
                swapClass: 'sortable-swap-highlight',
                swapThreshold: 0.55,
                direction: 'horizontal',
                onStart: function(e) {
                    if ('vibrate' in navigator) navigator.vibrate(50);
                    e.item.style.transform = 'scale(0.85)';
                    e.item.style.opacity = '0.8';
                },
                onMove: function (evt) { onDragMove(evt); },
                onEnd: function (e) {
                    e.item.style.transform = '';
                    e.item.style.opacity = '';
                    stopEdgeScroll();
                    window.adjustEmptySlots(); // 拖完计算是否需要补格子
                    cleanupEmptyPages();
                    saveOrder();
                }
            });
            sortableInstances.push(s);
        });
        document.addEventListener('touchmove', onDragMoveGlobal, { passive: true });
        document.addEventListener('mousemove', onDragMoveGlobal);
    }

    function onDragMoveGlobal(e) {
        if (!editMode || !document.querySelector('.sortable-drag')) return;
        onDragMove(e);
    }

    var longPressTimer = null, touchStartPos = null, LONG_PRESS_DURATION = 500, MOVE_THRESHOLD = 10, isLongPressTriggered = false;
    function onPointerDown(e) {
        var page = e.target.closest('.page');
        if (!page || editMode || e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
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
        if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) { clearTimeout(longPressTimer); longPressTimer = null; }
    }
    function onPointerUp(e) {
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
        if (isLongPressTriggered) { isLongPressTriggered = false; e.preventDefault(); e.stopPropagation(); }
    }
    function onGlobalClick(e) {
        if (isLongPressTriggered) { isLongPressTriggered = false; e.preventDefault(); e.stopPropagation(); return; }
        if (editMode) {
            if (e.target.closest('.ds-delete-btn') || e.target.closest('.ds-color-btn') || e.target.closest('.ds-opacity-btn') || e.target.closest('.tw-controls') || e.target.closest('.desktop-add-btn') || e.target.closest('.desktop-done-btn')) return;
            if (e.target.closest('.app-cell') || e.target.closest('.sortable-item')) { e.preventDefault(); e.stopPropagation(); }
        }
    }
    function onTapBlank(e) {
        if (!editMode) return;
        if (e.target.closest('.sortable-item, .app-cell, .desktop-done-btn, .sortable-drag, .sortable-ghost')) return;
        var page = e.target.closest('.page');
        if (page && e.target === page) exitEditMode();
    }

    function init() {
        flattenAllPages();
        markSortableItems();
        restoreOrder();

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
        phone.addEventListener('click', onGlobalClick, true);
    }

    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } 
    else { requestAnimationFrame(init); }

    function cycleWidgetColor(item) {
        var colors = ['theme-default', 'theme-pink', 'theme-blue', 'theme-green', 'theme-purple', 'theme-white', 'theme-black'];
        var currentTheme = 'theme-default';
        for (var i = 0; i < colors.length; i++) {
            if (item.classList.contains(colors[i])) {
                currentTheme = colors[i];
                item.classList.remove(colors[i]);
                break;
            }
        }
        var nextIndex = (colors.indexOf(currentTheme) + 1) % colors.length;
        var nextTheme = colors[nextIndex];
        if (nextTheme !== 'theme-default') {
            item.classList.add(nextTheme);
        }
        if(saveOrder) saveOrder();
    }
function toggleOpacityControls(item) {
        document.querySelectorAll('.tw-controls').forEach(function(ctrl) {
            if (ctrl.parentElement !== item) {
                ctrl.parentElement.style.zIndex = ''; // 还原其他组件的层级
                ctrl.remove();
            }
        });

        var existing = item.querySelector('.tw-controls');
        if (existing) {
            item.style.zIndex = ''; // 关掉面板时还原层级
            existing.remove();
            return;
        }
        
        item.style.zIndex = '9999'; // <-- 新增这行：开启面板时临时提升当前组件层级，防遮挡

        var controls = document.createElement('div');
        controls.className = 'tw-controls';
        
        var bgLayer = item.querySelector('.tw-bg-layer');
        if (!bgLayer) {
            bgLayer = document.createElement('div');
            bgLayer.className = 'tw-bg-layer';
            bgLayer.dataset.color = '255,255,255';
            bgLayer.dataset.opacity = '0.8';
            bgLayer.style.backgroundColor = 'rgba(255,255,255,0.8)'; 
            if (item.firstChild) {
                item.insertBefore(bgLayer, item.firstChild);
            } else {
                item.appendChild(bgLayer);
            }
        }
        
        var color = bgLayer.dataset.color || '255,255,255';
        var opacity = parseFloat(bgLayer.dataset.opacity || '0.8'); 
        var btnClass = color === '255,255,255' ? 'tw-white' : 'tw-black';
        
        // 【修改】去掉了滑块，换成点击按钮
        controls.innerHTML = '<div class="tw-ctrl-btn tw-color-toggle ' + btnClass + '" style="margin-right:8px;"><i class="fas fa-adjust"></i></div>' +
                             '<div class="tw-ctrl-btn tw-opacity-toggle" style="background:#f0f0f0; color:#333; padding:4px 8px; border-radius:12px; font-size:12px; cursor:pointer; user-select:none;">' + Math.round(opacity * 100) + '%</div>';
        
        var colorToggle = controls.querySelector('.tw-color-toggle');
        var opacityToggle = controls.querySelector('.tw-opacity-toggle');

        function updateDarkModeClass() {
            if (color === '0,0,0' && opacity > 0.3) {
                item.classList.add('tw-dark-mode');
            } else {
                item.classList.remove('tw-dark-mode');
            }
        }

        function updateOpacityValue(val) {
            val = Math.max(0, Math.min(100, parseInt(val) || 0));
            opacityToggle.innerText = val + '%';
            opacity = val / 100;
            bgLayer.dataset.opacity = opacity;
            bgLayer.style.backgroundColor = 'rgba(' + color + ', ' + opacity + ')';
            updateDarkModeClass();
        }

        colorToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            color = color === '255,255,255' ? '0,0,0' : '255,255,255';
            colorToggle.className = 'tw-ctrl-btn tw-color-toggle ' + (color === '255,255,255' ? 'tw-white' : 'tw-black');
            bgLayer.dataset.color = color;
            bgLayer.style.backgroundColor = 'rgba(' + color + ', ' + opacity + ')';
            updateDarkModeClass();
            saveOrder();
        });
        
        // 【新增】点击切换透明度 (每次加 20%)
        opacityToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            var currentVal = Math.round(opacity * 100);
            var nextVal = currentVal + 20;
            if (nextVal > 100) nextVal = 0;
            updateOpacityValue(nextVal);
            saveOrder();
        });

        controls.addEventListener('mousedown', function(e) { e.stopPropagation(); });
        controls.addEventListener('touchstart', function(e) { e.stopPropagation(); }, { passive: false });
        controls.addEventListener('touchmove', function(e) { e.stopPropagation(); }, { passive: false });
        controls.addEventListener('click', function(e) { e.stopPropagation(); });
        controls.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
        controls.addEventListener('pointermove', function(e) { e.stopPropagation(); });
        
        item.appendChild(controls);
    }


    window.DesktopSort = {
        enterEditMode: enterEditMode,
        exitEditMode: exitEditMode,
        saveOrder: saveOrder,
        restoreOrder: restoreOrder,
        isEditMode: function () { return editMode; },
        flatten: flattenAllPages,
        cycleWidgetColor: cycleWidgetColor,
       toggleOpacityControls: toggleOpacityControls,
        createNewPage: createNewPage // <--- 【新增这行】暴露创建页面的方法
    };

})();
/* === 小组件库逻辑 === */
window.openWidgetLibrary = function() {
    var modal = document.getElementById('widget-library');
    var phone = document.querySelector('.phone');
    
    // 核心修复：强制将小组件页面塞入手机屏幕内部，解决跑到外面的问题
    if (modal && phone && modal.parentNode !== phone) {
        phone.appendChild(modal);
    }

    if(modal) {
        modal.style.display = 'flex';
        void modal.offsetWidth;
        modal.classList.add('active');
    }

    // 【修改】：瞬间隐藏 dock 栏（无渐变动画）
    var dock = document.getElementById('main-dock-bar');
    if (dock) {
        dock.style.display = 'none';
    }
};

window.closeWidgetLibrary = function() {
    var modal = document.getElementById('widget-library');
    if(modal) {
        modal.classList.remove('active');
        setTimeout(function() { modal.style.display = 'none'; }, 300);
    }

    // 【修改】：关闭面板时，瞬间恢复显示 dock 栏
    var dock = document.getElementById('main-dock-bar');
    if (dock) {
        dock.style.display = 'flex'; // 恢复为 flex 布局
    }
};

window.handleCustomWidgetUpload = function(input) {
    if (input.files && input.files[0]) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var base64 = e.target.result;
            document.getElementById('custom-widget-base64').value = base64;
            var preview = document.getElementById('custom-widget-preview');
            preview.innerHTML = '<img src="' + base64 + '" style="width:100%; height:100%; object-fit:cover;">';
        };
        reader.readAsDataURL(input.files[0]);
    }
};

window.toggleCustomWidgetType = function(val) {
    var imgPanel = document.getElementById('custom-widget-image-panel');
    var codePanel = document.getElementById('custom-widget-code-panel');
    var actionGroup = document.getElementById('custom-widget-action-group');
    if (imgPanel) imgPanel.style.display = (val === 'image') ? 'block' : 'none';
    if (codePanel) codePanel.style.display = (val === 'code') ? 'block' : 'none';
    if (actionGroup) actionGroup.style.display = (val === 'image') ? 'block' : 'none';
};

window.toggleCustomWidgetActionInput = function(val) {
    var appBox = document.getElementById('custom-widget-action-app-box');
    var urlBox = document.getElementById('custom-widget-action-url-box');
    if (appBox) appBox.style.display = (val === 'app') ? 'block' : 'none';
    if (urlBox) urlBox.style.display = (val === 'url') ? 'block' : 'none';
};

window.executeCustomWidgetAction = function(type, param) {
    if (type === 'app') {
        if (param === 'wechat') { if(window.openWeChatApp) window.openWeChatApp(); }
        else if (param === 'live') { if(window.openLiveApp) window.openLiveApp(); }
        else if (param === 'music') { if(window.openMusicPlayer) window.openMusicPlayer(); }
        else if (param === 'game') { if(window.openGameApp) window.openGameApp(); }
        else if (param === 'pet') { if(window.openPetApp) window.openPetApp(); }
        else if (param === 'novel') { if(window.openNovelApp) window.openNovelApp(); }
        else if (param === 'pay') { if(window.openPayApp) window.openPayApp(); }
        else if (param === 'lovespace') { if(window.openLoveSpaceApp) window.openLoveSpaceApp(); }
        else if (param === 'backpack') { if(window.openBackpackApp) window.openBackpackApp(); }
        else if (param === 'snoop') { if(window.openSnoopApp) window.openSnoopApp(); }
    } else if (type === 'url') {
        if (param && param.trim() !== '') {
            window.open(param, '_blank');
        }
    }
};

window.createCustomWidget = function() {
    var typeSelect = document.getElementById('custom-widget-type');
    var type = typeSelect ? typeSelect.value : 'image';
    var contentHtml = '';

      var w = parseInt(document.getElementById('custom-widget-w').value) || 2;
    var h = parseInt(document.getElementById('custom-widget-h').value) || 2;
    if (w < 1) w = 1;
    if (w > 4) w = 4;
    if (h < 1) h = 1;
    if (h > 7) h = 7;
    var sizeClass = 'widget-' + w + 'x' + h;
    // 新增：如果是图片类型，给它加上透明专属类名
    if (type === 'image') {
        sizeClass += ' transparent-widget';
    }


    var actionTypeEl = document.getElementById('custom-widget-action-type');
    var actionType = actionTypeEl ? actionTypeEl.value : 'none';
    var actionParam = '';
    if (actionType === 'app') {
        actionParam = document.getElementById('custom-widget-action-app') ? document.getElementById('custom-widget-action-app').value : '';
    } else if (actionType === 'url') {
        actionParam = document.getElementById('custom-widget-action-url') ? document.getElementById('custom-widget-action-url').value : '';
    }

    var clickStr = '';
    if (actionType !== 'none' && type === 'image') {
        clickStr = ' onclick="executeCustomWidgetAction(\'' + actionType + '\', \'' + actionParam + '\')"';
    }

    if (type === 'image') {
        var base64 = document.getElementById('custom-widget-base64') ? document.getElementById('custom-widget-base64').value : '';
        if (!base64) {
            alert('请先上传图片！');
            return;
        }
        contentHtml = '<div style="width:100%; height:100%; border-radius:16px; overflow:hidden; background-image:url(\'' + base64 + '\'); background-size:contain; background-repeat:no-repeat; background-position:center; cursor:pointer;"' + clickStr + '></div>';
    } else {
        var codeInput = document.getElementById('custom-widget-code-input');
        var code = codeInput ? codeInput.value : '';
        if (!code.trim()) {
            alert('请先输入代码！');
            return;
        }
        contentHtml = '<div style="width:100%; height:100%; overflow:hidden; border-radius:16px; cursor:pointer;"' + clickStr + '>' + code + '</div>';
    }

    var screen = document.getElementById('screen');
    if (!screen) return;
    var pw = screen.clientWidth;
    var sl = screen.scrollLeft;
    var curIdx = Math.round(sl / pw);
    var pages = document.querySelectorAll('.page');
    
    // 从当前页开始往后找，看看哪页能放下 (w * h 就是这个组件需要的格子数)
    var requiredArea = w * h;
    var targetPage = null;
    for (var i = curIdx; i < pages.length; i++) {
        var pageNode = pages[i];
        // 算出这页已经被占用了多少格子
        var items = Array.from(pageNode.children);
        var totalUsed = 0;
        items.forEach(function(el) { 
            if (el.classList.contains('sortable-item') && !el.classList.contains('ds-empty-slot')) {
                var m = el.className.match(/widget-(\d+)x(\d+)/);
                totalUsed += m ? parseInt(m[1]) * parseInt(m[2]) : 1;
            }
        });
        
        // 每页最多28格，如果剩余空间够放，就放在这页
        if (28 - totalUsed >= requiredArea) {
            targetPage = pageNode;
            break;
        }
    }
    
    // 如果找了一圈都没有足够的空位，就自动开新页
    if (!targetPage) {
        targetPage = window.DesktopSort.createNewPage();
        // 稍微延迟一下，把屏幕自动滑到新加的那一页去
        setTimeout(function() {
            screen.scrollTo({ left: targetPage.offsetLeft, behavior: 'smooth' });
        }, 100);
    }
    var page = targetPage;

    var el = document.createElement('div');
    el.className = 'sortable-item dynamic-widget ' + sizeClass;
    el.style.setProperty('grid-column', 'span ' + w, 'important');
    el.style.setProperty('grid-row', 'span ' + h, 'important');
    el.style.maxWidth = '100%';
    el.style.boxSizing = 'border-box';
    el.dataset.widgetType = 'custom-user';
    el.dataset.sortId = 'widget-custom-' + Date.now() + Math.random().toString(36).substr(2, 5);
    
    el.innerHTML = contentHtml;

    if (window.DesktopSort && window.DesktopSort.isEditMode()) {
        var delBtn = document.createElement('div');
        delBtn.className = 'ds-delete-btn';
        delBtn.innerHTML = '<i class="fas fa-minus"></i>';
        delBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            el.remove();
            window.adjustEmptySlots();
            if (window.DesktopSort.saveOrder) window.DesktopSort.saveOrder();
        });
        el.appendChild(delBtn);
    }
        var firstEmpty = page.querySelector('.ds-empty-slot');
    if (firstEmpty) {
        page.insertBefore(el, firstEmpty);
    } else {
        page.appendChild(el);
    }

    if (type === 'image') {
        var bgLayer = document.createElement('div');
        bgLayer.className = 'tw-bg-layer';
        bgLayer.dataset.color = '255,255,255';
        bgLayer.dataset.opacity = '0'; 
        bgLayer.style.backgroundColor = 'rgba(255,255,255,0)';
        el.insertBefore(bgLayer, el.firstChild);
    }

    window.adjustEmptySlots();
    closeWidgetLibrary();
    if (window.DesktopSort && window.DesktopSort.saveOrder) {
        window.DesktopSort.saveOrder();
    }

    // 重置表单
    document.getElementById('custom-widget-base64').value = '';
    document.getElementById('custom-widget-preview').innerHTML = '<i class="fas fa-image" style="color:#ccc; font-size:24px;"></i>';
    document.getElementById('custom-widget-action-type').value = 'none';
    toggleCustomWidgetActionInput('none');
};


window.switchWidgetCategory = function(cat, btn) {
    try {
        var tabs = document.querySelectorAll('.wl-tab');
        if (tabs) {
            for (var i = 0; i < tabs.length; i++) {
                if (tabs[i] && tabs[i].classList) {
                    tabs[i].classList.remove('active');
                }
            }
        }
        if (btn && btn.classList) {
            btn.classList.add('active');
        }
        var categories = ['system', 'aesthetic', 'text', 'media', 'tool', 'custom'];
        for (var j = 0; j < categories.length; j++) {
            var c = categories[j];
            var el = document.getElementById('wl-content-' + c);
            if (el && el.style) el.style.display = 'none';
        }
        var target = document.getElementById('wl-content-' + cat);
        if (target && target.style) target.style.display = 'block';
    } catch (err) {
        console.error('[DesktopSort] switchWidgetCategory Error: ', err);
    }
};

window.addWidget = function(type, sizeClass) {
    var screen = document.getElementById('screen');
    if (!screen) return;
    
    // 先从 sizeClass (比如 'widget-2x2') 里面提取出宽和高，算出需要的格子数
    var match = sizeClass.match(/widget-(\d+)x(\d+)/);
    var w = match ? parseInt(match[1]) : 1;
    var h = match ? parseInt(match[2]) : 1;
    var requiredArea = w * h;

    var pw = screen.clientWidth;
    var sl = screen.scrollLeft;
    var curIdx = Math.round(sl / pw);
    var pages = document.querySelectorAll('.page');
    
    var targetPage = null;
    for (var i = curIdx; i < pages.length; i++) {
        var pageNode = pages[i];
        var items = Array.from(pageNode.children);
        var totalUsed = 0;
        items.forEach(function(el) { 
            if (el.classList.contains('sortable-item') && !el.classList.contains('ds-empty-slot')) {
                var m = el.className.match(/widget-(\d+)x(\d+)/);
                totalUsed += m ? parseInt(m[1]) * parseInt(m[2]) : 1;
            }
        });
        
        if (28 - totalUsed >= requiredArea) {
            targetPage = pageNode;
            break;
        }
    }
    
    if (!targetPage) {
        targetPage = window.DesktopSort.createNewPage();
        setTimeout(function() {
            screen.scrollTo({ left: targetPage.offsetLeft, behavior: 'smooth' });
        }, 100);
    }
    var page = targetPage;

    var el = document.createElement('div');
    el.className = 'sortable-item dynamic-widget ' + sizeClass;
    el.dataset.widgetType = type;
    el.dataset.sortId = 'widget-' + type + '-' + Date.now() + Math.random().toString(36).substr(2, 5);

    if (type === 'unified-header') {
        el.className = 'unified-header-widget sortable-item ' + sizeClass;
        el.innerHTML = '<div class="greeting-text" id="greetingText"></div><div class="clock-profile-combo"><div class="time-block"><span id="h">14</span><span class="time-colon">:</span><span id="m">30</span></div><div class="vertical-divider"></div><div class="profile-stack"><div class="mini-profile-row"><div class="editable-name" contenteditable="true">Hannah</div><div class="avatar-circle-sm" data-edit-key="avatar" onclick="triggerChangeImage(this, \'img\')"><img src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop"></div></div><div class="date-pill" id="fullDate">Jan 30</div></div></div>';
    } else if (type === 'music-card') {
        el.className = 'music-widget sortable-item transparent-widget ' + sizeClass;
        el.setAttribute('onclick', 'openMusicPlayer()');
        el.innerHTML = '<div class="music-info"><div style="font-size:9px; color:#aaa; margin-bottom:5px; letter-spacing:1px;">NOW PLAYING</div><div class="music-title" id="home-music-title" contenteditable="true" onclick="event.stopPropagation()" onblur="saveHomeMusicText()">Lover</div><div class="music-artist" id="home-music-artist" contenteditable="true" onclick="event.stopPropagation()" onblur="saveHomeMusicText()">Taylor Swift</div><div class="wave-box"><div class="wave"></div><div class="wave"></div><div class="wave"></div><div class="wave"></div></div></div><div class="vinyl-record"><div class="vinyl-inner" data-edit-key="music" onclick="event.stopPropagation(); triggerChangeImage(this, \'bg\')"></div></div>';
    } else if (type === 'photo-stack') {
        el.className = 'photo-stack sortable-item transparent-widget ' + sizeClass;
        el.innerHTML = '<div class="stack-item"><img src="https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=200&auto=format&fit=crop" data-edit-key="photo1" onclick="triggerChangeImage(this, \'self\')"></div><div class="stack-item"><img src="https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?q=80&w=200&auto=format&fit=crop" data-edit-key="photo2" onclick="triggerChangeImage(this, \'self\')"></div><div class="stack-item"><img src="https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=200&auto=format&fit=crop" data-edit-key="photo3" onclick="triggerChangeImage(this, \'self\')"></div>';
    } else if (type === 'k-mood-board') {
        el.className = 'k-mood-board sortable-item transparent-widget ' + sizeClass;
        el.innerHTML = '<div class="k-cd-player"><div class="k-disc-wrap"><div class="k-disc" data-edit-key="k_cd_cover" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=200&auto=format&fit=crop\');"><div class="k-disc-center"></div></div></div><div class="k-song-info"><div class="k-play-btn"><i class="fas fa-play"></i></div><div style="flex:1;"><div contenteditable="true" class="k-song-title" id="p3-song">Palette</div><div contenteditable="true" class="k-artist" id="p3-artist">IU (아이유)</div></div></div></div><div class="k-polaroid"><div class="k-tape"></div><div class="k-photo-frame" data-edit-key="k_polaroid_img" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?q=80&w=300&auto=format&fit=crop\');"></div><div class="k-handwriting" contenteditable="true" id="p3-handwriting">Vibe ☁️</div></div>';
    } else if (type === 'collection-ticker') {
        el.className = 'collection-ticker-widget sortable-item transparent-widget ' + sizeClass;
        el.style.transform = 'scale(0.95)';
        el.style.transformOrigin = 'top center';
        el.innerHTML = '<div class="ticker-icon"><i class="fas fa-quote-left"></i></div><div class="ticker-wrapper"><div class="ticker-content"><span>记得给阳台的花浇水</span><span class="dot">·</span><span>下周五去看展</span><span class="dot">·</span><span>密码 123456</span><span class="dot">·</span><span>Stay foolish</span><span class="dot">·</span><span>买猫粮</span><span class="dot">·</span></div><div class="ticker-content"><span>记得给阳台的花浇水</span><span class="dot">·</span><span>下周五去看展</span><span class="dot">·</span><span>密码 123456</span><span class="dot">·</span><span>Stay foolish</span><span class="dot">·</span><span>买猫粮</span><span class="dot">·</span></div></div><div class="ticker-img-circle"><img src="https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=200&auto=format&fit=crop" data-edit-key="p4_ticker_img" onclick="triggerChangeImage(this, \'self\')"></div>';
    } else if (type === 'k-time-carousel') {
        el.className = 'k-time-carousel-widget sortable-item transparent-widget ' + sizeClass;
        el.innerHTML = '<div class="tc-left"><div class="tc-time" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">14:30</div><div class="tc-date" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Sun, Apr 05</div></div><div class="tc-right"><div class="tc-polaroid"><div class="tc-tape"></div><div class="tc-img" data-edit-key="tcimg_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image:url(\'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?q=80&w=300&auto=format&fit=crop\')"></div><div class="tc-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Good Afternoon ☕️</div></div></div>';
    } else if (type === 'k-badge') {
        el.className = 'k-badge-widget sortable-item ' + sizeClass;
        el.innerHTML = '<div class="badge-lace"></div><div class="badge-inner" data-edit-key="bdgimg_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image:url(\'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop\')"></div><div class="badge-highlight"></div><div class="badge-pin"></div><div class="badge-ribbon badge-ribbon-left"></div><div class="badge-ribbon badge-ribbon-right"></div>';
    } else if (type === 'k-profile-card') {
        el.className = 'k-profile-card-widget sortable-item transparent-widget widget-4x2'; // 强制改为横版尺寸
        el.innerHTML = '<div class="pc-avatar-wrap"><div class="pc-avatar" data-edit-key="pcav_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image:url(\'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop\')"></div></div><div class="pc-info"><div class="pc-name" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Hannah</div><div class="pc-sign" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Dreamer ☁️ & Creator</div></div><div class="pc-tag">PROFILE</div>';
    } else if (type === 'k-gameboy') {
        el.className = 'k-gameboy-widget sortable-item ' + sizeClass;
        el.innerHTML = '<div class="gb-screen-container"><div class="gb-screen" data-edit-key="gbimg_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image:url(\'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=300&auto=format&fit=crop\')"></div></div><div class="gb-controls"><div class="gb-dpad"><div class="gb-dpad-center"></div></div><div class="gb-buttons"><div class="gb-btn-wrap"><div class="gb-btn"></div></div><div class="gb-btn-wrap"><div class="gb-btn"></div></div></div></div><div class="gb-speaker"><div class="gb-speaker-hole"></div><div class="gb-speaker-hole"></div><div class="gb-speaker-hole"></div><div class="gb-speaker-hole"></div></div><div class="gb-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">GAMEBOY</div><div class="gb-sticker" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">🌷</div><div class="gb-power-light"></div>';
    } else if (type === 'receipt-short') {
        el.className = 'receipt-widget short-version sortable-item transparent-widget ' + sizeClass;
        el.style.transform = 'scale(0.95)';
        el.style.transformOrigin = 'top center';
        el.innerHTML = '<div class="receipt-hole"></div><div class="receipt-header"><div class="receipt-title">RECEIPT</div><div class="receipt-date">NO.2026-02-22</div></div><div class="receipt-divider-dashed"></div><div class="receipt-list"><div class="receipt-item" onclick="openSimulatedApp(\'taobao\')"><div class="r-item-name"><span class="r-qty">01</span><span>SHOPPING (Taobao)</span></div><div class="r-item-price">OPEN <i class="fas fa-chevron-right" style="font-size:8px;"></i></div></div><div class="receipt-item" onclick="openSimulatedApp(\'meituan\')"><div class="r-item-name"><span class="r-qty">02</span><span>DELIVERY (Meituan)</span></div><div class="r-item-price">OPEN <i class="fas fa-chevron-right" style="font-size:8px;"></i></div></div></div><div class="receipt-divider-line"></div><div class="receipt-footer"><div class="receipt-total"><span>TOTAL</span><span style="font-weight:700;">¥ 999.00</span></div><div class="receipt-barcode">||| || ||| | |||| || || | |||| |||</div></div>';
    } else if (type === 'k-dday') {
        el.className = 'k-dday-widget sortable-item transparent-widget ' + sizeClass;
        el.innerHTML = '<div class="k-dday-title" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Anniversary</div><div class="k-dday-days" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">100</div><div class="k-dday-heart">❤️</div>';
    } else if (type === 'k-polaroid') {
        el.className = 'k-polaroid-widget sortable-item ' + sizeClass;
        el.innerHTML = '<div class="k-tape-top"></div><div class="k-photo-img" data-edit-key="k_polaroid_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?q=80&w=300&auto=format&fit=crop\');"></div><div class="k-handwriting-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Smile!</div>';
    } else if (type === 'k-todo') {
        el.className = 'k-todo-widget sortable-item ' + sizeClass;
        el.innerHTML = '<div class="k-todo-tape"></div><div class="k-todo-title" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">📝 TO-DO LIST</div><div class="k-todo-list"><div class="k-todo-item"><div class="k-todo-check" onclick="this.classList.toggle(\'checked\'); if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">✓</div><div class="k-todo-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Buy some coffee</div></div><div class="k-todo-item"><div class="k-todo-check" onclick="this.classList.toggle(\'checked\'); if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">✓</div><div class="k-todo-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Read a book</div></div><div class="k-todo-item"><div class="k-todo-check" onclick="this.classList.toggle(\'checked\'); if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">✓</div><div class="k-todo-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Call Mom</div></div></div>';
    } else if (type === 'k-mood') {
        el.className = 'k-mood-widget sortable-item ' + sizeClass;
        el.innerHTML = '<div><div class="k-mood-emoji" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">☁️</div><div class="k-mood-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Feeling Good</div></div>';
    } else if (type === 'k-journal') {
        el.className = 'k-journal-widget sortable-item transparent-widget ' + sizeClass;
        el.innerHTML = '<div class="k-j-img" data-edit-key="k_journal_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1505682614136-0a12f9f7beea?q=80&w=200&auto=format&fit=crop\');"></div><div class="k-j-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">"Make it happen."</div><div class="k-j-date" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">2026.04.05</div>';
    } else if (type === 'k-ticket') {
        el.className = 'k-ticket-widget sortable-item transparent-widget ' + sizeClass;
        el.innerHTML = '<div class="k-t-img" data-edit-key="k_ticket_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1544928147-79a2dbc1f389?q=80&w=200&auto=format&fit=crop\');"></div><div class="k-t-info"><div class="k-t-header" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">ADMIT ONE</div><div class="k-t-title" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Exhibition</div><div class="k-t-date" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Date: 2026.10.24</div><div class="k-t-barcode">||| | || ||| || |</div></div>';
    } else if (type === 'k-four-cuts') {
        el.className = 'k-four-cuts-widget sortable-item transparent-widget ' + sizeClass;
        el.innerHTML = '<div class="fc-photo" data-edit-key="fc1_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=200\');"></div><div class="fc-photo" data-edit-key="fc2_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=200\');"></div><div class="fc-photo" data-edit-key="fc3_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?q=80&w=200\');"></div><div class="fc-photo" data-edit-key="fc4_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=200\');"></div><div class="fc-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Life 4 Cuts</div>';
    } else if (type === 'k-scrapbook') {
        el.className = 'k-scrapbook-widget sortable-item ' + sizeClass;
        el.innerHTML = '<div class="sb-title" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Memory</div><div class="sb-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Good times with you. We made it happen!</div><div class="sb-tape"></div><div class="sb-photo" data-edit-key="sb_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1490730141103-6cac27aaab94?q=80&w=300\');"></div>';
    } else if (type === 'k-cassette') {
        el.className = 'k-cassette-widget sortable-item transparent-widget ' + sizeClass;
        el.innerHTML = '<div class="c-sticker"><div class="c-img" data-edit-key="cimg_' + Date.now() + '" style="background-image:url(\'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=400\')"></div><div class="c-hole"></div><div class="c-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()" data-edit-key="ctext" onclick="triggerChangeImage(this.previousSibling.previousSibling, \'bg\')">Y2K MIXTAPE</div><div class="c-hole"></div></div>';
    } else if (type === 'k-keyring') {
        el.className = 'k-keyring-widget sortable-item transparent-widget ' + sizeClass;
        el.innerHTML = '<div class="kr-ring"></div><div class="kr-hole"></div><div class="kr-img" data-edit-key="kr_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200\');"></div><div class="kr-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Love It!</div>';
    } else if (type === 'k-cafe-stamp') {
        el.className = 'k-cafe-stamp-widget sortable-item ' + sizeClass;
        el.innerHTML = '<div class="c-left"><div class="c-title" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">My Daily Cafe</div><div class="c-stamps"><div class="c-stamp-circle stamped" onclick="this.classList.toggle(\'stamped\'); if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()"></div><div class="c-stamp-circle stamped" onclick="this.classList.toggle(\'stamped\'); if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()"></div><div class="c-stamp-circle stamped" onclick="this.classList.toggle(\'stamped\'); if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()"></div><div class="c-stamp-circle" onclick="this.classList.toggle(\'stamped\'); if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()"></div><div class="c-stamp-circle" onclick="this.classList.toggle(\'stamped\'); if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()"></div><div class="c-stamp-circle" onclick="this.classList.toggle(\'stamped\'); if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()"></div><div class="c-stamp-circle" onclick="this.classList.toggle(\'stamped\'); if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()"></div><div class="c-stamp-circle" onclick="this.classList.toggle(\'stamped\'); if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()"></div></div></div><div class="c-right" data-edit-key="cimg_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1509042239860-f550ce710b93?q=80&w=200\');"></div>';
    } else if (type === 'k-train-ticket') {
        el.className = 'k-train-ticket-widget sortable-item ' + sizeClass;
        el.innerHTML = '<div class="tt-top"><span contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Train Ticket</span><span contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">No.0824</span></div><div class="tt-middle"><div class="tt-station" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Reality</div><div class="tt-arrow">➔</div><div class="tt-station" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Dream</div></div><div class="tt-bottom" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">DATE: 2026.04.05</div>';
    } else if (type === 'k-photocard') {
        el.className = 'k-photocard-widget sortable-item transparent-widget ' + sizeClass;
        el.innerHTML = '<div class="pc-img" data-edit-key="pcimg_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200\');"></div><div class="pc-name" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Love</div>';
    } else if (type === 'k-cdcase') {
        el.className = 'k-cdcase-widget sortable-item transparent-widget ' + sizeClass;
        el.innerHTML = '<div class="cd-spine"></div><div class="cd-cover" data-edit-key="cdimg_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200\');"><div class="cd-marker" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">VOL.1</div></div>';
    } else if (type === 'k-envelope') {
        el.className = 'k-envelope-widget sortable-item ' + sizeClass;
        el.innerHTML = '<div class="ev-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">To: My Dear</div><div class="ev-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">From: Yours</div><div class="ev-message" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Always with you.</div><div class="ev-seal" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">W</div>';
    } else if (type === 'k-planner') {
        el.className = 'k-planner-widget sortable-item ' + sizeClass;
        el.innerHTML = '<div class="pl-header"><div class="pl-polaroid"><div class="pl-tape"></div><div class="pl-polaroid-img" data-edit-key="plimg_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1505682614136-0a12f9f7beea?q=80&w=200\');"></div></div><div class="pl-title" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">My Daily Plan</div></div><div class="pl-lines"><div class="pl-line" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">1. Wake up early</div><div class="pl-line" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">2. Drink coffee</div><div class="pl-line" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">3. Be happy</div></div>';
       } else if (type === 'k-receipt-clear') {
        el.className = 'k-receipt-clear-widget sortable-item transparent-widget ' + sizeClass;
        el.innerHTML = '<div class="k-rc-barcode">||| || | |||</div><div class="k-rc-img" data-edit-key="rcimg_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1509042239860-f550ce710b93?q=80&w=200&auto=format&fit=crop\');"></div><div class="k-rc-text"><span contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">ORDER:</span><span contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">My Life</span></div><div class="k-rc-dash"></div><div class="k-rc-text"><span contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">1x Iced Americano</span></div>';
    } else if (type === 'k-acrylic-cd') {
        el.className = 'k-acrylic-cd-widget sortable-item transparent-widget ' + sizeClass;
        el.innerHTML = '<div class="k-acd-cover" data-edit-key="acdimg_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=200&auto=format&fit=crop\');"></div><div class="k-acd-info"><div class="k-acd-title" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Ditto</div><div class="k-acd-artist" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">NewJeans</div><div class="k-acd-bar"></div></div>';
    } else if (type === 'k-tracing-scrapbook') {
        el.className = 'k-tracing-scrapbook-widget sortable-item transparent-widget ' + sizeClass;
        el.innerHTML = '<div class="k-ts-paper k-ts-paper1"><div class="k-ts-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Today is<br>a gift.</div></div><div class="k-ts-paper k-ts-paper2"><div class="k-ts-tape"></div><div class="k-ts-img" data-edit-key="tsimg_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=300&auto=format&fit=crop\');"></div><div style="font-family:\'Montserrat\'; font-size:8px; color:#aaa; text-align:center; margin-top:4px; font-weight:bold;">MEMORIES</div></div>';
    } else if (type === 'k-mood-stand') {
        el.className = 'k-mood-stand-widget sortable-item transparent-widget ' + sizeClass;
        el.innerHTML = '<div class="k-ms-top"><div class="k-ms-date" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">24</div><div class="k-ms-img" data-edit-key="msimg_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop\');"></div></div><div class="k-ms-bottom" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">FEELING GOOD TODAY</div>';
    } else if (type === 'k-banner-profile') {
        el.className = 'k-banner-profile-widget sortable-item transparent-widget ' + sizeClass;
        el.innerHTML = '<div class="k-bp-banner" data-edit-key="bpbg_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1505682614136-0a12f9f7beea?q=80&w=400&auto=format&fit=crop\');"></div><div class="k-bp-avatar" data-edit-key="bpav_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop\');"></div><div class="k-bp-info"><div class="k-bp-name" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Hannah Kim</div><div class="k-bp-bio" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Art Director & Dreamer</div></div>';
    } else if (type === 'k-dialogue-bubbles') {
        el.className = 'k-dialogue-bubbles-widget sortable-item transparent-widget ' + sizeClass;
        el.innerHTML = '<div class="k-db-row left"><div class="k-db-avatar" data-edit-key="dbav1_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=100\');"></div><div class="k-db-bubble" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">今天天气真好呀 ☁️</div></div><div class="k-db-row right"><div class="k-db-avatar" data-edit-key="dbav2_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=100\');"></div><div class="k-db-bubble" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">那我们要不要去海边走走？</div></div>';

    } else {
        el.innerHTML = '<div style="padding:10px; outline:none; text-align:center;" contenteditable="true" onblur="window.DesktopSort.saveOrder()">New Widget</div>';
    }
    
    if (!el.classList.contains('dynamic-widget')) {
        el.classList.add('dynamic-widget');
    }

    if (window.DesktopSort && window.DesktopSort.isEditMode()) {
        var delBtn = document.createElement('div');
        delBtn.className = 'ds-delete-btn';
        delBtn.innerHTML = '<i class="fas fa-minus"></i>';
        delBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            // 小组件删除时自动补位
            el.remove();
            window.adjustEmptySlots(); // 删除后自动填补空位
            if (window.DesktopSort.saveOrder) window.DesktopSort.saveOrder();
        });
        el.appendChild(delBtn);

        if (el.classList.contains('k-scrapbook-widget') || 
            el.classList.contains('k-todo-widget') || 
            el.classList.contains('k-train-ticket-widget') || 
            el.classList.contains('k-envelope-widget') ||
            el.classList.contains('k-planner-widget')) {
            var colorBtn = document.createElement('div');
            colorBtn.className = 'ds-color-btn';
            colorBtn.innerHTML = '<i class="fas fa-palette"></i>';
            colorBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if(window.DesktopSort.cycleWidgetColor) {
                    window.DesktopSort.cycleWidgetColor(el);
                }
            });
            el.appendChild(colorBtn);
        } else {
            // 新创建的组件如果不在排除列表中，自动加上 transparent-widget
            if (!el.classList.contains('transparent-widget')) {
                el.classList.add('transparent-widget');
            }
        }

        if (el.classList.contains('transparent-widget')) {
            var opacityBtn = document.createElement('div');
            opacityBtn.className = 'ds-opacity-btn';
            opacityBtn.innerHTML = '<i class="fas fa-sliders-h"></i>';
            opacityBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (window.DesktopSort && window.DesktopSort.toggleOpacityControls) {
                    window.DesktopSort.toggleOpacityControls(el);
                }
            });
            el.appendChild(opacityBtn);
        }
    }
    
        var firstEmpty = page.querySelector('.ds-empty-slot');
    if (firstEmpty) {
        page.insertBefore(el, firstEmpty);
    } else {
        page.appendChild(el);
    }

   

    window.adjustEmptySlots(); // 增加组件后，挤掉多余的透明空格子，保持完美网格！
    closeWidgetLibrary();
    if (window.DesktopSort && window.DesktopSort.saveOrder) {
        window.DesktopSort.saveOrder();
    }
};
