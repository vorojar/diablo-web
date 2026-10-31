// 主角特效只读编排：原始 PixelFX 双层图集、已有弹体/挥击和有限反馈事件。
const HeroVfx=(()=>{
    // 主角清单开始（离线生成，随脚本一起交付）
    const m={"sourceSHA256":"d4d5f3d5d1ee6f067f1e64b69aa4fcf14790af36c4397a1e4f57bff43f68502c","width":768,"height":1024,"cell":64,"frames":12,"body":"art/hero-vfx/body.webp","light":"art/hero-vfx/light.webp","effects":{"fireball":{"row":0,"pivotX":51.41176470588235,"pivotY":32,"radius":2.2058823529411766,"loop":true,"duration":1.2},"fireImpact":{"row":1,"pivotX":32,"pivotY":50,"radius":9,"loop":false,"duration":0.55},"fireCast":{"row":2,"pivotX":32,"pivotY":31.31818181818182,"radius":20.454545454545453,"loop":true,"duration":1.6},"arrow":{"row":3,"pivotX":51.285714285714285,"pivotY":32,"radius":9.642857142857142,"loop":true,"duration":0.6},"arrowHit":{"row":4,"pivotX":21.41176470588235,"pivotY":33.76470588235294,"radius":13.235294117647058,"loop":false,"duration":0.25},"arrowCast":{"row":5,"pivotX":32,"pivotY":31.31818181818182,"radius":20.454545454545453,"loop":true,"duration":1.6},"slash":{"row":6,"pivotX":24.058823529411764,"pivotY":38.17647058823529,"radius":18.52941176470588,"loop":false,"duration":0.18},"heavySlash":{"row":7,"pivotX":22.480769230769234,"pivotY":36.61538461538461,"radius":10.673076923076922,"loop":false,"duration":0.32},"shieldCast":{"row":8,"pivotX":32,"pivotY":49.72727272727273,"radius":19.77272727272727,"loop":true,"duration":2.4},"shieldHit":{"row":9,"pivotX":19.432432432432435,"pivotY":37.67567567567568,"radius":12.162162162162163,"loop":false,"duration":0.28},"shieldBreak":{"row":10,"pivotX":32,"pivotY":38.05769230769231,"radius":8.653846153846153,"loop":false,"duration":0.5},"groundFire":{"row":11,"pivotX":32,"pivotY":39.5,"radius":24.642857142857142,"loop":false,"duration":0.5},"meteorImpact":{"row":12,"pivotX":35.088235294117645,"pivotY":52.294117647058826,"radius":15.441176470588236,"loop":false,"duration":0.8},"critHit":{"row":13,"pivotX":25.333333333333336,"pivotY":35.33333333333333,"radius":8.333333333333334,"loop":false,"duration":0.27},"thunderCast":{"row":14,"pivotX":32,"pivotY":32,"radius":20.454545454545453,"loop":false,"duration":0.2},"iceBurst":{"row":15,"pivotX":20.214285714285715,"pivotY":38.42857142857143,"radius":8.035714285714285,"loop":false,"duration":0.75}}};
    // 主角清单结束
    const events=[],pool=[],coverage={projectiles:0,casts:0,impacts:0,slashes:0,shield:0,areas:0,states:0};
    const map={fireballImpact:'fireImpact',multishotImpact:'arrowHit',fireballCastSource:'fireCast',thunderCastSource:'thunderCast',multishotCastSource:'arrowCast',shieldPulseStatus:'shieldHit'};
    let high=true,initialized=false,body=null,light=null,bodyReady=false,lightReady=false,bodyFailed=false,lightFailed=false,clock=0;
    function load(layer){
        if(layer==='body'?(body||bodyFailed):(light||lightFailed))return;
        const image=new Image();if(layer==='body')body=image;else light=image;
        image.onload=()=>{if(layer==='body'&&body===image)bodyReady=true;if(layer==='light'&&light===image)lightReady=true;};
        image.onerror=()=>{if((layer==='body'?body:light)!==image)return;if(layer==='body')bodyFailed=true;else lightFailed=true;console.error('主角特效图集加载失败：'+layer);};
        image.src=m[layer]+'?v='+m.sourceSHA256.slice(0,12);
    }
    function setQuality(value){
        if(initialized&&value===high)return;initialized=true;high=value;load('body');if(high)load('light');else{light=null;lightReady=false;}
        const max=high?24:12;while(events.length>max){const i=events.findIndex(e=>!e.critical);pool.push(events.splice(i<0?0:i,1)[0]);}
    }
    function visible(x,y,camera,width,height,padding=150){return x>=camera.x-padding&&x<=camera.x+width+padding&&y>=camera.y-padding&&y<=camera.y+height+padding;}
    function frame(ctx,id,x,y,q,scale=1,angle=0,alpha=1){
        if(!bodyReady)return false;const e=m.effects[id];if(!e)throw new RangeError('未知主角特效：'+id);
        const t=e.loop?((q%1)+1)%1:Math.max(0,Math.min(1,q)),i=Math.min(m.frames-1,Math.floor(t*m.frames));
        ctx.save();ctx.translate(x,y);if(angle)ctx.rotate(angle);ctx.globalAlpha*=alpha;ctx.imageSmoothingEnabled=false;ctx.shadowBlur=0;ctx.globalCompositeOperation='source-over';
        ctx.drawImage(body,i*64,e.row*64,64,64,-e.pivotX*scale,-e.pivotY*scale,64*scale,64*scale);
        if(high&&lightReady&&(typeof CombatVisuals==='undefined'||CombatVisuals.allowDecoration(x,y))){ctx.globalCompositeOperation='lighter';ctx.drawImage(light,i*64,e.row*64,64,64,-e.pivotX*scale,-e.pivotY*scale,64*scale,64*scale);}
        ctx.restore();return true;
    }
    function emit(id,x,y,scale=1,angle=0,critical=true,duration){
        if(!Number.isFinite(x)||!Number.isFinite(y))return;
        for(const e of events)if(id!=='arcLink'&&e.id===id&&e.age<.07&&(e.x-x)**2+(e.y-y)**2<576){e.scale=Math.max(e.scale,scale);return e;}
        const max=high?24:12;if(events.length>=max){const i=events.findIndex(e=>!e.critical);if(i<0&&!critical)return;pool.push(events.splice(i<0?0:i,1)[0]);}
        const e=pool.pop()||{};e.id=id;e.x=x;e.y=y;e.scale=Math.max(.35,Math.min(7,scale));e.angle=angle;e.critical=critical;e.age=0;e.duration=duration??m.effects[id].duration;e.rainRadius=0;e.points=null;e.clipRadius=(id==='meteorImpact'||id==='groundFire')?scale*m.effects[id].radius:0;e.maxLife=e.duration;e.life=e.duration;events.push(e);return e;
    }
    function update(dt){clock+=dt;for(let i=events.length-1;i>=0;i--){events[i].age+=dt;events[i].life=events[i].duration-events[i].age;if(events[i].age>=events[i].duration){events[i].points=null;pool.push(events.splice(i,1)[0]);}}}
    function drawVfx(ctx,fx,config){
        const id=map[fx.effectId];if(!id||!bodyReady)return false;
        if(id==='shieldHit'&&events.some(e=>e.id.startsWith('shield')&&e.age<.07&&Math.abs(e.x-fx.x)<40&&Math.abs(e.y-fx.y)<40))return true;
        const q=fx.age/fx.duration,cast=id.endsWith('Cast'),alpha=cast?Math.min(1,(1-q)*5):1;
        if(cast&&events.some(e=>e.id===id&&e.age<.07&&Math.abs(e.x-fx.x)<30&&Math.abs(e.y-fx.y)<30))return true;
        if(id==='fireImpact'&&events.some(e=>e.id==='meteorImpact'&&Math.abs(e.x-fx.x)<30&&Math.abs(e.y-fx.y)<30))return true;
        coverage[cast?'casts':id==='shieldHit'?'shield':'impacts']++;
        return frame(ctx,id,fx.x,fx.y,q,(config.renderSize||64)/64*(fx.scale||1),cast||id==='fireImpact'?0:fx.rotation||0,alpha);
    }
    function projectile(ctx,p,isHero){
        if(!isHero||!bodyReady||!['fireball','multishot'].includes(p.type))return false;
        if(p.meteorTarget&&high)return false;
        const id=p.type==='fireball'?'fireball':'arrow';coverage.projectiles++;
        return frame(ctx,id,p.x,p.y,(p.age||0)/m.effects[id].duration,p.meteorTarget?2.5:id==='fireball'?2:p.branch?.snipeMode?1.45:1.1,p.angle||0);
    }
    function slash(ctx,s,depthOverlay=false){
        if(!bodyReady||(!s.strike&&!s.isSweep&&!s.depthSweep))return false;
        if(s.isSweep&&(s.heroLead===false||s.growthStyle))return true;
        const id=s.strike?'slash':'heavySlash',radius=s.heroRange||s.radius,q=1-s.life;coverage.slashes++;
        if(depthOverlay)return frame(ctx,id,s.x+Math.cos(s.angle)*radius*.65,s.y+Math.sin(s.angle)*radius*.6-8,q,.7,s.angle,.65);
        return frame(ctx,id,s.x,s.y-10,q,Math.min(5,radius/m.effects[id].radius),s.angle,s.alphaScale||1);
    }
    function impact(type,x,y,angle=0,power=1){if(type==='multishot')emit('arrowHit',x,y,Math.min(1.5,power),angle,true,.25);}
    function hit(e,damage,isCrit){if(isCrit)emit('critHit',e.x,e.y-8,.9,Math.atan2(e.hitReactY||0,e.hitReactX||1),true,.27);}
    function shield(ctx,x,y,state,front){
        if(!bodyReady||!state.active||!(state.value>0))return false;
        if(!front)return !high;
        const health=Math.max(0,Math.min(1,state.value/state.maxValue));coverage.shield++;
        frame(ctx,'shieldCast',x,y-8,clock/m.effects.shieldCast.duration,1.9,0,high?.13:.45+health*.35);
        return !high;
    }
    function shieldCast(x,y){emit('shieldCast',x,y,1.5,0,true,.4);}
    function shieldEnd(x,y){emit('shieldBreak',x,y-18,1.25,0,true,.5);}
    function shieldHit(x,y,angle=0){emit('shieldHit',x,y-8,1,angle,true,.28);}
    function meteorImpact(x,y,radius){emit('meteorImpact',x,y,radius/m.effects.meteorImpact.radius,0,true,.8);}
    function volley(x,y,angle){emit('arrowCast',x+Math.cos(angle)*14,y-14,.8,0,true,.16);}
    function arrowRain(x,y,radius){const e=emit('arrow',x,y,1,Math.PI/2,true,.32);if(e)e.rainRadius=radius;}
    function retributionHit(hero,enemy){const e=emit('arcLink',enemy.x,enemy.y,1,0,true,.3);if(e)e.points=[{x:hero.x,y:hero.y-18},{x:enemy.x,y:enemy.y-12}];}
    function nova(x,y,radius){emit('groundFire',x,y,radius/m.effects.groundFire.radius,0,true,.35);}
    function drawEvents(ctx,camera,width,height){
        for(const e of events){
            if(!visible(e.x,e.y,camera,width,height,200))continue;if(!e.critical&&!CombatVisuals.allowDecoration(e.x,e.y))continue;
            coverage[e.id.startsWith('shield')?'shield':'impacts']++;
            if(e.id==='arcLink'){if(typeof LightningVfx!=='undefined')LightningVfx.drawLink(ctx,e);continue;}
            if(e.rainRadius>0){
                const count=high?12:6;
                for(let i=0;i<count;i++){const angle=i*2.399,dist=e.rainRadius*.82*Math.sqrt((i+.5)/count),x=e.x+Math.cos(angle)*dist,y=e.y+Math.sin(angle)*dist;
                    frame(ctx,'arrow',x,y-(1-e.age/e.duration)*6,e.age/.6,.95,Math.PI/2,1-e.age/e.duration);}
                continue;
            }
            ctx.save();if(e.clipRadius>0){ctx.beginPath();ctx.arc(e.x,e.y,e.clipRadius,0,Math.PI*2);ctx.clip();}
            frame(ctx,e.id,e.x,e.y,e.age/e.duration,e.scale,e.angle,e.id.endsWith('Cast')?Math.max(0,Math.min(1,(1-e.age/e.duration)*4)):1);ctx.restore();
        }
    }
    function drawDirector(ctx,e){if(bodyReady&&(e.id==='fireCharge'||e.id==='shockCharge'))return true;return e.id==='frostBreak'&&frame(ctx,'iceBurst',e.x,e.y,e.age/e.duration,e.scale*1.4,e.angle);}
    function drawAreas(ctx,areas,camera,width,height){
        if(!bodyReady)return;let count=0;
        for(const a of areas){if(count>=(high?6:2))break;if(a.element!=='fire'||!visible(a.x,a.y,camera,width,height,a.radius)||!CombatVisuals.allowDecoration(a.x,a.y))continue;
            ctx.save();ctx.beginPath();ctx.arc(a.x,a.y,a.radius,0,Math.PI*2);ctx.clip();frame(ctx,'groundFire',a.x,a.y,a.tick/a.interval,a.radius/m.effects.groundFire.radius,0,.65);ctx.restore();count++;coverage.areas++;}
    }
    function drawStates(ctx,states,hero,charge,arcShield,camera,width,height){
        if(!bodyReady)return;let count=0;
        for(const [enemy,state]of states){if(count>=(high?8:3))break;if(!state.burn||enemy.dead||!visible(enemy.x,enemy.y,camera,width,height)||!CombatVisuals.allowDecoration(enemy.x,enemy.y))continue;
            frame(ctx,'fireCast',enemy.x,enemy.y-16,clock/.7,.6,0,.7);count++;coverage.states++;}
        if(charge){const a=charge.angle,q=Math.min(1,charge.time/charge.bonus.chargeMaxTime);frame(ctx,'arrowCast',hero.x+Math.cos(a)*16,hero.y-16,clock/.6,.7+q*.6,0,.65+q*.35);coverage.casts++;}
        if(arcShield>0&&!hero.shield?.active){frame(ctx,'shieldCast',hero.x,hero.y,clock/m.effects.shieldCast.duration,1.1,0,.35);coverage.shield++;}
        if(hero.shield?.invincibleTimer>0&&!hero.shield.active){frame(ctx,'shieldCast',hero.x,hero.y,clock/1.5,1.4,0,.45);coverage.shield++;}
    }
    function clear(){while(events.length){const e=events.pop();e.points=null;pool.push(e);}clock=0;}
    function getStats(){return {active:events.length,pooled:pool.length,high,bodyReady,lightReady,assetError:bodyFailed||lightFailed,atlasBytes:m.width*m.height*4*((bodyReady?1:0)+(lightReady?1:0)),maxAtlasBytes:m.width*m.height*8,effects:Object.keys(m.effects).length,coverage:{...coverage}};}
    return {setQuality,update,clear,drawVfx,projectile,slash,impact,hit,shield,shieldCast,shieldEnd,shieldHit,meteorImpact,volley,arrowRain,retributionHit,nova,drawEvents,drawDirector,drawAreas,drawStates,isReady:()=>bodyReady,getStats};
})();
