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

const wallStart=game.indexOf('if (!p.meteorTarget && isWall(p.x, p.y)) {');
const wallEnd=game.indexOf('if (p.owner && p.owner !== player)',wallStart);
let plainDots=0;scope.p={type:'multishot',x:10,y:10,angle:0,life:1,visualTier:1};scope.isWall=()=>true;scope.createParticle=()=>plainDots++;scope.emitSkillImpactBurst=()=>{};scope.emitMultishotVisualGrowth=()=>{};
vm.runInContext(game.slice(wallStart,wallEnd),scope);assert.equal(scope.p.life,0);assert.equal(plainDots,0,'箭矢撞墙不能在命中特效后重复喷圆点');

const renderLine=game.split('\n').find(line=>line.includes('ctx.arc(p.x, p.y - (p.z || 0), p.size,'));
const paint={beginPath(){},arc(){},fill(){}};scope.ctx=paint;scope.p={x:0,y:0,color:'#aaff88',life:3,size:1,maxAlpha:.2};vm.runInContext(renderLine.trim(),scope);assert.equal(paint.globalAlpha,.2,'长寿命环境粒子必须遵守亮度上限');
scope.p.life=.5;vm.runInContext(renderLine.trim(),scope);assert.equal(paint.globalAlpha,.1,'消失前逐渐淡出');
console.log('PASS: 箭矢碰撞不重复点爆、环境粒子透明度与淡出');

let extraBursts=0;scope.emitSkillImpactBurst=()=>extraBursts++;scope.SKILL_IMPACT_PALETTES={multishot:{core:'#fff',ring:'#ccc'}};vm.runInContext(extract('emitMultishotVisualGrowth'),scope);
for(const tier of [0,1,2]){scope.particles=[];scope.emitMultishotVisualGrowth(0,0,0,tier);assert.equal(scope.particles.length,tier===0?0:tier===1?5:9);assert(scope.particles.every(p=>p.type==='skill_impact_ray'));}assert.equal(extraBursts,0,'成长视觉不得重复发出命中爆炸');
