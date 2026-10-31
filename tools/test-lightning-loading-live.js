// 通过真实 HTTP 404 复现 FTP 缺文件，检查实际主更新/绘制入口继续运行。
'use strict';
const {chromium}=require('playwright'),{spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),arg=process.argv.indexOf('--output');
if(arg<0)throw Error('请指定仓库外的 --output 目录');
const output=path.resolve(process.argv[arg+1]);fs.mkdirSync(output,{recursive:true});
const server=spawn(process.execPath,[path.join(__dirname,'qa-server.js'),'--port','0'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
let browser;
(async()=>{
 const address=await new Promise((resolve,reject)=>{let data='';const timer=setTimeout(()=>reject(Error('QA服务超时')),10000);server.once('error',reject);server.stdout.on('data',chunk=>{data+=chunk;if(data.includes('\n')){clearTimeout(timer);resolve(JSON.parse(data.trim()));}});});
 browser=await chromium.launch({channel:'chrome',headless:true});const reports=[];
 for(const missing of [false,true]){
  const context=await browser.newContext({viewport:{width:1000,height:800}});
  try{
   const page=await context.newPage(),errors=[],logs=[],requests=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')logs.push(m.text());});page.on('request',r=>requests.push(r.url()));
   if(missing)await page.route('**/art/lightning/*.webp*',route=>route.fulfill({status:404,contentType:'text/html',body:'资源缺失回归'}));
   await page.goto(address.url);await page.waitForFunction(missing=>missing?LightningVfx.getStats().assetError:LightningVfx.getStats().bodyReady&&LightningVfx.getStats().lightReady,missing);
   await page.getByRole('button',{name:'启动60级安全角色',exact:true}).click();await page.getByRole('button',{name:'进入第一层',exact:true}).click();
   await page.waitForFunction(()=>ArtSamples.pending===0&&!ArtSamples.loadError);await page.evaluate(()=>{gameActive=false;AutoBattle.enabled=false;});await page.waitForTimeout(70);
   const result=await page.evaluate(()=>{
    const before=gameFrameId;let strikes=0,images=0,strokes=0,inside=false;
    const original=LightningVfx.drawStrikes,drawImage=ctx.drawImage,stroke=ctx.stroke;
    LightningVfx.drawStrikes=function(...args){strikes++;inside=true;try{return original(...args);}finally{inside=false;}};
    ctx.drawImage=function(...args){if(inside)images++;return drawImage.apply(this,args);};ctx.stroke=function(...args){if(inside)strokes++;return stroke.apply(this,args);};
    LightningVfx.clear();createLightningEffect(player.x,player.y);const active=LightningVfx.getStats().active;
    try{for(let i=0;i<60;i++){update(1/60);draw();}}finally{LightningVfx.drawStrikes=original;ctx.drawImage=drawImage;ctx.stroke=stroke;}
    return {frames:gameFrameId-before,strikes,images,strokes,activeBefore:active,stats:LightningVfx.getStats(),diagnostics:qaDiagnostics.errors};
   });
   assert.equal(result.activeBefore,1);assert.equal(result.frames,60);assert.equal(result.strikes,60);assert.equal(result.stats.active,0);assert.deepEqual(errors,[]);assert.deepEqual(result.diagnostics,[]);
   assert(!requests.some(url=>url.includes('lightning-manifest.js')),'页面不再依赖独立清单');
   if(missing){assert(result.strokes>=3);assert(result.stats.assetError);assert.equal(result.stats.atlasBytes,0);assert.equal(logs.filter(s=>s.startsWith('雷电图集加载失败')).length,2);}
   else{assert(result.images>0);assert.deepEqual(logs,[]);assert(!result.stats.assetError);}
   await page.screenshot({path:path.join(output,missing?'missing-assets.png':'normal-assets.png')});reports.push({missing,result,errors,logs});
  }finally{await context.close();}
 }
 fs.writeFileSync(path.join(output,'loading-qa.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
