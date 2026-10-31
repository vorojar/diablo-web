// 可复现的本地特效配方；浏览器预览与离线导出共用，不读取战斗全局状态。
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VfxRecipes=api;})(globalThis,()=>{
    'use strict';
    const size=48,origin=[24,38],TAU=Math.PI*2;
    const palettes={fire:['#462c27','#c65528','#ffc16b','#fff1c2'],ice:['#304b63','#5f9fc0','#a6e2f2','#f0fcff'],
        lightning:['#363964','#707fba','#a5c9fa','#f2fbff'],poison:['#2c493b','#56966c','#a0cf91','#dcf1c0'],
        ash:['#303138','#69616a','#bd9c78','#edcba6'],gold:['#715332','#c38d3f','#f0ca74','#fff1bc'],set:['#244b43','#438a70','#82cfab','#d3ffe5']};
    const definitions={
        fireBloom:{kind:'burst',palette:'fire',duration:.85,loop:false},
        frostBreak:{kind:'crystal',palette:'ice',duration:.75,loop:false},
        shockFade:{kind:'shock',palette:'lightning',duration:.5,loop:false},
        poisonFade:{kind:'veil',palette:'poison',duration:.8,loop:false},
        ashDeath:{kind:'ash',palette:'ash',duration:.9,loop:false},
        fireCharge:{kind:'charge',palette:'fire',duration:1,loop:true},
        iceCharge:{kind:'charge',palette:'ice',duration:1,loop:true},
        shockCharge:{kind:'charge',palette:'lightning',duration:1,loop:true},
        earthCharge:{kind:'charge',palette:'gold',duration:1,loop:true},
        lootRare:{kind:'rare',palette:'gold',duration:1,loop:true},
        lootGold:{kind:'gold',palette:'gold',duration:1,loop:true},
        lootSet:{kind:'set',palette:'set',duration:1,loop:true},
        lootCollect:{kind:'collect',palette:'gold',duration:.45,loop:false},
        leaves:{kind:'leaf',palette:'poison',duration:3,loop:true},
        snow:{kind:'snow',palette:'ice',duration:3,loop:true},
        embers:{kind:'ember',palette:'fire',duration:2,loop:true},
        ripple:{kind:'ripple',palette:'ice',duration:2,loop:true}
    };
    function random(seed,index){let n=(seed^Math.imul(index+1,0x9e3779b9))>>>0;n=Math.imul(n^(n>>>16),0x21f0aaad);n=Math.imul(n^(n>>>15),0x735a2d97);return ((n^(n>>>15))>>>0)/4294967296;}
    function line(c,x,y,tx,ty,color,width=1){c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.lineTo(tx,ty);c.stroke();}
    function diamond(c,x,y,r,color){c.fillStyle=color;c.beginPath();c.moveTo(x,y-r);c.lineTo(x+r*.5,y);c.lineTo(x,y+r);c.lineTo(x-r*.5,y);c.closePath();c.fill();}
    function ring(c,x,y,r,color,flat=.42){c.strokeStyle=color;c.lineWidth=1;c.beginPath();c.ellipse(x,y,r,r*flat,0,0,TAU);c.stroke();}
    function draw(c,id,t,options={},layer='body'){
        const d=definitions[id];if(!d)throw new RangeError(`未知特效配方：${id}`);
        if(!Number.isFinite(t)||!Number.isInteger(options.seed??1))throw new RangeError('时间和种子必须有效');
        if(!d.loop&&(t<0||t>=d.duration))return;
        const q=d.loop?((t%d.duration+d.duration)%d.duration)/d.duration:t/d.duration;
        const p=options.palette||palettes[d.palette];if(!Array.isArray(p)||p.length!==4)throw new RangeError('调色板必须有四个颜色');
        const seed=options.seed??1,fade=d.loop?1:Math.pow(1-q,1.5),light=layer==='light';
        c.save();c.translate(origin[0],origin[1]);c.lineCap='round';c.lineJoin='round';
        c.globalAlpha*=fade;
        if(['burst','crystal','shock','ash','veil'].includes(d.kind)){
            if(light){
                if(d.kind!=='veil'&&q<.35){c.globalAlpha*=.32*(1-q/.35);c.fillStyle=p[2];c.beginPath();c.arc(0,-14,4+q*24,0,TAU);c.fill();}
                if(d.kind==='shock')for(let i=0;i<4;i++){const a=i*TAU/4+.4,r=5+q*15;line(c,0,-14,Math.cos(a)*r,-14+Math.sin(a)*r*.65,p[3]);}
            }else if(d.kind==='veil'){
                for(let i=0;i<3;i++){const y=-5-i*5-q*9,x=Math.sin(q*TAU+i)*3;c.globalAlpha=fade*.22;c.fillStyle=p[i%2+1];c.beginPath();c.ellipse(x,y,14-q*2,3+i*.3,q*.3,0,TAU);c.fill();}
            }else{
                const n=d.kind==='ash'?7:8;
                for(let i=0;i<n;i++){
                    const a=i*2.399+random(seed,i)*.4,r=(4+random(seed,i+20)*14)*Math.sqrt(q);
                    const x=Math.cos(a)*r,y=-14+Math.sin(a)*r*.45-Math.sin(q*Math.PI)*(4+random(seed,i+40)*9);
                    const s=(d.kind==='crystal'?3:2)*(1-q*.7);
                    if(d.kind==='shock')line(c,x,y,x+Math.cos(a)*4,y+Math.sin(a)*3,i%2?p[2]:p[3]);
                    else{diamond(c,x,y,s,p[i%3]);line(c,x,y-s,x+s*.4,y,p[2]);}
                }
                if(d.kind==='burst'){ring(c,0,0,3+q*16,p[q<.2?3:1]);if(q<.3)diamond(c,0,-14,5*(1-q/.3),p[3]);}
            }
        }else if(d.kind==='charge'){
            const pulse=.7+.3*Math.sin(q*TAU),r=5+pulse*3;
            if(light){c.globalAlpha*=.16+pulse*.08;c.fillStyle=p[2];c.beginPath();c.arc(0,-15,r+3,0,TAU);c.fill();}
            else{
                if(d.palette==='lightning'){for(let i=0;i<3;i++){const a=i*TAU/3+q*TAU,x=Math.cos(a)*11,y=-15+Math.sin(a)*9;line(c,0,-15,x*.4+2,(y-15)*.5,p[2]);line(c,x*.4+2,(y-15)*.5,x,y,p[3]);}}
                else if(d.palette==='ice'){for(let i=0;i<5;i++){const a=i*TAU/5+q*TAU;diamond(c,Math.cos(a)*10,-15+Math.sin(a)*8,2.2,p[i%2+1]);}}
                else{ring(c,0,-15,r,p[2],.8);for(let i=0;i<4;i++){const a=q*TAU+i*TAU/4;diamond(c,Math.cos(a)*12,-15+Math.sin(a)*9,1.4,p[3]);}}
                diamond(c,0,-15,2,p[2]);
            }
        }else if(d.kind==='gold'||d.kind==='set'||d.kind==='rare'){
            const pulse=.8+.2*Math.sin(q*TAU);
            if(light){c.globalAlpha*=.16*pulse;c.fillStyle=p[2];c.beginPath();c.ellipse(0,-14,4,15,0,0,TAU);c.fill();}
            else if(d.kind==='rare'){diamond(c,0,-14,5,p[1]);diamond(c,0,-14,3,p[3]);ring(c,0,0,8,p[1]);}
            else if(d.kind==='gold'){
                line(c,0,0,0,-29,p[2],1.4);line(c,-3,-2,-3,-24,p[1]);diamond(c,0,-24,3,p[3]);ring(c,0,1,10,p[1]);
                for(let i=0;i<3;i++){const u=(q+i/3)%1;diamond(c,(i-1)*7,-5-u*20,1,p[2]);}
            }else{
                ring(c,0,0,16,p[2]);ring(c,0,0,11,p[1]);
                for(let i=0;i<5;i++){const a=i*TAU/5+q*TAU,x=Math.cos(a)*16,y=Math.sin(a)*6;diamond(c,x,y-1,2,p[3]);}
                diamond(c,0,-17,4,p[2]);line(c,0,-9,0,-3,p[1]);
            }
        }else if(d.kind==='collect'){
            if(light){c.globalAlpha*=.2;ring(c,0,-10,3+(1-q)*13,p[2],.6);}
            else for(let i=0;i<6;i++){const a=i*TAU/6,r=17*(1-q);diamond(c,Math.cos(a)*r,-10+Math.sin(a)*r*.55,1.5,p[i%2+2]);}
        }else if(d.kind==='ripple'){
            if(!light)for(let i=0;i<2;i++){const u=(q+i*.5)%1;c.globalAlpha=(1-u)*.22;ring(c,0,-2,4+u*14,p[2]);}
        }else if(!light){
            for(let i=0;i<(d.kind==='snow'?4:2);i++){
                const phase=(q+random(seed,i))%1,x=(random(seed,i+10)-.5)*31+Math.sin(q*TAU+i)*2;
                const y=d.kind==='ember'?-3-phase*25:-30+phase*30;
                c.globalAlpha=.28*Math.sin(phase*Math.PI);
                if(d.kind==='leaf'){c.save();c.translate(x,y);c.rotate(q*TAU+i);diamond(c,0,0,2,p[1]);c.restore();}
                else{c.fillStyle=d.kind==='snow'?p[3]:p[2];c.fillRect(Math.round(x),Math.round(y),1,d.kind==='ember'?2:1);}
            }
        }
        c.restore();
    }
    return {size,origin,definitions,palettes,random,draw};
});
