const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'auto-battle.js'), 'utf8');

const moveTargets = [];

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
    TILE_SIZE: 32,
    player: {
        x: 0,
        y: 0,
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
    getSkillManaCost: () => 999,
    castSkill: () => { throw new Error('FAIL: crossfire stability test should not cast skills.'); },
    performAttack: () => {},
    hasLineOfSight: () => true,
    useQuickItem: () => {},
    createFloatingText: () => {},
    updateAutoBattleFeeHUD: () => {}
};

vm.createContext(context);
vm.runInContext(`${source}\nglobalThis.AutoBattle = AutoBattle;`, context);

const left = { x: -420, y: 0, radius: 20, dead: false, name: 'left' };
const right = { x: 420, y: 0, radius: 20, dead: false, name: 'right' };
context.enemies.push(left, right);

context.AutoBattle.enabled = true;
context.AutoBattle.currentTarget = left;
context.AutoBattle.lastPos = { x: context.player.x, y: context.player.y };
context.AutoBattle.autoPickupItems = () => {};
context.AutoBattle.findTarget = function () {
    return this.lastDamagedBy || left;
};
context.AutoBattle.moveTowards = target => {
    moveTargets.push(target.name);
    context.player.targetX = target.x;
    context.player.targetY = target.y;
};

context.AutoBattle.onPlayerDamaged(right);
context.AutoBattle.decideAction(0.016);
context.AutoBattle.decideAction(0.2);

context.AutoBattle.onPlayerDamaged(left);
context.AutoBattle.decideAction(0.016);

if (context.AutoBattle.currentTarget !== left) {
    throw new Error('FAIL: auto battle switched target under crossfire instead of committing to the current kill target.');
}
if (moveTargets.some(name => name !== 'left')) {
    throw new Error(`FAIL: auto battle issued side-switch movement under crossfire: ${moveTargets.join(',')}`);
}

console.log('PASS: auto battle crossfire target stability');
