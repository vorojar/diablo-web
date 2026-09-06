'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {spawn}=require('node:child_process');
(async()=>{
    const child=spawn(process.execPath,[path.join(__dirname,'qa-server.js'),'--port','0'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    try {
        const address=await new Promise((resolve,reject)=>{
            let output='';
            const timer=setTimeout(()=>reject(new Error('QA server 启动超时')),5000);
            child.once('error',error=>{clearTimeout(timer);reject(error);});
            child.once('exit',code=>{clearTimeout(timer);reject(new Error(`QA server 提前退出 ${code}`));});
            child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('\n')){clearTimeout(timer);resolve(JSON.parse(output.trim()));}});
        });
        const base=new URL(address.url).origin;
        const fixture=await fetch(address.url);
        assert.match(fixture.headers.get('content-security-policy'),/connect-src 'self'/);
        const fixtureHtml=await fixture.text();
        assert.match(fixtureHtml,/src="\/tools\/qa-fixture.js"/);
        assert(fixtureHtml.indexOf('/tools/qa-bootstrap.js') >= 0 && fixtureHtml.indexOf('/tools/qa-bootstrap.js') < fixtureHtml.indexOf('src="gsap.min.js"'), '错误收集必须先于所有游戏脚本');
        assert.match(await(await fetch(base+'/qa.html?touch=1')).text(), /qa-bootstrap\.js\?touch=1/);
        assert.equal(await (await fetch(address.original)).text(),fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'));
        const online=await(await fetch(base+'/online.js?v=test')).text();
        assert.match(online,/线上脚本已由服务器隔离替换/);assert.doesNotMatch(online,/new PocketBase|https?:\/\//);
        const chatStates=[];
        vm.runInNewContext(online+'\ntoggleChatBox();toggleChatBox();',{document:{getElementById(){return {classList:{toggle(name,state){chatStates.push([name,state]);}}};}}});
        assert.deepEqual(chatStates,[['collapsed',false],['collapsed',true]],'隔离聊天入口必须切换真实折叠状态');
        for(const file of ['market.js','pocketbase.umd.js'])assert.match(await(await fetch(base+'/'+file)).text(),/线上服务禁用/);
        assert.equal((await fetch(base+'/..%5c..%5cWindows/system.ini')).status,404);
        assert.equal((await fetch(base+'/qa.html',{method:'POST'})).status,405);
        assert.equal((await fetch(base+'/game.js')).status,200);
        console.log('PASS: QA fixture injection, original HTML, online isolation and local path boundary');
    } finally {child.kill();await new Promise(resolve=>child.once('exit',resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
