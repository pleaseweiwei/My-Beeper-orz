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
        if (el.classList.contains('widget-2x4')) return 8;
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
        var categories = ['system', 'aesthetic', 'text', 'media', 'tool'];
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

    if (type === 'unified-header') {
        el.className = 'unified-header-widget sortable-item ' + sizeClass;
        el.innerHTML = '<div class="greeting-text" id="greetingText"></div><div class="clock-profile-combo"><div class="time-block"><span id="h">14</span><span class="time-colon">:</span><span id="m">30</span></div><div class="vertical-divider"></div><div class="profile-stack"><div class="mini-profile-row"><div class="editable-name" contenteditable="true">Hannah</div><div class="avatar-circle-sm" data-edit-key="avatar" onclick="triggerChangeImage(this, \'img\')"><img src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop"></div></div><div class="date-pill" id="fullDate">Jan 30</div></div></div>';
    } else if (type === 'music-card') {
        el.className = 'music-widget sortable-item ' + sizeClass;
        el.setAttribute('onclick', 'openMusicPlayer()');
        el.innerHTML = '<div class="music-info"><div style="font-size:9px; color:#aaa; margin-bottom:5px; letter-spacing:1px;">NOW PLAYING</div><div class="music-title" id="home-music-title" contenteditable="true" onclick="event.stopPropagation()" onblur="saveHomeMusicText()">Lover</div><div class="music-artist" id="home-music-artist" contenteditable="true" onclick="event.stopPropagation()" onblur="saveHomeMusicText()">Taylor Swift</div><div class="wave-box"><div class="wave"></div><div class="wave"></div><div class="wave"></div><div class="wave"></div></div></div><div class="vinyl-record"><div class="vinyl-inner" data-edit-key="music" onclick="event.stopPropagation(); triggerChangeImage(this, \'bg\')"></div></div>';
    } else if (type === 'photo-stack') {
        el.className = 'photo-stack sortable-item ' + sizeClass;
        el.innerHTML = '<div class="stack-item"><img src="https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=200&auto=format&fit=crop" data-edit-key="photo1" onclick="triggerChangeImage(this, \'self\')"></div><div class="stack-item"><img src="https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?q=80&w=200&auto=format&fit=crop" data-edit-key="photo2" onclick="triggerChangeImage(this, \'self\')"></div><div class="stack-item"><img src="https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=200&auto=format&fit=crop" data-edit-key="photo3" onclick="triggerChangeImage(this, \'self\')"></div>';
    } else if (type === 'k-mood-board') {
        el.className = 'k-mood-board sortable-item ' + sizeClass;
        el.innerHTML = '<div class="k-cd-player"><div class="k-disc-wrap"><div class="k-disc" data-edit-key="k_cd_cover" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=200&auto=format&fit=crop\');"><div class="k-disc-center"></div></div></div><div class="k-song-info"><div class="k-play-btn"><i class="fas fa-play"></i></div><div style="flex:1;"><div contenteditable="true" class="k-song-title" id="p3-song">Palette</div><div contenteditable="true" class="k-artist" id="p3-artist">IU (아이유)</div></div></div></div><div class="k-polaroid"><div class="k-tape"></div><div class="k-photo-frame" data-edit-key="k_polaroid_img" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?q=80&w=300&auto=format&fit=crop\');"></div><div class="k-handwriting" contenteditable="true" id="p3-handwriting">Vibe ☁️</div></div>';
    } else if (type === 'collection-ticker') {
        el.className = 'collection-ticker-widget sortable-item ' + sizeClass;
        el.style.transform = 'scale(0.95)';
        el.style.transformOrigin = 'top center';
        el.innerHTML = '<div class="ticker-icon"><i class="fas fa-quote-left"></i></div><div class="ticker-wrapper"><div class="ticker-content"><span>记得给阳台的花浇水</span><span class="dot">·</span><span>下周五去看展</span><span class="dot">·</span><span>密码 123456</span><span class="dot">·</span><span>Stay foolish</span><span class="dot">·</span><span>买猫粮</span><span class="dot">·</span></div><div class="ticker-content"><span>记得给阳台的花浇水</span><span class="dot">·</span><span>下周五去看展</span><span class="dot">·</span><span>密码 123456</span><span class="dot">·</span><span>Stay foolish</span><span class="dot">·</span><span>买猫粮</span><span class="dot">·</span></div></div><div class="ticker-img-circle"><img src="https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=200&auto=format&fit=crop" data-edit-key="p4_ticker_img" onclick="triggerChangeImage(this, \'self\')"></div>';
    } else if (type === 'receipt-short') {
        el.className = 'receipt-widget short-version sortable-item ' + sizeClass;
        el.style.transform = 'scale(0.95)';
        el.style.transformOrigin = 'top center';
        el.innerHTML = '<div class="receipt-hole"></div><div class="receipt-header"><div class="receipt-title">RECEIPT</div><div class="receipt-date">NO.2026-02-22</div></div><div class="receipt-divider-dashed"></div><div class="receipt-list"><div class="receipt-item" onclick="openSimulatedApp(\'taobao\')"><div class="r-item-name"><span class="r-qty">01</span><span>SHOPPING (Taobao)</span></div><div class="r-item-price">OPEN <i class="fas fa-chevron-right" style="font-size:8px;"></i></div></div><div class="receipt-item" onclick="openSimulatedApp(\'meituan\')"><div class="r-item-name"><span class="r-qty">02</span><span>DELIVERY (Meituan)</span></div><div class="r-item-price">OPEN <i class="fas fa-chevron-right" style="font-size:8px;"></i></div></div></div><div class="receipt-divider-line"></div><div class="receipt-footer"><div class="receipt-total"><span>TOTAL</span><span style="font-weight:700;">¥ 999.00</span></div><div class="receipt-barcode">||| || ||| | |||| || || | |||| |||</div></div>';
    } else if (type === 'k-dday') {
        el.className = 'k-dday-widget sortable-item ' + sizeClass;
        el.innerHTML = '<div class="k-dday-title" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Anniversary</div><div class="k-dday-days" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">100</div><div class="k-dday-heart">❤️</div>';
    } else if (type === 'k-polaroid') {
        el.className = 'k-polaroid-widget sortable-item ' + sizeClass;
        el.innerHTML = '<div class="k-tape-top"></div><div class="k-photo-img" data-edit-key="k_polaroid_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?q=80&w=300&auto=format&fit=crop\');"></div><div class="k-handwriting-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Smile!</div>';
    } else if (type === 'k-todo') {
        el.className = 'k-todo-widget sortable-item ' + sizeClass;
        el.innerHTML = '<div class="k-todo-tape"></div><div class="k-todo-title" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">📝 TO-DO LIST</div><div class="k-todo-list"><div class="k-todo-item"><div class="k-todo-check" onclick="this.classList.toggle(\'checked\'); if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">✓</div><div class="k-todo-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Buy some coffee</div></div><div class="k-todo-item"><div class="k-todo-check" onclick="this.classList.toggle(\'checked\'); if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">✓</div><div class="k-todo-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Read a book</div></div><div class="k-todo-item"><div class="k-todo-check" onclick="this.classList.toggle(\'checked\'); if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">✓</div><div class="k-todo-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Call Mom</div></div></div>';
    } else if (type === 'k-mood') {
        el.className = 'k-mood-widget sortable-item ' + sizeClass;
        el.innerHTML = '<div class="k-mood-emoji" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">☁️</div><div class="k-mood-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Feeling Good</div>';
    } else if (type === 'k-journal') {
        el.className = 'k-journal-widget sortable-item ' + sizeClass;
        el.innerHTML = '<div class="k-j-img" data-edit-key="k_journal_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1505682614136-0a12f9f7beea?q=80&w=200&auto=format&fit=crop\');"></div><div class="k-j-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">"Make it happen."</div><div class="k-j-date" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">2026.04.05</div>';
    } else if (type === 'k-ticket') {
        el.className = 'k-ticket-widget sortable-item ' + sizeClass;
        el.innerHTML = '<div class="k-t-img" data-edit-key="k_ticket_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1544928147-79a2dbc1f389?q=80&w=200&auto=format&fit=crop\');"></div><div class="k-t-info"><div class="k-t-header" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">ADMIT ONE</div><div class="k-t-title" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Exhibition</div><div class="k-t-date" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Date: 2026.10.24</div><div class="k-t-barcode">||| | || ||| || |</div></div>';
    } else if (type === 'k-four-cuts') {
        el.className = 'k-four-cuts-widget sortable-item ' + sizeClass;
        el.innerHTML = '<div class="fc-photo" data-edit-key="fc1_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=200\');"></div><div class="fc-photo" data-edit-key="fc2_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=200\');"></div><div class="fc-photo" data-edit-key="fc3_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?q=80&w=200\');"></div><div class="fc-photo" data-edit-key="fc4_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=200\');"></div><div class="fc-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Life 4 Cuts</div>';
    } else if (type === 'k-scrapbook') {
        el.className = 'k-scrapbook-widget sortable-item ' + sizeClass;
        el.innerHTML = '<div class="sb-title" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Memory</div><div class="sb-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Good times with you. We made it happen!</div><div class="sb-tape"></div><div class="sb-photo" data-edit-key="sb_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1490730141103-6cac27aaab94?q=80&w=300\');"></div>';
    } else if (type === 'k-cassette') {
        el.className = 'k-cassette-widget sortable-item ' + sizeClass;
        el.innerHTML = '<div class="c-sticker"><div class="c-img" data-edit-key="cimg_' + Date.now() + '" style="background-image:url(\'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=400\')"></div><div class="c-hole"></div><div class="c-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()" data-edit-key="ctext" onclick="triggerChangeImage(this.previousSibling.previousSibling, \'bg\')">Y2K MIXTAPE</div><div class="c-hole"></div></div>';
    } else if (type === 'k-keyring') {
        el.className = 'k-keyring-widget sortable-item ' + sizeClass;
        el.innerHTML = '<div class="kr-ring"></div><div class="kr-hole"></div><div class="kr-img" data-edit-key="kr_' + Date.now() + '" onclick="triggerChangeImage(this, \'bg\')" style="background-image: url(\'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200\');"></div><div class="kr-text" contenteditable="true" onclick="event.stopPropagation()" onblur="if(window.DesktopSort && window.DesktopSort.saveOrder) window.DesktopSort.saveOrder()">Love It!</div>';
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
