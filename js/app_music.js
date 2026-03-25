/* =========================================
   [新增] 音乐播放器核心逻辑
   ========================================= */

const MUSIC_DATA_KEY = 'myCoolPhone_musicPlaylist';
let musicPlaylist = [];
let currentSongIndex = -1;
let isPlaying = false;
const audioEl = document.getElementById('global-audio-player');

// 1. 初始化：加载数据并恢复首页文字
document.addEventListener('DOMContentLoaded', () => {
    loadMusicData();
    restoreHomeMusicText();
    
    // 音频播放结束自动下一首
    if(audioEl) {
        audioEl.onended = () => {
            const currentTrack = musicPlaylist[currentSongIndex];
            if (currentTrack && currentTrack.isKeepAlive) {
                audioEl.currentTime = 0;
                audioEl.play();
            } else {
                playNextSong();
            }
        };
        
        // 防系统杀进程的“重置 Hack”
        audioEl.addEventListener("timeupdate", () => {
            const currentTrack = musicPlaylist[currentSongIndex];
            if (currentTrack && currentTrack.isKeepAlive && audioEl.currentTime > 600) {
                audioEl.currentTime = 0; // 强制拉回0秒
                if (audioEl.paused) audioEl.play();
            }
        });
    }

    initKeepAliveUnlocker();
});

// 交互式静默激活 (Bypass Autoplay)
function initKeepAliveUnlocker() {
    let strongPlayer = document.getElementById('strong-keep-alive-player');
    if (!strongPlayer) {
        strongPlayer = document.createElement('audio');
        strongPlayer.id = 'strong-keep-alive-player';
        strongPlayer.src = 'https://files.catbox.moe/7jn7bp.mp3';
        strongPlayer.loop = true;
        strongPlayer.style.display = 'none';
        document.body.appendChild(strongPlayer);
    }

    const unlocker = () => {
        if (strongPlayer) {
            strongPlayer.volume = 0;
            strongPlayer.play().catch(e => console.log('Keep-alive unlock failed', e));
        }
        document.removeEventListener('click', unlocker);
        document.removeEventListener('touchstart', unlocker);
    };
    document.addEventListener('click', unlocker);
    document.addEventListener('touchstart', unlocker);
}

// 加载数据
async function loadMusicData() {
    // 尝试从 IDB (大容量) 获取
    const data = await IDB.get(MUSIC_DATA_KEY);
    if (data && Array.isArray(data)) {
        musicPlaylist = data.filter(t => !t.isKeepAlive);
    } else {
        // 默认歌曲
        musicPlaylist = [
            { name: "Lover", artist: "Taylor Swift", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", type: "link" }
        ];
    }
    
    // 幽灵音轨”深度植入
    musicPlaylist.unshift({
        name: "【后台保活模式】(静音)",
        artist: "系统",
        src: "https://files.catbox.moe/7jn7bp.mp3",
        type: "link",
        isKeepAlive: true,
        lyrics: "[00:00.00]⚠️ 后台保活运行中...\n[00:02.00]此音频无声\n[00:05.00]用于防止API请求中断。"
    });
    
    renderPlaylist();
}

async function saveMusicData() {
    const toSave = musicPlaylist.filter(t => !t.isKeepAlive);
    await IDB.set(MUSIC_DATA_KEY, toSave);
}

// 提供给 AI 的上下文接口（智能屏蔽）
window.getMusicContextForAI = function() {
    const currentTrack = musicPlaylist[currentSongIndex];
    if (currentTrack && currentTrack.isKeepAlive) {
        return "";
    }
    return currentTrack ? `正在播放：${currentTrack.name} - ${currentTrack.artist}` : "";
};

window.getPlaylistForAI = function() {
    return musicPlaylist.filter(t => !t.isKeepAlive);
};

// 2. 界面控制
window.openMusicPlayer = function() {
    document.getElementById('musicPlayerView').classList.add('show');
    renderPlaylist();
}
window.closeMusicPlayer = function() {
    document.getElementById('musicPlayerView').classList.remove('show');
}

// 3. 导入音乐
window.triggerImportMusic = function() {
    const choice = confirm("导入音乐：\n点击【确定】选择本地 MP3 文件\n点击【取消】输入网络链接");
    if(choice) {
        document.getElementById('music-file-input').click();
    } else {
        const url = prompt("请输入音频 URL (.mp3):");
        const name = prompt("请输入歌名:");
        if(url && name) {
            addSongToPlaylist(name, "Unknown", url, "link");
        }
    }
}

window.handleMusicFile = function(input) {
    const file = input.files[0];
    if(!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        // 将文件转为 Base64 存入 (注意：文件太大可能会卡，建议控制大小)
        addSongToPlaylist(file.name.replace(/\.[^/.]+$/, ""), "Local File", e.target.result, "file");
    };
    reader.readAsDataURL(file);
    input.value = '';
}

function addSongToPlaylist(name, artist, src, type) {
    musicPlaylist.push({ name, artist, src, type });
    saveMusicData();
    renderPlaylist();
    // 如果列表只有这一首，自动选中
    if(musicPlaylist.length === 1) playMusic(0);
}

// 4. 渲染列表
function renderPlaylist() {
    const container = document.getElementById('mp-playlist-container');
    if(!container) return;
    container.innerHTML = '';
    
    musicPlaylist.forEach((song, idx) => {
        const div = document.createElement('div');
        div.className = `mp-item ${idx === currentSongIndex ? 'active' : ''}`;
        div.innerHTML = `
            <div class="mp-item-info" onclick="playMusic(${idx})">
                <div style="font-size:14px; font-weight:600;">${song.name}</div>
                <div style="font-size:11px; color:#999;">${song.artist}</div>
            </div>
            <i class="fas fa-trash" style="color:#ddd; padding:10px;" onclick="deleteSong(${idx})"></i>
        `;
        container.appendChild(div);
    });
}

// 5. 播放控制核心
window.playMusic = function(index) {
    if(index < 0 || index >= musicPlaylist.length) return;
    
    currentSongIndex = index;
    const song = musicPlaylist[index];
    
    audioEl.src = song.src;
    audioEl.play();
    isPlaying = true;
    
    updatePlayerUI();
    updateHomeWidgetUI(true); // 让唱片转起来
    renderPlaylist(); // 更新高亮
}

window.toggleMusicPlay = function() {
    if(audioEl.paused) {
        if(audioEl.src) {
            audioEl.play();
            isPlaying = true;
        } else if (musicPlaylist.length > 0) {
            playMusic(0);
        }
    } else {
        audioEl.pause();
        isPlaying = false;
    }
    updatePlayerUI();
    updateHomeWidgetUI(isPlaying);
}

window.playNextSong = function() {
    if (musicPlaylist.length === 0) return;
    let next = currentSongIndex + 1;
    if(next >= musicPlaylist.length) next = 0;
    
    // 跳过逻辑 (Skip Logic)：跳过保活音频
    let originalNext = next;
    while(musicPlaylist[next] && musicPlaylist[next].isKeepAlive) {
        next++;
        if(next >= musicPlaylist.length) next = 0;
        if(next === originalNext) break;
    }
    
    playMusic(next);
}

window.playPrevSong = function() {
    if (musicPlaylist.length === 0) return;
    let prev = currentSongIndex - 1;
    if(prev < 0) prev = musicPlaylist.length - 1;
    
    // 跳过逻辑 (Skip Logic)：跳过保活音频
    let originalPrev = prev;
    while(musicPlaylist[prev] && musicPlaylist[prev].isKeepAlive) {
        prev--;
        if(prev < 0) prev = musicPlaylist.length - 1;
        if(prev === originalPrev) break;
    }
    
    playMusic(prev);
}

window.deleteSong = function(index) {
    if(confirm("确定删除这首歌吗？")) {
        // 如果删的是当前正在放的，先停止
        if(index === currentSongIndex) {
            audioEl.pause();
            isPlaying = false;
            updateHomeWidgetUI(false);
            audioEl.src = '';
            currentSongIndex = -1;
        } else if (index < currentSongIndex) {
            currentSongIndex--;
        }
        
        musicPlaylist.splice(index, 1);
        saveMusicData();
        renderPlaylist();
    }
}

// 6. UI 同步更新
function updatePlayerUI() {
    const btn = document.getElementById('mp-play-btn');
    const song = musicPlaylist[currentSongIndex];
    
    if(isPlaying) {
        btn.className = 'fas fa-pause-circle mp-btn-lg';
        document.getElementById('musicPlayerView').classList.add('playing');
    } else {
        btn.className = 'fas fa-play-circle mp-btn-lg';
        document.getElementById('musicPlayerView').classList.remove('playing');
    }
    
    if(song) {
        document.getElementById('mp-title-display').innerText = song.name;
        document.getElementById('mp-artist-display').innerText = song.artist;
        
        // 同步更新首页文字
        const hTitle = document.getElementById('home-music-title');
        const hArtist = document.getElementById('home-music-artist');
        if(hTitle) hTitle.innerText = song.name;
        if(hArtist) hArtist.innerText = song.artist;
        saveHomeMusicText(); // 保存文字状态
    }
}

function updateHomeWidgetUI(playing) {
    const widget = document.getElementById('home-music-widget');
    if(widget) {
        if(playing) widget.classList.add('playing');
        else widget.classList.remove('playing');
    }
}

// 7. 首页文字编辑与储存
window.saveHomeMusicText = function() {
    const title = document.getElementById('home-music-title').innerText;
    const artist = document.getElementById('home-music-artist').innerText;
    
    const data = { title, artist };
    localStorage.setItem('myCoolPhone_homeMusicText', JSON.stringify(data));
}

function restoreHomeMusicText() {
    const data = JSON.parse(localStorage.getItem('myCoolPhone_homeMusicText') || '{}');
    if(data.title) document.getElementById('home-music-title').innerText = data.title;
    if(data.artist) document.getElementById('home-music-artist').innerText = data.artist;
}
