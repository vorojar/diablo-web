// 启动不得下载已被新图集替代的历史整图。
const fs=require('node:fs'),assert=require('node:assert/strict');
const game=fs.readFileSync(require('node:path').join(__dirname,'../game.js'),'utf8');
for(const name of ['spriteSheet','heroSpriteSheet','monsterSpriteSheet','envSpriteSheet','destructibleSpriteSheet']) {
    assert(!new RegExp(`\\b${name}\\.src\\s*=`).test(game),`${name} 不应在启动时下载历史整图`);
}
console.log('PASS: 启动不再下载五张已替代的历史图集');
