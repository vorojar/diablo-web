const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const scope = { console, Image: class {}, document: { createElement: () => createCanvas(1, 1) } };
vm.createContext(scope);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../art-samples.js'), 'utf8') + ';this.art = ArtSamples;', scope);
const source = createCanvas(80, 40);
const ctx = source.getContext('2d');
ctx.fillStyle = '#fff'; ctx.fillRect(10, 10, 10, 20);
ctx.fillStyle = '#f0f'; ctx.fillRect(55, 5, 10, 20);
const atlas = scope.art.normalizeAtlas(source, 2, 1);
assert.equal(atlas.width, 256); assert.equal(atlas.height, 128);
function bounds(cell) {
    const data = atlas.getContext('2d').getImageData(cell * 128, 0, 128, 128).data;
    let minX = 128, maxX = -1, minY = 128, maxY = -1;
    for (let y=0;y<128;y++) for(let x=0;x<128;x++) if(data[(y*128+x)*4+3]>32) {
        minX=Math.min(minX,x); maxX=Math.max(maxX,x); minY=Math.min(minY,y); maxY=Math.max(maxY,y);
    }
    return {minX,maxX,minY,maxY};
}
assert.deepEqual(bounds(0), bounds(1), '同尺寸不同原始位置的帧必须对齐');
assert.equal(bounds(0).maxY, 123, '脚底落在124px边界');
const pixel = atlas.getContext('2d').getImageData(192, 80, 1, 1).data;
assert.deepEqual(Array.from(pixel), [255,0,255,255], '紫色细节不可抠除');
ctx.fillStyle = '#fff';ctx.fillRect(0,0,80,40);
assert.throws(()=>scope.art.normalizeAtlas(source,2,1), /透明/, '假透明图片必须拒绝');
const empty = createCanvas(80,40);
assert.throws(()=>scope.art.normalizeAtlas(empty,2,1), /空帧/, '缺帧必须拒绝');
console.log('PASS: 美术图集透明度、锚点、共享缩放与缺帧校验');
const irregular=createCanvas(80,80), irregularContext=irregular.getContext('2d');
irregularContext.fillStyle='#fff';
for(const x of [10,50]) {irregularContext.fillRect(x,5,10,20);irregularContext.fillRect(x,34,10,20);}
assert.doesNotThrow(()=>scope.art.normalizeAtlas(irregular,2,2),'等分线穿过人物时应使用附近透明留白');
irregularContext.fillRect(10,0,10,80);
assert.throws(()=>scope.art.normalizeAtlas(irregular,2,2),/交叠/,'连通跨行内容不可截断后接入');
(async()=>{
    for(const [key,definition] of Object.entries(scope.art.definitions)) {
        const image=await loadImage(path.join(__dirname,'..',definition.file));
        const normalized=scope.art.normalizeAtlas(image,definition.cols,definition.rows);
        assert.equal(normalized.contentBounds.length,definition.cols*definition.rows);
        for(const b of normalized.contentBounds) {
            assert.ok(b.sw>0 && b.sh>0 && b.sw<=112 && b.sh<=88.001);
        }
        console.log(`PASS: 实际素材 ${key} / ${normalized.contentBounds.length}帧 / 真实透明且不截帧`);
    }
})().catch(error=>{console.error(error);process.exitCode=1;});
