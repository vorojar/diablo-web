const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const game = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
function extract(name) {
    const start = game.indexOf(`function ${name}(`); let depth = 0;
    for (let i = game.indexOf(') {', start) + 2; i < game.length; i++) {
        if (game[i] === '{') depth++;
        if (game[i] === '}' && --depth === 0) return game.slice(start, i + 1);
    }
}
const noop = () => {};
const ctx = vm.createContext({console, Math, Set, Map, WeakMap,
    player: {}, enemies: [], projectiles: [], particles: [], mouse: {worldX: 100, worldY: 0, rightDown: false}, touchState: {isLongPress: false},
    ProjectilePool: {acquire: p => p}, AutoBattle: {enabled: false,onPlayerDamaged:noop}, setTimeout:noop,
    COMBAT_FEEDBACK_VFX:{}, getTalentEffect:()=>0, spawnPlayerDamageVfx:noop, combo:{},updateUI:noop,checkPlayerDeath:noop,
    hasTalent:()=>false,setMonsterFacingToward:noop,triggerMonsterAction:noop,getMonsterImpactProfile:()=>({color:'#fff'}),
    createImpactParticles:noop,Juice:{hit:noop},DestructibleSystem:{break:d=>d.broken=true,checkMeleeCollision:noop},
    createMonsterImpactParticles:noop,emitPhysicalHitAccent:noop,addCombo:noop,createSlashEffect:noop,triggerPhysicalSweep:noop,
    isInTown: () => false, isWall: () => false, hasLineOfSight: () => true,
    AudioSys: {play: noop, playFireballExplosion: noop}, CAST_SOURCE_VFX: {},
    createFloatingText: noop, createDamageNumber: noop, createParticle: noop,
    emitSkillImpactBurst: noop, emitFireballVisualGrowth: noop, emitThunderVisualGrowth: noop,
    emitMultishotVisualGrowth: noop, spawnVfxEffect: noop, spawnCastSourceVfx: noop,
    createLightningEffect: noop, createLightningChain: noop, triggerHeroAction: noop,
    getSkillVisualGrowthTier: () => 2, trackAchievement: noop, showNotification: noop,
    directionFromDelta: () => 0, cachedUI: {},
    takeDamage(e, dmg) {if(ctx.system)dmg=ctx.system.amplify(e,dmg);const n = typeof dmg === 'number' ? dmg : Object.values(dmg).reduce((a,b) => a+b,0); e.hp -= n; if (e.hp <= 0) e.dead = true;},
    getEnemyAtCursor: () => ctx.enemies[0], getDestructibleAtCursor: () => null
});
vm.runInContext(fs.readFileSync(path.join(root, 'constants.js'), 'utf8'), ctx);
const modulePath = path.join(root, 'skill-branches.js');
if (fs.existsSync(modulePath)) vm.runInContext(fs.readFileSync(modulePath, 'utf8') + '\nglobalThis.system = SkillBranchSystem;', ctx);
vm.runInContext(extract('castSkill'), ctx);
function setup(skill, choice, final = null, level = 2) {
    if (ctx.system) ctx.system.reset();
    ctx.enemies = []; ctx.projectiles = []; ctx.mouse.rightDown = false;
    ctx.player = {x:0,y:0,hp:100,maxHp:100,mp:1000,ene:10,damage:[100,100],floor:1,
        skills:{fireball:7,thunder:7,multishot:7},skillCooldowns:{fireball:0,thunder:0,multishot:0},shield:{active:false,value:0,cooldown:0,invincibleTimer:0},
        skillTree:{[skill]:{stage1:5,stage2:{chosen:choice,level},stage3:{chosen:final,level:final?1:0}}}};
}
function enemy(x=100,y=0,hp=10000) {const e={x,y,hp,maxHp:hp,radius:12,dead:false};ctx.enemies.push(e);return e;}
let failures=0;
function test(name, fn) {try {fn();console.log('PASS '+name);} catch(e) {failures++;console.error('FAIL '+name+': '+e.message);}}
test('扩散二阶段增加真实箭数和射角', () => {setup('multishot','spread');ctx.castSkill('multishot'); assert.equal(ctx.projectiles.length,11);assert.ok(ctx.projectiles.at(-1).angle-ctx.projectiles[0].angle>0.6);assert.equal(ctx.player.mp,992);});
if (!ctx.system) { process.exitCode=1; } else {
const s=ctx.system;
const cast=skill=>ctx.castSkill(skill);
const hit=(p,e)=>{p.x=e.x;p.y=e.y;s.hit(p,e);};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('爆炸二阶段强化范围与伤害',()=>{setup('fireball','explosion');const a=enemy(),b=enemy(185);cast('fireball');hit(ctx.projectiles[0],a);close(10000-b.hp,80*0.28*1.16);});
test('灼烧二阶段按持续时间累计真实伤害',()=>{setup('fireball','burn');const e=enemy();cast('fireball');hit(ctx.projectiles[0],e);const hp=e.hp;s.update(2.8);close(hp-e.hp,80*0.12*2.8);});
test('连锁二阶段扩展弹射目标',()=>{setup('thunder','chain');const targets=[enemy(100),enemy(250),enemy(400),enemy(550),enemy(700)];cast('thunder');assert.ok(targets.every(e=>e.hp<10000));});
test('感电二阶段命中后麻痹并放大后续雷伤',()=>{setup('thunder','shock');const e=enemy();cast('thunder');close(e.frozenTimer,0.5);close(10000-e.hp,144);const hp=e.hp;s.deal(e,144,'lightning');close(hp-e.hp,144*1.2);});
test('穿透二阶段击中三敌且同敌只命中一次',()=>{setup('multishot','pierce');const a=enemy(),b=enemy(120),c=enemy(140);cast('multishot');const p=ctx.projectiles[0];hit(p,a);const hp=a.hp;hit(p,a);assert.equal(a.hp,hp);assert.ok(p.life>0);hit(p,b);assert.ok(p.life>0);hit(p,c);assert.equal(p.life,0);close(10000-b.hp,80*0.78);});
test('陨石强化爆炸并留下三秒燃烧区域',()=>{setup('fireball','explosion','meteor');const a=enemy(),b=enemy(150);cast('fireball');hit(ctx.projectiles[0],a);close(10000-b.hp,80*0.28*1.16*2);const hp=b.hp;s.update(3);assert.ok(b.hp<hp);assert.equal(s.areas.length,0);});
test('火焰新星以施法者为中心造成伤害与击退',()=>{setup('fireball','explosion','nova');const e=enemy(80),far=enemy(240);cast('fireball');close(10000-e.hp,40);assert.ok(e.x>80);assert.equal(far.hp,10000);});
test('蔓延使周围敌人获得六成灼烧',()=>{setup('fireball','burn','spread');const e=enemy(),other=enemy(180);cast('fireball');hit(ctx.projectiles[0],e);const hp=other.hp;s.update(0.5);close(hp-other.hp,80*0.6*0.12*0.5);});
test('焚尽放大灼烧后的火伤且到期引爆周围目标',()=>{setup('fireball','burn','detonate');const e=enemy(),other=enemy(160);cast('fireball');hit(ctx.projectiles[0],e);close(10000-e.hp,80);const original=e.hp;s.deal(e,80,'fire');close(original-e.hp,104);const hp=other.hp;s.update(2.8);assert.ok(hp-other.hp>=40);});
test('雷暴每半秒伤害并提供准确三成减速',()=>{setup('thunder','chain','storm');const e=enemy();cast('thunder');const hp=e.hp;s.update(0.5);assert.ok(e.hp<hp);close(s.speedMultiplier(e,0.01),0.7);s.update(2.5);assert.equal(s.areas.length,0);});
test('超载击杀造成十成之一最大生命范围伤害',()=>{setup('thunder','chain','overload');const victim=enemy(100,0,10),other=enemy(120);const bonus=vm.runInContext("getSkillTreeBonus('thunder')",ctx);s.deal(victim,20,'lightning',bonus);assert.ok(victim.dead);close(10000-other.hp,1);});
test('电刑在感电期间持续造成雷伤',()=>{setup('thunder','shock','torture');const e=enemy();cast('thunder');const hp=e.hp;s.update(0.5);close(hp-e.hp,144*0.2*0.5*1.2);});
test('陨石从落点上空下降后触发伤害',()=>{setup('fireball','explosion','meteor');const e=enemy();cast('fireball');const p=ctx.projectiles[0];assert.ok(p.y<e.y);p.age=0.15;s.projectile(p,0.15);assert.equal(e.hp,10000);p.age=0.3;s.projectile(p,0.15);assert.ok(e.hp<10000);assert.equal(p.y,e.y);assert.equal(p.life,0);});
test('电弧护盾按实际伤害生成并抵消后续伤害',()=>{setup('thunder','shock','shield');const e=enemy();cast('thunder');close(s.arcShield,144*0.15);ctx.player.frozen=true;ctx.player.slowedTimer=3;s.update(0.1);assert.equal(ctx.player.frozen,false);assert.equal(ctx.player.slowedTimer,0);close(s.absorb(30),30-144*0.15);assert.equal(s.arcShield,0);});
test('箭雨飞行后落下覆盖范围内敌人',()=>{setup('multishot','pierce','rain');const e=enemy(175);cast('multishot');const p=ctx.projectiles[0];p.x=175;p.y=0;p.age=0.35;s.projectile(p,0.35);close(10000-e.hp,48);assert.equal(p.life,0);});
test('狙击长按两秒双倍伤害及额外三次穿透',()=>{setup('multishot','pierce','snipe');ctx.mouse.rightDown=true;cast('multishot');assert.equal(ctx.projectiles.length,0);s.update(1);assert.equal(ctx.projectiles.length,0);s.update(1);assert.ok(ctx.projectiles.length>0);close(ctx.projectiles[0].damage,160);assert.equal(ctx.projectiles[0].pierces,5);assert.equal(ctx.player.mp,992);});
test('狙击提前松开按实际蓄力时间结算',()=>{setup('multishot','pierce','snipe');ctx.mouse.rightDown=true;cast('multishot');s.update(0.5);ctx.mouse.rightDown=false;s.update(0);close(ctx.projectiles[0].damage,100);});
test('弹幕三波间隔0.2秒且总伤害为一波1.8倍',()=>{setup('multishot','spread','barrage');cast('multishot');assert.equal(ctx.projectiles.length,11);s.update(0.19);assert.equal(ctx.projectiles.length,11);s.update(0.01);assert.equal(ctx.projectiles.length,22);s.update(0.2);assert.equal(ctx.projectiles.length,33);close(ctx.projectiles.reduce((n,p)=>n+p.damage,0),11*80*1.8);assert.equal(ctx.player.mp,992);});
test('分裂箭飞行后生成两支半伤害箭且不递归分裂',()=>{setup('multishot','spread','split');cast('multishot');const p=ctx.projectiles[0],count=ctx.projectiles.length;p.age=0.25;s.projectile(p,0.25);assert.equal(ctx.projectiles.length,count+2);const child=ctx.projectiles.at(-1);close(child.damage,40);child.age=0.8;s.projectile(child,0.5);assert.equal(ctx.projectiles.length,count+2);});
test('冷却/蓄力中重复施法不重复扣蓝',()=>{setup('multishot','pierce','snipe');cast('multishot');ctx.player.skillCooldowns.multishot=0;cast('multishot');assert.equal(ctx.player.mp,992);});
test('离层清理持续区域、状态、延迟波次和蓄力',()=>{setup('multishot','spread','barrage');cast('multishot');assert.equal(s.volleys.length,2);const count=ctx.projectiles.length;s.reset();s.update(5);assert.equal(ctx.projectiles.length,count);assert.equal(s.states.size,0);assert.equal(s.charge,null);});
test('一级基础技能保持原有箭数、费用和伤害',()=>{setup('multishot','spread',null,0);ctx.player.skills.multishot=1;cast('multishot');assert.equal(ctx.projectiles.length,3);assert.equal(ctx.projectiles[0].damage,80);assert.equal(ctx.player.mp,992);});
test('神盾施法连接所选二阶段及终极分支',()=>{setup('holy_shield','guard','angel');cast('holy_shield');assert.equal(ctx.player.shield.type,'guard');assert.equal(ctx.player.shield.stage3,'angel');assert.equal(ctx.player.mp,985);});
test('守护护盾击破治疗并按等级减少控制',()=>{setup('holy_shield','guard');ctx.player.hp=50;cast('holy_shield');close(s.controlMultiplier(),0.65);ctx.player.shield.value=0;s.updateHolyShield(0.01);close(ctx.player.hp,62);s.updateHolyShield(1);close(ctx.player.hp,62);});
test('守护天使在击破时触发且无敌不会永久停留',()=>{setup('holy_shield','guard','angel');cast('holy_shield');ctx.player.shield.value=0;s.updateHolyShield(0.01);assert.equal(ctx.player.shield.active,false);close(ctx.player.shield.invincibleTimer,1);s.updateHolyShield(1);assert.equal(ctx.player.shield.invincibleTimer,0);});
test('生命链接仅生成一次三成次级护盾',()=>{setup('holy_shield','guard','link');cast('holy_shield');const max=ctx.player.shield.maxValue;ctx.player.shield.value=0;s.updateHolyShield(0.01);assert.equal(ctx.player.shield.active,true);assert.equal(ctx.player.shield.value,Math.floor(max*0.3));s.updateHolyShield(3);assert.equal(ctx.player.shield.active,false);});
test('惩戒光环每两秒造成范围伤害并减速',()=>{setup('holy_shield','reflect','retribution');const e=enemy();cast('holy_shield');s.updateHolyShield(1.9);assert.equal(e.hp,10000);s.updateHolyShield(0.1);close(10000-e.hp,2);close(s.speedMultiplier(e,0.1),0.85);});
test('绝对防御免疫暴击且击杀回血',()=>{setup('holy_shield','reflect','fortress');ctx.player.hp=50;cast('holy_shield');assert.equal(s.enemyCriticalMultiplier(true,2),1);s.killed();close(ctx.player.hp,55);ctx.player.shield.active=false;assert.equal(s.enemyCriticalMultiplier(true,2),2);});
test('死亡后延迟弹幕不能继续出箭',()=>{setup('multishot','spread','barrage');cast('multishot');const count=ctx.projectiles.length;ctx.player.hp=0;s.update(1);assert.equal(ctx.projectiles.length,count);assert.equal(s.volleys.length,0);});
test('死亡后持续地面伤害停止',()=>{setup('fireball','explosion','meteor');const e=enemy();cast('fireball');hit(ctx.projectiles[0],e);const hp=e.hp;ctx.player.isDead=true;s.update(1);assert.equal(e.hp,hp);assert.equal(s.areas.length,0);});
test('死亡时护盾不能治疗使角色复活',()=>{setup('holy_shield','guard','angel');cast('holy_shield');ctx.player.hp=0;ctx.player.shield.value=0;s.updateHolyShield(0.1);assert.equal(ctx.player.hp,0);assert.equal(ctx.player.shield.invincibleTimer,0);});
test('复活或重新进层不继承蓄力与电弧护盾',()=>{setup('multishot','pierce','snipe');cast('multishot');s.arcShield=20;s.reset();s.update(3);assert.equal(ctx.projectiles.length,0);assert.equal(s.arcShield,0);});
test('死亡清理让已发出的分支箭失效',()=>{setup('multishot','pierce');cast('multishot');assert.ok(ctx.projectiles[0].life>0);s.reset();assert.ok(ctx.projectiles.every(p=>p.life===0));assert.ok(extract('checkPlayerDeath').includes('SkillBranchSystem.reset()'));});
test('无蓝时不能创建状态或扣成负值',()=>{setup('fireball','burn');ctx.player.mp=4;cast('fireball');assert.equal(ctx.projectiles.length,0);assert.equal(ctx.player.mp,4);assert.equal(ctx.player.skillCooldowns.fireball,0);});
test('雷电超出射程不扣蓝和冷却',()=>{setup('thunder','shock');enemy(250);cast('thunder');assert.equal(ctx.player.mp,1000);assert.equal(ctx.player.skillCooldowns.thunder,0);});
test('区域技能不能隔墙命中',()=>{setup('fireball','explosion','nova');const e=enemy();ctx.hasLineOfSight=()=>false;cast('fireball');assert.equal(e.hp,10000);ctx.hasLineOfSight=()=>true;});
test('同一灼烧在不同帧率下总伤害相同',()=>{
    function run(steps){setup('fireball','burn');const e=enemy();cast('fireball');hit(ctx.projectiles[0],e);const hp=e.hp;for(let i=0;i<steps;i++)s.update(2.8/steps);return hp-e.hp;}
    close(run(1),run(28));
});
test('蔓延不会递归感染远处敌人',()=>{setup('fireball','burn','spread');const first=enemy(),middle=enemy(180),far=enemy(270);cast('fireball');hit(ctx.projectiles[0],first);s.update(1);assert.ok(middle.hp<10000);assert.equal(far.hp,10000);});
test('尸体持续状态清理且不重复伤害',()=>{setup('fireball','burn');const e=enemy();cast('fireball');hit(ctx.projectiles[0],e);e.dead=true;const hp=e.hp;s.update(2);assert.equal(e.hp,hp);assert.equal(s.states.has(e),false);});
vm.runInContext(extract('playerTakeDamage'),ctx);
test('真实受伤入口由反射护盾吸收并反伤',()=>{setup('holy_shield','reflect');const attacker=enemy();cast('holy_shield');ctx.playerTakeDamage(20,attacker);assert.equal(ctx.player.hp,100);close(10000-attacker.hp,2);assert.equal(ctx.player.shield.value,8);});
test('真实受伤入口先消耗电弧护盾',()=>{setup('thunder','shock','shield');s.arcShield=20;ctx.playerTakeDamage(30,null);close(ctx.player.hp,90);assert.equal(s.arcShield,0);});
test('真实受伤入口中天使无敌阻断伤害并按时结束',()=>{setup('holy_shield','guard','angel');cast('holy_shield');ctx.player.shield.value=0;s.updateHolyShield(0);ctx.playerTakeDamage(20,null);assert.equal(ctx.player.hp,100);s.updateHolyShield(1);ctx.playerTakeDamage(20,null);assert.equal(ctx.player.hp,80);});
test('火球分支击碎桶时仍对周围怪物爆炸',()=>{
    setup('fireball','explosion');const e=enemy(150);cast('fireball');ctx.p=ctx.projectiles[0];ctx.p.x=100;ctx.p.y=0;
    ctx.hitTarget=null;ctx.destructibles=[{x:100,y:0,radius:12,broken:false}];
    const start=game.indexOf('// 检测可破坏物体碰撞');const end=game.indexOf('// 火球爆炸效果',start);
    vm.runInContext(game.slice(start,end),ctx);assert.equal(ctx.destructibles[0].broken,true);assert.ok(e.hp<10000);
});
test('守护破盾同帧先治疗再承受下一击',()=>{setup('holy_shield','guard');ctx.player.hp=50;cast('holy_shield');ctx.playerTakeDamage(28,null);close(ctx.player.hp,62);ctx.playerTakeDamage(20,null);close(ctx.player.hp,42);});
test('天使破盾同帧阻挡第二击',()=>{setup('holy_shield','guard','angel');ctx.player.hp=50;cast('holy_shield');ctx.playerTakeDamage(28,null);ctx.playerTakeDamage(80,null);close(ctx.player.hp,62);});
test('链接破盾同帧生成次级盾吸收第二击',()=>{setup('holy_shield','guard','link');ctx.player.hp=50;cast('holy_shield');ctx.playerTakeDamage(28,null);assert.equal(ctx.player.shield.value,8);ctx.playerTakeDamage(20,null);close(ctx.player.hp,50);});
test('天使保护期间基础和分支技能均不扣蓝出手',()=>{setup('multishot','spread');ctx.player.shield.invincibleTimer=1;cast('multishot');assert.equal(ctx.player.mp,1000);assert.equal(ctx.projectiles.length,0);ctx.player.skillTree.multishot.stage2.level=0;cast('multishot');assert.equal(ctx.projectiles.length,0);});
vm.runInContext(extract('performAttack'),ctx);
test('天使保护期间真实普攻入口不造成伤害',()=>{setup('holy_shield','guard','angel');ctx.player.shield.invincibleTimer=1;ctx.player.elementalDamage={fire:0,lightning:0,poison:0};const e=enemy();ctx.performAttack(e);assert.equal(e.hp,10000);});
test('天使保护期间真实移动速度增加四成',()=>{setup('holy_shield','guard','angel');ctx.player.speed=180;ctx.player.shield.invincibleTimer=1;ctx.dt=0.1;
    const start=game.indexOf('const speedMultiplier = player.frozen');const end=game.indexOf('\n',game.indexOf('const move =',start));
    vm.runInContext(`{${game.slice(start,end)};globalThis.moveDistance=move;}`,ctx);close(ctx.moveDistance,25.2);
});
const simpleDamage=ctx.takeDamage;vm.runInContext(extract('takeDamage'),ctx);
test('真实闪避入口不会附加感电麻痹',()=>{setup('thunder','shock');const e=enemy();e.dodgeChance=1;cast('thunder');assert.equal(e.hp,10000);assert.ok(!(e.frozenTimer>0));assert.equal(s.states.has(e),false);});
test('真实闪避入口不会附加灼烧或传播',()=>{setup('fireball','burn','spread');const e=enemy(),other=enemy(180);e.dodgeChance=1;cast('fireball');hit(ctx.projectiles[0],e);assert.equal(e.hp,10000);assert.equal(s.states.has(e),false);assert.equal(s.states.has(other),false);});
test('真实护甲入口保持分支箭与基础箭单箭伤害相同',()=>{setup('multishot','pierce');const e=enemy();e.armor=100;ctx.takeDamage(e,80,true);const baseline=10000-e.hp;e.hp=10000;cast('multishot');hit(ctx.projectiles[0],e);assert.equal(10000-e.hp,baseline);});
ctx.takeDamage=simpleDamage;
}
if (failures) process.exitCode=1;
