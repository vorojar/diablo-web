// 离线使用 PixelFX 原始雷电；游戏只绘制透明双层图集，不运行像素模拟器。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {Painter} from './vendor/pixelfx/src/core/painter.js';
import {Rng} from './vendor/pixelfx/src/core/math.js';
import {VOLT,bowed,stroke} from './vendor/pixelfx/src/fx/lightning/_lib.js';
import {fit} from './vendor/pixelfx/src/core/color.js';
import * as strike from './vendor/pixelfx/src/fx/lightning/lightning-strike.js';
const require=createRequire(import.meta.url),{createCanvas,ImageData}=require('@napi-rs/canvas'),sharp=require('sharp');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),vendor=path.join(root,'tools/vendor/pixelfx');
const times=[.76,.793333,.826667,.86,.90,.96,1.04,1.10,1.26,1.326667,1.9,2.8];
const ages=[0,.025,.05,.075,.1,.13,.16,.2,.25,.3,.46,.60];
export function sourceHash(){
 const h=crypto.createHash('sha256');
 function visit(dir){for(const name of fs.readdirSync(dir).sort()){const p=path.join(dir,name);if(fs.statSync(p).isDirectory())visit(p);else if(name.endsWith('.js'))h.update(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'));}}
 visit(vendor);h.update(fs.readFileSync(fileURLToPath(import.meta.url),'utf8').replace(/\r\n/g,'\n'));return h.digest('hex');
}
function frame(w,h,ox,oy){return {w,h,ox,oy,color:new Uint32Array(w*h),light:new Uint32Array(w*h)};}
function layer(f,light){
 const c=createCanvas(f.w,f.h),rgba=new Uint8ClampedArray(f.w*f.h*4),values=light?f.light:f.color;
 for(let i=0;i<values.length;i++){
  const v=values[i],r=v&255,g=(v>>>8)&255,b=(v>>>16)&255,a=light?Math.max(r,g,b):v>>>24,j=i*4;
  rgba[j]=light&&a?r*255/a:r;rgba[j+1]=light&&a?g*255/a:g;rgba[j+2]=light&&a?b*255/a:b;rgba[j+3]=a;
 }
 c.getContext('2d').putImageData(new ImageData(rgba,f.w,f.h),0,0);return c;
}
export function render(){
 const body=createCanvas(1536,208),light=createCanvas(1536,208),bc=body.getContext('2d'),lc=light.getContext('2d');
 bc.imageSmoothingEnabled=false;lc.imageSmoothingEnabled=false;
 const fx=strike.create({...strike.meta.options}),C=fit(VOLT,8);let t=0;
 for(let i=0;i<12;i++){
  while(t<times[i]-1e-9){const dt=Math.min(1/120,times[i]-t);fx.update(dt);t+=dt;}
  const f=frame(240,264,-120,-228),p=new Painter(f);p.layer='back';fx.drawBack(p);p.layer='front';fx.draw(p);
  bc.drawImage(layer(f,false),i*128+4,6,120,132);lc.drawImage(layer(f,true),i*128+4,6,120,132);
  const link=frame(256,128,-128,-64),lp=new Painter(link);
  // 链接的实际起终点由游戏提供；只烘焙可旋转伸缩的电流形态。
  const R=new Rng(31+Math.floor(i/2)),shape=bowed(R,-106,0,106,0,-14,.13,.45),k=[1,.7,.95,.5,.88,.42,.75,.3,.55,.25,.16,.06][i];
  stroke(lp,shape,k,C,1.1,{hero:i===0,core:i<5?.7:0,light:.34});
  bc.drawImage(layer(link,false),i*128,144,128,64);lc.drawImage(layer(link,true),i*128,144,128,64);
 }
 return {body,light,meta:{sourceSHA256:sourceHash(),width:1536,height:208,cellWidth:128,frames:12,ages,duration:.68,
  strike:{y:0,height:144,pivotX:64,pivotY:120},link:{y:144,height:64,startX:11,endX:117,pivotY:32},
  body:'art/lightning/body.webp',light:'art/lightning/light.webp'}};
}
export async function build(output=path.join(root,'art/lightning'),preview){
 const result=render();fs.mkdirSync(output,{recursive:true});
 for(const layer of ['body','light'])await sharp(result[layer].toBuffer('image/png')).webp({lossless:true,effort:6}).toFile(path.join(output,layer+'.webp'));
 fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(result.meta,null,2)+'\n');
 fs.writeFileSync(path.join(root,'lightning-manifest.js'),'// 由 tools/build-lightning.mjs 生成；仅运行图集元数据。\nwindow.LIGHTNING_VFX_MANIFEST = '+JSON.stringify(result.meta,null,2)+';\n');
 if(preview){fs.mkdirSync(preview,{recursive:true});const c=createCanvas(12*140,300),x=c.getContext('2d');x.fillStyle='#202b35';x.fillRect(0,0,c.width,c.height);
  for(let i=0;i<12;i++){x.drawImage(result.body,i*128,0,128,208,i*140,25,128,208);x.save();x.globalCompositeOperation='lighter';x.drawImage(result.light,i*128,0,128,208,i*140,25,128,208);x.restore();x.fillStyle='#e4d9bd';x.font='12px sans-serif';x.fillText(ages[i]+'s',i*140+8,270);}
  fs.writeFileSync(path.join(preview,'lightning-contact.png'),c.toBuffer('image/png'));
 }
 return result.meta;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const i=process.argv.indexOf('--preview');console.log(JSON.stringify(await build(undefined,i>=0?path.resolve(process.argv[i+1]):undefined)));
}
