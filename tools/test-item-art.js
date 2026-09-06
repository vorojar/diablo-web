const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {loadImage,createCanvas}=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'..'),code=fs.readFileSync(path.join(root,'item-system.js'),'utf8');
const context=vm.createContext({itemSpritesLoaded:true,RARITY:{RARE:3},getRarityColor:()=> '#abcdef'});
vm.runInContext(code.slice(0,code.indexOf('// 统计追踪：'))+';globalThis.frames=ITEM_FRAMES;',context);
const cases=[
    {type:'gold',name:'金币'},{type:'potion',name:'治疗药剂',heal:10},{type:'potion',name:'法力药剂',mana:10},{type:'scroll',name:'回城卷轴'},
    {type:'weapon',name:'铁剑'},{type:'weapon',name:'战斧'},{type:'weapon',name:'法杖'},{type:'weapon',name:'长弓'},
    {type:'helm',name:'头盔'},{type:'body',name:'铠甲'},{type:'gloves',name:'手套'},{type:'boots',name:'靴子'},
    {type:'belt',name:'腰带'},{type:'shield',name:'盾牌'},{type:'ring',name:'戒指'},{type:'amulet',name:'项链'}
];
for(const [index,item]of cases.entries()){
    const coords=context.getItemSpriteCoords(item),element={style:{}};
    assert.equal(coords.col,index%4);assert.equal(coords.row,Math.floor(index/4));
    context.applyItemSpriteToElement(element,{...item,rarity:3});
    assert.match(element.style.backgroundImage,/items-painted\.png/,'UI必须使用原生透明新图集');
    assert.equal(element.style.backgroundSize,'400% 400%');
}
(async()=>{
    const image=await loadImage(path.join(root,'items-painted.png'));
    assert.equal(image.width,1024);assert.equal(image.height,1024);
    const canvas=createCanvas(1024,1024),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const hashes=new Set();
    for(let row=0;row<4;row++)for(let col=0;col<4;col++){
        const pixels=ctx.getImageData(col*256,row*256,256,256).data;let transparent=0,visible=0,partial=0;
        for(let y=0;y<256;y++)for(let x=0;x<256;x++){
            const a=pixels[(y*256+x)*4+3];if(a===0)transparent++;if(a>100)visible++;if(a>0&&a<255)partial++;
            if(x<12||x>243||y<12||y>243)assert.equal(a,0,`物品${row},${col}边缘不能截断或串格`);
        }
        assert.ok(transparent>256*256*.2&&visible>256*256*.07&&partial>0,`物品${row},${col}透明或内容校验失败`);
        hashes.add(require('node:crypto').createHash('sha256').update(Buffer.from(pixels)).digest('hex'));
    }
    assert.equal(hashes.size,16,'16种物品必须各有独立内容');
    console.log('PASS 16物品真实映射/UI接线/RGBA留白/无截断/独立图标');
})().catch(error=>{console.error(error);process.exitCode=1;});
