// 只装配已由生图工具修正的独立帧，不绘画、不抠色、不修改任何输入透明度。
const fs = require('node:fs');
const path = require('node:path');
const {createCanvas,loadImage} = require('@napi-rs/canvas');
const {loadCatalog} = require('./prepare-art-atlases');
const root=path.resolve(__dirname,'..');
const {normalizeAtlas}=loadCatalog(root);
async function compose(recipe) {
    const base=normalizeAtlas(await loadImage(path.join(root,recipe.base)),recipe.cols,recipe.rows);
    const output=createCanvas(base.width,base.height),ctx=output.getContext('2d');
    // 为新补帧中的弓和高举拳头保留空间；全部原帧以同一比例缩放。
    const ratio=80/88;
    for(let i=0;i<recipe.cols*recipe.rows;i++) {
        const x=i%recipe.cols*128,y=Math.floor(i/recipe.cols)*128;
        ctx.drawImage(base,x,y,128,128,x+64*(1-ratio),y+124*(1-ratio),128*ratio,128*ratio);
    }
    const replaced=new Set();
    for(const patch of recipe.patches) {
        if(!Number.isInteger(patch.index)||patch.index<0||patch.index>=recipe.cols*recipe.rows||replaced.has(patch.index)) throw new Error('补帧索引越界或重复');
        replaced.add(patch.index);
        const image=await loadImage(path.join(root,patch.file));
        const frame=normalizeAtlas(image,1,1,{bodyHeight:patch.bodyHeight,targetHeight:patch.targetHeight ?? 80,footX:[patch.footX]});
        const x=patch.index%recipe.cols*128,y=Math.floor(patch.index/recipe.cols)*128;
        ctx.clearRect(x,y,128,128);ctx.drawImage(frame,x,y);
    }
    // 整张装配图仍需通过真实运行时切帧器，不能用补帧绕过空帧、透明度或越界检查。
    normalizeAtlas(output,recipe.cols,recipe.rows);
    const target=path.resolve(root,recipe.output);
    if(path.dirname(target)!==root || !recipe.output.endsWith('.png')) throw new Error('装配输出必须是项目根目录PNG');
    fs.writeFileSync(target,output.toBuffer('image/png'));
    console.log(`COMPOSED: ${recipe.output} / ${replaced.size} 个生图修正帧`);
}
(async()=>{for(const recipe of JSON.parse(fs.readFileSync(path.join(root,'art/source-patches/recipes.json'),'utf8'))) await compose(recipe);})()
    .catch(error=>{console.error(error);process.exitCode=1;});
