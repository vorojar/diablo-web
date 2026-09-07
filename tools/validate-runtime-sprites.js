const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),sharp=require('sharp');
const {readManifest,loadCatalog}=require('./prepare-art-atlases');
const root=process.argv[2]||path.resolve(__dirname,'..');
(async()=>{
    const manifest=readManifest(root,true),{definitions}=loadCatalog(root);
    for(const definition of definitions){
        const entry=manifest[definition.file];assert(entry,definition.file);
        const size=await sharp(path.join(root,entry.runtimeFile)).metadata();
        assert.equal(size.width,definition.cols*128,definition.key+' width');
        assert.equal(size.height,definition.rows*128,definition.key+' height');
        assert(size.hasAlpha,definition.key+' alpha');
    }
    const scope={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'vfx-manifest.js'),'utf8'),scope);
    const vfx=scope.window.VFX_SPRITE_MANIFEST;
    const size=await sharp(path.join(root,vfx.sheet.split('?')[0])).metadata();
    for(const [name,effect]of Object.entries(vfx.effects)){
        assert.equal(size.width,effect.frameWidth*effect.frameCount,name+' width');
        assert(size.height>=effect.frameHeight*(effect.row+1),name+' row out of bounds');
    }
    console.log(`PASS: ${definitions.length} 张实际发布图集及 ${Object.keys(vfx.effects).length} 种VFX尺寸/帧边界`);
})().catch(error=>{console.error(error);process.exitCode=1;});
