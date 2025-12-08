// Service Worker - 网络优先策略
// 每次访问优先从网络获取最新资源，离线时才使用缓存

const CACHE_NAME = 'diablo-web-v1';

// 需要缓存的资源（用于离线访问）
const CACHE_URLS = [
    '/diablo/',
    '/diablo/index.html',
    '/diablo/style.css',
    '/diablo/game.js',
    '/diablo/online.js',
    '/diablo/pocketbase.umd.js',
    '/diablo/items.png',
    '/diablo/bg.jpg',
    '/diablo/bg.mp3',
    '/diablo/bg.mp4'
];

// 安装时预缓存资源
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(CACHE_URLS))
            .then(() => self.skipWaiting()) // 立即激活新 SW
    );
});

// 激活时清理旧缓存
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim()) // 立即接管页面
    );
});

// 网络优先策略
self.addEventListener('fetch', event => {
    const request = event.request;

    // 只处理 http/https GET 请求
    if (request.method !== 'GET' || !request.url.startsWith('http')) {
        return;
    }

    // 跳过视频/音频的 range 请求（会返回 206）
    if (request.headers.get('range')) {
        return;
    }

    event.respondWith(
        fetch(request)
            .then(response => {
                // 只缓存成功的完整响应（排除 206 分段响应）
                if (response.ok && response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // 网络失败，尝试从缓存获取
                return caches.match(request);
            })
    );
});
