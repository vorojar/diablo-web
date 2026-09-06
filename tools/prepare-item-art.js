// 仅沿原生透明留白切格并等比居中，不按颜色抠图。
const fs=require('node:fs'),path=require('node:path');
const {loadImage,createCanvas}=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'..');
function cuts(data,width,height,vertical,clipStart=0,clipEnd=width){
    const extent=vertical?width:height,cross=vertical?height:width,result=[0];
    for(let i=1;i<4;i++){
        const ideal=extent*i/4,radius=extent/16;let best=-1;
        for(let at=Math.ceil(ideal-radius);at<=Math.floor(ideal+radius);at++){
            let empty=true;
            for(let q=vertical?0:clipStart;q<(vertical?cross:clipEnd);q++)if(data[((vertical?q:at)*width+(vertical?at:q))*4+3]!==0){empty=false;break;}
            if(empty&&(best<0||Math.abs(at-ideal)<Math.abs(best-ideal)))best=at;
        }
        if(best<0)throw new Error(`第${i}条${vertical?'列':'行'}边界没有完整透明留白`);
        result.push(best);
    }
    return [...result,extent];
}
(async()=>{
    const image=await loadImage(path.join(root,'items-painted-source.png'));
    const scan=createCanvas(image.width,image.height),context=scan.getContext('2d');context.drawImage(image,0,0);
    const data=context.getImageData(0,0,image.width,image.height).data;
    let transparent=0;for(let i=3;i<data.length;i+=4)if(data[i]===0)transparent++;
    if(transparent/(image.width*image.height)<.2)throw new Error('物品图集不是原生透明图片');
    const xs=cuts(data,image.width,image.height,true);
    // 不同列的物品高度不同，各列分别寻找完整透明行，不能按固定横线裁掉盾牌尖顶。
    const rowsByColumn=Array.from({length:4},(_,col)=>cuts(data,image.width,image.height,false,xs[col],xs[col+1]));
    const output=createCanvas(1024,1024),out=output.getContext('2d'),frames=[];
    for(let row=0;row<4;row++)for(let col=0;col<4;col++){
        const ys=rowsByColumn[col];
        let left=xs[col+1],right=-1,top=ys[row+1],bottom=-1;
        for(let y=ys[row];y<ys[row+1];y++)for(let x=xs[col];x<xs[col+1];x++)if(data[(y*image.width+x)*4+3]>0){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
        if(right<left)throw new Error(`物品格${row},${col}为空`);
        const width=right-left+1,height=bottom-top+1,scale=224/Math.max(width,height);
        out.drawImage(image,left,top,width,height,col*256+(256-width*scale)/2,row*256+(256-height*scale)/2,width*scale,height*scale);
        frames.push({row,col,source:{left,top,width,height},scale});
    }
    fs.writeFileSync(path.join(root,'items-painted.png'),output.toBuffer('image/png'));
    fs.mkdirSync(path.join(root,'art/items'),{recursive:true});
    fs.writeFileSync(path.join(root,'art/items/extraction.json'),JSON.stringify({source:'items-painted-source.png',output:'items-painted.png',transparentRatio:transparent/(image.width*image.height),columns:xs,rowsByColumn,frames},null,2)+'\n');
    console.log('PASS 16格物品图集：真实alpha、完整透明分隔线、1024×1024固定格居中');
})().catch(error=>{console.error(error);process.exitCode=1;});
