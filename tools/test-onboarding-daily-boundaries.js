const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
process.env.TZ = 'Asia/Shanghai';
const source = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
const dailySource = fs.readFileSync(path.join(__dirname, '..', 'daily-quest.js'), 'utf8');
function extract(name) {
    const start = source.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, name);
    let depth = 0;
    for (let i = source.indexOf('{', start); i < source.length; i++) {
        if (source[i] === '{') depth++;
        if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
    }
}
let now = new Date('2026-09-06T23:59:59+08:00').getTime();
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
const bubble = {style: {display: 'block'}, dataset: {tutorialKind: 'town'},querySelector:()=>({textContent:''}),classList:{add(){},remove(){}}};
const timers = [];
let shown = 0;
const context = vm.createContext({Date: Clock, window: {}, console: {log() {}},
    player: {lvl: 1, gold: 0, xp: 0, tutorial: {step: 0, completed: false}, floor: 0,
        dailyLogin: {lastLoginDate: null, consecutiveDays: 0, claimedToday: false}},
    document: {getElementById: id => id === 'tutorial-bubble' ? bubble : null},
    setTimeout: fn => timers.push(fn), setInterval: fn => (timers.push(fn), 1), clearInterval() {},
    SaveSystem: {save() {}}, showDailyLoginPanel: () => shown++,
    TUTORIAL_TOWN_STEPS: Array(5), cachedUI: {}, panelManager:{panels:{inventory:{opened:false},skills:{opened:false},shop:{opened:false}}},
    showNotification() {}, AudioSys: {play() {}}, updateMenuIndicators() {}, updateUI() {},
    createDamageNumber() {}, checkLevelUp() {}
});
vm.runInContext(`${extract('getTodayDateString')}\n${dailySource}\nglobalThis.daily = DailyQuestSystem;`, context);
let failures = 0;
function test(name, fn) { try { fn(); console.log(`PASS ${name}`); } catch (e) { failures++; console.error(`FAIL ${name}: ${e.message}`); } }
test('本地午夜更换日期且倒计时一致', () => {
    assert.equal(context.daily.getTodayStr(), '2026-09-06');
    assert.equal(context.daily.getResetTime(), '00:00:01 后重置');
    now += 1000;
    assert.equal(context.daily.getTodayStr(), '2026-09-07');
});
function yesterdayQuest() {
    context.player.dailyQuests = {date: '2026-09-06', quests: [{id: 0, type: 'kill', unlocked: true, completed: true, claimed: false, target: 1, progress: 1, reward: {gold: 100}}]};
}
test('午夜后不能领取昨天奖励', () => {yesterdayQuest(); context.daily.claimReward(0); assert.equal(context.player.gold, 0); assert.equal(context.player.dailyQuests.date, '2026-09-07');});
test('午夜后红点不显示昨天奖励', () => {yesterdayQuest(); assert.equal(context.daily.hasClaimableReward(), false);});
test('午夜后事件计入今天任务', () => {
    yesterdayQuest(); context.daily.generateQuests = () => [{id: 0, type: 'kill', unlocked: true, completed: false, claimed: false, target: 10, progress: 0}];
    context.daily.updateProgress('kill'); assert.equal(context.player.dailyQuests.date, '2026-09-07'); assert.equal(context.player.dailyQuests.quests[0].progress, 1);
});
vm.runInContext(`let pendingDailyLoginPanel = false;\n${extract('checkDailyLogin')}\n${extract('hideTutorialBubble')}\n${extract('updateTutorialBubble')}`, context);
if (source.includes('function maybeShowDailyLoginPanel(')) vm.runInContext(extract('maybeShowDailyLoginPanel'), context);
test('新玩家签到不阻挡初次引导', () => {context.checkDailyLogin(); while (timers.length) timers.shift()(); assert.equal(shown, 0);});
test('进入地牢隐藏城镇气泡', () => {context.player.floor = 1; context.updateTutorialBubble(); assert.equal(bubble.style.display, 'none');});
test('保留自动战斗引导气泡', () => {context.player.tutorial.step = 7; bubble.dataset.tutorialKind = 'battle'; bubble.style.display = 'block'; context.updateTutorialBubble(); assert.equal(bubble.style.display, 'block');});
test('教程完成但仍在地牢时不弹签到', () => {context.player.tutorial.completed = true; context.updateTutorialBubble(); assert.equal(shown, 0);});
test('教程完成回城后展示延迟签到', () => {context.player.tutorial.completed = true; context.player.floor = 0; context.updateTutorialBubble(); assert.equal(shown, 1); context.updateTutorialBubble(); assert.equal(shown, 1);});
test('已完成引导的老玩家仍自动显示当天签到', () => {context.player.dailyLogin.lastLoginDate = null; context.checkDailyLogin(); while (timers.length) timers.shift()(); assert.equal(shown, 2);});
test('跨午夜倒计时刷新任务和追踪器', () => {
    yesterdayQuest(); let uiRefreshes = 0; let trackerRefreshes = 0;
    const updateUI = context.daily.updateUI; const updateTracker = context.daily.updateTracker;
    context.daily.updateUI = () => uiRefreshes++; context.daily.updateTracker = () => trackerRefreshes++;
    context.daily.startCountdown(); timers.shift()();
    assert.equal(context.player.dailyQuests.date, '2026-09-07'); assert.equal(uiRefreshes, 1); assert.equal(trackerRefreshes, 1);
    context.daily.updateUI = updateUI; context.daily.updateTracker = updateTracker;
});
test('直接进入地牢也能开始战斗引导', () => {
    context.player.tutorial = {step: 0, completed: false}; context.player.floor = 0;
    bubble.dataset.tutorialKind = 'town'; bubble.style.display = 'block';
    context.enterFloor = floor => context.player.floor = floor;
    let tip = -1; context.showTutorialTip = step => tip = step;
    vm.runInContext(extract('proceedToNextFloor'), context); context.proceedToNextFloor(1, false);
    while (timers.length) timers.shift()();
    assert.equal(context.player.tutorial.step, 5); assert.equal(tip, 5); assert.equal(bubble.style.display, 'none');
});
test('引导不再宣传移除的菜单技能快捷键', () => {assert.ok(!source.includes('按 I 打开背包')); assert.ok(!extract('updateSkillsUI').includes('qKeys'));});
test('背包打开时隐藏引导避免覆盖第一排物品',()=>{context.player.tutorial={step:0,completed:false};context.player.floor=0;context.player.equipment={mainhand:null};context.panelManager.panels.inventory.opened=true;bubble.style.display='block';context.updateTutorialBubble();assert.equal(bubble.style.display,'none');assert.equal(context.player.tutorial.step,0);});
test('其他面板打开时同样隐藏城镇引导',()=>{context.panelManager.panels.inventory.opened=false;context.panelManager.panels.skills.opened=true;bubble.style.display='block';context.updateTutorialBubble();assert.equal(bubble.style.display,'none');});
test('关闭面板后恢复未完成的装备引导',()=>{context.panelManager.panels.skills.opened=false;context.TUTORIAL_TOWN_STEPS[0]={target:'inventory-btn',isUI:true,text:'点击物品'};context.document.getElementById=id=>id==='tutorial-bubble'?bubble:id==='btn-inventory'?{getBoundingClientRect:()=>({left:300,top:100,height:40})}:null;context.updateTutorialBubble();assert.equal(bubble.style.display,'block');});
test('实际装备主手后自动完成装备引导且只推进一次',()=>{context.panelManager.panels.inventory.opened=true;context.player.equipment.mainhand={type:'weapon'};let advances=0;context.advanceTutorial=step=>{assert.equal(step,0);advances++;context.player.tutorial.step++;};context.updateTutorialBubble();context.updateTutorialBubble();assert.equal(context.player.tutorial.step,1);assert.equal(advances,1);assert.equal(bubble.style.display,'none');});
if (failures) process.exitCode = 1;
