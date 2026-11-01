// 原版 PixelFX 精修：只读状态、原始前后层、独立大招采样与有限奖励事件。
const PixelFxPolish=(()=>{
    // 精修清单开始（随脚本交付）
    const m={"sourceSHA256":"c3c25dfa03ed50a9ad99f0c6b5a5e357f8f48e574bfcaf66fa0bff9acee95bf6","common":{"width":384,"height":1440,"body":"art/pixelfx-polish/common-body.webp","light":"art/pixelfx-polish/common-light.webp","effects":{"poisoned":{"x":0,"y":0,"w":48,"h":48,"frames":8,"pivotX":24,"pivotY":37.44444444444444,"radius":18.333333333333336,"loop":true,"duration":1.6},"cursed":{"x":0,"y":96,"w":48,"h":48,"frames":8,"pivotX":24,"pivotY":41.80952380952381,"radius":15.714285714285715,"loop":true,"duration":2.4},"electrified":{"x":0,"y":192,"w":48,"h":48,"frames":8,"pivotX":24,"pivotY":36.22222222222222,"radius":12.222222222222221,"loop":true,"duration":2},"boneSlash":{"x":0,"y":288,"w":48,"h":48,"frames":8,"pivotX":11.428571428571429,"pivotY":24.448979591836732,"radius":6.73469387755102,"loop":false,"duration":0.22},"blunt":{"x":0,"y":384,"w":48,"h":48,"frames":8,"pivotX":24,"pivotY":26.0625,"radius":10.3125,"loop":false,"duration":0.26},"heal":{"x":0,"y":480,"w":48,"h":48,"frames":8,"pivotX":24,"pivotY":40.92307692307692,"radius":12.692307692307692,"loop":false,"duration":0.65},"blessing":{"x":0,"y":576,"w":48,"h":48,"frames":8,"pivotX":24,"pivotY":39.125,"radius":10.3125,"loop":true,"duration":3},"resurrection":{"x":0,"y":672,"w":48,"h":48,"frames":8,"pivotX":24,"pivotY":37.75,"radius":6.875,"loop":false,"duration":1.1},"shield":{"x":0,"y":768,"w":48,"h":48,"frames":8,"pivotX":24,"pivotY":37,"radius":14.5,"loop":true,"duration":2.4},"cleanse":{"x":0,"y":864,"w":48,"h":48,"frames":8,"pivotX":24,"pivotY":18.5,"radius":8.25,"loop":false,"duration":0.32},"level":{"x":0,"y":960,"w":48,"h":48,"frames":8,"pivotX":24,"pivotY":35.25,"radius":7.5,"loop":false,"duration":1.1},"achievement":{"x":0,"y":1056,"w":48,"h":48,"frames":8,"pivotX":24,"pivotY":24,"radius":6,"loop":false,"duration":1.2},"quest":{"x":0,"y":1152,"w":48,"h":48,"frames":8,"pivotX":24,"pivotY":24,"radius":6.470588235294118,"loop":false,"duration":1.2},"chest":{"x":0,"y":1248,"w":48,"h":48,"frames":8,"pivotX":24,"pivotY":39.714285714285715,"radius":11.785714285714285,"loop":false,"duration":0.55},"enemyNova":{"x":0,"y":1344,"w":48,"h":48,"frames":8,"pivotX":24,"pivotY":29.5,"radius":18.07142857142857,"loop":false,"duration":0.65}}},"detail":{"width":1344,"height":576,"body":"art/pixelfx-polish/detail-body.webp","light":"art/pixelfx-polish/detail-light.webp","effects":{"heroNova":{"x":0,"y":0,"w":112,"h":72,"frames":12,"pivotX":56,"pivotY":49.5,"radius":44.35714285714286,"loop":false,"duration":3.9},"enemyNova":{"x":0,"y":144,"w":112,"h":72,"frames":12,"pivotX":56,"pivotY":49.5,"radius":44.35714285714286,"loop":false,"duration":3.9},"slam":{"x":0,"y":288,"w":112,"h":72,"frames":12,"pivotX":56,"pivotY":55.61538461538461,"radius":34,"loop":false,"duration":3.2},"meteor":{"x":0,"y":432,"w":112,"h":72,"frames":12,"pivotX":60.10344827586207,"pivotY":62.9655172413793,"radius":20.51724137931034,"loop":false,"duration":5}}}};
    // 精修清单结束
    const common={body:null,light:null,bodyReady:false,lightReady:false,bodyFailed:false,lightFailed:false};
    const detail={body:null,light:null,bodyReady:false,lightReady:false,bodyFailed:false,lightFailed:false};
    const events=[],pool=[],coverage={back:0,front:0,large:0,status:0,cleanses:0,heals:0,rewards:0,melee:0,shield:0};
    let high=true,initialized=false,clock=0,states=new WeakMap(),stateCount=0,heroHealCooldown=0,actorBudget=0;
    function load(bank,name,kind){
        if(bank[kind]||bank[kind+'Failed'])return;const image=new Image();bank[kind]=image;
        image.onload=()=>{if(bank[kind]===image)bank[kind+'Ready']=true;};
        image.onerror=()=>{if(bank[kind]!==image)return;bank[kind+'Failed']=true;console.error('PixelFX精修图集加载失败：'+name+'/'+kind);};
        image.src=m[name][kind]+'?v='+m.sourceSHA256.slice(0,12);
    }
    function recycle(i){const e=events.splice(i,1)[0];e.actor=null;pool.push(e);}
    function setQuality(value){
        if(initialized&&value===high)return;initialized=true;high=value;load(common,'common','body');
        if(high){load(common,'common','light');}
        else{common.light=null;common.lightReady=false;detail.body=detail.light=null;detail.bodyReady=detail.lightReady=false;}
        while(events.length>(high?12:6)){let i=events.findIndex(e=>e.priority<2);recycle(i<0?0:i);}
    }
    function warmLarge(){if(high){load(detail,'detail','body');load(detail,'detail','light');}}
    function visible(x,y,camera,width,height,padding=160){return x>=camera.x-padding&&x<=camera.x+width+padding&&y>=camera.y-padding&&y<=camera.y+height+padding;}
    function frame(ctx,name,id,x,y,q,scale=1,angle=0,alpha=1,pass=1){
        const bank=name==='common'?common:detail;if(!bank.bodyReady)return false;const e=m[name].effects[id];if(!e)throw new RangeError('未知PixelFX精修素材：'+id);
        const t=e.loop?((q%1)+1)%1:Math.max(0,Math.min(1,q)),f=Math.min(e.frames-1,Math.floor(t*e.frames));
        ctx.save();ctx.translate(x,y);if(angle)ctx.rotate(angle);ctx.globalAlpha*=alpha;ctx.shadowBlur=0;ctx.imageSmoothingEnabled=false;ctx.globalCompositeOperation='source-over';
        ctx.drawImage(bank.body,f*e.w,e.y+pass*e.h,e.w,e.h,-e.pivotX*scale,-e.pivotY*scale,e.w*scale,e.h*scale);
        if(high&&bank.lightReady&&CombatVisuals.allowDecoration(x,y)){ctx.globalCompositeOperation='lighter';ctx.drawImage(bank.light,f*e.w,e.y+pass*e.h,e.w,e.h,-e.pivotX*scale,-e.pivotY*scale,e.w*scale,e.h*scale);}
        ctx.restore();coverage[pass?'front':'back']++;return true;
    }
    function emit(id,x,y,duration,scale=1,angle=0,priority=0,actor=null){
        if(!Number.isFinite(x)||!Number.isFinite(y))return false;
        for(const e of events)if(e.id===id&&e.age<.12&&(e.x-x)**2+(e.y-y)**2<400)return true;
        const max=high?12:6;if(events.length>=max){let index=-1;for(let i=0;i<events.length;i++)if(events[i].priority<priority&&(index<0||events[i].priority<events[index].priority))index=i;if(index<0)return false;recycle(index);}
        const e=pool.pop()||{};e.id=id;e.x=x;e.y=y;e.age=0;e.duration=duration;e.scale=scale;e.angle=angle;e.priority=priority;e.actor=actor;events.push(e);return true;
    }
    function update(dt){clock+=dt;heroHealCooldown=Math.max(0,heroHealCooldown-dt);for(let i=events.length-1;i>=0;i--){events[i].age+=dt;if(events[i].age>=events[i].duration)recycle(i);}}
    function heal(actor,amount){if(!(amount>0)||actor.isDead||heroHealCooldown>0)return;heroHealCooldown=.65;if(emit('heal',actor.x,actor.y,.65,1.8,0,1,actor))coverage.heals++;}
    function revive(actor){if(emit('resurrection',actor.x,actor.y,1.1,2.7,0,3,actor))coverage.heals++;}
    function reward(id,x,y){if(!m.common.effects[id])throw new RangeError('未知奖励表现：'+id);if(emit(id,x,y,m.common.effects[id].duration,id==='chest'?1.9:2.8,0,id==='level'?3:2))coverage.rewards++;}
    function melee(enemy,aim,tactic){
        if(!common.bodyReady||tactic==='heavy'||enemy.slamHit)return false;
        const type=enemy.monsterType,id=type==='skeleton'||type==='melee'?'boneSlash':type==='mummy'?'blunt':null;if(!id)return false;
        emit(id,enemy.x,enemy.y-5,.24,id==='boneSlash'?2.25:1.8,aim.angle||0,0);coverage.melee++;return true;
    }
    function drawEvents(ctx,camera,width,height,pass){
        for(const e of events){const x=e.actor?e.actor.x:e.x,y=e.actor?e.actor.y:e.y;if(!visible(x,y,camera,width,height))continue;if(e.priority<2&&!CombatVisuals.allowDecoration(x,y))continue;
            frame(ctx,'common',e.id,x,y,e.age/e.duration,e.scale,e.angle,Math.min(1,(1-e.age/e.duration)*5),pass);
            if(pass&&(e.id==='achievement'||e.id==='quest')&&common.bodyReady&&e.age/e.duration<1-1/m.common.effects[e.id].frames){ctx.save();ctx.globalAlpha*=Math.min(1,(1-e.age/e.duration)*5);ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillStyle='#fff0bf';ctx.fillText(e.id==='achievement'?'成就达成':'任务完成',x,y+4);ctx.restore();}
        }
    }
    function drawLarge(ctx,id,x,y,q,radius,pass=1){
        if(high&&!detail.bodyReady)warmLarge();
        const name=high&&detail.bodyReady&&!CombatVisuals.isBusy()?'detail':id==='enemyNova'&&common.bodyReady?'common':null;if(!name)return false;const e=m[name].effects[id];if(!e)return false;
        ctx.save();ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.clip();frame(ctx,name,id,x,y,q,radius/e.radius,0,1,pass);ctx.restore();coverage.large++;return true;
    }
    function beginFrame(){actorBudget=high?12:4;}
    function flags(actor){return (actor.poisoned&&actor.poisonTimer>0?1:0)|(actor.cursedTimer>0?2:0)|(actor.lightningOverloadTimer>0?4:0);}
    function drawActor(ctx,actor,front){
        if(!common.bodyReady||actor.dead||actor.isDead)return;
        const mask=flags(actor);let state=states.get(actor);
        if(!state&&mask===0&&!(actor.shield?.invincibleTimer>0))return;
        if(!state){state={mask,born:clock,lastSeen:clock,draw:false};states.set(actor,state);stateCount++;}
        if(!front){
            if(clock-state.lastSeen>.3){state.mask=mask;state.born=clock;}
            if((state.mask&~mask)!==0){emit('cleanse',actor.x,actor.y-15,.32,1.1,0,0);coverage.cleanses++;}
            state.mask=mask;state.lastSeen=clock;
            state.draw=mask!==0&&actorBudget>0&&CombatVisuals.allowDecoration(actor.x,actor.y);if(state.draw)actorBudget--;
        }
        if(state.draw){
            // 多状态使用各自原始符号，偏移少量位置；同时绘制数量由实体预算封顶。
            if(mask&1){frame(ctx,'common','poisoned',actor.x,actor.y,clock/1.6,1.8,0,.65,front?1:0);coverage.status++;}
            if(mask&2){frame(ctx,'common','cursed',actor.x+((mask&1)?8:0),actor.y,clock/2.4,1.8,0,.75,front?1:0);coverage.status++;}
            if(mask&4){frame(ctx,'common','electrified',actor.x,actor.y,clock/2,1.8,0,.6,front?1:0);coverage.status++;}
        }
        if(actor.shield?.invincibleTimer>0)frame(ctx,'common','blessing',actor.x,actor.y,clock/3,2.3,0,.55,front?1:0);
    }
    function shield(ctx,x,y,state,front){
        if(!common.bodyReady||!state.active||!(state.value>0))return false;
        const health=Math.max(0,Math.min(1,state.value/state.maxValue));frame(ctx,'common','shield',x,y-8,clock/2.4,2.5,0,high?.12:.35+health*.3,front?1:0);coverage.shield++;return true;
    }
    function clear(){while(events.length)recycle(events.length-1);states=new WeakMap();stateCount=0;heroHealCooldown=0;clock=0;}
    function getStats(){const c=m.common,d=m.detail;return {high,commonReady:common.bodyReady,detailReady:detail.bodyReady,lightReady:common.lightReady||detail.lightReady,assetError:common.bodyFailed||common.lightFailed||detail.bodyFailed||detail.lightFailed,active:events.length,pooled:pool.length,states:stateCount,atlasBytes:c.width*c.height*4*((common.bodyReady?1:0)+(common.lightReady?1:0))+d.width*d.height*4*((detail.bodyReady?1:0)+(detail.lightReady?1:0)),maxAtlasBytes:(c.width*c.height+d.width*d.height)*8,coverage:{...coverage}};}
    return {setQuality,warmLarge,update,clear,beginFrame,heal,revive,reward,melee,drawEvents,drawLarge,drawActor,shield,getStats,isReady:()=>common.bodyReady,hasEvent:id=>common.bodyReady&&events.some(e=>e.id===id)};
})();
