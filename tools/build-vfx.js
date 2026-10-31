// 参数化配方 → 双层透明图集 / 游戏清单 / PNG帧 / 连续帧预览；不依赖游戏全局状态。
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createCanvas}=require('@napi-rs/canvas'),sharp=require('sharp');
const recipes=require('../vfx-recipes');
const root=path.resolve(__dirname,'..'),frameCount=12,columns=12;
function sourceHash(){return crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'vfx-recipes.js'),'utf8').replace(/\r\n/g,'\n')).digest('hex');}
function render(id,t,seed=1,layer='body',margin=0,palette){
 const c=createCanvas(recipes.size+margin*2,recipes.size+margin*2),ctx=c.getContext('2d');ctx.translate(margin,margin);
 recipes.draw(ctx,id,t,{seed,...(palette?{palette}:{})},layer);return c;
}
function pixels(c){return c.getContext('2d').getImageData(0,0,c.width,c.height).data;}
function changed(a,b){let n=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2]||a[i+3]!==b[i+3])n++;return n;}
function checkRecipes(){
 if(/Math\.random\s*\(|Date\.|performance\./.test(fs.readFileSync(path.join(root,'vfx-recipes.js'),'utf8')))throw Error('配方必须只使用时间、参数和种子');
 const ids=Object.keys(recipes.definitions),issues=[];
 for(const id of ids){const d=recipes.definitions[id];
  for(const seed of [1,7,19,43])for(const layer of ['body','light']){
   for(let i=0;i<=8;i++){
    const t=d.duration*i/8,expanded=render(id,t,seed,layer,8),data=pixels(expanded);
    for(let y=0;y<expanded.height;y++)for(let x=0;x<expanded.width;x++)if((x<8||y<8||x>=56||y>=56)&&data[(y*expanded.width+x)*4+3])throw Error(`${id} seed=${seed} ${layer} t=${t} 越界`);
    const a=pixels(render(id,t,seed,layer)),b=pixels(render(id,t,seed,layer));
    if(changed(a,b))throw Error(`${id} 同时间/种子不一致`);
   }
   const end=pixels(render(id,d.duration,seed,layer));
   if(!d.loop&&end.some((v,i)=>i%4===3&&v))throw Error(`${id} 结束帧未清空`);
   if(d.loop){
    if(changed(pixels(render(id,0,seed,layer)),end))throw Error(`${id} 循环端点不一致`);
    const frames=Array.from({length:frameCount},(_,i)=>pixels(render(id,i/frameCount*d.duration,seed,layer)));
    const steps=frames.slice(1).map((b,i)=>changed(frames[i],b)).sort((a,b)=>a-b),seam=changed(frames.at(-1),frames[0]);
    if(seam>Math.max(40,steps[Math.floor(steps.length*.9)]*2.5))throw Error(`${id} 循环接缝异常`);
   }
  }
  const custom=pixels(render(id,d.duration*.3,9,'body',0,['#28323d','#747e8d','#c4d5e1','#ffffff']));
  if(!custom.some((v,i)=>i%4===3&&v))issues.push(`${id} 调色板预览为空`);
 }
 if(issues.length)throw Error(issues.join('\n'));
 return {recipes:ids.length,seeds:4,layers:2,checks:'边界、末帧、接缝、确定性、自定义调色板'};
}
async function build({output=path.join(root,'art/vfx-generated'),seed=1,exportFrames=false,preview=false,writeRuntime=true}={}){
 fs.mkdirSync(output,{recursive:true});const ids=Object.keys(recipes.definitions),w=columns*recipes.size,h=ids.length*recipes.size;
 const body=createCanvas(w,h),light=createCanvas(w,h),bc=body.getContext('2d'),lc=light.getContext('2d');
 const manifest={recipeSHA256:sourceHash(),seed,width:w,height:h,body:writeRuntime?'art/vfx-generated/body.webp':'body.webp',light:writeRuntime?'art/vfx-generated/light.webp':'light.webp',effects:{}};
 const aseprite={frames:[],meta:{image:'body.png',size:{w,h},frameTags:[]}};
 for(const [row,id]of ids.entries()){
  const d=recipes.definitions[id];manifest.effects[id]={row,frameWidth:48,frameHeight:48,frameCount,duration:d.duration,loop:d.loop,pivotX:24,pivotY:38};
  aseprite.meta.frameTags.push({name:id,from:row*frameCount,to:(row+1)*frameCount-1,direction:'forward'});
  for(let i=0;i<frameCount;i++){
   const t=i/(d.loop?frameCount:frameCount-1)*d.duration,b=render(id,t,seed,'body'),l=render(id,t,seed,'light');
   bc.drawImage(b,i*48,row*48);lc.drawImage(l,i*48,row*48);
   aseprite.frames.push({filename:`${id}-${i}`,frame:{x:i*48,y:row*48,w:48,h:48},duration:Math.round(d.duration/frameCount*1000),pivot:{x:.5,y:38/48}});
   if(exportFrames){const dir=path.join(output,'frames',id);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,`${String(i).padStart(2,'0')}-body.png`),b.toBuffer('image/png'));fs.writeFileSync(path.join(dir,`${String(i).padStart(2,'0')}-light.png`),l.toBuffer('image/png'));}
  }
 }
 const bodyPng=body.toBuffer('image/png'),lightPng=light.toBuffer('image/png');
 await Promise.all([sharp(bodyPng).webp({lossless:true,effort:6}).toFile(path.join(output,'body.webp')),sharp(lightPng).webp({lossless:true,effort:6}).toFile(path.join(output,'light.webp'))]);
 fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 if(writeRuntime)fs.writeFileSync(path.join(root,'vfx-generated-manifest.js'),'// 由 tools/build-vfx.js 生成；修改配方后重新 build。\nwindow.VFX_GENERATED_MANIFEST = '+JSON.stringify(manifest,null,2)+';\n');
 if(exportFrames){fs.writeFileSync(path.join(output,'body.png'),bodyPng);fs.writeFileSync(path.join(output,'light.png'),lightPng);fs.writeFileSync(path.join(output,'atlas.json'),JSON.stringify(aseprite,null,2)+'\n');}
 if(preview){
  const contact=createCanvas(12*76,ids.length*86+35),cc=contact.getContext('2d');cc.fillStyle='#202b35';cc.fillRect(0,0,contact.width,contact.height);cc.font='12px sans-serif';cc.fillStyle='#e5d9b9';cc.fillText(`seed=${seed} · 12连续帧 / 每行一项`,8,18);
  ids.forEach((id,row)=>{cc.fillStyle='#e5d9b9';cc.fillText(id,4,44+row*86);for(let i=0;i<12;i++){cc.drawImage(body,i*48,row*48,48,48,i*76,51+row*86,66,66);cc.save();cc.globalCompositeOperation='lighter';cc.drawImage(light,i*48,row*48,48,48,i*76,51+row*86,66,66);cc.restore();}});
  fs.writeFileSync(path.join(output,'contact.png'),contact.toBuffer('image/png'));
  const html=`<!doctype html><meta charset="utf-8"><title>菠萝战纪特效预览</title><style>body{background:#17232c;color:#eddcb7;font:16px sans-serif;padding:24px}section{display:inline-block;margin:12px}canvas{background:#293844;image-rendering:pixelated}input{width:380px}</style><h1>特效连续帧预览 · seed=${seed}</h1><button id="play">暂停</button> 时间 <input id="time" type="range" min="0" max="1" step=".001"><div id="grid"></div><script>const meta=${JSON.stringify(manifest)},body=new Image(),light=new Image();body.src='data:image/png;base64,${bodyPng.toString('base64')}';light.src='data:image/png;base64,${lightPng.toString('base64')}';let running=true,t=0,last=0;const cards=Object.entries(meta.effects).map(([id,e])=>{const s=document.createElement('section'),h=document.createElement('p'),c=document.createElement('canvas');h.textContent=id;c.width=192;c.height=192;s.append(h,c);grid.append(s);return {e,c}});play.onclick=()=>{running=!running;play.textContent=running?'暂停':'播放'};time.oninput=()=>{t=Number(time.value);running=false};function tick(now){if(running)t=(t+(now-last)/3000)%1;last=now;time.value=t;for(const {e,c}of cards){const x=c.getContext('2d');x.imageSmoothingEnabled=false;x.clearRect(0,0,192,192);const i=Math.floor(t*(e.loop?12:11));x.drawImage(body,i*48,e.row*48,48,48,0,0,192,192);x.globalCompositeOperation='lighter';x.drawImage(light,i*48,e.row*48,48,48,0,0,192,192);x.globalCompositeOperation='source-over'}requestAnimationFrame(tick)}Promise.all([body.decode(),light.decode()]).then(()=>requestAnimationFrame(tick));</script>`;
  fs.writeFileSync(path.join(output,'preview.html'),html);
 }
 return manifest;
}
async function checkGenerated(){
 const m=JSON.parse(fs.readFileSync(path.join(root,'art/vfx-generated/manifest.json'),'utf8'));
 if(m.recipeSHA256!==sourceHash())throw Error('配方已改变，请重新 build');
 const runtime={window:{}};require('node:vm').runInNewContext(fs.readFileSync(path.join(root,'vfx-generated-manifest.js'),'utf8'),runtime);
 if(JSON.stringify(runtime.window.VFX_GENERATED_MANIFEST)!==JSON.stringify(m))throw Error('游戏清单与导出清单不同步');
 for(const layer of ['body','light']){
  const a=await sharp(path.join(root,m[layer])).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(a.info.width!==m.width||a.info.height!==m.height||m.width*m.height*8>4*1024*1024)throw Error('图集尺寸或双层像素预算不合法');
  for(const [id,e]of Object.entries(m.effects))for(let i=0;i<e.frameCount;i++){
   const expected=pixels(render(id,i/(e.loop?e.frameCount:e.frameCount-1)*e.duration,m.seed,layer));
   for(let y=0;y<48;y++)for(let x=0;x<48;x++)for(let k=0;k<4;k++){
    const ai=((e.row*48+y)*m.width+i*48+x)*4,bi=(y*48+x)*4;
    if((k===3||expected[bi+3]>0)&&a.data[ai+k]!==expected[bi+k])throw Error(`${id} ${layer} frame=${i} 可见像素过期`);
   }
  }
 }
 return {width:m.width,height:m.height,pixelBytes:m.width*m.height*8};
}
module.exports={render,build,checkRecipes,checkGenerated};
if(require.main===module)(async()=>{
 const args=process.argv.slice(2),command=args[0]||'check',outIndex=args.indexOf('--output'),seedIndex=args.indexOf('--seed');
 if(command==='check'){console.log(JSON.stringify({...checkRecipes(),...await checkGenerated()}));return;}
 if(!['build','export','preview'].includes(command))throw Error('用法：build-vfx.js build|check|export|preview [--output 目录] [--seed 整数]');
 const output=outIndex>=0?path.resolve(args[outIndex+1]):undefined,seed=seedIndex>=0?Number(args[seedIndex+1]):1;
 if(command!=='build'&&!output)throw Error('预览/PNG导出请指定仓库外的 --output 目录');
 checkRecipes();const m=await build({output,seed,exportFrames:command==='export',preview:command==='preview',writeRuntime:command==='build'&&!output});
 console.log(JSON.stringify({output:output||'art/vfx-generated',recipes:Object.keys(m.effects).length,pixelBytes:m.width*m.height*8}));
})().catch(e=>{console.error(e);process.exitCode=1;});
