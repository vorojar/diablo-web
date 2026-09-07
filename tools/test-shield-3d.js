const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'game.js'),'utf8');
function extract(name){const start=source.indexOf(`function ${name}(`);let depth=0;for(let i=source.indexOf('{',start);i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&!--depth)return source.slice(start,i+1);}}
let gpu=0,runes=0;
const ctx=new Proxy({}, {get:(_,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):()=>{}});
const scope={player:{graphicsQuality:'low',experimentalShield3D:true,shield:{active:true,value:50,maxValue:100}},Shield3D:{draw(){gpu++;return true;}},getPlayerShieldVisualProfile:()=>({core:'rgba(1,1,1,',edge:'rgba(1,1,1,',rim:'#fff'}),getShieldVisualGrowthTier:()=>1,drawShieldSacredWallRunes:()=>runes++,drawShieldMirrorFacets:()=>runes++};
vm.createContext(scope);vm.runInContext(extract('drawPlayerShieldBack')+extract('drawPlayerShieldFront'),scope);
function pair(){scope.drawPlayerShieldBack(ctx,0,0);scope.drawPlayerShieldFront(ctx,0,0);}
pair();assert.equal(gpu,0,'性能优先模式前后层都应使用原版');
scope.player.graphicsQuality='high';scope.player.experimentalShield3D=false;pair();assert.equal(gpu,2,'旧存档关闭标记不再阻止默认立体效果');
scope.player.experimentalShield3D=true;runes=0;pair();assert.equal(gpu,4);assert.equal(runes,2,'立体层保留既有分支纹饰');
scope.player.shield.active=false;pair();assert.equal(gpu,4,'护盾结束后不得绘制');
let contexts=0;
const unavailable={document:{createElement:()=>({getContext(){contexts++;return null;}})},performance:{now:()=>1000}};
vm.createContext(unavailable);vm.runInContext(fs.readFileSync(path.join(root,'shield-3d.js'),'utf8')+'\nglobalThis.fx=Shield3D;',unavailable);
assert.equal(unavailable.fx.draw(ctx,0,0,{active:false,value:0},false),false);assert.equal(contexts,0,'无护盾不初始化GPU');
for(let i=0;i<3;i++)assert.equal(unavailable.fx.draw(ctx,0,0,{active:true,value:50,maxValue:100},false),false);
assert.equal(contexts,1,'无WebGL仅尝试一次，保留2D绘制');
console.log('PASS: 性能模式/默认启用与旧标记/分支纹饰/结束清理/WebGL不可用回退');
