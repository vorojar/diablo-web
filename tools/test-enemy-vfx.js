// 原始像素同步、只读输入、随机序列和有损资源情况下的生命周期。
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),sharp=require('sharp');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'enemy-vfx.js'),'utf8');
(async()=>{
 const builder=await import(pathToFileURL(path.join(root,'tools/build-enemy-vfx.mjs'))),r=await builder.render(),m=JSON.parse(fs.readFileSync(path.join(root,'art/enemy-vfx/manifest.json'),'utf8'));
 assert.deepEqual(r.meta,m);assert.deepEqual(JSON.parse(source.match(/const m=(.*?);\r?\n/)[1]),m);assert(m.width*m.height*8<4*1024*1024);
 for(const layer of ['body','light']){
  const data=await sharp(path.join(root,m[layer])).ensureAlpha().raw().toBuffer(),expected=r[layer].getContext('2d').getImageData(0,0,m.width,m.height).data;
  assert.equal(data.length,expected.length);
  for(let i=0;i<data.length;i++)if(i%4===3||expected[i-i%4+3]>0)assert.equal(data[i],expected[i],layer+' 像素过期 '+i);
  for(const [id,e]of Object.entries(m.effects)){let visible=0,end=0;for(let y=e.row*64;y<(e.row+1)*64;y++)for(let x=0;x<m.width;x++)if(data[(y*m.width+x)*4+3]){visible++;if(x>=11*64)end++;}assert(visible>0,id+' 应可见');if(!e.loop)assert.equal(end,0,id+' 末帧透明');}
 }
 let budget=true;const images=[],draws=[],circles=[],links=[];
 const ctx=new Proxy({globalAlpha:1},{get(o,k){if(k==='drawImage')return (...a)=>draws.push(a);if(k==='arc')return (...a)=>circles.push(a);return k in o?o[k]:()=>{};}});
 const scope=vm.createContext({console,Image:class{constructor(){images.push(this);}set src(value){this.onload();}},Math:Object.assign(Object.create(Math),{random(){throw Error('特效不得消耗战斗随机数');}}),CombatVisuals:{allowDecoration:()=>budget,isBusy:()=>false},HeroVfx:{drawShared:()=>{draws.push('shared');return true;},sharedRadius:()=>24.642857},LightningVfx:{drawLink:(c,l)=>links.push({...l})}});
 vm.runInContext(source+'\nthis.fx=EnemyVfx;',scope);const fx=scope.fx,camera={x:0,y:0};fx.setQuality(true);for(let i=0;i<100;i++)fx.setQuality(true);assert.equal(images.length,2);
 for(const type of [undefined,'scatter_shot','lightning_ball','tentacle']){const p={x:100,y:100,type,age:.1,angle:1,damage:99};const old=JSON.stringify(p);assert(fx.projectile(ctx,p,true));assert(!fx.projectile(ctx,p,false));assert.equal(JSON.stringify(p),old);}
 assert(!fx.projectile(ctx,{type:'fireball'},true));
 const e={x:100,y:100,ai:'chase'},aim={angle:.5,targetX:130,targetY:110};const old=JSON.stringify({e,aim});fx.release(e,aim);assert.equal(JSON.stringify({e,aim}),old);
 fx.boss('fireNova',100,100,130);fx.boss('slam',300,100,80);fx.boss('breath',100,300,200,.4,.3);fx.summon(300,300);fx.poison(400,400,95);fx.curse(250,250);fx.drain(100,100,130,110);fx.drawEvents(ctx,camera,500,500);
 for(const r of [130,80,200,95])assert(circles.some(a=>a[2]===r),'必须裁剪到真实范围 '+r);
 assert.equal(links.length,5);for(const l of links){assert.equal(l.x,100);assert.equal(l.y,300);assert(Math.abs(Math.hypot(l.tx-l.x,l.ty-l.y)-200)<1e-6);assert(Math.abs(Math.atan2(l.ty-l.y,l.tx-l.x)-.4)<.3);}
 const list=[{x:200,y:200,isBoss:true,pendingSkill:{id:'groundSlam',timer:.5,duration:1,data:{angle:1}}}];const before=JSON.stringify(list);fx.drawWindups(ctx,list,camera,500,500);assert.equal(JSON.stringify(list),before);
 fx.clear();for(let i=0;i<100;i++)fx.summon(i*40,100);assert.equal(fx.getStats().active,24);fx.setQuality(false);assert.equal(fx.getStats().active,12);assert.equal(fx.getStats().atlasBytes,768*640*4);assert(!fx.getStats().lightReady);
 fx.clear();for(let i=0;i<12;i++)fx.playerHit('lightning',i*40,100);fx.summon(200,200);assert.equal(fx.getStats().active,12);fx.boss('slam',250,250,90);budget=false;draws.length=0;circles.length=0;fx.drawEvents(ctx,camera,500,500);assert(draws.length>0,'装饰耗尽仍保留关键命中本体');assert(circles.some(a=>a[2]===90),'装饰耗尽仍保留Boss释放本体');
 fx.update(2);assert.equal(fx.getStats().active,0);assert(fx.getStats().pooled<=24);
 const errors=[],missing=vm.createContext({console:{error:s=>errors.push(s)},Image:class{set src(value){this.onerror();}}});vm.runInContext(source+'\nthis.fx=EnemyVfx;',missing);missing.fx.setQuality(true);missing.fx.setQuality(true);assert.equal(errors.length,2);assert(!missing.fx.projectile(ctx,{},true));assert(!missing.fx.drawVfx(ctx,{effectId:'enemyLightningMuzzle'}));missing.fx.summon(100,100);missing.fx.update(2);assert.equal(missing.fx.getStats().active,0);assert(missing.fx.getStats().assetError);
 console.log('PASS: 10类敌方原始双层像素、只读弹体与锁向/范围、零战斗随机调用、24/12事件上限、3.75/1.875MiB预算、关键命中/清理与缺图回退');
})().catch(e=>{console.error(e);process.exitCode=1;});
