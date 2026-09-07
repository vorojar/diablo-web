const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadImage } = require('@napi-rs/canvas');
const root = path.resolve(__dirname, '..');
async function test() {
    const game = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
    const variant = vm.runInNewContext(`(${game.match(/function getTerrainVariant\([^]*?\n\}/)[0]})`);
    const counts = [0, 0, 0];
    for (let row = 0; row < 60; row++) for (let col = 0; col < 60; col++) {
        const index = variant(col, row);
        assert(Number.isInteger(index) && index >= 0 && index < 3);
        assert.equal(index, variant(col, row));
        counts[index]++;
    }
    assert(counts.every(count => count > 900 && count < 1500), '变体须均匀分布，避免集中条纹');
    for (const name of ['walls', 'floors']) {
        const image = await loadImage(path.join(root, `art/brand-terrain/${name}.webp`));
        assert.equal(image.width, 384); assert.equal(image.height, 384);
    }
    for (const size of [32, 192, 512]) {
        const image = await loadImage(path.join(root, `icon-${size}.png`));
        assert.equal(image.width, size); assert.equal(image.height, size);
    }
    const bytes = name => fs.statSync(path.join(root, name)).size;
    for (const layout of ['desktop', 'mobile']) {
        const total = ['walls', 'floors', `cover-${layout}`].reduce((sum, name) => sum + bytes(`art/brand-terrain/${name}.webp`), bytes('icon-32.png'));
        assert(total < 250000, `${layout} 封面+墙地+favicon 不得超过250KB`);
    }
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert(!/src(?:set)?="(?:bg|mobile_bg)\.jpg/.test(html), '不得再加载旧封面');
    assert(!/(wall|floor)_tiles\.png\?/.test(game), '不得重复加载旧墙地');
    console.log('PASS: 图集边界、图标尺寸、3600格稳定变体与250KB启动预算');
}
test().catch(error => { console.error(error); process.exitCode = 1; });
