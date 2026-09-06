// 透明素材直接绘制；状态染色只缓存命中的帧，避免复制整张图集。
const SpriteRenderer = (() => {
    const filters = Object.freeze({
        white: 'brightness(500%) sepia(100%) saturate(0%)',
        ice: 'sepia(100%) saturate(150%) hue-rotate(180deg) brightness(120%)',
        poison: 'sepia(100%) saturate(300%) hue-rotate(80deg) brightness(80%)',
        lightning: 'brightness(300%) saturate(50%)'
    });

    function createTintCache({ maxFrames = 96, maxBytes = 6 * 1024 * 1024 } = {}) {
        if (!Number.isInteger(maxFrames) || maxFrames < 1 || !Number.isInteger(maxBytes) || maxBytes < 4) {
            throw new RangeError('精灵缓存容量必须为正整数');
        }
        const sources = new WeakMap();
        const entries = new Map();
        let nextSourceId = 0;
        let bytes = 0;
        return {
            get(source, frame, tint) {
                if (!tint) return null;
                if (!Object.hasOwn(filters, tint)) throw new RangeError(`未知染色状态: ${tint}`);
                const frameBytes = frame.width * frame.height * 4;
                // 超大帧使用即时 filter，不分配超过预算的离屏画布。
                if (frameBytes > maxBytes) return null;
                if (!sources.has(source)) sources.set(source, ++nextSourceId);
                const key = `${sources.get(source)}:${frame.x},${frame.y},${frame.width},${frame.height}:${tint}`;
                if (entries.has(key)) {
                    const entry = entries.get(key);
                    entries.delete(key);
                    entries.set(key, entry);
                    return entry.canvas;
                }
                while (entries.size >= maxFrames || bytes + frameBytes > maxBytes) {
                    const oldestKey = entries.keys().next().value;
                    const oldest = entries.get(oldestKey);
                    bytes -= oldest.bytes;
                    entries.delete(oldestKey);
                    oldest.canvas.width = 0;
                    oldest.canvas.height = 0;
                }
                const canvas = document.createElement('canvas');
                canvas.width = frame.width;
                canvas.height = frame.height;
                const ctx = canvas.getContext('2d');
                ctx.filter = filters[tint];
                ctx.drawImage(source, frame.x, frame.y, frame.width, frame.height, 0, 0, frame.width, frame.height);
                entries.set(key, { canvas, bytes: frameBytes });
                bytes += frameBytes;
                return canvas;
            },
            getStats() { return { entries: entries.size, bytes, maxFrames, maxBytes }; }
        };
    }

    function drawFrame(ctx, source, frame, x, y, width, height, tint, cache) {
        const tinted = tint ? cache.get(source, frame, tint) : null;
        if (tinted) {
            ctx.drawImage(tinted, 0, 0, frame.width, frame.height, x, y, width, height);
        } else if (tint) {
            ctx.save();
            ctx.filter = filters[tint];
            ctx.drawImage(source, frame.x, frame.y, frame.width, frame.height, x, y, width, height);
            ctx.restore();
        } else {
            ctx.drawImage(source, frame.x, frame.y, frame.width, frame.height, x, y, width, height);
        }
    }
    return { createTintCache, drawFrame };
})();
