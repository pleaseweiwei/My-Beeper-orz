// service-worker.js
const CACHE_NAME = 'My-Beeper-v7'; // 每次重大更新后递增版本号强制刷新
const urlsToCache = [
    './',
    './index.html',
    './manifest.json',
    './icon.png',
    /* ── CSS ── */
    './css/style.css',
    './css/animations.css',
    './css/base.css',
    './css/modules.css',
    './css/overrides.css',
    './css/bubble.css',
    './css/floatpet.css',
    './css/galgame.css',
    './css/music.css',
    './css/novel.css',
    './css/sms_phone.css',
    './css/tracker.css',
    './css/video_call.css',
    /* ── JS Core ── */
    './js/core.js',
    './js/apps.js',
    /* ── JS 功能模块 ── */
    './js/app_floatpet.js',
    './js/app_bubble.js',
    './js/app_live.js',
    './js/app_galgame.js',
    './js/app_groupchat.js',
    './js/app_imagegen.js',
    './js/app_lovespace.js',
    './js/app_map.js',
    './js/app_memory.js',
    './js/app_music.js',
    './js/app_novel.js',
    './js/app_pay.js',
    './js/app_persona.js',
    './js/app_pet.js',
    './js/app_phone_call.js',
    './js/app_sms.js',
    './js/app_tracker.js',
    './js/app_transfer.js',
    './js/app_voice_call.js',
    './js/app_worldbook.js',
    './js/app_arcade.js'
];

// 安装时缓存静态资源
self.addEventListener('install', event => {
    self.skipWaiting(); // 强制立即接管控制权
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
});

// 激活时清理旧版本的缓存（绝对不影响 localStorage 和 IndexedDB）
self.addEventListener('activate', event => {
    let wasUpdated = false;
    event.waitUntil(
        caches.keys().then(cacheNames => {
            const oldCaches = cacheNames.filter(name => name !== CACHE_NAME);
            wasUpdated = oldCaches.length > 0;
            return Promise.all(oldCaches.map(name => caches.delete(name)));
        }).then(() => self.clients.claim())
          .then(() => self.clients.matchAll({ includeUncontrolled: true }))
          .then(clients => {
              if (wasUpdated) {
                  clients.forEach(client => {
                      client.postMessage({ type: 'APP_UPDATED', version: CACHE_NAME });
                  });
              }
          })
    );
});

// 请求时：网络优先 (Network First)，网络失败才读取缓存
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // 如果网络请求成功，把最新的文件顺手存进缓存
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            })
            .catch(() => {
                // 如果断网了，才从缓存里拿旧版本
                return caches.match(event.request);
            })
    );
});
