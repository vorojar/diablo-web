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
        const tail=ctx.createLinearGradient(p.x,p.y-100,p.x,p.y+10);tail.addColorStop(0,'rgba(255,80,10,0)');tail.addColorStop(.6,'rgba(255,105,25,.4)');tail.addColorStop(1,'rgba(255,225,115,.85)');
        ctx.fillStyle=tail;ctx.beginPath();ctx.moveTo(p.x-15,p.y);ctx.quadraticCurveTo(p.x-19,p.y-35,p.x+9,p.y-108);ctx.quadraticCurveTo(p.x+24,p.y-35,p.x+15,p.y);ctx.fill();
        glow(ctx,p.x,p.y,34,'#ff8929',.42);
        ctx.drawImage(canvas,0,0,CELL,CELL,p.x-23,p.y-23,46,46);
        for(let i=0;i<5;i++){const t=((p.age === undefined ? 0 : p.age)*3+i*.19)%1;ctx.globalAlpha=(1-t)*.6;ctx.fillStyle='#ffcf70';ctx.fillRect(p.x+Math.sin(i*3.1+t*5)*18,p.y-t*85,2,4);}
        ctx.restore();return true;
    }
    function impact(x,y,radius,enabled){if(!enabled||failed)return;if(impacts.length>=MAX_IMPACTS)impacts.shift();impacts.push({x,y,radius,age:0});}
    function pulse(area,targets,enabled){
        if(!enabled||!area.bonus.stormMode||failed)return;
        const ends=targets.length?targets.slice(0,4):[area];
        for(const end of ends){if(bolts.length>=MAX_BOLTS)bolts.shift();bolts.push({x:area.x,y:area.y-105,tx:end.x,ty:end.y-12,age:0,seed:bolts.length+area.x});}
    }
    function update(dt,meteorEnabled,stormEnabled){
        for(const [list,on,maxAge] of [[impacts,meteorEnabled,.85],[bolts,stormEnabled,.3]])for(let i=list.length-1;i>=0;i--){list[i].age+=dt;if(!on||list[i].age>=maxAge)list.splice(i,1);}
    }
    function ground(ctx,projectiles,areas,camera,meteorEnabled,stormEnabled){
        if((!meteorEnabled&&!stormEnabled)||failed)return;
        if(meteorEnabled){
            for(const p of projectiles){if(!p.meteorTarget||p.life<=0||!visible(p.meteorTarget.x,p.meteorTarget.y,camera))continue;const t=Math.min(1,(p.age === undefined ? 0 : p.age)/.3);glow(ctx,p.meteorTarget.x,p.meteorTarget.y,25+t*17,'#f79c3b',.14+t*.12);ring(ctx,p.meteorTarget.x,p.meteorTarget.y,14+t*12,'#ffbb66',.6,.45);}
            for(const fx of impacts){if(!visible(fx.x,fx.y,camera))continue;const t=fx.age/.85;glow(ctx,fx.x,fx.y,fx.radius*.7,'#e96920',(1-t)*.35);ring(ctx,fx.x,fx.y,fx.radius*(.2+t),'#ffb75e',(1-t)*.8,.5);}
        }
        if(stormEnabled){let count=0;for(const area of areas){if(area.element!=='lightning'||!area.bonus.stormMode||!visible(area.x,area.y,camera)||count++>=MAX_STORMS)continue;ring(ctx,area.x,area.y,area.radius,'#92b8ff',Math.min(.22,area.time*.3));glow(ctx,area.x,area.y,area.radius,'#7d95dd',.08);}}
    }
    function foreground(ctx,areas,camera,meteorEnabled,stormEnabled,now=performance.now()){
        if((!meteorEnabled&&!stormEnabled)||failed)return;
        if(meteorEnabled)for(const fx of impacts){if(!visible(fx.x,fx.y,camera))continue;const t=fx.age;
            ctx.save();ctx.globalAlpha=Math.max(0,1-t/.85);for(let i=0;i<9;i++){const a=i*2.399,dx=Math.cos(a)*(35+i*5)*t,dy=Math.sin(a)*30*t-(110+i*5)*t+170*t*t;ctx.save();ctx.translate(fx.x+dx,fx.y+dy);ctx.rotate(a+t*6);ctx.fillStyle=i%3?'#866451':'#ffc076';ctx.fillRect(-3,-2,6,4);ctx.restore();}ctx.restore();}
        if(!stormEnabled)return;
        for(const bolt of bolts){if(!visible(bolt.tx,bolt.ty,camera))continue;const alpha=1-bolt.age/.3;ctx.save();ctx.globalAlpha=alpha;ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(bolt.x,bolt.y);
            for(let j=1;j<=8;j++){const t=j/8;ctx.lineTo(bolt.x+(bolt.tx-bolt.x)*t+(j===8?0:Math.sin(j*23+bolt.seed)*12),bolt.y+(bolt.ty-bolt.y)*t);}
            ctx.strokeStyle='#6a8fff';ctx.lineWidth=6;ctx.stroke();ctx.strokeStyle='#e1efff';ctx.lineWidth=1.8;ctx.stroke();ctx.restore();glow(ctx,bolt.tx,bolt.ty+12,25,'#b9cdff',alpha*.4);}
    }
    function clear(){impacts.length=0;bolts.length=0;}
    return {prepare:()=>texture(performance.now()),meteor,impact,pulse,update,ground,foreground,clear,getStats:()=>({ready:!!gl,failed,frames,impacts:impacts.length,bolts:bolts.length,pixels:CELL*CELL,maxStorms:MAX_STORMS})};
})();
