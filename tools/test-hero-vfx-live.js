// 隔离存档/服务，真实技能入口覆盖全部基础、二阶及终极分支。
'use strict';
const {chromium}=require('playwright'),{spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const arg=process.argv.indexOf('--output');if(arg<0)throw Error('请指定仓库外的 --output');const output=path.resolve(process.argv[arg+1]);fs.mkdirSync(output,{recursive:true});
const server=spawn(process.execPath,[path.join(__dirname,'qa-server.js'),'--port','0'],{cwd:path.resolve(__dirname,'..'),windowsHide:true,stdio:['ignore','pipe','pipe']});let browser;
(async()=>{
 const address=await new Promise((resolve,reject)=>{let data='';const timer=setTimeout(()=>reject(Error('QA服务超时')),10000);server.once('error',reject);server.stdout.on('data',s=>{data+=s;if(data.includes('\n')){clearTimeout(timer);resolve(JSON.parse(data.trim()));}});});
 browser=await chromium.launch({channel:'chrome',headless:true});const report=[];
 for(const quality of ['high','low'].filter(q=>!process.argv.includes('--only-low')||q==='low')){
  const context=await browser.newContext({viewport:quality==='high'?{width:1440,height:900}:{width:390,height:844},deviceScaleFactor:quality==='high'?1:2,isMobile:quality==='low',hasTouch:quality==='low'});
  try{
   const page=await context.newPage(),errors=[],bad=[],logs=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)bad.push(r.url());});page.on('console',m=>{if(m.type()==='error')logs.push(m.text());});
   await page.goto(address.url+(quality==='low'?'?touch=1':''));await page.waitForFunction(()=>HeroVfx.getStats().bodyReady&&HeroVfx.getStats().lightReady&&LightningVfx.getStats().bodyReady);
   await page.getByRole('button',{name:'启动60级安全角色',exact:true}).click();await page.getByRole('button',{name:'进入第一层',exact:true}).click();
   await page.evaluate(async quality=>{await ArtSamples.ready;await ArtSamples.ensureMonsters(['skeleton','zombie','butcher']);gameActive=false;AutoBattle.enabled=false;player.graphicsQuality=quality;HeroVfx.setQuality(quality!=='low');LightningVfx.setQuality(quality!=='low');CombatVisuals.setQuality(quality!=='low');document.getElementById('qa-controls').open=false;},quality);await page.waitForTimeout(70);
   const cases=await page.evaluate(()=>{const result=[];for(const [skill,tree]of Object.entries(SKILL_TREE)){result.push({skill,branch:null,final:null});for(const branch of Object.keys(tree.stage2)){result.push({skill,branch,final:null});for(const final of Object.keys(tree.stage3[branch]))result.push({skill,branch,final});}}return result;});
   const results=[];
   for(const spec of cases){
    const result=await page.evaluate(async spec=>{
     SkillBranchSystem.reset();HeroVfx.clear();LightningVfx.clear();VfxDirector.clear();
     for(const p of projectiles)ProjectilePool.release(p);projectiles=[];for(const e of enemies)EnemyPool.release(e);enemies=[];particles=[];vfxEffects=[];slashEffects=[];scheduledMonsterAttacks.length=0;
     const c=Math.floor(player.x/TILE_SIZE),r=Math.floor(player.y/TILE_SIZE);for(let row=r-7;row<=r+7;row++)for(let col=c-7;col<=c+7;col++)if(row>=0&&col>=0&&row<MAP_HEIGHT&&col<MAP_WIDTH)mapData[row][col]=1;
     for(const id of Object.keys(SKILL_TREE))player.skillTree[id]={stage1:5,stage2:{chosen:null,level:0},stage3:{chosen:null,level:0}};
     player.skillTree[spec.skill]={stage1:5,stage2:{chosen:spec.branch,level:spec.branch?2:0},stage3:{chosen:spec.final,level:spec.final?1:0}};syncSkillsFromTree();
     player.shield={active:false,value:0,maxValue:0,timer:0,cooldown:0,invincibleTimer:0};player.hp=player.maxHp;player.mp=player.maxMp=10000;player.invincibleTimer=120;player.attackCooldown=0;
     for(const id of ['fireball','thunder','multishot'])player.skillCooldowns[id]=0;
     mouse.leftDown=false;mouse.rightDown=false;mouse.leftClick=false;player.targetX=player.targetY=player.targetItem=null;
     const dist=spec.skill==='thunder'?160:spec.skill==='holy_shield'||spec.final==='nova'?70:220;
     for(let i=0;i<5;i++)enemies.push(EnemyPool.acquire({x:player.x+dist+(i%2)*18,y:player.y+(i-2)*16,hp:1e7,maxHp:1e7,dmg:0,speed:0,ai:'chase',radius:12,cooldown:999,monsterType:'skeleton',frameIndex:MONSTER_FRAMES.skeleton,facingDirection:'left',name:''}));
     gameFrameId++;EnemyCache.update(gameFrameId);EnemySpatialGrid.rebuild(gameFrameId);
     mouse.worldX=enemies[2].x;mouse.worldY=enemies[2].y;const before=enemies.reduce((sum,e)=>sum+e.hp,0),mp=player.mp;
     castSkill(spec.skill);const spent=mp-player.mp;if(!(spent>0))throw Error('有效技能未施放：'+JSON.stringify(spec));
     for(let i=0;i<100;i++){
      if(spec.skill==='holy_shield'&&i===(spec.final==='retribution'?74:4)){player.invincibleTimer=0;playerTakeDamage(player.shield.value+1,enemies[2],{damageType:'physical'});player.invincibleTimer=120;}
      mouse.x=enemies[2].x-camera.x;mouse.y=enemies[2].y-camera.y;
      update(1/30);draw();if(i%10===0)await new Promise(resolve=>setTimeout(resolve,0));
     }
     const damage=before-enemies.reduce((sum,e)=>sum+e.hp,0);if(spec.skill!=='holy_shield'&&damage<=0)throw Error('技能未命中：'+JSON.stringify(spec));
     return {...spec,spent,damage,hero:HeroVfx.getStats(),lightning:LightningVfx.getStats(),pending:ArtSamples.pending};
    },spec);
    results.push(result);await page.waitForTimeout(140);
   }
   const melee=await page.evaluate(()=>{
    SkillBranchSystem.reset();HeroVfx.clear();player.shield={active:false,value:0,cooldown:0,invincibleTimer:0};player.attackCooldown=0;
    for(let i=0;i<enemies.length;i++){enemies[i].x=player.x+28+i*3;enemies[i].y=player.y+(i-2)*6;enemies[i].hp=1e7;enemies[i].maxHp=1e7;}
    gameFrameId++;EnemyCache.update(gameFrameId);EnemySpatialGrid.rebuild(gameFrameId);const target=enemies[2],hp=target.hp;performAttack(target);draw();
    return {damage:hp-target.hp,stats:HeroVfx.getStats()};
   });assert(melee.damage>0);assert(melee.stats.coverage.slashes>0);
   const stats=melee.stats;for(const key of ['projectiles','casts','impacts','slashes','shield','areas','states'])assert(stats.coverage[key]>0,'实际渲染覆盖：'+key);
   assert(stats.maxAtlasBytes<=6*1024*1024);if(quality==='low'){assert(!stats.lightReady);assert(stats.atlasBytes<=3*1024*1024);}
   assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);assert.deepEqual(logs,[]);
   await page.screenshot({path:path.join(output,quality+'-melee.png')});report.push({quality,cases:results,melee,errors,bad,logs});
  }finally{await context.close();}
 }
 fs.writeFileSync(path.join(output,'hero-qa.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.map(r=>({quality:r.quality,cases:r.cases.length,stats:r.melee.stats,errors:r.errors}))));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
