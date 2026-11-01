// 同一真实结算入口开启/关闭特效，对照战斗状态与随机序列。
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),game=fs.readFileSync(path.join(root,'game.js'),'utf8');
function extract(name){const start=game.indexOf('function '+name+'(');assert(start>=0,name);const header=game.slice(start).match(/^function [\s\S]*?\)\s*\{/);assert(header);let depth=1;for(let i=start+header[0].length;i<game.length;i++){if(game[i]==='{')depth++;if(game[i]==='}'&&!--depth)return game.slice(start,i+1);}throw Error(name);}
function run(enabled){
 let seed=917,calls=0,particles=0,damages=0,resolves=0;const random=()=>{calls++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},noop=()=>{};
 const s={console,Math:Object.assign(Object.create(Math),{random}),Image:class{set src(v){this.onload();}},CombatVisuals:{allowDecoration:()=>true,isBusy:()=>false,feedback:noop,trackAttack:noop},HeroVfx:{isReady:()=>true,drawShared:()=>true,sharedRadius:()=>24},LightningVfx:{drawLink:noop},
 player:{x:80,y:0,hp:10000,maxHp:10000,mp:500,invincibleTimer:0,resistances:{fire:20,cold:10,lightning:15},isDead:false},enemies:[],projectiles:[],scheduledMonsterAttacks:[],COLORS:{green:'#0f0',ice:'#0ff',poison:'#0f0',revive:'#fff',manaCost:'#00f'},GAME_CONFIG:{MONSTER_MELEE_RANGE_SQ:2200},CAST_SOURCE_VFX:{enemyArrow:'enemyArrowMuzzle',enemyLightning:'enemyLightningMuzzle'},EnemyPool:{acquire:o=>o},ProjectilePool:{acquire:o=>o},SkillBranchSystem:{controlMultiplier:()=>.8},AudioSys:{play:noop},spawnVfxEffect:noop,emitDriftingVeil:noop,spawnMonsterAttackTelegraph:noop,spawnCastSourceVfx:noop,triggerMonsterAction:noop,setMonsterFacingToward:noop,createDamageNumber:noop,showNotification:noop,updateUI:noop,checkPlayerDeath:noop,isWall:()=>false,hasLineOfSight:()=>true,createParticle(){particles++;random();}};
 s.playerTakeDamage=(d,e)=>{damages++;if(s.player.invincibleTimer>0)return 0;s.player.hp-=d;return d;};
 const context=vm.createContext(s);vm.runInContext(fs.readFileSync(path.join(root,'combat-tactics.js'),'utf8'),context);vm.runInContext(fs.readFileSync(path.join(root,'enemy-system.js'),'utf8')+'\nthis.affixes=ELITE_AFFIXES;this.tactics=CombatTactics;',context);
 if(enabled){vm.runInContext(fs.readFileSync(path.join(root,'pixelfx-polish.js'),'utf8')+'\nthis.polish=PixelFxPolish;',context);s.polish.setQuality(true);s.polish.warmLarge();vm.runInContext(fs.readFileSync(path.join(root,'enemy-vfx.js'),'utf8')+'\nthis.fx=EnemyVfx;',context);s.fx.setQuality(true);}
 for(const name of ['createMonsterAttackAim','startMonsterAttack','processScheduledMonsterAttacks','startRangedEnemyAttack','calculateEnemyOutgoingDamage','applyEnemyCursedHit','emitEnemyScatterVolley','resolveEnemyMeleeImpact','applyEnemyProjectileOnHit','emitMummyDeathCloud'])vm.runInContext(extract(name),context);
 const enemy=(extra={})=>{const e={name:'验收怪',x:0,y:0,hp:100,maxHp:1000,dmg:20,cooldown:0,dead:false,...extra};s.enemies.push(e);return e;};
 const b=enemy({isBoss:true,slamRadius:150,breathRange:200,breathAngle:60,summonCount:3,tentacleCount:5});
 const teleporter=enemy({name:'女伯爵',isBoss:true,canTeleport:true,x:500,skillCd:0});s.updateBossSkills(teleporter,.016);assert(teleporter.x!==500,'真实瞬移仍执行');
 s.bossFireNova(b,150,50);assert.equal(s.player.hp,9960);s.bossFireNova(b,150,50);assert.equal(s.player.hp,9960,'无敌帧没有假命中');
 s.player.invincibleTimer=0;s.bossGroundSlam(b);assert.equal(s.player.hp,9944);
 s.player.invincibleTimer=0;s.player.x=300;s.bossGroundSlam(b);assert.equal(s.player.hp,9944,'范围外不受伤');
 s.player.x=80;s.player.y=0;s.bossBreathAttack(b,Math.PI/2);assert.equal(s.player.hp,9944,'锁定扇区外不受伤');s.bossBreathAttack(b,0);assert.equal(s.player.hp,9923.6);
 s.bossSummonMinions(b);const count=s.enemies.length;s.isWall=()=>true;s.bossSummonMinions(b);assert.equal(s.enemies.length,count,'墙内不召唤');s.isWall=()=>false;
 s.bossTentacleAttack(b,.6);assert.equal(s.projectiles.length,5);assert.equal(s.projectiles[2].angle,.6);assert.equal(s.projectiles[0].damage,12);
 const archer=enemy({ai:'ranged',multiShot:3});s.player.x=100;s.player.y=0;assert(s.startRangedEnemyAttack(archer));s.player.y=100;s.processScheduledMonsterAttacks(.17);assert.equal(s.projectiles.length,5);s.processScheduledMonsterAttacks(.02);assert.equal(s.projectiles.length,8);assert.equal(s.projectiles[6].angle,0,'离手时仍使用蓄力锁向');
 const cancelled=enemy({ai:'chase'});s.startMonsterAttack(cancelled,{targetX:20,targetY:0,impactDelay:.1,tactic:'heavy',resolve:()=>resolves++});s.tactics.hit(cancelled,1,true);s.processScheduledMonsterAttacks(.2);assert.equal(resolves,0,'打断无释放/命中副作用');
 const dead=enemy();s.startMonsterAttack(dead,{targetX:20,targetY:0,impactDelay:.1,resolve:()=>resolves++});dead.dead=true;s.processScheduledMonsterAttacks(.2);assert.equal(resolves,0,'死亡取消');
 s.player.x=20;s.player.y=0;s.player.invincibleTimer=0;s.player.slowedTimer=0;
 const vampire=enemy({lifeSteal:.5,cursed:true,curseDuration:3,freezeOnHit:true,manaBurn:true,poisonOnHit:true,poisonDamage:4,scatterVolley:true,multiShot:3,elementalDmg:{lightning:5}});
 const dealt=s.resolveEnemyMeleeImpact(vampire);assert(dealt>0);assert(vampire.hp>100);assert(s.player.frozen&&s.player.poisoned&&s.player.cursedTimer>0);assert(s.player.mp<500);
 s.applyEnemyProjectileOnHit(vampire,0);s.player.invincibleTimer=1;const healed=vampire.hp;s.resolveEnemyMeleeImpact(vampire);assert.equal(vampire.hp,healed,'免疫不触发吸血');
 s.emitMummyDeathCloud(enemy({monsterType:'mummy'}));
 s.player.invincibleTimer=0;s.affixes.find(a=>a.id==='fire_enchanted').onDeath(vampire);
 if(enabled){s.fx.update(.1);s.fx.drawEvents(new Proxy({globalAlpha:1},{get:(o,k)=>k in o?o[k]:noop}),{x:0,y:0},800,600);s.fx.update(2);s.polish.update(2);assert.equal(s.fx.getStats().active,0);assert.equal(s.polish.getStats().active,0);}
 return JSON.parse(JSON.stringify({player:s.player,enemies:s.enemies.map(e=>({...e,combatCue:e.combatCue?{timer:e.combatCue.timer,tactic:e.combatCue.tactic,aim:e.combatCue.aim}:null})),projectiles:s.projectiles.map(p=>({...p,owner:p.owner?.name})),queued:s.scheduledMonsterAttacks.length,seed,calls,particles,damages,resolves}));
}
assert.deepEqual(run(true),run(false));console.log('PASS: 开关敌方特效时，真实Boss范围/无敌帧/锁向/召唤墙体/触手/箭矢/打断/死亡/吸血/诅咒/冰冻/法力/毒云结算与随机序列完全一致');
