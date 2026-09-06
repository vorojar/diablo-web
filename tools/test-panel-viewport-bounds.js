const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const path = require('path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'ui-panels.js'), 'utf8');
const elements = new Map();
const context = { document: { getElementById(id) { return elements.get(id); } }, window: { innerWidth: 1280, innerHeight: 720, addEventListener() {} }, requestAnimationFrame(fn) { fn(); } };
vm.createContext(context);
vm.runInContext(source + '\nthis.manager = panelManager;', context);
// 模拟入场动画临时缩小且下移，最终布局必须按未变换的尺寸约束。
for (const height of [360, 700]) {
    const element = { style: {}, offsetHeight: height, offsetWidth: 352, getBoundingClientRect() { return { left: 908, right: 1242, bottom: 72 + height * .95 + 30, width: 334, height: height * .95 }; } };
    elements.set('inventory-panel', element);
    context.manager.open('inventory');
    const top = element.style.top.endsWith('%') ? parseFloat(element.style.top) * 7.2 : parseFloat(element.style.top);
    assert(top >= 10 && top + height <= 710, `背包实际高度 ${height} 时越界: top=${top}`);
    context.manager.close('inventory');
}
assert(!context.manager.panels.skills.left, '技能树必须保留 CSS 水平居中，不能叠加固定像素左偏移');
console.log('PASS: panel bounds use final layout dimensions');
