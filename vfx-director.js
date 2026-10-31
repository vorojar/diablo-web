// 仅编排表现：离线双层图集、有限事件与局部环境，不写伤害/控制/掉落状态。
const VfxDirector=(()=>{
    const manifest=window.VFX_GENERATED_MANIFEST,events=[],pool=[];
    let high=true,initialized=false,body=null,light=null,bodyReady=false,lightReady=false,bodyFailed=false,lightFailed=false,clock=0,sequence=0,emitted=0;
    const MAX_EVENTS=32,MAX_BODY_BYTES=manifest.width*manifest.height*4;
    function load(layer){
        if(layer==='body'&&(body||bodyFailed)||layer==='light'&&(light||lightFailed))return;
        const image=new Image();
        if(layer==='body')body=image;else light=image;
        image.onload=()=>{if(layer==='body'&&body===image)bodyReady=true;if(layer==='light'&&light===image)lightReady=true;};
        image.onerror=()=>{if((layer==='body'?body:light)!==image)return;if(layer==='body'){bodyFailed=true;bodyReady=false;}else{lightFailed=true;lightReady=false;}console.error('生成特效图集加载失败：'+layer);};
        image.src=manifest[layer]+'?v='+manifest.recipeSHA256.slice(0,12);
    }
    function setQuality(value){
        if(initialized&&value===high)return;initialized=true;
        high=value;load('body');
        const limit=high?MAX_EVENTS:12;while(events.length>limit){const i=events.findIndex(e=>!e.critical);pool.push(events.splice(i<0?0:i,1)[0]);}
        if(high)load('light');else{light=null;lightReady=false;}
    }
    function visible(x,y,camera,width,height,padding=120){return x>=camera.x-padding&&y>=camera.y-padding&&x<=camera.x+width+padding&&y<=camera.y+height+padding;}
    function frame(ctx,id,x,y,age,scale=1,alpha=1,angle=0){
        const e=manifest.effects[id];if(!e)throw new RangeError('未知生成特效：'+id);
        if(!bodyReady)return false;
        const q=e.loop?((age%e.duration+e.duration)%e.duration)/e.duration:Math.min(1,Math.max(0,age/e.duration));
        const index=Math.min(e.frameCount-1,Math.floor(q*(e.loop?e.frameCount:e.frameCount-1))),size=48*scale;
        ctx.save();ctx.translate(x,y);if(angle)ctx.rotate(angle);ctx.globalAlpha*=alpha;ctx.globalCompositeOperation='source-over';
        ctx.drawImage(body,index*48,e.row*48,48,48,-24*scale,-38*scale,size,size);
        if(high&&lightReady){ctx.globalCompositeOperation='lighter';ctx.drawImage(light,index*48,e.row*48,48,48,-24*scale,-38*scale,size,size);}
        ctx.restore();return true;
    }
    function emit(id,x,y,scale=1,critical=false,angle=0,duration){
        if(!Number.isFinite(x)||!Number.isFinite(y)||!manifest.effects[id])return;
        for(const e of events)if(e.id===id&&e.age<.1&&(e.x-x)*(e.x-x)+(e.y-y)*(e.y-y)<900){e.scale=Math.min(2,Math.max(e.scale,scale));return;}
        const limit=high?MAX_EVENTS:12;
        if(events.length>=limit){const index=events.findIndex(e=>!e.critical);if(index<0&&!critical)return;pool.push(events.splice(index<0?0:index,1)[0]);}
        const e=pool.pop()||{};e.id=id;e.x=x;e.y=y;e.age=0;e.duration=duration??manifest.effects[id].duration;
        e.scale=Math.max(.5,Math.min(2,scale));e.critical=critical;e.angle=angle;e.seed=++sequence;events.push(e);emitted++;
    }
    function update(dt){
        clock+=dt;
        for(let i=events.length-1;i>=0;i--){events[i].age+=dt;if(events[i].age>=events[i].duration)pool.push(events.splice(i,1)[0]);}
    }
    function cast(type,x,y,angle=0){emit(type==='fireball'?'fireCharge':type==='thunder'?'shockCharge':'earthCharge',x,y,.85,false,angle,.2);}
    function impact(type,x,y,power=1){if(type==='fireball')emit('fireBloom',x,y,Math.min(1.6,power),false);else if(type==='thunder')emit('shockFade',x,y,Math.min(1.4,power),false);}
    function elementOf(damage){
        if(typeof damage==='string')return damage;
        if(!damage||typeof damage!=='object')return 'physical';
        let element='physical',amount=damage.physical||0;
        for(const kind of ['fire','cold','lightning','poison'])if((damage[kind]||0)>amount){element=kind;amount=damage[kind];}
        return element;
    }
    function death(enemy,damage,state){
        const kind=enemy.frozenTimer>0?'cold':elementOf(damage);
        const id=kind==='cold'?'frostBreak':kind==='fire'?'ashDeath':kind==='lightning'?'shockFade':kind==='poison'?'poisonFade':
            damage==null&&state?.burn?'ashDeath':damage==null&&enemy.poisonTimer>0?'poisonFade':null;
        if(id)emit(id,enemy.x,enemy.y,enemy.isBoss?1.8:1.15,true);
    }
    function release(boss,skill){const kind=skill==='fireNova'||skill==='breathAttack'?'fire':elementOf(boss.elementalDmg),id=kind==='fire'?'fireBloom':kind==='cold'?'frostBreak':kind==='lightning'?'shockFade':'ashDeath';emit(id,boss.x,boss.y,1.5,false);}
    function collect(item,markers){
        if(!(item.rarity>=RARITY.RARE))return;
        emit('lootCollect',item.x,item.y,1,true);
        for(const p of markers)if(p.type==='drop_beam'&&p.lootKind&&Math.hypot(p.x-item.x,p.y-item.y)<64)p.life=Math.min(p.life,.12);
    }
    function drawLoot(ctx,p){
        if(!p.lootKind)return false;
        const age=p.maxLife-p.life,alpha=Math.min(1,age/.12,p.life/.25),id=p.lootKind==='set'?'lootSet':p.lootKind==='rare'?'lootRare':'lootGold';
        if(frame(ctx,id,p.x,p.y,clock,p.lootKind==='rare'?1:1.5,alpha))return true;
        // 图集尚未到齐时也保留关键掉落轮廓，低画质不依赖发光层。
        ctx.save();ctx.globalAlpha*=alpha;ctx.strokeStyle=p.color;ctx.lineWidth=1.5;ctx.beginPath();
        if(p.lootKind==='set')ctx.ellipse(p.x,p.y,19,7,0,0,Math.PI*2);
        else{ctx.moveTo(p.x,p.y);ctx.lineTo(p.x,p.y-(p.lootKind==='rare'?34:65));}
        ctx.stroke();ctx.restore();return true;
    }
    function drawEvents(ctx,camera,width,height){
        for(const e of events){
            if(!visible(e.x,e.y,camera,width,height))continue;
            if(!e.critical&&!CombatVisuals.allowDecoration(e.x,e.y))continue;
            if(typeof HeroVfx !== 'undefined'&&HeroVfx.drawDirector(ctx,e))continue;
            const def=manifest.effects[e.id],alpha=def.loop?Math.min(1,(e.duration-e.age)/.08):1;
            frame(ctx,e.id,e.x,e.y,e.age,e.scale,alpha,e.angle);
        }
    }
    function drawBosses(ctx,list,camera,width,height){
        let count=0;
        for(const e of list){
            if(!e.isBoss||e.dead||!e.pendingSkill||!visible(e.x,e.y,camera,width,height)||count++>=4)continue;
            const p=e.pendingSkill,progress=Math.max(0,Math.min(1,1-p.timer/p.duration));
            const kind=elementOf(e.elementalDmg),id=p.id==='fireNova'||p.id==='breathAttack'?'fireCharge':kind==='cold'?'iceCharge':kind==='lightning'?'shockCharge':'earthCharge';
            const angle=p.data?.angle??0;
            frame(ctx,id,e.x+Math.cos(angle)*22,e.y-8,progress,.7+progress*.5,.3+progress*.6);
        }
    }
    function ambient(ctx,camera,width,height,floor,hell,px,py,isWall,props){
        if(CombatVisuals.isBusy())return;
        let count=0;const limit=high?12:4,cell=180,startX=Math.floor(camera.x/cell),startY=Math.floor(camera.y/cell);
        const id=hell||floor>20?'embers':floor>10?'snow':'leaves';
        if(floor>0||hell)for(let row=startY;row<=(camera.y+height)/cell&&count<limit;row++)for(let col=startX;col<=(camera.x+width)/cell&&count<limit;col++){
            const seed=(Math.imul(row,1973)^Math.imul(col,9277)^Math.imul(floor,26699))>>>0;
            if(VfxRecipes.random(seed,0)>.3)continue;
            const x=(col+.2+VfxRecipes.random(seed,1)*.6)*cell,y=(row+.2+VfxRecipes.random(seed,2)*.6)*cell;
            if((x-px)*(x-px)+(y-py)*(y-py)<14400||isWall(x,y)||!CombatVisuals.allowDecoration(x,y))continue;
            frame(ctx,id,x,y,clock+VfxRecipes.random(seed,3)*3,1.5,.65);count++;
        }
        if(floor===0&&!hell){
            let wells=0;
            for(const prop of props){if(wells>=2)break;if(prop.name!=='camp_well'||!visible(prop.x,prop.y,camera,width,height,30))continue;
                if(CombatVisuals.allowDecoration(prop.x,prop.y)){frame(ctx,'ripple',prop.x,prop.y-20,clock,.7,.7);wells++;}}
        }
    }
    function clear(){while(events.length)pool.push(events.pop());clock=0;sequence=0;}
    function getStats(){return {active:events.length,pooled:pool.length,emitted,high,bodyReady,lightReady,assetError:bodyFailed||lightFailed,atlasBytes:(bodyReady?MAX_BODY_BYTES:0)+(lightReady?MAX_BODY_BYTES:0),maxAtlasBytes:MAX_BODY_BYTES*2,maxEvents:MAX_EVENTS};}
    return {setQuality,emit,update,cast,impact,elementOf,death,release,collect,drawLoot,drawEvents,drawBosses,ambient,clear,getStats};
})();
