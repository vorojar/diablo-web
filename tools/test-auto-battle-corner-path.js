const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const game = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
function extract(name) {
    const start = game.indexOf(`function ${name}(`);
    assert(start >= 0);
    let depth = 0;
    for (let i = game.indexOf('{', start); i < game.length; i++) {
        if (game[i] === '{') depth++;
        if (game[i] === '}' && --depth === 0) return game.slice(start, i + 1);
    }
}
function createWorld() {
    let now = 0;
    const world = vm.createContext({
        console, window: {}, Date: { now: () => now },
        GAME_CONFIG: {}, TILE_SIZE: 40, MAP_WIDTH: 9, MAP_HEIGHT: 9,
        mapData: Array.from({ length: 9 }, () => Array(9).fill(0)),
        player: { x: 60, y: 60, radius: 12, targetItem: null, skills: { thunder: 0 } }
    });
    vm.runInContext(['isWall', 'canPlayerOccupy', 'movePlayerWithCollision', 'hasLineOfSight'].map(extract).join('\n'), world);
    vm.runInContext(fs.readFileSync(path.join(root, 'auto-battle.js'), 'utf8') + '\nglobalThis.auto = AutoBattle;', world);
    world.tick = () => { now += 1000 / 60; };
    world.auto.hasCachedLineOfSightTo = t => world.hasLineOfSight(world.player.x, world.player.y, t.x, t.y);
    return world;
}

// 使用实际碰撞移动回放一格宽的折返走廊，覆盖拐点、近路径点和缓存过期。
for (const speed of [72, 180, 360]) {
    const w = createWorld();
    for (let r = 1; r <= 5; r++) w.mapData[r][1] = 1;
    for (let c = 1; c <= 6; c++) w.mapData[5][c] = 1;
    for (let r = 2; r <= 5; r++) w.mapData[r][6] = 1;
    const target = { x: 260, y: 100 };
    let escapes = 0;
    w.auto.escapeFromStuck = () => { escapes++; };
    for (let frame = 0; frame < 1800; frame++) {
        w.auto.moveTowards(target);
        const p = w.player;
        if (p.targetX != null) {
            const dx = p.targetX - p.x, dy = p.targetY - p.y, dist = Math.hypot(dx, dy);
            if (dist > 5) {
                const step = Math.min(speed / 60, dist);
                w.movePlayerWithCollision(p.x + dx / dist * step, p.y + dy / dist * step);
                assert(w.canPlayerOccupy(p.x, p.y), '路径不能穿墙');
            }
        }
        w.tick();
        if (Math.hypot(p.x - target.x, p.y - target.y) <= 5) break;
    }
    assert(Math.hypot(w.player.x - target.x, w.player.y - target.y) <= 5,
        `速度 ${speed} 必须走出折返走廊，实际停在 ${w.player.x}, ${w.player.y}`);
    assert.equal(escapes, 0, '接近正常拐点不应触发脱困');
}

// 中心线无遮挡，但圆形身体会擦到墙角，不能直接抄近路。
{
    const w = createWorld();
    w.mapData = Array.from({ length: 9 }, () => Array(9).fill(1));
    w.mapData[3][3] = 0;
    w.player.x = 100; w.player.y = 130;
    const target = { x: 130, y: 100 };
    assert(w.hasLineOfSight(100, 130, 130, 100));
    const point = w.auto.findPathToTarget(target.x, target.y, target);
    assert(point && (point.x !== target.x || point.y !== target.y), '擦墙角的视线不能直接用作行走路径');
}
console.log('PASS: 自动寻路折返窄走廊、不同速度、缓存过期与身体擦墙角');
