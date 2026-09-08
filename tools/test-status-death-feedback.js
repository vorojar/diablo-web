const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
function extract(name,text=source){const start=text.indexOf(`function ${name}(`);assert(start>=0);let depth=0;for(let i=text.indexOf('{',start);i<text.length;i++){if(text[i]==='{')depth++;if(text[i]==='}'&&!--depth)return text.slice(start,i+1);}}
const scope=vm.createContext({player:{x:500,y:500,graphicsQuality:'high'},particles:[],ParticlePool:{acquire:p=>p},COLORS:{poison:'#66bb44'},getParticleConfig:()=>({maxParticles:100}),getEnemyMonsterType:e=>e.monsterType,createDamageNumber(){},VFX_SPRITE_CONFIG:{effects:{}},vfxEffects:[]});
for(const fn of ['emitDriftingVeil','drawDriftingVeil','drawParticleSliver','createImpactParticles','getMonsterImpactProfile','spawnEnemyDeathVfx','emitMummyDeathCloud','spawnVfxEffect'])vm.runInContext(extract(fn),scope);
scope.emitMummyDeathCloud({x:0,y:0,monsterType:'mummy',dmg:100});
assert.equal(scope.particles.length,1);assert.equal(scope.particles[0].type,'drifting_veil');assert.equal(scope.particles[0].size,95);assert(!scope.player.poisoned);
scope.player.x=50;scope.player.y=0;scope.emitMummyDeathCloud({x:0,y:0,monsterType:'mummy',dmg:100});
assert.equal(scope.player.poisonTimer,2.5);assert.equal(scope.player.poisonDamage,25);assert(scope.player.poisoned);
scope.particles=[];
for(let i=0;i<100;i++)scope.spawnVfxEffect('poisonStatusBurst',0,0);
assert.equal(scope.particles.length,1,'重复中毒特效合并');assert.equal(scope.vfxEffects.length,0,'不再叠加旧毒素图集');
for(const quality of ['high','low']){
 scope.player.graphicsQuality=quality;scope.particles=[];
 for(let i=0;i<100;i++)scope.emitDriftingVeil(i*200,0,'green',20);
 assert.equal(scope.particles.length,quality==='high'?16:6);
 scope.particles=[];scope.spawnEnemyDeathVfx({x:0,y:0,radius:12,monsterType:'skeleton'});
 assert.equal(scope.particles.length,quality==='high'?3:2);assert(scope.particles.every(p=>p.type==='impact_facet'));
 scope.particles=[];scope.spawnEnemyDeathVfx({x:0,y:0,radius:12,monsterType:'ghost'});
 assert.equal(scope.particles[0].type,'drifting_veil');
 let fills=0;const ctx=new Proxy({}, {get:(_,key)=>key==='fill'?()=>fills++:key==='arc'?()=>{throw Error('烟带和光痕不得画圆点');}:(...args)=>assert(args.every(v=>typeof v!=='number'||Number.isFinite(v)))});
 scope.particles[0].life=.4;scope.drawDriftingVeil(ctx,scope.particles[0]);scope.drawParticleSliver(ctx,{x:0,y:0,size:5,life:.3,color:'gold',vy:-100});assert(fills>=3);
}
// 执行生产粒子更新分支，保证烟带到期回收而不是常驻。
scope.particles[0].life=.01;scope.dt=.1;scope.ParticlePool.release=()=>{};scope.bloodCtx=null;
// 使用明确的主更新标记，避开暂停时的特殊掉落更新。
const loop=source.lastIndexOf('    for (let i = particles.length - 1; i >= 0; i--) {');
let depth=0,end=loop;for(let i=source.indexOf('{',loop);i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&!--depth){end=i+1;break;}}
vm.runInContext(source.slice(loop,end),scope);assert.equal(scope.particles.length,0);
scope.slowMotion={};scope.damageNumbers=[];scope.triggerScreenShake=()=>{};
const sounds=[];scope.AudioSys={play:type=>sounds.push(type)};
vm.runInContext(extract('triggerEliteDeathEffect'),scope);
vm.runInContext(extract('triggerBossDeathEffect',fs.readFileSync(path.join(__dirname,'../enemy-system.js'),'utf8')),scope);
for(const fn of ['triggerEliteDeathEffect','triggerBossDeathEffect']){
 scope.particles=[];scope[fn]({x:0,y:0,name:'测试怪物'},100);
 assert.equal(scope.particles.length,1,'精英/Boss不再额外叠加粒子群');assert.equal(scope.particles[0].type,'drop_beam');
 assert(scope.slowMotion.active);
}
assert.deepEqual(sounds,['elite_death','boss_death']);
console.log('PASS: 毒云真实范围与伤害、区域合并、画质上限、死亡材质、无圆点绘制与到期回收');
