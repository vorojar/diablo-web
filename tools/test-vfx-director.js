// 验证表现层的预算、资源生命周期和只读 Boss/拾取接口。
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),images=[],draws=[];
let budget=true,busy=false;
const scope=vm.createContext({window:{},console,RARITY:{RARE:3},Image:class{
 constructor(){images.push(this);}set src(value){this.url=value;this.onload();}
},Math:Object.assign(Object.create(Math),{random(){throw Error('表现不得消费战斗随机数');}}),CombatVisuals:{allowDecoration:()=>budget,isBusy:()=>busy}});
for(const file of ['vfx-recipes.js','vfx-generated-manifest.js','vfx-director.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),scope);
const v=vm.runInContext('VfxDirector',scope),m=scope.window.VFX_GENERATED_MANIFEST;
const ctx={globalAlpha:1,save(){},restore(){},translate(){},rotate(){},drawImage(...args){draws.push(args);}};
const camera={x:0,y:0},row=id=>m.effects[id].row*48;
v.setQuality(true);assert.equal(images.length,2);assert(v.getStats().bodyReady&&v.getStats().lightReady);
for(let i=0;i<100;i++)v.setQuality(true);assert.equal(images.length,2,'每帧相同画质不加载图集');
for(let i=0;i<100;i++)v.emit('ashDeath',i*40,100,1,i%2===0);
assert.equal(v.getStats().active,32);v.setQuality(false);assert.equal(v.getStats().active,12);assert(!v.getStats().lightReady);
assert(v.getStats().atlasBytes<=2*1024*1024);v.setQuality(true);assert.equal(images.length,3);
v.clear();for(let i=0;i<20;i++)v.emit('ashDeath',100,100);assert.equal(v.getStats().active,1,'近同时同地合并');
v.update(1);assert.equal(v.getStats().active,0);assert(v.getStats().pooled<=32);
budget=false;v.emit('fireBloom',100,100);v.emit('frostBreak',150,100,1,true);draws.length=0;v.drawEvents(ctx,camera,500,500);
assert.equal(draws.length,2);assert(draws.every(d=>d[2]===row('frostBreak')),'预算耗尽仍绘制关键死亡，附加命中让路');
budget=true;
for(const [damage,frozen,id]of [[{fire:100},0,'ashDeath'],[{cold:100},0,'frostBreak'],[{lightning:100},0,'shockFade'],['poison',0,'poisonFade'],[{physical:100},1,'frostBreak']]){
 v.clear();const enemy={x:100,y:100,hp:0,dead:true,frozenTimer:frozen};const snapshot=JSON.stringify(enemy);
 v.death(enemy,damage);v.update(.1);draws.length=0;v.drawEvents(ctx,camera,500,500);
 assert(draws.length&&draws.every(d=>d[2]===row(id)),id);assert.equal(JSON.stringify(enemy),snapshot);
}
const boss={x:100,y:100,isBoss:true,hp:200,pendingSkill:{id:'fireNova',timer:.4,duration:1,data:{radius:85}}};
const before=JSON.stringify(boss);draws.length=0;v.drawBosses(ctx,[boss],camera,500,500);assert.equal(JSON.stringify(boss),before);assert.equal(draws[0][2],row('fireCharge'));
boss.pendingSkill=null;draws.length=0;v.drawBosses(ctx,[boss],camera,500,500);assert.equal(draws.length,0,'打断当帧取消蓄力');
v.clear();v.release(boss,'fireNova');draws.length=0;v.drawEvents(ctx,camera,500,500);assert.equal(draws[0][2],row('fireBloom'));
for(const [kind,id]of [['rare','lootRare'],['gold','lootGold'],['set','lootSet']]){
 draws.length=0;assert(v.drawLoot(ctx,{x:100,y:100,lootKind:kind,maxLife:1,life:.5}));assert.equal(draws[0][2],row(id));
}
v.clear();const item={x:100,y:100,rarity:4,id:'保留物品'},markers=[{x:100,y:100,type:'drop_beam',lootKind:'gold',life:1},{x:100,y:100,type:'drop_beam',life:1}];
v.collect(item,markers);assert.equal(markers[0].life,.12);assert.equal(markers[1].life,1);assert.equal(item.id,'保留物品');assert.equal(v.getStats().active,1);
v.clear();v.collect({x:100,y:100,rarity:1},markers);assert.equal(v.getStats().active,0);
for(const high of [true,false]){
 v.setQuality(high);draws.length=0;v.ambient(ctx,camera,10000,10000,1,false,-1000,-1000,()=>false,[]);
 assert(draws.length>0&&draws.length<=(high?12*2:4),'环境并发有界');
 draws.length=0;v.ambient(ctx,camera,10000,10000,1,false,-1000,-1000,()=>true,[]);assert.equal(draws.length,0,'墙内不画环境碎屑');
 busy=true;v.ambient(ctx,camera,10000,10000,1,false,-1000,-1000,()=>false,[]);assert.equal(draws.length,0,'混战取消环境装饰');busy=false;
}
v.clear();assert.equal(v.getStats().active,0);assert(v.getStats().maxAtlasBytes<4*1024*1024);
console.log('PASS: 表现事件合并/回收、高低画质硬上限、关键反馈保留、死亡元素、Boss只读计时/打断、拾取只改表现、环境裁剪与战斗随机数隔离');
