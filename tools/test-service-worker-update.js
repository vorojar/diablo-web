const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=html.indexOf("navigator.serviceWorker.register('sw.js'");
const end=html.indexOf('\n        }',start),messages=[];
(async()=>{
    // 更新失败必须传回注册链，不能变成未处理Promise。
    await vm.runInNewContext(html.slice(start,end),{navigator:{serviceWorker:{register:()=>Promise.resolve({update:()=>Promise.reject(new Error('update failed'))})}},console:{log:(...args)=>messages.push(args.join(' '))}});
    assert(messages.some(message=>message.includes('update failed')),'更新失败应由入口catch处理');
    console.log('PASS: Service Worker更新失败由注册入口处理');
})().catch(error=>{console.error(error);process.exitCode=1;});
