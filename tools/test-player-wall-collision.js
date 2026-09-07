const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const game=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
function extract(name){const start=game.indexOf(`function ${name}(`);if(start<0)return null;let depth=0;for(let i=game.indexOf('{',start);i<game.length;i++){if(game[i]==='{')depth++;if(game[i]==='}'&&!--depth)return game.slice(start,i+1);}}
const scope=vm.createContext({TILE_SIZE:40,MAP_WIDTH:7,MAP_HEIGHT:7,mapData:Array.from({length:7},()=>Array(7).fill(1)),player:{x:100,y:100,radius:12}});
vm.runInContext(extract('isWall'),scope);
if(extract('movePlayerWithCollision')){
    vm.runInContext(extract('canPlayerOccupy')+'\n'+extract('movePlayerWithCollision'),scope);
}else{
    // 原始真实移动分支：仅检测中心点，先复现再替换。
    const start=game.indexOf('if (!isWall(nx, player.y)) player.x = nx;');
    assert(start>=0);const end=game.indexOf('const movedX',start);
    vm.runInContext('function movePlayerWithCollision(nx,ny){'+game.slice(start,end)+'}',scope);
}
for(let r=0;r<7;r++)scope.mapData[r][3]=0;
scope.movePlayerWithCollision(119,100);
assert(scope.player.x<=108,`贴墙应保留12px半径，实际x=${scope.player.x}`);
scope.player.x=100;scope.movePlayerWithCollision(200,100);
assert(scope.player.x<=108,'大步长不能穿过整格墙');
scope.player.x=100;scope.player.y=100;scope.movePlayerWithCollision(135,145);
assert(scope.player.x<=108&&scope.player.y>100,'撞墙后应沿墙滑动');
scope.mapData=Array.from({length:7},()=>Array(7).fill(1));scope.mapData[3][3]=0;
scope.player.x=100;scope.player.y=100;scope.movePlayerWithCollision(119,119);
assert(Math.hypot(120-scope.player.x,120-scope.player.y)>=12,'不能切入对角墙角');
scope.player.x=20;scope.player.y=60;scope.movePlayerWithCollision(-50,60);
assert(scope.player.x>=12,'地图边界同样保留碰撞半径');
scope.mapData=Array.from({length:7},()=>Array(7).fill(0));for(let r=0;r<7;r++)scope.mapData[r][2]=1;
scope.player.x=100;scope.player.y=60;scope.movePlayerWithCollision(100,200);
assert(Math.abs(scope.player.y-200)<1e-8,'一格宽走廊必须可通行');
scope.mapData=Array.from({length:7},()=>Array(7).fill(1));for(let r=0;r<7;r++)scope.mapData[r][3]=0;
scope.player.x=119;scope.player.y=100;scope.movePlayerWithCollision(90,100);
assert(scope.player.x<=108,'旧存档已经压进墙边时仍可脱离');
console.log('PASS: 贴墙半径、跨格扫掠、沿墙滑动、对角墙角、地图边界与窄走廊');
