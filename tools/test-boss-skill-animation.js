// 复现真实技能信号被待机选帧吞掉，以及蓄力后释放突然转向的问题。
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const game = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
function extract(marker) {
    const start = game.indexOf(marker);
    assert(start >= 0, marker);
    let depth = 0;
    for (let i = game.indexOf('{', start); i < game.length; i++) {
        if (game[i] === '{') depth++;
        if (game[i] === '}' && --depth === 0) return game.slice(start, i + 1);
    }
    throw new Error(marker);
}
const scope = vm.createContext({console, player:{x:-100,y:0,isDead:false}, AudioSys:{play(){}},
    ArtSamples:{frame:(key,row,col,flipX)=>({key,row,col,flipX})}});
vm.runInContext(fs.readFileSync(path.join(root,'enemy-system.js'),'utf8'),scope);
for (const name of ['MONSTER_SPRITE_CONFIG','MONSTER_ACTION_PRIORITY']) vm.runInContext(extract(`const ${name} =`)+';',scope);
for (const name of ['getEnemyMonsterType','getMonsterActionPriority','triggerMonsterAction','directionFromDelta','setMonsterFacingToward','getMonsterSpriteDirection','getMonsterSpriteFrame']) vm.runInContext(extract(`function ${name}(`),scope);
for (const type of ['bloodRaven','countess','butcher','duriel','diablo','baal']) {
    const boss={monsterType:type,isBoss:true,x:0,y:0,facingDirection:'front'};
    scope.startBossSkillWindup(boss,'groundSlam',5,{windup:1});
    assert.equal(scope.getMonsterSpriteFrame(boss).row,2,`${type} 蓄力必须显示攻击预备姿态`);
    assert.equal(scope.getMonsterSpriteFrame(boss).col,4);
    boss.bossSkillVisual.timer=.2;
    assert.equal(scope.getMonsterSpriteFrame(boss).col,5,`${type} 蓄力末段不能提前释放`);
    scope.player.x=100;
    boss.bossSkillVisual.timer=0;
    scope.syncBossSkillVisual(boss,'attack',.6);
    assert.equal(scope.getMonsterSpriteFrame(boss).col,6,`${type} 释放从命中帧开始`);
    assert.equal(scope.getMonsterSpriteFrame(boss).flipX,false,`${type} 保留蓄力时左朝向`);
    boss.hitFlashTimer=.1;
    boss.bossSkillVisual.timer=.1;
    assert.equal(scope.getMonsterSpriteFrame(boss).col,7,`${type} 受击闪白不能吞掉收招动作`);
    boss.bossSkillVisual.timer=0;boss.hitFlashTimer=0;boss.monsterActionTimer=0;
    assert.equal(scope.getMonsterSpriteFrame(boss).row,0,`${type} 收招结束恢复待机`);
    scope.player.x=-100;
}
console.log('PASS: 六位Boss真实技能入口的蓄力/释放/收招选帧与跨阶段锁向');
