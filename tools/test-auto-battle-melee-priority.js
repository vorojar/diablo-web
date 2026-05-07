const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'auto-battle.js'), 'utf8');

let meleeCalls = 0;
let skillCalls = 0;
const castOrder = [];

const context = {
    console,
    Date,
    Math,
    Map,
    WeakMap,
    Error,
    Number,
    GAME_CONFIG: {
        AUTO_KEEP_DISTANCE: 150,
        AUTO_POTION_HP_THRESHOLD: 0.3,
        AUTO_POTION_MP_THRESHOLD: 0.2,
        AUTO_EMERGENCY_HP: 0.15,
        PLAYER_MELEE_NO_LOS_RANGE: 50
    },
    player: {
        x: 0,
        y: 0,
        radius: 15,
        hp: 100,
        maxHp: 100,
        mp: 100,
        maxMp: 100,
        floor: 1,
        frozen: false,
        targetItem: null,
        targetX: null,
        targetY: null,
        inventory: [],
        skills: { fireball: 1, multishot: 0, thunder: 0 },
        skillCooldowns: { fireball: 0, multishot: 0, thunder: 0 },
        attackCooldown: 0
    },
    enemies: [],
    groundItems: [],
    mouse: { worldX: 0, worldY: 0 },
    isInTown: () => false,
    getSkillManaCost: () => 5,
    castSkill: () => { skillCalls += 1; castOrder.push('skill'); },
    performAttack: () => { meleeCalls += 1; castOrder.push('melee'); },
    useQuickItem: () => {},
    createFloatingText: () => {},
    updateAutoBattleFeeHUD: () => {}
};

vm.createContext(context);
vm.runInContext(`${source}\nglobalThis.AutoBattle = AutoBattle;`, context);

const enemy = { x: 70, y: 0, radius: 20, dead: false };
context.enemies.push(enemy);
context.AutoBattle.enabled = true;
context.AutoBattle.currentTarget = enemy;
context.AutoBattle.lastPos = { x: context.player.x, y: context.player.y };
context.AutoBattle.hasCachedLineOfSightTo = () => true;
context.AutoBattle.findTarget = () => enemy;
context.AutoBattle.autoPickupItems = () => {};
context.AutoBattle.moveTowards = () => {
    throw new Error('FAIL: melee-range target should not trigger chase.');
};

context.AutoBattle.decideAction(0.016);

if (meleeCalls !== 1) {
    throw new Error(`FAIL: auto battle should use physical attack first in melee range, got ${meleeCalls}.`);
}
if (skillCalls !== 0) {
    throw new Error(`FAIL: auto battle should not override a fresh melee swing with same-frame skill casts, got ${skillCalls}.`);
}
if (castOrder.join(',') !== 'melee') {
    throw new Error(`FAIL: auto battle should let the melee swing own the current frame, got ${castOrder.join(',')}.`);
}

context.player.attackCooldown = 0.4;
context.player.skillCooldowns.fireball = 0;
context.AutoBattle.decideAction(0.016);

if (meleeCalls !== 1) {
    throw new Error(`FAIL: auto battle should not melee again while physical cooldown is active, got ${meleeCalls}.`);
}
if (skillCalls !== 1) {
    throw new Error(`FAIL: auto battle should still cast ready skills while waiting for melee cooldown, got ${skillCalls}.`);
}
if (castOrder.join(',') !== 'melee,skill') {
    throw new Error(`FAIL: auto battle should only weave skills after the melee frame, got ${castOrder.join(',')}.`);
}

console.log('PASS: auto battle melee priority');
