const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {readManifest}=require('./prepare-art-atlases');
const root=path.resolve(__dirname,'..'),manifest=readManifest(root,true);
function create(fail=false){
    const requests=[];
    class Image {
        set src(url){
            requests.push(url);
            const entry=Object.values(manifest).find(e=>(e.runtimeFile||e.file)===url.split('?')[0]);
            assert(entry,url);this.width=entry.width;this.height=entry.height;
            queueMicrotask(()=>fail?this.onerror():this.onload());
        }
    }
    const scope=vm.createContext({Image,ArtAtlasManifest:manifest,console:{error(){}}});
    vm.runInContext(fs.readFileSync(path.join(root,'art-samples.js'),'utf8')+';this.art=ArtSamples;',scope);
    return {requests,art:scope.art};
}
(async()=>{
    const {requests,art}=create();await art.ready;
    assert.equal(requests.length,9,'首屏仅主角、主角死亡组和基础场景');
    assert(!requests.some(url=>/butcher|zombie|baal/.test(url)));
    assert.equal(art.isLoaded('baal'),false);assert.equal(requests.length,9,'读取加载状态不得触发下载');
    const a=art.ensureMonsters(['zombie','butcher']),b=art.ensureMonsters(['zombie','butcher']);
    assert.equal(art.pending,3,'请求期间必须阻止战斗：两类敌人和额外死亡组');
    await Promise.all([a,b]);assert.equal(art.pending,0);assert.equal(requests.length,12,'并发请求去重');
    assert(art.frame('butcher',0,0).source);assert.equal(requests.length,12);
    const failed=create(true);await assert.rejects(failed.art.ready);await new Promise(resolve=>setImmediate(resolve));
    assert.equal(failed.art.pending,0);assert(failed.art.loadError,'失败必须保持明确错误状态，不能继续隐形战斗');
    console.log('PASS: 首屏按需加载、区域加载、并发去重及加载失败状态');
})().catch(error=>{console.error(error);process.exitCode=1;});
