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
        if (el.classList.contains('widget-4x4')) return 16;
        if (el.classList.contains('widget-4x3')) return 12;
        if (el.classList.contains('widget-4x2')) return 8;
        if (el.classList.contains('widget-4x1')) return 4;
        if (el.classList.contains('widget-2x3')) return 6;
        if (el.classList.contains('widget-2x2')) return 4;
        if (el.classList.contains('widget-2x1')) return 2;
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
                    el.className = 'sortable-item dynamic-widget ' + (widgetData.sizeClass || '');
                    el.dataset.widgetType = widgetData.type || 'unknown';
                    el.dataset.sortId = sortId;
                    el.innerHTML = widgetData.html || '';
                }
                if (el) { page.appendChild(el); }
            });
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

        removeEdgeIndicators();
        stopEdgeScroll();

        sortableInstances.forEach(function (s) { try { s.destroy(); } catch (e) {} });
        sortableInstances = [];

        var screen = getScreen();
        if (screen) {
            screen.style.scrollSnapType = screen.dataset.origSnapType || 'x mandatory';
            screen.style.overflowX = screen.dataset.origOverflow || '';
        }
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

    var EDGE_THRESHOLD = 40;
    var EDGE_SCROLL_DELAY = 600;
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
                    if (nearLeft && curIdx > 0) { scrollToPage(curIdx - 1); } 
                    else if (nearRight && curIdx < getPages().length - 1) { scrollToPage(curIdx + 1); }
                    edgeScrollTimer = null;
                }, EDGE_SCROLL_DELAY);
            }
        } else {
            stopEdgeScroll();
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
                    var isWidget = !e.item.classList.contains('app-cell') && !e.item.classList.contains('ds-empty-slot');
                    this.option('swap', !isWidget);
                },
                onMove: function (evt) { onDragMove(evt); },
                onEnd: function (e) {
                    e.item.style.transform = '';
                    e.item.style.opacity = '';
                    stopEdgeScroll();
                    window.adjustEmptySlots(); // 拖完计算是否需要补格子
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
            if (e.target.closest('.ds-delete-btn') || e.target.closest('.desktop-add-btn') || e.target.closest('.desktop-done-btn')) return;
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

    window.DesktopSort = {
        enterEditMode: enterEditMode,
        exitEditMode: exitEditMode,
        saveOrder: saveOrder,
        restoreOrder: restoreOrder,
        isEditMode: function () { return editMode; },
        flatten: flattenAllPages
    };

})();

/* === 小组件库逻辑 === */
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
        setTimeout(function() { modal.style.display = 'none'; }, 300);
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
    var screen = document.getElementById('screen');
    if (!screen) return;
    var pw = screen.clientWidth;
    var sl = screen.scrollLeft;
    var curIdx = Math.round(sl / pw);
    var pages = document.querySelectorAll('.page');
    var page = pages[curIdx];
    if (!page) page = pages[0];
    
    var el = document.createElement('div');
    el.className = 'sortable-item dynamic-widget ' + sizeClass;
    el.dataset.widgetType = type;
    el.dataset.sortId = 'widget-' + type + '-' + Date.now() + Math.random().toString(36).substr(2, 5);

    // [因字数原因，此处省略了具体的innerHTML生成代码，保持你原来的不变即可]
    if (type === 'weather') {
        el.innerHTML = '<div style="height:100%; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg, #74ebd5, #9face6); color:#fff; font-size:24px; font-weight:700; border-radius:16px;"><i class="fas fa-cloud-sun"></i> 24°C</div>';
    } else if (type === 'k-memo-pad') {
        el.innerHTML = '<div style="height:100%; width:100%; background:#fffdf5; border:1px solid #e0dcd3; box-shadow:2px 4px 10px rgba(0,0,0,0.05); position:relative; display:flex; align-items:center; justify-content:center; flex-direction:column; padding:10px; box-sizing:border-box;"><div style="width:30%; height:10px; background:rgba(255,255,255,0.7); border:1px solid #eee; position:absolute; top:-5px;"></div><div style="font-family:\'Caveat\', cursive; font-size:16px; color:#555; text-align:center; outline:none; width:100%;" contenteditable="true" onblur="window.DesktopSort.saveOrder()">Write<br>something...</div></div>';
    } else if (type === 'k-film-strip') {
        el.innerHTML = '<div style="height:100%; width:100%; background:#111; border-radius:4px; display:flex; align-items:center; justify-content:space-around; padding:5px; box-sizing:border-box; position:relative; overflow:hidden;"><div style="width:100%; height:8px; border-bottom:2px dashed #333; position:absolute; top:0;"></div><div style="width:100%; height:8px; border-top:2px dashed #333; position:absolute; bottom:0;"></div><div style="width:30%; height:80%; background:#fff; margin:0 2px; border-radius:2px; overflow:hidden;"><img src="https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?q=80&w=200&auto=format&fit=crop" style="width:100%;height:100%;object-fit:cover;" onclick="window.triggerChangeImage(this, \'self\')"></div><div style="width:30%; height:80%; background:#fff; margin:0 2px; border-radius:2px; overflow:hidden;"><img src="https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=200&auto=format&fit=crop" style="width:100%;height:100%;object-fit:cover;" onclick="window.triggerChangeImage(this, \'self\')"></div><div style="width:30%; height:80%; background:#fff; margin:0 2px; border-radius:2px; overflow:hidden;"><img src="https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=200&auto=format&fit=crop" style="width:100%;height:100%;object-fit:cover;" onclick="window.triggerChangeImage(this, \'self\')"></div></div>';
    } else if (type === 'k-stamp') {
        el.innerHTML = '<div style="height:100%; width:100%; background:#fff; padding:8px; box-sizing:border-box; display:flex; flex-direction:column; align-items:center; border:1px dashed #ccc; box-shadow:0 4px 10px rgba(0,0,0,0.05);"><div style="width:100%; flex:1; background:#eee; overflow:hidden;"><img src="https://images.unsplash.com/photo-1494859802809-d069c3b71a8a?q=80&w=200&auto=format&fit=crop" style="width:100%;height:100%;object-fit:cover;" onclick="window.triggerChangeImage(this, \'self\')"></div><div style="font-size:12px; color:#999; margin-top:6px; outline:none; text-align:center;" contenteditable="true" onblur="window.DesktopSort.saveOrder()">SEOUL</div></div>';
    } else if (type === 'k-ticket') {
        el.innerHTML = '<div style="height:100%; width:100%; background:#fff; border-radius:8px; display:flex; padding:0; box-sizing:border-box; position:relative; overflow:hidden; border:1px solid #eaeaea; box-shadow:0 4px 15px rgba(0,0,0,0.03);"><div style="flex:1; padding:10px; display:flex; flex-direction:column; justify-content:center;"><div style="font-size:10px; color:#aaa; outline:none;" contenteditable="true" onblur="window.DesktopSort.saveOrder()">ADMIT ONE</div><div style="font-size:16px; font-weight:bold; color:#333; margin-top:4px; outline:none;" contenteditable="true" onblur="window.DesktopSort.saveOrder()">NIGHT IN SEOUL</div><div style="font-size:10px; color:#999; margin-top:4px; outline:none;" contenteditable="true" onblur="window.DesktopSort.saveOrder()">DATE: 2026.04.03</div></div><div style="width:1px; height:100%; border-left:2px dashed #ccc; position:relative;"><div style="width:12px; height:12px; background:#f5f5f5; border-radius:50%; position:absolute; top:-6px; left:-6px; border-bottom:1px solid #eaeaea;"></div><div style="width:12px; height:12px; background:#f5f5f5; border-radius:50%; position:absolute; bottom:-6px; left:-6px; border-top:1px solid #eaeaea;"></div></div><div style="width:60px; display:flex; align-items:center; justify-content:center; padding:5px;"><img src="https://images.unsplash.com/photo-1542204165-65bf26472b9b?q=80&w=200&auto=format&fit=crop" style="width:100%; height:100%; object-fit:cover; border-radius:4px;" onclick="window.triggerChangeImage(this, \'self\')"></div></div>';
    } else if (type === 'k-cassette') {
        el.innerHTML = '<div style="height:100%; width:100%; background:#e0e0e0; border-radius:8px; padding:6px; box-sizing:border-box; position:relative; border:1px solid #ccc; box-shadow:inset 0 2px 5px rgba(255,255,255,0.5), 0 4px 10px rgba(0,0,0,0.1);"><div style="width:100%; height:100%; background:#fff; border-radius:4px; position:relative; overflow:hidden; display:flex; flex-direction:column; align-items:center;"><div style="width:100%; height:25px; background:#ff7675; display:flex; justify-content:center; align-items:center;" onclick="window.triggerChangeImage(this, \'bg\')"><div style="font-size:10px; color:#fff; font-weight:bold; outline:none;" contenteditable="true" onblur="window.DesktopSort.saveOrder()" onclick="event.stopPropagation()">MIX TAPE</div></div><div style="display:flex; justify-content:center; align-items:center; flex:1; width:100%; gap:20px;"><div style="width:24px; height:24px; background:#fff; border-radius:50%; border:3px solid #333; position:relative;"><div style="width:8px;height:8px;background:#333;border-radius:50%;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);"></div></div><div style="width:40px; height:16px; background:#333; border-radius:8px;"></div><div style="width:24px; height:24px; background:#fff; border-radius:50%; border:3px solid #333; position:relative;"><div style="width:8px;height:8px;background:#333;border-radius:50%;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);"></div></div></div></div></div>';
    } else if (type === 'k-cd') {
        el.innerHTML = '<div style="height:100%; width:100%; background:rgba(255,255,255,0.8); border:2px solid rgba(255,255,255,0.5); border-radius:8px; padding:4px; box-sizing:border-box; box-shadow:0 4px 15px rgba(0,0,0,0.05); backdrop-filter:blur(5px); position:relative; display:flex; flex-direction:column;"><div style="width:10px; height:100%; background:rgba(200,200,200,0.2); position:absolute; left:0; top:0; border-right:1px solid rgba(255,255,255,0.5); border-radius:8px 0 0 8px;"></div><div style="flex:1; background:#111; border-radius:4px; margin-left:12px; overflow:hidden; position:relative; display:flex; align-items:center; justify-content:center;" onclick="window.triggerChangeImage(this, \'bg\')"><div style="width:60px; height:60px; border-radius:50%; background:linear-gradient(135deg, #eee, #ccc); border:1px solid #999; display:flex; align-items:center; justify-content:center; pointer-events:none;"><div style="width:15px; height:15px; background:#111; border-radius:50%; border:2px solid #ccc;"></div></div></div></div>';
    } else if (type === 'k-polaroid') {
        el.innerHTML = '<div style="height:100%; width:100%; background:#fff; border:1px solid #f5f5f5; border-radius:12px; display:flex; flex-direction:column; box-shadow:0 4px 20px rgba(0,0,0,0.03); padding:10px; box-sizing:border-box;"><div style="flex:1; background:#f0f0f0; border-radius:6px; overflow:hidden; position:relative; display:flex; flex-direction:column;"><img src="https://images.unsplash.com/photo-1516483638261-f40af5aa3143?q=80&w=300&auto=format&fit=crop&grayscale" style="width:100%;height:100%;object-fit:cover;" onclick="window.triggerChangeImage(this, \'self\')"><div style="position:absolute; top:0; left:0; right:0; bottom:0; background:linear-gradient(to bottom, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.1) 100%); mix-blend-mode:overlay; pointer-events:none;"></div></div><div style="height:30px; font-family:\'Brush Script MT\', cursive, sans-serif; font-size:16px; text-align:center; color:#444; margin-top:6px; display:flex; align-items:center; justify-content:center; letter-spacing:1px; outline:none;" contenteditable="true" onblur="window.DesktopSort.saveOrder()">Memories</div></div>';
    } else if (type === 'k-vinyl') {
        el.innerHTML = '<div style="height:100%; width:100%; background:#fcfcfc; border:1px solid #f0f0f0; border-radius:20px; display:flex; flex-direction:column; justify-content:center; align-items:center; box-shadow:0 4px 15px rgba(0,0,0,0.02);"><div style="width:80%; padding-bottom:80%; border-radius:50%; background-image:url(\'https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=300&auto=format&fit=crop\'); background-size:cover; display:flex; justify-content:center; align-items:center; box-shadow:inset 0 0 10px rgba(0,0,0,0.8);" onclick="window.triggerChangeImage(this, \'bg\')"><div style="width:25%; padding-bottom:25%; border-radius:50%; background:#f5f5f5; border:1px solid #ccc; display:flex; justify-content:center; align-items:center; position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); pointer-events:none;"><div style="width:30%; padding-bottom:30%; border-radius:50%; background:#222; position:absolute; top:50%; left:50%; transform:translate(-50%, -50%);"></div></div></div></div>';
    } else if (type === 'k-receipt') {
        el.innerHTML = '<div style="height:100%; width:100%; background:#fff; border:1px solid #eee; border-radius:0; position:relative; display:flex; flex-direction:column; padding:15px 12px; box-sizing:border-box; box-shadow:2px 4px 15px rgba(0,0,0,0.04);"><div style="position:absolute; top:-4px; left:0; right:0; height:4px; background:linear-gradient(-45deg, transparent 3px, #fff 0), linear-gradient(45deg, transparent 3px, #fff 0); background-repeat:repeat-x; background-size:8px 8px; background-position:left bottom;"></div><div style="text-align:center; font-size:12px; font-family:\'Courier New\', Courier, monospace; color:#333; letter-spacing:1px; margin-bottom:8px; font-weight:bold; outline:none;" contenteditable="true" onblur="window.DesktopSort.saveOrder()">RECEIPT</div><div style="border-top:1px dashed #ccc; margin-bottom:10px;"></div><div style="display:flex; justify-content:space-between; font-size:11px; color:#555; font-family:\'Courier New\', Courier, monospace; margin-bottom:6px;"><span contenteditable="true" outline="none" onblur="window.DesktopSort.saveOrder()">COFFEE</span><span contenteditable="true" outline="none" onblur="window.DesktopSort.saveOrder()">$4.5</span></div><div style="display:flex; justify-content:space-between; font-size:11px; color:#555; font-family:\'Courier New\', Courier, monospace; margin-bottom:6px;"><span contenteditable="true" outline="none" onblur="window.DesktopSort.saveOrder()">CAKE</span><span contenteditable="true" outline="none" onblur="window.DesktopSort.saveOrder()">$8.0</span></div><div style="display:flex; justify-content:space-between; font-size:11px; color:#555; font-family:\'Courier New\', Courier, monospace;"><span contenteditable="true" outline="none" onblur="window.DesktopSort.saveOrder()">TEA</span><span contenteditable="true" outline="none" onblur="window.DesktopSort.saveOrder()">$3.5</span></div><div style="border-top:1px dashed #ccc; margin-top:auto; margin-bottom:10px;"></div><div style="display:flex; justify-content:space-between; align-items:flex-end;"><span style="font-size:10px; font-family:\'Courier New\', Courier, monospace; color:#888;">TOTAL</span><span style="font-size:16px; font-family:\'Courier New\', Courier, monospace; color:#111; font-weight:bold;" contenteditable="true" outline="none" onblur="window.DesktopSort.saveOrder()">$16.0</span></div><div style="position:absolute; bottom:-4px; left:0; right:0; height:4px; background:linear-gradient(-135deg, transparent 3px, #fff 0), linear-gradient(135deg, transparent 3px, #fff 0); background-repeat:repeat-x; background-size:8px 8px; background-position:left top;"></div></div>';
    } else if (type === 'k-mood') {
        el.innerHTML = '<div style="height:100%; width:100%; background:#333; border-radius:20px; display:flex; flex-direction:column; justify-content:center; align-items:center; position:relative;"><div style="font-size:32px; color:#fff; margin-bottom:8px; outline:none; text-align:center;" contenteditable="true" onblur="window.DesktopSort.saveOrder()">❤️</div><div style="font-size:11px; color:#fff; letter-spacing:2px; font-weight:300; outline:none; text-align:center;" contenteditable="true" onblur="window.DesktopSort.saveOrder()">MOOD</div></div>';
    } else if (type === 'k-wave-quote') {
        el.innerHTML = '<div style="height:100%; width:100%; background:#fff; border:1px solid #f5f5f5; border-radius:20px; display:flex; align-items:center; box-shadow:0 4px 15px rgba(0,0,0,0.03); padding:15px; box-sizing:border-box;"><div style="width:4px; height:80%; background:#e0e0e0; border-radius:2px; margin-right:15px;"></div><div style="flex:1; display:flex; flex-direction:column; justify-content:center;"><div style="font-size:14px; font-weight:600; color:#444; line-height:1.5; outline:none; font-family:\'Montserrat\', sans-serif;" contenteditable="true" onblur="window.DesktopSort.saveOrder()">Breathe in, breathe out.</div><div style="font-size:10px; color:#aaa; margin-top:6px; outline:none;" contenteditable="true" onblur="window.DesktopSort.saveOrder()">Just keep swimming.</div></div></div>';
    } else if (type === 'photo') {
        el.innerHTML = '<div style="height:100%; width:100%; background-image:url(\'https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=200&auto=format&fit=crop\'); background-size:cover; background-position:center; border-radius:16px; box-shadow:0 8px 15px rgba(0,0,0,0.1); border:3px solid #fff; position:relative;" onclick="window.triggerChangeImage(this, \'bg\')"><div style="position:absolute; bottom:8px; right:8px; font-size:20px; color:#ff4d4f; filter:drop-shadow(0 2px 2px rgba(0,0,0,0.3));" contenteditable="true" onblur="window.DesktopSort.saveOrder()">❤️</div></div>';
    } else if (type === 'clock') {
        el.innerHTML = '<div style="height:100%; width:100%; background:#fff; border-radius:20px; box-shadow:inset 5px 5px 10px #e6e6e6, inset -5px -5px 10px #ffffff, 0 4px 15px rgba(0,0,0,0.05); align-items:center; justify-content:center; display:flex; position:relative;"><div style="width:8px; height:8px; background:#ff4d4f; border-radius:50%; position:absolute;"></div><div style="width:2px; height:30%; background:#333; position:absolute; top:20%; border-radius:2px;"></div><div style="width:20%; height:2px; background:#666; position:absolute; right:20%; border-radius:2px;"></div><div style="position:absolute; font-size:10px; color:#ccc; top:8px;">XII</div><div style="position:absolute; font-size:10px; color:#ccc; bottom:8px;">VI</div></div>';
    } else if (type === 'music') {
        el.innerHTML = '<div style="height:100%; width:100%; background:#1a1a1a; border-radius:20px; color:#fff; display:flex; align-items:center; padding:0 15px; box-sizing:border-box; box-shadow:0 10px 20px rgba(0,0,0,0.15); position:relative; overflow:hidden;"><div style="position:absolute; top:0; left:0; right:0; bottom:0; background:linear-gradient(45deg, rgba(255,255,255,0.05) 0%, transparent 100%); pointer-events:none;"></div><div style="width:50px; height:50px; border-radius:50%; background:conic-gradient(#ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3); margin-right:15px; box-shadow:0 0 10px rgba(255,255,255,0.2); position:relative;"><div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:15px; height:15px; background:#1a1a1a; border-radius:50%; border:2px solid #333;"></div></div><div style="flex:1;"><div style="font-weight:800; font-size:14px; letter-spacing:0.5px; outline:none;" contenteditable="true" onblur="window.DesktopSort.saveOrder()">Vaporwave</div><div style="font-size:10px; color:#aaa; margin-top:4px; display:flex; justify-content:space-between; align-items:center;"><span contenteditable="true" outline="none" onblur="window.DesktopSort.saveOrder()">Retro</span><div style="display:flex; gap:3px;"><div style="width:2px; height:8px; background:#ff7e67; border-radius:1px;"></div><div style="width:2px; height:12px; background:#ff7e67; border-radius:1px;"></div><div style="width:2px; height:6px; background:#ff7e67; border-radius:1px;"></div></div></div></div></div>';
    } else if (type === 'search') {
        el.innerHTML = '<div style="height:100%; width:100%; background:#fff; border-radius:25px; color:#888; display:flex; align-items:center; justify-content:flex-start; padding:0 15px; box-sizing:border-box; box-shadow:inset 0 2px 5px rgba(0,0,0,0.02), 0 2px 10px rgba(0,0,0,0.05); border:1px solid #f5f5f5;"><i class="fab fa-google" style="margin-right:10px; color:#4285F4; font-size:14px;"></i><span style="font-size:12px; font-weight:500; letter-spacing:0.5px; outline:none; flex:1;" contenteditable="true" onblur="window.DesktopSort.saveOrder()">Search Google...</span><i class="fas fa-microphone" style="margin-left:auto; color:#34A853; font-size:14px;"></i></div>';
    } else if (type === 'shortcut') {
        el.innerHTML = '<div style="height:100%; width:100%; background:linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%); border-radius:16px; color:#fff; display:flex; align-items:center; justify-content:center; font-size:24px; box-shadow:0 6px 15px rgba(255, 154, 158, 0.4);"><i class="fas fa-bolt"></i></div>';
    } else {
        el.innerHTML = '<div style="padding:10px; outline:none; text-align:center;" contenteditable="true" onblur="window.DesktopSort.saveOrder()">New Widget</div>';
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
    }
    
    page.appendChild(el);
    window.adjustEmptySlots(); // 增加组件后，挤掉多余的透明空格子，保持完美网格！
    closeWidgetLibrary();
    if (window.DesktopSort && window.DesktopSort.saveOrder) {
        window.DesktopSort.saveOrder();
    }
};
