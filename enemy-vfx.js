// 敌方表现只读取结算事件和锁定瞄准；不参与伤害、控制、AI 或随机数。
const EnemyVfx=(()=>{
    // 敌方清单开始（离线生成，随脚本一起交付）
    const m={"sourceSHA256":"40327c9aa683d31edabe55b486d1f0c21e2755fdc484254a0396869269eaa561","width":768,"height":640,"cell":64,"frames":12,"body":"art/enemy-vfx/body.webp","light":"art/enemy-vfx/light.webp","effects":{"hostileArrow":{"row":0,"pivotX":51.285714285714285,"pivotY":32,"radius":9.642857142857142,"loop":true,"duration":0.6},"lightningOrb":{"row":1,"pivotX":32,"pivotY":32,"radius":13.928571428571429,"loop":true,"duration":4},"shadowOrb":{"row":2,"pivotX":32,"pivotY":32,"radius":14.285714285714286,"loop":true,"duration":3.2},"poisonCloud":{"row":3,"pivotX":32,"pivotY":40.4375,"radius":26.71875,"loop":true,"duration":4},"clawSlash":{"row":4,"pivotX":22.15625,"pivotY":37.15625,"radius":18.75,"loop":false,"duration":0.25},"heavySlam":{"row":5,"pivotX":32,"pivotY":44.5,"radius":21.666666666666668,"loop":false,"duration":0.65},"summon":{"row":6,"pivotX":32,"pivotY":50.94736842105263,"radius":10.263157894736842,"loop":true,"duration":2.4},"tentacle":{"row":7,"pivotX":32,"pivotY":43.82692307692307,"radius":10.96153846153846,"loop":true,"duration":3.2},"curse":{"row":8,"pivotX":32,"pivotY":44.58064516129032,"radius":14.516129032258064,"loop":false,"duration":0.65},"drain":{"row":9,"pivotX":13.73913043478261,"pivotY":38.52173913043478,"radius":9.782608695652174,"loop":false,"duration":0.5}}};
    // 敌方清单结束
    const events=[],pool=[],coverage={projectiles:0,releases:0,windups:0,boss:0,hits:0,status:0};
    const link={x:0,y:0,tx:0,ty:0,life:0,maxLife:.42,isMain:true,bodyOnly:false,hostile:true};
    let high=true,initialized=false,body=null,light=null,bodyReady=false,lightReady=false,bodyFailed=false,lightFailed=false,clock=0;
    function load(layer){
        if(layer==='body'?(body||bodyFailed):(light||lightFailed))return;
        const image=new Image();if(layer==='body')body=image;else light=image;
        image.onload=()=>{if((layer==='body'?body:light)!==image)return;if(layer==='body')bodyReady=true;else lightReady=true;};
        image.onerror=()=>{if((layer==='body'?body:light)!==image)return;if(layer==='body')bodyFailed=true;else lightFailed=true;console.error('敌方特效图集加载失败：'+layer);};
        image.src=m[layer]+'?v='+m.sourceSHA256.slice(0,12);
    }
    function setQuality(value){
        if(initialized&&value===high)return;initialized=true;high=value;load('body');if(high)load('light');else{light=null;lightReady=false;}
        while(events.length>(high?24:12))recycle(lowest());
    }
    function lowest(){let index=0;for(let i=1;i<events.length;i++)if(events[i].priority<events[index].priority)index=i;return index;}
    function recycle(index){pool.push(events.splice(index<0?0:index,1)[0]);}
    function visible(x,y,camera,width,height,padding=160){return x>=camera.x-padding&&x<=camera.x+width+padding&&y>=camera.y-padding&&y<=camera.y+height+padding;}
    function frame(ctx,id,x,y,q,scale=1,angle=0,alpha=1){
        if(!bodyReady)return false;const e=m.effects[id];if(!e)throw new RangeError('未知敌方特效：'+id);
        const f=Math.min(m.frames-1,Math.floor((e.loop?((q%1)+1)%1:Math.max(0,Math.min(1,q)))*m.frames)),size=m.cell*scale;
        ctx.save();ctx.translate(x,y);if(angle)ctx.rotate(angle);ctx.globalAlpha*=alpha;ctx.imageSmoothingEnabled=false;ctx.shadowBlur=0;ctx.globalCompositeOperation='source-over';
        ctx.drawImage(body,f*m.cell,e.row*m.cell,m.cell,m.cell,-e.pivotX*scale,-e.pivotY*scale,size,size);
        if(high&&lightReady&&CombatVisuals.allowDecoration(x,y)){ctx.globalCompositeOperation='lighter';ctx.drawImage(light,f*m.cell,e.row*m.cell,m.cell,m.cell,-e.pivotX*scale,-e.pivotY*scale,size,size);}
        ctx.restore();return true;
    }
    function shared(ctx,id,x,y,q,scale=1,angle=0,alpha=1){return typeof HeroVfx!=='undefined'&&HeroVfx.drawShared(ctx,id,x,y,q,scale,angle,alpha);}
    function emit(id,x,y,duration,scale=1,angle=0,critical=false,radius=0,half=0,priority=critical?2:0){
        for(const e of events)if(e.id===id&&e.priority===priority&&e.radius===radius&&e.angle===angle&&e.half===half&&e.age<.055&&(e.x-x)**2+(e.y-y)**2<144)return;
        const max=high?24:12;
        const quota=priority===3?(high?6:3):priority===2?(high?10:5):max;let own=-1,count=0;
        for(let i=0;i<events.length;i++)if(events[i].priority===priority){count++;if(own<0)own=i;}
        if(count>=quota)recycle(own);
        else if(events.length>=max){const i=lowest();if(events[i].priority>priority)return;recycle(i);}
        const e=pool.pop()||{};e.id=id;e.x=x;e.y=y;e.age=0;e.duration=duration;e.scale=scale;e.angle=angle;e.critical=critical;e.radius=radius;e.half=half;e.priority=priority;events.push(e);
    }
    function update(dt){clock+=dt;for(let i=events.length-1;i>=0;i--){events[i].age+=dt;if(events[i].age>=events[i].duration)recycle(i);}}
    function projectile(ctx,p,hostile){
        if(!hostile||!bodyReady)return false;
        const id=p.isTentacle||p.type==='tentacle'?'tentacle':p.type==='lightning_ball'?'lightningOrb':'hostileArrow';
        if(p.type&&p.type!=='tentacle'&&p.type!=='lightning_ball'&&p.type!=='scatter_shot'&&!p.isTentacle)return false;
        coverage.projectiles++;return frame(ctx,id,p.x,p.y,(p.age||0)/(id==='lightningOrb'?.6:.45),id==='tentacle'?.9:.8,(p.angle||0)+(id==='tentacle'?Math.PI/2:0));
    }
    function drawVfx(ctx,fx){
        const id=fx.effectId,q=fx.age/fx.duration,s=fx.scale||1,a=fx.rotation||0;
        if(id==='enemyArrowMuzzle')return frame(ctx,'shadowOrb',fx.x,fx.y,q,.45*s,0);
        if(id==='enemyLightningMuzzle')return frame(ctx,'lightningOrb',fx.x,fx.y,q,.6*s);
        if(id==='playerPhysicalHit')return shared(ctx,'arrowHit',fx.x,fx.y,q,1.1*s,a);
        if(id==='playerFireHit')return shared(ctx,'fireImpact',fx.x,fx.y,q,1.1*s);
        if(id==='playerColdHit')return shared(ctx,'iceBurst',fx.x,fx.y,q,1.4*s);
        if(id==='playerLightningHit')return frame(ctx,'lightningOrb',fx.x,fx.y,q,.9*s,0,Math.max(0,1-q));
        return false;
    }
    function release(enemy,aim,tactic){
        if(tactic==='revive'||tactic==='charge'||enemy.ai==='ranged'||enemy.ai==='specter')return;
        coverage.releases++;
        if(typeof PixelFxPolish!=='undefined'&&PixelFxPolish.melee(enemy,aim,tactic))return;
        if(enemy.monsterType==='ghost'){emit('tentacle',enemy.x,enemy.y-8,.24,1.4,(aim.angle||0)+Math.PI/2,false,0,0,1);return;}
        emit(tactic==='heavy'||enemy.slamHit?'heavySlam':'clawSlash',enemy.x,enemy.y-8,.25,tactic==='heavy'||enemy.slamHit?1.25:1.35,aim.angle||0,false,0,0,1);
    }
    function boss(id,x,y,radius=0,angle=0,half=0,priority=3){coverage.boss++;emit(id,x,y,id==='breath'?.42:.65,1,angle,true,radius,half,priority);}
    function summon(x,y){emit('summon',x,y,.7,1.9);coverage.status++;}
    function teleport(x,y,tx,ty){emit('shadowOrb',x,y-18,.4,1.1);emit('summon',tx,ty,.5,1.7);coverage.status++;}
    function poison(x,y,radius){emit('poisonCloud',x,y,.65,radius/m.effects.poisonCloud.radius,0,false,radius);coverage.status++;}
    function curse(x,y){emit('curse',x,y,.65,1.5,0,true);coverage.status++;}
    function drain(x,y,tx,ty){emit('drain',x,y-14,.5,Math.hypot(tx-x,ty-y)/(104*60/184),Math.atan2(ty-y,tx-x));coverage.status++;}
    function playerHit(type,x,y){coverage.hits++;emit(type==='fire'?'fireHit':type==='lightning'?'shockHit':'physicalHit',x,y-12,.25,1.2,0,true);}
    function drawEvents(ctx,camera,width,height){
        if(!bodyReady)return;
        for(const e of events){
            if(!visible(e.x,e.y,camera,width,height,Math.max(160,e.radius)))continue;
            if(!e.critical&&!CombatVisuals.allowDecoration(e.x,e.y))continue;
            const q=e.age/e.duration;ctx.save();
            if(e.radius>0){ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.arc(e.x,e.y,e.radius,e.id==='breath'?e.angle-e.half:0,e.id==='breath'?e.angle+e.half:Math.PI*2);ctx.closePath();ctx.clip();}
            if((e.id==='fireNova'||e.id==='slam')&&typeof PixelFxPolish!=='undefined'&&PixelFxPolish.drawLarge(ctx,e.id==='fireNova'?'enemyNova':'slam',e.x,e.y,q,e.radius,1)){ctx.restore();continue;}
            if(e.id==='fireNova'){if(typeof HeroVfx!=='undefined')shared(ctx,'groundFire',e.x,e.y,.25+q*.75,e.radius/HeroVfx.sharedRadius('groundFire'));}
            else if(e.id==='slam')frame(ctx,'heavySlam',e.x,e.y,q,e.radius/m.effects.heavySlam.radius);
            else if(e.id==='breath'){
                const n=high&&!CombatVisuals.isBusy()?5:3;link.x=e.x;link.y=e.y;link.life=e.duration-e.age;link.maxLife=e.duration;link.bodyOnly=!CombatVisuals.allowDecoration(e.x,e.y);
                for(let i=0;i<n;i++){const a=e.angle+e.half*((i+.5)/n*2-1);link.tx=e.x+Math.cos(a)*e.radius;link.ty=e.y+Math.sin(a)*e.radius;LightningVfx.drawLink(ctx,link);}
            }else if(e.id==='fireHit'||e.id==='physicalHit')shared(ctx,e.id==='fireHit'?'fireImpact':'arrowHit',e.x,e.y,q,e.scale);
            else if(e.id==='shockHit')frame(ctx,'lightningOrb',e.x,e.y,q,1,0,1-q);
            else frame(ctx,e.id,e.x,e.y,q,e.scale,e.angle,Math.min(1,(1-q)*4));
            ctx.restore();
        }
    }
    function drawBack(ctx,camera,width,height){
        if(typeof PixelFxPolish==='undefined')return;
        for(const e of events)if((e.id==='fireNova'||e.id==='slam')&&visible(e.x,e.y,camera,width,height,Math.max(160,e.radius)))PixelFxPolish.drawLarge(ctx,e.id==='fireNova'?'enemyNova':'slam',e.x,e.y,e.age/e.duration,e.radius,0);
    }
    function drawWindups(ctx,list,camera,width,height){
        if(!bodyReady)return;let count=0;const max=high?8:4;
        // 先 Boss 后普通怪；仅画手部聚能，原危险边界独立在最后绘制。
        for(let pass=0;pass<2;pass++)for(const e of list){
            if(count>=max)return;if(e.dead||!!e.isBoss!==(pass===0)||!visible(e.x,e.y,camera,width,height))continue;
            const p=e.pendingSkill,cue=e.combatCue;
            if(e.isDashing){
                if(CombatVisuals.allowDecoration(e.x,e.y)){const a=Math.atan2(e.dashTargetY-e.y,e.dashTargetX-e.x);frame(ctx,'shadowOrb',e.x-Math.cos(a)*14,e.y-Math.sin(a)*14-12,clock/.3,.75,0,.7);coverage.windups++;count++;}
                continue;
            }
            if(!p&&!cue)continue;
            if(!CombatVisuals.allowDecoration(e.x,e.y))continue;
            const angle=p?.data?.angle??cue?.aim?.angle??0,q=p?Math.max(0,1-p.timer/p.duration):Math.max(0,1-cue.timer/cue.duration),x=e.x+Math.cos(angle)*18,y=e.y-22;
            const id=p?.id==='breathAttack'||e.ai==='specter'?'lightningOrb':p?.id==='summonMinions'||cue?.tactic==='revive'?'summon':'shadowOrb';
            if(p?.id==='fireNova')shared(ctx,'fireCast',x,y,q,.65+q*.3,0,.5+q*.5);
            else if(p?.id==='groundSlam')frame(ctx,'heavySlam',x,y,q*.28,.6,0,.5+q*.5);
            else frame(ctx,id,x,y,clock/.7,.45+q*.3,0,.5+q*.5);
            coverage.windups++;count++;
        }
    }
    function clear(){while(events.length)recycle(events.length-1);clock=0;}
    function getStats(){return {active:events.length,pooled:pool.length,high,bodyReady,lightReady,assetError:bodyFailed||lightFailed,atlasBytes:m.width*m.height*4*((bodyReady?1:0)+(lightReady?1:0)),maxAtlasBytes:m.width*m.height*8,effects:Object.keys(m.effects).length,bossEvents:events.reduce((n,e)=>n+(e.priority===3),0),hitEvents:events.reduce((n,e)=>n+(e.priority===2),0),coverage:{...coverage}};}
    return {drawBack,setQuality,update,clear,projectile,drawVfx,release,boss,summon,teleport,poison,curse,drain,playerHit,drawEvents,drawWindups,isReady:()=>bodyReady,getStats};
})();
