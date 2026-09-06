'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const fixture=fs.readFileSync(path.join(__dirname,'qa-fixture.js'),'utf8');
const game=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
const wall=game.match(/function isWall\([^\n]+/)[0];
const losStart=game.indexOf('function hasLineOfSight('),losEnd=game.indexOf('\n}',losStart);
const targetStart=fixture.indexOf('const px=Math.floor(player.x/TILE_SIZE)'),targetEnd=fixture.indexOf('if(!tile)',targetStart);
const code=wall+'\n'+game.slice(losStart,losEnd+2)+'\nfunction choose(){'+fixture.slice(targetStart,targetEnd)+'return tile;}';
function choose(map) {
    const scope={TILE_SIZE:40,MAP_WIDTH:7,MAP_HEIGHT:7,mapData:map,player:{x:140,y:140}};
    vm.createContext(scope);vm.runInContext(code,scope);return scope.choose();
}
const open=Array.from({length:7},()=>Array(7).fill(1));
let target=choose(open);assert(target,'地板1必须可选');assert.equal(open[Math.floor(target.y/40)][Math.floor(target.x/40)],1);assert(Math.hypot(target.x-140,target.y-140)<=100);
const blocked=Array.from({length:7},()=>Array(7).fill(0));blocked[3][3]=1;
assert.equal(choose(blocked),null,'周围墙0不能被选为目标');
const corridor=Array.from({length:7},()=>Array(7).fill(0));corridor[3][3]=1;corridor[4][3]=1;
target=choose(corridor);assert.deepEqual(JSON.parse(JSON.stringify(target)),{x:140,y:180});
console.log('PASS: QA target uses real floor/wall and line-of-sight rules within skill range');
