// PixelFX 原始前后层采样；大招独立提高精度，小状态与奖励保持低内存。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Painter} from './vendor/pixelfx/src/core/painter.js';
const require=createRequire(import.meta.url),{createCanvas,ImageData}=require('@napi-rs/canvas'),sharp=require('sharp');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),vendor=path.join(root,'tools/vendor/pixelfx');
const HOSTILE=['#230e25','#591a45','#a43264','#e76188','#ff9db1','#ffd7e2','#fff4f5','#ffffff'];
export const common=[
 {id:'poisoned',src:'status/poisoned',loop:true,point:true},
 {id:'cursed',src:'status/cursed',loop:true,point:true},
 {id:'electrified',src:'lightning/electrified',loop:true,point:true},
 {id:'boneSlash',src:'melee/thrust',start:.01,end:.65,duration:.22,anchor:[8,-22],options:{palette:HOSTILE}},
 {id:'blunt',src:'impacts/blunt-hit',start:.005,end:.8,duration:.26,anchor:[0,-22]},
 {id:'heal',src:'holy/heal',start:.04,end:1.9,duration:.65},
 {id:'blessing',src:'holy/blessing',loop:true},
 {id:'resurrection',src:'holy/resurrection',start:.78,end:4.7,duration:1.1},
 {id:'shield',src:'holy/divine-shield',loop:true,radius:29},
 {id:'cleanse',src:'holy/feather-burst',start:.01,end:2.8,duration:.32,anchor:[0,0]},
 {id:'level',src:'ui/level-up',start:.3,end:3.1,duration:1.1,options:{text:''}},
 {id:'achievement',src:'ui/achievement',start:.3,end:2.3,duration:1.2,options:{title:'',text:''}},
 {id:'quest',src:'ui/quest-complete',start:.4,end:2.5,duration:1.2,options:{text:''}},
 {id:'chest',src:'pickups/collect-burst',start:.01,end:1.2,duration:.55},
 {id:'enemyNova',src:'fire/fire-ring',start:.325,end:2.3,duration:.65,radius:92,options:{palette:['#280e19','#63172e','#a62a3c','#dc4846','#f87b52','#ffa66a','#ffd494','#fff1cb','#ffffff']}}
];
export const detail=[
 {id:'heroNova',src:'fire/fire-ring',radius:92,times:[.325,.35,.4,.48,.58,.7,.85,1,1.2,1.5,1.9,2.3]},
 {id:'enemyNova',src:'fire/fire-ring',radius:92,times:[.325,.35,.4,.48,.58,.7,.85,1,1.2,1.5,1.9,2.3],options:{palette:['#280e19','#63172e','#a62a3c','#dc4846','#f87b52','#ffa66a','#ffd494','#fff1cb','#ffffff']}},
 {id:'slam',src:'impacts/ground-slam',radius:104,times:[.015,.045,.09,.16,.25,.36,.5,.7,.95,1.3,1.8,2.5]},
 {id:'meteor',src:'fire/meteor',radius:70,times:[.625,.66,.71,.79,.9,1.04,1.22,1.45,1.73,2.05,2.4,2.7]}
];
export function sourceHash(){const h=crypto.createHash('sha256');function visit(dir){for(const n of fs.readdirSync(dir).sort()){const p=path.join(dir,n);if(fs.statSync(p).isDirectory())visit(p);else if(n.endsWith('.js'))h.update(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'));}}visit(vendor);h.update(fs.readFileSync(fileURLToPath(import.meta.url),'utf8').replace(/\r\n/g,'\n'));return h.digest('hex');}
function layer(f,light){const c=createCanvas(f.w,f.h),rgba=new Uint8ClampedArray(f.w*f.h*4),v=light?f.light:f.color;for(let i=0;i<v.length;i++){const a=v[i],r=a&255,g=a>>>8&255,b=a>>>16&255,k=light?Math.max(r,g,b):a>>>24,j=i*4;rgba[j]=light&&k?r*255/k:r;rgba[j+1]=light&&k?g*255/k:g;rgba[j+2]=light&&k?b*255/k:b;rgba[j+3]=k;}c.getContext('2d').putImageData(new ImageData(rgba,f.w,f.h),0,0);return c;}
async function atlas(defs,name,w,h,frames){
 const body=createCanvas(w*frames,h*defs.length*2),light=createCanvas(body.width,body.height),bc=body.getContext('2d'),lc=light.getContext('2d');bc.imageSmoothingEnabled=lc.imageSmoothingEnabled=false;
 const meta={width:body.width,height:body.height,body:`art/pixelfx-polish/${name}-body.webp`,light:`art/pixelfx-polish/${name}-light.webp`,effects:{}};
 for(const [row,d]of defs.entries()){
  const mod=await import(pathToFileURL(path.join(vendor,'src/fx',d.src+'.js'))),base=mod.meta;
  // 状态使用离线定位遮罩并排除内部着色，仅导出外围电弧、烟带与符号。
  const actor=d.point?{x:-4,y:-36,w:8,h:30,pixels:new Uint32Array(240),mask:{w:8,h:30,data:new Uint8Array(240).fill(255)}}:{x:0,y:0,w:0,h:0,pixels:new Uint32Array(0),mask:{w:0,h:0,data:new Uint8Array(0)}};
  const o={...base.options,...d.options,actor},fx=mod.create?mod.create(o):mod,[fw,fh]=base.size,[ox,oy]=base.origin,crop=d.crop||[-ox,-oy,fw,fh],ratio=Math.min((w-4)/crop[2],(h-4)/crop[3]),dw=crop[2]*ratio,dh=crop[3]*ratio,px=(w-dw)/2,py=(h-dh)/2,anchor=d.anchor||[0,0];
  meta.effects[d.id]={x:0,y:row*h*2,w,h,frames,pivotX:px+(anchor[0]-crop[0])*ratio,pivotY:py+(anchor[1]-crop[1])*ratio,radius:(d.radius||30)*ratio,loop:!!d.loop,duration:d.duration||base.duration};
  let now=0;
  for(let i=0;i<frames;i++){
   if(!d.loop&&i===frames-1)continue;
   const q=i/(d.loop?frames:frames-1),t=d.times?d.times[i]:(d.start||0)+q*((d.end||base.duration)-(d.start||0));
   if(fx.update)while(now<t-1e-9){const dt=Math.min(1/120,t-now);fx.update(dt,o);now+=dt;}
   for(let pass=0;pass<2;pass++){
    const f={w:fw,h:fh,ox:-ox,oy:-oy,color:new Uint32Array(fw*fh),light:new Uint32Array(fw*fh)},p=new Painter(f);p.layer=pass?'front':'back';if(pass)fx.draw(p,t,o);else if(fx.drawBack)fx.drawBack(p,t,o);
    if(d.point)for(let sy=actor.y-1;sy<=actor.y+actor.h;sy++)for(let sx=actor.x-2;sx<=actor.x+actor.w+1;sx++)if(sx+ox>=0&&sx+ox<fw&&sy+oy>=0&&sy+oy<fh)f.color[(sy+oy)*fw+sx+ox]=0;
    bc.drawImage(layer(f,false),ox+crop[0],oy+crop[1],crop[2],crop[3],i*w+px,(row*2+pass)*h+py,dw,dh);lc.drawImage(layer(f,true),ox+crop[0],oy+crop[1],crop[2],crop[3],i*w+px,(row*2+pass)*h+py,dw,dh);
   }
  }
 }
 return {body,light,meta};
}
export async function render(){return {sourceSHA256:sourceHash(),common:await atlas(common,'common',48,48,8),detail:await atlas(detail,'detail',112,72,12)};}
export async function build(preview){
 const r=await render(),out=path.join(root,'art/pixelfx-polish');fs.mkdirSync(out,{recursive:true});const m={sourceSHA256:r.sourceSHA256,common:r.common.meta,detail:r.detail.meta};
 if((m.common.width*m.common.height+m.detail.width*m.detail.height)*8>11*1024*1024)throw Error('精修图集超出11MiB总预算');
 for(const name of ['common','detail'])for(const kind of ['body','light'])await sharp(r[name][kind].toBuffer('image/png')).webp({lossless:true,effort:6}).toFile(path.join(out,`${name}-${kind}.webp`));
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(m,null,2)+'\n');for(const n of ['LICENSE','NOTICE.md'])fs.copyFileSync(path.join(vendor,n),path.join(out,n));
 const file=path.join(root,'pixelfx-polish.js'),source=fs.readFileSync(file,'utf8'),marker=/\/\/ 精修清单开始[^\n]*\n\s*const m=.*?;\r?\n\s*\/\/ 精修清单结束/s;if(!marker.test(source))throw Error('精修清单标记缺失');fs.writeFileSync(file,source.replace(marker,'// 精修清单开始（随脚本交付）\n    const m='+JSON.stringify(m)+';\n    // 精修清单结束'));
 if(preview){fs.mkdirSync(preview,{recursive:true});for(const name of ['common','detail']){const a=r[name],entries=Object.entries(a.meta.effects),c=createCanvas(960,entries.length*100),x=c.getContext('2d');x.fillStyle='#202b35';x.fillRect(0,0,c.width,c.height);x.font='12px sans-serif';for(const [row,[id,e]]of entries.entries()){x.fillStyle='#e8d9b2';x.fillText(id,3,row*100+14);for(let i=0;i<8;i++){const f=Math.min(e.frames-1,Math.floor(i/8*e.frames));for(let pass=0;pass<2;pass++){x.drawImage(a.body,f*e.w,e.y+pass*e.h,e.w,e.h,10+i*118,row*100+20,110,75);x.save();x.globalCompositeOperation='lighter';x.drawImage(a.light,f*e.w,e.y+pass*e.h,e.w,e.h,10+i*118,row*100+20,110,75);x.restore();}}}fs.writeFileSync(path.join(preview,name+'-contact.png'),c.toBuffer('image/png'));}}
 return m;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const i=process.argv.indexOf('--preview');console.log(JSON.stringify(await build(i>=0?path.resolve(process.argv[i+1]):undefined)));}
