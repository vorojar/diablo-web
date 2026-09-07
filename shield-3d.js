// 正交投影球面：同一次 GPU 绘制输出前后半球，沿用角色原有遮挡顺序。
const Shield3D = (() => {
    const size = 160;
    let enabled = true, canvas, gl, program, uniforms, failed = false;
    let hitTime = -10, hitX = .7, hitY = .2, lastFrame = -1;
    let frames = 0, renderMs = 0;
    const vertex = `attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}`;
    const fragment = `precision mediump float;
uniform float time, health, impactAge;
uniform vec2 impact;
uniform vec3 tint;
void main(){
 float front=step(160.,gl_FragCoord.x);
 vec2 p=vec2(mod(gl_FragCoord.x,160.)/160.,gl_FragCoord.y/160.)*2.-1.;
 p/=0.9;
 float r2=dot(p,p); if(r2>1.) discard;
 float z=sqrt(max(0.,1.-r2));
 vec3 n=vec3(p,z*(front*2.-1.));
 float rim=pow(1.-z,2.7);
 float light=max(0.,dot(n,normalize(vec3(-.5,.7,1.))));
 float spec=pow(max(0.,dot(n,normalize(vec3(-.38,.55,1.)))),38.);
 float longitude=atan(n.z,n.x)+time*.32;
 float latitude=asin(n.y);
 float band=pow(max(0.,cos(latitude*13.+sin(longitude*3.+time)*.4)),45.);
 float weave=pow(max(0.,cos(longitude*9.+latitude*2.)),55.);
 float grid=(band+weave*.55)*(.06+.12*rim);
 vec3 hitNormal=normalize(vec3(impact,sqrt(max(.06,1.-dot(impact,impact)))));
 float distanceOnSphere=acos(clamp(dot(n,hitNormal),-1.,1.));
 float wave=exp(-pow((distanceOnSphere-impactAge*3.)*15.,2.))*max(0.,1.-impactAge/1.1);
 float edge=smoothstep(0.,.025,1.-r2);
 float alpha=(.025+rim*.48+spec*.26+grid+wave*.65)*edge*(.5+.5*health);
 alpha*=mix(.42,1.,front);
 vec3 color=tint*(.68+light*.4)+vec3(1.,.92,.65)*(spec*.8+wave*.8);
 gl_FragColor=vec4(color*alpha,alpha);
}`;
    function init() {
        if (gl || failed) return !!gl;
        canvas = document.createElement('canvas'); canvas.width = size * 2; canvas.height = size;
        gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, preserveDrawingBuffer: true });
        if (!gl) { failed = true; return false; }
        canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); gl = null; failed = true; });
        const compile = (type, source) => {
            const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
            return shader;
        };
        // GPU 初始化是边界：不可用时保持既有2D护盾，并明确记录原因。
        try {
            program = gl.createProgram();
            const shaders = [compile(gl.VERTEX_SHADER, vertex), compile(gl.FRAGMENT_SHADER, fragment)];
            shaders.forEach(shader => gl.attachShader(program, shader)); gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
            shaders.forEach(shader => gl.deleteShader(shader));
            gl.useProgram(program);
            const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
            const position = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
            uniforms = Object.fromEntries(['time','health','impactAge','impact','tint'].map(key => [key,gl.getUniformLocation(program,key)]));
        } catch (error) { console.warn('立体护盾初始化失败，使用原有护盾', error); gl = null; failed = true; return false; }
        return true;
    }
    function draw(ctx, x, y, shield, front, now = performance.now()) {
        if (!enabled || !shield.active || shield.value <= 0 || !init()) return false;
        if (!front || lastFrame < 0) {
            const begin = performance.now();
            gl.viewport(0,0,size*2,size); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
            gl.uniform1f(uniforms.time, now/1000); gl.uniform1f(uniforms.health, Math.min(1,shield.value/shield.maxValue));
            gl.uniform1f(uniforms.impactAge, now/1000-hitTime); gl.uniform2f(uniforms.impact,hitX,hitY);
            const tint = shield.type === 'reflect' ? [.75,.52,1.] : shield.type === 'guard' ? [.36,.91,.55] : [1.,.82,.38];
            gl.uniform3fv(uniforms.tint,tint); gl.drawArrays(gl.TRIANGLES,0,6);
            lastFrame = now; frames++; renderMs = performance.now()-begin;
        }
        ctx.drawImage(canvas,front?size:0,0,size,size,x-49,y-83,98,108);
        return true;
    }
    return {
        draw,
        hit(dx,dy,now=performance.now()) {
            const length=Math.hypot(dx,dy);
            hitX=length>0?dx/length*.78:.7; hitY=length>0?-dy/length*.65:.2; hitTime=now/1000;
        },
        setEnabled(value) { enabled=!!value; },
        getStats() { return {enabled,ready:!!gl,failed,frames,renderMs,pixels:size*size*2}; }
    };
})();
