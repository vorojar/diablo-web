// 原始 PixelFX 图集同步、实际端点、资源预算和真实生成入口随机序列回归。
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'lightning-vfx.js'),'utf8');
const game=fs.readFileSync(path.join(root,'game.js'),'utf8');
function extract(name){const start=game.indexOf(`function ${name}(`);let depth=0;for(let i=game.indexOf(') {',start)+2;i<game.length;i++){if(game[i]==='{')depth++;if(game[i]==='}'&&!--depth)return game.slice(start,i+1);}throw Error(name);}
(async()=>{
 const builder=await import(pathToFileURL(path.join(root,'tools/build-lightning.mjs'))),expected=builder.render();
 const m=JSON.parse(fs.readFileSync(path.join(root,'art/lightning/manifest.json'),'utf8'));
 assert.equal(m.sourceSHA256,builder.sourceHash());assert.deepEqual(m,expected.meta);
 const embedded=source.match(/const m=(.*?);\r?\n/);assert(embedded,'运行清单应随脚本交付');
 assert.deepEqual(JSON.parse(embedded[1]),m);
 for(const layer of ['body','light']){
  const {data,info}=await sharp(path.join(root,m[layer])).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,m.width);assert.equal(info.height,m.height);
  const pixels=expected[layer].getContext('2d').getImageData(0,0,m.width,m.height).data;
  for(let i=0;i<data.length;i++)if(i%4===3||pixels[i-i%4+3]>0)assert.equal(data[i],pixels[i],`${layer} 可见像素过期：${i}`);
  assert(data.some((value,i)=>i%4===3&&value===0));
 }
 assert(m.width*m.height*8<3*1024*1024);
 const pixels=expected.body.getContext('2d').getImageData(0,0,m.width,m.height).data;
 function painted(x,y,w,h){for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++)if(pixels[(row*m.width+col)*4+3])return true;return false;}
 assert(painted(59,115,10,10),'第0帧立即有主命中，不播放示例的长蓄力');
 for(const x of [9,115])assert(painted(x,144+29,5,7),'链接图集端点必须落在可定位的支点');
 const images=[],scope=vm.createContext({console,Image:class{
  constructor(){images.push(this);}set src(value){this.url=value;this.onload();}
 }});
 vm.runInContext(source+'\nthis.fx=LightningVfx;',scope);const fx=scope.fx;
 fx.setQuality(true);for(let i=0;i<100;i++)fx.setQuality(true);assert.equal(images.length,2);
 const points=[{x:110,y:-50},{x:100,y:200}];
 for(let i=0;i<100;i++)fx.strike(i*30,200,points);assert.equal(fx.getStats().active,12);assert(fx.getStats().pooled<=12);
 fx.clear();fx.strike(100,200,points);fx.strike(101,200,points);assert.equal(fx.getStats().active,1);
 const draws=[],transforms=[],ctx=new Proxy({globalAlpha:1},{get(o,k){if(k==='drawImage')return (...a)=>draws.push(a);if(k==='translate'||k==='scale'||k==='rotate')return (...a)=>transforms.push([k,...a]);return k in o?o[k]:()=>{};}});
 fx.drawStrikes(ctx,{x:0,y:0},500,500);assert.equal(draws.length,2);const count=fx.getStats().active;
 for(let i=0;i<10;i++)fx.drawStrikes(ctx,{x:0,y:0},500,500);assert.equal(fx.getStats().active,count,'绘制不推进生命周期');
 fx.update(.7);assert.equal(fx.getStats().active,0);fx.strike(10000,10000,points);draws.length=0;fx.drawStrikes(ctx,{x:0,y:0},500,500);assert.equal(draws.length,0);
 fx.setQuality(false);assert(!fx.getStats().lightReady);assert.equal(fx.getStats().atlasBytes,m.width*m.height*4);
 draws.length=0;fx.drawLink(ctx,{type:'lightning_chain',points:[{x:10,y:20},{x:222,y:20}],life:.25,maxLife:.25,isMain:true});assert.equal(draws.length,1);assert(transforms.some(t=>t[0]==='scale'&&t[1]===2),'链路长度精确映射既有两端点');
 draws.length=0;fx.drawLink(ctx,{type:'lightning_chain',points,life:.1,maxLife:.4,isMain:false});assert.equal(draws.length,0,'不叠旧模糊残影');
 fx.drawLink(ctx,{type:'chain_lightning',x:10,y:10,tx:100,ty:100,life:.1});assert.equal(draws.length,1,'天赋连锁也保留可见主电弧');
 fx.clear();assert.equal(fx.getStats().active,0);
 // 不提供 window 或独立清单，且两张图均加载失败，仍须能绘制反馈并到期回收。
 const failures=[],missing=vm.createContext({console:{error:message=>failures.push(message)},Image:class{set src(value){this.onerror();}}});
 vm.runInContext(source+'\nthis.fx=LightningVfx;',missing);const degraded=missing.fx;
 degraded.setQuality(true);for(let i=0;i<100;i++)degraded.setQuality(true);assert.equal(failures.length,2,'失败仅报告一次，不逐帧重试');
 degraded.strike(100,200,points);degraded.update(.016);let fallbackStrokes=0;
 const fallbackCtx=new Proxy({globalAlpha:1},{get:(o,k)=>k==='stroke'?()=>fallbackStrokes++:k in o?o[k]:()=>{}});
 degraded.drawStrikes(fallbackCtx,{x:0,y:0},500,500);assert(fallbackStrokes>=3,'缺图仍保留主雷电反馈');
 assert(degraded.getStats().assetError);assert.equal(degraded.getStats().atlasBytes,0);
 degraded.update(1);assert.equal(degraded.getStats().active,0);assert.equal(degraded.getStats().pooled,1);
 function run(withFx){let state=7,calls=0;const math=Object.create(Math);math.random=()=>{calls++;state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const s=vm.createContext({player:{},particles:[],Math:math,console,Image:class{}});
  if(withFx)vm.runInContext(source,s);
  vm.runInContext(extract('createNovaEffect')+'\n'+extract('createLightningEffect')+'\ncreateLightningEffect(100,200);',s);
  return {calls,next:math.random(),state:JSON.stringify({player:s.player,particles:s.particles})};
 }
 assert.deepEqual(run(true),run(false),'新增雷电不能改变真实生成入口的随机序列、原粒子数量或已有字段');
 console.log('PASS: 原始PixelFX双层像素、立即命中、图集端点、时间驱动/回收、低画质内存、链路定位、旧残影减噪与真实入口随机序列隔离');
})().catch(e=>{console.error(e);process.exitCode=1;});
