const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const game=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
function extract(name){const start=game.indexOf(`function ${name}(`);let d=0;for(let i=game.indexOf('{',start);i<game.length;i++){if(game[i]==='{')d++;if(game[i]==='}'&&!--d)return game.slice(start,i+1);}}
let now=1000;const scope={Date:{now:()=>now},player:{graphicsQuality:'high'},cachedUI:{},COLORS:{critical:'orange',poison:'green',ice:'blue',lightning:'yellow'},damageNumbers:[],DamageNumberPool:{acquire:p=>p},particles:[],ParticlePool:{acquire:p=>p},getParticleConfig:()=>({maxParticles:200})};vm.createContext(scope);
for(const name of ['createDamageNumber','shouldUseDomDamageNumber','isPlainDamageNumberValue','createImpactParticles','drawImpactFacet'])vm.runInContext(extract(name),scope);
const target={};for(let i=0;i<10;i++)scope.createDamageNumber(10,10,12,'white',0,target);
assert.equal(scope.damageNumbers.length,1);assert.equal(scope.damageNumbers[0].val,120,'合并必须保留全部伤害总和');
scope.createDamageNumber(10,10,25,'orange',0,target);assert.equal(scope.damageNumbers.length,2,'暴击单独突出');
scope.createDamageNumber(10,10,9,'white',0,{});assert.equal(scope.damageNumbers.length,3,'不能混合不同怪物');
now+=150;scope.createDamageNumber(10,10,7,'white',0,target);assert.equal(scope.damageNumbers.length,4,'下一时间窗重新显示');
scope.createDamageNumber(0,0,'幸运!','white');assert.equal(scope.damageNumbers.length,4);
scope.createDamageNumber(0,0,'冻结!','blue');assert.equal(scope.damageNumbers.length,5,'保留控制提示');
scope.createImpactParticles(10,10,'#c9bb9f',50,0);assert.equal(scope.particles.length,5);assert(scope.particles.every(p=>p.type==='impact_facet'&&p.life<.43));
let triangles=0;const ctx=new Proxy({}, {get:(_,key)=>key==='fill'?()=>triangles++:(...args)=>{assert(args.every(v=>typeof v!=='number'||Number.isFinite(v)),'投影坐标必须有限');}});
for(const p of scope.particles)scope.drawImpactFacet(ctx,p);assert(triangles>=40,'碎片必须由有明暗层次的三角面构成');
scope.particles=[];scope.player.graphicsQuality='low';scope.createImpactParticles(10,10,'#fff',50,0);assert.equal(scope.particles.length,2);
console.log('PASS: 同目标数字合并总和、暴击/不同怪物隔离、提示取舍、立体面投影与高低画质上限');
