'use strict';
// 重建技能图标：只按原生alpha透明留白切片/等比缩放，不按颜色抠图。
const fs=require('node:fs'),path=require('node:path');
const {loadImage,createCanvas}=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'..');
const recipe=JSON.parse(fs.readFileSync(path.join(root,'art/skills/recipe.json'),'utf8'));
function gutters(data,width,height,count,vertical) {
  const extent=vertical?width:height,cross=vertical?height:width,result=[0];
  for(let i=1;i<count;i++) {
    const expected=extent*i/count,range=extent/count*.25;
    let runStart=-1,best=null;
    for(let p=Math.floor(expected-range);p<=Math.ceil(expected+range);p++) {
      let empty=true;
      for(let q=0;q<cross;q++) {
        const x=vertical?p:q,y=vertical?q:p;
        if(data[(y*width+x)*4+3]>12){empty=false;break;}
      }
      if(empty&&runStart<0)runStart=p;
      if((!empty||p===Math.ceil(expected+range))&&runStart>=0) {
        const end=empty?p:p-1;
        if(!best||end-runStart>best.end-best.start)best={start:runStart,end};
        runStart=-1;
      }
    }
    if(!best||best.end-best.start<2)throw new Error(`图标第${i}条分隔线无透明留白`);
    result.push(Math.floor((best.start+best.end)/2));
  }
  result.push(extent);return result;
}
(async()=>{
  const report={};
  for(const [skill,nodes] of Object.entries(recipe.icons)) {
    const image=await loadImage(path.join(root,`art/skills/source/${skill}.png`));
    const scan=createCanvas(image.width,image.height),ctx=scan.getContext('2d');ctx.drawImage(image,0,0);
    const data=ctx.getImageData(0,0,image.width,image.height).data;
    let transparent=0;for(let i=3;i<data.length;i+=4)if(data[i]===0)transparent++;
    if(transparent/(image.width*image.height)<.2)throw new Error(`${skill}不是原生透明素材`);
    const xs=gutters(data,image.width,image.height,recipe.columns,true),ys=gutters(data,image.width,image.height,recipe.rows,false);
    report[skill]={transparentRatio:transparent/(image.width*image.height),columns:xs,rows:ys,icons:[]};
    for(let index=0;index<nodes.length;index++) {
      const col=index%recipe.columns,row=Math.floor(index/recipe.columns);
      let left=xs[col+1],right=-1,top=ys[row+1],bottom=-1;
      for(let y=ys[row];y<ys[row+1];y++)for(let x=xs[col];x<xs[col+1];x++)if(data[(y*image.width+x)*4+3]>12){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      if(right<left)throw new Error(`${skill}/${nodes[index]}为空格`);
      left=Math.max(xs[col],left-4);right=Math.min(xs[col+1]-1,right+4);top=Math.max(ys[row],top-4);bottom=Math.min(ys[row+1]-1,bottom+4);
      const width=right-left+1,height=bottom-top+1,scale=(recipe.size-recipe.padding*2)/Math.max(width,height);
      const canvas=createCanvas(recipe.size,recipe.size),out=canvas.getContext('2d');
      out.drawImage(image,left,top,width,height,(recipe.size-width*scale)/2,(recipe.size-height*scale)/2,width*scale,height*scale);
      const file=`art/skills/${skill}-${nodes[index]}.png`;
      fs.writeFileSync(path.join(root,file),canvas.toBuffer('image/png'));
      report[skill].icons.push({node:nodes[index],file,source:{x:left,y:top,width,height}});
    }
  }
  fs.writeFileSync(path.join(root,'art/skills/extraction.json'),JSON.stringify(report,null,2)+'\n');
  console.log('PASS: 已保留原生alpha，切出24个128×128独立技能分支图标');
})().catch(error=>{console.error(error);process.exitCode=1;});
