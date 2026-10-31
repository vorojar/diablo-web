// 真正的释放节点、预警绘制顺序与图集404回退；不连接在线服务或写入存档。
'use strict';
const {chromium}=require('playwright'),{spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const arg=process.argv.indexOf('--output');if(arg<0)throw Error('请指定仓库外的 --output');const output=path.resolve(process.argv[arg+1]);fs.mkdirSync(output,{recursive:true});
const server=spawn(process.execPath,[path.join(__dirname,'qa-server.js'),'--port','0'],{cwd:path.resolve(__dirname,'..'),windowsHide:true,stdio:['ignore','pipe','pipe']});let browser;
(async()=>{
 const address=await new Promise((resolve,reject)=>{let data='';const timer=setTimeout(()=>reject(Error('QA服务超时')),10000);server.once('error',reject);server.stdout.on('data',s=>{data+=s;if(data.includes('\n')){clearTimeout(timer);resolve(JSON.parse(data.trim()));}});});
 browser=await chromium.launch({channel:'chrome',headless:true});const reports=[];
 for(const mode of ['high','low','missing']){
  const context=await browser.newContext({viewport:mode==='low'?{width:390,height:844}:{width:1440,height:900},isMobile:mode==='low',hasTouch:mode==='low'});
  try{
   const page=await context.newPage(),errors=[],logs=[],bad=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')logs.push(m.text());});page.on('response',r=>{if(r.status()>=400)bad.push(r.url());});
   if(mode==='missing')await page.route('**/art/enemy-vfx/*.webp*',r=>r.fulfill({status:404,body:'验收资源缺失'}));
   await page.goto(address.url+(mode==='low'?'?touch=1':''));await page.waitForFunction(mode=>HeroVfx.isReady()&&LightningVfx.getStats().bodyReady&&(mode==='missing'?EnemyVfx.getStats().assetError:EnemyVfx.getStats().bodyReady&&EnemyVfx.getStats().lightReady),mode);
   await page.getByRole('button',{name:'启动60级安全角色',exact:true}).click();await page.getByRole('button',{name:'进入第一层',exact:true}).click();
   await page.evaluate(async mode=>{await ArtSamples.ready;await ArtSamples.ensureMonsters(['skeleton','zombie','shaman','vampire','specter','mummy','butcher','diablo','baal','countess']);gameActive=false;AutoBattle.enabled=false;player.graphicsQuality=mode==='low'?'low':'high';EnemyVfx.setQuality(mode!=='low');HeroVfx.setQuality(mode!=='low');LightningVfx.setQuality(mode!=='low');CombatVisuals.setQuality(mode!=='low');VfxDirector.setQuality(mode!=='low');document.getElementById('qa-controls').open=false;},mode);
   await page.waitForTimeout(80);
   const result=await page.evaluate(()=>{
    const cases=[],order=[];const originalDanger=drawBossDangerTelegraphs,originalEnemy=EnemyVfx.drawEvents;
    drawBossDangerTelegraphs=function(...a){order.push('danger');return originalDanger(...a);};EnemyVfx.drawEvents=function(...a){order.push('enemy');return originalEnemy(...a);};
    const c=Math.floor(player.x/TILE_SIZE),r=Math.floor(player.y/TILE_SIZE);for(let y=r-10;y<=r+10;y++)for(let x=c-10;x<=c+10;x++)if(y>=0&&x>=0&&y<MAP_HEIGHT&&x<MAP_WIDTH)mapData[y][x]=1;
    const reset=()=>{EnemyVfx.clear();HeroVfx.clear();VfxDirector.clear();LightningVfx.clear();enemies=[];projectiles=[];particles=[];vfxEffects=[];slashEffects=[];scheduledMonsterAttacks.length=0;player.invincibleTimer=0;player.hp=player.maxHp=100000;player.shield={active:false,value:0,maxValue:0,invincibleTimer:0,cooldown:0};player.isDead=false;player.frozen=false;player.slowedTimer=0;player.cursedTimer=0;player.poisoned=false;player.attackCooldown=99;player.targetX=player.targetY=null;mouse.leftDown=mouse.rightDown=false;SkillBranchSystem.reset();};
    const enemy=(type,ai,dist=30)=>{const e=EnemyPool.acquire({x:player.x+dist,y:player.y,hp:500,maxHp:1000,dmg:100,speed:0,radius:12,dead:false,ai,monsterType:type,frameIndex:MONSTER_FRAMES[type]??BOSS_FRAMES[type],name:'真实入口验收',cooldown:0,facingDirection:'left'});enemies.push(e);return e;};
    const paint=()=>{gameFrameId++;EnemyCache.update(gameFrameId);EnemySpatialGrid.rebuild(gameFrameId);EnemyVfx.update(.045);draw();const last=order.slice(-2);if(last[0]!=='enemy'||last[1]!=='danger')throw Error('预警必须在新特效之后绘制');};
    reset();let e=enemy('skeleton','chase');let hp=player.hp;startMonsterAttack(e,{duration:.38,impactDelay:.18,telegraph:'melee',targetX:player.x,targetY:player.y,resolve:attacker=>resolveEnemyMeleeImpact(attacker)});processScheduledMonsterAttacks(.19);paint();if(!(player.hp<hp))throw Error('近战未结算');cases.push('近战');
    reset();e=enemy('zombie','chase');startMonsterAttack(e,{duration:.6,impactDelay:.4,tactic:'heavy',telegraph:'melee',targetX:player.x,targetY:player.y,resolve:attacker=>resolveEnemyMeleeImpact(attacker,{slamHit:true})});paint();processScheduledMonsterAttacks(.41);paint();cases.push('重击');
    reset();e=enemy('skeleton','ranged',180);e.multiShot=3;startRangedEnemyAttack(e);processScheduledMonsterAttacks(.19);paint();if(projectiles.length!==3)throw Error('箭矢数量改变');cases.push('多箭');
    reset();e=enemy('specter','specter',180);e.multiShot=3;update(.016);processScheduledMonsterAttacks(.19);paint();if(projectiles.length!==3||projectiles.some(p=>p.type!=='lightning_ball'))throw Error('幽魂雷球未释放');cases.push('幽魂雷球');
    reset();e=enemy('shaman','revive',170);const body=enemy('skeleton','chase',200);body.dead=true;body.hp=0;update(.016);paint();processScheduledMonsterAttacks(.86);paint();if(body.dead)throw Error('复活未执行');cases.push('复活');
    reset();e=enemy('vampire','vampire',150);CombatTactics.beginCharge(e);paint();processScheduledMonsterAttacks(.66);paint();CombatTactics.charge(e,.3);paint();cases.push('锁向冲锋');
    for(const id of ['fireNova','groundSlam','breathAttack','summonMinions','tentacleAttack']){
     reset();e=enemy(id==='breathAttack'?'diablo':id==='tentacleAttack'?'baal':'butcher','boss',80);e.isBoss=true;e.slamRadius=150;e.breathRange=200;e.breathAngle=60;e.tentacleCount=4;e.summonCount=2;
     const angle=Math.PI,data={windup:.1,telegraph:id==='breathAttack'?'cone':id==='tentacleAttack'?'line':'circle',angle,range:200,radius:150,damage:100};
     startBossSkillWindup(e,id,3,data);hp=player.hp;updateBossPendingSkill(e,.05);paint();if(player.hp!==hp)throw Error('蓄力提前造成伤害');updateBossPendingSkill(e,.06);paint();if(e.pendingSkill)throw Error('读条未完成');
     if(id==='tentacleAttack'&&projectiles.length!==4)throw Error('触手数量改变');if(id==='summonMinions'&&enemies.length!==3)throw Error('召唤数量改变');cases.push(id);
    }
    reset();e=enemy('countess','boss',300);e.name='女伯爵';e.isBoss=true;e.canTeleport=true;e.skillCd=0;const from=e.x;updateBossSkills(e,.016);paint();if(e.x===from)throw Error('瞬移未执行');cases.push('女伯爵瞬移');
    reset();e=enemy('mummy','chase');e.cursed=true;e.lifeSteal=.5;e.manaBurn=true;e.poisonOnHit=true;e.poisonDamage=5;resolveEnemyMeleeImpact(e);emitMummyDeathCloud(e);paint();cases.push('诅咒/吸血/法力/毒云');
    reset();e=enemy('butcher','boss',80);e.isBoss=true;startBossSkillWindup(e,'groundSlam',3,{windup:1,telegraph:'circle',radius:150});CombatTactics.hit(e,e.maxHp*.04,true);updateBossPendingSkill(e,2);paint();if(e.pendingSkill||EnemyVfx.getStats().active)throw Error('打断后不应释放新特效');cases.push('打断无假释放');
    // 让真实主循环更新/绘制60帧，验证缺资源时不会停止战斗。
    const frame=gameFrameId;for(let i=0;i<60;i++){update(1/60);draw();}const frames=gameFrameId-frame;
    EnemyVfx.update(2);const active=EnemyVfx.getStats().active;EnemyVfx.clear();drawBossDangerTelegraphs=originalDanger;EnemyVfx.drawEvents=originalEnemy;
    return {cases,stats:EnemyVfx.getStats(),frames,active,diagnostics:qaDiagnostics.errors};
   });
   assert.equal(result.frames,60);assert.equal(result.active,0);assert.deepEqual(errors,[]);assert.deepEqual(result.diagnostics,[]);
   if(mode==='missing'){assert(result.stats.assetError);assert(logs.filter(s=>s.startsWith('敌方特效图集加载失败')).length===2);assert(bad.every(s=>s.includes('/art/enemy-vfx/')));}
   else{assert.deepEqual(logs,[]);assert.deepEqual(bad,[]);for(const key of ['projectiles','releases','windups','boss','status'])assert(result.stats.coverage[key]>0,key+' 实际入口覆盖');}
   if(mode==='low'){assert(!result.stats.lightReady);assert(result.stats.atlasBytes<2*1024*1024);}
   if(mode==='high'){
    await page.evaluate(()=>{
     const panel=document.createElement('section');panel.id='enemy-proof';panel.style.cssText='position:fixed;inset:15px;z-index:2000000;background:#151e26;padding:15px;color:#e8d9af';const heading=document.createElement('h2');heading.textContent='怪物与 Boss · 游戏实际绘制入口';panel.append(heading);const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=780;canvas.style.maxWidth='100%';panel.append(canvas);document.body.append(panel);const x=canvas.getContext('2d'),camera={x:0,y:0};x.fillStyle='#202b35';x.fillRect(0,0,1200,780);x.font='18px sans-serif';x.textAlign='center';
     const labels=['敌方箭矢','幽魂雷球','巴尔触手','普通近战','重击地裂','召唤 / 复活','诅咒降临','吸血回流','木乃伊毒云','火焰新星','闪电吐息','预警保持最上层'];
     for(let i=0;i<12;i++){const px=150+(i%4)*300,py=180+Math.floor(i/4)*245;x.fillStyle='#e8d9af';x.fillText(labels[i],px,py-120);CombatVisuals.beginFrame(true,0);EnemyVfx.clear();
      const type=i===2?'baal':i===10?'diablo':i===4||i===11?'butcher':i===1?'specter':i===5?'shaman':i===8?'mummy':'skeleton',boss=['baal','diablo','butcher'].includes(type);const e={x:px-50,y:py,monsterType:type,isBoss:boss,facingDirection:'right',ai:'chase'};
      const sprite=getMonsterSpriteFrame(e);drawMonsterSprite(x,processedMonsterSprites,sprite,e.x,py,85,85);
      if(i<3)EnemyVfx.projectile(x,{x:px+40,y:py-25,type:i===0?'scatter_shot':i===1?'lightning_ball':'tentacle',angle:0,age:.1},true);
      else if(i===3||i===4)EnemyVfx.release({...e,slamHit:i===4},{angle:0},i===4?'heavy':null);
      else if(i===5)EnemyVfx.summon(px+35,py);else if(i===6)EnemyVfx.curse(px+30,py);else if(i===7)EnemyVfx.drain(px-50,py,px+35,py);else if(i===8)EnemyVfx.poison(px,py,90);
      else if(i===9)EnemyVfx.boss('fireNova',px,py,95);else if(i===10)EnemyVfx.boss('breath',px-50,py,160,0,.4);
      else{EnemyVfx.boss('fireNova',px,py,95);e.pendingSkill={id:'groundSlam',timer:.5,duration:1,originX:px,originY:py,data:{telegraph:'circle',radius:95}};}
      EnemyVfx.update(i===6?.2:i===7?.3:i===9||i===11?.23:.07);EnemyVfx.drawEvents(x,camera,1200,780);if(i===11){EnemyVfx.drawWindups(x,[e],camera,1200,780);CombatTactics.draw(x,[e],camera,1200,780);}
     }EnemyVfx.clear();
    });await page.locator('#enemy-proof').screenshot({path:path.join(output,'enemy-gallery.png')});
   }
   await page.screenshot({path:path.join(output,mode+'.png')});reports.push({mode,result,errors,logs,bad});
  }finally{await context.close();}
 }
 fs.writeFileSync(path.join(output,'enemy-qa.json'),JSON.stringify({classification:'本机Chrome/Playwright，移动视口为模拟，非真机',reports},null,2));console.log(JSON.stringify(reports.map(r=>({mode:r.mode,result:r.result,errors:r.errors}))));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
