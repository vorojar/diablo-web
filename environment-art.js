// 全区域静态美术：复用透明图集归一化，仅裁切原生 alpha 内容，不执行抠色。
// 加载顺序：art-samples.js → environment-art.js → game.js。
const EnvironmentArt = (() => {
    const definitions = Object.freeze({
        ice: { file: 'ice-props-painted.png', cols: 2, rows: 3 },
        fire: { file: 'lava-props-painted.png', cols: 2, rows: 3 },
        town: { file: 'town-props-painted.png', cols: 2, rows: 3 },
        npcs: { file: 'town-npcs-painted.png', cols: 2, rows: 3 },
        destructibles: { file: 'destructibles-painted.png', cols: 2, rows: 3 }
    });
    const scenicFrames = Object.freeze({
        moss_rock: ['ruins', 0, 0], stump: ['ruins', 0, 1],
        lantern: ['ruins', 1, 0], gravestone: ['ruins', 1, 1],
        shrub: ['ruins', 2, 0], bones: ['ruins', 2, 1],
        ice_cluster: ['ice', 0, 0], ice_spire: ['ice', 0, 1],
        frost_bones: ['ice', 1, 0], blue_flame: ['ice', 1, 1],
        rune_stone: ['ice', 2, 0], frost_pillar: ['ice', 2, 1],
        lava_vent: ['fire', 0, 0], lava_rock: ['fire', 0, 1],
        bone_pile: ['fire', 1, 0], spike_cluster: ['fire', 1, 1],
        hell_brazier: ['fire', 2, 0], red_crystal: ['fire', 2, 1],
        town_barrel: ['destructibles', 0, 0], town_crate: ['destructibles', 1, 0], town_urn: ['destructibles', 2, 0],
        town_bucket: ['town', 0, 0], town_wheel: ['town', 0, 1],
        town_torch: ['town', 1, 0], town_shrine: ['town', 1, 1],
        town_flag: ['town', 2, 0], town_well: ['town', 2, 1]
    });
    const npcFrames = Object.freeze({merchant: [0, 0], healer: [0, 1], stash: [1, 0], blacksmith: [1, 1], difficulty: [2, 0], respec: [2, 1]});
    const destructibleRows = Object.freeze({barrel: 0, crate: 1, urn: 2});
    const floorFrames = Object.freeze({
        forest: ['bones', 'shrub', 'stump'], ice: ['frost_bones', 'ice_cluster', 'rune_stone'],
        fire: ['bone_pile', 'lava_vent', 'lava_rock'], town: ['town_bucket', 'town_wheel', 'town_barrel']
    });
    const atlases = new Map();
    function registerAtlas(key, source) {
        const definition = definitions[key];
        if (!definition) throw new RangeError(`未知环境图集：${key}`);
        const atlas = ArtSamples.prepareSource(source, definition);
        atlases.set(key, atlas);
        return atlas;
    }
    function frame(key, row, col) {
        if (key === 'ruins') return ArtSamples.frame(key, row, col);
        const source = atlases.get(key);
        if (!source) return null;
        const definition = definitions[key];
        if (row < 0 || row >= definition.rows || col < 0 || col >= definition.cols) throw new RangeError(`环境素材帧越界：${key} ${row}:${col}`);
        return {source, x: col * 128, y: row * 128, width: 128, height: 128, animated: false,
            contentBounds: source.contentBounds[row * definition.cols + col]};
    }
    function scenic(name) {
        const position = scenicFrames[name];
        return position ? frame(...position) : null;
    }
    function npc(type) {
        const position = npcFrames[type];
        return position ? frame('npcs', ...position) : null;
    }
    function destructible(type, broken) {
        return Object.hasOwn(destructibleRows, type) ? frame('destructibles', destructibleRows[type], broken ? 1 : 0) : null;
    }
    function floor(type, seed) {
        const pool = floorFrames[type];
        if (!pool) return null;
        return scenic(pool[Math.abs(Math.trunc(seed)) % pool.length]);
    }
    const ready = Promise.all(Object.entries(definitions).map(([key, definition]) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            try { registerAtlas(key, image); resolve(key); }
            catch (error) { reject(error); }
        };
        image.onerror = () => reject(new Error(`环境图集加载失败：${definition.file}`));
        image.src = `${ArtSamples.assetPath(definition.file)}?v=2026090602`;
    })));
    ready.catch(error => console.error('[环境美术] 素材验收失败', error));
    return {definitions, scenicFrames, npcFrames, destructibleRows, floorFrames, registerAtlas, frame, scenic, npc, destructible, floor, ready};
})();
