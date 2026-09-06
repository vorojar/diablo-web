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
    panel.insertAdjacentHTML('beforeend','<p id="qa-environment"></p><output id="qa-errors" style="display:block;white-space:pre-wrap" aria-live="polite"></output><details><summary>实时验收摘要</summary><pre id="qa-snapshot" style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px"></pre></details>');
    document.getElementById('qa-environment').textContent=window.qaDiagnostics.simulatedTouch ? '触控路径模拟（非真机），测试 ontouchstart 标志已启用。' : '普通桌面环境；?touch=1 可模拟移动脚本路径。';
    const gallery=document.createElement('section'); gallery.id='qa-gallery';document.body.appendChild(gallery);
    const status=text=>document.getElementById('qa-status').textContent=text;
    // 只覆盖此测试页面的存档写入，保留原始页面真实本地存档行为。
    SaveSystem.save=async()=>true;
    let safe=false;
    let practiceTarget=null;
    let lastCast=null;
    let peakProjectiles=0, peakAreas=0;
    let layoutReport=null;
    function protect() {
        if (!safe) return;
        AutoBattle.enabled=false;
        player.invincibleTimer=3600;player.hp=player.maxHp;player.mp=player.maxMp;
        player.targetX=null;player.targetY=null;player.targetItem=null;
        for (const enemy of enemies) { enemy.dmg=0;enemy.speed=0; }
        closeDailyLoginPanel();
    }
    setInterval(protect, 100);
    function start() {
        if (!gameActive) { window.pendingLoadData=null;startGame(); }
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
        gallery.replaceChildren();gallery.style.display='block';
        const close=document.createElement('button');close.textContent='关闭图集';close.onclick=()=>gallery.style.display='none';gallery.appendChild(close);
        for (const [key,definition] of Object.entries(ArtSamples.definitions)) {
            const heading=document.createElement('h2');heading.textContent=`${key} · ${definition.file}`;gallery.appendChild(heading);
            const frame=ArtSamples.frame(key,0,0);
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
    panel.addEventListener('pointerdown',event=>event.stopPropagation());
    panel.addEventListener('click',event=>{
        event.stopPropagation();const button=event.target.closest('button');if(!button)return;
        if(button.dataset.panel){showPanel(button.dataset.panel);return;}
        const actions={start,floor:enter,close:closePanels,branch:applyBranch,cast,hurt:()=>{if(!gameActive)start();triggerHeroAction('hurt',2);panel.open=false;},gallery:showGallery,layout:checkLayout};
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
            lastCast,shield:player.shield,layoutReport,
            artLoaded:Object.keys(ArtSamples.definitions).filter(key=>ArtSamples.frame(key,0,0)),
            heroCache:HeroTintCache.getStats(),monsterCache:MonsterTintCache.getStats()
        };
        document.getElementById('qa-snapshot').textContent=JSON.stringify(snapshot,null,2);
    }
    setInterval(report,200);report();
})();
