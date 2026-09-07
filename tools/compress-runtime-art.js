// 发布无损WebP；原始PNG和烘焙PNG保留，可见RGB与alpha必须完全一致。
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const {readManifest,sourceHash}=require('./prepare-art-atlases');
async function compress(source,destination) {
    const bytes=await sharp(source).webp({lossless:true,effort:6}).toBuffer();
    const original=await sharp(source).ensureAlpha().raw().toBuffer();
    const decoded=await sharp(bytes).ensureAlpha().raw().toBuffer();
    if(original.length!==decoded.length)throw new Error(`尺寸改变：${source}`);
    for(let i=0;i<original.length;i+=4){
        if(original[i+3]!==decoded[i+3]||(original[i+3]>0&&(original[i]!==decoded[i]||original[i+1]!==decoded[i+1]||original[i+2]!==decoded[i+2])))throw new Error(`无损校验失败：${source}`);
    }
    fs.writeFileSync(destination,bytes);
    return {bytes:bytes.length,SHA256:sourceHash(bytes)};
}
async function main(){
    const root=path.resolve(__dirname,'..'),manifest=readManifest(root,true);let before=0,after=0;
    for(const entry of Object.values(manifest)){
        const output=entry.file.replace(/\.png$/,'.webp');
        const result=await compress(path.join(root,entry.file),path.join(root,output));
        entry.runtimeFile=output;entry.runtimeSHA256=result.SHA256;
        before+=fs.statSync(path.join(root,entry.file)).size;after+=result.bytes;
    }
    for(const file of ['items-painted.png','skills-painted.png','vfx_sheet.png']){
        const result=await compress(path.join(root,file),path.join(root,file.replace(/\.png$/,'.webp')));
        before+=fs.statSync(path.join(root,file)).size;after+=result.bytes;
    }
    fs.writeFileSync(path.join(root,'art/atlas-manifest.js'),'// 由 prepare-art-atlases.js 与 compress-runtime-art.js 生成；原图更新后依次运行。\nconst ArtAtlasManifest = Object.freeze('+JSON.stringify(manifest,null,2)+');\n');
    console.log(JSON.stringify({files:Object.keys(manifest).length+3,before,after,saved:before-after}));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={compress};
