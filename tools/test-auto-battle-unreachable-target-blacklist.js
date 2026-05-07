const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'auto-battle.js'), 'utf8');

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
    MAP_WIDTH: 20,
    MAP_HEIGHT: 20,
    mapData: Array.from({ length: 20 }, () => Array(20).fill(1)),
    player: {
        x: 400,
        y: 400,
        radius: 15,
        hp: 100,
        maxHp: 100,
        mp: 100,
        maxMp: 100,
        floor: 1,
        hellFloor: 0,
        isInHell: false,
        frozen: false,
        targetItem: null,
        targetX: null,
        targetY: null,
        inventory: [],
        skills: { fireball: 0, multishot: 0, thunder: 0 },
        skillCooldowns: { fireball: 0, multishot: 0, thunder: 0 },
        attackCooldown: 0
    },
    enemies: [],
    groundItems: [],
    mouse: { worldX: 0, worldY: 0 },
    isInTown: () => false,
    isWall: () => false,
    hasLineOfSight: () => false,
    getSkillManaCost: () => 8,
    castSkill: () => { throw new Error('FAIL: unreachable target test should not cast skills.'); },
    performAttack: () => { throw new Error('FAIL: unreachable target test should not melee attack.'); },
    useQuickItem: () => {},
    createFloatingText: () => {},
    updateAutoBattleFeeHUD: () => {}
};

vm.createContext(context);
vm.runInContext(`${source}\nglobalThis.AutoBattle = AutoBattle;`, context);

const blocked = { x: 120, y: 400, radius: 18, dead: false, name: 'blocked' };
const reachable = { x: 520, y: 400, radius: 18, dead: false, name: 'reachable' };
context.enemies.push(blocked, reachable);

context.AutoBattle.enabled = true;
context.AutoBattle.currentTarget = blocked;
context.AutoBattle.lastPos = { x: context.player.x, y: context.player.y };
context.AutoBattle.autoPickupItems = () => {};
context.AutoBattle.hasCachedLineOfSightTo = target => target === reachable;
context.AutoBattle.findPathToTarget = () => ({ x: context.player.x, y: context.player.y });
context.AutoBattle.escapeFromStuck = () => {};

context.AutoBattle.decideAction(0.016);
context.AutoBattle.decideAction(0.016);

if (context.AutoBattle.currentTarget === blocked) {
    throw new Error('FAIL: unreachable no-LOS target should be abandoned instead of selected again.');
}
if (context.AutoBattle.findTarget() === blocked) {
    throw new Error('FAIL: findTarget should skip temporarily blacklisted enemies.');
}
if (context.AutoBattle.findTarget() !== reachable) {
    throw new Error('FAIL: auto battle should continue with a reachable target after abandoning a blocked one.');
}

console.log('PASS: auto battle unreachable target blacklist');
