'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const root = path.resolve(__dirname, '..');
const game = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
const makeCanvas = () => createCanvas(1, 1);
const document = { createElement: makeCanvas };
const fixture = createCanvas(8, 8);
const pixelCtx = fixture.getContext('2d');
pixelCtx.fillStyle = '#ffffff'; pixelCtx.fillRect(0, 0, 4, 8);
pixelCtx.fillStyle = '#ff00ff'; pixelCtx.fillRect(4, 0, 4, 8);
pixelCtx.clearRect(1, 1, 1, 1); pixelCtx.fillStyle = 'rgba(255,0,255,0.5)'; pixelCtx.fillRect(1, 1, 1, 1);
// 四类新素材直载必须保持原始 Image 身份、白色/紫色和半透明像素。
for (const [sheet, processed, loaded] of [
    ['heroSpriteSheet', 'processedHeroSprites', 'heroSpritesLoaded'],
    ['monsterSpriteSheet', 'processedMonsterSprites', 'monsterSpritesLoaded'],
    ['envSpriteSheet', 'processedEnvSprites', 'envSpritesLoaded'],
    ['destructibleSpriteSheet', 'processedDestructibleSprites', 'destructiblesLoaded']
]) {
    const marker = `${sheet}.onload = () => {`;
    const start = game.indexOf(marker), end = game.indexOf('\n};', start);
    assert(start >= 0 && end > start);
    const context = { document, [sheet]: fixture, HERO_SPRITE_CONFIG: { cols: 4, rows: 2 }, MONSTER_SPRITE_CONFIG: { cols: 4, rows: 2 }, DESTRUCTIBLE_CONFIG: {}, gameActive: false,
        calculateSpriteCellBounds(data) { assert.deepEqual([...data.data], [...pixelCtx.getImageData(0, 0, 8, 8).data]); return []; },
        createTintedSpriteSheet: () => makeCanvas(), HeroTintCache: {}, MonsterTintCache: {} };
    vm.createContext(context);
    vm.runInContext(`let ${processed}; let ${loaded}; let envCellWidth, envCellHeight, envSpriteBounds, destructibleSpriteBounds;\n${game.slice(start, end + 3)}\n${sheet}.onload(); this.result = ${processed};`, context);
    assert.deepEqual([...context.result.getContext('2d').getImageData(0, 0, 8, 8).data],
        [...pixelCtx.getImageData(0, 0, 8, 8).data], `${sheet} 白色、紫色、半透明像素必须保持`);
    assert.equal(context.result, fixture, `${sheet} 应直接使用透明源，不重新抠色或复制全图`);
}
const context = vm.createContext({ document });
vm.runInContext(fs.readFileSync(path.join(root, 'sprite-renderer.js'), 'utf8') + '\nthis.api = SpriteRenderer;', context);
const renderer = context.api;
const cache = renderer.createTintCache({ maxFrames: 2, maxBytes: 128 });
const frame = { x: 4, y: 0, width: 4, height: 4 };
assert.equal(cache.get(fixture, frame, null), null);
assert.equal(cache.getStats().entries, 0);
const tinted = cache.get(fixture, frame, 'ice');
assert.equal(tinted.width, 4); assert.equal(tinted.height, 4);
assert.equal(cache.get(fixture, frame, 'ice'), tinted);
const otherSource = createCanvas(8, 8);
assert.notEqual(cache.get(otherSource, frame, 'ice'), tinted);
// 使用过的帧应刷新 LRU，容量逐出只移除最久未用项。
cache.get(fixture, frame, 'ice');
cache.get(fixture, frame, 'poison');
assert.equal(cache.get(fixture, frame, 'ice'), tinted);
assert.equal(cache.getStats().entries, 2); assert.equal(cache.getStats().bytes, 128);
assert.equal(cache.get(fixture, { ...frame, width: 8, height: 8 }, 'ice'), null);
assert.equal(cache.getStats().bytes, 128);
// 无状态绘制不分配缓存，并正确裁剪到右侧紫色格。
const target = createCanvas(4, 4), targetCtx = target.getContext('2d');
const clean = renderer.createTintCache();
renderer.drawFrame(targetCtx, fixture, frame, 0, 0, 4, 4, null, clean);
assert.deepEqual([...targetCtx.getImageData(0, 0, 1, 1).data], [255, 0, 255, 255]);
assert.equal(clean.getStats().entries, 0);
const byteLimited = renderer.createTintCache({ maxFrames: 96, maxBytes: 64 });
byteLimited.get(fixture, frame, 'white'); byteLimited.get(fixture, frame, 'ice');
assert.equal(byteLimited.getStats().entries, 1); assert.equal(byteLimited.getStats().bytes, 64);
// 实际主角/怪物入口保持锚点和翻转，并支持新图集 frame.source 覆盖默认图集。
context.HeroTintCache = renderer.createTintCache();
context.MonsterTintCache = renderer.createTintCache();
for (const name of ['drawHeroSprite', 'drawMonsterSprite']) {
    const start = game.indexOf(`function ${name}(`), end = game.indexOf('\n}', start);
    vm.runInContext(game.slice(start, end + 2), context);
    const canvas = createCanvas(8, 8), ctx = canvas.getContext('2d');
    context[name](ctx, otherSource, { x: 0, y: 0, width: 8, height: 8, flipX: true, source: fixture }, 4,
        name === 'drawHeroSprite' ? 0 : 8, 8, 8);
    assert.deepEqual([...ctx.getImageData(0, 0, 1, 1).data], [255, 0, 255, 255]);
    assert.deepEqual([...ctx.getImageData(7, 0, 1, 1).data], [255, 255, 255, 255]);
    assert.equal(ctx.getImageData(6, 1, 1, 1).data[3], pixelCtx.getImageData(1, 1, 1, 1).data[3]);
    context[name](ctx, otherSource, { ...frame, source: fixture }, 2,
        name === 'drawHeroSprite' ? 0 : 4, 4, 4, 'ice');
    assert.equal(context[name === 'drawHeroSprite' ? 'HeroTintCache' : 'MonsterTintCache'].getStats().entries, 1);
}
console.log('PASS: RGBA direct load, frame crop, source identity, LRU and byte budgets');
