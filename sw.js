// Service Worker - JS/CSS 强制最新，其他资源网络优先
const CACHE_NAME = 'diablo-web-v1';

// 安装时立即激活
self.addEventListener('install', event => {
    self.skipWaiting();
});

// 激活时立即接管页面
self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});

// fetch 策略
self.addEventListener('fetch', event => {
    const request = event.request;

    // 只处理 GET 请求
    if (request.method !== 'GET') {
        return;
    }

    const url = request.url;

    // JS、CSS、HTML 强制从服务器拿最新，不用缓存
    if (url.endsWith('.js') || url.endsWith('.css') || url.endsWith('.html') || url.endsWith('/')) {
        event.respondWith(fetch(request, { cache: 'no-store' }));
        return;
    }

    // 其他资源按默认方式
    event.respondWith(fetch(request));
});
