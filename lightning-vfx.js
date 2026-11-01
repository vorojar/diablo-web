// PixelFX 雷电离线图集：运行时只做裁剪、定位与双层合成，不推进伤害或连锁目标。
const LightningVfx=(()=>{
    // 雷电清单开始（由 tools/build-lightning.mjs 更新，随脚本一起交付）
    const m={"sourceSHA256":"2279f1da7f8897a3f97561401a6bf9d91eedfeabbb1423db77ff858176b3ff85","width":1536,"height":240,"cellWidth":128,"frames":12,"ages":[0,0.025,0.05,0.075,0.1,0.13,0.16,0.2,0.25,0.3,0.46,0.6],"duration":0.68,"strike":{"y":0,"height":144,"pivotX":64,"pivotY":120},"link":{"y":144,"height":64,"startX":11,"endX":117,"pivotY":32},"hostileLink":{"y":208,"height":32,"startX":11,"endX":117,"pivotY":16},"body":"art/lightning/body.webp","light":"art/lightning/light.webp"};
    // 雷电清单结束
    const events=[],pool=[],MAX_STRIKES=12;
    let high=true,initialized=false,body=null,light=null,bodyReady=false,lightReady=false,bodyFailed=false,lightFailed=false,emitted=0;
    function load(layer){
        if(layer==='body'?(body||bodyFailed):(light||lightFailed))return;
        const image=new Image();if(layer==='body')body=image;else light=image;
        image.onload=()=>{if(layer==='body'&&body===image)bodyReady=true;if(layer==='light'&&light===image)lightReady=true;};
        image.onerror=()=>{if((layer==='body'?body:light)!==image)return;if(layer==='body')bodyFailed=true;else lightFailed=true;console.error('雷电图集加载失败：'+layer);};
        image.src=m[layer]+'?v='+m.sourceSHA256.slice(0,12);
    }
    function setQuality(value){
        if(initialized&&high===value)return;initialized=true;high=value;load('body');
        if(high)load('light');else{light=null;lightReady=false;}
    }
    function index(age){let i=m.frames-1;while(i>0&&age<m.ages[i])i--;return i;}
    function imageFrame(ctx,kind,age,x,y,sx,sy,flip=false,bodyOnly=false){
        const e=m[kind],i=index(age),left=kind==='strike'?-e.pivotX:-e.startX;
        ctx.save();ctx.translate(x,y);ctx.scale(flip?-sx:sx,sy);ctx.imageSmoothingEnabled=false;
        ctx.globalCompositeOperation='source-over';ctx.drawImage(body,i*128,e.y,128,e.height,left,-e.pivotY,128,e.height);
        if(high&&lightReady&&!bodyOnly){ctx.globalCompositeOperation='lighter';ctx.drawImage(light,i*128,e.y,128,e.height,left,-e.pivotY,128,e.height);}
        ctx.restore();
    }
    function fallback(ctx,points,alpha){
        if(!points?.length)return;ctx.save();ctx.globalAlpha*=alpha;ctx.lineJoin='miter';ctx.beginPath();
        ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
        ctx.strokeStyle='#5a62f0';ctx.lineWidth=5;ctx.stroke();ctx.strokeStyle='#9ed8ff';ctx.lineWidth=2.5;ctx.stroke();ctx.strokeStyle='#ffffff';ctx.lineWidth=1;ctx.stroke();ctx.restore();
    }
    function strike(x,y,points){
        for(const e of events)if(e.age<.04&&(e.x-x)**2+(e.y-y)**2<400)return;
        if(events.length===MAX_STRIKES)pool.push(events.shift());
        const e=pool.pop()||{};e.x=x;e.y=y;e.age=0;e.points=points;e.flip=points[0].x<x;events.push(e);emitted++;
    }
    function update(dt){
        for(let i=events.length-1;i>=0;i--){const e=events[i];e.age+=dt;if(e.age>=m.duration){e.points=null;pool.push(events.splice(i,1)[0]);}}
    }
    function drawStrikes(ctx,camera,width,height){
        for(const e of events){
            if(e.x<camera.x-128||e.x>camera.x+width+128||e.y<camera.y-48||e.y>camera.y+height+250)continue;
            if(bodyReady)imageFrame(ctx,'strike',e.age,e.x,e.y,2,2,e.flip);
            else fallback(ctx,e.points,Math.max(0,1-e.age/m.duration));
        }
    }
    function drawLink(ctx,p){
        // 旧独立残影和随机分叉按原寿命回收；新主电弧已自带分叉与冷却，避免重复叠亮。
        if(p.type==='lightning_chain'&&!p.isMain)return;
        const first=p.points?.[0],last=p.points?.[p.points.length-1],x=first?first.x:p.x,y=first?first.y:p.y;
        const tx=last?last.x:p.tx,ty=last?last.y:p.ty,dx=tx-x,dy=ty-y,distance=Math.hypot(dx,dy);
        if(!Number.isFinite(distance)||distance<1)return;
        const duration=p.maxLife??.3,age=Math.max(0,Math.min(m.duration,(1-p.life/duration)*m.duration));
        if(!bodyReady){if(p.points)fallback(ctx,p.points,p.life/duration);else{ctx.save();ctx.strokeStyle=p.hostile?'#ffd8eb':'#e4f6ff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(tx,ty);ctx.stroke();ctx.restore();}return;}
        ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(dy,dx));imageFrame(ctx,p.hostile?'hostileLink':'link',age,0,0,distance/106,1.5,false,p.bodyOnly);ctx.restore();
    }
    function drawStorm(ctx,bolt){
        if(bodyReady)imageFrame(ctx,'strike',bolt.age/.3*.46,bolt.tx,bolt.ty+12,1.55,1.55,bolt.seed%2<1);
        else{ctx.save();ctx.globalAlpha*=Math.max(0,1-bolt.age/.3);ctx.beginPath();ctx.moveTo(bolt.x,bolt.y);ctx.lineTo(bolt.tx,bolt.ty);ctx.strokeStyle='#5a62f0';ctx.lineWidth=5;ctx.stroke();ctx.strokeStyle='#9ed8ff';ctx.lineWidth=3;ctx.stroke();ctx.strokeStyle='#ffffff';ctx.lineWidth=1;ctx.stroke();ctx.restore();}
    }
    function clear(){while(events.length){const e=events.pop();e.points=null;pool.push(e);}}
    function getStats(){return {active:events.length,pooled:pool.length,emitted,maxStrikes:MAX_STRIKES,high,bodyReady,lightReady,assetError:bodyFailed||lightFailed,
        atlasBytes:m.width*m.height*4*((bodyReady?1:0)+(lightReady?1:0)),maxAtlasBytes:m.width*m.height*8};}
    return {setQuality,strike,update,drawStrikes,drawLink,drawStorm,clear,getStats};
})();
