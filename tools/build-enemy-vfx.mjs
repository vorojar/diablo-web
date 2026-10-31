// 怪物与 Boss 的原始 PixelFX 离线材质；运行时不执行逐像素模拟。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {renderDefinitions,sourceHash as sharedHash} from './build-hero-vfx.mjs';
const require=createRequire(import.meta.url),sharp=require('sharp'),{createCanvas}=require('@napi-rs/canvas');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const definitions=[
 {id:'hostileArrow',src:'projectiles/arrow',loop:true,anchor:[0,0],radius:18,options:{palette:['#321620','#682531','#a43c32','#dc703e','#f5b767','#ffe4a4','#ffffff']}},
 {id:'lightningOrb',src:'lightning/ball-lightning',loop:true,crop:[-28,-28,56,56],radius:13,track:t=>{const a=t/4*Math.PI*2;return [38*Math.sin(a)+9*Math.sin(2*a+1),-42+13*Math.sin(2*a+.4)+6*Math.sin(3*a+.5)];}},
 {id:'shadowOrb',src:'shadow/void-orb',loop:true,anchor:[0,-62],crop:[-42,-104,84,84],radius:20},
 {id:'poisonCloud',src:'nature/poison-cloud',loop:true,radius:114},
 {id:'clawSlash',src:'melee/claw-swipe',start:.01,end:.85,duration:.25,anchor:[7,-25],radius:40},
 {id:'heavySlam',src:'impacts/ground-slam',start:.01,end:2.6,duration:.65,radius:104},
 {id:'summon',src:'arcane/portal',loop:true,radius:26},
 {id:'tentacle',src:'shadow/shadow-tendrils',start:.45,end:2.3,loop:true,radius:38},
 {id:'curse',src:'shadow/curse',start:.4,end:2.8,duration:.65,anchor:[0,-20]},
 {id:'drain',src:'shadow/life-steal',start:.01,end:2.1,duration:.5,anchor:[0,-22]}
];
export function sourceHash(){return crypto.createHash('sha256').update(sharedHash()).update(fs.readFileSync(fileURLToPath(import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex');}
export async function render(){return renderDefinitions(definitions,'art/enemy-vfx',sourceHash());}
export async function build(preview){
 const r=await render(),out=path.join(root,'art/enemy-vfx');fs.mkdirSync(out,{recursive:true});
 if(r.meta.width*r.meta.height*8>4*1024*1024)throw Error('敌方图集超出4MiB解码预算');
 for(const layer of ['body','light'])await sharp(r[layer].toBuffer('image/png')).webp({lossless:true,effort:6}).toFile(path.join(out,layer+'.webp'));
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(r.meta,null,2)+'\n');
 for(const name of ['LICENSE','NOTICE.md'])fs.copyFileSync(path.join(root,'tools/vendor/pixelfx',name),path.join(out,name));
 const runtime=path.join(root,'enemy-vfx.js'),source=fs.readFileSync(runtime,'utf8'),marker=/\/\/ 敌方清单开始[^\n]*\n\s*const m=.*?;\r?\n\s*\/\/ 敌方清单结束/s;
 if(!marker.test(source))throw Error('敌方脚本缺少清单生成标记');
 fs.writeFileSync(runtime,source.replace(marker,'// 敌方清单开始（离线生成，随脚本一起交付）\n    const m='+JSON.stringify(r.meta)+';\n    // 敌方清单结束'));
 if(preview){fs.mkdirSync(preview,{recursive:true});const c=createCanvas(12*82,definitions.length*96+28),x=c.getContext('2d');x.fillStyle='#202b35';x.fillRect(0,0,c.width,c.height);x.font='12px sans-serif';for(const [row,d]of definitions.entries()){x.fillStyle='#e8d9b2';x.fillText(d.id,3,row*96+17);for(let i=0;i<12;i++){x.drawImage(r.body,i*64,row*64,64,64,i*82,row*96+24,74,74);x.save();x.globalCompositeOperation='lighter';x.drawImage(r.light,i*64,row*64,64,64,i*82,row*96+24,74,74);x.restore();}}fs.writeFileSync(path.join(preview,'enemy-contact.png'),c.toBuffer('image/png'));}
 return r.meta;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const i=process.argv.indexOf('--preview');console.log(JSON.stringify(await build(i>=0?path.resolve(process.argv[i+1]):undefined)));}
