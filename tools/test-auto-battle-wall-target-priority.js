const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'auto-battle.js'), 'utf8');

let skillCalls = 0;
let moveCalls = 0;

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
    TILE_SIZE: 40,
    player: {
        x: 0,
        y: 0,
        radius: 15,
        hp: 100,
        maxHp: 100,
        mp: 100,
        maxMp: 100,
        floor: 5,
        hellFloor: 0,
        isInHell: false,
        frozen: false,
        targetItem: null,
        targetX: null,
        targetY: null,
        inventory: [],
        skills: { fireball: 0, multishot: 0, thunder: 1 },
        skillCooldowns: { fireball: 0, multishot: 0, thunder: 0 },
        attackCooldown: 0
    },
    enemies: [],
    groundItems: [],
    mouse: { worldX: 0, worldY: 0 },
    isInTown: () => false,
    hasLineOfSight: () => false,
    isWall: () => false,
    getSkillManaCost: () => 8,
    castSkill: () => { skillCalls += 1; },
    performAttack: () => { throw new Error('FAIL: wall target dead-zone test should not melee before moving.'); },
    useQuickItem: () => {},
    createFloatingText: () => {},
    updateAutoBattleFeeHUD: () => {}
};

vm.createContext(context);
vm.runInContext(`${source}\nglobalThis.AutoBattle = AutoBattle;`, context);

const wallGhost = { x: 80, y: 0, radius: 20, dead: false, name: 'wall ghost' };
const visibleArcher = { x: 140, y: 0, radius: 20, dead: false, name: 'visible archer' };
context.enemies.push(wallGhost, visibleArcher);

context.AutoBattle.enabled = true;
context.AutoBattle.hasCachedLineOfSightTo = target => target === visibleArcher;
context.AutoBattle.currentTarget = null;

const selected = context.AutoBattle.findTarget();
if (selected !== visibleArcher) {
    throw new Error(`FAIL: visible reachable target should outrank a close thunder-only wall target, got ${selected?.name}.`);
}

context.enemies.length = 0;
const closeBlocked = { x: 65, y: 0, radius: 20, dead: false, name: 'close blocked archer' };
context.enemies.push(closeBlocked);
context.AutoBattle.currentTarget = closeBlocked;
context.AutoBattle.lastPos = { x: context.player.x, y: context.player.y };
context.AutoBattle.hasCachedLineOfSightTo = () => false;
context.AutoBattle.findTarget = () => closeBlocked;
context.AutoBattle.autoPickupItems = () => {};
context.AutoBattle.moveTowards = target => {
    moveCalls += 1;
    context.player.targetX = target.x;
    context.player.targetY = target.y;
};

context.AutoBattle.decideAction(0.016);

if (moveCalls !== 1) {
    throw new Error(`FAIL: no-LOS melee dead-zone target should keep closing distance, got ${moveCalls} move calls.`);
}
if (skillCalls !== 0) {
    throw new Error(`FAIL: no-LOS melee dead-zone target should not be handled by same-frame thunder, got ${skillCalls}.`);
}

context.enemies.length = 0;
const closeSpecter = { x: 65, y: 0, radius: 20, dead: false, name: 'close wall specter', ai: 'specter', phaseThrough: true };
context.enemies.push(closeSpecter);
context.AutoBattle.currentTarget = closeSpecter;
context.player.targetX = null;
context.player.targetY = null;
context.player.skillCooldowns.thunder = 0;

context.AutoBattle.decideAction(0.016);

if (moveCalls !== 1) {
    throw new Error(`FAIL: phase-through specter should not force melee reposition, got ${moveCalls} move calls.`);
}
if (skillCalls !== 1) {
    throw new Error(`FAIL: phase-through specter should remain thunder-capable when it is the only target, got ${skillCalls}.`);
}

console.log('PASS: auto battle wall target priority');
