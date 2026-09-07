const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../game.js'),'utf8');
const begin=source.indexOf("} else if (e.ai === 'specter') {")+"} else if (e.ai === 'specter') {".length;
const end=source.indexOf('} else {\r\n            // 普通chase AI',begin);
assert(begin>0&&end>begin);
const scope={player:{x:100,y:100},projectiles:[],CAST_SOURCE_VFX:{enemyLightning:'lightning'},setMonsterFacingToward(){},startMonsterAttack(){scope.attacks++;},attacks:0,
 isWall:(x,y)=>x>=160||x<0||y<0||y>=400,
 hasLineOfSight:(x,y,px,py)=>!scope.isWall(x,y)&&!scope.isWall(px,py)};
vm.createContext(scope);
vm.runInContext('function tick(e,dt){const dx=player.x-e.x,dy=player.y-e.y,distSq=dx*dx+dy*dy,currentSpeed=e.speed;'+source.slice(begin,end)+'}',scope);
const e={x:139,y:100,radius:20,speed:70,cooldown:0};
for(let i=0;i<120;i++)scope.tick(e,1/60);
assert(e.x+e.radius<160,'追堵两秒后幽魂不能退进墙体，x='+e.x);
assert(scope.attacks>0,'被墙堵住退路时应原地攻击而非永久逃跑');
const hidden={x:180,y:100,radius:20,speed:70,cooldown:1};scope.tick(hidden,.1);
assert(hidden.x<180,'墙内且近距离时必须朝玩家脱离，不能继续后退');
const before=scope.attacks;scope.tick(hidden,.1);assert.equal(scope.attacks,before,'墙内无视线不能发射');
const largeStep={x:125,y:100,radius:20,speed:70,cooldown:1};scope.tick(largeStep,1);
assert(largeStep.x+largeStep.radius<160,'长帧后退也不能越过墙');
scope.isWall=(x,y)=>x<0||x>=400||y<0||y>=400;
const open={x:140,y:100,radius:20,speed:70,cooldown:1};scope.tick(open,.1);assert(open.x>140,'空地保留保持距离行为');
const coincident={x:100,y:100,radius:20,speed:70,cooldown:0};scope.tick(coincident,.1);assert(Number.isFinite(coincident.x)&&Number.isFinite(coincident.y),'重叠位置不能产生NaN');
// 再通过完整敌人更新入口回放玩家持续追堵与后退再接近。
const updateStart=source.indexOf('function updateEnemies(dt) {');
const updateEnd=source.indexOf('// --- Rendering ---',updateStart);
scope.processScheduledMonsterAttacks=()=>{};
scope.SkillBranchSystem={speedMultiplier:()=>1};scope.directionFromDelta=()=> 'right';
vm.runInContext(source.slice(updateStart,updateEnd),scope);
scope.isWall=(x,y)=>x>=160||x<0||y<0||y>=400;
const chased={ai:'specter',x:130,y:100,radius:20,speed:70,cooldown:0};scope.enemies=[chased];
let minGap=Infinity;
for(let i=0;i<600;i++){
 scope.player.x=i<300?Math.min(125,100+i*.2):Math.min(125,80+(i-300)*.2);
 scope.updateEnemies(1/60);
 assert(chased.x+chased.radius<160,'完整AI追堵期间不得进入墙内');
 minGap=Math.min(minGap,Math.hypot(chased.x-scope.player.x,chased.y-scope.player.y));
}
assert(minGap<50,'玩家必须能追到近战可命中距离');
console.log('PASS: 幽魂追堵、墙内脱离、隔墙禁射、长帧、空地后退与完整AI十秒追堵回放');
