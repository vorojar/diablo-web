'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'qa-bootstrap.js'),'utf8');
for(const touch of ['0','1']) {
    const handlers={};
    const window={addEventListener(type,fn){handlers[type]=fn;}};
    const navigator={};
    vm.runInNewContext(source,{window,navigator,URL,document:{currentScript:{src:`http://127.0.0.1/tools/qa-bootstrap.js?touch=${touch}`}}});
    assert.equal('ontouchstart' in window,touch==='1');
    assert.equal(window.qaDiagnostics.simulatedTouch,touch==='1');
    if(touch==='1')assert.equal(navigator.maxTouchPoints,1);
    handlers.error({message:'脚本初始化失败'});
    handlers.error({target:{src:'/missing.png'}});
    handlers.unhandledrejection({reason:new Error('异步加载失败')});
    assert.equal(window.qaDiagnostics.errorCount,2);assert.equal(window.qaDiagnostics.rejectionCount,1);
    assert.match(window.qaDiagnostics.errors[0].message,/脚本初始化失败/);
    assert.match(window.qaDiagnostics.errors[1].message,/missing.png/);
    assert.match(window.qaDiagnostics.errors[2].message,/异步加载失败/);
    for(let i=0;i<25;i++)handlers.error({message:String(i)});
    assert.equal(window.qaDiagnostics.errors.length,20);assert.equal(window.qaDiagnostics.errorCount,27);
}
console.log('PASS: QA early errors, rejected promises, bounded history and touch-only simulation');
