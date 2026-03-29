// service-worker.js
const CACHE_NAME = 'My-Beeper-v3'; // 每次重大更新后，把 v2 改成 v3, v4... 就能强制刷新
const urlsToCache = [
    './', 
    './index.html', 
    './css/style.css', 
    './css/animations.css', 
    './css/base.css', 
    './css/modules.css', 
    './css/overrides.css'
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
