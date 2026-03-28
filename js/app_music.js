// ===== app_music.js - 一起听 完整音乐系统 =====

// ---- 状态 ----
window.musicState = {
  playlist: [],          // [{id, title, artist, src, cover, lrc, musicId, source}]
  currentIndex: -1,
  isPlaying: false,
  listenTogetherActive: false,
  totalListenSeconds: 0,
  lastTickTime: null,
  parsedLyrics: [],      // [{time, text}]
  lyricsInterval: null,
  progressInterval: null,
  keepAliveTrack: { src: 'https://cdn.jsdelivr.net/gh/anars/blank-audio@master/250-milliseconds-of-silence.mp3', title: '__keepalive__', hidden: true }
};

const MUSIC_KEY = 'app_music_state_v2';

// ---- 初始化 ----
function initMusicSystem() {
  const saved = tryParse(localStorage.getItem(MUSIC_KEY));
  if (saved) {
    window.musicState.playlist = saved.playlist || [];
    window.musicState.currentIndex = saved.currentIndex ?? -1;
    window.musicState.totalListenSeconds = saved.totalListenSeconds || 0;
    window.musicState.listenTogetherActive = false;
  }
  ensureKeepAliveTrack();
  renderPlaylist();
  updateLtPlayerUI();
  updateListenTogetherBtn();
  startProgressInterval();
}

function saveMusicState() {
  const s = window.musicState;
  localStorage.setItem(MUSIC_KEY, JSON.stringify({
    playlist: s.playlist,
    currentIndex: s.currentIndex,
    totalListenSeconds: s.totalListenSeconds
  }));
}

function tryParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

// ---- 保活音轨 ----
function ensureKeepAliveTrack() {
  const s = window.musicState;
  // 保活轨道在位置0，隐藏
  const hasKA = s.playlist.length > 0 && s.playlist[0].hidden;
  if (!hasKA) {
    s.playlist.unshift({ ...s.keepAliveTrack, id: '__ka__' });
    if (s.currentIndex >= 0) s.currentIndex++;
  }
}

// ---- 获取音频元素 ----
function getAudio() {
  let el = document.getElementById('global-audio-player');
  if (!el) {
    el = document.createElement('audio');
    el.id = 'global-audio-player';
    el.style.display = 'none';
    document.body.appendChild(el);
  }
  return el;
}

// ---- 播放控制 ----
function toggleMusicPlay() {
  const audio = getAudio();
  const s = window.musicState;
  if (s.currentIndex < 0 || s.currentIndex >= s.playlist.length) {
    playAtIndex(1); return;
  }
  if (s.isPlaying) {
    audio.pause();
    s.isPlaying = false;
  } else {
    audio.play().catch(() => {});
    s.isPlaying = true;
  }
  updatePlayBtn();
}

function playAtIndex(idx) {
  const s = window.musicState;
  if (idx < 0 || idx >= s.playlist.length) return;
  const song = s.playlist[idx];
  if (!song || song.hidden) { playAtIndex(idx + 1); return; }

  s.currentIndex = idx;
  const audio = getAudio();
  audio.src = song.src;
  audio.loop = false;
  audio.play().catch(() => { checkAndRenewSrc(idx); });
  s.isPlaying = true;

  // 更新 UI
  updateLtPlayerUI();
  renderPlaylist();
  updatePlayBtn();
  saveMusicState();

  // 解析歌词
  if (song.lrc) {
    parseLrc(song.lrc);
  } else {
    s.parsedLyrics = [];
    clearLyricsDisplay();
  }

  // 歌曲结束自动下一首
  audio.onended = () => playNextSong();

  // 通知心声卡BGM
  updateNowPlayingBgm(song.title, song.artist);
}

function playNextSong() {
  const s = window.musicState;
  let next = s.currentIndex + 1;
  while (next < s.playlist.length && s.playlist[next].hidden) next++;
  if (next >= s.playlist.length) {
    // 找第一首非隐藏
    next = s.playlist.findIndex(t => !t.hidden);
  }
  if (next >= 0) playAtIndex(next);
}

function playPrevSong() {
  const s = window.musicState;
  let prev = s.currentIndex - 1;
  while (prev >= 0 && s.playlist[prev].hidden) prev--;
  if (prev < 0) {
    prev = s.playlist.length - 1;
    while (prev >= 0 && s.playlist[prev].hidden) prev--;
  }
  if (prev >= 0) playAtIndex(prev);
}

function seekMusic(e) {
  const audio = getAudio();
  if (!audio.duration) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  audio.currentTime = ratio * audio.duration;
}

// ---- 进度条 ----
function startProgressInterval() {
  if (window.musicState.progressInterval) clearInterval(window.musicState.progressInterval);
  window.musicState.progressInterval = setInterval(() => {
    const audio = getAudio();
    const bar = document.getElementById('lt-progress-bar');
    if (bar && audio.duration) {
      bar.style.width = (audio.currentTime / audio.duration * 100) + '%';
    }
    tickListenTime();
    updateLyricsHighlight();
  }, 500);
}

// ---- 计时 ----
function tickListenTime() {
  const s = window.musicState;
  if (!s.listenTogetherActive || !s.isPlaying) return;
  const now = Date.now();
  if (s.lastTickTime) {
    s.totalListenSeconds += (now - s.lastTickTime) / 1000;
  }
  s.lastTickTime = now;
  updateTimeDisplay();
  // 每10秒保存一次
  if (Math.floor(s.totalListenSeconds) % 10 === 0) saveMusicState();
  // 持久化到角色数据库
  syncTimeToCharacter();
}

function updateTimeDisplay() {
  const el = document.getElementById('lt-total-time');
  if (el) {
    const h = (window.musicState.totalListenSeconds / 3600).toFixed(1);
    el.textContent = `已经一起听了 ${h} 小时`;
  }
}

function syncTimeToCharacter() {
  const s = window.musicState;
  const cid = window.currentChatId || (window.friends && window.friends[0]?.id);
  if (!cid) return;
  const key = `chat_${cid}`;
  const data = tryParse(localStorage.getItem(key)) || {};
  if (!data.musicData) data.musicData = {};
  data.musicData.totalTime = s.totalListenSeconds;
  localStorage.setItem(key, JSON.stringify(data));
}

// ---- 一起听 开关 ----
function toggleListenTogether() {
  const s = window.musicState;
  if (s.listenTogetherActive) {
    closeListenTogetherPlayer();
  } else {
    openListenTogetherPlayer();
  }
}

function openListenTogetherPlayer() {
  const s = window.musicState;
  s.listenTogetherActive = true;
  s.lastTickTime = Date.now();

  const panel = document.getElementById('listen-together-player');
  if (panel) panel.classList.add('lt-active');

  updateListenTogetherBtn();
  updateLtPlayerUI();
  updateTimeDisplay();

  // 关闭加号面板
  const plusPanel = document.getElementById('panel-plus');
  if (plusPanel) plusPanel.style.display = 'none';
  const extraPanels = document.getElementById('chat-extra-panels');
  if (extraPanels) extraPanels.classList.remove('open');

  // 若无音频在播放则从第一首开始
  const audio = getAudio();
  if (!s.isPlaying && s.playlist.length > 1) {
    const first = s.playlist.findIndex(t => !t.hidden);
    if (first >= 0 && s.currentIndex !== first) playAtIndex(first);
  }

  // 保活轨道静音循环
  startKeepAlive();
}

function closeListenTogetherPlayer() {
  const s = window.musicState;
  s.listenTogetherActive = false;
  s.lastTickTime = null;

  const panel = document.getElementById('listen-together-player');
  if (panel) panel.classList.remove('lt-active');

  updateListenTogetherBtn();
  saveMusicState();
}

function startKeepAlive() {
  // 保活：在iOS等浏览器后台需要音频标签持续活跃
  const audio = getAudio();
  // 保活音轨已经在src=silence，不需要额外处理
}

function updateListenTogetherBtn() {
  const btn = document.getElementById('listen-together-btn');
  if (!btn) return;
  const icon = btn.querySelector('i');
  const active = window.musicState.listenTogetherActive;
  if (icon) icon.style.color = active ? '#ff7e67' : '';
  if (icon) icon.className = active ? 'fas fa-headphones-alt' : 'fas fa-headphones';
  // 旋转动画
  btn.style.animation = active ? 'ltBtnPulse 1.5s ease-in-out infinite' : '';
}

// ---- UI 更新 ----
function updateLtPlayerUI() {
  const s = window.musicState;
  const song = s.playlist[s.currentIndex];

  // 歌曲信息
  const titleEl = document.getElementById('lt-song-title');
  const artistEl = document.getElementById('lt-song-artist');
  if (titleEl) titleEl.textContent = (song && !song.hidden) ? (song.title || '未知歌曲') : '还没有歌曲';
  if (artistEl) artistEl.textContent = (song && !song.hidden) ? (song.artist || '未知歌手') : '去搜索或导入一首吧';

  // 封面
  const disc = document.getElementById('lt-disc-cover');
  if (disc && song && song.cover) {
    disc.style.backgroundImage = `url(${song.cover})`;
  } else if (disc) {
    disc.style.backgroundImage = 'linear-gradient(135deg,#667eea,#764ba2)';
  }

  // 头像
  updateLtAvatars();
  updatePlayBtn();
}

function updatePlayBtn() {
  const s = window.musicState;
  const btn = document.getElementById('lt-play-btn');
  if (btn) {
    btn.className = s.isPlaying ? 'fas fa-pause-circle lt-play-btn' : 'fas fa-play-circle lt-play-btn';
  }
  // 旧播放器按钮
  const oldBtn = document.getElementById('mp-play-btn');
  if (oldBtn) {
    oldBtn.className = s.isPlaying ? 'fas fa-pause-circle mp-btn-lg' : 'fas fa-play-circle mp-btn-lg';
  }
}

function updateLtAvatars() {
  // 我的头像
  const meImg = document.getElementById('lt-avatar-me');
  if (meImg) {
    const myAvatar = document.querySelector('.avatar-circle-sm img')?.src || '';
    if (myAvatar) meImg.src = myAvatar;
  }
  // AI头像
  const aiImg = document.getElementById('lt-avatar-ai');
  if (aiImg) {
    const aiAvatar = document.querySelector('#chatLayer .chat-avatar-img')?.src ||
                     document.querySelector('.mind-big-avatar')?.src || '';
    if (aiAvatar) aiImg.src = aiAvatar;
  }
}

// ---- 播放列表渲染 ----
function renderPlaylist() {
  const container = document.getElementById('mp-playlist-container');
  if (!container) return;
  const s = window.musicState;
  const visible = s.playlist.filter(t => !t.hidden);
  if (visible.length === 0) {
    container.innerHTML = '<div class="lt-empty-tip">还没有歌曲，点击 🔍 搜索或 ＋ 导入</div>';
    return;
  }
  container.innerHTML = visible.map((song, vi) => {
    const realIdx = s.playlist.indexOf(song);
    const isActive = realIdx === s.currentIndex;
    return `<div class="lt-playlist-item ${isActive ? 'lt-active-song' : ''}" onclick="playAtIndex(${realIdx})">
      <div class="lt-pi-cover" style="background-image:url(${song.cover || ''})">
        ${!song.cover ? '<i class="fas fa-music"></i>' : ''}
      </div>
      <div class="lt-pi-info">
        <div class="lt-pi-title">${song.title || '未知歌曲'}</div>
        <div class="lt-pi-artist">${song.artist || '未知歌手'}</div>
      </div>
      ${isActive && s.isPlaying ? '<i class="fas fa-volume-up lt-pi-playing"></i>' : ''}
      <i class="fas fa-times lt-pi-del" onclick="event.stopPropagation();removeFromPlaylist(${realIdx})"></i>
    </div>`;
  }).join('');
}

function removeFromPlaylist(idx) {
  const s = window.musicState;
  s.playlist.splice(idx, 1);
  if (s.currentIndex >= idx) s.currentIndex = Math.max(1, s.currentIndex - 1);
  renderPlaylist();
  saveMusicState();
}

// ---- 歌词解析 ----
function parseLrc(lrcText) {
  const lines = lrcText.split('\n');
  const result = [];
  const re = /\[(\d+):(\d+\.?\d*)\](.*)/;
  for (const line of lines) {
    const m = line.match(re);
    if (m) {
      const time = parseInt(m[1]) * 60 + parseFloat(m[2]);
      result.push({ time, text: m[3].trim() });
    }
  }
  result.sort((a, b) => a.time - b.time);
  window.musicState.parsedLyrics = result;
  renderLyrics();
}

function renderLyrics() {
  const container = document.getElementById('lt-lyrics-container');
  if (!container) return;
  const lyrics = window.musicState.parsedLyrics;
  if (!lyrics.length) {
    container.innerHTML = '<div class="lt-no-lyrics">暂无歌词</div>';
    return;
  }
  container.innerHTML = lyrics.map((l, i) =>
    `<div class="lt-lyric-line" id="lyric-${i}">${l.text}</div>`
  ).join('');
}

function clearLyricsDisplay() {
  const container = document.getElementById('lt-lyrics-container');
  if (container) container.innerHTML = '<div class="lt-no-lyrics">暂无歌词</div>';
}

function updateLyricsHighlight() {
  const audio = getAudio();
  const lyrics = window.musicState.parsedLyrics;
  if (!lyrics.length || !audio.currentTime) return;
  const ct = audio.currentTime;
  let cur = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (ct >= lyrics[i].time) cur = i;
  }
  if (cur < 0) return;
  document.querySelectorAll('.lt-lyric-line').forEach((el, i) => {
    el.classList.toggle('lt-lyric-active', i === cur);
  });
  const el = document.getElementById(`lyric-${cur}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // 同步到悬浮歌词条
  if (window.updateFlbLyric) window.updateFlbLyric(lyrics[cur].text);
}

// 获取给AI读的歌词上下文（当前+后两句）
function getLyricsContext() {
  const audio = getAudio();
  const lyrics = window.musicState.parsedLyrics;
  if (!lyrics.length) return '';
  const ct = audio.currentTime || 0;
  let cur = 0;
  for (let i = 0; i < lyrics.length; i++) {
    if (ct >= lyrics[i].time) cur = i;
  }
  const slice = lyrics.slice(cur, cur + 3).map(l => l.text).filter(Boolean);
  return slice.join(' / ');
}

// ---- 翻转卡片 ----
function flipPlayerCard() {
  const inner = document.getElementById('lt-card-inner');
  if (inner) inner.classList.toggle('lt-flipped');
}

// ---- 音乐搜索 ----
const MUSIC_SOURCES = [
  { id: 'all',     name: '聚合',     api: 'https://api.vkeys.cn/v2/music?source=all&s=' },
  { id: 'netease', name: '网易云',   api: 'https://api.vkeys.cn/v2/music?source=netease&s=' },
  { id: 'qq',      name: 'QQ音乐',  api: 'https://api.vkeys.cn/v2/music?source=qq&s=' },
  { id: 'gd',      name: 'GD音乐台', api: 'https://api.gdstudio.xyz/music.php?format=json&source=netease&s=' }
];
let currentSource = 'all';

function openMusicSearch() {
  const modal = document.getElementById('music-search-modal');
  if (modal) modal.classList.add('ms-active');
  renderSourceBtns();
}

function closeMusicSearch() {
  const modal = document.getElementById('music-search-modal');
  if (modal) modal.classList.remove('ms-active');
}

function renderSourceBtns() {
  const row = document.getElementById('search-source-btns');
  if (!row) return;
  row.innerHTML = MUSIC_SOURCES.map(s =>
    `<button class="source-btn ${s.id === currentSource ? 'active' : ''}" onclick="setMusicSource('${s.id}')">${s.name}</button>`
  ).join('');
}

function setMusicSource(id) {
  currentSource = id;
  renderSourceBtns();
}

async function performMusicSearch() {
  const q = document.getElementById('music-search-input')?.value?.trim();
  if (!q) return;
  const res = document.getElementById('music-search-results');
  if (res) res.innerHTML = '<div class="search-loading"><i class="fas fa-spinner fa-spin"></i> 搜索中...</div>';

  // 按优先级尝试所有数据源，任一源有结果即停止
  const preferred = MUSIC_SOURCES.find(s => s.id === currentSource) || MUSIC_SOURCES[0];
  const orderedSources = [preferred, ...MUSIC_SOURCES.filter(s => s.id !== preferred.id)];
  let list = [], usedSource = preferred.id;
  for (const src of orderedSources) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 8000);
      const resp = await fetch(src.api + encodeURIComponent(q), { signal: ctrl.signal });
      clearTimeout(tid);
      if (!resp.ok) continue;
      const data = await resp.json();
      const cand = data.data || data.result || data.songs || data.list || [];
      if (cand.length) { list = cand; usedSource = src.id; break; }
    } catch (_) { /* 尝试下一个源 */ }
  }
  if (!list.length) {
    if (res) res.innerHTML = '<div class="search-empty">暂无结果，请稍后重试或换个关键词</div>';
    return;
  }
  res.innerHTML = list.slice(0, 20).map((item) => {
    const title = item.name || item.title || item.songname || '未知';
    const artist = Array.isArray(item.artists) ? item.artists.map(a => a.name || a).join('/') :
                   (item.artist || item.singer || '未知');
    const musicId = item.id || item.songid || item.mid || '';
    return `<div class="search-result-item" onclick="addSearchedSong(${JSON.stringify({title,artist,musicId,source:usedSource}).replace(/"/g,'&quot;')})">
      <div class="sri-info">
        <div class="sri-title">${title}</div>
        <div class="sri-artist">${artist}</div>
      </div>
      <i class="fas fa-plus-circle sri-add"></i>
    </div>`;
  }).join('');
}

async function addSearchedSong(info) {
  const res = document.getElementById('music-search-results');
  // 显示加载
  const hint = document.createElement('div');
  hint.className = 'search-loading';
  hint.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 正在获取 ${info.title}...`;
  if (res) res.prepend(hint);

  try {
    const song = await fetchSongDetails(info);
    addSongToPlaylist(song);
    hint.innerHTML = `<i class="fas fa-check" style="color:#07c160"></i> 已添加：${info.title}`;
    setTimeout(() => hint.remove(), 2000);
  } catch (e) {
    hint.innerHTML = `<i class="fas fa-times" style="color:#ff4d4f"></i> 获取失败`;
    setTimeout(() => hint.remove(), 2000);
  }
}

async function fetchSongDetails(info) {
  const { title, artist, musicId, source } = info;
  // 尝试 vkeys API 获取播放链接
  let src = '', cover = '', lrc = '';
  try {
    const r = await fetch(`https://api.vkeys.cn/v2/music?source=${source || 'netease'}&id=${musicId}`);
    const d = await r.json();
    src = d.data?.url || d.url || '';
    cover = d.data?.pic || d.data?.cover || d.cover || '';
    lrc = d.data?.lrc || d.lrc || '';
  } catch {}

  if (!src) {
    // 备用：GD API
    try {
      const r2 = await fetch(`https://api.gdstudio.xyz/music.php?format=json&source=netease&id=${musicId}`);
      const d2 = await r2.json();
      src = d2.url || '';
      cover = cover || d2.pic || '';
      lrc = lrc || d2.lrc || '';
    } catch {}
  }

  if (!src) throw new Error('无法获取播放链接');

  return {
    id: `search_${Date.now()}`,
    title, artist,
    src, cover, lrc,
    musicId,
    source: source || 'netease',
    addedAt: Date.now()
  };
}

// ---- 导入弹窗 ----
function openMusicImportModal() {
  const modal = document.getElementById('music-import-modal');
  if (modal) modal.classList.add('ms-active');
}

function closeMusicImportModal() {
  const modal = document.getElementById('music-import-modal');
  if (modal) modal.classList.remove('ms-active');
}

function handleMusicFile(input) {
  const file = input.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const name = file.name.replace(/\.[^.]+$/, '');
  addSongToPlaylist({ id: `local_${Date.now()}`, title: name, artist: '本地音乐', src: url, cover: '', lrc: '' });
  closeMusicImportModal();
}

let pendingLrcText = '';
function handleLrcFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => { pendingLrcText = e.target.result; };
  reader.readAsText(file, 'utf-8');
}

function confirmAddUrlSong() {
  const url = document.getElementById('music-url-input')?.value?.trim();
  const lrcUrl = document.getElementById('lrc-url-input')?.value?.trim();
  const name = document.getElementById('music-name-input')?.value?.trim() || '未命名';
  if (!url) { alert('请输入音频链接'); return; }

  const song = { id: `url_${Date.now()}`, title: name, artist: '', src: url, cover: '', lrc: '' };
  if (lrcUrl) {
    fetch(lrcUrl).then(r => r.text()).then(text => {
      song.lrc = text;
      addSongToPlaylist(song);
    }).catch(() => addSongToPlaylist(song));
  } else {
    addSongToPlaylist(song);
  }
  closeMusicImportModal();
}

// ---- 旧播放器兼容 ----
function openMusicPlayer() {
  const v = document.getElementById('musicPlayerView');
  if (v) v.classList.add('active');
}
function closeMusicPlayer() {
  const v = document.getElementById('musicPlayerView');
  if (v) v.classList.remove('active');
}
function triggerImportMusic() { openMusicImportModal(); }

// ---- 添加歌曲 ----
function addSongToPlaylist(song) {
  const s = window.musicState;
  // 去重
  if (s.playlist.find(t => t.src === song.src)) return;
  s.playlist.push(song);
  renderPlaylist();
  saveMusicState();

  // 若当前没有播放，自动播放新歌
  if (!s.isPlaying || s.currentIndex < 0) {
    playAtIndex(s.playlist.length - 1);
  }
}

// ---- AI 分享自动播放 ----
async function searchAndPlaySong(title, artist) {
  try {
    const q = `${title} ${artist || ''}`.trim();
    const resp = await fetch(`https://api.vkeys.cn/v2/music?source=netease&s=${encodeURIComponent(q)}`);
    const data = await resp.json();
    const list = data.data || [];
    if (!list.length) return;
    const item = list[0];
    const song = await fetchSongDetails({
      title: item.name || title,
      artist: Array.isArray(item.artists) ? item.artists.map(a => a.name).join('/') : (artist || ''),
      musicId: item.id || '',
      source: 'netease'
    });
    addSongToPlaylist(song);
    if (!window.musicState.listenTogetherActive) openListenTogetherPlayer();
  } catch (e) {
    console.warn('[Music] searchAndPlaySong failed:', e);
  }
}

// ---- AI 切歌指令 ----
window.changeMusicByAI = function(titleKeyword, artistKeyword) {
  const s = window.musicState;
  const visible = s.playlist.filter(t => !t.hidden);
  // 优先精确匹配歌名+歌手
  let match = visible.find(t =>
    t.title.includes(titleKeyword) &&
    (artistKeyword ? (t.artist || '').includes(artistKeyword) : true)
  );
  // 退而求其次只匹配歌名或歌手
  if (!match) {
    match = visible.find(t =>
      t.title.includes(titleKeyword) || (t.artist || '').includes(titleKeyword)
    );
  }
  if (match) {
    playAtIndex(s.playlist.indexOf(match));
  } else {
    // 播放列表里没有，去全网搜索
    searchAndPlaySong(titleKeyword, artistKeyword || '');
  }
};

// ---- 失效链接清理 ----
async function deleteExpiredSearchedSongs() {
  const s = window.musicState;
  const toCheck = s.playlist.filter(t => !t.hidden && t.musicId);
  let removed = 0;
  for (const song of toCheck) {
    try {
      const resp = await fetch(song.src, { method: 'HEAD' });
      if (!resp.ok) {
        const idx = s.playlist.indexOf(song);
        if (idx >= 0) s.playlist.splice(idx, 1);
        removed++;
      }
    } catch {
      const idx = s.playlist.indexOf(song);
      if (idx >= 0) s.playlist.splice(idx, 1);
      removed++;
    }
  }
  renderPlaylist();
  saveMusicState();
  alert(`已清理 ${removed} 条失效链接`);
}

// ---- 自动续期 ----
async function checkAndRenewSrc(idx) {
  const s = window.musicState;
  const song = s.playlist[idx];
  if (!song || !song.musicId) return;
  try {
    const refreshed = await fetchSongDetails({ title: song.title, artist: song.artist, musicId: song.musicId, source: song.source });
    song.src = refreshed.src;
    if (refreshed.cover) song.cover = refreshed.cover;
    saveMusicState();
    const audio = getAudio();
    audio.src = song.src;
    audio.play().catch(() => {});
  } catch {}
}

// ---- 通知 BGM 状态卡 ----
function updateNowPlayingBgm(title, artist) {
  const el = document.getElementById('now-playing-bgm');
  if (el) el.textContent = (title || '未知') + (artist ? ` - ${artist}` : '');
}

// ---- musicContext 供 apps.js 注入 ----
window.getMusicContext = function getMusicContext() {
  const s = window.musicState;
  if (!s.listenTogetherActive) return '';
  const song = s.playlist[s.currentIndex];
  if (!song || song.hidden) return '';

  const playlistNames = s.playlist.filter(t => !t.hidden).map(t => t.title).join('、');
  const lyricsCtx = getLyricsContext();

  return `\n[🎧 一起听上下文]\n当前播放：${song.title} - ${song.artist || '未知'}\n播放列表：${playlistNames || '无'}\n${lyricsCtx ? `当前歌词：${lyricsCtx}` : ''}`;
};

// ---- 旧API兼容存根 ----
function sendMusicShare() { toggleListenTogether(); }

// ---- DOMContentLoaded ----
document.addEventListener('DOMContentLoaded', () => {
  initMusicSystem();
});

// ======================================================
// 悬浮歌词条 (Floating Lyrics Bar) - FLB
// ======================================================
(function() {
  let _flbDragging = false;
  let _flbOffX = 0, _flbOffY = 0;
  let _flbLeft = null, _flbTop = null;

  window.showFloatingLyrics = function() {
    const bar = document.getElementById('floating-lyrics-bar');
    if (!bar) return;
    bar.style.display = 'flex';
    applyFlbStyle();
  };

  window.hideFloatingLyrics = function() {
    const bar = document.getElementById('floating-lyrics-bar');
    if (bar) bar.style.display = 'none';
    const panel = document.getElementById('flb-settings-panel');
    if (panel) panel.style.display = 'none';
    // update toggle button
    const btn = document.getElementById('lt-flb-toggle');
    if (btn) btn.classList.remove('active');
  };

  window.toggleFloatingLyrics = function() {
    const bar = document.getElementById('floating-lyrics-bar');
    if (!bar) return;
    if (bar.style.display === 'none' || bar.style.display === '') {
      showFloatingLyrics();
      const btn = document.getElementById('lt-flb-toggle');
      if (btn) btn.classList.add('active');
    } else {
      hideFloatingLyrics();
    }
  };

  window.updateFlbLyric = function(text) {
    const el = document.getElementById('flb-lyric-text');
    if (el && text) el.textContent = text;
  };

  window.toggleFlbSettings = function(e) {
    if (e) e.stopPropagation();
    const panel = document.getElementById('flb-settings-panel');
    if (!panel) return;
    panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'block' : 'none';
    if (panel.style.display === 'block') applyFlbStyle();
  };

  window.applyFlbStyle = function() {
    const bar = document.getElementById('floating-lyrics-bar');
    const textEl = document.getElementById('flb-lyric-text');
    if (!bar || !textEl) return;
    const size = document.getElementById('flb-font-size');
    const color = document.getElementById('flb-font-color');
    const opacity = document.getElementById('flb-bg-opacity');
    if (size) {
      const sz = size.value + 'px';
      textEl.style.fontSize = sz;
      const v = document.getElementById('flb-font-size-val');
      if (v) v.textContent = sz;
    }
    if (color) textEl.style.color = color.value;
    if (opacity) {
      const op = parseInt(opacity.value) / 100;
      bar.style.background = `rgba(0,0,0,${op})`;
      const v = document.getElementById('flb-bg-opacity-val');
      if (v) v.textContent = opacity.value + '%';
    }
  };

  // Drag support (mouse + touch)
  window.flbDragStart = function(e) {
    const bar = document.getElementById('floating-lyrics-bar');
    if (!bar) return;
    // ignore clicks on buttons
    if (e.target && e.target.classList.contains('flb-btn')) return;
    _flbDragging = true;
    const rect = bar.getBoundingClientRect();
    // Get phone container rect for relative coordinate conversion
    const phone = document.querySelector('.phone') || document.body;
    const phoneRect = phone.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    _flbOffX = clientX - rect.left;
    _flbOffY = clientY - rect.top;
    // switch to absolute positioning (relative to phone container)
    bar.style.transform = 'none';
    _flbLeft = rect.left - phoneRect.left;
    _flbTop = rect.top - phoneRect.top;
    bar.style.left = _flbLeft + 'px';
    bar.style.top = _flbTop + 'px';

    const onMove = (me) => {
      if (!_flbDragging) return;
      const cx = me.touches ? me.touches[0].clientX : me.clientX;
      const cy = me.touches ? me.touches[0].clientY : me.clientY;
      _flbLeft = cx - _flbOffX - phoneRect.left;
      _flbTop = cy - _flbOffY - phoneRect.top;
      // clamp to phone dimensions
      _flbLeft = Math.max(0, Math.min(phoneRect.width - bar.offsetWidth, _flbLeft));
      _flbTop = Math.max(0, Math.min(phoneRect.height - bar.offsetHeight, _flbTop));
      bar.style.left = _flbLeft + 'px';
      bar.style.top = _flbTop + 'px';
    };
    const onEnd = () => {
      _flbDragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  };
})();
