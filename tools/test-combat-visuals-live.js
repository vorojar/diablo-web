// 独立浏览器验收：本地隔离角色、真实渲染器、移动触控与CPU降速；不将模拟结果标为真机。
'use strict';
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const outputArg=process.argv.indexOf('--output');
if(outputArg<0)throw Error('请用 --output 指定仓库外的截图与JSON目录');
const output=path.resolve(process.argv[outputArg+1]);fs.mkdirSync(output,{recursive:true});
const server=spawn(process.execPath,[path.join(__dirname,'qa-server.js'),'--port','0'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
let browser;
(async()=>{
 const address=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('本地QA服务启动超时')),10000);let data='';
  server.once('error',e=>{clearTimeout(timer);reject(e);});
  server.stdout.on('data',chunk=>{data+=chunk;if(data.includes('\n')){clearTimeout(timer);resolve(JSON.parse(data.trim()));}});
 });
 browser=await chromium.launch({channel:'chrome',headless:true});
 const reports=[];
 for(const mode of [{name:'desktop-high',width:1440,height:900,quality:'high',rate:1,touch:false},
  {name:'mobile-high-cpu4',width:390,height:844,quality:'high',rate:4,touch:true},
  {name:'mobile-low-cpu4',width:390,height:844,quality:'low',rate:4,touch:true}]){
  const context=await browser.newContext({viewport:{width:mode.width,height:mode.height},deviceScaleFactor:mode.touch?2:1,isMobile:mode.touch,hasTouch:mode.touch});
  try{
   const page=await context.newPage(),errors=[],logs=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')logs.push(m.text());});
   const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:mode.rate});
   await page.goto(address.url+(mode.touch?'?touch=1':''));
   try{await page.waitForFunction(()=>vfxSpritesLoaded&&CombatVisuals.getStats().warmup.pending===0,{},{timeout:30000});}
   catch(error){console.error(JSON.stringify({mode,errors,logs,state:await page.evaluate(()=>({active:gameActive,hidden:document.hidden,loaded:vfxSpritesLoaded,stats:CombatVisuals.getStats()}))}));throw error;}
   await page.waitForFunction(()=>VfxDirector.getStats().bodyReady&&VfxDirector.getStats().lightReady);
   const prewarm=await page.evaluate(()=>CombatVisuals.getStats());assert.equal(prewarm.light.entries,24,'登录等待阶段应完成24帧预热');
   await page.getByRole('button',{name:'启动60级安全角色',exact:true}).click();
   await page.getByRole('button',{name:'进入第一层',exact:true}).click();
   await page.waitForFunction(()=>ArtSamples.pending===0&&!ArtSamples.loadError);
   await page.evaluate(async quality=>{
    await ArtSamples.ensureMonsters(['skeleton','zombie','ghost','butcher']);
    gameActive=false;AutoBattle.enabled=false;player.graphicsQuality=quality;CombatVisuals.setQuality(quality!=='low');VfxDirector.setQuality(quality!=='low');
    document.getElementById('qa-controls').open=false;
    for(const e of enemies)EnemyPool.release(e);enemies=[];particles=[];vfxEffects=[];scheduledMonsterAttacks.length=0;
    const types=['skeleton','zombie','ghost'];
    for(let i=0;i<72;i++){
     const type=types[i%types.length],x=player.x+(i%12-5.5)*26,y=player.y+(Math.floor(i/12)-3)*29;
     enemies.push(EnemyPool.acquire({x,y,hp:1000,maxHp:1000,dmg:0,speed:0,ai:'chase',radius:12,dead:false,
      monsterType:type,frameIndex:MONSTER_FRAMES[type],name:'',cooldown:99,facingDirection:'front',frozenTimer:i%4===0?1:0,slowedTimer:i%4===1?2:0}));
    }
    const boss=EnemyPool.acquire({x:player.x,y:player.y-25,hp:1000,maxHp:1000,dmg:0,speed:0,radius:22,dead:false,isBoss:true,
     monsterType:'butcher',frameIndex:BOSS_FRAMES.butcher,name:'危险预警保持',facingDirection:'front',cooldown:99});
    boss.pendingSkill={id:'groundSlam',originX:boss.x,originY:boss.y,timer:.6,duration:1,label:'危险重击 · 离开红圈',data:{telegraph:'circle',radius:85}};enemies.push(boss);
    for(let i=0;i<180;i++)particles.push({x:player.x+(i%15-7)*24,y:player.y+(Math.floor(i/15)-6)*20,type:'skill_ground_glow',radius:18,size:2,
     life:1,maxLife:1,color:'#a5672e',color2:'#ffc16d',cosmetic:true});
    for(let i=0;i<12;i++)spawnVfxEffect('fireballImpact',player.x+(i%4-1.5)*45,player.y+(Math.floor(i/4)-1)*42,.55,0);
    for(let i=0;i<48;i++)spawnVfxEffect('fireballImpact',player.x+(i%8-3.5)*35,player.y+(Math.floor(i/8)-3)*25,.35,0,true);
    for(let i=0;i<50;i++)VfxDirector.emit(i%2?'fireBloom':'frostBreak',player.x+(i%8-4)*35,player.y+(Math.floor(i/8)-3)*25,1,i%2===0);
    window.visualBudgetProof={critical:0,decorative:0,danger:0,feedback:0,frames:0};
    const originalVfx=drawVfxEffect,originalDanger=CombatTactics.draw,originalFeedback=CombatVisuals.drawFeedback;
    drawVfxEffect=function(ctx,fx){visualBudgetProof[fx.decorative?'decorative':'critical']++;return originalVfx(ctx,fx);};
    CombatTactics.draw=function(...args){visualBudgetProof.danger++;return originalDanger(...args);};
    CombatVisuals.drawFeedback=function(...args){visualBudgetProof.feedback++;return originalFeedback(...args);};
   },mode.quality);
   // 等待原主循环的挂起回调结束，测量环只调用真实draw，不推进任何伤害或AI。
   await page.waitForTimeout(70);
   const result=await page.evaluate(async()=>{
    const costs=[],intervals=[];let previous=0,frames=0;
    const plain={x:player.x-45,y:player.y-12},dodge={x:player.x+45,y:player.y-12},interrupt={x:player.x,y:player.y+30};
    return await new Promise(resolve=>{
     function frame(now){
      if(previous)intervals.push(now-previous);previous=now;
      const dt=1/60;CombatVisuals.update(dt);VfxDirector.update(dt);
      if(frames%15===0){VfxDirector.cast('fireball',player.x,player.y);VfxDirector.death({x:player.x+65,y:player.y,frozenTimer:1},{cold:1});}
      if(frames%18===0){CombatVisuals.feedback('block',plain,0);CombatVisuals.feedback('dodge',dodge,0);CombatVisuals.feedback('interrupt',interrupt,0);}
      for(let i=0;i<enemies.length;i++)if(i%4===0)enemies[i].frozenTimer=.01+(.99-(frames%60)/60);
      for(let i=0;i<vfxEffects.length;i++)vfxEffects[i].age=((frames+i)%8)/24;
      const t=performance.now();draw();const cost=performance.now()-t;CombatVisuals.sampleFrame(cost);
      if(frames>=15)costs.push(cost);visualBudgetProof.frames++;frames++;
      if(frames<105){requestAnimationFrame(frame);return;}
      costs.sort((a,b)=>a-b);intervals.sort((a,b)=>a-b);
      resolve({actors:enemies.length,particles:particles.length,mainVfx:12,decorativeVfx:48,proof:visualBudgetProof,
       renderMedian:costs[Math.floor(costs.length*.5)],renderP95:costs[Math.floor(costs.length*.95)],intervalP95:intervals[Math.floor(intervals.length*.95)],
       generated:VfxDirector.getStats(),stats:CombatVisuals.getStats(),errors:qaDiagnostics.errors,touch:qaDiagnostics.simulatedTouch,
       title:document.title,url:location.href,notBlank:document.getElementById('game-container').offsetWidth>0});
     }requestAnimationFrame(frame);
    });
   });
   assert.equal(result.proof.critical,result.proof.frames*12,'装饰拥挤不得丢弃任何主命中图集');
   assert.equal(result.proof.danger,result.proof.frames,'危险预警每帧仍绘制');
   assert.equal(result.proof.feedback,result.proof.frames,'关键结果反馈每帧仍绘制');
   assert(result.proof.decorative<result.proof.frames*48,'装饰预算应真实限制绘制');
   assert(!result.generated.assetError);assert(result.generated.maxAtlasBytes<4*1024*1024);
   assert(result.generated.active<=(mode.quality==='high'?32:12));
   if(mode.quality==='low')assert(!result.generated.lightReady);
   assert.equal(result.errors.length,0);assert(result.notBlank);assert.equal(result.touch,mode.touch);
   assert(result.stats.frost.bytes<=2*1024*1024&&result.stats.light.bytes<=4*1024*1024);
   assert.equal(result.stats.light.builds,prewarm.light.builds,'跨层预热复用，实际混战无需重建常用光照帧');
   if(mode.quality==='low')assert.equal(result.stats.frost.builds,0,'低画质不构建冻结轮廓');
   await page.screenshot({path:path.join(output,mode.name+'.png')});
   if(!mode.touch){
    await page.evaluate(()=>{
     const panel=document.createElement('section');panel.id='combat-proof';
     panel.style.cssText='position:fixed;inset:30px;z-index:2000000;background:#151e26;padding:20px;color:#e8d9af;font:16px sans-serif';
     const heading=document.createElement('h2');heading.textContent='冻结渐退与关键结果反馈 · 游戏实际绘制器';panel.append(heading);
     const canvas=document.createElement('canvas');canvas.width=1100;canvas.height=610;canvas.style.maxWidth='100%';panel.append(canvas);document.body.append(panel);
     const c=canvas.getContext('2d');c.fillStyle='#202d35';c.fillRect(0,0,1100,610);c.font='20px sans-serif';c.fillStyle='#e8d9af';
     c.fillText('冻结解除前，轮廓冰纹按剩余时间消退',25,35);
     const frame=getMonsterSpriteFrame({monsterType:'skeleton',facingDirection:'front',frozenTimer:1});
     CombatVisuals.clear(true);CombatVisuals.beginFrame(true,0);
     for(const [i,remaining]of [.3,.11,.01,0].entries()){
      const x=140+i*265;c.fillStyle='#e6edf0';c.textAlign='center';c.fillText(remaining>0?`剩余 ${Math.round(remaining*1000)}ms`:'已解除',x,90);
      drawMonsterSprite(c,processedMonsterSprites,frame,x,245,165,165,remaining>0?'frozen':null,remaining);
      CombatVisuals.coldGround(c,x,245,16,remaining>0,remaining);
     }
     c.textAlign='left';c.fillStyle='#e8d9af';c.fillText('装饰预算耗尽后，格挡 / 闪避 / 打断仍独立绘制',25,330);
     const types=['block','dodge','interrupt'],names=['格挡 · 金属亮痕','闪避 · 掠过残影','打断 · 能量碎散'];
     for(let i=0;i<3;i++){
      const x=190+i*355;c.textAlign='center';c.fillStyle='#e6edf0';c.fillText(names[i],x,385);
      drawMonsterSprite(c,processedMonsterSprites,frame,x,550,150,150);
      CombatVisuals.feedback(types[i],{x,y:515},0);
     }
     while(CombatVisuals.allowDecoration(0,0)){}
     CombatVisuals.drawFeedback(c,{x:0,y:0},1100,610);
    });
    await page.locator('#combat-proof').screenshot({path:path.join(output,'feedback-and-thaw.png')});
    await page.evaluate(()=>{
     const panel=document.getElementById('combat-proof'),c=panel.querySelector('canvas'),x=c.getContext('2d');
     panel.querySelector('h2').textContent='新增元素、聚能与掉落 · 实际双层图集渲染';c.width=1100;c.height=690;
     x.fillStyle='#202d35';x.fillRect(0,0,c.width,c.height);x.textAlign='center';x.font='18px sans-serif';
     CombatVisuals.clear(true);CombatVisuals.beginFrame(true,0);VfxDirector.setQuality(true);
     const cards=[['fireBloom','火焰命中',.2],['frostBreak','冰晶碎裂',.2],['shockFade','电弧消退',.12],['poisonFade','毒雾消散',.2],['ashDeath','火焰余烬',.25],
      ['fireCharge','火焰聚能',.2],['iceCharge','冰霜聚能',.2],['shockCharge','雷电聚能',.2],['earthCharge','重击聚能',.2],['lootCollect','成功拾取收束',.15]];
     cards.forEach(([id,label,age],i)=>{const px=110+i%5*220,py=165+Math.floor(i/5)*205;
      x.fillStyle='#e8d9af';x.fillText(label,px,py-105);VfxDirector.clear();VfxDirector.emit(id,px,py,2,true);VfxDirector.update(age);VfxDirector.drawEvents(x,{x:0,y:0},1100,690);
     });
     for(const [i,kind]of ['rare','gold','set'].entries()){
      const px=180+i*370;x.fillStyle='#e8d9af';x.fillText(['稀有 · 菱形','暗金 · 细长光柱','套装 · 绿色环形'][i],px,490);
      VfxDirector.drawLoot(x,{x:px,y:620,lootKind:kind,color:'#f0ca74',maxLife:1,life:.5});
     }VfxDirector.clear();
    });
    await page.locator('#combat-proof').screenshot({path:path.join(output,'element-loot-gallery.png')});

   }
   assert.deepEqual(errors,[]);assert.deepEqual(logs,[]);
   reports.push({mode,prewarm,result,pageErrors:errors,console:logs});
  }finally{await context.close();}
 }
 const report={classification:'Browser plugin not available; 本机Chrome/Playwright，移动视口及4倍CPU降速均为模拟，非真机',reports};
 fs.writeFileSync(path.join(output,'combat-budget-qa.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
