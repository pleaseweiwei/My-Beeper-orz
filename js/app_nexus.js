/* ============================================
   NEXUS - 羁绊星图 App  v2.0
   造物熔炉 · 力导向图 · 环形菜单 · 双向羁绊
   ============================================ */

const NexusApp = (() => {
  // ── State ──────────────────────────────────────────────
  let nodes = [];
  let links = [];
  let selectedNodeId = null;
  let linkingSourceId = null;
  let linkTargetId = null;
  let groupToastTimeout = null;
  let animFrame = null;
  let _initialized = false;

  // ── Force Simulation State ─────────────────────────────
  let forceAnimId = null;
  const REPULSION = 5200;
  const SPRING_K  = 0.010;
  const SPRING_LEN = 130;
  const DAMPING   = 0.78;
  const CENTER_K  = 0.004;

  // ── Forge Panel State ──────────────────────────────────
  let forgeSelectedWorldbooks = new Set();
  let forgeSelectedPersonas   = new Set();
  let forgeSelectedAIFriends  = new Set();
  let _pendingNPC = null;

  // ── Node Action Menu State ─────────────────────────────
  let actionMenuNodeId = null;

  // ── Gesture / Transform State ──────────────────────────
  let panX = 0, panY = 0, zoom = 1;
  const MIN_ZOOM = 0.3, MAX_ZOOM = 3.0;
  const activePointers = new Map();
  let gestureMode = null;
  let dragNodeId = null;
  let dragOffsetX = 0, dragOffsetY = 0;
  let panStartX = 0, panStartY = 0, panStartPX = 0, panStartPY = 0;
  let pinchState = null;
  let pointerDownScreenX = 0, pointerDownScreenY = 0;
  let isDragConfirmed = false;
  let longPressTimer = null;
  const DRAG_THRESHOLD = 8;

  // Snow / canvas animation
  let snowParticles = [];
  let snowAnimId = null;
  let bgCanvas, bgCtx;

  // ── Avatar Colors ──────────────────────────────────────
  const AVATAR_COLORS = [
    ['#111111','#333333'], ['#2d2d2d','#555555'], ['#444444','#666666'],
    ['#333333','#555555'], ['#1a1a1a','#3d3d3d'], ['#555555','#777777'],
    ['#222222','#444444'], ['#3d3d3d','#5a5a5a'],
  ];

  // ── Relationship Presets ───────────────────────────────
  const REL_PRESETS = ['血亲','挚友','情侣','上下级','青梅竹马','情敌','债务人','守护者','猎人与猎物','秘密同谋','宿敌','暗恋者'];

  // ── Load / Save ────────────────────────────────────────
  function _scopeKey(base) {
    const pid = (typeof currentPersonaId !== 'undefined' ? currentPersonaId : null) || 'default';
    return base + '__' + pid;
  }

  function save() {
    try {
      localStorage.setItem(_scopeKey('nexus_nodes'), JSON.stringify(nodes));
      localStorage.setItem(_scopeKey('nexus_links'), JSON.stringify(links));
    } catch(e) {}
  }

  function load() {
    try {
      const n = localStorage.getItem(_scopeKey('nexus_nodes')) || localStorage.getItem('nexus_nodes');
      const l = localStorage.getItem(_scopeKey('nexus_links')) || localStorage.getItem('nexus_links');
      if (n) nodes = JSON.parse(n);
      if (l) links = JSON.parse(l);
      nodes.forEach(function(nd) { if (!nd.vx) nd.vx = 0; if (!nd.vy) nd.vy = 0; });
    } catch(e) {}
  }

  // ── World Transform ────────────────────────────────────
  function updateWorldTransform() {
    const world = document.getElementById('nexus-world');
    if (world) world.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + zoom + ')';
  }

  // ── Me Center (world coords) ───────────────────────────
  function getMeCenter() {
    const app = document.getElementById('nexusApp');
    return { x: (app ? app.offsetWidth : 390) / 2, y: (app ? app.offsetHeight : 700) / 2 };
  }

  // ── Orbit / Positions ──────────────────────────────────
  function orbitRadius(orbit) { return 72 + (orbit - 1) * 52; }

  function placeNodeOnOrbit(orbit, index, total) {
    const r = orbitRadius(orbit);
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    const c = getMeCenter();
    return { x: c.x + r * Math.cos(angle), y: c.y + r * Math.sin(angle) };
  }

  function recalcNodePositions() {
    const byOrbit = {};
    nodes.forEach(function(n) {
      if (!byOrbit[n.orbit]) byOrbit[n.orbit] = [];
      byOrbit[n.orbit].push(n);
    });
    Object.keys(byOrbit).forEach(function(orbit) {
      const list = byOrbit[orbit];
      list.forEach(function(n, i) {
        const p = placeNodeOnOrbit(Number(orbit), i, list.length);
        n.x = p.x; n.y = p.y; n.vx = 0; n.vy = 0;
      });
    });
  }

  function assignOrbit(affection) {
    if (affection >= 80) return 1;
    if (affection >= 50) return 2;
    if (affection >= 25) return 3;
    return 4;
  }

  // ── Force-Directed Simulation ──────────────────────────
  function startForceSimulation(duration) {
    if (forceAnimId) cancelAnimationFrame(forceAnimId);
    const endTime = duration ? Date.now() + duration : Infinity;

    function tick() {
      if (Date.now() > endTime) {
        forceAnimId = null;
        save();
        return;
      }
      const c = getMeCenter();
      nodes.forEach(function(nd) {
        nd.vx = (nd.vx || 0) * DAMPING;
        nd.vy = (nd.vy || 0) * DAMPING;
      });
      // Repulsion between pairs
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.max(Math.hypot(dx, dy), 1);
          const force = REPULSION / (dist * dist);
          const fx = (dx / dist) * force, fy = (dy / dist) * force;
          a.vx -= fx; a.vy -= fy;
          b.vx += fx; b.vy += fy;
        }
        const nd = nodes[i];
        nd.vx += (c.x - nd.x) * CENTER_K;
        nd.vy += (c.y - nd.y) * CENTER_K;
      }
      // Spring attraction for linked pairs
      links.forEach(function(lk) {
        const aPos = lk.from === '__me__' ? c : nodes.find(function(n) { return n.id === lk.from; });
        const bPos = lk.to   === '__me__' ? c : nodes.find(function(n) { return n.id === lk.to; });
        if (!aPos || !bPos) return;
        const dx = bPos.x - aPos.x, dy = bPos.y - aPos.y;
        const dist = Math.max(Math.hypot(dx, dy), 1);
        const stretch = dist - SPRING_LEN;
        const fx = (dx / dist) * stretch * SPRING_K;
        const fy = (dy / dist) * stretch * SPRING_K;
        if (lk.from !== '__me__') {
          const na = nodes.find(function(n) { return n.id === lk.from; });
          if (na) { na.vx += fx; na.vy += fy; }
        }
        if (lk.to !== '__me__') {
          const nb = nodes.find(function(n) { return n.id === lk.to; });
          if (nb) { nb.vx -= fx; nb.vy -= fy; }
        }
      });
      // Update positions
      nodes.forEach(function(nd) {
        nd.x += nd.vx; nd.y += nd.vy;
        const el = document.getElementById('nexus-node-' + nd.id);
        if (el) { el.style.left = nd.x + 'px'; el.style.top = nd.y + 'px'; }
      });
      renderLinks();
      forceAnimId = requestAnimationFrame(tick);
    }
    forceAnimId = requestAnimationFrame(tick);
  }

  function stopForceSimulation() {
    if (forceAnimId) { cancelAnimationFrame(forceAnimId); forceAnimId = null; }
  }

  // ── External Data Helpers ──────────────────────────────
  function getCurrentUser() {
    try {
      const pm = typeof personasMeta !== 'undefined' ? personasMeta : null;
      const pid = typeof currentPersonaId !== 'undefined' ? currentPersonaId : null;
      if (pm && pid && pm[pid]) return pm[pid];
      if (pm) { const k = Object.keys(pm); if (k.length) return pm[k[0]]; }
    } catch(e) {}
    return null;
  }

  function getFriendsList() {
    try {
      if (typeof window.getAllFriends === 'function') return window.getAllFriends();
      if (typeof friendsData !== 'undefined' && friendsData)
        return Object.entries(friendsData).map(function(entry) {
          return Object.assign({ id: entry[0] }, entry[1]);
        });
    } catch(e) {}
    return [];
  }

  function getWorldBooks() {
    try {
      if (typeof worldBooks !== 'undefined' && Array.isArray(worldBooks)) return worldBooks;
    } catch(e) {}
    return [];
  }

  function getPersonas() {
    try {
      if (typeof personasMeta !== 'undefined') {
        return Object.entries(personasMeta).map(function(entry) {
          return Object.assign({ id: entry[0] }, entry[1]);
        });
      }
    } catch(e) {}
    return [];
  }

  function getAIFriends() {
    try {
      // Get all friends/AI companions from friendsData
      let friends = [];
      if (typeof friendsData !== 'undefined' && friendsData) {
        Object.entries(friendsData).forEach(function(entry) {
          const id = entry[0], f = entry[1];
          friends.push(Object.assign({ id: id }, f));
        });
      } else if (typeof window.getAllFriends === 'function') {
        friends = window.getAllFriends();
      }
      // Return friends that have AI persona traits
      return friends.filter(function(f) {
        return f.personality || f.description || f.role || f.tags;
      });
    } catch(e) {}
    return [];
  }

  function syncFriendsToStarMap() {
    const friends = getFriendsList();
    if (!friends.length) return;
    let added = 0;
    friends.forEach(function(f, idx) {
      const fId = 'friend_' + (f.id || f.name || idx);
      const existing = nodes.find(function(n) { return n.id === fId; });
      if (existing) {
        existing.name = f.remark || f.realName || f.name || existing.name;
        if (f.avatar) existing.avatar = f.avatar;
        return;
      }
      const name = f.remark || f.realName || f.name || ('好友' + (idx + 1));
      const affection = typeof f.affection === 'number' ? f.affection : 55;
      nodes.push({
        id: fId, name: name,
        role: f.role || '好友',
        tags: f.tags || [],
        bondText: name + ' 是你的好友',
        affection: affection,
        orbit: assignOrbit(affection),
        color: AVATAR_COLORS[idx % AVATAR_COLORS.length],
        x: 0, y: 0, vx: 0, vy: 0,
        avatar: f.avatar || '',
      });
      if (!links.find(function(l) {
        return (l.from === '__me__' && l.to === fId) || (l.from === fId && l.to === '__me__');
      })) {
        links.push({ from: '__me__', to: fId, label: '', myView: '', theirView: '', tension: 50 });
      }
      added++;
    });
    if (added > 0) { recalcNodePositions(); save(); }
  }

  // ── Init ───────────────────────────────────────────────
  function init() {
    load();
    buildDOM();
    bindEvents();
    renderGraph();
    drawStars();
    startFlowAnimation();
  }

  // ── Build DOM ──────────────────────────────────────────
  function buildDOM() {
    const app = document.getElementById('nexusApp');
    if (!app) return;
    app.innerHTML = [
      '<canvas id="nexus-bg-canvas"></canvas>',

      '<div id="nexus-world" style="position:absolute;inset:0;transform-origin:0 0;pointer-events:none;">',
        '<svg id="nexus-svg-links" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;"></svg>',
        '<div id="nexus-link-labels" style="position:absolute;inset:0;z-index:12;pointer-events:none;"></div>',
        '<div id="nexus-nodes-container" style="position:absolute;inset:0;z-index:10;pointer-events:none;overflow:visible;"></div>',
      '</div>',

      '<div class="nexus-header">',
        '<div class="nexus-header-btn" id="nexus-back-btn"><i class="fas fa-chevron-left"></i></div>',
        '<div class="nexus-header-center">',
          '<div class="nexus-header-title">NEXUS</div>',
          '<div class="nexus-header-sub">羁绊星图</div>',
        '</div>',
        '<div class="nexus-header-btn" id="nexus-sync-btn"><i class="fas fa-sync-alt"></i></div>',
      '</div>',

      '<div id="nexus-drag-hint">拖拽移动节点 · 长按连线 · 双指缩放</div>',

      // Floating Create Button (造物熔炉入口)
      '<button class="nexus-fab" id="nexus-fab-btn" title="造物熔炉"><i class="fas fa-plus"></i></button>',

      // Node Action Ring Menu
      '<div id="nexus-action-ring" class="nexus-action-ring">',
        '<button class="nexus-ring-btn ring-chat" data-action="chat"><i class="fas fa-comment"></i></button>',
        '<button class="nexus-ring-btn ring-moments" data-action="link"><i class="fas fa-link"></i></button>',
        '<button class="nexus-ring-btn ring-edit" data-action="edit"><i class="fas fa-pen"></i></button>',
        '<button class="nexus-ring-btn ring-delete" data-action="delete"><i class="fas fa-scissors"></i></button>',
      '</div>',

      // Profile Sheet (档案修改)
      '<div class="nexus-profile-sheet" id="nexus-profile-sheet">',
        '<div class="nexus-sheet-handle"></div>',
        '<div class="nexus-profile-header">',
          '<div class="nexus-profile-avatar" id="np-avatar"></div>',
          '<div style="flex:1">',
            '<div class="nexus-profile-name" id="np-name"></div>',
            '<div class="nexus-profile-relation-type" id="np-role"></div>',
            '<div class="nexus-affection-bar"><div class="nexus-affection-fill" id="np-affection" style="width:50%"></div></div>',
          '</div>',
          '<div class="nexus-header-btn" id="np-close-btn" style="flex-shrink:0"><i class="fas fa-times"></i></div>',
        '</div>',
        '<div style="padding:0 20px 4px">',
          '<input type="range" id="np-affection-slider" min="0" max="100" value="50" class="nexus-range-slider">',
        '</div>',
        '<div class="nexus-tags" id="np-tags"></div>',
        '<div class="nexus-relation-editor">',
          '<div class="nexus-relation-label">人设补充</div>',
          '<textarea class="nexus-relation-textarea" id="np-relation" rows="3" placeholder="描述这段关系或补充人设..."></textarea>',
        '</div>',
        '<div class="nexus-quick-actions">',
          '<div class="nexus-action-btn" id="np-msg-btn"><div class="nexus-action-icon"><i class="fas fa-comment"></i></div><div class="nexus-action-label">发送消息</div></div>',
          '<div class="nexus-action-btn" id="np-link-btn"><div class="nexus-action-icon"><i class="fas fa-link"></i></div><div class="nexus-action-label">建立连线</div></div>',
          '<div class="nexus-action-btn" id="np-tag-btn"><div class="nexus-action-icon"><i class="fas fa-tag"></i></div><div class="nexus-action-label">添加标签</div></div>',
          '<div class="nexus-action-btn" id="np-delete-btn"><div class="nexus-action-icon" style="color:#e06060"><i class="fas fa-scissors"></i></div><div class="nexus-action-label">斩断羁绊</div></div>',
        '</div>',
        '<div class="nexus-relation-editor" style="margin-bottom:6px">',
          '<div class="nexus-relation-label">关系拓扑</div>',
          '<div class="nexus-topology" id="np-topology"></div>',
        '</div>',
      '</div>',

      // Enhanced Connect Modal (定义羁绊)
      '<div class="nexus-connect-modal" id="nexus-connect-modal">',
        '<div class="nexus-connect-box">',
          '<div class="nexus-sheet-handle" style="margin:0 auto 18px"></div>',
          '<div class="nexus-connect-title">✦ 定义羁绊</div>',
          '<div class="nexus-connect-sub" id="nexus-connect-desc">请定义这两个角色之间的关系</div>',
          '<div class="nexus-rel-presets" id="nexus-rel-presets"></div>',
          '<input class="nexus-connect-input" id="nexus-connect-input" type="text" placeholder="或手动输入关系标签...">',
          '<div class="nexus-dual-perspective">',
            '<div class="nexus-dp-row">',
              '<div class="nexus-dp-label" id="ndp-label-them">Ta 眼中的我</div>',
              '<input class="nexus-dp-input" id="nexus-dp-them" type="text" placeholder="例：高高在上的大小姐">',
            '</div>',
            '<div class="nexus-dp-row" style="margin-top:8px">',
              '<div class="nexus-dp-label" id="ndp-label-me">我眼中的 Ta</div>',
              '<input class="nexus-dp-input" id="nexus-dp-me" type="text" placeholder="例：一条听话的狗">',
            '</div>',
          '</div>',
          '<div class="nexus-tension-row">',
            '<span class="nexus-tension-label">张力值</span>',
            '<input type="range" id="nexus-tension-slider" min="0" max="100" value="50" class="nexus-range-slider" style="flex:1">',
            '<span class="nexus-tension-val" id="nexus-tension-val">50</span>',
          '</div>',
          '<div style="display:flex;gap:10px;margin-top:10px">',
            '<button class="nexus-btn-cancel" id="nexus-connect-cancel">取消</button>',
            '<button class="nexus-btn-confirm" id="nexus-connect-confirm">✦ 确定连线</button>',
          '</div>',
        '</div>',
      '</div>',

      // Forge Panel (造物熔炉)
      '<div class="nexus-forge-panel" id="nexus-forge-panel">',
        '<div class="nexus-forge-header">',
          '<div style="flex:1">',
            '<div class="nexus-forge-title">✦ 造物熔炉</div>',
            '<div class="nexus-forge-sub">Create NPC</div>',
          '</div>',
          '<div class="nexus-header-btn" id="nexus-forge-close"><i class="fas fa-times"></i></div>',
        '</div>',
        '<div class="nexus-forge-steps" id="nexus-forge-steps">',
          '<div class="nexus-step-dot active" data-step="1"><span>1</span></div>',
          '<div class="nexus-step-line"></div>',
          '<div class="nexus-step-dot" data-step="2"><span>2</span></div>',
          '<div class="nexus-step-line"></div>',
          '<div class="nexus-step-dot" data-step="3"><span>3</span></div>',
        '</div>',
        '<div class="nexus-forge-content" id="nexus-forge-content">',
          // Step 1: Blueprint selection
          '<div class="nexus-forge-step-view" id="forge-step-1">',
            '<div class="nexus-section-label">📚 融入世界书 <span style="opacity:0.4;font-weight:400">（多选）</span></div>',
            '<div class="nexus-wb-list" id="forge-wb-list"></div>',
            '<div class="nexus-section-label" style="margin-top:20px">🎭 参照人设 <span style="opacity:0.4;font-weight:400">（多选）</span></div>',
            '<div class="nexus-wb-list" id="forge-persona-list"></div>',
            '<button class="nexus-forge-next-btn" id="forge-step1-next">下一步 <i class="fas fa-arrow-right"></i></button>',
          '</div>',
          // Step 2: Prompt
          '<div class="nexus-forge-step-view" id="forge-step-2" style="display:none">',
            '<div class="nexus-section-label">✍️ 设定生成要求</div>',
            '<div class="nexus-forge-prompt-hint">告诉 AI 你想要什么样的 NPC：</div>',
            '<div class="nexus-forge-tags-hint" id="forge-tags-hint"></div>',
            '<textarea class="nexus-prompt-input" id="forge-prompt" rows="5" placeholder="例：我是财阀千金，给我生成一个表面是我的赛博保镖，暗地里却是吸血鬼猎人的傲娇男主，而且他暗恋我。"></textarea>',
            '<div style="display:flex;gap:10px;margin-top:16px">',
              '<button class="nexus-forge-back-btn" id="forge-step2-back"><i class="fas fa-arrow-left"></i> 返回</button>',
              '<button class="nexus-forge-next-btn" id="forge-step2-generate" style="flex:2">✨ 灵魂注入 Generate</button>',
            '</div>',
          '</div>',
          // Step 3: Loading + Result
          '<div class="nexus-forge-step-view" id="forge-step-3" style="display:none">',
            '<div id="forge-loading" class="nexus-forge-loading">',
              '<div class="nexus-forge-loading-ring"></div>',
              '<div style="font-size:11px;color:rgba(255,255,255,0.4);letter-spacing:2px">正在孕育生命</div>',
              '<div class="nexus-loading-dots"><span></span><span></span><span></span></div>',
            '</div>',
            '<div id="forge-result" style="display:none">',
              '<div class="nexus-npc-card" id="forge-result-card">',
                '<div class="nexus-npc-card-header">',
                  '<div class="nexus-npc-avatar" id="forge-npc-avatar"></div>',
                  '<div>',
                    '<div class="nexus-npc-name" id="forge-npc-name"></div>',
                    '<div class="nexus-npc-role" id="forge-npc-role"></div>',
                  '</div>',
                '</div>',
                '<div class="nexus-npc-bond-label">背景故事</div>',
                '<div class="nexus-npc-bond-text" id="forge-npc-story"></div>',
                '<div class="nexus-npc-bond-label" style="margin-top:12px">性格雷点</div>',
                '<div class="nexus-npc-bond-text" id="forge-npc-personality"></div>',
                '<div class="nexus-npc-bond-label" style="margin-top:12px">✦ 开场白</div>',
                '<div class="nexus-npc-bond-text nexus-npc-opening" id="forge-npc-opening"></div>',
                '<div class="nexus-npc-tags" id="forge-npc-tags"></div>',
              '</div>',
            '</div>',
          '</div>',
        '</div>',
        // Sticky footer — action buttons always visible at bottom
        '<div class="nexus-forge-footer" id="nexus-forge-footer">',
          '<div class="nexus-npc-actions" style="margin:0">',
            '<button class="nexus-btn-discard" id="forge-btn-retry"><i class="fas fa-redo"></i> 重新捏造</button>',
            '<button class="nexus-btn-collect" id="forge-btn-confirm"><i class="fas fa-star"></i> 确认接入星图</button>',
          '</div>',
        '</div>',
      '</div>',
    ].join('');
  }

  // ── Bind Events ────────────────────────────────────────
  function bindEvents() {
    const app = document.getElementById('nexusApp');
    if (!app) return;

    const $ = function(id) { return document.getElementById(id); };

    $('nexus-back-btn') && $('nexus-back-btn').addEventListener('click', closeApp);
    $('nexus-sync-btn') && $('nexus-sync-btn').addEventListener('click', function() {
      syncFriendsToStarMap();
      recalcNodePositions();
      renderGraph();
      showToast('已同步好友列表');
    });

    // FAB → forge panel
    $('nexus-fab-btn') && $('nexus-fab-btn').addEventListener('click', openForgePanel);
    $('nexus-forge-close') && $('nexus-forge-close').addEventListener('click', closeForgePanel);
    $('forge-step1-next') && $('forge-step1-next').addEventListener('click', forgeGoStep2);
    $('forge-step2-back') && $('forge-step2-back').addEventListener('click', function() { forgeGoStep(1); });
    $('forge-step2-generate') && $('forge-step2-generate').addEventListener('click', startForgeGenerate);
    $('forge-btn-retry') && $('forge-btn-retry').addEventListener('click', startForgeGenerate);
    $('forge-btn-confirm') && $('forge-btn-confirm').addEventListener('click', forgeConfirmNPC);

    // Profile sheet
    $('np-close-btn') && $('np-close-btn').addEventListener('click', closeProfileSheet);
    $('np-msg-btn') && $('np-msg-btn').addEventListener('click', function() {
      const node = nodes.find(function(n) { return n.id === selectedNodeId; });
      if (!node) return;
      closeProfileSheet();
      const chatId = node.id.replace('friend_', '').replace('npc_', '');
      if (window.openChatDetail) window.openChatDetail(chatId);
    });
    $('np-link-btn') && $('np-link-btn').addEventListener('click', function() {
      const nodeIdToLink = selectedNodeId; // ★ 必须在 closeProfileSheet 之前捕获，否则 selectedNodeId 会被置为 null
      closeProfileSheet();
      startLinking(nodeIdToLink);
    });
    $('np-tag-btn') && $('np-tag-btn').addEventListener('click', function() {
      const node = nodes.find(function(n) { return n.id === selectedNodeId; });
      if (node) addTagToNode(node);
    });
    $('np-delete-btn') && $('np-delete-btn').addEventListener('click', function() {
      const node = nodes.find(function(n) { return n.id === selectedNodeId; });
      if (node) deleteNode(node);
    });
    $('np-affection-slider') && $('np-affection-slider').addEventListener('input', function(e) {
      const node = nodes.find(function(n) { return n.id === selectedNodeId; });
      if (node) {
        node.affection = +e.target.value;
        const fill = $('np-affection');
        if (fill) fill.style.width = node.affection + '%';
        save();
      }
    });
    $('np-relation') && $('np-relation').addEventListener('input', function(e) {
      const node = nodes.find(function(n) { return n.id === selectedNodeId; });
      if (node) { node.bondText = e.target.value; save(); }
    });

    // Connect modal
    $('nexus-connect-cancel') && $('nexus-connect-cancel').addEventListener('click', cancelLinking);
    $('nexus-connect-confirm') && $('nexus-connect-confirm').addEventListener('click', confirmLink);
    $('nexus-tension-slider') && $('nexus-tension-slider').addEventListener('input', function(e) {
      const v = $('nexus-tension-val');
      if (v) v.textContent = e.target.value;
    });

    // Preset tags (delegated)
    const presetsContainer = $('nexus-rel-presets');
    if (presetsContainer) {
      presetsContainer.addEventListener('click', function(e) {
        const tag = e.target.closest('.nexus-rel-tag');
        if (!tag) return;
        document.querySelectorAll('.nexus-rel-tag').forEach(function(t) { t.classList.remove('active'); });
        tag.classList.add('active');
        const inp = $('nexus-connect-input');
        if (inp) inp.value = tag.dataset.val || tag.textContent;
      });
    }

    // Action ring menu (delegated)
    const ring = $('nexus-action-ring');
    if (ring) {
      ring.addEventListener('click', function(e) {
        const btn = e.target.closest('.nexus-ring-btn');
        if (!btn || !actionMenuNodeId) return;
        handleRingAction(btn.dataset.action, actionMenuNodeId);
      });
    }

    // Gesture layer
    app.addEventListener('pointerdown', onPtrDown, { passive: false });
    app.addEventListener('pointermove', onPtrMove, { passive: false });
    app.addEventListener('pointerup',   onPtrUp,   { passive: false });
    app.addEventListener('pointercancel', onPtrCancel, { passive: false });
  }

  // ── Forge Panel Logic ──────────────────────────────────
  function openForgePanel() {
    closeActionMenu();
    forgeSelectedWorldbooks.clear();
    forgeSelectedPersonas.clear();
    forgeSelectedAIFriends.clear();

    // Populate worldbooks
    const wbList = document.getElementById('forge-wb-list');
    if (wbList) {
      const books = getWorldBooks();
      if (!books.length) {
        wbList.innerHTML = '<div style="color:rgba(255,255,255,0.3);font-size:12px;padding:8px 0">暂无世界书，请先在世界书应用中创建</div>';
      } else {
        wbList.innerHTML = books.map(function(b) {
          return '<div class="nexus-wb-item" data-wb-id="' + b.id + '">' +
            '<div class="nexus-wb-check"><i class="fas fa-check"></i></div>' +
            '<div><div class="nexus-wb-name">' + (b.title || '未命名') + '</div>' +
            '<div class="nexus-wb-tag">' + (b.category || 'General') + ' · ' + ((b.entries || []).length) + ' 条目</div></div>' +
            '</div>';
        }).join('');
        wbList.querySelectorAll('.nexus-wb-item').forEach(function(el) {
          el.addEventListener('click', function() {
            const id = el.dataset.wbId;
            if (forgeSelectedWorldbooks.has(id)) {
              forgeSelectedWorldbooks.delete(id); el.classList.remove('selected');
            } else {
              forgeSelectedWorldbooks.add(id); el.classList.add('selected');
            }
          });
        });
      }
    }

    // Populate personas + AI friends
    const pList = document.getElementById('forge-persona-list');
    if (pList) {
      const personas = getPersonas();
      const aiFriends = getAIFriends();
      let html = '';

      // Sub-section: Main Personas
      if (personas.length) {
        html += '<div style="font-size:9px;color:rgba(255,255,255,0.3);letter-spacing:1.5px;font-weight:700;margin-bottom:8px;text-transform:uppercase">主人设</div>';
        html += personas.map(function(p) {
          return '<div class="nexus-wb-item" data-persona-id="' + p.id + '">' +
            '<div class="nexus-wb-check"><i class="fas fa-check"></i></div>' +
            '<div><div class="nexus-wb-name">' + (p.name || '未命名人设') + '</div>' +
            '<div class="nexus-wb-tag">' + ((p.personality || p.description || '无描述').slice(0, 40)) + '</div></div>' +
            '</div>';
        }).join('');
      } else {
        html += '<div style="color:rgba(255,255,255,0.3);font-size:12px;padding:4px 0 8px">暂无主人设</div>';
      }

      // Sub-section: AI Friends
      if (aiFriends.length) {
        html += '<div style="font-size:9px;color:rgba(255,255,255,0.3);letter-spacing:1.5px;font-weight:700;margin:14px 0 8px;text-transform:uppercase">AI 好友</div>';
        html += aiFriends.map(function(f) {
          const name = f.remark || f.realName || f.name || '好友';
          const desc = (f.personality || f.description || f.role || (f.tags || []).join('、') || '').slice(0, 40);
          return '<div class="nexus-wb-item" data-friend-id="' + f.id + '">' +
            '<div class="nexus-wb-check"><i class="fas fa-check"></i></div>' +
            '<div><div class="nexus-wb-name">' + name + '</div>' +
            '<div class="nexus-wb-tag">' + (desc || 'AI 好友') + '</div></div>' +
            '</div>';
        }).join('');
      }

      if (!personas.length && !aiFriends.length) {
        html = '<div style="color:rgba(255,255,255,0.3);font-size:12px;padding:8px 0">暂无好友，请先在微信中添加好友</div>';
      }

      pList.innerHTML = html;

      // Persona click handlers
      pList.querySelectorAll('[data-persona-id]').forEach(function(el) {
        el.addEventListener('click', function() {
          const id = el.dataset.personaId;
          if (forgeSelectedPersonas.has(id)) {
            forgeSelectedPersonas.delete(id); el.classList.remove('selected');
          } else {
            forgeSelectedPersonas.add(id); el.classList.add('selected');
          }
        });
      });

      // AI Friend click handlers
      pList.querySelectorAll('[data-friend-id]').forEach(function(el) {
        el.addEventListener('click', function() {
          const id = el.dataset.friendId;
          if (forgeSelectedAIFriends.has(id)) {
            forgeSelectedAIFriends.delete(id); el.classList.remove('selected');
          } else {
            forgeSelectedAIFriends.add(id); el.classList.add('selected');
          }
        });
      });
    }

    forgeGoStep(1);
    document.getElementById('nexus-forge-panel').classList.add('open');
  }

  function closeForgePanel() {
    const panel = document.getElementById('nexus-forge-panel');
    if (panel) panel.classList.remove('open');
  }

  function updateForgeStepDots(step) {
    document.querySelectorAll('.nexus-step-dot').forEach(function(d) {
      const s = +d.dataset.step;
      d.classList.toggle('active', s <= step);
      d.classList.toggle('current', s === step);
    });
  }

  function forgeGoStep(step) {
    document.getElementById('forge-step-1').style.display = step === 1 ? '' : 'none';
    document.getElementById('forge-step-2').style.display = step === 2 ? '' : 'none';
    document.getElementById('forge-step-3').style.display = step === 3 ? '' : 'none';
    updateForgeStepDots(step);
    // Hide footer when not on result step
    const footer = document.getElementById('nexus-forge-footer');
    if (footer && step !== 3) footer.classList.remove('active');
  }

  function forgeGoStep2() {
    forgeGoStep(2);
    const hint = document.getElementById('forge-tags-hint');
    if (hint) {
      const wbNames = Array.from(forgeSelectedWorldbooks).map(function(id) {
        const b = getWorldBooks().find(function(w) { return w.id === id; });
        return b ? '[' + b.title + ']' : '';
      }).filter(Boolean);
      const pNames = Array.from(forgeSelectedPersonas).map(function(id) {
        const p = getPersonas().find(function(pp) { return pp.id === id; });
        return p ? '[' + (p.name || '人设') + ']' : '';
      }).filter(Boolean);
      const friendNames = Array.from(forgeSelectedAIFriends).map(function(id) {
        const f = getAIFriends().find(function(ff) { return String(ff.id) === String(id); });
        return f ? '[' + (f.remark || f.realName || f.name || 'AI好友') + ']' : '';
      }).filter(Boolean);
      const all = wbNames.concat(pNames).concat(friendNames);
      hint.textContent = all.length ? ('已选基底：' + all.join(' + ')) : '未选择基底（将随机生成）';
    }
  }

  // ── Generate NPC ───────────────────────────────────────
  function startForgeGenerate() {
    forgeGoStep(3);
    document.getElementById('forge-loading').style.display = 'flex';
    document.getElementById('forge-result').style.display = 'none';
    // Hide footer while loading
    const footer = document.getElementById('nexus-forge-footer');
    if (footer) footer.classList.remove('active');

    const prompt = (document.getElementById('forge-prompt') || {}).value || '';
    const books = getWorldBooks().filter(function(b) { return forgeSelectedWorldbooks.has(b.id); });
    const personas = getPersonas().filter(function(p) { return forgeSelectedPersonas.has(p.id); });

    let context = '请根据以下设定，创造一个独特的 NPC 角色（请用中文回答）：\n\n';
    if (books.length) {
      context += '【世界书背景】\n';
      books.forEach(function(b) {
        const entries = (b.entries || []).filter(function(e) { return e.enabled !== false; }).slice(0, 5);
        context += '《' + b.title + '》(' + (b.category || '') + ')\n';
        entries.forEach(function(e) { context += '- ' + (e.comment || '') + ': ' + (e.content || '').slice(0, 100) + '\n'; });
      });
      context += '\n';
    }
    if (personas.length) {
      context += '【参照人设】\n';
      personas.forEach(function(p) {
        context += '「' + (p.name || '人设') + '」: ' + (p.personality || p.description || '') + '\n';
      });
      context += '\n';
    }
    const selectedAIFriends = getAIFriends().filter(function(f) { return forgeSelectedAIFriends.has(String(f.id)); });
    if (selectedAIFriends.length) {
      context += '【参照 AI 好友（已存在的角色）】\n';
      selectedAIFriends.forEach(function(f) {
        const name = f.remark || f.realName || f.name || 'AI好友';
        const desc = f.personality || f.description || f.role || (f.tags || []).join('、') || '';
        context += '「' + name + '」: ' + desc + '\n';
      });
      context += '（请创造的 NPC 与以上 AI 好友有合理的关联或对立关系）\n\n';
    }
    context += '【生成要求】\n' + (prompt.trim() || '请自由发挥，创造一个有深度、有故事的 NPC') + '\n\n';
    context += '请严格按以下 JSON 格式回复，不要包含任何其他内容：\n';
    context += '{"name":"角色全名","role":"身份/职业","tags":["标签1","标签2","标签3"],"story":"150字以内背景故事","personality":"性格特点与雷点","opening":"第一句开场白（第一人称）","affection":50}';

    // Try AI, fallback to local
    let generated = false;
    if (typeof window.callAIAPI === 'function') {
      const systemMsg = '你是一个专业的角色扮演角色创造者，擅长创造有深度、有层次的 NPC 角色。';
      Promise.resolve().then(function() {
        return window.callAIAPI(systemMsg, context, null, 600, null, true);
      }).then(function(raw) {
        try {
          const m = (raw || '').match(/\{[\s\S]*\}/);
          if (m) {
            const npc = JSON.parse(m[0]);
            if (npc && npc.name) {
              generated = true;
              _pendingNPC = npc;
              showForgeResult(npc);
              return;
            }
          }
        } catch(e) {}
        if (!generated) {
          const npc = generateLocalNPC(prompt, books, personas);
          _pendingNPC = npc;
          showForgeResult(npc);
        }
      }).catch(function() {
        const npc = generateLocalNPC(prompt, books, personas);
        _pendingNPC = npc;
        showForgeResult(npc);
      });
    } else {
      // Simulate a short delay for the "loading" feel
      setTimeout(function() {
        const npc = generateLocalNPC(prompt, books, personas);
        _pendingNPC = npc;
        showForgeResult(npc);
      }, 1800);
    }
  }

  function generateLocalNPC(prompt, books, personas) {
    const wbTitles = books.map(function(b) { return b.title; }).join('、') || '神秘世界';
    const personaName = (personas[0] && personas[0].name) ? personas[0].name : '主角';
    const roles = ['神秘学者','赏金猎人','贵族后裔','黑市商人','亡命之徒','魔法师','守护骑士','特工','医者','诗人','暗杀者','占卜师'];
    const adjectives = ['冷酷','傲娇','温柔','狡猾','忠诚','叛逆','神秘','热情','孤僻','洒脱'];
    const surnames = ['苏','顾','裴','沈','霍','叶','江','陆','林','周','季','白','凌','慕','谢'];
    const givenNames = ['辞','凉','琛','夜','霁','澜','月','星','尘','影','渊','烬','霜','昀','珩'];
    const name = surnames[Math.floor(Math.random() * surnames.length)] + givenNames[Math.floor(Math.random() * givenNames.length)];
    const role = roles[Math.floor(Math.random() * roles.length)];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const tag2 = wbTitles.split('、')[0] || '异世界';
    const affection = Math.floor(Math.random() * 30) + 15;
    return {
      name: name,
      role: role,
      tags: [adj, tag2, '神秘过去'],
      story: '生于' + wbTitles + '的动荡年代，' + name + '用' + adj + '的外表掩藏着一段不为人知的过去。与' + personaName + '命运般的相遇，将彻底打破双方原本的轨迹。' + (prompt ? '（基于：' + prompt.slice(0, 25) + '…）' : ''),
      personality: '外表' + adj + '，实则内心细腻敏感。无法接受背叛与欺骗，遇到弱小者会不自觉地伸出援手。',
      opening: '"……你就是' + personaName + '？比我想象中有趣一些。"',
      affection: affection,
    };
  }

  function showForgeResult(npc) {
    document.getElementById('forge-loading').style.display = 'none';
    const resultEl = document.getElementById('forge-result');
    if (resultEl) resultEl.style.display = '';
    // Show sticky footer with action buttons
    const footer = document.getElementById('nexus-forge-footer');
    if (footer) footer.classList.add('active');

    const colorIdx = Math.floor(Math.random() * AVATAR_COLORS.length);
    const colors = AVATAR_COLORS[colorIdx];
    const avatarEl = document.getElementById('forge-npc-avatar');
    if (avatarEl) {
      avatarEl.style.background = 'linear-gradient(135deg,' + colors[0] + ',' + colors[1] + ')';
      avatarEl.textContent = (npc.name || '?').charAt(0);
      avatarEl.style.fontSize = '22px';
      avatarEl.style.fontWeight = '800';
      avatarEl.style.color = '#fff';
    }
    const setText = function(id, val) {
      const el = document.getElementById(id);
      if (el) el.textContent = val || '';
    };
    setText('forge-npc-name', npc.name);
    setText('forge-npc-role', npc.role);
    setText('forge-npc-story', npc.story);
    setText('forge-npc-personality', npc.personality);
    setText('forge-npc-opening', npc.opening);
    const tagsEl = document.getElementById('forge-npc-tags');
    if (tagsEl) {
      tagsEl.innerHTML = (npc.tags || []).map(function(t) {
        return '<span class="nexus-npc-tag">' + t + '</span>';
      }).join('');
    }
    if (_pendingNPC) _pendingNPC._colorIdx = colorIdx;
  }

  function forgeConfirmNPC() {
    if (!_pendingNPC) return;
    const npc = _pendingNPC;
    const colorIdx = (npc._colorIdx != null) ? npc._colorIdx : 0;
    const npcId = 'npc_' + Date.now();
    const c = getMeCenter();
    const angle = Math.random() * Math.PI * 2;
    const r0 = 30;

    nodes.push({
      id: npcId,
      name: npc.name || '未知',
      role: npc.role || 'NPC',
      tags: npc.tags || [],
      bondText: npc.story || '',
      affection: npc.affection || 50,
      orbit: assignOrbit(npc.affection || 50),
      color: AVATAR_COLORS[colorIdx],
      x: c.x + Math.cos(angle) * r0,
      y: c.y + Math.sin(angle) * r0,
      vx: Math.cos(angle) * 4,
      vy: Math.sin(angle) * 4,
      avatar: '',
      isNPC: true,
      personality: npc.personality || '',
      opening: npc.opening || '',
    });
    links.push({ from: '__me__', to: npcId, label: '', myView: '', theirView: '', tension: 50 });
    save();
    closeForgePanel();
    renderGraph();
    // Shooting star animation
    const targetX = c.x + Math.cos(angle) * (80 + Math.random() * 60);
    const targetY = c.y + Math.sin(angle) * (80 + Math.random() * 60);
    spawnShootingStar(c.x, c.y, targetX, targetY, npc.name || '');
    showToast('✦ ' + (npc.name || 'NPC') + ' 已降临星图');
    // Run force simulation to settle positions
    setTimeout(function() { startForceSimulation(4500); }, 600);
  }

  function spawnShootingStar(x1, y1, x2, y2, name) {
    const app = document.getElementById('nexusApp');
    if (!app) return;
    const el = document.createElement('div');
    el.className = 'nexus-shooting-star';
    el.style.left = x1 + 'px';
    el.style.top  = y1 + 'px';
    el.style.setProperty('--tx', (x2 - x1) + 'px');
    el.style.setProperty('--ty', (y2 - y1) + 'px');
    if (name) {
      const lbl = document.createElement('span');
      lbl.textContent = name;
      el.appendChild(lbl);
    }
    app.appendChild(el);
    setTimeout(function() { el.remove(); }, 1200);
  }

  // ── Node Action Ring Menu ──────────────────────────────
  function showActionMenu(nodeId) {
    actionMenuNodeId = nodeId;
    const node = nodes.find(function(n) { return n.id === nodeId; });
    if (!node) return;
    const ring = document.getElementById('nexus-action-ring');
    if (!ring) return;
    // Convert world coords to screen coords
    const screenX = panX + node.x * zoom;
    const screenY = panY + node.y * zoom;
    ring.style.left = screenX + 'px';
    ring.style.top  = screenY + 'px';
    ring.classList.add('active');
  }

  function closeActionMenu() {
    actionMenuNodeId = null;
    const ring = document.getElementById('nexus-action-ring');
    if (ring) ring.classList.remove('active');
  }

  function handleRingAction(action, nodeId) {
    const node = nodes.find(function(n) { return n.id === nodeId; });
    closeActionMenu();
    if (!node) return;
    switch(action) {
      case 'chat':
        const chatId = node.id.replace('friend_', '').replace('npc_', '');
        if (window.openChatDetail) window.openChatDetail(chatId);
        else showToast('即将跳转私聊...');
        break;
      case 'link':
        startLinking(nodeId);
        break;
      case 'edit':
        openProfileSheet(nodeId);
        break;
      case 'delete':
        if (confirm('确认斩断与 ' + node.name + ' 的所有羁绊？')) {
          deleteNode(node);
        }
        break;
    }
  }

  // ── Gesture Helpers ────────────────────────────────────
  function getNodeIdFromEl(el) {
    let e = el;
    while (e && e !== document.body) {
      if (e.classList && e.classList.contains('nexus-node')) {
        return (e.id || '').replace('nexus-node-', '') || null;
      }
      e = e.parentElement;
    }
    return null;
  }

  function isOverlayEl(el) {
    let e = el;
    while (e && e !== document.body) {
      const cls = e.classList;
      if (cls && (
        cls.contains('nexus-profile-sheet') ||
        cls.contains('nexus-connect-modal') ||
        cls.contains('nexus-header') ||
        cls.contains('nexus-forge-panel') ||
        cls.contains('nexus-action-ring') ||
        cls.contains('nexus-fab')
      )) return true;
      e = e.parentElement;
    }
    return false;
  }

  // ── Pointer Handlers ───────────────────────────────────
  function onPtrDown(e) {
    if (isOverlayEl(e.target)) return;
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
    e.preventDefault();

    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const count = activePointers.size;

    if (count === 2) {
      clearLongPress();
      gestureMode = 'pinch';
      const pts = Array.from(activePointers.values());
      pinchState = {
        d0:  Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
        mx0: (pts[0].x + pts[1].x) / 2,
        my0: (pts[0].y + pts[1].y) / 2,
        z0: zoom, px0: panX, py0: panY,
      };
      return;
    }
    if (count > 2) return;

    const nodeId = getNodeIdFromEl(e.target);
    pointerDownScreenX = e.clientX;
    pointerDownScreenY = e.clientY;
    isDragConfirmed = false;

    // Close action menu if tapping elsewhere
    if (actionMenuNodeId && (!nodeId || nodeId !== actionMenuNodeId)) {
      closeActionMenu();
    }

    if (nodeId) {
      gestureMode = 'node-start';
      dragNodeId = nodeId;
      let nodeX = 0, nodeY = 0;
      if (nodeId === '__me__') {
        const c = getMeCenter();
        nodeX = c.x; nodeY = c.y;
      } else {
        const node = nodes.find(function(n) { return n.id === nodeId; });
        if (node) { nodeX = node.x; nodeY = node.y; }
      }
      dragOffsetX = e.clientX - (panX + nodeX * zoom);
      dragOffsetY = e.clientY - (panY + nodeY * zoom);

      longPressTimer = setTimeout(function() {
        if (gestureMode === 'node-start' && !isDragConfirmed) {
          gestureMode = 'long-press';
          closeActionMenu();
          startLinking(nodeId);
        }
      }, 650);
    } else {
      gestureMode = 'pan';
      panStartX = e.clientX; panStartY = e.clientY;
      panStartPX = panX; panStartPY = panY;
    }
  }

  function onPtrMove(e) {
    if (!activePointers.has(e.pointerId)) return;
    e.preventDefault();
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (gestureMode === 'pinch' && activePointers.size === 2) {
      const pts = Array.from(activePointers.values());
      const d = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const mx = (pts[0].x + pts[1].x) / 2;
      const my = (pts[0].y + pts[1].y) / 2;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchState.z0 * d / pinchState.d0));
      const wMx = (pinchState.mx0 - pinchState.px0) / pinchState.z0;
      const wMy = (pinchState.my0 - pinchState.py0) / pinchState.z0;
      panX = mx - wMx * newZoom;
      panY = my - wMy * newZoom;
      zoom = newZoom;
      updateWorldTransform();
      return;
    }
    if (gestureMode === 'pan') {
      panX = panStartPX + (e.clientX - panStartX);
      panY = panStartPY + (e.clientY - panStartY);
      updateWorldTransform();
      return;
    }
    if (gestureMode === 'node-start' || gestureMode === 'node-drag') {
      const dx = e.clientX - pointerDownScreenX;
      const dy = e.clientY - pointerDownScreenY;
      if (!isDragConfirmed && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        clearLongPress();
        isDragConfirmed = true;
        gestureMode = 'node-drag';
        closeActionMenu();
      }
      if (isDragConfirmed && dragNodeId && dragNodeId !== '__me__') {
        const node = nodes.find(function(n) { return n.id === dragNodeId; });
        if (node) {
          node.x = (e.clientX - dragOffsetX - panX) / zoom;
          node.y = (e.clientY - dragOffsetY - panY) / zoom;
          node.vx = 0; node.vy = 0;
          const el = document.getElementById('nexus-node-' + dragNodeId);
          if (el) { el.style.left = node.x + 'px'; el.style.top = node.y + 'px'; }
          renderLinks();
        }
      }
    }
  }

  function onPtrUp(e) {
    if (!activePointers.has(e.pointerId)) return;
    e.preventDefault();
    activePointers.delete(e.pointerId);
    clearLongPress();

    if (gestureMode === 'pinch') {
      if (activePointers.size < 2) { gestureMode = null; pinchState = null; }
      return;
    }
    if (gestureMode === 'node-drag') {
      save(); gestureMode = null; dragNodeId = null; isDragConfirmed = false;
      return;
    }
    if (gestureMode === 'node-start' && !isDragConfirmed) {
      const nodeId = dragNodeId;
      gestureMode = null; dragNodeId = null;
      if (!nodeId) return;

      if (linkingSourceId) {
        if (linkingSourceId !== nodeId) {
          setLinkTarget(nodeId);
        } else {
          cancelLinking();
        }
      } else {
        if (nodeId === '__me__') {
          return;
        }
        if (actionMenuNodeId === nodeId) {
          closeActionMenu();
        } else {
          closeActionMenu();
          showActionMenu(nodeId);
        }
      }
      return;
    }
    if (gestureMode === 'pan') {
      const dist = Math.hypot(e.clientX - panStartX, e.clientY - panStartY);
      if (dist < 6) {
        if (linkingSourceId) cancelLinking();
        closeActionMenu();
      }
    }
    gestureMode = null; dragNodeId = null; isDragConfirmed = false;
  }

  function onPtrCancel(e) {
    activePointers.delete(e.pointerId);
    clearLongPress();
    if (gestureMode === 'node-drag') save();
    if (activePointers.size === 0) { gestureMode = null; dragNodeId = null; isDragConfirmed = false; }
  }

  function clearLongPress() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  }

  // ── Open / Close ───────────────────────────────────────
  function openApp() {
    const app = document.getElementById('nexusApp');
    if (!app) return;
    if (!_initialized) {
      _initialized = true;
      load();
      buildDOM();
      bindEvents();
      startFlowAnimation();
    }
    app.classList.add('open');
    syncFriendsToStarMap();
    recalcNodePositions();
    resizeBgCanvas();
    updateWorldTransform();
    playEntryAnimation();
    const hint = document.getElementById('nexus-drag-hint');
    if (hint) {
      hint.style.display = 'flex';
      setTimeout(function() { hint.style.display = 'none'; }, 4000);
    }
  }

  function closeApp() {
    document.getElementById('nexusApp').classList.remove('open');
    cancelAnimationFrame(animFrame);
    stopSnowAnimation();
    stopForceSimulation();
    cancelLinking();
    closeActionMenu();
    gestureMode = null; activePointers.clear();
  }

  // ── Entry Animation ────────────────────────────────────
  function playEntryAnimation() {
    renderGraph();
    const container = document.getElementById('nexus-nodes-container');
    const nodeEls = container ? container.querySelectorAll('.nexus-node') : [];
    nodeEls.forEach(function(el, i) {
      el.style.opacity = '0';
      el.style.transform = (el.style.transform || '') + ' scale(0.2)';
      setTimeout(function() {
        el.style.transition = 'opacity 0.5s ease, transform 0.55s cubic-bezier(0.34,1.56,0.64,1)';
        el.style.opacity = '1';
        el.style.transform = el.style.transform.replace(' scale(0.2)', '').replace('scale(0.2)', '');
      }, 120 + i * 70);
    });
  }

  // ── Background Stars ───────────────────────────────────
  function resizeBgCanvas() {
    const app = document.getElementById('nexusApp');
    bgCanvas = document.getElementById('nexus-bg-canvas');
    if (!bgCanvas || !app) return;
    bgCanvas.width = app.offsetWidth;
    bgCanvas.height = app.offsetHeight;
    bgCtx = bgCanvas.getContext('2d');
    snowParticles = [];
    initSnowParticles(bgCanvas.width, bgCanvas.height);
    startSnowAnimation();
  }

  function drawStars() {
    bgCanvas = bgCanvas || document.getElementById('nexus-bg-canvas');
    if (!bgCanvas) return;
    const app = document.getElementById('nexusApp');
    if (!app) return;
    if (!bgCtx) bgCtx = bgCanvas.getContext('2d');
    if (bgCanvas.width < 10) { bgCanvas.width = app.offsetWidth; bgCanvas.height = app.offsetHeight; }
    if (!snowParticles.length) initSnowParticles(bgCanvas.width, bgCanvas.height);
    startSnowAnimation();
  }

  function initSnowParticles(w, h) {
    snowParticles = [];
    for (let i = 0; i < 50; i++) snowParticles.push({
      x: Math.random() * w, y: Math.random() * h,
      r: Math.random() * 0.9 + 0.15, speed: 0, drift: 0,
      alpha: Math.random() * 0.4 + 0.06, phase: Math.random() * Math.PI * 2, type: 'star',
    });
    for (let i = 0; i < 80; i++) snowParticles.push({
      x: Math.random() * w, y: Math.random() * h,
      r: Math.random() * 1.5 + 0.2,
      speed: Math.random() * 0.35 + 0.06, drift: (Math.random() - 0.5) * 0.15,
      alpha: Math.random() * 0.55 + 0.08, phase: Math.random() * Math.PI * 2, type: 'snow',
    });
    for (let i = 0; i < 12; i++) snowParticles.push({
      x: Math.random() * w, y: Math.random() * h,
      r: Math.random() * 5 + 3,
      speed: Math.random() * 0.15 + 0.03, drift: (Math.random() - 0.5) * 0.06,
      alpha: Math.random() * 0.20 + 0.09, phase: Math.random() * Math.PI * 2,
      type: 'snow', rotation: Math.random() * Math.PI * 2, rotDir: Math.random() < 0.5 ? 1 : -1,
    });
  }

  function drawCrystalSnowflake(ctx, cx, cy, size, alpha, rotation) {
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(rotation);
    ctx.strokeStyle = 'rgba(255,255,255,' + alpha + ')'; ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      ctx.save(); ctx.rotate((i / 6) * Math.PI * 2);
      ctx.lineWidth = size * 0.09;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -size); ctx.stroke();
      [0.35, 0.6, 0.82].forEach(function(frac) {
        const bLen = size * (0.32 - frac * 0.18);
        const bY = -size * frac;
        ctx.lineWidth = size * 0.055;
        ctx.beginPath(); ctx.moveTo(0, bY); ctx.lineTo(bLen * 0.72, bY - bLen * 0.72); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, bY); ctx.lineTo(-bLen * 0.72, bY - bLen * 0.72); ctx.stroke();
      });
      ctx.fillStyle = 'rgba(255,255,255,' + (alpha * 0.9) + ')';
      ctx.beginPath(); ctx.arc(0, -size, size * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.lineWidth = size * 0.07;
    ctx.beginPath(); ctx.arc(0, 0, size * 0.12, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function drawBgFrame() {
    if (!bgCanvas || !bgCtx) return;
    const w = bgCanvas.width, h = bgCanvas.height;
    const t = Date.now() * 0.001;
    const grad = bgCtx.createLinearGradient(0, 0, w * 0.6, h);
    grad.addColorStop(0, '#080808'); grad.addColorStop(0.5, '#0d0d0d'); grad.addColorStop(1, '#060606');
    bgCtx.fillStyle = grad; bgCtx.fillRect(0, 0, w, h);
    drawDecorLines(w, h);
    snowParticles.forEach(function(p) {
      if (p.type === 'snow') {
        p.y += p.speed; p.x += p.drift;
        if (p.y > h + 5) { p.y = -5; p.x = Math.random() * w; }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.r >= 2.5) p.rotation = (p.rotation || 0) + 0.004 * (p.rotDir || 1);
      }
      const twinkle = p.type === 'star'
        ? Math.sin(t * 0.7 + p.phase) * 0.4 + 0.6
        : Math.sin(t * 1.1 + p.phase) * 0.18 + 0.82;
      const a = p.alpha * twinkle;
      if (p.type === 'snow' && p.r >= 2.5) {
        drawCrystalSnowflake(bgCtx, p.x, p.y, p.r, a, p.rotation || 0);
      } else {
        bgCtx.beginPath(); bgCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        bgCtx.fillStyle = 'rgba(255,255,255,' + a + ')'; bgCtx.fill();
      }
    });
  }

  function drawDecorLines(w, h) {
    const brk = 24, m = 16;
    bgCtx.lineCap = 'square';
    bgCtx.strokeStyle = 'rgba(255,255,255,0.09)'; bgCtx.lineWidth = 0.9;
    bgCtx.beginPath(); bgCtx.moveTo(m, m + brk); bgCtx.lineTo(m, m); bgCtx.lineTo(m + brk, m); bgCtx.stroke();
    bgCtx.beginPath(); bgCtx.moveTo(w-m-brk, m); bgCtx.lineTo(w-m, m); bgCtx.lineTo(w-m, m+brk); bgCtx.stroke();
    bgCtx.beginPath(); bgCtx.moveTo(m, h-m-brk); bgCtx.lineTo(m, h-m); bgCtx.lineTo(m+brk, h-m); bgCtx.stroke();
    bgCtx.beginPath(); bgCtx.moveTo(w-m-brk, h-m); bgCtx.lineTo(w-m, h-m); bgCtx.lineTo(w-m, h-m-brk); bgCtx.stroke();
    bgCtx.strokeStyle = 'rgba(255,255,255,0.036)'; bgCtx.lineWidth = 0.6;
    [[0,h*0.28,w*0.22,0],[w*0.76,0,w,h*0.18],[w,h*0.76,w*0.8,h],[0,h*0.74,w*0.18,h]].forEach(function(pts) {
      bgCtx.beginPath(); bgCtx.moveTo(pts[0],pts[1]); bgCtx.lineTo(pts[2],pts[3]); bgCtx.stroke();
    });
    bgCtx.strokeStyle = 'rgba(255,255,255,0.1)'; bgCtx.lineWidth = 0.7;
    [[w*0.14,h*0.20],[w*0.87,h*0.14],[w*0.08,h*0.70],[w*0.93,h*0.76],
     [w*0.52,h*0.07],[w*0.48,h*0.93],[w*0.80,h*0.84],[w*0.20,h*0.88]].forEach(function(pt) {
      bgCtx.beginPath(); bgCtx.moveTo(pt[0]-5,pt[1]); bgCtx.lineTo(pt[0]+5,pt[1]);
      bgCtx.moveTo(pt[0],pt[1]-5); bgCtx.lineTo(pt[0],pt[1]+5); bgCtx.stroke();
    });
    bgCtx.strokeStyle = 'rgba(255,255,255,0.07)'; bgCtx.lineWidth = 0.6;
    [[w*0.38,h*0.04],[w*0.62,h*0.96],[w*0.04,h*0.46],[w*0.96,h*0.52]].forEach(function(pt) {
      bgCtx.beginPath(); bgCtx.moveTo(pt[0],pt[1]-4); bgCtx.lineTo(pt[0]+4,pt[1]);
      bgCtx.lineTo(pt[0],pt[1]+4); bgCtx.lineTo(pt[0]-4,pt[1]); bgCtx.closePath(); bgCtx.stroke();
    });
  }

  function startSnowAnimation() {
    if (snowAnimId) return;
    function tick() {
      const app = document.getElementById('nexusApp');
      if (!app || !app.classList.contains('open')) { snowAnimId = null; return; }
      drawBgFrame();
      snowAnimId = requestAnimationFrame(tick);
    }
    snowAnimId = requestAnimationFrame(tick);
  }

  function stopSnowAnimation() {
    if (snowAnimId) { cancelAnimationFrame(snowAnimId); snowAnimId = null; }
  }

  // ── Flow Animation ─────────────────────────────────────
  function startFlowAnimation() {
    let t = 0;
    function tick() {
      t += 0.006;
      document.querySelectorAll('.nexus-link-path').forEach(function(p) {
        p.style.strokeDashoffset = -(t * 28);
      });
      animFrame = requestAnimationFrame(tick);
    }
    tick();
  }

  // ── Render Graph ───────────────────────────────────────
  function renderGraph() {
    renderLinks();
    renderNodes();
    checkGroupFormation();
  }

  function renderLinks() {
    const svgEl = document.getElementById('nexus-svg-links');
    const labelsEl = document.getElementById('nexus-link-labels');
    if (!svgEl || !labelsEl) return;

    const app = document.getElementById('nexusApp');
    const w = app ? app.offsetWidth : 390;
    const h = app ? app.offsetHeight : 700;
    svgEl.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svgEl.innerHTML = '';
    labelsEl.innerHTML = '';

    const center = getMeCenter();

    for (let o = 1; o <= 4; o++) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', center.x); c.setAttribute('cy', center.y);
      c.setAttribute('r', orbitRadius(o)); c.setAttribute('fill', 'none');
      c.setAttribute('stroke', 'rgba(255,255,255,0.05)');
      c.setAttribute('stroke-width', '0.8'); c.setAttribute('stroke-dasharray', '4 16');
      svgEl.appendChild(c);
    }

    const posMap = { '__me__': center };
    nodes.forEach(function(n) { posMap[n.id] = { x: n.x, y: n.y }; });

    links.forEach(function(link) {
      const a = posMap[link.from], b = posMap[link.to];
      if (!a || !b) return;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dx = b.x - a.x, dy = b.y - a.y;
      const cx_ = mx + dy * 0.15, cy_ = my - dx * 0.15;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M ' + a.x + ' ' + a.y + ' Q ' + cx_ + ' ' + cy_ + ' ' + b.x + ' ' + b.y);
      path.setAttribute('fill', 'none');
      const hasDetail = link.label || link.myView || link.theirView;
      path.setAttribute('stroke', hasDetail ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.16)');
      path.setAttribute('stroke-width', hasDetail ? '1.8' : '0.9');
      path.setAttribute('stroke-dasharray', '6 18');
      path.classList.add('nexus-link-path');
      svgEl.appendChild(path);

      if (link.label) {
        const lbl = document.createElement('div');
        lbl.className = 'nexus-link-label';
        lbl.textContent = link.label;
        lbl.style.left = mx + 'px';
        lbl.style.top  = my + 'px';
        labelsEl.appendChild(lbl);
      }
    });
  }

  function renderNodes() {
    const container = document.getElementById('nexus-nodes-container');
    if (!container) return;
    container.innerHTML = '';
    const center = getMeCenter();
    container.appendChild(createMeNode(center));
    nodes.forEach(function(n) { container.appendChild(createNodeElement(n)); });
  }

  function createMeNode(center) {
    const el = document.createElement('div');
    el.className = 'nexus-node nexus-node-me';
    el.id = 'nexus-node-__me__';
    el.style.left = center.x + 'px';
    el.style.top  = center.y + 'px';
    el.style.pointerEvents = 'all';
    const user = getCurrentUser();
    const name = user ? (user.name || '我') : '我';
    const src  = user ? (user.avatar || '') : '';
    el.innerHTML = '<div class="nexus-node-inner" style="background:#111111;">' +
      (src ? '<img src="' + src + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">' :
             '<span style="font-size:20px;font-weight:800;color:#FFF;">' + name.charAt(0) + '</span>') +
      '</div><div class="nexus-node-label" style="color:#fff;font-weight:800;">' + name + '</div>';
    return el;
  }

  function createNodeElement(node) {
    const el = document.createElement('div');
    el.className = 'nexus-node' + (node.isNPC ? ' nexus-node-npc' : '');
    el.id = 'nexus-node-' + node.id;
    el.style.left = node.x + 'px';
    el.style.top  = node.y + 'px';
    el.style.pointerEvents = 'all';
    const colors = node.color || AVATAR_COLORS[0];
    const c0 = colors[0], c1 = colors[1];
    const content = node.avatar
      ? '<img src="' + node.avatar + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
      : '<span style="font-size:17px;font-weight:800;color:#FFF;">' + (node.name || '?').charAt(0) + '</span>';
    el.innerHTML =
      '<div class="nexus-node-inner" style="background:linear-gradient(135deg,' + c0 + ',' + c1 + ');">' +
        content +
      '</div>' +
      '<div class="nexus-node-label">' + (node.name || '') + '</div>' +
      (node.isNPC ? '<div class="nexus-npc-badge">NPC</div>' : '');
    return el;
  }

  // ── Profile Sheet ──────────────────────────────────────
  function openProfileSheet(nodeId) {
    selectedNodeId = nodeId;
    const node = nodes.find(function(n) { return n.id === nodeId; });
    if (!node) return;
    const colors = node.color || AVATAR_COLORS[0];
    const c0 = colors[0], c1 = colors[1];
    const avatarEl = document.getElementById('np-avatar');
    if (avatarEl) {
      avatarEl.innerHTML = node.avatar
        ? '<img src="' + node.avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="">'
        : '<div style="width:100%;height:100%;border-radius:50%;background:linear-gradient(135deg,' + c0 + ',' + c1 + ');display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:#fff">' + (node.name || '?').charAt(0) + '</div>';
    }
    const setEl = function(id, val) { const e = document.getElementById(id); if (e) e.textContent = val || ''; };
    setEl('np-name', node.name);
    setEl('np-role', node.role || '好友');
    const fill = document.getElementById('np-affection');
    if (fill) fill.style.width = (node.affection || 50) + '%';
    const slider = document.getElementById('np-affection-slider');
    if (slider) slider.value = node.affection || 50;
    const rel = document.getElementById('np-relation');
    if (rel) rel.value = node.bondText || '';
    const tagsEl = document.getElementById('np-tags');
    if (tagsEl) tagsEl.innerHTML = (node.tags || []).map(function(t) {
      return '<span class="nexus-tag">' + t + '</span>';
    }).join('');
    const topoEl = document.getElementById('np-topology');
    if (topoEl) {
      const myLinks = links.filter(function(l) { return l.from === nodeId || l.to === nodeId; });
      const lines = myLinks.map(function(l) {
        const otherId = l.from === nodeId ? l.to : l.from;
        const other = otherId === '__me__' ? '你' : (nodes.find(function(n) { return n.id === otherId; }) || { name: '未知' }).name;
        let desc = l.label ? ('：' + l.label) : '（相连）';
        if (l.myView) desc += ' / 我眼中：' + l.myView;
        if (l.theirView) desc += ' / Ta眼中：' + l.theirView;
        return '• 与 ' + other + desc;
      });
      topoEl.textContent = lines.length ? lines.join('\n') : '暂无其他羁绊';
    }
    const sheet = document.getElementById('nexus-profile-sheet');
    if (sheet) sheet.classList.add('open');
  }

  function closeProfileSheet() {
    const sheet = document.getElementById('nexus-profile-sheet');
    if (sheet) sheet.classList.remove('open');
    selectedNodeId = null;
  }

  // ── Linking ────────────────────────────────────────────
  function startLinking(sourceId) {
    linkingSourceId = sourceId;
    linkTargetId = null;
    document.querySelectorAll('.nexus-node').forEach(function(el) {
      el.classList.remove('linking-source', 'linking-target');
    });
    const srcEl = document.getElementById('nexus-node-' + sourceId);
    if (srcEl) srcEl.classList.add('linking-source');
    // Populate preset tags
    const presetsEl = document.getElementById('nexus-rel-presets');
    if (presetsEl) {
      presetsEl.innerHTML = REL_PRESETS.map(function(p) {
        return '<span class="nexus-rel-tag" data-val="' + p + '">' + p + '</span>';
      }).join('');
    }
    const hint = document.getElementById('nexus-drag-hint');
    if (hint) { hint.textContent = '请点击另一个节点建立连线 · 点击背景取消'; hint.style.display = 'flex'; }
  }

  function setLinkTarget(targetId) {
    linkTargetId = targetId;
    const tgtEl = document.getElementById('nexus-node-' + targetId);
    if (tgtEl) tgtEl.classList.add('linking-target');

    const srcNode = nodes.find(function(n) { return n.id === linkingSourceId; }) || { name: '你' };
    const tgtNode = nodes.find(function(n) { return n.id === targetId; }) || { name: '?' };

    const desc = document.getElementById('nexus-connect-desc');
    if (desc) desc.textContent = '定义 ' + (srcNode.name || '?') + ' ↔ ' + (tgtNode.name || '?') + ' 之间的关系';
    const labelThem = document.getElementById('ndp-label-them');
    const labelMe   = document.getElementById('ndp-label-me');
    if (labelThem) labelThem.textContent = (tgtNode.name || 'Ta') + ' 眼中的我';
    if (labelMe)   labelMe.textContent   = '我眼中的 ' + (tgtNode.name || 'Ta');

    const ex = links.find(function(l) {
      return (l.from === linkingSourceId && l.to === targetId) ||
             (l.from === targetId && l.to === linkingSourceId);
    });
    const getVal = function(id, def) {
      const el = document.getElementById(id);
      if (el) el.value = def || '';
    };
    getVal('nexus-connect-input', ex ? ex.label : '');
    getVal('nexus-dp-them', ex ? ex.theirView : '');
    getVal('nexus-dp-me',   ex ? ex.myView : '');
    const tensionSlider = document.getElementById('nexus-tension-slider');
    const tensionVal    = document.getElementById('nexus-tension-val');
    if (tensionSlider) tensionSlider.value = ex ? (ex.tension || 50) : 50;
    if (tensionVal)    tensionVal.textContent = ex ? (ex.tension || 50) : 50;
    document.querySelectorAll('.nexus-rel-tag').forEach(function(t) { t.classList.remove('active'); });
    if (ex && ex.label) {
      document.querySelectorAll('.nexus-rel-tag').forEach(function(t) {
        if (t.dataset.val === ex.label) t.classList.add('active');
      });
    }
    const modal = document.getElementById('nexus-connect-modal');
    if (modal) modal.classList.add('active');
    const hint = document.getElementById('nexus-drag-hint');
    if (hint) hint.style.display = 'none';
  }

  function cancelLinking() {
    linkingSourceId = null; linkTargetId = null;
    document.querySelectorAll('.nexus-node').forEach(function(el) {
      el.classList.remove('linking-source', 'linking-target');
    });
    const modal = document.getElementById('nexus-connect-modal');
    if (modal) modal.classList.remove('active');
    const hint = document.getElementById('nexus-drag-hint');
    if (hint) hint.style.display = 'none';
  }

  function confirmLink() {
    const getInputVal = function(id) {
      const el = document.getElementById(id);
      return el ? el.value.trim() : '';
    };
    const label     = getInputVal('nexus-connect-input');
    const myView    = getInputVal('nexus-dp-me');
    const theirView = getInputVal('nexus-dp-them');
    const tensionEl = document.getElementById('nexus-tension-slider');
    const tension   = tensionEl ? +tensionEl.value : 50;

    if (linkingSourceId && linkTargetId) {
      links = links.filter(function(l) {
        return !((l.from === linkingSourceId && l.to === linkTargetId) ||
                 (l.from === linkTargetId   && l.to === linkingSourceId));
      });
      links.push({ from: linkingSourceId, to: linkTargetId, label: label, myView: myView, theirView: theirView, tension: tension });
      save(); renderLinks(); checkGroupFormation();
      showToast(label ? ('✦ 已建立羁绊：' + label) : '✦ 已建立连线');
    }
    cancelLinking();
  }

  // ── Add Tag ────────────────────────────────────────────
  function addTagToNode(node) {
    const tag = prompt('添加标签（如：挚友、同事）:');
    if (tag && tag.trim()) {
      node.tags = node.tags || [];
      node.tags.push(tag.trim());
      save(); openProfileSheet(node.id);
    }
  }

  // ── Delete Node ────────────────────────────────────────
  function deleteNode(node) {
    closeProfileSheet();
    const el = document.getElementById('nexus-node-' + node.id);
    if (el) {
      el.style.transition = 'all 0.4s ease';
      el.style.transform = 'translate(-50%,-50%) scale(0)';
      el.style.opacity = '0';
      const r = el.getBoundingClientRect();
      spawnShards(r.left + r.width / 2, r.top + r.height / 2);
    }
    setTimeout(function() {
      nodes = nodes.filter(function(n) { return n.id !== node.id; });
      links = links.filter(function(l) { return l.from !== node.id && l.to !== node.id; });
      save(); renderGraph();
    }, 420);
  }

  function spawnShards(cx, cy) {
    for (let i = 1; i <= 6; i++) {
      const s = document.createElement('div');
      s.className = 'nexus-shard';
      s.style.left = cx + 'px'; s.style.top = cy + 'px';
      s.style.animationName = 'ns' + i;
      document.body.appendChild(s);
      setTimeout(function() { s.remove(); }, 600);
    }
  }

  // ── Group Formation ────────────────────────────────────
  function checkGroupFormation() {
    if (nodes.length < 3) return;
    for (let i = 0; i < nodes.length - 2; i++) {
      for (let j = i + 1; j < nodes.length - 1; j++) {
        for (let k = j + 1; k < nodes.length; k++) {
          const a = nodes[i], b = nodes[j], c = nodes[k];
          const hasLink = function(x, y) {
            return links.some(function(l) {
              return (l.from === x.id && l.to === y.id) || (l.from === y.id && l.to === x.id);
            });
          };
          if (hasLink(a, b) && hasLink(b, c) && hasLink(c, a)) {
            const key = [a.id, b.id, c.id].sort().join('-');
            let seen = [];
            try { seen = JSON.parse(localStorage.getItem('nexus_seen_groups') || '[]'); } catch(e) {}
            if (!seen.includes(key)) {
              seen.push(key);
              localStorage.setItem('nexus_seen_groups', JSON.stringify(seen));
              showGroupToast([a, b, c]);
            }
            return;
          }
        }
      }
    }
  }

  function showGroupToast(members) {
    const existing = document.querySelector('.nexus-group-toast');
    if (existing) existing.remove();
    clearTimeout(groupToastTimeout);
    const names = members.map(function(m) { return m.name; }).join('、');
    const toast = document.createElement('div');
    toast.className = 'nexus-group-toast';
    toast.innerHTML =
      '<i class="fas fa-circle-nodes"></i>' +
      '<div class="nexus-group-toast-text">检测到紧密关系网（' + names + '），是否创建专属群聊？</div>' +
      '<button class="nexus-group-toast-btn">创建群聊</button>';
    toast.querySelector('button').addEventListener('click', function() {
      toast.remove();
      if (typeof AppGroupChat !== 'undefined') AppGroupChat.open();
      else showToast('群聊功能请在群聊应用中使用');
    });
    const app = document.getElementById('nexusApp');
    if (app) app.appendChild(toast);
    groupToastTimeout = setTimeout(function() { toast.remove(); }, 7000);
  }

  // ── Toast ──────────────────────────────────────────────
  function showToast(msg) {
    const existing = document.getElementById('nexus-toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.id = 'nexus-toast';
    t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);' +
      'background:rgba(255,255,255,0.97);color:#222222;' +
      'padding:10px 20px;border-radius:20px;font-size:12px;font-weight:600;' +
      'border:1px solid #EEEEEE;z-index:9999;' +
      'box-shadow:0 6px 24px rgba(0,0,0,0.12);' +
      'white-space:nowrap;pointer-events:none;' +
      'animation:nexus-slide-down 0.3s ease;letter-spacing:0.3px;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() { t.remove(); }, 2500);
  }

  // ── System Prompt (enhanced with dual perspective) ─────
  function getNexusSystemPrompt(npcId) {
    const node = nodes.find(function(n) { return n.id === npcId; });
    if (!node) return '';
    const myLinks = links.filter(function(l) { return l.from === npcId || l.to === npcId; });
    const relationships = myLinks.map(function(l) {
      const otherId = l.from === npcId ? l.to : l.from;
      const otherNode = nodes.find(function(n) { return n.id === otherId; });
      const other = otherId === '__me__' ? '主角（用户）' : (otherNode ? otherNode.name : '未知');
      let desc = '与 ' + other + ' 的关系：' + (l.label || '相连');
      if (l.theirView) desc += '；对方眼中你的形象：' + l.theirView;
      if (l.myView)    desc += '；你眼中对方的形象：' + l.myView;
      if (l.tension)   desc += '；张力值：' + l.tension + '/100';
      return desc;
    }).join('；');
    const knownPeople = nodes.filter(function(n) { return n.id !== npcId; }).map(function(n) {
      const lk = links.find(function(l) {
        return (l.from === npcId && l.to === n.id) || (l.to === npcId && l.from === n.id);
      });
      return n.name + '（' + (lk ? (lk.label || '认识') : '认识') + '）';
    }).join('、');
    const user = getCurrentUser();
    const meDesc = user ? (user.name + '（' + (user.personality || user.description || '主角') + '）') : '主角';
    return '【羁绊星图系统提示 - 最高优先级】\n' +
      '你是 ' + node.name + '，' + (node.role || '好友') + '。\n' +
      '羁绊备注：' + (node.bondText || '') + '\n' +
      (node.personality ? '性格特点：' + node.personality + '\n' : '') +
      (node.opening ? '你的说话风格（参考开场白）：' + node.opening + '\n' : '') +
      '特殊标签：' + ((node.tags || []).join('、') || '无') + '\n' +
      '当前关系网：' + (relationships || '仅与主角相连') + '\n' +
      '认识的其他人：' + (knownPeople || '无') + '\n' +
      '好感度：' + (node.affection || 50) + '/100\n' +
      '对话对象：' + meDesc;
  }

  // ── Public API ─────────────────────────────────────────
  return {
    init: init,
    open: openApp,
    close: closeApp,
    getNodes: function() { return nodes; },
    getLinks: function() { return links; },
    getNexusSystemPrompt: getNexusSystemPrompt,
    getPersonaForNPC: function(id) { return nodes.find(function(n) { return n.id === id; }); },
    syncFriends: syncFriendsToStarMap,
  };
})();

if (typeof window !== 'undefined') window.NexusApp = NexusApp;
