// 只由本地 QA HTML 在游戏脚本之前加载。
(() => {
    const simulatedTouch=new URL(document.currentScript.src).searchParams.get('touch')==='1';
    const diagnostics={errors:[],errorCount:0,rejectionCount:0,simulatedTouch};
    window.qaDiagnostics=diagnostics;
    function record(kind,message) {
        diagnostics.errors.push({kind,message:String(message)});
        if(diagnostics.errors.length>20)diagnostics.errors.shift();
    }
    window.addEventListener('error',event=>{
        diagnostics.errorCount++;
        record('error',event.message || `资源加载失败: ${event.target.src || event.target.href || '未知资源'}`);
    },true);
    window.addEventListener('unhandledrejection',event=>{
        diagnostics.rejectionCount++;
        record('unhandledrejection',event.reason?.stack || event.reason);
    });
    if(simulatedTouch) {
        // 触发生产已有的 ontouchstart 检测；这只是脚本路径模拟，不是真机触控验收。
        if(!('ontouchstart' in window))Object.defineProperty(window,'ontouchstart',{value:null,writable:true,configurable:true});
        Object.defineProperty(navigator,'maxTouchPoints',{get:()=>1,configurable:true});
    }
})();
