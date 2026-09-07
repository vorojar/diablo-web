// 陨石/雷暴的立体表现。陨石使用小型GPU纹理；只读取战斗状态，不计算伤害。
const Elemental3D = (() => {
    const CELL=128, MAX_IMPACTS=12, MAX_BOLTS=24, MAX_STORMS=6;
    let canvas,gl,program,timeUniform,failed=false,lastTick=-1,frames=0;
    const impacts=[],bolts=[];
    const vertex='attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}';
    const fragment=`precision highp float;
uniform float time;
float hash(vec3 p){return fract(sin(dot(p,vec3(17.13,43.71,91.27)))*43758.54);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
void main(){
 vec2 p=vec2(mod(gl_FragCoord.x,128.)/128.,gl_FragCoord.y/128.)*2.-1.;

  p/=0.88;float angle=atan(p.y,p.x);float radius=.90+.055*sin(angle*7.)+.025*cos(angle*11.);
  float r=length(p)/radius;if(r>1.)discard;
  vec3 n=normalize(vec3(p,sqrt(max(0.,1.-r*r))));
  float a=time*2.;vec3 stone=vec3(n.x*cos(a)+n.z*sin(a),n.y,-n.x*sin(a)+n.z*cos(a));
  float grain=noise(stone*12.);float cracks=1.-smoothstep(.025,.10,abs(noise(stone*5.)-.48));
  float light=.20+.65*max(0.,dot(n,normalize(vec3(-.4,.65,1.))));
  vec3 color=vec3(.20,.13,.10)*light*(.6+grain*.7)+cracks*vec3(1.,.28,.025)*(.65+.35*sin(time*6.+stone.y*8.));
  float edge=pow(r,8.);color+=vec3(1.,.38,.055)*edge*.55;
  float alpha=1.-smoothstep(.96,1.,r);gl_FragColor=vec4(color*alpha,alpha);

}`;
    function init(){
        if(gl || failed)return !!gl;
        canvas=document.createElement('canvas');canvas.width=CELL;canvas.height=CELL;
        gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,preserveDrawingBuffer:true});
        if(!gl){failed=true;return false;}
        canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();gl=null;failed=true;clear();});
        try {
            const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;};
            program=gl.createProgram();const shaders=[compile(gl.VERTEX_SHADER,vertex),compile(gl.FRAGMENT_SHADER,fragment)];
            shaders.forEach(shader=>gl.attachShader(program,shader));gl.linkProgram(program);
            if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
            shaders.forEach(shader=>gl.deleteShader(shader));gl.useProgram(program);
            const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
            const location=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
            timeUniform=gl.getUniformLocation(program,'time');
        }catch(error){console.warn('立体元素特效初始化失败，使用原有特效',error);failed=true;gl=null;return false;}
        return true;
    }
    function texture(now){
        if(!init())return false;
        const tick=Math.floor(now/33.333);
        if(tick!==lastTick){gl.viewport(0,0,CELL,CELL);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform1f(timeUniform,now/1000);gl.drawArrays(gl.TRIANGLES,0,6);lastTick=tick;frames++;}
        return true;
    }
    function visible(x,y,camera,padding=240){return x>=camera.x-padding&&x<=camera.x+camera.width+padding&&y>=camera.y-padding&&y<=camera.y+camera.height+padding;}
    function ring(ctx,x,y,radius,color,alpha,flat=1){ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(x,y,radius,radius*flat,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
    function glow(ctx,x,y,radius,color,alpha){ctx.save();ctx.globalAlpha=alpha;const fill=ctx.createRadialGradient(x,y,0,x,y,radius);fill.addColorStop(0,color);fill.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=fill;ctx.fillRect(x-radius,y-radius,radius*2,radius*2);ctx.restore();}
    function meteor(ctx,p,enabled,now=performance.now()){
        if(!enabled||!p.meteorTarget||p.life<=0||!texture(now))return false;
        ctx.save();
        const age=p.age === undefined ? 0 : p.age;
        // 外焰、亮芯与侧向火舌形成有厚度的高速尾迹。
        for(let layer=0;layer<3;layer++){
            const length=155-layer*29,width=25-layer*7,sway=Math.sin(age*28+layer)*9;
            const tail=ctx.createLinearGradient(p.x,p.y-length,p.x,p.y+15);
            tail.addColorStop(0,'rgba(255,70,5,0)');tail.addColorStop(.48,layer===0?'rgba(255,72,8,.22)':'rgba(255,160,38,.45)');tail.addColorStop(1,layer===2?'#fff1b0':'#ff922a');
            ctx.fillStyle=tail;ctx.beginPath();ctx.moveTo(p.x-width,p.y+4);
            ctx.bezierCurveTo(p.x-width*1.5,p.y-45,p.x+sway-10,p.y-length*.7,p.x+sway+12,p.y-length);
            ctx.bezierCurveTo(p.x+sway-2,p.y-length*.5,p.x+width*1.3,p.y-35,p.x+width,p.y+4);ctx.fill();
        }
        glow(ctx,p.x,p.y,48,'#ff8929',.52);
        ctx.drawImage(canvas,0,0,CELL,CELL,p.x-29,p.y-29,58,58);
        for(let i=0;i<9;i++){const t=(age*3+i*.113)%1;ctx.globalAlpha=(1-t)*.8;ctx.strokeStyle=i%2?'#ffd276':'#ff6b21';ctx.lineWidth=i%3===0?2:1;const x=p.x+Math.sin(i*3.1+t*5)*(20+t*12),y=p.y-t*133;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+3,y-7-t*8);ctx.stroke();}
        ctx.restore();return true;
    }
    function impact(x,y,radius,enabled){if(!enabled||failed)return;if(impacts.length>=MAX_IMPACTS)impacts.shift();impacts.push({x,y,radius,age:0});}
    function pulse(area,targets,enabled){
        if(!enabled||!area.bonus.stormMode||failed)return;
        const ends=targets.length?targets.slice(0,4):[area];
        for(const end of ends){if(bolts.length>=MAX_BOLTS)bolts.shift();bolts.push({x:area.x,y:area.y-175,tx:end.x,ty:end.y-12,age:0,seed:bolts.length+area.x});}
    }
    function update(dt,meteorEnabled,stormEnabled){
        for(const [list,on,maxAge] of [[impacts,meteorEnabled,.85],[bolts,stormEnabled,.3]])for(let i=list.length-1;i>=0;i--){list[i].age+=dt;if(!on||list[i].age>=maxAge)list.splice(i,1);}
    }
    function ground(ctx,projectiles,areas,camera,meteorEnabled,stormEnabled){
        if((!meteorEnabled&&!stormEnabled)||failed)return;
        if(meteorEnabled){
            for(const p of projectiles){if(!p.meteorTarget||p.life<=0||!visible(p.meteorTarget.x,p.meteorTarget.y,camera))continue;const t=Math.min(1,(p.age === undefined ? 0 : p.age)/.3);glow(ctx,p.meteorTarget.x,p.meteorTarget.y,25+t*17,'#f79c3b',.14+t*.12);ring(ctx,p.meteorTarget.x,p.meteorTarget.y,14+t*12,'#ffbb66',.6,.45);}
            for(const fx of impacts){
                if(!visible(fx.x,fx.y,camera))continue;
                const t=fx.age/.85,shock=Math.min(1,fx.age/.4);
                glow(ctx,fx.x,fx.y,fx.radius*.8,'#e96920',(1-t)*.42);
                ring(ctx,fx.x,fx.y,fx.radius*(.15+.85*Math.sqrt(shock)),'#ffd296',(1-shock)*.95,.55);
                ring(ctx,fx.x,fx.y,fx.radius*(.12+.68*shock),'#ff7832',(1-shock)*.65,.55);
                // 短暂熔纹落在地面层，留出角色与怪物轮廓。
                ctx.save();ctx.globalAlpha=Math.pow(1-t,1.3);ctx.lineJoin='round';
                for(let i=0;i<7;i++){
                    const angle=i*2.399+fx.x*.01;ctx.beginPath();ctx.moveTo(fx.x,fx.y);
                    for(let j=1;j<=3;j++){const r=fx.radius*(.11+j*.12),a=angle+Math.sin(i*7+j*5)*.18;ctx.lineTo(fx.x+Math.cos(a)*r,fx.y+Math.sin(a)*r*.55);}
                    ctx.strokeStyle='#522a20';ctx.lineWidth=5;ctx.stroke();ctx.strokeStyle='#ffac42';ctx.lineWidth=1.4;ctx.stroke();
                }ctx.restore();
            }
        }
        if(stormEnabled){let count=0;for(const area of areas){if(area.element!=='lightning'||!area.bonus.stormMode||!visible(area.x,area.y,camera)||count++>=MAX_STORMS)continue;ring(ctx,area.x,area.y,area.radius,'#92b8ff',Math.min(.22,area.time*.3));glow(ctx,area.x,area.y,area.radius,'#7d95dd',.08);}}
    }
    function foreground(ctx,areas,camera,meteorEnabled,stormEnabled,now=performance.now()){
        if((!meteorEnabled&&!stormEnabled)||failed)return;
        if(meteorEnabled)for(const fx of impacts){
            if(!visible(fx.x,fx.y,camera))continue;const t=fx.age,fade=Math.max(0,1-t/.85);
            if(t<.14)glow(ctx,fx.x,fx.y-8,54,'#fff0ba',(1-t/.14)*.8);
            ctx.save();ctx.globalAlpha=fade;
            for(let i=0;i<13;i++){
                const a=i*2.399,dx=Math.cos(a)*(55+i*6)*t,dy=Math.sin(a)*42*t-(145+i*5)*t+220*t*t;
                const size=3+i%4;
                ctx.save();ctx.translate(fx.x+dx,fx.y+dy);ctx.rotate(a+t*6);
                ctx.fillStyle='#603c2a';ctx.beginPath();ctx.moveTo(-size,-size*.5);ctx.lineTo(size*.4,-size);ctx.lineTo(size,size*.6);ctx.lineTo(-size*.6,size);ctx.closePath();ctx.fill();
                ctx.strokeStyle=i%3?'#ff933c':'#ffe3a0';ctx.lineWidth=1.5;ctx.stroke();
                ctx.beginPath();ctx.moveTo(-size*.5,0);ctx.lineTo(size*.5,-size*.3);ctx.stroke();ctx.restore();
            }ctx.restore();
        }
        if(!stormEnabled)return;
        for(const bolt of bolts){
            if(!visible(bolt.tx,bolt.ty,camera))continue;
            const alpha=Math.pow(1-bolt.age/.3,.7),surge=1+Math.max(0,1-bolt.age/.09)*.6;
            ctx.save();ctx.globalAlpha=alpha;ctx.lineJoin='round';ctx.lineCap='round';
            const points=[];
            for(let j=0;j<=10;j++){const t=j/10;points.push([bolt.x+(bolt.tx-bolt.x)*t+(j===0||j===10?0:Math.sin(j*23+bolt.seed)*16),bolt.y+(bolt.ty-bolt.y)*t]);}
            ctx.beginPath();for(let j=0;j<points.length;j++)ctx[j?'lineTo':'moveTo'](...points[j]);
            ctx.strokeStyle='rgba(70,100,255,.18)';ctx.lineWidth=17*surge;ctx.stroke();
            ctx.strokeStyle='#6e9fff';ctx.lineWidth=6*surge;ctx.stroke();ctx.strokeStyle='#f3fbff';ctx.lineWidth=2.1*surge;ctx.stroke();
            // 分叉只在主雷附近展开，不暗示额外目标受到伤害。
            for(let i=0;i<3;i++){
                const j=3+i*2,[x,y]=points[j],side=i%2?1:-1;
                ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+side*20,y+12);ctx.lineTo(x+side*13,y+25);ctx.lineTo(x+side*(29+i*6),y+39);
                ctx.strokeStyle='rgba(108,151,255,.55)';ctx.lineWidth=4;ctx.stroke();ctx.strokeStyle='#c9eaff';ctx.lineWidth=1;ctx.stroke();
            }
            ctx.restore();
            glow(ctx,bolt.tx,bolt.ty+12,37,'#9acbff',alpha*.48);
            ring(ctx,bolt.tx,bolt.ty+12,8+bolt.age*95,'#b8e5ff',alpha*.65,.48);
            if(bolt.age<.12){
                const flash=1-bolt.age/.12;glow(ctx,bolt.tx,bolt.ty,23,'#f0fbff',flash*.9);
                ctx.save();ctx.globalAlpha=flash;ctx.strokeStyle='#edfaff';ctx.lineWidth=1.6;ctx.beginPath();
                for(let i=0;i<6;i++){const a=i*Math.PI/3+bolt.seed;ctx.moveTo(bolt.tx+Math.cos(a)*5,bolt.ty+Math.sin(a)*5);ctx.lineTo(bolt.tx+Math.cos(a)*26,bolt.ty+Math.sin(a)*26);}ctx.stroke();ctx.restore();
            }
        }
    }
    function clear(){impacts.length=0;bolts.length=0;}
    return {prepare:()=>texture(performance.now()),meteor,impact,pulse,update,ground,foreground,clear,getStats:()=>({ready:!!gl,failed,frames,impacts:impacts.length,bolts:bolts.length,pixels:CELL*CELL,maxStorms:MAX_STORMS})};
})();
