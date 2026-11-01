// 上游像素、真实前后层、画质内存、状态只读、事件优先级与资源失败恢复。
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),sharp=require('sharp');
const {pathToFileURL}=require('node:url');const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'pixelfx-polish.js'),'utf8');
(async()=>{
 const builder=await import(pathToFileURL(path.join(root,'tools/build-pixelfx-polish.mjs'))),r=await builder.render(),m=JSON.parse(fs.readFileSync(path.join(root,'art/pixelfx-polish/manifest.json'),'utf8'));
 assert.deepEqual({sourceSHA256:r.sourceSHA256,common:r.common.meta,detail:r.detail.meta},m);assert.deepEqual(JSON.parse(source.match(/const m=(.*?);\r?\n/)[1]),m);
 for(const name of ['common','detail'])for(const layer of ['body','light']){
  const data=await sharp(path.join(root,m[name][layer])).ensureAlpha().raw().toBuffer(),expected=r[name][layer].getContext('2d').getImageData(0,0,m[name].width,m[name].height).data;
  assert.equal(data.length,expected.length);for(let i=0;i<data.length;i++)if(i%4===3||expected[i-i%4+3]>0)assert.equal(data[i],expected[i],`${name}/${layer} 像素过期 ${i}`);
  for(const [id,e]of Object.entries(m[name].effects)){let count=0,end=0;for(let y=e.y;y<e.y+e.h*2;y++)for(let x=0;x<e.w*e.frames;x++)if(data[(y*m[name].width+x)*4+3]){count++;if(x>=(e.frames-1)*e.w)end++;}assert(count>0,id+' 可见');if(!e.loop)assert.equal(end,0,id+' 末帧透明');}
 }
 const images=[],draws=[],arcs=[],errors=[];let budget=true;
 const scope=vm.createContext({console,Image:class{constructor(){images.push(this);}set src(v){this.onload();}},Math:Object.assign(Object.create(Math),{random(){throw Error('新增表现禁止消费战斗随机数');}}),CombatVisuals:{allowDecoration:()=>budget,isBusy:()=>false}});
 vm.runInContext(source+'\nthis.fx=PixelFxPolish;',scope);const fx=scope.fx,ctx=new Proxy({globalAlpha:1},{get:(o,k)=>k==='drawImage'?(...a)=>draws.push(a):k==='arc'?(...a)=>arcs.push(a):k in o?o[k]:()=>{}}),camera={x:0,y:0};
 fx.setQuality(true);for(let i=0;i<100;i++)fx.setQuality(true);assert.equal(images.length,2);fx.warmLarge();assert.equal(images.length,4);assert(fx.getStats().maxAtlasBytes<11*1024*1024);
 for(const id of ['heroNova','enemyNova','meteor','slam']){assert(fx.drawLarge(ctx,id,100,100,.2,120,0));assert(fx.drawLarge(ctx,id,100,100,.2,120,1));}assert(arcs.every(a=>a[2]===120));
 const actor={x:100,y:100,hp:50,maxHp:100,poisoned:true,poisonTimer:2,cursedTimer:2,lightningOverloadTimer:1,shield:{active:true,value:10,maxValue:20,invincibleTimer:1}},old=JSON.stringify(actor);
 fx.beginFrame();fx.drawActor(ctx,actor,false);fx.drawActor(ctx,actor,true);fx.shield(ctx,100,100,actor.shield,false);fx.shield(ctx,100,100,actor.shield,true);fx.heal(actor,10);fx.revive(actor);assert.equal(JSON.stringify(actor),old);
 actor.poisoned=false;actor.cursedTimer=actor.lightningOverloadTimer=0;fx.update(.05);fx.drawActor(ctx,actor,false);fx.drawActor(ctx,actor,true);assert.equal(fx.getStats().coverage.cleanses,1);
 const e={x:180,y:100,monsterType:'skeleton'},aim={angle:.5};assert(fx.melee(e,aim));assert(!fx.melee({...e,slamHit:true},aim));
 for(const id of ['level','achievement','quest','chest'])fx.reward(id,250+Object.keys(m.common.effects).indexOf(id)*40,150);fx.drawEvents(ctx,camera,1500,600,0);fx.drawEvents(ctx,camera,1500,600,1);
 assert(fx.getStats().coverage.back>0&&fx.getStats().coverage.front>0);fx.setQuality(false);assert(!fx.getStats().detailReady&&!fx.getStats().lightReady);assert(fx.getStats().atlasBytes<2.2*1024*1024);assert(!fx.drawLarge(ctx,'heroNova',100,100,.2,120));assert(fx.drawLarge(ctx,'enemyNova',100,100,.2,120));
 fx.clear();for(let i=0;i<30;i++)fx.reward('quest',i*50,200);assert(fx.getStats().active<=6);budget=false;draws.length=0;fx.drawEvents(ctx,camera,2000,600,1);assert(draws.length>0,'奖励实体不依赖光晕预算');fx.update(2);assert.equal(fx.getStats().active,0);fx.clear();assert.equal(fx.getStats().states,0);
 const missing=vm.createContext({console:{error:s=>errors.push(s)},Image:class{set src(v){this.onerror();}}});vm.runInContext(source+'\nthis.fx=PixelFxPolish;',missing);missing.fx.setQuality(true);missing.fx.warmLarge();missing.fx.setQuality(true);assert.equal(errors.length,4);assert(!missing.fx.drawLarge(ctx,'heroNova',100,100,.2,120));assert(!missing.fx.shield(ctx,100,100,actor.shield,true));missing.fx.reward('quest',100,100);missing.fx.update(2);assert.equal(missing.fx.getStats().active,0);
 // 复现旧事件池里受击挤掉Boss的边界，验证新分级保留释放和受击两类实体。
 const enemy=vm.createContext({console,Image:class{set src(v){this.onload();}},CombatVisuals:{allowDecoration:()=>false,isBusy:()=>true},HeroVfx:{drawShared:()=>true,sharedRadius:()=>24},LightningVfx:{drawLink(){}}});vm.runInContext(fs.readFileSync(path.join(root,'enemy-vfx.js'),'utf8')+'\nthis.fx=EnemyVfx;',enemy);enemy.fx.setQuality(false);enemy.fx.boss('slam',100,100,90);for(let i=0;i<100;i++)enemy.fx.playerHit('physical',i*40,200);assert.equal(enemy.fx.getStats().bossEvents,1);assert.equal(enemy.fx.getStats().hitEvents,5);arcs.length=0;enemy.fx.drawEvents(ctx,camera,1000,1000);assert(arcs.some(a=>a[2]===90));enemy.fx.update(2);assert.equal(enemy.fx.getStats().active,0);
 console.log('PASS: 19类原始前后层像素、关键帧与透明末帧、11/2.2MiB预算、只读状态/清除、治疗/奖励/回收/缺图恢复，以及密集受击不挤掉Boss释放');
})().catch(e=>{console.error(e);process.exitCode=1;});
