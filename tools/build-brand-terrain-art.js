// 仅缩放、切片和压缩生图原稿；不改变现有角色、地标或 HUD。
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const art = path.join(root, 'art/brand-terrain');
async function build() {
    for (const [name, width] of [['cover-desktop', 1600], ['cover-mobile', 800]]) {
        await sharp(path.join(art, `${name}.png`)).resize({ width }).webp({ quality: 82, effort: 6 }).toFile(path.join(art, `${name}.webp`));
    }
    for (const size of [32, 192, 512]) {
        await sharp(path.join(art, 'icon.png')).resize(size, size).png({ palette: true, quality: 95 }).toFile(path.join(root, `icon-${size}.png`));
    }
    for (const name of ['walls', 'floors']) {
        const source = path.join(art, `${name}.png`);
        const { width, height } = await sharp(source).metadata();
        const cells = [];
        for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
            const left = Math.round(col * width / 3), top = Math.round(row * height / 3);
            const cell = await sharp(source).extract({ left, top, width: Math.round((col + 1) * width / 3) - left, height: Math.round((row + 1) * height / 3) - top }).resize(128, 128).toBuffer();
            cells.push({ input: cell, left: col * 128, top: row * 128 });
        }
        await sharp({ create: { width: 384, height: 384, channels: 3, background: '#111' } }).composite(cells).webp({ quality: 88, effort: 6 }).toFile(path.join(art, `${name}.webp`));
    }
    for (const name of fs.readdirSync(art).filter(name => name.endsWith('.webp'))) console.log(name, fs.statSync(path.join(art, name)).size);
}
build().catch(error => { console.error(error); process.exitCode = 1; });
