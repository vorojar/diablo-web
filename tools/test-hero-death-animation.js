const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(require('node:path').join(__dirname,'../game.js'),'utf8');
function extract(name){const start=code.indexOf(`function ${name}(`);assert(start>=0,name);let depth=0;for(let i=code.indexOf('{',start);i<code.length;i++){if(code[i]==='{')depth++;if(code[i]==='}'&&--depth===0)return code.slice(start,i+1);}}
let shows=0;
const scope=vm.createContext({hasTalent:()=>false,player:{hp:0,isDead:false,x:0,y:0},SkillBranchSystem:{reset(){}},
    AutoBattle:{enabled:false},DeathPanel:{show(){shows++;}},document:{getElementById:()=>({classList:{add(){}}})},createFloatingText(){}});
vm.runInContext(extract('checkPlayerDeath'),scope);
scope.checkPlayerDeath();
assert.equal(shows,0,'死亡面板不能遮住刚开始的倒地动画');
vm.runInContext(extract('updateHeroDeathVisual'),scope);
scope.updateHeroDeathVisual(.3);assert.equal(shows,0);
scope.updateHeroDeathVisual(.3);assert.equal(shows,0);
scope.updateHeroDeathVisual(.4);assert.equal(shows,1,'完整倒地后必须弹出复活入口');
scope.updateHeroDeathVisual(1);assert.equal(shows,1,'停在死亡末帧不能反复弹窗或播放音效');
scope.player.isDead=false;scope.player.hp=0;scope.checkPlayerDeath();
assert.equal(scope.player.deathTimer,0,'下一次死亡从首帧开始');
console.log('PASS: 真实死亡入口先播倒地，完成后仅弹窗一次，再次死亡重置动画');
