const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'auto-battle.js'), 'utf8');

let meleeCalls = 0;
let skillCalls = 0;

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
        AUTO_EMERGENCY_HP: 0.15
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
    castSkill: () => { skillCalls += 1; },
    performAttack: () => { meleeCalls += 1; },
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
    throw new Error(`FAIL: auto battle should not cast an offensive skill before melee, got ${skillCalls}.`);
}

console.log('PASS: auto battle melee priority');
