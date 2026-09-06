// 技能树分支的战斗状态只在当前楼层有效，不写入存档或敌人对象池。
const SkillBranchSystem = {
    states: new Map(), areas: [], volleys: [], charge: null, arcShield: 0, arcShieldImmuneCC: false,
    reset() {
        this.states.clear(); this.areas.length = 0; this.volleys.length = 0;
        this.charge = null; this.arcShield = 0; this.arcShieldImmuneCC = false;
        for(const p of projectiles)if(p.branch)p.life=0;
    },
    state(e) {
        if (!this.states.has(e)) this.states.set(e, {});
        return this.states.get(e);
    },
    nearby(x, y, radius, excluded = null) {
        return enemies.filter(e => !e.dead && e !== excluded && Math.hypot(e.x-x,e.y-y) <= radius && hasLineOfSight(x,y,e.x,e.y));
    },
    amplify(e, damage) {
        const state = this.states.get(e);
        if (!state || typeof damage !== 'object') return damage;
        const result = {...damage};
        if (result.fire && state.burn) result.fire *= 1 + (state.burn.bonus.burnAmplify || 0);
        if (result.lightning && state.shock) result.lightning *= 1 + (state.shock.bonus.lightningAmp || 0);
        return result;
    },
    deal(e, amount, element, bonus = {}) {
        if (e.dead) return 0;
        const before = e.hp;
        // 箭矢延续基础多重射击的数值伤害语义，不因学习分支额外扣护甲。
        takeDamage(e, element === 'physical' ? amount : {[element]: amount}, true);
        const dealt = Math.max(0, before - Math.max(0,e.hp));
        if (element === 'lightning' && bonus.arcShield && dealt > 0) {
            this.arcShield = Math.min(player.maxHp, this.arcShield + dealt * bonus.shieldRatio);
            this.arcShieldImmuneCC = bonus.immuneCC;
            spawnVfxEffect('shieldPulseStatus', player.x, player.y, 0.7, 0);
        }
        if (e.dead && bonus.killExplode) {
            emitSkillImpactBurst('thunder',e.x,e.y,0,1.4);
            for (const other of this.nearby(e.x,e.y,100,e)) this.deal(other,e.maxHp*bonus.explodeHpRatio,'lightning');
        }
        return dealt;
    },
    lightningHit(e, amount, bonus, baseDamage=amount) {
        const dealt=this.deal(e,amount,'lightning',bonus);
        if(dealt>0)this.shock(e,baseDamage,bonus);
        return dealt;
    },
    canAttack() {
        return !(player.shield?.invincibleTimer>0) || SKILL_TREE.holy_shield.stage3.guard.angel.effect.canAttack;
    },
    playerMovementMultiplier() {
        return player.shield?.invincibleTimer>0 ? 1+SKILL_TREE.holy_shield.stage3.guard.angel.effect.movespeedBonus : 1;
    },
    absorb(damage) {
        const absorbed = Math.min(damage, this.arcShield);
        this.arcShield -= absorbed;
        if (absorbed > 0) createDamageNumber(player.x,player.y-45,`电弧护盾-${Math.ceil(absorbed)}`,'#66ccff');
        return damage - absorbed;
    },
    controlMultiplier() {
        if(this.arcShield>0 && this.arcShieldImmuneCC)return 0;
        const shield=player.shield,tree=player.skillTree?.holy_shield;
        if(shield?.active && shield.type==='guard'){
            const effect=SKILL_TREE.holy_shield.stage2.guard.effect;
            return Math.max(0,1-effect.ccReduction-(tree.stage2.level-1)*effect.ccPerLevel);
        }
        return 1;
    },
    enemyCriticalMultiplier(isCrit,multiplier=2) {
        if(!isCrit || (player.shield?.active && player.shield.stage3==='fortress' && SKILL_TREE.holy_shield.stage3.reflect.fortress.effect.critImmunity))return 1;
        return multiplier;
    },
    killed() {
        if(player.hp>0 && !player.isDead && player.shield?.active && player.shield.stage3==='fortress'){
            const heal=player.maxHp*SKILL_TREE.holy_shield.stage3.reflect.fortress.effect.lifestealRatio;
            player.hp=Math.min(player.maxHp,player.hp+heal);
        }
    },
    updateHolyShield(dt) {
        const shield=player.shield;
        if(shield.cooldown>0)shield.cooldown=Math.max(0,shield.cooldown-dt);
        if(shield.invincibleTimer>0)shield.invincibleTimer=Math.max(0,shield.invincibleTimer-dt);
        if(!shield.active)return;
        if(player.hp<=0 || player.isDead){shield.active=false;shield.value=0;shield.invincibleTimer=0;return;}
        const elapsed=Math.min(dt,Math.max(0,shield.timer));
        shield.timer-=dt;
        if(shield.stage3==='retribution' && shield.value>0){
            const effect=SKILL_TREE.holy_shield.stage3.reflect.retribution.effect;
            shield.pulseTimer=(shield.pulseTimer || 0)+elapsed;
            while(shield.pulseTimer>=effect.pulseInterval){
                shield.pulseTimer-=effect.pulseInterval;
                for(const e of this.nearby(player.x,player.y,150)){
                    this.deal(e,player.maxHp*effect.auraDamageRatio,'lightning');
                    this.state(e).stormSlow={time:effect.pulseInterval,amount:effect.slowAmount};
                }
                spawnVfxEffect('shieldPulseStatus',player.x,player.y,1.3,0);
            }
        }
        if(shield.timer>0 && shield.value>0)return;
        if(shield.type==='guard'){
            const effect=SKILL_TREE.holy_shield.stage2.guard.effect;
            const heal=player.maxHp*(effect.healRatio+(player.skillTree.holy_shield.stage2.level-1)*effect.healPerLevel);
            player.hp=Math.min(player.maxHp,player.hp+heal);
            createDamageNumber(player.x,player.y-40,`+${Math.floor(heal)}`,'#66ff88');
        }
        if(shield.stage3==='angel')shield.invincibleTimer=SKILL_TREE.holy_shield.stage3.guard.angel.effect.invincibleDuration;
        if(shield.stage3==='link'){
            const effect=SKILL_TREE.holy_shield.stage3.guard.link.effect;
            shield.value=Math.floor(shield.maxValue*effect.secondaryShieldRatio);shield.maxValue=shield.value;shield.timer=effect.secondaryDuration;
        } else {shield.active=false;shield.value=0;shield.timer=0;}
        shield.type=null;shield.stage3=null;
    },
    burn(e, damage, bonus, spread = true) {
        if (e.dead || !bonus.burnDPS) return;
        this.state(e).burn = {time: bonus.burnBase + bonus.burnDuration, tick: 0, damage: damage*bonus.burnDPS, base: damage, bonus};
        if (spread && bonus.burnSpread) {
            for (const other of this.nearby(e.x,e.y,100,e)) this.burn(other,damage*bonus.spreadRatio,bonus,false);
        }
    },
    shock(e, damage, bonus) {
        if (e.dead || !bonus.stunBase) return;
        const time = bonus.stunBase + bonus.stunPerLevel;
        e.frozenTimer = Math.max(e.frozenTimer || 0,time);
        e.lightningOverloadTimer = time;
        this.state(e).shock = {time,tick:0,damage:damage*(bonus.shockDPS || 0),bonus};
    },
    explosion(p, hit) {
        const bonus = p.branch;
        const level = p.skillLevel;
        if (level < 5) return;
        const radius = (50+(level-5)*10)*(1+(bonus.explosionRadius || 0));
        const damage = p.damage*(0.2+(level-5)*0.04)*(1+(bonus.explosionDamage || 0))*(1+(bonus.explosionBonus || 0));
        for (const e of this.nearby(p.x,p.y,radius,hit)) {if(this.deal(e,damage,'fire')>0)this.burn(e,p.damage,bonus);}
        AudioSys.playFireballExplosion(level);
        emitSkillImpactBurst('fireball',p.x,p.y,p.angle,bonus.meteorMode?2:1.4);
        if (bonus.groundFire) this.areas.push({x:p.x,y:p.y,radius,time:bonus.groundFire,tick:0,interval:0.5,damage:damage*0.5,element:'fire',bonus});
    },
    hit(p,e) {
        if (p.hitEnemies.has(e)) return false;
        p.hitEnemies.add(e);
        if (p.type === 'fireball') {
            if(this.deal(e,p.damage,'fire')>0)this.burn(e,p.damage,p.branch);
            this.explosion(p,e); p.life=0;
        } else {
            this.deal(e,p.damage,'physical');
            if (p.pierces > 0) {p.pierces--;p.damage *= Math.min(1,0.7+(p.branch.pierceDecayReduce || 0));}
            else p.life=0;
        }
        return true;
    },
    projectile(p,dt) {
        if (p.meteorTarget && p.life > 0) {
            p.x=p.meteorTarget.x;p.y=p.meteorTarget.y-180*Math.max(0,1-p.age/0.3);
            if(p.age>=0.3){p.y=p.meteorTarget.y;const target=this.nearby(p.x,p.y,24)[0];if(target)this.hit(p,target);else this.explosion(p,null);p.life=0;}
            return;
        }
        if (p.type !== 'multishot' || p.life <= 0) return;
        if (p.branch.rainMode && !p.transformed && p.age >= 0.35) {
            p.transformed=true; p.life=0;
            emitSkillImpactBurst('multishot',p.x,p.y,p.angle,1.7);
            for (const e of this.nearby(p.x,p.y,85)) this.deal(e,p.damage*p.branch.rainDamageRatio,'physical');
        } else if (p.branch.splitMode && !p.transformed && p.age >= 0.25) {
            p.transformed=true; p.life=0;
            for (let i=0;i<p.branch.splitCount;i++) this.arrow(p.x,p.y,p.angle+(i===0?-0.15:0.15),p.damage*p.branch.splitDamage,{...p.branch,splitMode:false},p.skillLevel);
        }
    },
    arrow(x,y,angle,damage,bonus,level,extraPierce=0) {
        projectiles.push(ProjectilePool.acquire({x,y,angle,damage,speed:500,life:1,owner:player,type:'multishot',color:'#aaff00',
            visualTier:getSkillVisualGrowthTier('multishot'),branch:bonus,skillLevel:level,hitEnemies:new Set(),
            pierces:(bonus.pierceTargets || 0)+extraPierce,transformed:false}));
    },
    volley(cast,ratio=1,extraPierce=0) {
        const count=2+cast.level+(cast.bonus.extraArrows || 0);
        const width=0.6+(cast.bonus.spreadAngle || 0)*Math.PI/180;
        for (let i=0;i<count;i++) this.arrow(cast.x,cast.y,cast.angle-width/2+width*i/(count-1),cast.damage*ratio,cast.bonus,cast.level,extraPierce);
        AudioSys.play('multishot_cast');
    },
    cast(skill) {
        if(!this.canAttack())return true;
        const tree=player.skillTree?.[skill];
        if (!['fireball','thunder','multishot'].includes(skill) || !(tree?.stage2?.level>0)) return false;
        const level=player.skills[skill], bonus=getSkillTreeBonus(skill);
        if (player.skillCooldowns[skill]>0 || (skill==='multishot' && this.charge)) return true;
        const cost=skill==='fireball'?5:skill==='thunder'?8+(level-1)*0.5:8;
        if (player.mp<cost) {showNotification('法力不足！');AudioSys.play('ui_error');return true;}
        const target=skill==='thunder'?getEnemyAtCursor():null;
        if (skill==='thunder' && !target && getDestructibleAtCursor()) return false;
        if (skill==='thunder' && (!target || Math.hypot(target.x-player.x,target.y-player.y)>200 || !hasLineOfSight(player.x,player.y,target.x,target.y))) return true;
        player.mp-=cost;player.skillCooldowns[skill]=skill==='fireball'?0.5:skill==='thunder'?2:1;
        const angle=Math.atan2(mouse.worldY-player.y,mouse.worldX-player.x);
        player.direction=directionFromDelta(Math.cos(angle),Math.sin(angle));triggerHeroAction('cast',0.45);
        spawnCastSourceVfx(CAST_SOURCE_VFX[skill],player.x,player.y,angle,1,14,14);
        if (typeof DailyQuestSystem!=='undefined') DailyQuestSystem.updateProgress('use_skill',1);
        trackAchievement('skill_use');
        if (skill==='fireball') {
            const damage=10*level+player.ene;
            projectiles.push(ProjectilePool.acquire({x:player.x,y:player.y,angle,speed:600,life:0.5,damage,owner:player,type:'fireball',color:bonus.meteorMode?'#ffbb55':'#ff4400',
                visualTier:getSkillVisualGrowthTier('fireball'),branch:bonus,skillLevel:level,hitEnemies:new Set()}));
            if (bonus.meteorMode) {
                const p=projectiles.at(-1),distance=Math.min(300,Math.hypot(mouse.worldX-player.x,mouse.worldY-player.y));
                p.meteorTarget={x:player.x+Math.cos(angle)*distance,y:player.y+Math.sin(angle)*distance};
                p.x=p.meteorTarget.x;p.y=p.meteorTarget.y-180;p.angle=Math.PI/2;p.speed=0;
            }
            if (bonus.novaMode) {
                emitSkillImpactBurst('fireball',player.x,player.y,angle,2);
                for (const e of this.nearby(player.x,player.y,150)) {
                    this.deal(e,damage*bonus.novaDamageRatio,'fire');
                    if (bonus.knockback) {const a=Math.atan2(e.y-player.y,e.x-player.x),x=e.x+Math.cos(a)*25,y=e.y+Math.sin(a)*25;if (!isWall(x,y)) {e.x=x;e.y=y;}}
                }
            }
            AudioSys.play('fireball_cast');
        } else if (skill==='thunder') {
            const damage=Math.floor((30+(level-1)*15)*(1+player.ene*0.02));
            this.lightningHit(target,damage,bonus);createLightningEffect(target.x,target.y);
            // 保留原有阶段额外落雷与等级连锁，再加入分支目标数和衰减强化。
            const visualTargets=[target,...this.nearby(target.x,target.y,120,target).slice(0,tree.stage3.level>0?3:1)];
            for (const e of visualTargets.slice(1)) {this.lightningHit(e,damage*0.7,bonus,damage);createLightningEffect(e.x,e.y);}
            const ratios=level>=10?[0.6,0.3,0.15]:level>=5?[0.5,0.25]:level>=3?[0.5]:level>=2?[0.4]:[];
            const count=ratios.length+(bonus.chainTargets || 0), visited=new Set([target]);let prev=target;
            for (let i=0;i<count;i++) {
                const next=this.nearby(prev.x,prev.y,level>=7?200:150).filter(e=>!visited.has(e)).sort((a,b)=>Math.hypot(a.x-prev.x,a.y-prev.y)-Math.hypot(b.x-prev.x,b.y-prev.y))[0];
                if (!next) break;
                const ratio=Math.min(1,(ratios[i] || (ratios.at(-1) || 0.4)*Math.pow(0.5,i-ratios.length+1))+(bonus.chainDecayReduce || 0));
                this.lightningHit(next,damage*ratio,bonus,damage);createLightningChain(prev.x,prev.y,next.x,next.y);visited.add(next);prev=next;
            }
            if (bonus.stormMode) this.areas.push({x:target.x,y:target.y,radius:120,time:bonus.stormDuration,tick:0,interval:bonus.stormInterval,damage,element:'lightning',bonus});
            emitThunderVisualGrowth(target,visualTargets,getSkillVisualGrowthTier('thunder'));AudioSys.play('thunder_cast');
        } else {
            const cast={x:player.x,y:player.y,angle,damage:player.damage[0]*0.8,level,bonus};
            if (bonus.snipeMode) {
                this.charge={...cast,time:0,manual:mouse.rightDown || (typeof touchState!=='undefined' && touchState.isLongPress)};
                createFloatingText(player.x,player.y-45,'狙击蓄力…','#ccff88');
            } else if (bonus.barrageMode) {
                const ratio=(1+bonus.barrageDamage)/bonus.barrageWaves;
                this.volley(cast,ratio);
                for (let i=1;i<bonus.barrageWaves;i++) this.volleys.push({cast,ratio,time:i*bonus.barrageInterval});
            } else this.volley(cast);
        }
        return true;
    },
    update(dt) {
        if (player.hp<=0 || player.isDead || isInTown()) {this.reset();return;}
        if(!this.canAttack()){this.charge=null;this.volleys.length=0;}
        if (this.arcShield>0 && this.arcShieldImmuneCC) {player.frozen=false;player.frozenTimer=0;player.slowedTimer=0;}
        if (this.charge) {
            const c=this.charge;c.time=Math.min(c.bonus.chargeMaxTime,c.time+dt);
            const holding=mouse.rightDown || (typeof touchState!=='undefined' && touchState.isLongPress);
            if (c.time>=c.bonus.chargeMaxTime || (c.manual && !holding)) {
                c.x=player.x;c.y=player.y;c.angle=Math.atan2(mouse.worldY-player.y,mouse.worldX-player.x);
                this.volley(c,1+c.time*c.bonus.chargeDamage,c.bonus.chargePierce);this.charge=null;
            }
        }
        for (let i=this.volleys.length-1;i>=0;i--) {const v=this.volleys[i];v.time-=dt;if(v.time<=1e-9){this.volley(v.cast,v.ratio);this.volleys.splice(i,1);}}
        for (const [e,state] of this.states) {
            if(e.dead || !enemies.includes(e)){this.states.delete(e);continue;}
            for (const kind of ['burn','shock']) {
                const effect=state[kind];if(!effect)continue;
                const elapsed=Math.min(dt,effect.time);effect.time-=elapsed;effect.tick+=elapsed;
                while(effect.tick>=0.5-1e-9) {effect.tick-=0.5;if(effect.damage>0)this.deal(e,effect.damage*0.5,kind==='burn'?'fire':'lightning');}
                if(effect.time<=1e-9) {
                    if(effect.tick>1e-9 && effect.damage>0)this.deal(e,effect.damage*effect.tick,kind==='burn'?'fire':'lightning');
                    delete state[kind];
                    if(kind==='burn' && effect.bonus.burnDetonate) {
                        emitSkillImpactBurst('fireball',e.x,e.y,0,1.3);
                        for(const other of this.nearby(e.x,e.y,90))this.deal(other,effect.base*0.5,'fire');
                    }
                }
            }
            if(!state.burn && !state.shock && !state.stormSlow)this.states.delete(e);
        }
        for(let i=this.areas.length-1;i>=0;i--){
            const a=this.areas[i],elapsed=Math.min(dt,a.time);a.time-=elapsed;a.tick+=elapsed;
            const targets=this.nearby(a.x,a.y,a.radius);
            if(a.bonus.slowAmount)for(const e of targets)this.state(e).stormSlow={time:0.15,amount:a.bonus.slowAmount};
            while(a.tick>=a.interval-1e-9){a.tick-=a.interval;for(const e of targets)this.deal(e,a.damage,a.element);emitSkillImpactBurst(a.element==='fire'?'fireball':'thunder',a.x,a.y,0,1.2);}
            if(a.time<=1e-9)this.areas.splice(i,1);
        }
    },
    speedMultiplier(e,dt) {
        const slow=this.states.get(e)?.stormSlow;
        if(!slow)return 1;
        slow.time-=dt;
        if(slow.time<=0){delete this.states.get(e).stormSlow;return 1;}
        return 1-slow.amount;
    }
};
