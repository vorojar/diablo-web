const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),game=fs.readFileSync(path.join(root,'game.js'),'utf8');
function extract(name){const start=game.indexOf(`function ${name}(`);assert(start>=0);let depth=0;for(let i=game.indexOf('{',start);i<game.length;i++){if(game[i]==='{')depth++;if(game[i]==='}'&&!--depth)return game.slice(start,i+1);}}
const noop=()=>{},scope={console,player:{x:80,y:0,hp:100,maxHp:100,isDead:false,invincibleTimer:0,resistances:{fire:0,lightning:0}},enemies:[],scheduledMonsterAttacks:[],projectiles:[],particles:[],AudioSys:{play:noop},createDamageNumber:noop,createParticle:noop,updateUI:noop,checkPlayerDeath:noop,showNotification:noop,spawnMonsterAttackTelegraph:noop,triggerMonsterAction:noop,setMonsterFacingToward:noop,spawnVfxEffect:noop,isWall:()=>false,hasLineOfSight:()=>true,resolveEnemyMeleeImpact:()=>{scope.player.hp-=10;return 10;}};
vm.createContext(scope);vm.runInContext(fs.readFileSync(path.join(root,'combat-tactics.js'),'utf8')+'\nglobalThis.tactics=CombatTactics;',scope);vm.runInContext(fs.readFileSync(path.join(root,'enemy-system.js'),'utf8'),scope);
for(const name of ['createMonsterAttackAim','startMonsterAttack','processScheduledMonsterAttacks'])vm.runInContext(extract(name),scope);
const t=scope.tactics;
function enemy(extra={}){const e={x:0,y:0,hp:1000,maxHp:1000,dmg:20,cooldown:0,...extra};scope.enemies.push(e);return e;}
const boss=enemy({isBoss:true});scope.startBossSkillWindup(boss,'groundSlam',6,{telegraph:'circle',radius:150});assert.equal(boss.pendingSkill.duration,.95);
scope.updateBossPendingSkill(boss,.5);assert.equal(scope.player.hp,100,'预警期间不能提前结算');
t.hit(boss,39,true);assert(boss.pendingSkill);t.hit(boss,1,true);assert.equal(boss.pendingSkill,null);scope.updateBossPendingSkill(boss,1);assert.equal(scope.player.hp,100,'打断取消真实Boss伤害');assert.equal(t.multiplier(boss,true),1.25);
t.tick(boss,2);assert.equal(t.multiplier(boss,true),1,'破绽必须到时结束');
scope.startBossSkillWindup(boss,'groundSlam',6,{telegraph:'circle',radius:150});scope.player.x=180;scope.updateBossPendingSkill(boss,1);assert.equal(scope.player.hp,100,'退出圈外不受重击');assert(boss.recoveryTimer>0);
t.tick(boss,2);scope.player.x=80;scope.startBossSkillWindup(boss,'groundSlam',6,{telegraph:'circle',radius:150});scope.updateBossPendingSkill(boss,1);assert.equal(scope.player.hp,84,'留在红圈内真实结算伤害');
let revived=0;const shaman=enemy({ai:'revive'});scope.startMonsterAttack(shaman,{duration:.85,impactDelay:.85,tactic:'revive',targetX:20,targetY:0,resolve:()=>revived++});t.hit(shaman,1,true);scope.processScheduledMonsterAttacks(1);assert.equal(revived,0,'打断必须取消队列副作用');
const archer=enemy({ai:'ranged'});scope.player.x=40;let shot=0;scope.startMonsterAttack(archer,{duration:.4,impactDelay:.18,targetX:40,targetY:0,resolve:()=>shot++});t.hit(archer,10,false);scope.processScheduledMonsterAttacks(1);assert.equal(shot,0);assert(archer.recoveryTimer>0);t.tick(archer,.6);t.hit(archer,10,false);assert.equal(archer.recoveryTimer,0,'压制免疫期不能连续锁死');
const armor=enemy({monsterType:'skeleton',facingDirection:'right'});scope.player.x=80;assert.equal(t.multiplier(armor,false),.65);scope.player.x=-80;assert.equal(t.multiplier(armor,false),1);scope.player.x=80;assert.equal(t.multiplier(armor,true),1,'技能绕过正面物理护甲');
const vampire=enemy({ai:'vampire'});scope.player.x=150;scope.player.y=0;t.beginCharge(vampire);scope.player.y=100;scope.processScheduledMonsterAttacks(.64);assert(!vampire.isDashing);scope.processScheduledMonsterAttacks(.02);assert(vampire.isDashing);assert.equal(vampire.dashTargetY,0,'预警后不得追踪转向');t.charge(vampire,.4);assert.equal(vampire.y,0);assert(vampire.recoveryTimer>0,'冲空后有反击窗口');
const wallCharge=enemy({ai:'vampire'});scope.player.x=150;scope.player.y=0;t.beginCharge(wallCharge);scope.processScheduledMonsterAttacks(.7);scope.isWall=x=>x>=60;t.charge(wallCharge,1);assert(wallCharge.x<60,'突进不能跨墙');
console.log('PASS: Boss预警/真实范围伤害/打断取消/破绽过期、复活打断、压制免疫、正面护甲与锁向突进');

const fallen=enemy({ai:'revive'});scope.startMonsterAttack(fallen,{duration:.85,impactDelay:.85,tactic:'revive',targetX:0,targetY:0,resolve:()=>{throw new Error('死亡后不能复活队友');}});fallen.dead=true;scope.processScheduledMonsterAttacks(1);assert.equal(fallen.combatCue,null,'死亡队列移除时必须清理读条，防止被复活后永久停步');

const labels=[];const drawing=new Proxy({}, {get:(_,k)=>k==='fillText'?(v)=>labels.push(v):k==='measureText'?()=>({width:100}):()=>{}});
for(const ai of ['revive','ranged','specter']){const idle=enemy({ai});scope.AutoBattle={currentTarget:idle};t.draw(drawing,[idle],{x:0,y:0},800,600);}
assert.deepEqual(labels,[],'普通名称旁不应有常驻战术说明');
