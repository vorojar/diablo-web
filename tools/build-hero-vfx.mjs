// 原版 PixelFX 主角特效离线采样；不引入示例角色、蓄力延迟或伤害判定。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Painter} from './vendor/pixelfx/src/core/painter.js';
const require=createRequire(import.meta.url),{createCanvas,ImageData}=require('@napi-rs/canvas'),sharp=require('sharp');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),vendor=path.join(root,'tools/vendor/pixelfx'),cell=64,frames=12;
const GOLD=['#2c2630','#665039','#a4793f','#d8ad5b','#f0ce82','#fff0b9','#ffffff'];
const GREEN=['#26382e','#4e6440','#7b9758','#abc77c','#d2e7a9','#eff8d7','#ffffff'];
export const definitions=[
 {id:'fireball',src:'fire/fireball',loop:true,anchor:[0,0],radius:5},
 {id:'fireImpact',src:'explosions/small-explosion',start:.025,end:2.5,duration:.55,crop:[-100,-160,200,200]},
 {id:'fireCast',src:'arcane/spell-charge',loop:true,anchor:[15,-22],crop:[-29,-61,88,80],options:{palette:['#482423','#a54525','#e47730','#ffb24f','#ffdb83','#fff0b0','#ffffff']}},
 {id:'arrow',src:'projectiles/arrow',loop:true,anchor:[0,0],radius:18},
 {id:'arrowHit',src:'impacts/hit-spark',start:.005,end:.48,duration:.25,anchor:[0,-20],options:{palette:GOLD}},
 {id:'arrowCast',src:'arcane/spell-charge',loop:true,anchor:[15,-22],crop:[-29,-61,88,80],options:{palette:GREEN}},
 {id:'slash',src:'melee/sword-slash',start:.06,end:.48,duration:.18,anchor:[6,-26],radius:42,options:{palette:['#36363e','#686475','#a39a91','#d2c4a5','#e7d9be','#fff0cf','#ffffff']}},
 {id:'heavySlash',src:'melee/heavy-cleave',start:.335,end:1.3,duration:.32,anchor:[3,-22],radius:37,options:{palette:GOLD}},
 {id:'shieldCast',src:'holy/divine-shield',loop:true,anchor:[0,0],radius:29},
 {id:'shieldHit',src:'impacts/shield-block',start:.005,end:1,duration:.28,anchor:[3,-22],options:{palette:GOLD}},
 {id:'shieldBreak',src:'arcane/mana-burst',start:.23,end:1.5,duration:.5,anchor:[0,-28],options:{palette:GOLD}},
 {id:'groundFire',src:'fire/fire-ring',start:.15,end:2.1,duration:.5,radius:92},
 {id:'meteorImpact',src:'fire/meteor',start:.625,end:2.7,duration:.8,radius:70},
 {id:'critHit',src:'impacts/crit-hit',start:.005,end:.85,duration:.27,anchor:[0,-26],options:{palette:GOLD}},
 {id:'thunderCast',src:'lightning/charge-up',start:1.05,end:1.56,duration:.2,anchor:[15,-21],crop:[-29,-61,88,80]},
 {id:'iceBurst',src:'ice/ice-shatter',start:.685,end:2.2,duration:.75,anchor:[0,-10]}
];
export function sourceHash(){const h=crypto.createHash('sha256');function visit(dir){for(const name of fs.readdirSync(dir).sort()){const p=path.join(dir,name);if(fs.statSync(p).isDirectory())visit(p);else if(name.endsWith('.js'))h.update(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'));}}visit(vendor);h.update(fs.readFileSync(fileURLToPath(import.meta.url),'utf8').replace(/\r\n/g,'\n'));return h.digest('hex');}
function layer(f,light){const c=createCanvas(f.w,f.h),rgba=new Uint8ClampedArray(f.w*f.h*4),v=light?f.light:f.color;for(let i=0;i<v.length;i++){const x=v[i],r=x&255,g=x>>>8&255,b=x>>>16&255,a=light?Math.max(r,g,b):x>>>24,j=i*4;rgba[j]=light&&a?r*255/a:r;rgba[j+1]=light&&a?g*255/a:g;rgba[j+2]=light&&a?b*255/a:b;rgba[j+3]=a;}c.getContext('2d').putImageData(new ImageData(rgba,f.w,f.h),0,0);return c;}
export async function renderDefinitions(definitions, assetRoot='art/hero-vfx', signature=sourceHash()){
 const body=createCanvas(cell*frames,cell*definitions.length),light=createCanvas(body.width,body.height),bc=body.getContext('2d'),lc=light.getContext('2d');bc.imageSmoothingEnabled=false;lc.imageSmoothingEnabled=false;
 const meta={sourceSHA256:signature,width:body.width,height:body.height,cell,frames,body:assetRoot+'/body.webp',light:assetRoot+'/light.webp',effects:{}};
 for(const [row,d]of definitions.entries()){
  const mod=await import(pathToFileURL(path.join(vendor,'src/fx',d.src+'.js'))),base=mod.meta,o={...base.options,...d.options,actor:{x:0,y:0,mask:{w:0,h:0,data:new Uint8Array(0)}}},fx=mod.create?mod.create(o):mod;
  const [w,h]=base.size,[ox,oy]=base.origin,crop=d.crop||[-ox,-oy,w,h],ratio=60/Math.max(crop[2],crop[3]),dw=crop[2]*ratio,dh=crop[3]*ratio,px=(cell-dw)/2,py=(cell-dh)/2,anchor=d.anchor||[0,0];
  meta.effects[d.id]={row,pivotX:px+(anchor[0]-crop[0])*ratio,pivotY:py+(anchor[1]-crop[1])*ratio,radius:(d.radius||30)*ratio,loop:!!d.loop,duration:d.duration||base.duration};
  let current=0;
  for(let i=0;i<frames;i++){
   if(!d.loop&&i===frames-1)continue;
   const q=i/(d.loop?frames:frames-1),t=d.loop?(d.start||0)+q*((d.end||base.duration)-(d.start||0)):(d.start||0)+Math.pow(q,1.6)*((d.end||base.duration)-(d.start||0));
   if(fx.update)while(current<t-1e-9){const dt=Math.min(1/120,t-current);fx.update(dt,o);current+=dt;}
   const f={w,h,ox:-ox,oy:-oy,color:new Uint32Array(w*h),light:new Uint32Array(w*h)},p=new Painter(f);p.layer='back';if(fx.drawBack)fx.drawBack(p,t,o);p.layer='front';fx.draw(p,t,o);
   const track=d.track?d.track(t):[0,0];
   bc.drawImage(layer(f,false),ox+crop[0]+track[0],oy+crop[1]+track[1],crop[2],crop[3],i*cell+px,row*cell+py,dw,dh);lc.drawImage(layer(f,true),ox+crop[0]+track[0],oy+crop[1]+track[1],crop[2],crop[3],i*cell+px,row*cell+py,dw,dh);
  }
 }
 return {body,light,meta};
}
export async function render(){return renderDefinitions(definitions);}
export async function build(preview){
 const r=await render(),out=path.join(root,'art/hero-vfx');fs.mkdirSync(out,{recursive:true});if(r.meta.width*r.meta.height*8>6*1024*1024)throw Error('主角图集超出6MiB解码预算');
 for(const layer of ['body','light'])await sharp(r[layer].toBuffer('image/png')).webp({lossless:true,effort:6}).toFile(path.join(out,layer+'.webp'));
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(r.meta,null,2)+'\n');for(const name of ['LICENSE','NOTICE.md'])fs.copyFileSync(path.join(vendor,name),path.join(out,name));
 const runtime=path.join(root,'hero-vfx.js'),source=fs.readFileSync(runtime,'utf8'),marker=/\/\/ 主角清单开始[^\n]*\n\s*const m=.*?;\r?\n\s*\/\/ 主角清单结束/s;if(!marker.test(source))throw Error('主角脚本缺少清单生成标记');
 fs.writeFileSync(runtime,source.replace(marker,'// 主角清单开始（离线生成，随脚本一起交付）\n    const m='+JSON.stringify(r.meta)+';\n    // 主角清单结束'));
 if(preview){fs.mkdirSync(preview,{recursive:true});const c=createCanvas(12*82,definitions.length*96+28),x=c.getContext('2d');x.fillStyle='#202b35';x.fillRect(0,0,c.width,c.height);x.font='12px sans-serif';for(const [row,d]of definitions.entries()){x.fillStyle='#e8d9b2';x.fillText(d.id,3,row*96+17);for(let i=0;i<12;i++){x.drawImage(r.body,i*cell,row*cell,cell,cell,i*82,row*96+24,74,74);x.save();x.globalCompositeOperation='lighter';x.drawImage(r.light,i*cell,row*cell,cell,cell,i*82,row*96+24,74,74);x.restore();}}fs.writeFileSync(path.join(preview,'hero-contact.png'),c.toBuffer('image/png'));}
 return r.meta;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const i=process.argv.indexOf('--preview');console.log(JSON.stringify(await build(i>=0?path.resolve(process.argv[i+1]):undefined)));}
