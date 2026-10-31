// 战斗表现只读取帧与计时，不参与伤害、位移或存档。
const CombatVisuals = (() => {
    let highQuality = true, time = 0, frostBudget = 2, lightBudget = 1;
    let attacks = new WeakMap();
    let frameCost = 0, overloaded = false, recoveryFrames = 0, crowded = false;
    let decorationBudget = 48, focusBudget = 16, focusX = 0, focusY = 0;
    let warmPlan = null, warmIndex = 0, idleHandle = null, warmGeneration = 0, warmed = 0;
    let warmCost = 1;
    const feedbacks = [];

    function surfaceCache(maxEntries, maxBytes, build) {
        let sources = new WeakMap(), nextId = 0, bytes = 0, builds = 0;
        const entries = new Map();
        return {
            get(source, sx, sy, sw, sh, kind, material) {
                if (!sources.has(source)) sources.set(source, ++nextId);
                const key = `${sources.get(source)}:${sx},${sy},${sw},${sh}`;
                if (entries.has(key)) {
                    const value = entries.get(key);
                    entries.delete(key); entries.set(key, value);
                    return value;
                }
                if (!highQuality || (kind === 'frost' ? frostBudget <= 0 : lightBudget <= 0)) return null;
                const scale = kind === 'frost' ? Math.min(1, 96 / Math.max(sw, sh)) : 1;
                const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
                const cost = w * h * (kind === 'frost' ? 4 : 8);
                if (cost > maxBytes) return null;
                if (kind === 'frost') frostBudget--; else lightBudget--;
                while (entries.size >= maxEntries || bytes + cost > maxBytes) {
                    const oldest = entries.keys().next().value, value = entries.get(oldest);
                    for (const canvas of value.canvases) { canvas.width = 0; canvas.height = 0; }
                    bytes -= value.bytes; entries.delete(oldest);
                }
                const value = build(source, sx, sy, sw, sh, w, h, material);
                value.bytes = cost; bytes += cost; builds++;
                entries.set(key, value);
                return value;
            },
            clear() {
                for (const value of entries.values()) for (const canvas of value.canvases) { canvas.width = 0; canvas.height = 0; }
                entries.clear(); sources = new WeakMap(); nextId = 0; bytes = 0;
            },
            stats() { return { entries: entries.size, bytes, builds, maxEntries, maxBytes }; }
        };
    }
    function canvasFor(w, h) {
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        return canvas;
    }
    function frostSurface(source, sx, sy, sw, sh, w, h) {
        const canvas = canvasFor(w, h), ctx = canvas.getContext('2d');
        ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
        // 只在首次缓存时读取最多96×96像素；轮廓、冰纹和闪点随当前素材帧一起翻转。
        const mask = ctx.getImageData(0, 0, w, h).data;
        const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[(y * w + x) * 4 + 3] > 90;
        ctx.clearRect(0, 0, w, h);
        const glints = [];
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
            if (!inside(x, y)) continue;
            const edge = !inside(x - 1, y) || !inside(x, y - 1) || !inside(x + 1, y);
            if (edge) {
                ctx.fillStyle = (x + y) % 5 < 2 ? '#e6fbff' : 'rgba(106,194,229,.65)';
                ctx.fillRect(x, y, 1, 1);
                if (glints.length < 5 && (x * 7 + y * 13) % 23 === 0) glints.push({ x, y });
            } else if ((x * 13 + y * 7) % 79 < 3 && y > h * .18) {
                ctx.fillStyle = 'rgba(219,246,255,.75)'; ctx.fillRect(x, y, 1, 1);
                for (let k = 1; k <= 3; k++) {
                    if (inside(x + k, y - k)) ctx.fillRect(x + k, y - k, 1, 1);
                    if (inside(x - k, y - k)) ctx.fillRect(x - k, y - k, 1, 1);
                }
            }
            if (y < h * .85 && y > h * .25 && !inside(x, y + 1) && x % 9 === 0) {
                ctx.fillStyle = 'rgba(159,221,246,.8)';
                ctx.beginPath(); ctx.moveTo(x - 1, y); ctx.lineTo(x, Math.min(h - 1, y + 4)); ctx.lineTo(x + 1, y); ctx.fill();
            }
        }
        return { canvases: [canvas], glints };
    }
    function lightSurfaces(source, sx, sy, sw, sh, w, h, material) {
        const body = canvasFor(w, h), light = canvasFor(w, h), ctx = body.getContext('2d');
        ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
        const pixels = ctx.getImageData(0, 0, w, h), glow = light.getContext('2d').createImageData(w, h);
        const p = pixels.data, g = glow.data;
        g.set(p);
        for (let i = 3; i < p.length; i += 4) p[i] = 0;
        // 只在实体包围盒内计算分层；外围直接保留原加色像素，避免扫描全帧求光照。
        const left = Math.max(0, Math.floor(material.x - material.rx)), right = Math.min(w - 1, Math.ceil(material.x + material.rx));
        const top = Math.max(0, Math.floor(material.y - material.ry)), bottom = Math.min(h - 1, Math.ceil(material.y + material.ry));
        for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
            const i = (y * w + x) * 4;
            if (!g[i + 3]) continue;
            const dx = (x - material.x) / material.rx, dy = (y - material.y) / material.ry;
            const coverage = Math.max(0, Math.min(1, (1 - dx * dx - dy * dy) * 4));
            const energy = Math.max(0, Math.min(.85, (Math.max(g[i], g[i + 1], g[i + 2]) - 80) / 175 * .85));
            // 两层alpha之和不变，黑底不重复增亮，实体外的黑色底不会变成黑边。
            const bodyAlpha = Math.round(g[i + 3] * coverage * (1 - energy));
            g[i + 3] -= bodyAlpha; p[i + 3] = bodyAlpha;
        }
        ctx.putImageData(pixels, 0, 0); light.getContext('2d').putImageData(glow, 0, 0);
        return { canvases: [body, light] };
    }
    const frostCache = surfaceCache(48, 2 * 1024 * 1024, frostSurface);
    const lightCache = surfaceCache(32, 4 * 1024 * 1024, lightSurfaces);

    function cancelWarmup() {
        warmGeneration++;
        if (idleHandle !== null && typeof cancelIdleCallback === 'function') cancelIdleCallback(idleHandle);
        idleHandle = null;
    }
    function scheduleWarmup() {
        if (!warmPlan || warmIndex >= warmPlan.frames.length || !highQuality || idleHandle !== null ||
            typeof requestIdleCallback !== 'function' || document.hidden) return;
        const generation = warmGeneration;
        idleHandle = requestIdleCallback(deadline => {
            if (generation !== warmGeneration) return;
            idleHandle = null;
            // 不强制超时执行；独立的空闲切片每次最多准备一帧，不改变渲染构建名额。
            if (!highQuality || document.hidden) return;
            const available = deadline.timeRemaining();
            if (!overloaded && !crowded && available >= Math.max(2, warmCost * 1.4)) {
                const f = warmPlan.frames[warmIndex++], before = lightCache.stats().builds;
                const renderBudget = lightBudget; lightBudget = 1;
                const started = typeof performance === 'undefined' ? Date.now() : performance.now();
                lightCache.get(warmPlan.source, f.x, f.y, f.w, f.h, 'light', f.material);
                const elapsed = (typeof performance === 'undefined' ? Date.now() : performance.now()) - started;
                warmCost = Math.max(.5, Math.min(5, warmCost * .75 + elapsed * .25));
                lightBudget = renderBudget;
                warmed += lightCache.stats().builds - before;
            } else if (!overloaded && !crowded && available >= 2) {
                // 首次解码/GC的偶发高耗时不能永久抬高门槛；有短空闲窗口时逐步重新评估。
                warmCost = Math.max(.5, warmCost * .9);
            }
            scheduleWarmup();
        });
    }
    function warm(source, effects, high = highQuality) {
        cancelWarmup();
        const frames = [];
        for (const effect of Object.values(effects)) if (effect.blend === 'split') {
            for (let i = 0; i < effect.frameCount; i++) frames.push({x:i*effect.frameWidth,y:effect.row*effect.frameHeight,w:effect.frameWidth,h:effect.frameHeight,material:effect.material});
        }
        warmPlan = {source, frames}; warmIndex = 0; highQuality = high;
        scheduleWarmup();
    }
    function sampleFrame(ms) {
        if (!Number.isFinite(ms) || ms <= 0) return;
        frameCost = frameCost ? frameCost * .9 + Math.min(ms, 100) * .1 : Math.min(ms, 100);
        if (frameCost > 14) { overloaded = true; recoveryFrames = 0; }
        else if (overloaded) {
            recoveryFrames = frameCost < 9 ? recoveryFrames + 1 : 0;
            if (recoveryFrames >= 60) { overloaded = false; recoveryFrames = 0; }
        }
    }
    function setQuality(high) {
        if (highQuality === high) return;
        highQuality = high; cancelWarmup();
        if (high) scheduleWarmup();
        else { frostCache.clear(); lightCache.clear(); warmIndex = 0; }
    }
    function beginFrame(high, now, x = 0, y = 0, load = 0) {
        setQuality(high);
        time = now; focusX = x; focusY = y; crowded = load > 100;
        frostBudget = high ? 2 : 0; lightBudget = high ? 1 : 0;
        decorationBudget = high ? overloaded || crowded ? 16 : 48 : 8;
        focusBudget = high ? overloaded || crowded ? 8 : 16 : 4;
        scheduleWarmup();
    }
    function allowDecoration(x, y) {
        const dx = x - focusX, dy = y - focusY;
        if (dx * dx + dy * dy <= 14400 && focusBudget > 0) { focusBudget--; return true; }
        if (decorationBudget <= 0) return false;
        decorationBudget--; return true;
    }
    function isDecoration(particle) { return particle.cosmetic === true || particle.type === 'skill_ground_glow' || particle.type === 'rising_spark'; }
    function frost(ctx, source, frame, x, y, w, h, remaining = Infinity) {
        if (!highQuality || !(remaining > 0)) return;
        const surface = frostCache.get(source, frame.x, frame.y, frame.width, frame.height, 'frost');
        if (!surface) return;
        const canvas = surface.canvases[0];
        ctx.save(); ctx.globalAlpha *= Math.min(1, remaining / .22);
        ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, x, y, w, h);
        ctx.fillStyle = '#effcff';
        ctx.globalAlpha *= .25 + .45 * Math.pow(Math.max(0, Math.sin(time * 5)), 6);
        for (const point of surface.glints) ctx.fillRect(x + point.x / canvas.width * w, y + point.y / canvas.height * h, 1.4, 1.4);
        ctx.restore();
    }
    function coldGround(ctx, x, y, radius, frozen, remaining) {
        ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
        ctx.globalAlpha *= Math.min(1, remaining / .25) * (frozen ? .65 : .28);
        ctx.strokeStyle = frozen ? '#baeafb' : '#739cae'; ctx.lineWidth = frozen ? 1.2 : 1;
        const reach = Math.min(32, Math.max(12, radius * 1.5));
        ctx.beginPath(); ctx.ellipse(x, y, reach, reach * .24, 0, 0, Math.PI * 2); ctx.stroke();
        if (frozen) {
            ctx.fillStyle = '#acd9e9'; ctx.beginPath();
            const n = highQuality ? 6 : 3;
            for (let i = 0; i < n; i++) {
                const a = i * 2.399, px = x + Math.cos(a) * reach, py = y + Math.sin(a) * reach * .24;
                ctx.moveTo(px - 2, py); ctx.lineTo(px, py - 3 - i % 3); ctx.lineTo(px + 2, py);
            }
            ctx.fill();
        }
        ctx.restore();
    }
    function vfx(ctx, source, sx, sy, sw, sh, x, y, w, h, split, material) {
        if (!split) { ctx.drawImage(source, sx, sy, sw, sh, x, y, w, h); return; }
        const surface = highQuality ? lightCache.get(source, sx, sy, sw, sh, 'light', material) : null;
        ctx.save(); ctx.globalCompositeOperation = 'source-over';
        if (surface) {
            ctx.drawImage(surface.canvases[0], 0, 0, sw, sh, x, y, w, h);
            ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(surface.canvases[1], 0, 0, sw, sh, x, y, w, h);
        } else {
            // 冷缓存与性能模式沿用原加色光效，避免旧图集黑底变成黑边。
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(source, sx, sy, sw, sh, x, y, w, h);
        }
        ctx.restore();
    }
    function trackAttack(enemy, attack, duration) { attacks.set(enemy, { attack, delay: attack.timer, duration }); }
    function monsterFrame(enemy, fallback) {
        const cue = attacks.get(enemy);
        if (!cue || cue.attack.cancelled) return fallback;
        if (cue.attack.timer > 0) return Math.min(1, Math.floor((1 - cue.attack.timer / cue.delay) * 2));
        const recovery = Math.max(.001, cue.duration - cue.delay);
        return 2 + Math.min(1, Math.floor(Math.max(0, 1 - enemy.monsterActionTimer / recovery) * 2));
    }
    function strike(ctx, s) {
        if (!s.strike) return false;
        const t = Math.max(0, Math.min(1, 1 - s.life)), fade = Math.pow(1 - t, 1.4);
        const head = s.angle + .12 + .7 * (1 - Math.pow(1 - t, 3)), tail = head - (1 - t) * 1.35;
        ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = fade;
        ctx.strokeStyle = s.color; ctx.lineWidth = (s.isCrit ? 5 : 3) * (1 - t * .65); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.ellipse(s.x, s.y - 10, s.radius, s.radius * .62, 0, tail, head); ctx.stroke();
        if (highQuality) {
            ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#fff2cd'; ctx.lineWidth = s.isCrit ? 2 : 1;
            ctx.beginPath(); ctx.ellipse(s.x, s.y - 10, s.radius + 1, (s.radius + 1) * .62, 0, head - .4 * (1 - t), head); ctx.stroke();
        }
        ctx.restore(); return true;
    }
    function feedback(type, entity, angle) {
        if (!['block','dodge','interrupt'].includes(type)) throw new RangeError('未知战斗反馈');
        for (const f of feedbacks) if (f.entity === entity && f.type === type && f.age < .1) { f.age = 0; f.x = entity.x; f.y = entity.y - 12; f.angle = angle; return; }
        if (feedbacks.length >= 96) feedbacks.shift();
        feedbacks.push({type,entity,x:entity.x,y:entity.y-12,angle,age:0,duration:type === 'interrupt' ? .38 : .26});
    }
    function update(dt) {
        for (let i = feedbacks.length - 1; i >= 0; i--) {
            feedbacks[i].age += dt;
            if (feedbacks[i].age >= feedbacks[i].duration) feedbacks.splice(i, 1);
        }
    }
    function drawFeedback(ctx, camera, width, height) {
        ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
        for (const f of feedbacks) {
            if (f.x < camera.x-60 || f.y < camera.y-60 || f.x > camera.x+width+60 || f.y > camera.y+height+60) continue;
            const t = f.age / f.duration;
            ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.angle); ctx.globalAlpha *= (1-t)*(1-t);
            ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath();
            if (f.type === 'block') {
                ctx.strokeStyle = '#ffe4a0';
                ctx.moveTo(-13,-13); ctx.lineTo(-19,-5); ctx.lineTo(-19,5); ctx.lineTo(-13,13);
                for (let i = 0; i < 3; i++) { const y = (i-1)*10, spread=3+t*16; ctx.moveTo(-20-spread,y); ctx.lineTo(-23-spread,y*1.25); }
            } else if (f.type === 'dodge') {
                ctx.strokeStyle = '#b2d3de';
                for (let i = 0; i < (highQuality ? 3 : 2); i++) { const x = t*25+i*6; ctx.moveTo(x-16,-16+i*7); ctx.quadraticCurveTo(x-5,-8+i*7,x+4,-13+i*7); }
            } else {
                ctx.strokeStyle = '#8fe8e2';
                const n = highQuality ? 8 : 4, r = 16+t*24;
                for (let i = 0; i < n; i++) { const a=i*Math.PI*2/n; ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r*.65); ctx.lineTo(Math.cos(a+.16)*(r+6),Math.sin(a+.16)*(r+6)*.65); }
            }
            ctx.stroke(); ctx.restore();
        }
        ctx.restore();
    }
    function clear(keepLight = false) {
        cancelWarmup(); frostCache.clear(); attacks = new WeakMap(); feedbacks.length = 0;
        // 通用图集不依赖楼层；切层复用已预热帧，全量清理和性能模式仍释放全部表面。
        if (!keepLight) { lightCache.clear(); warmIndex = 0; }
        scheduleWarmup();
    }
    function getStats() { return { frost:frostCache.stats(),light:lightCache.stats(),frostBudget,lightBudget,frameCost,overloaded,crowded,decorationBudget,focusBudget,feedbacks:feedbacks.length,warmup:{pending:warmPlan ? warmPlan.frames.length-warmIndex : 0,warmed,cost: warmCost,scheduled:idleHandle !== null} }; }
    if (typeof document.addEventListener === 'function') document.addEventListener('visibilitychange', () => { if (document.hidden) cancelWarmup(); else scheduleWarmup(); });
    return { beginFrame,setQuality,sampleFrame,allowDecoration,isDecoration,warm,frost,coldGround,vfx,trackAttack,monsterFrame,strike,feedback,update,drawFeedback,clear,getStats };
})();
