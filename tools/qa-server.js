'use strict';
// 仅本地验收入口：不写生产文件，不连接线上服务。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const portArg = process.argv.indexOf('--port');
const port = portArg < 0 ? 18765 : Number(process.argv[portArg + 1]);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('无效端口');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.ttf':'font/ttf', '.woff2':'font/woff2', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.ogg':'audio/ogg', '.ico':'image/x-icon' };
const offline = `// 本地 QA：线上脚本已由服务器隔离替换。
const CloudSync={isReady:true,isBound:false,showSyncDialog(){showNotification('本地验收：云同步已隔离');}};
const ChatSystem={isCollapsed:true,toggle(){this.isCollapsed=!this.isCollapsed;document.getElementById('chat-box').classList.toggle('collapsed',this.isCollapsed);},unreadCount:0};
function toggleChatBox(){ChatSystem.toggle();}
function sendChatMessage(){showNotification('本地验收：不会发送聊天消息');}
function toggleEmotePanel(){showNotification('本地验收：聊天服务已隔离');}
`;
const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self'; font-src 'self'");
    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
    function send(body, type='text/javascript') { response.setHeader('Content-Type', `${type}; charset=utf-8`); response.end(request.method === 'HEAD' ? undefined : body); }
    if (url.pathname === '/online.js') { send(offline); return; }
    if (url.pathname === '/market.js' || url.pathname === '/pocketbase.umd.js') { send('// 本地 QA：线上服务禁用'); return; }
    if (url.pathname === '/sw.js') { send("self.addEventListener('activate',()=>self.registration.unregister());"); return; }
    if (url.pathname === '/qa.html') {
        const original = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
        const touch=url.searchParams.get('touch')==='1' ? '1' : '0';
        send(original.replace('<head>', `<head><script src="/tools/qa-bootstrap.js?touch=${touch}"></script>`)
            .replace('</body>', '<script src="/tools/qa-fixture.js"></script></body>'), 'text/html');
        return;
    }
    let pathname;
    try { pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname); }
    catch { response.writeHead(400); response.end(); return; }
    const file = path.resolve(root, '.' + pathname);
    const extension = path.extname(file).toLowerCase();
    if (!file.startsWith(root + path.sep) || !types[extension] || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        response.writeHead(404); response.end('Not found'); return;
    }
    response.setHeader('Content-Type', types[extension]);
    response.setHeader('Content-Length', fs.statSync(file).size);
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(file).pipe(response);
});
server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ pid:process.pid, url:`http://127.0.0.1:${server.address().port}/qa.html`, original:`http://127.0.0.1:${server.address().port}/index.html` })));
