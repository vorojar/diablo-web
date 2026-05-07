#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_URL = 'http://127.0.0.1:4173/index.html';
const DEFAULT_SECONDS = 10;
const DEFAULT_FLOOR = 1;
const DEFAULT_QUALITY = 'low';
const DEFAULT_CDP_PORT = 9222;
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;

function parseArgs(argv) {
    const args = {
        url: DEFAULT_URL,
        seconds: DEFAULT_SECONDS,
        floor: DEFAULT_FLOOR,
        quality: DEFAULT_QUALITY,
        auto: false,
        killAll: false,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        cdpPort: DEFAULT_CDP_PORT
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--auto') {
            args.auto = true;
            continue;
        }
        if (arg === '--kill-all') {
            args.killAll = true;
            continue;
        }
        if (!arg.startsWith('--')) throw new Error(`未知参数: ${arg}`);
        const key = arg.slice(2);
        const value = argv[i + 1];
        if (value === undefined || value.startsWith('--')) throw new Error(`参数 ${arg} 缺少值`);
        i++;
        if (key === 'url') args.url = value;
        else if (key === 'seconds') args.seconds = Number(value);
        else if (key === 'floor') args.floor = Number(value);
        else if (key === 'quality') args.quality = value;
        else if (key === 'width') args.width = Number(value);
        else if (key === 'height') args.height = Number(value);
        else if (key === 'cdp-port') args.cdpPort = Number(value);
        else throw new Error(`未知参数: ${arg}`);
    }

    if (!Number.isFinite(args.seconds) || args.seconds <= 0) throw new Error('--seconds 必须是正数');
    if (!Number.isInteger(args.floor) || args.floor < 0) throw new Error('--floor 必须是非负整数');
    if (!['high', 'low'].includes(args.quality)) throw new Error('--quality 只支持 high 或 low');
    if (!Number.isInteger(args.width) || args.width < 320) throw new Error('--width 必须是大于等于 320 的整数');
    if (!Number.isInteger(args.height) || args.height < 240) throw new Error('--height 必须是大于等于 240 的整数');
    if (!Number.isInteger(args.cdpPort) || args.cdpPort < 1024 || args.cdpPort > 65535) throw new Error('--cdp-port 必须是 1024-65535 的整数');
    return args;
}

function requestJson(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(url, options, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
                    return;
                }
                try {
                    resolve(body ? JSON.parse(body) : null);
                } catch (err) {
                    reject(new Error(`JSON 解析失败: ${err.message}`));
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function requestText(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
                    return;
                }
                resolve(body);
            });
        }).on('error', reject);
    });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isPortFree(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
            server.close(() => resolve(true));
        });
        server.listen(port, '127.0.0.1');
    });
}

async function findFreePort(start) {
    for (let port = start; port < start + 100; port++) {
        if (await isPortFree(port)) return port;
    }
    throw new Error(`找不到可用端口: ${start}-${start + 99}`);
}

function contentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.html') return 'text/html; charset=utf-8';
    if (ext === '.js') return 'text/javascript; charset=utf-8';
    if (ext === '.css') return 'text/css; charset=utf-8';
    if (ext === '.json' || ext === '.webmanifest') return 'application/json; charset=utf-8';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.mp3') return 'audio/mpeg';
    if (ext === '.mp4') return 'video/mp4';
    if (ext === '.woff2') return 'font/woff2';
    return 'application/octet-stream';
}

async function startStaticServerIfNeeded(targetUrl) {
    const parsed = new URL(targetUrl);
    if (parsed.hostname !== '127.0.0.1' || parsed.port !== '4173') return null;
    try {
        await requestText(`${parsed.origin}/index.html`);
        return null;
    } catch (_) {
        // 4173 未启动时，用仓库根目录临时提供静态资源，保证脚本可重复运行。
    }

    const server = http.createServer((req, res) => {
        try {
            const reqUrl = new URL(req.url, parsed.origin);
            const decodedPath = decodeURIComponent(reqUrl.pathname === '/' ? '/index.html' : reqUrl.pathname);
            const filePath = path.resolve(ROOT, `.${decodedPath}`);
            if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }
            fs.readFile(filePath, (err, data) => {
                if (err) {
                    res.writeHead(err.code === 'ENOENT' ? 404 : 500);
                    res.end(err.code === 'ENOENT' ? 'Not found' : err.message);
                    return;
                }
                res.writeHead(200, {
                    'Content-Type': contentType(filePath),
                    'Cache-Control': 'no-store'
                });
                res.end(data);
            });
        } catch (err) {
            res.writeHead(500);
            res.end(err.message);
        }
    });

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(4173, '127.0.0.1', resolve);
    });
    return server;
}

function findChromeExecutable() {
    const envPath = process.env.CHROME_PATH || process.env.CHROME || process.env.CHROMIUM_PATH;
    const candidates = [
        envPath,
        path.join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env.PROGRAMFILES || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
        'chrome',
        'chromium',
        'msedge'
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (!candidate.includes(path.sep)) return candidate;
        if (fs.existsSync(candidate)) return candidate;
    }
    throw new Error('找不到 Chrome/Chromium，请设置 CHROME_PATH');
}

async function getBrowserVersion(port) {
    return requestJson(`http://127.0.0.1:${port}/json/version`);
}

async function ensureBrowser(targetUrl, viewport, cdpPort) {
    try {
        const version = await getBrowserVersion(cdpPort);
        return { port: cdpPort, launched: null, version };
    } catch (_) {
        // 没有现成的 CDP 浏览器时启动临时实例。
    }

    const port = await findFreePort(cdpPort);
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diablo-perf-cdp-'));
    const chrome = findChromeExecutable();
    const child = spawn(chrome, [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-extensions',
        '--mute-audio',
        `--window-size=${viewport.width},${viewport.height}`,
        'about:blank'
    ], {
        stdio: 'ignore',
        detached: false
    });

    for (let i = 0; i < 80; i++) {
        try {
            const version = await getBrowserVersion(port);
            return { port, launched: { child, userDataDir }, version };
        } catch (_) {
            await delay(250);
        }
    }
    child.kill();
    throw new Error('Chrome CDP 启动超时');
}

async function newPage(port, targetUrl) {
    const encoded = encodeURIComponent(targetUrl);
    const target = await requestJson(`http://127.0.0.1:${port}/json/new?${encoded}`, { method: 'PUT' });
    if (!target.webSocketDebuggerUrl) throw new Error('CDP target 缺少 webSocketDebuggerUrl');
    return target;
}

class CdpClient {
    constructor(wsUrl) {
        if (typeof WebSocket === 'undefined') {
            throw new Error('当前 Node 缺少全局 WebSocket，请使用 Node 22+');
        }
        this.wsUrl = wsUrl;
        this.nextId = 1;
        this.pending = new Map();
        this.events = [];
    }

    async connect() {
        this.ws = new WebSocket(this.wsUrl);
        await new Promise((resolve, reject) => {
            this.ws.addEventListener('open', resolve, { once: true });
            this.ws.addEventListener('error', reject, { once: true });
        });
        this.ws.addEventListener('message', (event) => this.onMessage(event.data));
        this.ws.addEventListener('close', () => {
            for (const { reject } of this.pending.values()) reject(new Error('CDP WebSocket 已关闭'));
            this.pending.clear();
        });
    }

    onMessage(data) {
        const msg = JSON.parse(data);
        if (msg.id && this.pending.has(msg.id)) {
            const { resolve, reject } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) reject(new Error(`${msg.error.message}: ${msg.error.data || ''}`));
            else resolve(msg.result);
            return;
        }
        if (msg.method) this.events.push(msg);
    }

    send(method, params = {}) {
        const id = this.nextId++;
        this.ws.send(JSON.stringify({ id, method, params }));
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
        });
    }

    async evaluate(expression, awaitPromise = false) {
        const result = await this.send('Runtime.evaluate', {
            expression,
            awaitPromise,
            returnByValue: true,
            userGesture: true
        });
        if (result.exceptionDetails) {
            const text = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
            throw new Error(text);
        }
        return result.result.value;
    }

    async evaluateWhenStable(expression, awaitPromise = false, timeoutMs = 10000) {
        const deadline = Date.now() + timeoutMs;
        let lastError = null;
        while (Date.now() < deadline) {
            try {
                return await this.evaluate(expression, awaitPromise);
            } catch (err) {
                lastError = err;
                if (!String(err.message).includes('Execution context was destroyed')) throw err;
                await delay(100);
            }
        }
        throw lastError || new Error('页面执行上下文等待超时');
    }

    waitForEvent(method, timeoutMs) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error(`等待 ${method} 超时`));
            }, timeoutMs);
            const onMessage = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.method !== method) return;
                cleanup();
                resolve(msg.params || {});
            };
            const cleanup = () => {
                clearTimeout(timeout);
                this.ws.removeEventListener('message', onMessage);
            };
            this.ws.addEventListener('message', onMessage);
        });
    }

    async waitForLoad() {
        await this.send('Page.enable');
        await this.send('Runtime.enable');
        for (let i = 0; i < 50; i++) {
            const ready = await this.evaluateWhenStable('document.readyState', false, 2000);
            if (ready === 'complete') return;
            try {
                await this.waitForEvent('Page.loadEventFired', 500);
                return;
            } catch (_) {
                await delay(100);
            }
        }
        throw new Error('页面加载等待超时');
    }

    close() {
        if (this.ws) this.ws.close();
    }
}

function injectionSource(options) {
    return `(() => {
        const options = ${JSON.stringify(options)};
        const metricNames = ['update', 'draw', 'updateEnemies', 'AutoBattle', 'hasLineOfSight', 'labels', 'minimap'];

        function install() {
            if (window.__perfProbeInstalled) return;
            const samples = Object.fromEntries(metricNames.map(name => [name, []]));
            const originals = {};

            function wrapGlobal(name, metricName) {
                try {
                    const original = eval(name);
                    if (typeof original !== 'function') return false;
                    originals[name] = original;
                    const wrapped = function(...args) {
                        const start = performance.now();
                        try {
                            return original.apply(this, args);
                        } finally {
                            samples[metricName].push(performance.now() - start);
                        }
                    };
                    eval(name + ' = wrapped');
                    return true;
                } catch (_) {
                    return false;
                }
            }

            function wrapObject(objectName, prop, metricName) {
                try {
                    const obj = eval(objectName);
                    const original = obj && obj[prop];
                    if (typeof original !== 'function') return false;
                    originals[objectName + '.' + prop] = original;
                    obj[prop] = function(...args) {
                        const start = performance.now();
                        try {
                            return original.apply(this, args);
                        } finally {
                            samples[metricName].push(performance.now() - start);
                        }
                    };
                    return true;
                } catch (_) {
                    return false;
                }
            }

            wrapGlobal('update', 'update');
            wrapGlobal('draw', 'draw');
            wrapGlobal('updateEnemies', 'updateEnemies');
            wrapGlobal('hasLineOfSight', 'hasLineOfSight');
            wrapGlobal('updateLabelsPosition', 'labels');
            wrapGlobal('updateWorldLabels', 'labels');
            wrapGlobal('drawMinimap', 'minimap');
            wrapObject('AutoBattle', 'decideAction', 'AutoBattle');

            window.__perfProbe = {
                samples,
                snapshot() {
                    const list = typeof enemies === 'undefined' ? [] : enemies;
                    return {
                        enemies: list.length,
                        alive: list.filter(e => e && !e.dead).length,
                        particles: typeof particles === 'undefined' ? null : particles.length,
                        projectiles: typeof projectiles === 'undefined' ? null : projectiles.length,
                        groundItems: typeof groundItems === 'undefined' ? null : groundItems.length,
                        canvasWidth: typeof canvas === 'undefined' ? null : canvas.width,
                        canvasHeight: typeof canvas === 'undefined' ? null : canvas.height,
                        windowWidth: window.innerWidth,
                        windowHeight: window.innerHeight
                    };
                },
                stats() {
                    const out = {};
                    for (const name of metricNames) {
                        const values = samples[name].slice().sort((a, b) => a - b);
                        const n = values.length;
                        const sum = values.reduce((a, b) => a + b, 0);
                        out[name] = {
                            n,
                            avg: n ? Number((sum / n).toFixed(3)) : 0,
                            p95: n ? Number(values[Math.min(n - 1, Math.floor(n * 0.95))].toFixed(3)) : 0,
                            max: n ? Number(values[n - 1].toFixed(3)) : 0
                        };
                    }
                    return out;
                }
            };
            window.__perfProbeInstalled = true;
        }

        function setupGame() {
            install();
            if (typeof player !== 'undefined') {
                player.graphicsQuality = options.quality;
                player.autoBattleFeeNotified = true;
            }
            if (document.body) document.body.classList.toggle('high-quality', options.quality === 'high');
            const select = document.getElementById('select-graphics-quality');
            if (select) select.value = options.quality;
            if (typeof resize === 'function') resize();

            if (typeof gameActive !== 'undefined' && !gameActive && typeof startGame === 'function') {
                startGame();
            }
            if (Number.isInteger(options.floor) && typeof enterFloor === 'function') {
                enterFloor(options.floor);
            }
            if (options.auto) {
                try {
                    AutoBattle.enabled = true;
                    AutoBattle.sessionGold = 0;
                    AutoBattle.sessionFee = 0;
                } catch (_) {}
            }
            if (options.killAll && typeof enemies !== 'undefined') {
                for (const enemy of enemies) {
                    if (!enemy) continue;
                    enemy.hp = 0;
                    enemy.dead = true;
                    enemy.deadAt = Date.now();
                }
            }
            return window.__perfProbe.snapshot();
        }

        return setupGame();
    })()`;
}

async function runProbe(args) {
    const staticServer = await startStaticServerIfNeeded(args.url);
    const browser = await ensureBrowser(args.url, { width: args.width, height: args.height }, args.cdpPort);
    const target = await newPage(browser.port, args.url);
    const cdp = new CdpClient(target.webSocketDebuggerUrl);

    try {
        await cdp.connect();
        await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: args.width,
            height: args.height,
            deviceScaleFactor: 1,
            mobile: false
        });
        await cdp.waitForLoad();
        await cdp.evaluateWhenStable(`new Promise(resolve => {
            const done = () => resolve(true);
            if (document.fonts && document.fonts.ready) document.fonts.ready.then(done, done);
            else setTimeout(done, 300);
        })`, true);
        await cdp.evaluateWhenStable(`new Promise(resolve => {
            const ready = () => typeof update === 'function' && typeof draw === 'function' && typeof updateEnemies === 'function';
            if (ready()) return resolve(true);
            const deadline = performance.now() + 5000;
            const tick = () => ready() || performance.now() > deadline ? resolve(ready()) : setTimeout(tick, 50);
            tick();
        })`, true);

        const before = await cdp.evaluateWhenStable(injectionSource(args));
        await delay(args.seconds * 1000);
        const after = await cdp.evaluateWhenStable('window.__perfProbe.snapshot()');
        const metrics = await cdp.evaluateWhenStable('window.__perfProbe.stats()');

        return {
            url: args.url,
            seconds: args.seconds,
            floor: args.floor,
            quality: args.quality,
            auto: args.auto,
            cdpPort: browser.port,
            serverStarted: Boolean(staticServer),
            before,
            after,
            metrics
        };
    } finally {
        cdp.close();
        if (staticServer) staticServer.close();
        if (browser.launched) {
            browser.launched.child.kill();
            fs.rm(browser.launched.userDataDir, { recursive: true, force: true }, () => {});
        }
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const result = await runProbe(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch(err => {
    process.stderr.write(`perf-probe 失败: ${err.stack || err.message}\n`);
    process.exitCode = 1;
});
