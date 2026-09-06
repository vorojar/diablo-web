'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {loadImage,createCanvas}=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'..');
const constants=fs.readFileSync(path.join(root,'constants.js'),'utf8');
const treeStart=constants.indexOf('const SKILL_TREE ='),treeEnd=constants.indexOf('\n};',treeStart);
const context=vm.createContext({document:{readyState:'loading',addEventListener(){}},MutationObserver:class{}});
vm.runInContext(constants.slice(treeStart,treeEnd+3)+';this.tree=SKILL_TREE;',context);
vm.runInContext(fs.readFileSync(path.join(root,'skill-art.js'),'utf8')+';this.art=SkillArt;',context);
(async()=>{
  let count=0;const hashes=new Set();
  for(const [skill,definition] of Object.entries(context.tree)) {
    const expected=[...Object.keys(definition.stage2),...Object.values(definition.stage3).flatMap(branch=>Object.keys(branch))];
    assert.deepEqual(Object.keys(context.art.definitions[skill]).sort(),expected.sort(),`${skill} 每个分支必须有独立映射`);
    // 对真实技能配置逐项运行挂载函数，验证同名跨技能节点不会串图，基础图标保留。
    const sprites=expected.map(()=>({dataset:{},style:{}}));
    const base={dataset:{skill,node:skill,stage:'1'},querySelector(){throw new Error('基础图标不应被改动');}};
    const nodes=expected.map((node,i)=>({dataset:{skill,node,stage:'2'},querySelector(){return sprites[i];}}));
    const dom={querySelectorAll(selector){return selector.startsWith('.skill-tree-node')?[base,...nodes]:[];}};
    context.art.refresh(dom);context.art.refresh(dom);
    for(let i=0;i<expected.length;i++) {
      assert.equal(sprites[i].dataset.skillArt,`${skill}/${expected[i]}`);
      assert(sprites[i].style.backgroundImage.includes(context.art.definitions[skill][expected[i]]));
      assert.equal(sprites[i].style.backgroundSize,'contain');
      assert.equal(sprites[i].style.backgroundPosition,'center');
    }
    for(const node of expected) {
      const file=context.art.definitions[skill][node];
      const image=await loadImage(path.join(root,file));
      assert.equal(image.width,128);assert.equal(image.height,128);
      const canvas=createCanvas(128,128),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
      const data=ctx.getImageData(0,0,128,128).data;
      let transparent=0,painted=0,partial=0;
      for(let y=0;y<128;y++)for(let x=0;x<128;x++){
        const alpha=data[(y*128+x)*4+3];if(alpha===0)transparent++;if(alpha>100)painted++;if(alpha>0&&alpha<255)partial++;
        if(x<7||x>120||y<7||y>120)assert.equal(alpha,0,`${file} 不能截断边界`);
      }
      assert(transparent>16384*.2&&painted>16384*.08&&partial>0,`${file} 必须有真实透明、可见主体及半透明边缘`);
      const hash=require('node:crypto').createHash('sha256').update(Buffer.from(data)).digest('hex');assert(!hashes.has(hash),'独立分支不能复用同一图标');hashes.add(hash);count++;
    }
  }
  assert.equal(count,24);console.log('PASS: 全部24技能分支独立映射、实际RGBA、透明留白及无截断');
})().catch(error=>{console.error(error);process.exitCode=1;});
