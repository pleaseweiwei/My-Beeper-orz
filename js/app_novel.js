/* ============================================================
   app_novel.js  —  📚 Novel App v4.0 — 四栏重构版
   Tabs: 论坛 | 书架 | 排行榜 | 我的
   ============================================================ */

const NovelApp = (() => {
  'use strict';

  const SETTINGS_KEY = 'myCoolPhone_aiSettings';

  const GENRES = [
    { id: 'all', label: '全部', emoji: 'fas fa-layer-group' },
    { id: 'romance', label: '言情', emoji: 'fas fa-heart' },
    { id: 'sweet', label: '甜宠', emoji: 'fas fa-candy-cane' },
    { id: 'xianxia', label: '古风', emoji: 'fas fa-fan' },
    { id: 'school', label: '校园', emoji: 'fas fa-school' },
    { id: 'transmigration', label: '穿越', emoji: 'fas fa-door-open' },
    { id: 'infinite', label: '无限流', emoji: 'fas fa-infinity' },
    { id: 'fantasy', label: '奇幻', emoji: 'fas fa-moon' },
    { id: 'horror', label: '恐怖', emoji: 'fas fa-ghost' },
    { id: 'scifi', label: '科幻', emoji: 'fas fa-rocket' },
  ];

  const TROPE_POOL = {
    '恋爱类型': ['破镜重圆','青梅竹马','先婚后爱','欢喜冤家','暗恋成真','双向奔赴','指腹为婚','失忆重逢','替身文学','逃婚记','假恋人真爱人'],
    '世界设定': ['赛博朋克','古风仙侠','末世求生','星际征途','娱乐圈腥风血雨','豪门世家恩怨','校园青春','游戏副本','异世界穿越','修真宗门'],
    '情节爽点': ['修罗场','黑化反转','甜虐交织','双重身份马甲大乱战','大女主一剑封喉','全员卧底','意外翻盘','万人迷我不干了'],
    '风格氛围': ['甜到齁','虐哭全网','沙雕日常','爽文爽到飞起','温柔治愈系','悬疑推理叠加']
  };

  const NETIZEN_POOL = [
    '啊啊啊按头小分队出动！', '男主怎么还不去跪键盘', '前方高能预警',
    '作者大大求加更！', '这段把我虐哭了', '甜到齁嗝不停',
    '我磕到了我磕到了！', '这个展开我没想到', '作者你出来我不打你',
    '写的不错，期待下章', '这里细品三遍', '破防了破防了',
    '嗑学家已就位', '前排留爪', '冲！冲！冲！',
    '男主怎么这么好哭', 'cp感拉满了！', '等更等到发疯',
    '这段描写绝了', '打call！作者牛！'
  ];

  const COVER_PALETTES = [
    '#ffffff', '#fafafa', '#f5f5f5', '#eeeeee', '#e0e0e0',
    '#fcfcfc', '#f4f4f6', '#f7f6f5', '#e8e8e8', '#f0f0f0'
  ];
  const COVER_EMOJIS = [
    'fas fa-quote-left','fas fa-leaf','fas fa-moon','fas fa-wind',
    'fas fa-feather','fas fa-asterisk','fas fa-spa','fas fa-paper-plane',
    'fas fa-star-of-life','fas fa-heart'
  ];

  // ─── STATE ──────────────────────────────────────────────────
  let state = {
    books: [],
    favorites: new Set(),
    activeBook: null,
    currentPage: 0,
    companion: null,
    activeTab: 'forum',
    forumGenre: 'all',
    shelfGenre: 'all',
    selectedCharas: [],
    currentTropes: [],
    generationGenre: 'romance',
    chaptersToGenerate: 1,
    isGenerating: false,
    genProgress: '',
    myNovels: [],
    writeChapters: [],
    writingBookId: null,
    _pendingExpandedContent: '',
    commentCache: {},
    antiAddictionSnoozed: false,
    highlightMode: false,
    awayStart: null,
    _awayTrackerStarted: false,
    showGenPanel: false,
    authorViews: {},
    communityData: null,
    fanEvents: [],
    brawlMode: false,
    brawlHP: { me: 100, ai: 100 },
    brawlLogs: [],
    brawlGoal: '',
  };

  // ─── API HELPER ──────────────────────────────────────────────
  async function callAPI(prompt, maxTokens) {
    maxTokens = maxTokens || 1000;
    var s = localStorage.getItem(SETTINGS_KEY);
    if (!s) return null;
    try {
      var cfg = JSON.parse(s);
      if (!cfg.apiKey || !cfg.endpoint || !cfg.model) return null;
      var base = cfg.endpoint.replace(/\/$/, '');
      var url = base.endsWith('/v1') ? (base + '/chat/completions') : (base + '/v1/chat/completions');
      var res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
        body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: prompt }], temperature: 0.85, max_tokens: maxTokens })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim() || null;
    } catch(e) { console.error('[NovelApp] API error:', e); return null; }
  }

  // ─── PERSONA HELPERS ─────────────────────────────────────────
  function getPersonas() {
    try {
      var all = [];
      // 1. 读取玩家的“人设”
      if (typeof personasMeta !== 'undefined' && personasMeta) {
        Object.keys(personasMeta).forEach(function(id) {
          var p = personasMeta[id];
          all.push({ id: id, name: p.name || p.nickname || '我(人设)', persona: p.persona || '', avatar: p.avatar || '' });
        });
      }
      // 2. 读取全局 friendsData (好友/NPC)
      if (typeof friendsData !== 'undefined' && friendsData) {
        Object.keys(friendsData).forEach(function(id) {
          var f = friendsData[id];
          if (f.type !== 'group') { // 排除群组
            all.push({ id: id, name: f.remark || f.realName || id, persona: f.persona || '', avatar: f.avatar || '' });
          }
        });
      }
      return all;
    } catch(e) {
      console.error("[NovelApp] getPersonas error:", e);
    }
    return [];
  }
  function getPersona(id) {
    if (typeof friendsData !== 'undefined' && friendsData && friendsData[id]) {
      var f = friendsData[id];
      return { id: id, name: f.remark || f.realName || id, persona: f.persona || '', avatar: f.avatar || '' };
    }
    return null;
  }
  function getName(id) { var p = getPersona(id); return p ? p.name : 'TA'; }
  function getUserPersona() {
    try {
      var meta = (typeof personasMeta !== 'undefined') ? personasMeta : {};
      var pid = (typeof currentPersonaId !== 'undefined') ? currentPersonaId : '';
      var me = meta[pid];
      return me ? (me.persona || '') : '';
    } catch(e) { return ''; }
  }
  function getUserName() {
    try {
      var meta = (typeof personasMeta !== 'undefined') ? personasMeta : {};
      var pid = (typeof currentPersonaId !== 'undefined') ? currentPersonaId : '';
      var me = meta[pid];
      return me ? (me.name || me.nickname || '我') : '我';
    } catch(e) { return '我'; }
  }
  function getUserAvatar() {
    try {
      var meta = (typeof personasMeta !== 'undefined') ? personasMeta : {};
      var pid = (typeof currentPersonaId !== 'undefined') ? currentPersonaId : '';
      var me = meta[pid];
      return me ? (me.avatar || '') : '';
    } catch(e) { return ''; }
  }
  function getWorldbookContent(charaIds) {
    charaIds = charaIds || [];
    try {
      if (typeof worldBooks === 'undefined') return '';
      var allWbs = worldBooks;
      var globalContent = allWbs
        .filter(function(wb) { return wb.global; })
        .reduce(function(acc, wb) {
          return acc.concat((wb.entries || []).filter(function(e) { return e.enabled !== false; }).map(function(e) { return e.content || ''; }));
        }, []).filter(Boolean).join('\n');
      var charaWbIds = [];
      charaIds.forEach(function(id) {
        var f = (typeof friendsData !== 'undefined') ? friendsData[id] : null;
        if (f && f.worldbook) {
          var wbs = Array.isArray(f.worldbook) ? f.worldbook : [f.worldbook];
          wbs.forEach(function(wid) { if (charaWbIds.indexOf(wid) < 0) charaWbIds.push(wid); });
        }
      });
      var charaContent = charaWbIds.map(function(id) {
        var wb = allWbs.find(function(w) { return w.id === id; });
        if (!wb) return '';
        return (wb.entries || []).filter(function(e) { return e.enabled !== false; }).map(function(e) { return e.content || ''; }).filter(Boolean).join('\n');
      }).filter(Boolean).join('\n');
      return [globalContent, charaContent].filter(Boolean).join('\n\n').slice(0, 800);
    } catch(e) { return ''; }
  }

  function randomCover() { return COVER_PALETTES[Math.floor(Math.random() * COVER_PALETTES.length)]; }
  function randomEmoji() { return COVER_EMOJIS[Math.floor(Math.random() * COVER_EMOJIS.length)]; }

  // ─── HEAT SCORE ──────────────────────────────────────────────
  function getHeatScore(book) {
    var views = state.authorViews[book.id] || 0;
    var favBonus = state.favorites.has(book.id) ? 500 : 0;
    var seed = 0;
    var idStr = book.id || '';
    for (var i = 0; i < idStr.length; i++) seed += idStr.charCodeAt(i);
    var base = (seed % 800) + 200;
    var chapBonus = (book.pages ? book.pages.length : 1) * 150;
    return views * 100 + favBonus + base + chapBonus;
  }

  function getTotalHeatStr() {
    var total = 0;
    state.books.forEach(function(b) { total += getHeatScore(b); });
    return total > 1000 ? Math.floor(total / 1000) + 'k' : String(total);
  }

  function incrementViews(bookId) {
    state.authorViews[bookId] = (state.authorViews[bookId] || 0) + 1;
    saveState();
  }

  // ─── STATE PERSISTENCE ──────────────────────────────────────
  function saveState() {
    try {
      localStorage.setItem('novel_state_v3', JSON.stringify({
        companion: state.companion,
        favorites: Array.from(state.favorites),
        userBooks: state.books,
        myNovels: state.myNovels || [],
        writingBookId: state.writingBookId,
        authorViews: state.authorViews || {},
      }));
    } catch(e) {}
  }

  // ─── INIT ───────────────────────────────────────────────────
  function init() {
    state.books = [];
    state.myNovels = [];
    
    // 如果没有任何书籍，给一点默认数据来展示效果
    if (state.books.length === 0) {
      state.books = [
        {
          id: 'demo_1', title: '总裁的在逃小娇妻', tags: ['romance'], cover: '#fafafa', emoji: 'fas fa-heart',
          progress: 0.1, totalPages: 100, pages: ['第一章...'], isGenerated: false, serial: true
        },
        {
          id: 'demo_2', title: '全服第一剑修', tags: ['xianxia'], cover: '#eeeeee', emoji: 'fas fa-leaf',
          progress: 0.8, totalPages: 150, pages: ['第一章...'], isGenerated: false, serial: true
        },
        {
          id: 'demo_3', title: '无限流之末日求生', tags: ['infinite'], cover: '#e9ecef', emoji: 'fas fa-ghost',
          progress: 0.4, totalPages: 80, pages: ['第一章...'], isGenerated: false, serial: true
        },
        {
          id: 'demo_4', title: '星际第一指挥官', tags: ['scifi'], cover: '#f5f5f5', emoji: 'fas fa-rocket',
          progress: 0.9, totalPages: 200, pages: ['第一章...'], isGenerated: false, serial: true
        },
        {
          id: 'demo_5', title: '穿书后我成了反派师尊', tags: ['transmigration'], cover: '#f0f0f0', emoji: 'fas fa-moon',
          progress: 0.2, totalPages: 50, pages: ['第一章...'], isGenerated: false, serial: true
        }
      ];
    }
    var saved = localStorage.getItem('novel_state_v3') || localStorage.getItem('novel_state_v2');
    if (saved) {
      try {
        var s = JSON.parse(saved);
        state.companion = s.companion || null;
        state.favorites = new Set(Array.isArray(s.favorites) ? s.favorites : []);
        if (Array.isArray(s.userBooks)) {
          state.books = s.userBooks;
          state.books.forEach(function(b) {
            if (COVER_PALETTES.indexOf(b.cover) === -1) b.cover = randomCover();
          });
        }
        if (Array.isArray(s.myNovels)) {
          state.myNovels = s.myNovels;
          state.myNovels.forEach(function(b) {
            if (COVER_PALETTES.indexOf(b.cover) === -1) b.cover = randomCover();
          });
        }
        state.writingBookId = s.writingBookId || null;
        state.authorViews = s.authorViews || {};
      } catch(e) {}
    }
    if (!(state.favorites instanceof Set)) state.favorites = new Set();
    render();
    bindEvents();
    startAwayTracker();
    checkPendingReactions();
  }

  // ─── RENDER ─────────────────────────────────────────────────
  function render() {
    var app = document.getElementById('novelApp');
    if (!app) return;
    app.innerHTML = buildShell();
    afterRender();
  }

  function buildShell() {
    return (
      '<div class="novel-view active" id="novel-view-main">' +
        buildHeader() +
        '<div id="novel-tab-forum" class="novel-tab-content">' + buildForumHtml() + '</div>' +
        '<div id="novel-tab-shelf" class="novel-tab-content" style="display:none">' + buildShelfHtml() + '</div>' +
        '<div id="novel-tab-community" class="novel-tab-content" style="display:none">' + buildCommunityHtml() + '</div>' +
        '<div id="novel-tab-profile" class="novel-tab-content" style="display:none">' + buildProfileHtml() + '</div>' +
        buildBottomTabs() +
      '</div>' +
      buildFullReader() +
      buildDialogs()
    );
  }

  function buildHeader() {
    return (
      '<div class="novel-header">' +
        '<button class="novel-header-icon" id="novel-back-btn"><i class="fas fa-chevron-left"></i></button>' +
        '<span class="novel-header-title">NOVELS.</span>' +
        '<div style="display:flex;gap:8px;">' +
          '<button class="novel-header-icon" id="novel-share-btn" title="分享"><i class="fas fa-share-alt"></i></button>' +
          '<button class="novel-header-icon" id="novel-companion-toggle" title="陪读"><i class="fas fa-user-friends"></i></button>' +
        '</div>' +
      '</div>'
    );
  }

  function buildBottomTabs() {
    var tabs = [
      { id: 'forum', icon: 'fas fa-newspaper', label: '论坛' },
      { id: 'shelf', icon: 'fas fa-book', label: '书架' },
      { id: 'community', icon: 'fas fa-globe-asia', label: '社区' },
      { id: 'profile', icon: 'fas fa-user-edit', label: '我的' },
    ];
    return (
      '<div class="novel-bottom-tabs">' +
        tabs.map(function(t) {
          return '<div class="novel-bottom-tab' + (state.activeTab === t.id ? ' active' : '') + '" data-tab="' + t.id + '">' +
            '<i class="' + t.icon + '"></i><span>' + t.label + '</span>' +
          '</div>';
        }).join('') +
      '</div>'
    );
  }

  // ─── FORUM TAB ──────────────────────────────────────────────
  function buildForumHtml() {
    var filtered = getForumBooks();
    var html = buildGenreFilter('forum');

    html += (
      '<div class="novel-forum-topbar">' +
        '<div class="novel-forum-stats">' +
          '<span><i class="fas fa-book-open"></i> ' + state.books.length + ' 部</span>' +
          '<span><i class="fas fa-fire" style="color:#333;"></i> ' + getTotalHeatStr() + ' 热度</span>' +
        '</div>' +
        '<button class="novel-forum-gen-btn" id="novel-forum-gen-btn">' +
          '<i class="fas fa-magic"></i> AI生成' +
        '</button>' +
      '</div>'
    );

    if (state.showGenPanel) {
      html += buildGenPanelHtml();
    }

    if (filtered.length === 0) {
      html += buildForumEmptyHtml();
    } else {
      html += '<div class="novel-book-grid">';
      filtered.forEach(function(b) { html += buildBookCardHtml(b); });
      html += '</div>';
    }
    html += '<div class="novel-spacer"></div>';
    return html;
  }

  function buildForumEmptyHtml() {
    return (
      '<div class="novel-empty-state">' +
        '<div class="novel-empty-big-emoji"><i class="fas fa-scroll"></i></div>' +
        '<div class="novel-empty-title">论坛空空如也</div>' +
        '<div class="novel-empty-desc">点击右上角「AI生成」按钮，创作你的第一本小说吧～</div>' +
        '<div class="novel-empty-actions">' +
          '<button class="novel-empty-action-btn primary" id="novel-empty-gen-btn"><i class="fas fa-magic"></i> 立即生成</button>' +
        '</div>' +
      '</div>'
    );
  }

  function getForumBooks() {
    var books = state.books.filter(function(b) { return !b.isImported; });
    if (state.forumGenre !== 'all') {
      books = books.filter(function(b) { return (b.tags || []).indexOf(state.forumGenre) >= 0; });
    }
    return books.sort(function(a, b) { return getHeatScore(b) - getHeatScore(a); });
  }

  // ─── SHELF TAB ──────────────────────────────────────────────
  function buildShelfHtml() {
    var filtered = getShelfBooks();
    var html = buildGenreFilter('shelf');
    html += (
      '<div class="novel-shelf-header">' +
        '<div class="novel-shelf-section-title"><i class="fas fa-heart"></i> 收藏 & 导入</div>' +
        '<button class="novel-import-mini-btn" id="novel-import-btn"><i class="fas fa-file-import"></i> 导入TXT</button>' +
      '</div>'
    );

    if (filtered.length === 0) {
      html += buildShelfEmptyHtml();
    } else {
      html += '<div class="novel-book-grid">';
      filtered.forEach(function(b) { html += buildBookCardHtml(b); });
      html += '</div>';
    }
    html += '<div class="novel-spacer"></div>';
    return html;
  }

  function getShelfBooks() {
    var books = state.books.filter(function(b) {
      return state.favorites.has(b.id) || b.isImported;
    });
    if (state.shelfGenre !== 'all') {
      books = books.filter(function(b) { return (b.tags || []).indexOf(state.shelfGenre) >= 0; });
    }
    var favs = books.filter(function(b) { return state.favorites.has(b.id); });
    var imports = books.filter(function(b) { return b.isImported && !state.favorites.has(b.id); });
    return favs.concat(imports);
  }

  function buildShelfEmptyHtml() {
    var isFiltered = state.shelfGenre !== 'all';
    return (
      '<div class="novel-empty-state">' +
        '<div class="novel-empty-big-emoji"><i class="fas fa-bookmark"></i></div>' +
        '<div class="novel-empty-title">书架空空如也</div>' +
        '<div class="novel-empty-desc">' + (isFiltered ? '当前分类暂无收藏' : '快去论坛收藏喜欢的小说，或导入本地 TXT 吧～') + '</div>' +
        (!isFiltered ? (
          '<div class="novel-empty-actions">' +
            '<button class="novel-empty-action-btn outline" id="novel-shelf-import-btn"><i class="fas fa-file-import"></i> 导入TXT</button>' +
            '<button class="novel-empty-action-btn primary" id="novel-shelf-forum-btn"><i class="fas fa-newspaper"></i> 去论坛</button>' +
          '</div>'
        ) : '') +
      '</div>'
    );
  }

  // ─── COMMUNITY TAB ────────────────────────────────────────
  function buildCommunityHtml() {
    var cData = state.communityData || { cpList: [], fanarts: [], trends: [] };
    
    // 1. 热搜榜
    var trendsHtml = '';
    if (cData.trends && cData.trends.length > 0) {
        trendsHtml = '<div class="novel-community-section">' +
            '<div class="novel-community-title"><i class="fas fa-fire"></i> 实时热搜榜</div>' +
            '<div class="novel-community-trends">';
        cData.trends.forEach(function(t, i) {
            trendsHtml += '<div class="novel-trend-item">' +
                '<span class="novel-trend-rank ' + (i<3 ? 'top' : '') + '">' + (i+1) + '</span>' +
                '<span class="novel-trend-text">' + escapeHtml(t.text) + '</span>' +
                '<span class="novel-trend-heat">' + t.heat + '</span>' +
            '</div>';
        });
        trendsHtml += '</div></div>';
    } else {
        trendsHtml = '<div class="novel-community-section">' +
            '<div class="novel-community-title"><i class="fas fa-fire" style="color:#ff4757;"></i> 实时热搜榜</div>' +
            '<div style="text-align:center;color:#999;font-size:12px;padding:10px;">暂无热搜，点击右上角刷新看看</div>' +
            '</div>';
    }

    // 2. CP 乱炖区
    var cpHtml = '';
    if (cData.cpList && cData.cpList.length > 0) {
        cpHtml = '<div class="novel-community-section">' +
            '<div class="novel-community-title"><i class="fas fa-heart"></i> CP磕糖区</div>' +
            '<div class="novel-cp-list">';
        cData.cpList.forEach(function(cp) {
            cpHtml += '<div class="novel-cp-card">' +
                '<div class="novel-cp-header">' +
                    '<div class="novel-cp-names">' + escapeHtml(cp.name1) + ' <i class="fas fa-times" style="font-size:10px;margin:0 4px;"></i> ' + escapeHtml(cp.name2) + '</div>' +
                    '<div class="novel-cp-tag">' + escapeHtml(cp.tag) + '</div>' +
                '</div>' +
                '<div class="novel-cp-desc">"' + escapeHtml(cp.desc) + '"</div>' +
            '</div>';
        });
        cpHtml += '</div></div>';
    }

    // 3. 同人图/文掉落
    var fanartHtml = '';
    if (cData.fanarts && cData.fanarts.length > 0) {
        fanartHtml = '<div class="novel-community-section">' +
            '<div class="novel-community-title"><i class="fas fa-palette"></i> 同人掉落</div>' +
            '<div class="novel-fanart-list">';
        cData.fanarts.forEach(function(fa) {
            fanartHtml += '<div class="novel-fanart-card">' +
                '<div class="novel-fanart-author"><i class="fas fa-user-circle"></i> ' + escapeHtml(fa.author) + '</div>' +
                '<div class="novel-fanart-text">' + escapeHtml(fa.text).replace(/\n/g, '<br>') + '</div>' +
                (fa.img ? '<img src="' + fa.img + '" class="novel-fanart-img">' : '') +
            '</div>';
        });
        fanartHtml += '</div></div>';
    }

    return (
      '<div class="novel-lb-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">' +
        '<div class="novel-section-label" style="margin:0; font-size: 1.2em; font-weight: bold; color: var(--n-text1);"><i class="fas fa-globe-asia" style="animation: spin 10s linear infinite;"></i> 泛读社区</div>' +
        '<button class="novel-lb-refresh-btn" id="novel-community-refresh" style="background: linear-gradient(135deg, #333, #000); color: white; border: none; padding: 6px 12px; border-radius: 20px; font-weight: bold; box-shadow: 0 4px 15px rgba(0,0,0,0.2); transition: all 0.3s ease; display: flex; align-items: center; gap: 5px;"><i class="fas fa-sync-alt"></i> 刷新动态</button>' +
      '</div>' +
      trendsHtml +
      cpHtml +
      fanartHtml +
      '<div class="novel-spacer"></div>'
    );
  }
  
  function getAllBooksForRanking() {
    var all = state.books.slice();
    state.myNovels.forEach(function(b) {
      if (!all.find(function(x) { return x.id === b.id; })) all.push(b);
    });
    return all;
  }

  // ─── PROFILE TAB ────────────────────────────────────────────
  function buildProfileHtml() {
    var userName = getUserName();
    var userAvatar = getUserAvatar();
    var allMyWorks = getMyWorks();
    var totalHeatNum = 0;
    getAllBooksForRanking().forEach(function(b) { totalHeatNum += getHeatScore(b); });
    var fans = Math.floor(totalHeatNum / 47);
    var heatStr = totalHeatNum > 1000 ? Math.floor(totalHeatNum / 1000) + 'k' : String(totalHeatNum);

    var avatarHtml = userAvatar
      ? '<img src="' + userAvatar + '" class="novel-profile-avatar">'
      : '<div class="novel-profile-avatar" style="background:var(--n-surface2);display:flex;align-items:center;justify-content:center;font-size:32px;color:var(--n-text3);"><i class="fas fa-user"></i></div>';

    var myWorksHtml = '';
    if (allMyWorks.length > 0) {
      myWorksHtml = (
        '<div class="novel-section-label" style="margin-top:24px;">我的作品</div>' +
        '<div class="novel-book-grid">' + allMyWorks.map(buildBookCardHtml).join('') + '</div>'
      );
    } else {
      myWorksHtml = (
        '<div class="novel-empty-state" style="padding:30px 0;">' +
          '<div class="novel-empty-desc">还没有作品，快去论坛生成或在工坊写文吧～</div>' +
        '</div>'
      );
    }

    return (
      '<div class="novel-profile-card">' +
        '<div class="novel-profile-top">' +
          avatarHtml +
          '<div class="novel-profile-info">' +
            '<div class="novel-profile-name">' + escapeHtml(userName) + '</div>' +
            '<div class="novel-profile-badge"><i class="fas fa-pen-nib"></i> 签约作者</div>' +
          '</div>' +
        '</div>' +
        '<div class="novel-profile-stats">' +
          '<div class="novel-profile-stat">' +
            '<div class="novel-profile-stat-val">' + allMyWorks.length + '</div>' +
            '<div class="novel-profile-stat-label">作品数</div>' +
          '</div>' +
          '<div class="novel-profile-stat-divider"></div>' +
          '<div class="novel-profile-stat">' +
            '<div class="novel-profile-stat-val">' + fans.toLocaleString() + '</div>' +
            '<div class="novel-profile-stat-label">粉丝数</div>' +
          '</div>' +
          '<div class="novel-profile-stat-divider"></div>' +
          '<div class="novel-profile-stat">' +
            '<div class="novel-profile-stat-val">' + heatStr + '</div>' +
            '<div class="novel-profile-stat-label">总热度</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="novel-section-label" style="margin-top:24px;"><i class="fas fa-feather"></i> 作者工坊</div>' +
      buildFanEventHtml() +
      buildBrawlHtml() +
      '<div class="novel-gen-card" id="novel-normal-write-card" style="' + (state.brawlMode ? 'display:none;' : '') + '">' +
        '<div class="novel-gen-card-title"><i class="fas fa-pen-nib"></i> 剧情大纲扩写</div>' +
        '<div class="novel-gen-card-desc">输入本章大纲，AI 帮你扩写成文笔优美的完整章节，发布后虚拟读者会来催更～</div>' +
        '<div style="display:flex; justify-content:flex-end; margin-bottom:8px;"><button class="novel-fanfic-btn outline" id="novel-brawl-start-btn" style="padding:6px 12px; font-size:11px; flex:none;"><i class="fas fa-gamepad"></i> 键盘大乱斗</button></div>' +
        '<textarea class="novel-write-textarea" id="novel-write-prompt" placeholder="例如：这章写我们在游乐园被困在摩天轮里，气氛很暧昧……"></textarea>' +
        '<div class="novel-write-actions" style="margin-top:12px;">' +
          '<button class="novel-gen-btn" id="novel-write-expand-btn" style="margin:0;flex:1"><i class="fas fa-magic"></i> AI扩写</button>' +
        '</div>' +
      '</div>' +
      '<div class="novel-write-preview" id="novel-write-preview" style="display:none">' +
        '<div class="novel-gen-card-title">预览</div>' +
        '<div class="novel-write-preview-content" id="novel-write-preview-content"></div>' +
        '<div class="novel-write-preview-actions">' +
          '<button class="novel-fanfic-btn primary" id="novel-write-publish-btn"><i class="fas fa-paper-plane"></i> 发布章节</button>' +
          '<button class="novel-fanfic-btn outline" id="novel-write-regen-btn"><i class="fas fa-sync-alt"></i> 重新生成</button>' +
        '</div>' +
      '</div>' +
      myWorksHtml +
      '<div class="novel-spacer"></div>'
    );
  }

  function getMyWorks() {
    var all = state.myNovels.slice();
    state.books.forEach(function(b) {
      if (b.isGenerated && !all.find(function(x) { return x.id === b.id; })) all.push(b);
    });
    return all;
  }

  // ─── GENRE FILTER ─────────────────────────────────────────────
  // ─── BRAWL HTML ──────────────────────────────────────────────
  function buildBrawlHtml() {
    if (!state.brawlMode) return '';
    var logsHtml = state.brawlLogs.map(function(l) {
      return '<div class="novel-brawl-log-item"><span class="' + (l.type === 'me' ? 'me' : 'ai') + '">[' + (l.type === 'me' ? '我' : 'AI') + ']</span> ' + escapeHtml(l.text) + '</div>';
    }).join('');
    
    return (
      '<div class="novel-brawl-panel">' +
        '<div class="novel-brawl-header">' +
          '<div class="novel-brawl-title"><i class="fas fa-gamepad" style="color:#ff4757;"></i> 键盘大乱斗</div>' +
          '<button class="novel-comment-sheet-close" id="novel-brawl-quit-btn" style="position:static;"><i class="fas fa-times"></i></button>' +
        '</div>' +
        '<div class="novel-gen-card-desc">你和AI正在争夺剧情主导权！每回合你的写作会削减AI血量，AI的捣乱反击会削减你的血量。</div>' +
        '<div class="novel-brawl-status">' +
          '<span class="novel-brawl-status-me">作者 (我) : ' + state.brawlHP.me + ' HP</span>' +
          '<span class="novel-brawl-status-ai">捣乱AI : ' + state.brawlHP.ai + ' HP</span>' +
        '</div>' +
        '<div class="novel-brawl-hp-bar">' +
          '<div class="novel-brawl-hp-mine" style="width:' + state.brawlHP.me + '%"></div>' +
          '<div class="novel-brawl-hp-ai" style="width:' + state.brawlHP.ai + '%"></div>' +
        '</div>' +
        '<div class="novel-brawl-logs" id="novel-brawl-logs">' + logsHtml + '</div>' +
        '<textarea class="novel-write-textarea" id="novel-brawl-prompt" placeholder="轮到你了！赶紧写一段把剧情掰回来！" style="min-height:80px;"></textarea>' +
        '<div class="novel-write-actions" style="margin-top:12px;">' +
          '<button class="novel-gen-btn" id="novel-brawl-attack-btn" style="margin:0;flex:1"><i class="fas fa-fire"></i> 提交反击</button>' +
        '</div>' +
      '</div>'
    );
  }

  // ─── FAN EVENT HTML ─────────────────────────────────────────
  function buildFanEventHtml() {
    if (!state.fanEvents || state.fanEvents.length === 0) return '';
    var e = state.fanEvents[0];
    return (
      '<div class="novel-fan-event-card">' +
        '<div class="novel-fan-header"><i class="fas fa-bullhorn"></i> 书友圈突发事件！</div>' +
        '<div class="novel-fan-content">' + escapeHtml(e.text) + '</div>' +
        '<div class="novel-fan-actions">' +
          '<button class="novel-fanfic-btn primary" id="novel-fan-resolve-btn" data-eventid="' + e.id + '"><i class="fas fa-keyboard"></i> 发布声明安抚</button>' +
        '</div>' +
      '</div>'
    );
  }

  function buildGenreFilter(tabType) {
    var active = tabType === 'forum' ? state.forumGenre : state.shelfGenre;
    var html = '<div class="novel-genre-filter">';
    GENRES.forEach(function(g) {
      html += '<div class="novel-genre-pill' + (active === g.id ? ' active' : '') + '" data-genre="' + g.id + '" data-gtab="' + tabType + '"><i class="' + g.emoji + '"></i> ' + g.label + '</div>';
    });
    html += '</div>';
    return html;
  }

  // ─── BOOK CARD ───────────────────────────────────────────────
  function buildBookCardHtml(book) {
    var tags = (book.tags || []).map(function(t) { return '<span class="novel-tag">#' + t + '</span>'; }).join('');
    var pct = Math.round((book.progress || 0) * 100);
    var isFav = state.favorites.has(book.id);
    var heat = getHeatScore(book);
    var heatStr = heat > 1000 ? (heat / 1000).toFixed(1) + 'k' : String(heat);
    return (
      '<div class="novel-book-card" data-bookid="' + book.id + '">' +
        '<div class="novel-book-cover" style="background:' + (book.cover || '#f8f9fa') + '">' +
          '<div class="novel-book-cover-pattern"></div>' +
          '<span class="novel-book-emoji"><i class="' + (book.emoji || 'fas fa-book') + '"></i></span>' +
          '<button class="novel-fav-btn' + (isFav ? ' active' : '') + '" data-favid="' + book.id + '">' +
            (isFav ? '<i class="fas fa-heart" style="color:#000;"></i>' : '<i class="far fa-heart"></i>') +
          '</button>' +
          (book.serial || book.isGenerated || book.isMyNovel ? '<div class="novel-serial-badge">连载</div>' : '') +
          (book.isImported ? '<div class="novel-serial-badge" style="left:auto;right:12px;background:#111;color:#fff;">TXT</div>' : '') +
        '</div>' +
        '<div class="novel-book-info">' +
          '<div class="novel-book-title">' + escapeHtml(book.title) + '</div>' +
          '<div class="novel-book-tags">' + tags + '</div>' +
          '<div class="novel-book-progress">' +
            '<span><i class="fas fa-fire" style="color:#333;font-size:10px;"></i> ' + heatStr + '</span>' +
            '<span class="novel-dot-sep"></span>' +
            '<span>' + (book.totalPages || book.pages?.length || 1) + '章</span>' +
          '</div>' +
          '<div class="novel-progress-bar"><div class="novel-progress-fill" style="width:' + pct + '%"></div></div>' +
        '</div>' +
      '</div>'
    );
  }

  // ─── GEN PANEL ───────────────────────────────────────────────
  function buildGenPanelHtml() {
    var personas = getPersonas();
    var genreLabel = (GENRES.find(function(g) { return g.id === state.generationGenre; }) || { label: '言情' }).label;
    var tropeDisplay = state.currentTropes.length > 0
      ? state.currentTropes.map(function(t) { return '<span class="novel-trope-tag">' + t + '</span>'; }).join('')
      : '<span style="color:#aaa;font-size:12px;">尚未选择，点击随机摇梗</span>';

    var charaListHtml = personas.length === 0
      ? '<div style="padding:12px;text-align:center;color:var(--n-text3);font-size:12px;">请先在微信中添加好友～</div>'
      : personas.map(function(p) {
          var isSel = state.selectedCharas.indexOf(p.id) >= 0;
          return (
            '<div class="novel-chara-item' + (isSel ? ' selected' : '') + '" data-charaid="' + p.id + '">' +
              (p.avatar ? '<img src="' + p.avatar + '" class="novel-chara-avatar">' : '<div class="novel-chara-avatar" style="background:#eee;display:flex;align-items:center;justify-content:center;font-size:14px;"><i class="fas fa-user"></i></div>') +
              '<div class="novel-chara-name">' + p.name + '</div>' +
              '<div class="novel-chara-check' + (isSel ? ' active' : '') + '"><i class="fas fa-check"></i></div>' +
            '</div>'
          );
        }).join('');

    var genreSelHtml = GENRES.filter(function(g) { return g.id !== 'all'; }).map(function(g) {
      return '<div class="novel-genre-pill sm' + (state.generationGenre === g.id ? ' active' : '') + '" data-genreselect="' + g.id + '"><i class="' + g.emoji + '"></i> ' + g.label + '</div>';
    }).join('');

    var chapterCounts = [1, 2, 3, 5];
    var chapterSelHtml = chapterCounts.map(function(n) {
      return '<div class="novel-chapter-count-btn' + (state.chaptersToGenerate === n ? ' active' : '') + '" data-chapters="' + n + '">' + n + '章</div>';
    }).join('');

    var genBtnLabel = state.isGenerating
      ? ('<i class="fas fa-spinner fa-spin"></i> ' + (state.genProgress || '生成中...'))
      : ('<i class="fas fa-magic"></i> 一键生成 ' + state.chaptersToGenerate + ' 章小说');

    return (
      '<div class="novel-gen-panel" id="novel-gen-panel">' +
        '<div class="novel-gen-panel-header">' +
          '<span><i class="fas fa-magic"></i> AI生成小说</span>' +
          '<button class="novel-gen-panel-close" id="novel-gen-panel-close"><i class="fas fa-times"></i></button>' +
        '</div>' +
        '<div class="novel-gen-panel-body">' +
          '<div class="novel-gen-card-title" style="margin-bottom:8px;"><i class="far fa-id-card"></i> 选择角色（可多选）</div>' +
          '<div class="novel-chara-list" id="novel-chara-list" style="max-height:150px;">' + charaListHtml + '</div>' +
          '<div class="novel-gen-card-title" style="margin:16px 0 8px;"><i class="fas fa-tag"></i> 题材 <span style="font-weight:500;color:var(--n-text3);font-size:12px;margin-left:auto;">' + genreLabel + '</span></div>' +
          '<div class="novel-genre-filter" style="margin-bottom:0;">' + genreSelHtml + '</div>' +
          '<div class="novel-gen-card-title" style="margin:16px 0 8px;"><i class="fas fa-dice"></i> 灵感碎片</div>' +
          '<div class="novel-trope-display" id="novel-trope-display" style="min-height:40px;">' + tropeDisplay + '</div>' +
          '<div class="novel-trope-actions">' +
            '<button class="novel-trope-gacha-btn" id="novel-gacha-btn"><i class="fas fa-random"></i> 🎲 随机摇梗</button>' +
            '<button class="novel-trope-clear-btn" id="novel-trope-clear">清空</button>' +
          '</div>' +
          '<input type="text" class="novel-trope-input" id="novel-trope-input" placeholder="手动输入设定（回车添加）">' +
          '<div class="novel-gen-card-title" style="margin:16px 0 8px;"><i class="fas fa-layer-group"></i> 生成篇数</div>' +
          '<div class="novel-chapter-count-row">' + chapterSelHtml + '</div>' +
          '<button class="novel-gen-btn" id="novel-generate-btn" style="margin-top:16px;">' + genBtnLabel + '</button>' +
        '</div>' +
      '</div>'
    );
  }
  // ─── FULL READER ─────────────────────────────────────────────
  function buildFullReader() {
    return (
      '<div class="novel-fullreader" id="novel-fullreader">' +
        '<div class="novel-fullreader-header">' +
          '<button class="novel-page-btn" id="novel-fr-close"><i class="fas fa-chevron-down"></i></button>' +
          '<span class="novel-fullreader-title" id="novel-fr-title"></span>' +
          '<div class="novel-tools-bar">' +
            '<button class="novel-header-icon" id="novel-fr-bgm-btn" title="情境BGM"><i class="fas fa-music"></i></button>' +
            '<button class="novel-header-icon" id="novel-fr-tts-btn" title="听书模式"><i class="fas fa-headphones"></i></button>' +
            '<button class="novel-header-icon" id="novel-fr-highlight-btn" title="划线"><i class="fas fa-pen"></i></button>' +
            '<button class="novel-header-icon" id="novel-fr-share-btn" title="分享"><i class="fas fa-paper-plane"></i></button>' +
          '</div>' +
        '</div>' +
        '<div style="padding:0 24px;position:absolute;top:76px;left:0;right:0;z-index:9;pointer-events:none;">' +
          '<div class="novel-companion-bar" id="novel-fr-companion-bar" style="display:none;pointer-events:auto;width:fit-content;margin:0 auto;">' +
            '<div class="novel-companion-dot"></div><span id="novel-fr-companion-name">TA陪读中</span>' +
          '</div>' +
        '</div>' +
        '<div id="novel-fullreader-body"><div class="novel-fullreader-page" id="novel-fr-page"></div></div>' +
        '<div class="novel-fullreader-footer">' +
          '<button class="novel-page-btn" id="novel-fr-prev"><i class="fas fa-chevron-left"></i></button>' +
          '<span class="novel-page-info" id="novel-fr-info"></span>' +
          '<button class="novel-page-btn" id="novel-fr-next"><i class="fas fa-chevron-right"></i></button>' +
          '<button class="novel-continue-btn" id="novel-fr-continue" style="display:none">续写下一章 <i class="fas fa-magic"></i></button>' +
        '</div>' +
      '</div>' +
      // ... 保持下方原本的 comment-sheet 等代码不变 ...
      '<div class="novel-comment-sheet" id="novel-comment-sheet">' +
        '<div class="novel-comment-sheet-header">' +
          '<div class="novel-comment-sheet-drag"></div>' +
          '<span class="novel-comment-sheet-title"><i class="far fa-comments"></i> 读者评论</span>' +
          '<button class="novel-comment-sheet-close" id="novel-comment-close"><i class="fas fa-times"></i></button>' +
        '</div>' +
        '<div class="novel-comment-sheet-loading" id="novel-comment-loading" style="display:none">AI评论生成中...</div>' +
        '<div class="novel-comment-sheet-body" id="novel-comment-body"></div>' +
      '</div>' +
      '<div class="novel-comment-overlay" id="novel-comment-overlay"></div>' +
      '<div class="novel-antiaddict-overlay" id="novel-antiaddict-overlay" style="display:none">' +
        '<div class="novel-antiaddict-inner">' +
          '<div class="novel-antiaddict-avatar" id="novel-antiaddict-avatar"><i class="fas fa-clock"></i></div>' +
          '<div class="novel-antiaddict-msg" id="novel-antiaddict-msg">已经深夜了！立刻给我去睡觉！</div>' +
          '<button class="novel-antiaddict-btn" id="novel-antiaddict-ok">好的，去睡觉</button>' +
          '<button class="novel-antiaddict-snooze" id="novel-antiaddict-snooze">再看10分钟</button>' +
        '</div>' +
      '</div>'
    );
  }

  // ─── DIALOGS ─────────────────────────────────────────────────
  function buildDialogs() {
    return (
      '<div class="novel-share-dialog" id="novel-share-dialog" style="display:none">' +
        '<div class="novel-share-dialog-inner">' +
          '<div class="novel-gen-card-title" style="margin-bottom:12px"><i class="fas fa-share"></i> 分享给谁看？</div>' +
          '<div id="novel-share-chara-list" class="novel-chara-list"></div>' +
          '<div style="display:flex;gap:8px;margin-top:12px">' +
            '<button class="novel-fanfic-btn outline" id="novel-share-cancel">取消</button>' +
            '<button class="novel-fanfic-btn primary" id="novel-share-confirm">分享</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="novel-share-overlay" id="novel-share-overlay" style="display:none"></div>' +
      '<div id="novel-import-dialog" class="novel-import-dialog" style="display:none">' +
        '<div class="novel-import-dialog-inner">' +
          '<div class="novel-gen-card-title"><i class="fas fa-file-import"></i> 导入TXT小说</div>' +
          '<input type="text" id="novel-import-title" class="novel-trope-input" style="margin:8px 0" placeholder="书名">' +
          '<textarea id="novel-import-content" class="novel-write-textarea" placeholder="粘贴小说内容或上传文件..." style="height:120px"></textarea>' +
          '<input type="file" id="novel-import-file" accept=".txt" style="display:none">' +
          '<div class="novel-write-actions" style="flex-wrap:wrap;gap:8px;margin-top:8px">' +
            '<button class="novel-fanfic-btn outline" onclick="document.getElementById(\'novel-import-file\').click()"><i class="fas fa-folder-open"></i> 上传文件</button>' +
            '<button class="novel-fanfic-btn outline" id="novel-import-cancel">取消</button>' +
            '<button class="novel-fanfic-btn primary" id="novel-import-confirm">导入</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div id="novel-import-overlay" class="novel-share-overlay" style="display:none"></div>' +
      '<div id="novel-companion-dialog" class="novel-share-dialog" style="display:none">' +
        '<div class="novel-share-dialog-inner">' +
          '<div class="novel-gen-card-title" style="margin-bottom:12px"><i class="fas fa-user-friends"></i> 选择陪读角色</div>' +
          '<div id="novel-companion-list" class="novel-chara-list"></div>' +
          '<button class="novel-fanfic-btn outline" id="novel-companion-cancel" style="width:100%;margin-top:12px">关闭</button>' +
        '</div>' +
      '</div>' +
      '<div id="novel-companion-overlay" class="novel-share-overlay" style="display:none"></div>'
    );
  }

  // ─── AFTER RENDER & EVENTS ───────────────────────────────────
  function afterRender() { bindEvents(); }

  function bindEvents() {
    var app = document.getElementById('novelApp');
    if (!app) return;

    // Back
    var backBtn = document.getElementById('novel-back-btn');
    if (backBtn) backBtn.onclick = function() { app.classList.remove('open'); };

    // Share header
    var shareBtn = document.getElementById('novel-share-btn');
    if (shareBtn) shareBtn.onclick = function() {
      if (state.activeBook) shareToWeChat(state.activeBook);
      else showNovelToast('请先打开一本书再分享～');
    };

    // Companion
    var companionBtn = document.getElementById('novel-companion-toggle');
    if (companionBtn) companionBtn.onclick = showCompanionDialog;

    // Tab switching
    app.querySelectorAll('.novel-bottom-tab').forEach(function(btn) {
      btn.onclick = function() {
        app.querySelectorAll('.novel-bottom-tab').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var tab = btn.dataset.tab;
        state.activeTab = tab;
        ['forum', 'shelf', 'community', 'profile'].forEach(function(t) {
          var el = document.getElementById('novel-tab-' + t);
          if (el) el.style.display = t === tab ? 'block' : 'none';
        });
        if (tab === 'community') refreshCommunity();
        if (tab === 'profile') refreshProfile();
        if (tab === 'shelf') refreshShelf();
      };
    });

    // Delegated clicks
    app.addEventListener('click', function(e) {
      // Genre pill (forum / shelf filter)
      var pill = e.target.closest('.novel-genre-pill[data-gtab]');
      if (pill) {
        var genre = pill.dataset.genre;
        var gtab = pill.dataset.gtab;
        if (gtab === 'forum') { state.forumGenre = genre; refreshForum(); }
        else if (gtab === 'shelf') { state.shelfGenre = genre; refreshShelf(); }
        return;
      }

      // Genre pill in gen panel
      var gsp = e.target.closest('[data-genreselect]');
      if (gsp) {
        state.generationGenre = gsp.dataset.genreselect;
        app.querySelectorAll('[data-genreselect]').forEach(function(p) { p.classList.remove('active'); });
        gsp.classList.add('active');
        var genBtn2 = document.getElementById('novel-generate-btn');
        if (genBtn2 && !state.isGenerating) {
          genBtn2.innerHTML = '<i class="fas fa-magic"></i> 一键生成 ' + state.chaptersToGenerate + ' 章小说';
        }
        return;
      }

      // Chapter count
      var chBtn = e.target.closest('.novel-chapter-count-btn');
      if (chBtn) {
        state.chaptersToGenerate = parseInt(chBtn.dataset.chapters) || 1;
        app.querySelectorAll('.novel-chapter-count-btn').forEach(function(b) { b.classList.remove('active'); });
        chBtn.classList.add('active');
        var genBtn3 = document.getElementById('novel-generate-btn');
        if (genBtn3 && !state.isGenerating) genBtn3.innerHTML = '<i class="fas fa-magic"></i> 一键生成 ' + state.chaptersToGenerate + ' 章小说';
        return;
      }

      // Favorite btn
      var favBtn = e.target.closest('.novel-fav-btn');
      if (favBtn) {
        e.stopPropagation();
        var favId = favBtn.dataset.favid;
        if (state.favorites.has(favId)) state.favorites.delete(favId);
        else state.favorites.add(favId);
        saveState();
        favBtn.classList.toggle('active', state.favorites.has(favId));
        favBtn.innerHTML = state.favorites.has(favId) ? '<i class="fas fa-heart" style="color:#ff4757;"></i>' : '<i class="far fa-heart"></i>';
        return;
      }

      // Book card
      var card = e.target.closest('.novel-book-card');
      if (card && card.dataset.bookid) {
        var bk = findBook(card.dataset.bookid);
        if (bk) openBook(bk);
        return;
      }

      // Leaderboard item
      var lbItem = e.target.closest('.novel-lb-item');
      if (lbItem && lbItem.dataset.bookid) {
        var lbBk = findBook(lbItem.dataset.bookid);
        if (lbBk) openBook(lbBk);
        return;
      }

      // Chara select in gen panel
      var charaItem = e.target.closest('.novel-chara-item[data-charaid]');
      if (charaItem) {
        var cl = document.getElementById('novel-chara-list');
        if (cl && cl.contains(charaItem)) {
          var cid = charaItem.dataset.charaid;
          var idx = state.selectedCharas.indexOf(cid);
          if (idx >= 0) state.selectedCharas.splice(idx, 1);
          else state.selectedCharas.push(cid);
          charaItem.classList.toggle('selected', state.selectedCharas.indexOf(cid) >= 0);
          var chk = charaItem.querySelector('.novel-chara-check');
          if (chk) chk.classList.toggle('active', state.selectedCharas.indexOf(cid) >= 0);
          
          if (state.selectedCharas.indexOf(cid) >= 0) {
              const rect = charaItem.getBoundingClientRect();
              createParticleEffect(rect.left + rect.width / 2, rect.top + rect.height / 2, '✨');
          }
        }
        return;
      }
    });

    // Forum gen btn
    var forumGenBtn = document.getElementById('novel-forum-gen-btn');
    if (forumGenBtn) forumGenBtn.onclick = openGenPanel;
    var emptyGenBtn = document.getElementById('novel-empty-gen-btn');
    if (emptyGenBtn) emptyGenBtn.onclick = openGenPanel;

    // Gen panel controls
    bindGenPanelEvents();

    // Shelf buttons
    var importBtn = document.getElementById('novel-import-btn');
    if (importBtn) importBtn.onclick = showImportDialog;
    var sImport = document.getElementById('novel-shelf-import-btn');
    if (sImport) sImport.onclick = showImportDialog;
    var sForum = document.getElementById('novel-shelf-forum-btn');
    if (sForum) sForum.onclick = function() { switchTab('forum'); };

    // Community
    var commRefresh = document.getElementById('novel-community-refresh');
    if (commRefresh) commRefresh.onclick = generateCommunityContent;

    // Profile write
    bindWriteEvents();

    // Reader
    bindReaderEvents();

    // Dialogs
    bindDialogEvents();
  }

  function bindGenPanelEvents() {
    var gachaBtn = document.getElementById('novel-gacha-btn');
    if (gachaBtn) gachaBtn.onclick = rollTropes;
    var clearBtn = document.getElementById('novel-trope-clear');
    if (clearBtn) clearBtn.onclick = function() { state.currentTropes = []; refreshTropeDisplay(); };
    var tropeInput = document.getElementById('novel-trope-input');
    if (tropeInput) tropeInput.onkeydown = function(e) {
      if (e.key === 'Enter') {
        var v = tropeInput.value.trim();
        if (v) { state.currentTropes.push(v); tropeInput.value = ''; refreshTropeDisplay(); }
      }
    };
    var genBtn = document.getElementById('novel-generate-btn');
    if (genBtn) genBtn.onclick = doGenerateNovel;
    var closePanel = document.getElementById('novel-gen-panel-close');
    if (closePanel) closePanel.onclick = closeGenPanel;
  }

  function bindWriteEvents() {
    var expandBtn = document.getElementById('novel-write-expand-btn');
    if (expandBtn) expandBtn.onclick = doExpandChapter;
    var publishBtn = document.getElementById('novel-write-publish-btn');
    if (publishBtn) publishBtn.onclick = publishWrittenChapter;
    var regenBtn = document.getElementById('novel-write-regen-btn');
    if (regenBtn) regenBtn.onclick = doExpandChapter;
    
    var brawlStart = document.getElementById('novel-brawl-start-btn');
    if (brawlStart) brawlStart.onclick = startBrawlMode;
    var brawlAttack = document.getElementById('novel-brawl-attack-btn');
    if (brawlAttack) brawlAttack.onclick = doBrawlAttack;
    var brawlQuit = document.getElementById('novel-brawl-quit-btn');
    if (brawlQuit) brawlQuit.onclick = quitBrawlMode;
    
    var fanResolve = document.getElementById('novel-fan-resolve-btn');
    if (fanResolve) fanResolve.onclick = resolveFanEvent;
  }

  function bindReaderEvents() {
    var frClose = document.getElementById('novel-fr-close');
    if (frClose) frClose.onclick = closeReader;
    var frPrev = document.getElementById('novel-fr-prev');
    if (frPrev) frPrev.onclick = prevPage;
    var frNext = document.getElementById('novel-fr-next');
    if (frNext) frNext.onclick = nextPage;
    var frContinue = document.getElementById('novel-fr-continue');
    if (frContinue) frContinue.onclick = continueNextChapter;
    var frShare = document.getElementById('novel-fr-share-btn');
    if (frShare) frShare.onclick = function() { if (state.activeBook) shareToWeChat(state.activeBook); };
    var frHL = document.getElementById('novel-fr-highlight-btn');
    if (frHL) frHL.onclick = toggleHighlightMode;
    var commentClose = document.getElementById('novel-comment-close');
    if (commentClose) commentClose.onclick = closeCommentSheet;
    var commentOvl = document.getElementById('novel-comment-overlay');
    if (commentOvl) commentOvl.onclick = closeCommentSheet;
    var antiOk = document.getElementById('novel-antiaddict-ok');
    if (antiOk) antiOk.onclick = function() {
      document.getElementById('novel-antiaddict-overlay').style.display = 'none';
      closeReader();
    };
    var antiSnooze = document.getElementById('novel-antiaddict-snooze');
    if (antiSnooze) antiSnooze.onclick = function() {
      state.antiAddictionSnoozed = true;
      document.getElementById('novel-antiaddict-overlay').style.display = 'none';
      setTimeout(function() { state.antiAddictionSnoozed = false; }, 10 * 60 * 1000);
    };
        var frBgm = document.getElementById('novel-fr-bgm-btn');
    if (frBgm) {
        frBgm.onclick = function() {
            if (!window.novelAudio) window.novelAudio = new Audio();
            if (!window.novelAudio.paused && window.novelAudio.src) {
                window.novelAudio.pause();
                frBgm.classList.remove('novel-audio-active');
                showNovelToast('🎵 BGM 已关闭');
            } else {
                // 根据题材选择白噪音/BGM (示例链接，实际可换成你的音频源)
                let tag = state.activeBook && state.activeBook.tags ? state.activeBook.tags[0] : 'romance';
                let src = tag === 'horror' ? 'https://www.soundjay.com/misc/sounds/wind-howling-1.mp3' : 'https://www.soundjay.com/nature/sounds/rain-01.mp3';
                window.novelAudio.src = src;
                window.novelAudio.loop = true;
                window.novelAudio.play().catch(e=>console.log(e));
                frBgm.classList.add('novel-audio-active');
                showNovelToast('🎵 情境 BGM 已开启');
            }
        };
    }
    var frTts = document.getElementById('novel-fr-tts-btn');
    if (frTts) {
        frTts.onclick = function() {
            if (window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel();
                frTts.classList.remove('novel-audio-active');
                showNovelToast('🔇 听书模式已关闭');
                return;
            }
            var text = document.getElementById('novel-fr-page').innerText;
            if (!text) return;
            var utterance = new SpeechSynthesisUtterance(text.substring(0, 500)); // 演示截取500字
            utterance.lang = 'zh-CN';
            // 简单模拟双播：随机改变音调
            utterance.pitch = Math.random() > 0.5 ? 1.2 : 0.8; 
            window.speechSynthesis.speak(utterance);
            frTts.classList.add('novel-audio-active');
            showNovelToast('🎧 双播听书已开启');
            utterance.onend = () => frTts.classList.remove('novel-audio-active');
        };
    }
    
    // 👇 修改了这里：加了一个 if (frClose) 防报错
    if (frClose) {
        var origClose = frClose.onclick;
        frClose.onclick = function() {
            if (window.novelAudio) window.novelAudio.pause();
            if (window.speechSynthesis) window.speechSynthesis.cancel();
            if (frBgm) frBgm.classList.remove('novel-audio-active');
            if (frTts) frTts.classList.remove('novel-audio-active');
            if (origClose) origClose();
        };
    }

  } // <-- 函数最后的右大括号


  function bindDialogEvents() {
    var importCancel = document.getElementById('novel-import-cancel');
    if (importCancel) importCancel.onclick = hideImportDialog;
    var importOvl = document.getElementById('novel-import-overlay');
    if (importOvl) importOvl.onclick = hideImportDialog;
    var importConfirm = document.getElementById('novel-import-confirm');
    if (importConfirm) importConfirm.onclick = confirmImport;
    var importFile = document.getElementById('novel-import-file');
    if (importFile) importFile.onchange = function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(evt) {
        var ti = document.getElementById('novel-import-title');
        var ci = document.getElementById('novel-import-content');
        if (ti && !ti.value) ti.value = file.name.replace(/\.txt$/i, '');
        if (ci) ci.value = evt.target.result;
      };
      reader.readAsText(file, 'utf-8');
    };
    var shareCancel = document.getElementById('novel-share-cancel');
    if (shareCancel) shareCancel.onclick = function() {
      document.getElementById('novel-share-dialog').style.display = 'none';
      document.getElementById('novel-share-overlay').style.display = 'none';
    };
    var shareOvl = document.getElementById('novel-share-overlay');
    if (shareOvl) shareOvl.onclick = function() {
      document.getElementById('novel-share-dialog').style.display = 'none';
      document.getElementById('novel-share-overlay').style.display = 'none';
    };
    var shareConfirm = document.getElementById('novel-share-confirm');
    if (shareConfirm) shareConfirm.onclick = doShareConfirm;
    var companionCancel = document.getElementById('novel-companion-cancel');
    if (companionCancel) companionCancel.onclick = function() {
      document.getElementById('novel-companion-dialog').style.display = 'none';
      document.getElementById('novel-companion-overlay').style.display = 'none';
    };
    var companionOvl = document.getElementById('novel-companion-overlay');
    if (companionOvl) companionOvl.onclick = function() {
      document.getElementById('novel-companion-dialog').style.display = 'none';
      document.getElementById('novel-companion-overlay').style.display = 'none';
    };
  }

  // ─── EFFECTS ──────────────────────────────────────────────────
  function createParticleEffect(x, y, emoji) {
    var el = document.createElement('div');
    el.textContent = emoji;
    el.style.position = 'fixed';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.fontSize = '24px';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '99999';
    el.style.transition = 'all 0.8s cubic-bezier(0.16,1,0.3,1)';
    el.style.transform = 'translate(-50%, -50%) scale(0.5)';
    el.style.opacity = '1';
    document.body.appendChild(el);
    
    requestAnimationFrame(function() {
      var angle = Math.random() * Math.PI * 2;
      var dist = 50 + Math.random() * 50;
      el.style.transform = 'translate(calc(-50% + ' + (Math.cos(angle)*dist) + 'px), calc(-50% + ' + (Math.sin(angle)*dist - 50) + 'px)) scale(1.5) rotate(' + (Math.random()*60-30) + 'deg)';
      el.style.opacity = '0';
    });
    
    setTimeout(function() { el.remove(); }, 800);
  }

  // ─── TAB HELPERS ─────────────────────────────────────────────
  function switchTab(tabId) {
    var app = document.getElementById('novelApp');
    if (!app) return;
    app.querySelectorAll('.novel-bottom-tab').forEach(function(b) { b.classList.remove('active'); });
    var btn = app.querySelector('.novel-bottom-tab[data-tab="' + tabId + '"]');
    if (btn) btn.classList.add('active');
    state.activeTab = tabId;
    ['forum', 'shelf', 'community', 'profile'].forEach(function(t) {
      var el = document.getElementById('novel-tab-' + t);
      if (el) el.style.display = t === tabId ? 'block' : 'none';
    });
  }

  function refreshForum() {
    var el = document.getElementById('novel-tab-forum');
    if (!el) return;
    el.innerHTML = buildForumHtml();
    var fg = document.getElementById('novel-forum-gen-btn');
    if (fg) fg.onclick = openGenPanel;
    var eg = document.getElementById('novel-empty-gen-btn');
    if (eg) eg.onclick = openGenPanel;
    bindGenPanelEvents();
  }

  function refreshShelf() {
    var el = document.getElementById('novel-tab-shelf');
    if (!el) return;
    el.innerHTML = buildShelfHtml();
    var ib = document.getElementById('novel-import-btn');
    if (ib) ib.onclick = showImportDialog;
    var si = document.getElementById('novel-shelf-import-btn');
    if (si) si.onclick = showImportDialog;
    var sf = document.getElementById('novel-shelf-forum-btn');
    if (sf) sf.onclick = function() { switchTab('forum'); };
  }

  function refreshCommunity() {
    var el = document.getElementById('novel-tab-community');
    if (!el) return;
    el.innerHTML = buildCommunityHtml();
    var cr = document.getElementById('novel-community-refresh');
    if (cr) cr.onclick = generateCommunityContent;
    
    var fanResolve = el.querySelectorAll('.novel-fan-resolve-btn');
    fanResolve.forEach(btn => {
        btn.onclick = resolveFanEvent;
    });
  }

  function refreshProfile() {
    var el = document.getElementById('novel-tab-profile');
    if (!el) return;
    el.innerHTML = buildProfileHtml();
    bindWriteEvents();
  }

  // ─── GEN PANEL ───────────────────────────────────────────────
  function openGenPanel() {
    state.showGenPanel = true;
    refreshForum();
    var panel = document.getElementById('novel-gen-panel');
    if (panel) {
      setTimeout(function() { 
        var scrollContainer = document.getElementById('novel-tab-forum');
        if (scrollContainer) {
          // 精确计算内部元素的滚动位置，替代 scrollIntoView，防止顶出底部隐藏的评论弹窗
          scrollContainer.scrollTo({
            top: panel.offsetTop - scrollContainer.offsetTop,
            behavior: 'smooth'
          });
        }
      }, 100);
    }
  }

  function closeGenPanel() {
    state.showGenPanel = false;
    refreshForum();
  }

  // ─── TROPE GACHA ─────────────────────────────────────────────
  function rollTropes() {
    var btn = document.getElementById('novel-gacha-btn');
    if (btn) { 
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 摇摇摇...'; 
        btn.disabled = true; 
        const rect = btn.getBoundingClientRect();
        createParticleEffect(rect.left + rect.width / 2, rect.top + rect.height / 2, '🎲');
    }
    setTimeout(function() {
      var cats = Object.keys(TROPE_POOL).sort(function() { return Math.random() - 0.5; });
      var count = Math.floor(Math.random() * 2) + 2;
      var selected = [];
      for (var i = 0; i < Math.min(count, cats.length); i++) {
        var pool = TROPE_POOL[cats[i]];
        selected.push(pool[Math.floor(Math.random() * pool.length)]);
      }
      state.currentTropes = selected;
      refreshTropeDisplay();
      if (btn) { btn.innerHTML = '<i class="fas fa-random"></i> 🎲 随机摇梗'; btn.disabled = false; }
    }, 700);
  }

  function refreshTropeDisplay() {
    var d = document.getElementById('novel-trope-display');
    if (!d) return;
    d.innerHTML = state.currentTropes.length > 0
      ? state.currentTropes.map(function(t) { return '<span class="novel-trope-tag">' + t + '</span>'; }).join('')
      : '<span style="color:#aaa;font-size:12px;">尚未选择，点击随机摇梗</span>';
  }
  // ─── 酒馆式 PROMPT 构建器 ────────────────────────────────────
  function buildTavernPrompt(title, genre, tropeStr, charaPersonas, userPersona, worldContent, context, isFirstChapter, userChoice = '') {
    let prompt = `[System Note: 你是一位顶尖的驻站网文大神和互动小说家。请以沉浸式、Show-don't-tell（展现而非陈述）的细腻文风创作小说。严禁使用生硬的AI套话。]

[Novel Metadata]
Title: 《${title}》
Genre: ${genre}
Tropes/Tags: ${tropeStr}

[World/Lore]
${worldContent || '现代日常背景'}

[Protagonist (User)]
${userPersona || '代入感极强的普通主角视角'}

[Main Characters (NPCs)]
${charaPersonas || '未指定'}

[Style Guidance]
1. 深度贴合NPC人设（口癖、性格、行为逻辑），严禁OOC。
2. 侧重感官描写（视觉、听觉、嗅觉）和微妙的心理活动。
3. 文本必须包含丰富的对话和动作细节。

[Task]
`;
    if (isFirstChapter) {
        prompt += `请撰写本作的【第一章】（800-1200字）。如果书名未定，请在最开头用《书名》格式输出。\n开头请直接进入核心场景，制造张力。`;
    } else {
        prompt += `请根据上文续写【下一章】（800-1200字）。\n【前情提要】\n${context}\n`;
        if (userChoice) {
            prompt += `【主角(User)的决定】：主角选择了——“${userChoice}”。请务必让后续剧情强烈反映这一选择的后果！\n`;
        }
    }

    prompt += `
[Output Format Requirements - STRICT]
1. 必须在合适的高潮/绝美场景处，插入且仅插入一个英文配图提示词，格式严格为：[IMAGE: highly detailed masterpiece, 1girl, 1boy, cinematic lighting, describing the scene...]
2. 章节正文结束后，为了增加互动性，请基于当前局势，为主角提供2-3个走向不同的【命运抉择】，格式如下：
[Option A: 拔出武器反击]
[Option B: 握住他的手，尝试安抚]
`;
    return prompt;
  }

  // ─── GENERATE NOVEL ──────────────────────────────────────────
  async function doGenerateNovel() {
    if (state.isGenerating) return;
    if (!localStorage.getItem(SETTINGS_KEY)) { showNovelToast('请先在设置中配置 API Key'); return; }

    state.isGenerating = true;
    var btn = document.getElementById('novel-generate-btn');
    if (btn) { btn.disabled = true; }

    var charaPersonas = state.selectedCharas.map(function(id) {
      var f = (typeof friendsData !== 'undefined') ? friendsData[id] : null;
      if (!f) return '';
      return 'Name: ' + (f.remark || f.realName || id) + '\nPersona: ' + (f.persona || '未设置');
    }).filter(Boolean).join('\n---\n');

    var userPersona = getUserPersona();
    var worldContent = getWorldbookContent(state.selectedCharas);
    var tropeStr = state.currentTropes.length > 0 ? state.currentTropes.join(', ') : '自由发挥';
    var genre = (GENRES.find(function(g) { return g.id === state.generationGenre; }) || { label: '言情' }).label;
    
    var setProgress = function(msg) {
      state.genProgress = msg;
      if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + msg;
    };

    setProgress('推演世界线与人设...');

    var prompt1 = buildTavernPrompt("未定名", genre, tropeStr, charaPersonas, userPersona, worldContent, "", true);
    var result1 = await callAPI(prompt1, 2000);

    if (!result1) {
      state.isGenerating = false;
      state.genProgress = '';
      if (btn) { btn.innerHTML = '<i class="fas fa-magic"></i> 一键生成小说'; btn.disabled = false; }
      showNovelToast('生成失败，请检查 API 配置');
      return;
    }

    var titleMatch = result1.match(/《(.+?)》/);
    var title = titleMatch ? titleMatch[1] : ('时空异卷_' + Date.now().toString().slice(-4));
    var content1 = result1.replace(/《.+?》/, '').trim();

    var newBook = {
      id: 'gen_' + Date.now(),
      title: title,
      tags: [state.generationGenre],
      cover: randomCover(),
      emoji: randomEmoji(),
      progress: 0,
      totalPages: 1,
      pages: [content1],
      isGenerated: true,
      serial: true,
      charas: state.selectedCharas.slice(),
      tropes: state.currentTropes.slice(),
      meta: { genre: genre, tropeStr: tropeStr, charaPersonas: charaPersonas, userPersona: userPersona, worldContent: worldContent }
    };
    state.books.push(newBook);
    saveState();

    state.isGenerating = false;
    state.genProgress = '';
    if (btn) { btn.innerHTML = '<i class="fas fa-magic"></i> 一键生成小说'; btn.disabled = false; }
    showNovelToast('✅「' + title + '」序章生成成功！');
    closeGenPanel();
    openBook(newBook);
  }


  // ─── COMMUNITY AI ──────────────────────────────────────────
  async function generateCommunityContent() {
      if (!localStorage.getItem(SETTINGS_KEY)) { showNovelToast('请先配置 API'); return; }
      var btn = document.getElementById('novel-community-refresh');
      if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 刷新中...'; btn.disabled = true; }

      var allBooks = getAllBooksForRanking();
      var contextStr = '';
      
      if (allBooks.length > 0) {
          var b = allBooks[Math.floor(Math.random() * allBooks.length)];
          contextStr = `当前热门小说《${b.title}》题材：${b.tags?b.tags[0]:'未知'}。`;
          if (b.charas && b.charas.length > 0) {
             contextStr += `主要角色包括：${b.charas.map(getName).join('、')}。`;
          }
          if (b.pages && b.pages.length > 0) {
              contextStr += `近期剧情片段：“${b.pages[b.pages.length-1].slice(0, 50)}...”`;
          }
      }

      var prompt = `你正在模拟一个活跃多元的小说泛读社区。
请根据以下上下文（如果没有则自由发挥）：${contextStr}
我的昵称是：${getUserName()}

请生成社区的最新动态，包含热搜、CP乱炖、同人创作以及书评吐槽，返回严格的JSON格式（不要加\`\`\`json等多余字符），结构如下：
{
  "trends": [
    {"text": "热搜词条1(例如：#某某作者填坑了#、#震惊！男主居然是反派#)", "heat": "热度值(如 10.5w)"},
    // 生成4-5条热搜
  ],
  "cpList": [
    {"name1": "角色A/作者/读者", "name2": "角色B/作者/读者", "tag": "互动标签(如：相爱相杀、互怼日常)", "desc": "社区用户的一句脑洞大开的互动描述或磕糖语录"},
    // 生成2-3条CP或人物互动
  ],
  "fanarts": [
    {"author": "社区大触/戏精读者", "text": "一段极具感染力、甚至带点沙雕或深情的长评、同人段子、避雷指南(约80字)", "imgPrompt": "一段详细的英文画图提示词，用于生成配图(必须提供)"}
    // 生成2-3条同人或书评内容
  ]
}`;

      try {
          var result = await callAPI(prompt, 600);
          if (!result) throw new Error('API return null');
          
          var parsed = JSON.parse(result.replace(/```json/g, '').replace(/```/g, '').trim());
          
          // 转换 imgPrompt 为图片 URL
          if (parsed.fanarts) {
              parsed.fanarts.forEach(fa => {
                  if (fa.imgPrompt && fa.imgPrompt.trim()) {
                      fa.img = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(fa.imgPrompt + ', anime style, high quality') + '?width=400&height=300&nologo=true';
                  } else if (Math.random() > 0.5) {
                      fa.img = 'https://image.pollinations.ai/prompt/' + encodeURIComponent('anime couple hugging, beautiful lighting') + '?width=400&height=300&nologo=true';
                  }
              });
          }
          
          state.communityData = parsed;
          saveState();
      } catch (e) {
          console.error('Community Gen Error:', e);
          showNovelToast('社区刷新失败，由于网络或API原因');
      }

      if (btn) { btn.innerHTML = '<i class="fas fa-sync-alt"></i> 刷新社区'; btn.disabled = false; }
      refreshCommunity();
  }

  // ─── WRITE / EXPAND ──────────────────────────────────────────
  async function doExpandChapter() {
    var promptEl = document.getElementById('novel-write-prompt');
    if (!promptEl || !promptEl.value.trim()) { showNovelToast('请先输入本章大纲'); return; }
    if (!localStorage.getItem(SETTINGS_KEY)) { showNovelToast('请先配置 API'); return; }

    var btn = document.getElementById('novel-write-expand-btn');
    if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 扩写中...'; btn.disabled = true; }

    var outline = promptEl.value.trim();
    var previousChapters = '';
    if (state.writingBookId) {
      var wBook = state.myNovels.find(function(b) { return b.id === state.writingBookId; });
      if (wBook && wBook.pages && wBook.pages.length > 0) {
        previousChapters = '\n\n【前情提要】\n' + wBook.pages.slice(-1)[0].slice(0, 200) + '...';
      }
    }

    var prompt = '你是优秀的网络小说作者，帮用户把大纲扩写成完整章节（600-900字）。\n\n' +
      '【本章大纲】\n' + outline + '\n' +
      (getUserPersona() ? '\n【用户设定】\n' + getUserPersona() + '\n' : '') +
      previousChapters + '\n\n' +
      '先给出章节标题（## 第X章 标题），然后完整章节内容，多用对话和心理描写，结尾留悬念。直接输出，无解释。';

    var result = await callAPI(prompt, 1500);
    if (btn) { btn.innerHTML = '<i class="fas fa-magic"></i> AI扩写'; btn.disabled = false; }
    if (!result) { showNovelToast('扩写失败，请检查 API 配置'); return; }

    var previewEl = document.getElementById('novel-write-preview');
    var previewContent = document.getElementById('novel-write-preview-content');
    if (previewEl) previewEl.style.display = 'block';
    if (previewContent) previewContent.innerHTML = result.replace(/\n/g, '<br>');
    state._pendingExpandedContent = result;
  }

  function showWriterReaderFeedback() {
    var preview = document.getElementById('novel-write-preview');
    if (!preview) return;
    var existing = preview.querySelector('.novel-reader-reactions');
    if (existing) existing.remove();
    var div = document.createElement('div');
    div.className = 'novel-reader-reactions';
    div.innerHTML = '<div class="novel-gen-card-title" style="margin:16px 0 8px;"><i class="fas fa-bullhorn"></i> 虚拟读者反应</div>';
    var count = Math.floor(Math.random() * 3) + 3;
    var names = ['小读者', '追文党', '嗑糖机', '催更怪', '粉头', '铁杆粉'];
    for (var i = 0; i < count; i++) {
      var comment = NETIZEN_POOL[Math.floor(Math.random() * NETIZEN_POOL.length)];
      var item = document.createElement('div');
      item.className = 'novel-comment-item';
      item.style.animationDelay = (i * 0.2) + 's';
      item.innerHTML = '<span class="novel-comment-name">' + names[i % names.length] + '</span><span class="novel-comment-text">' + comment + '</span>';
      div.appendChild(item);
    }
    
    // 找到操作按钮，将读者反应插入到按钮上方
    var actions = preview.querySelector('.novel-write-preview-actions');
    if (actions) {
      preview.insertBefore(div, actions);
    } else {
      preview.appendChild(div);
    }
  }
  function publishWrittenChapter() {
    if (!state._pendingExpandedContent) { showNovelToast('没有可发布的内容'); return; }
    var content = state._pendingExpandedContent;

    if (!state.writingBookId) {
      var ti = document.getElementById('novel-write-prompt');
      var titleGuess = (ti && ti.value) ? ti.value.slice(0, 15) : '我的小说_' + Date.now().toString().slice(-4);
      var nb = {
        id: 'my_' + Date.now(), title: titleGuess, tags: ['romance'],
        cover: randomCover(), emoji: randomEmoji(), progress: 0,
        totalPages: 1, pages: [content], isMyNovel: true, serial: true,
        fansCount: 0 // 新增虚拟粉丝数
      };
      state.myNovels.push(nb);
      state.books.push(nb);
      state.writingBookId = nb.id;
    } else {
      var eb = state.myNovels.find(function(b) { return b.id === state.writingBookId; });
      if (eb) {
        eb.pages.push(content);
        eb.totalPages = eb.pages.length;
        var mb = state.books.find(function(b) { return b.id === state.writingBookId; });
        if (mb) { mb.pages = eb.pages; mb.totalPages = eb.pages.length; }
      }
    }
    state._pendingExpandedContent = '';
    
    // 1. 虚拟粉丝涨粉与打赏
    var newFans = Math.floor(Math.random() * 500) + 100;
    var virtualTips = Math.floor(Math.random() * 5000) + 1000;
    // 增加全站热度
    var currentBook = state.myNovels.find(b => b.id === state.writingBookId);
    incrementViews(currentBook.id); 
    saveState();
    
    showNovelToast(`✅ 发布成功！新增 ${newFans} 粉丝，获打赏 ${virtualTips} 星尘！`);

    // 随机触发书友圈事件 (30% 概率)
    if (Math.random() > 0.7) {
        triggerFanEvent(currentBook);
    }

    // 2. AI 好友真实微信打赏催更 (20% 概率触发)
    if (Math.random() > 0.8) {
        let aiFriends = getPersonas();
        if (aiFriends.length > 0) {
            let tipper = aiFriends[Math.floor(Math.random() * aiFriends.length)];
            setTimeout(() => {
                let transferMsg = `[TRANSFER:52.00] 催更费！刚才那章卡在那里是想急死我吗？赶紧去给我写下一章！`;
                if (typeof window.appendMessage === 'function') {
                    window.appendMessage(transferMsg, 'received', tipper.avatar, tipper.id, null, 'tip_' + Date.now());
                    if (typeof window.saveMessageToHistory === 'function') {
                        window.saveMessageToHistory(tipper.id, { id: 'tip_' + Date.now(), text: transferMsg, type: 'received', senderName: tipper.name });
                    }
                    if (typeof window.showToast === 'function') window.showToast(`💰 收到来自 ${tipper.name} 的催更转账！`);
                }
            }, 3000);
        }
    }

    var prev = document.getElementById('novel-write-preview');
    if (prev) prev.style.display = 'none';
    var pe = document.getElementById('novel-write-prompt');
    if (pe) pe.value = '';
    refreshProfile();
  }

  // ─── FAN EVENTS ──────────────────────────────────────────────
  async function triggerFanEvent(book) {
    var types = ['cp', 'drama', 'fanart'];
    var type = types[Math.floor(Math.random() * types.length)];
    var eventText = '';
    
    if (type === 'cp' && book.charas && book.charas.length > 0) {
        var charName = getName(book.charas[0]);
        eventText = `【热搜 #作者大大偷偷组CP#】书友圈炸了！读者发现你似乎在把 ${charName} 和配角凑对！粉丝拉起了横幅抗议：“男主独美！拒绝拉郎配！”`;
    } else if (type === 'drama') {
        eventText = `【热搜 #作者大大没有心#】上一章剧情太虐，评论区已被眼泪淹没。有土豪读者砸了十万星尘求你让主角复活！`;
    } else {
        eventText = `【同人掉落】有神仙太太为你画了绝美同人图，并在圈子里写了万字长评，现在社区热度爆表，大家都在等你翻牌！`;
    }
    
    state.fanEvents.push({ id: Date.now(), text: eventText, type: type });
    saveState();
    refreshProfile();
  }

  async function resolveFanEvent(e) {
      var btn = e.target.closest('button');
      if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 发送中...'; btn.disabled = true; }
      
      setTimeout(() => {
          state.fanEvents.shift();
          saveState();
          showNovelToast('✅ 声明已发布，粉丝情绪稳定下来了，热度+500！');
          if(state.writingBookId) incrementViews(state.writingBookId);
          incrementViews(state.writingBookId);
          incrementViews(state.writingBookId);
          incrementViews(state.writingBookId);
          incrementViews(state.writingBookId);
          refreshProfile();
      }, 1500);
  }

  // ─── KEYBOARD BRAWL ──────────────────────────────────────────
  function startBrawlMode() {
      state.brawlMode = true;
      state.brawlHP = { me: 100, ai: 100 };
      
      var goals = [
          "想尽办法把这本甜宠文写成恐怖悬疑，出现灵异事件！",
          "疯狂发刀子，让主角立刻破产并被车撞！",
          "强行让主角在严肃场合跳广场舞，把画风变成沙雕！"
      ];
      state.brawlGoal = goals[Math.floor(Math.random() * goals.length)];
      
      state.brawlLogs = [{
          type: 'ai',
          text: '系统提示：已开启双人接龙拔河赛！AI的隐藏任务是：【' + state.brawlGoal + '】。阻止它！'
      }];
      refreshProfile();
  }

  function quitBrawlMode() {
      state.brawlMode = false;
      refreshProfile();
  }

  async function doBrawlAttack() {
      var promptEl = document.getElementById('novel-brawl-prompt');
      if (!promptEl || !promptEl.value.trim()) { showNovelToast('快写段剧情反击！'); return; }
      
      var userText = promptEl.value.trim();
      var btn = document.getElementById('novel-brawl-attack-btn');
      if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> AI思考中...'; btn.disabled = true; }
      
      // User attack
      state.brawlLogs.push({ type: 'me', text: userText });
      state.brawlHP.ai -= Math.floor(Math.random() * 15) + 10;
      refreshProfileLogs();
      
      if (state.brawlHP.ai <= 0) {
          endBrawl('win');
          return;
      }

      // AI Counter Attack
      var prompt = `现在我们正在玩小说接龙游戏。
我的剧情：${userText}
你的任务目标：${state.brawlGoal}
请写一小段（约50字）接上我的剧情，但强行扭转画风来实现你的任务目标！要极其突兀和搞笑！`;

      var result = await callAPI(prompt, 100);
      var aiText = result || "（AI突然断电了）主角突然摔了一跤。";
      
      state.brawlLogs.push({ type: 'ai', text: aiText });
      state.brawlHP.me -= Math.floor(Math.random() * 20) + 5;
      
      if (state.brawlHP.me <= 0) {
          endBrawl('lose');
      } else {
          promptEl.value = '';
          refreshProfile();
          setTimeout(() => {
              var logs = document.getElementById('novel-brawl-logs');
              if (logs) logs.scrollTop = logs.scrollHeight;
          }, 100);
      }
  }
  
  function refreshProfileLogs() {
      var logsEl = document.getElementById('novel-brawl-logs');
      if (logsEl) {
          logsEl.innerHTML = state.brawlLogs.map(function(l) {
              return '<div class="novel-brawl-log-item"><span class="' + (l.type === 'me' ? 'me' : 'ai') + '">[' + (l.type === 'me' ? '我' : 'AI') + ']</span> ' + escapeHtml(l.text) + '</div>';
          }).join('');
          logsEl.scrollTop = logsEl.scrollHeight;
      }
      var meHp = document.querySelector('.novel-brawl-hp-mine');
      var aiHp = document.querySelector('.novel-brawl-hp-ai');
      if (meHp) meHp.style.width = Math.max(0, state.brawlHP.me) + '%';
      if (aiHp) aiHp.style.width = Math.max(0, state.brawlHP.ai) + '%';
      var stMe = document.querySelector('.novel-brawl-status-me');
      var stAi = document.querySelector('.novel-brawl-status-ai');
      if (stMe) stMe.textContent = '作者 (我) : ' + Math.max(0, state.brawlHP.me) + ' HP';
      if (stAi) stAi.textContent = '捣乱AI : ' + Math.max(0, state.brawlHP.ai) + ' HP';
  }

  function endBrawl(result) {
      if (result === 'win') {
          showNovelToast('🎉 胜利！成功把剧情掰回来了！AI被你气死了！');
      } else {
          showNovelToast('💀 失败！小说彻底变成了诡异的奇葩文！');
      }
      
      // 合并日志生成小说章节
      var fullText = state.brawlLogs.slice(1).map(l => l.text).join('\n');
      state._pendingExpandedContent = fullText;
      
      setTimeout(() => {
          state.brawlMode = false;
          refreshProfile();
          var previewEl = document.getElementById('novel-write-preview');
          var previewContent = document.getElementById('novel-write-preview-content');
          if (previewEl) previewEl.style.display = 'block';
          if (previewContent) previewContent.innerHTML = fullText.replace(/\n/g, '<br>');
          showNovelToast('已将大乱斗结果生成为小说草稿！');
      }, 2000);
  }


  // ─── READER ──────────────────────────────────────────────────
  function findBook(id) {
    return state.books.find(function(b) { return b.id === id; }) ||
           state.myNovels.find(function(b) { return b.id === id; }) || null;
  }

  function openBook(book) {
    state.activeBook = book;
    state.currentPage = Math.floor((book.progress || 0) * Math.max(1, (book.pages ? book.pages.length - 1 : 0)));
    incrementViews(book.id);
    var reader = document.getElementById('novel-fullreader');
    if (!reader) return;
    reader.classList.add('open');
    var titleEl = document.getElementById('novel-fr-title');
    if (titleEl) titleEl.textContent = book.title;
    renderPage();
    updateCompanionBar();
  }

  function closeReader() {
    var reader = document.getElementById('novel-fullreader');
    if (reader) reader.classList.remove('open');
    state.activeBook = null;
    if (state.activeTab === 'community') refreshCommunity();
    else if (state.activeTab === 'forum') refreshForum();
  }
  function renderPage() {
    var book = state.activeBook;
    if (!book || !book.pages) return;
    var pages = book.pages;
    var page = state.currentPage;
    var rawText = pages[page] || '';

    // 解析出文本、选项
    var options = [];
    var processedText = rawText.replace(/\[Option\s+[A-D][:：]\s*(.+?)\]/gi, function(match, optText) {
        options.push(optText.trim());
        return ''; // 从正文中移除选项文本
    });

    var pageEl = document.getElementById('novel-fr-page');
    if (pageEl) {
        let html = buildPageWithComments(processedText, page);
        // 如果是最新一章且存在选项，渲染按钮
        if (options.length > 0 && page === pages.length - 1) {
            html += '<div class="novel-choices-container"><div class="novel-choice-title">✦ 命运的分歧点 ✦</div>';
            options.forEach(function(opt) {
                html += '<button class="novel-choice-btn" onclick="window.triggerNovelChoice(\'' + escapeHtml(opt).replace(/'/g, "\\'") + '\')"><i class="far fa-compass"></i> ' + escapeHtml(opt) + '</button>';
            });
            html += '</div>';
        }
        pageEl.innerHTML = html;
    }

    document.querySelectorAll('.novel-para-bubble').forEach(function(bubble) {
      bubble.onclick = function(e) {
        e.stopPropagation();
        openCommentSheet(bubble.dataset.paraIdx, decodeURIComponent(bubble.dataset.paraText || ''));
      };
    });

    document.querySelectorAll('.novel-para-text').forEach(function(p) {
      var timer;
      p.addEventListener('touchstart', function() { timer = setTimeout(function() { onLongPressText(p.textContent); }, 600); });
      p.addEventListener('touchend', function() { clearTimeout(timer); });
      p.addEventListener('touchmove', function() { clearTimeout(timer); });
      p.addEventListener('dblclick', function() { onLongPressText(p.textContent); });
    });

    var infoEl = document.getElementById('novel-fr-info');
    if (infoEl) infoEl.textContent = '第 ' + (page + 1) + ' / ' + pages.length + ' 章';

    var continueBtn = document.getElementById('novel-fr-continue');
    if (continueBtn) {
      var isLast = page === pages.length - 1;
      var isSerial = book.serial || book.isGenerated || book.isMyNovel;
      // 如果有选项，隐藏底部的普通“续写”按钮
      continueBtn.style.display = (isLast && isSerial && options.length === 0) ? 'block' : 'none';
    }

    if (book.id) { book.progress = pages.length > 1 ? page / (pages.length - 1) : 1; saveState(); }
    checkAntiAddiction();
    if (state.companion) scheduleCompanionWhisper(rawText.slice(0, 100));
  }

  function buildPageWithComments(text, pageIndex) {
    var paragraphs = text.split('\n').filter(function(l) { return l.trim(); });
    return paragraphs.map(function(para, i) {
      var paraKey = pageIndex + '_' + i;
      
      // 拦截图片标签：[IMAGE: xxxx]
      var imgMatch = para.match(/\[IMAGE:\s*(.+?)\]/i);
      if (imgMatch) {
          var imgPrompt = encodeURIComponent(imgMatch[1] + ", masterpiece, high quality, light novel illustration");
          var imgUrl = 'https://image.pollinations.ai/prompt/' + imgPrompt + '?width=512&height=768&nologo=true';
          return '<div class="novel-illustration"><img src="' + imgUrl + '" loading="lazy" alt="插画加载中..."><div class="novel-illustration-hint">AI 意境插画</div></div>';
      }

      var seed = 0;
      for (var c = 0; c < Math.min(para.length, 8); c++) seed += para.charCodeAt(c);
      var bubbleCount = (seed % 12) + 1;
      var encodedPara = encodeURIComponent(para.slice(0, 80));
      var isTitle = /^第[一二三四五六七八九十\d]+章/.test(para) || /^楔子|^序章|^尾声/.test(para);
      
           // 随机生成TA的批注（仅在有陪读伴侣时触发）
      var annotationHtml = '';
      if (state.companion && Math.random() > 0.85 && !isTitle) {
          var annotations = ["写得真好...", "这里好虐😢", "如果是我就不会这样", "画重点！", "心跳加速了"];
          annotationHtml = `<div class="novel-annotation">${annotations[Math.floor(Math.random()*annotations.length)]}</div>`;
      }

      return (
        '<div class="novel-para-wrapper">' + annotationHtml + 
          '<p class="novel-para-text' + (isTitle ? ' novel-chapter-title' : '') + '">' + escapeHtml(para) + '</p>' +
          (isTitle ? '' : '<span class="novel-para-bubble" data-para-idx="' + paraKey + '" data-para-text="' + encodedPara + '"><i class="far fa-comment-dots"></i> ' + bubbleCount + '</span>') +
        '</div>'
      );

    }).join('');
  }


  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
  }

  function prevPage() {
    if (!state.activeBook || state.currentPage <= 0) return;
    state.currentPage--;
    renderPage();
    var body = document.getElementById('novel-fullreader-body');
    if (body) body.scrollTop = 0;
  }

  function nextPage() {
    if (!state.activeBook || !state.activeBook.pages) return;
    if (state.currentPage < state.activeBook.pages.length - 1) {
      state.currentPage++;
      renderPage();
      var body = document.getElementById('novel-fullreader-body');
      if (body) body.scrollTop = 0;
    }
  }

   // ─── CONTINUE CHAPTER ────────────────────────────────────────
  async function continueNextChapter(userChoiceText = '') {
    var book = state.activeBook;
    if (!book) return;
    if (!localStorage.getItem(SETTINGS_KEY)) { showNovelToast('请先配置 API'); return; }

    // 禁用所有选项按钮防重复点击
    document.querySelectorAll('.novel-choice-btn').forEach(function(b) { b.style.opacity = '0.5'; b.style.pointerEvents = 'none'; });

    var btn = document.getElementById('novel-fr-continue');
    if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 命运织缕中...'; btn.disabled = true; }
    else if (userChoiceText) { showNovelToast('⏳ 正在根据你的选择生成后续剧情...'); }

    var contextPages = book.pages.slice(-2).join('\n\n');
    var context = contextPages.slice(-1500); 
    var chapterNum = book.pages.length + 1;
    
    var m = book.meta || {};
    var prompt = buildTavernPrompt(
        book.title, m.genre || '言情', m.tropeStr || '', m.charaPersonas || '', 
        m.userPersona || '', m.worldContent || '', context, false, userChoiceText
    );
    prompt = '请输出 "第' + chapterNum + '章 章节标题"\n' + prompt;

    var result = await callAPI(prompt, 2000);
    
    if (btn) { btn.innerHTML = '续写下一章 <i class="fas fa-magic"></i>'; btn.disabled = false; }
    if (!result) { 
        showNovelToast('续写失败，请稍后重试'); 
        document.querySelectorAll('.novel-choice-btn').forEach(function(b) { b.style.opacity = '1'; b.style.pointerEvents = 'auto'; });
        return; 
    }

    book.pages.push(result);
    book.totalPages = book.pages.length;
    state.currentPage = book.pages.length - 1;
    saveState();
    renderPage();
    showNovelToast('✅ 第' + chapterNum + '章已生成！');
    if (state.companion) setTimeout(function() { showCompanionBubble('刚刚那个决定，真的很像你的风格呢 (눈_눈)'); }, 1500);
  }


  // ─── COMMENT SHEET ───────────────────────────────────────────
  function openCommentSheet(paraIdx, paraText) {
    var sheet = document.getElementById('novel-comment-sheet');
    var overlay = document.getElementById('novel-comment-overlay');
    if (!sheet || !overlay) return;
    sheet.classList.add('open');
    overlay.classList.add('active');

    var loading = document.getElementById('novel-comment-loading');
    if (state.commentCache[paraIdx]) { renderComments(state.commentCache[paraIdx]); return; }

    var poolComments = generatePoolComments();
    state.commentCache[paraIdx] = poolComments;
    renderComments(poolComments);

    if (localStorage.getItem(SETTINGS_KEY) && paraText) {
      if (loading) loading.style.display = 'block';
      generateAPIComments(paraText).then(function(apiComments) {
        if (loading) loading.style.display = 'none';
        if (apiComments && apiComments.length > 0) {
          var combined = apiComments.concat(poolComments.slice(0, 3));
          state.commentCache[paraIdx] = combined;
          if (sheet.classList.contains('open')) renderComments(combined);
        }
      });
    }
  }

  function generatePoolComments() {
    var count = Math.floor(Math.random() * 8) + 5;
    var shuffled = NETIZEN_POOL.slice().sort(function() { return Math.random() - 0.5; });
    return shuffled.slice(0, count).map(function(text) {
      var names = ['书虫', '追文党', '路人甲', '嗑学家', '破防了', '炸裂了', '暴击中', '催更怪'];
      return { name: names[Math.floor(Math.random() * names.length)], text: text, likes: Math.floor(Math.random() * 300) + 1 };
    });
  }

  async function generateAPIComments(paraText) {
    var prompt = '你是网络小说评论区。根据以下段落，生成6条真实网友风格的短评（中文，幽默或感动，每条不超过20字）。\n\n段落：「' + paraText + '」\n\n直接输出6条，每条一行，不加序号。';
    var result = await callAPI(prompt, 200);
    if (!result) return null;
    return result.split('\n').filter(function(l) { return l.trim(); }).slice(0, 6).map(function(text) {
      var names = ['读者', '书友', '追文者', '看哭了', '破防了'];
      return { name: names[Math.floor(Math.random() * names.length)], text: text.trim(), likes: Math.floor(Math.random() * 300) + 1 };
    });
  }

  function renderComments(comments) {
    var body = document.getElementById('novel-comment-body');
    if (!body) return;
    body.innerHTML = comments.map(function(c) {
      return (
        '<div class="novel-comment-item">' +
          '<span class="novel-comment-name">' + escapeHtml(c.name) + '</span>' +
          '<span class="novel-comment-text">' + escapeHtml(c.text) + '</span>' +
          '<span class="novel-comment-likes"><i class="fas fa-heart" style="color:#333;"></i> ' + c.likes + '</span>' +
        '</div>'
      );
    }).join('');
  }

  function closeCommentSheet() {
    var sheet = document.getElementById('novel-comment-sheet');
    var overlay = document.getElementById('novel-comment-overlay');
    if (sheet) sheet.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  }

  // ─── HIGHLIGHT & COMPANION ───────────────────────────────────
  function toggleHighlightMode() {
    state.highlightMode = !state.highlightMode;
    var btn = document.getElementById('novel-fr-highlight-btn');
    if (btn) { btn.style.background = state.highlightMode ? '#111' : ''; btn.style.color = state.highlightMode ? '#fff' : ''; }
    showNovelToast(state.highlightMode ? '✏️ 划线模式开启：双击段落发给TA' : '划线模式已关闭');
  }

  function onLongPressText(text) {
    if (!text || !text.trim()) return;
    if (!state.highlightMode && !state.companion) return;
    if (!state.companion) { showNovelToast('请先设置陪读角色才能划线分享'); return; }
    var snippet = text.trim().slice(0, 60);
    showNovelToast('发给 ' + getName(state.companion) + '：「' + snippet + '...」');
    generateCompanionWhisper(state.companion, snippet);
  }

  async function generateCompanionWhisper(companionId, snippet) {
    var f = (typeof friendsData !== 'undefined') ? friendsData[companionId] : null;
    if (!f) { showCompanionBubble('（嗯，这段话很有意思……）'); return; }
    if (!localStorage.getItem(SETTINGS_KEY)) { showCompanionBubble('（悄声）这句话让我想起了你。'); return; }
    var prompt = '你是' + (f.remark || f.realName) + '，人设：' + (f.persona || '') + '\n\n' +
      '朋友把这段话划给你看：\n「' + snippet + '」\n\n用1-2句话私语式点评（可以调侃、心动或嗔怪）。直接输出，无解释。';
    var result = await callAPI(prompt, 80);
    showCompanionBubble(result || '（悄声）这句话……让我想起了你。');
  }

  function showCompanionBubble(text) {
    if (!text) return;
    var existing = document.querySelector('.novel-companion-bubble');
    if (existing) existing.remove();
    var bubble = document.createElement('div');
    bubble.className = 'novel-companion-bubble';
    var f = state.companion && (typeof friendsData !== 'undefined') ? friendsData[state.companion] : null;
    bubble.innerHTML = (f && f.avatar ? '<img src="' + f.avatar + '" class="novel-companion-bubble-avatar">' : '<div class="novel-companion-bubble-avatar" style="background:#eee;display:flex;align-items:center;justify-content:center;"><i class="fas fa-user"></i></div>') +
      '<div class="novel-companion-bubble-text">' + escapeHtml(text) + '</div>';
    var reader = document.getElementById('novel-fullreader');
    if (reader) reader.appendChild(bubble);
    setTimeout(function() { bubble.classList.add('show'); }, 100);
    setTimeout(function() { bubble.classList.remove('show'); setTimeout(function() { bubble.remove(); }, 400); }, 5000);
  }

  function scheduleCompanionWhisper() {
    if (Math.random() > 0.2 || !state.companion) return;
    setTimeout(function() {
      var r = ['这段剧情有点熟悉…', '（悄悄瞄了你一眼）', '等等，这里细品一下', '作者会写啊', '你看到这段什么感觉？'];
      showCompanionBubble(r[Math.floor(Math.random() * r.length)]);
    }, 2000);
  }

  function updateCompanionBar() {
    var bar = document.getElementById('novel-fr-companion-bar');
    var nameEl = document.getElementById('novel-fr-companion-name');
    if (!bar) return;
    if (state.companion) {
      bar.style.display = 'flex';
      if (nameEl) nameEl.textContent = getName(state.companion) + '陪读中';
    } else {
      bar.style.display = 'none';
    }
  }

  // ─── ANTI-ADDICTION ──────────────────────────────────────────
  function checkAntiAddiction() {
    if (state.antiAddictionSnoozed) return;
    var hour = new Date().getHours();
    if (hour >= 0 && hour < 4) {
      var overlay = document.getElementById('novel-antiaddict-overlay');
      if (overlay && overlay.style.display === 'none') {
        var f = state.companion && (typeof friendsData !== 'undefined') ? friendsData[state.companion] : null;
        var avatarEl = document.getElementById('novel-antiaddict-avatar');
        if (avatarEl) {
          avatarEl.innerHTML = f && f.avatar
            ? '<img src="' + f.avatar + '" style="width:70px;height:70px;border-radius:50%;object-fit:cover;">'
            : '<i class="fas fa-clock" style="color:#111;"></i>';
        }
        var name = f ? (f.remark || f.realName || '系统') : '系统';
        var msgs = [
          '已经凌晨' + hour + '点了！这本小说明天再看！立刻给我去睡觉！',
          name + '：凌晨' + hour + '点还在追文？眼睛不要了？',
          '（' + name + '夺走手机）：睡觉！小说跑不了，黑眼圈跑得了吗！',
        ];
        var msgEl = document.getElementById('novel-antiaddict-msg');
        if (msgEl) msgEl.textContent = msgs[Math.floor(Math.random() * msgs.length)];
        overlay.style.display = 'flex';
      }
    }
  }

  // ─── COMPANION DIALOG ────────────────────────────────────────
  function showCompanionDialog() {
    var dialog = document.getElementById('novel-companion-dialog');
    var overlay = document.getElementById('novel-companion-overlay');
    var list = document.getElementById('novel-companion-list');
    if (!dialog || !list) return;

    var personas = getPersonas();
    list.innerHTML = (
      '<div class="novel-chara-item' + (!state.companion ? ' selected' : '') + '" data-companionid="">' +
        '<div class="novel-chara-avatar" style="background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:18px;"><i class="fas fa-ban"></i></div>' +
        '<div class="novel-chara-name">不设置陪读</div>' +
        '<div class="novel-chara-check' + (!state.companion ? ' active' : '') + '"><i class="fas fa-check"></i></div>' +
      '</div>' +
      personas.map(function(p) {
        var isSel = state.companion === p.id;
        return (
          '<div class="novel-chara-item' + (isSel ? ' selected' : '') + '" data-companionid="' + p.id + '">' +
            (p.avatar ? '<img src="' + p.avatar + '" class="novel-chara-avatar">' : '<div class="novel-chara-avatar" style="background:#eee;display:flex;align-items:center;justify-content:center;"><i class="fas fa-user"></i></div>') +
            '<div class="novel-chara-name">' + p.name + '</div>' +
            '<div class="novel-chara-check' + (isSel ? ' active' : '') + '"><i class="fas fa-check"></i></div>' +
          '</div>'
        );
      }).join('')
    );

    list.querySelectorAll('.novel-chara-item').forEach(function(item) {
      item.onclick = function() {
        list.querySelectorAll('.novel-chara-item').forEach(function(i) {
          i.classList.remove('selected');
          var c = i.querySelector('.novel-chara-check');
          if (c) c.classList.remove('active');
        });
        item.classList.add('selected');
        var chk = item.querySelector('.novel-chara-check');
        if (chk) chk.classList.add('active');
        state.companion = item.dataset.companionid || null;
        saveState();
        updateCompanionBar();
        showNovelToast(state.companion ? ('已设置 ' + getName(state.companion) + ' 为陪读角色') : '已取消陪读');
      };
    });

    dialog.style.display = 'flex';
    overlay.style.display = 'block';
  }

  // ─── TXT IMPORT ──────────────────────────────────────────────
  function showImportDialog() {
    document.getElementById('novel-import-dialog').style.display = 'flex';
    document.getElementById('novel-import-overlay').style.display = 'block';
  }

  function hideImportDialog() {
    document.getElementById('novel-import-dialog').style.display = 'none';
    document.getElementById('novel-import-overlay').style.display = 'none';
  }

  function confirmImport() {
    var titleEl = document.getElementById('novel-import-title');
    var contentEl = document.getElementById('novel-import-content');
    var title = (titleEl && titleEl.value.trim()) || ('导入小说_' + Date.now().toString().slice(-4));
    var content = contentEl && contentEl.value.trim();
    if (!content) { showNovelToast('请先输入或上传小说内容'); return; }

    var pages = splitIntoChapters(content);
    var newBook = {
      id: 'txt_' + Date.now(),
      title: title,
      tags: ['romance'],
      cover: randomCover(),
      emoji: 'fas fa-file-alt',
      progress: 0,
      totalPages: pages.length,
      pages: pages,
      serial: true,
      isImported: true,
    };
    state.books.push(newBook);
    saveState();
    hideImportDialog();
    showNovelToast('✅「' + title + '」导入成功，共' + pages.length + '章');
    refreshShelf();
    if (titleEl) titleEl.value = '';
    if (contentEl) contentEl.value = '';
  }

  function splitIntoChapters(text) {
    var regex = /第[一二三四五六七八九十百千\d]+章/g;
    var matches = [];
    var m;
    while ((m = regex.exec(text)) !== null) matches.push(m.index);
    if (matches.length < 2) {
      var chunks = [];
      for (var i = 0; i < text.length; i += 1500) chunks.push(text.slice(i, i + 1500));
      return chunks.length > 0 ? chunks : [text];
    }
    var chapters = [];
    for (var j = 0; j < matches.length; j++) {
      var end = j + 1 < matches.length ? matches[j + 1] : text.length;
      chapters.push(text.slice(matches[j], end).trim());
    }
    if (matches[0] > 50) chapters.unshift(text.slice(0, matches[0]).trim());
    return chapters.filter(function(c) { return c.length > 0; });
  }

  // ─── SHARE TO WECHAT ─────────────────────────────────────────
  function shareToWeChat(book) {
    var personas = getPersonas();
    if (personas.length === 0) { showNovelToast('请先创建角色才能分享'); return; }
    var dialog = document.getElementById('novel-share-dialog');
    var overlay = document.getElementById('novel-share-overlay');
    var list = document.getElementById('novel-share-chara-list');
    if (!dialog || !list) return;

    var selectedShareId = null;
    list.innerHTML = personas.map(function(p) {
      return (
        '<div class="novel-chara-item" data-charaid="' + p.id + '">' +
          (p.avatar ? '<img src="' + p.avatar + '" class="novel-chara-avatar">' : '<div class="novel-chara-avatar" style="background:#eee;display:flex;align-items:center;justify-content:center;font-size:16px;"><i class="fas fa-user"></i></div>') +
          '<div class="novel-chara-name">' + p.name + '</div>' +
          '<div class="novel-chara-check"></div>' +
        '</div>'
      );
    }).join('');

    list.querySelectorAll('.novel-chara-item').forEach(function(item) {
      item.onclick = function() {
        list.querySelectorAll('.novel-chara-item').forEach(function(i) { i.classList.remove('selected'); var c = i.querySelector('.novel-chara-check'); if (c) c.classList.remove('active'); });
        item.classList.add('selected');
        var chk = item.querySelector('.novel-chara-check');
        if (chk) chk.classList.add('active');
        selectedShareId = item.dataset.charaid;
      };
    });

    dialog.style.display = 'flex';
    overlay.style.display = 'block';
    dialog._book = book;
    dialog._getSelected = function() { return selectedShareId; };
  }

  function doShareConfirm() {
    var dialog = document.getElementById('novel-share-dialog');
    if (!dialog) return;
    var charId = dialog._getSelected ? dialog._getSelected() : null;
    var book = dialog._book;
    if (!charId) { showNovelToast('请选择要分享给谁'); return; }
    dialog.style.display = 'none';
    document.getElementById('novel-share-overlay').style.display = 'none';
    doShareToWeChat(book, charId);
  }

  function doShareToWeChat(book, charId) {
    var name = getName(charId);
    var cardHtml = (
      '<div class="novel-wc-share-card">' +
        '<div class="novel-wc-share-cover" style="background:' + (book.cover || '#f1f3f5') + '">' +
          '<span><i class="' + (book.emoji || 'fas fa-book') + '"></i></span>' +
        '</div>' +
        '<div class="novel-wc-share-info">' +
          '<div class="novel-wc-share-title">' + escapeHtml(book.title) + '</div>' +
          '<div class="novel-wc-share-tags">' + (book.tags || []).map(function(t) { return '#' + t; }).join(' ') + '</div>' +
          '<div class="novel-wc-share-source"><i class="fas fa-book-open"></i> 来自 Novels</div>' +
        '</div>' +
      '</div>'
    );

    var wechatApp = document.getElementById('wechatApp');
    if (wechatApp) wechatApp.classList.add('open');
    setTimeout(function() {
      if (typeof window.openChatDetail === 'function') window.openChatDetail(charId);
      setTimeout(function() {
        if (typeof window.appendMessage === 'function') {
          var msgId = 'novel_share_' + Date.now();
          window.appendMessage(cardHtml, 'sent', null, null, null, msgId);
          if (typeof window.saveMessageToHistory === 'function') {
            window.saveMessageToHistory(charId, { id: msgId, text: cardHtml, type: 'sent', senderName: 'ME' });
          }
        }
        showNovelToast('📤 已分享给 ' + name);
        schedulePostReadingReaction(book, charId);
      }, 600);
    }, 800);
  }

  function schedulePostReadingReaction(book, charId) {
    var pending = [];
    try { pending = JSON.parse(localStorage.getItem('novel_pending_reactions') || '[]'); } catch(e) {}
    pending.push({
      bookTitle: book.title,
      bookSnippet: (book.pages && book.pages[0] ? book.pages[0].slice(0, 200) : ''),
      charId: charId,
      triggerTime: Date.now() + 30 * 60 * 1000,
      genre: (book.tags && book.tags[0]) || 'romance',
    });
    try { localStorage.setItem('novel_pending_reactions', JSON.stringify(pending)); } catch(e) {}
    setTimeout(function() { triggerPostReadingReaction(book, charId); }, 2 * 60 * 1000);
  }

    async function triggerPostReadingReaction(book, charId) {
    var f = (typeof friendsData !== 'undefined') ? friendsData[charId] : null;
    if (!f) return;

    // 检查 AI 是否是这本小说的“主角”之一 (同人小说入戏判定)
    let isFanFic = book.charas && book.charas.includes(charId);
    
    let prompt = `你是${f.remark || f.realName || charId}，人设：${f.persona || ''}\n\n`;
    
    if (isFanFic) {
        // 同人小说后遗症！
        prompt += `注意：你刚刚和朋友(User)一起看了一本以【你和User】为主角的同人小说《${book.title}》（${(book.tags && book.tags[0]) || '言情'}题材）。\n` +
                  `你产生了强烈的“入戏后遗症”！你感到害羞、震惊或者吐槽小说里的情节。\n` +
                  `请发一条微信消息（1-2句自然口语），质问或调侃 User：“我们在书里怎么会做那种事？”或类似反应。直接输出消息，无引号。`;
    } else {
        // 普通观后感
        prompt += `你刚陪朋友看完了《${book.title}》（${(book.tags && book.tags[0]) || '言情'}题材）。\n` +
                  `请发一条看完后的感想消息（1-2句，自然口语，有真情实感，可结合书中内容联系到你们）。直接输出消息，无引号。`;
    }

    var result = await callAPI(prompt, 150);
    var fallback = isFanFic ? `这小说写得也太离谱了吧...我们在里面居然是那种设定？！` : `刚才那本《${book.title}》挺好看的，下次再一起看。`;
    sendReactionToWeChat(result || fallback, charId, f);
  }

  function sendReactionToWeChat(text, charId, f) {
    if (!text || !charId) return;
    var msgId = 'novel_reaction_' + Date.now();
    var avatarUrl = f && f.avatar ? f.avatar : '';
    if (typeof window.saveMessageToHistory === 'function') {
      window.saveMessageToHistory(charId, { id: msgId, text: text, type: 'received', customAvatar: avatarUrl, senderName: charId });
    }
    if (window.currentChatId === charId && typeof window.appendMessage === 'function') {
      window.appendMessage(text, 'received', avatarUrl, charId, null, msgId);
    }
    if (typeof friendsData !== 'undefined' && friendsData[charId]) {
      friendsData[charId].lastMessage = text;
      friendsData[charId].unreadCount = (friendsData[charId].unreadCount || 0) + 1;
      if (typeof saveFriendsData === 'function') saveFriendsData();
      if (typeof updateDockUnreadDot === 'function') updateDockUnreadDot();
    }
    if (typeof window.showToast === 'function') {
      window.showToast('💬 ' + (f ? (f.remark || f.realName || charId) : charId) + '：' + text.slice(0, 25) + '...');
    }
  }

  function checkPendingReactions() {
    var pending = [];
    try { pending = JSON.parse(localStorage.getItem('novel_pending_reactions') || '[]'); } catch(e) {}
    var now = Date.now();
    var remaining = [];
    pending.forEach(function(item) {
      if (item.triggerTime <= now) {
        var f = (typeof friendsData !== 'undefined') ? friendsData[item.charId] : null;
        if (f) triggerPostReadingReaction({ title: item.bookTitle, pages: [item.bookSnippet], tags: [item.genre] }, item.charId);
      } else {
        remaining.push(item);
        var delay = item.triggerTime - now;
        setTimeout(function() {
          var fn = (typeof friendsData !== 'undefined') ? friendsData[item.charId] : null;
          if (fn) triggerPostReadingReaction({ title: item.bookTitle, pages: [item.bookSnippet], tags: [item.genre] }, item.charId);
        }, delay);
      }
    });
    try { localStorage.setItem('novel_pending_reactions', JSON.stringify(remaining)); } catch(e) {}
  }

  // ─── AWAY TRACKER ────────────────────────────────────────────
  function startAwayTracker() {
    if (state._awayTrackerStarted) return;
    state._awayTrackerStarted = true;
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        state.awayStart = Date.now();
      } else if (state.awayStart) {
        var awayMins = (Date.now() - state.awayStart) / 60000;
        state.awayStart = null;
        if (awayMins >= 25 && state.companion) {
          var pending = [];
          try { pending = JSON.parse(localStorage.getItem('novel_pending_reactions') || '[]'); } catch(e) {}
          var now = Date.now();
          var due = pending.filter(function(p) { return p.triggerTime <= now + 5 * 60 * 1000; });
          if (due.length > 0) {
            setTimeout(function() {
              var f = (typeof friendsData !== 'undefined') ? friendsData[due[0].charId] : null;
              if (f) triggerPostReadingReaction({ title: due[0].bookTitle, pages: [due[0].bookSnippet], tags: [due[0].genre] }, due[0].charId);
            }, 3000);
          }
        }
      }
    });
  }

  // ─── TOAST ───────────────────────────────────────────────────
  function showNovelToast(msg) {
    var existing = document.querySelector('.novel-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.className = 'novel-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function() { toast.classList.add('show'); }, 10);
    setTimeout(function() { toast.classList.remove('show'); setTimeout(function() { toast.remove(); }, 300); }, 2500);
  }

   return { 
      init: init,
      continueNextChapter: continueNextChapter
  };

})();

// 挂载到全局，供动态生成的选项按钮调用
window.triggerNovelChoice = function(choiceText) {
    if (window.NovelApp && window.NovelApp.continueNextChapter) {
        window.NovelApp.continueNextChapter(choiceText);
    }
};


// Auto-init
(function() {
  function setupObserver(el) {
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          if (el.classList.contains('open') && !el.dataset.novelInited) {
            el.dataset.novelInited = '1';
            NovelApp.init();
          }
        }
      });
    });
    observer.observe(el, { attributes: true });
  }

  var el = document.getElementById('novelApp');
  if (el) {
    setupObserver(el);
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      var el2 = document.getElementById('novelApp');
      if (el2) setupObserver(el2);
    });
  }
})();
