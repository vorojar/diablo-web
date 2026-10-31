// 像素合成、缓存预算与真实攻击入口回归，不以静态代码匹配代替行为验证。
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const { createCanvas } = require('@napi-rs/canvas');
const root = path.resolve(__dirname, '..'), game = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
let created = 0;
const scope = vm.createContext({ document: { createElement() { created++; return createCanvas(1, 1); } } });
vm.runInContext(fs.readFileSync(path.join(root, 'combat-visuals.js'), 'utf8') + '\nthis.visuals = CombatVisuals;', scope);
const v = scope.visuals;
function extract(name) {
    const start = game.indexOf(`function ${name}(`); assert(start >= 0, name);
    let depth = 0;
    // 默认参数可能含对象，函数体以“) {”定位。
    for (let i = game.indexOf(') {', start) + 2; i < game.length; i++) {
        if (game[i] === '{') depth++;
        if (game[i] === '}' && --depth === 0) return game.slice(start, i + 1);
    }
}
const source = createCanvas(16, 16), sourceCtx = source.getContext('2d');
sourceCtx.fillStyle = '#303848'; sourceCtx.fillRect(2, 2, 5, 11);
sourceCtx.fillStyle = 'rgba(255,190,60,.7)'; sourceCtx.fillRect(8, 3, 5, 9);
sourceCtx.fillStyle = '#000000'; sourceCtx.fillRect(14, 14, 1, 1);
const material = {x:4,y:7,rx:5,ry:8};
const original = Buffer.from(sourceCtx.getImageData(0, 0, 16, 16).data);
function painted(background, split) {
    const canvas = createCanvas(16, 16), ctx = canvas.getContext('2d');
    ctx.fillStyle = background; ctx.fillRect(0, 0, 16, 16);
    if (split) v.vfx(ctx, source, 0, 0, 16, 16, 0, 0, 16, 16, true, material);
    else ctx.drawImage(source, 0, 0);
    return ctx.getImageData(0, 0, 16, 16).data;
}
v.beginFrame(true, 0);
const splitBlack = painted('#000000', true), originalBlack = painted('#000000', false);
for (let i = 0; i < splitBlack.length; i++) assert(Math.abs(splitBlack[i] - originalBlack[i]) <= 3, `黑底亮度不得叠加 ${i}`);
const splitGrey = painted('#808080', true), darkPixel = (5 * 16 + 4) * 4;
assert.deepEqual([...splitGrey.slice(darkPixel, darkPixel + 4)], [48, 56, 72, 255], '深色实体应遮挡背景，保留材质暗部');
assert.deepEqual([...splitGrey.slice((14*16+14)*4,(14*16+14)*4+4)], [128,128,128,255], '实体外黑色加色底不能产生黑边');
const warmPixel = (5 * 16 + 10) * 4;
assert(splitGrey[warmPixel + 2] > painted('#808080', false)[warmPixel + 2], '热光保留对背景的加色贡献');
assert.deepEqual(Buffer.from(sourceCtx.getImageData(0, 0, 16, 16).data), original, '分层不修改原素材');
const builds = v.getStats().light.builds, allocated = created;
for (let i = 0; i < 100; i++) painted('#808080', true);
assert.equal(v.getStats().light.builds, builds); assert.equal(created, allocated, '缓存命中不创建画布');
v.vfx(createCanvas(16, 16).getContext('2d'), createCanvas(16, 16), 0, 0, 16, 16, 0, 0, 16, 16, true, material);
assert.equal(v.getStats().light.builds, builds, '每帧最多构建一组光照表面');
const frame = { x: 0, y: 0, width: 16, height: 16 };
const frostTarget = createCanvas(16, 16), frostCtx = frostTarget.getContext('2d');
v.frost(frostCtx, source, frame, 0, 0, 16, 16);
assert(frostCtx.getImageData(0, 0, 16, 16).data.some((value, index) => index % 4 === 3 && value > 0), '轮廓冰霜应实际产生可见像素');
assert.equal(frostCtx.getImageData(0, 0, 1, 1).data[3], 0, '透明角落不能出现矩形冰壳');
v.frost(frostCtx, createCanvas(256, 256), {x:0,y:0,width:256,height:256}, 0, 0, 16, 16);
const frostBuilds = v.getStats().frost.builds;
v.frost(frostCtx, createCanvas(16, 16), frame, 0, 0, 16, 16);
assert.equal(v.getStats().frost.builds, frostBuilds, '每帧最多构建两张轮廓缓存');
assert(v.getStats().frost.bytes <= (16 * 16 + 96 * 96) * 4, '大帧冰霜采样限制在96×96以内');
v.beginFrame(false, 1); const beforeLow = created;
v.frost(frostCtx, source, frame, 0, 0, 16, 16); painted('#333333', true);
v.coldGround(frostCtx, 8, 12, 5, true, 1);
assert.equal(created, beforeLow, '性能模式不创建冰霜或光照表面');
for (let i = 0; i < 80; i++) {
    v.beginFrame(true, i / 60);
    v.vfx(frostCtx, createCanvas(128, 128), 0, 0, 128, 128, 0, 0, 16, 16, true, material);
    v.frost(frostCtx, createCanvas(128, 128), {x:0,y:0,width:128,height:128}, 0, 0, 16, 16);
}
assert.equal(v.getStats().light.entries, 32); assert(v.getStats().light.bytes <= 4 * 1024 * 1024);
assert.equal(v.getStats().frost.entries, 48); assert(v.getStats().frost.bytes <= 2 * 1024 * 1024);
v.clear(); assert.equal(v.getStats().light.bytes, 0); assert.equal(v.getStats().frost.bytes, 0);
console.log('PASS: 双层黑底亮度、实体暗部、热光加色、透明轮廓、逐帧构建预算、低画质零分配与缓存释放');

const noop = () => {}, hits = [], sounds = [];
Object.assign(scope, {
    player: {x:0,y:0,floor:1,damage:[10,10],critChance:0,attackSpeed:0,attackCooldown:0,lifeSteal:0,elementalDamage:{fire:0,lightning:0,poison:0}},
    SkillBranchSystem:{canAttack:()=>true}, GAME_CONFIG:{PLAYER_MELEE_NO_LOS_RANGE:30}, hasLineOfSight:()=>true,
    addCombo:noop, takeDamage:(enemy, damage)=>{hits.push(damage); enemy.hp-=damage.physical;},
    AudioSys:{play:name=>sounds.push(name)}, triggerPhysicalSweep:noop, createDamageNumber:noop,
    COLORS:{green:'green'}, slashEffects:[], getPlayerVisualProfile:()=>({trail:'#dab77e'}),
    HERO_SPRITE_CONFIG:{fps:{idle:6}}, ArtSamples:{heroFrame:(action,direction,index)=>({action,direction,index})}
});
for (const name of ['directionFromDelta','normalizeHeroDirection','triggerHeroAction','getCurrentHeroAction','getHeroFrame','createSlashEffect','performAttack']) vm.runInContext(extract(name), scope);
for (const attackSpeed of [0, 300, 1000]) {
    Object.assign(scope.player, {attackSpeed,attackCooldown:0,heroActionTimer:2});
    const target = {x:40,y:0,hp:100}, before = hits.length;
    scope.performAttack(target);
    assert.equal(target.hp, 90, '调用普攻立即命中，不能因视觉延迟伤害');
    assert.equal(hits.length, before + 1, '每次只调用一次主目标伤害入口');
    assert.equal(scope.player.attackCooldown, .8 / (1 + attackSpeed / 100));
    assert(scope.player.heroActionDuration <= scope.player.attackCooldown);
    assert.equal(scope.player.heroActionTimer, scope.player.heroActionDuration, '新攻击不能继承旧动作长计时');
    assert.equal(scope.getHeroFrame('right').index, 2, '真实命中时已经进入接触姿势');
    scope.player.heroActionTimer = scope.player.heroActionDuration * .2;
    assert.equal(scope.getHeroFrame('right').index, 3, '后段进入收招姿势');
    scope.performAttack(target); assert.equal(hits.length, before + 1, '冷却期间仍禁止攻击');
}
scope.hasLineOfSight = () => false; scope.player.attackCooldown = 0;
scope.performAttack({x:100,y:0,hp:100}); assert.equal(hits.length, 3, '隔墙拒绝攻击');
scope.player.frozen = true;
assert.equal(scope.getHeroFrame('right').action, 'idle'); assert.equal(scope.getHeroFrame('right').index, 0, '冻结期间不继续挥击');
scope.player.frozen = false;
for (let i = 0; i < 100; i++) scope.createSlashEffect(0, 0, 40, 0, 1000, true);
assert.equal(scope.slashEffects.length, 6, '刀锋事件限制并发');
console.log('PASS: 普攻即时伤害、伤害次数、攻速冷却、接触与收招选帧、隔墙拒绝与刀锋并发');

Object.assign(scope, { scheduledMonsterAttacks: [], enemies: [], spawnMonsterAttackTelegraph:noop,
    setMonsterFacingToward:noop, triggerMonsterAction:(e,a,d)=>{e.monsterActionTimer=d;},
    createMonsterAttackAim:()=>({angle:0,targetX:40,targetY:0}) });
for (const name of ['startMonsterAttack','processScheduledMonsterAttacks']) vm.runInContext(extract(name), scope);
let resolved = 0;
const enemy = {hp:100}; scope.enemies.push(enemy);
scope.startMonsterAttack(enemy, {duration:.42,impactDelay:.18,resolve:()=>resolved++});
assert.equal(v.monsterFrame(enemy, 3), 0);
scope.processScheduledMonsterAttacks(.17); enemy.monsterActionTimer -= .17;
assert.equal(resolved, 0); assert.equal(v.monsterFrame(enemy, 3), 1, '伤害前不能提前进入释放帧');
scope.processScheduledMonsterAttacks(.02); enemy.monsterActionTimer -= .02;
assert.equal(resolved, 1); assert.equal(v.monsterFrame(enemy, 0), 2, '真实队列触发时进入释放帧');
scope.processScheduledMonsterAttacks(1); assert.equal(resolved, 1, '绘制不能重复结算队列');
enemy.monsterActionTimer = .04; assert.equal(v.monsterFrame(enemy, 0), 3);
scope.startMonsterAttack(enemy, {duration:.42,impactDelay:.18,resolve:()=>resolved++});
scope.scheduledMonsterAttacks[0].cancelled = true;
scope.processScheduledMonsterAttacks(1); assert.equal(resolved, 1);
assert.equal(v.monsterFrame(enemy, 0), 0, '打断后不再显示释放');
console.log('PASS: 真实怪物攻击队列的蓄力、命中、收招、一次结算与打断取消');
