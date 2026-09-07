// 高阶物理斩击：三维弧形刀面、侧壁与分层残影，投影到现有战斗Canvas。
const Physical3D = (() => {
    const segments=28;
    function draw(ctx,s){
        if(!s.depthSweep)return false;
        const t=1-s.life,fade=Math.min(1,s.life*2.2),swing=s.angle+(t-.5)*s.sweepArc;
        const project=(a,r,z)=>[s.x+Math.cos(a)*r,s.y+Math.sin(a)*r*.78-z];
        const polygon=(points,color,alpha)=>{ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.beginPath();for(let i=0;i<points.length;i++)ctx[i?'lineTo':'moveTo'](...points[i]);ctx.closePath();ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=.5;ctx.stroke();};
        ctx.save();
        // 残影逐层降低、变薄；每片刀面保留上表面和厚度侧壁。
        for(let layer=2;layer>=0;layer--){
            const radius=s.radius-layer*9,span=1.05+s.tier*.12,start=swing-span*.55-layer*.17;
            for(let i=0;i<segments;i++){
                const u=i/segments,v=(i+1)/segments,a=start+u*span,b=start+v*span;
                const width=(10+s.tier*4+(s.isCrit?7:0))*Math.pow(Math.sin(Math.PI*u),.8)/(1+layer*.7);
                const nextWidth=(10+s.tier*4+(s.isCrit?7:0))*Math.pow(Math.sin(Math.PI*v),.8)/(1+layer*.7);
                const z=18+Math.sin(a-s.angle)*12+layer*4,zz=18+Math.sin(b-s.angle)*12+layer*4;
                const outer=project(a,radius,z),nextOuter=project(b,radius,zz),inner=project(a,radius-width,z+5),nextInner=project(b,radius-nextWidth,zz+5);
                const alpha=fade*(layer===0?.85:.15);
                polygon([outer,nextOuter,project(b,radius,zz-7),project(a,radius,z-7)],layer===0?'#a65423':'#e2a850',alpha*.85);
                polygon([outer,nextOuter,nextInner,inner],layer===0?'#efb84e':'#f5d68c',alpha);
                const bevel=project(a,radius-width*.24,z+2),nextBevel=project(b,radius-nextWidth*.24,zz+2);
                polygon([outer,nextOuter,nextBevel,bevel],s.isCrit?'#fffbea':'#fff1c4',alpha);
            }
        }
        // 高阶裂斩的窄亮锋，爆发集中在刀刃而非铺满屏幕。
        if(s.tier>=3){ctx.globalAlpha=fade*.75;ctx.strokeStyle='#fff0ba';ctx.lineWidth=s.isCrit?3:1.5;ctx.beginPath();for(let i=0;i<=segments;i++){const a=swing-.65+i/segments*1.3;ctx[i?'lineTo':'moveTo'](...project(a,s.radius+8,24));}ctx.stroke();}
        ctx.restore();return true;
    }
    return {draw};
})();
