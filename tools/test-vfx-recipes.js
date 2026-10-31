'use strict';
const assert=require('node:assert/strict');
const {checkRecipes,checkGenerated,render}=require('./build-vfx');
(async()=>{
 const checks=checkRecipes(),assets=await checkGenerated();
 const pixels=(seed,palette)=>Buffer.from(render('frostBreak',.3,seed,'body',0,palette).getContext('2d').getImageData(0,0,48,48).data);
 assert.notDeepEqual(pixels(1),pixels(19),'种子应实际影响碎片分布');
 assert.notDeepEqual(pixels(1),pixels(1,['#221111','#773333','#cc6666','#ffeeee']),'自定义调色板应改变像素');
 console.log('PASS: '+JSON.stringify({...checks,...assets}));
})().catch(e=>{console.error(e);process.exitCode=1;});
