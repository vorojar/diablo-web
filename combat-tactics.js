// 战斗决策反馈：共享蓄力几何、打断、破绽与敌人应对提示。
const CombatTactics = (() => {
    const rules={bossBreak:.04,bossRecovery:1.1,interruptRecovery:1.2,bonus:.25,suppress:.55,suppressCooldown:2.5};
    const names={groundSlam:'重击 · 离开红圈',fireNova:'新星 · 离开红圈',breathAttack:'吐息 · 侧向躲避',tentacleAttack:'触手 · 避开红线',summonMinions:'召唤 · 技能打断'};
    function recover(e,time,label='破绽 +25%'){
        e.combatCue=null;e.recoveryTimer=time;e.recoveryDuration=time;e.recoveryLabel=label;
        e.cooldown=Math.max(e.cooldown || 0,time);e.wasMoving=false;
        // 破绽标签已持续显示，避免再叠一条同义飘字。
    }
    function bossStarted(e,pending){
        const d=pending.data;pending.damageTaken=0;
        pending.label=names[pending.id];pending.originX=e.x;pending.originY=e.y;
        // 蓄力期间停步，提前锁定方向；普通攻击不能与大招叠加。
        e.cooldown=Math.max(e.cooldown || 0,pending.duration+.3);
    }
    function attackStarted(e,options,attack){
        if(options.tactic){attack.tactic=options.tactic;attack.duration=options.impactDelay;attack.damageTaken=0;e.combatCue=attack;}
    }
    function hit(e,damage,isSkill){
        if(e.hp<=0)return;
        const pending=e.pendingSkill || e.combatCue;
        if(pending&&isSkill){
            pending.damageTaken+=damage;
            if(!e.isBoss || pending.damageTaken>=e.maxHp*rules.bossBreak){
                pending.cancelled=true;e.pendingSkill=null;e.bossSkillVisual=null;e.isDashing=false;
                recover(e,rules.interruptRecovery,'打断 · 破绽 +25%');return;
            }
        }
        if(!e.isBoss&&!isSkill&&(e.ai==='ranged'||e.ai==='specter')&&!(e.pressureImmuneTimer>0)&&Math.hypot(e.x-player.x,e.y-player.y)<=85){
            e.pressureImmuneTimer=rules.suppressCooldown;
            for(const attack of scheduledMonsterAttacks)if(attack.enemy===e)attack.cancelled=true;
            recover(e,rules.suppress,'压制 · 破绽 +25%');
        }
    }
    function facingAngle(e){return ({front:Math.PI/2,back:-Math.PI/2,left:Math.PI,right:0,frontLeft:Math.PI*.75,frontRight:Math.PI*.25,backLeft:-Math.PI*.75,backRight:-Math.PI*.25})[e.actionDirection || e.facingDirection || 'front'];}
    function frontArmor(e){return e.monsterType==='skeleton'&&!(e.recoveryTimer>0)&&Math.cos(Math.atan2(player.y-e.y,player.x-e.x)-facingAngle(e))>.5;}
    function multiplier(e,isSkill){return (e.recoveryTimer>0?1+rules.bonus:1)*(!isSkill&&frontArmor(e)?.65:1);}
    function tick(e,dt){
        if(e.pressureImmuneTimer>0)e.pressureImmuneTimer=Math.max(0,e.pressureImmuneTimer-dt);
        if(e.recoveryTimer>0){e.recoveryTimer=Math.max(0,e.recoveryTimer-dt);e.wasMoving=false;return true;}
        return false;
    }
    function beginCharge(e){
        const x=player.x,y=player.y;e.dashCooldown=3;
        startMonsterAttack(e,{duration:.65,impactDelay:.65,tactic:'charge',targetX:x,targetY:y,resolve:attacker=>{
            attacker.isDashing=true;attacker.dashTimer=.4;attacker.dashTargetX=x;attacker.dashTargetY=y;
        }});
    }
    function charge(e,dt){
        const dx=e.dashTargetX-e.x,dy=e.dashTargetY-e.y,dist=Math.hypot(dx,dy);
        const travel=Math.min(dist,600*Math.min(dt,e.dashTimer));
        const steps=Math.max(1,Math.ceil(travel/6));let stopped=false;
        for(let i=0;i<steps&&dist>0;i++){
            const nx=e.x+dx/dist*travel/steps,ny=e.y+dy/dist*travel/steps;
            if(isWall(nx,ny)){stopped=true;break;}e.x=nx;e.y=ny;
            if(Math.hypot(player.x-e.x,player.y-e.y)<35&&hasLineOfSight(e.x,e.y,player.x,player.y)){
                resolveEnemyMeleeImpact(e,{lifeStealFallback:.2,rangeSq:2200});stopped=true;break;
            }
        }
        e.dashTimer-=dt;
        if(stopped||e.dashTimer<=0||travel>=dist){e.isDashing=false;recover(e,.8);}
    }
    function shape(ctx,e,p){
        const d=p.data,x=p.originX,y=p.originY;
        if(d.telegraph==='circle'){ctx.arc(x,y,d.radius,0,Math.PI*2);}
        else if(d.telegraph==='cone'){
            const half=(e.breathAngle || 60)*Math.PI/360;
            ctx.moveTo(x,y);ctx.arc(x,y,d.range,d.angle-half,d.angle+half);ctx.closePath();
        }else if(d.telegraph==='line'){
            for(let i=0;i<(e.tentacleCount || 4);i++){
                const a=d.angle+(i-((e.tentacleCount || 4)-1)/2)*.3;
                line(ctx,x,y,a,270,24);
            }
        }
    }
    function line(ctx,x,y,a,length,width){
        const nx=Math.cos(a),ny=Math.sin(a),px=-ny*width/2,py=nx*width/2;
        ctx.moveTo(x+px,y+py);ctx.lineTo(x+nx*length+px,y+ny*length+py);ctx.lineTo(x+nx*length-px,y+ny*length-py);ctx.lineTo(x-px,y-py);ctx.closePath();
    }
    function label(ctx,e,text,color,progress){
        ctx.font='bold 12px sans-serif';const width=ctx.measureText(text).width+14,x=e.x-width/2,y=e.y-91;
        ctx.fillStyle='rgba(10,15,20,.9)';ctx.fillRect(x,y,width,24);ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(text,e.x,y+15);
        if(progress!==undefined){ctx.fillStyle=color;ctx.fillRect(x,y+22,width*Math.max(0,Math.min(1,progress)),2);}
    }
    function draw(ctx,list,camera,width,height){
        ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.shadowBlur=0;
        for(const e of list){
            if(e.dead||e.x<camera.x-280||e.y<camera.y-280||e.x>camera.x+width+280||e.y>camera.y+height+280)continue;
            const p=e.pendingSkill || e.combatCue;
            if(p){
                const progress=1-p.timer/p.duration;ctx.beginPath();
                if(e.pendingSkill)shape(ctx,e,p);
                else if(p.tactic==='charge')line(ctx,e.x,e.y,p.aim.angle,Math.hypot(p.aim.targetX-e.x,p.aim.targetY-e.y),70);
                else {ctx.arc(e.x,e.y,p.tactic==='revive'?30:48,0,Math.PI*2);}
                ctx.fillStyle='rgba(235,50,30,.10)';ctx.fill();ctx.strokeStyle='#281511';ctx.lineWidth=6;ctx.stroke();ctx.strokeStyle='#ff815c';ctx.lineWidth=2.5;ctx.stroke();
                label(ctx,e,p.label || (p.tactic==='charge'?'突进 · 侧向躲避':p.tactic==='revive'?'复活 · 技能打断':'重击 · 拉开距离'),'#ffbe91',progress);
                if(e.pendingSkill && p.damageTaken > 0)label(ctx,{x:e.x,y:e.y-27},'打断 '+Math.min(100,Math.floor(p.damageTaken/(e.maxHp*rules.bossBreak)*100))+'%','#b1d7ff');
            }else if(e.recoveryTimer>0)label(ctx,e,'破绽 +25%','#78ebcd',e.recoveryTimer/e.recoveryDuration);
            else if(e.monsterType==='skeleton' && e === (typeof AutoBattle !== 'undefined' ? AutoBattle.currentTarget : null)){
                ctx.beginPath();ctx.arc(e.x,e.y,25,facingAngle(e)-Math.PI/3,facingAngle(e)+Math.PI/3);ctx.strokeStyle='#c5d5e1';ctx.lineWidth=3;ctx.stroke();
            }
        }ctx.restore();
    }
    return {rules,recover,bossStarted,attackStarted,hit,multiplier,frontArmor,tick,beginCharge,charge,draw};
})();
