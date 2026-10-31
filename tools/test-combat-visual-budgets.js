// 以空闲调度、像素与真实伤害/打断入口验证预算边界。
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createCanvas}=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'..'),game=fs.readFileSync(path.join(root,'game.js'),'utf8');
let next=0,created=0;
const jobs=new Map(),handlers={};
const scope=vm.createContext({document:{hidden:false,addEventListener:(name,fn)=>handlers[name]=fn,createElement(){created++;return createCanvas(1,1);}},
 requestIdleCallback(fn){jobs.set(++next,fn);return next;},cancelIdleCallback(id){jobs.delete(id);}});
vm.runInContext(fs.readFileSync(path.join(root,'combat-visuals.js'),'utf8')+'\nthis.v=CombatVisuals;',scope);
const v=scope.v,canvas=createCanvas(16,8),c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,16,8);
const effect={blend:'split',row:0,frameCount:2,frameWidth:8,frameHeight:8,material:{x:4,y:4,rx:3,ry:3}};
function idle(ms=20){const [id,fn]=jobs.entries().next().value;assert(fn,'应存在待执行空闲任务');jobs.delete(id);fn({timeRemaining:()=>ms});}
v.warm(canvas,{example:effect});idle(1);
assert.equal(v.getStats().light.entries,0,'空闲不足时不读像素');
const budget=v.getStats().lightBudget;idle(4);
assert.equal(v.getStats().light.entries,1);assert.equal(v.getStats().warmup.pending,1,'每次只准备一帧');
assert.equal(v.getStats().lightBudget,budget,'空闲准备不抢占渲染构建名额');
idle();assert.equal(jobs.size,0);assert.equal(v.getStats().light.entries,2);
const before=created;v.vfx(c,canvas,0,0,8,8,0,0,8,8,true,effect.material);
assert.equal(created,before,'首次真正使用已预热帧不再分配');
v.feedback('block',{x:0,y:0},0);v.clear(true);
assert.equal(v.getStats().light.entries,2,'跨层复用与地图无关的已预热光照帧');
assert.equal(v.getStats().feedbacks,0);assert.equal(jobs.size,0,'预热完成后切层不重复排队');
v.clear();const stale=jobs.values().next().value;v.beginFrame(false,0);
assert.equal(jobs.size,0);stale({timeRemaining:()=>20});assert.equal(v.getStats().light.bytes,0,'失效回调不能恢复低画质缓存');
v.beginFrame(true,0);scope.document.hidden=true;handlers.visibilitychange();assert.equal(jobs.size,0);
scope.document.hidden=false;handlers.visibilitychange();assert.equal(jobs.size,1);
v.beginFrame(true,0,0,0,200);idle();assert.equal(v.getStats().light.bytes,0,'混战时不预热');
v.beginFrame(true,0,0,0,0);idle();assert.equal(v.getStats().light.entries,1);
// 模拟首次解码耗时激增后只剩4ms空闲，后续任务不能永久排队。
let clock=0;scope.performance={now(){clock+=30;return clock;}};
v.clear();idle();assert(v.getStats().warmup.cost>=5);
scope.performance={now:()=>clock};
for(let i=0;i<12&&jobs.size;i++)idle(4);
assert.equal(v.getStats().warmup.pending,0,'偶发高耗时后仍能在短空闲窗口继续预热');
console.log('PASS: 空闲余量、逐帧预热、缓存命中、质量切换、过期回调、后台取消和混战让路');

v.beginFrame(true,0,0,0,200);
let distant=0,near=0;for(let i=0;i<100;i++)if(v.allowDecoration(999,999))distant++;
for(let i=0;i<100;i++)if(v.allowDecoration(0,0))near++;
assert.equal(distant,16);assert.equal(near,8,'当前目标附近拥有独立保留名额');
for(const type of ['lightning','lightning_chain','impact_facet','skill_impact_ring','drop_beam','drifting_veil'])assert(!v.isDecoration({type}),`${type} 必须绕过装饰预算`);
assert(v.isDecoration({cosmetic:true}));assert(v.isDecoration({type:'skill_ground_glow'}));
for(let i=0;i<10;i++)v.sampleFrame(30);assert(v.getStats().overloaded);
for(let i=0;i<10;i++)v.sampleFrame(2);assert(v.getStats().overloaded,'短时恢复不能反复切换');
for(let i=0;i<120;i++)v.sampleFrame(2);assert(!v.getStats().overloaded);
v.beginFrame(true,1);let normal=0;while(v.allowDecoration(999,999))normal++;assert.equal(normal,48);
console.log('PASS: 装饰预算、目标保留、关键类型豁免与慢帧降级/恢复滞后');

v.beginFrame(true,1);const frostSource=createCanvas(16,16),fc=frostSource.getContext('2d');fc.fillStyle='#555';fc.fillRect(3,2,8,12);
const frame={x:0,y:0,width:16,height:16};
function iceAlpha(remaining){const out=createCanvas(16,16),ctx=out.getContext('2d');v.frost(ctx,frostSource,frame,0,0,16,16,remaining);return ctx.getImageData(0,0,16,16).data.reduce((sum,value,i)=>sum+(i%4===3?value:0),0);}
const full=iceAlpha(1),half=iceAlpha(.11),end=iceAlpha(.01);assert(full>half&&half>end&&end>0);assert.equal(iceAlpha(0),0);
assert.equal(v.getStats().frost.entries,1,'渐退重用同一张轮廓缓存');
console.log('PASS: 冻结末段像素连续消退、到期归零且不重复构建');

function extract(name){const a=game.indexOf(`function ${name}(`);assert(a>=0);let depth=0;for(let i=game.indexOf(') {',a)+2;i<game.length;i++){if(game[i]==='{')depth++;if(game[i]==='}'&&!--depth)return game.slice(a,i+1);}}
const messages=[],sounds=[];
Object.assign(scope,{player:{x:0,y:0},SkillBranchSystem:{amplify:(e,d)=>d},spawnVfxEffect(){throw Error('不能退回通用格挡图集');},
 createDamageNumber:(x,y,text)=>messages.push(text),Juice:{hit(){}},AudioSys:{play:name=>sounds.push(name)}});
vm.runInContext(extract('takeDamage'),scope);
const dodged={x:30,y:0,hp:100,dodgeChance:1},blocked={x:30,y:30,hp:100,blockChance:1,monsterType:'zombie'};
scope.takeDamage(dodged,50,false);scope.takeDamage(blocked,50,false);
assert.equal(dodged.hp,100);assert.equal(blocked.hp,100);assert.deepEqual(messages,['闪避!','格挡!']);assert.deepEqual(sounds,['melee_hit']);
assert.equal(v.getStats().feedbacks,2);
vm.runInContext(fs.readFileSync(path.join(root,'combat-tactics.js'),'utf8')+'\nthis.t=CombatTactics;',scope);
const pending={timer:.8,duration:1,damageTaken:0},boss={x:60,y:0,hp:1000,maxHp:1000,isBoss:true,pendingSkill:pending};
scope.t.hit(boss,39,true);assert.equal(boss.pendingSkill,pending);assert.equal(v.getStats().feedbacks,2);
scope.t.hit(boss,1,true);assert.equal(boss.pendingSkill,null);assert(pending.cancelled);assert.equal(boss.recoveryTimer,1.2);assert.equal(v.getStats().feedbacks,3);
const strokes=[],labels=[],arcs=[];
const ctx=new Proxy({globalAlpha:1},{get(o,k){if(k==='stroke')return ()=>strokes.push(o.strokeStyle);if(k==='fillText')return text=>labels.push(text);if(k==='arc')return (...args)=>arcs.push(args);if(k==='measureText')return ()=>({width:60});return k in o?o[k]:()=>{};}});
v.beginFrame(true,2);while(v.allowDecoration(0,0)){}
v.drawFeedback(ctx,{x:-100,y:-100},500,500);
assert(strokes.includes('#ffe4a0')&&strokes.includes('#b2d3de')&&strokes.includes('#8fe8e2'),'预算耗尽后仍画出三种独立关键反馈');
const danger={x:0,y:0,pendingSkill:{originX:0,originY:0,timer:.5,duration:1,label:'危险重击',data:{telegraph:'circle',radius:80}}};
scope.t.draw(ctx,[danger,boss],{x:-100,y:-100},500,500);
assert(arcs.some(a=>a[2]===80),'预算耗尽后危险范围半径保持原值');
assert(labels.includes('危险重击'));assert(labels.includes('打断 · 破绽 +25%'));
for(let i=0;i<500;i++)v.feedback('block',{x:0,y:0},0);
assert.equal(v.getStats().feedbacks,96);v.update(.5);assert.equal(v.getStats().feedbacks,0);
const poolStart=game.indexOf('const ParticlePool = {'),poolEnd=game.indexOf('\n};',poolStart);
vm.runInContext(game.slice(poolStart,poolEnd+3)+'\nthis.pool=ParticlePool;',scope);
const particle=scope.pool.acquire({cosmetic:true});scope.pool.release(particle);assert.equal(scope.pool.acquire({type:'impact_facet'}).cosmetic,false);
console.log('PASS: 真实闪避/格挡不扣血、Boss打断阈值与取消、关键反馈和危险范围豁免、反馈过期与对象池清理');
