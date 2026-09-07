// 使用 draw() 的真实可见实体队列，防止选帧正确但死亡实体在绘制前被过滤。
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(require('node:path').join(__dirname,'../game.js'),'utf8');
const start=code.indexOf('renderEnemies.length = 0;');
const end=code.indexOf('renderEnemies.sort(',start);
assert(start>=0&&end>start);
const alive={x:20,y:20},dying={x:40,y:40,dead:true,deathVisualTimer:.6},expired={x:50,y:50,dead:true,deathVisualTimer:0};
const scope=vm.createContext({renderEnemies:[],enemies:[alive,dying,expired,{x:9999,y:0,dead:true,deathVisualTimer:1}],camera:{x:0,y:0},viewportWidth:500,viewportHeight:500});
vm.runInContext(code.slice(start,end),scope);
assert.deepEqual(Array.from(scope.renderEnemies),[alive,dying],'死亡播放期必须进入真实渲染队列，结束后剔除');
console.log('PASS: 真实渲染队列保留倒地中的怪物，并剔除过期尸体与屏外实体');
