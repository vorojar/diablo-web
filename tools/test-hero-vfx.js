// 原始素材像素、表现预算、只读输入和失败恢复；分支伤害另跑真实行为回归。
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),sharp=require('sharp');
const {pathToFileURL}=require('node:url'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'hero-vfx.js'),'utf8');
(async()=>{
 const builder=await import(pathToFileURL(path.join(root,'tools/build-hero-vfx.mjs'))),r=await builder.render(),m=JSON.parse(fs.readFileSync(path.join(root,'art/hero-vfx/manifest.json'),'utf8'));
 assert.deepEqual(r.meta,m);assert.deepEqual(JSON.parse(source.match(/const m=(.*?);\r?\n/)[1]),m);assert(m.width*m.height*8<=6*1024*1024);
 for(const layer of ['body','light']){
  const {data,info}=await sharp(path.join(root,m[layer])).ensureAlpha().raw().toBuffer({resolveWithObject:true}),expected=r[layer].getContext('2d').getImageData(0,0,m.width,m.height).data;
  assert.equal(info.width,m.width);assert.equal(info.height,m.height);
  for(let i=0;i<data.length;i++)if(i%4===3||expected[i-i%4+3]>0)assert.equal(data[i],expected[i],`${layer} 生成像素过期 ${i}`);
  for(const [id,e]of Object.entries(m.effects)){let visible=0,end=0;for(let y=e.row*64;y<(e.row+1)*64;y++)for(let x=0;x<m.width;x++)if(data[(y*m.width+x)*4+3]){visible++;if(x>=11*64)end++;}assert(visible>0,id+' 应可见');if(!e.loop)assert.equal(end,0,id+' 末帧透明');}
 }
 let budget=true;const images=[],draws=[],circles=[];
 const scope=vm.createContext({console,Image:class{constructor(){images.push(this);}set src(value){this.onload();}},Math:Object.assign(Object.create(Math),{random(){throw Error('禁止消费战斗随机数');}}),CombatVisuals:{allowDecoration:()=>budget}});
 vm.runInContext(source+'\nthis.fx=HeroVfx;',scope);const fx=scope.fx;
 const ctx=new Proxy({globalAlpha:1},{get(o,k){if(k==='drawImage')return (...a)=>draws.push(a);if(k==='arc')return (...a)=>circles.push(a);return k in o?o[k]:()=>{};}}),camera={x:0,y:0};
 fx.setQuality(true);for(let i=0;i<100;i++)fx.setQuality(true);assert.equal(images.length,2);assert.equal(fx.getStats().effects,16);
 for(const type of ['fireball','multishot']){const p={x:100,y:100,type,age:.1,angle:1,branch:{snipeMode:true}};const before=JSON.stringify(p);assert(fx.projectile(ctx,p,true));assert(!fx.projectile(ctx,p,false));assert.equal(JSON.stringify(p),before);}
 for(const id of ['fireballCastSource','thunderCastSource','multishotCastSource','fireballImpact','shieldPulseStatus'])assert(fx.drawVfx(ctx,{effectId:id,x:100,y:100,age:.1,duration:.3,scale:1,rotation:0},{renderSize:80}));
 for(const s of [{strike:true},{depthSweep:true},{isSweep:true,heroLead:true,heroRange:60}]){const event={x:100,y:100,radius:32,life:.8,angle:1,...s},before=JSON.stringify(event);assert(fx.slash(ctx,event));assert.equal(JSON.stringify(event),before);}
 const beforeGrowth=draws.length;assert(fx.slash(ctx,{isSweep:true,growthStyle:'whirlwind'}));assert.equal(draws.length,beforeGrowth,'图集就绪后不叠旧的整圈平面刀光');
 const shield={active:true,value:30,maxValue:100},oldShield=JSON.stringify(shield);assert(!fx.shield(ctx,100,100,shield,true));assert.equal(JSON.stringify(shield),oldShield);
 fx.clear();for(let i=0;i<100;i++)fx.hit({x:i*40,y:100},null,true);assert.equal(fx.getStats().active,24);fx.setQuality(false);assert.equal(fx.getStats().active,12);assert(!fx.getStats().lightReady);assert.equal(fx.getStats().atlasBytes,3*1024*1024);
 assert(fx.shield(ctx,100,100,shield,true));assert(fx.shield(ctx,100,100,shield,false));
 fx.clear();fx.impact('multishot',100,100);fx.impact('multishot',100,100);assert.equal(fx.getStats().active,1);fx.update(1);assert.equal(fx.getStats().active,0);assert(fx.getStats().pooled<=24);
 budget=false;draws.length=0;fx.hit({x:100,y:100},null,true);fx.drawEvents(ctx,camera,500,500);assert(draws.length>0,'装饰预算耗尽仍保留关键实体');
 budget=true;fx.clear();const area={x:100,y:100,radius:85,element:'fire',tick:.2,interval:.5};const before=JSON.stringify(area);fx.drawAreas(ctx,[area],camera,500,500);assert.equal(JSON.stringify(area),before);assert(circles.some(a=>a[2]===85),'地面效果裁剪到原伤害半径');
 fx.meteorImpact(100,100,100);fx.nova(200,100,150);fx.arrowRain(100,200,85);fx.volley(100,200,.3);fx.shieldCast(100,100);fx.shieldEnd(200,100);fx.shieldHit(100,200);fx.drawEvents(ctx,camera,500,500);assert(circles.some(a=>a[2]===150));
 const states=new Map([[{x:100,y:100},{burn:{time:2}}]]),hero={x:200,y:200,shield:{active:false,invincibleTimer:1}},charge={angle:1,time:1,bonus:{chargeMaxTime:2}};fx.drawStates(ctx,states,hero,charge,100,camera,500,500);
 fx.update(2);assert.equal(fx.getStats().active,0);fx.clear();
 const errors=[],missing=vm.createContext({console:{error:s=>errors.push(s)},Image:class{set src(value){this.onerror();}}});vm.runInContext(source+'\nthis.fx=HeroVfx;',missing);const fallback=missing.fx;fallback.setQuality(true);fallback.setQuality(true);assert.equal(errors.length,2);
 assert(!fallback.projectile(ctx,{type:'fireball'},true));assert(!fallback.slash(ctx,{strike:true}));assert(!fallback.drawVfx(ctx,{effectId:'fireballImpact'},{}));fallback.impact('multishot',100,100);fallback.update(1);assert.equal(fallback.getStats().active,0);assert(fallback.getStats().assetError);
 const behavior=spawnSync(process.execPath,[path.join(__dirname,'test-skill-branch-behavior.js'),'--with-hero-vfx'],{encoding:'utf8',windowsHide:true});assert.equal(behavior.status,0,behavior.stdout+behavior.stderr);
 console.log('PASS: 16类原始双层像素、末帧、只读端点/范围、零战斗随机调用、6/3MiB预算、关键反馈/回收、缺图回退与全技能分支真实结算');
})().catch(e=>{console.error(e);process.exitCode=1;});
