// 加载真实 PNG、真实图集归一化和游戏选帧/绘制函数，校验所有动作方向的实际素材来源。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createCanvas, Image } = require('@napi-rs/canvas');
const root = path.resolve(__dirname, '..');
const game = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
const enemySource = fs.readFileSync(path.join(root, 'enemy-system.js'), 'utf8');
function extract(source, marker) {
    const start = source.indexOf(marker);
    assert.ok(start >= 0, `缺少真实代码入口 ${marker}`);
    let depth = 0;
    for (let i = source.indexOf('{', start); i < source.length; i++) {
        if (source[i] === '{') depth++;
        if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
    }
    throw new Error(`无法提取 ${marker}`);
}
const ready = [], errors = [];
class LocalImage extends Image {
    set src(url) {
        const onload = this.onload;
        let resolve, reject;
        ready.push(new Promise((yes, no) => { resolve = yes; reject = no; }));
        this.onload = () => { onload(); resolve(); };
        this.onerror = reject;
        try {
            const file=path.join(root, url.split('?')[0]);
            assert.ok(fs.existsSync(file), `素材文件尚未生成：${file}`);
            super.src = file;
        }
        catch (error) { reject(error); }
    }
}
const scope = vm.createContext({
    console: { log: console.log, error: (...args) => errors.push(args.map(String).join(' ')) },
    Image: LocalImage, document: { createElement: () => createCanvas(1, 1) },
    player: {}, heroSpritesLoaded: true, monsterSpritesLoaded: true,
    processedHeroSprites: createCanvas(512, 2816), processedMonsterSprites: createCanvas(512, 14848)
});
vm.runInContext(fs.readFileSync(path.join(root, 'sprite-renderer.js'), 'utf8') + ';globalThis.HeroTintCache=SpriteRenderer.createTintCache();globalThis.MonsterTintCache=SpriteRenderer.createTintCache();', scope);
vm.runInContext(fs.readFileSync(path.join(root, 'art-samples.js'), 'utf8') + ';globalThis.art=ArtSamples;', scope);
vm.runInContext(fs.readFileSync(path.join(root, 'environment-art.js'), 'utf8'), scope);
for (const name of ['HERO_SPRITE_CONFIG', 'MONSTER_SPRITE_CONFIG', 'SPRITE_CONFIG']) vm.runInContext(extract(game, `const ${name} =`) + ';', scope);
for (const name of ['MONSTER_FRAMES', 'BOSS_FRAMES']) vm.runInContext(extract(enemySource, `const ${name} =`) + ';', scope);
for (const name of ['normalizeHeroDirection', 'getCurrentHeroAction', 'getHeroFrame', 'drawHeroSprite', 'getEnemyMonsterType', 'getMonsterSpriteDirection', 'getMonsterSpriteFrame', 'drawMonsterSprite', 'addBiomeAtmosphere', 'getBiomeStyle']) vm.runInContext(extract(game, `function ${name}(`), scope);
for (const name of ['drawScenicPropOne', 'drawBiomeFloorDecoration']) vm.runInContext(extract(game, `function ${name}(`), scope);
vm.runInContext(extract(game, 'const DestructibleSystem =') + ';globalThis.destructibleSystem=DestructibleSystem;', scope);
vm.runInContext(game.match(/const BOSS_SPRITE_TYPES_BY_FRAME\s*=\s*\[[^;]+;/)[0], scope);
vm.runInContext('globalThis.heroConfig=HERO_SPRITE_CONFIG;globalThis.monsterConfig=MONSTER_SPRITE_CONFIG;globalThis.monsterFrames=MONSTER_FRAMES;globalThis.bossFrames=BOSS_FRAMES;', scope);
function assertFrame(frame, key, row, col, monster=false) {
    assert.ok(frame, `${key} 缺少帧`);
    const expected = scope.art.frame(key, row, col);
    assert.ok(expected, `${key} 实际图集未加载`);
    assert.equal(frame.source, expected.source, `${key} 应使用新图集，不能悄悄回退旧图`);
    assert.equal(frame.x, col * 128);
    assert.equal(frame.y, row * 128);
    assert.ok(frame.x >= 0 && frame.y >= 0 && frame.x + frame.width <= frame.source.width && frame.y + frame.height <= frame.source.height, `${key} 帧越界`);
    const output = createCanvas(180, 180), ctx = output.getContext('2d');
    if(monster)scope.drawMonsterSprite(ctx, frame.source, frame, 90, 128, 128, 128);
    else scope.drawHeroSprite(ctx, frame.source, frame, 90, 0, 128, 128);
    const pixels = ctx.getImageData(0, 0, 180, 180).data;
    assert.ok(pixels.some((value, index) => index % 4 === 3 && value > 0), `${key} 实际绘制为空`);
}
(async () => {
    await Promise.all(ready);
    assert.deepEqual(errors, [], '实际素材不可被透明/分帧校验拒绝');
    const directions = ['front', 'back', 'left', 'right', 'frontLeft', 'frontRight', 'backLeft', 'backRight'];
    let heroCases = 0, monsterCases = 0;
    for (const action of Object.keys(scope.heroConfig.rowsByAction)) for (const direction of directions) for (let col = 0; col < 4; col++) {
        scope.player = { heroAction: action, heroActionTimer: 4 - col, heroActionDuration: 4, animTime: col / scope.heroConfig.fps[action], moving: action === 'walk' };
        const safeDirection = action === 'sit' ? 'front' : direction;
        const diagonal = ['frontLeft', 'frontRight', 'backLeft', 'backRight'];
        const key = action === 'walk' && diagonal.includes(safeDirection) ? 'herowalkDiagonal' : action === 'hurt' ? 'heroHurt' : `hero${action}`;
        const row = key === 'herowalkDiagonal' ? diagonal.indexOf(safeDirection) : safeDirection.startsWith('back') ? 1 : ['left', 'frontLeft'].includes(safeDirection) ? 2 : ['right', 'frontRight'].includes(safeDirection) ? 3 : 0;
        assertFrame(scope.getHeroFrame(direction), key, row, col); heroCases++;
    }
    const types = Object.keys(scope.monsterConfig.types);
    assert.equal(types.length, 15);
    assert.deepEqual(new Set(types), new Set([...Object.keys(scope.monsterFrames), ...Object.keys(scope.bossFrames)]));
    for(const [type,frameIndex] of Object.entries(scope.bossFrames))assert.equal(scope.getEnemyMonsterType({isBoss:true,frameIndex}),type,`Boss实际索引映射错误 ${type}`);
    for (const type of types) for (const [row, action] of ['idle', 'walk', 'attack', 'hurt'].entries()) for (const direction of ['front', 'back', 'left', 'right']) for (let col = 0; col < 4; col++) {
        const enemy = { monsterType: type, facingDirection: direction, lastSideDirection: 'right', monsterAction: action, monsterActionTimer: 4 - col, monsterActionDuration: 4, monsterAnimTime: col / scope.monsterConfig.fps[action], wasMoving: action === 'walk' };
        const frame = scope.getMonsterSpriteFrame(enemy);
        assertFrame(frame, type, row, col + (direction === 'front' ? 0 : 4),true);
        assert.equal(frame.flipX,direction==='right'||direction==='back',`${type} ${direction} 镜像错误`);monsterCases++;
    }
    const deathGroups=[['hero','melee','zombie','ranged'],['skeleton','shaman','mummy','ghost'],['specter','vampire','bloodRaven','countess'],['butcher','duriel','diablo','baal']];
    let deathCases=0;
    for(const [group,actors] of deathGroups.entries()) for(const [row,type] of actors.entries()) for(const right of [false,true]) {
        let scale;
        for(let col=0;col<4;col++) {
            const boss=Object.hasOwn(scope.bossFrames,type),duration=boss?1.5:1.05,collapse=type==='hero'?.9:boss?.72:.48;
            const elapsed=(col+.1)*collapse/4;
            scope.player={isDead:true,deathTimer:elapsed,heroAction:'attack',heroActionTimer:1};
            const frame=type==='hero'?scope.getHeroFrame(right?'right':'left'):scope.getMonsterSpriteFrame({monsterType:type,isBoss:boss,dead:true,deathVisualDuration:duration,deathVisualTimer:duration-elapsed,facingDirection:right?'right':'left'});
            assertFrame(frame,`death${group}`,row,col,type!=='hero');
            assert.equal(frame.flipX,right);
            if(scale!==undefined)assert.equal(frame.renderScale,scale,'横卧不能单帧放大');
            scale=frame.renderScale;
            assert.equal(scope.art.deathFrame(type,99,collapse).x,3*128,'倒地结束不循环站起来');
            deathCases++;
        }
    }
    console.log(`PASS 独立死亡 ${deathCases} 个角色/方向/帧与恒定身体标尺、末帧保持`);
    scope.player = { isInHell: false };
    assert.equal(scope.getBiomeStyle(0), null);
    for (const [floor, type] of [[1, 'forest'], [11, 'ice'], [21, 'fire']]) assert.equal(scope.getBiomeStyle(floor).type, type);
    // 旧图加载失败时，已加载的原生透明图仍必须被选择并实际绘制。
    scope.heroSpritesLoaded=false;scope.processedHeroSprites=null;
    scope.monsterSpritesLoaded=false;scope.processedMonsterSprites=null;
    scope.player={heroAction:'idle',heroActionTimer:0,animTime:0,x:0,y:0};
    assertFrame(scope.getHeroFrame('front'),'heroidle',0,0);
    for(const type of types)assertFrame(scope.getMonsterSpriteFrame({monsterType:type,facingDirection:'front',monsterAnimTime:0}),type,0,0,true);
    Object.assign(scope,{envSpritesLoaded:false,processedEnvSprites:null,destructiblesLoaded:false,processedDestructibleSprites:null,
        camera:{x:0,y:0},getViewportWidth:()=>512,getViewportHeight:()=>512,TILE_SIZE:40,isClearFloorFootprint:()=>true,mapTileNoise:()=>.5});
    function assertPainted(label,paint) {
        const canvas=createCanvas(256,256),ctx=canvas.getContext('2d');paint(ctx);
        assert(canvas.getContext('2d').getImageData(0,0,256,256).data.some((value,index)=>index%4===3&&value>0),label);
    }
    assertPainted('旧场景图失败仍绘制新道具',ctx=>scope.drawScenicPropOne(ctx,{name:'moss_rock',x:128,y:128}));
    const seed=Array.from({length:1000},(_,i)=>i).find(i=>{const hash=Math.sin(i*12.9898+78.233)*43758.5453;return hash-Math.floor(hash)<=.024;});
    assertPainted('旧场景图失败仍绘制地面装饰',ctx=>assert.equal(scope.drawBiomeFloorDecoration(ctx,80,80,40,'forest',seed),true));
    for(const broken of [false,true]) {
        const item={type:{name:'barrel',row:0},broken,x:128,y:128};scope.destructibles=[item];
        assertPainted('旧破坏物图失败仍绘制新状态',ctx=>scope.destructibleSystem.drawOne(ctx,item));
        assertPainted('旧破坏物图失败不能阻断批量绘制',ctx=>scope.destructibleSystem.draw(ctx));
    }
    console.log(`PASS 实际英雄 ${heroCases} 个动作/方向/帧；怪物与Boss ${monsterCases} 个动作/方向/帧；4个场景映射`);
})().catch(error => { console.error(error); process.exitCode = 1; });
