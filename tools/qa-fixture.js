// 此脚本只由 qa-server 的 /qa.html 响应追加；生产 index.html 不引用。
(() => {
    const style = document.createElement('style');
    style.textContent = '#qa-controls{position:fixed;top:30px;left:8px;z-index:999999;background:#171b22ed;color:#eee;border:1px solid #c9a762;border-radius:8px;font:13px/1.5 sans-serif;padding:8px;max-width:min(370px,calc(100vw - 32px));max-height:75vh;overflow:auto}#qa-controls summary{cursor:pointer;font-weight:bold}#qa-controls button,#qa-controls select{min-height:36px;margin:3px;padding:5px 8px;background:#292e39;color:#eee;border:1px solid #787878;border-radius:4px}#qa-status{margin:5px;white-space:pre-wrap}#qa-gallery{position:fixed;inset:12px;z-index:1000000;background:#15191f;color:#eee;padding:16px;overflow:auto;display:none;font:14px sans-serif}#qa-gallery canvas{max-width:100%;height:auto;background:repeating-conic-gradient(#363b44 0% 25%,#20252d 0% 50%) 0 / 20px 20px}#qa-gallery button{position:sticky;top:0;min-height:44px;z-index:2}';
    document.head.appendChild(style);
    const panel = document.createElement('details');
    panel.id='qa-controls'; panel.open=true;
    panel.innerHTML='<summary>本地 QA 控制台 · 点击收起</summary><p>线上服务已隔离；测试角色不写入存档。</p><button data-action="start">启动60级安全角色</button><button data-action="floor">进入第一层</button><button data-panel="inventory">打开背包</button><button data-panel="skills">打开技能树</button><button data-action="close">关闭游戏面板</button><br><label>技能 <select id="qa-skill"></select></label><label>分支 <select id="qa-stage2"></select></label><label>终极 <select id="qa-stage3"></select></label><button data-action="branch">应用分支并展示</button><button data-action="cast">朝练习目标施法</button><button data-action="hurt">播放主角受击</button><button data-action="gallery">展示全部新图集</button><output id="qa-status">等待点击启动；原始新手入口：/index.html</output>';
    document.body.appendChild(panel);
    panel.insertAdjacentHTML('beforeend','<button data-action="layout">验收背包布局</button>');
    panel.insertAdjacentHTML('beforeend','<button data-action="items">全部16种物品图标</button>');
    panel.insertAdjacentHTML('beforeend','<details><summary>完整美术覆盖验收</summary><label>英雄动作 <select id="qa-hero-action"></select></label><label>方向 <select id="qa-art-direction"></select></label><button data-action="hero">展示英雄动作</button><button data-action="heroes">全部英雄动作×方向</button><br><label>怪物 <select id="qa-monster-type"></select></label><label>怪物动作 <select id="qa-monster-action"></select></label><button data-action="monster">展示所选怪物</button><button data-action="monsters">全部15种怪物/Boss</button><br><label>场景 <select id="qa-scene"></select></label><button data-action="scene">进入真实场景</button><button data-action="coverage">资产来源覆盖清单</button></details>');
    panel.insertAdjacentHTML('beforeend','<p id="qa-environment"></p><output id="qa-errors" style="display:block;white-space:pre-wrap" aria-live="polite"></output><details><summary>实时验收摘要</summary><pre id="qa-snapshot" style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px"></pre></details>');
    document.getElementById('qa-environment').textContent=window.qaDiagnostics.simulatedTouch ? '触控路径模拟（非真机），测试 ontouchstart 标志已启用。' : '普通桌面环境；?touch=1 可模拟移动脚本路径。';
    const gallery=document.createElement('section'); gallery.id='qa-gallery';document.body.appendChild(gallery);
    panel.insertAdjacentHTML('beforeend','<button data-action="death">真实死亡与复活</button><button data-action="hud">验收HUD触控布局</button>');
    panel.insertAdjacentHTML('beforeend','<button data-action="combat-audit">记录所选怪物真实战斗帧</button>');
    const status=text=>document.getElementById('qa-status').textContent=text;
    // 只覆盖此测试页面的存档写入，保留原始页面真实本地存档行为。
    SaveSystem.save=async()=>true;
    let safe=false;
    let practiceTarget=null;
    let lastCast=null;
    let peakProjectiles=0, peakAreas=0;
    let layoutReport=null;
    let artReport=null, previewCleanup=()=>{};
    function protect() {
        if (!safe) return;
        AutoBattle.enabled=false;
        if (player.isDead) return;
        player.invincibleTimer=3600;player.hp=player.maxHp;player.mp=player.maxMp;
        player.targetX=null;player.targetY=null;player.targetItem=null;
        for (const enemy of enemies) { enemy.dmg=0;enemy.speed=0; }
        closeDailyLoginPanel();
    }
    setInterval(protect, 100);
    function start() {
        if (!gameActive) { window.pendingLoadData=null;startGame(); }
        player.isDead=false;player.deathTimer=0;DeathPanel.hide();
        document.getElementById('game-container').classList.remove('dead-filter');
        safe=true;
        player.lvl=60;player.points=100;player.skillPoints=100;player.ene=120;player.vit=150;player.gold=10000;
        player.tutorial.completed=true;player.tutorial.step=99;
        hideTutorialTip();hideTutorialBubble();
        for (const id of Object.keys(SKILL_TREE)) player.skillTree[id]={stage1:5,stage2:{chosen:null,level:0},stage3:{chosen:null,level:0}};
        syncSkillsFromTree();updateStats();protect();syncAutoBattleUI();updateSkillsUI();updateUI();
        status('60级 / 全基础技能5级 / 自动战斗关闭 / 无敌 / 不保存。');
    }
    function closePanels() {
        for (const [id, item] of Object.entries(panelManager.panels)) if (item.opened) togglePanel(id);
        closeDailyLoginPanel();
    }
    function showPanel(id) { if (!gameActive) start();if (!panelManager.panels[id].opened) togglePanel(id); }
    function enter() { if (!gameActive) start();enterFloor(1,'start');protect();closePanels();status('已进入第一层，怪物零伤害且停止移动。'); }
    function fillSelect(id, values) {
        const select=document.getElementById(id); select.replaceChildren();
        for (const [value,label] of values) { const option=document.createElement('option');option.value=value;option.textContent=label;select.appendChild(option); }
    }
    const heroActions=[...Object.keys(HERO_SPRITE_CONFIG.rowsByAction),'death'];
    const artDirections=['front','back','left','right','frontLeft','frontRight','backLeft','backRight'];
    const monsterTypes=Object.keys(MONSTER_SPRITE_CONFIG.types);
    const monsterLabels={melee:'沉沦魔',zombie:'僵尸',ranged:'骷髅弓箭手',skeleton:'骷髅战士',shaman:'沉沦魔巫师',ghost:'幽灵鬼魂',specter:'闪电幽魂',mummy:'木乃伊',vampire:'吸血鬼',bloodRaven:'血鸟',countess:'女伯爵',butcher:'屠夫',duriel:'树头木拳',diablo:'暗黑破坏神',baal:'巴尔'};
    const sceneDefinitions={town:{name:'罗格营地',floor:0},forest:{name:'迷雾森林',floor:1},ice:{name:'冰封废墟',floor:11},fire:{name:'熔岩裂隙',floor:21}};
    fillSelect('qa-hero-action',heroActions.map(action=>[action,action]));
    fillSelect('qa-art-direction',artDirections.map(direction=>[direction,direction]));
    fillSelect('qa-monster-type',monsterTypes.map(type=>[type,`${monsterLabels[type] || type} (${type})`]));
    fillSelect('qa-monster-action',[...Object.keys(MONSTER_SPRITE_CONFIG.types.melee),'death','cast','release'].map(action=>[action,action]));
    fillSelect('qa-scene',Object.entries(sceneDefinitions).map(([key,scene])=>[key,`${scene.name} · ${scene.floor}层`]));
    function galleryHeader(title) {
        previewCleanup();previewCleanup=()=>{};
        gallery.replaceChildren();gallery.style.display='block';
        const close=document.createElement('button');close.textContent='关闭预览';
        close.onclick=()=>{previewCleanup();gallery.style.display='none';};gallery.appendChild(close);
        const heading=document.createElement('h2');heading.textContent=title;gallery.appendChild(heading);
    }
    function artSource(frame, fallback) {
        if (!frame) return {loaded:false};
        const source=frame.source || fallback;
        const keys=Object.keys(ArtSamples.definitions).filter(key=>ArtSamples.frame(key,0,0)?.source===source);
        return {loaded:!!source,source:keys.length?keys.join(','):(source?.currentSrc || source?.src || '原图集'),
            frame:{x:frame.x,y:frame.y,width:frame.width,height:frame.height,flipX:!!frame.flipX},
            sourceSize:{width:source?.width,height:source?.height},
            inBounds:!!source&&frame.x>=0&&frame.y>=0&&frame.x+frame.width<=source.width&&frame.y+frame.height<=source.height};
    }
    function previewSprites(kind, all) {
        if(!gameActive)start();
        closePanels();
        const action=document.getElementById(kind==='hero'?'qa-hero-action':'qa-monster-action').value;
        const direction=document.getElementById('qa-art-direction').value;
        const cases=kind==='hero' ? (all?heroActions.flatMap(action=>artDirections.map(direction=>({action,direction}))):[{action,direction}]) :
            (all?monsterTypes:[document.getElementById('qa-monster-type').value]).map(type=>({type,action,direction}));
        galleryHeader(kind==='hero'?'英雄：真实选帧、自然尺寸与2倍放大':'怪物与Boss：真实选帧、自然尺寸与2倍放大');
        const hint=document.createElement('p');hint.textContent='格线是透明背景。每张卡左为游戏自然尺寸、右为2倍。动画循环覆盖全部帧；可在关闭后切换动作/方向/类型。';gallery.appendChild(hint);
        const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:12px';gallery.appendChild(grid);
        const previews=cases.map(item=>{
            const card=document.createElement('section'),label=document.createElement('h3'),canvas=document.createElement('canvas'),info=document.createElement('pre');
            label.textContent=`${item.type?monsterLabels[item.type]+' · ':''}${item.action} / ${item.direction}`;
            canvas.width=300;canvas.height=206;info.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font:11px monospace';
            card.append(label,canvas,info);grid.appendChild(card);
            const enemy=kind==='monster'?EnemyPool.acquire({x:0,y:0,hp:100,maxHp:100,dmg:0,speed:0,radius:12,dead:false,monsterType:item.type,isBoss:Object.hasOwn(BOSS_FRAMES,item.type),frameIndex:MONSTER_FRAMES[item.type]??BOSS_FRAMES[item.type],facingDirection:item.direction,lastSideDirection:'right'}):null;
            return {...item,canvas,info,enemy};
        });
        artReport={kind,cases:[],total:previews.length};
        let active=true,lastTick=0;
        function animate(now) {
            if(!active)return;
            if(now-lastTick<100){requestAnimationFrame(animate);return;}
            lastTick=now;
            artReport.cases=previews.map(item=>{
                const index=Math.floor(now/220)%4;let frame,source;
                if(kind==='hero'){
                    const saved={heroAction:player.heroAction,heroActionTimer:player.heroActionTimer,heroActionDuration:player.heroActionDuration,animTime:player.animTime,moving:player.moving,direction:player.direction,isDead:player.isDead,deathTimer:player.deathTimer};
                    try {
                        Object.assign(player,{heroAction:item.action,heroActionTimer:4-index,heroActionDuration:4,animTime:index/(HERO_SPRITE_CONFIG.fps[item.action]||3),moving:item.action==='walk',direction:item.direction});
                        player.isDead=item.action==='death';player.deathTimer=(index+.1)*.9/4;
                        frame=getHeroFrame(item.direction);source=frame?.source || processedHeroSprites;
                    } finally {Object.assign(player,saved);}
                }else{
                    const enemy=item.enemy;Object.assign(enemy,{monsterAction:item.action,monsterActionTimer:4-index,monsterActionDuration:4,monsterAnimTime:index/(MONSTER_SPRITE_CONFIG.fps[item.action]||3),wasMoving:item.action==='walk',hitFlashTimer:0});
                    enemy.dead=item.action==='death';enemy.deathVisualDuration=1.5;
                    enemy.deathVisualTimer=1.5-(index+.1)*(enemy.isBoss?.72:.48)/4;
                    enemy.bossSkillVisual=['cast','release'].includes(item.action)?{phase:item.action==='cast'?'cast':'attack',timer:4-index,duration:4,direction:item.direction}:null;
                    frame=getMonsterSpriteFrame(enemy);source=frame?.source || processedMonsterSprites;
                }
                const inspection=artSource(frame,source),ctx=item.canvas.getContext('2d');ctx.clearRect(0,0,300,206);
                if(frame&&source){
                    const height=kind==='hero'?HERO_SPRITE_CONFIG.renderSize:MONSTER_SPRITE_CONFIG.renderSize,width=height*frame.width/frame.height;
                    for(const [center,scale]of [[58,1],[204,2]]){
                        if(kind==='monster')drawMonsterSprite(ctx,source,frame,center,194,width*scale,height*scale);
                        else drawHeroSprite(ctx,source,frame,center,194-height*scale,width*scale,height*scale);
                    }
                }
                item.info.textContent=`${inspection.inBounds?'PASS 帧边界':'FAIL 未加载/越界'} · frame ${index}\n${inspection.source || '无来源'}\n${JSON.stringify(inspection.frame)}`;
                return {type:item.type,action:item.action,direction:item.direction,...inspection};
            });
            requestAnimationFrame(animate);
        }
        previewCleanup=()=>{if(!active)return;active=false;for(const preview of previews)if(preview.enemy)EnemyPool.release(preview.enemy);};
        requestAnimationFrame(animate);
    }
    function recordCombat() {
        if (!gameActive) start();
        enter();
        const type=document.getElementById('qa-monster-type').value;
        const target=enemies.find(enemy=>!enemy.dead);
        const px=Math.floor(player.x/TILE_SIZE),py=Math.floor(player.y/TILE_SIZE);
        const tile=[[2,0],[0,2],[-2,0],[0,-2],[1,0],[0,1]].map(([dx,dy])=>({x:(px+dx+.5)*TILE_SIZE,y:(py+dy+.5)*TILE_SIZE})).find(p=>!isWall(p.x,p.y)&&hasLineOfSight(player.x,player.y,p.x,p.y));
        if (!target||!tile) {status('没有可用练习目标或邻近地块，请重新进入首层。');return;}
        Object.assign(target,tile,{name:monsterLabels[type],monsterType:type,isBoss:Object.hasOwn(BOSS_FRAMES,type),frameIndex:MONSTER_FRAMES[type]??BOSS_FRAMES[type],hp:100,maxHp:100,dmg:0,speed:0,dodgeChance:0,blockChance:0,bossCooldowns:{},bossTraits:{},cooldown:20,skillCd:20});
        const records=[],seen=new Set(),started=performance.now();let killed=false;
        if (target.isBoss) startBossSkillWindup(target,'groundSlam',20,{windup:.6,telegraph:'circle',radius:100});
        panel.open=false;
        function sample(now) {
            const frame=getMonsterSpriteFrame(target);
            const phase=target.dead?'death':target.bossSkillVisual?.timer>0?target.bossSkillVisual.phase:'idle';
            const key=`${phase}:${frame.x}:${frame.y}`;
            if (!seen.has(key)&&(!target.dead||target.deathVisualTimer>0)) {
                seen.add(key);
                const picture=document.createElement('canvas');picture.width=160;picture.height=130;
                drawMonsterSprite(picture.getContext('2d'),frame.source||processedMonsterSprites,frame,80,120,MONSTER_SPRITE_CONFIG.renderSize,MONSTER_SPRITE_CONFIG.renderSize);
                records.push({phase,x:frame.x,y:frame.y,deathTimer:target.deathVisualTimer,picture});
            }
            if (!killed&&now-started>1400) {takeDamage(target,100000,true);killed=true;}
            if(now-started<4200){requestAnimationFrame(sample);return;}
            galleryHeader(`${monsterLabels[type]}：真实更新循环与 takeDamage 击杀记录`);
            const strip=document.createElement('div');strip.style.cssText='display:flex;flex-wrap:wrap;gap:12px';gallery.appendChild(strip);
            for(const record of records){const card=document.createElement('section'),label=document.createElement('p');label.textContent=`${record.phase} (${record.x},${record.y})`;card.append(label,record.picture);strip.appendChild(card);}
            artReport={kind:'combat-recording',type,dead:target.dead,frames:records.map(({picture,...record})=>record)};
            status(JSON.stringify(artReport));
        }
        requestAnimationFrame(sample);
    }
    function showScene() {
        if(!gameActive)start();previewCleanup();gallery.style.display='none';
        const key=document.getElementById('qa-scene').value,scene=sceneDefinitions[key];
        player.isInHell=false;enterFloor(scene.floor,'start');protect();closePanels();
        artReport={kind:'scene',requested:key,floor:player.floor,biome:getBiomeStyle(player.floor)?.type || 'town',npcs:npcs.map(npc=>npc.name),props:typeof scenicProps==='undefined'?null:scenicProps.length};
        status(`${scene.name}：使用真实 enterFloor(${scene.floor})，地图/装饰/NPC保持真实生成，测试内存不保存。`);panel.open=false;
    }
    function showCoverage() {
        galleryHeader('视觉来源与遗漏清单');
        const content=document.createElement('pre');content.style.cssText='white-space:pre-wrap;line-height:1.8';
        const definitions=Object.entries(ArtSamples.definitions).map(([key,item])=>`${ArtSamples.frame(key,0,0)?'已加载':'未加载'} ${key}: ${item.file}`);
        content.textContent=[`英雄动作 ${heroActions.length} × 方向 ${artDirections.length}；怪物类型 ${monsterTypes.length}（9普通+6Boss）`,...definitions,
            '仍需人工逐项查看：NPC与图鉴是否接入新图；装备/掉落/药剂 items-painted.png；UI技能 skills-painted.png；HUD球体/菜单/面板为CSS；登录桌面 bg.jpg 与手机 mobile_bg.jpg；PWA图标 icon-192.png。',
            '场景来源：wall_tiles.png、floor_tiles.png、environment_sprites.png、destructibles_sprites.png、程序绘制道路/草木/灯光/传送门，以及新增场景素材。',
            '技能覆盖：sprite-vfx图集、程序粒子/投射物/预警圈/护盾/状态染色。原图加载成功不等于每个动作方向已接入，请结合动作卡的实际source检查。'].join('\n');gallery.appendChild(content);
    }
    function showItems() {
        if(!gameActive)start();galleryHeader('16种物品：真实UI接线，40px与80px对照');
        const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px';gallery.appendChild(grid);
        const samples=[];
        for(const [key,coords]of Object.entries(ITEM_FRAMES)){
            const item={type:key,name:key,rarity:3};
            if(key==='potion_health'){item.type='potion';item.heal=1;}
            if(key==='potion_mana'){item.type='potion';item.mana=1;}
            const card=document.createElement('section'),name=document.createElement('h3');name.textContent=`${key} (${coords.row},${coords.col})`;card.appendChild(name);
            for(const size of [40,80]){
                const icon=document.createElement('div');icon.style.cssText=`width:${size}px;height:${size}px;display:inline-block;background-color:#24262e;margin:5px;vertical-align:bottom`;
                applyItemSpriteToElement(icon,item);card.appendChild(icon);
                if(size===40)samples.push({key,...coords,source:icon.style.backgroundImage,position:icon.style.backgroundPosition});
            }
            grid.appendChild(card);
        }
        artReport={kind:'items',count:samples.length,samples};
    }
    fillSelect('qa-skill',Object.entries(SKILL_TREE).map(([key,skill])=>[key,skill.name]));
    function fillStage3() {
        const skill=SKILL_TREE[document.getElementById('qa-skill').value];
        const branch=document.getElementById('qa-stage2').value;
        fillSelect('qa-stage3',Object.entries(skill.stage3[branch]).map(([key,item])=>[key,item.name]));
    }
    function fillBranches() {
        const skill=SKILL_TREE[document.getElementById('qa-skill').value];
        fillSelect('qa-stage2',Object.entries(skill.stage2).map(([key,item])=>[key,item.name]));fillStage3();
    }
    document.getElementById('qa-skill').addEventListener('change',fillBranches);
    document.getElementById('qa-stage2').addEventListener('change',fillStage3);fillBranches();
    function applyBranch() {
        if (!gameActive) start();
        const skill=document.getElementById('qa-skill').value;
        player.skillTree[skill]={stage1:5,stage2:{chosen:document.getElementById('qa-stage2').value,level:5},stage3:{chosen:document.getElementById('qa-stage3').value,level:5}};
        syncSkillsFromTree();updateSkillsUI();showPanel('skills');switchSkillTab(skill);status(`${SKILL_TREE[skill].name} 分支已应用，可查看技能树或施法。`);
    }
    function cast() {
        if (!gameActive) start();if(isInTown()) enter();
        closePanels();
        const target=enemies.find(enemy=>!enemy.dead);
        if (!target) { status('首层没有练习目标，请重新进入第一层。');return; }
        const px=Math.floor(player.x/TILE_SIZE),py=Math.floor(player.y/TILE_SIZE);
        let tile=null;
        for (let radius=2;radius>=1&&!tile;radius--) for (const [dx,dy] of [[radius,0],[0,radius],[-radius,0],[0,-radius]]) {
            const x=(px+dx+.5)*TILE_SIZE,y=(py+dy+.5)*TILE_SIZE;
            if (!isWall(x,y) && hasLineOfSight(player.x,player.y,x,y)) {tile={x,y};break;}
        }
        if(!tile){status('没有邻近可走地块，请移动后重试。');return;}
        Object.assign(target,{...tile,hp:10000000,maxHp:10000000,dmg:0,speed:0});
        practiceTarget=target;
        mouse.worldX=target.x;mouse.worldY=target.y;
        const skill=document.getElementById('qa-skill').value;
        player.skillCooldowns[skill]=0;player.shield.cooldown=0;player.mp=player.maxMp;
        lastCast={skill,hpBefore:target.hp};peakProjectiles=0;peakAreas=0;
        castSkill(skill);
        lastCast.shieldAfterCast={...player.shield};
        report();status(`${SKILL_TREE[skill].name} 已朝练习目标施放；狙击会自动蓄满。`);
        panel.open=false;
    }
    function showGallery() {
        previewCleanup();
        gallery.replaceChildren();gallery.style.display='block';
        const close=document.createElement('button');close.textContent='关闭图集';close.onclick=()=>gallery.style.display='none';gallery.appendChild(close);
        for (const [key,definition] of Object.entries({...ArtSamples.definitions, ...EnvironmentArt.definitions})) {
            const heading=document.createElement('h2');heading.textContent=`${key} · ${definition.file}`;gallery.appendChild(heading);
            const frame=Object.hasOwn(EnvironmentArt.definitions,key) ? EnvironmentArt.frame(key,0,0) : ArtSamples.frame(key,0,0);
            if(!frame){const notice=document.createElement('p');notice.textContent='未加载或透明验收失败，请查看控制台。';gallery.appendChild(notice);continue;}
            const canvas=document.createElement('canvas');canvas.width=frame.source.width;canvas.height=frame.source.height;canvas.getContext('2d').drawImage(frame.source,0,0);gallery.appendChild(canvas);
        }
        const title=document.createElement('h2');title.textContent='四技能图标 · skills-painted.png';gallery.appendChild(title);
        const icons=new Image();icons.onload=()=>{const canvas=document.createElement('canvas');canvas.width=icons.width;canvas.height=icons.height;canvas.getContext('2d').drawImage(icons,0,0);gallery.appendChild(canvas);};icons.src='/skills-painted.png';
    }
    function checkLayout() {
        showPanel('inventory');
        // 使用真正渲染后的 CSS 盒模型，等待面板入场动画结束。
        setTimeout(()=>{
            const inventory=document.getElementById('inventory-panel');
            const box=inventory.getBoundingClientRect();
            const slots=[...inventory.querySelectorAll('.bag-slot')].map(slot=>slot.getBoundingClientRect());
            layoutReport={viewport:{width:innerWidth,height:innerHeight},panel:{left:box.left,top:box.top,right:box.right,bottom:box.bottom,width:box.width,height:box.height},
                boxSizing:getComputedStyle(inventory).boxSizing,clientWidth:inventory.clientWidth,scrollWidth:inventory.scrollWidth,
                minSlotWidth:slots.length?Math.min(...slots.map(slot=>slot.width)):null,
                passed:box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight&&inventory.scrollWidth<=inventory.clientWidth};
            status(`背包布局 ${layoutReport.passed?'PASS':'FAIL'}：${JSON.stringify(layoutReport)}`);report();
        },450);
    }
    function checkHudLayout() {
        const bounds=selector=>[...document.querySelectorAll(selector)].map(el=>{const r=el.getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};});
        const orbs=bounds('.orb-container'),skills=bounds('.skill-btn');
        const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
        const passed=orbs.every(r=>Math.abs(r.width-r.height)<1&&r.left>=0&&r.right<=innerWidth+1)
            &&skills.every(r=>r.width>=44&&r.height>=44&&r.left>=0&&r.right<=innerWidth+1&&!orbs.some(o=>overlaps(r,o)));
        status(`HUD布局 ${passed?'PASS':'FAIL'}：${JSON.stringify({viewport:[innerWidth,innerHeight],orbs,skills})}`);
    }
    panel.addEventListener('pointerdown',event=>event.stopPropagation());
    panel.addEventListener('click',event=>{
        event.stopPropagation();const button=event.target.closest('button');if(!button)return;
        if(button.dataset.panel){showPanel(button.dataset.panel);return;}
        if(button.dataset.action==='hud'){checkHudLayout();return;}
        if(button.dataset.action==='combat-audit'){recordCombat();return;}
        const actions={start,floor:enter,close:closePanels,branch:applyBranch,cast,death:()=>{if(!gameActive)start();player.hp=0;checkPlayerDeath();panel.open=false;},hurt:()=>{if(!gameActive)start();triggerHeroAction('hurt',2);panel.open=false;},gallery:showGallery,layout:checkLayout,
            hero:()=>previewSprites('hero',false),heroes:()=>previewSprites('hero',true),monster:()=>previewSprites('monster',false),monsters:()=>previewSprites('monster',true),scene:showScene,coverage:showCoverage,items:showItems};
        actions[button.dataset.action]();
    });
    function report() {
        const diagnostic=window.qaDiagnostics;
        document.getElementById('qa-errors').textContent=`运行错误 ${diagnostic.errorCount} / 未处理Promise ${diagnostic.rejectionCount}\n`+diagnostic.errors.map(item=>`${item.kind}: ${item.message}`).join('\n');
        peakProjectiles=Math.max(peakProjectiles,projectiles.length);peakAreas=Math.max(peakAreas,SkillBranchSystem.areas.length);
        const snapshot={
            simulatedTouch:diagnostic.simulatedTouch,mobilePath:isMobileDevice,gameActive,level:player.lvl,floor:player.floor,
            autoBattle:AutoBattle.enabled,activeSkill:player.activeSkill,skillTree:player.skillTree,
            projectiles:projectiles.length,branchAreas:SkillBranchSystem.areas.length,branchVolleys:SkillBranchSystem.volleys.length,
            peakProjectiles,peakAreas,chargeSeconds:SkillBranchSystem.charge?.time,arcShield:SkillBranchSystem.arcShield,
            target:practiceTarget ? {name:practiceTarget.name,hp:practiceTarget.hp,maxHp:practiceTarget.maxHp,damageSinceCast:lastCast.hpBefore-practiceTarget.hp}:null,
            lastCast,shield:player.shield,layoutReport,artReport,
            artLoaded:Object.keys(ArtSamples.definitions).filter(key=>ArtSamples.frame(key,0,0)),
            environmentLoaded:Object.keys(EnvironmentArt.definitions).filter(key=>EnvironmentArt.frame(key,0,0)),
            heroCache:HeroTintCache.getStats(),monsterCache:MonsterTintCache.getStats()
        };
        document.getElementById('qa-snapshot').textContent=JSON.stringify(snapshot,null,2);
    }
    setInterval(report,200);report();
})();
