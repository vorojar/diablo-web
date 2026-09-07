const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const scope={performance:{now:()=>1000},document:{createElement:()=>({getContext:()=>null})}};
vm.createContext(scope);vm.runInContext(fs.readFileSync(path.join(__dirname,'../elemental-3d.js'),'utf8')+'\nglobalThis.fx=Elemental3D;',scope);
const fx=scope.fx,camera={x:0,y:0,width:800,height:600};let shapes=0;
const ctx=new Proxy({}, {get:(_,key)=>key==='createRadialGradient'? (...args)=>{assert(args.every(Number.isFinite),'首次施法未初始化age时仍应产生有限坐标');shapes++;return {addColorStop(){}};}:()=>{}});
// ProjectilePool的新对象在首次update前没有age，绘制入口必须支持这一真实状态。
fx.ground(ctx,[{x:100,y:20,life:.5,meteorTarget:{x:100,y:200}}],[],camera,true,false);
assert(shapes>0);
for(let i=0;i<50;i++){fx.impact(100,200,70,true);fx.pulse({x:100,y:200,bonus:{stormMode:true}},[{x:110,y:210}],true);}
assert.equal(fx.getStats().impacts,12);assert.equal(fx.getStats().bolts,24);
fx.update(1,true,true);assert.equal(fx.getStats().impacts,0);assert.equal(fx.getStats().bolts,0);
fx.impact(100,200,70,true);fx.update(.01,false,true);assert.equal(fx.getStats().impacts,0);
fx.impact(100,200,70,false);assert.equal(fx.getStats().impacts,0);
fx.pulse({x:0,y:0,bonus:{stormMode:false}},[],true);assert.equal(fx.getStats().bolts,0);
assert.equal(fx.meteor(ctx,{life:1,meteorTarget:{x:1,y:2}},true),false,'无WebGL返回原图集绘制');
assert.equal(fx.getStats().failed,true);
fx.clear();assert.equal(fx.getStats().impacts+fx.getStats().bolts,0);
console.log('PASS: 首帧age、事件上限、寿命清理、关闭开关、普通技能隔离与无WebGL回退');
