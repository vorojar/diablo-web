const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),sharp=require('sharp');
const {readManifest,sourceHash}=require('./prepare-art-atlases');
const root=path.resolve(__dirname,'..');
(async()=>{
    const manifest=readManifest(root,true);
    const pairs=Object.values(manifest).map(entry=>{
        assert(entry.runtimeFile?.endsWith('.webp'),'发布清单必须指向WebP');
        assert.equal(sourceHash(fs.readFileSync(path.join(root,entry.runtimeFile))),entry.runtimeSHA256,'发布图不能过期');
        return [entry.file,entry.runtimeFile];
    });
    pairs.push(...['items-painted','skills-painted','vfx_sheet'].map(name=>[name+'.png',name+'.webp']));
    let before=0,after=0;
    for(const [original,runtime] of pairs){
        const source=path.join(root,original),output=path.join(root,runtime);
        const a=await sharp(source).ensureAlpha().raw().toBuffer(),b=await sharp(output).ensureAlpha().raw().toBuffer();
        assert.equal(a.length,b.length,`${runtime} 尺寸一致`);
        for(let i=0;i<a.length;i+=4){
            if(a[i+3]!==b[i+3]||(a[i+3]>0&&(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])))assert.fail(`${runtime} 可见像素或alpha改变：${i/4}`);
        }
        before+=fs.statSync(source).size;after+=fs.statSync(output).size;
    }
    assert(after<before*.85,'无损编码整体至少减少15%');
    console.log(`PASS: ${pairs.length} 张运行WebP可见RGB/alpha逐像素一致，${before} → ${after} bytes`);
})().catch(error=>{console.error(error);process.exitCode=1;});
