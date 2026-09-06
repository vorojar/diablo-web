const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createCanvas, loadImage} = require('@napi-rs/canvas');
const root = path.resolve(__dirname, '..');
const scope = vm.createContext({console, Image: class {}, document: {createElement: () => createCanvas(1, 1)}});
vm.runInContext(fs.readFileSync(path.join(root, 'art-samples.js'), 'utf8'), scope);
vm.runInContext(fs.readFileSync(path.join(root, 'environment-art.js'), 'utf8') + '\nthis.environment = EnvironmentArt;this.art = ArtSamples;', scope);
const environment = scope.environment;
(async () => {
    const audit = [];
    for (const [key, definition] of Object.entries(environment.definitions)) {
        const bytes = fs.readFileSync(path.join(root, definition.file));
        assert.equal(bytes[25], 6, `${definition.file} 必须是原生RGBA PNG`);
        const image = await loadImage(path.join(root, definition.file));
        const normalized = environment.registerAtlas(key, image);
        assert.equal(normalized.contentBounds.length, 6);
        const scan = createCanvas(image.width, image.height), ctx = scan.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
        let transparent = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] === 0) transparent++;
        assert.ok(transparent / (image.width * image.height) > 0.15);
        for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
            const frame = environment.frame(key, row, col), b = frame.contentBounds;
            assert.ok(b.sw > 0 && b.sh > 0 && b.sw <= 112 && b.sh <= 88.001);
            assert.ok(b.sx >= col * 128 && b.sy >= row * 128);
            assert.ok(b.sx + b.sw <= (col + 1) * 128 && b.sy + b.sh <= (row + 1) * 128);
        }
        audit.push({file: definition.file, width: image.width, height: image.height, transparentPixels: transparent,
            transparentRatio: Number((transparent / (image.width * image.height)).toFixed(4)), cells: 6, gutterAndBounds: 'PASS'});
        console.log(`PASS: ${definition.file} 原生RGBA / 6格无截断 / 透明${audit.at(-1).transparentRatio}`);
    }
    const ruins = scope.art.normalizeAtlas(await loadImage(path.join(root, 'ruins-props-painted.png')), 2, 3);
    scope.art.frame = (key, row, col) => ({source: ruins, contentBounds: ruins.contentBounds[row * 2 + col]});
    for (const name of Object.keys(environment.scenicFrames)) assert.ok(environment.scenic(name).contentBounds.sw > 0, name);
    for (const type of Object.keys(environment.npcFrames)) assert.ok(environment.npc(type).contentBounds.sh > 0, type);
    for (const type of Object.keys(environment.destructibleRows)) {
        const intact = environment.destructible(type, false), broken = environment.destructible(type, true);
        assert.equal(intact.y, broken.y); assert.notEqual(intact.x, broken.x);
    }
    for (const type of Object.keys(environment.floorFrames)) for (const seed of [0, 1, 2, -3, 917.3]) assert.ok(environment.floor(type, seed).contentBounds);
    const game = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
    const scenicConfig = game.slice(game.indexOf('const SCENIC_PROP_LIBRARY'), game.indexOf('function getScenicPropPool'));
    const townStart = game.indexOf('const townDefs =');
    const townConfig = game.slice(townStart, game.indexOf('const occupied =', townStart));
    for (const match of (scenicConfig + townConfig).matchAll(/name:\s*'([^']+)'/g)) assert.ok(environment.scenic(match[1]), `实际地图物件缺少美术覆盖：${match[1]}`);
    for (const match of game.matchAll(/npcs\.push\(\{[^\n]*type:\s*"([^"]+)"/g)) assert.ok(environment.npc(match[1]), `实际NPC缺少美术覆盖：${match[1]}`);
    assert.equal(environment.scenic('unknown'), null); assert.equal(environment.npc('unknown'), null);
    assert.equal(environment.destructible('unknown', false), null); assert.equal(environment.floor('unknown', 1), null);
    assert.throws(() => environment.frame('ice', 3, 0), /越界/);
    const opaque = createCanvas(100, 100); opaque.getContext('2d').fillRect(0, 0, 100, 100);
    assert.throws(() => environment.registerAtlas('ice', opaque), /透明/);
    assert.ok(environment.scenic('ice_cluster'), '错误输入不能替换已验收图集');
    console.log('PASS: 27种场景道具 / 6位NPC / 3对破坏状态 / 全生物群系地面装饰映射');
    if (process.argv.includes('--write-audit')) fs.writeFileSync(path.join(root, 'docs/environment-art-alpha-audit.json'), JSON.stringify(audit, null, 2) + '\n');
})().catch(error => {console.error(error); process.exitCode = 1;});
