// 隔离存档与线上服务，验证真实触发、遮挡顺序、低画质和HTTP404恢复。
'use strict';
const {chromium}=require('playwright'),{spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const i=process.argv.indexOf('--output');if(i<0)throw Error('请指定仓库外 --output');const out=path.resolve(process.argv[i+1]);fs.mkdirSync(out,{recursive:true});
const server=spawn(process.execPath,[path.join(__dirname,'qa-server.js'),'--port','0'],{cwd:path.resolve(__dirname,'..'),windowsHide:true,stdio:['ignore','pipe','pipe']});let browser;
(async()=>{
 const address=await new Promise((resolve,reject)=>{let s='';const timer=setTimeout(()=>reject(Error('QA服务超时')),10000);server.once('error',reject);server.stdout.on('data',d=>{s+=d;if(s.includes('\n')){clearTimeout(timer);resolve(JSON.parse(s.trim()));}});});
 browser=await chromium.launch({channel:'chrome',headless:true});const reports=[];
 for(const mode of ['high','low','missing']){
  const context=await browser.newContext({viewport:mode==='low'?{width:390,height:844}:{width:1440,height:900},isMobile:mode==='low',hasTouch:mode==='low'});
  try{
   const page=await context.newPage(),errors=[],logs=[],bad=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')logs.push(m.text());});page.on('response',r=>{if(r.status()>=400)bad.push(r.url());});page.on('request',r=>requests.push(r.url()));
   if(mode==='missing')await page.route('**/art/pixelfx-polish/*.webp*',r=>r.fulfill({status:404,body:'资源缺失回归'}));
   await page.goto(address.url+(mode==='low'?'?touch=1':''));await page.waitForFunction(mode=>mode==='missing'?PixelFxPolish.getStats().assetError:PixelFxPolish.isReady(),mode);
   await page.getByRole('button',{name:'启动60级安全角色',exact:true}).click();await page.evaluate(mode=>{player.graphicsQuality=mode==='low'?'low':'high';PixelFxPolish.setQuality(mode!=='low');},mode);
   await page.getByRole('button',{name:'进入第一层',exact:true}).click();await page.waitForFunction(()=>ArtSamples.pending===0&&!ArtSamples.loadError);
   if(mode==='high')await page.waitForFunction(()=>PixelFxPolish.getStats().detailReady);
   await page.evaluate(async()=>{await ArtSamples.ensureMonsters(['skeleton','mummy','ghost','vampire','butcher']);gameActive=false;AutoBattle.enabled=false;document.getElementById('qa-controls').open=false;});await page.waitForTimeout(70);
   const result=await page.evaluate(mode=>{
    enemies=[];projectiles=[];particles=[];vfxEffects=[];slashEffects=[];scheduledMonsterAttacks.length=0;SkillBranchSystem.reset();PixelFxPolish.clear();HeroVfx.clear();EnemyVfx.clear();
    const col=Math.floor(player.x/TILE_SIZE),row=Math.floor(player.y/TILE_SIZE);for(let y=row-8;y<=row+8;y++)for(let x=col-8;x<=col+8;x++)if(y>=0&&x>=0&&y<MAP_HEIGHT&&x<MAP_WIDTH)mapData[y][x]=1;
    const make=(type,dx=30)=>{const e=EnemyPool.acquire({x:player.x+dx,y:player.y,hp:1e7,maxHp:1e7,dmg:20,speed:0,radius:12,dead:false,ai:'chase',monsterType:type,frameIndex:MONSTER_FRAMES[type]??BOSS_FRAMES[type],name:'',cooldown:99,facingDirection:'left'});enemies.push(e);return e;};
    let detailDraws=0;const nativeImage=ctx.drawImage;ctx.drawImage=function(...args){if(args[0]?.src?.includes('/detail-body.webp'))detailDraws++;return nativeImage.apply(this,args);};const order=[],events=PixelFxPolish.drawEvents,actor=drawEnemyActor,danger=CombatTactics.draw;
    PixelFxPolish.drawEvents=function(...a){order.push(a[4]?'front':'back');return events(...a);};drawEnemyActor=function(...a){order.push('actor');return actor(...a);};CombatTactics.draw=function(...a){order.push('danger');return danger(...a);};
    const paint=()=>{gameFrameId++;EnemyCache.update(gameFrameId);EnemySpatialGrid.rebuild(gameFrameId);draw();if(!(order.indexOf('back')<order.indexOf('actor')&&order.lastIndexOf('front')<order.lastIndexOf('danger')))throw Error('前后层与危险预警顺序错误');order.length=0;};
    player.hp=50;player.maxHp=1000;player.invincibleTimer=0;player.isDead=false;player.shield={active:false,value:0,maxValue:0,invincibleTimer:0,cooldown:0};let e=make('skeleton');
    for(const type of ['skeleton','mummy','ghost','vampire']){e.monsterType=type;startMonsterAttack(e,{duration:.38,impactDelay:.18,telegraph:'melee',targetX:player.x,targetY:player.y,resolve:attacker=>resolveEnemyMeleeImpact(attacker)});processScheduledMonsterAttacks(.19);PixelFxPolish.update(.04);EnemyVfx.update(.04);paint();e.recoveryTimer=0;}
    player.poisoned=true;player.poisonTimer=3;player.cursedTimer=3;player.lightningOverloadTimer=1;e.poisoned=true;e.poisonTimer=2;e.cursedTimer=3;e.lightningOverloadTimer=1;
    const state=JSON.stringify([player.poisonTimer,player.cursedTimer,player.lightningOverloadTimer,e.hp,e.poisonTimer]);paint();if(state!==JSON.stringify([player.poisonTimer,player.cursedTimer,player.lightningOverloadTimer,e.hp,e.poisonTimer]))throw Error('绘制修改了战斗状态');
    player.poisoned=false;player.poisonTimer=player.cursedTimer=player.lightningOverloadTimer=0;e.poisoned=false;e.poisonTimer=e.cursedTimer=e.lightningOverloadTimer=0;PixelFxPolish.update(.08);paint();
    const hp=player.hp;player.lifeSteal=50;player.attackCooldown=0;player.damage=[10,10];performAttack(e);paint();if(!(player.hp>hp))throw Error('真实吸血未治疗');
    player.shield={active:true,value:30,maxValue:100,timer:2,cooldown:0,invincibleTimer:0};paint();player.shield.active=false;player.shield.invincibleTimer=1;paint();
    player.hp=50;const potionSlot=player.inventory.findIndex(v=>v===null);if(potionSlot<0)throw Error('验收需要空背包槽位');player.inventory[potionSlot]={type:'potion',name:'治疗药剂',heal:50,quantity:1};useOrEquipItem(potionSlot);if(!(player.hp>50))throw Error('药剂未真实治疗');PixelFxPolish.update(.7);DeathPanel.playReviveEffect();triggerLevelUpEffect(player.lvl+1);completeAchievement(ACHIEVEMENTS[0]);DailyQuestSystem.checkAndReset();const q=DailyQuestSystem.getCurrentQuest();if(q){DailyQuestSystem.updateProgress(q.type,q.target);if(!q.completed)throw Error('每日任务没有真实完成');}paint();
    const itemCount=groundItems.length,d={x:player.x+60,y:player.y+25,type:{name:'crate',row:1,color:'#a0522d'},broken:false};const rng=Math.random;try{Math.random=()=>.1;DestructibleSystem.break(d);}finally{Math.random=rng;}if(groundItems.length!==itemCount+1)throw Error('箱子真实掉落改变');const drops=groundItems.length;DestructibleSystem.break(d);if(groundItems.length!==drops)throw Error('重复破箱产生掉落');paint();
    particles=[];vfxEffects=[];for(let n=0;n<120;n++)CombatVisuals.sampleFrame(1);e.isBoss=true;e.monsterType='butcher';e.slamRadius=100;e.recoveryTimer=0;e.pendingSkill=null;startBossSkillWindup(e,'groundSlam',3,{windup:.1,telegraph:'circle',radius:100});paint();updateBossPendingSkill(e,.11);bossFireNova(e,100,100);HeroVfx.nova(player.x-80,player.y,90);HeroVfx.meteorImpact(player.x+70,player.y+50,70);PixelFxPolish.update(.1);EnemyVfx.update(.1);HeroVfx.update(.1);paint();
    const before=gameFrameId;for(let n=0;n<60;n++){update(1/60);draw();}const frames=gameFrameId-before;PixelFxPolish.update(2);const active=PixelFxPolish.getStats().active;
    ctx.drawImage=nativeImage;PixelFxPolish.drawEvents=events;drawEnemyActor=actor;CombatTactics.draw=danger;const stats=PixelFxPolish.getStats();PixelFxPolish.clear();return {mode,frames,active,detailDraws,stats,diagnostics:qaDiagnostics.errors};
   },mode);
   assert.equal(result.frames,60);assert.equal(result.active,0);assert.deepEqual(errors,[]);assert.deepEqual(result.diagnostics,[]);
   if(mode==='missing'){assert(result.stats.assetError);assert(logs.filter(s=>s.startsWith('PixelFX精修图集加载失败')).length===4);assert(bad.every(u=>u.includes('/art/pixelfx-polish/')));}
   else{assert.deepEqual(logs,[]);assert.deepEqual(bad,[]);for(const key of ['back','front','large','status','cleanses','heals','rewards','melee','shield'])assert(result.stats.coverage[key]>0,'真实触发覆盖 '+key+' '+JSON.stringify(result));}
   if(mode==='low'){assert(!result.stats.detailReady&&!result.stats.lightReady);assert(result.stats.atlasBytes<2.2*1024*1024);assert(!requests.some(u=>u.includes('/pixelfx-polish/detail-')),'冷启动性能模式不请求大招精细图集');}
   if(mode==='high'){
    assert(result.detailDraws>0,'低负载场景应实际绘制精细图集');
    await page.evaluate(()=>{
     for(let n=0;n<120;n++)CombatVisuals.sampleFrame(1);
     const panel=document.createElement('section');panel.id='polish-proof';panel.style.cssText='position:fixed;inset:12px;z-index:2000000;background:#151e26;padding:15px;color:#e8d9af';const h=document.createElement('h2');h.textContent='PixelFX 原始素材 · 新增精修实际绘制';panel.append(h);const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1000;canvas.style.maxWidth='100%';panel.append(canvas);document.body.append(panel);const c=canvas.getContext('2d'),camera={x:0,y:0};c.fillStyle='#202b35';c.fillRect(0,0,1200,1000);c.font='18px sans-serif';c.textAlign='center';
     const names=['中毒持续','诅咒持续','雷电过载','状态解除','原始治疗','祝福光纹','复活羽翼','护盾前后遮挡','骨刃突刺','钝击尘屑','升级光柱','成就勋章','任务卷轴','箱中奖励','主角火焰','敌方火焰'];
     for(let n=0;n<names.length;n++){const x=150+n%4*300,y=190+Math.floor(n/4)*245;c.fillStyle='#e8d9af';c.fillText(names[n],x,y-125);PixelFxPolish.clear();PixelFxPolish.beginFrame();CombatVisuals.beginFrame(true,0);const e={x,y,hp:50,maxHp:100,monsterType:'skeleton',facingDirection:'front'};
      if(n<3){e.poisoned=n===0;e.poisonTimer=n===0?2:0;e.cursedTimer=n===1?2:0;e.lightningOverloadTimer=n===2?1:0;}if(n===3){e.cursedTimer=2;PixelFxPolish.drawActor(c,e,false);e.cursedTimer=0;PixelFxPolish.update(.05);}if(n===4)PixelFxPolish.heal(e,20);if(n===5)e.shield={invincibleTimer:1};if(n===6)PixelFxPolish.revive(e);if(n===7)e.shield={active:true,value:80,maxValue:100};if(n===8)PixelFxPolish.melee(e,{angle:0});if(n===9)PixelFxPolish.melee({...e,monsterType:'mummy'},{angle:0});if(n>=10&&n<=13)PixelFxPolish.reward(['level','achievement','quest','chest'][n-10],x,y-20);
      PixelFxPolish.update(n===6?.3:n===8||n===9?.04:n>=10?.35:.15);if(n>=14)PixelFxPolish.drawLarge(c,n===14?'heroNova':'enemyNova',x,y,.4,110,0);PixelFxPolish.drawEvents(c,camera,1200,1000,0);PixelFxPolish.drawActor(c,e,false);if(n===7)PixelFxPolish.shield(c,x,y,e.shield,false);const f=getMonsterSpriteFrame(e);drawMonsterSprite(c,processedMonsterSprites,f,x,y,90,90);if(n===7)PixelFxPolish.shield(c,x,y,e.shield,true);PixelFxPolish.drawActor(c,e,true);PixelFxPolish.drawEvents(c,camera,1200,1000,1);if(n>=14)PixelFxPolish.drawLarge(c,n===14?'heroNova':'enemyNova',x,y,.4,110,1);
     }PixelFxPolish.clear();
    });const png=await page.locator('#polish-proof canvas').evaluate(c=>c.toDataURL('image/png'));fs.writeFileSync(path.join(out,'polish-gallery.png'),Buffer.from(png.split(',')[1],'base64'));
   }
   await page.screenshot({path:path.join(out,mode+'.png')});reports.push({mode,result,errors,logs,bad});
  }finally{await context.close();}
 }
 fs.writeFileSync(path.join(out,'polish-qa.json'),JSON.stringify({classification:'本机Chrome/Playwright，移动视口模拟，非真机',reports},null,2));console.log(JSON.stringify(reports.map(r=>({mode:r.mode,result:r.result}))));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
