// 将实际运行时归一化结果离线保存；不修改原始生图，不改动任何像素的透明度。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {createCanvas, loadImage} = require('@napi-rs/canvas');

function sourceHash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

function readManifest(root, required = false) {
    const manifestPath = path.join(root, 'art', 'atlas-manifest.js');
    if (!fs.existsSync(manifestPath)) {
        if (required) throw new Error('缺少 art/atlas-manifest.js；请运行 node tools/prepare-art-atlases.js');
        return {};
    }
    const scope = vm.createContext({});
    vm.runInContext(fs.readFileSync(manifestPath, 'utf8') + '\nthis.manifest = ArtAtlasManifest;', scope, {filename: manifestPath});
    return JSON.parse(JSON.stringify(scope.manifest));
}

function loadCatalog(root) {
    // 阻止脚本发起真实图片加载，只读取完整定义和真正的 normalizeAtlas 函数。
    // 刻意不注入运行时清单：首次烘焙和新增素材都必须读取原图定义。
    const scope = vm.createContext({console, Image: class {},
        document: {createElement: () => createCanvas(1, 1)}});
    for (const file of ['art-samples.js', 'environment-art.js']) {
        vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), scope, {filename: file});
    }
    vm.runInContext('this.catalogs = [ArtSamples.definitions, EnvironmentArt.definitions];this.normalizeAtlas = ArtSamples.normalizeAtlas;', scope);
    const definitions = [];
    const keys = new Set(), files = new Set();
    for (const catalog of scope.catalogs) for (const [key, data] of Object.entries(catalog)) {
        if (!/^[a-zA-Z0-9_-]+$/.test(key)) throw new Error(`不安全的图集名称：${key}`);
        if (keys.has(key) || files.has(data.file)) throw new Error(`重复图集定义：${key} / ${data.file}`);
        if (!Number.isInteger(data.cols) || data.cols < 1 || !Number.isInteger(data.rows) || data.rows < 1) throw new Error(`图集切格定义无效：${key}`);
        const sourcePath = path.resolve(root, data.file);
        const relative = path.relative(root, sourcePath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`素材必须位于项目内：${data.file}`);
        keys.add(key); files.add(data.file);
        definitions.push({key, file: data.file, cols: data.cols, rows: data.rows});
    }
    return {definitions, normalizeAtlas: scope.normalizeAtlas};
}

async function buildAtlas(root, definition, normalizeAtlas) {
    const sourcePath = path.join(root, definition.file);
    if (!fs.existsSync(sourcePath)) throw new Error(`图集原文件不存在：${definition.file}`);
    const sourceBytes = fs.readFileSync(sourcePath);
    const image = await loadImage(sourcePath);
    const atlas = normalizeAtlas(image, definition.cols, definition.rows);
    const sourceSHA256 = sourceHash(sourceBytes);
    if (sourceHash(fs.readFileSync(sourcePath)) !== sourceSHA256) throw new Error(`原图在烘焙期间发生变化，请重试：${definition.file}`);
    const png = atlas.toBuffer('image/png');
    return {png, entry: {
        file: `art/atlases/${definition.key}.png`, width: atlas.width, height: atlas.height,
        cols: definition.cols, rows: definition.rows,
        contentBounds: JSON.parse(JSON.stringify(atlas.contentBounds)),
        sourceSHA256, atlasSHA256: sourceHash(png)
    }};
}

async function prepare(root, only = null) {
    root = path.resolve(root);
    const {definitions, normalizeAtlas} = loadCatalog(root);
    const selected = only ? definitions.filter(d => only.includes(d.key) || only.includes(d.file)) : definitions;
    if (only) for (const requested of only) {
        if (!selected.some(d => d.key === requested || d.file === requested)) throw new Error(`未知 --only 图集：${requested}`);
    }
    // 整个选定范围全部通过输入验收后才落盘；不存在或跨格素材必须报错。
    const prepared = [];
    for (const definition of selected) {
        const result = await buildAtlas(root, definition, normalizeAtlas);
        prepared.push({definition, ...result});
    }
    const manifest = only ? readManifest(root) : {};
    fs.mkdirSync(path.join(root, 'art', 'atlases'), {recursive: true});
    for (const {definition, png, entry} of prepared) {
        fs.writeFileSync(path.join(root, entry.file), png);
        manifest[definition.file] = entry;
        console.log(`BAKED: ${definition.key} / ${entry.width}×${entry.height} / ${png.length} bytes`);
    }
    const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(path.join(root, 'art', 'atlas-manifest.js'),
        '// 由 tools/prepare-art-atlases.js 生成；原图变化后重新烘焙。\nconst ArtAtlasManifest = Object.freeze(' + JSON.stringify(sorted, null, 2) + ');\n');
    console.log(`PASS: ${prepared.length} 个图集已烘焙，清单共 ${Object.keys(sorted).length} 项`);
    return sorted;
}

function parseArgs(args) {
    let root = path.resolve(__dirname, '..'), only = null;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--root' && args[i + 1]) root = args[++i];
        else if (args[i] === '--only' && args[i + 1]) {
            only = args[++i].split(',').filter(Boolean);
            if (only.length === 0) throw new Error('--only 需要至少一个图集名称');
        } else if (args[i] === '--help') return {help: true};
        else throw new Error(`未知参数或缺少值：${args[i]}`);
    }
    return {root, only};
}

if (require.main === module) {
    Promise.resolve().then(() => {
        const args = parseArgs(process.argv.slice(2));
        if (args.help) {
            console.log('node tools/prepare-art-atlases.js [--only ice,heroHurt] [--root PROJECT]\n默认烘焙全部定义；--only 按图集名称或原文件名选择，保留清单内其他项。缺图、假透明、跨格均失败。');
            return;
        }
        return prepare(args.root, args.only);
    }).catch(error => {console.error(error); process.exitCode = 1;});
}

module.exports = {sourceHash, readManifest, loadCatalog, buildAtlas, prepare, parseArgs};
